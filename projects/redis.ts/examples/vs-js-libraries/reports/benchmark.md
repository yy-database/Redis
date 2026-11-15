# Benchmark report

Command: `pnpm --dir projects/redis.ts/examples/vs-js-libraries benchmark`
Binding: `release` — build with `pnpm build:release` and set `BENCH_BINDING_PROFILE=release` for product numbers
Defaults: `BENCH_SET=100`, `BENCH_GET=500`, `BENCH_PIPE=500`, `BENCH_PING=1000`, `BENCH_BATCH=500`, `BENCH_COLL=200`, `BENCH_BIG=20`, `BENCH_BIG_GET=50`, `BENCH_BIG_BYTES=65536`, `BENCH_CONNECT=50`, `BENCH_STREAM=200`, `BENCH_PUBSUB=100`, `BENCH_TTL=30`, `BENCH_TXN=100`, `BENCH_INCR=500`, `BENCH_MSET=500`, `BENCH_DEL=200`, `BENCH_MOVE=200`, `BENCH_BLOCK=100`, `BENCH_PING_CONC=800`, `BENCH_CONC=8`, `BENCH_GROUP=100`, `BENCH_REPEAT=10`, `BENCH_COLL_LARGE=2000`, `BENCH_SWEEP=500`, `BENCH_SWEEP_TTL_MS=50`, `BENCH_SWEEP_WAIT_MS=200`, `BENCH_FANOUT_SUBS=8`, `BENCH_FANOUT=50`, `BENCH_ROUNDS=3`, `BENCH_WARMUP=1`
Baseline: `ioredis` against the emulated server = `1.00x`
Ratio: subject_time / baseline_time (smaller is faster). Fastest cell in each row is bold.
Stats: median/p95/min/max/rounds come from `database.harness::summarize` via `benchSummary` (addon:harnessBenchSummary + harnessBenchPerOp (database.harness::summarize / per_op_ms)); nearest-rank p95, even-length median averages the middle pair. Per-op milliseconds come from `database.harness::per_op_ms` via `benchPerOpMs`, the same DTO the summary returns. No median, p95 or per-op formula lives in this example.

## Provenance

- `node_version`: `v24.18.0`
- `rustc_version`: `rustc 1.101.0-nightly (1c3a65069 2026-11-02)`
- `target_triple`: `x86_64-pc-windows-msvc`
- `rev`: `37fc47db980b56ff77b481cc31d5a1f4c3b55791`
- `plan`: `rounds=3, warmup=1`
- host: `win32-x64`
- oracle: unavailable on this host (see limitation below)

## Scenario matrix

| Workload | Scenario | Ops/round | Shape |
|----------|----------|----------:|-------|
| `get-seq` | `redis-string-get` | 500 | {"ops":"500","value_bytes":"64"} |
| `set-seq` | `redis-string-set` | 100 | {"ops":"100","value_bytes":"64"} |
| `mset-seq` | `redis-string-mset` | 500 | {"keys":"500","value_bytes":"64"} |
| `incr-seq` | `redis-string-incr` | 500 | {"ops":"500"} |
| `set-pipeline` | `redis-pipeline-set` | 500 | {"ops":"500","batch":"500","value_bytes":"64"} |
| `get-pipeline` | `redis-pipeline-get` | 500 | {"ops":"500","batch":"500","value_bytes":"64"} |
| `pipeline-mixed` | `redis-pipeline-mixed-families` | 500 | {"ops":"500","batch":"500","value_bytes":"64","families":"SET,GET,INCR,HSET,LPUSH,SADD"} |
| `hash-hset-hget` | `redis-hash-hset-hget` | 401 | {"fields":"200"} |
| `hash-setnx-hrandfield` | `redis-hash-setnx-hrandfield` | 402 | {"fields":"200"} |
| `list-rpush-lrange` | `redis-list-rpush-lrange` | 202 | {"elements":"200"} |
| `set-sadd-smembers` | `redis-set-sadd-smembers` | 202 | {"members":"200"} |
| `zset-zadd-zrange` | `redis-zset-zadd-zrange` | 202 | {"members":"200","withscores":"true"} |
| `streams-xadd-xrange` | `redis-stream-xadd-xrange` | 202 | {"entries":"200","fields":"1"} |
| `pubsub-roundtrip` | `redis-pubsub-publish-deliver` | 100 | {"messages":"100","channels":"1"} |
| `blpop-roundtrip` | `redis-list-blpop-push` | 100 | {"roundtrips":"100","timeout_seconds":"5"} |
| `scan-full` | `redis-scan-full-keyspace` | 200 | {"keys":"200","count_hint":"50"} |
| `ping-concurrent` | `redis-ping-concurrent` | 800 | {"ops":"800","connections":"8"} |
| `stream-group` | `redis-stream-consumer-group` | 300 | {"entries":"100","group":"workers","consumer":"c1"} |
| `ttl-setex-expire` | `redis-ttl-setex-expire` | 90 | {"keys":"30","ttl_seconds":"1","wait_ms":"1100"} |
| `multi-exec` | `redis-txn-multi-exec` | 102 | {"commands":"100","probe":"SET"} |
| `mget-seq` | `redis-string-mget` | 200 | {"keys":"200","value_bytes":"64"} |
| `append-getrange` | `redis-string-append-getrange` | 201 | {"appends":"200","chunk_bytes":"16"} |
| `getdel-getex` | `redis-string-getdel-getex` | 400 | {"keys":"200","ttl_seconds":"100"} |
| `set-options` | `redis-string-set-options` | 400 | {"keys":"200","options":"NX,XX,GET"} |
| `exists-type` | `redis-key-exists-type` | 400 | {"keys":"200"} |
| `expire-persist` | `redis-key-expire-persist` | 600 | {"keys":"200","ttl_seconds":"100"} |
| `hash-hgetall-hdel` | `redis-hash-hgetall-hdel` | 202 | {"fields":"200"} |
| `hash-keys-values` | `redis-hash-hkeys-hvals-hlen-hincrby` | 40 | {"fields":"200","repeat":"10","commands":"HKEYS,HVALS,HLEN,HINCRBY"} |
| `list-lpush-lpop` | `redis-list-lpush-lpop` | 400 | {"elements":"200"} |
| `set-algebra` | `redis-set-sinter-sunion-sdiff` | 30 | {"members":"200","repeat":"10"} |
| `set-membership-ops` | `redis-set-membership-cardinality` | 30 | {"members":"200","repeat":"10","commands":"SMISMEMBER,SINTERCARD,SRANDMEMBER"} |
| `zset-pop-ops` | `redis-zset-pop-random-score` | 4 | {"members":"200","commands":"ZMSCORE,ZRANDMEMBER,ZPOPMIN,ZPOPMAX"} |
| `zset-range-queries` | `redis-zset-rangebyscore-rangebylex` | 40 | {"members":"200","repeat":"10","commands":"ZCOUNT,ZRANGEBYSCORE,ZREVRANGEBYSCORE,ZRANGEBYLEX"} |
| `large-collection-read` | `redis-large-collection-full-read` | 20 | {"members":"2000","repeat":"10","commands":"SMEMBERS,ZRANGE"} |
| `large-hash-list-read` | `redis-large-hash-list-full-read` | 20 | {"members":"2000","repeat":"10","commands":"HGETALL,LRANGE"} |
| `resp3-hello` | `redis-resp3-hello-roundtrip` | 40 | {"repeat":"10","commands":"HELLO,GET,SMEMBERS,PING","value_bytes":"64"} |
| `expire-sweep` | `redis-expire-sweep` | 1002 | {"keys":"500","ttl_ms":"50","wait_ms":"200","value_bytes":"64"} |
| `multi-exec-mixed` | `redis-txn-multi-exec-families` | 102 | {"commands":"100","families":"SET,GET,INCR,HSET,LPUSH,SADD","value_bytes":"64"} |
| `pubsub-fanout` | `redis-pubsub-fanout` | 400 | {"messages":"50","subscribers":"8","channels":"1"} |
| `zset-score-ops` | `redis-zset-increment-rank` | 600 | {"members":"200"} |
| `bitfield-ops` | `redis-bitfield-increment` | 201 | {"increments":"200","type":"u32"} |
| `hll-ops` | `redis-hyperloglog-add-count` | 201 | {"elements":"200"} |
| `sort-ops` | `redis-sort-list` | 10 | {"elements":"200","repeat":"10","mode":"SORT_RO"} |
| `keys-random` | `redis-keys-random-dbsize` | 30 | {"keys":"200","repeat":"10"} |
| `stream-xread` | `redis-stream-xread` | 10 | {"entries":"200","repeat":"10"} |
| `stream-xadd-xread` | `redis-stream-xadd-xread` | 202 | {"entries":"200","read_count":"20","fields":"2"} |
| `hscan-cursor` | `redis-hash-scan-cursor` | 200 | {"fields":"200","count_hint":"32"} |
| `sscan-zscan-cursor` | `redis-set-zset-scan-cursor` | 400 | {"members":"200","count_hint":"32","commands":"SSCAN,ZSCAN"} |
| `set-ops-large` | `redis-set-large-sinter-sunion-sdiff` | 30 | {"members":"2000","repeat":"10","commands":"SINTER,SUNION,SDIFF"} |
| `lmpop-blocking` | `redis-list-lmpop-blpop-replay` | 100 | {"pops":"100","commands":"LMPOP,BLPOP","mode":"non-blocking replay"} |
| `key-space-notify` | `redis-keyspace-expired-notification` | 30 | {"keys":"30","ttl_ms":"10","channel":"__keyevent@0__:expired"} |
| `resp3-collections` | `redis-resp3-collection-families` | 40 | {"members":"200","repeat":"10","commands":"SMEMBERS,HGETALL,ZRANGE WITHSCORES,SINTER"} |
| `server-face-ops` | `redis-server-face` | 40 | {"repeat":"10","commands":"INFO,COMMAND COUNT,CONFIG GET,CONFIG SET"} |
| `watch-exec` | `redis-txn-watch-exec` | 40 | {"keys":"1","repeat":"10"} |
| `set-big` | `redis-big-value-set` | 20 | {"ops":"20","value_bytes":"65536"} |
| `get-big` | `redis-big-value-get` | 50 | {"ops":"50","value_bytes":"65536"} |
| `del-seq` | `redis-key-del` | 200 | {"keys":"200"} |
| `move-seq` | `redis-key-move` | 200 | {"ops":"200","databases":"2"} |
| `ping` | `redis-ping-rtt` | 1000 | {"ops":"1000"} |
| `bit-ops` | `redis-string-bitfield-ops` | 800 | {"keys":"200","commands":"SETBIT,GETBIT,BITCOUNT,BITPOS"} |
| `setrange-getrange` | `redis-string-setrange-getrange` | 400 | {"keys":"200","chunk_bytes":"8"} |
| `rename-unlink` | `redis-key-rename-unlink` | 400 | {"keys":"200","commands":"RENAME,UNLINK"} |
| `setnx-getset` | `redis-string-setnx-getset` | 400 | {"keys":"200","commands":"SETNX,GETSET","value_bytes":"64"} |
| `smove-spop` | `redis-set-smove-spop` | 400 | {"members":"200","commands":"SMOVE,SPOP"} |
| `zrangestore-zdiff` | `redis-zset-zrangestore-zdiff` | 400 | {"members":"200","commands":"ZRANGESTORE,ZDIFF"} |
| `zset-add-options` | `redis-zset-add-options` | 800 | {"members":"200","commands":"ZADD NX,ZADD XX CH,ZADD GT CH,ZADD INCR"} |
| `expire-options` | `redis-key-expire-options` | 1200 | {"keys":"200","commands":"EXPIRE NX,EXPIRE XX,EXPIRE LT,EXPIRE GT,TTL"} |
| `expire-metadata` | `redis-key-expire-metadata` | 600 | {"keys":"200","commands":"EXPIRETIME,PEXPIRETIME,TTL"} |
| `list-lpos` | `redis-list-lpos` | 800 | {"elements":"200","commands":"LPOS,LPOS RANK -1,LPOS COUNT 2,LPOS miss"} |
| `copy-renamenx` | `redis-key-copy-renamenx` | 400 | {"keys":"200","commands":"COPY,RENAMENX"} |
| `object-encoding` | `redis-object-inspect` | 600 | {"keys":"200","commands":"OBJECT ENCODING,OBJECT REFCOUNT,OBJECT IDLETIME"} |
| `hash-hincrbyfloat` | `redis-hash-hincrbyfloat` | 400 | {"fields":"200","commands":"HINCRBYFLOAT 0.1,HINCRBYFLOAT 0.2"} |
| `list-lset-lrem` | `redis-list-lset-lrem` | 202 | {"members":"200","commands":"LSET,LREM,LLEN"} |
| `connect` | `redis-connect-open-close` | 50 | {"opens":"50","probe":"PING"} |
| `list-linsert-ltrim` | `redis-list-linsert-ltrim` | 5 | {"elements":"3","commands":"LINSERT BEFORE,LINSERT miss,LTRIM,LLEN"} |
| `list-rpoplpush-lmove` | `redis-list-rpoplpush-lmove` | 5 | {"elements":"3","commands":"RPOPLPUSH,LMOVE LEFT RIGHT"} |
| `hll-merge-count` | `redis-hyperloglog-merge-count` | 3 | {"elements_per_key":"200","commands":"PFMERGE,PFCOUNT merged,PFCOUNT multi-key"} |
| `client-info` | `redis-client-info` | 10 | {"repeat":"10","commands":"CLIENT INFO"} |
| `flushdb-scratch` | `redis-key-flushdb-scratch-db` | 14 | {"keys":"8","db":"3","commands":"SELECT,FLUSHDB,DBSIZE"} |

## Relative to `ioredis`

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|-------:|-------:|-------:|
| get-seq | 1.00x | **0.90x** | 1.10x |
| set-seq | 1.00x | **0.85x** | 1.02x |
| mset-seq | 1.00x | 1.01x | **0.95x** |
| incr-seq | 1.00x | **0.86x** | 1.04x |
| set-pipeline | **1.00x** | 1.13x | 1.07x |
| get-pipeline | 1.00x | **0.94x** | 1.70x |
| pipeline-mixed | 1.00x | **0.93x** | 1.03x |
| hash-hset-hget | 1.00x | **0.97x** | 1.18x |
| hash-setnx-hrandfield | 1.00x | **0.84x** | 1.04x |
| list-rpush-lrange | **1.00x** | 1.02x | 1.19x |
| set-sadd-smembers | **1.00x** | 1.08x | 1.10x |
| zset-zadd-zrange | 1.00x | **0.89x** | 1.06x |
| streams-xadd-xrange | 1.00x | **0.85x** | 0.89x |
| pubsub-roundtrip | 1.00x | **0.72x** | 0.95x |
| blpop-roundtrip | 1.00x | **0.90x** | 1.05x |
| scan-full | 1.00x | 0.92x | **0.88x** |
| ping-concurrent | **1.00x** | 1.13x | 1.16x |
| stream-group | 1.00x | **0.73x** | 0.88x |
| ttl-setex-expire | **1.00x** | 1.00x | 1.00x |
| multi-exec | 1.00x | **0.98x** | 1.15x |
| mget-seq | 1.00x | **0.78x** | 1.39x |
| append-getrange | 1.00x | **0.71x** | 0.98x |
| getdel-getex | 1.00x | **0.77x** | 0.96x |
| set-options | 1.00x | **0.90x** | 0.99x |
| exists-type | 1.00x | **0.87x** | 1.06x |
| expire-persist | 1.00x | **0.97x** | 1.32x |
| hash-hgetall-hdel | **1.00x** | 1.14x | 4.22x |
| hash-keys-values | 1.00x | **0.86x** | 1.07x |
| list-lpush-lpop | 1.00x | **1.00x** | 1.25x |
| set-algebra | 1.00x | **0.73x** | 0.88x |
| set-membership-ops | 1.00x | 1.00x | **0.97x** |
| zset-pop-ops | 1.00x | 0.75x | **0.72x** |
| zset-range-queries | 1.00x | **0.73x** | 1.06x |
| large-collection-read | 1.00x | **0.48x** | 0.50x |
| large-hash-list-read | 1.00x | **0.42x** | 0.50x |
| resp3-hello | 1.00x | 0.94x | **0.85x** |
| expire-sweep | **1.00x** | 1.02x | 1.03x |
| multi-exec-mixed | 1.00x | **0.92x** | 1.06x |
| pubsub-fanout | 1.00x | **0.85x** | 0.95x |
| zset-score-ops | **1.00x** | 1.05x | 1.10x |
| bitfield-ops | 1.00x | **0.92x** | 1.06x |
| hll-ops | 1.00x | **0.97x** | 1.25x |
| sort-ops | 1.00x | **0.61x** | 0.85x |
| keys-random | 1.00x | 0.98x | **0.95x** |
| stream-xread | 1.00x | **0.82x** | 0.95x |
| stream-xadd-xread | 1.00x | **0.73x** | 0.86x |
| hscan-cursor | 1.00x | 0.98x | **0.79x** |
| sscan-zscan-cursor | 1.00x | 1.33x | **0.94x** |
| set-ops-large | 1.00x | 0.91x | **0.90x** |
| lmpop-blocking | 1.00x | **0.88x** | 1.20x |
| key-space-notify | **1.00x** | 1.00x | 1.01x |
| resp3-collections | 1.00x | 0.75x | **0.71x** |
| server-face-ops | **1.00x** | 1.07x | 1.21x |
| watch-exec | 1.00x | **0.73x** | 0.82x |
| set-big | **1.00x** | 1.41x | 1.05x |
| get-big | 1.00x | **0.78x** | 0.86x |
| del-seq | 1.00x | **0.70x** | 0.87x |
| move-seq | 1.00x | **0.66x** | 0.75x |
| ping | **1.00x** | 1.06x | 1.26x |
| bit-ops | 1.00x | **0.84x** | 1.03x |
| setrange-getrange | **1.00x** | 1.15x | 1.17x |
| rename-unlink | 1.00x | **0.78x** | 0.92x |
| setnx-getset | **1.00x** | 1.02x | 1.04x |
| smove-spop | 1.00x | **0.77x** | 0.84x |
| zrangestore-zdiff | 1.00x | **0.75x** | 0.84x |
| zset-add-options | 1.00x | **0.94x** | 1.04x |
| expire-options | 1.00x | 1.21x | **0.90x** |
| expire-metadata | 1.00x | **0.95x** | 1.24x |
| list-lpos | **1.00x** | 1.01x | 1.31x |
| copy-renamenx | 1.00x | **0.86x** | 1.07x |
| object-encoding | 1.00x | **0.92x** | 1.17x |
| hash-hincrbyfloat | 1.00x | **0.88x** | 1.01x |
| list-lset-lrem | **1.00x** | 1.06x | 1.06x |
| connect | 1.00x | **0.38x** | 0.82x |
| list-linsert-ltrim | **1.00x** | 1.66x | 1.67x |
| list-rpoplpush-lmove | **1.00x** | 1.20x | 1.03x |
| hll-merge-count | 1.00x | 1.13x | **0.83x** |
| client-info | **1.00x** | 1.16x | 3.33x |
| flushdb-scratch | **1.00x** | 1.53x | 1.28x |

## Median and p95 (ms)

