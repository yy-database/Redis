//! Node-API binding over the upstream Redis primitives.
//!
//! The binding owns no listener, no command dispatcher, and no process entry
//! point. A host composes these calls into a server loop or a client. Every
//! domain rule (RESP framing, value kinds, expiry, `WATCH` versions, durability)
//! lives upstream, so this crate only maps parameters and results.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};

use database::harness::{
    Baseline, BaselineIdentity, DifferenceObservation, Digest, GatePolicy, ReportEnvelope, Stats, SuiteReport,
    check_baseline, evaluate, per_op_ms, render_json, summarize,
};
use database_execution::cluster::redis::RedisExecutor;
use database_protocol_redis::codec::Reply;
use database_server::yyds::redis::{ClientRegistry, EmbeddedServerFace};
use database_storage::cluster_kv::redis::{
    RedisShard, RenameOutcome, format::record_bytes, namespace, repair_missing_shard,
};
use database_types::cluster::Namespace;
use napi::bindgen_prelude::*;
use napi_derive::napi;

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

/// Every complete request decoded from the front of one buffer.
#[napi(object)]
pub struct DecodedCommands {
    /// Bytes covered by `commands`, stopping before any framing error.
    pub consumed: u32,
    /// Complete requests in wire order, including empty ones the host must skip.
    pub commands: Vec<DecodedCommand>,
    /// Framing error found after the decoded requests, or `None`.
    pub error: Option<String>,
}

/// Every complete reply decoded from the front of one buffer.
#[napi(object)]
pub struct DecodedReplies {
    /// Bytes covered by `specs`, stopping before any framing error.
    pub consumed: u32,
    /// Reply specifications in wire order.
    pub specs: Vec<String>,
    /// Framing error found after the decoded replies, or `None`.
    pub error: Option<String>,
}

/// Result of adding `delta` to an integer value.
#[napi(object)]
pub struct Increment {
    pub value: Option<i64>,
    pub error: Option<String>,
}

/// One logical key a sweep removed because its deadline elapsed.
#[napi(object)]
pub struct ExpiredKey {
    pub db: u32,
    pub key: Buffer,
}

/// One server-face reply plus the connection effects the binding reports.
#[napi(object)]
pub struct ServerCommandFrame {
    /// Reply bytes the facade already framed for the connection protocol.
    pub frame: Buffer,
    /// Whether the host must close this connection after writing `frame`.
    pub close: bool,
    /// Host connection ids a peer `CLIENT KILL` selected.
    pub killed: Vec<u32>,
}

/// One reply frame produced upstream, carried to the host without re-encoding.
///
/// The facade already frames the reply for the connection protocol, so the host
/// can write these bytes directly instead of decoding them into a reply
/// specification and encoding them again.
#[napi(object)]
pub struct CommandFrame {
    pub frame: Buffer,
    /// Whether the frame starts with the RESP error marker `-`.
    pub error: bool,
}

impl From<Vec<u8>> for CommandFrame {
    fn from(frame: Vec<u8>) -> Self {
        Self { error: frame.first() == Some(&b'-'), frame: Buffer::from(frame) }
    }
}

fn reason(error: impl ToString) -> napi::Error {
    napi::Error::from_reason(error.to_string())
}

/// Rejects a value kind the shard does not name.
fn check_kind(kind: &str) -> std::result::Result<(), napi::Error> {
    database_execution::cluster::redis::check_kind(kind).map_err(reason)
}

