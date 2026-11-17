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
- `rev`: `59010ee03951293cf7583c07bf90614c67b31444`
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
| `zset-remove-ops` | `redis-zset-remove` | 203 | {"members":"200","commands":"ZREM,ZREMRANGEBYRANK,ZREMRANGEBYSCORE,ZCARD"} |
| `set-store-ops` | `redis-set-store-algebra` | 40 | {"members":"200","repeat":"10","commands":"SINTERSTORE,SUNIONSTORE,SDIFFSTORE,ZUNIONSTORE"} |
| `expire-ms` | `redis-key-expire-milliseconds` | 1000 | {"keys":"200","commands":"PSETEX,PTTL,PEXPIRE,PERSIST"} |
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
| get-seq | 1.00x | **0.85x** | 1.17x |
| set-seq | 1.00x | **0.78x** | 1.01x |
| mset-seq | **1.00x** | 1.07x | 1.58x |
| incr-seq | 1.00x | **0.87x** | 1.10x |
| set-pipeline | 1.00x | **0.93x** | 1.08x |
| get-pipeline | 1.00x | **0.96x** | 1.81x |
| pipeline-mixed | **1.00x** | 1.15x | 1.06x |
| hash-hset-hget | 1.00x | **0.89x** | 1.10x |
| hash-setnx-hrandfield | 1.00x | **0.88x** | 0.95x |
| list-rpush-lrange | 1.00x | **0.88x** | 1.09x |
| set-sadd-smembers | 1.00x | **0.93x** | 1.16x |
| zset-zadd-zrange | 1.00x | **0.95x** | 1.18x |
| streams-xadd-xrange | 1.00x | **0.96x** | 1.11x |
| pubsub-roundtrip | 1.00x | 1.23x | **0.81x** |
| blpop-roundtrip | 1.00x | **0.84x** | 0.91x |
| scan-full | 1.00x | 0.99x | **0.93x** |
| ping-concurrent | 1.00x | **0.96x** | 1.03x |
| stream-group | 1.00x | **0.82x** | 0.94x |
| ttl-setex-expire | 1.00x | **0.99x** | 1.00x |
| multi-exec | 1.00x | **0.80x** | 1.58x |
| mget-seq | 1.00x | **0.99x** | 1.86x |
| append-getrange | 1.00x | **0.94x** | 1.93x |
| getdel-getex | 1.00x | **0.85x** | 0.91x |
| set-options | 1.00x | **0.79x** | 1.46x |
| exists-type | 1.00x | **0.93x** | 2.05x |
| expire-persist | 1.00x | **0.80x** | 1.07x |
| hash-hgetall-hdel | **1.00x** | 1.18x | 1.47x |
| hash-keys-values | 1.00x | **0.53x** | 0.68x |
| list-lpush-lpop | 1.00x | **1.00x** | 1.48x |
| set-algebra | 1.00x | **0.54x** | 0.71x |
| set-membership-ops | **1.00x** | 1.05x | 1.03x |
| zset-pop-ops | 1.00x | 0.98x | **0.52x** |
| zset-range-queries | 1.00x | **0.94x** | 1.29x |
| large-collection-read | 1.00x | **0.39x** | 0.66x |
| large-hash-list-read | 1.00x | **0.37x** | 0.81x |
| resp3-hello | 1.00x | 0.38x | **0.37x** |
| expire-sweep | 1.00x | 0.97x | **0.96x** |
| multi-exec-mixed | 1.00x | **0.88x** | 1.33x |
| pubsub-fanout | 1.00x | **0.71x** | 0.77x |
| zset-score-ops | **1.00x** | 2.12x | 2.37x |
| bitfield-ops | 1.00x | **0.91x** | 0.92x |
| hll-ops | 1.00x | 0.89x | **0.82x** |
| sort-ops | 1.00x | **0.54x** | 0.61x |
| keys-random | 1.00x | **0.99x** | 1.06x |
| stream-xread | 1.00x | **0.77x** | 0.91x |
| stream-xadd-xread | 1.00x | **0.84x** | 1.01x |
| hscan-cursor | 1.00x | **0.66x** | 0.90x |
| sscan-zscan-cursor | 1.00x | **0.69x** | 0.88x |
| set-ops-large | 1.00x | **0.91x** | 0.92x |
| lmpop-blocking | 1.00x | **0.94x** | 1.01x |
| key-space-notify | 1.00x | **0.99x** | 1.01x |
| resp3-collections | 1.00x | 0.65x | **0.64x** |
| server-face-ops | 1.00x | **0.87x** | 1.42x |
| watch-exec | 1.00x | **0.92x** | 2.07x |
| set-big | 1.00x | 1.13x | **0.91x** |
| get-big | 1.00x | 1.10x | **0.74x** |
| del-seq | 1.00x | **0.71x** | 0.75x |
| move-seq | 1.00x | **0.87x** | 1.11x |
| ping | 1.00x | **0.98x** | 1.13x |
| bit-ops | 1.00x | **0.79x** | 1.01x |
| setrange-getrange | **1.00x** | 1.07x | 1.33x |
| rename-unlink | 1.00x | 0.84x | **0.82x** |
| setnx-getset | 1.00x | 0.99x | **0.97x** |
| smove-spop | **1.00x** | 1.05x | 1.10x |
| zrangestore-zdiff | 1.00x | **0.94x** | 1.31x |
| zset-add-options | 1.00x | **0.83x** | 1.03x |
| zset-remove-ops | **1.00x** | 1.88x | 1.73x |
| set-store-ops | **1.00x** | 1.37x | 1.09x |
| expire-ms | 1.00x | **0.70x** | 1.00x |
| expire-options | **1.00x** | 1.00x | 1.17x |
| expire-metadata | 1.00x | **0.93x** | 1.08x |
| list-lpos | 1.00x | 0.99x | **0.92x** |
| copy-renamenx | 1.00x | **0.92x** | 0.98x |
| object-encoding | 1.00x | **0.95x** | 1.12x |
| hash-hincrbyfloat | 1.00x | **0.91x** | 1.02x |
| list-lset-lrem | 1.00x | 0.93x | **0.82x** |
| connect | 1.00x | **0.36x** | 0.69x |
| list-linsert-ltrim | 1.00x | **0.51x** | 1.05x |
| list-rpoplpush-lmove | 1.00x | **0.44x** | 0.56x |
| hll-merge-count | 1.00x | 1.01x | **0.98x** |
| client-info | 1.00x | 0.92x | **0.43x** |
| flushdb-scratch | 1.00x | **0.53x** | 0.89x |

## Median and p95 (ms)

| Workload | ops | ioredis med | ioredis p95 | @yydb/redis med | @yydb/redis p95 | node-redis med | node-redis p95 |
|---------:|----:|-------:|-------:|-------:|-------:|-------:|-------:|
| get-seq | 500 | 21.00 | 21.23 | 17.86 | 20.17 | 24.65 | 26.18 |
| set-seq | 100 | 5.62 | 5.90 | 4.39 | 4.96 | 5.68 | 6.12 |
| mset-seq | 500 | 2.99 | 4.02 | 3.19 | 3.29 | 4.73 | 4.80 |
| incr-seq | 500 | 19.53 | 19.93 | 17.08 | 22.37 | 21.52 | 21.90 |
| set-pipeline | 500 | 6.74 | 7.13 | 6.27 | 13.13 | 7.31 | 8.00 |
| get-pipeline | 500 | 4.63 | 4.84 | 4.44 | 18.76 | 8.38 | 9.12 |
| pipeline-mixed | 500 | 8.34 | 9.16 | 9.63 | 10.64 | 8.86 | 9.62 |
| hash-hset-hget | 401 | 21.57 | 21.82 | 19.27 | 21.42 | 23.75 | 25.66 |
| hash-setnx-hrandfield | 402 | 12.05 | 13.74 | 10.66 | 10.93 | 11.47 | 16.73 |
| list-rpush-lrange | 202 | 9.77 | 11.08 | 8.61 | 8.76 | 10.62 | 10.84 |
| set-sadd-smembers | 202 | 9.52 | 16.09 | 8.89 | 9.03 | 11.05 | 11.16 |
| zset-zadd-zrange | 202 | 10.49 | 11.34 | 9.93 | 10.26 | 12.33 | 14.68 |
| streams-xadd-xrange | 202 | 19.12 | 20.71 | 18.26 | 38.71 | 21.19 | 24.31 |
| pubsub-roundtrip | 100 | 8.12 | 8.86 | 9.97 | 10.41 | 6.55 | 6.67 |
| blpop-roundtrip | 100 | 13.64 | 18.79 | 11.40 | 13.14 | 12.42 | 14.16 |
| scan-full | 200 | 1.86 | 1.94 | 1.84 | 1.89 | 1.74 | 1.79 |
| ping-concurrent | 800 | 21.63 | 23.22 | 20.84 | 38.92 | 22.27 | 23.64 |
| stream-group | 300 | 37.59 | 40.12 | 30.72 | 32.54 | 35.31 | 36.70 |
| ttl-setex-expire | 90 | 1118.55 | 1120.76 | 1111.08 | 1115.99 | 1113.48 | 1123.55 |
| multi-exec | 102 | 9.81 | 10.89 | 7.83 | 9.14 | 15.47 | 18.18 |
| mget-seq | 200 | 1.04 | 1.39 | 1.03 | 1.18 | 1.93 | 2.05 |
| append-getrange | 201 | 23.11 | 47.75 | 21.63 | 22.94 | 44.59 | 47.40 |
| getdel-getex | 400 | 40.27 | 73.07 | 34.29 | 35.69 | 36.80 | 42.49 |
| set-options | 400 | 33.02 | 42.31 | 25.93 | 65.20 | 48.29 | 50.25 |
| exists-type | 400 | 21.50 | 25.08 | 20.01 | 29.53 | 43.99 | 61.04 |
| expire-persist | 600 | 58.83 | 61.94 | 47.00 | 48.95 | 63.11 | 95.12 |
| hash-hgetall-hdel | 202 | 2.53 | 2.71 | 2.98 | 3.05 | 3.72 | 60.89 |
| hash-keys-values | 40 | 11.92 | 16.79 | 6.38 | 16.43 | 8.09 | 19.64 |
| list-lpush-lpop | 400 | 44.95 | 46.37 | 44.90 | 45.37 | 66.60 | 68.49 |
| set-algebra | 30 | 11.92 | 13.76 | 6.39 | 6.51 | 8.44 | 9.42 |
| set-membership-ops | 30 | 10.63 | 11.74 | 11.15 | 15.09 | 10.99 | 12.22 |
| zset-pop-ops | 4 | 1.51 | 1.95 | 1.49 | 1.61 | 0.78 | 0.78 |
| zset-range-queries | 40 | 6.02 | 7.79 | 5.63 | 6.55 | 7.79 | 7.80 |
| large-collection-read | 20 | 22.05 | 30.55 | 8.49 | 10.38 | 14.57 | 17.70 |
| large-hash-list-read | 20 | 39.19 | 39.39 | 14.69 | 17.29 | 31.66 | 37.21 |
| resp3-hello | 40 | 6.84 | 11.87 | 2.60 | 2.83 | 2.56 | 2.69 |
| expire-sweep | 1002 | 264.17 | 264.74 | 256.41 | 270.54 | 254.57 | 269.12 |
| multi-exec-mixed | 102 | 6.34 | 6.65 | 5.58 | 5.96 | 8.46 | 10.34 |
| pubsub-fanout | 400 | 13.72 | 16.68 | 9.72 | 11.74 | 10.54 | 15.52 |
| zset-score-ops | 600 | 34.25 | 38.85 | 72.78 | 74.33 | 81.12 | 89.15 |
| bitfield-ops | 201 | 23.48 | 28.22 | 21.31 | 24.06 | 21.50 | 22.95 |
| hll-ops | 201 | 22.13 | 23.55 | 19.65 | 22.16 | 18.23 | 23.30 |
| sort-ops | 10 | 4.40 | 4.79 | 2.37 | 2.62 | 2.68 | 2.90 |
| keys-random | 30 | 34.28 | 46.20 | 33.90 | 43.91 | 36.26 | 38.13 |
| stream-xread | 10 | 18.98 | 23.64 | 14.55 | 18.02 | 17.19 | 19.53 |
| stream-xadd-xread | 202 | 40.63 | 50.03 | 34.08 | 43.40 | 41.04 | 48.84 |
| hscan-cursor | 200 | 1.89 | 1.93 | 1.26 | 1.35 | 1.70 | 1.75 |
| sscan-zscan-cursor | 400 | 2.24 | 2.76 | 1.54 | 1.73 | 1.97 | 1.98 |
| set-ops-large | 30 | 286.15 | 287.27 | 261.76 | 271.33 | 264.50 | 270.42 |
| lmpop-blocking | 100 | 17.67 | 26.96 | 16.53 | 16.94 | 17.90 | 26.45 |
| key-space-notify | 30 | 107.78 | 111.33 | 106.99 | 110.23 | 108.49 | 108.66 |
| resp3-collections | 40 | 18.41 | 21.75 | 12.06 | 12.45 | 11.79 | 13.26 |
| server-face-ops | 40 | 3.30 | 3.69 | 2.87 | 13.23 | 4.69 | 5.70 |
| watch-exec | 40 | 2.64 | 5.21 | 2.44 | 2.51 | 5.47 | 5.68 |
| set-big | 20 | 7.26 | 7.92 | 8.20 | 8.23 | 6.59 | 8.58 |
| get-big | 50 | 31.68 | 39.07 | 34.97 | 38.71 | 23.60 | 30.50 |
| del-seq | 200 | 21.66 | 23.16 | 15.35 | 17.60 | 16.25 | 19.33 |
| move-seq | 200 | 29.23 | 36.55 | 25.55 | 36.01 | 32.36 | 35.97 |
| ping | 1000 | 73.62 | 77.51 | 72.10 | 75.61 | 83.35 | 87.16 |
| bit-ops | 800 | 79.04 | 97.13 | 62.17 | 64.07 | 79.90 | 80.84 |
| setrange-getrange | 400 | 34.10 | 42.66 | 36.61 | 39.12 | 45.43 | 49.72 |
| rename-unlink | 400 | 57.74 | 63.89 | 48.33 | 49.21 | 47.13 | 50.22 |
| setnx-getset | 400 | 40.61 | 84.94 | 40.09 | 40.78 | 39.27 | 46.72 |
| smove-spop | 400 | 51.21 | 53.20 | 53.86 | 56.10 | 56.13 | 61.17 |
| zrangestore-zdiff | 400 | 0.53 | 0.68 | 0.50 | 0.64 | 0.70 | 0.72 |
| zset-add-options | 800 | 124.90 | 148.78 | 103.16 | 116.66 | 129.06 | 133.39 |
| zset-remove-ops | 203 | 4.46 | 7.06 | 8.40 | 9.07 | 7.72 | 7.87 |
| set-store-ops | 40 | 12.80 | 17.44 | 17.53 | 17.86 | 13.95 | 17.51 |
| expire-ms | 1000 | 107.92 | 153.55 | 75.46 | 84.60 | 108.17 | 114.83 |
| expire-options | 1200 | 110.54 | 119.95 | 111.02 | 118.20 | 128.86 | 148.54 |
| expire-metadata | 600 | 50.98 | 55.06 | 47.53 | 61.50 | 54.91 | 56.97 |
| list-lpos | 800 | 100.33 | 105.90 | 99.59 | 140.23 | 92.66 | 117.47 |
| copy-renamenx | 400 | 59.72 | 63.07 | 55.13 | 55.43 | 58.57 | 71.78 |
| object-encoding | 600 | 54.62 | 62.31 | 51.63 | 60.69 | 61.38 | 72.01 |
| hash-hincrbyfloat | 400 | 97.77 | 110.54 | 89.34 | 98.67 | 99.67 | 101.82 |
| list-lset-lrem | 202 | 32.58 | 35.80 | 30.42 | 33.05 | 26.60 | 28.39 |
| connect | 50 | 94.51 | 95.46 | 33.98 | 35.56 | 65.54 | 74.34 |
| list-linsert-ltrim | 5 | 0.79 | 0.81 | 0.40 | 0.54 | 0.83 | 0.84 |
| list-rpoplpush-lmove | 5 | 0.83 | 0.84 | 0.36 | 0.36 | 0.47 | 0.87 |
| hll-merge-count | 3 | 0.66 | 0.75 | 0.66 | 0.89 | 0.65 | 1.84 |
| client-info | 10 | 1.67 | 1.82 | 1.52 | 1.58 | 0.72 | 0.82 |
| flushdb-scratch | 14 | 1.81 | 1.91 | 0.96 | 1.54 | 1.61 | 1.72 |

