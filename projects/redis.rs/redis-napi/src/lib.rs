//! Node-API binding exposing the portable RESP and `.yyds` primitives.
//!
//! The binding owns no listener, no command dispatcher, and no process entry
//! point. A host composes these calls into a server loop or a client.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};

use database_execution::cluster::KeyValueExecutor;
use database_query::cluster_kv::{KeyValueAction, KeyValueCommand, KeyValueResult};
use database_server::yyds::redis::{ClientRegistry, EmbeddedServerFace};
use database_types::cluster::{Error as ClusterError, FenceToken, Namespace};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use redis_wasm::resp::Reply;
use redis_wasm::store::{Node, RenameOutcome};

/// One parsed command with the number of bytes it consumed.
#[napi(object)]
pub struct DecodedCommand {
    pub consumed: u32,
    pub args: Vec<Buffer>,
}

/// One parsed reply with the number of bytes it consumed.
#[napi(object)]
pub struct DecodedReply {
    pub consumed: u32,
    pub spec: String,
}

/// Result of adding `delta` to an integer value.
#[napi(object)]
pub struct Increment {
    pub value: Option<i64>,
    pub error: Option<String>,
}

fn reason(error: impl ToString) -> napi::Error {
    napi::Error::from_reason(error.to_string())
}

/// Rejects a value kind the shard does not name.
fn check_kind(kind: &str) -> std::result::Result<(), napi::Error> {
    if redis_wasm::store::KINDS.contains(&kind) {
        Ok(())
    } else {
        Err(reason(format!("unknown value kind `{kind}`")))
    }
}

/// Parses one command from the front of `input`, or `null` when more bytes are needed.
#[napi]
pub fn decode_command(input: Buffer) -> std::result::Result<Option<DecodedCommand>, napi::Error> {
    match redis_wasm::resp::decode_command(&input) {
        Ok(Some((request, consumed))) => Ok(Some(DecodedCommand {
            consumed: consumed as u32,
            args: request.args.into_iter().map(Buffer::from).collect(),
        })),
        Ok(None) => Ok(None),
        Err(error) => Err(reason(error)),
    }
}

/// Encodes one command as a multibulk request.
#[napi]
pub fn encode_command(args: Vec<Buffer>) -> Buffer {
    let args = args.into_iter().map(|arg| arg.to_vec()).collect::<Vec<_>>();
    Buffer::from(redis_wasm::resp::encode_command(&args))
}

/// Encodes one reply specification for the negotiated protocol version.
#[napi]
pub fn encode_reply(spec: String, protocol: u8) -> std::result::Result<Buffer, napi::Error> {
    let spec: serde_json::Value = serde_json::from_str(&spec).map_err(reason)?;
    let reply = Reply::from_spec(&spec).map_err(reason)?;
    Ok(Buffer::from(redis_wasm::resp::encode_reply(&reply, protocol)))
}

/// Parses one reply from the front of `input`, or `null` when more bytes are needed.
#[napi]
pub fn decode_reply(input: Buffer) -> std::result::Result<Option<DecodedReply>, napi::Error> {
    match redis_wasm::resp::decode_reply(&input) {
        Ok(Some((reply, consumed))) => Ok(Some(DecodedReply {
            consumed: consumed as u32,
            spec: reply.to_spec().to_string(),
        })),
        Ok(None) => Ok(None),
        Err(error) => Err(reason(error)),
    }
}

/// Parses a canonical Redis integer, rejecting leading zeros and a plus sign.
#[napi]
pub fn parse_integer(value: Buffer) -> Option<i64> {
    redis_wasm::format::parse_integer(&value)
}

/// Embedded server sessions keyed by the host connection id.
///
/// One registry is shared by every session so `CLIENT LIST` and `CLIENT KILL` observe
/// the host's other connections. The host owns the ids and closes the matching socket
/// when a peer kill reports it back.
struct ServerSessions {
    registry: Arc<ClientRegistry>,
    faces: HashMap<u32, EmbeddedServerFace>,
}

