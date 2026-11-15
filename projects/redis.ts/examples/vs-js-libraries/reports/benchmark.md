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
- `rev`: `eff6e2d5a8e965c1d6b80ac6d20ce50eae35eb5b`
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
| `connect` | `redis-connect-open-close` | 50 | {"opens":"50","probe":"PING"} |

## Relative to `ioredis`

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|-------:|-------:|-------:|
| get-seq | 1.00x | **0.98x** | 1.18x |
| set-seq | 1.00x | **0.88x** | 1.08x |
| mset-seq | 1.00x | 1.11x | **0.97x** |
| incr-seq | **1.00x** | 1.02x | 1.09x |
| set-pipeline | **1.00x** | 1.01x | 1.84x |
| get-pipeline | 1.00x | **0.96x** | 4.09x |
| pipeline-mixed | 1.00x | **0.99x** | 1.39x |
| hash-hset-hget | 1.00x | **0.97x** | 1.07x |
| hash-setnx-hrandfield | **1.00x** | 1.03x | 1.36x |
| list-rpush-lrange | 1.00x | **0.84x** | 0.94x |
| set-sadd-smembers | **1.00x** | 1.08x | 1.18x |
| zset-zadd-zrange | 1.00x | 1.40x | **0.83x** |
| streams-xadd-xrange | **1.00x** | 1.00x | 1.05x |
| pubsub-roundtrip | 1.00x | **0.90x** | 1.02x |
| blpop-roundtrip | 1.00x | 1.03x | **1.00x** |
| scan-full | 1.00x | **0.98x** | 1.13x |
| ping-concurrent | **1.00x** | 1.06x | 1.66x |
| stream-group | 1.00x | **0.96x** | 1.12x |
| ttl-setex-expire | **1.00x** | 1.01x | 1.00x |
| multi-exec | **1.00x** | 1.14x | 1.18x |
| mget-seq | **1.00x** | 1.26x | 1.49x |
| append-getrange | **1.00x** | 1.05x | 1.24x |
| getdel-getex | 1.00x | **0.78x** | 0.92x |
| set-options | 1.00x | 1.09x | **0.97x** |
| exists-type | **1.00x** | 1.06x | 1.20x |
| expire-persist | 1.00x | **0.97x** | 1.06x |
| hash-hgetall-hdel | **1.00x** | 1.10x | 1.08x |
| hash-keys-values | **1.00x** | 1.10x | 1.13x |
| list-lpush-lpop | 1.00x | **0.99x** | 1.11x |
| set-algebra | 1.00x | **0.80x** | 0.94x |
| set-membership-ops | **1.00x** | 1.13x | 1.01x |
| zset-pop-ops | 1.00x | **0.75x** | 2.89x |
| zset-range-queries | 1.00x | 2.15x | **0.97x** |
| large-collection-read | 1.00x | **0.81x** | 0.93x |
| large-hash-list-read | 1.00x | **0.64x** | 0.70x |
| resp3-hello | 1.00x | **0.61x** | 0.72x |
| expire-sweep | **1.00x** | 1.04x | 1.14x |
| multi-exec-mixed | 1.00x | 0.97x | **0.92x** |
| pubsub-fanout | 1.00x | **0.93x** | 1.03x |
| zset-score-ops | **1.00x** | 1.17x | 1.25x |
| bitfield-ops | **1.00x** | 1.09x | 1.17x |
| hll-ops | 1.00x | **0.98x** | 2.28x |
| sort-ops | 1.00x | **0.63x** | 0.71x |
| keys-random | **1.00x** | 1.03x | 1.11x |
| stream-xread | **1.00x** | 1.02x | 1.20x |
| stream-xadd-xread | **1.00x** | 1.05x | 1.04x |
| hscan-cursor | 1.00x | **0.57x** | 1.04x |
| sscan-zscan-cursor | **1.00x** | 1.30x | 1.20x |
| set-ops-large | 1.00x | **0.96x** | 0.98x |
| lmpop-blocking | **1.00x** | 1.07x | 1.01x |
| key-space-notify | 1.00x | **0.98x** | 1.00x |
| resp3-collections | 1.00x | 0.92x | **0.88x** |
| server-face-ops | 1.00x | 0.96x | **0.85x** |
| watch-exec | **1.00x** | 1.15x | 1.13x |
| set-big | **1.00x** | 1.13x | 1.60x |
| get-big | 1.00x | **0.55x** | 0.68x |
| del-seq | **1.00x** | 1.14x | 1.03x |
| move-seq | **1.00x** | 1.10x | 1.07x |
| ping | **1.00x** | 1.11x | 1.22x |
| bit-ops | **1.00x** | 1.01x | 1.29x |
| setrange-getrange | **1.00x** | 1.14x | 1.15x |
| rename-unlink | 1.00x | 1.14x | **0.93x** |
| connect | 1.00x | **0.29x** | 0.64x |

## Median and p95 (ms)

| Workload | ops | ioredis med | ioredis p95 | @yydb/redis med | @yydb/redis p95 | node-redis med | node-redis p95 |
|---------:|----:|-------:|-------:|-------:|-------:|-------:|-------:|
| get-seq | 500 | 43.91 | 43.91 | 42.91 | 42.91 | 51.83 | 51.83 |
| set-seq | 100 | 11.44 | 11.44 | 10.01 | 10.01 | 12.29 | 12.29 |
| mset-seq | 500 | 6.54 | 6.54 | 7.26 | 7.26 | 6.38 | 6.38 |
| incr-seq | 500 | 45.33 | 45.33 | 46.36 | 46.36 | 49.49 | 49.49 |
| set-pipeline | 500 | 14.35 | 14.35 | 14.51 | 14.51 | 26.45 | 26.45 |
| get-pipeline | 500 | 9.64 | 9.64 | 9.21 | 9.21 | 39.37 | 39.37 |
| pipeline-mixed | 500 | 20.78 | 20.78 | 20.55 | 20.55 | 28.96 | 28.96 |
| hash-hset-hget | 401 | 70.46 | 70.46 | 68.17 | 68.17 | 75.33 | 75.33 |
| hash-setnx-hrandfield | 402 | 32.13 | 32.13 | 33.16 | 33.16 | 43.65 | 43.65 |
| list-rpush-lrange | 202 | 33.63 | 33.63 | 28.30 | 28.30 | 31.68 | 31.68 |
| set-sadd-smembers | 202 | 26.76 | 26.76 | 28.91 | 28.91 | 31.64 | 31.64 |
| zset-zadd-zrange | 202 | 35.27 | 35.27 | 49.52 | 49.52 | 29.23 | 29.23 |
| streams-xadd-xrange | 202 | 42.29 | 42.29 | 42.31 | 42.31 | 44.24 | 44.24 |
| pubsub-roundtrip | 100 | 14.69 | 14.69 | 13.23 | 13.23 | 15.01 | 15.01 |
| blpop-roundtrip | 100 | 32.62 | 32.62 | 33.74 | 33.74 | 32.51 | 32.51 |
| scan-full | 200 | 5.39 | 5.39 | 5.30 | 5.30 | 6.09 | 6.09 |
| ping-concurrent | 800 | 40.45 | 40.45 | 42.87 | 42.87 | 66.98 | 66.98 |
| stream-group | 300 | 65.24 | 65.24 | 62.95 | 62.95 | 72.97 | 72.97 |
| ttl-setex-expire | 90 | 1114.70 | 1114.70 | 1124.20 | 1124.20 | 1116.12 | 1116.12 |
| multi-exec | 102 | 18.26 | 18.26 | 20.74 | 20.74 | 21.59 | 21.59 |
| mget-seq | 200 | 1.30 | 1.30 | 1.65 | 1.65 | 1.95 | 1.95 |
| append-getrange | 201 | 26.99 | 26.99 | 28.21 | 28.21 | 33.44 | 33.44 |
| getdel-getex | 400 | 79.03 | 79.03 | 61.79 | 61.79 | 72.47 | 72.47 |
| set-options | 400 | 75.04 | 75.04 | 81.77 | 81.77 | 73.14 | 73.14 |
| exists-type | 400 | 46.89 | 46.89 | 49.82 | 49.82 | 56.27 | 56.27 |
| expire-persist | 600 | 79.66 | 79.66 | 77.15 | 77.15 | 84.41 | 84.41 |
| hash-hgetall-hdel | 202 | 3.75 | 3.75 | 4.13 | 4.13 | 4.03 | 4.03 |
| hash-keys-values | 40 | 15.43 | 15.43 | 16.92 | 16.92 | 17.45 | 17.45 |
| list-lpush-lpop | 400 | 87.07 | 87.07 | 85.94 | 85.94 | 96.22 | 96.22 |
| set-algebra | 30 | 32.56 | 32.56 | 26.16 | 26.16 | 30.68 | 30.68 |
| set-membership-ops | 30 | 24.69 | 24.69 | 27.99 | 27.99 | 24.86 | 24.86 |
| zset-pop-ops | 4 | 3.31 | 3.31 | 2.47 | 2.47 | 9.55 | 9.55 |
| zset-range-queries | 40 | 14.15 | 14.15 | 30.46 | 30.46 | 13.70 | 13.70 |
| large-collection-read | 20 | 56.76 | 56.76 | 46.09 | 46.09 | 53.01 | 53.01 |
| large-hash-list-read | 20 | 76.67 | 76.67 | 49.01 | 49.01 | 53.99 | 53.99 |
| resp3-hello | 40 | 13.46 | 13.46 | 8.26 | 8.26 | 9.68 | 9.68 |
| expire-sweep | 1002 | 311.34 | 311.34 | 324.71 | 324.71 | 355.35 | 355.35 |
| multi-exec-mixed | 102 | 24.84 | 24.84 | 24.11 | 24.11 | 22.91 | 22.91 |
| pubsub-fanout | 400 | 38.97 | 38.97 | 36.20 | 36.20 | 39.95 | 39.95 |
| zset-score-ops | 600 | 126.39 | 126.39 | 147.94 | 147.94 | 158.51 | 158.51 |
| bitfield-ops | 201 | 32.79 | 32.79 | 35.78 | 35.78 | 38.40 | 38.40 |
| hll-ops | 201 | 29.38 | 29.38 | 28.82 | 28.82 | 67.12 | 67.12 |
| sort-ops | 10 | 8.70 | 8.70 | 5.51 | 5.51 | 6.18 | 6.18 |
| keys-random | 30 | 83.07 | 83.07 | 85.22 | 85.22 | 91.93 | 91.93 |
| stream-xread | 10 | 51.94 | 51.94 | 53.13 | 53.13 | 62.34 | 62.34 |
| stream-xadd-xread | 202 | 62.43 | 62.43 | 65.61 | 65.61 | 64.67 | 64.67 |
| hscan-cursor | 200 | 3.65 | 3.65 | 2.09 | 2.09 | 3.82 | 3.82 |
| sscan-zscan-cursor | 400 | 4.32 | 4.32 | 5.63 | 5.63 | 5.19 | 5.19 |
| set-ops-large | 30 | 1002.36 | 1002.36 | 962.31 | 962.31 | 985.81 | 985.81 |
| lmpop-blocking | 100 | 35.33 | 35.33 | 37.74 | 37.74 | 35.85 | 35.85 |
| key-space-notify | 30 | 108.96 | 108.96 | 107.14 | 107.14 | 108.45 | 108.45 |
| resp3-collections | 40 | 29.95 | 29.95 | 27.43 | 27.43 | 26.41 | 26.41 |
| server-face-ops | 40 | 9.10 | 9.10 | 8.72 | 8.72 | 7.73 | 7.73 |
| watch-exec | 40 | 6.51 | 6.51 | 7.46 | 7.46 | 7.33 | 7.33 |
| set-big | 20 | 10.71 | 10.71 | 12.11 | 12.11 | 17.18 | 17.18 |
| get-big | 50 | 44.67 | 44.67 | 24.60 | 24.60 | 30.45 | 30.45 |
| del-seq | 200 | 27.96 | 27.96 | 31.92 | 31.92 | 28.68 | 28.68 |
| move-seq | 200 | 57.37 | 57.37 | 63.37 | 63.37 | 61.62 | 61.62 |
| ping | 1000 | 113.46 | 113.46 | 125.57 | 125.57 | 138.97 | 138.97 |
| bit-ops | 800 | 107.19 | 107.19 | 108.72 | 108.72 | 137.82 | 137.82 |
| setrange-getrange | 400 | 63.55 | 63.55 | 72.28 | 72.28 | 73.32 | 73.32 |
| rename-unlink | 400 | 87.29 | 87.29 | 99.14 | 99.14 | 80.76 | 80.76 |
| connect | 50 | 106.71 | 106.71 | 31.37 | 31.37 | 68.67 | 68.67 |