## Per-op and throughput (median)

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|--------:|--------:|--------:|
| get-seq | 0.042 ms/op, 23,811/s | 0.036 ms/op, 28,002/s | 0.049 ms/op, 20,285/s |
| set-seq | 0.056 ms/op, 17,806/s | 0.044 ms/op, 22,794/s | 0.057 ms/op, 17,608/s |
| mset-seq | 0.006 ms/op, 167,207/s | 0.006 ms/op, 156,882/s | 0.009 ms/op, 105,802/s |
| incr-seq | 0.039 ms/op, 25,596/s | 0.034 ms/op, 29,278/s | 0.043 ms/op, 23,234/s |
| set-pipeline | 0.013 ms/op, 74,154/s | 0.013 ms/op, 79,750/s | 0.015 ms/op, 68,413/s |
| get-pipeline | 0.009 ms/op, 108,103/s | 0.009 ms/op, 112,590/s | 0.017 ms/op, 59,683/s |
| pipeline-mixed | 0.017 ms/op, 59,951/s | 0.019 ms/op, 51,925/s | 0.018 ms/op, 56,410/s |
| hash-hset-hget | 0.054 ms/op, 18,587/s | 0.048 ms/op, 20,808/s | 0.059 ms/op, 16,882/s |
| hash-setnx-hrandfield | 0.030 ms/op, 33,358/s | 0.027 ms/op, 37,719/s | 0.029 ms/op, 35,045/s |
| list-rpush-lrange | 0.048 ms/op, 20,668/s | 0.043 ms/op, 23,474/s | 0.053 ms/op, 19,029/s |
| set-sadd-smembers | 0.047 ms/op, 21,219/s | 0.044 ms/op, 22,721/s | 0.055 ms/op, 18,276/s |
| zset-zadd-zrange | 0.052 ms/op, 19,261/s | 0.049 ms/op, 20,338/s | 0.061 ms/op, 16,378/s |
| streams-xadd-xrange | 0.095 ms/op, 10,564/s | 0.090 ms/op, 11,062/s | 0.105 ms/op, 9,533/s |
| pubsub-roundtrip | 0.081 ms/op, 12,322/s | 0.100 ms/op, 10,033/s | 0.066 ms/op, 15,261/s |
| blpop-roundtrip | 0.136 ms/op, 7,333/s | 0.114 ms/op, 8,770/s | 0.124 ms/op, 8,052/s |
| scan-full | 0.009 ms/op, 107,348/s | 0.009 ms/op, 108,725/s | 0.009 ms/op, 115,274/s |
| ping-concurrent | 0.027 ms/op, 36,982/s | 0.026 ms/op, 38,389/s | 0.028 ms/op, 35,927/s |
| stream-group | 0.125 ms/op, 7,980/s | 0.102 ms/op, 9,766/s | 0.118 ms/op, 8,497/s |
| ttl-setex-expire | 12.428 ms/op, 80/s | 12.345 ms/op, 81/s | 12.372 ms/op, 81/s |
| multi-exec | 0.096 ms/op, 10,392/s | 0.077 ms/op, 13,024/s | 0.152 ms/op, 6,594/s |
| mget-seq | 0.005 ms/op, 192,734/s | 0.005 ms/op, 194,401/s | 0.010 ms/op, 103,611/s |
| append-getrange | 0.115 ms/op, 8,698/s | 0.108 ms/op, 9,293/s | 0.222 ms/op, 4,508/s |
| getdel-getex | 0.101 ms/op, 9,933/s | 0.086 ms/op, 11,666/s | 0.092 ms/op, 10,869/s |
| set-options | 0.083 ms/op, 12,114/s | 0.065 ms/op, 15,429/s | 0.121 ms/op, 8,284/s |
| exists-type | 0.054 ms/op, 18,606/s | 0.050 ms/op, 19,990/s | 0.110 ms/op, 9,093/s |
| expire-persist | 0.098 ms/op, 10,198/s | 0.078 ms/op, 12,766/s | 0.105 ms/op, 9,508/s |
| hash-hgetall-hdel | 0.013 ms/op, 79,855/s | 0.015 ms/op, 67,694/s | 0.018 ms/op, 54,319/s |
| hash-keys-values | 0.298 ms/op, 3,355/s | 0.159 ms/op, 6,273/s | 0.202 ms/op, 4,944/s |
| list-lpush-lpop | 0.112 ms/op, 8,899/s | 0.112 ms/op, 8,909/s | 0.166 ms/op, 6,006/s |
| set-algebra | 0.397 ms/op, 2,516/s | 0.213 ms/op, 4,697/s | 0.281 ms/op, 3,555/s |
| set-membership-ops | 0.354 ms/op, 2,822/s | 0.372 ms/op, 2,691/s | 0.366 ms/op, 2,729/s |
| zset-pop-ops | 0.378 ms/op, 2,647/s | 0.371 ms/op, 2,693/s | 0.195 ms/op, 5,137/s |
| zset-range-queries | 0.150 ms/op, 6,646/s | 0.141 ms/op, 7,104/s | 0.195 ms/op, 5,138/s |
| large-collection-read | 1.102 ms/op, 907/s | 0.424 ms/op, 2,356/s | 0.729 ms/op, 1,372/s |
| large-hash-list-read | 1.960 ms/op, 510/s | 0.735 ms/op, 1,361/s | 1.583 ms/op, 632/s |
| resp3-hello | 0.171 ms/op, 5,848/s | 0.065 ms/op, 15,413/s | 0.064 ms/op, 15,641/s |
| expire-sweep | 0.264 ms/op, 3,793/s | 0.256 ms/op, 3,908/s | 0.254 ms/op, 3,936/s |
| multi-exec-mixed | 0.062 ms/op, 16,076/s | 0.055 ms/op, 18,265/s | 0.083 ms/op, 12,055/s |
| pubsub-fanout | 0.034 ms/op, 29,157/s | 0.024 ms/op, 41,156/s | 0.026 ms/op, 37,934/s |
| zset-score-ops | 0.057 ms/op, 17,517/s | 0.121 ms/op, 8,245/s | 0.135 ms/op, 7,396/s |
| bitfield-ops | 0.117 ms/op, 8,562/s | 0.106 ms/op, 9,431/s | 0.107 ms/op, 9,349/s |
| hll-ops | 0.110 ms/op, 9,083/s | 0.098 ms/op, 10,230/s | 0.091 ms/op, 11,028/s |
| sort-ops | 0.440 ms/op, 2,275/s | 0.237 ms/op, 4,213/s | 0.268 ms/op, 3,737/s |
| keys-random | 1.143 ms/op, 875/s | 1.130 ms/op, 885/s | 1.209 ms/op, 827/s |
| stream-xread | 1.898 ms/op, 527/s | 1.455 ms/op, 687/s | 1.719 ms/op, 582/s |
| stream-xadd-xread | 0.201 ms/op, 4,972/s | 0.169 ms/op, 5,928/s | 0.203 ms/op, 4,922/s |
| hscan-cursor | 0.009 ms/op, 105,809/s | 0.006 ms/op, 159,210/s | 0.008 ms/op, 117,911/s |
| sscan-zscan-cursor | 0.006 ms/op, 178,915/s | 0.004 ms/op, 259,202/s | 0.005 ms/op, 202,747/s |
| set-ops-large | 9.538 ms/op, 105/s | 8.725 ms/op, 115/s | 8.817 ms/op, 113/s |
| lmpop-blocking | 0.177 ms/op, 5,660/s | 0.165 ms/op, 6,048/s | 0.179 ms/op, 5,586/s |
| key-space-notify | 3.593 ms/op, 278/s | 3.566 ms/op, 280/s | 3.616 ms/op, 277/s |
| resp3-collections | 0.460 ms/op, 2,172/s | 0.301 ms/op, 3,318/s | 0.295 ms/op, 3,391/s |
| server-face-ops | 0.083 ms/op, 12,115/s | 0.072 ms/op, 13,914/s | 0.117 ms/op, 8,523/s |
| watch-exec | 0.066 ms/op, 15,132/s | 0.061 ms/op, 16,418/s | 0.137 ms/op, 7,315/s |
| set-big | 0.363 ms/op, 2,753/s | 0.410 ms/op, 2,438/s | 0.330 ms/op, 3,033/s |
| get-big | 0.634 ms/op, 1,578/s | 0.699 ms/op, 1,430/s | 0.472 ms/op, 2,119/s |
| del-seq | 0.108 ms/op, 9,234/s | 0.077 ms/op, 13,028/s | 0.081 ms/op, 12,310/s |
| move-seq | 0.146 ms/op, 6,843/s | 0.128 ms/op, 7,829/s | 0.162 ms/op, 6,180/s |
| ping | 0.074 ms/op, 13,584/s | 0.072 ms/op, 13,870/s | 0.083 ms/op, 11,997/s |
| bit-ops | 0.099 ms/op, 10,121/s | 0.078 ms/op, 12,869/s | 0.100 ms/op, 10,012/s |
| setrange-getrange | 0.085 ms/op, 11,731/s | 0.092 ms/op, 10,926/s | 0.114 ms/op, 8,805/s |
| rename-unlink | 0.144 ms/op, 6,928/s | 0.121 ms/op, 8,276/s | 0.118 ms/op, 8,487/s |
| setnx-getset | 0.102 ms/op, 9,851/s | 0.100 ms/op, 9,979/s | 0.098 ms/op, 10,186/s |
| smove-spop | 0.128 ms/op, 7,811/s | 0.135 ms/op, 7,426/s | 0.140 ms/op, 7,126/s |
| zrangestore-zdiff | 0.001 ms/op, 752,870/s | 0.001 ms/op, 796,813/s | 0.002 ms/op, 574,548/s |
| zset-add-options | 0.156 ms/op, 6,405/s | 0.129 ms/op, 7,755/s | 0.161 ms/op, 6,199/s |
| zset-remove-ops | 0.022 ms/op, 45,489/s | 0.041 ms/op, 24,180/s | 0.038 ms/op, 26,293/s |
| set-store-ops | 0.320 ms/op, 3,125/s | 0.438 ms/op, 2,281/s | 0.349 ms/op, 2,867/s |
| expire-ms | 0.108 ms/op, 9,266/s | 0.075 ms/op, 13,252/s | 0.108 ms/op, 9,245/s |
| expire-options | 0.092 ms/op, 10,856/s | 0.093 ms/op, 10,809/s | 0.107 ms/op, 9,313/s |
| expire-metadata | 0.085 ms/op, 11,769/s | 0.079 ms/op, 12,624/s | 0.092 ms/op, 10,928/s |
| list-lpos | 0.125 ms/op, 7,974/s | 0.124 ms/op, 8,033/s | 0.116 ms/op, 8,634/s |
| copy-renamenx | 0.149 ms/op, 6,698/s | 0.138 ms/op, 7,256/s | 0.146 ms/op, 6,829/s |
| object-encoding | 0.091 ms/op, 10,985/s | 0.086 ms/op, 11,622/s | 0.102 ms/op, 9,775/s |
| hash-hincrbyfloat | 0.244 ms/op, 4,091/s | 0.223 ms/op, 4,477/s | 0.249 ms/op, 4,013/s |
| list-lset-lrem | 0.161 ms/op, 6,201/s | 0.151 ms/op, 6,639/s | 0.132 ms/op, 7,595/s |
| connect | 1.890 ms/op, 529/s | 0.680 ms/op, 1,472/s | 1.311 ms/op, 763/s |
| list-linsert-ltrim | 0.157 ms/op, 6,351/s | 0.080 ms/op, 12,447/s | 0.165 ms/op, 6,045/s |
| list-rpoplpush-lmove | 0.166 ms/op, 6,010/s | 0.073 ms/op, 13,785/s | 0.094 ms/op, 10,691/s |
| hll-merge-count | 0.220 ms/op, 4,550/s | 0.221 ms/op, 4,526/s | 0.216 ms/op, 4,633/s |
| client-info | 0.167 ms/op, 6,005/s | 0.152 ms/op, 6,557/s | 0.072 ms/op, 13,953/s |
| flushdb-scratch | 0.130 ms/op, 7,719/s | 0.069 ms/op, 14,511/s | 0.115 ms/op, 8,670/s |

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
    "data_scale": "matrix=82x3",
    "rustc_version": "rustc 1.101.0-nightly (1c3a65069 2026-11-02)",
    "node_version": "v24.18.0",
    "target_triple": "x86_64-pc-windows-msvc",
    "rev": "59010ee03951293cf7583c07bf90614c67b31444",
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
        "median_ms": 20.9987,
        "p95_ms": 21.231,
        "min_ms": 20.1169,
        "max_ms": 21.231,
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
        "median_ms": 17.8561,
        "p95_ms": 20.1746,
        "min_ms": 16.6691,
        "max_ms": 20.1746,
        "rounds": 3
      },
      "reference": {
        "median_ms": 20.9987,
        "p95_ms": 21.231,
        "min_ms": 20.1169,
        "max_ms": 21.231,
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
        "median_ms": 24.6482,
        "p95_ms": 26.1766,
        "min_ms": 23.1945,
        "max_ms": 26.1766,
        "rounds": 3
      },
      "reference": {
        "median_ms": 20.9987,
        "p95_ms": 21.231,
        "min_ms": 20.1169,
        "max_ms": 21.231,
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
        "median_ms": 5.616,
        "p95_ms": 5.8967,
        "min_ms": 5.5874,
        "max_ms": 5.8967,
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
        "median_ms": 4.3872,
        "p95_ms": 4.9579,
        "min_ms": 4.3038,
        "max_ms": 4.9579,
        "rounds": 3
      },
      "reference": {
        "median_ms": 5.616,
        "p95_ms": 5.8967,
        "min_ms": 5.5874,
        "max_ms": 5.8967,
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
        "median_ms": 5.6791,
        "p95_ms": 6.1175,
        "min_ms": 5.6786,
        "max_ms": 6.1175,
        "rounds": 3
      },
      "reference": {
        "median_ms": 5.616,
        "p95_ms": 5.8967,
        "min_ms": 5.5874,
        "max_ms": 5.8967,
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
        "median_ms": 2.9903,
        "p95_ms": 4.0196,
        "min_ms": 2.7168,
        "max_ms": 4.0196,
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
        "median_ms": 3.1871,
        "p95_ms": 3.2944,
        "min_ms": 2.9965,
        "max_ms": 3.2944,
        "rounds": 3
      },
      "reference": {
        "median_ms": 2.9903,
        "p95_ms": 4.0196,
        "min_ms": 2.7168,
        "max_ms": 4.0196,
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
        "median_ms": 4.7258,
        "p95_ms": 4.8017,
        "min_ms": 4.6564,
        "max_ms": 4.8017,
        "rounds": 3
      },
      "reference": {
        "median_ms": 2.9903,
        "p95_ms": 4.0196,
        "min_ms": 2.7168,
        "max_ms": 4.0196,
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
        "median_ms": 19.5342,
        "p95_ms": 19.9275,
        "min_ms": 18.3544,
        "max_ms": 19.9275,
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
        "median_ms": 17.0778,
        "p95_ms": 22.374,
        "min_ms": 16.5702,
        "max_ms": 22.374,
        "rounds": 3
      },
      "reference": {
        "median_ms": 19.5342,
        "p95_ms": 19.9275,
        "min_ms": 18.3544,
        "max_ms": 19.9275,
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
        "median_ms": 21.5201,
        "p95_ms": 21.8951,
        "min_ms": 19.8427,
        "max_ms": 21.8951,
        "rounds": 3
      },
      "reference": {
        "median_ms": 19.5342,
        "p95_ms": 19.9275,
        "min_ms": 18.3544,
        "max_ms": 19.9275,
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
        "median_ms": 6.7427,
        "p95_ms": 7.1298,
        "min_ms": 6.7336,
        "max_ms": 7.1298,
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
        "median_ms": 6.2696,
        "p95_ms": 13.1331,
        "min_ms": 6.1985,
        "max_ms": 13.1331,
        "rounds": 3
      },
      "reference": {
        "median_ms": 6.7427,
        "p95_ms": 7.1298,
        "min_ms": 6.7336,
        "max_ms": 7.1298,
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
        "median_ms": 7.3085,
        "p95_ms": 7.9995,
        "min_ms": 7.3003,
        "max_ms": 7.9995,
        "rounds": 3
      },
      "reference": {
        "median_ms": 6.7427,
        "p95_ms": 7.1298,
        "min_ms": 6.7336,
        "max_ms": 7.1298,
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
        "median_ms": 4.6252,
        "p95_ms": 4.8374,
        "min_ms": 4.5626,
        "max_ms": 4.8374,
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
        "median_ms": 4.4409,
        "p95_ms": 18.7582,
        "min_ms": 4.3598,
        "max_ms": 18.7582,
        "rounds": 3
      },
      "reference": {
        "median_ms": 4.6252,
        "p95_ms": 4.8374,
        "min_ms": 4.5626,
        "max_ms": 4.8374,
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
        "median_ms": 8.3776,
        "p95_ms": 9.116,
        "min_ms": 8.3637,
        "max_ms": 9.116,
        "rounds": 3
      },
      "reference": {
        "median_ms": 4.6252,
        "p95_ms": 4.8374,
        "min_ms": 4.5626,
        "max_ms": 4.8374,
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
        "median_ms": 8.3401,
        "p95_ms": 9.1606,
        "min_ms": 7.9401,
        "max_ms": 9.1606,
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
        "median_ms": 9.6292,
        "p95_ms": 10.6404,
        "min_ms": 8.2179,
        "max_ms": 10.6404,
        "rounds": 3
      },
      "reference": {
        "median_ms": 8.3401,
        "p95_ms": 9.1606,
        "min_ms": 7.9401,
        "max_ms": 9.1606,
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
        "median_ms": 8.8636,
        "p95_ms": 9.6154,
        "min_ms": 8.676,
        "max_ms": 9.6154,
        "rounds": 3
      },
      "reference": {
        "median_ms": 8.3401,
        "p95_ms": 9.1606,
        "min_ms": 7.9401,
        "max_ms": 9.1606,
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
        "median_ms": 21.5745,
        "p95_ms": 21.8216,
        "min_ms": 21.2125,
        "max_ms": 21.8216,
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
        "median_ms": 19.2711,
        "p95_ms": 21.4219,
        "min_ms": 18.4772,
        "max_ms": 21.4219,
        "rounds": 3
      },
      "reference": {
        "median_ms": 21.5745,
        "p95_ms": 21.8216,
        "min_ms": 21.2125,
        "max_ms": 21.8216,
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
        "p95_ms": 25.6612,
        "min_ms": 23.61,
        "max_ms": 25.6612,
        "rounds": 3
      },
      "reference": {
        "median_ms": 21.5745,
        "p95_ms": 21.8216,
        "min_ms": 21.2125,
        "max_ms": 21.8216,
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
        "median_ms": 12.0511,
        "p95_ms": 13.7447,
        "min_ms": 11.8756,
        "max_ms": 13.7447,
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
        "median_ms": 10.6578,
        "p95_ms": 10.9287,
        "min_ms": 9.7505,
        "max_ms": 10.9287,
        "rounds": 3
      },
      "reference": {
        "median_ms": 12.0511,
        "p95_ms": 13.7447,
        "min_ms": 11.8756,
        "max_ms": 13.7447,
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
        "median_ms": 11.471,
        "p95_ms": 16.7318,
        "min_ms": 11.4251,
        "max_ms": 16.7318,
        "rounds": 3
      },
      "reference": {
        "median_ms": 12.0511,
        "p95_ms": 13.7447,
        "min_ms": 11.8756,
        "max_ms": 13.7447,
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
        "median_ms": 9.7734,
        "p95_ms": 11.0785,
        "min_ms": 9.2739,
        "max_ms": 11.0785,
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
        "median_ms": 8.6052,
        "p95_ms": 8.7573,
        "min_ms": 8.5392,
        "max_ms": 8.7573,
        "rounds": 3
      },
      "reference": {
        "median_ms": 9.7734,
        "p95_ms": 11.0785,
        "min_ms": 9.2739,
        "max_ms": 11.0785,
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
        "median_ms": 10.6153,
        "p95_ms": 10.8381,
        "min_ms": 10.3495,
        "max_ms": 10.8381,
        "rounds": 3
      },
      "reference": {
        "median_ms": 9.7734,
        "p95_ms": 11.0785,
        "min_ms": 9.2739,
        "max_ms": 11.0785,
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
        "median_ms": 9.5198,
        "p95_ms": 16.0877,
        "min_ms": 9.0915,
        "max_ms": 16.0877,
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
        "median_ms": 8.8906,
        "p95_ms": 9.0289,
        "min_ms": 8.5547,
        "max_ms": 9.0289,
        "rounds": 3
      },
      "reference": {
        "median_ms": 9.5198,
        "p95_ms": 16.0877,
        "min_ms": 9.0915,
        "max_ms": 16.0877,
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
        "median_ms": 11.0525,
        "p95_ms": 11.1628,
        "min_ms": 11.004,
        "max_ms": 11.1628,
        "rounds": 3
      },
      "reference": {
        "median_ms": 9.5198,
        "p95_ms": 16.0877,
        "min_ms": 9.0915,
        "max_ms": 16.0877,
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
        "median_ms": 10.4873,
        "p95_ms": 11.3381,
        "min_ms": 10.3032,
        "max_ms": 11.3381,
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
        "median_ms": 9.9321,
        "p95_ms": 10.26,
        "min_ms": 9.5377,
        "max_ms": 10.26,
        "rounds": 3
      },
      "reference": {
        "median_ms": 10.4873,
        "p95_ms": 11.3381,
        "min_ms": 10.3032,
        "max_ms": 11.3381,
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
        "median_ms": 12.3337,
        "p95_ms": 14.683,
        "min_ms": 11.9598,
        "max_ms": 14.683,
        "rounds": 3
      },
      "reference": {
        "median_ms": 10.4873,
        "p95_ms": 11.3381,
        "min_ms": 10.3032,
        "max_ms": 11.3381,
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
        "median_ms": 19.121,
        "p95_ms": 20.7118,
        "min_ms": 17.3542,
        "max_ms": 20.7118,
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
        "median_ms": 18.2612,
        "p95_ms": 38.7074,
        "min_ms": 17.0187,
        "max_ms": 38.7074,
        "rounds": 3
      },
      "reference": {
        "median_ms": 19.121,
        "p95_ms": 20.7118,
        "min_ms": 17.3542,
        "max_ms": 20.7118,
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
        "median_ms": 21.19,
        "p95_ms": 24.3097,
        "min_ms": 19.7162,
        "max_ms": 24.3097,
        "rounds": 3
      },
      "reference": {
        "median_ms": 19.121,
        "p95_ms": 20.7118,
        "min_ms": 17.3542,
        "max_ms": 20.7118,
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
        "median_ms": 8.1156,
        "p95_ms": 8.8592,
        "min_ms": 6.8231,
        "max_ms": 8.8592,
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
        "median_ms": 9.9675,
        "p95_ms": 10.4072,
        "min_ms": 6.244,
        "max_ms": 10.4072,
        "rounds": 3
      },
      "reference": {
        "median_ms": 8.1156,
        "p95_ms": 8.8592,
        "min_ms": 6.8231,
        "max_ms": 8.8592,
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
        "median_ms": 6.5528,
        "p95_ms": 6.6721,
        "min_ms": 6.299,
        "max_ms": 6.6721,
        "rounds": 3
      },
      "reference": {
        "median_ms": 8.1156,
        "p95_ms": 8.8592,
        "min_ms": 6.8231,
        "max_ms": 8.8592,
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
        "median_ms": 13.6375,
        "p95_ms": 18.7937,
        "min_ms": 13.6093,
        "max_ms": 18.7937,
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
        "median_ms": 11.4027,
        "p95_ms": 13.1404,
        "min_ms": 10.9699,
        "max_ms": 13.1404,
        "rounds": 3
      },
      "reference": {
        "median_ms": 13.6375,
        "p95_ms": 18.7937,
        "min_ms": 13.6093,
        "max_ms": 18.7937,
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
        "median_ms": 12.419,
        "p95_ms": 14.1622,
        "min_ms": 12.1508,
        "max_ms": 14.1622,
        "rounds": 3
      },
      "reference": {
        "median_ms": 13.6375,
        "p95_ms": 18.7937,
        "min_ms": 13.6093,
        "max_ms": 18.7937,
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
        "median_ms": 1.8631,
        "p95_ms": 1.9425,
        "min_ms": 1.8128,
        "max_ms": 1.9425,
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
        "median_ms": 1.8395,
        "p95_ms": 1.8913,
        "min_ms": 1.6916,
        "max_ms": 1.8913,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1.8631,
        "p95_ms": 1.9425,
        "min_ms": 1.8128,
        "max_ms": 1.9425,
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
        "median_ms": 1.735,
        "p95_ms": 1.794,
        "min_ms": 1.7227,
        "max_ms": 1.794,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1.8631,
        "p95_ms": 1.9425,
        "min_ms": 1.8128,
        "max_ms": 1.9425,
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
        "median_ms": 21.6319,
        "p95_ms": 23.2216,
        "min_ms": 19.0081,
        "max_ms": 23.2216,
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
        "median_ms": 20.8393,
        "p95_ms": 38.9192,
        "min_ms": 20.1108,
        "max_ms": 38.9192,
        "rounds": 3
      },
      "reference": {
        "median_ms": 21.6319,
        "p95_ms": 23.2216,
        "min_ms": 19.0081,
        "max_ms": 23.2216,
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
        "median_ms": 22.2675,
        "p95_ms": 23.639,
        "min_ms": 22.2505,
        "max_ms": 23.639,
        "rounds": 3
      },
      "reference": {
        "median_ms": 21.6319,
        "p95_ms": 23.2216,
        "min_ms": 19.0081,
        "max_ms": 23.2216,
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
        "median_ms": 37.5933,
        "p95_ms": 40.1176,
        "min_ms": 34.3807,
        "max_ms": 40.1176,
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
        "median_ms": 30.7201,
        "p95_ms": 32.5358,
        "min_ms": 29.3503,
        "max_ms": 32.5358,
        "rounds": 3
      },
      "reference": {
        "median_ms": 37.5933,
        "p95_ms": 40.1176,
        "min_ms": 34.3807,
        "max_ms": 40.1176,
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
        "median_ms": 35.3057,
        "p95_ms": 36.7045,
        "min_ms": 34.8329,
        "max_ms": 36.7045,
        "rounds": 3
      },
      "reference": {
        "median_ms": 37.5933,
        "p95_ms": 40.1176,
        "min_ms": 34.3807,
        "max_ms": 40.1176,
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
        "median_ms": 1118.5541,
        "p95_ms": 1120.7638,
        "min_ms": 1118.3456,
        "max_ms": 1120.7638,
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
        "median_ms": 1111.0827,
        "p95_ms": 1115.9909,
        "min_ms": 1104.3557,
        "max_ms": 1115.9909,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1118.5541,
        "p95_ms": 1120.7638,
        "min_ms": 1118.3456,
        "max_ms": 1120.7638,
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
        "median_ms": 1113.4815,
        "p95_ms": 1123.5531,
        "min_ms": 1111.9119,
        "max_ms": 1123.5531,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1118.5541,
        "p95_ms": 1120.7638,
        "min_ms": 1118.3456,
        "max_ms": 1120.7638,
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
        "median_ms": 9.8149,
        "p95_ms": 10.8934,
        "min_ms": 7.9608,
        "max_ms": 10.8934,
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
        "median_ms": 7.8314,
        "p95_ms": 9.1413,
        "min_ms": 7.7675,
        "max_ms": 9.1413,
        "rounds": 3
      },
      "reference": {
        "median_ms": 9.8149,
        "p95_ms": 10.8934,
        "min_ms": 7.9608,
        "max_ms": 10.8934,
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
        "median_ms": 15.469,
        "p95_ms": 18.1842,
        "min_ms": 13.9026,
        "max_ms": 18.1842,
        "rounds": 3
      },
      "reference": {
        "median_ms": 9.8149,
        "p95_ms": 10.8934,
        "min_ms": 7.9608,
        "max_ms": 10.8934,
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
        "median_ms": 1.0377,
        "p95_ms": 1.3921,
        "min_ms": 1.0262,
        "max_ms": 1.3921,
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
        "median_ms": 1.0288,
        "p95_ms": 1.1831,
        "min_ms": 0.9533,
        "max_ms": 1.1831,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1.0377,
        "p95_ms": 1.3921,
        "min_ms": 1.0262,
        "max_ms": 1.3921,
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
        "median_ms": 1.9303,
        "p95_ms": 2.0501,
        "min_ms": 1.7086,
        "max_ms": 2.0501,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1.0377,
        "p95_ms": 1.3921,
        "min_ms": 1.0262,
        "max_ms": 1.3921,
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
        "median_ms": 23.1077,
        "p95_ms": 47.7534,
        "min_ms": 22.6127,
        "max_ms": 47.7534,
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
        "median_ms": 21.6303,
        "p95_ms": 22.9375,
        "min_ms": 19.7691,
        "max_ms": 22.9375,
        "rounds": 3
      },
      "reference": {
        "median_ms": 23.1077,
        "p95_ms": 47.7534,
        "min_ms": 22.6127,
        "max_ms": 47.7534,
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
        "median_ms": 44.5917,
        "p95_ms": 47.4026,
        "min_ms": 34.3477,
        "max_ms": 47.4026,
        "rounds": 3
      },
      "reference": {
        "median_ms": 23.1077,
        "p95_ms": 47.7534,
        "min_ms": 22.6127,
        "max_ms": 47.7534,
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
        "median_ms": 40.2698,
        "p95_ms": 73.0673,
        "min_ms": 38.1896,
        "max_ms": 73.0673,
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
        "median_ms": 34.289,
        "p95_ms": 35.693,
        "min_ms": 29.794,
        "max_ms": 35.693,
        "rounds": 3
      },
      "reference": {
        "median_ms": 40.2698,
        "p95_ms": 73.0673,
        "min_ms": 38.1896,
        "max_ms": 73.0673,
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
        "median_ms": 36.8011,
        "p95_ms": 42.487,
        "min_ms": 36.1459,
        "max_ms": 42.487,
        "rounds": 3
      },
      "reference": {
        "median_ms": 40.2698,
        "p95_ms": 73.0673,
        "min_ms": 38.1896,
        "max_ms": 73.0673,
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
        "median_ms": 33.0196,
        "p95_ms": 42.314,
        "min_ms": 32.4541,
        "max_ms": 42.314,
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
        "median_ms": 25.9254,
        "p95_ms": 65.1999,
        "min_ms": 22.4993,
        "max_ms": 65.1999,
        "rounds": 3
      },
      "reference": {
        "median_ms": 33.0196,
        "p95_ms": 42.314,
        "min_ms": 32.4541,
        "max_ms": 42.314,
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
        "median_ms": 48.2854,
        "p95_ms": 50.2525,
        "min_ms": 41.4008,
        "max_ms": 50.2525,
        "rounds": 3
      },
      "reference": {
        "median_ms": 33.0196,
        "p95_ms": 42.314,
        "min_ms": 32.4541,
        "max_ms": 42.314,
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
        "median_ms": 21.4983,
        "p95_ms": 25.0775,
        "min_ms": 18.6032,
        "max_ms": 25.0775,
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
        "median_ms": 20.01,
        "p95_ms": 29.5254,
        "min_ms": 18.9832,
        "max_ms": 29.5254,
        "rounds": 3
      },
      "reference": {
        "median_ms": 21.4983,
        "p95_ms": 25.0775,
        "min_ms": 18.6032,
        "max_ms": 25.0775,
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
        "median_ms": 43.991,
        "p95_ms": 61.0398,
        "min_ms": 37.9897,
        "max_ms": 61.0398,
        "rounds": 3
      },
      "reference": {
        "median_ms": 21.4983,
        "p95_ms": 25.0775,
        "min_ms": 18.6032,
        "max_ms": 25.0775,
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
        "median_ms": 58.8346,
        "p95_ms": 61.9389,
        "min_ms": 47.5985,
        "max_ms": 61.9389,
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
        "median_ms": 47.0007,
        "p95_ms": 48.9532,
        "min_ms": 44.3176,
        "max_ms": 48.9532,
        "rounds": 3
      },
      "reference": {
        "median_ms": 58.8346,
        "p95_ms": 61.9389,
        "min_ms": 47.5985,
        "max_ms": 61.9389,
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
        "median_ms": 63.1054,
        "p95_ms": 95.1151,
        "min_ms": 58.5459,
        "max_ms": 95.1151,
        "rounds": 3
      },
      "reference": {
        "median_ms": 58.8346,
        "p95_ms": 61.9389,
        "min_ms": 47.5985,
        "max_ms": 61.9389,
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
        "median_ms": 2.5296,
        "p95_ms": 2.7065,
        "min_ms": 2.4999,
        "max_ms": 2.7065,
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
        "median_ms": 2.984,
        "p95_ms": 3.0522,
        "min_ms": 2.614,
        "max_ms": 3.0522,
        "rounds": 3
      },
      "reference": {
        "median_ms": 2.5296,
        "p95_ms": 2.7065,
        "min_ms": 2.4999,
        "max_ms": 2.7065,
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
        "median_ms": 3.7188,
        "p95_ms": 60.8911,
        "min_ms": 2.9279,
        "max_ms": 60.8911,
        "rounds": 3
      },
      "reference": {
        "median_ms": 2.5296,
        "p95_ms": 2.7065,
        "min_ms": 2.4999,
        "max_ms": 2.7065,
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
        "median_ms": 11.9214,
        "p95_ms": 16.7934,
        "min_ms": 11.5462,
        "max_ms": 16.7934,
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
        "median_ms": 6.3769,
        "p95_ms": 16.4257,
        "min_ms": 4.6232,
        "max_ms": 16.4257,
        "rounds": 3
      },
      "reference": {
        "median_ms": 11.9214,
        "p95_ms": 16.7934,
        "min_ms": 11.5462,
        "max_ms": 16.7934,
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
        "median_ms": 8.0904,
        "p95_ms": 19.6429,
        "min_ms": 5.6291,
        "max_ms": 19.6429,
        "rounds": 3
      },
      "reference": {
        "median_ms": 11.9214,
        "p95_ms": 16.7934,
        "min_ms": 11.5462,
        "max_ms": 16.7934,
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
        "median_ms": 44.9479,
        "p95_ms": 46.3697,
        "min_ms": 37.972,
        "max_ms": 46.3697,
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
        "median_ms": 44.8991,
        "p95_ms": 45.3711,
        "min_ms": 43.1374,
        "max_ms": 45.3711,
        "rounds": 3
      },
      "reference": {
        "median_ms": 44.9479,
        "p95_ms": 46.3697,
        "min_ms": 37.972,
        "max_ms": 46.3697,
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
        "median_ms": 66.5975,
        "p95_ms": 68.4869,
        "min_ms": 61.6382,
        "max_ms": 68.4869,
        "rounds": 3
      },
      "reference": {
        "median_ms": 44.9479,
        "p95_ms": 46.3697,
        "min_ms": 37.972,
        "max_ms": 46.3697,
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
        "median_ms": 11.9249,
        "p95_ms": 13.7551,
        "min_ms": 11.3435,
        "max_ms": 13.7551,
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
        "median_ms": 6.387,
        "p95_ms": 6.5124,
        "min_ms": 5.7572,
        "max_ms": 6.5124,
        "rounds": 3
      },
      "reference": {
        "median_ms": 11.9249,
        "p95_ms": 13.7551,
        "min_ms": 11.3435,
        "max_ms": 13.7551,
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
        "median_ms": 8.4395,
        "p95_ms": 9.422,
        "min_ms": 7.431,
        "max_ms": 9.422,
        "rounds": 3
      },
      "reference": {
        "median_ms": 11.9249,
        "p95_ms": 13.7551,
        "min_ms": 11.3435,
        "max_ms": 13.7551,
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
        "median_ms": 10.6317,
        "p95_ms": 11.7359,
        "min_ms": 8.5385,
        "max_ms": 11.7359,
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
        "median_ms": 11.1499,
        "p95_ms": 15.0919,
        "min_ms": 9.0253,
        "max_ms": 15.0919,
        "rounds": 3
      },
      "reference": {
        "median_ms": 10.6317,
        "p95_ms": 11.7359,
        "min_ms": 8.5385,
        "max_ms": 11.7359,
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
        "median_ms": 10.9927,
        "p95_ms": 12.2157,
        "min_ms": 8.1994,
        "max_ms": 12.2157,
        "rounds": 3
      },
      "reference": {
        "median_ms": 10.6317,
        "p95_ms": 11.7359,
        "min_ms": 8.5385,
        "max_ms": 11.7359,
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
        "median_ms": 1.5112,
        "p95_ms": 1.9487,
        "min_ms": 1.3173,
        "max_ms": 1.9487,
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
        "median_ms": 1.4852,
        "p95_ms": 1.6089,
        "min_ms": 1.4303,
        "max_ms": 1.6089,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1.5112,
        "p95_ms": 1.9487,
        "min_ms": 1.3173,
        "max_ms": 1.9487,
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
        "median_ms": 0.7787,
        "p95_ms": 0.7844,
        "min_ms": 0.7078,
        "max_ms": 0.7844,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1.5112,
        "p95_ms": 1.9487,
        "min_ms": 1.3173,
        "max_ms": 1.9487,
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
        "median_ms": 6.0183,
        "p95_ms": 7.7879,
        "min_ms": 5.2245,
        "max_ms": 7.7879,
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
        "median_ms": 5.6307,
        "p95_ms": 6.5543,
        "min_ms": 3.3594,
        "max_ms": 6.5543,
        "rounds": 3
      },
      "reference": {
        "median_ms": 6.0183,
        "p95_ms": 7.7879,
        "min_ms": 5.2245,
        "max_ms": 7.7879,
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
        "median_ms": 7.7855,
        "p95_ms": 7.7956,
        "min_ms": 6.4093,
        "max_ms": 7.7956,
        "rounds": 3
      },
      "reference": {
        "median_ms": 6.0183,
        "p95_ms": 7.7879,
        "min_ms": 5.2245,
        "max_ms": 7.7879,
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
        "median_ms": 22.045,
        "p95_ms": 30.5451,
        "min_ms": 17.8392,
        "max_ms": 30.5451,
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
        "median_ms": 8.4898,
        "p95_ms": 10.377,
        "min_ms": 8.3538,
        "max_ms": 10.377,
        "rounds": 3
      },
      "reference": {
        "median_ms": 22.045,
        "p95_ms": 30.5451,
        "min_ms": 17.8392,
        "max_ms": 30.5451,
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
        "median_ms": 14.5729,
        "p95_ms": 17.6951,
        "min_ms": 9.1032,
        "max_ms": 17.6951,
        "rounds": 3
      },
      "reference": {
        "median_ms": 22.045,
        "p95_ms": 30.5451,
        "min_ms": 17.8392,
        "max_ms": 30.5451,
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
        "median_ms": 39.1908,
        "p95_ms": 39.3938,
        "min_ms": 35.6124,
        "max_ms": 39.3938,
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
        "median_ms": 14.6928,
        "p95_ms": 17.2885,
        "min_ms": 12.9766,
        "max_ms": 17.2885,
        "rounds": 3
      },
      "reference": {
        "median_ms": 39.1908,
        "p95_ms": 39.3938,
        "min_ms": 35.6124,
        "max_ms": 39.3938,
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
        "median_ms": 31.6583,
        "p95_ms": 37.2106,
        "min_ms": 27.8885,
        "max_ms": 37.2106,
        "rounds": 3
      },
      "reference": {
        "median_ms": 39.1908,
        "p95_ms": 39.3938,
        "min_ms": 35.6124,
        "max_ms": 39.3938,
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
        "median_ms": 6.8396,
        "p95_ms": 11.8733,
        "min_ms": 6.4754,
        "max_ms": 11.8733,
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
        "median_ms": 2.5952,
        "p95_ms": 2.8342,
        "min_ms": 2.3695,
        "max_ms": 2.8342,
        "rounds": 3
      },
      "reference": {
        "median_ms": 6.8396,
        "p95_ms": 11.8733,
        "min_ms": 6.4754,
        "max_ms": 11.8733,
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
        "median_ms": 2.5573,
        "p95_ms": 2.6875,
        "min_ms": 2.4837,
        "max_ms": 2.6875,
        "rounds": 3
      },
      "reference": {
        "median_ms": 6.8396,
        "p95_ms": 11.8733,
        "min_ms": 6.4754,
        "max_ms": 11.8733,
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
        "median_ms": 264.1688,
        "p95_ms": 264.7393,
        "min_ms": 260.075,
        "max_ms": 264.7393,
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
        "median_ms": 256.4083,
        "p95_ms": 270.539,
        "min_ms": 234.4484,
        "max_ms": 270.539,
        "rounds": 3
      },
      "reference": {
        "median_ms": 264.1688,
        "p95_ms": 264.7393,
        "min_ms": 260.075,
        "max_ms": 264.7393,
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
        "median_ms": 254.5662,
        "p95_ms": 269.1205,
        "min_ms": 251.0886,
        "max_ms": 269.1205,
        "rounds": 3
      },
      "reference": {
        "median_ms": 264.1688,
        "p95_ms": 264.7393,
        "min_ms": 260.075,
        "max_ms": 264.7393,
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
        "median_ms": 6.3447,
        "p95_ms": 6.6535,
        "min_ms": 5.8064,
        "max_ms": 6.6535,
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
        "median_ms": 5.5843,
        "p95_ms": 5.9616,
        "min_ms": 5.1674,
        "max_ms": 5.9616,
        "rounds": 3
      },
      "reference": {
        "median_ms": 6.3447,
        "p95_ms": 6.6535,
        "min_ms": 5.8064,
        "max_ms": 6.6535,
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
        "median_ms": 8.4611,
        "p95_ms": 10.3369,
        "min_ms": 5.6717,
        "max_ms": 10.3369,
        "rounds": 3
      },
      "reference": {
        "median_ms": 6.3447,
        "p95_ms": 6.6535,
        "min_ms": 5.8064,
        "max_ms": 6.6535,
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
        "median_ms": 13.7189,
        "p95_ms": 16.6781,
        "min_ms": 13.4048,
        "max_ms": 16.6781,
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
        "median_ms": 9.7192,
        "p95_ms": 11.7396,
        "min_ms": 9.083,
        "max_ms": 11.7396,
        "rounds": 3
      },
      "reference": {
        "median_ms": 13.7189,
        "p95_ms": 16.6781,
        "min_ms": 13.4048,
        "max_ms": 16.6781,
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
        "median_ms": 10.5445,
        "p95_ms": 15.5181,
        "min_ms": 10.2139,
        "max_ms": 15.5181,
        "rounds": 3
      },
      "reference": {
        "median_ms": 13.7189,
        "p95_ms": 16.6781,
        "min_ms": 13.4048,
        "max_ms": 16.6781,
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
        "median_ms": 34.2531,
        "p95_ms": 38.8514,
        "min_ms": 32.334,
        "max_ms": 38.8514,
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
        "median_ms": 72.7753,
        "p95_ms": 74.3306,
        "min_ms": 64.2945,
        "max_ms": 74.3306,
        "rounds": 3
      },
      "reference": {
        "median_ms": 34.2531,
        "p95_ms": 38.8514,
        "min_ms": 32.334,
        "max_ms": 38.8514,
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
        "median_ms": 81.1203,
        "p95_ms": 89.1505,
        "min_ms": 71.0083,
        "max_ms": 89.1505,
        "rounds": 3
      },
      "reference": {
        "median_ms": 34.2531,
        "p95_ms": 38.8514,
        "min_ms": 32.334,
        "max_ms": 38.8514,
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
        "median_ms": 23.4752,
        "p95_ms": 28.2209,
        "min_ms": 21.0575,
        "max_ms": 28.2209,
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
        "median_ms": 21.3131,
        "p95_ms": 24.0563,
        "min_ms": 19.1444,
        "max_ms": 24.0563,
        "rounds": 3
      },
      "reference": {
        "median_ms": 23.4752,
        "p95_ms": 28.2209,
        "min_ms": 21.0575,
        "max_ms": 28.2209,
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
        "median_ms": 21.4991,
        "p95_ms": 22.946,
        "min_ms": 19.0072,
        "max_ms": 22.946,
        "rounds": 3
      },
      "reference": {
        "median_ms": 23.4752,
        "p95_ms": 28.2209,
        "min_ms": 21.0575,
        "max_ms": 28.2209,
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
        "median_ms": 22.1301,
        "p95_ms": 23.5499,
        "min_ms": 20.0446,
        "max_ms": 23.5499,
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
        "median_ms": 19.6477,
        "p95_ms": 22.1637,
        "min_ms": 16.4052,
        "max_ms": 22.1637,
        "rounds": 3
      },
      "reference": {
        "median_ms": 22.1301,
        "p95_ms": 23.5499,
        "min_ms": 20.0446,
        "max_ms": 23.5499,
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
        "median_ms": 18.2261,
        "p95_ms": 23.297,
        "min_ms": 17.5499,
        "max_ms": 23.297,
        "rounds": 3
      },
      "reference": {
        "median_ms": 22.1301,
        "p95_ms": 23.5499,
        "min_ms": 20.0446,
        "max_ms": 23.5499,
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
        "median_ms": 4.3959,
        "p95_ms": 4.7855,
        "min_ms": 3.693,
        "max_ms": 4.7855,
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
        "median_ms": 2.3735,
        "p95_ms": 2.6228,
        "min_ms": 1.6362,
        "max_ms": 2.6228,
        "rounds": 3
      },
      "reference": {
        "median_ms": 4.3959,
        "p95_ms": 4.7855,
        "min_ms": 3.693,
        "max_ms": 4.7855,
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
        "median_ms": 2.676,
        "p95_ms": 2.9003,
        "min_ms": 2.5967,
        "max_ms": 2.9003,
        "rounds": 3
      },
      "reference": {
        "median_ms": 4.3959,
        "p95_ms": 4.7855,
        "min_ms": 3.693,
        "max_ms": 4.7855,
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
        "median_ms": 34.2821,
        "p95_ms": 46.1951,
        "min_ms": 32.1987,
        "max_ms": 46.1951,
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
        "median_ms": 33.9028,
        "p95_ms": 43.913,
        "min_ms": 31.0627,
        "max_ms": 43.913,
        "rounds": 3
      },
      "reference": {
        "median_ms": 34.2821,
        "p95_ms": 46.1951,
        "min_ms": 32.1987,
        "max_ms": 46.1951,
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
        "median_ms": 36.255,
        "p95_ms": 38.1256,
        "min_ms": 28.9644,
        "max_ms": 38.1256,
        "rounds": 3
      },
      "reference": {
        "median_ms": 34.2821,
        "p95_ms": 46.1951,
        "min_ms": 32.1987,
        "max_ms": 46.1951,
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
        "median_ms": 18.9847,
        "p95_ms": 23.6358,
        "min_ms": 12.5881,
        "max_ms": 23.6358,
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
        "median_ms": 14.546,
        "p95_ms": 18.0221,
        "min_ms": 13.7628,
        "max_ms": 18.0221,
        "rounds": 3
      },
      "reference": {
        "median_ms": 18.9847,
        "p95_ms": 23.6358,
        "min_ms": 12.5881,
        "max_ms": 23.6358,
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
        "median_ms": 17.1857,
        "p95_ms": 19.5307,
        "min_ms": 16.4068,
        "max_ms": 19.5307,
        "rounds": 3
      },
      "reference": {
        "median_ms": 18.9847,
        "p95_ms": 23.6358,
        "min_ms": 12.5881,
        "max_ms": 23.6358,
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
        "median_ms": 40.6289,
        "p95_ms": 50.0345,
        "min_ms": 39.7441,
        "max_ms": 50.0345,
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
        "median_ms": 34.0782,
        "p95_ms": 43.4046,
        "min_ms": 32.7295,
        "max_ms": 43.4046,
        "rounds": 3
      },
      "reference": {
        "median_ms": 40.6289,
        "p95_ms": 50.0345,
        "min_ms": 39.7441,
        "max_ms": 50.0345,
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
        "median_ms": 41.0436,
        "p95_ms": 48.837,
        "min_ms": 35.5862,
        "max_ms": 48.837,
        "rounds": 3
      },
      "reference": {
        "median_ms": 40.6289,
        "p95_ms": 50.0345,
        "min_ms": 39.7441,
        "max_ms": 50.0345,
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
        "median_ms": 1.8902,
        "p95_ms": 1.9304,
        "min_ms": 1.5515,
        "max_ms": 1.9304,
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
        "median_ms": 1.2562,
        "p95_ms": 1.3501,
        "min_ms": 0.9539,
        "max_ms": 1.3501,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1.8902,
        "p95_ms": 1.9304,
        "min_ms": 1.5515,
        "max_ms": 1.9304,
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
        "median_ms": 1.6962,
        "p95_ms": 1.7463,
        "min_ms": 1.6198,
        "max_ms": 1.7463,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1.8902,
        "p95_ms": 1.9304,
        "min_ms": 1.5515,
        "max_ms": 1.9304,
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
        "median_ms": 2.2357,
        "p95_ms": 2.7635,
        "min_ms": 1.705,
        "max_ms": 2.7635,
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
        "median_ms": 1.5432,
        "p95_ms": 1.7311,
        "min_ms": 1.3289,
        "max_ms": 1.7311,
        "rounds": 3
      },
      "reference": {
        "median_ms": 2.2357,
        "p95_ms": 2.7635,
        "min_ms": 1.705,
        "max_ms": 2.7635,
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
        "median_ms": 1.9729,
        "p95_ms": 1.979,
        "min_ms": 1.5885,
        "max_ms": 1.979,
        "rounds": 3
      },
      "reference": {
        "median_ms": 2.2357,
        "p95_ms": 2.7635,
        "min_ms": 1.705,
        "max_ms": 2.7635,
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
        "median_ms": 286.151,
        "p95_ms": 287.2661,
        "min_ms": 281.0722,
        "max_ms": 287.2661,
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
        "median_ms": 261.7637,
        "p95_ms": 271.3343,
        "min_ms": 241.9624,
        "max_ms": 271.3343,
        "rounds": 3
      },
      "reference": {
        "median_ms": 286.151,
        "p95_ms": 287.2661,
        "min_ms": 281.0722,
        "max_ms": 287.2661,
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
        "median_ms": 264.5016,
        "p95_ms": 270.4215,
        "min_ms": 250.4521,
        "max_ms": 270.4215,
        "rounds": 3
      },
      "reference": {
        "median_ms": 286.151,
        "p95_ms": 287.2661,
        "min_ms": 281.0722,
        "max_ms": 287.2661,
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
        "median_ms": 17.6688,
        "p95_ms": 26.9584,
        "min_ms": 16.6859,
        "max_ms": 26.9584,
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
        "median_ms": 16.5342,
        "p95_ms": 16.9449,
        "min_ms": 11.7678,
        "max_ms": 16.9449,
        "rounds": 3
      },
      "reference": {
        "median_ms": 17.6688,
        "p95_ms": 26.9584,
        "min_ms": 16.6859,
        "max_ms": 26.9584,
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
        "median_ms": 17.9018,
        "p95_ms": 26.4499,
        "min_ms": 13.461,
        "max_ms": 26.4499,
        "rounds": 3
      },
      "reference": {
        "median_ms": 17.6688,
        "p95_ms": 26.9584,
        "min_ms": 16.6859,
        "max_ms": 26.9584,
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
        "median_ms": 107.7846,
        "p95_ms": 111.3272,
        "min_ms": 107.5322,
        "max_ms": 111.3272,
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
        "median_ms": 106.986,
        "p95_ms": 110.2274,
        "min_ms": 106.4456,
        "max_ms": 110.2274,
        "rounds": 3
      },
      "reference": {
        "median_ms": 107.7846,
        "p95_ms": 111.3272,
        "min_ms": 107.5322,
        "max_ms": 111.3272,
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
        "median_ms": 108.4923,
        "p95_ms": 108.6613,
        "min_ms": 107.4918,
        "max_ms": 108.6613,
        "rounds": 3
      },
      "reference": {
        "median_ms": 107.7846,
        "p95_ms": 111.3272,
        "min_ms": 107.5322,
        "max_ms": 111.3272,
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
        "median_ms": 18.4141,
        "p95_ms": 21.7514,
        "min_ms": 14.8413,
        "max_ms": 21.7514,
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
        "median_ms": 12.0567,
        "p95_ms": 12.4481,
        "min_ms": 8.866,
        "max_ms": 12.4481,
        "rounds": 3
      },
      "reference": {
        "median_ms": 18.4141,
        "p95_ms": 21.7514,
        "min_ms": 14.8413,
        "max_ms": 21.7514,
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
        "median_ms": 11.7943,
        "p95_ms": 13.2561,
        "min_ms": 10.4923,
        "max_ms": 13.2561,
        "rounds": 3
      },
      "reference": {
        "median_ms": 18.4141,
        "p95_ms": 21.7514,
        "min_ms": 14.8413,
        "max_ms": 21.7514,
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
        "median_ms": 3.3017,
        "p95_ms": 3.6878,
        "min_ms": 3.0173,
        "max_ms": 3.6878,
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
        "median_ms": 2.8749,
        "p95_ms": 13.2258,
        "min_ms": 2.4893,
        "max_ms": 13.2258,
        "rounds": 3
      },
      "reference": {
        "median_ms": 3.3017,
        "p95_ms": 3.6878,
        "min_ms": 3.0173,
        "max_ms": 3.6878,
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
        "median_ms": 4.6933,
        "p95_ms": 5.7008,
        "min_ms": 3.3411,
        "max_ms": 5.7008,
        "rounds": 3
      },
      "reference": {
        "median_ms": 3.3017,
        "p95_ms": 3.6878,
        "min_ms": 3.0173,
        "max_ms": 3.6878,
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
        "median_ms": 2.6434,
        "p95_ms": 5.2135,
        "min_ms": 2.6256,
        "max_ms": 5.2135,
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
        "median_ms": 2.4363,
        "p95_ms": 2.5073,
        "min_ms": 2.3233,
        "max_ms": 2.5073,
        "rounds": 3
      },
      "reference": {
        "median_ms": 2.6434,
        "p95_ms": 5.2135,
        "min_ms": 2.6256,
        "max_ms": 5.2135,
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
        "median_ms": 5.4684,
        "p95_ms": 5.6773,
        "min_ms": 4.001,
        "max_ms": 5.6773,
        "rounds": 3
      },
      "reference": {
        "median_ms": 2.6434,
        "p95_ms": 5.2135,
        "min_ms": 2.6256,
        "max_ms": 5.2135,
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
        "median_ms": 7.2649,
        "p95_ms": 7.9224,
        "min_ms": 6.5281,
        "max_ms": 7.9224,
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
        "median_ms": 8.204,
        "p95_ms": 8.2336,
        "min_ms": 7.0216,
        "max_ms": 8.2336,
        "rounds": 3
      },
      "reference": {
        "median_ms": 7.2649,
        "p95_ms": 7.9224,
        "min_ms": 6.5281,
        "max_ms": 7.9224,
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
        "median_ms": 6.5945,
        "p95_ms": 8.5837,
        "min_ms": 5.8632,
        "max_ms": 8.5837,
        "rounds": 3
      },
      "reference": {
        "median_ms": 7.2649,
        "p95_ms": 7.9224,
        "min_ms": 6.5281,
        "max_ms": 7.9224,
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
        "median_ms": 31.6832,
        "p95_ms": 39.0711,
        "min_ms": 27.9301,
        "max_ms": 39.0711,
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
        "median_ms": 34.9701,
        "p95_ms": 38.7079,
        "min_ms": 20.1741,
        "max_ms": 38.7079,
        "rounds": 3
      },
      "reference": {
        "median_ms": 31.6832,
        "p95_ms": 39.0711,
        "min_ms": 27.9301,
        "max_ms": 39.0711,
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
        "median_ms": 23.5954,
        "p95_ms": 30.5034,
        "min_ms": 18.7803,
        "max_ms": 30.5034,
        "rounds": 3
      },
      "reference": {
        "median_ms": 31.6832,
        "p95_ms": 39.0711,
        "min_ms": 27.9301,
        "max_ms": 39.0711,
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
        "median_ms": 21.6582,
        "p95_ms": 23.1627,
        "min_ms": 21.1125,
        "max_ms": 23.1627,
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
        "median_ms": 15.3513,
        "p95_ms": 17.6025,
        "min_ms": 13.2219,
        "max_ms": 17.6025,
        "rounds": 3
      },
      "reference": {
        "median_ms": 21.6582,
        "p95_ms": 23.1627,
        "min_ms": 21.1125,
        "max_ms": 23.1627,
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
        "median_ms": 16.2474,
        "p95_ms": 19.3331,
        "min_ms": 16.2413,
        "max_ms": 19.3331,
        "rounds": 3
      },
      "reference": {
        "median_ms": 21.6582,
        "p95_ms": 23.1627,
        "min_ms": 21.1125,
        "max_ms": 23.1627,
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
        "median_ms": 29.2252,
        "p95_ms": 36.5501,
        "min_ms": 26.893,
        "max_ms": 36.5501,
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
        "median_ms": 25.5452,
        "p95_ms": 36.0087,
        "min_ms": 20.0794,
        "max_ms": 36.0087,
        "rounds": 3
      },
      "reference": {
        "median_ms": 29.2252,
        "p95_ms": 36.5501,
        "min_ms": 26.893,
        "max_ms": 36.5501,
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
        "median_ms": 32.3638,
        "p95_ms": 35.9715,
        "min_ms": 31.812,
        "max_ms": 35.9715,
        "rounds": 3
      },
      "reference": {
        "median_ms": 29.2252,
        "p95_ms": 36.5501,
        "min_ms": 26.893,
        "max_ms": 36.5501,
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
        "median_ms": 73.6173,
        "p95_ms": 77.5071,
        "min_ms": 66.3636,
        "max_ms": 77.5071,
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
        "median_ms": 72.0969,
        "p95_ms": 75.6092,
        "min_ms": 64.8952,
        "max_ms": 75.6092,
        "rounds": 3
      },
      "reference": {
        "median_ms": 73.6173,
        "p95_ms": 77.5071,
        "min_ms": 66.3636,
        "max_ms": 77.5071,
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
        "median_ms": 83.3548,
        "p95_ms": 87.1642,
        "min_ms": 74.7492,
        "max_ms": 87.1642,
        "rounds": 3
      },
      "reference": {
        "median_ms": 73.6173,
        "p95_ms": 77.5071,
        "min_ms": 66.3636,
        "max_ms": 77.5071,
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
        "median_ms": 79.0411,
        "p95_ms": 97.1343,
        "min_ms": 70.4107,
        "max_ms": 97.1343,
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
        "median_ms": 62.1652,
        "p95_ms": 64.0707,
        "min_ms": 60.0772,
        "max_ms": 64.0707,
        "rounds": 3
      },
      "reference": {
        "median_ms": 79.0411,
        "p95_ms": 97.1343,
        "min_ms": 70.4107,
        "max_ms": 97.1343,
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
        "median_ms": 79.9043,
        "p95_ms": 80.8373,
        "min_ms": 76.3857,
        "max_ms": 80.8373,
        "rounds": 3
      },
      "reference": {
        "median_ms": 79.0411,
        "p95_ms": 97.1343,
        "min_ms": 70.4107,
        "max_ms": 97.1343,
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
        "median_ms": 34.0988,
        "p95_ms": 42.663,
        "min_ms": 32.9225,
        "max_ms": 42.663,
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
        "median_ms": 36.6098,
        "p95_ms": 39.1208,
        "min_ms": 29.7436,
        "max_ms": 39.1208,
        "rounds": 3
      },
      "reference": {
        "median_ms": 34.0988,
        "p95_ms": 42.663,
        "min_ms": 32.9225,
        "max_ms": 42.663,
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
        "median_ms": 45.4311,
        "p95_ms": 49.7202,
        "min_ms": 31.8972,
        "max_ms": 49.7202,
        "rounds": 3
      },
      "reference": {
        "median_ms": 34.0988,
        "p95_ms": 42.663,
        "min_ms": 32.9225,
        "max_ms": 42.663,
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
        "median_ms": 57.7406,
        "p95_ms": 63.8943,
        "min_ms": 40.1827,
        "max_ms": 63.8943,
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
        "median_ms": 48.3302,
        "p95_ms": 49.2108,
        "min_ms": 44.5655,
        "max_ms": 49.2108,
        "rounds": 3
      },
      "reference": {
        "median_ms": 57.7406,
        "p95_ms": 63.8943,
        "min_ms": 40.1827,
        "max_ms": 63.8943,
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
        "median_ms": 47.1322,
        "p95_ms": 50.2172,
        "min_ms": 44.6162,
        "max_ms": 50.2172,
        "rounds": 3
      },
      "reference": {
        "median_ms": 57.7406,
        "p95_ms": 63.8943,
        "min_ms": 40.1827,
        "max_ms": 63.8943,
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
        "median_ms": 40.6056,
        "p95_ms": 84.9437,
        "min_ms": 31.0844,
        "max_ms": 84.9437,
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
        "median_ms": 40.085,
        "p95_ms": 40.7834,
        "min_ms": 38.8281,
        "max_ms": 40.7834,
        "rounds": 3
      },
      "reference": {
        "median_ms": 40.6056,
        "p95_ms": 84.9437,
        "min_ms": 31.0844,
        "max_ms": 84.9437,
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
        "median_ms": 39.2692,
        "p95_ms": 46.7178,
        "min_ms": 39.0099,
        "max_ms": 46.7178,
        "rounds": 3
      },
      "reference": {
        "median_ms": 40.6056,
        "p95_ms": 84.9437,
        "min_ms": 31.0844,
        "max_ms": 84.9437,
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
        "median_ms": 51.2083,
        "p95_ms": 53.2043,
        "min_ms": 41.1011,
        "max_ms": 53.2043,
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
        "median_ms": 53.8628,
        "p95_ms": 56.0953,
        "min_ms": 42.0838,
        "max_ms": 56.0953,
        "rounds": 3
      },
      "reference": {
        "median_ms": 51.2083,
        "p95_ms": 53.2043,
        "min_ms": 41.1011,
        "max_ms": 53.2043,
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
        "median_ms": 56.131,
        "p95_ms": 61.1736,
        "min_ms": 45.813,
        "max_ms": 61.1736,
        "rounds": 3
      },
      "reference": {
        "median_ms": 51.2083,
        "p95_ms": 53.2043,
        "min_ms": 41.1011,
        "max_ms": 53.2043,
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
        "median_ms": 0.5313,
        "p95_ms": 0.6809,
        "min_ms": 0.3573,
        "max_ms": 0.6809,
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
        "median_ms": 0.502,
        "p95_ms": 0.6409,
        "min_ms": 0.4709,
        "max_ms": 0.6409,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.5313,
        "p95_ms": 0.6809,
        "min_ms": 0.3573,
        "max_ms": 0.6809,
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
        "median_ms": 0.6962,
        "p95_ms": 0.7249,
        "min_ms": 0.504,
        "max_ms": 0.7249,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.5313,
        "p95_ms": 0.6809,
        "min_ms": 0.3573,
        "max_ms": 0.6809,
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
        "median_ms": 124.9019,
        "p95_ms": 148.7764,
        "min_ms": 113.8604,
        "max_ms": 148.7764,
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
        "median_ms": 103.1585,
        "p95_ms": 116.6581,
        "min_ms": 100.4191,
        "max_ms": 116.6581,
        "rounds": 3
      },
      "reference": {
        "median_ms": 124.9019,
        "p95_ms": 148.7764,
        "min_ms": 113.8604,
        "max_ms": 148.7764,
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
        "median_ms": 129.0577,
        "p95_ms": 133.3924,
        "min_ms": 105.9686,
        "max_ms": 133.3924,
        "rounds": 3
      },
      "reference": {
        "median_ms": 124.9019,
        "p95_ms": 148.7764,
        "min_ms": 113.8604,
        "max_ms": 148.7764,
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
      "workload": "zset-remove-ops@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 4.4626,
        "p95_ms": 7.0567,
        "min_ms": 4.1549,
        "max_ms": 7.0567,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-zset-remove",
        "scenario_params": {
          "members": "200",
          "commands": "ZREM,ZREMRANGEBYRANK,ZREMRANGEBYSCORE,ZCARD"
        },
        "data_scale": "key=bench:zrem,members=200"
      }
    },
    {
      "workload": "zset-remove-ops@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 8.3955,
        "p95_ms": 9.0661,
        "min_ms": 8.0094,
        "max_ms": 9.0661,
        "rounds": 3
      },
      "reference": {
        "median_ms": 4.4626,
        "p95_ms": 7.0567,
        "min_ms": 4.1549,
        "max_ms": 7.0567,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-zset-remove",
        "scenario_params": {
          "members": "200",
          "commands": "ZREM,ZREMRANGEBYRANK,ZREMRANGEBYSCORE,ZCARD"
        },
        "data_scale": "key=bench:zrem,members=200"
      }
    },
    {
      "workload": "zset-remove-ops@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 7.7208,
        "p95_ms": 7.8701,
        "min_ms": 4.6982,
        "max_ms": 7.8701,
        "rounds": 3
      },
      "reference": {
        "median_ms": 4.4626,
        "p95_ms": 7.0567,
        "min_ms": 4.1549,
        "max_ms": 7.0567,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-zset-remove",
        "scenario_params": {
          "members": "200",
          "commands": "ZREM,ZREMRANGEBYRANK,ZREMRANGEBYSCORE,ZCARD"
        },
        "data_scale": "key=bench:zrem,members=200"
      }
    },
    {
      "workload": "set-store-ops@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 12.7992,
        "p95_ms": 17.4378,
        "min_ms": 12.7323,
        "max_ms": 17.4378,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-set-store-algebra",
        "scenario_params": {
          "members": "200",
          "repeat": "10",
          "commands": "SINTERSTORE,SUNIONSTORE,SDIFFSTORE,ZUNIONSTORE"
        },
        "data_scale": "sets=2,members=200,dest=40"
      }
    },
    {
      "workload": "set-store-ops@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 17.5333,
        "p95_ms": 17.8571,
        "min_ms": 15.677,
        "max_ms": 17.8571,
        "rounds": 3
      },
      "reference": {
        "median_ms": 12.7992,
        "p95_ms": 17.4378,
        "min_ms": 12.7323,
        "max_ms": 17.4378,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-set-store-algebra",
        "scenario_params": {
          "members": "200",
          "repeat": "10",
          "commands": "SINTERSTORE,SUNIONSTORE,SDIFFSTORE,ZUNIONSTORE"
        },
        "data_scale": "sets=2,members=200,dest=40"
      }
    },
    {
      "workload": "set-store-ops@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 13.9533,
        "p95_ms": 17.51,
        "min_ms": 11.075,
        "max_ms": 17.51,
        "rounds": 3
      },
      "reference": {
        "median_ms": 12.7992,
        "p95_ms": 17.4378,
        "min_ms": 12.7323,
        "max_ms": 17.4378,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-set-store-algebra",
        "scenario_params": {
          "members": "200",
          "repeat": "10",
          "commands": "SINTERSTORE,SUNIONSTORE,SDIFFSTORE,ZUNIONSTORE"
        },
        "data_scale": "sets=2,members=200,dest=40"
      }
    },
    {
      "workload": "expire-ms@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 107.9169,
        "p95_ms": 153.547,
        "min_ms": 89.4315,
        "max_ms": 153.547,
        "rounds": 3
      },
      "reference": null,
      "reference_engine": null,
      "provenance": {
        "scenario": "redis-key-expire-milliseconds",
        "scenario_params": {
          "keys": "200",
          "commands": "PSETEX,PTTL,PEXPIRE,PERSIST"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "expire-ms@@yydb/redis",
      "unit": "ms",
      "ours": {
        "median_ms": 75.4599,
        "p95_ms": 84.5954,
        "min_ms": 71.7268,
        "max_ms": 84.5954,
        "rounds": 3
      },
      "reference": {
        "median_ms": 107.9169,
        "p95_ms": 153.547,
        "min_ms": 89.4315,
        "max_ms": 153.547,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-key-expire-milliseconds",
        "scenario_params": {
          "keys": "200",
          "commands": "PSETEX,PTTL,PEXPIRE,PERSIST"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "expire-ms@node-redis",
      "unit": "ms",
      "ours": {
        "median_ms": 108.1699,
        "p95_ms": 114.826,
        "min_ms": 100.1619,
        "max_ms": 114.826,
        "rounds": 3
      },
      "reference": {
        "median_ms": 107.9169,
        "p95_ms": 153.547,
        "min_ms": 89.4315,
        "max_ms": 153.547,
        "rounds": 3
      },
      "reference_engine": "ioredis",
      "provenance": {
        "scenario": "redis-key-expire-milliseconds",
        "scenario_params": {
          "keys": "200",
          "commands": "PSETEX,PTTL,PEXPIRE,PERSIST"
        },
        "data_scale": "keys=200,value_bytes=64"
      }
    },
    {
      "workload": "expire-options@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 110.542,
        "p95_ms": 119.9463,
        "min_ms": 102.6298,
        "max_ms": 119.9463,
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
        "median_ms": 111.0212,
        "p95_ms": 118.2046,
        "min_ms": 98.863,
        "max_ms": 118.2046,
        "rounds": 3
      },
      "reference": {
        "median_ms": 110.542,
        "p95_ms": 119.9463,
        "min_ms": 102.6298,
        "max_ms": 119.9463,
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
        "median_ms": 128.8579,
        "p95_ms": 148.5426,
        "min_ms": 102.6916,
        "max_ms": 148.5426,
        "rounds": 3
      },
      "reference": {
        "median_ms": 110.542,
        "p95_ms": 119.9463,
        "min_ms": 102.6298,
        "max_ms": 119.9463,
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
        "median_ms": 50.9795,
        "p95_ms": 55.0615,
        "min_ms": 49.5294,
        "max_ms": 55.0615,
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
        "median_ms": 47.5291,
        "p95_ms": 61.4953,
        "min_ms": 46.8919,
        "max_ms": 61.4953,
        "rounds": 3
      },
      "reference": {
        "median_ms": 50.9795,
        "p95_ms": 55.0615,
        "min_ms": 49.5294,
        "max_ms": 55.0615,
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
        "median_ms": 54.9052,
        "p95_ms": 56.9706,
        "min_ms": 53.9782,
        "max_ms": 56.9706,
        "rounds": 3
      },
      "reference": {
        "median_ms": 50.9795,
        "p95_ms": 55.0615,
        "min_ms": 49.5294,
        "max_ms": 55.0615,
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
        "median_ms": 100.3277,
        "p95_ms": 105.9038,
        "min_ms": 99.7337,
        "max_ms": 105.9038,
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
        "median_ms": 99.5911,
        "p95_ms": 140.2319,
        "min_ms": 90.0536,
        "max_ms": 140.2319,
        "rounds": 3
      },
      "reference": {
        "median_ms": 100.3277,
        "p95_ms": 105.9038,
        "min_ms": 99.7337,
        "max_ms": 105.9038,
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
        "median_ms": 92.6576,
        "p95_ms": 117.4722,
        "min_ms": 92.3778,
        "max_ms": 117.4722,
        "rounds": 3
      },
      "reference": {
        "median_ms": 100.3277,
        "p95_ms": 105.9038,
        "min_ms": 99.7337,
        "max_ms": 105.9038,
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
        "median_ms": 59.715,
        "p95_ms": 63.0686,
        "min_ms": 50.7345,
        "max_ms": 63.0686,
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
        "median_ms": 55.1293,
        "p95_ms": 55.4317,
        "min_ms": 45.2665,
        "max_ms": 55.4317,
        "rounds": 3
      },
      "reference": {
        "median_ms": 59.715,
        "p95_ms": 63.0686,
        "min_ms": 50.7345,
        "max_ms": 63.0686,
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
        "median_ms": 58.572,
        "p95_ms": 71.7796,
        "min_ms": 55.1538,
        "max_ms": 71.7796,
        "rounds": 3
      },
      "reference": {
        "median_ms": 59.715,
        "p95_ms": 63.0686,
        "min_ms": 50.7345,
        "max_ms": 63.0686,
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
        "median_ms": 54.619,
        "p95_ms": 62.3096,
        "min_ms": 53.6906,
        "max_ms": 62.3096,
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
        "median_ms": 51.6278,
        "p95_ms": 60.6894,
        "min_ms": 41.8541,
        "max_ms": 60.6894,
        "rounds": 3
      },
      "reference": {
        "median_ms": 54.619,
        "p95_ms": 62.3096,
        "min_ms": 53.6906,
        "max_ms": 62.3096,
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
        "median_ms": 61.3824,
        "p95_ms": 72.0056,
        "min_ms": 58.8157,
        "max_ms": 72.0056,
        "rounds": 3
      },
      "reference": {
        "median_ms": 54.619,
        "p95_ms": 62.3096,
        "min_ms": 53.6906,
        "max_ms": 62.3096,
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
        "median_ms": 97.7732,
        "p95_ms": 110.5382,
        "min_ms": 96.2076,
        "max_ms": 110.5382,
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
        "median_ms": 89.3444,
        "p95_ms": 98.6723,
        "min_ms": 85.8833,
        "max_ms": 98.6723,
        "rounds": 3
      },
      "reference": {
        "median_ms": 97.7732,
        "p95_ms": 110.5382,
        "min_ms": 96.2076,
        "max_ms": 110.5382,
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
        "median_ms": 99.6741,
        "p95_ms": 101.8239,
        "min_ms": 97.8976,
        "max_ms": 101.8239,
        "rounds": 3
      },
      "reference": {
        "median_ms": 97.7732,
        "p95_ms": 110.5382,
        "min_ms": 96.2076,
        "max_ms": 110.5382,
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
        "median_ms": 32.5756,
        "p95_ms": 35.801,
        "min_ms": 31.3291,
        "max_ms": 35.801,
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
        "median_ms": 30.4247,
        "p95_ms": 33.052,
        "min_ms": 24.0902,
        "max_ms": 33.052,
        "rounds": 3
      },
      "reference": {
        "median_ms": 32.5756,
        "p95_ms": 35.801,
        "min_ms": 31.3291,
        "max_ms": 35.801,
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
        "median_ms": 26.5956,
        "p95_ms": 28.3891,
        "min_ms": 19.4316,
        "max_ms": 28.3891,
        "rounds": 3
      },
      "reference": {
        "median_ms": 32.5756,
        "p95_ms": 35.801,
        "min_ms": 31.3291,
        "max_ms": 35.801,
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
        "median_ms": 94.5127,
        "p95_ms": 95.464,
        "min_ms": 94.1364,
        "max_ms": 95.464,
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
        "median_ms": 33.9754,
        "p95_ms": 35.5636,
        "min_ms": 31.1159,
        "max_ms": 35.5636,
        "rounds": 3
      },
      "reference": {
        "median_ms": 94.5127,
        "p95_ms": 95.464,
        "min_ms": 94.1364,
        "max_ms": 95.464,
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
        "median_ms": 65.5413,
        "p95_ms": 74.3442,
        "min_ms": 64.7282,
        "max_ms": 74.3442,
        "rounds": 3
      },
      "reference": {
        "median_ms": 94.5127,
        "p95_ms": 95.464,
        "min_ms": 94.1364,
        "max_ms": 95.464,
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
        "median_ms": 0.7873,
        "p95_ms": 0.8082,
        "min_ms": 0.73,
        "max_ms": 0.8082,
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
        "median_ms": 0.4017,
        "p95_ms": 0.5433,
        "min_ms": 0.335,
        "max_ms": 0.5433,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.7873,
        "p95_ms": 0.8082,
        "min_ms": 0.73,
        "max_ms": 0.8082,
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
        "median_ms": 0.8271,
        "p95_ms": 0.8364,
        "min_ms": 0.7653,
        "max_ms": 0.8364,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.7873,
        "p95_ms": 0.8082,
        "min_ms": 0.73,
        "max_ms": 0.8082,
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
        "median_ms": 0.832,
        "p95_ms": 0.8375,
        "min_ms": 0.7987,
        "max_ms": 0.8375,
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
        "median_ms": 0.3627,
        "p95_ms": 0.3638,
        "min_ms": 0.3575,
        "max_ms": 0.3638,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.832,
        "p95_ms": 0.8375,
        "min_ms": 0.7987,
        "max_ms": 0.8375,
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
        "median_ms": 0.4677,
        "p95_ms": 0.8714,
        "min_ms": 0.4194,
        "max_ms": 0.8714,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.832,
        "p95_ms": 0.8375,
        "min_ms": 0.7987,
        "max_ms": 0.8375,
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
        "median_ms": 0.6594,
        "p95_ms": 0.753,
        "min_ms": 0.6428,
        "max_ms": 0.753,
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
        "median_ms": 0.6628,
        "p95_ms": 0.886,
        "min_ms": 0.6332,
        "max_ms": 0.886,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.6594,
        "p95_ms": 0.753,
        "min_ms": 0.6428,
        "max_ms": 0.753,
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
        "median_ms": 0.6475,
        "p95_ms": 1.8389,
        "min_ms": 0.3489,
        "max_ms": 1.8389,
        "rounds": 3
      },
      "reference": {
        "median_ms": 0.6594,
        "p95_ms": 0.753,
        "min_ms": 0.6428,
        "max_ms": 0.753,
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
        "median_ms": 1.6653,
        "p95_ms": 1.8206,
        "min_ms": 1.5448,
        "max_ms": 1.8206,
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
        "median_ms": 1.525,
        "p95_ms": 1.5834,
        "min_ms": 1.1286,
        "max_ms": 1.5834,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1.6653,
        "p95_ms": 1.8206,
        "min_ms": 1.5448,
        "max_ms": 1.8206,
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
        "median_ms": 0.7167,
        "p95_ms": 0.8163,
        "min_ms": 0.7094,
        "max_ms": 0.8163,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1.6653,
        "p95_ms": 1.8206,
        "min_ms": 1.5448,
        "max_ms": 1.8206,
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
        "median_ms": 1.8137,
        "p95_ms": 1.9097,
        "min_ms": 1.8033,
        "max_ms": 1.9097,
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
        "median_ms": 0.9648,
        "p95_ms": 1.5353,
        "min_ms": 0.6617,
        "max_ms": 1.5353,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1.8137,
        "p95_ms": 1.9097,
        "min_ms": 1.8033,
        "max_ms": 1.9097,
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
        "median_ms": 1.6148,
        "p95_ms": 1.7189,
        "min_ms": 1.4302,
        "max_ms": 1.7189,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1.8137,
        "p95_ms": 1.9097,
        "min_ms": 1.8033,
        "max_ms": 1.9097,
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
