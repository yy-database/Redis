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
- String, hash, list, set, sorted set and stream values, with absolute
  millisecond deadlines, counters, key renames, pattern listing and cursor
  paging, plus `MULTI` / `EXEC` / `DISCARD`.
- Bitmap and bitfield commands, HyperLogLog, pub/sub, blocking list and sorted
  set commands, and `SORT`.
- One `.yyds` catalog plus one `.yykv` shard per data directory; the shard is
  rewritten as a whole snapshot on every write that reaches it.
- A `redis-cli`-shaped client that supports one-shot commands, an interactive
  line mode, and `-3` for RESP3.

The Rust crates are `redis-wasm` (portable RESP and codecs, no listener),
`redis-napi` (Node-API exports) and `redis-pyo3` (the `_native` Python
extension). Neither binding owns a server loop or a process entry point.

## Supported commands

The command surface below is complete. Anything else answers
`ERR unknown command '<name>'`, followed by `with args beginning with: ...` when
arguments were sent.

| Group | Commands |
| ----- | -------- |
| Connection and session | `PING` `ECHO` `QUIT` `HELLO` `SELECT` `RESET` `AUTH` |
| Client metadata | `CLIENT SETINFO` `CLIENT SETNAME` `CLIENT GETNAME` `CLIENT ID` `CLIENT LIST` `CLIENT INFO` `CLIENT NO-EVICT` `CLIENT NO-TOUCH` `CLIENT UNPAUSE` `CLIENT KILL` |
| Server introspection | `COMMAND` `COMMAND COUNT` `COMMAND INFO` `COMMAND DOCS` `INFO` `CONFIG GET` `CONFIG SET` `ACL WHOAMI` `ACL LIST` `ACL CAT` `ACL GETUSER` |
| Transactions | `MULTI` `EXEC` `DISCARD` `WATCH` `UNWATCH` |
| Strings and bitmaps | `GET` `SET` `SETNX` `SETEX` `PSETEX` `GETSET` `GETDEL` `GETEX` `MGET` `MSET` `APPEND` `STRLEN` `GETRANGE` `SETRANGE` `INCR` `DECR` `INCRBY` `DECRBY` `INCRBYFLOAT` `SETBIT` `GETBIT` `BITCOUNT` `BITPOS` `BITFIELD` `BITFIELD_RO` `DEL` `UNLINK` |
| Keys and expiry | `EXISTS` `TYPE` `EXPIRE` `PEXPIRE` `EXPIREAT` `PEXPIREAT` `EXPIRETIME` `PEXPIRETIME` `PERSIST` `TTL` `PTTL` `RENAME` `RENAMENX` `COPY` `MOVE` `RANDOMKEY` |
| Database inspection | `KEYS` `SCAN` `DBSIZE` `FLUSHDB` `FLUSHALL` `SWAPDB` `OBJECT` |
| Hashes | `HSET` `HSETNX` `HGET` `HGETALL` `HDEL` `HLEN` `HKEYS` `HVALS` `HEXISTS` `HINCRBY` `HINCRBYFLOAT` `HRANDFIELD` `HSCAN` |
| Lists | `LPUSH` `RPUSH` `LPOP` `RPOP` `LRANGE` `LINDEX` `LLEN` `LINSERT` `LSET` `LTRIM` `LREM` `LPOS` `RPOPLPUSH` `LMOVE` `LMPOP` |
| Sets | `SADD` `SREM` `SMEMBERS` `SCARD` `SISMEMBER` `SMISMEMBER` `SMOVE` `SRANDMEMBER` `SPOP` `SSCAN` `SINTER` `SUNION` `SDIFF` `SINTERSTORE` `SUNIONSTORE` `SDIFFSTORE` `SINTERCARD` |
| Sorted sets | `ZADD` `ZINCRBY` `ZCARD` `ZCOUNT` `ZLEXCOUNT` `ZRANGE` `ZREVRANGE` `ZRANGEBYSCORE` `ZREVRANGEBYSCORE` `ZRANGEBYLEX` `ZREVRANGEBYLEX` `ZRANGESTORE` `ZRANK` `ZREVRANK` `ZSCORE` `ZMSCORE` `ZREM` `ZREMRANGEBYRANK` `ZREMRANGEBYSCORE` `ZREMRANGEBYLEX` `ZPOPMIN` `ZPOPMAX` `ZRANDMEMBER` `ZSCAN` `ZUNIONSTORE` `ZINTERSTORE` `ZDIFFSTORE` `ZUNION` `ZINTER` `ZDIFF` `ZINTERCARD` `ZMPOP` |
| Streams | `XADD` `XLEN` `XRANGE` `XREVRANGE` `XDEL` `XTRIM` `XREAD` `XREADGROUP` `XGROUP` `XACK` `XPENDING` `XCLAIM` `XAUTOCLAIM` `XINFO` |
| HyperLogLog | `PFADD` `PFCOUNT` `PFMERGE` |
| Pub/sub | `SUBSCRIBE` `UNSUBSCRIBE` `PSUBSCRIBE` `PUNSUBSCRIBE` `PUBLISH` `PUBSUB CHANNELS` `PUBSUB NUMSUB` `PUBSUB NUMPAT` |
| Blocking | `BLPOP` `BRPOP` `BLMOVE` `BRPOPLPUSH` `BLMPOP` `BZPOPMIN` `BZPOPMAX` `BZMPOP` |
| Sorting | `SORT` `SORT_RO` |
| Persistence | `SAVE` `BGSAVE` `LASTSAVE` `BGREWRITEAOF` `SHUTDOWN` |
| Latency and memory | `WAIT` `LATENCY` `SLOWLOG` `MEMORY` |