| Workload | ops | ioredis med | ioredis p95 | @yydb/redis med | @yydb/redis p95 | node-redis med | node-redis p95 |
|---------:|----:|-------:|-------:|-------:|-------:|-------:|-------:|
| get-seq | 500 | 22.08 | 22.25 | 19.84 | 22.54 | 24.33 | 27.02 |
| set-seq | 100 | 5.47 | 5.59 | 4.66 | 5.18 | 5.57 | 5.61 |
| mset-seq | 500 | 2.79 | 3.55 | 2.82 | 3.15 | 2.66 | 3.11 |
| incr-seq | 500 | 19.84 | 20.91 | 17.06 | 21.65 | 20.63 | 21.90 |
| set-pipeline | 500 | 6.84 | 7.16 | 7.72 | 13.47 | 7.31 | 7.58 |
| get-pipeline | 500 | 4.90 | 5.44 | 4.59 | 19.30 | 8.35 | 9.03 |
| pipeline-mixed | 500 | 8.49 | 9.34 | 7.90 | 9.04 | 8.78 | 9.06 |
| hash-hset-hget | 401 | 20.21 | 20.68 | 19.60 | 26.88 | 23.75 | 24.85 |
| hash-setnx-hrandfield | 402 | 11.35 | 11.79 | 9.58 | 18.03 | 11.78 | 38.75 |
| list-rpush-lrange | 202 | 9.21 | 9.87 | 9.35 | 9.54 | 10.92 | 10.99 |
| set-sadd-smembers | 202 | 9.18 | 10.93 | 9.95 | 13.20 | 10.14 | 17.50 |
| zset-zadd-zrange | 202 | 10.53 | 11.16 | 9.37 | 9.76 | 11.14 | 12.37 |
| streams-xadd-xrange | 202 | 19.23 | 19.40 | 16.28 | 39.17 | 17.20 | 18.90 |
| pubsub-roundtrip | 100 | 7.16 | 7.18 | 5.12 | 14.97 | 6.79 | 6.85 |
| blpop-roundtrip | 100 | 12.17 | 18.80 | 11.00 | 11.58 | 12.77 | 12.98 |
| scan-full | 200 | 2.01 | 2.08 | 1.84 | 1.85 | 1.76 | 1.77 |
| ping-concurrent | 800 | 19.50 | 19.77 | 22.02 | 39.00 | 22.60 | 23.60 |
| stream-group | 300 | 37.82 | 40.11 | 27.67 | 31.27 | 33.45 | 35.56 |
| ttl-setex-expire | 90 | 1114.92 | 1122.32 | 1117.01 | 1118.35 | 1118.35 | 1126.52 |
| multi-exec | 102 | 11.42 | 11.54 | 11.25 | 11.71 | 13.08 | 13.28 |
| mget-seq | 200 | 0.91 | 1.41 | 0.71 | 0.78 | 1.26 | 1.48 |
| append-getrange | 201 | 19.26 | 31.04 | 13.62 | 16.75 | 18.88 | 25.20 |
| getdel-getex | 400 | 34.98 | 35.25 | 27.07 | 28.38 | 33.51 | 34.37 |
| set-options | 400 | 38.21 | 42.28 | 34.46 | 67.51 | 37.84 | 38.43 |
| exists-type | 400 | 29.72 | 31.95 | 25.90 | 29.48 | 31.40 | 33.85 |
| expire-persist | 600 | 42.01 | 44.65 | 40.65 | 41.52 | 55.49 | 56.69 |
| hash-hgetall-hdel | 202 | 1.72 | 2.39 | 1.96 | 3.45 | 7.24 | 13.93 |
| hash-keys-values | 40 | 5.90 | 6.48 | 5.08 | 5.13 | 6.32 | 8.06 |
| list-lpush-lpop | 400 | 36.04 | 37.32 | 36.02 | 41.08 | 44.95 | 48.71 |
| set-algebra | 30 | 10.09 | 13.46 | 7.34 | 8.19 | 8.82 | 9.39 |
| set-membership-ops | 30 | 10.45 | 10.91 | 10.43 | 10.83 | 10.15 | 11.12 |
| zset-pop-ops | 4 | 1.72 | 2.64 | 1.29 | 1.82 | 1.24 | 1.34 |
| zset-range-queries | 40 | 7.59 | 8.58 | 5.55 | 7.57 | 8.07 | 13.47 |
| large-collection-read | 20 | 33.40 | 34.68 | 16.06 | 19.77 | 16.75 | 16.81 |
| large-hash-list-read | 20 | 41.03 | 41.70 | 17.14 | 17.30 | 20.43 | 31.29 |
| resp3-hello | 40 | 5.02 | 5.21 | 4.74 | 4.94 | 4.29 | 4.58 |
| expire-sweep | 1002 | 257.49 | 259.39 | 262.05 | 277.20 | 265.62 | 281.15 |
| multi-exec-mixed | 102 | 9.59 | 10.60 | 8.81 | 9.07 | 10.12 | 10.38 |
| pubsub-fanout | 400 | 19.01 | 21.11 | 16.16 | 16.38 | 18.09 | 27.17 |
| zset-score-ops | 600 | 55.22 | 56.57 | 58.00 | 64.76 | 60.96 | 69.06 |
| bitfield-ops | 201 | 16.56 | 25.36 | 15.16 | 16.04 | 17.56 | 19.86 |
| hll-ops | 201 | 15.25 | 16.88 | 14.75 | 15.50 | 19.12 | 20.54 |
| sort-ops | 10 | 2.57 | 4.33 | 1.56 | 3.43 | 2.19 | 3.21 |
| keys-random | 30 | 30.80 | 40.88 | 30.06 | 41.28 | 29.23 | 30.71 |
| stream-xread | 10 | 15.79 | 16.51 | 12.97 | 14.32 | 14.99 | 15.61 |
| stream-xadd-xread | 202 | 40.24 | 45.14 | 29.20 | 31.59 | 34.80 | 35.56 |
| hscan-cursor | 200 | 1.02 | 1.97 | 1.00 | 1.06 | 0.81 | 0.82 |
| sscan-zscan-cursor | 400 | 1.67 | 2.63 | 2.22 | 2.25 | 1.56 | 2.25 |
| set-ops-large | 30 | 219.20 | 222.35 | 200.45 | 219.53 | 197.07 | 210.37 |
| lmpop-blocking | 100 | 12.54 | 13.71 | 11.01 | 18.40 | 15.10 | 15.15 |
| key-space-notify | 30 | 107.73 | 111.13 | 108.03 | 108.23 | 108.70 | 109.88 |
| resp3-collections | 40 | 12.71 | 18.08 | 9.58 | 10.65 | 9.07 | 10.79 |
| server-face-ops | 40 | 3.39 | 3.72 | 3.64 | 4.42 | 4.10 | 4.34 |
| watch-exec | 40 | 3.56 | 3.84 | 2.61 | 3.31 | 2.92 | 4.05 |
| set-big | 20 | 6.80 | 14.52 | 9.57 | 10.71 | 7.16 | 7.47 |
| get-big | 50 | 14.35 | 18.23 | 11.22 | 16.72 | 12.33 | 12.99 |
| del-seq | 200 | 17.15 | 19.67 | 11.93 | 12.38 | 14.91 | 16.43 |
| move-seq | 200 | 28.34 | 38.81 | 18.83 | 20.69 | 21.27 | 24.98 |
| ping | 1000 | 53.02 | 55.14 | 56.20 | 66.85 | 66.79 | 71.55 |
| bit-ops | 800 | 55.24 | 58.11 | 46.19 | 48.51 | 57.06 | 59.21 |
| setrange-getrange | 400 | 27.66 | 58.96 | 31.78 | 36.37 | 32.30 | 43.05 |
| rename-unlink | 400 | 36.26 | 41.50 | 28.21 | 28.44 | 33.39 | 34.81 |
| setnx-getset | 400 | 26.84 | 27.51 | 27.45 | 38.63 | 27.83 | 36.55 |
| smove-spop | 400 | 43.90 | 44.04 | 33.76 | 39.13 | 36.90 | 37.79 |
| zrangestore-zdiff | 400 | 0.40 | 0.70 | 0.30 | 0.48 | 0.34 | 0.37 |
| zset-add-options | 800 | 88.09 | 89.48 | 82.56 | 89.35 | 91.38 | 94.67 |
| expire-options | 1200 | 97.46 | 101.10 | 117.50 | 117.87 | 87.58 | 103.71 |
| expire-metadata | 600 | 41.02 | 42.25 | 38.96 | 43.82 | 50.85 | 60.08 |
| list-lpos | 800 | 67.84 | 69.72 | 68.34 | 69.53 | 88.84 | 139.18 |
| copy-renamenx | 400 | 41.96 | 43.78 | 36.29 | 40.60 | 44.83 | 53.37 |
| object-encoding | 600 | 38.72 | 48.22 | 35.59 | 35.96 | 45.24 | 51.73 |
| hash-hincrbyfloat | 400 | 71.91 | 73.35 | 63.01 | 75.99 | 72.69 | 93.94 |
| list-lset-lrem | 202 | 17.42 | 18.13 | 18.50 | 22.90 | 18.39 | 18.96 |
| connect | 50 | 63.36 | 68.11 | 23.86 | 24.98 | 51.86 | 52.41 |
| list-linsert-ltrim | 5 | 0.32 | 0.34 | 0.54 | 0.69 | 0.54 | 0.60 |
| list-rpoplpush-lmove | 5 | 0.37 | 0.57 | 0.44 | 0.73 | 0.38 | 0.46 |
| hll-merge-count | 3 | 0.44 | 0.44 | 0.50 | 0.64 | 0.37 | 0.46 |
| client-info | 10 | 0.61 | 1.17 | 0.71 | 0.74 | 2.02 | 10.14 |
| flushdb-scratch | 14 | 0.89 | 1.43 | 1.36 | 1.54 | 1.14 | 1.27 |

## Per-op and throughput (median)

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|--------:|--------:|--------:|
| get-seq | 0.044 ms/op, 22,646/s | 0.040 ms/op, 25,199/s | 0.049 ms/op, 20,548/s |
| set-seq | 0.055 ms/op, 18,298/s | 0.047 ms/op, 21,460/s | 0.056 ms/op, 17,955/s |
| mset-seq | 0.006 ms/op, 179,443/s | 0.006 ms/op, 177,123/s | 0.005 ms/op, 187,942/s |
| incr-seq | 0.040 ms/op, 25,200/s | 0.034 ms/op, 29,313/s | 0.041 ms/op, 24,240/s |
| set-pipeline | 0.014 ms/op, 73,109/s | 0.015 ms/op, 64,773/s | 0.015 ms/op, 68,370/s |
| get-pipeline | 0.010 ms/op, 102,037/s | 0.009 ms/op, 108,904/s | 0.017 ms/op, 59,878/s |
| pipeline-mixed | 0.017 ms/op, 58,872/s | 0.016 ms/op, 63,309/s | 0.018 ms/op, 56,959/s |
| hash-hset-hget | 0.050 ms/op, 19,844/s | 0.049 ms/op, 20,454/s | 0.059 ms/op, 16,882/s |
| hash-setnx-hrandfield | 0.028 ms/op, 35,425/s | 0.024 ms/op, 41,984/s | 0.029 ms/op, 34,139/s |
| list-rpush-lrange | 0.046 ms/op, 21,939/s | 0.046 ms/op, 21,609/s | 0.054 ms/op, 18,502/s |
| set-sadd-smembers | 0.045 ms/op, 22,002/s | 0.049 ms/op, 20,311/s | 0.050 ms/op, 19,923/s |
| zset-zadd-zrange | 0.052 ms/op, 19,190/s | 0.046 ms/op, 21,550/s | 0.055 ms/op, 18,129/s |
| streams-xadd-xrange | 0.095 ms/op, 10,506/s | 0.081 ms/op, 12,408/s | 0.085 ms/op, 11,747/s |
| pubsub-roundtrip | 0.072 ms/op, 13,973/s | 0.051 ms/op, 19,539/s | 0.068 ms/op, 14,726/s |
| blpop-roundtrip | 0.122 ms/op, 8,217/s | 0.110 ms/op, 9,092/s | 0.128 ms/op, 7,833/s |
| scan-full | 0.010 ms/op, 99,522/s | 0.009 ms/op, 108,719/s | 0.009 ms/op, 113,314/s |
| ping-concurrent | 0.024 ms/op, 41,029/s | 0.028 ms/op, 36,325/s | 0.028 ms/op, 35,404/s |
| stream-group | 0.126 ms/op, 7,932/s | 0.092 ms/op, 10,841/s | 0.112 ms/op, 8,968/s |
| ttl-setex-expire | 12.388 ms/op, 81/s | 12.411 ms/op, 81/s | 12.426 ms/op, 80/s |
| multi-exec | 0.112 ms/op, 8,932/s | 0.110 ms/op, 9,069/s | 0.128 ms/op, 7,799/s |
| mget-seq | 0.005 ms/op, 219,443/s | 0.004 ms/op, 281,809/s | 0.006 ms/op, 158,416/s |
| append-getrange | 0.096 ms/op, 10,434/s | 0.068 ms/op, 14,761/s | 0.094 ms/op, 10,644/s |
| getdel-getex | 0.087 ms/op, 11,435/s | 0.068 ms/op, 14,775/s | 0.084 ms/op, 11,936/s |
| set-options | 0.096 ms/op, 10,467/s | 0.086 ms/op, 11,609/s | 0.095 ms/op, 10,572/s |
| exists-type | 0.074 ms/op, 13,461/s | 0.065 ms/op, 15,447/s | 0.078 ms/op, 12,740/s |
| expire-persist | 0.070 ms/op, 14,281/s | 0.068 ms/op, 14,761/s | 0.092 ms/op, 10,813/s |
| hash-hgetall-hdel | 0.008 ms/op, 117,777/s | 0.010 ms/op, 103,109/s | 0.036 ms/op, 27,888/s |
| hash-keys-values | 0.147 ms/op, 6,785/s | 0.127 ms/op, 7,879/s | 0.158 ms/op, 6,328/s |
| list-lpush-lpop | 0.090 ms/op, 11,099/s | 0.090 ms/op, 11,105/s | 0.112 ms/op, 8,898/s |
| set-algebra | 0.336 ms/op, 2,975/s | 0.245 ms/op, 4,088/s | 0.294 ms/op, 3,399/s |
| set-membership-ops | 0.348 ms/op, 2,872/s | 0.348 ms/op, 2,876/s | 0.338 ms/op, 2,955/s |
| zset-pop-ops | 0.430 ms/op, 2,328/s | 0.321 ms/op, 3,113/s | 0.311 ms/op, 3,216/s |
| zset-range-queries | 0.190 ms/op, 5,268/s | 0.139 ms/op, 7,201/s | 0.202 ms/op, 4,958/s |
| large-collection-read | 1.670 ms/op, 599/s | 0.803 ms/op, 1,245/s | 0.837 ms/op, 1,194/s |
| large-hash-list-read | 2.051 ms/op, 487/s | 0.857 ms/op, 1,167/s | 1.021 ms/op, 979/s |
| resp3-hello | 0.126 ms/op, 7,965/s | 0.118 ms/op, 8,445/s | 0.107 ms/op, 9,325/s |
| expire-sweep | 0.257 ms/op, 3,891/s | 0.262 ms/op, 3,824/s | 0.265 ms/op, 3,772/s |
| multi-exec-mixed | 0.094 ms/op, 10,641/s | 0.086 ms/op, 11,572/s | 0.099 ms/op, 10,079/s |
| pubsub-fanout | 0.048 ms/op, 21,040/s | 0.040 ms/op, 24,755/s | 0.045 ms/op, 22,115/s |
| zset-score-ops | 0.092 ms/op, 10,866/s | 0.097 ms/op, 10,344/s | 0.102 ms/op, 9,842/s |
| bitfield-ops | 0.082 ms/op, 12,139/s | 0.075 ms/op, 13,255/s | 0.087 ms/op, 11,447/s |
| hll-ops | 0.076 ms/op, 13,182/s | 0.073 ms/op, 13,627/s | 0.095 ms/op, 10,511/s |
| sort-ops | 0.257 ms/op, 3,895/s | 0.156 ms/op, 6,416/s | 0.219 ms/op, 4,571/s |
| keys-random | 1.027 ms/op, 974/s | 1.002 ms/op, 998/s | 0.974 ms/op, 1,026/s |
| stream-xread | 1.579 ms/op, 633/s | 1.297 ms/op, 771/s | 1.499 ms/op, 667/s |
| stream-xadd-xread | 0.199 ms/op, 5,020/s | 0.145 ms/op, 6,918/s | 0.172 ms/op, 5,804/s |
| hscan-cursor | 0.005 ms/op, 195,141/s | 0.005 ms/op, 199,820/s | 0.004 ms/op, 245,791/s |
| sscan-zscan-cursor | 0.004 ms/op, 240,154/s | 0.006 ms/op, 180,400/s | 0.004 ms/op, 256,641/s |
| set-ops-large | 7.307 ms/op, 137/s | 6.682 ms/op, 150/s | 6.569 ms/op, 152/s |
| lmpop-blocking | 0.125 ms/op, 7,976/s | 0.110 ms/op, 9,085/s | 0.151 ms/op, 6,623/s |
| key-space-notify | 3.591 ms/op, 278/s | 3.601 ms/op, 278/s | 3.623 ms/op, 276/s |
| resp3-collections | 0.318 ms/op, 3,147/s | 0.240 ms/op, 4,175/s | 0.227 ms/op, 4,408/s |
| server-face-ops | 0.085 ms/op, 11,789/s | 0.091 ms/op, 10,989/s | 0.102 ms/op, 9,759/s |
| watch-exec | 0.089 ms/op, 11,232/s | 0.065 ms/op, 15,342/s | 0.073 ms/op, 13,716/s |
| set-big | 0.340 ms/op, 2,943/s | 0.478 ms/op, 2,091/s | 0.358 ms/op, 2,793/s |
| get-big | 0.287 ms/op, 3,485/s | 0.224 ms/op, 4,456/s | 0.247 ms/op, 4,056/s |
| del-seq | 0.086 ms/op, 11,661/s | 0.060 ms/op, 16,770/s | 0.075 ms/op, 13,414/s |
| move-seq | 0.142 ms/op, 7,058/s | 0.094 ms/op, 10,620/s | 0.106 ms/op, 9,402/s |
| ping | 0.053 ms/op, 18,860/s | 0.056 ms/op, 17,794/s | 0.067 ms/op, 14,972/s |
| bit-ops | 0.069 ms/op, 14,483/s | 0.058 ms/op, 17,321/s | 0.071 ms/op, 14,020/s |
| setrange-getrange | 0.069 ms/op, 14,461/s | 0.079 ms/op, 12,588/s | 0.081 ms/op, 12,384/s |
| rename-unlink | 0.091 ms/op, 11,033/s | 0.071 ms/op, 14,178/s | 0.083 ms/op, 11,980/s |
| setnx-getset | 0.067 ms/op, 14,903/s | 0.069 ms/op, 14,572/s | 0.070 ms/op, 14,375/s |
| smove-spop | 0.110 ms/op, 9,112/s | 0.084 ms/op, 11,850/s | 0.092 ms/op, 10,840/s |
| zrangestore-zdiff | 0.001 ms/op, 1,004,016/s | 0.001 ms/op, 1,332,889/s | 0.001 ms/op, 1,189,768/s |
| zset-add-options | 0.110 ms/op, 9,082/s | 0.103 ms/op, 9,690/s | 0.114 ms/op, 8,754/s |
| expire-options | 0.081 ms/op, 12,313/s | 0.098 ms/op, 10,213/s | 0.073 ms/op, 13,702/s |
| expire-metadata | 0.068 ms/op, 14,627/s | 0.065 ms/op, 15,401/s | 0.085 ms/op, 11,799/s |
| list-lpos | 0.085 ms/op, 11,793/s | 0.085 ms/op, 11,707/s | 0.111 ms/op, 9,005/s |
| copy-renamenx | 0.105 ms/op, 9,534/s | 0.091 ms/op, 11,023/s | 0.112 ms/op, 8,922/s |
| object-encoding | 0.065 ms/op, 15,497/s | 0.059 ms/op, 16,857/s | 0.075 ms/op, 13,264/s |
| hash-hincrbyfloat | 0.180 ms/op, 5,563/s | 0.158 ms/op, 6,348/s | 0.182 ms/op, 5,503/s |
| list-lset-lrem | 0.086 ms/op, 11,593/s | 0.092 ms/op, 10,917/s | 0.091 ms/op, 10,982/s |
| connect | 1.267 ms/op, 789/s | 0.477 ms/op, 2,096/s | 1.037 ms/op, 964/s |
| list-linsert-ltrim | 0.065 ms/op, 15,389/s | 0.108 ms/op, 9,251/s | 0.108 ms/op, 9,232/s |
| list-rpoplpush-lmove | 0.073 ms/op, 13,631/s | 0.088 ms/op, 11,315/s | 0.076 ms/op, 13,186/s |
| hll-merge-count | 0.147 ms/op, 6,809/s | 0.166 ms/op, 6,039/s | 0.122 ms/op, 8,215/s |
| client-info | 0.061 ms/op, 16,439/s | 0.071 ms/op, 14,132/s | 0.202 ms/op, 4,941/s |
| flushdb-scratch | 0.064 ms/op, 15,729/s | 0.097 ms/op, 10,258/s | 0.081 ms/op, 12,271/s |

