//! `.yykv` shard ownership: one shard file holds every Redis database index as
//! its own namespace.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::format::{self, Record, Records};

/// How many logical databases the service exposes, matching the Redis default.
pub const DATABASES: u8 = 16;
/// File name of the shard snapshot inside the data directory.
pub const SHARD_FILE: &str = "local-0.yykv";
/// File name of the catalog inside the data directory.
pub const CATALOG_FILE: &str = "local-0.yyds";
/// Namespace prefix carrying the logical database index.
pub const NAMESPACE_PREFIX: &str = "redis:db";

/// One `.yyds` catalog plus one `.yykv` shard on disk.
///
/// The `.yykv` snapshot carries one checksum over its whole body and a record
/// count in front of the records, so rewriting any single record means
/// re-serializing the entire shard. Counter updates therefore accumulate in
/// memory and reach the file on [`Node::flush`], on any other mutation, or when
/// the node is dropped. See [`Node::flush`] for the durability boundary.
#[derive(Debug)]
pub struct Node {
    data_dir: PathBuf,
    shard_path: PathBuf,
    records: Records,
    next_revision: u64,
    pending_increments: bool,
}

impl Node {
    /// Opens the storage directory, creating the catalog and an empty shard when absent.
    ///
    /// An existing catalog is fully validated before any read or write: magic,
    /// format version, reserved sections, shard count, shard id shape, exact
    /// length, and the presence of the shard it registers. Every failure names
    /// the exact field in its message. A missing catalog keeps the previous
    /// behavior: the shard is read from, or created at, the derived path and the
    /// catalog is then created around it.
    ///
    /// The shard is written before the catalog because the catalog is the
    /// registration of the shard. A crash between the two renames therefore
    /// leaves a directory whose next open recreates the catalog around the shard
    /// that already exists, instead of leaving a registration with no data.
    pub fn open(data_dir: impl AsRef<Path>) -> io::Result<Self> {
        let data_dir = data_dir.as_ref().to_path_buf();
        fs::create_dir_all(&data_dir)?;
        let catalog_path = data_dir.join(CATALOG_FILE);
        let registered = read_catalog(&catalog_path)?;
        let shard_id = match &registered {
            Some(id) => id.clone(),
            None => "local-0".to_owned(),
        };
        let shard_path = data_dir.join(format!("{shard_id}.yykv"));
        let (records, next_revision) = if shard_path.exists() {
            let bytes = fs::read(&shard_path)?;
            format::decode_shard(&bytes).map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error.to_string()))?
        }
        else if registered.is_some() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("catalog.shard-file: `{shard_id}.yykv` is missing"),
            ));
        }
        else {
            let records = Records::new();
            write_durable(&shard_path, &encode(&records, 1)?)?;
            (records, 1)
        };
        if registered.is_none() {
            write_durable(&catalog_path, &format::encode_catalog("local-0"))?;
        }
        Ok(Self {
            data_dir,
            shard_path,
            records,
            next_revision: next_revision.max(1),
            pending_increments: false,
        })
    }

    /// Directory holding the catalog and the shard.
    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    /// Backing `.yykv` path.
    pub fn shard_path(&self) -> &Path {
        &self.shard_path
    }

    /// Returns the live value for `key` of one kind in database `db`.
    pub fn get_kind(&self, db: u8, kind: &str, key: &[u8]) -> Option<&Record> {
        let now = format::now_unix_ms();
        self.records
            .get(&(kind_namespace(db, kind), key.to_vec()))
            .filter(|record| !record.is_expired_at(now))
    }

    /// Remaining deadline in milliseconds for one kind, `None` when it carries none.
    pub fn deadline_kind(&self, db: u8, kind: &str, key: &[u8]) -> Option<i64> {
        self.get_kind(db, kind, key).and_then(|record| record.expires_at)
    }

    /// Whether one kind of the key exists and is live.
    pub fn contains_kind(&self, db: u8, kind: &str, key: &[u8]) -> bool {
        self.get_kind(db, kind, key).is_some()
    }

    /// Inserts or replaces one kind of the key with an optional wall-clock deadline.
    pub fn set_kind(&mut self, db: u8, kind: &str, key: &[u8], value: &[u8], expires_at: Option<i64>) -> io::Result<()> {
        let record_key = (kind_namespace(db, kind), key.to_vec());
        self.commit(vec![Change::Put { key: record_key, value: value.to_vec(), expires_at }])
    }

    /// Deletes one kind of the key, reporting whether a live record was removed.
    pub fn delete_kind(&mut self, db: u8, kind: &str, key: &[u8]) -> io::Result<bool> {
        let record_key = (kind_namespace(db, kind), key.to_vec());
        let existed = self.contains_kind(db, kind, key);
        if existed {
            self.commit(vec![Change::Delete { key: record_key }])?;
        }
        Ok(existed)
    }

    /// Sets or clears the deadline of a live kind of the key.
    pub fn set_deadline_kind(&mut self, db: u8, kind: &str, key: &[u8], expires_at: Option<i64>) -> io::Result<bool> {
        let Some(record) = self.get_kind(db, kind, key).cloned() else {
            return Ok(false);
        };
        let record_key = (kind_namespace(db, kind), key.to_vec());
        self.commit(vec![Change::Put { key: record_key, value: record.value, expires_at }])?;
        Ok(true)
    }

    /// Returns the live string value for `key` in database `db`.
    pub fn get(&self, db: u8, key: &[u8]) -> Option<&Record> {
        self.get_kind(db, "", key)
    }

    /// Remaining deadline of the string kind, `None` when the key carries no deadline.
    pub fn deadline(&self, db: u8, key: &[u8]) -> Option<i64> {
        self.deadline_kind(db, "", key)
    }

    /// Whether the string kind of the key exists and is live.
    pub fn contains(&self, db: u8, key: &[u8]) -> bool {
        self.contains_kind(db, "", key)
    }

    /// Inserts or replaces the string kind with an optional wall-clock deadline.
    pub fn set(&mut self, db: u8, key: &[u8], value: &[u8], expires_at: Option<i64>) -> io::Result<()> {
        self.set_kind(db, "", key, value, expires_at)
    }

    /// Deletes the string kind, reporting whether a live record was removed.
    pub fn delete(&mut self, db: u8, key: &[u8]) -> io::Result<bool> {
        self.delete_kind(db, "", key)
    }

    /// Sets or clears the deadline of the string kind.
    pub fn set_deadline(&mut self, db: u8, key: &[u8], expires_at: Option<i64>) -> io::Result<bool> {
        self.set_deadline_kind(db, "", key, expires_at)
    }

    /// Moves `source` to `destination`, carrying its deadline. `if_absent` implements `RENAMENX`.
    pub fn rename(&mut self, db: u8, source: &[u8], destination: &[u8], if_absent: bool) -> io::Result<RenameOutcome> {
        let Some(record) = self.get(db, source).cloned() else {
            return Ok(RenameOutcome::Missing);
        };
        if if_absent && self.contains(db, destination) {
            return Ok(RenameOutcome::DestinationPresent);
        }
        let source_key = (namespace(db), source.to_vec());
        let destination_key = (namespace(db), destination.to_vec());
        self.commit(vec![
            Change::Delete { key: source_key },
            Change::Put { key: destination_key, value: record.value, expires_at: record.expires_at },
        ])?;
        Ok(RenameOutcome::Renamed)
    }

    /// Drops every live record of one database, across every value kind.
    pub fn flush_db(&mut self, db: u8) -> io::Result<()> {
        let base = namespace(db);
        let mut changes = Vec::new();
        for (key, record) in &self.records {
            if belongs_to(&key.0, &base) && !record.is_expired_at(format::now_unix_ms()) {
                changes.push(Change::Delete { key: key.clone() });
            }
        }
        if changes.is_empty() {
            return Ok(());
        }
        self.commit(changes)
    }

    /// Number of live logical keys in one database, counting each key once.
    pub fn len(&self, db: u8) -> usize {
        self.live_keys(db).len()
    }

    /// Whether the database holds no live key.
    pub fn is_empty(&self, db: u8) -> bool {
        self.len(db) == 0
    }

    /// Live logical keys of one database in ascending byte order, backing `KEYS` and `SCAN`.
    ///
    /// A logical key lives in exactly one of the string, hash and list namespaces, so
    /// the set both de-duplicates and sorts the result deterministically.
    pub fn keys(&self, db: u8) -> Vec<Vec<u8>> {
        self.live_keys(db).into_iter().collect()
    }

    fn live_keys(&self, db: u8) -> BTreeSet<Vec<u8>> {
        let base = namespace(db);
        let now = format::now_unix_ms();
        self.records
            .iter()
            .filter(|(key, record)| belongs_to(&key.0, &base) && !record.is_expired_at(now))
            .map(|(key, _)| key.1.clone())
            .collect()
    }

    /// Inserts or replaces many values with one durable commit, backing bulk loads.
    pub fn set_many(&mut self, db: u8, entries: &[(Vec<u8>, Vec<u8>)]) -> io::Result<()> {
        let namespace = namespace(db);
        let changes = entries
            .iter()
            .map(|(key, value)| Change::Put {
                key: (namespace.clone(), key.clone()),
                value: value.clone(),
                expires_at: None,
            })
            .collect();
        self.commit(changes)
    }

    /// Appends `suffix` to a live value, preserving its deadline.
    pub fn append(&mut self, db: u8, key: &[u8], suffix: &[u8]) -> io::Result<usize> {
        let mut value = self.get(db, key).map_or_else(Vec::new, |record| record.value.clone());
        value.extend_from_slice(suffix);
        let deadline = self.deadline(db, key);
        self.set(db, key, &value, deadline)?;
        Ok(value.len())
    }

    /// Adds `delta` to an integer value, preserving its deadline.
    ///
    /// The result is visible to every read on this node immediately. It reaches
    /// the shard on the next [`Node::flush`], on any other mutation, or when the
    /// node is dropped; until then the increment is memory only.
    pub fn incr_by(&mut self, db: u8, key: &[u8], delta: i64) -> io::Result<Result<i64, String>> {
        let current = match self.get(db, key) {
            None => 0,
            Some(record) => match crate::format::parse_integer(&record.value) {
                Some(value) => value,
                None => return Ok(Err("value is not an integer or out of range".to_owned())),
            },
        };
        let Some(total) = current.checked_add(delta) else {
            return Ok(Err("increment or decrement would overflow".to_owned()));
        };
        let expires_at = self.deadline(db, key);
        let revision = self.bump_revision();
        let record_namespace = namespace(db);
        let record_key = (record_namespace.clone(), key.to_vec());
        self.records.insert(
            record_key,
            Record { namespace: record_namespace, key: key.to_vec(), value: total.to_string().into_bytes(), revision, expires_at },
        );
        self.pending_increments = true;
        Ok(Ok(total))
    }

    /// Writes the shard snapshot when counter updates are buffered.
    ///
    /// Counter updates stay in memory until this call, another mutation, the
    /// node being dropped, or the process exiting cleanly. The durability
    /// boundary is therefore a completed `flush`: everything this node wrote
    /// before that point survives a crash, while increments applied since then
    /// are lost, and a reopened node reports the value as of the last flush.
    /// The snapshot itself is still written whole through a synced temporary
    /// file and an atomic rename, so a crash can never leave a torn shard.
    pub fn flush(&mut self) -> io::Result<()> {
        if !self.pending_increments {
            return Ok(());
        }
        write_durable(&self.shard_path, &encode(&self.records, self.next_revision)?)?;
        self.pending_increments = false;
        Ok(())
    }

    fn bump_revision(&mut self) -> u64 {
        let revision = self.next_revision;
        self.next_revision = self.next_revision.saturating_add(1);
        revision
    }

    fn commit(&mut self, changes: Vec<Change>) -> io::Result<()> {
        if changes.is_empty() {
            return Ok(());
        }
        let mut staged = self.records.clone();
        let mut next_revision = self.next_revision;
        for change in changes {
            match change {
                Change::Put { key, value, expires_at } => {
                    let revision = next_revision;
                    next_revision = next_revision.saturating_add(1);
                    let namespace = key.0.clone();
                    let bytes = key.1.clone();
                    staged.insert(key, Record { namespace, key: bytes, value, revision, expires_at });
                }
                Change::Delete { key } => {
                    staged.remove(&key);
                }
            }
        }
        write_durable(&self.shard_path, &encode(&staged, next_revision)?)?;
        self.records = staged;
        self.next_revision = next_revision;
        // The snapshot just written contains every buffered increment.
        self.pending_increments = false;
        Ok(())
    }
}

