//! `.yykv` shard ownership: one shard file holds every Redis database index as
//! its own namespace.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::format::{self, Key, Record, Records};

/// How many logical databases the service exposes, matching the Redis default.
pub const DATABASES: u8 = 16;
/// File name of the shard snapshot inside the data directory.
pub const SHARD_FILE: &str = "local-0.yykv";
/// File name of the catalog inside the data directory.
pub const CATALOG_FILE: &str = "local-0.yyds";
/// Namespace prefix carrying the logical database index.
pub const NAMESPACE_PREFIX: &str = "redis:db";
/// Value kinds of one logical key, in probe order.
///
/// The string kind keeps the database namespace so existing data needs no
/// migration, while every other kind adds a suffix of its own. The namespaces
/// never overlap, so the same logical key can only be read as one kind at a time.
pub const KINDS: [&str; 6] = ["", "hash", "list", "set", "zset", "stream"];

/// One `.yyds` catalog plus one `.yykv` shard on disk.
///
/// The `.yykv` snapshot carries one checksum over its whole body and a record
/// count in front of the records, so rewriting any single record means
/// re-serializing the entire shard. A commit therefore mutates the record map in
/// place and serializes that same map, instead of rebuilding a second copy.
/// Counter updates accumulate in memory and reach the file on [`Node::flush`],
/// on any other mutation, or when the node is dropped. See [`Node::flush`] for
/// the durability boundary.
///
/// [`Node::begin_batch`] and [`Node::end_batch`] bracket a burst of commands
/// that share one socket read: every mutation inside the burst is applied to
/// memory immediately, while the shard is encoded once when the outermost batch
/// closes. Reads always observe the latest state, so ordering inside the burst
/// does not change.
#[derive(Debug)]
pub struct Node {
    data_dir: PathBuf,
    shard_path: PathBuf,
    records: Records,
    next_revision: u64,
    pending_increments: bool,
    /// Set when a mutation happened inside a batch and has not reached the file.
    dirty: bool,
    /// Nesting depth of open batches; zero means every mutation writes through.
    batch_depth: u32,
    /// Whether every snapshot write is followed by `fsync`.
    ///
    /// `false` is the `everysec` policy: the snapshot reaches the file system on
    /// every write, while the periodic [`Node::sync`] call flushes it to stable
    /// storage, so a power loss can drop at most the writes since the previous
    /// sync. A process crash still loses nothing, because the file already holds
    /// the data in the page cache.
    sync_always: bool,
    /// Set when the last snapshot write did not sync.
    unsynced: bool,
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
            format::decode_shard(&bytes)
                .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error.to_string()))?
        } else if registered.is_some() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("catalog.shard-file: `{shard_id}.yykv` is missing"),
            ));
        } else {
            let records = Records::new();
            write_durable(&shard_path, &encode(&records, 1)?, true)?;
            (records, 1)
        };
        if registered.is_none() {
            write_durable(&catalog_path, &format::encode_catalog("local-0"), true)?;
        }
        Ok(Self {
            data_dir,
            shard_path,
            records,
            next_revision: next_revision.max(1),
            pending_increments: false,
            dirty: false,
            batch_depth: 0,
            sync_always: false,
            unsynced: false,
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
            .get(&kind_key(db, kind, key))
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
    pub fn set_kind(
        &mut self,
        db: u8,
        kind: &str,
        key: &[u8],
        value: &[u8],
        expires_at: Option<i64>,
    ) -> io::Result<()> {
        self.commit(vec![Change::Put {
            key: kind_key(db, kind, key),
            value: value.to_vec(),
            expires_at,
        }])
    }

    /// Inserts or replaces one kind and returns the revision assigned to the record.
    pub fn set_kind_revision(
        &mut self,
        db: u8,
        kind: &str,
        key: &[u8],
        value: &[u8],
        expires_at: Option<i64>,
    ) -> io::Result<u64> {
        let revision = self.next_revision;
        self.set_kind(db, kind, key, value, expires_at)?;
        Ok(revision)
    }

    /// Deletes one kind of the key, reporting whether a live record was removed.
    pub fn delete_kind(&mut self, db: u8, kind: &str, key: &[u8]) -> io::Result<bool> {
        let existed = self.contains_kind(db, kind, key);
        if existed {
            self.commit(vec![Change::Delete {
                key: kind_key(db, kind, key),
            }])?;
        }
        Ok(existed)
    }

    /// Sets or clears the deadline of a live kind of the key.
    pub fn set_deadline_kind(&mut self, db: u8, kind: &str, key: &[u8], expires_at: Option<i64>) -> io::Result<bool> {
        let Some(record) = self.get_kind(db, kind, key) else {
            return Ok(false);
        };
        let value = format::record_bytes(record).to_vec();
        self.commit(vec![Change::Put {
            key: kind_key(db, kind, key),
            value,
            expires_at,
        }])?;
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

    /// Kind currently holding `key`, or `None` when every kind namespace is empty.
    ///
    /// Only one representation of a logical key is ever live, so the first hit
    /// in [`KINDS`] probe order is the whole answer.
    pub fn find_kind(&self, db: u8, key: &[u8]) -> Option<&'static str> {
        KINDS.into_iter().find(|kind| self.contains_kind(db, *kind, key))
    }

    /// Moves `source` to `destination`, carrying its value kind and deadline.
    ///
    /// Any other kind already stored under `destination` is dropped first, so
    /// the destination ends up with exactly one representation. `if_absent`
    /// implements `RENAMENX`.
    pub fn rename(&mut self, db: u8, source: &[u8], destination: &[u8], if_absent: bool) -> io::Result<RenameOutcome> {
        let Some(source_kind) = self.find_kind(db, source) else {
            return Ok(RenameOutcome::Missing);
        };
        if source == destination {
            return Ok(if if_absent {
                RenameOutcome::DestinationPresent
            } else {
                RenameOutcome::Renamed
            });
        }
        if if_absent && self.find_kind(db, destination).is_some() {
            return Ok(RenameOutcome::DestinationPresent);
        }
        let Some(record) = self.get_kind(db, source_kind, source) else {
            return Ok(RenameOutcome::Missing);
        };
        let value = format::record_bytes(record).to_vec();
        let expires_at = record.expires_at;
        let mut changes = KINDS
            .into_iter()
            .map(|kind| Change::Delete {
                key: kind_key(db, kind, destination),
            })
            .collect::<Vec<_>>();
        changes.push(Change::Delete {
            key: kind_key(db, source_kind, source),
        });
        changes.push(Change::Put {
            key: kind_key(db, source_kind, destination),
            value,
            expires_at,
        });
        self.commit(changes)?;
        Ok(RenameOutcome::Renamed)
    }

    /// Drops every live record of one database, across every value kind.
    pub fn flush_db(&mut self, db: u8) -> io::Result<()> {
        let base = namespace(db);
        let mut changes = Vec::new();
        for (key, record) in &self.records {
            if belongs_to(&key.namespace.0, &base) && !record.is_expired_at(format::now_unix_ms()) {
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
    /// A logical key lives in exactly one of the five kind namespaces, so the
    /// set both de-duplicates and sorts the result deterministically.
    pub fn keys(&self, db: u8) -> Vec<Vec<u8>> {
        self.live_keys(db).into_iter().collect()
    }

    fn live_keys(&self, db: u8) -> BTreeSet<Vec<u8>> {
        let base = namespace(db);
        let now = format::now_unix_ms();
        self.records
            .iter()
            .filter(|(key, record)| belongs_to(&key.namespace.0, &base) && !record.is_expired_at(now))
            .map(|(key, _)| key.bytes.clone())
            .collect()
    }

    /// Inserts or replaces many values with one durable commit, backing bulk loads.
    pub fn set_many(&mut self, db: u8, entries: &[(Vec<u8>, Vec<u8>)]) -> io::Result<()> {
        let base = namespace(db);
        let changes = entries
            .iter()
            .map(|(key, value)| Change::Put {
                key: Key::new(base.clone(), key.clone()),
                value: value.clone(),
                expires_at: None,
            })
            .collect();
        self.commit(changes)
    }

    /// Appends `suffix` to a live value, preserving its deadline.
    pub fn append(&mut self, db: u8, key: &[u8], suffix: &[u8]) -> io::Result<usize> {
        let mut value = self
            .get(db, key)
            .map_or_else(Vec::new, |record| format::record_bytes(record).to_vec());
        value.extend_from_slice(suffix);
        let deadline = self.deadline(db, key);
        self.set(db, key, &value, deadline)?;
        Ok(value.len())
    }

    /// Removes every record whose deadline elapsed at `now_unix_ms`.
    ///
    /// Returns how many distinct logical keys expired. A record that is already
    /// past its deadline is hidden from reads but still occupies the shard, so
    /// the sweep deletes exactly those records rather than probing the keyspace
    /// key by key. Removing them is one ordinary snapshot commit, which means a
    /// pass with nothing to drop never touches the file.
    pub fn sweep_expired(&mut self, now_unix_ms: i64) -> io::Result<usize> {
        let mut expired = BTreeSet::new();
        let mut changes = Vec::new();
        for (key, record) in &self.records {
            if record.is_expired_at(now_unix_ms) {
                expired.insert((logical_namespace(&key.namespace.0), key.bytes.clone()));
                changes.push(Change::Delete { key: key.clone() });
            }
        }
        if changes.is_empty() {
            return Ok(0);
        }
        self.commit(changes)?;
        Ok(expired.len())
    }

    /// Adds `delta` to an integer value, preserving its deadline.
    ///
    /// The result is visible to every read on this node immediately. It reaches
    /// the shard on the next [`Node::flush`], on any other mutation, or when the
    /// node is dropped; until then the increment is memory only.
    pub fn incr_by(&mut self, db: u8, key: &[u8], delta: i64) -> io::Result<Result<i64, String>> {
        let current = match self.get(db, key) {
            None => 0,
            Some(record) => match crate::format::parse_integer(format::record_bytes(record)) {
                Some(value) => value,
                None => return Ok(Err("value is not an integer or out of range".to_owned())),
            },
        };
        let Some(total) = current.checked_add(delta) else {
            return Ok(Err("increment or decrement would overflow".to_owned()));
        };
        let expires_at = self.deadline(db, key);
        let revision = self.bump_revision();
        let record_key = Key::new(namespace(db), key.to_vec());
        self.records.insert(
            record_key.clone(),
            format::inline_record(record_key, total.to_string().into_bytes(), revision, expires_at),
        );
        self.pending_increments = true;
        Ok(Ok(total))
    }

    /// Opens one batch of mutations that share a single persistence pass.
    ///
    /// Calls nest. Every mutation inside the outermost batch is applied to
    /// memory immediately, and the shard is encoded once when the outermost
    /// batch closes. A read never waits for the file, so command ordering inside
    /// the batch is preserved.
    pub fn begin_batch(&mut self) {
        self.batch_depth = self.batch_depth.saturating_add(1);
    }

    /// Closes one batch and, at the outermost depth, writes any pending state.
    pub fn end_batch(&mut self) -> io::Result<()> {
        if self.batch_depth > 0 {
            self.batch_depth -= 1;
        }
        if self.batch_depth == 0 {
            self.flush()?;
        }
        Ok(())
    }

    /// Selects whether every snapshot write is followed by `fsync`.
    ///
    /// `true` is the `always` policy. `false` is `everysec`: the snapshot still
    /// reaches the file system on every write, while [`Node::sync`] is what makes
    /// it stable against a power loss.
    pub fn set_sync_always(&mut self, always: bool) {
        self.sync_always = always;
    }

    /// Flushes an unsynced snapshot to stable storage.
    ///
    /// Under `everysec` the host calls this on its periodic timer, on `SAVE` /
    /// `BGSAVE`, and when the server closes. A no-op when the last write already
    /// synced.
    pub fn sync(&mut self) -> io::Result<()> {
        if !self.unsynced {
            return Ok(());
        }
        let file = fs::OpenOptions::new().write(true).open(&self.shard_path)?;
        file.sync_all()?;
        self.unsynced = false;
        Ok(())
    }

    /// Writes the shard snapshot when counter or batched updates are buffered.
    ///
    /// Counter updates stay in memory until this call, another mutation, the
    /// node being dropped, or the process exiting cleanly. The durability
    /// boundary is therefore a completed `flush`: everything this node wrote
    /// before that point survives a crash, while increments applied since then
    /// are lost, and a reopened node reports the value as of the last flush.
    /// The snapshot itself is still written whole through a temporary file and
    /// an atomic rename, so a crash can never leave a torn shard.
    pub fn flush(&mut self) -> io::Result<()> {
        if !self.pending_increments && !self.dirty {
            return Ok(());
        }
        write_durable(
            &self.shard_path,
            &encode(&self.records, self.next_revision)?,
            self.sync_always,
        )?;
        self.pending_increments = false;
        self.dirty = false;
        self.unsynced = !self.sync_always;
        Ok(())
    }

    fn bump_revision(&mut self) -> u64 {
        let revision = self.next_revision;
        self.next_revision = self.next_revision.saturating_add(1);
        revision
    }

    /// Applies `changes` to the live map and then writes the snapshot.
    ///
    /// The map is mutated in place; only the touched records are remembered so a
    /// failed encode or write can put the previous entries back. This avoids the
    /// full deep copy the previous implementation took on every commit. Inside
    /// an open batch the write is deferred to [`Node::end_batch`], which encodes
    /// the whole burst once.
    fn commit(&mut self, changes: Vec<Change>) -> io::Result<()> {
        if changes.is_empty() {
            return Ok(());
        }
        // A negative deadline is a caller bug and must fail before any mutation.
        if changes
            .iter()
            .any(|change| matches!(change, Change::Put { expires_at: Some(deadline), .. } if *deadline < 0))
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "expiry deadline must not be negative",
            ));
        }
        let mut previous = Vec::with_capacity(changes.len());
        let mut next_revision = self.next_revision;
        for change in changes {
            match change {
                Change::Put { key, value, expires_at } => {
                    let revision = next_revision;
                    next_revision = next_revision.saturating_add(1);
                    let record = format::inline_record(key.clone(), value, revision, expires_at);
                    previous.push((key.clone(), self.records.insert(key, record)));
                }
                Change::Delete { key } => {
                    previous.push((key.clone(), self.records.remove(&key)));
                }
            }
        }
        if self.batch_depth > 0 {
            self.next_revision = next_revision;
            self.pending_increments = false;
            self.dirty = true;
            return Ok(());
        }
        let encoded = match encode(&self.records, next_revision) {
            Ok(bytes) => bytes,
            Err(error) => {
                restore(&mut self.records, previous);
                return Err(error);
            }
        };
        if let Err(error) = write_durable(&self.shard_path, &encoded, self.sync_always) {
            restore(&mut self.records, previous);
            return Err(error);
        }
        self.next_revision = next_revision;
        // The snapshot just written contains every buffered increment.
        self.pending_increments = false;
        self.dirty = false;
        self.unsynced = !self.sync_always;
        Ok(())
    }
}

impl Drop for Node {
    fn drop(&mut self) {
        let _ = self.flush();
        let _ = self.sync();
    }
}

/// Puts the entries captured before a failed commit back, newest change first.
fn restore(records: &mut Records, previous: Vec<(Key, Option<Record>)>) {
    for (key, record) in previous.into_iter().rev() {
        match record {
            Some(record) => {
                records.insert(key, record);
            }
            None => {
                records.remove(&key);
            }
        }
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
        } else {
            error
        }
    })?;
    let shard_id = format::decode_catalog_shard_id(&bytes)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error.to_string()))?;
    let shard_path = data_dir.join(format!("{shard_id}.yykv"));
    if !shard_path.exists() {
        write_durable(&shard_path, &encode(&Records::new(), 1)?, true)?;
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
    Put {
        key: Key,
        value: Vec<u8>,
        expires_at: Option<i64>,
    },
    Delete {
        key: Key,
    },
}