## Oracle comparison — limitation

No real `redis-server` is reachable from this host: no `redis-server`/`redis-cli`
binary on `PATH`, no listening instance on `127.0.0.1:6379`, and no `docker` or
`wsl` fallback. The numbers above therefore compare three clients against the
emulated server only; the emulated implementation is never used as the expected
value. The conformance corpus separately records its live-oracle provenance
(`redis-server 8.10.3`, verified 2026-11-08, see `packages/redis-harness/oracle-provenance.json`).
To run the bidirectional comparison, start a real `redis-server` and set
`BENCH_ORACLE_HOST` (and optionally `BENCH_ORACLE_PORT`) before regenerating: the
matrix reruns with `ioredis` against the real server as a `redis-server (oracle)`
column, and the script refuses an oracle that answers `redis_mode:disguise`.

## Additional platform coverage

- `redis-unknown-wasm32`: n/a — placeholder artifact (1 bytes), no wasm-bindgen entry to load
- The matrix above runs on `win32-x64` with the release binding.

## Intentional deltas

- This host shows large run-to-run variance: repeating the same tree can move one
  cell by up to about 2x. Compare cells inside one report rather than absolute
  numbers across reports, and set `BENCH_ROUNDS` higher when a decision needs it.
- One fresh emulated server and data directory per (workload, client); the warmup
  and measured rounds of that cell share one server and one connection. Preload
  stays outside the timed region.
- Collection workloads start each round with `DEL` so rounds stay idempotent; the
  `DEL` is inside the timed region and counted in ops on every client.
- Destructive point workloads (`incr-seq`, `del-seq`, `move-seq`) re-seed through the
  untimed `reset` hook before every round, so the timed region only measures the
  command under test.
- The `connect` workload measures establish + one readiness `PING` + close per op,
  so every client pays a full handshake regardless of its lazy-connect behavior.
- The product client has no reconnect, offline queue, or retry behavior. A socket
  error fails the in-flight command, while ioredis and node-redis carry their own
  machinery (offline queue disabled).
- No pooling and no auto-pipelining anywhere; pipelined cells send explicit
  equal-size batches of 500 on one TCP connection. The protocol column is
  not uniform: ioredis 6 negotiates RESP3 by default, while node-redis and
  `@yydb/redis` run RESP2 unless a workload sets `protocol: 3`.
- The product harness encodes one pipeline with the batch `encodeCommands`
  primitive and the emulated server decodes and encodes each socket burst with the
  batch `decodeCommands` / `encodeReplies` primitives, so a pipeline crosses the
  binding twice regardless of its length.
- The product adapter's RESP parser reads length headers straight from the frame
  bytes and decodes bulk elements inside an array in place, so a full-collection
  reply does not allocate a string header or a temporary element object per
  member. An in-array `$` length is scanned digit by digit instead of calling
  `indexOf` once per member. It also parses RESP3 `%` / `~` / `_` / `,` / `>`
  frames, which is what lets `resp3-hello` and `resp3-collections` run on the
  same adapter. All three columns share the emulated server, so a server-side
  reply improvement moves every client down together and only the client-side
  parser changes the ratio.
- An `XADD` append into a compact stream copies the stored body and writes only
  the new entry; the full decode/encode path remains for `MAXLEN` / `MINID`,
  deleted entries and consumer-group trailers, so the fast path never changes an
  observable reply.
- The socket server applies mutations in memory and writes the whole `.yykv`
  snapshot on its one-second flush cadence, so sequential `SET` and collection
  writes no longer pay a full-shard rewrite per command. A pipeline still folds
  into one in-memory batch, and a batch that mutates while counters are buffered
  writes through immediately. `GET`, `ping` and the collection reads still
  isolate round-trip overhead.
- Command names delegated to the native command families are matched
  case-sensitively by the current backend, so the peer adapters use explicit
  uppercase command forms.
- `ZRANGE ... WITHSCORES` comes back as nested `[member, score]` pairs from the
  emulated server even under RESP2, while a real `redis-server` replies flat; the
  workload normalizes both shapes, so reply parsing never changes the timed region.
- `pubsub-roundtrip` opens one dedicated subscriber connection per cell during the
  untimed `prepare` and closes it after the measured rounds; each op is one
  `PUBLISH` on the main connection plus the awaited delivery on the subscriber, so
  the timing covers the server-wide fan-out path, not the handshake.
- `ttl-setex-expire` writes `BENCH_TTL` keys with `SETEX … 1`, reads `TTL` on each,
  waits `1100ms` inside the timed region, then asserts every `GET` answers nil. The
  wait is a fixed constant shared by all three clients, so the absolute ms/op is
  dominated by the wait while the relative column still compares command overhead.
- `multi-exec` queues `BENCH_TXN` `SET`s after `MULTI` (each answering `QUEUED`) and
  commits them with one `EXEC`; `MULTI` and `EXEC` are counted in ops on every
  client, and the snapshot rewrite happens once at commit, not per queued command.
- `streams-xadd-xrange` starts each round with `DEL` like the other collection
  cells; `XADD` auto-ids are server-generated, so every client pays the same id
  allocation cost inside the timed region.
- The command-family cells added for coverage (`mget-seq`, `append-getrange`,
  `getdel-getex`, `set-options`, `exists-type`, `expire-persist`,
  `hash-hgetall-hdel`, `list-lpush-lpop`, `set-algebra`, `zset-score-ops`,
  `bitfield-ops`, `hll-ops`, `sort-ops`, `keys-random`, `stream-xread`,
  `server-face-ops`, `watch-exec`) keep one command shape per family and reuse
  `BENCH_COLL` for their key/field count. Micro cells repeat `BENCH_REPEAT` times
  inside one timed run so a single sub-millisecond call does not dominate the
  median, and every `ops` value is the real command count sent in a round.
- `pipeline-mixed` sends one equal-size `BENCH_BATCH` burst per chunk and cycles
  SET / GET / INCR / HSET / LPUSH / SADD inside it, so a single socket read crosses
  every forwarded family instead of repeating one command. GET keys are preloaded
  in `prepare`; the growing collections and counter are dropped in `reset` before
  every round, outside the timed region.
- `set-membership-ops` and `zset-pop-ops` cover the remaining family verbs
  (`SMISMEMBER`, `SINTERCARD`, `SRANDMEMBER`; `ZMSCORE`, `ZRANDMEMBER`,
  `ZPOPMIN`, `ZPOPMAX`). Both re-seed their keys in `reset` so every round sees
  the same cardinality, and both normalize the RESP2 nested-versus-flat
  `WITHSCORES` shape the same way `zset-zadd-zrange` does.
- `large-collection-read` builds one `BENCH_COLL_LARGE`-member set and zset in
  `prepare` and reads them whole with `SMEMBERS` and `ZRANGE 0 -1` per
  `BENCH_REPEAT` round, isolating full-collection reply encoding and allocation
  from the per-command round trip the `BENCH_COLL` cells measure. The facade
  writes both replies straight from the stored member blob: `SMEMBERS` counts
  and validates the length-framed chunks without decoding them, and a full
  `ZRANGE` sorts a borrowed view instead of copying every member.
- `resp3-hello` sets `protocol: 3` for the whole cell, so all three clients
  negotiate RESP3 and the measured round trip covers the map reply of
  `HELLO 3`, a bulk `GET`, the `~` set header of `SMEMBERS` and a `PING`.
  Together with `resp3-collections` it is one of the cells that force RESP3 on
  `node-redis` and `@yydb/redis`.