## Per-op and throughput (median)

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|--------:|--------:|--------:|
| get-seq | 0.088 ms/op, 11,387/s | 0.086 ms/op, 11,652/s | 0.104 ms/op, 9,647/s |
| set-seq | 0.114 ms/op, 8,744/s | 0.100 ms/op, 9,993/s | 0.123 ms/op, 8,134/s |
| mset-seq | 0.013 ms/op, 76,405/s | 0.015 ms/op, 68,843/s | 0.013 ms/op, 78,408/s |
| incr-seq | 0.091 ms/op, 11,031/s | 0.093 ms/op, 10,786/s | 0.099 ms/op, 10,103/s |
| set-pipeline | 0.029 ms/op, 34,834/s | 0.029 ms/op, 34,457/s | 0.053 ms/op, 18,901/s |
| get-pipeline | 0.019 ms/op, 51,886/s | 0.018 ms/op, 54,273/s | 0.079 ms/op, 12,701/s |
| pipeline-mixed | 0.042 ms/op, 24,063/s | 0.041 ms/op, 24,334/s | 0.058 ms/op, 17,262/s |
| hash-hset-hget | 0.176 ms/op, 5,691/s | 0.170 ms/op, 5,882/s | 0.188 ms/op, 5,323/s |
| hash-setnx-hrandfield | 0.080 ms/op, 12,511/s | 0.082 ms/op, 12,123/s | 0.109 ms/op, 9,210/s |
| list-rpush-lrange | 0.167 ms/op, 6,006/s | 0.140 ms/op, 7,138/s | 0.157 ms/op, 6,375/s |
| set-sadd-smembers | 0.132 ms/op, 7,548/s | 0.143 ms/op, 6,986/s | 0.157 ms/op, 6,384/s |
| zset-zadd-zrange | 0.175 ms/op, 5,727/s | 0.245 ms/op, 4,079/s | 0.145 ms/op, 6,911/s |
| streams-xadd-xrange | 0.209 ms/op, 4,776/s | 0.209 ms/op, 4,774/s | 0.219 ms/op, 4,566/s |
| pubsub-roundtrip | 0.147 ms/op, 6,810/s | 0.132 ms/op, 7,561/s | 0.150 ms/op, 6,663/s |
| blpop-roundtrip | 0.326 ms/op, 3,065/s | 0.337 ms/op, 2,964/s | 0.325 ms/op, 3,076/s |
| scan-full | 0.027 ms/op, 37,094/s | 0.027 ms/op, 37,720/s | 0.030 ms/op, 32,860/s |
| ping-concurrent | 0.051 ms/op, 19,780/s | 0.054 ms/op, 18,659/s | 0.084 ms/op, 11,944/s |
| stream-group | 0.217 ms/op, 4,598/s | 0.210 ms/op, 4,766/s | 0.243 ms/op, 4,111/s |
| ttl-setex-expire | 12.386 ms/op, 81/s | 12.491 ms/op, 80/s | 12.401 ms/op, 81/s |
| multi-exec | 0.179 ms/op, 5,586/s | 0.203 ms/op, 4,918/s | 0.212 ms/op, 4,724/s |
| mget-seq | 0.007 ms/op, 153,304/s | 0.008 ms/op, 121,293/s | 0.010 ms/op, 102,596/s |
| append-getrange | 0.134 ms/op, 7,446/s | 0.140 ms/op, 7,125/s | 0.166 ms/op, 6,010/s |
| getdel-getex | 0.198 ms/op, 5,061/s | 0.154 ms/op, 6,473/s | 0.181 ms/op, 5,520/s |
| set-options | 0.188 ms/op, 5,331/s | 0.204 ms/op, 4,892/s | 0.183 ms/op, 5,469/s |
| exists-type | 0.117 ms/op, 8,531/s | 0.125 ms/op, 8,029/s | 0.141 ms/op, 7,108/s |
| expire-persist | 0.133 ms/op, 7,532/s | 0.129 ms/op, 7,777/s | 0.141 ms/op, 7,109/s |
| hash-hgetall-hdel | 0.019 ms/op, 53,885/s | 0.020 ms/op, 48,868/s | 0.020 ms/op, 50,125/s |
| hash-keys-values | 0.386 ms/op, 2,593/s | 0.423 ms/op, 2,365/s | 0.436 ms/op, 2,292/s |
| list-lpush-lpop | 0.218 ms/op, 4,594/s | 0.215 ms/op, 4,654/s | 0.241 ms/op, 4,157/s |
| set-algebra | 1.085 ms/op, 921/s | 0.872 ms/op, 1,147/s | 1.023 ms/op, 978/s |
| set-membership-ops | 0.823 ms/op, 1,215/s | 0.933 ms/op, 1,072/s | 0.829 ms/op, 1,207/s |
| zset-pop-ops | 0.827 ms/op, 1,210/s | 0.619 ms/op, 1,616/s | 2.387 ms/op, 419/s |
| zset-range-queries | 0.354 ms/op, 2,827/s | 0.761 ms/op, 1,313/s | 0.342 ms/op, 2,921/s |
| large-collection-read | 2.838 ms/op, 352/s | 2.305 ms/op, 434/s | 2.650 ms/op, 377/s |
| large-hash-list-read | 3.834 ms/op, 261/s | 2.451 ms/op, 408/s | 2.700 ms/op, 370/s |
| resp3-hello | 0.336 ms/op, 2,972/s | 0.206 ms/op, 4,845/s | 0.242 ms/op, 4,131/s |
| expire-sweep | 0.311 ms/op, 3,218/s | 0.324 ms/op, 3,086/s | 0.355 ms/op, 2,820/s |
| multi-exec-mixed | 0.243 ms/op, 4,107/s | 0.236 ms/op, 4,230/s | 0.225 ms/op, 4,452/s |
| pubsub-fanout | 0.097 ms/op, 10,263/s | 0.091 ms/op, 11,050/s | 0.100 ms/op, 10,011/s |
| zset-score-ops | 0.211 ms/op, 4,747/s | 0.247 ms/op, 4,056/s | 0.264 ms/op, 3,785/s |
| bitfield-ops | 0.163 ms/op, 6,131/s | 0.178 ms/op, 5,618/s | 0.191 ms/op, 5,234/s |
| hll-ops | 0.146 ms/op, 6,840/s | 0.143 ms/op, 6,975/s | 0.334 ms/op, 2,995/s |
| sort-ops | 0.870 ms/op, 1,150/s | 0.551 ms/op, 1,815/s | 0.618 ms/op, 1,619/s |
| keys-random | 2.769 ms/op, 361/s | 2.841 ms/op, 352/s | 3.064 ms/op, 326/s |
| stream-xread | 5.194 ms/op, 193/s | 5.313 ms/op, 188/s | 6.234 ms/op, 160/s |
| stream-xadd-xread | 0.309 ms/op, 3,236/s | 0.325 ms/op, 3,079/s | 0.320 ms/op, 3,124/s |
| hscan-cursor | 0.018 ms/op, 54,744/s | 0.010 ms/op, 95,675/s | 0.019 ms/op, 52,408/s |
| sscan-zscan-cursor | 0.011 ms/op, 92,599/s | 0.014 ms/op, 70,992/s | 0.013 ms/op, 77,144/s |
| set-ops-large | 33.412 ms/op, 30/s | 32.077 ms/op, 31/s | 32.860 ms/op, 30/s |
| lmpop-blocking | 0.353 ms/op, 2,830/s | 0.377 ms/op, 2,650/s | 0.358 ms/op, 2,790/s |
| key-space-notify | 3.632 ms/op, 275/s | 3.571 ms/op, 280/s | 3.615 ms/op, 277/s |
| resp3-collections | 0.749 ms/op, 1,336/s | 0.686 ms/op, 1,458/s | 0.660 ms/op, 1,515/s |
| server-face-ops | 0.228 ms/op, 4,396/s | 0.218 ms/op, 4,586/s | 0.193 ms/op, 5,174/s |
| watch-exec | 0.163 ms/op, 6,145/s | 0.186 ms/op, 5,364/s | 0.183 ms/op, 5,455/s |
| set-big | 0.536 ms/op, 1,867/s | 0.606 ms/op, 1,651/s | 0.859 ms/op, 1,164/s |
| get-big | 0.893 ms/op, 1,119/s | 0.492 ms/op, 2,032/s | 0.609 ms/op, 1,642/s |
| del-seq | 0.140 ms/op, 7,154/s | 0.160 ms/op, 6,265/s | 0.143 ms/op, 6,974/s |
| move-seq | 0.287 ms/op, 3,486/s | 0.317 ms/op, 3,156/s | 0.308 ms/op, 3,246/s |
| ping | 0.113 ms/op, 8,814/s | 0.126 ms/op, 7,964/s | 0.139 ms/op, 7,196/s |
| bit-ops | 0.134 ms/op, 7,463/s | 0.136 ms/op, 7,358/s | 0.172 ms/op, 5,804/s |
| setrange-getrange | 0.159 ms/op, 6,294/s | 0.181 ms/op, 5,534/s | 0.183 ms/op, 5,456/s |
| rename-unlink | 0.218 ms/op, 4,583/s | 0.248 ms/op, 4,035/s | 0.202 ms/op, 4,953/s |
| connect | 2.134 ms/op, 469/s | 0.627 ms/op, 1,594/s | 1.373 ms/op, 728/s |

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
    "data_scale": "matrix=63x3",
    "rustc_version": "rustc 1.101.0-nightly (1c3a65069 2026-11-02)",
    "node_version": "v24.18.0",
    "target_triple": "x86_64-pc-windows-msvc",
    "rev": "eff6e2d5a8e965c1d6b80ac6d20ce50eae35eb5b",
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
        "median_ms": 43.9102,
        "p95_ms": 43.9102,
        "min_ms": 43.9102,
        "max_ms": 43.9102,
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
        "median_ms": 42.9102,
        "p95_ms": 42.9102,
        "min_ms": 42.9102,
        "max_ms": 42.9102,
        "rounds": 1
      },
      "reference": {
        "median_ms": 43.9102,
        "p95_ms": 43.9102,
        "min_ms": 43.9102,
        "max_ms": 43.9102,
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
        "median_ms": 51.8285,
        "p95_ms": 51.8285,
        "min_ms": 51.8285,
        "max_ms": 51.8285,
        "rounds": 1
      },
      "reference": {
        "median_ms": 43.9102,
        "p95_ms": 43.9102,
        "min_ms": 43.9102,
        "max_ms": 43.9102,
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
        "median_ms": 11.4363,
        "p95_ms": 11.4363,
        "min_ms": 11.4363,
        "max_ms": 11.4363,
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
        "median_ms": 10.0069,
        "p95_ms": 10.0069,
        "min_ms": 10.0069,
        "max_ms": 10.0069,
        "rounds": 1
      },
      "reference": {
        "median_ms": 11.4363,
        "p95_ms": 11.4363,
        "min_ms": 11.4363,
        "max_ms": 11.4363,
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
        "median_ms": 12.2948,
        "p95_ms": 12.2948,
        "min_ms": 12.2948,
        "max_ms": 12.2948,
        "rounds": 1
      },
      "reference": {
        "median_ms": 11.4363,
        "p95_ms": 11.4363,
        "min_ms": 11.4363,
        "max_ms": 11.4363,
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
        "median_ms": 6.5441,
        "p95_ms": 6.5441,
        "min_ms": 6.5441,
        "max_ms": 6.5441,
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
        "median_ms": 7.2629,
        "p95_ms": 7.2629,
        "min_ms": 7.2629,
        "max_ms": 7.2629,
        "rounds": 1
      },
      "reference": {
        "median_ms": 6.5441,
        "p95_ms": 6.5441,
        "min_ms": 6.5441,
        "max_ms": 6.5441,
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
        "median_ms": 6.3769,
        "p95_ms": 6.3769,
        "min_ms": 6.3769,
        "max_ms": 6.3769,
        "rounds": 1
      },
      "reference": {
        "median_ms": 6.5441,
        "p95_ms": 6.5441,
        "min_ms": 6.5441,
        "max_ms": 6.5441,
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
        "median_ms": 45.3262,
        "p95_ms": 45.3262,
        "min_ms": 45.3262,
        "max_ms": 45.3262,
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
        "median_ms": 46.3551,
        "p95_ms": 46.3551,
        "min_ms": 46.3551,
        "max_ms": 46.3551,
        "rounds": 1
      },
      "reference": {
        "median_ms": 45.3262,
        "p95_ms": 45.3262,
        "min_ms": 45.3262,
        "max_ms": 45.3262,
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
        "median_ms": 49.4922,
        "p95_ms": 49.4922,
        "min_ms": 49.4922,
        "max_ms": 49.4922,
        "rounds": 1
      },
      "reference": {
        "median_ms": 45.3262,
        "p95_ms": 45.3262,
        "min_ms": 45.3262,
        "max_ms": 45.3262,
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
        "median_ms": 14.3538,
        "p95_ms": 14.3538,
        "min_ms": 14.3538,
        "max_ms": 14.3538,
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
        "median_ms": 14.5108,
        "p95_ms": 14.5108,
        "min_ms": 14.5108,
        "max_ms": 14.5108,
        "rounds": 1
      },
      "reference": {
        "median_ms": 14.3538,
        "p95_ms": 14.3538,
        "min_ms": 14.3538,
        "max_ms": 14.3538,
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
        "median_ms": 26.454,
        "p95_ms": 26.454,
        "min_ms": 26.454,
        "max_ms": 26.454,
        "rounds": 1
      },
      "reference": {
        "median_ms": 14.3538,
        "p95_ms": 14.3538,
        "min_ms": 14.3538,
        "max_ms": 14.3538,
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
        "median_ms": 9.6366,
        "p95_ms": 9.6366,
        "min_ms": 9.6366,
        "max_ms": 9.6366,
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
        "median_ms": 9.2126,
        "p95_ms": 9.2126,
        "min_ms": 9.2126,
        "max_ms": 9.2126,
        "rounds": 1
      },
      "reference": {
        "median_ms": 9.6366,
        "p95_ms": 9.6366,
        "min_ms": 9.6366,
        "max_ms": 9.6366,
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
        "median_ms": 39.3676,
        "p95_ms": 39.3676,
        "min_ms": 39.3676,
        "max_ms": 39.3676,
        "rounds": 1
      },
      "reference": {
        "median_ms": 9.6366,
        "p95_ms": 9.6366,
        "min_ms": 9.6366,
        "max_ms": 9.6366,
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
        "median_ms": 20.7788,
        "p95_ms": 20.7788,
        "min_ms": 20.7788,
        "max_ms": 20.7788,
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
        "median_ms": 20.5475,
        "p95_ms": 20.5475,
        "min_ms": 20.5475,
        "max_ms": 20.5475,
        "rounds": 1
      },
      "reference": {
        "median_ms": 20.7788,
        "p95_ms": 20.7788,
        "min_ms": 20.7788,
        "max_ms": 20.7788,
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
        "median_ms": 28.9646,
        "p95_ms": 28.9646,
        "min_ms": 28.9646,
        "max_ms": 28.9646,
        "rounds": 1
      },
      "reference": {
        "median_ms": 20.7788,
        "p95_ms": 20.7788,
        "min_ms": 20.7788,
        "max_ms": 20.7788,
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
        "median_ms": 70.4605,
        "p95_ms": 70.4605,
        "min_ms": 70.4605,
        "max_ms": 70.4605,
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
        "median_ms": 68.1719,
        "p95_ms": 68.1719,
        "min_ms": 68.1719,
        "max_ms": 68.1719,
        "rounds": 1
      },
      "reference": {
        "median_ms": 70.4605,
        "p95_ms": 70.4605,
        "min_ms": 70.4605,
        "max_ms": 70.4605,
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
        "median_ms": 75.334,
        "p95_ms": 75.334,
        "min_ms": 75.334,
        "max_ms": 75.334,
        "rounds": 1
      },
      "reference": {
        "median_ms": 70.4605,
        "p95_ms": 70.4605,
        "min_ms": 70.4605,
        "max_ms": 70.4605,
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
        "median_ms": 32.1322,
        "p95_ms": 32.1322,
        "min_ms": 32.1322,
        "max_ms": 32.1322,
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
        "median_ms": 33.1594,
        "p95_ms": 33.1594,
        "min_ms": 33.1594,
        "max_ms": 33.1594,
        "rounds": 1
      },
      "reference": {
        "median_ms": 32.1322,
        "p95_ms": 32.1322,
        "min_ms": 32.1322,
        "max_ms": 32.1322,
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
        "median_ms": 43.6487,
        "p95_ms": 43.6487,
        "min_ms": 43.6487,
        "max_ms": 43.6487,
        "rounds": 1
      },
      "reference": {
        "median_ms": 32.1322,
        "p95_ms": 32.1322,
        "min_ms": 32.1322,
        "max_ms": 32.1322,
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
        "median_ms": 33.6337,
        "p95_ms": 33.6337,
        "min_ms": 33.6337,
        "max_ms": 33.6337,
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
        "median_ms": 28.2997,
        "p95_ms": 28.2997,
        "min_ms": 28.2997,
        "max_ms": 28.2997,
        "rounds": 1
      },
      "reference": {
        "median_ms": 33.6337,
        "p95_ms": 33.6337,
        "min_ms": 33.6337,
        "max_ms": 33.6337,
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
        "median_ms": 31.6848,
        "p95_ms": 31.6848,
        "min_ms": 31.6848,
        "max_ms": 31.6848,
        "rounds": 1
      },
      "reference": {
        "median_ms": 33.6337,
        "p95_ms": 33.6337,
        "min_ms": 33.6337,
        "max_ms": 33.6337,
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
        "median_ms": 26.7635,
        "p95_ms": 26.7635,
        "min_ms": 26.7635,
        "max_ms": 26.7635,
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
        "median_ms": 28.9131,
        "p95_ms": 28.9131,
        "min_ms": 28.9131,
        "max_ms": 28.9131,
        "rounds": 1
      },
      "reference": {
        "median_ms": 26.7635,
        "p95_ms": 26.7635,
        "min_ms": 26.7635,
        "max_ms": 26.7635,
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
        "median_ms": 31.6418,
        "p95_ms": 31.6418,
        "min_ms": 31.6418,
        "max_ms": 31.6418,
        "rounds": 1
      },
      "reference": {
        "median_ms": 26.7635,
        "p95_ms": 26.7635,
        "min_ms": 26.7635,
        "max_ms": 26.7635,
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
        "median_ms": 35.2718,
        "p95_ms": 35.2718,
        "min_ms": 35.2718,
        "max_ms": 35.2718,
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
        "median_ms": 49.5168,
        "p95_ms": 49.5168,
        "min_ms": 49.5168,
        "max_ms": 49.5168,
        "rounds": 1
      },
      "reference": {
        "median_ms": 35.2718,
        "p95_ms": 35.2718,
        "min_ms": 35.2718,
        "max_ms": 35.2718,
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
        "median_ms": 29.2269,
        "p95_ms": 29.2269,
        "min_ms": 29.2269,
        "max_ms": 29.2269,
        "rounds": 1
      },
      "reference": {
        "median_ms": 35.2718,
        "p95_ms": 35.2718,
        "min_ms": 35.2718,
        "max_ms": 35.2718,
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
        "median_ms": 42.2938,
        "p95_ms": 42.2938,
        "min_ms": 42.2938,
        "max_ms": 42.2938,
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
        "median_ms": 42.3132,
        "p95_ms": 42.3132,
        "min_ms": 42.3132,
        "max_ms": 42.3132,
        "rounds": 1
      },
      "reference": {
        "median_ms": 42.2938,
        "p95_ms": 42.2938,
        "min_ms": 42.2938,
        "max_ms": 42.2938,
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
        "median_ms": 44.2398,
        "p95_ms": 44.2398,
        "min_ms": 44.2398,
        "max_ms": 44.2398,
        "rounds": 1
      },
      "reference": {
        "median_ms": 42.2938,
        "p95_ms": 42.2938,
        "min_ms": 42.2938,
        "max_ms": 42.2938,
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
        "median_ms": 14.685,
        "p95_ms": 14.685,
        "min_ms": 14.685,
        "max_ms": 14.685,
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
        "median_ms": 13.2262,
        "p95_ms": 13.2262,
        "min_ms": 13.2262,
        "max_ms": 13.2262,
        "rounds": 1
      },
      "reference": {
        "median_ms": 14.685,
        "p95_ms": 14.685,
        "min_ms": 14.685,
        "max_ms": 14.685,
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
        "median_ms": 15.0087,
        "p95_ms": 15.0087,
        "min_ms": 15.0087,
        "max_ms": 15.0087,
        "rounds": 1
      },
      "reference": {
        "median_ms": 14.685,
        "p95_ms": 14.685,
        "min_ms": 14.685,
        "max_ms": 14.685,
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
        "median_ms": 32.6236,
        "p95_ms": 32.6236,
        "min_ms": 32.6236,
        "max_ms": 32.6236,
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
        "median_ms": 33.7383,
        "p95_ms": 33.7383,
        "min_ms": 33.7383,
        "max_ms": 33.7383,
        "rounds": 1
      },
      "reference": {
        "median_ms": 32.6236,
        "p95_ms": 32.6236,
        "min_ms": 32.6236,
        "max_ms": 32.6236,
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
        "median_ms": 32.5069,
        "p95_ms": 32.5069,
        "min_ms": 32.5069,
        "max_ms": 32.5069,
        "rounds": 1
      },
      "reference": {
        "median_ms": 32.6236,
        "p95_ms": 32.6236,
        "min_ms": 32.6236,
        "max_ms": 32.6236,
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
        "median_ms": 5.3917,
        "p95_ms": 5.3917,
        "min_ms": 5.3917,
        "max_ms": 5.3917,
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
        "median_ms": 5.3022,
        "p95_ms": 5.3022,
        "min_ms": 5.3022,
        "max_ms": 5.3022,
        "rounds": 1
      },
      "reference": {
        "median_ms": 5.3917,
        "p95_ms": 5.3917,
        "min_ms": 5.3917,
        "max_ms": 5.3917,
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
        "median_ms": 6.0864,
        "p95_ms": 6.0864,
        "min_ms": 6.0864,
        "max_ms": 6.0864,
        "rounds": 1
      },
      "reference": {
        "median_ms": 5.3917,
        "p95_ms": 5.3917,
        "min_ms": 5.3917,
        "max_ms": 5.3917,
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
        "median_ms": 40.4456,
        "p95_ms": 40.4456,
        "min_ms": 40.4456,
        "max_ms": 40.4456,
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
        "median_ms": 42.8739,
        "p95_ms": 42.8739,
        "min_ms": 42.8739,
        "max_ms": 42.8739,
        "rounds": 1
      },
      "reference": {
        "median_ms": 40.4456,
        "p95_ms": 40.4456,
        "min_ms": 40.4456,
        "max_ms": 40.4456,
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
        "median_ms": 66.9794,
        "p95_ms": 66.9794,
        "min_ms": 66.9794,
        "max_ms": 66.9794,
        "rounds": 1
      },
      "reference": {
        "median_ms": 40.4456,
        "p95_ms": 40.4456,
        "min_ms": 40.4456,
        "max_ms": 40.4456,
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
        "median_ms": 65.2393,
        "p95_ms": 65.2393,
        "min_ms": 65.2393,
        "max_ms": 65.2393,
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
        "median_ms": 62.9481,
        "p95_ms": 62.9481,
        "min_ms": 62.9481,
        "max_ms": 62.9481,
        "rounds": 1
      },
      "reference": {
        "median_ms": 65.2393,
        "p95_ms": 65.2393,
        "min_ms": 65.2393,
        "max_ms": 65.2393,
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
        "median_ms": 72.9741,
        "p95_ms": 72.9741,
        "min_ms": 72.9741,
        "max_ms": 72.9741,
        "rounds": 1
      },
      "reference": {
        "median_ms": 65.2393,
        "p95_ms": 65.2393,
        "min_ms": 65.2393,
        "max_ms": 65.2393,
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
        "median_ms": 1114.6994,
        "p95_ms": 1114.6994,
        "min_ms": 1114.6994,
        "max_ms": 1114.6994,
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
        "median_ms": 1124.1973,
        "p95_ms": 1124.1973,
        "min_ms": 1124.1973,
        "max_ms": 1124.1973,
        "rounds": 1
      },
      "reference": {
        "median_ms": 1114.6994,
        "p95_ms": 1114.6994,
        "min_ms": 1114.6994,
        "max_ms": 1114.6994,
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
        "median_ms": 1116.1167,
        "p95_ms": 1116.1167,
        "min_ms": 1116.1167,
        "max_ms": 1116.1167,
        "rounds": 1
      },
      "reference": {
        "median_ms": 1114.6994,
        "p95_ms": 1114.6994,
        "min_ms": 1114.6994,
        "max_ms": 1114.6994,
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
        "median_ms": 18.2607,
        "p95_ms": 18.2607,
        "min_ms": 18.2607,
        "max_ms": 18.2607,
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
        "median_ms": 20.7402,
        "p95_ms": 20.7402,
        "min_ms": 20.7402,
        "max_ms": 20.7402,
        "rounds": 1
      },
      "reference": {
        "median_ms": 18.2607,
        "p95_ms": 18.2607,
        "min_ms": 18.2607,
        "max_ms": 18.2607,
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
        "median_ms": 21.5927,
        "p95_ms": 21.5927,
        "min_ms": 21.5927,
        "max_ms": 21.5927,
        "rounds": 1
      },
      "reference": {
        "median_ms": 18.2607,
        "p95_ms": 18.2607,
        "min_ms": 18.2607,
        "max_ms": 18.2607,
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
        "median_ms": 1.3046,
        "p95_ms": 1.3046,
        "min_ms": 1.3046,
        "max_ms": 1.3046,
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
        "median_ms": 1.6489,
        "p95_ms": 1.6489,
        "min_ms": 1.6489,
        "max_ms": 1.6489,
        "rounds": 1
      },
      "reference": {
        "median_ms": 1.3046,
        "p95_ms": 1.3046,
        "min_ms": 1.3046,
        "max_ms": 1.3046,
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
        "median_ms": 1.9494,
        "p95_ms": 1.9494,
        "min_ms": 1.9494,
        "max_ms": 1.9494,
        "rounds": 1
      },
      "reference": {
        "median_ms": 1.3046,
        "p95_ms": 1.3046,
        "min_ms": 1.3046,
        "max_ms": 1.3046,
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
        "median_ms": 26.9946,
        "p95_ms": 26.9946,
        "min_ms": 26.9946,
        "max_ms": 26.9946,
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
        "median_ms": 28.2103,
        "p95_ms": 28.2103,
        "min_ms": 28.2103,
        "max_ms": 28.2103,
        "rounds": 1
      },
      "reference": {
        "median_ms": 26.9946,
        "p95_ms": 26.9946,
        "min_ms": 26.9946,
        "max_ms": 26.9946,
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
        "median_ms": 33.4427,
        "p95_ms": 33.4427,
        "min_ms": 33.4427,
        "max_ms": 33.4427,
        "rounds": 1
      },
      "reference": {
        "median_ms": 26.9946,
        "p95_ms": 26.9946,
        "min_ms": 26.9946,
        "max_ms": 26.9946,
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
        "median_ms": 79.0319,
        "p95_ms": 79.0319,
        "min_ms": 79.0319,
        "max_ms": 79.0319,
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
        "median_ms": 61.7916,
        "p95_ms": 61.7916,
        "min_ms": 61.7916,
        "max_ms": 61.7916,
        "rounds": 1
      },
      "reference": {
        "median_ms": 79.0319,
        "p95_ms": 79.0319,
        "min_ms": 79.0319,
        "max_ms": 79.0319,
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
        "median_ms": 72.4664,
        "p95_ms": 72.4664,
        "min_ms": 72.4664,
        "max_ms": 72.4664,
        "rounds": 1
      },
      "reference": {
        "median_ms": 79.0319,
        "p95_ms": 79.0319,
        "min_ms": 79.0319,
        "max_ms": 79.0319,
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
        "median_ms": 75.0393,
        "p95_ms": 75.0393,
        "min_ms": 75.0393,
        "max_ms": 75.0393,
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
        "median_ms": 81.7738,
        "p95_ms": 81.7738,
        "min_ms": 81.7738,
        "max_ms": 81.7738,
        "rounds": 1
      },
      "reference": {
        "median_ms": 75.0393,
        "p95_ms": 75.0393,
        "min_ms": 75.0393,
        "max_ms": 75.0393,
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
        "median_ms": 73.141,
        "p95_ms": 73.141,
        "min_ms": 73.141,
        "max_ms": 73.141,
        "rounds": 1
      },
      "reference": {
        "median_ms": 75.0393,
        "p95_ms": 75.0393,
        "min_ms": 75.0393,
        "max_ms": 75.0393,
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
        "median_ms": 46.8866,
        "p95_ms": 46.8866,
        "min_ms": 46.8866,
        "max_ms": 46.8866,
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
        "median_ms": 49.8187,
        "p95_ms": 49.8187,
        "min_ms": 49.8187,
        "max_ms": 49.8187,
        "rounds": 1
      },
      "reference": {
        "median_ms": 46.8866,
        "p95_ms": 46.8866,
        "min_ms": 46.8866,
        "max_ms": 46.8866,
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
        "median_ms": 56.2748,
        "p95_ms": 56.2748,
        "min_ms": 56.2748,
        "max_ms": 56.2748,
        "rounds": 1
      },
      "reference": {
        "median_ms": 46.8866,
        "p95_ms": 46.8866,
        "min_ms": 46.8866,
        "max_ms": 46.8866,
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
        "median_ms": 79.6614,
        "p95_ms": 79.6614,
        "min_ms": 79.6614,
        "max_ms": 79.6614,
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
        "median_ms": 77.1483,
        "p95_ms": 77.1483,
        "min_ms": 77.1483,
        "max_ms": 77.1483,
        "rounds": 1
      },
      "reference": {
        "median_ms": 79.6614,
        "p95_ms": 79.6614,
        "min_ms": 79.6614,
        "max_ms": 79.6614,
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
        "median_ms": 84.4056,
        "p95_ms": 84.4056,
        "min_ms": 84.4056,
        "max_ms": 84.4056,
        "rounds": 1
      },
      "reference": {
        "median_ms": 79.6614,
        "p95_ms": 79.6614,
        "min_ms": 79.6614,
        "max_ms": 79.6614,
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
        "median_ms": 3.7487,
        "p95_ms": 3.7487,
        "min_ms": 3.7487,
        "max_ms": 3.7487,
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
        "median_ms": 4.1336,
        "p95_ms": 4.1336,
        "min_ms": 4.1336,
        "max_ms": 4.1336,
        "rounds": 1
      },
      "reference": {
        "median_ms": 3.7487,
        "p95_ms": 3.7487,
        "min_ms": 3.7487,
        "max_ms": 3.7487,
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
        "median_ms": 4.0299,
        "p95_ms": 4.0299,
        "min_ms": 4.0299,
        "max_ms": 4.0299,
        "rounds": 1
      },
      "reference": {
        "median_ms": 3.7487,
        "p95_ms": 3.7487,
        "min_ms": 3.7487,
        "max_ms": 3.7487,
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
        "median_ms": 15.4276,
        "p95_ms": 15.4276,
        "min_ms": 15.4276,
        "max_ms": 15.4276,
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
        "median_ms": 16.9156,
        "p95_ms": 16.9156,
        "min_ms": 16.9156,
        "max_ms": 16.9156,
        "rounds": 1
      },
      "reference": {
        "median_ms": 15.4276,
        "p95_ms": 15.4276,
        "min_ms": 15.4276,
        "max_ms": 15.4276,
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
        "median_ms": 17.4487,
        "p95_ms": 17.4487,
        "min_ms": 17.4487,
        "max_ms": 17.4487,
        "rounds": 1
      },
      "reference": {
        "median_ms": 15.4276,
        "p95_ms": 15.4276,
        "min_ms": 15.4276,
        "max_ms": 15.4276,
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
        "median_ms": 87.0727,
        "p95_ms": 87.0727,
        "min_ms": 87.0727,
        "max_ms": 87.0727,
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
        "median_ms": 85.9435,
        "p95_ms": 85.9435,
        "min_ms": 85.9435,
        "max_ms": 85.9435,
        "rounds": 1
      },
      "reference": {
        "median_ms": 87.0727,
        "p95_ms": 87.0727,
        "min_ms": 87.0727,
        "max_ms": 87.0727,
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
        "median_ms": 96.2215,
        "p95_ms": 96.2215,
        "min_ms": 96.2215,
        "max_ms": 96.2215,
        "rounds": 1
      },
      "reference": {
        "median_ms": 87.0727,
        "p95_ms": 87.0727,
        "min_ms": 87.0727,
        "max_ms": 87.0727,
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
        "median_ms": 32.5646,
        "p95_ms": 32.5646,
        "min_ms": 32.5646,
        "max_ms": 32.5646,
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
        "median_ms": 26.1592,
        "p95_ms": 26.1592,
        "min_ms": 26.1592,
        "max_ms": 26.1592,
        "rounds": 1
      },
      "reference": {
        "median_ms": 32.5646,
        "p95_ms": 32.5646,
        "min_ms": 32.5646,
        "max_ms": 32.5646,
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
        "median_ms": 30.6798,
        "p95_ms": 30.6798,
        "min_ms": 30.6798,
        "max_ms": 30.6798,
        "rounds": 1
      },
      "reference": {
        "median_ms": 32.5646,
        "p95_ms": 32.5646,
        "min_ms": 32.5646,
        "max_ms": 32.5646,
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
        "median_ms": 24.6933,
        "p95_ms": 24.6933,
        "min_ms": 24.6933,
        "max_ms": 24.6933,
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
        "median_ms": 27.9877,
        "p95_ms": 27.9877,
        "min_ms": 27.9877,
        "max_ms": 27.9877,
        "rounds": 1
      },
      "reference": {
        "median_ms": 24.6933,
        "p95_ms": 24.6933,
        "min_ms": 24.6933,
        "max_ms": 24.6933,
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
        "median_ms": 24.8632,
        "p95_ms": 24.8632,
        "min_ms": 24.8632,
        "max_ms": 24.8632,
        "rounds": 1
      },
      "reference": {
        "median_ms": 24.6933,
        "p95_ms": 24.6933,
        "min_ms": 24.6933,
        "max_ms": 24.6933,
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
        "median_ms": 3.3067,
        "p95_ms": 3.3067,
        "min_ms": 3.3067,
        "max_ms": 3.3067,
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
        "median_ms": 2.4746,
        "p95_ms": 2.4746,
        "min_ms": 2.4746,
        "max_ms": 2.4746,
        "rounds": 1
      },
      "reference": {
        "median_ms": 3.3067,
        "p95_ms": 3.3067,
        "min_ms": 3.3067,
        "max_ms": 3.3067,
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
        "median_ms": 9.5466,
        "p95_ms": 9.5466,
        "min_ms": 9.5466,
        "max_ms": 9.5466,
        "rounds": 1
      },
      "reference": {
        "median_ms": 3.3067,
        "p95_ms": 3.3067,
        "min_ms": 3.3067,
        "max_ms": 3.3067,
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
        "median_ms": 14.1488,
        "p95_ms": 14.1488,
        "min_ms": 14.1488,
        "max_ms": 14.1488,
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
        "median_ms": 30.4586,
        "p95_ms": 30.4586,
        "min_ms": 30.4586,
        "max_ms": 30.4586,
        "rounds": 1
      },
      "reference": {
        "median_ms": 14.1488,
        "p95_ms": 14.1488,
        "min_ms": 14.1488,
        "max_ms": 14.1488,
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
        "median_ms": 13.695,
        "p95_ms": 13.695,
        "min_ms": 13.695,
        "max_ms": 13.695,
        "rounds": 1
      },
      "reference": {
        "median_ms": 14.1488,
        "p95_ms": 14.1488,
        "min_ms": 14.1488,
        "max_ms": 14.1488,
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
        "median_ms": 56.7556,
        "p95_ms": 56.7556,
        "min_ms": 56.7556,
        "max_ms": 56.7556,
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
        "median_ms": 46.0911,
        "p95_ms": 46.0911,
        "min_ms": 46.0911,
        "max_ms": 46.0911,
        "rounds": 1
      },
      "reference": {
        "median_ms": 56.7556,
        "p95_ms": 56.7556,
        "min_ms": 56.7556,
        "max_ms": 56.7556,
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
        "median_ms": 53.0079,
        "p95_ms": 53.0079,
        "min_ms": 53.0079,
        "max_ms": 53.0079,
        "rounds": 1
      },
      "reference": {
        "median_ms": 56.7556,
        "p95_ms": 56.7556,
        "min_ms": 56.7556,
        "max_ms": 56.7556,
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
        "median_ms": 76.6748,
        "p95_ms": 76.6748,
        "min_ms": 76.6748,
        "max_ms": 76.6748,
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
        "median_ms": 49.0147,
        "p95_ms": 49.0147,
        "min_ms": 49.0147,
        "max_ms": 49.0147,
        "rounds": 1
      },
      "reference": {
        "median_ms": 76.6748,
        "p95_ms": 76.6748,
        "min_ms": 76.6748,
        "max_ms": 76.6748,
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
        "median_ms": 53.9925,
        "p95_ms": 53.9925,
        "min_ms": 53.9925,
        "max_ms": 53.9925,
        "rounds": 1
      },
      "reference": {
        "median_ms": 76.6748,
        "p95_ms": 76.6748,
        "min_ms": 76.6748,
        "max_ms": 76.6748,
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
        "median_ms": 13.4592,
        "p95_ms": 13.4592,
        "min_ms": 13.4592,
        "max_ms": 13.4592,
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
        "median_ms": 8.2559,
        "p95_ms": 8.2559,
        "min_ms": 8.2559,
        "max_ms": 8.2559,
        "rounds": 1
      },
      "reference": {
        "median_ms": 13.4592,
        "p95_ms": 13.4592,
        "min_ms": 13.4592,
        "max_ms": 13.4592,
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
        "median_ms": 9.6828,
        "p95_ms": 9.6828,
        "min_ms": 9.6828,
        "max_ms": 9.6828,
        "rounds": 1
      },
      "reference": {
        "median_ms": 13.4592,
        "p95_ms": 13.4592,
        "min_ms": 13.4592,
        "max_ms": 13.4592,
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
        "median_ms": 311.3421,
        "p95_ms": 311.3421,
        "min_ms": 311.3421,
        "max_ms": 311.3421,
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
        "median_ms": 324.709,
        "p95_ms": 324.709,
        "min_ms": 324.709,
        "max_ms": 324.709,
        "rounds": 1
      },
      "reference": {
        "median_ms": 311.3421,
        "p95_ms": 311.3421,
        "min_ms": 311.3421,
        "max_ms": 311.3421,
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
        "median_ms": 355.3481,
        "p95_ms": 355.3481,
        "min_ms": 355.3481,
        "max_ms": 355.3481,
        "rounds": 1
      },
      "reference": {
        "median_ms": 311.3421,
        "p95_ms": 311.3421,
        "min_ms": 311.3421,
        "max_ms": 311.3421,
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
        "median_ms": 24.8351,
        "p95_ms": 24.8351,
        "min_ms": 24.8351,
        "max_ms": 24.8351,
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
        "median_ms": 24.1109,
        "p95_ms": 24.1109,
        "min_ms": 24.1109,
        "max_ms": 24.1109,
        "rounds": 1
      },
      "reference": {
        "median_ms": 24.8351,
        "p95_ms": 24.8351,
        "min_ms": 24.8351,
        "max_ms": 24.8351,
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
        "median_ms": 22.9118,
        "p95_ms": 22.9118,
        "min_ms": 22.9118,
        "max_ms": 22.9118,
        "rounds": 1
      },
      "reference": {
        "median_ms": 24.8351,
        "p95_ms": 24.8351,
        "min_ms": 24.8351,
        "max_ms": 24.8351,
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
        "median_ms": 38.9745,
        "p95_ms": 38.9745,
        "min_ms": 38.9745,
        "max_ms": 38.9745,
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
        "median_ms": 36.2002,
        "p95_ms": 36.2002,
        "min_ms": 36.2002,
        "max_ms": 36.2002,
        "rounds": 1
      },
      "reference": {
        "median_ms": 38.9745,
        "p95_ms": 38.9745,
        "min_ms": 38.9745,
        "max_ms": 38.9745,
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
        "median_ms": 39.9546,
        "p95_ms": 39.9546,
        "min_ms": 39.9546,
        "max_ms": 39.9546,
        "rounds": 1
      },
      "reference": {
        "median_ms": 38.9745,
        "p95_ms": 38.9745,
        "min_ms": 38.9745,
        "max_ms": 38.9745,
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
        "median_ms": 126.3942,
        "p95_ms": 126.3942,
        "min_ms": 126.3942,
        "max_ms": 126.3942,
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
        "median_ms": 147.9402,
        "p95_ms": 147.9402,
        "min_ms": 147.9402,
        "max_ms": 147.9402,
        "rounds": 1
      },
      "reference": {
        "median_ms": 126.3942,
        "p95_ms": 126.3942,
        "min_ms": 126.3942,
        "max_ms": 126.3942,
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
        "median_ms": 158.5146,
        "p95_ms": 158.5146,
        "min_ms": 158.5146,
        "max_ms": 158.5146,
        "rounds": 1
      },
      "reference": {
        "median_ms": 126.3942,
        "p95_ms": 126.3942,
        "min_ms": 126.3942,
        "max_ms": 126.3942,
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
        "median_ms": 32.7857,
        "p95_ms": 32.7857,
        "min_ms": 32.7857,
        "max_ms": 32.7857,
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
        "median_ms": 35.7757,
        "p95_ms": 35.7757,
        "min_ms": 35.7757,
        "max_ms": 35.7757,
        "rounds": 1
      },
      "reference": {
        "median_ms": 32.7857,
        "p95_ms": 32.7857,
        "min_ms": 32.7857,
        "max_ms": 32.7857,
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
        "median_ms": 38.4002,
        "p95_ms": 38.4002,
        "min_ms": 38.4002,
        "max_ms": 38.4002,
        "rounds": 1
      },
      "reference": {
        "median_ms": 32.7857,
        "p95_ms": 32.7857,
        "min_ms": 32.7857,
        "max_ms": 32.7857,
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
        "median_ms": 29.3849,
        "p95_ms": 29.3849,
        "min_ms": 29.3849,
        "max_ms": 29.3849,
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
        "median_ms": 28.8177,
        "p95_ms": 28.8177,
        "min_ms": 28.8177,
        "max_ms": 28.8177,
        "rounds": 1
      },
      "reference": {
        "median_ms": 29.3849,
        "p95_ms": 29.3849,
        "min_ms": 29.3849,
        "max_ms": 29.3849,
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
        "median_ms": 67.1178,
        "p95_ms": 67.1178,
        "min_ms": 67.1178,
        "max_ms": 67.1178,
        "rounds": 1
      },
      "reference": {
        "median_ms": 29.3849,
        "p95_ms": 29.3849,
        "min_ms": 29.3849,
        "max_ms": 29.3849,
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
        "median_ms": 8.6952,
        "p95_ms": 8.6952,
        "min_ms": 8.6952,
        "max_ms": 8.6952,
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
        "median_ms": 5.5104,
        "p95_ms": 5.5104,
        "min_ms": 5.5104,
        "max_ms": 5.5104,
        "rounds": 1
      },
      "reference": {
        "median_ms": 8.6952,
        "p95_ms": 8.6952,
        "min_ms": 8.6952,
        "max_ms": 8.6952,
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
        "median_ms": 6.1765,
        "p95_ms": 6.1765,
        "min_ms": 6.1765,
        "max_ms": 6.1765,
        "rounds": 1
      },
      "reference": {
        "median_ms": 8.6952,
        "p95_ms": 8.6952,
        "min_ms": 8.6952,
        "max_ms": 8.6952,
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
        "median_ms": 83.068,
        "p95_ms": 83.068,
        "min_ms": 83.068,
        "max_ms": 83.068,
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
        "median_ms": 85.2176,
        "p95_ms": 85.2176,
        "min_ms": 85.2176,
        "max_ms": 85.2176,
        "rounds": 1
      },
      "reference": {
        "median_ms": 83.068,
        "p95_ms": 83.068,
        "min_ms": 83.068,
        "max_ms": 83.068,
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
        "median_ms": 91.9334,
        "p95_ms": 91.9334,
        "min_ms": 91.9334,
        "max_ms": 91.9334,
        "rounds": 1
      },
      "reference": {
        "median_ms": 83.068,
        "p95_ms": 83.068,
        "min_ms": 83.068,
        "max_ms": 83.068,
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
        "median_ms": 51.939,
        "p95_ms": 51.939,
        "min_ms": 51.939,
        "max_ms": 51.939,
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
        "median_ms": 53.131,
        "p95_ms": 53.131,
        "min_ms": 53.131,
        "max_ms": 53.131,
        "rounds": 1
      },
      "reference": {
        "median_ms": 51.939,
        "p95_ms": 51.939,
        "min_ms": 51.939,
        "max_ms": 51.939,
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
        "median_ms": 62.3399,
        "p95_ms": 62.3399,
        "min_ms": 62.3399,
        "max_ms": 62.3399,
        "rounds": 1
      },
      "reference": {
        "median_ms": 51.939,
        "p95_ms": 51.939,
        "min_ms": 51.939,
        "max_ms": 51.939,
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
        "median_ms": 62.4258,
        "p95_ms": 62.4258,
        "min_ms": 62.4258,
        "max_ms": 62.4258,
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
        "median_ms": 65.607,
        "p95_ms": 65.607,
        "min_ms": 65.607,
        "max_ms": 65.607,
        "rounds": 1
      },
      "reference": {
        "median_ms": 62.4258,
        "p95_ms": 62.4258,
        "min_ms": 62.4258,
        "max_ms": 62.4258,
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
        "median_ms": 64.6709,
        "p95_ms": 64.6709,
        "min_ms": 64.6709,
        "max_ms": 64.6709,
        "rounds": 1
      },
      "reference": {
        "median_ms": 62.4258,
        "p95_ms": 62.4258,
        "min_ms": 62.4258,
        "max_ms": 62.4258,
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
        "median_ms": 3.6534,
        "p95_ms": 3.6534,
        "min_ms": 3.6534,
        "max_ms": 3.6534,
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
        "median_ms": 2.0904,
        "p95_ms": 2.0904,
        "min_ms": 2.0904,
        "max_ms": 2.0904,
        "rounds": 1
      },
      "reference": {
        "median_ms": 3.6534,
        "p95_ms": 3.6534,
        "min_ms": 3.6534,
        "max_ms": 3.6534,
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
        "median_ms": 3.8162,
        "p95_ms": 3.8162,
        "min_ms": 3.8162,
        "max_ms": 3.8162,
        "rounds": 1
      },
      "reference": {
        "median_ms": 3.6534,
        "p95_ms": 3.6534,
        "min_ms": 3.6534,
        "max_ms": 3.6534,
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
        "median_ms": 4.3197,
        "p95_ms": 4.3197,
        "min_ms": 4.3197,
        "max_ms": 4.3197,
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
        "median_ms": 5.6344,
        "p95_ms": 5.6344,
        "min_ms": 5.6344,
        "max_ms": 5.6344,
        "rounds": 1
      },
      "reference": {
        "median_ms": 4.3197,
        "p95_ms": 4.3197,
        "min_ms": 4.3197,
        "max_ms": 4.3197,
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
        "median_ms": 5.1851,
        "p95_ms": 5.1851,
        "min_ms": 5.1851,
        "max_ms": 5.1851,
        "rounds": 1
      },
      "reference": {
        "median_ms": 4.3197,
        "p95_ms": 4.3197,
        "min_ms": 4.3197,
        "max_ms": 4.3197,
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
        "median_ms": 1002.3579,
        "p95_ms": 1002.3579,
        "min_ms": 1002.3579,
        "max_ms": 1002.3579,
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
        "median_ms": 962.3057,
        "p95_ms": 962.3057,
        "min_ms": 962.3057,
        "max_ms": 962.3057,
        "rounds": 1
      },
      "reference": {
        "median_ms": 1002.3579,
        "p95_ms": 1002.3579,
        "min_ms": 1002.3579,
        "max_ms": 1002.3579,
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
        "median_ms": 985.8149,
        "p95_ms": 985.8149,
        "min_ms": 985.8149,
        "max_ms": 985.8149,
        "rounds": 1
      },
      "reference": {
        "median_ms": 1002.3579,
        "p95_ms": 1002.3579,
        "min_ms": 1002.3579,
        "max_ms": 1002.3579,
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
        "median_ms": 35.3298,
        "p95_ms": 35.3298,
        "min_ms": 35.3298,
        "max_ms": 35.3298,
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
        "median_ms": 37.7422,
        "p95_ms": 37.7422,
        "min_ms": 37.7422,
        "max_ms": 37.7422,
        "rounds": 1
      },
      "reference": {
        "median_ms": 35.3298,
        "p95_ms": 35.3298,
        "min_ms": 35.3298,
        "max_ms": 35.3298,
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
        "median_ms": 35.8475,
        "p95_ms": 35.8475,
        "min_ms": 35.8475,
        "max_ms": 35.8475,
        "rounds": 1
      },
      "reference": {
        "median_ms": 35.3298,
        "p95_ms": 35.3298,
        "min_ms": 35.3298,
        "max_ms": 35.3298,
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
        "median_ms": 108.9645,
        "p95_ms": 108.9645,
        "min_ms": 108.9645,
        "max_ms": 108.9645,
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
        "median_ms": 107.1372,
        "p95_ms": 107.1372,
        "min_ms": 107.1372,
        "max_ms": 107.1372,
        "rounds": 1
      },
      "reference": {
        "median_ms": 108.9645,
        "p95_ms": 108.9645,
        "min_ms": 108.9645,
        "max_ms": 108.9645,
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
        "median_ms": 108.448,
        "p95_ms": 108.448,
        "min_ms": 108.448,
        "max_ms": 108.448,
        "rounds": 1
      },
      "reference": {
        "median_ms": 108.9645,
        "p95_ms": 108.9645,
        "min_ms": 108.9645,
        "max_ms": 108.9645,
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
        "median_ms": 29.9489,
        "p95_ms": 29.9489,
        "min_ms": 29.9489,
        "max_ms": 29.9489,
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
        "median_ms": 27.4311,
        "p95_ms": 27.4311,
        "min_ms": 27.4311,
        "max_ms": 27.4311,
        "rounds": 1
      },
      "reference": {
        "median_ms": 29.9489,
        "p95_ms": 29.9489,
        "min_ms": 29.9489,
        "max_ms": 29.9489,
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
        "median_ms": 26.4072,
        "p95_ms": 26.4072,
        "min_ms": 26.4072,
        "max_ms": 26.4072,
        "rounds": 1
      },
      "reference": {
        "median_ms": 29.9489,
        "p95_ms": 29.9489,
        "min_ms": 29.9489,
        "max_ms": 29.9489,
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
        "median_ms": 9.1002,
        "p95_ms": 9.1002,
        "min_ms": 9.1002,
        "max_ms": 9.1002,
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
        "median_ms": 8.7222,
        "p95_ms": 8.7222,
        "min_ms": 8.7222,
        "max_ms": 8.7222,
        "rounds": 1
      },
      "reference": {
        "median_ms": 9.1002,
        "p95_ms": 9.1002,
        "min_ms": 9.1002,
        "max_ms": 9.1002,
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
        "median_ms": 7.7313,
        "p95_ms": 7.7313,
        "min_ms": 7.7313,
        "max_ms": 7.7313,
        "rounds": 1
      },
      "reference": {
        "median_ms": 9.1002,
        "p95_ms": 9.1002,
        "min_ms": 9.1002,
        "max_ms": 9.1002,
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
        "median_ms": 6.5095,
        "p95_ms": 6.5095,
        "min_ms": 6.5095,
        "max_ms": 6.5095,
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
        "median_ms": 7.4574,
        "p95_ms": 7.4574,
        "min_ms": 7.4574,
        "max_ms": 7.4574,
        "rounds": 1
      },
      "reference": {
        "median_ms": 6.5095,
        "p95_ms": 6.5095,
        "min_ms": 6.5095,
        "max_ms": 6.5095,
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
        "median_ms": 7.3329,
        "p95_ms": 7.3329,
        "min_ms": 7.3329,
        "max_ms": 7.3329,
        "rounds": 1
      },
      "reference": {
        "median_ms": 6.5095,
        "p95_ms": 6.5095,
        "min_ms": 6.5095,
        "max_ms": 6.5095,
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
        "median_ms": 10.7125,
        "p95_ms": 10.7125,
        "min_ms": 10.7125,
        "max_ms": 10.7125,
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
        "median_ms": 12.1144,
        "p95_ms": 12.1144,
        "min_ms": 12.1144,
        "max_ms": 12.1144,
        "rounds": 1
      },
      "reference": {
        "median_ms": 10.7125,
        "p95_ms": 10.7125,
        "min_ms": 10.7125,
        "max_ms": 10.7125,
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
        "median_ms": 17.1776,
        "p95_ms": 17.1776,
        "min_ms": 17.1776,
        "max_ms": 17.1776,
        "rounds": 1
      },
      "reference": {
        "median_ms": 10.7125,
        "p95_ms": 10.7125,
        "min_ms": 10.7125,
        "max_ms": 10.7125,
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
        "median_ms": 44.669,
        "p95_ms": 44.669,
        "min_ms": 44.669,
        "max_ms": 44.669,
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
        "median_ms": 24.6033,
        "p95_ms": 24.6033,
        "min_ms": 24.6033,
        "max_ms": 24.6033,
        "rounds": 1
      },
      "reference": {
        "median_ms": 44.669,
        "p95_ms": 44.669,
        "min_ms": 44.669,
        "max_ms": 44.669,
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
        "median_ms": 30.4502,
        "p95_ms": 30.4502,
        "min_ms": 30.4502,
        "max_ms": 30.4502,
        "rounds": 1
      },
      "reference": {
        "median_ms": 44.669,
        "p95_ms": 44.669,
        "min_ms": 44.669,
        "max_ms": 44.669,
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
        "median_ms": 27.9575,
        "p95_ms": 27.9575,
        "min_ms": 27.9575,
        "max_ms": 27.9575,
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
        "median_ms": 31.9217,
        "p95_ms": 31.9217,
        "min_ms": 31.9217,
        "max_ms": 31.9217,
        "rounds": 1
      },
      "reference": {
        "median_ms": 27.9575,
        "p95_ms": 27.9575,
        "min_ms": 27.9575,
        "max_ms": 27.9575,
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
        "median_ms": 28.6797,
        "p95_ms": 28.6797,
        "min_ms": 28.6797,
        "max_ms": 28.6797,
        "rounds": 1
      },
      "reference": {
        "median_ms": 27.9575,
        "p95_ms": 27.9575,
        "min_ms": 27.9575,
        "max_ms": 27.9575,
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
        "median_ms": 57.3704,
        "p95_ms": 57.3704,
        "min_ms": 57.3704,
        "max_ms": 57.3704,
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
        "median_ms": 63.3653,
        "p95_ms": 63.3653,
        "min_ms": 63.3653,
        "max_ms": 63.3653,
        "rounds": 1
      },
      "reference": {
        "median_ms": 57.3704,
        "p95_ms": 57.3704,
        "min_ms": 57.3704,
        "max_ms": 57.3704,
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
        "median_ms": 61.6158,
        "p95_ms": 61.6158,
        "min_ms": 61.6158,
        "max_ms": 61.6158,
        "rounds": 1
      },
      "reference": {
        "median_ms": 57.3704,
        "p95_ms": 57.3704,
        "min_ms": 57.3704,
        "max_ms": 57.3704,
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
        "median_ms": 113.4589,
        "p95_ms": 113.4589,
        "min_ms": 113.4589,
        "max_ms": 113.4589,
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
        "median_ms": 125.5707,
        "p95_ms": 125.5707,
        "min_ms": 125.5707,
        "max_ms": 125.5707,
        "rounds": 1
      },
      "reference": {
        "median_ms": 113.4589,
        "p95_ms": 113.4589,
        "min_ms": 113.4589,
        "max_ms": 113.4589,
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
        "median_ms": 138.9661,
        "p95_ms": 138.9661,
        "min_ms": 138.9661,
        "max_ms": 138.9661,
        "rounds": 1
      },
      "reference": {
        "median_ms": 113.4589,
        "p95_ms": 113.4589,
        "min_ms": 113.4589,
        "max_ms": 113.4589,
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
        "median_ms": 107.194,
        "p95_ms": 107.194,
        "min_ms": 107.194,
        "max_ms": 107.194,
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
        "median_ms": 108.7224,
        "p95_ms": 108.7224,
        "min_ms": 108.7224,
        "max_ms": 108.7224,
        "rounds": 1
      },
      "reference": {
        "median_ms": 107.194,
        "p95_ms": 107.194,
        "min_ms": 107.194,
        "max_ms": 107.194,
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
        "median_ms": 137.8243,
        "p95_ms": 137.8243,
        "min_ms": 137.8243,
        "max_ms": 137.8243,
        "rounds": 1
      },
      "reference": {
        "median_ms": 107.194,
        "p95_ms": 107.194,
        "min_ms": 107.194,
        "max_ms": 107.194,
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
        "median_ms": 63.5541,
        "p95_ms": 63.5541,
        "min_ms": 63.5541,
        "max_ms": 63.5541,
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
        "median_ms": 72.2755,
        "p95_ms": 72.2755,
        "min_ms": 72.2755,
        "max_ms": 72.2755,
        "rounds": 1
      },
      "reference": {
        "median_ms": 63.5541,
        "p95_ms": 63.5541,
        "min_ms": 63.5541,
        "max_ms": 63.5541,
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
        "median_ms": 73.3153,
        "p95_ms": 73.3153,
        "min_ms": 73.3153,
        "max_ms": 73.3153,
        "rounds": 1
      },
      "reference": {
        "median_ms": 63.5541,
        "p95_ms": 63.5541,
        "min_ms": 63.5541,
        "max_ms": 63.5541,
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
        "median_ms": 87.286,
        "p95_ms": 87.286,
        "min_ms": 87.286,
        "max_ms": 87.286,
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
        "median_ms": 99.1394,
        "p95_ms": 99.1394,
        "min_ms": 99.1394,
        "max_ms": 99.1394,
        "rounds": 1
      },
      "reference": {
        "median_ms": 87.286,
        "p95_ms": 87.286,
        "min_ms": 87.286,
        "max_ms": 87.286,
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
        "median_ms": 80.7579,
        "p95_ms": 80.7579,
        "min_ms": 80.7579,
        "max_ms": 80.7579,
        "rounds": 1
      },
      "reference": {
        "median_ms": 87.286,
        "p95_ms": 87.286,
        "min_ms": 87.286,
        "max_ms": 87.286,
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
      "workload": "connect@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 106.7149,
        "p95_ms": 106.7149,
        "min_ms": 106.7149,
        "max_ms": 106.7149,
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
        "median_ms": 31.3717,
        "p95_ms": 31.3717,
        "min_ms": 31.3717,
        "max_ms": 31.3717,
        "rounds": 1
      },
      "reference": {
        "median_ms": 106.7149,
        "p95_ms": 106.7149,
        "min_ms": 106.7149,
        "max_ms": 106.7149,
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
        "median_ms": 68.6669,
        "p95_ms": 68.6669,
        "min_ms": 68.6669,
        "max_ms": 68.6669,
        "rounds": 1
      },
      "reference": {
        "median_ms": 106.7149,
        "p95_ms": 106.7149,
        "min_ms": 106.7149,
        "max_ms": 106.7149,
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