/// Namespace label for one Redis database index.
pub fn namespace(db: u8) -> String {
    format!("{NAMESPACE_PREFIX}{db}")
}

/// Namespace label for one value kind inside a database.
///
/// The string kind keeps the database namespace so existing data needs no
/// migration, while `hash`, `list`, `set`, `zset` and `stream` add a suffix of
/// their own. The six namespaces never overlap, so the same logical key can only
/// be read as one kind at a time.
pub fn kind_namespace(db: u8, kind: &str) -> String {
    if kind.is_empty() {
        namespace(db)
    } else {
        format!("{}:{kind}", namespace(db))
    }
}

/// Shard key of one kind of a logical key.
fn kind_key(db: u8, kind: &str, key: &[u8]) -> Key {
    Key::new(kind_namespace(db, kind), key.to_vec())
}

/// Database namespace behind a record namespace, dropping any kind suffix.
fn logical_namespace(candidate: &str) -> String {
    if let Some(rest) = candidate.strip_prefix(NAMESPACE_PREFIX) {
        if let Some(index) = rest.find(':') {
            return format!("{NAMESPACE_PREFIX}{}", &rest[..index]);
        }
    }
    candidate.to_owned()
}

/// Whether a record namespace belongs to the database named by `base`.
///
/// Compares the whole trailing segment, so `redis:db1` never matches `redis:db11`.
fn belongs_to(candidate: &str, base: &str) -> bool {
    candidate == base || candidate.strip_prefix(base).is_some_and(|rest| rest.starts_with(':'))
}

fn encode(records: &Records, revision: u64) -> io::Result<Vec<u8>> {
    format::encode_shard(records, revision)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error.to_string()))
}

/// Writes `bytes` to `path` through a synced temporary file and an atomic rename.
fn write_durable(path: &Path, bytes: &[u8], sync: bool) -> io::Result<()> {
    use std::io::Write;
    let temporary = path.with_extension("tmp");
    {
        let mut file = fs::File::create(&temporary)?;
        file.write_all(bytes)?;
        if sync {
            file.sync_all()?;
        }
    }
    fs::rename(&temporary, path)?;
    Ok(())
}

/// Builds a record map for tests and imports.
pub fn records_from_entries(entries: impl IntoIterator<Item = (u8, Vec<u8>, Vec<u8>, Option<i64>)>) -> Records {
    let mut records = BTreeMap::new();
    for (index, key, value, expires_at) in entries {
        let record_key = Key::new(namespace(index), key);
        records.insert(
            record_key.clone(),
            format::inline_record(record_key, value, 1, expires_at),
        );
    }
    records
}