Supported options are narrower than the real server:

- `SET` accepts `NX`, `XX`, `KEEPTTL`, `EX`, `PX`, `EXAT` and `PXAT`, plus `GET`
  for the previous value.
- `GETEX` accepts `PERSIST`, `EX`, `PX`, `EXAT` and `PXAT`.
- `EXPIRE` and its variants accept `NX`, `XX`, `GT` and `LT`.
- `SCAN` accepts `MATCH` and `COUNT`.
- `QUIT` accepts any extra arguments, answers `OK` and closes the connection.
- `CONFIG SET` accepts the facade's option table plus `requirepass`,
  `notify-keyspace-events`, `appendfsync`, `slowlog-log-slower-than` and
  `slowlog-max-len`, which the host applies to the running server. Everything
  outside that table answers
  `ERR Unknown option or number of arguments for CONFIG SET - '<name>'`.
- `CONFIG GET` reports `requirepass` (as an empty string when unset),
  `notify-keyspace-events`, `appendfsync` and the two slow log knobs alongside
  the facade's options.
- Blocking commands wait inside the planner while the facade serves their
  non-blocking form.
- `TYPE` reports `string`, `hash`, `list`, `set`, `zset`, `stream` or `none`.

## Protocol

- RESP2 is the default. `HELLO 3` switches the connection to RESP3. Any other
  protocol number answers `NOPROTO unsupported protocol version`.
- `HELLO` answers a seven-pair map: `server redis`, `version 7.4.0`,
  `proto <2|3>`, `id <connection id>`, `mode standalone`, `role master`, `modules []`. Under
  RESP2 the map is flattened into a fourteen-element array. The `7.4.0` string is
  a compatibility label, not a claim that the command surface above matches
  Redis 7.4.0.
- `HELLO` accepts an optional protocol version followed by optional `AUTH
  <username> <password>` and `SETNAME <name>` clauses. The `AUTH` clause
  authenticates the connection, and `SETNAME` is also reported by `CLIENT
  GETNAME`.
- `CLIENT ID` answers the connection's own id, which increases per connection;
  `HELLO` reports the same id.