/// A `.yyds` catalog plus `.yykv` shard opened by the host.
#[napi]
pub struct Store {
    node: Mutex<Node>,
    server: Mutex<ServerSessions>,
}

impl Store {
    /// Locks the shard for one call, recovering the guard when a panic poisoned it.
    fn shard(&self) -> MutexGuard<'_, Node> {
        self.node.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

/// Routes the upstream executor contract onto the shard owned by the binding.
///
/// Only namespace-scoped reads, kind writes and deletes are expressed here. The
/// command semantics, reply framing and type checks stay in the upstream facade;
/// this type carries no command knowledge of its own.
#[derive(Debug)]
struct StoreExecutor<'a> {
    node: &'a Mutex<Node>,
}

/// Splits `redis:db<db>[:kind]` back into the database index and value kind.
fn locate(namespace: &Namespace) -> Option<(u8, &'static str)> {
    let rest = namespace.0.strip_prefix(redis_wasm::store::NAMESPACE_PREFIX)?;
    let (index, kind) = match rest.split_once(':') {
        Some((index, kind)) => (index, kind),
        None => (rest, ""),
    };
    let db = index.parse::<u8>().ok()?;
    redis_wasm::store::KINDS
        .into_iter()
        .find(|candidate| *candidate == kind)
        .map(|kind| (db, kind))
}

/// Counts the length-framed chunks of a flat collection blob.
fn count_chunks(flat: &[u8]) -> Option<usize> {
    let mut offset = 0;
    let mut chunks = 0;
    while offset < flat.len() {
        let raw = flat.get(offset..offset + 4)?;
        let length = u32::from_le_bytes(raw.try_into().ok()?) as usize;
        offset = offset.checked_add(4)?.checked_add(length)?;
        if offset > flat.len() {
            return None;
        }
        chunks += 1;
    }
    Some(chunks)
}

/// Presents a flat hash blob in the counted form expected by the upstream handler.
///
/// The shard keeps collection values as flat length-framed chunks, while the upstream
/// handler frames a hash with its field count. The conversion is byte-only: field
/// order, field bytes and value bytes are untouched. A malformed blob is handed over
/// unchanged so the upstream decoder reports it as corrupt.
fn hash_with_count(flat: &[u8]) -> Vec<u8> {
    let Some(chunks) = count_chunks(flat) else {
        return flat.to_vec();
    };
    let mut out = Vec::with_capacity(flat.len() + 4);
    out.extend_from_slice(&((chunks / 2) as u32).to_le_bytes());
    out.extend_from_slice(flat);
    out
}

/// Drops the upstream field count and returns the flat layout stored by the shard.
fn hash_without_count(counted: &[u8]) -> Vec<u8> {
    if counted.len() >= 4 {
        counted[4..].to_vec()
    } else {
        counted.to_vec()
    }
}

/// Presents a flat set blob in the counted form expected by the upstream handler.
///
/// The shard keeps collection values as flat length-framed chunks, while the upstream
/// handler frames a set with its member count. The conversion is byte-only: member
/// order and member bytes are untouched. A malformed blob is handed over unchanged
/// so the upstream decoder reports it as corrupt.
fn set_with_count(flat: &[u8]) -> Vec<u8> {
    let Some(chunks) = count_chunks(flat) else {
        return flat.to_vec();
    };
    let mut out = Vec::with_capacity(flat.len() + 4);
    out.extend_from_slice(&(chunks as u32).to_le_bytes());
    out.extend_from_slice(flat);
    out
}

/// Drops the upstream member count and returns the flat layout stored by the shard.
fn set_without_count(counted: &[u8]) -> Vec<u8> {
    if counted.len() >= 4 {
        counted[4..].to_vec()
    } else {
        counted.to_vec()
    }
}

fn upstream_value(kind: &str, value: &[u8]) -> Vec<u8> {
    if kind == "hash" {
        hash_with_count(value)
    } else if kind == "set" || kind == "list" {
        set_with_count(value)
    } else {
        value.to_vec()
    }
}

