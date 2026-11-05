//! Byte codecs for the YYDS storage backends used by this service.
//!
//! The service owns no storage format of its own: key space lives in a `.yykv`
//! shard snapshot and node metadata lives in a `.yyds` catalog. Both encodings
//! match the YYDS on-disk format, so shards written here stay readable by the
//! YYDS key-value engine and vice versa.

use std::collections::BTreeMap;

/// `.yykv` snapshot magic including the format version.
pub const YYKV_MAGIC: &[u8; 5] = b"YYKV\x03";
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

/// Canonical integer parsing used by every numeric command: optional minus
/// sign, no leading zeros, no plus sign, no whitespace.
pub fn parse_integer(bytes: &[u8]) -> Option<i64> {
    let text = std::str::from_utf8(bytes).ok()?;
    let (negative, digits) = match text.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, text),
    };
    if digits.is_empty() || digits.len() > 19 || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    if digits.len() > 1 && digits.starts_with('0') {
        return None;
    }
    let value: i64 = digits.parse().ok()?;
    if negative {
        value.checked_neg()
    }
    else {
        Some(value)
    }
}

/// Serializes the shard snapshot to `.yykv` bytes.
pub fn encode_shard(records: &Records, next_revision: u64) -> Result<Vec<u8>> {
    let mut body = Vec::new();
    body.extend_from_slice(&next_revision.to_le_bytes());
    write_count(&mut body, records.len())?;
    for record in records.values() {
        push_bytes(&mut body, record.namespace.as_bytes())?;
        push_bytes(&mut body, &record.key)?;
        body.extend_from_slice(&record.revision.to_le_bytes());
        let expiry = record.expires_at.unwrap_or(0);
        if expiry < 0 {
            return Err(FormatError("expiry deadline must not be negative".to_owned()));
        }
        body.extend_from_slice(&(expiry as u64).to_le_bytes());
        // Inline payload tag. This service stores values inline, so the shared
        // object plane tag is never written.
        body.push(0);
        push_bytes(&mut body, &record.value)?;
    }
    let mut bytes = Vec::with_capacity(YYKV_MAGIC.len() + 8 + body.len());
    bytes.extend_from_slice(YYKV_MAGIC);
    bytes.extend_from_slice(&checksum(&body).to_le_bytes());
    bytes.extend_from_slice(&body);
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
    let mut cursor = YYKV_MAGIC.len();
    let expected = take_u64(bytes, &mut cursor, "shard checksum")?;
    let body = bytes
        .get(cursor..)
        .ok_or_else(|| FormatError("truncated shard checksum".to_owned()))?;
    if checksum(body) != expected {
        return Err(FormatError(".yykv checksum mismatch".to_owned()));
    }

    let mut cursor = 0_usize;
    let next_revision = take_u64(body, &mut cursor, "next revision")?;
    let count = take_u32(body, &mut cursor, "record count")? as usize;
    let mut records = Records::new();
    let mut revisions = std::collections::HashSet::with_capacity(count);
    for _ in 0..count {
        let namespace = String::from_utf8(take_bytes(body, &mut cursor, "namespace")?.to_vec())
            .map_err(|_| FormatError("shard namespace is not utf8".to_owned()))?;
        let key = take_bytes(body, &mut cursor, "key")?.to_vec();
        let revision = take_u64(body, &mut cursor, "revision")?;
        if revision == 0 || revision > next_revision || !revisions.insert(revision) {
            return Err(FormatError("invalid shard revision".to_owned()));
        }
        let encoded = take_u64(body, &mut cursor, "deadline")?;
        let expires_at = (encoded != 0).then_some(encoded as i64);
        let tag = *body.get(cursor).ok_or_else(|| FormatError("unexpected end of file".to_owned()))?;
        cursor += 1;
        if tag != 0 {
            return Err(FormatError("shared object payloads are not supported here".to_owned()));
        }
        let value = take_bytes(body, &mut cursor, "value")?.to_vec();
        let record = Record { namespace: namespace.clone(), key: key.clone(), value, revision, expires_at };
        if records.insert((namespace, key), record).is_some() {
            return Err(FormatError("duplicate shard key".to_owned()));
        }
    }
    if cursor != body.len() {
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

/// Structured `.yyds` validation failure: `field` names the exact check that failed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CatalogError {
    /// Check that rejected the catalog, for example `magic` or `shard-id`.
    pub field: &'static str,
    /// What was expected and what the bytes carried.
    pub detail: String,
}

impl std::fmt::Display for CatalogError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "catalog.{}: {}", self.field, self.detail)
    }
}

impl std::error::Error for CatalogError {}

