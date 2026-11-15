# Benchmark report

Command: `pnpm --dir projects/redis.ts/examples/vs-js-libraries benchmark`
Binding: `debug` — build with `pnpm build:release` and set `BENCH_BINDING_PROFILE=release` for product numbers
Defaults: `BENCH_SET=100`, `BENCH_GET=500`, `BENCH_PIPE=500`, `BENCH_PING=1000`, `BENCH_BATCH=500`, `BENCH_COLL=200`, `BENCH_BIG=20`, `BENCH_BIG_GET=50`, `BENCH_BIG_BYTES=65536`, `BENCH_CONNECT=50`, `BENCH_STREAM=200`, `BENCH_PUBSUB=100`, `BENCH_TTL=30`, `BENCH_TXN=100`, `BENCH_INCR=500`, `BENCH_MSET=500`, `BENCH_DEL=200`, `BENCH_MOVE=200`, `BENCH_BLOCK=100`, `BENCH_PING_CONC=800`, `BENCH_CONC=8`, `BENCH_GROUP=100`, `BENCH_REPEAT=10`, `BENCH_COLL_LARGE=2000`, `BENCH_SWEEP=500`, `BENCH_SWEEP_TTL_MS=50`, `BENCH_SWEEP_WAIT_MS=200`, `BENCH_FANOUT_SUBS=8`, `BENCH_FANOUT=50`, `BENCH_ROUNDS=1`, `BENCH_WARMUP=1`
Baseline: `ioredis` against the emulated server = `1.00x`
Ratio: subject_time / baseline_time (smaller is faster). Fastest cell in each row is bold.
Stats: median/p95/min/max/rounds come from `database.harness::summarize` via `benchSummary` (addon:harnessBenchSummary + harnessBenchPerOp (database.harness::summarize / per_op_ms)); nearest-rank p95, even-length median averages the middle pair. Per-op milliseconds come from `database.harness::per_op_ms` via `benchPerOpMs`, the same DTO the summary returns. No median, p95 or per-op formula lives in this example.

## Provenance

- `node_version`: `v24.18.0`
- `rustc_version`: `rustc 1.101.0-nightly (1c3a65069 2026-11-02)`
- `target_triple`: `x86_64-pc-windows-msvc`
- `rev`: `753c2d3d64f1e193bb5074339d04960a2773e396`
- `plan`: `rounds=1, warmup=1`
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
| `connect` | `redis-connect-open-close` | 50 | {"opens":"50","probe":"PING"} |

## Relative to `ioredis`

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|-------:|-------:|-------:|
| get-seq | 1.00x | **0.79x** | 1.35x |
| set-seq | 1.00x | **0.70x** | 1.91x |
| mset-seq | 1.00x | 1.10x | **0.99x** |
| incr-seq | 1.00x | 0.63x | **0.40x** |
| set-pipeline | 1.00x | 1.26x | **0.97x** |
| get-pipeline | 1.00x | **0.76x** | 1.58x |
| pipeline-mixed | 1.00x | **0.71x** | 0.84x |
| hash-hset-hget | **1.00x** | 2.67x | 2.48x |
| hash-setnx-hrandfield | 1.00x | **0.98x** | 2.95x |
| list-rpush-lrange | 1.00x | **0.53x** | 0.76x |
| set-sadd-smembers | 1.00x | **0.87x** | 1.04x |
| zset-zadd-zrange | **1.00x** | 3.25x | 2.75x |
| streams-xadd-xrange | **1.00x** | 1.34x | 1.57x |
| pubsub-roundtrip | 1.00x | 0.62x | **0.61x** |
| blpop-roundtrip | 1.00x | 0.54x | **0.51x** |
| scan-full | 1.00x | 0.53x | **0.52x** |
| ping-concurrent | 1.00x | **0.95x** | 1.46x |
| stream-group | 1.00x | **0.81x** | 0.88x |
| ttl-setex-expire | **1.00x** | 1.02x | 1.00x |
| multi-exec | **1.00x** | 1.02x | 1.10x |
| mget-seq | **1.00x** | 1.50x | 1.41x |
| append-getrange | 1.00x | 1.05x | **0.94x** |
| getdel-getex | **1.00x** | 1.03x | 1.40x |
| set-options | 1.00x | **0.86x** | 1.07x |
| exists-type | 1.00x | **0.82x** | 1.17x |
| expire-persist | 1.00x | **0.95x** | 1.28x |
| hash-hgetall-hdel | 1.00x | 0.89x | **0.82x** |
| hash-keys-values | 1.00x | **0.83x** | 1.23x |
| list-lpush-lpop | 1.00x | **0.84x** | 1.15x |
| set-algebra | 1.00x | **0.77x** | 1.00x |
| set-membership-ops | 1.00x | 1.65x | **0.88x** |
| zset-pop-ops | 1.00x | **0.55x** | 0.66x |
| zset-range-queries | 1.00x | **0.71x** | 0.80x |
| large-collection-read | 1.00x | **0.50x** | 1.18x |
| large-hash-list-read | 1.00x | **0.49x** | 0.54x |
| resp3-hello | 1.00x | **0.88x** | 1.23x |
| expire-sweep | 1.00x | **0.90x** | 0.93x |
| multi-exec-mixed | **1.00x** | 1.16x | 1.04x |
| pubsub-fanout | 1.00x | **0.67x** | 0.84x |
| zset-score-ops | **1.00x** | 1.06x | 1.20x |
| bitfield-ops | 1.00x | **0.75x** | 0.99x |
| hll-ops | 1.00x | **0.93x** | 1.07x |
| sort-ops | 1.00x | 1.10x | **0.96x** |
| keys-random | 1.00x | **0.98x** | 0.99x |
| stream-xread | **1.00x** | 1.02x | 1.32x |
| stream-xadd-xread | **1.00x** | 1.11x | 1.12x |
| hscan-cursor | 1.00x | **0.67x** | 1.58x |
| sscan-zscan-cursor | 1.00x | **0.73x** | 0.97x |
| set-ops-large | 1.00x | **0.94x** | 0.95x |
| lmpop-blocking | 1.00x | 1.04x | **0.99x** |
| key-space-notify | 1.00x | **1.00x** | 1.02x |
| resp3-collections | 1.00x | **0.73x** | 0.78x |
| server-face-ops | **1.00x** | 1.10x | 1.51x |
| watch-exec | 1.00x | 0.90x | **0.84x** |
| set-big | **1.00x** | 1.68x | 2.87x |
| get-big | 1.00x | **0.54x** | 1.33x |
| del-seq | 1.00x | **0.78x** | 1.17x |
| move-seq | 1.00x | **0.85x** | 0.99x |
| ping | 1.00x | **0.98x** | 1.19x |
| bit-ops | **1.00x** | 1.27x | 1.13x |
| setrange-getrange | 1.00x | **0.71x** | 0.95x |
| rename-unlink | 1.00x | **0.94x** | 1.14x |
| setnx-getset | 1.00x | **0.93x** | 1.02x |
| smove-spop | 1.00x | **0.75x** | 0.85x |
| zrangestore-zdiff | 1.00x | 0.60x | **0.56x** |
| connect | 1.00x | **0.35x** | 0.92x |

## Median and p95 (ms)

