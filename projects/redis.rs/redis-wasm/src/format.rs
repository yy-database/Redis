//! Byte codecs for the YYDS storage backends used by this service.
//!
//! The service owns no storage format of its own: key space lives in a `.yykv`
//! shard snapshot and node metadata lives in a `.yyds` catalog. Both encodings
//! match the YYDS on-disk format, so shards written here stay readable by the
//! YYDS key-value engine and vice versa.

use std::collections::BTreeMap;

use database_formats::yy::yyds;
use database_types::cluster::{Error as CatalogSourceError, ShardId};

/// `.yykv` snapshot magic including the format version.
pub const YYKV_MAGIC: &[u8; 5] = b"YYKV\x03";
/// Legacy v2 magic without a body checksum. Rejected explicitly.
pub const YYKV_LEGACY_MAGIC: &[u8] = b"YYKV\x02";

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
///
/// The byte layout belongs to `database-formats`; this crate only decides which
/// shard a local store registers and how the file is named, written, and renamed.
pub fn encode_catalog(shard_id: &str) -> Vec<u8> {
    yyds::encode_catalog(None, None, &[ShardId(shard_id.to_owned())], None, &[])
        .expect("one shard registration is always within the catalog limits")
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
/// Parsing, the format version, the single-registration rule, and the `ShardId`
/// shape check all come from `database-formats`. Only the wording of a rejection
/// is owned here, so the store keeps its stable `catalog.<field>: <detail>` text.
pub fn decode_catalog_shard_id(bytes: &[u8]) -> std::result::Result<String, CatalogError> {
    match yyds::decode_catalog_shard_id(bytes) {
        Ok(shard) => Ok(shard.0),
        Err(source) => Err(catalog_error(bytes, &source)),
    }
}

/// Translates an upstream rejection into the store's stable message.
///
/// Upstream errors carry a category but not the offending value, so the value-bearing
/// messages are rebuilt by reading the same field again. This walk never decides
/// whether a catalog is valid: it only explains a rejection upstream already made.
fn catalog_error(bytes: &[u8], source: &CatalogSourceError) -> CatalogError {
    let reject = |field: &'static str, detail: String| CatalogError { field, detail };
    // The legacy order explains the header first, then the single-registration rule.
    match source {
        CatalogSourceError::Corrupt("unknown catalog header") => {
            return reject("magic", "expected \"YYDS\\x01\"".to_owned());
        }
        CatalogSourceError::Unsupported("catalog format version requires regeneration") => {
            return reject("version", format!("expected 0, found {}", peek_u32(bytes, yyds::CATALOG_MAGIC.len()).unwrap_or(0)));
        }
        _ => {}
    }
    // A malformed count usually surfaces as a later upstream error, because the
    // upstream parse only counts registrations after the whole body. The count is
    // still the first legacy field to explain whenever both reserved sections are empty.
    if let Some(count) = shard_count(bytes) {
        if count != 1 {
            return reject("count", format!("expected 1, found {count}"));
        }
    }
    match source {
        CatalogSourceError::Corrupt("catalog shard id utf8") => reject("shard-id", "not utf8".to_owned()),
        CatalogSourceError::Corrupt("trailing catalog bytes") => {
            let end = catalog_end(bytes).unwrap_or(bytes.len());
            reject(
                "trailing",
                format!(
                    "expected no bytes after the shard registration, found {}",
                    bytes.len().saturating_sub(end)
                ),
            )
        }
        CatalogSourceError::Corrupt("unexpected catalog eof") => {
            reject("length", catalog_end(bytes).err().unwrap_or("truncated catalog").to_owned())
        }
        CatalogSourceError::Corrupt("invalid catalog schema presence flag") => reject("schema", "invalid presence flag".to_owned()),
        CatalogSourceError::Corrupt("invalid catalog routing presence flag") => reject("routing", "invalid presence flag".to_owned()),
        CatalogSourceError::Corrupt("invalid catalog routing epoch") => reject("routing", "epoch must be nonzero".to_owned()),
        CatalogSourceError::Unsupported("catalog registers no shard") => {
            reject("count", format!("expected 1, found {}", shard_count(bytes).unwrap_or(0)))
        }
        CatalogSourceError::Unsupported("catalog registers more than one shard") => {
            reject("count", format!("expected 1, found {}", shard_count(bytes).unwrap_or(1)))
        }
        CatalogSourceError::InvalidShardId { value } if value.is_empty() => reject("shard-id", "empty".to_owned()),
        CatalogSourceError::InvalidShardId { value } if value.contains(['/', '\\']) => {
            reject("shard-id", "contains a path separator".to_owned())
        }
        CatalogSourceError::InvalidShardId { .. } => reject("shard-id", "not a single path segment".to_owned()),
        other => reject("catalog", format!("{other}")),
    }
}

/// Reads the shard count of a catalog whose two reserved sections are empty.
fn shard_count(bytes: &[u8]) -> Option<u32> {
    let magic = yyds::CATALOG_MAGIC.len();
    if peek_u32(bytes, magic + 4)? != 0 || peek_u32(bytes, magic + 8)? != 0 {
        return None;
    }
    peek_u32(bytes, magic + 12)
}

/// Walks the upstream catalog layout and returns where the catalog body ends.
fn catalog_end(bytes: &[u8]) -> std::result::Result<usize, &'static str> {
    let mut cursor = yyds::CATALOG_MAGIC.len();
    read_u32_diagnostic(bytes, &mut cursor, "truncated version")?;
    if read_u32_diagnostic(bytes, &mut cursor, "truncated schema flag")? == 1 {
        read_u32_diagnostic(bytes, &mut cursor, "truncated schema section")?;
        skip_block(bytes, &mut cursor, "truncated schema section", "truncated schema section")?;
    }
    if read_u32_diagnostic(bytes, &mut cursor, "truncated routing section")? == 1 {
        skip(bytes, &mut cursor, 8, "truncated routing section")?;
    }
    let count = read_u32_diagnostic(bytes, &mut cursor, "truncated shard count")?;
    for _ in 0..count {
        skip_block(bytes, &mut cursor, "truncated shard id length", "truncated shard id")?;
    }
    if read_u32_diagnostic(bytes, &mut cursor, "truncated reserved fields")? == 1 {
        skip_block(bytes, &mut cursor, "truncated resolved contract", "truncated resolved contract")?;
    }
    let owners = read_u32_diagnostic(bytes, &mut cursor, "truncated reserved fields")?;
    for _ in 0..owners {
        skip_block(bytes, &mut cursor, "truncated owners", "truncated owners")?;
        skip_block(bytes, &mut cursor, "truncated owners", "truncated owners")?;
        skip(bytes, &mut cursor, 8, "truncated owners")?;
    }
    Ok(cursor)
}

fn peek_u32(bytes: &[u8], offset: usize) -> Option<u32> {
    Some(u32::from_le_bytes(bytes.get(offset..offset + 4)?.try_into().ok()?))
}

fn skip(bytes: &[u8], cursor: &mut usize, length: usize, detail: &'static str) -> std::result::Result<(), &'static str> {
    if *cursor + length > bytes.len() {
        return Err(detail);
    }
    *cursor += length;
    Ok(())
}

fn read_u32_diagnostic(bytes: &[u8], cursor: &mut usize, detail: &'static str) -> std::result::Result<u32, &'static str> {
    skip(bytes, cursor, 4, detail)?;
    Ok(u32::from_le_bytes(bytes[*cursor - 4..*cursor].try_into().unwrap_or([0; 4])))
}

fn skip_block(
    bytes: &[u8],
    cursor: &mut usize,
    length_detail: &'static str,
    body_detail: &'static str,
) -> std::result::Result<(), &'static str> {
    let length = read_u32_diagnostic(bytes, cursor, length_detail)? as usize;
    skip(bytes, cursor, length, body_detail)
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