/// Parses and validates a `.yyds` catalog, returning the registered shard id.
///
/// Checks the magic, the format version, the two reserved sections, the shard
/// count, the shape of the shard id, and that no bytes follow the registration.
pub fn decode_catalog_shard_id(bytes: &[u8]) -> std::result::Result<String, CatalogError> {
    let reject = |field: &'static str, detail: String| CatalogError { field, detail };
    let header_len = YYDS_MAGIC.len() + 4;
    if bytes.len() < YYDS_MAGIC.len() {
        return Err(reject("length", "truncated header".to_owned()));
    }
    if &bytes[..YYDS_MAGIC.len()] != YYDS_MAGIC {
        return Err(reject("magic", "expected \"YYDS\\x01\"".to_owned()));
    }
    if bytes.len() < header_len {
        return Err(reject("length", "truncated version".to_owned()));
    }
    let mut cursor = YYDS_MAGIC.len();
    let version = u32::from_le_bytes(bytes[cursor..cursor + 4].try_into().unwrap_or([0; 4]));
    cursor += 4;
    if version != CATALOG_VERSION {
        return Err(reject("version", format!("expected {CATALOG_VERSION}, found {version}")));
    }
    for (field, expected) in [("schema", "schema flag"), ("routing", "routing section")] {
        if bytes.len() < cursor + 4 {
            return Err(reject("length", format!("truncated {expected}")));
        }
        let value = u32::from_le_bytes(bytes[cursor..cursor + 4].try_into().unwrap_or([0; 4]));
        cursor += 4;
        if value != 0 {
            return Err(reject(field, format!("expected 0, found {value}")));
        }
    }
    if bytes.len() < cursor + 4 {
        return Err(reject("length", "truncated shard count".to_owned()));
    }
    let count = u32::from_le_bytes(bytes[cursor..cursor + 4].try_into().unwrap_or([0; 4]));
    cursor += 4;
    if count != 1 {
        return Err(reject("count", format!("expected 1, found {count}")));
    }
    if bytes.len() < cursor + 4 {
        return Err(reject("length", "truncated shard id length".to_owned()));
    }
    let id_len = u32::from_le_bytes(bytes[cursor..cursor + 4].try_into().unwrap_or([0; 4])) as usize;
    cursor += 4;
    if cursor + id_len > bytes.len() {
        return Err(reject("length", "truncated shard id".to_owned()));
    }
    let id = &bytes[cursor..cursor + id_len];
    cursor += id_len;
    if id.is_empty() {
        return Err(reject("shard-id", "empty".to_owned()));
    }
    let id = std::str::from_utf8(id).map_err(|_| reject("shard-id", "not utf8".to_owned()))?;
    if id.contains('/') || id.contains('\\') {
        return Err(reject("shard-id", "contains a path separator".to_owned()));
    }
    let expected_len = cursor + 8;
    if bytes.len() < expected_len {
        return Err(reject("length", "truncated reserved fields".to_owned()));
    }
    if bytes.len() > expected_len {
        return Err(reject(
            "trailing",
            format!("expected no bytes after the shard registration, found {}", bytes.len() - expected_len),
        ));
    }
    Ok(id.to_owned())
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
    bytes.extend_from_slice(&count.to_le_bytes());
    Ok(())
}

fn push_bytes(bytes: &mut Vec<u8>, value: &[u8]) -> Result<()> {
    let length = u32::try_from(value.len()).map_err(|_| FormatError("shard field too large".to_owned()))?;
    bytes.extend_from_slice(&length.to_le_bytes());
    bytes.extend_from_slice(value);
    Ok(())
}

fn take_bytes<'a>(input: &'a [u8], cursor: &mut usize, field: &str) -> Result<&'a [u8]> {
    if *cursor + 4 > input.len() {
        return Err(FormatError(format!("truncated `{field}` length")));
    }
    let length = u32::from_le_bytes(input[*cursor..*cursor + 4].try_into().unwrap_or([0; 4])) as usize;
    *cursor += 4;
    if *cursor + length > input.len() {
        return Err(FormatError(format!("truncated `{field}` bytes")));
    }
    let bytes = &input[*cursor..*cursor + length];
    *cursor += length;
    Ok(bytes)
}

fn take_u32(input: &[u8], cursor: &mut usize, field: &str) -> Result<u32> {
    if *cursor + 4 > input.len() {
        return Err(FormatError(format!("truncated `{field}`")));
    }
    let value = u32::from_le_bytes(input[*cursor..*cursor + 4].try_into().unwrap_or([0; 4]));
    *cursor += 4;
    Ok(value)
}

fn take_u64(input: &[u8], cursor: &mut usize, field: &str) -> Result<u64> {
    if *cursor + 8 > input.len() {
        return Err(FormatError(format!("truncated `{field}`")));
    }
    let value = u64::from_le_bytes(input[*cursor..*cursor + 8].try_into().unwrap_or([0; 8]));
    *cursor += 8;
    Ok(value)
}
