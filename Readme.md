# Redis

A Redis-compatible server and command line client. Keys live in a single `.yykv`
shard snapshot and are registered by a `.yyds` catalog. The wire framing and both
storage codecs are native Rust; the command planner, socket loop and CLIs are
composed in JavaScript on top of those primitives.

The workspace is private. Every package is `private: true`, no package is
published, and nothing here can be installed from a registry. See
[TypeScript package](projects/redis.ts/packages/redis/readme.md) and
[Python package](projects/redis.py/packages/redis/readme.md) for the binding
notes.

## Capability

- A RESP2 / RESP3 server that accepts several TCP clients at once and executes
  their commands on one in-process store.
- 16 logical databases (`SELECT 0` through `SELECT 15`), each stored under its
  own namespace in the same shard.
- String values with absolute millisecond deadlines, counters, key renames,
  pattern listing and cursor paging, plus `MULTI` / `EXEC` / `DISCARD`.
- One `.yyds` catalog plus one `.yykv` shard per data directory; the shard is
  rewritten as a whole snapshot on every write that reaches it.
- A `redis-cli`-shaped client that supports one-shot commands, an interactive
  line mode, and `-3` for RESP3.

The Rust crates are `redis-wasm` (portable RESP and codecs, no listener),
`redis-napi` (Node-API exports) and `redis-pyo3` (the `_native` Python
extension). Neither binding owns a server loop or a process entry point.

## Supported commands

Only the commands below are implemented. Anything else answers
`ERR unsupported command`.

| Group | Commands |
| ----- | -------- |
| Connection and session | `PING` `ECHO` `QUIT` `HELLO` `SELECT` |
| Client metadata | `CLIENT SETINFO` `CLIENT SETNAME` `CLIENT GETNAME` `CLIENT ID` |
| Transactions | `MULTI` `EXEC` `DISCARD` |
| Strings | `GET` `SET` `SETNX` `SETEX` `GETSET` `GETDEL` `GETEX` `MGET` `MSET` `APPEND` `STRLEN` `TYPE` |
| Counters | `INCR` `DECR` `INCRBY` `DECRBY` |
| Keys and expiry | `DEL` `EXISTS` `EXPIRE` `PEXPIRE` `EXPIREAT` `PEXPIREAT` `PERSIST` `TTL` `PTTL` `RENAME` `RENAMENX` |
| Database inspection | `KEYS` `SCAN` `DBSIZE` `FLUSHDB` `FLUSHALL` |

Supported options are equally narrow:

- `SET` accepts `NX`, `XX`, `KEEPTTL`, `EX`, `PX`, `EXAT` and `PXAT`. It does not
  accept `GET`.
- `GETEX` accepts `PERSIST`, `EX`, `PX`, `EXAT` and `PXAT`.
- `EXPIRE` and its variants take exactly one integer argument. They do not accept
  `NX`, `XX`, `GT` or `LT`.
- `SCAN` accepts `MATCH` and `COUNT`.
- `TYPE` answers `string` for a live key and `none` for a missing one. No other
  type exists.

Every value is a string. Lists, hashes, sets, sorted sets, streams, bitmaps,
HyperLogLog, geospatial indexes and pub/sub channels are not implemented.

## Protocol

- RESP2 is the default. `HELLO 3` switches the connection to RESP3. Any other
  protocol number answers `NOPROTO unsupported protocol version`.
- `HELLO` answers a seven-pair map: `server redis`, `version 7.4.0`,
  `proto <2|3>`, `id 1`, `mode standalone`, `role master`, `modules []`. Under
  RESP2 the map is flattened into a fourteen-element array. The `7.4.0` string is
  a compatibility label, not a claim that the command surface above matches
  Redis 7.4.0.
- `HELLO` accepts only the optional protocol argument. It does not accept the
  `AUTH` or `SETNAME` clauses. `CLIENT ID` always answers `1`.
- Null replies use `$-1` under RESP2 and `_` under RESP3. Maps use `%` under
  RESP3 and a flattened array under RESP2.
- Requests must be RESP multibulk frames. A request is limited to 64 MiB and
  1,048,576 arguments. A framing violation answers
  `ERR Protocol error or request limit exceeded` and closes the connection.