fn downstream_value(kind: &str, value: Vec<u8>) -> Vec<u8> {
    if kind == "hash" {
        hash_without_count(&value)
    } else if kind == "set" || kind == "list" {
        set_without_count(&value)
    } else {
        value
    }
}

impl KeyValueExecutor for StoreExecutor<'_> {
    fn execute(
        &self,
        fence: Option<&FenceToken>,
        command: KeyValueCommand,
    ) -> database_types::cluster::Result<KeyValueResult> {
        // This executor serves one local shard, so there is no lease to fence.
        let _ = fence;
        let (db, kind) = locate(&command.namespace).ok_or(ClusterError::Unsupported("unknown redis namespace"))?;
        let mut node = self
            .node
            .lock()
            .map_err(|_| ClusterError::Unsupported("store lock poisoned"))?;
        let key = command.key.as_slice();
        match command.action {
            KeyValueAction::Get => Ok(KeyValueResult::Get(
                node.get_kind(db, kind, key)
                    .map(|record| upstream_value(kind, &record.value)),
            )),
            KeyValueAction::Exists => Ok(KeyValueResult::Exists(node.contains_kind(db, kind, key))),
            KeyValueAction::GetDelete => {
                let value = node
                    .get_kind(db, kind, key)
                    .map(|record| upstream_value(kind, &record.value));
                if value.is_some() {
                    node.delete_kind(db, kind, key).map_err(ClusterError::Io)?;
                }
                Ok(KeyValueResult::GetDelete(value))
            }
            KeyValueAction::GetSet(value) => {
                let previous = node
                    .get_kind(db, kind, key)
                    .map(|record| upstream_value(kind, &record.value));
                let value = downstream_value(kind, value);
                let revision = node
                    .set_kind_revision(db, kind, key, &value, None)
                    .map_err(ClusterError::Io)?;
                let _ = revision;
                Ok(KeyValueResult::GetSet(previous))
            }
            KeyValueAction::Put(value) => {
                let value = downstream_value(kind, value);
                let revision = node
                    .set_kind_revision(db, kind, key, &value, None)
                    .map_err(ClusterError::Io)?;
                Ok(KeyValueResult::Put { revision })
            }
            KeyValueAction::PutKeepingExpiry(value) => {
                let value = downstream_value(kind, value);
                let expires_at = node.deadline_kind(db, kind, key);
                let revision = node
                    .set_kind_revision(db, kind, key, &value, expires_at)
                    .map_err(ClusterError::Io)?;
                Ok(KeyValueResult::Put { revision })
            }
            KeyValueAction::PutIfAbsent(value) => {
                if node.contains_kind(db, kind, key) {
                    return Ok(KeyValueResult::PutIfAbsent { revision: None });
                }
                let value = downstream_value(kind, value);
                let revision = node
                    .set_kind_revision(db, kind, key, &value, None)
                    .map_err(ClusterError::Io)?;
                Ok(KeyValueResult::PutIfAbsent {
                    revision: Some(revision),
                })
            }
            KeyValueAction::PutIfPresent(value) => {
                if !node.contains_kind(db, kind, key) {
                    return Ok(KeyValueResult::PutIfPresent { revision: None });
                }
                let value = downstream_value(kind, value);
                let revision = node
                    .set_kind_revision(db, kind, key, &value, None)
                    .map_err(ClusterError::Io)?;
                Ok(KeyValueResult::PutIfPresent {
                    revision: Some(revision),
                })
            }
            KeyValueAction::PutIfPresentKeepingExpiry(value) => {
                if !node.contains_kind(db, kind, key) {
                    return Ok(KeyValueResult::PutIfPresent { revision: None });
                }
                let value = downstream_value(kind, value);
                let expires_at = node.deadline_kind(db, kind, key);
                let revision = node
                    .set_kind_revision(db, kind, key, &value, expires_at)
                    .map_err(ClusterError::Io)?;
                Ok(KeyValueResult::PutIfPresent {
                    revision: Some(revision),
                })
            }
            KeyValueAction::PutExpiring { value, expires_at } => {
                let value = downstream_value(kind, value);
                let revision = node
                    .set_kind_revision(db, kind, key, &value, Some(expires_at))
                    .map_err(ClusterError::Io)?;
                Ok(KeyValueResult::Put { revision })
            }
            KeyValueAction::PutIfAbsentExpiring { value, expires_at } => {
                if node.contains_kind(db, kind, key) {
                    return Ok(KeyValueResult::PutIfAbsent { revision: None });
                }
                let value = downstream_value(kind, value);
                let revision = node
                    .set_kind_revision(db, kind, key, &value, Some(expires_at))
                    .map_err(ClusterError::Io)?;
                Ok(KeyValueResult::PutIfAbsent {
                    revision: Some(revision),
                })
            }
            KeyValueAction::PutIfPresentExpiring { value, expires_at } => {
                if !node.contains_kind(db, kind, key) {
                    return Ok(KeyValueResult::PutIfPresent { revision: None });
                }
                let value = downstream_value(kind, value);
                let revision = node
                    .set_kind_revision(db, kind, key, &value, Some(expires_at))
                    .map_err(ClusterError::Io)?;
                Ok(KeyValueResult::PutIfPresent {
                    revision: Some(revision),
                })
            }
            KeyValueAction::Delete => Ok(KeyValueResult::Delete {
                removed: node.delete_kind(db, kind, key).map_err(ClusterError::Io)?,
            }),
            KeyValueAction::SetExpiry { expires_at } => Ok(KeyValueResult::ExpiryChanged {
                applied: node
                    .set_deadline_kind(db, kind, key, Some(expires_at))
                    .map_err(ClusterError::Io)?,
            }),
            KeyValueAction::ClearExpiry => {
                let had_deadline = node.contains_kind(db, kind, key) && node.deadline_kind(db, kind, key).is_some();
                node.set_deadline_kind(db, kind, key, None).map_err(ClusterError::Io)?;
                Ok(KeyValueResult::ExpiryChanged { applied: had_deadline })
            }
            KeyValueAction::GetExpiry => Ok(KeyValueResult::Expiry {
                present: node.contains_kind(db, kind, key),
                expires_at: node.deadline_kind(db, kind, key),
            }),
            KeyValueAction::IncrementBy(delta) => {
                if kind != "" {
                    return Err(ClusterError::Unsupported(
                        "increments are only defined for the string kind",
                    ));
                }
                let outcome = node.incr_by(db, key, delta).map_err(ClusterError::Io)?;
                match outcome {
                    Ok(value) => Ok(KeyValueResult::Increment { value }),
                    Err(message) if message.contains("not an integer") => Err(ClusterError::InvalidIntegerValue),
                    Err(_) => Err(ClusterError::IntegerOverflow),
                }
            }
            KeyValueAction::Rename { destination, if_absent } => {
                let outcome = node
                    .rename(db, key, &destination, if_absent)
                    .map_err(ClusterError::Io)?;
                Ok(KeyValueResult::Rename {
                    source_present: !matches!(outcome, RenameOutcome::Missing),
                    applied: matches!(outcome, RenameOutcome::Renamed),
                })
            }
        }
    }

    fn execute_read_batch(
        &self,
        fence: Option<&FenceToken>,
        commands: &[KeyValueCommand],
    ) -> database_types::cluster::Result<Vec<KeyValueResult>> {
        // The binding drives one synchronous client call at a time, so replaying
        // the reads back to back cannot interleave with a concurrent write.
        let _ = fence;
        commands
            .iter()
            .map(|command| self.execute(None, command.clone()))
            .collect()
    }

    fn execute_scan(
        &self,
        fence: Option<&FenceToken>,
        namespace: &Namespace,
        prefix: &[u8],
        after: Option<&[u8]>,
        before: Option<&[u8]>,
        limit: usize,
    ) -> database_types::cluster::Result<Vec<(Vec<u8>, Vec<u8>)>> {
        // This executor serves one local shard, so there is no lease to fence.
        let _ = fence;
        let (db, kind) = locate(namespace).ok_or(ClusterError::Unsupported("unknown redis namespace"))?;
        let node = self
            .node
            .lock()
            .map_err(|_| ClusterError::Unsupported("store lock poisoned"))?;
        let mut records = Vec::new();
        for key in node.keys(db) {
            if !key.starts_with(prefix) {
                continue;
            }
            if after.is_some_and(|after| key.as_slice() <= after) {
                continue;
            }
            if before.is_some_and(|before| key.as_slice() >= before) {
                continue;
            }
            if limit != 0 && records.len() >= limit {
                break;
            }
            // `keys` merges every kind of the database, so a key that only lives
            // in another kind namespace is not part of this scan.
            if let Some(record) = node.get_kind(db, kind, &key) {
                records.push((key, upstream_value(kind, &record.value)));
            }
        }
        Ok(records)
    }
}