/// Parses one command from the front of `input`, or `null` when more bytes are needed.
#[napi]
pub fn decode_command(input: Buffer) -> std::result::Result<Option<DecodedCommand>, napi::Error> {
    match database_protocol_redis::codec::decode_command(&input) {
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
    Buffer::from(database_protocol_redis::codec::encode_command(&args))
}

/// Encodes several commands back to back for one pipeline write.
#[napi]
pub fn encode_commands(commands: Vec<Vec<Buffer>>) -> Buffer {
    let commands = commands
        .into_iter()
        .map(|args| args.into_iter().map(|arg| arg.to_vec()).collect::<Vec<_>>())
        .collect::<Vec<_>>();
    Buffer::from(database_protocol_redis::codec::encode_commands(&commands))
}

/// Decodes every complete request at the front of `input`.
#[napi]
pub fn decode_commands(input: Buffer) -> std::result::Result<DecodedCommands, napi::Error> {
    let batch = database_protocol_redis::codec::decode_commands(&input);
    Ok(DecodedCommands {
        consumed: batch.consumed as u32,
        commands: batch
            .requests
            .into_iter()
            .map(|(request, length)| DecodedCommand {
                consumed: length as u32,
                args: request.args.into_iter().map(Buffer::from).collect(),
            })
            .collect(),
        error: batch.error,
    })
}

/// Encodes one reply specification for the negotiated protocol version.
#[napi]
pub fn encode_reply(spec: String, protocol: u8) -> std::result::Result<Buffer, napi::Error> {
    let spec: serde_json::Value = serde_json::from_str(&spec).map_err(reason)?;
    let reply = Reply::from_spec(&spec).map_err(reason)?;
    Ok(Buffer::from(database_protocol_redis::codec::encode_reply(&reply, protocol)))
}

/// Encodes several reply specifications, carried as one JSON array.
#[napi]
pub fn encode_replies(specs: String, protocol: u8) -> std::result::Result<Buffer, napi::Error> {
    let specs: Vec<serde_json::Value> = serde_json::from_str(&specs).map_err(reason)?;
    let replies = specs
        .iter()
        .map(Reply::from_spec)
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(reason)?;
    Ok(Buffer::from(database_protocol_redis::codec::encode_replies(&replies, protocol)))
}

/// Parses one reply from the front of `input`, or `null` when more bytes are needed.
#[napi]
pub fn decode_reply(input: Buffer) -> std::result::Result<Option<DecodedReply>, napi::Error> {
    match database_protocol_redis::codec::decode_reply(&input) {
        Ok(Some((reply, consumed))) => Ok(Some(DecodedReply {
            consumed: consumed as u32,
            spec: reply.to_spec().to_string(),
        })),
        Ok(None) => Ok(None),
        Err(error) => Err(reason(error)),
    }
}

/// Decodes every complete reply at the front of `input`.
#[napi]
pub fn decode_replies(input: Buffer) -> std::result::Result<DecodedReplies, napi::Error> {
    let batch = database_protocol_redis::codec::decode_replies(&input);
    Ok(DecodedReplies {
        consumed: batch.consumed as u32,
        specs: batch.replies.iter().map(|reply| reply.to_spec().to_string()).collect(),
        error: batch.error,
    })
}

/// Parses a canonical Redis integer, rejecting leading zeros and a plus sign.
#[napi]
pub fn parse_integer(value: Buffer) -> Option<i64> {
    database_types::canonical::parse_i64(&value)
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
    node: Mutex<RedisShard>,
    server: Mutex<ServerSessions>,
}

impl Store {
    /// Locks the shard for one call, recovering the guard when a panic poisoned it.
    fn shard(&self) -> MutexGuard<'_, RedisShard> {
        self.node.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Runs one server-face request and returns its raw frame plus connection effects.
    ///
    /// `session` is the host connection id. The embedded face keeps per-connection
    /// `CLIENT` state, while the shared registry backs peer listing and kills.
    fn run_server_command(
        &self,
        session: u32,
        db: u8,
        protocol: u8,
        args: &[Buffer],
    ) -> std::result::Result<(Vec<u8>, bool, Vec<u32>), napi::Error> {
        let arguments = args.iter().map(|argument| argument.as_ref()).collect::<Vec<&[u8]>>();
        let executor = RedisExecutor::new(&self.node);
        let mut sessions = self.server.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let registry = Arc::clone(&sessions.registry);
        let face = sessions
            .faces
            .entry(session)
            .or_insert_with(|| EmbeddedServerFace::with_id(Arc::clone(&registry), u64::from(session)));
        let mut frame = Vec::new();
        let close = !database_server::yyds::redis::execute_server_command(
            face,
            &mut frame,
            &arguments,
            &executor,
            db,
            protocol,
        )
        .map_err(reason)?;
        let killed = registry
            .take_killed()
            .into_iter()
            .filter(|id| *id != u64::from(session))
            .map(|id| id as u32)
            .collect::<Vec<_>>();
        Ok((frame, close, killed))
    }
}

/// Creates the shard registered by an existing `.yyds` catalog when it is missing.
///
/// Recovery entry for the `catalog.shard-file` open error. The catalog is
/// validated but never rewritten, and an existing shard is never overwritten.
#[napi]
pub fn repair_shard(data_dir: String) -> std::result::Result<String, napi::Error> {
    repair_missing_shard(data_dir).map_err(reason)
}

#[napi]
impl Store {
    /// Opens the storage directory, creating the catalog and an empty shard when absent.
    #[napi(constructor)]
    pub fn new(data_dir: String) -> std::result::Result<Self, napi::Error> {
        Ok(Self {
            node: Mutex::new(RedisShard::open(data_dir).map_err(reason)?),
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
            .map(|record| Buffer::from(record_bytes(record).to_vec()))
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
            .map(|record| Buffer::from(record_bytes(record).to_vec())))
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
                error: Some(error.to_string()),
            },
        })
    }

    /// Drops every live record of one database.
    #[napi]
    pub fn flush_db(&mut self, db: u8) -> std::result::Result<(), napi::Error> {
        self.shard().flush_db(db).map_err(reason)
    }

    /// Drops every record whose deadline elapsed at `now_unix_ms`.
    ///
    /// Returns the distinct logical keys that expired, so the host can publish
    /// keyspace notifications for them. One pass walks the shard in Rust, so a
    /// large keyspace costs one native call instead of one call per key and kind
    /// from the host loop.
    #[napi]
    pub fn sweep_expired(&mut self, now_unix_ms: i64) -> std::result::Result<Vec<ExpiredKey>, napi::Error> {
        let expired = self.shard().sweep_expired(now_unix_ms).map_err(reason)?;
        Ok(expired
            .into_iter()
            .map(|entry| ExpiredKey {
                db: u32::from(entry.db),
                key: Buffer::from(entry.key),
            })
            .collect())
    }

    /// Opens a batch whose mutations share one snapshot write.
    ///
    /// The host brackets one socket read with `beginBatch` / `endBatch`, so a
    /// pipelined burst rewrites the `.yykv` shard once instead of once per
    /// command. Reads inside the batch already see every earlier mutation.
    #[napi]
    pub fn begin_batch(&mut self) {
        self.shard().begin_batch();
    }

    /// Closes a batch and writes the shard at the outermost depth.
    #[napi]
    pub fn end_batch(&mut self) -> std::result::Result<(), napi::Error> {
        self.shard().end_batch().map_err(reason)
    }

    /// Closes a batch without writing the shard, leaving the write to `flush`.
    ///
    /// A socket server that reads one command per round trip uses this so a
    /// sequential command does not rewrite the whole snapshot; its flush timer,
    /// `SAVE` and shutdown still persist every mutation. A batch that mutates and
    /// also buffered an increment writes through, and under `sync_always` every
    /// batch writes through, because both are documented durability points.
    #[napi]
    pub fn end_batch_deferred(&mut self) -> std::result::Result<(), napi::Error> {
        self.shard().end_batch_deferred().map_err(reason)
    }

    /// Selects `fsync` on every snapshot write (`always`) or once per sync call.
    #[napi]
    pub fn set_sync_always(&mut self, always: bool) {
        self.shard().set_sync_always(always);
    }

    /// Flushes an unsynced snapshot to stable storage.
    #[napi]
    pub fn sync(&mut self) -> std::result::Result<(), napi::Error> {
        self.shard().sync().map_err(reason)
    }

    /// Registers one `WATCH` on a logical key and returns its mutation version.
    #[napi]
    pub fn watch_key(&mut self, db: u8, key: Buffer) -> u64 {
        self.shard().watch_key(db, &key)
    }

    /// Drops one `WATCH` on a logical key.
    #[napi]
    pub fn unwatch_key(&mut self, db: u8, key: Buffer) {
        self.shard().unwatch_key(db, &key);
    }

    /// Current mutation version of a watched logical key, `0` when unwatched.
    #[napi]
    pub fn watch_version(&self, db: u8, key: Buffer) -> u64 {
        self.shard().watch_version(db, &key)
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

    /// Runs one family entry against a fresh reply frame.
    fn reply_frame(
        &self,
        db: u8,
        protocol: u8,
        args: &[Buffer],
        run: impl FnOnce(&mut Vec<u8>, &[&[u8]], &Namespace, &RedisExecutor<'_>, u8) -> std::io::Result<()>,
    ) -> std::result::Result<Vec<u8>, napi::Error> {
        let arguments = args.iter().map(|argument| argument.as_ref()).collect::<Vec<&[u8]>>();
        let namespace = Namespace(namespace(db));
        let executor = RedisExecutor::new(&self.node);
        let mut frame = Vec::new();
        run(&mut frame, &arguments, &namespace, &executor, protocol).map_err(reason)?;
        Ok(frame)
    }

    /// Executes one hash-family request and returns the reply specification as JSON.
    ///
    /// `protocol` is `2` or `3`, matching the connection that issued the request.
    /// The binding only forwards the arguments and serializes the reply, so the
    /// command semantics stay in the upstream facade.
    #[napi]
    pub fn hash_command(&self, db: u8, protocol: u8, args: Vec<Buffer>) -> std::result::Result<String, napi::Error> {
        let frame = self.reply_frame(db, protocol, &args, |frame, arguments, namespace, executor, protocol| {
            database_server::yyds::redis::execute_hash_command(
                frame,
                arguments,
                executor,
                namespace,
                protocol,
            )
        })?;
        let (reply, _) = database_protocol_redis::codec::decode_reply(&frame)
            .map_err(reason)?
            .ok_or_else(|| reason("hash command produced an empty reply frame"))?;
        Ok(reply.to_spec().to_string())
    }

    /// Executes one hash-family request and returns the upstream reply frame verbatim.
    #[napi]
    pub fn hash_command_frame(&self, db: u8, protocol: u8, args: Vec<Buffer>) -> std::result::Result<CommandFrame, napi::Error> {
        self.reply_frame(db, protocol, &args, |frame, arguments, namespace, executor, protocol| {
            database_server::yyds::redis::execute_hash_command(
                frame,
                arguments,
                executor,
                namespace,
                protocol,
            )
        })
        .map(CommandFrame::from)
    }

    /// Executes one set-family request and returns the reply specification as JSON.
    ///
    /// `protocol` is `2` or `3`, matching the connection that issued the request.
    /// The binding only forwards the arguments and serializes the reply, so the
    /// command semantics stay in the upstream facade.
    #[napi]
    pub fn set_command(&self, db: u8, protocol: u8, args: Vec<Buffer>) -> std::result::Result<String, napi::Error> {
        let frame = self.reply_frame(db, protocol, &args, |frame, arguments, namespace, executor, protocol| {
            database_server::yyds::redis::execute_set_command(
                frame,
                arguments,
                executor,
                namespace,
                protocol,
            )
        })?;
        let (reply, _) = database_protocol_redis::codec::decode_reply(&frame)
            .map_err(reason)?
            .ok_or_else(|| reason("set command produced an empty reply frame"))?;
        Ok(reply.to_spec().to_string())
    }

    /// Executes one set-family request and returns the upstream reply frame verbatim.
    #[napi]
    pub fn set_command_frame(&self, db: u8, protocol: u8, args: Vec<Buffer>) -> std::result::Result<CommandFrame, napi::Error> {
        self.reply_frame(db, protocol, &args, |frame, arguments, namespace, executor, protocol| {
            database_server::yyds::redis::execute_set_command(
                frame,
                arguments,
                executor,
                namespace,
                protocol,
            )
        })
        .map(CommandFrame::from)
    }

    /// Executes one list-family request and returns the reply specification as JSON.
    ///
    /// `protocol` is `2` or `3`, matching the connection that issued the request.
    /// Blocking commands answer at once in their non-blocking form, so the host owns
    /// the wait loop while the facade keeps the command semantics.
    #[napi]
    pub fn list_command(&self, db: u8, protocol: u8, args: Vec<Buffer>) -> std::result::Result<String, napi::Error> {
        let frame = self.reply_frame(db, protocol, &args, |frame, arguments, namespace, executor, protocol| {
            database_server::yyds::redis::execute_list_command(
                frame,
                arguments,
                executor,
                namespace,
                protocol,
            )
        })?;
        let (reply, _) = database_protocol_redis::codec::decode_reply(&frame)
            .map_err(reason)?
            .ok_or_else(|| reason("list command produced an empty reply frame"))?;
        Ok(reply.to_spec().to_string())
    }

    /// Executes one list-family request and returns the upstream reply frame verbatim.
    #[napi]
    pub fn list_command_frame(&self, db: u8, protocol: u8, args: Vec<Buffer>) -> std::result::Result<CommandFrame, napi::Error> {
        self.reply_frame(db, protocol, &args, |frame, arguments, namespace, executor, protocol| {
            database_server::yyds::redis::execute_list_command(
                frame,
                arguments,
                executor,
                namespace,
                protocol,
            )
        })
        .map(CommandFrame::from)
    }

    /// Executes one string/key-family request and returns the reply specification as JSON.
    ///
    /// `protocol` is `2` or `3`, matching the connection that issued the request.
    #[napi]
    pub fn string_command(&self, db: u8, protocol: u8, args: Vec<Buffer>) -> std::result::Result<String, napi::Error> {
        let frame = self.reply_frame(db, protocol, &args, |frame, arguments, namespace, executor, protocol| {
            database_server::yyds::redis::execute_string_command(
                frame,
                arguments,
                executor,
                namespace,
                protocol,
            )
        })?;
        let (reply, _) = database_protocol_redis::codec::decode_reply(&frame)
            .map_err(reason)?
            .ok_or_else(|| reason("string command produced an empty reply frame"))?;
        Ok(reply.to_spec().to_string())
    }

    /// Executes one string/key-family request and returns the upstream reply frame verbatim.
    #[napi]
    pub fn string_command_frame(&self, db: u8, protocol: u8, args: Vec<Buffer>) -> std::result::Result<CommandFrame, napi::Error> {
        self.reply_frame(db, protocol, &args, |frame, arguments, namespace, executor, protocol| {
            database_server::yyds::redis::execute_string_command(
                frame,
                arguments,
                executor,
                namespace,
                protocol,
            )
        })
        .map(CommandFrame::from)
    }

    /// Executes one keyspace-family request and returns the reply specification as JSON.
    ///
    /// `protocol` is `2` or `3`, matching the connection that issued the request.
    /// Key enumeration, cursor paging, type probing and object encoding stay upstream.
    #[napi]
    pub fn keyspace_command(
        &self,
        db: u8,
        protocol: u8,
        args: Vec<Buffer>,
    ) -> std::result::Result<String, napi::Error> {
        let frame = self.reply_frame(db, protocol, &args, |frame, arguments, namespace, executor, protocol| {
            database_server::yyds::redis::execute_keyspace_command(
                frame,
                arguments,
                executor,
                namespace,
                protocol,
            )
        })?;
        let (reply, _) = database_protocol_redis::codec::decode_reply(&frame)
            .map_err(reason)?
            .ok_or_else(|| reason("keyspace command produced an empty reply frame"))?;
        Ok(reply.to_spec().to_string())
    }

    /// Executes one keyspace-family request and returns the upstream reply frame verbatim.
    #[napi]
    pub fn keyspace_command_frame(
        &self,
        db: u8,
        protocol: u8,
        args: Vec<Buffer>,
    ) -> std::result::Result<CommandFrame, napi::Error> {
        self.reply_frame(db, protocol, &args, |frame, arguments, namespace, executor, protocol| {
            database_server::yyds::redis::execute_keyspace_command(
                frame,
                arguments,
                executor,
                namespace,
                protocol,
            )
        })
        .map(CommandFrame::from)
    }

    /// Executes one HyperLogLog-family request and returns the reply specification as JSON.
    ///
    /// The family replies with integers, `OK` or errors only, so the connection
    /// protocol does not change the frame. The binding forwards the arguments and
    /// serializes the reply, leaving hashing, registers and estimation upstream.
    #[napi]
    pub fn hyperloglog_command(&self, db: u8, args: Vec<Buffer>) -> std::result::Result<String, napi::Error> {
        let frame = self.reply_frame(db, 2, &args, |frame, arguments, namespace, executor, _| {
            database_server::yyds::redis::execute_hyperloglog_command(frame, arguments, executor, namespace)
        })?;
        let (reply, _) = database_protocol_redis::codec::decode_reply(&frame)
            .map_err(reason)?
            .ok_or_else(|| reason("hyperloglog command produced an empty reply frame"))?;
        Ok(reply.to_spec().to_string())
    }

    /// Executes one HyperLogLog-family request and returns the upstream reply frame verbatim.
    #[napi]
    pub fn hyperloglog_command_frame(&self, db: u8, args: Vec<Buffer>) -> std::result::Result<CommandFrame, napi::Error> {
        self.reply_frame(db, 2, &args, |frame, arguments, namespace, executor, _| {
            database_server::yyds::redis::execute_hyperloglog_command(frame, arguments, executor, namespace)
        })
        .map(CommandFrame::from)
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
        let (frame, close, killed) = self.run_server_command(session, db, protocol, &args)?;
        let (reply, _) = database_protocol_redis::codec::decode_reply(&frame)
            .map_err(reason)?
            .ok_or_else(|| reason("server command produced an empty reply frame"))?;
        let killed = killed.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",");
        Ok(format!(
            "{{\"reply\":{},\"close\":{close},\"killed\":[{killed}]}}",
            reply.to_spec()
        ))
    }

    /// Executes one server-face request and returns the upstream reply frame verbatim.
    ///
    /// The socket loop writes the bytes directly, so `CLIENT` / `COMMAND` / `INFO` /
    /// `CONFIG` / `ACL` do not cross the binding as a reply specification and back.
    /// The connection effects still travel with the frame.
    #[napi]
    pub fn server_command_frame(
        &self,
        session: u32,
        db: u8,
        protocol: u8,
        args: Vec<Buffer>,
    ) -> std::result::Result<ServerCommandFrame, napi::Error> {
        let (frame, close, killed) = self.run_server_command(session, db, protocol, &args)?;
        Ok(ServerCommandFrame {
            frame: Buffer::from(frame),
            close,
            killed,
        })
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
        let frame = self.reply_frame(db, protocol, &args, |frame, arguments, namespace, executor, protocol| {
            database_server::yyds::redis::execute_zset_command(
                frame,
                arguments,
                executor,
                namespace,
                protocol,
            )
        })?;
        let (reply, _) = database_protocol_redis::codec::decode_reply(&frame)
            .map_err(reason)?
            .ok_or_else(|| reason("zset command produced an empty reply frame"))?;
        Ok(reply.to_spec().to_string())
    }

    /// Executes one zset-family request and returns the upstream reply frame verbatim.
    #[napi]
    pub fn zset_command_frame(&self, db: u8, protocol: u8, args: Vec<Buffer>) -> std::result::Result<CommandFrame, napi::Error> {
        self.reply_frame(db, protocol, &args, |frame, arguments, namespace, executor, protocol| {
            database_server::yyds::redis::execute_zset_command(
                frame,
                arguments,
                executor,
                namespace,
                protocol,
            )
        })
        .map(CommandFrame::from)
    }
}

