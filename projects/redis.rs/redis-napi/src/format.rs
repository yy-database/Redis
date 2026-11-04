//! Byte codecs for the YYDS storage backends used by this service.
//!
//! The service owns no storage format of its own: key space lives in a `.yykv`
//! shard snapshot and node metadata lives in a `.yyds` catalog. Both encodings
//! match the YYDS on-disk format, so shards written here stay readable by the
//! YYDS key-value engine and vice versa.

use std::collections::BTreeMap;
use std::io::{Cursor, Read, Write};

/// `.yykv` snapshot magic including the format version.
pub const YYKV_MAGIC: &[u8] = b"YYKV\x03";
/// Legacy v2 magic without a body checksum. Rejected explicitly.
pub const YYKV_LEGACY_MAGIC: &[u8] = b"YYKV\x02";
/// `.yyds` catalog magic.
pub const YYDS_MAGIC: &[u8] = b"YYDS\x01";
/// Catalog format version, fixed at zero for the 0.x contract.
const CATALOG_VERSION: u32 = 0;

/// One stored record inside the shard.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Record {
    /// Namespace partitioning this key, one per Redis database index.
    pub namespace: String,
    /// Opaque key bytes.
    pub key: Vec<u8>,
    /// Inline value payload.
    pub value: Vec<u8>,
    /// Monotonic revision inside the shard.
    pub revision: u64,
    /// Wall-clock expiry as Unix epoch milliseconds.
    pub expires_at: Option<i64>,
}

impl Record {
    /// Whether the record is absent at `now_unix_ms`.
    pub fn is_expired_at(&self, now_unix_ms: i64) -> bool {
        self.expires_at.is_some_and(|deadline| deadline <= now_unix_ms)
    }
}

/// Records keyed by `(namespace, key bytes)` for ordered lookup.
pub type Records = BTreeMap<(String, Vec<u8>), Record>;

/// Format-level failure.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FormatError(pub String);

impl std::fmt::Display for FormatError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for FormatError {}

/// Format-level result.
pub type Result<T> = std::result::Result<T, FormatError>;

/// Current wall clock as Unix epoch milliseconds.
pub fn now_unix_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

/// Serializes the shard snapshot to `.yykv` bytes.
pub fn encode_shard(records: &Records, next_revision: u64) -> Result<Vec<u8>> {
    let mut body = Vec::new();
    body.write_all(&next_revision.to_le_bytes())
        .map_err(|error| FormatError(error.to_string()))?;
    write_count(&mut body, records.len())?;
    for record in records.values() {
        write_bytes(&mut body, record.namespace.as_bytes())?;
        write_bytes(&mut body, &record.key)?;
        body.write_all(&record.revision.to_le_bytes())
            .map_err(|error| FormatError(error.to_string()))?;
        let expiry = record.expires_at.unwrap_or(0);
        if expiry < 0 {
            return Err(FormatError("expiry deadline must not be negative".to_owned()));
        }
        body.write_all(&(expiry as u64).to_le_bytes())
            .map_err(|error| FormatError(error.to_string()))?;
        // Inline payload tag. This service stores values inline, so the shared
        // object plane tag is never written.
        body.write_all(&[0]).map_err(|error| FormatError(error.to_string()))?;
        write_bytes(&mut body, &record.value)?;
    }
    let mut bytes = Vec::with_capacity(YYKV_MAGIC.len() + 8 + body.len());
    bytes.write_all(YYKV_MAGIC)
        .map_err(|error| FormatError(error.to_string()))?;
    bytes.write_all(&checksum(&body).to_le_bytes())
        .map_err(|error| FormatError(error.to_string()))?;
    bytes.write_all(&body)
        .map_err(|error| FormatError(error.to_string()))?;
    Ok(bytes)
}