impl Drop for Node {
    fn drop(&mut self) {
        let _ = self.flush();
    }
}

/// Creates the shard registered by an existing catalog when its file is absent.
///
/// This is the explicit recovery entry for the `catalog.shard-file` open error:
/// a directory whose catalog survived but whose registered `.yykv` never reached
/// the disk, for example a catalog written by another tool or restored from a
/// backup that carried only `.yyds`. The catalog is validated but never rewritten,
/// and an existing shard is never overwritten, so calling this on a healthy
/// directory changes nothing. Returns the registered shard id.
pub fn repair_missing_shard(data_dir: impl AsRef<Path>) -> io::Result<String> {
    let data_dir = data_dir.as_ref().to_path_buf();
    let catalog_path = data_dir.join(CATALOG_FILE);
    let bytes = fs::read(&catalog_path).map_err(|error| {
        if error.kind() == io::ErrorKind::NotFound {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("catalog.file: `{CATALOG_FILE}` is missing; open the directory normally to create it"),
            )
        }
        else {
            error
        }
    })?;
    let shard_id = format::decode_catalog_shard_id(&bytes)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error.to_string()))?;
    let shard_path = data_dir.join(format!("{shard_id}.yykv"));
    if !shard_path.exists() {
        write_durable(&shard_path, &encode(&Records::new(), 1)?)?;
    }
    Ok(shard_id)
}

