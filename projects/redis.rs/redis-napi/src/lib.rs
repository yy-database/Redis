//! Node-API binding exposing the portable RESP and `.yyds` primitives.
//!
//! The binding owns no listener, no command dispatcher, and no process entry
//! point. A host composes these calls into a server loop or a client.

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

/// A `.yyds` catalog plus `.yykv` shard opened by the host.
#[napi]
pub struct Store {
    node: Node,
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
        Ok(Self { node: Node::open(data_dir).map_err(reason)? })
    }

    /// Returns the live value for one key.
    #[napi]
    pub fn get(&self, db: u8, key: Buffer) -> Option<Buffer> {
        self.node.get(db, &key).map(|record| Buffer::from(record.value.clone()))
    }

    /// Inserts or replaces a value with an optional absolute deadline in epoch milliseconds.
    #[napi]
    pub fn set(
        &mut self, db: u8, key: Buffer, value: Buffer, expires_at: Option<i64>,
    ) -> std::result::Result<(), napi::Error> {
        self.node.set(db, &key, &value, expires_at).map_err(reason)
    }

    /// Deletes one key, reporting whether a live record was removed.
    #[napi]
    pub fn delete(&mut self, db: u8, key: Buffer) -> std::result::Result<bool, napi::Error> {
        self.node.delete(db, &key).map_err(reason)
    }

    /// Whether the key exists and is live.
    #[napi]
    pub fn exists(&self, db: u8, key: Buffer) -> bool {
        self.node.contains(db, &key)
    }

    /// Absolute deadline in epoch milliseconds, `null` when the key carries none.
    #[napi]
    pub fn deadline(&self, db: u8, key: Buffer) -> Option<i64> {
        self.node.deadline(db, &key)
    }

    /// Sets or clears the deadline of a live key.
    #[napi]
    pub fn expire(&mut self, db: u8, key: Buffer, expires_at: Option<i64>) -> std::result::Result<bool, napi::Error> {
        self.node.set_deadline(db, &key, expires_at).map_err(reason)
    }

    /// Moves one key, carrying its deadline. `if_absent` implements `RENAMENX`.
    #[napi]
    pub fn rename(
        &mut self, db: u8, source: Buffer, destination: Buffer, if_absent: Option<bool>,
    ) -> std::result::Result<String, napi::Error> {
        let outcome = self.node.rename(db, &source, &destination, if_absent.unwrap_or(false)).map_err(reason)?;
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
        self.node.append(db, &key, &suffix).map(|length| length as u32).map_err(reason)
    }

    /// Live keys of one database in ascending byte order.
    #[napi]
    pub fn keys(&self, db: u8) -> Vec<Buffer> {
        self.node.keys(db).into_iter().map(Buffer::from).collect()
    }

    /// Inserts or replaces many values with one durable commit.
    #[napi]
    pub fn set_many(
        &mut self, db: u8, keys: Vec<Buffer>, values: Vec<Buffer>,
    ) -> std::result::Result<(), napi::Error> {
        if keys.len() != values.len() {
            return Err(reason("`keys` and `values` must carry the same number of entries"));
        }
        let entries = keys.into_iter().zip(values).map(|(key, value)| (key.to_vec(), value.to_vec())).collect::<Vec<_>>();
        self.node.set_many(db, &entries).map_err(reason)
    }

    /// Writes counter updates buffered since the last flush, marking the durability boundary.
    #[napi]
    pub fn flush(&mut self) -> std::result::Result<(), napi::Error> {
        self.node.flush().map_err(reason)
    }

    /// Adds `delta` to an integer value, preserving its deadline.
    #[napi]
    pub fn incr_by(&mut self, db: u8, key: Buffer, delta: i64) -> std::result::Result<Increment, napi::Error> {
        let outcome = self.node.incr_by(db, &key, delta).map_err(reason)?;
        Ok(match outcome {
            Ok(value) => Increment { value: Some(value), error: None },
            Err(error) => Increment { value: None, error: Some(error) },
        })
    }

    /// Drops every live record of one database.
    #[napi]
    pub fn flush_db(&mut self, db: u8) -> std::result::Result<(), napi::Error> {
        self.node.flush_db(db).map_err(reason)
    }

    /// Number of live keys in one database.
    #[napi]
    pub fn size(&self, db: u8) -> u32 {
        self.node.len(db) as u32
    }

    /// Directory holding the catalog and the shard.
    #[napi]
    pub fn data_dir(&self) -> String {
        self.node.data_dir().display().to_string()
    }
}