- Commands are planned before they run, so `MULTI` reports a malformed command at
  queue time instead of queuing it. `EXEC` replays the valid queue in order with
  no rollback. `WATCH` and `UNWATCH` are not implemented.

## Storage backend

A data directory contains exactly two files:

| File | Role |
| ---- | ---- |
| `local-0.yyds` | Catalog: magic `YYDS\x01`, format version `0`, empty schema and routing sections, exactly one shard registration, empty contract and owner sections. |
| `local-0.yykv` | Shard: magic `YYKV\x03`, an FNV-1a checksum over the body, the next revision, and the records. |

Each record carries its namespace (`redis:db0` through `redis:db15`), opaque key
bytes, a unique revision inside the shard, a millisecond deadline (`0` means no
deadline) and an inline value. The YYDS object-plane payload (tag `1`) is never
written and is rejected on read.

The shard is a whole snapshot. Every write that reaches it clones the record
map, re-serializes the entire shard, writes a synced temporary file and renames
it over `local-0.yykv`. The catalog is written once, before the directory is
usable, and is never rewritten afterwards. The shard is written before the
catalog on a fresh directory, so a crash between the two renames reopens by
recreating the catalog around the shard that already exists.

Write amplification follows from that layout. Measured on one Windows/NTFS host
with the debug binding, one isolated `SET` at median of three:

| records in shard | single `SET` | bytes rewritten | write amplification |
| ---------------- | ------------ | --------------- | ------------------- |
| 1e3              | 8.71 ms      | 49 KB           | 848x                |
| 1e4              | 26.75 ms     | 499 KB          | 8,607x              |
| 1e5              | 205 ms       | 5.09 MB         | 87,700x             |

`Store.setMany` (TypeScript) and `Store.set_many` (Python) fold many keys into
one snapshot write. `INCR` and `INCRBY` are the exception to the write path:
they update memory only and reach the shard on `Store.flush()`, on any other
mutation, or when the handle is dropped. The server flushes when it closes. A
crash therefore loses increments applied since the last flush, and reopening
returns the value as of that flush.

A valid catalog whose registered shard is absent fails to open with
`catalog.shard-file: <id>.yykv is missing`. `repairShard(dataDir)` creates the
empty shard that the catalog registers; it never rewrites the catalog and never
overwrites an existing shard. Corrupted or truncated shard bodies, legacy
`YYKV\x02` snapshots, catalogs with `count != 1`, and catalogs carrying a
resolved contract or owners are rejected at open.

## Install and run

Prerequisites are Node.js with N-API 4/6 support, pnpm 10.18.3, a Rust toolchain
that can build edition 2024, and Python 3.12 with maturin when the Python
extension is needed.

Build the Node-API binding into the matching platform package:

```sh
pnpm install
pnpm build
```

`pnpm build` runs `cargo build -p redis-napi`, copies the artifact to
`projects/redis.ts/platforms/redis-<platform>/lib`, and compiles the TypeScript
package into `dist`. Run the server and client directly from the workspace:

```sh
node projects/redis.ts/packages/redis/bin/redis-server.mjs --port 6379 --data-dir ./data
node projects/redis.ts/packages/redis/bin/redis-cli.mjs -p 6379 SET greeting hello
node projects/redis.ts/packages/redis/bin/redis-cli.mjs -p 6379 GET greeting
node projects/redis.ts/packages/redis/bin/redis-cli.mjs -p 6379 -3 HELLO 3
```

An installed `@yydb/redis` exposes the same entry points as `redis-server` and
`redis-cli`. The server has no `SHUTDOWN` command; stop it with `SIGINT` or
`SIGTERM`, which flushes buffered increments before closing.

The Python wheel ships the `redis` package together with its compiled
`redis._native` extension, so installing the wheel is enough to import the
primitives. The package provides primitives only, with no server loop or CLI.

```sh
cd projects/redis.py/packages/redis
python -m maturin build --out dist
pip install dist/<wheel>
```

Tests and gates:

| Command | Scope |
| ------- | ----- |
| `pnpm check` | `cargo check` for the `redis.rs` workspace |
| `pnpm test` | Rust tests for the `redis.rs` workspace |
| `pnpm test:ts` | Installed-state TypeScript acceptance |
| `pnpm test:py` | Builds the wheel, installs it in a scratch environment, runs pytest |
| `pnpm gate:test-count:ts` | The TypeScript suite with the 593-case floor |
| `pnpm gate:test-count:py` | The Python suite with the 431-case floor |
| `pnpm gate:install:ts` | Packs the tarballs, installs them in a scratch directory, imports the entry from a plain `node` process and performs a real write and read |
| `pnpm gate:install:py` | Builds the wheel, installs it in a clean virtual environment and performs a real write and read |
| `pnpm gate:oracle` | Independent recomputation of the wire and layout bytes |
| `pnpm gate:conformance:compare <ts-report> <py-report>` | Compares the TypeScript and Python reports for the shared case tables |

## Known limits

- **String-only surface.** There is no list, hash, set, sorted set, stream,
  bitmap, HyperLogLog or geospatial type, and no `TYPE` value other than
  `string` or `none`.
- **Small command set.** The table above is complete. There is no `WATCH`,
  `PUBLISH` / `SUBSCRIBE`, scripting, ACL, `AUTH`, `INFO`, `CONFIG`, `COMMAND`,
  `DEBUG`, `SAVE` / `BGSAVE`, `SHUTDOWN`, cluster, Sentinel or replication
  command.
- **Option gaps.** `SET` cannot take `GET`; `EXPIRE` cannot take `NX` / `XX` /
  `GT` / `LT`; `HELLO` cannot take `AUTH` / `SETNAME`; `CLIENT` supports only the
  four subcommands listed above.
- **Narrow glob.** `KEYS` matches only `*`, `?` and literal bytes. Character
  classes and escapes are not supported.
- **Cursor semantics.** `SCAN` treats the cursor as a position in the current
  ascending key list and pages from there. It is not an opaque Redis cursor, and
  a keyspace change between calls can skip or repeat keys.
- **No active expiry.** Expiry is evaluated on read. The snapshot never sweeps
  expired records: `DEL` reports `0` for an already-expired key, and
  `FLUSHDB` / `FLUSHALL` skip expired records, so those records stay in the
  `.yykv` file until the same key is overwritten.
- **No eviction.** There is no `maxmemory` policy and no background reclamation.
- **One shard, one process.** The catalog accepts exactly one shard
  registration. There is no partitioning, multi-shard routing, replication,
  cluster or Sentinel. The data directory has no inter-process lock, so two
  server processes must not share it.
- **No sidecar state.** Everything is carried by the two documented files; any
  extra index file would be stale.
- **Buffered counters.** An unflushed `INCR` is lost on a crash. Only a completed
  flush, another mutation, or a clean close makes it durable.
- **UTF-8 composition layer.** The TypeScript `Store.get` returns a UTF-8
  string, so a non-UTF-8 value such as `00 ff 01` comes back from `GET` as
  `00 ef bf bd 01`. The Node-API `Store` exported by the platform binding and
  the Python binding are byte-oriented.
- **No working WebAssembly build.** `@yydb/redis-unknown-wasm32` is a placeholder
  package; there is no built `lib` and no wasm-bindgen entry, and the loader does
  not map wasm.
- **Request caps.** 64 MiB and 1,048,576 arguments per request. Larger requests
  are rejected and the connection is closed.
- **HyperLogLog encoding (`oracle-limitation`).** `PFADD` always writes the dense
  12304-byte representation, while real Redis keeps a small cardinality in the
  sparse form (its `STRLEN` is 27 bytes for four distinct values and grows with
  the registers). Cardinality estimates and `PFMERGE` semantics match the real
  server, so only the stored byte layout differs.

## Format ownership

Redis implements its own `.yyds` and `.yykv` codecs in
`projects/redis.rs/redis-wasm/src/format.rs` and does not depend on the family's
`database-formats` crate. It writes the v3 shard shape and the v0 catalog shape
described above, but reads deliberately less than the shared codec accepts:
inline values only, exactly one shard, and no resolved contract or owner
sections. This document records the current behavior only and promises no wider
interchange; the relationship between this codec and the shared format contract
is not settled here.

## License

MPL-2.0. See [License.md](License.md).