- Null replies use `$-1` under RESP2 and `_` under RESP3. Maps use `%` under
  RESP3 and a flattened array under RESP2.
- Requests must be RESP multibulk frames. A request is limited to 64 MiB and
  1,048,576 arguments. A framing violation answers
  `ERR Protocol error or request limit exceeded` and closes the connection.
- Commands are planned before they run, so `MULTI` reports a malformed command at
  queue time instead of queuing it. A rejected queued command poisons the
  transaction: `EXEC` answers `EXECABORT` and drops the whole queue. Otherwise
  `EXEC` replays the valid queue in order with no rollback.
- `WATCH` pins the mutation version of each named key for its connection. If any
  pinned key is written or expires before `EXEC`, the transaction is abandoned
  with a null array and the queue is dropped. `UNWATCH`, `DISCARD` and every
  `EXEC` release the pins. `WATCH` inside `MULTI` is rejected without touching
  the existing pins.
- `AUTH` checks the single default user. Until it succeeds, every command except
  `AUTH`, `HELLO`, `QUIT` and `RESET` answers `NOAUTH Authentication required.`.
  `CONFIG SET requirepass <password>` changes the password of the running server
  and an empty value removes it; connections opened later must authenticate,
  while connections already authenticated stay authorized.
  A bad password answers
  `WRONGPASS invalid username-password pair or user is disabled.`. When no
  password is configured the legacy single-argument form reports that, while
  `AUTH default <anything>` succeeds because the default user is `nopass`.
- With `--notify-keyspace-events` set, an expiry sweep publishes `expired` on
  `__keyspace@<db>__:<key>` and `__keyevent@<db>__:expired` when `K` / `E` and
  `x` (or `A`) are selected. `CONFIG SET notify-keyspace-events <flags>` changes
  the same flags on the running listener. No other event class is emitted yet.
- An empty multibulk request (`*0`) is ignored: it produces no reply and leaves
  the connection open.

## Storage backend

A data directory contains exactly two data files:

| File | Role |
| ---- | ---- |
| `local-0.yyds` | Catalog: magic `YYDS\x01`, format version `0`, empty schema and routing sections, exactly one shard registration, empty contract and owner sections. |
| `local-0.yykv` | Shard: magic `YYKV\x03`, an FNV-1a checksum over the body, the next revision, and the records. |

Each record carries its namespace (`redis:db0` through `redis:db15`), opaque key
bytes, a unique revision inside the shard, a millisecond deadline (`0` means no
deadline) and an inline value. The YYDS object-plane payload (tag `1`) is never
written and is rejected on read.

The shard is a whole snapshot. Every write that reaches it re-serializes the
entire shard, writes a temporary file and renames it over `local-0.yykv`. The
live record map is mutated in place, so a commit pays one serialization pass
rather than a full deep copy plus a second map build. The catalog is written
once, before the directory is usable, and is never rewritten afterwards. The
shard is written before the catalog on a fresh directory, so a crash between
the two renames reopens by recreating the catalog around the shard that already
exists.

`fsync` follows the `appendfsync` policy, which `--appendfsync` sets at startup
and `CONFIG SET appendfsync always|everysec` switches on a running server:

| Policy | Behavior |
| ------ | -------- |
| `everysec` (default) | The renamed snapshot is fsynced once per second, on `SAVE` / `BGSAVE`, and when the server closes. A process crash loses nothing because the bytes are already in the page cache, while a power loss can drop at most the writes since the previous second. |
| `always` | Every snapshot write is fsynced before the command returns. |

A server started with `--appendfsync always` therefore matches the strict
durability boundary, while the default trades at most one second of power-loss
durability for sequential write throughput.

Write amplification follows from that layout. One isolated `SET` at median of
three, recorded on one Windows/NTFS host with the debug binding before the
in-place commit change (the byte counts still describe the layout, the times are
I/O bound and host specific):

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

`pnpm build` uses the debug profile. Use `pnpm build:release` for the optimized
binding that the published platform packages ship and that the benchmark report
measures.