/// Parses `.yykv` bytes written by [`encode_shard`].
pub fn decode_shard(bytes: &[u8]) -> Result<(Records, u64)> {
    if bytes.len() < YYKV_MAGIC.len() {
        return Err(FormatError("truncated shard header".to_owned()));
    }
    let magic = &bytes[..YYKV_MAGIC.len()];
    if magic == YYKV_LEGACY_MAGIC {
        return Err(FormatError(
            "legacy .yykv v2 snapshot carries no checksum: delete the shard and let the node recreate it".to_owned(),
        ));
    }
    if magic != YYKV_MAGIC {
        return Err(FormatError("unknown .yykv header".to_owned()));
    }
    let expected = read_u64_at(bytes, YYKV_MAGIC.len())?;
    let body = bytes
        .get(YYKV_MAGIC.len() + 8..)
        .ok_or_else(|| FormatError("truncated shard checksum".to_owned()))?;
    if checksum(body) != expected {
        return Err(FormatError(".yykv checksum mismatch".to_owned()));
    }

    let mut cursor = Cursor::new(body);
    let next_revision = read_u64(&mut cursor)?;
    let count = read_u32(&mut cursor)? as usize;
    let mut records = Records::new();
    let mut revisions = std::collections::HashSet::with_capacity(count);
    for _ in 0..count {
        let namespace = String::from_utf8(read_bytes(&mut cursor)?)
            .map_err(|_| FormatError("shard namespace is not utf8".to_owned()))?;
        let key = read_bytes(&mut cursor)?;
        let revision = read_u64(&mut cursor)?;
        if revision == 0 || revision > next_revision || !revisions.insert(revision) {
            return Err(FormatError("invalid shard revision".to_owned()));
        }
        let encoded = read_u64(&mut cursor)?;
        let expires_at = (encoded != 0).then_some(encoded as i64);
        let tag = read_u8(&mut cursor)?;
        if tag != 0 {
            return Err(FormatError("shared object payloads are not supported here".to_owned()));
        }
        let value = read_bytes(&mut cursor)?;
        let record = Record { namespace: namespace.clone(), key: key.clone(), value, revision, expires_at };
        if records.insert((namespace, key), record).is_some() {
            return Err(FormatError("duplicate shard key".to_owned()));
        }
    }
    if cursor.position() != body.len() as u64 {
        return Err(FormatError("trailing shard bytes".to_owned()));
    }
    Ok((records, next_revision))
}

/// Serializes `.yyds` catalog bytes registering one shard.
pub fn encode_catalog(shard_id: &str) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(YYDS_MAGIC);
    out.extend_from_slice(&CATALOG_VERSION.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&1u32.to_le_bytes());
    out.extend_from_slice(&(shard_id.len() as u32).to_le_bytes());
    out.extend_from_slice(shard_id.as_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out
}

/// Parses the first shard identifier registered by a `.yyds` catalog.
pub fn decode_catalog_shard_id(bytes: &[u8]) -> Result<String> {
    if bytes.len() < YYDS_MAGIC.len() + 4 {
        return Err(FormatError("truncated catalog header".to_owned()));
    }
    if &bytes[..YYDS_MAGIC.len()] != YYDS_MAGIC {
        return Err(FormatError("unknown .yyds catalog header".to_owned()));
    }
    let mut cursor = Cursor::new(&bytes[YYDS_MAGIC.len()..]);
    let version = read_u32(&mut cursor)?;
    if version != CATALOG_VERSION {
        return Err(FormatError("catalog version requires regeneration".to_owned()));
    }
    if read_u32(&mut cursor)? != 0 {
        return Err(FormatError("catalog schema section is not supported here".to_owned()));
    }
    if read_u32(&mut cursor)? != 0 {
        return Err(FormatError("catalog routing section is not supported here".to_owned()));
    }
    let count = read_u32(&mut cursor)?;
    if count != 1 {
        return Err(FormatError(format!("expected exactly one shard registration, found {count}")));
    }
    let id = read_bytes(&mut cursor)?;
    String::from_utf8(id).map_err(|_| FormatError("catalog shard id is not utf8".to_owned()))
}