/// Creates the shard registered by an existing `.yyds` catalog when it is missing.
///
/// Recovery entry for the `catalog.shard-file` open error. The catalog is
/// validated but never rewritten, and an existing shard is never overwritten.
#[napi]
pub fn repair_shard(data_dir: String) -> std::result::Result<String, napi::Error> {
    redis_wasm::store::repair_missing_shard(data_dir).map_err(reason)
}

#[napi]
impl Store {
    /// Opens the storage directory, creating the catalog and an empty shard when absent.
    #[napi(constructor)]
    pub fn new(data_dir: String) -> std::result::Result<Self, napi::Error> {
        Ok(Self {
            node: Mutex::new(Node::open(data_dir).map_err(reason)?),
            server: Mutex::new(ServerSessions {
                registry: Arc::new(ClientRegistry::standalone()),
                faces: HashMap::new(),
            }),
        })
    }

    /// Returns the live value for one key.
    #[napi]
    pub fn get(&self, db: u8, key: Buffer) -> Option<Buffer> {
        self.shard()
            .get(db, &key)
            .map(|record| Buffer::from(record.value.clone()))
    }

    /// Inserts or replaces a value with an optional absolute deadline in epoch milliseconds.
    #[napi]
    pub fn set(
        &mut self,
        db: u8,
        key: Buffer,
        value: Buffer,
        expires_at: Option<i64>,
    ) -> std::result::Result<(), napi::Error> {
        self.shard().set(db, &key, &value, expires_at).map_err(reason)
    }