`pnpm build` runs `cargo build -p redis-napi`, copies the artifact to
`projects/redis.ts/platforms/redis-<platform>/redis.<platform>.node`, and
compiles the TypeScript package into `dist`. Run the server and client
directly from the workspace:

```sh
node projects/redis.ts/packages/redis/bin/redis-server.mjs --port 6379 --data-dir ./data
node projects/redis.ts/packages/redis/bin/redis-server.mjs --port 6379 --data-dir ./data --appendfsync always
node projects/redis.ts/packages/redis/bin/redis-server.mjs --port 6379 --data-dir ./data --requirepass secret
node projects/redis.ts/packages/redis/bin/redis-server.mjs --port 6379 --data-dir ./data --notify-keyspace-events KEx
node projects/redis.ts/packages/redis/bin/redis-cli.mjs -p 6379 SET greeting hello
node projects/redis.ts/packages/redis/bin/redis-cli.mjs -p 6379 GET greeting
node projects/redis.ts/packages/redis/bin/redis-cli.mjs -p 6379 -3 HELLO 3
```

An installed `@yydb/redis` exposes the same entry points as `redis-server` and
`redis-cli`. `SHUTDOWN` saves unless `NOSAVE` is given, flushes buffered
increments and closes the listener. `SIGINT` and `SIGTERM` do the same.

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

- **No scripting or cluster surface.** There is no `EVAL` / `SCRIPT` / `FUNCTION`,
  no `CLUSTER`, `REPLICAOF` / `FAILOVER`, Sentinel, TLS or `DEBUG`. `AUTH` covers
  the single default user, not additional ACL users.
- **Notification coverage.** Only the `expired` event class is published. The
  flags come from `--notify-keyspace-events` at startup and can be changed with
  `CONFIG SET notify-keyspace-events`.
- **Client options.** `CLIENT` supports only the subcommands listed above.
- **`SCAN MATCH` glob.** `KEYS` served by the TypeScript server supports the full
  Redis dialect (`*`, `?`, `[...]`, `[^...]`, ranges and backslash escapes).
  `SCAN MATCH` still runs in the upstream facade, which matches only `*`, `?` and
  literal bytes.
- **Cursor semantics.** `SCAN` treats the cursor as a position in the current
  ascending key list and pages from there. It is not an opaque Redis cursor, and
  a keyspace change between calls can skip or repeat keys.
- **Active expiry runs only with the server.** Reads always hide an expired
  record, and the server additionally sweeps expired records out of the shard on
  its 100 ms pass and before `FLUSHDB` / `FLUSHALL`. A bare `Store` handle that
  never starts a server leaves those records in the `.yykv` file until the same
  key is overwritten.
- **No eviction.** There is no `maxmemory` policy and no background reclamation.
- **One shard, one process.** The catalog accepts exactly one shard
  registration. There is no partitioning, multi-shard routing, replication,
  cluster or Sentinel. A `.redis-server.lock` file names the process serving a
  directory: a second live server is refused and a stale lock held by a dead
  process is reclaimed.
- **No index sidecar.** Everything data-bearing is carried by the two documented
  files. The only extra file is the transient `.redis-server.lock`, which never
  carries data.
- **Buffered counters.** An unflushed `INCR` is lost on a crash. Only a completed
  flush, another mutation, or a clean close makes it durable. Under the default
  `everysec` policy a power loss can additionally drop writes that are not yet
  fsynced.
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

Redis owns the mapping from its record model onto the `database-formats`
`.yyds` and `.yykv` codecs in `projects/redis.rs/redis-wasm/src/format.rs`.
It writes the v3 shard shape and the v0 catalog shape described above, but reads
deliberately less than the shared codec accepts: inline values only, exactly one
shard, and no resolved contract or owner sections. This document records the
current behavior only and promises no wider interchange beyond the shared
format contract.

## License

MPL-2.0. See [License.md](License.md).