fn harness_error(error: impl std::fmt::Display) -> napi::Error {
    napi::Error::from_reason(error.to_string())
}

/// 对给定字节取 SHA-256，返回小写十六进制。
#[napi]
pub fn harness_digest(bytes: Buffer) -> String {
    Digest::of(bytes.as_ref()).to_hex()
}

/// 按已知差异台账判定一次语料运行。
#[napi]
pub fn harness_check_baseline(
    baseline_json: String,
    current_json: String,
    observed_json: String,
) -> napi::Result<String> {
    let baseline: Baseline = serde_json::from_str(&baseline_json).map_err(harness_error)?;
    let current: BaselineIdentity = serde_json::from_str(&current_json).map_err(harness_error)?;
    let observed: Vec<DifferenceObservation> = serde_json::from_str(&observed_json).map_err(harness_error)?;
    let verdict = check_baseline(&baseline, &current, &observed);
    serde_json::to_string(&verdict).map_err(harness_error)
}

/// 将报告信封渲染为稳定 JSON 文本。
#[napi]
pub fn harness_render_report(report_json: String) -> napi::Result<String> {
    let report: ReportEnvelope = serde_json::from_str(&report_json).map_err(harness_error)?;
    render_json(&report).map_err(harness_error)
}

/// 按上游失败关闭规则判定一组套件证据。
///
/// `input_json` 是 `{ "suites": [SuiteReport..], "policy": GatePolicy }` 的 serde
/// 形态（核心类型 snake_case 字段）。测试输出解析与 floor 数值由调用方持有，
/// 本函数只做判定：failed、skipped、unverified、unavailable 等各执行状态分别记
/// 问题，逐条 floor 比较，任一问题即 `ok` 为假。
#[napi]
pub fn harness_evaluate_gate(input_json: String) -> napi::Result<String> {
    let envelope: serde_json::Value = serde_json::from_str(&input_json).map_err(harness_error)?;
    let suites: Vec<SuiteReport> =
        serde_json::from_value(envelope.get("suites").cloned().unwrap_or_default()).map_err(harness_error)?;
    let policy: GatePolicy = match envelope.get("policy") {
        Some(value) => serde_json::from_value(value.clone()).map_err(harness_error)?,
        None => GatePolicy::default(),
    };
    let verdict = evaluate(&suites, &policy);
    serde_json::to_string(&verdict).map_err(harness_error)
}

