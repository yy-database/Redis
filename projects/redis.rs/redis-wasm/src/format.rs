//! Byte codecs for the YYDS storage backends used by this service.
//!
//! The service owns no storage format of its own: key space lives in a `.yykv`
//! shard snapshot and node metadata lives in a `.yyds` catalog. Both byte layouts
//! come from `database-formats`, so shards written here stay readable by the
//! YYDS key-value engine and vice versa. What remains here is the mapping onto
//! this service's record model plus the two product policies (inline-only payloads
//! and an explicit refusal of legacy v2 snapshots).

use std::collections::BTreeMap;

use database_formats::yy::yyds;
use database_formats::yy::yykv::{self, InlineValue, Key, Record as SnapshotRecord, StoredValue};
use database_types::cluster::{Error as SourceError, ShardId};

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
    if negative { value.checked_neg() } else { Some(value) }
}

/// Serializes the shard snapshot to `.yykv` bytes.
///
/// The byte layout belongs to `database-formats`; only the mapping from this
/// crate's [`Record`] to the upstream record model lives here.
pub fn encode_shard(records: &Records, next_revision: u64) -> Result<Vec<u8>> {
    // Product policy: every record is inline and a negative deadline is a caller
    // bug. Upstream wraps a negative expiry with `as u64`, so the rejection stays
    // here instead of being delegated.
    if records
        .values()
        .any(|record| record.expires_at.is_some_and(|deadline| deadline < 0))
    {
        return Err(FormatError("expiry deadline must not be negative".to_owned()));
    }
    let snapshot: BTreeMap<Key, SnapshotRecord> = records
        .values()
        .map(|record| {
            let key = Key::new(record.namespace.clone(), record.key.clone());
            (
                key.clone(),
                SnapshotRecord {
                    key,
                    value: StoredValue::Inline(InlineValue(record.value.clone())),
                    revision: record.revision,
                    expires_at: record.expires_at,
                },
            )
        })
        .collect();
    yykv::encode_snapshot(&snapshot, next_revision).map_err(|source| encode_error(&source))
}

