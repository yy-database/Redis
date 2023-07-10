//! Python binding exposing the portable RESP and `.yyds` primitives.
//!
//! The binding owns no listener, no command dispatcher, and no process entry
//! point. The Python package composes these calls into a server loop or a client.

use pyo3::{
    exceptions::{PyRuntimeError, PyValueError},
    prelude::*,
};
use redis_wasm::resp::Reply;
use redis_wasm::store::{Node, RenameOutcome};

fn runtime(error: impl ToString) -> PyErr {
    PyRuntimeError::new_err(error.to_string())
}

/// Rejects a value kind the shard does not name.
fn check_kind(kind: &str) -> PyResult<()> {
    if redis_wasm::store::KINDS.contains(&kind) { Ok(()) } else { Err(PyValueError::new_err(format!("unknown value kind `{kind}`"))) }
}

/// Parses one command from the front of `input`.
///
/// Returns `(consumed, args)` or `None` when more bytes are needed.
#[pyfunction]
fn decode_command(input: &[u8]) -> PyResult<Option<(usize, Vec<Vec<u8>>)>> {
    match redis_wasm::resp::decode_command(input) {
        Ok(Some((request, consumed))) => Ok(Some((consumed, request.args))),
        Ok(None) => Ok(None),
        Err(error) => Err(PyValueError::new_err(error)),
    }
}

/// Encodes one command as a multibulk request.
#[pyfunction]
fn encode_command(args: Vec<Vec<u8>>) -> Vec<u8> {
    redis_wasm::resp::encode_command(&args)
}

/// Encodes one reply specification for the negotiated protocol version.
#[pyfunction]
fn encode_reply(spec: &str, protocol: u8) -> PyResult<Vec<u8>> {
    let spec: serde_json::Value = serde_json::from_str(spec).map_err(runtime)?;
    let reply = Reply::from_spec(&spec).map_err(PyValueError::new_err)?;
    Ok(redis_wasm::resp::encode_reply(&reply, protocol))
}

/// Parses one reply from the front of `input`.
///
/// Returns `(spec, consumed)` or `None` when more bytes are needed.
#[pyfunction]
fn decode_reply(input: &[u8]) -> PyResult<Option<(String, usize)>> {
    match redis_wasm::resp::decode_reply(input) {
        Ok(Some((reply, consumed))) => Ok(Some((reply.to_spec().to_string(), consumed))),
        Ok(None) => Ok(None),
        Err(error) => Err(PyValueError::new_err(error)),
    }
}

/// Parses a canonical Redis integer, rejecting leading zeros and a plus sign.
#[pyfunction]
fn parse_integer(value: &[u8]) -> Option<i64> {
    redis_wasm::format::parse_integer(value)
}

/// Creates the shard registered by an existing `.yyds` catalog when it is missing.
///
/// Recovery entry for the `catalog.shard-file` open error. The catalog is
/// validated but never rewritten, and an existing shard is never overwritten.
#[pyfunction]
fn repair_shard(data_dir: &str) -> PyResult<String> {
    redis_wasm::store::repair_missing_shard(data_dir).map_err(runtime)
}

/// A `.yyds` catalog plus `.yykv` shard opened by the host.
#[pyclass]
struct Store {
    node: Node,
}

#[pymethods]
impl Store {
    /// Opens the storage directory, creating the catalog and an empty shard when absent.
    #[new]
    fn new(data_dir: String) -> PyResult<Self> {
        Ok(Self { node: Node::open(data_dir).map_err(runtime)? })
    }

    /// Returns the live value for one key.
    fn get(&self, db: u8, key: &[u8]) -> Option<Vec<u8>> {
        self.node.get(db, key).map(|record| record.value.clone())
    }

    /// Inserts or replaces a value with an optional absolute deadline in epoch milliseconds.
    #[pyo3(signature = (db, key, value, expires_at = None))]
    fn set(&mut self, db: u8, key: &[u8], value: &[u8], expires_at: Option<i64>) -> PyResult<()> {
        self.node.set(db, key, value, expires_at).map_err(runtime)
    }

    /// Deletes one key, reporting whether a live record was removed.
    fn delete(&mut self, db: u8, key: &[u8]) -> PyResult<bool> {
        self.node.delete(db, key).map_err(runtime)
    }

    /// Whether the key exists and is live.
    fn exists(&self, db: u8, key: &[u8]) -> bool {
        self.node.contains(db, key)
    }

    /// Absolute deadline in epoch milliseconds, `None` when the key carries none.
    fn deadline(&self, db: u8, key: &[u8]) -> Option<i64> {
        self.node.deadline(db, key)
    }

    /// Sets or clears the deadline of a live key.
    #[pyo3(signature = (db, key, expires_at = None))]
    fn expire(&mut self, db: u8, key: &[u8], expires_at: Option<i64>) -> PyResult<bool> {
        self.node.set_deadline(db, key, expires_at).map_err(runtime)
    }