/// FNV-1a over the snapshot body: integrity only, not security.
pub fn checksum(body: &[u8]) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for byte in body {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

fn write_count(bytes: &mut Vec<u8>, count: usize) -> Result<()> {
    let count = u32::try_from(count).map_err(|_| FormatError("too many shard records".to_owned()))?;
    bytes.write_all(&count.to_le_bytes()).map_err(|error| FormatError(error.to_string()))
}

fn write_bytes(bytes: &mut Vec<u8>, value: &[u8]) -> Result<()> {
    let length = u32::try_from(value.len()).map_err(|_| FormatError("shard field too large".to_owned()))?;
    bytes.write_all(&length.to_le_bytes()).map_err(|error| FormatError(error.to_string()))?;
    bytes.write_all(value).map_err(|error| FormatError(error.to_string()))
}

fn read_u64_at(bytes: &[u8], offset: usize) -> Result<u64> {
    let slice = bytes
        .get(offset..offset + 8)
        .ok_or_else(|| FormatError("truncated shard checksum".to_owned()))?;
    let mut value = [0_u8; 8];
    value.copy_from_slice(slice);
    Ok(u64::from_le_bytes(value))
}

fn read_u8(cursor: &mut Cursor<&[u8]>) -> Result<u8> {
    let mut value = [0_u8; 1];
    cursor.read_exact(&mut value).map_err(eof)?;
    Ok(value[0])
}

fn read_u32(cursor: &mut Cursor<&[u8]>) -> Result<u32> {
    let mut value = [0_u8; 4];
    cursor.read_exact(&mut value).map_err(eof)?;
    Ok(u32::from_le_bytes(value))
}

fn read_u64(cursor: &mut Cursor<&[u8]>) -> Result<u64> {
    let mut value = [0_u8; 8];
    cursor.read_exact(&mut value).map_err(eof)?;
    Ok(u64::from_le_bytes(value))
}

fn read_bytes(cursor: &mut Cursor<&[u8]>) -> Result<Vec<u8>> {
    let length = read_u32(cursor)? as usize;
    let mut value = vec![0_u8; length];
    cursor.read_exact(&mut value).map_err(eof)?;
    Ok(value)
}

fn eof(error: std::io::Error) -> FormatError {
    match error.kind() {
        std::io::ErrorKind::UnexpectedEof => FormatError("unexpected end of file".to_owned()),
        _ => FormatError(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(namespace: &str, key: &str, value: &str, expires_at: Option<i64>) -> Record {
        Record { namespace: namespace.to_owned(), key: key.as_bytes().to_vec(), value: value.as_bytes().to_vec(), revision: 1, expires_at }
    }

    #[test]
    fn shard_round_trip_preserves_records_and_revision() {
        let mut records = Records::new();
        let mut first = record("redis:db0", "a", "1", None);
        first.revision = 1;
        let mut second = record("redis:db1", "b", "2", Some(1_700_000_000_000));
        second.revision = 2;
        records.insert((first.namespace.clone(), first.key.clone()), first);
        records.insert((second.namespace.clone(), second.key.clone()), second);
        let bytes = encode_shard(&records, 2).expect("encode");
        assert_eq!(&bytes[..5], YYKV_MAGIC);
        let (decoded, revision) = decode_shard(&bytes).expect("decode");
        assert_eq!(revision, 2);
        assert_eq!(decoded, records);
    }

    #[test]
    fn shard_rejects_checksum_mismatch() {
        let mut records = Records::new();
        records.insert(("redis:db0".to_owned(), b"a".to_vec()), record("redis:db0", "a", "1", None));
        let mut bytes = encode_shard(&records, 1).expect("encode");
        let last = bytes.len() - 1;
        bytes[last] ^= 0xff;
        assert!(decode_shard(&bytes).is_err());
    }

    #[test]
    fn catalog_registers_one_shard() {
        let bytes = encode_catalog("local-0");
        assert_eq!(decode_catalog_shard_id(&bytes).expect("decode"), "local-0");
    }
}