/// 基准统计的 JS 形态。字段名由本 DTO 负责 camelCase，核心 `Stats` 说 Rust。
#[napi(object)]
pub struct BenchStats {
    pub median_ms: f64,
    pub p95_ms: f64,
    pub min_ms: f64,
    pub max_ms: f64,
    pub rounds: u32,
}

impl From<Stats> for BenchStats {
    fn from(stats: Stats) -> Self {
        Self {
            median_ms: stats.median_ms,
            p95_ms: stats.p95_ms,
            min_ms: stats.min_ms,
            max_ms: stats.max_ms,
            rounds: stats.rounds,
        }
    }
}

/// 对一组毫秒样本求 median/p95/极值（nearest-rank，与上游 golden 向量口径一致）。
///
/// 判定与统计语义全走上游 `database.harness::summarize`，绑定层只做类型转换。
#[napi]
pub fn harness_bench_summary(samples_ms: Vec<f64>) -> napi::Result<BenchStats> {
    summarize(&samples_ms).map(Into::into).map_err(harness_error)
}

/// 单次操作的归一毫秒（median / ops）。`ops` 为 0 时抛错，不返回 NaN。
///
/// 走上游 `database.harness::per_op_ms`，绑定层只搬运字段。
#[napi]
pub fn harness_bench_per_op(stats: BenchStats, ops: u32) -> napi::Result<f64> {
    per_op_ms(
        &Stats {
            median_ms: stats.median_ms,
            p95_ms: stats.p95_ms,
            min_ms: stats.min_ms,
            max_ms: stats.max_ms,
            rounds: stats.rounds,
        },
        u64::from(ops),
    )
    .map_err(harness_error)
}
