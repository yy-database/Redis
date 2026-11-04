//! `.yykv` shard ownership: one shard file holds every Redis database index as
//! its own namespace.

use std::collections::BTreeMap;
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
#[derive(Debug)]
pub struct Node {
    data_dir: PathBuf,
    shard_path: PathBuf,
    records: Records,
    next_revision: u64,
}

impl Node {
    /// Opens the storage directory, creating the catalog and an empty shard when absent.
    pub fn open(data_dir: impl AsRef<Path>) -> io::Result<Self> {
        let data_dir = data_dir.as_ref().to_path_buf();
        fs::create_dir_all(&data_dir)?;
        let shard_path = data_dir.join(SHARD_FILE);
        let catalog_path = data_dir.join(CATALOG_FILE);
        if !catalog_path.exists() {
            write_durable(&catalog_path, &format::encode_catalog("local-0"))?;
        }
        let (records, next_revision) = if shard_path.exists() {
            let bytes = fs::read(&shard_path)?;
            format::decode_shard(&bytes).map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error.to_string()))?
        }
        else {
            let records = Records::new();
            write_durable(&shard_path, &encode(&records, 1)?)?;
            (records, 1)
        };
        Ok(Self { data_dir, shard_path, records, next_revision: next_revision.max(1) })
    }

    /// Directory holding the catalog and the shard.
    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    /// Backing `.yykv` path.
    pub fn shard_path(&self) -> &Path {
        &self.shard_path
    }

    /// Returns the live value for `key` in database `db`.
    pub fn get(&self, db: u8, key: &[u8]) -> Option<&Record> {
        let now = format::now_unix_ms();
        self.records
            .get(&(namespace(db), key.to_vec()))
            .filter(|record| !record.is_expired_at(now))
    }

    /// Remaining deadline in milliseconds, `None` when the key carries no deadline.
    pub fn deadline(&self, db: u8, key: &[u8]) -> Option<i64> {
        self.get(db, key).and_then(|record| record.expires_at)
    }

    /// Whether the key exists and is live.
    pub fn contains(&self, db: u8, key: &[u8]) -> bool {
        self.get(db, key).is_some()
    }

    /// Inserts or replaces a value with an optional wall-clock deadline.
    pub fn set(&mut self, db: u8, key: &[u8], value: &[u8], expires_at: Option<i64>) -> io::Result<()> {
        let record_key = (namespace(db), key.to_vec());
        self.commit(vec![Change::Put { key: record_key, value: value.to_vec(), expires_at }])
    }

    /// Deletes one key, reporting whether a live record was removed.
    pub fn delete(&mut self, db: u8, key: &[u8]) -> io::Result<bool> {
        let record_key = (namespace(db), key.to_vec());
        let existed = self.contains(db, key);
        if existed {
            self.commit(vec![Change::Delete { key: record_key }])?;
        }
        Ok(existed)
    }

    /// Sets or clears the deadline of a live key.
    pub fn set_deadline(&mut self, db: u8, key: &[u8], expires_at: Option<i64>) -> io::Result<bool> {
        let Some(record) = self.get(db, key).cloned() else {
            return Ok(false);
        };
        let record_key = (namespace(db), key.to_vec());
        self.commit(vec![Change::Put { key: record_key, value: record.value, expires_at }])?;
        Ok(true)
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

    /// Drops every live record of one database.
    pub fn flush_db(&mut self, db: u8) -> io::Result<()> {
        let prefix = namespace(db);
        let mut changes = Vec::new();
        for (key, record) in &self.records {
            if key.0 == prefix && !record.is_expired_at(format::now_unix_ms()) {
                changes.push(Change::Delete { key: key.clone() });
            }
        }
        if changes.is_empty() {
            return Ok(());
        }
        self.commit(changes)
    }

    /// Number of live keys in one database.
    pub fn len(&self, db: u8) -> usize {
        let prefix = namespace(db);
        let now = format::now_unix_ms();
        self.records
            .iter()
            .filter(|(key, record)| key.0 == prefix && !record.is_expired_at(now))
            .count()
    }

    /// Whether the database holds no live key.
    pub fn is_empty(&self, db: u8) -> bool {
        self.len(db) == 0
    }

    /// Live keys of one database in ascending byte order, backing `KEYS` and `SCAN`.
    pub fn keys(&self, db: u8) -> Vec<Vec<u8>> {
        let prefix = namespace(db);
        let now = format::now_unix_ms();
        self.records
            .iter()
            .filter(|(key, record)| key.0 == prefix && !record.is_expired_at(now))
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
        let deadline = self.deadline(db, key);
        self.set(db, key, total.to_string().as_bytes(), deadline)?;
        Ok(Ok(total))
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
        let mut staged = self.clone();
        for change in changes {
            match change {
                Change::Put { key, value, expires_at } => {
                    let revision = staged.bump_revision();
                    let namespace = key.0.clone();
                    let bytes = key.1.clone();
                    staged.records.insert(key, Record { namespace, key: bytes, value, revision, expires_at });
                }
                Change::Delete { key } => {
                    staged.records.remove(&key);
                }
            }
        }
        write_durable(&staged.shard_path, &encode(&staged.records, staged.next_revision)?)?;
        self.records = staged.records;
        self.next_revision = staged.next_revision;
        Ok(())
    }
}

impl Clone for Node {
    fn clone(&self) -> Self {
        Self {
            data_dir: self.data_dir.clone(),
            shard_path: self.shard_path.clone(),
            records: self.records.clone(),
            next_revision: self.next_revision,
        }
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