    /// Deletes one key, reporting whether a live record was removed.
    #[napi]
    pub fn delete(&mut self, db: u8, key: Buffer) -> std::result::Result<bool, napi::Error> {
        self.shard().delete(db, &key).map_err(reason)
    }

    /// Whether the key exists and is live.
    #[napi]
    pub fn exists(&self, db: u8, key: Buffer) -> bool {
        self.shard().contains(db, &key)
    }

    /// Absolute deadline in epoch milliseconds, `null` when the key carries none.
    #[napi]
    pub fn deadline(&self, db: u8, key: Buffer) -> Option<i64> {
        self.shard().deadline(db, &key)
    }

    /// Sets or clears the deadline of a live key.
    #[napi]
    pub fn expire(&mut self, db: u8, key: Buffer, expires_at: Option<i64>) -> std::result::Result<bool, napi::Error> {
        self.shard().set_deadline(db, &key, expires_at).map_err(reason)
    }

    /// Returns the live value of one kind (`""`, `hash`, `list`, `set`, `zset` or `stream`).
    #[napi]
    pub fn get_kind(&self, db: u8, kind: String, key: Buffer) -> std::result::Result<Option<Buffer>, napi::Error> {
        check_kind(&kind)?;
        Ok(self
            .shard()
            .get_kind(db, &kind, &key)
            .map(|record| Buffer::from(record.value.clone())))
    }