| Workload | ops | ioredis med | ioredis p95 | @yydb/redis med | @yydb/redis p95 | node-redis med | node-redis p95 |
|---------:|----:|-------:|-------:|-------:|-------:|-------:|-------:|
| get-seq | 500 | 23.53 | 23.53 | 18.66 | 18.66 | 31.75 | 31.75 |
| set-seq | 100 | 7.75 | 7.75 | 5.43 | 5.43 | 14.83 | 14.83 |
| mset-seq | 500 | 6.58 | 6.58 | 7.25 | 7.25 | 6.50 | 6.50 |
| incr-seq | 500 | 80.56 | 80.56 | 51.09 | 51.09 | 32.03 | 32.03 |
| set-pipeline | 500 | 8.47 | 8.47 | 10.68 | 10.68 | 8.24 | 8.24 |
| get-pipeline | 500 | 6.03 | 6.03 | 4.60 | 4.60 | 9.54 | 9.54 |
| pipeline-mixed | 500 | 11.20 | 11.20 | 7.94 | 7.94 | 9.42 | 9.42 |
| hash-hset-hget | 401 | 27.49 | 27.49 | 73.35 | 73.35 | 68.10 | 68.10 |
| hash-setnx-hrandfield | 402 | 13.23 | 13.23 | 12.95 | 12.95 | 38.99 | 38.99 |
| list-rpush-lrange | 202 | 20.46 | 20.46 | 10.95 | 10.95 | 15.50 | 15.50 |
| set-sadd-smembers | 202 | 10.37 | 10.37 | 9.00 | 9.00 | 10.75 | 10.75 |
| zset-zadd-zrange | 202 | 11.71 | 11.71 | 38.01 | 38.01 | 32.16 | 32.16 |
| streams-xadd-xrange | 202 | 56.72 | 56.72 | 75.93 | 75.93 | 88.90 | 88.90 |
| pubsub-roundtrip | 100 | 22.20 | 22.20 | 13.68 | 13.68 | 13.44 | 13.44 |
| blpop-roundtrip | 100 | 27.79 | 27.79 | 15.09 | 15.09 | 14.30 | 14.30 |
| scan-full | 200 | 3.62 | 3.62 | 1.93 | 1.93 | 1.87 | 1.87 |
| ping-concurrent | 800 | 22.13 | 22.13 | 20.96 | 20.96 | 32.22 | 32.22 |
| stream-group | 300 | 44.32 | 44.32 | 35.97 | 35.97 | 39.05 | 39.05 |
| ttl-setex-expire | 90 | 1112.48 | 1112.48 | 1132.29 | 1132.29 | 1117.34 | 1117.34 |
| multi-exec | 102 | 9.23 | 9.23 | 9.43 | 9.43 | 10.18 | 10.18 |
| mget-seq | 200 | 0.72 | 0.72 | 1.08 | 1.08 | 1.02 | 1.02 |
| append-getrange | 201 | 19.69 | 19.69 | 20.73 | 20.73 | 18.58 | 18.58 |
| getdel-getex | 400 | 30.43 | 30.43 | 31.27 | 31.27 | 42.72 | 42.72 |
| set-options | 400 | 53.59 | 53.59 | 46.29 | 46.29 | 57.60 | 57.60 |
| exists-type | 400 | 34.47 | 34.47 | 28.38 | 28.38 | 40.34 | 40.34 |
| expire-persist | 600 | 46.71 | 46.71 | 44.26 | 44.26 | 59.69 | 59.69 |
| hash-hgetall-hdel | 202 | 2.98 | 2.98 | 2.65 | 2.65 | 2.46 | 2.46 |
| hash-keys-values | 40 | 8.95 | 8.95 | 7.45 | 7.45 | 11.03 | 11.03 |
| list-lpush-lpop | 400 | 48.04 | 48.04 | 40.40 | 40.40 | 55.42 | 55.42 |
| set-algebra | 30 | 13.88 | 13.88 | 10.64 | 10.64 | 13.91 | 13.91 |
| set-membership-ops | 30 | 17.29 | 17.29 | 28.54 | 28.54 | 15.23 | 15.23 |
| zset-pop-ops | 4 | 2.96 | 2.96 | 1.62 | 1.62 | 1.95 | 1.95 |
| zset-range-queries | 40 | 9.22 | 9.22 | 6.54 | 6.54 | 7.33 | 7.33 |
| large-collection-read | 20 | 37.05 | 37.05 | 18.47 | 18.47 | 43.58 | 43.58 |
| large-hash-list-read | 20 | 46.08 | 46.08 | 22.80 | 22.80 | 24.96 | 24.96 |
| resp3-hello | 40 | 5.63 | 5.63 | 4.98 | 4.98 | 6.91 | 6.91 |
| expire-sweep | 1002 | 290.49 | 290.49 | 262.34 | 262.34 | 268.91 | 268.91 |
| multi-exec-mixed | 102 | 9.98 | 9.98 | 11.53 | 11.53 | 10.35 | 10.35 |
| pubsub-fanout | 400 | 26.45 | 26.45 | 17.63 | 17.63 | 22.09 | 22.09 |
| zset-score-ops | 600 | 60.98 | 60.98 | 64.74 | 64.74 | 73.46 | 73.46 |
| bitfield-ops | 201 | 21.06 | 21.06 | 15.81 | 15.81 | 20.81 | 20.81 |
| hll-ops | 201 | 18.89 | 18.89 | 17.65 | 17.65 | 20.17 | 20.17 |
| sort-ops | 10 | 2.27 | 2.27 | 2.50 | 2.50 | 2.18 | 2.18 |
| keys-random | 30 | 36.04 | 36.04 | 35.46 | 35.46 | 35.78 | 35.78 |
| stream-xread | 10 | 18.57 | 18.57 | 18.92 | 18.92 | 24.43 | 24.43 |
| stream-xadd-xread | 202 | 29.34 | 29.34 | 32.50 | 32.50 | 32.72 | 32.72 |
| hscan-cursor | 200 | 0.98 | 0.98 | 0.66 | 0.66 | 1.54 | 1.54 |
| sscan-zscan-cursor | 400 | 1.76 | 1.76 | 1.29 | 1.29 | 1.71 | 1.71 |
| set-ops-large | 30 | 267.03 | 267.03 | 249.84 | 249.84 | 253.27 | 253.27 |
| lmpop-blocking | 100 | 14.76 | 14.76 | 15.41 | 15.41 | 14.63 | 14.63 |
| key-space-notify | 30 | 107.03 | 107.03 | 106.76 | 106.76 | 109.54 | 109.54 |
| resp3-collections | 40 | 12.53 | 12.53 | 9.15 | 9.15 | 9.73 | 9.73 |
| server-face-ops | 40 | 3.62 | 3.62 | 3.97 | 3.97 | 5.45 | 5.45 |
| watch-exec | 40 | 4.16 | 4.16 | 3.76 | 3.76 | 3.51 | 3.51 |
| set-big | 20 | 6.53 | 6.53 | 10.95 | 10.95 | 18.77 | 18.77 |
| get-big | 50 | 30.43 | 30.43 | 16.51 | 16.51 | 40.35 | 40.35 |
| del-seq | 200 | 17.26 | 17.26 | 13.39 | 13.39 | 20.21 | 20.21 |
| move-seq | 200 | 27.04 | 27.04 | 22.88 | 22.88 | 26.66 | 26.66 |
| ping | 1000 | 60.44 | 60.44 | 59.35 | 59.35 | 71.95 | 71.95 |
| bit-ops | 800 | 63.86 | 63.86 | 80.96 | 80.96 | 72.20 | 72.20 |
| setrange-getrange | 400 | 39.99 | 39.99 | 28.21 | 28.21 | 37.97 | 37.97 |
| rename-unlink | 400 | 41.85 | 41.85 | 39.21 | 39.21 | 47.80 | 47.80 |
| setnx-getset | 400 | 35.69 | 35.69 | 33.20 | 33.20 | 36.55 | 36.55 |
| smove-spop | 400 | 48.39 | 48.39 | 36.44 | 36.44 | 41.27 | 41.27 |
| zrangestore-zdiff | 400 | 0.84 | 0.84 | 0.50 | 0.50 | 0.47 | 0.47 |
| connect | 50 | 69.49 | 69.49 | 24.27 | 24.27 | 63.80 | 63.80 |