    /// Returns the live value of one kind (`""`, `hash`, `list`, `set`, `zset` or `stream`).
    fn get_kind(&self, db: u8, kind: &str, key: &[u8]) -> PyResult<Option<Vec<u8>>> {
        check_kind(kind)?;
        Ok(self.node.get_kind(db, kind, key).map(|record| record.value.clone()))
    }

    /// Inserts or replaces one kind with an optional absolute deadline in epoch milliseconds.
    #[pyo3(signature = (db, kind, key, value, expires_at = None))]
    fn set_kind(&mut self, db: u8, kind: &str, key: &[u8], value: &[u8], expires_at: Option<i64>) -> PyResult<()> {
        check_kind(kind)?;
        self.node.set_kind(db, kind, key, value, expires_at).map_err(runtime)
    }

    /// Deletes one kind, reporting whether a live record was removed.
    fn delete_kind(&mut self, db: u8, kind: &str, key: &[u8]) -> PyResult<bool> {
        check_kind(kind)?;
        self.node.delete_kind(db, kind, key).map_err(runtime)
    }

    /// Whether one kind of the key exists and is live.
    fn exists_kind(&self, db: u8, kind: &str, key: &[u8]) -> PyResult<bool> {
        check_kind(kind)?;
        Ok(self.node.contains_kind(db, kind, key))
    }

    /// Absolute deadline in epoch milliseconds for one kind, `None` when it carries none.
    fn deadline_kind(&self, db: u8, kind: &str, key: &[u8]) -> PyResult<Option<i64>> {
        check_kind(kind)?;
        Ok(self.node.deadline_kind(db, kind, key))
    }

    /// Sets or clears the deadline of a live kind.
    #[pyo3(signature = (db, kind, key, expires_at = None))]
    fn expire_kind(&mut self, db: u8, kind: &str, key: &[u8], expires_at: Option<i64>) -> PyResult<bool> {
        check_kind(kind)?;
        self.node.set_deadline_kind(db, kind, key, expires_at).map_err(runtime)
    }

    /// Moves one key, carrying its deadline. `if_absent` implements `RENAMENX`.
    #[pyo3(signature = (db, source, destination, if_absent = false))]
    fn rename(&mut self, db: u8, source: &[u8], destination: &[u8], if_absent: bool) -> PyResult<String> {
        let outcome = self.node.rename(db, source, destination, if_absent).map_err(runtime)?;
        Ok(match outcome {
            RenameOutcome::Renamed => "renamed",
            RenameOutcome::Missing => "missing",
            RenameOutcome::DestinationPresent => "destination-present",
        }
        .to_owned())
    }

    /// Appends bytes to a live value, preserving its deadline.
    fn append(&mut self, db: u8, key: &[u8], suffix: &[u8]) -> PyResult<usize> {
        self.node.append(db, key, suffix).map_err(runtime)
    }

    /// Live keys of one database in ascending byte order.
    fn keys(&self, db: u8) -> Vec<Vec<u8>> {
        self.node.keys(db)
    }

    /// Inserts or replaces many values with one durable commit.
    fn set_many(&mut self, db: u8, entries: Vec<(Vec<u8>, Vec<u8>)>) -> PyResult<()> {
        self.node.set_many(db, &entries).map_err(runtime)
    }

    /// Writes counter updates buffered since the last flush, marking the durability boundary.
    fn flush(&mut self) -> PyResult<()> {
        self.node.flush().map_err(runtime)
    }

    /// Adds `delta` to an integer value, preserving its deadline.
    ///
    /// Returns `(value, error)`. `error` carries the Redis error text when the
    /// stored value is not an integer.
    fn incr_by(&mut self, db: u8, key: &[u8], delta: i64) -> PyResult<(Option<i64>, Option<String>)> {
        let outcome = self.node.incr_by(db, key, delta).map_err(runtime)?;
        Ok(match outcome {
            Ok(value) => (Some(value), None),
            Err(error) => (None, Some(error)),
        })
    }

    /// Drops every live record of one database.
    fn flush_db(&mut self, db: u8) -> PyResult<()> {
        self.node.flush_db(db).map_err(runtime)
    }

    /// Number of live keys in one database.
    fn size(&self, db: u8) -> usize {
        self.node.len(db)
    }

    /// Directory holding the catalog and the shard.
    fn data_dir(&self) -> String {
        self.node.data_dir().display().to_string()
    }
}

#[pymodule]
fn _native(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add_function(wrap_pyfunction!(decode_command, module)?)?;
    module.add_function(wrap_pyfunction!(encode_command, module)?)?;
    module.add_function(wrap_pyfunction!(encode_reply, module)?)?;
    module.add_function(wrap_pyfunction!(decode_reply, module)?)?;
    module.add_function(wrap_pyfunction!(parse_integer, module)?)?;
    module.add_function(wrap_pyfunction!(repair_shard, module)?)?;
    module.add_class::<Store>()?;
    Ok(())
}