/// Parses `.yykv` bytes written by [`encode_shard`].
///
/// Strict decoding, including the revision contract, comes from
/// `database-formats`. Two product policies stay here: this node binds no object
/// store, so only inline payloads are accepted, and a legacy v2 snapshot keeps
/// the store's own refusal wording.
pub fn decode_shard(bytes: &[u8]) -> Result<(Records, u64)> {
    let snapshot = yykv::decode_snapshot_strict(bytes).map_err(|source| shard_error(bytes, &source))?;
    let mut records = Records::new();
    for (key, record) in snapshot.records {
        let value = match record.value {
            StoredValue::Inline(value) => value.0,
            // A shared payload reference must not be surfaced as row bytes.
            StoredValue::Object(_) => {
                return Err(FormatError("shared object payloads are not supported here".to_owned()));
            }
        };
        let namespace = key.namespace.0;
        let key_bytes = key.bytes;
        records.insert(
            (namespace.clone(), key_bytes.clone()),
            Record {
                namespace,
                key: key_bytes,
                value,
                revision: record.revision,
                expires_at: record.expires_at,
            },
        );
    }
    Ok((records, snapshot.next_revision))
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
fn catalog_error(bytes: &[u8], source: &SourceError) -> CatalogError {
    let reject = |field: &'static str, detail: String| CatalogError { field, detail };
    // The legacy order explains the header first, then the single-registration rule.
    match source {
        SourceError::Corrupt("unknown catalog header") => {
            return reject("magic", "expected \"YYDS\\x01\"".to_owned());
        }
        SourceError::Unsupported("catalog format version requires regeneration") => {
            return reject(
                "version",
                format!(
                    "expected 0, found {}",
                    peek_u32(bytes, yyds::CATALOG_MAGIC.len()).unwrap_or(0)
                ),
            );
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
        SourceError::Corrupt("catalog shard id utf8") => reject("shard-id", "not utf8".to_owned()),
        SourceError::Corrupt("trailing catalog bytes") => {
            let end = catalog_end(bytes).unwrap_or(bytes.len());
            reject(
                "trailing",
                format!(
                    "expected no bytes after the shard registration, found {}",
                    bytes.len().saturating_sub(end)
                ),
            )
        }
        SourceError::Corrupt("unexpected catalog eof") => reject(
            "length",
            catalog_end(bytes).err().unwrap_or("truncated catalog").to_owned(),
        ),
        SourceError::Corrupt("invalid catalog schema presence flag") => {
            reject("schema", "invalid presence flag".to_owned())
        }
        SourceError::Corrupt("invalid catalog routing presence flag") => {
            reject("routing", "invalid presence flag".to_owned())
        }
        SourceError::Corrupt("invalid catalog routing epoch") => reject("routing", "epoch must be nonzero".to_owned()),
        SourceError::Unsupported("catalog registers no shard") => reject(
            "count",
            format!("expected 1, found {}", shard_count(bytes).unwrap_or(0)),
        ),
        SourceError::Unsupported("catalog registers more than one shard") => reject(
            "count",
            format!("expected 1, found {}", shard_count(bytes).unwrap_or(1)),
        ),
        SourceError::InvalidShardId { value } if value.is_empty() => reject("shard-id", "empty".to_owned()),
        SourceError::InvalidShardId { value } if value.contains(['/', '\\']) => {
            reject("shard-id", "contains a path separator".to_owned())
        }
        SourceError::InvalidShardId { .. } => reject("shard-id", "not a single path segment".to_owned()),
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
        skip_block(
            bytes,
            &mut cursor,
            "truncated schema section",
            "truncated schema section",
        )?;
    }
    if read_u32_diagnostic(bytes, &mut cursor, "truncated routing section")? == 1 {
        skip(bytes, &mut cursor, 8, "truncated routing section")?;
    }
    let count = read_u32_diagnostic(bytes, &mut cursor, "truncated shard count")?;
    for _ in 0..count {
        skip_block(bytes, &mut cursor, "truncated shard id length", "truncated shard id")?;
    }
    if read_u32_diagnostic(bytes, &mut cursor, "truncated reserved fields")? == 1 {
        skip_block(
            bytes,
            &mut cursor,
            "truncated resolved contract",
            "truncated resolved contract",
        )?;
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

fn skip(
    bytes: &[u8],
    cursor: &mut usize,
    length: usize,
    detail: &'static str,
) -> std::result::Result<(), &'static str> {
    if *cursor + length > bytes.len() {
        return Err(detail);
    }
    *cursor += length;
    Ok(())
}

fn read_u32_diagnostic(
    bytes: &[u8],
    cursor: &mut usize,
    detail: &'static str,
) -> std::result::Result<u32, &'static str> {
    skip(bytes, cursor, 4, detail)?;
    Ok(u32::from_le_bytes(
        bytes[*cursor - 4..*cursor].try_into().unwrap_or([0; 4]),
    ))
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

/// Translates an upstream `.yykv` write rejection into the store's stable message.
fn encode_error(source: &SourceError) -> FormatError {
    match source {
        SourceError::Unsupported("yykv next_revision must be at least 1") => {
            FormatError("next revision must be at least 1".to_owned())
        }
        SourceError::Unsupported("yykv revision must be below next_revision") => {
            FormatError("invalid shard revision".to_owned())
        }
        SourceError::Unsupported("too many shard records") => FormatError("too many shard records".to_owned()),
        SourceError::Unsupported("shard value too large") => FormatError("shard field too large".to_owned()),
        other => FormatError(other.to_string()),
    }
}

/// Translates an upstream `.yykv` read rejection into the store's stable message.
///
/// Upstream errors carry a category but not the field that ran out of bytes, so a
/// truncated body is explained by re-reading the same offsets the decoder reads.
/// This walk never decides whether a snapshot is valid: it only explains a
/// rejection upstream already made.
fn shard_error(bytes: &[u8], source: &SourceError) -> FormatError {
    // The legacy order explains the header before anything else.
    if bytes.len() < yykv::KV_MAGIC.len() {
        return FormatError("truncated shard header".to_owned());
    }
    let magic = &bytes[..yykv::KV_MAGIC.len()];
    if magic == yykv::KV_LEGACY_MAGIC {
        return FormatError(
            "legacy .yykv v2 snapshot carries no checksum: delete the shard and let the node recreate it".to_owned(),
        );
    }
    if magic != yykv::KV_MAGIC {
        return FormatError("unknown .yykv header".to_owned());
    }
    if bytes.len() < yykv::KV_MAGIC.len() + 8 {
        return FormatError("truncated `shard checksum`".to_owned());
    }
    match source {
        SourceError::CorruptReason {
            message: "yykv checksum mismatch",
            ..
        } => FormatError(".yykv checksum mismatch".to_owned()),
        SourceError::CorruptReason {
            message: "truncated yykv checksum",
            ..
        } => FormatError("truncated `shard checksum`".to_owned()),
        SourceError::Corrupt("invalid shard revision")
        | SourceError::Corrupt("legacy shard revision space exhausted") => {
            FormatError("invalid shard revision".to_owned())
        }
        SourceError::CorruptReason {
            message: "trailing shard bytes",
            ..
        } => FormatError("trailing shard bytes".to_owned()),
        SourceError::CorruptReason {
            message: "duplicate shard key",
            ..
        } => FormatError("duplicate shard key".to_owned()),
        SourceError::CorruptReason {
            message: "shard namespace utf8",
            ..
        } => FormatError("shard namespace is not utf8".to_owned()),
        // Any non-inline payload is refused, including a tag-1 record whose hash
        // bytes are not utf8, because this node has no object store either way.
        SourceError::CorruptReason {
            message: "shard object hash utf8",
            ..
        }
        | SourceError::CorruptReason {
            message: "invalid shard value kind",
            ..
        }
        | SourceError::Unsupported("yykv object-backed value requires an object store") => {
            FormatError("shared object payloads are not supported here".to_owned())
        }
        SourceError::CorruptReason {
            message: "legacy yykv revision layout: next_revision is zero",
            ..
        } => FormatError("legacy .yykv revision layout: next revision is zero".to_owned()),
        SourceError::CorruptReason {
            message: "legacy yykv revision layout: record sits on next_revision",
            ..
        } => FormatError("legacy .yykv revision layout: a record sits on the next revision".to_owned()),
        SourceError::CorruptReason {
            message: "unexpected shard eof" | "shard length overflow",
            ..
        } => FormatError(truncated_detail(bytes)),
        other => FormatError(other.to_string()),
    }
}

/// Names the first `.yykv` field that runs out of bytes.
///
/// Runs only after upstream rejected the snapshot as truncated, so it mirrors the
/// read order of the decoder without producing any decoded value.
fn truncated_detail(bytes: &[u8]) -> String {
    let body = bytes.get(yykv::KV_MAGIC.len() + 8..).unwrap_or_default();
    let mut cursor = 0_usize;
    if let Err(detail) = read_scalar(body, &mut cursor, 8, "next revision") {
        return detail;
    }
    let count = match read_count(body, &mut cursor) {
        Ok(count) => count as usize,
        Err(detail) => return detail,
    };
    for _ in 0..count {
        if let Err(detail) = read_block(body, &mut cursor, "namespace") {
            return detail;
        }
        if let Err(detail) = read_block(body, &mut cursor, "key") {
            return detail;
        }
        if let Err(detail) = read_scalar(body, &mut cursor, 8, "revision") {
            return detail;
        }
        if let Err(detail) = read_scalar(body, &mut cursor, 8, "deadline") {
            return detail;
        }
        if cursor >= body.len() {
            return "unexpected end of file".to_owned();
        }
        cursor += 1;
        if let Err(detail) = read_block(body, &mut cursor, "value") {
            return detail;
        }
    }
    // Upstream reported a truncation that the record walk no longer sees.
    "unexpected end of file".to_owned()
}

fn read_scalar(body: &[u8], cursor: &mut usize, length: usize, field: &str) -> std::result::Result<(), String> {
    if *cursor + length > body.len() {
        return Err(format!("truncated `{field}`"));
    }
    *cursor += length;
    Ok(())
}

fn read_count(body: &[u8], cursor: &mut usize) -> std::result::Result<u32, String> {
    if *cursor + 4 > body.len() {
        return Err("truncated `record count`".to_owned());
    }
    let value = u32::from_le_bytes(body[*cursor..*cursor + 4].try_into().unwrap_or([0; 4]));
    *cursor += 4;
    Ok(value)
}

fn read_block(body: &[u8], cursor: &mut usize, field: &str) -> std::result::Result<(), String> {
    if *cursor + 4 > body.len() {
        return Err(format!("truncated `{field}` length"));
    }
    let length = u32::from_le_bytes(body[*cursor..*cursor + 4].try_into().unwrap_or([0; 4])) as usize;
    *cursor += 4;
    if *cursor + length > body.len() {
        return Err(format!("truncated `{field}` bytes"));
    }
    *cursor += length;
    Ok(())
}