## Per-op and throughput (median)

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|--------:|--------:|--------:|
| get-seq | 0.047 ms/op, 21,249/s | 0.037 ms/op, 26,798/s | 0.063 ms/op, 15,750/s |
| set-seq | 0.077 ms/op, 12,910/s | 0.054 ms/op, 18,422/s | 0.148 ms/op, 6,742/s |
| mset-seq | 0.013 ms/op, 75,968/s | 0.014 ms/op, 68,983/s | 0.013 ms/op, 76,896/s |
| incr-seq | 0.161 ms/op, 6,207/s | 0.102 ms/op, 9,786/s | 0.064 ms/op, 15,609/s |
| set-pipeline | 0.017 ms/op, 59,063/s | 0.021 ms/op, 46,799/s | 0.016 ms/op, 60,686/s |
| get-pipeline | 0.012 ms/op, 82,985/s | 0.009 ms/op, 108,703/s | 0.019 ms/op, 52,418/s |
| pipeline-mixed | 0.022 ms/op, 44,636/s | 0.016 ms/op, 62,949/s | 0.019 ms/op, 53,106/s |
| hash-hset-hget | 0.069 ms/op, 14,586/s | 0.183 ms/op, 5,467/s | 0.170 ms/op, 5,888/s |
| hash-setnx-hrandfield | 0.033 ms/op, 30,380/s | 0.032 ms/op, 31,052/s | 0.097 ms/op, 10,310/s |
| list-rpush-lrange | 0.101 ms/op, 9,871/s | 0.054 ms/op, 18,451/s | 0.077 ms/op, 13,032/s |
| set-sadd-smembers | 0.051 ms/op, 19,480/s | 0.045 ms/op, 22,448/s | 0.053 ms/op, 18,783/s |
| zset-zadd-zrange | 0.058 ms/op, 17,256/s | 0.188 ms/op, 5,314/s | 0.159 ms/op, 6,280/s |
| streams-xadd-xrange | 0.281 ms/op, 3,562/s | 0.376 ms/op, 2,660/s | 0.440 ms/op, 2,272/s |
| pubsub-roundtrip | 0.222 ms/op, 4,504/s | 0.137 ms/op, 7,310/s | 0.134 ms/op, 7,441/s |
| blpop-roundtrip | 0.278 ms/op, 3,599/s | 0.151 ms/op, 6,626/s | 0.143 ms/op, 6,991/s |
| scan-full | 0.018 ms/op, 55,218/s | 0.010 ms/op, 103,381/s | 0.009 ms/op, 106,826/s |
| ping-concurrent | 0.028 ms/op, 36,156/s | 0.026 ms/op, 38,161/s | 0.040 ms/op, 24,832/s |
| stream-group | 0.148 ms/op, 6,769/s | 0.120 ms/op, 8,340/s | 0.130 ms/op, 7,682/s |
| ttl-setex-expire | 12.361 ms/op, 81/s | 12.581 ms/op, 79/s | 12.415 ms/op, 81/s |
| multi-exec | 0.090 ms/op, 11,054/s | 0.092 ms/op, 10,818/s | 0.100 ms/op, 10,024/s |
| mget-seq | 0.004 ms/op, 277,085/s | 0.005 ms/op, 184,758/s | 0.005 ms/op, 196,290/s |
| append-getrange | 0.098 ms/op, 10,208/s | 0.103 ms/op, 9,698/s | 0.092 ms/op, 10,818/s |
| getdel-getex | 0.076 ms/op, 13,144/s | 0.078 ms/op, 12,793/s | 0.107 ms/op, 9,363/s |
| set-options | 0.134 ms/op, 7,464/s | 0.116 ms/op, 8,640/s | 0.144 ms/op, 6,944/s |
| exists-type | 0.086 ms/op, 11,606/s | 0.071 ms/op, 14,097/s | 0.101 ms/op, 9,916/s |
| expire-persist | 0.078 ms/op, 12,844/s | 0.074 ms/op, 13,557/s | 0.099 ms/op, 10,051/s |
| hash-hgetall-hdel | 0.015 ms/op, 67,685/s | 0.013 ms/op, 76,169/s | 0.012 ms/op, 82,097/s |
| hash-keys-values | 0.224 ms/op, 4,469/s | 0.186 ms/op, 5,371/s | 0.276 ms/op, 3,628/s |
| list-lpush-lpop | 0.120 ms/op, 8,327/s | 0.101 ms/op, 9,900/s | 0.139 ms/op, 7,217/s |
| set-algebra | 0.463 ms/op, 2,162/s | 0.355 ms/op, 2,819/s | 0.464 ms/op, 2,157/s |
| set-membership-ops | 0.576 ms/op, 1,736/s | 0.951 ms/op, 1,051/s | 0.508 ms/op, 1,969/s |
| zset-pop-ops | 0.740 ms/op, 1,351/s | 0.406 ms/op, 2,464/s | 0.486 ms/op, 2,056/s |
| zset-range-queries | 0.230 ms/op, 4,340/s | 0.164 ms/op, 6,113/s | 0.183 ms/op, 5,458/s |
| large-collection-read | 1.852 ms/op, 540/s | 0.924 ms/op, 1,083/s | 2.179 ms/op, 459/s |
| large-hash-list-read | 2.304 ms/op, 434/s | 1.140 ms/op, 877/s | 1.248 ms/op, 801/s |
| resp3-hello | 0.141 ms/op, 7,104/s | 0.124 ms/op, 8,040/s | 0.173 ms/op, 5,792/s |
| expire-sweep | 0.290 ms/op, 3,449/s | 0.262 ms/op, 3,820/s | 0.268 ms/op, 3,726/s |
| multi-exec-mixed | 0.098 ms/op, 10,221/s | 0.113 ms/op, 8,844/s | 0.101 ms/op, 9,857/s |
| pubsub-fanout | 0.066 ms/op, 15,126/s | 0.044 ms/op, 22,683/s | 0.055 ms/op, 18,110/s |
| zset-score-ops | 0.102 ms/op, 9,839/s | 0.108 ms/op, 9,267/s | 0.122 ms/op, 8,167/s |
| bitfield-ops | 0.105 ms/op, 9,546/s | 0.079 ms/op, 12,716/s | 0.104 ms/op, 9,658/s |
| hll-ops | 0.094 ms/op, 10,639/s | 0.088 ms/op, 11,385/s | 0.100 ms/op, 9,964/s |
| sort-ops | 0.227 ms/op, 4,398/s | 0.250 ms/op, 4,008/s | 0.218 ms/op, 4,595/s |
| keys-random | 1.201 ms/op, 832/s | 1.182 ms/op, 846/s | 1.193 ms/op, 838/s |
| stream-xread | 1.857 ms/op, 539/s | 1.892 ms/op, 529/s | 2.443 ms/op, 409/s |
| stream-xadd-xread | 0.145 ms/op, 6,884/s | 0.161 ms/op, 6,216/s | 0.162 ms/op, 6,174/s |
| hscan-cursor | 0.005 ms/op, 204,374/s | 0.003 ms/op, 302,801/s | 0.008 ms/op, 129,685/s |
| sscan-zscan-cursor | 0.004 ms/op, 227,622/s | 0.003 ms/op, 310,752/s | 0.004 ms/op, 233,795/s |
| set-ops-large | 8.901 ms/op, 112/s | 8.328 ms/op, 120/s | 8.442 ms/op, 118/s |
| lmpop-blocking | 0.148 ms/op, 6,774/s | 0.154 ms/op, 6,489/s | 0.146 ms/op, 6,834/s |
| key-space-notify | 3.568 ms/op, 280/s | 3.559 ms/op, 281/s | 3.651 ms/op, 274/s |
| resp3-collections | 0.313 ms/op, 3,193/s | 0.229 ms/op, 4,371/s | 0.243 ms/op, 4,112/s |
| server-face-ops | 0.091 ms/op, 11,047/s | 0.099 ms/op, 10,064/s | 0.136 ms/op, 7,334/s |
| watch-exec | 0.104 ms/op, 9,607/s | 0.094 ms/op, 10,646/s | 0.088 ms/op, 11,397/s |
| set-big | 0.327 ms/op, 3,061/s | 0.547 ms/op, 1,827/s | 0.938 ms/op, 1,066/s |
| get-big | 0.609 ms/op, 1,643/s | 0.330 ms/op, 3,028/s | 0.807 ms/op, 1,239/s |
| del-seq | 0.086 ms/op, 11,586/s | 0.067 ms/op, 14,936/s | 0.101 ms/op, 9,894/s |
| move-seq | 0.135 ms/op, 7,398/s | 0.114 ms/op, 8,741/s | 0.133 ms/op, 7,503/s |
| ping | 0.060 ms/op, 16,546/s | 0.059 ms/op, 16,850/s | 0.072 ms/op, 13,898/s |
| bit-ops | 0.080 ms/op, 12,527/s | 0.101 ms/op, 9,881/s | 0.090 ms/op, 11,080/s |
| setrange-getrange | 0.100 ms/op, 10,004/s | 0.071 ms/op, 14,180/s | 0.095 ms/op, 10,535/s |
| rename-unlink | 0.105 ms/op, 9,558/s | 0.098 ms/op, 10,201/s | 0.120 ms/op, 8,367/s |
| setnx-getset | 0.089 ms/op, 11,206/s | 0.083 ms/op, 12,048/s | 0.091 ms/op, 10,942/s |
| smove-spop | 0.121 ms/op, 8,266/s | 0.091 ms/op, 10,976/s | 0.103 ms/op, 9,692/s |
| zrangestore-zdiff | 0.002 ms/op, 474,215/s | 0.001 ms/op, 794,281/s | 0.001 ms/op, 845,309/s |
| connect | 1.390 ms/op, 720/s | 0.485 ms/op, 2,060/s | 1.276 ms/op, 784/s |

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
- The matrix above runs on `win32-x64` with the debug binding.

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
      "rounds": "1",
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
    "data_scale": "matrix=66x3",
    "rustc_version": "rustc 1.101.0-nightly (1c3a65069 2026-11-02)",
    "node_version": "v24.18.0",
    "target_triple": "x86_64-pc-windows-msvc",
    "rev": "753c2d3d64f1e193bb5074339d04960a2773e396",
    "plan": {
      "rounds": 1,
      "warmup": 1
    }
  },
  "rows": [
    {
      "workload": "get-seq@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 23.5308,
        "p95_ms": 23.5308,
        "min_ms": 23.5308,
        "max_ms": 23.5308,
        "rounds": 1
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
        "median_ms": 18.658,
        "p95_ms": 18.658,
        "min_ms": 18.658,
        "max_ms": 18.658,
        "rounds": 1
      },
      "reference": {
        "median_ms": 23.5308,
        "p95_ms": 23.5308,
        "min_ms": 23.5308,
        "max_ms": 23.5308,
        "rounds": 1
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
        "median_ms": 31.7463,
        "p95_ms": 31.7463,
        "min_ms": 31.7463,
        "max_ms": 31.7463,
        "rounds": 1
      },
      "reference": {
        "median_ms": 23.5308,
        "p95_ms": 23.5308,
        "min_ms": 23.5308,
        "max_ms": 23.5308,
        "rounds": 1
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
        "median_ms": 7.7461,
        "p95_ms": 7.7461,
        "min_ms": 7.7461,
        "max_ms": 7.7461,
        "rounds": 1
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
        "median_ms": 5.4282,
        "p95_ms": 5.4282,
        "min_ms": 5.4282,
        "max_ms": 5.4282,
        "rounds": 1
      },
      "reference": {
        "median_ms": 7.7461,
        "p95_ms": 7.7461,
        "min_ms": 7.7461,
        "max_ms": 7.7461,
        "rounds": 1
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
        "median_ms": 14.8319,
        "p95_ms": 14.8319,
        "min_ms": 14.8319,
        "max_ms": 14.8319,
        "rounds": 1
      },
      "reference": {
        "median_ms": 7.7461,
        "p95_ms": 7.7461,
        "min_ms": 7.7461,
        "max_ms": 7.7461,
        "rounds": 1
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
        "median_ms": 6.5817,
        "p95_ms": 6.5817,
        "min_ms": 6.5817,
        "max_ms": 6.5817,
        "rounds": 1
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
        "median_ms": 7.2482,
        "p95_ms": 7.2482,
        "min_ms": 7.2482,
        "max_ms": 7.2482,
        "rounds": 1
      },
      "reference": {
        "median_ms": 6.5817,
        "p95_ms": 6.5817,
        "min_ms": 6.5817,
        "max_ms": 6.5817,
        "rounds": 1
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
        "median_ms": 6.5023,
        "p95_ms": 6.5023,
        "min_ms": 6.5023,
        "max_ms": 6.5023,
        "rounds": 1
      },
      "reference": {
        "median_ms": 6.5817,
        "p95_ms": 6.5817,
        "min_ms": 6.5817,
        "max_ms": 6.5817,
        "rounds": 1
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
        "median_ms": 80.5578,
        "p95_ms": 80.5578,
        "min_ms": 80.5578,
        "max_ms": 80.5578,
        "rounds": 1
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
        "median_ms": 51.0928,
        "p95_ms": 51.0928,
        "min_ms": 51.0928,
        "max_ms": 51.0928,
        "rounds": 1
      },
      "reference": {
        "median_ms": 80.5578,
        "p95_ms": 80.5578,
        "min_ms": 80.5578,
        "max_ms": 80.5578,
        "rounds": 1
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
        "median_ms": 32.0327,
        "p95_ms": 32.0327,
        "min_ms": 32.0327,
        "max_ms": 32.0327,
        "rounds": 1
      },
      "reference": {
        "median_ms": 80.5578,
        "p95_ms": 80.5578,
        "min_ms": 80.5578,
        "max_ms": 80.5578,
        "rounds": 1
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
        "median_ms": 8.4655,
        "p95_ms": 8.4655,
        "min_ms": 8.4655,
        "max_ms": 8.4655,
        "rounds": 1
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
        "median_ms": 10.6841,
        "p95_ms": 10.6841,
        "min_ms": 10.6841,
        "max_ms": 10.6841,
        "rounds": 1
      },
      "reference": {
        "median_ms": 8.4655,
        "p95_ms": 8.4655,
        "min_ms": 8.4655,
        "max_ms": 8.4655,
        "rounds": 1
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
        "median_ms": 8.2391,
        "p95_ms": 8.2391,
        "min_ms": 8.2391,
        "max_ms": 8.2391,
        "rounds": 1
      },
      "reference": {
        "median_ms": 8.4655,
        "p95_ms": 8.4655,
        "min_ms": 8.4655,
        "max_ms": 8.4655,
        "rounds": 1
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
        "median_ms": 6.0252,
        "p95_ms": 6.0252,
        "min_ms": 6.0252,
        "max_ms": 6.0252,
        "rounds": 1
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
        "median_ms": 4.5997,
        "p95_ms": 4.5997,
        "min_ms": 4.5997,
        "max_ms": 4.5997,
        "rounds": 1
      },
      "reference": {
        "median_ms": 6.0252,
        "p95_ms": 6.0252,
        "min_ms": 6.0252,
        "max_ms": 6.0252,
        "rounds": 1
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
        "median_ms": 9.5387,
        "p95_ms": 9.5387,
        "min_ms": 9.5387,
        "max_ms": 9.5387,
        "rounds": 1
      },
      "reference": {
        "median_ms": 6.0252,
        "p95_ms": 6.0252,
        "min_ms": 6.0252,
        "max_ms": 6.0252,
        "rounds": 1
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
        "median_ms": 11.2017,
        "p95_ms": 11.2017,
        "min_ms": 11.2017,
        "max_ms": 11.2017,
        "rounds": 1
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
        "median_ms": 7.9429,
        "p95_ms": 7.9429,
        "min_ms": 7.9429,
        "max_ms": 7.9429,
        "rounds": 1
      },
      "reference": {
        "median_ms": 11.2017,
        "p95_ms": 11.2017,
        "min_ms": 11.2017,
        "max_ms": 11.2017,
        "rounds": 1
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
        "median_ms": 9.4151,
        "p95_ms": 9.4151,
        "min_ms": 9.4151,
        "max_ms": 9.4151,
        "rounds": 1
      },
      "reference": {
        "median_ms": 11.2017,
        "p95_ms": 11.2017,
        "min_ms": 11.2017,
        "max_ms": 11.2017,
        "rounds": 1
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
        "median_ms": 27.4926,
        "p95_ms": 27.4926,
        "min_ms": 27.4926,
        "max_ms": 27.4926,
        "rounds": 1
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
        "median_ms": 73.3521,
        "p95_ms": 73.3521,
        "min_ms": 73.3521,
        "max_ms": 73.3521,
        "rounds": 1
      },
      "reference": {
        "median_ms": 27.4926,
        "p95_ms": 27.4926,
        "min_ms": 27.4926,
        "max_ms": 27.4926,
        "rounds": 1
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
        "median_ms": 68.1032,
        "p95_ms": 68.1032,
        "min_ms": 68.1032,
        "max_ms": 68.1032,
        "rounds": 1
      },
      "reference": {
        "median_ms": 27.4926,
        "p95_ms": 27.4926,
        "min_ms": 27.4926,
        "max_ms": 27.4926,
        "rounds": 1
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
        "median_ms": 13.2322,
        "p95_ms": 13.2322,
        "min_ms": 13.2322,
        "max_ms": 13.2322,
        "rounds": 1
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
        "median_ms": 12.9462,
        "p95_ms": 12.9462,
        "min_ms": 12.9462,
        "max_ms": 12.9462,
        "rounds": 1
      },
      "reference": {
        "median_ms": 13.2322,
        "p95_ms": 13.2322,
        "min_ms": 13.2322,
        "max_ms": 13.2322,
        "rounds": 1
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
        "median_ms": 38.9928,
        "p95_ms": 38.9928,
        "min_ms": 38.9928,
        "max_ms": 38.9928,
        "rounds": 1
      },
      "reference": {
        "median_ms": 13.2322,
        "p95_ms": 13.2322,
        "min_ms": 13.2322,
        "max_ms": 13.2322,
        "rounds": 1
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
        "median_ms": 20.4642,
        "p95_ms": 20.4642,
        "min_ms": 20.4642,
        "max_ms": 20.4642,
        "rounds": 1
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
        "median_ms": 10.948,
        "p95_ms": 10.948,
        "min_ms": 10.948,
        "max_ms": 10.948,
        "rounds": 1
      },
      "reference": {
        "median_ms": 20.4642,
        "p95_ms": 20.4642,
        "min_ms": 20.4642,
        "max_ms": 20.4642,
        "rounds": 1
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
        "median_ms": 15.5002,
        "p95_ms": 15.5002,
        "min_ms": 15.5002,
        "max_ms": 15.5002,
        "rounds": 1
      },
      "reference": {
        "median_ms": 20.4642,
        "p95_ms": 20.4642,
        "min_ms": 20.4642,
        "max_ms": 20.4642,
        "rounds": 1
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
        "median_ms": 10.3695,
        "p95_ms": 10.3695,
        "min_ms": 10.3695,
        "max_ms": 10.3695,
        "rounds": 1
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
        "median_ms": 8.9986,
        "p95_ms": 8.9986,
        "min_ms": 8.9986,
        "max_ms": 8.9986,
        "rounds": 1
      },
      "reference": {
        "median_ms": 10.3695,
        "p95_ms": 10.3695,
        "min_ms": 10.3695,
        "max_ms": 10.3695,
        "rounds": 1
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
        "median_ms": 10.7543,
        "p95_ms": 10.7543,
        "min_ms": 10.7543,
        "max_ms": 10.7543,
        "rounds": 1
      },
      "reference": {
        "median_ms": 10.3695,
        "p95_ms": 10.3695,
        "min_ms": 10.3695,
        "max_ms": 10.3695,
        "rounds": 1
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
        "median_ms": 11.706,
        "p95_ms": 11.706,
        "min_ms": 11.706,
        "max_ms": 11.706,
        "rounds": 1
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
        "median_ms": 38.0141,
        "p95_ms": 38.0141,
        "min_ms": 38.0141,
        "max_ms": 38.0141,
        "rounds": 1
      },
      "reference": {
        "median_ms": 11.706,
        "p95_ms": 11.706,
        "min_ms": 11.706,
        "max_ms": 11.706,
        "rounds": 1
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
        "median_ms": 32.1632,
        "p95_ms": 32.1632,
        "min_ms": 32.1632,
        "max_ms": 32.1632,
        "rounds": 1
      },
      "reference": {
        "median_ms": 11.706,
        "p95_ms": 11.706,
        "min_ms": 11.706,
        "max_ms": 11.706,
        "rounds": 1
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
        "median_ms": 56.7172,
        "p95_ms": 56.7172,
        "min_ms": 56.7172,
        "max_ms": 56.7172,
        "rounds": 1
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
        "median_ms": 75.9292,
        "p95_ms": 75.9292,
        "min_ms": 75.9292,
        "max_ms": 75.9292,
        "rounds": 1
      },
      "reference": {
        "median_ms": 56.7172,
        "p95_ms": 56.7172,
        "min_ms": 56.7172,
        "max_ms": 56.7172,
        "rounds": 1
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
        "median_ms": 88.9048,
        "p95_ms": 88.9048,
        "min_ms": 88.9048,
        "max_ms": 88.9048,
        "rounds": 1
      },
      "reference": {
        "median_ms": 56.7172,
        "p95_ms": 56.7172,
        "min_ms": 56.7172,
        "max_ms": 56.7172,
        "rounds": 1
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
        "median_ms": 22.2008,
        "p95_ms": 22.2008,
        "min_ms": 22.2008,
        "max_ms": 22.2008,
        "rounds": 1
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
        "median_ms": 13.6806,
        "p95_ms": 13.6806,
        "min_ms": 13.6806,
        "max_ms": 13.6806,
        "rounds": 1
      },
      "reference": {
        "median_ms": 22.2008,
        "p95_ms": 22.2008,
        "min_ms": 22.2008,
        "max_ms": 22.2008,
        "rounds": 1
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
        "median_ms": 13.4388,
        "p95_ms": 13.4388,
        "min_ms": 13.4388,
        "max_ms": 13.4388,
        "rounds": 1
      },
      "reference": {
        "median_ms": 22.2008,
        "p95_ms": 22.2008,
        "min_ms": 22.2008,
        "max_ms": 22.2008,
        "rounds": 1
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
        "median_ms": 27.7892,
        "p95_ms": 27.7892,
        "min_ms": 27.7892,
        "max_ms": 27.7892,
        "rounds": 1
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
        "median_ms": 15.0912,
        "p95_ms": 15.0912,
        "min_ms": 15.0912,
        "max_ms": 15.0912,
        "rounds": 1
      },
      "reference": {
        "median_ms": 27.7892,
        "p95_ms": 27.7892,
        "min_ms": 27.7892,
        "max_ms": 27.7892,
        "rounds": 1
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
        "median_ms": 14.3041,
        "p95_ms": 14.3041,
        "min_ms": 14.3041,
        "max_ms": 14.3041,
        "rounds": 1
      },
      "reference": {
        "median_ms": 27.7892,
        "p95_ms": 27.7892,
        "min_ms": 27.7892,
        "max_ms": 27.7892,
        "rounds": 1
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
        "median_ms": 3.622,
        "p95_ms": 3.622,
        "min_ms": 3.622,
        "max_ms": 3.622,
        "rounds": 1
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
        "median_ms": 1.9346,
        "p95_ms": 1.9346,
        "min_ms": 1.9346,
        "max_ms": 1.9346,
        "rounds": 1
      },
      "reference": {
        "median_ms": 3.622,
        "p95_ms": 3.622,
        "min_ms": 3.622,
        "max_ms": 3.622,
        "rounds": 1
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
        "median_ms": 1.8722,
        "p95_ms": 1.8722,
        "min_ms": 1.8722,
        "max_ms": 1.8722,
        "rounds": 1
      },
      "reference": {
        "median_ms": 3.622,
        "p95_ms": 3.622,
        "min_ms": 3.622,
        "max_ms": 3.622,
        "rounds": 1
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
        "median_ms": 22.1265,
        "p95_ms": 22.1265,
        "min_ms": 22.1265,
        "max_ms": 22.1265,
        "rounds": 1
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
        "median_ms": 20.9637,
        "p95_ms": 20.9637,
        "min_ms": 20.9637,
        "max_ms": 20.9637,
        "rounds": 1
      },
      "reference": {
        "median_ms": 22.1265,
        "p95_ms": 22.1265,
        "min_ms": 22.1265,
        "max_ms": 22.1265,
        "rounds": 1
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
        "median_ms": 32.2165,
        "p95_ms": 32.2165,
        "min_ms": 32.2165,
        "max_ms": 32.2165,
        "rounds": 1
      },
      "reference": {
        "median_ms": 22.1265,
        "p95_ms": 22.1265,
        "min_ms": 22.1265,
        "max_ms": 22.1265,
        "rounds": 1
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
        "median_ms": 44.3206,
        "p95_ms": 44.3206,
        "min_ms": 44.3206,
        "max_ms": 44.3206,
        "rounds": 1
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
        "median_ms": 35.9706,
        "p95_ms": 35.9706,
        "min_ms": 35.9706,
        "max_ms": 35.9706,
        "rounds": 1
      },
      "reference": {
        "median_ms": 44.3206,
        "p95_ms": 44.3206,
        "min_ms": 44.3206,
        "max_ms": 44.3206,
        "rounds": 1
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
        "median_ms": 39.0518,
        "p95_ms": 39.0518,
        "min_ms": 39.0518,
        "max_ms": 39.0518,
        "rounds": 1
      },
      "reference": {
        "median_ms": 44.3206,
        "p95_ms": 44.3206,
        "min_ms": 44.3206,
        "max_ms": 44.3206,
        "rounds": 1
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
        "median_ms": 1112.4786,
        "p95_ms": 1112.4786,
        "min_ms": 1112.4786,
        "max_ms": 1112.4786,
        "rounds": 1
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
        "median_ms": 1132.2865,
        "p95_ms": 1132.2865,
        "min_ms": 1132.2865,
        "max_ms": 1132.2865,
        "rounds": 1
      },
      "reference": {
        "median_ms": 1112.4786,
        "p95_ms": 1112.4786,
        "min_ms": 1112.4786,
        "max_ms": 1112.4786,
        "rounds": 1
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
        "median_ms": 1117.3388,
        "p95_ms": 1117.3388,
        "min_ms": 1117.3388,
        "max_ms": 1117.3388,
        "rounds": 1
      },
      "reference": {
        "median_ms": 1112.4786,
        "p95_ms": 1112.4786,
        "min_ms": 1112.4786,
        "max_ms": 1112.4786,
        "rounds": 1
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
        "median_ms": 9.2277,
        "p95_ms": 9.2277,
        "min_ms": 9.2277,
        "max_ms": 9.2277,
        "rounds": 1
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
        "median_ms": 9.4288,
        "p95_ms": 9.4288,
        "min_ms": 9.4288,
        "max_ms": 9.4288,
        "rounds": 1
      },
      "reference": {
        "median_ms": 9.2277,
        "p95_ms": 9.2277,
        "min_ms": 9.2277,
        "max_ms": 9.2277,
        "rounds": 1
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
        "median_ms": 10.1757,
        "p95_ms": 10.1757,
        "min_ms": 10.1757,
        "max_ms": 10.1757,
        "rounds": 1
      },
      "reference": {
        "median_ms": 9.2277,
        "p95_ms": 9.2277,
        "min_ms": 9.2277,
        "max_ms": 9.2277,
        "rounds": 1
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
        "median_ms": 0.7218,
        "p95_ms": 0.7218,
        "min_ms": 0.7218,
        "max_ms": 0.7218,
        "rounds": 1
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
        "median_ms": 1.0825,
        "p95_ms": 1.0825,
        "min_ms": 1.0825,
        "max_ms": 1.0825,
        "rounds": 1
      },
      "reference": {
        "median_ms": 0.7218,
        "p95_ms": 0.7218,
        "min_ms": 0.7218,
        "max_ms": 0.7218,
        "rounds": 1
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
        "median_ms": 1.0189,
        "p95_ms": 1.0189,
        "min_ms": 1.0189,
        "max_ms": 1.0189,
        "rounds": 1
      },
      "reference": {
        "median_ms": 0.7218,
        "p95_ms": 0.7218,
        "min_ms": 0.7218,
        "max_ms": 0.7218,
        "rounds": 1
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
        "median_ms": 19.6897,
        "p95_ms": 19.6897,
        "min_ms": 19.6897,
        "max_ms": 19.6897,
        "rounds": 1
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
        "median_ms": 20.7252,
        "p95_ms": 20.7252,
        "min_ms": 20.7252,
        "max_ms": 20.7252,
        "rounds": 1
      },
      "reference": {
        "median_ms": 19.6897,
        "p95_ms": 19.6897,
        "min_ms": 19.6897,
        "max_ms": 19.6897,
        "rounds": 1
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
        "median_ms": 18.5807,
        "p95_ms": 18.5807,
        "min_ms": 18.5807,
        "max_ms": 18.5807,
        "rounds": 1
      },
      "reference": {
        "median_ms": 19.6897,
        "p95_ms": 19.6897,
        "min_ms": 19.6897,
        "max_ms": 19.6897,
        "rounds": 1
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
        "median_ms": 30.4332,
        "p95_ms": 30.4332,
        "min_ms": 30.4332,
        "max_ms": 30.4332,
        "rounds": 1
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
        "median_ms": 31.2683,
        "p95_ms": 31.2683,
        "min_ms": 31.2683,
        "max_ms": 31.2683,
        "rounds": 1
      },
      "reference": {
        "median_ms": 30.4332,
        "p95_ms": 30.4332,
        "min_ms": 30.4332,
        "max_ms": 30.4332,
        "rounds": 1
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
        "median_ms": 42.7236,
        "p95_ms": 42.7236,
        "min_ms": 42.7236,
        "max_ms": 42.7236,
        "rounds": 1
      },
      "reference": {
        "median_ms": 30.4332,
        "p95_ms": 30.4332,
        "min_ms": 30.4332,
        "max_ms": 30.4332,
        "rounds": 1
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
        "median_ms": 53.5925,
        "p95_ms": 53.5925,
        "min_ms": 53.5925,
        "max_ms": 53.5925,
        "rounds": 1
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
        "median_ms": 46.2946,
        "p95_ms": 46.2946,
        "min_ms": 46.2946,
        "max_ms": 46.2946,
        "rounds": 1
      },
      "reference": {
        "median_ms": 53.5925,
        "p95_ms": 53.5925,
        "min_ms": 53.5925,
        "max_ms": 53.5925,
        "rounds": 1
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
        "median_ms": 57.6026,
        "p95_ms": 57.6026,
        "min_ms": 57.6026,
        "max_ms": 57.6026,
        "rounds": 1
      },
      "reference": {
        "median_ms": 53.5925,
        "p95_ms": 53.5925,
        "min_ms": 53.5925,
        "max_ms": 53.5925,
        "rounds": 1
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
        "median_ms": 34.4659,
        "p95_ms": 34.4659,
        "min_ms": 34.4659,
        "max_ms": 34.4659,
        "rounds": 1
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
        "median_ms": 28.3751,
        "p95_ms": 28.3751,
        "min_ms": 28.3751,
        "max_ms": 28.3751,
        "rounds": 1
      },
      "reference": {
        "median_ms": 34.4659,
        "p95_ms": 34.4659,
        "min_ms": 34.4659,
        "max_ms": 34.4659,
        "rounds": 1
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
        "median_ms": 40.3396,
        "p95_ms": 40.3396,
        "min_ms": 40.3396,
        "max_ms": 40.3396,
        "rounds": 1
      },
      "reference": {
        "median_ms": 34.4659,
        "p95_ms": 34.4659,
        "min_ms": 34.4659,
        "max_ms": 34.4659,
        "rounds": 1
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
        "median_ms": 46.7143,
        "p95_ms": 46.7143,
        "min_ms": 46.7143,
        "max_ms": 46.7143,
        "rounds": 1
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
        "median_ms": 44.2578,
        "p95_ms": 44.2578,
        "min_ms": 44.2578,
        "max_ms": 44.2578,
        "rounds": 1
      },
      "reference": {
        "median_ms": 46.7143,
        "p95_ms": 46.7143,
        "min_ms": 46.7143,
        "max_ms": 46.7143,
        "rounds": 1
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
        "median_ms": 59.6931,
        "p95_ms": 59.6931,
        "min_ms": 59.6931,
        "max_ms": 59.6931,
        "rounds": 1
      },
      "reference": {
        "median_ms": 46.7143,
        "p95_ms": 46.7143,
        "min_ms": 46.7143,
        "max_ms": 46.7143,
        "rounds": 1
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
        "median_ms": 2.9844,
        "p95_ms": 2.9844,
        "min_ms": 2.9844,
        "max_ms": 2.9844,
        "rounds": 1
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
        "median_ms": 2.652,
        "p95_ms": 2.652,
        "min_ms": 2.652,
        "max_ms": 2.652,
        "rounds": 1
      },
      "reference": {
        "median_ms": 2.9844,
        "p95_ms": 2.9844,
        "min_ms": 2.9844,
        "max_ms": 2.9844,
        "rounds": 1
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
        "median_ms": 2.4605,
        "p95_ms": 2.4605,
        "min_ms": 2.4605,
        "max_ms": 2.4605,
        "rounds": 1
      },
      "reference": {
        "median_ms": 2.9844,
        "p95_ms": 2.9844,
        "min_ms": 2.9844,
        "max_ms": 2.9844,
        "rounds": 1
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
        "median_ms": 8.9496,
        "p95_ms": 8.9496,
        "min_ms": 8.9496,
        "max_ms": 8.9496,
        "rounds": 1
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
        "median_ms": 7.4476,
        "p95_ms": 7.4476,
        "min_ms": 7.4476,
        "max_ms": 7.4476,
        "rounds": 1
      },
      "reference": {
        "median_ms": 8.9496,
        "p95_ms": 8.9496,
        "min_ms": 8.9496,
        "max_ms": 8.9496,
        "rounds": 1
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
        "median_ms": 11.0268,
        "p95_ms": 11.0268,
        "min_ms": 11.0268,
        "max_ms": 11.0268,
        "rounds": 1
      },
      "reference": {
        "median_ms": 8.9496,
        "p95_ms": 8.9496,
        "min_ms": 8.9496,
        "max_ms": 8.9496,
        "rounds": 1
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
        "median_ms": 48.0385,
        "p95_ms": 48.0385,
        "min_ms": 48.0385,
        "max_ms": 48.0385,
        "rounds": 1
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
        "median_ms": 40.4034,
        "p95_ms": 40.4034,
        "min_ms": 40.4034,
        "max_ms": 40.4034,
        "rounds": 1
      },
      "reference": {
        "median_ms": 48.0385,
        "p95_ms": 48.0385,
        "min_ms": 48.0385,
        "max_ms": 48.0385,
        "rounds": 1
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
        "median_ms": 55.4226,
        "p95_ms": 55.4226,
        "min_ms": 55.4226,
        "max_ms": 55.4226,
        "rounds": 1
      },
      "reference": {
        "median_ms": 48.0385,
        "p95_ms": 48.0385,
        "min_ms": 48.0385,
        "max_ms": 48.0385,
        "rounds": 1
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
        "median_ms": 13.8768,
        "p95_ms": 13.8768,
        "min_ms": 13.8768,
        "max_ms": 13.8768,
        "rounds": 1
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
        "median_ms": 10.6416,
        "p95_ms": 10.6416,
        "min_ms": 10.6416,
        "max_ms": 10.6416,
        "rounds": 1
      },
      "reference": {
        "median_ms": 13.8768,
        "p95_ms": 13.8768,
        "min_ms": 13.8768,
        "max_ms": 13.8768,
        "rounds": 1
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
        "median_ms": 13.9096,
        "p95_ms": 13.9096,
        "min_ms": 13.9096,
        "max_ms": 13.9096,
        "rounds": 1
      },
      "reference": {
        "median_ms": 13.8768,
        "p95_ms": 13.8768,
        "min_ms": 13.8768,
        "max_ms": 13.8768,
        "rounds": 1
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
        "median_ms": 17.2851,
        "p95_ms": 17.2851,
        "min_ms": 17.2851,
        "max_ms": 17.2851,
        "rounds": 1
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
        "median_ms": 28.5446,
        "p95_ms": 28.5446,
        "min_ms": 28.5446,
        "max_ms": 28.5446,
        "rounds": 1
      },
      "reference": {
        "median_ms": 17.2851,
        "p95_ms": 17.2851,
        "min_ms": 17.2851,
        "max_ms": 17.2851,
        "rounds": 1
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
        "median_ms": 15.2346,
        "p95_ms": 15.2346,
        "min_ms": 15.2346,
        "max_ms": 15.2346,
        "rounds": 1
      },
      "reference": {
        "median_ms": 17.2851,
        "p95_ms": 17.2851,
        "min_ms": 17.2851,
        "max_ms": 17.2851,
        "rounds": 1
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
        "median_ms": 2.9615,
        "p95_ms": 2.9615,
        "min_ms": 2.9615,
        "max_ms": 2.9615,
        "rounds": 1
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
        "median_ms": 1.6235,
        "p95_ms": 1.6235,
        "min_ms": 1.6235,
        "max_ms": 1.6235,
        "rounds": 1
      },
      "reference": {
        "median_ms": 2.9615,
        "p95_ms": 2.9615,
        "min_ms": 2.9615,
        "max_ms": 2.9615,
        "rounds": 1
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
        "median_ms": 1.9459,
        "p95_ms": 1.9459,
        "min_ms": 1.9459,
        "max_ms": 1.9459,
        "rounds": 1
      },
      "reference": {
        "median_ms": 2.9615,
        "p95_ms": 2.9615,
        "min_ms": 2.9615,
        "max_ms": 2.9615,
        "rounds": 1
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
        "median_ms": 9.2176,
        "p95_ms": 9.2176,
        "min_ms": 9.2176,
        "max_ms": 9.2176,
        "rounds": 1
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
        "median_ms": 6.5436,
        "p95_ms": 6.5436,
        "min_ms": 6.5436,
        "max_ms": 6.5436,
        "rounds": 1
      },
      "reference": {
        "median_ms": 9.2176,
        "p95_ms": 9.2176,
        "min_ms": 9.2176,
        "max_ms": 9.2176,
        "rounds": 1
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
        "median_ms": 7.3285,
        "p95_ms": 7.3285,
        "min_ms": 7.3285,
        "max_ms": 7.3285,
        "rounds": 1
      },
      "reference": {
        "median_ms": 9.2176,
        "p95_ms": 9.2176,
        "min_ms": 9.2176,
        "max_ms": 9.2176,
        "rounds": 1
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
        "median_ms": 37.0479,
        "p95_ms": 37.0479,
        "min_ms": 37.0479,
        "max_ms": 37.0479,
        "rounds": 1
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
        "median_ms": 18.4703,
        "p95_ms": 18.4703,
        "min_ms": 18.4703,
        "max_ms": 18.4703,
        "rounds": 1
      },
      "reference": {
        "median_ms": 37.0479,
        "p95_ms": 37.0479,
        "min_ms": 37.0479,
        "max_ms": 37.0479,
        "rounds": 1
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
        "median_ms": 43.5799,
        "p95_ms": 43.5799,
        "min_ms": 43.5799,
        "max_ms": 43.5799,
        "rounds": 1
      },
      "reference": {
        "median_ms": 37.0479,
        "p95_ms": 37.0479,
        "min_ms": 37.0479,
        "max_ms": 37.0479,
        "rounds": 1
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
        "median_ms": 46.0788,
        "p95_ms": 46.0788,
        "min_ms": 46.0788,
        "max_ms": 46.0788,
        "rounds": 1
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
        "median_ms": 22.8028,
        "p95_ms": 22.8028,
        "min_ms": 22.8028,
        "max_ms": 22.8028,
        "rounds": 1
      },
      "reference": {
        "median_ms": 46.0788,
        "p95_ms": 46.0788,
        "min_ms": 46.0788,
        "max_ms": 46.0788,
        "rounds": 1
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
        "median_ms": 24.958,
        "p95_ms": 24.958,
        "min_ms": 24.958,
        "max_ms": 24.958,
        "rounds": 1
      },
      "reference": {
        "median_ms": 46.0788,
        "p95_ms": 46.0788,
        "min_ms": 46.0788,
        "max_ms": 46.0788,
        "rounds": 1
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
        "median_ms": 5.631,
        "p95_ms": 5.631,
        "min_ms": 5.631,
        "max_ms": 5.631,
        "rounds": 1
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
        "median_ms": 4.9754,
        "p95_ms": 4.9754,
        "min_ms": 4.9754,
        "max_ms": 4.9754,
        "rounds": 1
      },
      "reference": {
        "median_ms": 5.631,
        "p95_ms": 5.631,
        "min_ms": 5.631,
        "max_ms": 5.631,
        "rounds": 1
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
        "median_ms": 6.9056,
        "p95_ms": 6.9056,
        "min_ms": 6.9056,
        "max_ms": 6.9056,
        "rounds": 1
      },
      "reference": {
        "median_ms": 5.631,
        "p95_ms": 5.631,
        "min_ms": 5.631,
        "max_ms": 5.631,
        "rounds": 1
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
        "median_ms": 290.4934,
        "p95_ms": 290.4934,
        "min_ms": 290.4934,
        "max_ms": 290.4934,
        "rounds": 1
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
        "median_ms": 262.3355,
        "p95_ms": 262.3355,
        "min_ms": 262.3355,
        "max_ms": 262.3355,
        "rounds": 1
      },
      "reference": {
        "median_ms": 290.4934,
        "p95_ms": 290.4934,
        "min_ms": 290.4934,
        "max_ms": 290.4934,
        "rounds": 1
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
        "median_ms": 268.9116,
        "p95_ms": 268.9116,
        "min_ms": 268.9116,
        "max_ms": 268.9116,
        "rounds": 1
      },
      "reference": {
        "median_ms": 290.4934,
        "p95_ms": 290.4934,
        "min_ms": 290.4934,
        "max_ms": 290.4934,
        "rounds": 1
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
        "median_ms": 9.9799,
        "p95_ms": 9.9799,
        "min_ms": 9.9799,
        "max_ms": 9.9799,
        "rounds": 1
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
        "median_ms": 11.5331,
        "p95_ms": 11.5331,
        "min_ms": 11.5331,
        "max_ms": 11.5331,
        "rounds": 1
      },
      "reference": {
        "median_ms": 9.9799,
        "p95_ms": 9.9799,
        "min_ms": 9.9799,
        "max_ms": 9.9799,
        "rounds": 1
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
        "median_ms": 10.3481,
        "p95_ms": 10.3481,
        "min_ms": 10.3481,
        "max_ms": 10.3481,
        "rounds": 1
      },
      "reference": {
        "median_ms": 9.9799,
        "p95_ms": 9.9799,
        "min_ms": 9.9799,
        "max_ms": 9.9799,
        "rounds": 1
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
        "median_ms": 26.4451,
        "p95_ms": 26.4451,
        "min_ms": 26.4451,
        "max_ms": 26.4451,
        "rounds": 1
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
        "median_ms": 17.6343,
        "p95_ms": 17.6343,
        "min_ms": 17.6343,
        "max_ms": 17.6343,
        "rounds": 1
      },
      "reference": {
        "median_ms": 26.4451,
        "p95_ms": 26.4451,
        "min_ms": 26.4451,
        "max_ms": 26.4451,
        "rounds": 1
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
        "median_ms": 22.0878,
        "p95_ms": 22.0878,
        "min_ms": 22.0878,
        "max_ms": 22.0878,
        "rounds": 1
      },
      "reference": {
        "median_ms": 26.4451,
        "p95_ms": 26.4451,
        "min_ms": 26.4451,
        "max_ms": 26.4451,
        "rounds": 1
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
        "median_ms": 60.9795,
        "p95_ms": 60.9795,
        "min_ms": 60.9795,
        "max_ms": 60.9795,
        "rounds": 1
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
        "median_ms": 64.7433,
        "p95_ms": 64.7433,
        "min_ms": 64.7433,
        "max_ms": 64.7433,
        "rounds": 1
      },
      "reference": {
        "median_ms": 60.9795,
        "p95_ms": 60.9795,
        "min_ms": 60.9795,
        "max_ms": 60.9795,
        "rounds": 1
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
        "median_ms": 73.463,
        "p95_ms": 73.463,
        "min_ms": 73.463,
        "max_ms": 73.463,
        "rounds": 1
      },
      "reference": {
        "median_ms": 60.9795,
        "p95_ms": 60.9795,
        "min_ms": 60.9795,
        "max_ms": 60.9795,
        "rounds": 1
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
        "median_ms": 21.0563,
        "p95_ms": 21.0563,
        "min_ms": 21.0563,
        "max_ms": 21.0563,
        "rounds": 1
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
        "median_ms": 15.8067,
        "p95_ms": 15.8067,
        "min_ms": 15.8067,
        "max_ms": 15.8067,
        "rounds": 1
      },
      "reference": {
        "median_ms": 21.0563,
        "p95_ms": 21.0563,
        "min_ms": 21.0563,
        "max_ms": 21.0563,
        "rounds": 1
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
        "median_ms": 20.8108,
        "p95_ms": 20.8108,
        "min_ms": 20.8108,
        "max_ms": 20.8108,
        "rounds": 1
      },
      "reference": {
        "median_ms": 21.0563,
        "p95_ms": 21.0563,
        "min_ms": 21.0563,
        "max_ms": 21.0563,
        "rounds": 1
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
        "median_ms": 18.8922,
        "p95_ms": 18.8922,
        "min_ms": 18.8922,
        "max_ms": 18.8922,
        "rounds": 1
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
        "median_ms": 17.6547,
        "p95_ms": 17.6547,
        "min_ms": 17.6547,
        "max_ms": 17.6547,
        "rounds": 1
      },
      "reference": {
        "median_ms": 18.8922,
        "p95_ms": 18.8922,
        "min_ms": 18.8922,
        "max_ms": 18.8922,
        "rounds": 1
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
        "median_ms": 20.172,
        "p95_ms": 20.172,
        "min_ms": 20.172,
        "max_ms": 20.172,
        "rounds": 1
      },
      "reference": {
        "median_ms": 18.8922,
        "p95_ms": 18.8922,
        "min_ms": 18.8922,
        "max_ms": 18.8922,
        "rounds": 1
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
        "median_ms": 2.274,
        "p95_ms": 2.274,
        "min_ms": 2.274,
        "max_ms": 2.274,
        "rounds": 1
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
        "median_ms": 2.4951,
        "p95_ms": 2.4951,
        "min_ms": 2.4951,
        "max_ms": 2.4951,
        "rounds": 1
      },
      "reference": {
        "median_ms": 2.274,
        "p95_ms": 2.274,
        "min_ms": 2.274,
        "max_ms": 2.274,
        "rounds": 1
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
        "median_ms": 2.1761,
        "p95_ms": 2.1761,
        "min_ms": 2.1761,
        "max_ms": 2.1761,
        "rounds": 1
      },
      "reference": {
        "median_ms": 2.274,
        "p95_ms": 2.274,
        "min_ms": 2.274,
        "max_ms": 2.274,
        "rounds": 1
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
        "median_ms": 36.04,
        "p95_ms": 36.04,
        "min_ms": 36.04,
        "max_ms": 36.04,
        "rounds": 1
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
        "median_ms": 35.4614,
        "p95_ms": 35.4614,
        "min_ms": 35.4614,
        "max_ms": 35.4614,
        "rounds": 1
      },
      "reference": {
        "median_ms": 36.04,
        "p95_ms": 36.04,
        "min_ms": 36.04,
        "max_ms": 36.04,
        "rounds": 1
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
        "median_ms": 35.7822,
        "p95_ms": 35.7822,
        "min_ms": 35.7822,
        "max_ms": 35.7822,
        "rounds": 1
      },
      "reference": {
        "median_ms": 36.04,
        "p95_ms": 36.04,
        "min_ms": 36.04,
        "max_ms": 36.04,
        "rounds": 1
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
        "median_ms": 18.5689,
        "p95_ms": 18.5689,
        "min_ms": 18.5689,
        "max_ms": 18.5689,
        "rounds": 1
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
        "median_ms": 18.9205,
        "p95_ms": 18.9205,
        "min_ms": 18.9205,
        "max_ms": 18.9205,
        "rounds": 1
      },
      "reference": {
        "median_ms": 18.5689,
        "p95_ms": 18.5689,
        "min_ms": 18.5689,
        "max_ms": 18.5689,
        "rounds": 1
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
        "median_ms": 24.4313,
        "p95_ms": 24.4313,
        "min_ms": 24.4313,
        "max_ms": 24.4313,
        "rounds": 1
      },
      "reference": {
        "median_ms": 18.5689,
        "p95_ms": 18.5689,
        "min_ms": 18.5689,
        "max_ms": 18.5689,
        "rounds": 1
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
        "median_ms": 29.3433,
        "p95_ms": 29.3433,
        "min_ms": 29.3433,
        "max_ms": 29.3433,
        "rounds": 1
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
        "median_ms": 32.4974,
        "p95_ms": 32.4974,
        "min_ms": 32.4974,
        "max_ms": 32.4974,
        "rounds": 1
      },
      "reference": {
        "median_ms": 29.3433,
        "p95_ms": 29.3433,
        "min_ms": 29.3433,
        "max_ms": 29.3433,
        "rounds": 1
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
        "median_ms": 32.7185,
        "p95_ms": 32.7185,
        "min_ms": 32.7185,
        "max_ms": 32.7185,
        "rounds": 1
      },
      "reference": {
        "median_ms": 29.3433,
        "p95_ms": 29.3433,
        "min_ms": 29.3433,
        "max_ms": 29.3433,
        "rounds": 1
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
        "median_ms": 0.9786,
        "p95_ms": 0.9786,
        "min_ms": 0.9786,
        "max_ms": 0.9786,
        "rounds": 1
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
        "median_ms": 0.6605,
        "p95_ms": 0.6605,
        "min_ms": 0.6605,
        "max_ms": 0.6605,
        "rounds": 1
      },
      "reference": {
        "median_ms": 0.9786,
        "p95_ms": 0.9786,
        "min_ms": 0.9786,
        "max_ms": 0.9786,
        "rounds": 1
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
        "median_ms": 1.5422,
        "p95_ms": 1.5422,
        "min_ms": 1.5422,
        "max_ms": 1.5422,
        "rounds": 1
      },
      "reference": {
        "median_ms": 0.9786,
        "p95_ms": 0.9786,
        "min_ms": 0.9786,
        "max_ms": 0.9786,
        "rounds": 1
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
        "median_ms": 1.7573,
        "p95_ms": 1.7573,
        "min_ms": 1.7573,
        "max_ms": 1.7573,
        "rounds": 1
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
        "median_ms": 1.2872,
        "p95_ms": 1.2872,
        "min_ms": 1.2872,
        "max_ms": 1.2872,
        "rounds": 1
      },
      "reference": {
        "median_ms": 1.7573,
        "p95_ms": 1.7573,
        "min_ms": 1.7573,
        "max_ms": 1.7573,
        "rounds": 1
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
        "median_ms": 1.7109,
        "p95_ms": 1.7109,
        "min_ms": 1.7109,
        "max_ms": 1.7109,
        "rounds": 1
      },
      "reference": {
        "median_ms": 1.7573,
        "p95_ms": 1.7573,
        "min_ms": 1.7573,
        "max_ms": 1.7573,
        "rounds": 1
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
        "median_ms": 267.032,
        "p95_ms": 267.032,
        "min_ms": 267.032,
        "max_ms": 267.032,
        "rounds": 1
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
        "median_ms": 249.8401,
        "p95_ms": 249.8401,
        "min_ms": 249.8401,
        "max_ms": 249.8401,
        "rounds": 1
      },
      "reference": {
        "median_ms": 267.032,
        "p95_ms": 267.032,
        "min_ms": 267.032,
        "max_ms": 267.032,
        "rounds": 1
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
        "median_ms": 253.2657,
        "p95_ms": 253.2657,
        "min_ms": 253.2657,
        "max_ms": 253.2657,
        "rounds": 1
      },
      "reference": {
        "median_ms": 267.032,
        "p95_ms": 267.032,
        "min_ms": 267.032,
        "max_ms": 267.032,
        "rounds": 1
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
        "median_ms": 14.7628,
        "p95_ms": 14.7628,
        "min_ms": 14.7628,
        "max_ms": 14.7628,
        "rounds": 1
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
        "median_ms": 15.4115,
        "p95_ms": 15.4115,
        "min_ms": 15.4115,
        "max_ms": 15.4115,
        "rounds": 1
      },
      "reference": {
        "median_ms": 14.7628,
        "p95_ms": 14.7628,
        "min_ms": 14.7628,
        "max_ms": 14.7628,
        "rounds": 1
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
        "median_ms": 14.6323,
        "p95_ms": 14.6323,
        "min_ms": 14.6323,
        "max_ms": 14.6323,
        "rounds": 1
      },
      "reference": {
        "median_ms": 14.7628,
        "p95_ms": 14.7628,
        "min_ms": 14.7628,
        "max_ms": 14.7628,
        "rounds": 1
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
        "median_ms": 107.0286,
        "p95_ms": 107.0286,
        "min_ms": 107.0286,
        "max_ms": 107.0286,
        "rounds": 1
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
        "median_ms": 106.7563,
        "p95_ms": 106.7563,
        "min_ms": 106.7563,
        "max_ms": 106.7563,
        "rounds": 1
      },
      "reference": {
        "median_ms": 107.0286,
        "p95_ms": 107.0286,
        "min_ms": 107.0286,
        "max_ms": 107.0286,
        "rounds": 1
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
        "median_ms": 109.5423,
        "p95_ms": 109.5423,
        "min_ms": 109.5423,
        "max_ms": 109.5423,
        "rounds": 1
      },
      "reference": {
        "median_ms": 107.0286,
        "p95_ms": 107.0286,
        "min_ms": 107.0286,
        "max_ms": 107.0286,
        "rounds": 1
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
        "median_ms": 12.5281,
        "p95_ms": 12.5281,
        "min_ms": 12.5281,
        "max_ms": 12.5281,
        "rounds": 1
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
        "median_ms": 9.1502,
        "p95_ms": 9.1502,
        "min_ms": 9.1502,
        "max_ms": 9.1502,
        "rounds": 1
      },
      "reference": {
        "median_ms": 12.5281,
        "p95_ms": 12.5281,
        "min_ms": 12.5281,
        "max_ms": 12.5281,
        "rounds": 1
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
        "median_ms": 9.7271,
        "p95_ms": 9.7271,
        "min_ms": 9.7271,
        "max_ms": 9.7271,
        "rounds": 1
      },
      "reference": {
        "median_ms": 12.5281,
        "p95_ms": 12.5281,
        "min_ms": 12.5281,
        "max_ms": 12.5281,
        "rounds": 1
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
        "median_ms": 3.6208,
        "p95_ms": 3.6208,
        "min_ms": 3.6208,
        "max_ms": 3.6208,
        "rounds": 1
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
        "median_ms": 3.9747,
        "p95_ms": 3.9747,
        "min_ms": 3.9747,
        "max_ms": 3.9747,
        "rounds": 1
      },
      "reference": {
        "median_ms": 3.6208,
        "p95_ms": 3.6208,
        "min_ms": 3.6208,
        "max_ms": 3.6208,
        "rounds": 1
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
        "median_ms": 5.4537,
        "p95_ms": 5.4537,
        "min_ms": 5.4537,
        "max_ms": 5.4537,
        "rounds": 1
      },
      "reference": {
        "median_ms": 3.6208,
        "p95_ms": 3.6208,
        "min_ms": 3.6208,
        "max_ms": 3.6208,
        "rounds": 1
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
        "median_ms": 4.1636,
        "p95_ms": 4.1636,
        "min_ms": 4.1636,
        "max_ms": 4.1636,
        "rounds": 1
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
        "median_ms": 3.7574,
        "p95_ms": 3.7574,
        "min_ms": 3.7574,
        "max_ms": 3.7574,
        "rounds": 1
      },
      "reference": {
        "median_ms": 4.1636,
        "p95_ms": 4.1636,
        "min_ms": 4.1636,
        "max_ms": 4.1636,
        "rounds": 1
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
        "median_ms": 3.5096,
        "p95_ms": 3.5096,
        "min_ms": 3.5096,
        "max_ms": 3.5096,
        "rounds": 1
      },
      "reference": {
        "median_ms": 4.1636,
        "p95_ms": 4.1636,
        "min_ms": 4.1636,
        "max_ms": 4.1636,
        "rounds": 1
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
        "median_ms": 6.5348,
        "p95_ms": 6.5348,
        "min_ms": 6.5348,
        "max_ms": 6.5348,
        "rounds": 1
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
        "median_ms": 10.9497,
        "p95_ms": 10.9497,
        "min_ms": 10.9497,
        "max_ms": 10.9497,
        "rounds": 1
      },
      "reference": {
        "median_ms": 6.5348,
        "p95_ms": 6.5348,
        "min_ms": 6.5348,
        "max_ms": 6.5348,
        "rounds": 1
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
        "median_ms": 18.7667,
        "p95_ms": 18.7667,
        "min_ms": 18.7667,
        "max_ms": 18.7667,
        "rounds": 1
      },
      "reference": {
        "median_ms": 6.5348,
        "p95_ms": 6.5348,
        "min_ms": 6.5348,
        "max_ms": 6.5348,
        "rounds": 1
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
        "median_ms": 30.434,
        "p95_ms": 30.434,
        "min_ms": 30.434,
        "max_ms": 30.434,
        "rounds": 1
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
        "median_ms": 16.512,
        "p95_ms": 16.512,
        "min_ms": 16.512,
        "max_ms": 16.512,
        "rounds": 1
      },
      "reference": {
        "median_ms": 30.434,
        "p95_ms": 30.434,
        "min_ms": 30.434,
        "max_ms": 30.434,
        "rounds": 1
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
        "median_ms": 40.3451,
        "p95_ms": 40.3451,
        "min_ms": 40.3451,
        "max_ms": 40.3451,
        "rounds": 1
      },
      "reference": {
        "median_ms": 30.434,
        "p95_ms": 30.434,
        "min_ms": 30.434,
        "max_ms": 30.434,
        "rounds": 1
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
        "median_ms": 17.2628,
        "p95_ms": 17.2628,
        "min_ms": 17.2628,
        "max_ms": 17.2628,
        "rounds": 1
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
        "median_ms": 13.3904,
        "p95_ms": 13.3904,
        "min_ms": 13.3904,
        "max_ms": 13.3904,
        "rounds": 1
      },
      "reference": {
        "median_ms": 17.2628,
        "p95_ms": 17.2628,
        "min_ms": 17.2628,
        "max_ms": 17.2628,
        "rounds": 1
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
        "median_ms": 20.2134,
        "p95_ms": 20.2134,
        "min_ms": 20.2134,
        "max_ms": 20.2134,
        "rounds": 1
      },
      "reference": {
        "median_ms": 17.2628,
        "p95_ms": 17.2628,
        "min_ms": 17.2628,
        "max_ms": 17.2628,
        "rounds": 1
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
        "median_ms": 27.0353,
        "p95_ms": 27.0353,
        "min_ms": 27.0353,
        "max_ms": 27.0353,
        "rounds": 1
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
        "median_ms": 22.8797,
        "p95_ms": 22.8797,
        "min_ms": 22.8797,
        "max_ms": 22.8797,
        "rounds": 1
      },
      "reference": {
        "median_ms": 27.0353,
        "p95_ms": 27.0353,
        "min_ms": 27.0353,
        "max_ms": 27.0353,
        "rounds": 1
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
        "median_ms": 26.6555,
        "p95_ms": 26.6555,
        "min_ms": 26.6555,
        "max_ms": 26.6555,
        "rounds": 1
      },
      "reference": {
        "median_ms": 27.0353,
        "p95_ms": 27.0353,
        "min_ms": 27.0353,
        "max_ms": 27.0353,
        "rounds": 1
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
        "median_ms": 60.4365,
        "p95_ms": 60.4365,
        "min_ms": 60.4365,
        "max_ms": 60.4365,
        "rounds": 1
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
        "median_ms": 59.3464,
        "p95_ms": 59.3464,
        "min_ms": 59.3464,
        "max_ms": 59.3464,
        "rounds": 1
      },
      "reference": {
        "median_ms": 60.4365,
        "p95_ms": 60.4365,
        "min_ms": 60.4365,
        "max_ms": 60.4365,
        "rounds": 1
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
        "median_ms": 71.9511,
        "p95_ms": 71.9511,
        "min_ms": 71.9511,
        "max_ms": 71.9511,
        "rounds": 1
      },
      "reference": {
        "median_ms": 60.4365,
        "p95_ms": 60.4365,
        "min_ms": 60.4365,
        "max_ms": 60.4365,
        "rounds": 1
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
        "median_ms": 63.8604,
        "p95_ms": 63.8604,
        "min_ms": 63.8604,
        "max_ms": 63.8604,
        "rounds": 1
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
        "median_ms": 80.9622,
        "p95_ms": 80.9622,
        "min_ms": 80.9622,
        "max_ms": 80.9622,
        "rounds": 1
      },
      "reference": {
        "median_ms": 63.8604,
        "p95_ms": 63.8604,
        "min_ms": 63.8604,
        "max_ms": 63.8604,
        "rounds": 1
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
        "median_ms": 72.2031,
        "p95_ms": 72.2031,
        "min_ms": 72.2031,
        "max_ms": 72.2031,
        "rounds": 1
      },
      "reference": {
        "median_ms": 63.8604,
        "p95_ms": 63.8604,
        "min_ms": 63.8604,
        "max_ms": 63.8604,
        "rounds": 1
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
        "median_ms": 39.9855,
        "p95_ms": 39.9855,
        "min_ms": 39.9855,
        "max_ms": 39.9855,
        "rounds": 1
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
        "median_ms": 28.2096,
        "p95_ms": 28.2096,
        "min_ms": 28.2096,
        "max_ms": 28.2096,
        "rounds": 1
      },
      "reference": {
        "median_ms": 39.9855,
        "p95_ms": 39.9855,
        "min_ms": 39.9855,
        "max_ms": 39.9855,
        "rounds": 1
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
        "median_ms": 37.9676,
        "p95_ms": 37.9676,
        "min_ms": 37.9676,
        "max_ms": 37.9676,
        "rounds": 1
      },
      "reference": {
        "median_ms": 39.9855,
        "p95_ms": 39.9855,
        "min_ms": 39.9855,
        "max_ms": 39.9855,
        "rounds": 1
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
        "median_ms": 41.848,
        "p95_ms": 41.848,
        "min_ms": 41.848,
        "max_ms": 41.848,
        "rounds": 1
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
        "median_ms": 39.2118,
        "p95_ms": 39.2118,
        "min_ms": 39.2118,
        "max_ms": 39.2118,
        "rounds": 1
      },
      "reference": {
        "median_ms": 41.848,
        "p95_ms": 41.848,
        "min_ms": 41.848,
        "max_ms": 41.848,
        "rounds": 1
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
        "median_ms": 47.8041,
        "p95_ms": 47.8041,
        "min_ms": 47.8041,
        "max_ms": 47.8041,
        "rounds": 1
      },
      "reference": {
        "median_ms": 41.848,
        "p95_ms": 41.848,
        "min_ms": 41.848,
        "max_ms": 41.848,
        "rounds": 1
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
        "median_ms": 35.6949,
        "p95_ms": 35.6949,
        "min_ms": 35.6949,
        "max_ms": 35.6949,
        "rounds": 1
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
        "median_ms": 33.1997,
        "p95_ms": 33.1997,
        "min_ms": 33.1997,
        "max_ms": 33.1997,
        "rounds": 1
      },
      "reference": {
        "median_ms": 35.6949,
        "p95_ms": 35.6949,
        "min_ms": 35.6949,
        "max_ms": 35.6949,
        "rounds": 1
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
        "median_ms": 36.555,
        "p95_ms": 36.555,
        "min_ms": 36.555,
        "max_ms": 36.555,
        "rounds": 1
      },
      "reference": {
        "median_ms": 35.6949,
        "p95_ms": 35.6949,
        "min_ms": 35.6949,
        "max_ms": 35.6949,
        "rounds": 1
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
        "median_ms": 48.3904,
        "p95_ms": 48.3904,
        "min_ms": 48.3904,
        "max_ms": 48.3904,
        "rounds": 1
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
        "median_ms": 36.4441,
        "p95_ms": 36.4441,
        "min_ms": 36.4441,
        "max_ms": 36.4441,
        "rounds": 1
      },
      "reference": {
        "median_ms": 48.3904,
        "p95_ms": 48.3904,
        "min_ms": 48.3904,
        "max_ms": 48.3904,
        "rounds": 1
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
        "median_ms": 41.2703,
        "p95_ms": 41.2703,
        "min_ms": 41.2703,
        "max_ms": 41.2703,
        "rounds": 1
      },
      "reference": {
        "median_ms": 48.3904,
        "p95_ms": 48.3904,
        "min_ms": 48.3904,
        "max_ms": 48.3904,
        "rounds": 1
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
        "median_ms": 0.8435,
        "p95_ms": 0.8435,
        "min_ms": 0.8435,
        "max_ms": 0.8435,
        "rounds": 1
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
        "median_ms": 0.5036,
        "p95_ms": 0.5036,
        "min_ms": 0.5036,
        "max_ms": 0.5036,
        "rounds": 1
      },
      "reference": {
        "median_ms": 0.8435,
        "p95_ms": 0.8435,
        "min_ms": 0.8435,
        "max_ms": 0.8435,
        "rounds": 1
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
        "median_ms": 0.4732,
        "p95_ms": 0.4732,
        "min_ms": 0.4732,
        "max_ms": 0.4732,
        "rounds": 1
      },
      "reference": {
        "median_ms": 0.8435,
        "p95_ms": 0.8435,
        "min_ms": 0.8435,
        "max_ms": 0.8435,
        "rounds": 1
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
      "workload": "connect@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 69.4902,
        "p95_ms": 69.4902,
        "min_ms": 69.4902,
        "max_ms": 69.4902,
        "rounds": 1
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
        "median_ms": 24.2739,
        "p95_ms": 24.2739,
        "min_ms": 24.2739,
        "max_ms": 24.2739,
        "rounds": 1
      },
      "reference": {
        "median_ms": 69.4902,
        "p95_ms": 69.4902,
        "min_ms": 69.4902,
        "max_ms": 69.4902,
        "rounds": 1
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
        "median_ms": 63.7962,
        "p95_ms": 63.7962,
        "min_ms": 63.7962,
        "max_ms": 63.7962,
        "rounds": 1
      },
      "reference": {
        "median_ms": 69.4902,
        "p95_ms": 69.4902,
        "min_ms": 69.4902,
        "max_ms": 69.4902,
        "rounds": 1
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
    }
  ]
}
```

Regenerate: `pnpm --dir projects/redis.ts/examples/vs-js-libraries benchmark`