/// Reads and validates an existing `.yyds`, or `None` when the file is absent.
fn read_catalog(path: &Path) -> io::Result<Option<String>> {
    match fs::read(path) {
        Ok(bytes) => format::decode_catalog_shard_id(&bytes)
            .map(Some)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error.to_string())),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

/// Result of a `RENAME` style move.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenameOutcome {
    /// The source key exists and the move was applied.
    Renamed,
    /// The source key is absent.
    Missing,
    /// `RENAMENX` found the destination occupied.
    DestinationPresent,
}

enum Change {
    Put { key: (String, Vec<u8>), value: Vec<u8>, expires_at: Option<i64> },
    Delete { key: (String, Vec<u8>) },
}

/// Namespace label for one Redis database index.
pub fn namespace(db: u8) -> String {
    format!("{NAMESPACE_PREFIX}{db}")
}

/// Namespace label for one value kind inside a database.
///
/// The string kind keeps the database namespace so existing data needs no
/// migration, while `hash` and `list` add a suffix of their own. The three
/// namespaces never overlap, so the same logical key can only be read as one
/// kind at a time.
pub fn kind_namespace(db: u8, kind: &str) -> String {
    if kind.is_empty() {
        namespace(db)
    }
    else {
        format!("{}:{kind}", namespace(db))
    }
}