    /// Inserts or replaces one kind with an optional absolute deadline in epoch milliseconds.
    #[napi]
    pub fn set_kind(
        &mut self,
        db: u8,
        kind: String,
        key: Buffer,
        value: Buffer,
        expires_at: Option<i64>,
    ) -> std::result::Result<(), napi::Error> {
        check_kind(&kind)?;
        self.shard()
            .set_kind(db, &kind, &key, &value, expires_at)
            .map_err(reason)
    }

    /// Deletes one kind, reporting whether a live record was removed.
    #[napi]
    pub fn delete_kind(&mut self, db: u8, kind: String, key: Buffer) -> std::result::Result<bool, napi::Error> {
        check_kind(&kind)?;
        self.shard().delete_kind(db, &kind, &key).map_err(reason)
    }

    /// Whether one kind of the key exists and is live.
    #[napi]
    pub fn exists_kind(&self, db: u8, kind: String, key: Buffer) -> std::result::Result<bool, napi::Error> {
        check_kind(&kind)?;
        Ok(self.shard().contains_kind(db, &kind, &key))
    }

    /// Absolute deadline of one kind, `null` when it carries none.
    #[napi]
    pub fn deadline_kind(&self, db: u8, kind: String, key: Buffer) -> std::result::Result<Option<i64>, napi::Error> {
        check_kind(&kind)?;
        Ok(self.shard().deadline_kind(db, &kind, &key))
    }

    /// Sets or clears the deadline of a live kind.
    #[napi]
    pub fn expire_kind(
        &mut self,
        db: u8,
        kind: String,
        key: Buffer,
        expires_at: Option<i64>,
    ) -> std::result::Result<bool, napi::Error> {
        check_kind(&kind)?;
        self.shard()
            .set_deadline_kind(db, &kind, &key, expires_at)
            .map_err(reason)
    }

    /// Moves one key, carrying its deadline. `if_absent` implements `RENAMENX`.
    #[napi]
    pub fn rename(
        &mut self,
        db: u8,
        source: Buffer,
        destination: Buffer,
        if_absent: Option<bool>,
    ) -> std::result::Result<String, napi::Error> {
        let outcome = self
            .shard()
            .rename(db, &source, &destination, if_absent.unwrap_or(false))
            .map_err(reason)?;
        Ok(match outcome {
            RenameOutcome::Renamed => "renamed",
            RenameOutcome::Missing => "missing",
            RenameOutcome::DestinationPresent => "destination-present",
        }
        .to_owned())
    }

    /// Appends bytes to a live value, preserving its deadline.
    #[napi]
    pub fn append(&mut self, db: u8, key: Buffer, suffix: Buffer) -> std::result::Result<u32, napi::Error> {
        self.shard()
            .append(db, &key, &suffix)
            .map(|length| length as u32)
            .map_err(reason)
    }

    /// Live keys of one database in ascending byte order.
    #[napi]
    pub fn keys(&self, db: u8) -> Vec<Buffer> {
        self.shard().keys(db).into_iter().map(Buffer::from).collect()
    }

    /// Inserts or replaces many values with one durable commit.
    #[napi]
    pub fn set_many(&mut self, db: u8, keys: Vec<Buffer>, values: Vec<Buffer>) -> std::result::Result<(), napi::Error> {
        if keys.len() != values.len() {
            return Err(reason("`keys` and `values` must carry the same number of entries"));
        }
        let entries = keys
            .into_iter()
            .zip(values)
            .map(|(key, value)| (key.to_vec(), value.to_vec()))
            .collect::<Vec<_>>();
        self.shard().set_many(db, &entries).map_err(reason)
    }

    /// Writes counter updates buffered since the last flush, marking the durability boundary.
    #[napi]
    pub fn flush(&mut self) -> std::result::Result<(), napi::Error> {
        self.shard().flush().map_err(reason)
    }

    /// Adds `delta` to an integer value, preserving its deadline.
    #[napi]
    pub fn incr_by(&mut self, db: u8, key: Buffer, delta: i64) -> std::result::Result<Increment, napi::Error> {
        let outcome = self.shard().incr_by(db, &key, delta).map_err(reason)?;
        Ok(match outcome {
            Ok(value) => Increment {
                value: Some(value),
                error: None,
            },
            Err(error) => Increment {
                value: None,
                error: Some(error),
            },
        })
    }