- `expire-sweep` writes `BENCH_SWEEP` keys with `SET ... PX`, asserts
  `DBSIZE`, waits `BENCH_SWEEP_WAIT_MS` (above the server's 100ms sweep tick)
  and then asserts `DBSIZE` is zero and every `GET` answers nil. The pre-wait
  count is an upper bound, because a slow host can take longer than the TTL to
  write the whole batch and already sweep the first keys. The fixed wait is
  shared by all clients, so the cell verifies the cleanup path rather than
  comparing raw command latency.
- `multi-exec-mixed` queues `BENCH_TXN` commands cycling
  SET / GET / INCR / HSET / LPUSH / SADD behind one `MULTI` and commits with
  one `EXEC`, so a transaction crosses every forwarded family. The growing
  collections and counter are dropped in `reset` outside the timed region; the
  preloaded `GET` keys stay outside it too.
- `pubsub-fanout` opens `BENCH_FANOUT_SUBS` dedicated subscriber connections in
  `prepare` and publishes `BENCH_FANOUT` messages to the shared channel, awaiting
  every delivery on every subscriber before the next publish. One `ops` unit is
  one delivery, so the cell measures fan-out rather than a single round trip.
- `stream-xadd-xread` writes `BENCH_STREAM` entries with `XADD` and then reads a
  bounded slice with both `XRANGE … COUNT 20` and `XREAD COUNT 20`, so the write
  path and a range read share one round. The append path copies the stored body
  and writes only the new entry instead of decoding and re-encoding every entry.
- `hscan-cursor` seeds `BENCH_COLL` fields in `prepare` and walks the hash with
  `HSCAN <cursor> COUNT 32` until the cursor returns to `0`. `HSCAN` answers
  field/value pairs, so the visited field count is half the reply list and `ops`
  is the seeded field count.
- `set-ops-large` builds two `BENCH_COLL_LARGE`-member sets with a half overlap in
  `prepare` and runs `SINTER`, `SUNION` and `SDIFF` `BENCH_REPEAT` times,
  asserting each cardinality. Preloading stays outside the timed region, so the
  cell isolates the large set-operation and full-reply encoding cost.
- `lmpop-blocking` re-seeds `BENCH_BLOCK` list elements in `reset` and alternates
  `LMPOP … LEFT COUNT 1` with `BLPOP` on an always-ready key. Both commands are
  served in their non-blocking replay form, so no round ever parks.
- `key-space-notify` subscribes one dedicated connection to
  `__keyevent@0__:expired`, sets `notify-keyspace-events` to `Ex`, writes
  `BENCH_TTL` keys with `PX 10` and awaits every delivery. The server's 100ms
  sweep tick is a fixed cost shared by all clients, so the cell compares the
  notification path rather than raw command latency.
- `resp3-collections` sets `protocol: 3` and repeats `SMEMBERS`, `HGETALL`,
  `ZRANGE … WITHSCORES` and `SINTER` over `BENCH_COLL` members, so the RESP3
  set (`~`), map (`%`) and nested score shapes cross the same adapter as the
  RESP2 cells. Both flat and nested `WITHSCORES` shapes are normalized.
- `hash-keys-values` seeds `BENCH_COLL` numeric fields in the untimed `reset`
  and repeats `HKEYS`, `HVALS`, `HLEN` and `HINCRBY` `BENCH_REPEAT` times. The
  seed is refreshed before every round so the increment always starts from the
  same value and the field count stays `BENCH_COLL`.
- `zset-range-queries` keeps one zset with spread scores and one with every
  member at score 0, then repeats `ZCOUNT`, `ZRANGEBYSCORE`,
  `ZREVRANGEBYSCORE` and `ZRANGEBYLEX` `BENCH_REPEAT` times. The bounds are
  numeric so both the emulator and a real server accept them, and the score
  range selects every member.
- `sscan-zscan-cursor` seeds a set and a zset with `BENCH_COLL` members in
  `prepare` and walks each with `SSCAN` / `ZSCAN <cursor> COUNT 32` until the
  cursor returns to `0`. `ZSCAN` answers member/score pairs, so the visited
  member count is half the reply list.
- `large-hash-list-read` seeds a `BENCH_COLL_LARGE`-field hash and list in
  bounded 100-element calls during `prepare`, then reads them whole with
  `HGETALL` and `LRANGE 0 -1` per `BENCH_REPEAT` round. It pairs with
  `large-collection-read`, which covers the set and zset families.

## Machine-readable summary

Harness `BenchReport` wire shape (`database.harness` serde contract: run-level
provenance applies to all rows, row-level `provenance` overrides field by field):

```json
{
  "provenance": {
    "scenario": "redis-vs-js-libraries-matrix",
    "scenario_params": {
      "rounds": "3",
      "warmup": "1",
      "batch": "500",
      "set": "100",
      "get": "500",
      "pipe": "500",
      "ping": "1000",
      "coll": "200",
      "big": "20",
      "big_get": "50",
      "big_bytes": "65536",
      "connect": "50",
      "stream": "200",
      "pubsub": "100",
      "ttl": "30",
      "txn": "100",
      "incr": "500",
      "mset": "500",
      "del": "200",
      "move": "200",
      "block": "100",
      "ping_conc": "800",
      "conc": "8",
      "group": "100",
      "repeat": "10",
      "coll_large": "2000",
      "sweep": "500",
      "sweep_ttl_ms": "50",
      "sweep_wait_ms": "200",
      "fanout_subs": "8",
      "fanout_messages": "50"
    },
    "data_scale": "matrix=79x3",
    "rustc_version": "rustc 1.101.0-nightly (1c3a65069 2026-11-02)",
    "node_version": "v24.18.0",
    "target_triple": "x86_64-pc-windows-msvc",
    "rev": "37fc47db980b56ff77b481cc31d5a1f4c3b55791",
    "plan": {
      "rounds": 3,
      "warmup": 1
    }
  },
  "rows": [
    {
      "workload": "get-seq@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 22.0788,
        "p95_ms": 22.248,
        "min_ms": 21.5773,
        "max_ms": 22.248,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-string-get",
        "scenario_params": {
          "ops": "500",
          "value_bytes": "64"
        },
        "data_scale": "keys=500"
      }
    },
    {
      "workload": "get-seq@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 19.8422,
        "p95_ms": 22.538,
        "min_ms": 19.0122,
        "max_ms": 22.538,
        "rounds": 3
      },
      "reference": {
        "median_ms": 22.0788,
        "p95_ms": 22.248,
        "min_ms": 21.5773,
        "max_ms": 22.248,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-get",
        "scenario_params": {
          "ops": "500",
          "value_bytes": "64"
        },
        "data_scale": "keys=500"
      }
    },
    {
      "workload": "get-seq@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 24.3337,
        "p95_ms": 27.0235,
        "min_ms": 22.4891,
        "max_ms": 27.0235,
        "rounds": 3
      },
      "reference": {
        "median_ms": 22.0788,
        "p95_ms": 22.248,
        "min_ms": 21.5773,
        "max_ms": 22.248,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-get",
        "scenario_params": {
          "ops": "500",
          "value_bytes": "64"
        },
        "data_scale": "keys=500"
      }
    },
    {
      "workload": "set-seq@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 5.4651,
        "p95_ms": 5.5935,
        "min_ms": 4.815,
        "max_ms": 5.5935,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-string-set",
        "scenario_params": {
          "ops": "100",
          "value_bytes": "64"
        },
        "data_scale": "keys=100"
      }
    },
    {
      "workload": "set-seq@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 4.6598,
        "p95_ms": 5.1845,
        "min_ms": 3.841,
        "max_ms": 5.1845,
        "rounds": 3
      },
      "reference": {
        "median_ms": 5.4651,
        "p95_ms": 5.5935,
        "min_ms": 4.815,
        "max_ms": 5.5935,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-set",
        "scenario_params": {
          "ops": "100",
          "value_bytes": "64"
        },
        "data_scale": "keys=100"
      }
    },
    {
      "workload": "set-seq@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 5.5695,
        "p95_ms": 5.6054,
        "min_ms": 5.3157,
        "max_ms": 5.6054,
        "rounds": 3
      },
      "reference": {
        "median_ms": 5.4651,
        "p95_ms": 5.5935,
        "min_ms": 4.815,
        "max_ms": 5.5935,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-set",
        "scenario_params": {
          "ops": "100",
          "value_bytes": "64"
        },
        "data_scale": "keys=100"
      }
    },
    {
      "workload": "mset-seq@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 2.7864,
        "p95_ms": 3.5548,
        "min_ms": 2.7644,
        "max_ms": 3.5548,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-string-mset",
        "scenario_params": {
          "keys": "500",
          "value_bytes": "64"
        },
        "data_scale": "keys=500"
      }
    },
    {
      "workload": "mset-seq@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 2.8229,
        "p95_ms": 3.1507,
        "min_ms": 2.8062,
        "max_ms": 3.1507,
        "rounds": 3
      },
      "reference": {
        "median_ms": 2.7864,
        "p95_ms": 3.5548,
        "min_ms": 2.7644,
        "max_ms": 3.5548,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-mset",
        "scenario_params": {
          "keys": "500",
          "value_bytes": "64"
        },
        "data_scale": "keys=500"
      }
    },
    {
      "workload": "mset-seq@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 2.6604,
        "p95_ms": 3.114,
        "min_ms": 2.6383,
        "max_ms": 3.114,
        "rounds": 3
      },
      "reference": {
        "median_ms": 2.7864,
        "p95_ms": 3.5548,
        "min_ms": 2.7644,
        "max_ms": 3.5548,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-mset",
        "scenario_params": {
          "keys": "500",
          "value_bytes": "64"
        },
        "data_scale": "keys=500"
      }
    },
    {
      "workload": "incr-seq@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 19.8412,
        "p95_ms": 20.9113,
        "min_ms": 18.3668,
        "max_ms": 20.9113,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-string-incr",
        "scenario_params": {
          "ops": "500"
        },
        "data_scale": "keys=1"
      }
    },
    {
      "workload": "incr-seq@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 17.057,
        "p95_ms": 21.6538,
        "min_ms": 16.3791,
        "max_ms": 21.6538,
        "rounds": 3
      },
      "reference": {
        "median_ms": 19.8412,
        "p95_ms": 20.9113,
        "min_ms": 18.3668,
        "max_ms": 20.9113,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-incr",
        "scenario_params": {
          "ops": "500"
        },
        "data_scale": "keys=1"
      }
    },
    {
      "workload": "incr-seq@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 20.6273,
        "p95_ms": 21.8986,
        "min_ms": 19.653,
        "max_ms": 21.8986,
        "rounds": 3
      },
      "reference": {
        "median_ms": 19.8412,
        "p95_ms": 20.9113,
        "min_ms": 18.3668,
        "max_ms": 20.9113,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-incr",
        "scenario_params": {
          "ops": "500"
        },
        "data_scale": "keys=1"
      }
    },
    {
      "workload": "set-pipeline@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 6.8391,
        "p95_ms": 7.1622,
        "min_ms": 6.646,
        "max_ms": 7.1622,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-pipeline-set",
        "scenario_params": {
          "ops": "500",
          "batch": "500",
          "value_bytes": "64"
        },
        "data_scale": "keys=500"
      }
    },
    {
      "workload": "set-pipeline@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 7.7193,
        "p95_ms": 13.4718,
        "min_ms": 6.6555,
        "max_ms": 13.4718,
        "rounds": 3
      },
      "reference": {
        "median_ms": 6.8391,
        "p95_ms": 7.1622,
        "min_ms": 6.646,
        "max_ms": 7.1622,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-pipeline-set",
        "scenario_params": {
          "ops": "500",
          "batch": "500",
          "value_bytes": "64"
        },
        "data_scale": "keys=500"
      }
    },
    {
      "workload": "set-pipeline@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 7.3131,
        "p95_ms": 7.5808,
        "min_ms": 6.8776,
        "max_ms": 7.5808,
        "rounds": 3
      },
      "reference": {
        "median_ms": 6.8391,
        "p95_ms": 7.1622,
        "min_ms": 6.646,
        "max_ms": 7.1622,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-pipeline-set",
        "scenario_params": {
          "ops": "500",
          "batch": "500",
          "value_bytes": "64"
        },
        "data_scale": "keys=500"
      }
    },
    {
      "workload": "get-pipeline@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 4.9002,
        "p95_ms": 5.436,
        "min_ms": 4.2994,
        "max_ms": 5.436,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-pipeline-get",
        "scenario_params": {
          "ops": "500",
          "batch": "500",
          "value_bytes": "64"
        },
        "data_scale": "keys=500"
      }
    },
    {
      "workload": "get-pipeline@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 4.5912,
        "p95_ms": 19.2963,
        "min_ms": 4.237,
        "max_ms": 19.2963,
        "rounds": 3
      },
      "reference": {
        "median_ms": 4.9002,
        "p95_ms": 5.436,
        "min_ms": 4.2994,
        "max_ms": 5.436,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-pipeline-get",
        "scenario_params": {
          "ops": "500",
          "batch": "500",
          "value_bytes": "64"
        },
        "data_scale": "keys=500"
      }
    },
    {
      "workload": "get-pipeline@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 8.3503,
        "p95_ms": 9.029,
        "min_ms": 7.9755,
        "max_ms": 9.029,
        "rounds": 3
      },
      "reference": {
        "median_ms": 4.9002,
        "p95_ms": 5.436,
        "min_ms": 4.2994,
        "max_ms": 5.436,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-pipeline-get",
        "scenario_params": {
          "ops": "500",
          "batch": "500",
          "value_bytes": "64"
        },
        "data_scale": "keys=500"
      }
    },
    {
      "workload": "pipeline-mixed@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 8.493,
        "p95_ms": 9.3401,
        "min_ms": 8.2391,
        "max_ms": 9.3401,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-pipeline-mixed-families",
        "scenario_params": {
          "ops": "500",
          "batch": "500",
          "value_bytes": "64",
          "families": "SET,GET,INCR,HSET,LPUSH,SADD"
        },
        "data_scale": "keys=500"
      }
    },
    {
      "workload": "pipeline-mixed@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 7.8978,
        "p95_ms": 9.0409,
        "min_ms": 7.3636,
        "max_ms": 9.0409,
        "rounds": 3
      },
      "reference": {
        "median_ms": 8.493,
        "p95_ms": 9.3401,
        "min_ms": 8.2391,
        "max_ms": 9.3401,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-pipeline-mixed-families",
        "scenario_params": {
          "ops": "500",
          "batch": "500",
          "value_bytes": "64",
          "families": "SET,GET,INCR,HSET,LPUSH,SADD"
        },
        "data_scale": "keys=500"
      }
    },
    {
      "workload": "pipeline-mixed@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 8.7783,
        "p95_ms": 9.0591,
        "min_ms": 8.2332,
        "max_ms": 9.0591,
        "rounds": 3
      },
      "reference": {
        "median_ms": 8.493,
        "p95_ms": 9.3401,
        "min_ms": 8.2391,
        "max_ms": 9.3401,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-pipeline-mixed-families",
        "scenario_params": {
          "ops": "500",
          "batch": "500",
          "value_bytes": "64",
          "families": "SET,GET,INCR,HSET,LPUSH,SADD"
        },
        "data_scale": "keys=500"
      }
    },
    {
      "workload": "hash-hset-hget@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 20.2081,
        "p95_ms": 20.6769,
        "min_ms": 19.3938,
        "max_ms": 20.6769,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-hash-hset-hget",
        "scenario_params": {
          "fields": "200"
        },
        "data_scale": "key=1,fields=200"
      }
    },
    {
      "workload": "hash-hset-hget@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 19.6049,
        "p95_ms": 26.8839,
        "min_ms": 18.2389,
        "max_ms": 26.8839,
        "rounds": 3
      },
      "reference": {
        "median_ms": 20.2081,
        "p95_ms": 20.6769,
        "min_ms": 19.3938,
        "max_ms": 20.6769,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-hash-hset-hget",
        "scenario_params": {
          "fields": "200"
        },
        "data_scale": "key=1,fields=200"
      }
    },
    {
      "workload": "hash-hset-hget@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 23.7531,
        "p95_ms": 24.853,
        "min_ms": 22.5221,
        "max_ms": 24.853,
        "rounds": 3
      },
      "reference": {
        "median_ms": 20.2081,
        "p95_ms": 20.6769,
        "min_ms": 19.3938,
        "max_ms": 20.6769,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-hash-hset-hget",
        "scenario_params": {
          "fields": "200"
        },
        "data_scale": "key=1,fields=200"
      }
    },
    {
      "workload": "hash-setnx-hrandfield@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 11.3479,
        "p95_ms": 11.787,
        "min_ms": 9.9873,
        "max_ms": 11.787,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-hash-setnx-hrandfield",
        "scenario_params": {
          "fields": "200"
        },
        "data_scale": "key=1,fields=200"
      }
    },
    {
      "workload": "hash-setnx-hrandfield@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 9.5751,
        "p95_ms": 18.0333,
        "min_ms": 9.4567,
        "max_ms": 18.0333,
        "rounds": 3
      },
      "reference": {
        "median_ms": 11.3479,
        "p95_ms": 11.787,
        "min_ms": 9.9873,
        "max_ms": 11.787,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-hash-setnx-hrandfield",
        "scenario_params": {
          "fields": "200"
        },
        "data_scale": "key=1,fields=200"
      }
    },
    {
      "workload": "hash-setnx-hrandfield@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 11.7753,
        "p95_ms": 38.747,
        "min_ms": 11.5362,
        "max_ms": 38.747,
        "rounds": 3
      },
      "reference": {
        "median_ms": 11.3479,
        "p95_ms": 11.787,
        "min_ms": 9.9873,
        "max_ms": 11.787,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-hash-setnx-hrandfield",
        "scenario_params": {
          "fields": "200"
        },
        "data_scale": "key=1,fields=200"
      }
    },
    {
      "workload": "list-rpush-lrange@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 9.2074,
        "p95_ms": 9.8745,
        "min_ms": 9.0519,
        "max_ms": 9.8745,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-list-rpush-lrange",
        "scenario_params": {
          "elements": "200"
        },
        "data_scale": "key=1,elements=200"
      }
    },
    {
      "workload": "list-rpush-lrange@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 9.3481,
        "p95_ms": 9.537,
        "min_ms": 8.9499,
        "max_ms": 9.537,
        "rounds": 3
      },
      "reference": {
        "median_ms": 9.2074,
        "p95_ms": 9.8745,
        "min_ms": 9.0519,
        "max_ms": 9.8745,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-list-rpush-lrange",
        "scenario_params": {
          "elements": "200"
        },
        "data_scale": "key=1,elements=200"
      }
    },
    {
      "workload": "list-rpush-lrange@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 10.918,
        "p95_ms": 10.9926,
        "min_ms": 10.3025,
        "max_ms": 10.9926,
        "rounds": 3
      },
      "reference": {
        "median_ms": 9.2074,
        "p95_ms": 9.8745,
        "min_ms": 9.0519,
        "max_ms": 9.8745,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-list-rpush-lrange",
        "scenario_params": {
          "elements": "200"
        },
        "data_scale": "key=1,elements=200"
      }
    },
    {
      "workload": "set-sadd-smembers@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 9.1811,
        "p95_ms": 10.9256,
        "min_ms": 9.168,
        "max_ms": 10.9256,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-set-sadd-smembers",
        "scenario_params": {
          "members": "200"
        },
        "data_scale": "key=1,members=200"
      }
    },
    {
      "workload": "set-sadd-smembers@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 9.9454,
        "p95_ms": 13.1965,
        "min_ms": 8.572,
        "max_ms": 13.1965,
        "rounds": 3
      },
      "reference": {
        "median_ms": 9.1811,
        "p95_ms": 10.9256,
        "min_ms": 9.168,
        "max_ms": 10.9256,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-set-sadd-smembers",
        "scenario_params": {
          "members": "200"
        },
        "data_scale": "key=1,members=200"
      }
    },
    {
      "workload": "set-sadd-smembers@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 10.1392,
        "p95_ms": 17.4994,
        "min_ms": 9.6569,
        "max_ms": 17.4994,
        "rounds": 3
      },
      "reference": {
        "median_ms": 9.1811,
        "p95_ms": 10.9256,
        "min_ms": 9.168,
        "max_ms": 10.9256,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-set-sadd-smembers",
        "scenario_params": {
          "members": "200"
        },
        "data_scale": "key=1,members=200"
      }
    },
    {
      "workload": "zset-zadd-zrange@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 10.5265,
        "p95_ms": 11.1637,
        "min_ms": 10.0639,
        "max_ms": 11.1637,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-zset-zadd-zrange",
        "scenario_params": {
          "members": "200",
          "withscores": "true"
        },
        "data_scale": "key=1,members=200"
      }
    },
    {
      "workload": "zset-zadd-zrange@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 9.3734,
        "p95_ms": 9.7579,
        "min_ms": 9.2562,
        "max_ms": 9.7579,
        "rounds": 3
      },
      "reference": {
        "median_ms": 10.5265,
        "p95_ms": 11.1637,
        "min_ms": 10.0639,
        "max_ms": 11.1637,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-zset-zadd-zrange",
        "scenario_params": {
          "members": "200",
          "withscores": "true"
        },
        "data_scale": "key=1,members=200"
      }
    },
    {
      "workload": "zset-zadd-zrange@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 11.1426,
        "p95_ms": 12.3745,
        "min_ms": 11.0431,
        "max_ms": 12.3745,
        "rounds": 3
      },
      "reference": {
        "median_ms": 10.5265,
        "p95_ms": 11.1637,
        "min_ms": 10.0639,
        "max_ms": 11.1637,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-zset-zadd-zrange",
        "scenario_params": {
          "members": "200",
          "withscores": "true"
        },
        "data_scale": "key=1,members=200"
      }
    },
    {
      "workload": "streams-xadd-xrange@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 19.2264,
        "p95_ms": 19.4023,
        "min_ms": 18.4181,
        "max_ms": 19.4023,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-stream-xadd-xrange",
        "scenario_params": {
          "entries": "200",
          "fields": "1"
        },
        "data_scale": "key=1,entries=200"
      }
    },
    {
      "workload": "streams-xadd-xrange@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 16.2798,
        "p95_ms": 39.1696,
        "min_ms": 15.6314,
        "max_ms": 39.1696,
        "rounds": 3
      },
      "reference": {
        "median_ms": 19.2264,
        "p95_ms": 19.4023,
        "min_ms": 18.4181,
        "max_ms": 19.4023,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-stream-xadd-xrange",
        "scenario_params": {
          "entries": "200",
          "fields": "1"
        },
        "data_scale": "key=1,entries=200"
      }
    },
    {
      "workload": "streams-xadd-xrange@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 17.1952,
        "p95_ms": 18.8972,
        "min_ms": 16.977,
        "max_ms": 18.8972,
        "rounds": 3
      },
      "reference": {
        "median_ms": 19.2264,
        "p95_ms": 19.4023,
        "min_ms": 18.4181,
        "max_ms": 19.4023,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-stream-xadd-xrange",
        "scenario_params": {
          "entries": "200",
          "fields": "1"
        },
        "data_scale": "key=1,entries=200"
      }
    },
    {
      "workload": "pubsub-roundtrip@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 7.1565,
        "p95_ms": 7.1803,
        "min_ms": 5.6772,
        "max_ms": 7.1803,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-pubsub-publish-deliver",
        "scenario_params": {
          "messages": "100",
          "channels": "1"
        },
        "data_scale": "keys=0,channel=bench:news"
      }
    },
    {
      "workload": "pubsub-roundtrip@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 5.118,
        "p95_ms": 14.9731,
        "min_ms": 4.8437,
        "max_ms": 14.9731,
        "rounds": 3
      },
      "reference": {
        "median_ms": 7.1565,
        "p95_ms": 7.1803,
        "min_ms": 5.6772,
        "max_ms": 7.1803,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-pubsub-publish-deliver",
        "scenario_params": {
          "messages": "100",
          "channels": "1"
        },
        "data_scale": "keys=0,channel=bench:news"
      }
    },
    {
      "workload": "pubsub-roundtrip@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 6.7909,
        "p95_ms": 6.8478,
        "min_ms": 6.5197,
        "max_ms": 6.8478,
        "rounds": 3
      },
      "reference": {
        "median_ms": 7.1565,
        "p95_ms": 7.1803,
        "min_ms": 5.6772,
        "max_ms": 7.1803,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-pubsub-publish-deliver",
        "scenario_params": {
          "messages": "100",
          "channels": "1"
        },
        "data_scale": "keys=0,channel=bench:news"
      }
    },
    {
      "workload": "blpop-roundtrip@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 12.1697,
        "p95_ms": 18.8009,
        "min_ms": 12.0213,
        "max_ms": 18.8009,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-list-blpop-push",
        "scenario_params": {
          "roundtrips": "100",
          "timeout_seconds": "5"
        },
        "data_scale": "keys=0,list=bench:blocking"
      }
    },
    {
      "workload": "blpop-roundtrip@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 10.9989,
        "p95_ms": 11.5787,
        "min_ms": 10.9679,
        "max_ms": 11.5787,
        "rounds": 3
      },
      "reference": {
        "median_ms": 12.1697,
        "p95_ms": 18.8009,
        "min_ms": 12.0213,
        "max_ms": 18.8009,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-list-blpop-push",
        "scenario_params": {
          "roundtrips": "100",
          "timeout_seconds": "5"
        },
        "data_scale": "keys=0,list=bench:blocking"
      }
    },
    {
      "workload": "blpop-roundtrip@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 12.7658,
        "p95_ms": 12.9821,
        "min_ms": 12.4373,
        "max_ms": 12.9821,
        "rounds": 3
      },
      "reference": {
        "median_ms": 12.1697,
        "p95_ms": 18.8009,
        "min_ms": 12.0213,
        "max_ms": 18.8009,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-list-blpop-push",
        "scenario_params": {
          "roundtrips": "100",
          "timeout_seconds": "5"
        },
        "data_scale": "keys=0,list=bench:blocking"
      }
    },
    {
      "workload": "scan-full@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 2.0096,
        "p95_ms": 2.0802,
        "min_ms": 1.781,
        "max_ms": 2.0802,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-scan-full-keyspace",
        "scenario_params": {
          "keys": "200",
          "count_hint": "50"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "scan-full@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 1.8396,
        "p95_ms": 1.8529,
        "min_ms": 1.7809,
        "max_ms": 1.8529,
        "rounds": 3
      },
      "reference": {
        "median_ms": 2.0096,
        "p95_ms": 2.0802,
        "min_ms": 1.781,
        "max_ms": 2.0802,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-scan-full-keyspace",
        "scenario_params": {
          "keys": "200",
          "count_hint": "50"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "scan-full@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 1.765,
        "p95_ms": 1.7669,
        "min_ms": 1.7306,
        "max_ms": 1.7669,
        "rounds": 3
      },
      "reference": {
        "median_ms": 2.0096,
        "p95_ms": 2.0802,
        "min_ms": 1.781,
        "max_ms": 2.0802,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-scan-full-keyspace",
        "scenario_params": {
          "keys": "200",
          "count_hint": "50"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "ping-concurrent@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 19.4982,
        "p95_ms": 19.7657,
        "min_ms": 18.8661,
        "max_ms": 19.7657,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-ping-concurrent",
        "scenario_params": {
          "ops": "800",
          "connections": "8"
        },
        "data_scale": "connections=8"
      }
    },
    {
      "workload": "ping-concurrent@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 22.0237,
        "p95_ms": 39.0033,
        "min_ms": 21.6722,
        "max_ms": 39.0033,
        "rounds": 3
      },
      "reference": {
        "median_ms": 19.4982,
        "p95_ms": 19.7657,
        "min_ms": 18.8661,
        "max_ms": 19.7657,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-ping-concurrent",
        "scenario_params": {
          "ops": "800",
          "connections": "8"
        },
        "data_scale": "connections=8"
      }
    },
    {
      "workload": "ping-concurrent@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 22.5961,
        "p95_ms": 23.5984,
        "min_ms": 21.6717,
        "max_ms": 23.5984,
        "rounds": 3
      },
      "reference": {
        "median_ms": 19.4982,
        "p95_ms": 19.7657,
        "min_ms": 18.8661,
        "max_ms": 19.7657,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-ping-concurrent",
        "scenario_params": {
          "ops": "800",
          "connections": "8"
        },
        "data_scale": "connections=8"
      }
    },
    {
      "workload": "stream-group@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 37.8233,
        "p95_ms": 40.106,
        "min_ms": 33.9377,
        "max_ms": 40.106,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-stream-consumer-group",
        "scenario_params": {
          "entries": "100",
          "group": "workers",
          "consumer": "c1"
        },
        "data_scale": "entries=100"
      }
    },
    {
      "workload": "stream-group@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 27.672,
        "p95_ms": 31.2676,
        "min_ms": 26.9637,
        "max_ms": 31.2676,
        "rounds": 3
      },
      "reference": {
        "median_ms": 37.8233,
        "p95_ms": 40.106,
        "min_ms": 33.9377,
        "max_ms": 40.106,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-stream-consumer-group",
        "scenario_params": {
          "entries": "100",
          "group": "workers",
          "consumer": "c1"
        },
        "data_scale": "entries=100"
      }
    },
    {
      "workload": "stream-group@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 33.4509,
        "p95_ms": 35.5621,
        "min_ms": 31.8628,
        "max_ms": 35.5621,
        "rounds": 3
      },
      "reference": {
        "median_ms": 37.8233,
        "p95_ms": 40.106,
        "min_ms": 33.9377,
        "max_ms": 40.106,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-stream-consumer-group",
        "scenario_params": {
          "entries": "100",
          "group": "workers",
          "consumer": "c1"
        },
        "data_scale": "entries=100"
      }
    },
    {
      "workload": "ttl-setex-expire@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 1114.9241,
        "p95_ms": 1122.318,
        "min_ms": 1113.8467,
        "max_ms": 1122.318,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-ttl-setex-expire",
        "scenario_params": {
          "keys": "30",
          "ttl_seconds": "1",
          "wait_ms": "1100"
        },
        "data_scale": "keys=30,value_bytes=64"
      }
    },
    {
      "workload": "ttl-setex-expire@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 1117.011,
        "p95_ms": 1118.3507,
        "min_ms": 1114.9921,
        "max_ms": 1118.3507,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1114.9241,
        "p95_ms": 1122.318,
        "min_ms": 1113.8467,
        "max_ms": 1122.318,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-ttl-setex-expire",
        "scenario_params": {
          "keys": "30",
          "ttl_seconds": "1",
          "wait_ms": "1100"
        },
        "data_scale": "keys=30,value_bytes=64"
      }
    },
    {
      "workload": "ttl-setex-expire@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 1118.3485,
        "p95_ms": 1126.5192,
        "min_ms": 1116.8186,
        "max_ms": 1126.5192,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1114.9241,
        "p95_ms": 1122.318,
        "min_ms": 1113.8467,
        "max_ms": 1122.318,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-ttl-setex-expire",
        "scenario_params": {
          "keys": "30",
          "ttl_seconds": "1",
          "wait_ms": "1100"
        },
        "data_scale": "keys=30,value_bytes=64"
      }
    },
    {
      "workload": "multi-exec@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 11.4202,
        "p95_ms": 11.5432,
        "min_ms": 11.3206,
        "max_ms": 11.5432,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-txn-multi-exec",
        "scenario_params": {
          "commands": "100",
          "probe": "SET"
        },
        "data_scale": "keys=100,value_bytes=64"
      }
    },
    {
      "workload": "multi-exec@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 11.2471,
        "p95_ms": 11.7086,
        "min_ms": 8.8024,
        "max_ms": 11.7086,
        "rounds": 3
      },
      "reference": {
        "median_ms": 11.4202,
        "p95_ms": 11.5432,
        "min_ms": 11.3206,
        "max_ms": 11.5432,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-txn-multi-exec",
        "scenario_params": {
          "commands": "100",
          "probe": "SET"
        },
        "data_scale": "keys=100,value_bytes=64"
      }
    },
    {
      "workload": "multi-exec@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 13.0792,
        "p95_ms": 13.2777,
        "min_ms": 11.8366,
        "max_ms": 13.2777,
        "rounds": 3
      },
      "reference": {
        "median_ms": 11.4202,
        "p95_ms": 11.5432,
        "min_ms": 11.3206,
        "max_ms": 11.5432,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-txn-multi-exec",
        "scenario_params": {
          "commands": "100",
          "probe": "SET"
        },
        "data_scale": "keys=100,value_bytes=64"
      }
    },
    {
      "workload": "mget-seq@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 0.9114,
        "p95_ms": 1.4066,
        "min_ms": 0.7664,
        "max_ms": 1.4066,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-string-mget",
        "scenario_params": {
          "keys": "200",
          "value_bytes": "64"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "mget-seq@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 0.7097,
        "p95_ms": 0.7772,
        "min_ms": 0.7085,
        "max_ms": 0.7772,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.9114,
        "p95_ms": 1.4066,
        "min_ms": 0.7664,
        "max_ms": 1.4066,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-mget",
        "scenario_params": {
          "keys": "200",
          "value_bytes": "64"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "mget-seq@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 1.2625,
        "p95_ms": 1.4844,
        "min_ms": 1.0984,
        "max_ms": 1.4844,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.9114,
        "p95_ms": 1.4066,
        "min_ms": 0.7664,
        "max_ms": 1.4066,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-mget",
        "scenario_params": {
          "keys": "200",
          "value_bytes": "64"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "append-getrange@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 19.2634,
        "p95_ms": 31.0413,
        "min_ms": 18.1065,
        "max_ms": 31.0413,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-string-append-getrange",
        "scenario_params": {
          "appends": "200",
          "chunk_bytes": "16"
        },
        "data_scale": "key=1"
      }
    },
    {
      "workload": "append-getrange@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 13.6167,
        "p95_ms": 16.7482,
        "min_ms": 13.3274,
        "max_ms": 16.7482,
        "rounds": 3
      },
      "reference": {
        "median_ms": 19.2634,
        "p95_ms": 31.0413,
        "min_ms": 18.1065,
        "max_ms": 31.0413,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-append-getrange",
        "scenario_params": {
          "appends": "200",
          "chunk_bytes": "16"
        },
        "data_scale": "key=1"
      }
    },
    {
      "workload": "append-getrange@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 18.8839,
        "p95_ms": 25.1975,
        "min_ms": 17.9229,
        "max_ms": 25.1975,
        "rounds": 3
      },
      "reference": {
        "median_ms": 19.2634,
        "p95_ms": 31.0413,
        "min_ms": 18.1065,
        "max_ms": 31.0413,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-append-getrange",
        "scenario_params": {
          "appends": "200",
          "chunk_bytes": "16"
        },
        "data_scale": "key=1"
      }
    },
    {
      "workload": "getdel-getex@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 34.9813,
        "p95_ms": 35.2452,
        "min_ms": 32.9034,
        "max_ms": 35.2452,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-string-getdel-getex",
        "scenario_params": {
          "keys": "200",
          "ttl_seconds": "100"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "getdel-getex@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 27.0733,
        "p95_ms": 28.3792,
        "min_ms": 26.7066,
        "max_ms": 28.3792,
        "rounds": 3
      },
      "reference": {
        "median_ms": 34.9813,
        "p95_ms": 35.2452,
        "min_ms": 32.9034,
        "max_ms": 35.2452,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-getdel-getex",
        "scenario_params": {
          "keys": "200",
          "ttl_seconds": "100"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "getdel-getex@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 33.5108,
        "p95_ms": 34.3708,
        "min_ms": 31.8756,
        "max_ms": 34.3708,
        "rounds": 3
      },
      "reference": {
        "median_ms": 34.9813,
        "p95_ms": 35.2452,
        "min_ms": 32.9034,
        "max_ms": 35.2452,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-getdel-getex",
        "scenario_params": {
          "keys": "200",
          "ttl_seconds": "100"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "set-options@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 38.2137,
        "p95_ms": 42.2782,
        "min_ms": 35.8059,
        "max_ms": 42.2782,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-string-set-options",
        "scenario_params": {
          "keys": "200",
          "options": "NX,XX,GET"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "set-options@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 34.4574,
        "p95_ms": 67.5115,
        "min_ms": 30.5561,
        "max_ms": 67.5115,
        "rounds": 3
      },
      "reference": {
        "median_ms": 38.2137,
        "p95_ms": 42.2782,
        "min_ms": 35.8059,
        "max_ms": 42.2782,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-set-options",
        "scenario_params": {
          "keys": "200",
          "options": "NX,XX,GET"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "set-options@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 37.8373,
        "p95_ms": 38.4276,
        "min_ms": 37.4577,
        "max_ms": 38.4276,
        "rounds": 3
      },
      "reference": {
        "median_ms": 38.2137,
        "p95_ms": 42.2782,
        "min_ms": 35.8059,
        "max_ms": 42.2782,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-set-options",
        "scenario_params": {
          "keys": "200",
          "options": "NX,XX,GET"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "exists-type@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 29.7157,
        "p95_ms": 31.9542,
        "min_ms": 29.2531,
        "max_ms": 31.9542,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-key-exists-type",
        "scenario_params": {
          "keys": "200"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "exists-type@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 25.8955,
        "p95_ms": 29.4773,
        "min_ms": 23.2986,
        "max_ms": 29.4773,
        "rounds": 3
      },
      "reference": {
        "median_ms": 29.7157,
        "p95_ms": 31.9542,
        "min_ms": 29.2531,
        "max_ms": 31.9542,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-key-exists-type",
        "scenario_params": {
          "keys": "200"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "exists-type@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 31.3968,
        "p95_ms": 33.8547,
        "min_ms": 28.0706,
        "max_ms": 33.8547,
        "rounds": 3
      },
      "reference": {
        "median_ms": 29.7157,
        "p95_ms": 31.9542,
        "min_ms": 29.2531,
        "max_ms": 31.9542,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-key-exists-type",
        "scenario_params": {
          "keys": "200"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "expire-persist@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 42.0139,
        "p95_ms": 44.654,
        "min_ms": 38.6544,
        "max_ms": 44.654,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-key-expire-persist",
        "scenario_params": {
          "keys": "200",
          "ttl_seconds": "100"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "expire-persist@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 40.6483,
        "p95_ms": 41.5155,
        "min_ms": 39.8047,
        "max_ms": 41.5155,
        "rounds": 3
      },
      "reference": {
        "median_ms": 42.0139,
        "p95_ms": 44.654,
        "min_ms": 38.6544,
        "max_ms": 44.654,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-key-expire-persist",
        "scenario_params": {
          "keys": "200",
          "ttl_seconds": "100"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "expire-persist@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 55.4902,
        "p95_ms": 56.6949,
        "min_ms": 46.7646,
        "max_ms": 56.6949,
        "rounds": 3
      },
      "reference": {
        "median_ms": 42.0139,
        "p95_ms": 44.654,
        "min_ms": 38.6544,
        "max_ms": 44.654,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-key-expire-persist",
        "scenario_params": {
          "keys": "200",
          "ttl_seconds": "100"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "hash-hgetall-hdel@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 1.7151,
        "p95_ms": 2.3942,
        "min_ms": 1.6958,
        "max_ms": 2.3942,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-hash-hgetall-hdel",
        "scenario_params": {
          "fields": "200"
        },
        "data_scale": "key=1,fields=200"
      }
    },
    {
      "workload": "hash-hgetall-hdel@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 1.9591,
        "p95_ms": 3.4538,
        "min_ms": 1.4574,
        "max_ms": 3.4538,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1.7151,
        "p95_ms": 2.3942,
        "min_ms": 1.6958,
        "max_ms": 2.3942,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-hash-hgetall-hdel",
        "scenario_params": {
          "fields": "200"
        },
        "data_scale": "key=1,fields=200"
      }
    },
    {
      "workload": "hash-hgetall-hdel@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 7.2432,
        "p95_ms": 13.9308,
        "min_ms": 2.4839,
        "max_ms": 13.9308,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1.7151,
        "p95_ms": 2.3942,
        "min_ms": 1.6958,
        "max_ms": 2.3942,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-hash-hgetall-hdel",
        "scenario_params": {
          "fields": "200"
        },
        "data_scale": "key=1,fields=200"
      }
    },
    {
      "workload": "hash-keys-values@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 5.8955,
        "p95_ms": 6.4759,
        "min_ms": 5.4855,
        "max_ms": 6.4759,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-hash-hkeys-hvals-hlen-hincrby",
        "scenario_params": {
          "fields": "200",
          "repeat": "10",
          "commands": "HKEYS,HVALS,HLEN,HINCRBY"
        },
        "data_scale": "key=1,fields=200"
      }
    },
    {
      "workload": "hash-keys-values@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 5.0771,
        "p95_ms": 5.126,
        "min_ms": 4.5327,
        "max_ms": 5.126,
        "rounds": 3
      },
      "reference": {
        "median_ms": 5.8955,
        "p95_ms": 6.4759,
        "min_ms": 5.4855,
        "max_ms": 6.4759,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-hash-hkeys-hvals-hlen-hincrby",
        "scenario_params": {
          "fields": "200",
          "repeat": "10",
          "commands": "HKEYS,HVALS,HLEN,HINCRBY"
        },
        "data_scale": "key=1,fields=200"
      }
    },
    {
      "workload": "hash-keys-values@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 6.3207,
        "p95_ms": 8.0564,
        "min_ms": 6.2409,
        "max_ms": 8.0564,
        "rounds": 3
      },
      "reference": {
        "median_ms": 5.8955,
        "p95_ms": 6.4759,
        "min_ms": 5.4855,
        "max_ms": 6.4759,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-hash-hkeys-hvals-hlen-hincrby",
        "scenario_params": {
          "fields": "200",
          "repeat": "10",
          "commands": "HKEYS,HVALS,HLEN,HINCRBY"
        },
        "data_scale": "key=1,fields=200"
      }
    },
    {
      "workload": "list-lpush-lpop@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 36.0396,
        "p95_ms": 37.3167,
        "min_ms": 33.6322,
        "max_ms": 37.3167,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-list-lpush-lpop",
        "scenario_params": {
          "elements": "200"
        },
        "data_scale": "key=1,elements=200"
      }
    },
    {
      "workload": "list-lpush-lpop@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 36.0199,
        "p95_ms": 41.0753,
        "min_ms": 31.1818,
        "max_ms": 41.0753,
        "rounds": 3
      },
      "reference": {
        "median_ms": 36.0396,
        "p95_ms": 37.3167,
        "min_ms": 33.6322,
        "max_ms": 37.3167,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-list-lpush-lpop",
        "scenario_params": {
          "elements": "200"
        },
        "data_scale": "key=1,elements=200"
      }
    },
    {
      "workload": "list-lpush-lpop@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 44.9514,
        "p95_ms": 48.7082,
        "min_ms": 41.3444,
        "max_ms": 48.7082,
        "rounds": 3
      },
      "reference": {
        "median_ms": 36.0396,
        "p95_ms": 37.3167,
        "min_ms": 33.6322,
        "max_ms": 37.3167,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-list-lpush-lpop",
        "scenario_params": {
          "elements": "200"
        },
        "data_scale": "key=1,elements=200"
      }
    },
    {
      "workload": "set-algebra@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 10.0855,
        "p95_ms": 13.4603,
        "min_ms": 10.0816,
        "max_ms": 13.4603,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-set-sinter-sunion-sdiff",
        "scenario_params": {
          "members": "200",
          "repeat": "10"
        },
        "data_scale": "keys=2,members=200"
      }
    },
    {
      "workload": "set-algebra@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 7.3383,
        "p95_ms": 8.1874,
        "min_ms": 7.2641,
        "max_ms": 8.1874,
        "rounds": 3
      },
      "reference": {
        "median_ms": 10.0855,
        "p95_ms": 13.4603,
        "min_ms": 10.0816,
        "max_ms": 13.4603,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-set-sinter-sunion-sdiff",
        "scenario_params": {
          "members": "200",
          "repeat": "10"
        },
        "data_scale": "keys=2,members=200"
      }
    },
    {
      "workload": "set-algebra@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 8.8249,
        "p95_ms": 9.3898,
        "min_ms": 6.7397,
        "max_ms": 9.3898,
        "rounds": 3
      },
      "reference": {
        "median_ms": 10.0855,
        "p95_ms": 13.4603,
        "min_ms": 10.0816,
        "max_ms": 13.4603,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-set-sinter-sunion-sdiff",
        "scenario_params": {
          "members": "200",
          "repeat": "10"
        },
        "data_scale": "keys=2,members=200"
      }
    },
    {
      "workload": "set-membership-ops@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 10.4475,
        "p95_ms": 10.9097,
        "min_ms": 9.8916,
        "max_ms": 10.9097,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-set-membership-cardinality",
        "scenario_params": {
          "members": "200",
          "repeat": "10",
          "commands": "SMISMEMBER,SINTERCARD,SRANDMEMBER"
        },
        "data_scale": "keys=2,members=200"
      }
    },
    {
      "workload": "set-membership-ops@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 10.4325,
        "p95_ms": 10.8284,
        "min_ms": 9.5814,
        "max_ms": 10.8284,
        "rounds": 3
      },
      "reference": {
        "median_ms": 10.4475,
        "p95_ms": 10.9097,
        "min_ms": 9.8916,
        "max_ms": 10.9097,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-set-membership-cardinality",
        "scenario_params": {
          "members": "200",
          "repeat": "10",
          "commands": "SMISMEMBER,SINTERCARD,SRANDMEMBER"
        },
        "data_scale": "keys=2,members=200"
      }
    },
    {
      "workload": "set-membership-ops@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 10.151,
        "p95_ms": 11.1241,
        "min_ms": 9.9451,
        "max_ms": 11.1241,
        "rounds": 3
      },
      "reference": {
        "median_ms": 10.4475,
        "p95_ms": 10.9097,
        "min_ms": 9.8916,
        "max_ms": 10.9097,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-set-membership-cardinality",
        "scenario_params": {
          "members": "200",
          "repeat": "10",
          "commands": "SMISMEMBER,SINTERCARD,SRANDMEMBER"
        },
        "data_scale": "keys=2,members=200"
      }
    },
    {
      "workload": "zset-pop-ops@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 1.7185,
        "p95_ms": 2.642,
        "min_ms": 1.361,
        "max_ms": 2.642,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-zset-pop-random-score",
        "scenario_params": {
          "members": "200",
          "commands": "ZMSCORE,ZRANDMEMBER,ZPOPMIN,ZPOPMAX"
        },
        "data_scale": "key=1,members=200"
      }
    },
    {
      "workload": "zset-pop-ops@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 1.2851,
        "p95_ms": 1.8194,
        "min_ms": 1.0278,
        "max_ms": 1.8194,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1.7185,
        "p95_ms": 2.642,
        "min_ms": 1.361,
        "max_ms": 2.642,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-zset-pop-random-score",
        "scenario_params": {
          "members": "200",
          "commands": "ZMSCORE,ZRANDMEMBER,ZPOPMIN,ZPOPMAX"
        },
        "data_scale": "key=1,members=200"
      }
    },
    {
      "workload": "zset-pop-ops@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 1.2436,
        "p95_ms": 1.3402,
        "min_ms": 1.1015,
        "max_ms": 1.3402,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1.7185,
        "p95_ms": 2.642,
        "min_ms": 1.361,
        "max_ms": 2.642,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-zset-pop-random-score",
        "scenario_params": {
          "members": "200",
          "commands": "ZMSCORE,ZRANDMEMBER,ZPOPMIN,ZPOPMAX"
        },
        "data_scale": "key=1,members=200"
      }
    },
    {
      "workload": "zset-range-queries@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 7.5936,
        "p95_ms": 8.5845,
        "min_ms": 7.5905,
        "max_ms": 8.5845,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-zset-rangebyscore-rangebylex",
        "scenario_params": {
          "members": "200",
          "repeat": "10",
          "commands": "ZCOUNT,ZRANGEBYSCORE,ZREVRANGEBYSCORE,ZRANGEBYLEX"
        },
        "data_scale": "keys=2,members=200"
      }
    },
    {
      "workload": "zset-range-queries@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 5.5549,
        "p95_ms": 7.5718,
        "min_ms": 4.14,
        "max_ms": 7.5718,
        "rounds": 3
      },
      "reference": {
        "median_ms": 7.5936,
        "p95_ms": 8.5845,
        "min_ms": 7.5905,
        "max_ms": 8.5845,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-zset-rangebyscore-rangebylex",
        "scenario_params": {
          "members": "200",
          "repeat": "10",
          "commands": "ZCOUNT,ZRANGEBYSCORE,ZREVRANGEBYSCORE,ZRANGEBYLEX"
        },
        "data_scale": "keys=2,members=200"
      }
    },
    {
      "workload": "zset-range-queries@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 8.0681,
        "p95_ms": 13.4685,
        "min_ms": 7.531,
        "max_ms": 13.4685,
        "rounds": 3
      },
      "reference": {
        "median_ms": 7.5936,
        "p95_ms": 8.5845,
        "min_ms": 7.5905,
        "max_ms": 8.5845,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-zset-rangebyscore-rangebylex",
        "scenario_params": {
          "members": "200",
          "repeat": "10",
          "commands": "ZCOUNT,ZRANGEBYSCORE,ZREVRANGEBYSCORE,ZRANGEBYLEX"
        },
        "data_scale": "keys=2,members=200"
      }
    },
    {
      "workload": "large-collection-read@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 33.3981,
        "p95_ms": 34.6801,
        "min_ms": 26.9285,
        "max_ms": 34.6801,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-large-collection-full-read",
        "scenario_params": {
          "members": "2000",
          "repeat": "10",
          "commands": "SMEMBERS,ZRANGE"
        },
        "data_scale": "keys=2,members=2000"
      }
    },
    {
      "workload": "large-collection-read@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 16.0625,
        "p95_ms": 19.7688,
        "min_ms": 13.8931,
        "max_ms": 19.7688,
        "rounds": 3
      },
      "reference": {
        "median_ms": 33.3981,
        "p95_ms": 34.6801,
        "min_ms": 26.9285,
        "max_ms": 34.6801,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-large-collection-full-read",
        "scenario_params": {
          "members": "2000",
          "repeat": "10",
          "commands": "SMEMBERS,ZRANGE"
        },
        "data_scale": "keys=2,members=2000"
      }
    },
    {
      "workload": "large-collection-read@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 16.7485,
        "p95_ms": 16.8128,
        "min_ms": 15.8311,
        "max_ms": 16.8128,
        "rounds": 3
      },
      "reference": {
        "median_ms": 33.3981,
        "p95_ms": 34.6801,
        "min_ms": 26.9285,
        "max_ms": 34.6801,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-large-collection-full-read",
        "scenario_params": {
          "members": "2000",
          "repeat": "10",
          "commands": "SMEMBERS,ZRANGE"
        },
        "data_scale": "keys=2,members=2000"
      }
    },
    {
      "workload": "large-hash-list-read@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 41.0299,
        "p95_ms": 41.7015,
        "min_ms": 40.4431,
        "max_ms": 41.7015,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-large-hash-list-full-read",
        "scenario_params": {
          "members": "2000",
          "repeat": "10",
          "commands": "HGETALL,LRANGE"
        },
        "data_scale": "keys=2,members=2000"
      }
    },
    {
      "workload": "large-hash-list-read@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 17.1437,
        "p95_ms": 17.3003,
        "min_ms": 17.1283,
        "max_ms": 17.3003,
        "rounds": 3
      },
      "reference": {
        "median_ms": 41.0299,
        "p95_ms": 41.7015,
        "min_ms": 40.4431,
        "max_ms": 41.7015,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-large-hash-list-full-read",
        "scenario_params": {
          "members": "2000",
          "repeat": "10",
          "commands": "HGETALL,LRANGE"
        },
        "data_scale": "keys=2,members=2000"
      }
    },
    {
      "workload": "large-hash-list-read@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 20.4265,
        "p95_ms": 31.2874,
        "min_ms": 20.3365,
        "max_ms": 31.2874,
        "rounds": 3
      },
      "reference": {
        "median_ms": 41.0299,
        "p95_ms": 41.7015,
        "min_ms": 40.4431,
        "max_ms": 41.7015,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-large-hash-list-full-read",
        "scenario_params": {
          "members": "2000",
          "repeat": "10",
          "commands": "HGETALL,LRANGE"
        },
        "data_scale": "keys=2,members=2000"
      }
    },
    {
      "workload": "resp3-hello@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 5.0222,
        "p95_ms": 5.2057,
        "min_ms": 4.875,
        "max_ms": 5.2057,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-resp3-hello-roundtrip",
        "scenario_params": {
          "repeat": "10",
          "commands": "HELLO,GET,SMEMBERS,PING",
          "value_bytes": "64"
        },
        "data_scale": "keys=200,members=200"
      }
    },
    {
      "workload": "resp3-hello@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 4.7364,
        "p95_ms": 4.9424,
        "min_ms": 3.5469,
        "max_ms": 4.9424,
        "rounds": 3
      },
      "reference": {
        "median_ms": 5.0222,
        "p95_ms": 5.2057,
        "min_ms": 4.875,
        "max_ms": 5.2057,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-resp3-hello-roundtrip",
        "scenario_params": {
          "repeat": "10",
          "commands": "HELLO,GET,SMEMBERS,PING",
          "value_bytes": "64"
        },
        "data_scale": "keys=200,members=200"
      }
    },
    {
      "workload": "resp3-hello@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 4.2895,
        "p95_ms": 4.5794,
        "min_ms": 3.3138,
        "max_ms": 4.5794,
        "rounds": 3
      },
      "reference": {
        "median_ms": 5.0222,
        "p95_ms": 5.2057,
        "min_ms": 4.875,
        "max_ms": 5.2057,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-resp3-hello-roundtrip",
        "scenario_params": {
          "repeat": "10",
          "commands": "HELLO,GET,SMEMBERS,PING",
          "value_bytes": "64"
        },
        "data_scale": "keys=200,members=200"
      }
    },
    {
      "workload": "expire-sweep@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 257.489,
        "p95_ms": 259.3926,
        "min_ms": 252.5347,
        "max_ms": 259.3926,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-expire-sweep",
        "scenario_params": {
          "keys": "500",
          "ttl_ms": "50",
          "wait_ms": "200",
          "value_bytes": "64"
        },
        "data_scale": "keys=500,value_bytes=64"
      }
    },
    {
      "workload": "expire-sweep@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 262.0549,
        "p95_ms": 277.1995,
        "min_ms": 252.7142,
        "max_ms": 277.1995,
        "rounds": 3
      },
      "reference": {
        "median_ms": 257.489,
        "p95_ms": 259.3926,
        "min_ms": 252.5347,
        "max_ms": 259.3926,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-expire-sweep",
        "scenario_params": {
          "keys": "500",
          "ttl_ms": "50",
          "wait_ms": "200",
          "value_bytes": "64"
        },
        "data_scale": "keys=500,value_bytes=64"
      }
    },
    {
      "workload": "expire-sweep@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 265.6154,
        "p95_ms": 281.1498,
        "min_ms": 261.8032,
        "max_ms": 281.1498,
        "rounds": 3
      },
      "reference": {
        "median_ms": 257.489,
        "p95_ms": 259.3926,
        "min_ms": 252.5347,
        "max_ms": 259.3926,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-expire-sweep",
        "scenario_params": {
          "keys": "500",
          "ttl_ms": "50",
          "wait_ms": "200",
          "value_bytes": "64"
        },
        "data_scale": "keys=500,value_bytes=64"
      }
    },
    {
      "workload": "multi-exec-mixed@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 9.5853,
        "p95_ms": 10.6022,
        "min_ms": 9.351,
        "max_ms": 10.6022,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-txn-multi-exec-families",
        "scenario_params": {
          "commands": "100",
          "families": "SET,GET,INCR,HSET,LPUSH,SADD",
          "value_bytes": "64"
        },
        "data_scale": "keys=100,value_bytes=64"
      }
    },
    {
      "workload": "multi-exec-mixed@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 8.8141,
        "p95_ms": 9.0676,
        "min_ms": 8.6885,
        "max_ms": 9.0676,
        "rounds": 3
      },
      "reference": {
        "median_ms": 9.5853,
        "p95_ms": 10.6022,
        "min_ms": 9.351,
        "max_ms": 10.6022,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-txn-multi-exec-families",
        "scenario_params": {
          "commands": "100",
          "families": "SET,GET,INCR,HSET,LPUSH,SADD",
          "value_bytes": "64"
        },
        "data_scale": "keys=100,value_bytes=64"
      }
    },
    {
      "workload": "multi-exec-mixed@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 10.1203,
        "p95_ms": 10.382,
        "min_ms": 9.4628,
        "max_ms": 10.382,
        "rounds": 3
      },
      "reference": {
        "median_ms": 9.5853,
        "p95_ms": 10.6022,
        "min_ms": 9.351,
        "max_ms": 10.6022,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-txn-multi-exec-families",
        "scenario_params": {
          "commands": "100",
          "families": "SET,GET,INCR,HSET,LPUSH,SADD",
          "value_bytes": "64"
        },
        "data_scale": "keys=100,value_bytes=64"
      }
    },
    {
      "workload": "pubsub-fanout@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 19.0117,
        "p95_ms": 21.1109,
        "min_ms": 18.696,
        "max_ms": 21.1109,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-pubsub-fanout",
        "scenario_params": {
          "messages": "50",
          "subscribers": "8",
          "channels": "1"
        },
        "data_scale": "keys=0,channel=bench:fanout,subscribers=8"
      }
    },
    {
      "workload": "pubsub-fanout@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 16.1581,
        "p95_ms": 16.3849,
        "min_ms": 16.1493,
        "max_ms": 16.3849,
        "rounds": 3
      },
      "reference": {
        "median_ms": 19.0117,
        "p95_ms": 21.1109,
        "min_ms": 18.696,
        "max_ms": 21.1109,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-pubsub-fanout",
        "scenario_params": {
          "messages": "50",
          "subscribers": "8",
          "channels": "1"
        },
        "data_scale": "keys=0,channel=bench:fanout,subscribers=8"
      }
    },
    {
      "workload": "pubsub-fanout@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 18.0869,
        "p95_ms": 27.1664,
        "min_ms": 16.9603,
        "max_ms": 27.1664,
        "rounds": 3
      },
      "reference": {
        "median_ms": 19.0117,
        "p95_ms": 21.1109,
        "min_ms": 18.696,
        "max_ms": 21.1109,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-pubsub-fanout",
        "scenario_params": {
          "messages": "50",
          "subscribers": "8",
          "channels": "1"
        },
        "data_scale": "keys=0,channel=bench:fanout,subscribers=8"
      }
    },
    {
      "workload": "zset-score-ops@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 55.216,
        "p95_ms": 56.574,
        "min_ms": 53.0077,
        "max_ms": 56.574,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-zset-increment-rank",
        "scenario_params": {
          "members": "200"
        },
        "data_scale": "key=1,members=200"
      }
    },
    {
      "workload": "zset-score-ops@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 58.0041,
        "p95_ms": 64.7556,
        "min_ms": 52.6637,
        "max_ms": 64.7556,
        "rounds": 3
      },
      "reference": {
        "median_ms": 55.216,
        "p95_ms": 56.574,
        "min_ms": 53.0077,
        "max_ms": 56.574,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-zset-increment-rank",
        "scenario_params": {
          "members": "200"
        },
        "data_scale": "key=1,members=200"
      }
    },
    {
      "workload": "zset-score-ops@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 60.9628,
        "p95_ms": 69.0589,
        "min_ms": 58.2434,
        "max_ms": 69.0589,
        "rounds": 3
      },
      "reference": {
        "median_ms": 55.216,
        "p95_ms": 56.574,
        "min_ms": 53.0077,
        "max_ms": 56.574,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-zset-increment-rank",
        "scenario_params": {
          "members": "200"
        },
        "data_scale": "key=1,members=200"
      }
    },
    {
      "workload": "bitfield-ops@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 16.5588,
        "p95_ms": 25.3642,
        "min_ms": 15.5197,
        "max_ms": 25.3642,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-bitfield-increment",
        "scenario_params": {
          "increments": "200",
          "type": "u32"
        },
        "data_scale": "key=1,bit_offset=0"
      }
    },
    {
      "workload": "bitfield-ops@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 15.1643,
        "p95_ms": 16.0385,
        "min_ms": 13.3096,
        "max_ms": 16.0385,
        "rounds": 3
      },
      "reference": {
        "median_ms": 16.5588,
        "p95_ms": 25.3642,
        "min_ms": 15.5197,
        "max_ms": 25.3642,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-bitfield-increment",
        "scenario_params": {
          "increments": "200",
          "type": "u32"
        },
        "data_scale": "key=1,bit_offset=0"
      }
    },
    {
      "workload": "bitfield-ops@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 17.5595,
        "p95_ms": 19.8574,
        "min_ms": 17.155,
        "max_ms": 19.8574,
        "rounds": 3
      },
      "reference": {
        "median_ms": 16.5588,
        "p95_ms": 25.3642,
        "min_ms": 15.5197,
        "max_ms": 25.3642,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-bitfield-increment",
        "scenario_params": {
          "increments": "200",
          "type": "u32"
        },
        "data_scale": "key=1,bit_offset=0"
      }
    },
    {
      "workload": "hll-ops@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 15.2484,
        "p95_ms": 16.8768,
        "min_ms": 14.8724,
        "max_ms": 16.8768,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-hyperloglog-add-count",
        "scenario_params": {
          "elements": "200"
        },
        "data_scale": "key=1"
      }
    },
    {
      "workload": "hll-ops@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 14.7504,
        "p95_ms": 15.5042,
        "min_ms": 11.963,
        "max_ms": 15.5042,
        "rounds": 3
      },
      "reference": {
        "median_ms": 15.2484,
        "p95_ms": 16.8768,
        "min_ms": 14.8724,
        "max_ms": 16.8768,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-hyperloglog-add-count",
        "scenario_params": {
          "elements": "200"
        },
        "data_scale": "key=1"
      }
    },
    {
      "workload": "hll-ops@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 19.1232,
        "p95_ms": 20.5429,
        "min_ms": 15.6275,
        "max_ms": 20.5429,
        "rounds": 3
      },
      "reference": {
        "median_ms": 15.2484,
        "p95_ms": 16.8768,
        "min_ms": 14.8724,
        "max_ms": 16.8768,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-hyperloglog-add-count",
        "scenario_params": {
          "elements": "200"
        },
        "data_scale": "key=1"
      }
    },
    {
      "workload": "sort-ops@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 2.5673,
        "p95_ms": 4.3331,
        "min_ms": 2.4446,
        "max_ms": 4.3331,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-sort-list",
        "scenario_params": {
          "elements": "200",
          "repeat": "10",
          "mode": "SORT_RO"
        },
        "data_scale": "key=1,elements=200"
      }
    },
    {
      "workload": "sort-ops@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 1.5587,
        "p95_ms": 3.4321,
        "min_ms": 1.5466,
        "max_ms": 3.4321,
        "rounds": 3
      },
      "reference": {
        "median_ms": 2.5673,
        "p95_ms": 4.3331,
        "min_ms": 2.4446,
        "max_ms": 4.3331,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-sort-list",
        "scenario_params": {
          "elements": "200",
          "repeat": "10",
          "mode": "SORT_RO"
        },
        "data_scale": "key=1,elements=200"
      }
    },
    {
      "workload": "sort-ops@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 2.1875,
        "p95_ms": 3.2136,
        "min_ms": 1.8597,
        "max_ms": 3.2136,
        "rounds": 3
      },
      "reference": {
        "median_ms": 2.5673,
        "p95_ms": 4.3331,
        "min_ms": 2.4446,
        "max_ms": 4.3331,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-sort-list",
        "scenario_params": {
          "elements": "200",
          "repeat": "10",
          "mode": "SORT_RO"
        },
        "data_scale": "key=1,elements=200"
      }
    },
    {
      "workload": "keys-random@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 30.7973,
        "p95_ms": 40.8829,
        "min_ms": 28.0438,
        "max_ms": 40.8829,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-keys-random-dbsize",
        "scenario_params": {
          "keys": "200",
          "repeat": "10"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "keys-random@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 30.063,
        "p95_ms": 41.2847,
        "min_ms": 28.6688,
        "max_ms": 41.2847,
        "rounds": 3
      },
      "reference": {
        "median_ms": 30.7973,
        "p95_ms": 40.8829,
        "min_ms": 28.0438,
        "max_ms": 40.8829,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-keys-random-dbsize",
        "scenario_params": {
          "keys": "200",
          "repeat": "10"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "keys-random@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 29.2319,
        "p95_ms": 30.7122,
        "min_ms": 27.152,
        "max_ms": 30.7122,
        "rounds": 3
      },
      "reference": {
        "median_ms": 30.7973,
        "p95_ms": 40.8829,
        "min_ms": 28.0438,
        "max_ms": 40.8829,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-keys-random-dbsize",
        "scenario_params": {
          "keys": "200",
          "repeat": "10"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "stream-xread@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 15.7885,
        "p95_ms": 16.5126,
        "min_ms": 15.3748,
        "max_ms": 16.5126,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-stream-xread",
        "scenario_params": {
          "entries": "200",
          "repeat": "10"
        },
        "data_scale": "key=1,entries=200"
      }
    },
    {
      "workload": "stream-xread@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 12.9725,
        "p95_ms": 14.32,
        "min_ms": 12.7446,
        "max_ms": 14.32,
        "rounds": 3
      },
      "reference": {
        "median_ms": 15.7885,
        "p95_ms": 16.5126,
        "min_ms": 15.3748,
        "max_ms": 16.5126,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-stream-xread",
        "scenario_params": {
          "entries": "200",
          "repeat": "10"
        },
        "data_scale": "key=1,entries=200"
      }
    },
    {
      "workload": "stream-xread@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 14.9875,
        "p95_ms": 15.6138,
        "min_ms": 14.0516,
        "max_ms": 15.6138,
        "rounds": 3
      },
      "reference": {
        "median_ms": 15.7885,
        "p95_ms": 16.5126,
        "min_ms": 15.3748,
        "max_ms": 16.5126,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-stream-xread",
        "scenario_params": {
          "entries": "200",
          "repeat": "10"
        },
        "data_scale": "key=1,entries=200"
      }
    },
    {
      "workload": "stream-xadd-xread@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 40.2426,
        "p95_ms": 45.1418,
        "min_ms": 31.7557,
        "max_ms": 45.1418,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-stream-xadd-xread",
        "scenario_params": {
          "entries": "200",
          "read_count": "20",
          "fields": "2"
        },
        "data_scale": "key=1,entries=200"
      }
    },
    {
      "workload": "stream-xadd-xread@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 29.1995,
        "p95_ms": 31.5897,
        "min_ms": 28.3516,
        "max_ms": 31.5897,
        "rounds": 3
      },
      "reference": {
        "median_ms": 40.2426,
        "p95_ms": 45.1418,
        "min_ms": 31.7557,
        "max_ms": 45.1418,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-stream-xadd-xread",
        "scenario_params": {
          "entries": "200",
          "read_count": "20",
          "fields": "2"
        },
        "data_scale": "key=1,entries=200"
      }
    },
    {
      "workload": "stream-xadd-xread@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 34.8037,
        "p95_ms": 35.5561,
        "min_ms": 31.5019,
        "max_ms": 35.5561,
        "rounds": 3
      },
      "reference": {
        "median_ms": 40.2426,
        "p95_ms": 45.1418,
        "min_ms": 31.7557,
        "max_ms": 45.1418,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-stream-xadd-xread",
        "scenario_params": {
          "entries": "200",
          "read_count": "20",
          "fields": "2"
        },
        "data_scale": "key=1,entries=200"
      }
    },
    {
      "workload": "hscan-cursor@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 1.0249,
        "p95_ms": 1.9666,
        "min_ms": 0.9336,
        "max_ms": 1.9666,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-hash-scan-cursor",
        "scenario_params": {
          "fields": "200",
          "count_hint": "32"
        },
        "data_scale": "key=1,fields=200"
      }
    },
    {
      "workload": "hscan-cursor@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 1.0009,
        "p95_ms": 1.0572,
        "min_ms": 0.5831,
        "max_ms": 1.0572,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1.0249,
        "p95_ms": 1.9666,
        "min_ms": 0.9336,
        "max_ms": 1.9666,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-hash-scan-cursor",
        "scenario_params": {
          "fields": "200",
          "count_hint": "32"
        },
        "data_scale": "key=1,fields=200"
      }
    },
    {
      "workload": "hscan-cursor@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 0.8137,
        "p95_ms": 0.8233,
        "min_ms": 0.7922,
        "max_ms": 0.8233,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1.0249,
        "p95_ms": 1.9666,
        "min_ms": 0.9336,
        "max_ms": 1.9666,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-hash-scan-cursor",
        "scenario_params": {
          "fields": "200",
          "count_hint": "32"
        },
        "data_scale": "key=1,fields=200"
      }
    },
    {
      "workload": "sscan-zscan-cursor@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 1.6656,
        "p95_ms": 2.633,
        "min_ms": 1.0979,
        "max_ms": 2.633,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-set-zset-scan-cursor",
        "scenario_params": {
          "members": "200",
          "count_hint": "32",
          "commands": "SSCAN,ZSCAN"
        },
        "data_scale": "keys=2,members=200"
      }
    },
    {
      "workload": "sscan-zscan-cursor@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 2.2173,
        "p95_ms": 2.253,
        "min_ms": 1.28,
        "max_ms": 2.253,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1.6656,
        "p95_ms": 2.633,
        "min_ms": 1.0979,
        "max_ms": 2.633,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-set-zset-scan-cursor",
        "scenario_params": {
          "members": "200",
          "count_hint": "32",
          "commands": "SSCAN,ZSCAN"
        },
        "data_scale": "keys=2,members=200"
      }
    },
    {
      "workload": "sscan-zscan-cursor@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 1.5586,
        "p95_ms": 2.2508,
        "min_ms": 1.5177,
        "max_ms": 2.2508,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1.6656,
        "p95_ms": 2.633,
        "min_ms": 1.0979,
        "max_ms": 2.633,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-set-zset-scan-cursor",
        "scenario_params": {
          "members": "200",
          "count_hint": "32",
          "commands": "SSCAN,ZSCAN"
        },
        "data_scale": "keys=2,members=200"
      }
    },
    {
      "workload": "set-ops-large@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 219.1951,
        "p95_ms": 222.3523,
        "min_ms": 216.0701,
        "max_ms": 222.3523,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-set-large-sinter-sunion-sdiff",
        "scenario_params": {
          "members": "2000",
          "repeat": "10",
          "commands": "SINTER,SUNION,SDIFF"
        },
        "data_scale": "keys=2,members=2000"
      }
    },
    {
      "workload": "set-ops-large@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 200.4524,
        "p95_ms": 219.5336,
        "min_ms": 198.2408,
        "max_ms": 219.5336,
        "rounds": 3
      },
      "reference": {
        "median_ms": 219.1951,
        "p95_ms": 222.3523,
        "min_ms": 216.0701,
        "max_ms": 222.3523,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-set-large-sinter-sunion-sdiff",
        "scenario_params": {
          "members": "2000",
          "repeat": "10",
          "commands": "SINTER,SUNION,SDIFF"
        },
        "data_scale": "keys=2,members=2000"
      }
    },
    {
      "workload": "set-ops-large@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 197.0744,
        "p95_ms": 210.3651,
        "min_ms": 196.8284,
        "max_ms": 210.3651,
        "rounds": 3
      },
      "reference": {
        "median_ms": 219.1951,
        "p95_ms": 222.3523,
        "min_ms": 216.0701,
        "max_ms": 222.3523,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-set-large-sinter-sunion-sdiff",
        "scenario_params": {
          "members": "2000",
          "repeat": "10",
          "commands": "SINTER,SUNION,SDIFF"
        },
        "data_scale": "keys=2,members=2000"
      }
    },
    {
      "workload": "lmpop-blocking@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 12.5374,
        "p95_ms": 13.7056,
        "min_ms": 11.7139,
        "max_ms": 13.7056,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-list-lmpop-blpop-replay",
        "scenario_params": {
          "pops": "100",
          "commands": "LMPOP,BLPOP",
          "mode": "non-blocking replay"
        },
        "data_scale": "key=1,elements=100"
      }
    },
    {
      "workload": "lmpop-blocking@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 11.0073,
        "p95_ms": 18.4045,
        "min_ms": 10.3454,
        "max_ms": 18.4045,
        "rounds": 3
      },
      "reference": {
        "median_ms": 12.5374,
        "p95_ms": 13.7056,
        "min_ms": 11.7139,
        "max_ms": 13.7056,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-list-lmpop-blpop-replay",
        "scenario_params": {
          "pops": "100",
          "commands": "LMPOP,BLPOP",
          "mode": "non-blocking replay"
        },
        "data_scale": "key=1,elements=100"
      }
    },
    {
      "workload": "lmpop-blocking@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 15.0985,
        "p95_ms": 15.1527,
        "min_ms": 13.5447,
        "max_ms": 15.1527,
        "rounds": 3
      },
      "reference": {
        "median_ms": 12.5374,
        "p95_ms": 13.7056,
        "min_ms": 11.7139,
        "max_ms": 13.7056,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-list-lmpop-blpop-replay",
        "scenario_params": {
          "pops": "100",
          "commands": "LMPOP,BLPOP",
          "mode": "non-blocking replay"
        },
        "data_scale": "key=1,elements=100"
      }
    },
    {
      "workload": "key-space-notify@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 107.7311,
        "p95_ms": 111.1258,
        "min_ms": 104.986,
        "max_ms": 111.1258,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-keyspace-expired-notification",
        "scenario_params": {
          "keys": "30",
          "ttl_ms": "10",
          "channel": "__keyevent@0__:expired"
        },
        "data_scale": "keys=30"
      }
    },
    {
      "workload": "key-space-notify@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 108.0321,
        "p95_ms": 108.2277,
        "min_ms": 106.4355,
        "max_ms": 108.2277,
        "rounds": 3
      },
      "reference": {
        "median_ms": 107.7311,
        "p95_ms": 111.1258,
        "min_ms": 104.986,
        "max_ms": 111.1258,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-keyspace-expired-notification",
        "scenario_params": {
          "keys": "30",
          "ttl_ms": "10",
          "channel": "__keyevent@0__:expired"
        },
        "data_scale": "keys=30"
      }
    },
    {
      "workload": "key-space-notify@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 108.7033,
        "p95_ms": 109.8769,
        "min_ms": 104.9773,
        "max_ms": 109.8769,
        "rounds": 3
      },
      "reference": {
        "median_ms": 107.7311,
        "p95_ms": 111.1258,
        "min_ms": 104.986,
        "max_ms": 111.1258,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-keyspace-expired-notification",
        "scenario_params": {
          "keys": "30",
          "ttl_ms": "10",
          "channel": "__keyevent@0__:expired"
        },
        "data_scale": "keys=30"
      }
    },
    {
      "workload": "resp3-collections@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 12.7088,
        "p95_ms": 18.0836,
        "min_ms": 11.9649,
        "max_ms": 18.0836,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-resp3-collection-families",
        "scenario_params": {
          "members": "200",
          "repeat": "10",
          "commands": "SMEMBERS,HGETALL,ZRANGE WITHSCORES,SINTER"
        },
        "data_scale": "keys=4,members=200"
      }
    },
    {
      "workload": "resp3-collections@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 9.5805,
        "p95_ms": 10.6459,
        "min_ms": 7.305,
        "max_ms": 10.6459,
        "rounds": 3
      },
      "reference": {
        "median_ms": 12.7088,
        "p95_ms": 18.0836,
        "min_ms": 11.9649,
        "max_ms": 18.0836,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-resp3-collection-families",
        "scenario_params": {
          "members": "200",
          "repeat": "10",
          "commands": "SMEMBERS,HGETALL,ZRANGE WITHSCORES,SINTER"
        },
        "data_scale": "keys=4,members=200"
      }
    },
    {
      "workload": "resp3-collections@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 9.0734,
        "p95_ms": 10.7872,
        "min_ms": 8.9039,
        "max_ms": 10.7872,
        "rounds": 3
      },
      "reference": {
        "median_ms": 12.7088,
        "p95_ms": 18.0836,
        "min_ms": 11.9649,
        "max_ms": 18.0836,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-resp3-collection-families",
        "scenario_params": {
          "members": "200",
          "repeat": "10",
          "commands": "SMEMBERS,HGETALL,ZRANGE WITHSCORES,SINTER"
        },
        "data_scale": "keys=4,members=200"
      }
    },
    {
      "workload": "server-face-ops@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 3.3929,
        "p95_ms": 3.7242,
        "min_ms": 2.9173,
        "max_ms": 3.7242,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-server-face",
        "scenario_params": {
          "repeat": "10",
          "commands": "INFO,COMMAND COUNT,CONFIG GET,CONFIG SET"
        },
        "data_scale": "keys=0"
      }
    },
    {
      "workload": "server-face-ops@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 3.6401,
        "p95_ms": 4.4221,
        "min_ms": 3.4379,
        "max_ms": 4.4221,
        "rounds": 3
      },
      "reference": {
        "median_ms": 3.3929,
        "p95_ms": 3.7242,
        "min_ms": 2.9173,
        "max_ms": 3.7242,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-server-face",
        "scenario_params": {
          "repeat": "10",
          "commands": "INFO,COMMAND COUNT,CONFIG GET,CONFIG SET"
        },
        "data_scale": "keys=0"
      }
    },
    {
      "workload": "server-face-ops@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 4.0986,
        "p95_ms": 4.3437,
        "min_ms": 2.8351,
        "max_ms": 4.3437,
        "rounds": 3
      },
      "reference": {
        "median_ms": 3.3929,
        "p95_ms": 3.7242,
        "min_ms": 2.9173,
        "max_ms": 3.7242,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-server-face",
        "scenario_params": {
          "repeat": "10",
          "commands": "INFO,COMMAND COUNT,CONFIG GET,CONFIG SET"
        },
        "data_scale": "keys=0"
      }
    },
    {
      "workload": "watch-exec@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 3.5613,
        "p95_ms": 3.8371,
        "min_ms": 3.1512,
        "max_ms": 3.8371,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-txn-watch-exec",
        "scenario_params": {
          "keys": "1",
          "repeat": "10"
        },
        "data_scale": "keys=1,value_bytes=64"
      }
    },
    {
      "workload": "watch-exec@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 2.6072,
        "p95_ms": 3.3054,
        "min_ms": 2.2387,
        "max_ms": 3.3054,
        "rounds": 3
      },
      "reference": {
        "median_ms": 3.5613,
        "p95_ms": 3.8371,
        "min_ms": 3.1512,
        "max_ms": 3.8371,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-txn-watch-exec",
        "scenario_params": {
          "keys": "1",
          "repeat": "10"
        },
        "data_scale": "keys=1,value_bytes=64"
      }
    },
    {
      "workload": "watch-exec@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 2.9162,
        "p95_ms": 4.0461,
        "min_ms": 2.2692,
        "max_ms": 4.0461,
        "rounds": 3
      },
      "reference": {
        "median_ms": 3.5613,
        "p95_ms": 3.8371,
        "min_ms": 3.1512,
        "max_ms": 3.8371,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-txn-watch-exec",
        "scenario_params": {
          "keys": "1",
          "repeat": "10"
        },
        "data_scale": "keys=1,value_bytes=64"
      }
    },
    {
      "workload": "set-big@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 6.7968,
        "p95_ms": 14.5165,
        "min_ms": 6.0186,
        "max_ms": 14.5165,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-big-value-set",
        "scenario_params": {
          "ops": "20",
          "value_bytes": "65536"
        },
        "data_scale": "keys=20,value_bytes=65536"
      }
    },
    {
      "workload": "set-big@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 9.5651,
        "p95_ms": 10.709,
        "min_ms": 8.1982,
        "max_ms": 10.709,
        "rounds": 3
      },
      "reference": {
        "median_ms": 6.7968,
        "p95_ms": 14.5165,
        "min_ms": 6.0186,
        "max_ms": 14.5165,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-big-value-set",
        "scenario_params": {
          "ops": "20",
          "value_bytes": "65536"
        },
        "data_scale": "keys=20,value_bytes=65536"
      }
    },
    {
      "workload": "set-big@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 7.1619,
        "p95_ms": 7.4745,
        "min_ms": 5.4409,
        "max_ms": 7.4745,
        "rounds": 3
      },
      "reference": {
        "median_ms": 6.7968,
        "p95_ms": 14.5165,
        "min_ms": 6.0186,
        "max_ms": 14.5165,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-big-value-set",
        "scenario_params": {
          "ops": "20",
          "value_bytes": "65536"
        },
        "data_scale": "keys=20,value_bytes=65536"
      }
    },
    {
      "workload": "get-big@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 14.3464,
        "p95_ms": 18.2343,
        "min_ms": 14.2989,
        "max_ms": 18.2343,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-big-value-get",
        "scenario_params": {
          "ops": "50",
          "value_bytes": "65536"
        },
        "data_scale": "keys=50,value_bytes=65536"
      }
    },
    {
      "workload": "get-big@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 11.2203,
        "p95_ms": 16.7225,
        "min_ms": 9.5637,
        "max_ms": 16.7225,
        "rounds": 3
      },
      "reference": {
        "median_ms": 14.3464,
        "p95_ms": 18.2343,
        "min_ms": 14.2989,
        "max_ms": 18.2343,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-big-value-get",
        "scenario_params": {
          "ops": "50",
          "value_bytes": "65536"
        },
        "data_scale": "keys=50,value_bytes=65536"
      }
    },
    {
      "workload": "get-big@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 12.3278,
        "p95_ms": 12.9856,
        "min_ms": 11.8434,
        "max_ms": 12.9856,
        "rounds": 3
      },
      "reference": {
        "median_ms": 14.3464,
        "p95_ms": 18.2343,
        "min_ms": 14.2989,
        "max_ms": 18.2343,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-big-value-get",
        "scenario_params": {
          "ops": "50",
          "value_bytes": "65536"
        },
        "data_scale": "keys=50,value_bytes=65536"
      }
    },
    {
      "workload": "del-seq@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 17.1513,
        "p95_ms": 19.6654,
        "min_ms": 13.3554,
        "max_ms": 19.6654,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-key-del",
        "scenario_params": {
          "keys": "200"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "del-seq@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 11.926,
        "p95_ms": 12.3785,
        "min_ms": 11.6112,
        "max_ms": 12.3785,
        "rounds": 3
      },
      "reference": {
        "median_ms": 17.1513,
        "p95_ms": 19.6654,
        "min_ms": 13.3554,
        "max_ms": 19.6654,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-key-del",
        "scenario_params": {
          "keys": "200"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "del-seq@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 14.9103,
        "p95_ms": 16.4271,
        "min_ms": 11.6168,
        "max_ms": 16.4271,
        "rounds": 3
      },
      "reference": {
        "median_ms": 17.1513,
        "p95_ms": 19.6654,
        "min_ms": 13.3554,
        "max_ms": 19.6654,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-key-del",
        "scenario_params": {
          "keys": "200"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "move-seq@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 28.3358,
        "p95_ms": 38.8104,
        "min_ms": 18.0244,
        "max_ms": 38.8104,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-key-move",
        "scenario_params": {
          "ops": "200",
          "databases": "2"
        },
        "data_scale": "keys=200,databases=2"
      }
    },
    {
      "workload": "move-seq@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 18.8322,
        "p95_ms": 20.6875,
        "min_ms": 17.9243,
        "max_ms": 20.6875,
        "rounds": 3
      },
      "reference": {
        "median_ms": 28.3358,
        "p95_ms": 38.8104,
        "min_ms": 18.0244,
        "max_ms": 38.8104,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-key-move",
        "scenario_params": {
          "ops": "200",
          "databases": "2"
        },
        "data_scale": "keys=200,databases=2"
      }
    },
    {
      "workload": "move-seq@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 21.2725,
        "p95_ms": 24.9833,
        "min_ms": 20.3756,
        "max_ms": 24.9833,
        "rounds": 3
      },
      "reference": {
        "median_ms": 28.3358,
        "p95_ms": 38.8104,
        "min_ms": 18.0244,
        "max_ms": 38.8104,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-key-move",
        "scenario_params": {
          "ops": "200",
          "databases": "2"
        },
        "data_scale": "keys=200,databases=2"
      }
    },
    {
      "workload": "ping@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 53.0231,
        "p95_ms": 55.1351,
        "min_ms": 52.2071,
        "max_ms": 55.1351,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-ping-rtt",
        "scenario_params": {
          "ops": "1000"
        },
        "data_scale": "keys=0"
      }
    },
    {
      "workload": "ping@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 56.1972,
        "p95_ms": 66.8455,
        "min_ms": 47.399,
        "max_ms": 66.8455,
        "rounds": 3
      },
      "reference": {
        "median_ms": 53.0231,
        "p95_ms": 55.1351,
        "min_ms": 52.2071,
        "max_ms": 55.1351,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-ping-rtt",
        "scenario_params": {
          "ops": "1000"
        },
        "data_scale": "keys=0"
      }
    },
    {
      "workload": "ping@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 66.7931,
        "p95_ms": 71.5542,
        "min_ms": 61.235,
        "max_ms": 71.5542,
        "rounds": 3
      },
      "reference": {
        "median_ms": 53.0231,
        "p95_ms": 55.1351,
        "min_ms": 52.2071,
        "max_ms": 55.1351,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-ping-rtt",
        "scenario_params": {
          "ops": "1000"
        },
        "data_scale": "keys=0"
      }
    },
    {
      "workload": "bit-ops@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 55.2355,
        "p95_ms": 58.1095,
        "min_ms": 50.2934,
        "max_ms": 58.1095,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-string-bitfield-ops",
        "scenario_params": {
          "keys": "200",
          "commands": "SETBIT,GETBIT,BITCOUNT,BITPOS"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "bit-ops@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 46.1855,
        "p95_ms": 48.5055,
        "min_ms": 45.5402,
        "max_ms": 48.5055,
        "rounds": 3
      },
      "reference": {
        "median_ms": 55.2355,
        "p95_ms": 58.1095,
        "min_ms": 50.2934,
        "max_ms": 58.1095,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-bitfield-ops",
        "scenario_params": {
          "keys": "200",
          "commands": "SETBIT,GETBIT,BITCOUNT,BITPOS"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "bit-ops@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 57.0633,
        "p95_ms": 59.2067,
        "min_ms": 52.1146,
        "max_ms": 59.2067,
        "rounds": 3
      },
      "reference": {
        "median_ms": 55.2355,
        "p95_ms": 58.1095,
        "min_ms": 50.2934,
        "max_ms": 58.1095,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-bitfield-ops",
        "scenario_params": {
          "keys": "200",
          "commands": "SETBIT,GETBIT,BITCOUNT,BITPOS"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "setrange-getrange@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 27.6602,
        "p95_ms": 58.9615,
        "min_ms": 25.3392,
        "max_ms": 58.9615,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-string-setrange-getrange",
        "scenario_params": {
          "keys": "200",
          "chunk_bytes": "8"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "setrange-getrange@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 31.7751,
        "p95_ms": 36.3715,
        "min_ms": 27.6331,
        "max_ms": 36.3715,
        "rounds": 3
      },
      "reference": {
        "median_ms": 27.6602,
        "p95_ms": 58.9615,
        "min_ms": 25.3392,
        "max_ms": 58.9615,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-setrange-getrange",
        "scenario_params": {
          "keys": "200",
          "chunk_bytes": "8"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "setrange-getrange@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 32.3006,
        "p95_ms": 43.0491,
        "min_ms": 28.172,
        "max_ms": 43.0491,
        "rounds": 3
      },
      "reference": {
        "median_ms": 27.6602,
        "p95_ms": 58.9615,
        "min_ms": 25.3392,
        "max_ms": 58.9615,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-setrange-getrange",
        "scenario_params": {
          "keys": "200",
          "chunk_bytes": "8"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "rename-unlink@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 36.2553,
        "p95_ms": 41.5019,
        "min_ms": 30.2315,
        "max_ms": 41.5019,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-key-rename-unlink",
        "scenario_params": {
          "keys": "200",
          "commands": "RENAME,UNLINK"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "rename-unlink@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 28.2128,
        "p95_ms": 28.4405,
        "min_ms": 26.9877,
        "max_ms": 28.4405,
        "rounds": 3
      },
      "reference": {
        "median_ms": 36.2553,
        "p95_ms": 41.5019,
        "min_ms": 30.2315,
        "max_ms": 41.5019,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-key-rename-unlink",
        "scenario_params": {
          "keys": "200",
          "commands": "RENAME,UNLINK"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "rename-unlink@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 33.3878,
        "p95_ms": 34.8136,
        "min_ms": 32.6445,
        "max_ms": 34.8136,
        "rounds": 3
      },
      "reference": {
        "median_ms": 36.2553,
        "p95_ms": 41.5019,
        "min_ms": 30.2315,
        "max_ms": 41.5019,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-key-rename-unlink",
        "scenario_params": {
          "keys": "200",
          "commands": "RENAME,UNLINK"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "setnx-getset@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 26.84,
        "p95_ms": 27.5056,
        "min_ms": 26.4474,
        "max_ms": 27.5056,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-string-setnx-getset",
        "scenario_params": {
          "keys": "200",
          "commands": "SETNX,GETSET",
          "value_bytes": "64"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "setnx-getset@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 27.4499,
        "p95_ms": 38.6276,
        "min_ms": 25.5125,
        "max_ms": 38.6276,
        "rounds": 3
      },
      "reference": {
        "median_ms": 26.84,
        "p95_ms": 27.5056,
        "min_ms": 26.4474,
        "max_ms": 27.5056,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-setnx-getset",
        "scenario_params": {
          "keys": "200",
          "commands": "SETNX,GETSET",
          "value_bytes": "64"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "setnx-getset@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 27.8259,
        "p95_ms": 36.546,
        "min_ms": 26.5082,
        "max_ms": 36.546,
        "rounds": 3
      },
      "reference": {
        "median_ms": 26.84,
        "p95_ms": 27.5056,
        "min_ms": 26.4474,
        "max_ms": 27.5056,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-string-setnx-getset",
        "scenario_params": {
          "keys": "200",
          "commands": "SETNX,GETSET",
          "value_bytes": "64"
        },
        "data_scale": "keys=200"
      }
    },
    {
      "workload": "smove-spop@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 43.898,
        "p95_ms": 44.0365,
        "min_ms": 34.3774,
        "max_ms": 44.0365,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-set-smove-spop",
        "scenario_params": {
          "members": "200",
          "commands": "SMOVE,SPOP"
        },
        "data_scale": "keys=2,members=200"
      }
    },
    {
      "workload": "smove-spop@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 33.7557,
        "p95_ms": 39.1317,
        "min_ms": 33.1865,
        "max_ms": 39.1317,
        "rounds": 3
      },
      "reference": {
        "median_ms": 43.898,
        "p95_ms": 44.0365,
        "min_ms": 34.3774,
        "max_ms": 44.0365,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-set-smove-spop",
        "scenario_params": {
          "members": "200",
          "commands": "SMOVE,SPOP"
        },
        "data_scale": "keys=2,members=200"
      }
    },
    {
      "workload": "smove-spop@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 36.9011,
        "p95_ms": 37.7897,
        "min_ms": 35.6752,
        "max_ms": 37.7897,
        "rounds": 3
      },
      "reference": {
        "median_ms": 43.898,
        "p95_ms": 44.0365,
        "min_ms": 34.3774,
        "max_ms": 44.0365,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-set-smove-spop",
        "scenario_params": {
          "members": "200",
          "commands": "SMOVE,SPOP"
        },
        "data_scale": "keys=2,members=200"
      }
    },
    {
      "workload": "zrangestore-zdiff@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 0.3984,
        "p95_ms": 0.7016,
        "min_ms": 0.3284,
        "max_ms": 0.7016,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-zset-zrangestore-zdiff",
        "scenario_params": {
          "members": "200",
          "commands": "ZRANGESTORE,ZDIFF"
        },
        "data_scale": "keys=3,members=200"
      }
    },
    {
      "workload": "zrangestore-zdiff@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 0.3001,
        "p95_ms": 0.4818,
        "min_ms": 0.2961,
        "max_ms": 0.4818,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.3984,
        "p95_ms": 0.7016,
        "min_ms": 0.3284,
        "max_ms": 0.7016,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-zset-zrangestore-zdiff",
        "scenario_params": {
          "members": "200",
          "commands": "ZRANGESTORE,ZDIFF"
        },
        "data_scale": "keys=3,members=200"
      }
    },
    {
      "workload": "zrangestore-zdiff@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 0.3362,
        "p95_ms": 0.3663,
        "min_ms": 0.2819,
        "max_ms": 0.3663,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.3984,
        "p95_ms": 0.7016,
        "min_ms": 0.3284,
        "max_ms": 0.7016,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-zset-zrangestore-zdiff",
        "scenario_params": {
          "members": "200",
          "commands": "ZRANGESTORE,ZDIFF"
        },
        "data_scale": "keys=3,members=200"
      }
    },
    {
      "workload": "zset-add-options@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 88.09,
        "p95_ms": 89.4826,
        "min_ms": 81.4289,
        "max_ms": 89.4826,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-zset-add-options",
        "scenario_params": {
          "members": "200",
          "commands": "ZADD NX,ZADD XX CH,ZADD GT CH,ZADD INCR"
        },
        "data_scale": "key=1,members=200"
      }
    },
    {
      "workload": "zset-add-options@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 82.5608,
        "p95_ms": 89.3535,
        "min_ms": 73.8998,
        "max_ms": 89.3535,
        "rounds": 3
      },
      "reference": {
        "median_ms": 88.09,
        "p95_ms": 89.4826,
        "min_ms": 81.4289,
        "max_ms": 89.4826,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-zset-add-options",
        "scenario_params": {
          "members": "200",
          "commands": "ZADD NX,ZADD XX CH,ZADD GT CH,ZADD INCR"
        },
        "data_scale": "key=1,members=200"
      }
    },
    {
      "workload": "zset-add-options@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 91.3833,
        "p95_ms": 94.6666,
        "min_ms": 80.8214,
        "max_ms": 94.6666,
        "rounds": 3
      },
      "reference": {
        "median_ms": 88.09,
        "p95_ms": 89.4826,
        "min_ms": 81.4289,
        "max_ms": 89.4826,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-zset-add-options",
        "scenario_params": {
          "members": "200",
          "commands": "ZADD NX,ZADD XX CH,ZADD GT CH,ZADD INCR"
        },
        "data_scale": "key=1,members=200"
      }
    },
    {
      "workload": "expire-options@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 97.4583,
        "p95_ms": 101.099,
        "min_ms": 91.4771,
        "max_ms": 101.099,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-key-expire-options",
        "scenario_params": {
          "keys": "200",
          "commands": "EXPIRE NX,EXPIRE XX,EXPIRE LT,EXPIRE GT,TTL"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "expire-options@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 117.4996,
        "p95_ms": 117.8745,
        "min_ms": 116.244,
        "max_ms": 117.8745,
        "rounds": 3
      },
      "reference": {
        "median_ms": 97.4583,
        "p95_ms": 101.099,
        "min_ms": 91.4771,
        "max_ms": 101.099,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-key-expire-options",
        "scenario_params": {
          "keys": "200",
          "commands": "EXPIRE NX,EXPIRE XX,EXPIRE LT,EXPIRE GT,TTL"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "expire-options@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 87.578,
        "p95_ms": 103.7099,
        "min_ms": 80.0382,
        "max_ms": 103.7099,
        "rounds": 3
      },
      "reference": {
        "median_ms": 97.4583,
        "p95_ms": 101.099,
        "min_ms": 91.4771,
        "max_ms": 101.099,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-key-expire-options",
        "scenario_params": {
          "keys": "200",
          "commands": "EXPIRE NX,EXPIRE XX,EXPIRE LT,EXPIRE GT,TTL"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "expire-metadata@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 41.02,
        "p95_ms": 42.2542,
        "min_ms": 40.5796,
        "max_ms": 42.2542,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-key-expire-metadata",
        "scenario_params": {
          "keys": "200",
          "commands": "EXPIRETIME,PEXPIRETIME,TTL"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "expire-metadata@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 38.9583,
        "p95_ms": 43.8199,
        "min_ms": 36.695,
        "max_ms": 43.8199,
        "rounds": 3
      },
      "reference": {
        "median_ms": 41.02,
        "p95_ms": 42.2542,
        "min_ms": 40.5796,
        "max_ms": 42.2542,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-key-expire-metadata",
        "scenario_params": {
          "keys": "200",
          "commands": "EXPIRETIME,PEXPIRETIME,TTL"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "expire-metadata@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 50.8515,
        "p95_ms": 60.0754,
        "min_ms": 44.6876,
        "max_ms": 60.0754,
        "rounds": 3
      },
      "reference": {
        "median_ms": 41.02,
        "p95_ms": 42.2542,
        "min_ms": 40.5796,
        "max_ms": 42.2542,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-key-expire-metadata",
        "scenario_params": {
          "keys": "200",
          "commands": "EXPIRETIME,PEXPIRETIME,TTL"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "list-lpos@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 67.8359,
        "p95_ms": 69.7196,
        "min_ms": 67.0115,
        "max_ms": 69.7196,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-list-lpos",
        "scenario_params": {
          "elements": "200",
          "commands": "LPOS,LPOS RANK -1,LPOS COUNT 2,LPOS miss"
        },
        "data_scale": "key=1,elements=200"
      }
    },
    {
      "workload": "list-lpos@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 68.3377,
        "p95_ms": 69.5258,
        "min_ms": 64.6885,
        "max_ms": 69.5258,
        "rounds": 3
      },
      "reference": {
        "median_ms": 67.8359,
        "p95_ms": 69.7196,
        "min_ms": 67.0115,
        "max_ms": 69.7196,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-list-lpos",
        "scenario_params": {
          "elements": "200",
          "commands": "LPOS,LPOS RANK -1,LPOS COUNT 2,LPOS miss"
        },
        "data_scale": "key=1,elements=200"
      }
    },
    {
      "workload": "list-lpos@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 88.842,
        "p95_ms": 139.1823,
        "min_ms": 76.2054,
        "max_ms": 139.1823,
        "rounds": 3
      },
      "reference": {
        "median_ms": 67.8359,
        "p95_ms": 69.7196,
        "min_ms": 67.0115,
        "max_ms": 69.7196,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-list-lpos",
        "scenario_params": {
          "elements": "200",
          "commands": "LPOS,LPOS RANK -1,LPOS COUNT 2,LPOS miss"
        },
        "data_scale": "key=1,elements=200"
      }
    },
    {
      "workload": "copy-renamenx@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 41.9556,
        "p95_ms": 43.7784,
        "min_ms": 38.2302,
        "max_ms": 43.7784,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-key-copy-renamenx",
        "scenario_params": {
          "keys": "200",
          "commands": "COPY,RENAMENX"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "copy-renamenx@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 36.2862,
        "p95_ms": 40.6043,
        "min_ms": 34.4039,
        "max_ms": 40.6043,
        "rounds": 3
      },
      "reference": {
        "median_ms": 41.9556,
        "p95_ms": 43.7784,
        "min_ms": 38.2302,
        "max_ms": 43.7784,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-key-copy-renamenx",
        "scenario_params": {
          "keys": "200",
          "commands": "COPY,RENAMENX"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "copy-renamenx@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 44.8321,
        "p95_ms": 53.3721,
        "min_ms": 41.3317,
        "max_ms": 53.3721,
        "rounds": 3
      },
      "reference": {
        "median_ms": 41.9556,
        "p95_ms": 43.7784,
        "min_ms": 38.2302,
        "max_ms": 43.7784,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-key-copy-renamenx",
        "scenario_params": {
          "keys": "200",
          "commands": "COPY,RENAMENX"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "object-encoding@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 38.7163,
        "p95_ms": 48.2191,
        "min_ms": 36.0721,
        "max_ms": 48.2191,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-object-inspect",
        "scenario_params": {
          "keys": "200",
          "commands": "OBJECT ENCODING,OBJECT REFCOUNT,OBJECT IDLETIME"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "object-encoding@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 35.594,
        "p95_ms": 35.9617,
        "min_ms": 35.0812,
        "max_ms": 35.9617,
        "rounds": 3
      },
      "reference": {
        "median_ms": 38.7163,
        "p95_ms": 48.2191,
        "min_ms": 36.0721,
        "max_ms": 48.2191,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-object-inspect",
        "scenario_params": {
          "keys": "200",
          "commands": "OBJECT ENCODING,OBJECT REFCOUNT,OBJECT IDLETIME"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "object-encoding@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 45.2356,
        "p95_ms": 51.7276,
        "min_ms": 41.3403,
        "max_ms": 51.7276,
        "rounds": 3
      },
      "reference": {
        "median_ms": 38.7163,
        "p95_ms": 48.2191,
        "min_ms": 36.0721,
        "max_ms": 48.2191,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-object-inspect",
        "scenario_params": {
          "keys": "200",
          "commands": "OBJECT ENCODING,OBJECT REFCOUNT,OBJECT IDLETIME"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "hash-hincrbyfloat@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 71.9054,
        "p95_ms": 73.3532,
        "min_ms": 71.0252,
        "max_ms": 73.3532,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-hash-hincrbyfloat",
        "scenario_params": {
          "fields": "200",
          "commands": "HINCRBYFLOAT 0.1,HINCRBYFLOAT 0.2"
        },
        "data_scale": "key=1,fields=200"
      }
    },
    {
      "workload": "hash-hincrbyfloat@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 63.0086,
        "p95_ms": 75.9928,
        "min_ms": 62.2987,
        "max_ms": 75.9928,
        "rounds": 3
      },
      "reference": {
        "median_ms": 71.9054,
        "p95_ms": 73.3532,
        "min_ms": 71.0252,
        "max_ms": 73.3532,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-hash-hincrbyfloat",
        "scenario_params": {
          "fields": "200",
          "commands": "HINCRBYFLOAT 0.1,HINCRBYFLOAT 0.2"
        },
        "data_scale": "key=1,fields=200"
      }
    },
    {
      "workload": "hash-hincrbyfloat@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 72.686,
        "p95_ms": 93.9449,
        "min_ms": 64.2373,
        "max_ms": 93.9449,
        "rounds": 3
      },
      "reference": {
        "median_ms": 71.9054,
        "p95_ms": 73.3532,
        "min_ms": 71.0252,
        "max_ms": 73.3532,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-hash-hincrbyfloat",
        "scenario_params": {
          "fields": "200",
          "commands": "HINCRBYFLOAT 0.1,HINCRBYFLOAT 0.2"
        },
        "data_scale": "key=1,fields=200"
      }
    },
    {
      "workload": "list-lset-lrem@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 17.4237,
        "p95_ms": 18.1327,
        "min_ms": 16.7659,
        "max_ms": 18.1327,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-list-lset-lrem",
        "scenario_params": {
          "members": "200",
          "commands": "LSET,LREM,LLEN"
        },
        "data_scale": "key=1,members=200"
      }
    },
    {
      "workload": "list-lset-lrem@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 18.5025,
        "p95_ms": 22.8964,
        "min_ms": 15.1749,
        "max_ms": 22.8964,
        "rounds": 3
      },
      "reference": {
        "median_ms": 17.4237,
        "p95_ms": 18.1327,
        "min_ms": 16.7659,
        "max_ms": 18.1327,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-list-lset-lrem",
        "scenario_params": {
          "members": "200",
          "commands": "LSET,LREM,LLEN"
        },
        "data_scale": "key=1,members=200"
      }
    },
    {
      "workload": "list-lset-lrem@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 18.3943,
        "p95_ms": 18.9614,
        "min_ms": 17.9233,
        "max_ms": 18.9614,
        "rounds": 3
      },
      "reference": {
        "median_ms": 17.4237,
        "p95_ms": 18.1327,
        "min_ms": 16.7659,
        "max_ms": 18.1327,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-list-lset-lrem",
        "scenario_params": {
          "members": "200",
          "commands": "LSET,LREM,LLEN"
        },
        "data_scale": "key=1,members=200"
      }
    },
    {
      "workload": "connect@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 63.3616,
        "p95_ms": 68.1072,
        "min_ms": 59.7869,
        "max_ms": 68.1072,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-connect-open-close",
        "scenario_params": {
          "opens": "50",
          "probe": "PING"
        },
        "data_scale": "keys=0"
      }
    },
    {
      "workload": "connect@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 23.858,
        "p95_ms": 24.9818,
        "min_ms": 23.6218,
        "max_ms": 24.9818,
        "rounds": 3
      },
      "reference": {
        "median_ms": 63.3616,
        "p95_ms": 68.1072,
        "min_ms": 59.7869,
        "max_ms": 68.1072,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-connect-open-close",
        "scenario_params": {
          "opens": "50",
          "probe": "PING"
        },
        "data_scale": "keys=0"
      }
    },
    {
      "workload": "connect@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 51.8645,
        "p95_ms": 52.4118,
        "min_ms": 50.1395,
        "max_ms": 52.4118,
        "rounds": 3
      },
      "reference": {
        "median_ms": 63.3616,
        "p95_ms": 68.1072,
        "min_ms": 59.7869,
        "max_ms": 68.1072,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-connect-open-close",
        "scenario_params": {
          "opens": "50",
          "probe": "PING"
        },
        "data_scale": "keys=0"
      }
    },
    {
      "workload": "list-linsert-ltrim@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 0.3249,
        "p95_ms": 0.3411,
        "min_ms": 0.3205,
        "max_ms": 0.3411,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-list-linsert-ltrim",
        "scenario_params": {
          "elements": "3",
          "commands": "LINSERT BEFORE,LINSERT miss,LTRIM,LLEN"
        },
        "data_scale": "key=1,elements=3"
      }
    },
    {
      "workload": "list-linsert-ltrim@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 0.5405,
        "p95_ms": 0.6901,
        "min_ms": 0.3925,
        "max_ms": 0.6901,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.3249,
        "p95_ms": 0.3411,
        "min_ms": 0.3205,
        "max_ms": 0.3411,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-list-linsert-ltrim",
        "scenario_params": {
          "elements": "3",
          "commands": "LINSERT BEFORE,LINSERT miss,LTRIM,LLEN"
        },
        "data_scale": "key=1,elements=3"
      }
    },
    {
      "workload": "list-linsert-ltrim@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 0.5416,
        "p95_ms": 0.5961,
        "min_ms": 0.3721,
        "max_ms": 0.5961,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.3249,
        "p95_ms": 0.3411,
        "min_ms": 0.3205,
        "max_ms": 0.3411,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-list-linsert-ltrim",
        "scenario_params": {
          "elements": "3",
          "commands": "LINSERT BEFORE,LINSERT miss,LTRIM,LLEN"
        },
        "data_scale": "key=1,elements=3"
      }
    },
    {
      "workload": "list-rpoplpush-lmove@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 0.3668,
        "p95_ms": 0.5662,
        "min_ms": 0.3483,
        "max_ms": 0.5662,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-list-rpoplpush-lmove",
        "scenario_params": {
          "elements": "3",
          "commands": "RPOPLPUSH,LMOVE LEFT RIGHT"
        },
        "data_scale": "keys=3,elements=3"
      }
    },
    {
      "workload": "list-rpoplpush-lmove@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 0.4419,
        "p95_ms": 0.7311,
        "min_ms": 0.3323,
        "max_ms": 0.7311,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.3668,
        "p95_ms": 0.5662,
        "min_ms": 0.3483,
        "max_ms": 0.5662,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-list-rpoplpush-lmove",
        "scenario_params": {
          "elements": "3",
          "commands": "RPOPLPUSH,LMOVE LEFT RIGHT"
        },
        "data_scale": "keys=3,elements=3"
      }
    },
    {
      "workload": "list-rpoplpush-lmove@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 0.3792,
        "p95_ms": 0.457,
        "min_ms": 0.2383,
        "max_ms": 0.457,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.3668,
        "p95_ms": 0.5662,
        "min_ms": 0.3483,
        "max_ms": 0.5662,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-list-rpoplpush-lmove",
        "scenario_params": {
          "elements": "3",
          "commands": "RPOPLPUSH,LMOVE LEFT RIGHT"
        },
        "data_scale": "keys=3,elements=3"
      }
    },
    {
      "workload": "hll-merge-count@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 0.4406,
        "p95_ms": 0.4424,
        "min_ms": 0.4007,
        "max_ms": 0.4424,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-hyperloglog-merge-count",
        "scenario_params": {
          "elements_per_key": "200",
          "commands": "PFMERGE,PFCOUNT merged,PFCOUNT multi-key"
        },
        "data_scale": "keys=2,elements=400"
      }
    },
    {
      "workload": "hll-merge-count@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 0.4968,
        "p95_ms": 0.6432,
        "min_ms": 0.3627,
        "max_ms": 0.6432,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.4406,
        "p95_ms": 0.4424,
        "min_ms": 0.4007,
        "max_ms": 0.4424,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-hyperloglog-merge-count",
        "scenario_params": {
          "elements_per_key": "200",
          "commands": "PFMERGE,PFCOUNT merged,PFCOUNT multi-key"
        },
        "data_scale": "keys=2,elements=400"
      }
    },
    {
      "workload": "hll-merge-count@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 0.3652,
        "p95_ms": 0.458,
        "min_ms": 0.3226,
        "max_ms": 0.458,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.4406,
        "p95_ms": 0.4424,
        "min_ms": 0.4007,
        "max_ms": 0.4424,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-hyperloglog-merge-count",
        "scenario_params": {
          "elements_per_key": "200",
          "commands": "PFMERGE,PFCOUNT merged,PFCOUNT multi-key"
        },
        "data_scale": "keys=2,elements=400"
      }
    },
    {
      "workload": "client-info@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 0.6083,
        "p95_ms": 1.1734,
        "min_ms": 0.4464,
        "max_ms": 1.1734,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-client-info",
        "scenario_params": {
          "repeat": "10",
          "commands": "CLIENT INFO"
        },
        "data_scale": "keys=0"
      }
    },
    {
      "workload": "client-info@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 0.7076,
        "p95_ms": 0.7438,
        "min_ms": 0.6708,
        "max_ms": 0.7438,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.6083,
        "p95_ms": 1.1734,
        "min_ms": 0.4464,
        "max_ms": 1.1734,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-client-info",
        "scenario_params": {
          "repeat": "10",
          "commands": "CLIENT INFO"
        },
        "data_scale": "keys=0"
      }
    },
    {
      "workload": "client-info@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 2.0237,
        "p95_ms": 10.1362,
        "min_ms": 0.884,
        "max_ms": 10.1362,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.6083,
        "p95_ms": 1.1734,
        "min_ms": 0.4464,
        "max_ms": 1.1734,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-client-info",
        "scenario_params": {
          "repeat": "10",
          "commands": "CLIENT INFO"
        },
        "data_scale": "keys=0"
      }
    },
    {
      "workload": "flushdb-scratch@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 0.8901,
        "p95_ms": 1.4258,
        "min_ms": 0.825,
        "max_ms": 1.4258,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-key-flushdb-scratch-db",
        "scenario_params": {
          "keys": "8",
          "db": "3",
          "commands": "SELECT,FLUSHDB,DBSIZE"
        },
        "data_scale": "keys=8,database=3"
      }
    },
    {
      "workload": "flushdb-scratch@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 1.3648,
        "p95_ms": 1.5403,
        "min_ms": 0.8948,
        "max_ms": 1.5403,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.8901,
        "p95_ms": 1.4258,
        "min_ms": 0.825,
        "max_ms": 1.4258,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-key-flushdb-scratch-db",
        "scenario_params": {
          "keys": "8",
          "db": "3",
          "commands": "SELECT,FLUSHDB,DBSIZE"
        },
        "data_scale": "keys=8,database=3"
      }
    },
    {
      "workload": "flushdb-scratch@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 1.1409,
        "p95_ms": 1.2653,
        "min_ms": 1.1001,
        "max_ms": 1.2653,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.8901,
        "p95_ms": 1.4258,
        "min_ms": 0.825,
        "max_ms": 1.4258,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-key-flushdb-scratch-db",
        "scenario_params": {
          "keys": "8",
          "db": "3",
          "commands": "SELECT,FLUSHDB,DBSIZE"
        },
        "data_scale": "keys=8,database=3"
      }
    }
  ]
}
```

Regenerate: `pnpm --dir projects/redis.ts/examples/vs-js-libraries benchmark`