/// Whether a record namespace belongs to the database named by `base`.
///
/// Compares the whole trailing segment, so `redis:db1` never matches `redis:db11`.
fn belongs_to(candidate: &str, base: &str) -> bool {
    candidate == base || candidate.strip_prefix(base).is_some_and(|rest| rest.starts_with(':'))
}

fn encode(records: &Records, revision: u64) -> io::Result<Vec<u8>> {
    format::encode_shard(records, revision).map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error.to_string()))
}

/// Writes `bytes` to `path` through a synced temporary file and an atomic rename.
fn write_durable(path: &Path, bytes: &[u8]) -> io::Result<()> {
    use std::io::Write;
    let temporary = path.with_extension("tmp");
    {
        let mut file = fs::File::create(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }
    fs::rename(&temporary, path)?;
    Ok(())
}

/// Builds a record map for tests and imports.
pub fn records_from_entries(entries: impl IntoIterator<Item = (u8, Vec<u8>, Vec<u8>, Option<i64>)>) -> Records {
    let mut records = BTreeMap::new();
    for (index, key, value, expires_at) in entries {
        let namespace = namespace(index);
        let record = Record { namespace: namespace.clone(), key: key.clone(), value, revision: 1, expires_at };
        records.insert((namespace, key), record);
    }
    records
}