    /// Drops every live record of one database.
    #[napi]
    pub fn flush_db(&mut self, db: u8) -> std::result::Result<(), napi::Error> {
        self.shard().flush_db(db).map_err(reason)
    }

    /// Number of live keys in one database.
    #[napi]
    pub fn size(&self, db: u8) -> u32 {
        self.shard().len(db) as u32
    }

    /// Directory holding the catalog and the shard.
    #[napi]
    pub fn data_dir(&self) -> String {
        self.shard().data_dir().display().to_string()
    }

    /// Executes one hash-family request and returns the reply specification as JSON.
    ///
    /// `protocol` is `2` or `3`, matching the connection that issued the request.
    /// The binding only forwards the arguments and serializes the reply, so the
    /// command semantics stay in the upstream facade.
    #[napi]
    pub fn hash_command(&self, db: u8, protocol: u8, args: Vec<Buffer>) -> std::result::Result<String, napi::Error> {
        let arguments = args.iter().map(|argument| argument.as_ref()).collect::<Vec<&[u8]>>();
        let namespace = Namespace(redis_wasm::store::namespace(db));
        let executor = StoreExecutor { node: &self.node };
        let mut frame = Vec::new();
        database_server::yyds::redis::execute_hash_command(&mut frame, &arguments, &executor, &namespace, protocol)
            .map_err(reason)?;
        let (reply, _) = redis_wasm::resp::decode_reply(&frame)
            .map_err(reason)?
            .ok_or_else(|| reason("hash command produced an empty reply frame"))?;
        Ok(reply.to_spec().to_string())
    }

    /// Executes one set-family request and returns the reply specification as JSON.
    ///
    /// `protocol` is `2` or `3`, matching the connection that issued the request.
    /// The binding only forwards the arguments and serializes the reply, so the
    /// command semantics stay in the upstream facade.
    #[napi]
    pub fn set_command(&self, db: u8, protocol: u8, args: Vec<Buffer>) -> std::result::Result<String, napi::Error> {
        let arguments = args.iter().map(|argument| argument.as_ref()).collect::<Vec<&[u8]>>();
        let namespace = Namespace(redis_wasm::store::namespace(db));
        let executor = StoreExecutor { node: &self.node };
        let mut frame = Vec::new();
        database_server::yyds::redis::execute_set_command(&mut frame, &arguments, &executor, &namespace, protocol)
            .map_err(reason)?;
        let (reply, _) = redis_wasm::resp::decode_reply(&frame)
            .map_err(reason)?
            .ok_or_else(|| reason("set command produced an empty reply frame"))?;
        Ok(reply.to_spec().to_string())
    }

    /// Executes one list-family request and returns the reply specification as JSON.
    ///
    /// `protocol` is `2` or `3`, matching the connection that issued the request.
    /// Blocking commands answer at once in their non-blocking form, so the host owns
    /// the wait loop while the facade keeps the command semantics.
    #[napi]
    pub fn list_command(&self, db: u8, protocol: u8, args: Vec<Buffer>) -> std::result::Result<String, napi::Error> {
        let arguments = args.iter().map(|argument| argument.as_ref()).collect::<Vec<&[u8]>>();
        let namespace = Namespace(redis_wasm::store::namespace(db));
        let executor = StoreExecutor { node: &self.node };
        let mut frame = Vec::new();
        database_server::yyds::redis::execute_list_command(&mut frame, &arguments, &executor, &namespace, protocol)
            .map_err(reason)?;
        let (reply, _) = redis_wasm::resp::decode_reply(&frame)
            .map_err(reason)?
            .ok_or_else(|| reason("list command produced an empty reply frame"))?;
        Ok(reply.to_spec().to_string())
    }

    /// Executes one string/key-family request and returns the reply specification as JSON.
    ///
    /// `protocol` is `2` or `3`, matching the connection that issued the request.
    #[napi]
    pub fn string_command(&self, db: u8, protocol: u8, args: Vec<Buffer>) -> std::result::Result<String, napi::Error> {
        let arguments = args.iter().map(|argument| argument.as_ref()).collect::<Vec<&[u8]>>();
        let namespace = Namespace(redis_wasm::store::namespace(db));
        let executor = StoreExecutor { node: &self.node };
        let mut frame = Vec::new();
        database_server::yyds::redis::execute_string_command(&mut frame, &arguments, &executor, &namespace, protocol)
            .map_err(reason)?;
        let (reply, _) = redis_wasm::resp::decode_reply(&frame)
            .map_err(reason)?
            .ok_or_else(|| reason("string command produced an empty reply frame"))?;
        Ok(reply.to_spec().to_string())
    }

    /// Executes one server-face request and returns the reply specification as JSON.
    ///
    /// `session` is the host connection id. Each id gets its own embedded session, so
    /// `CLIENT` state is connection-scoped while `CLIENT LIST` and `CLIENT KILL` see the
    /// host's other sessions. The reply also carries `killed`, the host ids a peer kill
    /// closed and that the host must disconnect.
    #[napi]
    pub fn server_command(
        &self,
        session: u32,
        db: u8,
        protocol: u8,
        args: Vec<Buffer>,
    ) -> std::result::Result<String, napi::Error> {
        let arguments = args.iter().map(|argument| argument.as_ref()).collect::<Vec<&[u8]>>();
        let executor = StoreExecutor { node: &self.node };
        let mut sessions = self.server.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let registry = Arc::clone(&sessions.registry);
        let face = sessions
            .faces
            .entry(session)
            .or_insert_with(|| EmbeddedServerFace::with_id(Arc::clone(&registry), u64::from(session)));
        let mut frame = Vec::new();
        let close = !database_server::yyds::redis::execute_server_command(
            face, &mut frame, &arguments, &executor, db, protocol,
        )
        .map_err(reason)?;
        let killed = registry
            .take_killed()
            .into_iter()
            .filter(|id| *id != u64::from(session))
            .collect::<Vec<_>>();
        let (reply, _) = redis_wasm::resp::decode_reply(&frame)
            .map_err(reason)?
            .ok_or_else(|| reason("server command produced an empty reply frame"))?;
        let killed = killed.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",");
        Ok(format!(
            "{{\"reply\":{},\"close\":{close},\"killed\":[{killed}]}}",
            reply.to_spec()
        ))
    }

    /// Drops the embedded session opened for one host connection.
    ///
    /// The host calls this when the connection ends so `CLIENT LIST` stops reporting it.
    #[napi]
    pub fn server_release(&self, session: u32) {
        let mut sessions = self.server.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if sessions.faces.remove(&session).is_some() {
            sessions.registry.detach(u64::from(session));
        }
    }

    /// Executes one zset-family request and returns the reply specification as JSON.
    ///
    /// `protocol` is `2` or `3`, matching the connection that issued the request.
    /// Blocking commands answer at once in their non-blocking form, so the host owns
    /// the wait loop while the facade keeps the command semantics.
    #[napi]
    pub fn zset_command(&self, db: u8, protocol: u8, args: Vec<Buffer>) -> std::result::Result<String, napi::Error> {
        let arguments = args.iter().map(|argument| argument.as_ref()).collect::<Vec<&[u8]>>();
        let namespace = Namespace(redis_wasm::store::namespace(db));
        let executor = StoreExecutor { node: &self.node };
        let mut frame = Vec::new();
        database_server::yyds::redis::execute_zset_command(&mut frame, &arguments, &executor, &namespace, protocol)
            .map_err(reason)?;
        let (reply, _) = redis_wasm::resp::decode_reply(&frame)
            .map_err(reason)?
            .ok_or_else(|| reason("zset command produced an empty reply frame"))?;
        Ok(reply.to_spec().to_string())
    }
}
