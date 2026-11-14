# Benchmark report

Command: `pnpm --dir projects/redis.ts/examples/vs-js-libraries benchmark`
Binding: `release` — build with `pnpm build:release` and set `BENCH_BINDING_PROFILE=release` for product numbers
Defaults: `BENCH_SET=100`, `BENCH_GET=500`, `BENCH_PIPE=500`, `BENCH_PING=1000`, `BENCH_BATCH=500`, `BENCH_COLL=200`, `BENCH_BIG=20`, `BENCH_BIG_GET=50`, `BENCH_BIG_BYTES=65536`, `BENCH_CONNECT=50`, `BENCH_STREAM=200`, `BENCH_PUBSUB=100`, `BENCH_TTL=30`, `BENCH_TXN=100`, `BENCH_INCR=500`, `BENCH_MSET=500`, `BENCH_DEL=200`, `BENCH_MOVE=200`, `BENCH_BLOCK=100`, `BENCH_PING_CONC=800`, `BENCH_CONC=8`, `BENCH_GROUP=100`, `BENCH_REPEAT=10`, `BENCH_COLL_LARGE=2000`, `BENCH_ROUNDS=5`, `BENCH_WARMUP=1`
Baseline: `ioredis` against the emulated server = `1.00x`
Ratio: subject_time / baseline_time (smaller is faster). Fastest cell in each row is bold.
Stats: median/p95/min/max/rounds come from `database.harness::summarize` via `benchSummary` (addon:harnessBenchSummary + harnessBenchPerOp (database.harness::summarize / per_op_ms)); nearest-rank p95, even-length median averages the middle pair. Per-op milliseconds come from `database.harness::per_op_ms` via `benchPerOpMs`, the same DTO the summary returns. No median, p95 or per-op formula lives in this example.

## Provenance

- `node_version`: `v24.18.0`
- `rustc_version`: `rustc 1.101.0-nightly (1c3a65069 2026-11-02)`
- `target_triple`: `x86_64-pc-windows-msvc`
- `rev`: `52965cddd90d3458c6e4813f2af1a05906b9993f`
- `plan`: `rounds=5, warmup=1`
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
| `list-lpush-lpop` | `redis-list-lpush-lpop` | 400 | {"elements":"200"} |
| `set-algebra` | `redis-set-sinter-sunion-sdiff` | 30 | {"members":"200","repeat":"10"} |
| `set-membership-ops` | `redis-set-membership-cardinality` | 30 | {"members":"200","repeat":"10","commands":"SMISMEMBER,SINTERCARD,SRANDMEMBER"} |
| `zset-pop-ops` | `redis-zset-pop-random-score` | 4 | {"members":"200","commands":"ZMSCORE,ZRANDMEMBER,ZPOPMIN,ZPOPMAX"} |
| `large-collection-read` | `redis-large-collection-full-read` | 20 | {"members":"2000","repeat":"10","commands":"SMEMBERS,ZRANGE"} |
| `zset-score-ops` | `redis-zset-increment-rank` | 600 | {"members":"200"} |
| `bitfield-ops` | `redis-bitfield-increment` | 201 | {"increments":"200","type":"u32"} |
| `hll-ops` | `redis-hyperloglog-add-count` | 201 | {"elements":"200"} |
| `sort-ops` | `redis-sort-list` | 10 | {"elements":"200","repeat":"10","mode":"SORT_RO"} |
| `keys-random` | `redis-keys-random-dbsize` | 30 | {"keys":"200","repeat":"10"} |
| `stream-xread` | `redis-stream-xread` | 10 | {"entries":"200","repeat":"10"} |
| `server-face-ops` | `redis-server-face` | 40 | {"repeat":"10","commands":"INFO,COMMAND COUNT,CONFIG GET,CONFIG SET"} |
| `watch-exec` | `redis-txn-watch-exec` | 40 | {"keys":"1","repeat":"10"} |
| `set-big` | `redis-big-value-set` | 20 | {"ops":"20","value_bytes":"65536"} |
| `get-big` | `redis-big-value-get` | 50 | {"ops":"50","value_bytes":"65536"} |
| `del-seq` | `redis-key-del` | 200 | {"keys":"200"} |
| `move-seq` | `redis-key-move` | 200 | {"ops":"200","databases":"2"} |
| `ping` | `redis-ping-rtt` | 1000 | {"ops":"1000"} |
| `connect` | `redis-connect-open-close` | 50 | {"opens":"50","probe":"PING"} |

## Relative to `ioredis`

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|-------:|-------:|-------:|
| get-seq | 1.00x | **0.58x** | 1.06x |
| set-seq | 1.00x | **0.69x** | 0.95x |
| mset-seq | **1.00x** | 1.16x | 1.31x |
| incr-seq | 1.00x | **0.72x** | 0.96x |
| set-pipeline | 1.00x | **0.68x** | 0.96x |
| get-pipeline | **1.00x** | 1.18x | 1.49x |
| pipeline-mixed | 1.00x | **0.92x** | 2.13x |
| hash-hset-hget | 1.00x | **0.64x** | 0.85x |
| hash-setnx-hrandfield | **1.00x** | 1.01x | 1.13x |
| list-rpush-lrange | **1.00x** | 1.67x | 1.41x |
| set-sadd-smembers | 1.00x | **0.58x** | 0.68x |
| zset-zadd-zrange | 1.00x | **0.79x** | 0.92x |
| streams-xadd-xrange | **1.00x** | 1.00x | 1.13x |
| pubsub-roundtrip | 1.00x | **0.83x** | 1.05x |
| blpop-roundtrip | 1.00x | **0.90x** | 0.91x |
| scan-full | **1.00x** | 1.76x | 1.72x |
| ping-concurrent | **1.00x** | 1.00x | 1.02x |
| stream-group | 1.00x | **0.89x** | 1.12x |
| ttl-setex-expire | **1.00x** | 1.00x | 1.00x |
| multi-exec | 1.00x | 1.01x | **0.96x** |
| mget-seq | **1.00x** | 1.17x | 1.26x |
| append-getrange | 1.00x | **0.87x** | 1.05x |
| getdel-getex | 1.00x | 1.10x | **0.91x** |
| set-options | 1.00x | **0.74x** | 1.10x |
| exists-type | **1.00x** | 1.53x | 1.08x |
| expire-persist | **1.00x** | 1.07x | 1.10x |
| hash-hgetall-hdel | **1.00x** | 1.01x | 1.34x |
| list-lpush-lpop | **1.00x** | 1.33x | 1.11x |
| set-algebra | **1.00x** | 1.34x | 1.14x |
| set-membership-ops | **1.00x** | 1.27x | 2.45x |
| zset-pop-ops | 1.00x | **0.38x** | 0.71x |
| large-collection-read | 1.00x | 0.75x | **0.62x** |
| zset-score-ops | 1.00x | **0.64x** | 0.78x |
| bitfield-ops | 1.00x | 0.98x | **0.82x** |
| hll-ops | **1.00x** | 1.35x | 2.16x |
| sort-ops | 1.00x | 0.85x | **0.66x** |
| keys-random | 1.00x | 0.93x | **0.92x** |
| stream-xread | **1.00x** | 1.50x | 1.84x |
| server-face-ops | 1.00x | 0.99x | **0.98x** |
| watch-exec | 1.00x | **0.80x** | 0.91x |
| set-big | 1.00x | 0.91x | **0.78x** |
| get-big | 1.00x | **0.99x** | 1.73x |
| del-seq | 1.00x | **0.91x** | 1.28x |
| move-seq | **1.00x** | 1.03x | 1.21x |
| ping | **1.00x** | 1.01x | 1.24x |
| connect | 1.00x | **0.58x** | 0.60x |

## Median and p95 (ms)

| Workload | ops | ioredis med | ioredis p95 | @yydb/redis med | @yydb/redis p95 | node-redis med | node-redis p95 |
|---------:|----:|-------:|-------:|-------:|-------:|-------:|-------:|
| get-seq | 500 | 41.80 | 62.18 | 24.34 | 27.20 | 44.46 | 69.14 |
| set-seq | 100 | 8.20 | 10.23 | 5.63 | 8.43 | 7.76 | 24.86 |
| mset-seq | 500 | 3.18 | 4.02 | 3.70 | 4.44 | 4.16 | 4.85 |
| incr-seq | 500 | 31.34 | 46.38 | 22.60 | 24.17 | 30.17 | 31.59 |
| set-pipeline | 500 | 14.01 | 15.86 | 9.58 | 10.28 | 13.42 | 55.67 |
| get-pipeline | 500 | 7.35 | 9.97 | 8.71 | 10.86 | 10.95 | 15.87 |
| pipeline-mixed | 500 | 11.48 | 20.15 | 10.61 | 12.20 | 24.48 | 25.40 |
| hash-hset-hget | 401 | 42.12 | 62.85 | 26.85 | 45.65 | 35.89 | 66.27 |
| hash-setnx-hrandfield | 402 | 11.68 | 12.90 | 11.80 | 13.22 | 13.24 | 19.64 |
| list-rpush-lrange | 202 | 11.30 | 16.77 | 18.88 | 26.24 | 15.95 | 21.26 |
| set-sadd-smembers | 202 | 16.81 | 18.31 | 9.74 | 10.54 | 11.47 | 13.61 |
| zset-zadd-zrange | 202 | 13.58 | 14.46 | 10.73 | 12.02 | 12.52 | 14.51 |
| streams-xadd-xrange | 202 | 28.91 | 34.94 | 28.96 | 64.96 | 32.71 | 36.57 |
| pubsub-roundtrip | 100 | 7.32 | 7.96 | 6.04 | 7.54 | 7.65 | 7.91 |
| blpop-roundtrip | 100 | 15.06 | 16.28 | 13.50 | 15.27 | 13.74 | 15.57 |
| scan-full | 200 | 2.29 | 2.91 | 4.03 | 4.92 | 3.93 | 5.31 |
| ping-concurrent | 800 | 25.29 | 54.99 | 25.32 | 25.85 | 25.76 | 31.57 |
| stream-group | 300 | 38.87 | 49.04 | 34.67 | 36.72 | 43.48 | 72.83 |
| ttl-setex-expire | 90 | 1112.35 | 1117.37 | 1116.06 | 1121.11 | 1113.27 | 1121.61 |
| multi-exec | 102 | 8.89 | 16.51 | 8.99 | 11.19 | 8.49 | 10.30 |
| mget-seq | 200 | 0.59 | 0.66 | 0.69 | 0.87 | 0.74 | 1.25 |
| append-getrange | 201 | 13.96 | 20.38 | 12.20 | 15.09 | 14.67 | 17.02 |
| getdel-getex | 400 | 26.52 | 27.90 | 29.30 | 48.20 | 24.02 | 28.03 |
| set-options | 400 | 28.18 | 68.63 | 20.89 | 25.73 | 31.06 | 34.46 |
| exists-type | 400 | 19.68 | 26.17 | 30.13 | 37.20 | 21.18 | 30.10 |
| expire-persist | 600 | 26.86 | 29.66 | 28.79 | 47.03 | 29.48 | 35.74 |
| hash-hgetall-hdel | 202 | 2.12 | 2.81 | 2.14 | 2.55 | 2.84 | 20.74 |
| list-lpush-lpop | 400 | 26.72 | 28.76 | 35.66 | 41.72 | 29.77 | 36.82 |
| set-algebra | 30 | 7.96 | 8.90 | 10.70 | 13.37 | 9.11 | 11.72 |
| set-membership-ops | 30 | 10.54 | 12.89 | 13.36 | 17.51 | 25.85 | 41.48 |
| zset-pop-ops | 4 | 2.57 | 2.71 | 0.99 | 1.88 | 1.82 | 45.34 |
| large-collection-read | 20 | 33.95 | 36.94 | 25.51 | 28.68 | 21.00 | 23.47 |
| zset-score-ops | 600 | 82.17 | 116.34 | 52.24 | 64.47 | 64.20 | 114.99 |
| bitfield-ops | 201 | 19.40 | 25.80 | 18.93 | 27.71 | 15.93 | 17.74 |
| hll-ops | 201 | 10.74 | 14.73 | 14.48 | 40.72 | 23.22 | 35.62 |
| sort-ops | 10 | 3.66 | 4.08 | 3.11 | 3.81 | 2.44 | 3.12 |
| keys-random | 30 | 25.65 | 27.92 | 23.79 | 45.17 | 23.52 | 25.04 |
| stream-xread | 10 | 13.43 | 16.78 | 20.14 | 26.36 | 24.74 | 26.80 |
| server-face-ops | 40 | 4.14 | 4.94 | 4.09 | 4.31 | 4.05 | 5.08 |
| watch-exec | 40 | 4.13 | 4.48 | 3.29 | 3.82 | 3.78 | 4.99 |
| set-big | 20 | 9.53 | 22.93 | 8.65 | 8.77 | 7.41 | 26.59 |
| get-big | 50 | 22.02 | 37.01 | 21.83 | 51.42 | 38.10 | 56.25 |
| del-seq | 200 | 15.51 | 21.18 | 14.08 | 16.79 | 19.79 | 31.09 |
| move-seq | 200 | 27.32 | 30.96 | 28.04 | 50.00 | 32.98 | 37.65 |
| ping | 1000 | 74.01 | 94.94 | 74.85 | 85.92 | 91.89 | 120.80 |
| connect | 50 | 126.67 | 181.20 | 73.76 | 117.00 | 76.63 | 91.61 |

## Per-op and throughput (median)

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|--------:|--------:|--------:|
| get-seq | 0.084 ms/op, 11,963/s | 0.049 ms/op, 20,543/s | 0.089 ms/op, 11,246/s |
| set-seq | 0.082 ms/op, 12,191/s | 0.056 ms/op, 17,747/s | 0.078 ms/op, 12,894/s |
| mset-seq | 0.006 ms/op, 157,307/s | 0.007 ms/op, 135,270/s | 0.008 ms/op, 120,210/s |
| incr-seq | 0.063 ms/op, 15,954/s | 0.045 ms/op, 22,124/s | 0.060 ms/op, 16,571/s |
| set-pipeline | 0.028 ms/op, 35,691/s | 0.019 ms/op, 52,175/s | 0.027 ms/op, 37,253/s |
| get-pipeline | 0.015 ms/op, 67,997/s | 0.017 ms/op, 57,436/s | 0.022 ms/op, 45,673/s |
| pipeline-mixed | 0.023 ms/op, 43,557/s | 0.021 ms/op, 47,143/s | 0.049 ms/op, 20,422/s |
| hash-hset-hget | 0.105 ms/op, 9,521/s | 0.067 ms/op, 14,934/s | 0.089 ms/op, 11,174/s |
| hash-setnx-hrandfield | 0.029 ms/op, 34,423/s | 0.029 ms/op, 34,074/s | 0.033 ms/op, 30,353/s |
| list-rpush-lrange | 0.056 ms/op, 17,870/s | 0.093 ms/op, 10,701/s | 0.079 ms/op, 12,667/s |
| set-sadd-smembers | 0.083 ms/op, 12,014/s | 0.048 ms/op, 20,732/s | 0.057 ms/op, 17,606/s |
| zset-zadd-zrange | 0.067 ms/op, 14,875/s | 0.053 ms/op, 18,828/s | 0.062 ms/op, 16,140/s |
| streams-xadd-xrange | 0.143 ms/op, 6,987/s | 0.143 ms/op, 6,976/s | 0.162 ms/op, 6,175/s |
| pubsub-roundtrip | 0.073 ms/op, 13,666/s | 0.060 ms/op, 16,549/s | 0.077 ms/op, 13,064/s |
| blpop-roundtrip | 0.151 ms/op, 6,641/s | 0.135 ms/op, 7,406/s | 0.137 ms/op, 7,277/s |
| scan-full | 0.011 ms/op, 87,393/s | 0.020 ms/op, 49,627/s | 0.020 ms/op, 50,830/s |
| ping-concurrent | 0.032 ms/op, 31,634/s | 0.032 ms/op, 31,594/s | 0.032 ms/op, 31,057/s |
| stream-group | 0.130 ms/op, 7,719/s | 0.116 ms/op, 8,654/s | 0.145 ms/op, 6,900/s |
| ttl-setex-expire | 12.359 ms/op, 81/s | 12.401 ms/op, 81/s | 12.370 ms/op, 81/s |
| multi-exec | 0.087 ms/op, 11,478/s | 0.088 ms/op, 11,343/s | 0.083 ms/op, 12,011/s |
| mget-seq | 0.003 ms/op, 340,948/s | 0.003 ms/op, 290,994/s | 0.004 ms/op, 271,407/s |
| append-getrange | 0.069 ms/op, 14,394/s | 0.061 ms/op, 16,469/s | 0.073 ms/op, 13,701/s |
| getdel-getex | 0.066 ms/op, 15,084/s | 0.073 ms/op, 13,652/s | 0.060 ms/op, 16,656/s |
| set-options | 0.070 ms/op, 14,193/s | 0.052 ms/op, 19,144/s | 0.078 ms/op, 12,878/s |
| exists-type | 0.049 ms/op, 20,322/s | 0.075 ms/op, 13,278/s | 0.053 ms/op, 18,885/s |
| expire-persist | 0.045 ms/op, 22,338/s | 0.048 ms/op, 20,842/s | 0.049 ms/op, 20,355/s |
| hash-hgetall-hdel | 0.010 ms/op, 95,400/s | 0.011 ms/op, 94,503/s | 0.014 ms/op, 71,215/s |
| list-lpush-lpop | 0.067 ms/op, 14,968/s | 0.089 ms/op, 11,216/s | 0.074 ms/op, 13,435/s |
| set-algebra | 0.265 ms/op, 3,769/s | 0.357 ms/op, 2,803/s | 0.304 ms/op, 3,294/s |
| set-membership-ops | 0.351 ms/op, 2,845/s | 0.445 ms/op, 2,245/s | 0.862 ms/op, 1,161/s |
| zset-pop-ops | 0.643 ms/op, 1,554/s | 0.247 ms/op, 4,041/s | 0.454 ms/op, 2,204/s |
| large-collection-read | 1.698 ms/op, 589/s | 1.276 ms/op, 784/s | 1.050 ms/op, 952/s |
| zset-score-ops | 0.137 ms/op, 7,302/s | 0.087 ms/op, 11,485/s | 0.107 ms/op, 9,346/s |
| bitfield-ops | 0.097 ms/op, 10,360/s | 0.094 ms/op, 10,616/s | 0.079 ms/op, 12,619/s |
| hll-ops | 0.053 ms/op, 18,706/s | 0.072 ms/op, 13,885/s | 0.116 ms/op, 8,655/s |
| sort-ops | 0.366 ms/op, 2,730/s | 0.311 ms/op, 3,218/s | 0.244 ms/op, 4,105/s |
| keys-random | 0.855 ms/op, 1,169/s | 0.793 ms/op, 1,261/s | 0.784 ms/op, 1,276/s |
| stream-xread | 1.343 ms/op, 745/s | 2.014 ms/op, 496/s | 2.474 ms/op, 404/s |
| server-face-ops | 0.104 ms/op, 9,651/s | 0.102 ms/op, 9,779/s | 0.101 ms/op, 9,880/s |
| watch-exec | 0.103 ms/op, 9,678/s | 0.082 ms/op, 12,158/s | 0.094 ms/op, 10,585/s |
| set-big | 0.476 ms/op, 2,099/s | 0.432 ms/op, 2,313/s | 0.370 ms/op, 2,699/s |
| get-big | 0.440 ms/op, 2,271/s | 0.437 ms/op, 2,290/s | 0.762 ms/op, 1,312/s |
| del-seq | 0.078 ms/op, 12,896/s | 0.070 ms/op, 14,209/s | 0.099 ms/op, 10,108/s |
| move-seq | 0.137 ms/op, 7,321/s | 0.140 ms/op, 7,133/s | 0.165 ms/op, 6,064/s |
| ping | 0.074 ms/op, 13,511/s | 0.075 ms/op, 13,360/s | 0.092 ms/op, 10,883/s |
| connect | 2.533 ms/op, 395/s | 1.475 ms/op, 678/s | 1.533 ms/op, 652/s |

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
  equal-size batches of 500. All clients use RESP2 on one TCP connection.
- The product harness encodes one pipeline with the batch `encodeCommands`
  primitive and the emulated server decodes and encodes each socket burst with the
  batch `decodeCommands` / `encodeReplies` primitives, so a pipeline crosses the
  binding twice regardless of its length.
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
  from the per-command round trip the `BENCH_COLL` cells measure.

## Machine-readable summary

Harness `BenchReport` wire shape (`database.harness` serde contract: run-level
provenance applies to all rows, row-level `provenance` overrides field by field):

```json
{
  "provenance": {
    "scenario": "redis-vs-js-libraries-matrix",
    "scenario_params": {
      "rounds": "5",
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
      "coll_large": "2000"
    },
    "data_scale": "matrix=46x3",
    "rustc_version": "rustc 1.101.0-nightly (1c3a65069 2026-11-02)",
    "node_version": "v24.18.0",
    "target_triple": "x86_64-pc-windows-msvc",
    "rev": "52965cddd90d3458c6e4813f2af1a05906b9993f",
    "plan": {
      "rounds": 5,
      "warmup": 1
    }
  },
  "rows": [
    {
      "workload": "get-seq@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 41.7954,
        "p95_ms": 62.1838,
        "min_ms": 35.5099,
        "max_ms": 62.1838,
        "rounds": 5
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
        "median_ms": 24.3392,
        "p95_ms": 27.2044,
        "min_ms": 18.1432,
        "max_ms": 27.2044,
        "rounds": 5
      },
      "reference": {
        "median_ms": 41.7954,
        "p95_ms": 62.1838,
        "min_ms": 35.5099,
        "max_ms": 62.1838,
        "rounds": 5
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
        "median_ms": 44.4591,
        "p95_ms": 69.1416,
        "min_ms": 40.989,
        "max_ms": 69.1416,
        "rounds": 5
      },
      "reference": {
        "median_ms": 41.7954,
        "p95_ms": 62.1838,
        "min_ms": 35.5099,
        "max_ms": 62.1838,
        "rounds": 5
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
        "median_ms": 8.2026,
        "p95_ms": 10.231,
        "min_ms": 6.413,
        "max_ms": 10.231,
        "rounds": 5
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
        "median_ms": 5.6346,
        "p95_ms": 8.4251,
        "min_ms": 5.209,
        "max_ms": 8.4251,
        "rounds": 5
      },
      "reference": {
        "median_ms": 8.2026,
        "p95_ms": 10.231,
        "min_ms": 6.413,
        "max_ms": 10.231,
        "rounds": 5
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
        "median_ms": 7.7555,
        "p95_ms": 24.857,
        "min_ms": 6.0913,
        "max_ms": 24.857,
        "rounds": 5
      },
      "reference": {
        "median_ms": 8.2026,
        "p95_ms": 10.231,
        "min_ms": 6.413,
        "max_ms": 10.231,
        "rounds": 5
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
        "median_ms": 3.1785,
        "p95_ms": 4.0226,
        "min_ms": 3.088,
        "max_ms": 4.0226,
        "rounds": 5
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
        "median_ms": 3.6963,
        "p95_ms": 4.4385,
        "min_ms": 3.221,
        "max_ms": 4.4385,
        "rounds": 5
      },
      "reference": {
        "median_ms": 3.1785,
        "p95_ms": 4.0226,
        "min_ms": 3.088,
        "max_ms": 4.0226,
        "rounds": 5
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
        "median_ms": 4.1594,
        "p95_ms": 4.8483,
        "min_ms": 3.4432,
        "max_ms": 4.8483,
        "rounds": 5
      },
      "reference": {
        "median_ms": 3.1785,
        "p95_ms": 4.0226,
        "min_ms": 3.088,
        "max_ms": 4.0226,
        "rounds": 5
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
        "median_ms": 31.3408,
        "p95_ms": 46.3846,
        "min_ms": 22.9273,
        "max_ms": 46.3846,
        "rounds": 5
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
        "median_ms": 22.6003,
        "p95_ms": 24.1658,
        "min_ms": 21.1221,
        "max_ms": 24.1658,
        "rounds": 5
      },
      "reference": {
        "median_ms": 31.3408,
        "p95_ms": 46.3846,
        "min_ms": 22.9273,
        "max_ms": 46.3846,
        "rounds": 5
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
        "median_ms": 30.1726,
        "p95_ms": 31.5942,
        "min_ms": 28.2913,
        "max_ms": 31.5942,
        "rounds": 5
      },
      "reference": {
        "median_ms": 31.3408,
        "p95_ms": 46.3846,
        "min_ms": 22.9273,
        "max_ms": 46.3846,
        "rounds": 5
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
        "median_ms": 14.009,
        "p95_ms": 15.8564,
        "min_ms": 9.9347,
        "max_ms": 15.8564,
        "rounds": 5
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
        "median_ms": 9.5831,
        "p95_ms": 10.2756,
        "min_ms": 8.231,
        "max_ms": 10.2756,
        "rounds": 5
      },
      "reference": {
        "median_ms": 14.009,
        "p95_ms": 15.8564,
        "min_ms": 9.9347,
        "max_ms": 15.8564,
        "rounds": 5
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
        "median_ms": 13.4216,
        "p95_ms": 55.6685,
        "min_ms": 9.5197,
        "max_ms": 55.6685,
        "rounds": 5
      },
      "reference": {
        "median_ms": 14.009,
        "p95_ms": 15.8564,
        "min_ms": 9.9347,
        "max_ms": 15.8564,
        "rounds": 5
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
        "median_ms": 7.3533,
        "p95_ms": 9.9655,
        "min_ms": 6.6777,
        "max_ms": 9.9655,
        "rounds": 5
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
        "median_ms": 8.7053,
        "p95_ms": 10.859,
        "min_ms": 5.4338,
        "max_ms": 10.859,
        "rounds": 5
      },
      "reference": {
        "median_ms": 7.3533,
        "p95_ms": 9.9655,
        "min_ms": 6.6777,
        "max_ms": 9.9655,
        "rounds": 5
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
        "median_ms": 10.9474,
        "p95_ms": 15.8747,
        "min_ms": 10.2262,
        "max_ms": 15.8747,
        "rounds": 5
      },
      "reference": {
        "median_ms": 7.3533,
        "p95_ms": 9.9655,
        "min_ms": 6.6777,
        "max_ms": 9.9655,
        "rounds": 5
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
        "median_ms": 11.4791,
        "p95_ms": 20.1549,
        "min_ms": 8.9466,
        "max_ms": 20.1549,
        "rounds": 5
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
        "median_ms": 10.6061,
        "p95_ms": 12.2047,
        "min_ms": 9.0163,
        "max_ms": 12.2047,
        "rounds": 5
      },
      "reference": {
        "median_ms": 11.4791,
        "p95_ms": 20.1549,
        "min_ms": 8.9466,
        "max_ms": 20.1549,
        "rounds": 5
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
        "median_ms": 24.4839,
        "p95_ms": 25.4022,
        "min_ms": 11.1541,
        "max_ms": 25.4022,
        "rounds": 5
      },
      "reference": {
        "median_ms": 11.4791,
        "p95_ms": 20.1549,
        "min_ms": 8.9466,
        "max_ms": 20.1549,
        "rounds": 5
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
        "median_ms": 42.118,
        "p95_ms": 62.8512,
        "min_ms": 34.0468,
        "max_ms": 62.8512,
        "rounds": 5
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
        "median_ms": 26.852,
        "p95_ms": 45.647,
        "min_ms": 21.761,
        "max_ms": 45.647,
        "rounds": 5
      },
      "reference": {
        "median_ms": 42.118,
        "p95_ms": 62.8512,
        "min_ms": 34.0468,
        "max_ms": 62.8512,
        "rounds": 5
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
        "median_ms": 35.8861,
        "p95_ms": 66.2674,
        "min_ms": 28.0393,
        "max_ms": 66.2674,
        "rounds": 5
      },
      "reference": {
        "median_ms": 42.118,
        "p95_ms": 62.8512,
        "min_ms": 34.0468,
        "max_ms": 62.8512,
        "rounds": 5
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
        "median_ms": 11.6782,
        "p95_ms": 12.9028,
        "min_ms": 10.6246,
        "max_ms": 12.9028,
        "rounds": 5
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
        "median_ms": 11.7979,
        "p95_ms": 13.2237,
        "min_ms": 10.3332,
        "max_ms": 13.2237,
        "rounds": 5
      },
      "reference": {
        "median_ms": 11.6782,
        "p95_ms": 12.9028,
        "min_ms": 10.6246,
        "max_ms": 12.9028,
        "rounds": 5
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
        "median_ms": 13.244,
        "p95_ms": 19.6398,
        "min_ms": 12.6633,
        "max_ms": 19.6398,
        "rounds": 5
      },
      "reference": {
        "median_ms": 11.6782,
        "p95_ms": 12.9028,
        "min_ms": 10.6246,
        "max_ms": 12.9028,
        "rounds": 5
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
        "median_ms": 11.3036,
        "p95_ms": 16.7711,
        "min_ms": 11.003,
        "max_ms": 16.7711,
        "rounds": 5
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
        "median_ms": 18.8774,
        "p95_ms": 26.2436,
        "min_ms": 12.3282,
        "max_ms": 26.2436,
        "rounds": 5
      },
      "reference": {
        "median_ms": 11.3036,
        "p95_ms": 16.7711,
        "min_ms": 11.003,
        "max_ms": 16.7711,
        "rounds": 5
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
        "median_ms": 15.9473,
        "p95_ms": 21.2597,
        "min_ms": 12.6083,
        "max_ms": 21.2597,
        "rounds": 5
      },
      "reference": {
        "median_ms": 11.3036,
        "p95_ms": 16.7711,
        "min_ms": 11.003,
        "max_ms": 16.7711,
        "rounds": 5
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
        "median_ms": 16.8135,
        "p95_ms": 18.3108,
        "min_ms": 13.3983,
        "max_ms": 18.3108,
        "rounds": 5
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
        "median_ms": 9.7436,
        "p95_ms": 10.5392,
        "min_ms": 9.2354,
        "max_ms": 10.5392,
        "rounds": 5
      },
      "reference": {
        "median_ms": 16.8135,
        "p95_ms": 18.3108,
        "min_ms": 13.3983,
        "max_ms": 18.3108,
        "rounds": 5
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
        "median_ms": 11.4733,
        "p95_ms": 13.6089,
        "min_ms": 10.8991,
        "max_ms": 13.6089,
        "rounds": 5
      },
      "reference": {
        "median_ms": 16.8135,
        "p95_ms": 18.3108,
        "min_ms": 13.3983,
        "max_ms": 18.3108,
        "rounds": 5
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
        "median_ms": 13.5802,
        "p95_ms": 14.4647,
        "min_ms": 11.7739,
        "max_ms": 14.4647,
        "rounds": 5
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
        "median_ms": 10.7287,
        "p95_ms": 12.0156,
        "min_ms": 10.3576,
        "max_ms": 12.0156,
        "rounds": 5
      },
      "reference": {
        "median_ms": 13.5802,
        "p95_ms": 14.4647,
        "min_ms": 11.7739,
        "max_ms": 14.4647,
        "rounds": 5
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
        "median_ms": 12.5157,
        "p95_ms": 14.5134,
        "min_ms": 11.2576,
        "max_ms": 14.5134,
        "rounds": 5
      },
      "reference": {
        "median_ms": 13.5802,
        "p95_ms": 14.4647,
        "min_ms": 11.7739,
        "max_ms": 14.4647,
        "rounds": 5
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
        "median_ms": 28.912,
        "p95_ms": 34.9399,
        "min_ms": 25.8598,
        "max_ms": 34.9399,
        "rounds": 5
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
        "median_ms": 28.958,
        "p95_ms": 64.9629,
        "min_ms": 26.4422,
        "max_ms": 64.9629,
        "rounds": 5
      },
      "reference": {
        "median_ms": 28.912,
        "p95_ms": 34.9399,
        "min_ms": 25.8598,
        "max_ms": 34.9399,
        "rounds": 5
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
        "median_ms": 32.7132,
        "p95_ms": 36.5672,
        "min_ms": 27.0332,
        "max_ms": 36.5672,
        "rounds": 5
      },
      "reference": {
        "median_ms": 28.912,
        "p95_ms": 34.9399,
        "min_ms": 25.8598,
        "max_ms": 34.9399,
        "rounds": 5
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
        "median_ms": 7.3172,
        "p95_ms": 7.965,
        "min_ms": 6.9601,
        "max_ms": 7.965,
        "rounds": 5
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
        "median_ms": 6.0428,
        "p95_ms": 7.5365,
        "min_ms": 5.6984,
        "max_ms": 7.5365,
        "rounds": 5
      },
      "reference": {
        "median_ms": 7.3172,
        "p95_ms": 7.965,
        "min_ms": 6.9601,
        "max_ms": 7.965,
        "rounds": 5
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
        "median_ms": 7.6547,
        "p95_ms": 7.9077,
        "min_ms": 6.9296,
        "max_ms": 7.9077,
        "rounds": 5
      },
      "reference": {
        "median_ms": 7.3172,
        "p95_ms": 7.965,
        "min_ms": 6.9601,
        "max_ms": 7.965,
        "rounds": 5
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
        "median_ms": 15.057,
        "p95_ms": 16.2793,
        "min_ms": 13.6845,
        "max_ms": 16.2793,
        "rounds": 5
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
        "median_ms": 13.503,
        "p95_ms": 15.2735,
        "min_ms": 12.4963,
        "max_ms": 15.2735,
        "rounds": 5
      },
      "reference": {
        "median_ms": 15.057,
        "p95_ms": 16.2793,
        "min_ms": 13.6845,
        "max_ms": 16.2793,
        "rounds": 5
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
        "median_ms": 13.7416,
        "p95_ms": 15.5673,
        "min_ms": 13.1218,
        "max_ms": 15.5673,
        "rounds": 5
      },
      "reference": {
        "median_ms": 15.057,
        "p95_ms": 16.2793,
        "min_ms": 13.6845,
        "max_ms": 16.2793,
        "rounds": 5
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
        "median_ms": 2.2885,
        "p95_ms": 2.914,
        "min_ms": 2.0304,
        "max_ms": 2.914,
        "rounds": 5
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
        "median_ms": 4.0301,
        "p95_ms": 4.9167,
        "min_ms": 3.4766,
        "max_ms": 4.9167,
        "rounds": 5
      },
      "reference": {
        "median_ms": 2.2885,
        "p95_ms": 2.914,
        "min_ms": 2.0304,
        "max_ms": 2.914,
        "rounds": 5
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
        "median_ms": 3.9347,
        "p95_ms": 5.3102,
        "min_ms": 2.5453,
        "max_ms": 5.3102,
        "rounds": 5
      },
      "reference": {
        "median_ms": 2.2885,
        "p95_ms": 2.914,
        "min_ms": 2.0304,
        "max_ms": 2.914,
        "rounds": 5
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
        "median_ms": 25.2892,
        "p95_ms": 54.9913,
        "min_ms": 23.2747,
        "max_ms": 54.9913,
        "rounds": 5
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
        "median_ms": 25.3211,
        "p95_ms": 25.8484,
        "min_ms": 24.1907,
        "max_ms": 25.8484,
        "rounds": 5
      },
      "reference": {
        "median_ms": 25.2892,
        "p95_ms": 54.9913,
        "min_ms": 23.2747,
        "max_ms": 54.9913,
        "rounds": 5
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
        "median_ms": 25.7593,
        "p95_ms": 31.5702,
        "min_ms": 23.4025,
        "max_ms": 31.5702,
        "rounds": 5
      },
      "reference": {
        "median_ms": 25.2892,
        "p95_ms": 54.9913,
        "min_ms": 23.2747,
        "max_ms": 54.9913,
        "rounds": 5
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
        "median_ms": 38.8672,
        "p95_ms": 49.039,
        "min_ms": 33.0178,
        "max_ms": 49.039,
        "rounds": 5
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
        "median_ms": 34.668,
        "p95_ms": 36.7174,
        "min_ms": 30.7575,
        "max_ms": 36.7174,
        "rounds": 5
      },
      "reference": {
        "median_ms": 38.8672,
        "p95_ms": 49.039,
        "min_ms": 33.0178,
        "max_ms": 49.039,
        "rounds": 5
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
        "median_ms": 43.4775,
        "p95_ms": 72.8315,
        "min_ms": 35.9708,
        "max_ms": 72.8315,
        "rounds": 5
      },
      "reference": {
        "median_ms": 38.8672,
        "p95_ms": 49.039,
        "min_ms": 33.0178,
        "max_ms": 49.039,
        "rounds": 5
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
        "median_ms": 1112.3451,
        "p95_ms": 1117.3704,
        "min_ms": 1104.146,
        "max_ms": 1117.3704,
        "rounds": 5
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
        "median_ms": 1116.0608,
        "p95_ms": 1121.1135,
        "min_ms": 1106.5815,
        "max_ms": 1121.1135,
        "rounds": 5
      },
      "reference": {
        "median_ms": 1112.3451,
        "p95_ms": 1117.3704,
        "min_ms": 1104.146,
        "max_ms": 1117.3704,
        "rounds": 5
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
        "median_ms": 1113.2739,
        "p95_ms": 1121.6138,
        "min_ms": 1108.8811,
        "max_ms": 1121.6138,
        "rounds": 5
      },
      "reference": {
        "median_ms": 1112.3451,
        "p95_ms": 1117.3704,
        "min_ms": 1104.146,
        "max_ms": 1117.3704,
        "rounds": 5
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
        "median_ms": 8.8865,
        "p95_ms": 16.5093,
        "min_ms": 6.6929,
        "max_ms": 16.5093,
        "rounds": 5
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
        "median_ms": 8.9926,
        "p95_ms": 11.1873,
        "min_ms": 7.9258,
        "max_ms": 11.1873,
        "rounds": 5
      },
      "reference": {
        "median_ms": 8.8865,
        "p95_ms": 16.5093,
        "min_ms": 6.6929,
        "max_ms": 16.5093,
        "rounds": 5
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
        "median_ms": 8.4922,
        "p95_ms": 10.3036,
        "min_ms": 6.851,
        "max_ms": 10.3036,
        "rounds": 5
      },
      "reference": {
        "median_ms": 8.8865,
        "p95_ms": 16.5093,
        "min_ms": 6.6929,
        "max_ms": 16.5093,
        "rounds": 5
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
        "median_ms": 0.5866,
        "p95_ms": 0.6557,
        "min_ms": 0.5337,
        "max_ms": 0.6557,
        "rounds": 5
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
        "median_ms": 0.6873,
        "p95_ms": 0.8703,
        "min_ms": 0.6733,
        "max_ms": 0.8703,
        "rounds": 5
      },
      "reference": {
        "median_ms": 0.5866,
        "p95_ms": 0.6557,
        "min_ms": 0.5337,
        "max_ms": 0.6557,
        "rounds": 5
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
        "median_ms": 0.7369,
        "p95_ms": 1.2507,
        "min_ms": 0.6368,
        "max_ms": 1.2507,
        "rounds": 5
      },
      "reference": {
        "median_ms": 0.5866,
        "p95_ms": 0.6557,
        "min_ms": 0.5337,
        "max_ms": 0.6557,
        "rounds": 5
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
        "median_ms": 13.9646,
        "p95_ms": 20.3838,
        "min_ms": 11.4496,
        "max_ms": 20.3838,
        "rounds": 5
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
        "median_ms": 12.2048,
        "p95_ms": 15.0902,
        "min_ms": 9.0938,
        "max_ms": 15.0902,
        "rounds": 5
      },
      "reference": {
        "median_ms": 13.9646,
        "p95_ms": 20.3838,
        "min_ms": 11.4496,
        "max_ms": 20.3838,
        "rounds": 5
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
        "median_ms": 14.6709,
        "p95_ms": 17.0205,
        "min_ms": 13.7369,
        "max_ms": 17.0205,
        "rounds": 5
      },
      "reference": {
        "median_ms": 13.9646,
        "p95_ms": 20.3838,
        "min_ms": 11.4496,
        "max_ms": 20.3838,
        "rounds": 5
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
        "median_ms": 26.5173,
        "p95_ms": 27.897,
        "min_ms": 21.0804,
        "max_ms": 27.897,
        "rounds": 5
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
        "median_ms": 29.3002,
        "p95_ms": 48.1952,
        "min_ms": 20.4775,
        "max_ms": 48.1952,
        "rounds": 5
      },
      "reference": {
        "median_ms": 26.5173,
        "p95_ms": 27.897,
        "min_ms": 21.0804,
        "max_ms": 27.897,
        "rounds": 5
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
        "median_ms": 24.0154,
        "p95_ms": 28.0313,
        "min_ms": 20.9516,
        "max_ms": 28.0313,
        "rounds": 5
      },
      "reference": {
        "median_ms": 26.5173,
        "p95_ms": 27.897,
        "min_ms": 21.0804,
        "max_ms": 27.897,
        "rounds": 5
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
        "median_ms": 28.1827,
        "p95_ms": 68.6304,
        "min_ms": 21.5591,
        "max_ms": 68.6304,
        "rounds": 5
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
        "median_ms": 20.8938,
        "p95_ms": 25.73,
        "min_ms": 19.7039,
        "max_ms": 25.73,
        "rounds": 5
      },
      "reference": {
        "median_ms": 28.1827,
        "p95_ms": 68.6304,
        "min_ms": 21.5591,
        "max_ms": 68.6304,
        "rounds": 5
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
        "median_ms": 31.0601,
        "p95_ms": 34.4634,
        "min_ms": 22.8784,
        "max_ms": 34.4634,
        "rounds": 5
      },
      "reference": {
        "median_ms": 28.1827,
        "p95_ms": 68.6304,
        "min_ms": 21.5591,
        "max_ms": 68.6304,
        "rounds": 5
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
        "median_ms": 19.6829,
        "p95_ms": 26.1697,
        "min_ms": 17.5988,
        "max_ms": 26.1697,
        "rounds": 5
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
        "median_ms": 30.1255,
        "p95_ms": 37.2014,
        "min_ms": 22.9554,
        "max_ms": 37.2014,
        "rounds": 5
      },
      "reference": {
        "median_ms": 19.6829,
        "p95_ms": 26.1697,
        "min_ms": 17.5988,
        "max_ms": 26.1697,
        "rounds": 5
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
        "median_ms": 21.1811,
        "p95_ms": 30.1036,
        "min_ms": 18.6105,
        "max_ms": 30.1036,
        "rounds": 5
      },
      "reference": {
        "median_ms": 19.6829,
        "p95_ms": 26.1697,
        "min_ms": 17.5988,
        "max_ms": 26.1697,
        "rounds": 5
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
        "median_ms": 26.8604,
        "p95_ms": 29.6576,
        "min_ms": 25.0577,
        "max_ms": 29.6576,
        "rounds": 5
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
        "median_ms": 28.788,
        "p95_ms": 47.0335,
        "min_ms": 24.6061,
        "max_ms": 47.0335,
        "rounds": 5
      },
      "reference": {
        "median_ms": 26.8604,
        "p95_ms": 29.6576,
        "min_ms": 25.0577,
        "max_ms": 29.6576,
        "rounds": 5
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
        "median_ms": 29.4769,
        "p95_ms": 35.7439,
        "min_ms": 28.6981,
        "max_ms": 35.7439,
        "rounds": 5
      },
      "reference": {
        "median_ms": 26.8604,
        "p95_ms": 29.6576,
        "min_ms": 25.0577,
        "max_ms": 29.6576,
        "rounds": 5
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
        "median_ms": 2.1174,
        "p95_ms": 2.8129,
        "min_ms": 1.8236,
        "max_ms": 2.8129,
        "rounds": 5
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
        "median_ms": 2.1375,
        "p95_ms": 2.5536,
        "min_ms": 1.6452,
        "max_ms": 2.5536,
        "rounds": 5
      },
      "reference": {
        "median_ms": 2.1174,
        "p95_ms": 2.8129,
        "min_ms": 1.8236,
        "max_ms": 2.8129,
        "rounds": 5
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
        "median_ms": 2.8365,
        "p95_ms": 20.7363,
        "min_ms": 1.7145,
        "max_ms": 20.7363,
        "rounds": 5
      },
      "reference": {
        "median_ms": 2.1174,
        "p95_ms": 2.8129,
        "min_ms": 1.8236,
        "max_ms": 2.8129,
        "rounds": 5
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
      "workload": "list-lpush-lpop@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 26.7234,
        "p95_ms": 28.763,
        "min_ms": 23.0755,
        "max_ms": 28.763,
        "rounds": 5
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
        "median_ms": 35.6638,
        "p95_ms": 41.7246,
        "min_ms": 29.353,
        "max_ms": 41.7246,
        "rounds": 5
      },
      "reference": {
        "median_ms": 26.7234,
        "p95_ms": 28.763,
        "min_ms": 23.0755,
        "max_ms": 28.763,
        "rounds": 5
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
        "median_ms": 29.7735,
        "p95_ms": 36.8208,
        "min_ms": 27.4257,
        "max_ms": 36.8208,
        "rounds": 5
      },
      "reference": {
        "median_ms": 26.7234,
        "p95_ms": 28.763,
        "min_ms": 23.0755,
        "max_ms": 28.763,
        "rounds": 5
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
        "median_ms": 7.9589,
        "p95_ms": 8.8958,
        "min_ms": 7.0997,
        "max_ms": 8.8958,
        "rounds": 5
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
        "median_ms": 10.7027,
        "p95_ms": 13.3701,
        "min_ms": 7.7069,
        "max_ms": 13.3701,
        "rounds": 5
      },
      "reference": {
        "median_ms": 7.9589,
        "p95_ms": 8.8958,
        "min_ms": 7.0997,
        "max_ms": 8.8958,
        "rounds": 5
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
        "median_ms": 9.1061,
        "p95_ms": 11.724,
        "min_ms": 7.4574,
        "max_ms": 11.724,
        "rounds": 5
      },
      "reference": {
        "median_ms": 7.9589,
        "p95_ms": 8.8958,
        "min_ms": 7.0997,
        "max_ms": 8.8958,
        "rounds": 5
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
        "median_ms": 10.5438,
        "p95_ms": 12.8863,
        "min_ms": 8.0115,
        "max_ms": 12.8863,
        "rounds": 5
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
        "median_ms": 13.3641,
        "p95_ms": 17.5097,
        "min_ms": 11.8748,
        "max_ms": 17.5097,
        "rounds": 5
      },
      "reference": {
        "median_ms": 10.5438,
        "p95_ms": 12.8863,
        "min_ms": 8.0115,
        "max_ms": 12.8863,
        "rounds": 5
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
        "median_ms": 25.8496,
        "p95_ms": 41.4794,
        "min_ms": 15.9245,
        "max_ms": 41.4794,
        "rounds": 5
      },
      "reference": {
        "median_ms": 10.5438,
        "p95_ms": 12.8863,
        "min_ms": 8.0115,
        "max_ms": 12.8863,
        "rounds": 5
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
        "median_ms": 2.5733,
        "p95_ms": 2.7078,
        "min_ms": 1.9257,
        "max_ms": 2.7078,
        "rounds": 5
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
        "median_ms": 0.9898,
        "p95_ms": 1.8775,
        "min_ms": 0.9329,
        "max_ms": 1.8775,
        "rounds": 5
      },
      "reference": {
        "median_ms": 2.5733,
        "p95_ms": 2.7078,
        "min_ms": 1.9257,
        "max_ms": 2.7078,
        "rounds": 5
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
        "median_ms": 1.8151,
        "p95_ms": 45.3361,
        "min_ms": 1.62,
        "max_ms": 45.3361,
        "rounds": 5
      },
      "reference": {
        "median_ms": 2.5733,
        "p95_ms": 2.7078,
        "min_ms": 1.9257,
        "max_ms": 2.7078,
        "rounds": 5
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
      "workload": "large-collection-read@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 33.9521,
        "p95_ms": 36.9401,
        "min_ms": 28.5305,
        "max_ms": 36.9401,
        "rounds": 5
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
        "median_ms": 25.514,
        "p95_ms": 28.6811,
        "min_ms": 21.116,
        "max_ms": 28.6811,
        "rounds": 5
      },
      "reference": {
        "median_ms": 33.9521,
        "p95_ms": 36.9401,
        "min_ms": 28.5305,
        "max_ms": 36.9401,
        "rounds": 5
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
        "median_ms": 20.9975,
        "p95_ms": 23.4676,
        "min_ms": 17.7082,
        "max_ms": 23.4676,
        "rounds": 5
      },
      "reference": {
        "median_ms": 33.9521,
        "p95_ms": 36.9401,
        "min_ms": 28.5305,
        "max_ms": 36.9401,
        "rounds": 5
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
      "workload": "zset-score-ops@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 82.1713,
        "p95_ms": 116.3361,
        "min_ms": 47.6839,
        "max_ms": 116.3361,
        "rounds": 5
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
        "median_ms": 52.2417,
        "p95_ms": 64.466,
        "min_ms": 42.4128,
        "max_ms": 64.466,
        "rounds": 5
      },
      "reference": {
        "median_ms": 82.1713,
        "p95_ms": 116.3361,
        "min_ms": 47.6839,
        "max_ms": 116.3361,
        "rounds": 5
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
        "median_ms": 64.1972,
        "p95_ms": 114.9921,
        "min_ms": 44.6581,
        "max_ms": 114.9921,
        "rounds": 5
      },
      "reference": {
        "median_ms": 82.1713,
        "p95_ms": 116.3361,
        "min_ms": 47.6839,
        "max_ms": 116.3361,
        "rounds": 5
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
        "median_ms": 19.4011,
        "p95_ms": 25.7972,
        "min_ms": 11.5668,
        "max_ms": 25.7972,
        "rounds": 5
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
        "median_ms": 18.9343,
        "p95_ms": 27.7064,
        "min_ms": 12.9245,
        "max_ms": 27.7064,
        "rounds": 5
      },
      "reference": {
        "median_ms": 19.4011,
        "p95_ms": 25.7972,
        "min_ms": 11.5668,
        "max_ms": 25.7972,
        "rounds": 5
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
        "median_ms": 15.9283,
        "p95_ms": 17.7446,
        "min_ms": 11.4532,
        "max_ms": 17.7446,
        "rounds": 5
      },
      "reference": {
        "median_ms": 19.4011,
        "p95_ms": 25.7972,
        "min_ms": 11.5668,
        "max_ms": 25.7972,
        "rounds": 5
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
        "median_ms": 10.745,
        "p95_ms": 14.7284,
        "min_ms": 8.9593,
        "max_ms": 14.7284,
        "rounds": 5
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
        "median_ms": 14.4756,
        "p95_ms": 40.7206,
        "min_ms": 10.0125,
        "max_ms": 40.7206,
        "rounds": 5
      },
      "reference": {
        "median_ms": 10.745,
        "p95_ms": 14.7284,
        "min_ms": 8.9593,
        "max_ms": 14.7284,
        "rounds": 5
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
        "median_ms": 23.2246,
        "p95_ms": 35.621,
        "min_ms": 15.0273,
        "max_ms": 35.621,
        "rounds": 5
      },
      "reference": {
        "median_ms": 10.745,
        "p95_ms": 14.7284,
        "min_ms": 8.9593,
        "max_ms": 14.7284,
        "rounds": 5
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
        "median_ms": 3.6634,
        "p95_ms": 4.0764,
        "min_ms": 3.1501,
        "max_ms": 4.0764,
        "rounds": 5
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
        "median_ms": 3.1073,
        "p95_ms": 3.8108,
        "min_ms": 2.8023,
        "max_ms": 3.8108,
        "rounds": 5
      },
      "reference": {
        "median_ms": 3.6634,
        "p95_ms": 4.0764,
        "min_ms": 3.1501,
        "max_ms": 4.0764,
        "rounds": 5
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
        "median_ms": 2.4359,
        "p95_ms": 3.1194,
        "min_ms": 2.1128,
        "max_ms": 3.1194,
        "rounds": 5
      },
      "reference": {
        "median_ms": 3.6634,
        "p95_ms": 4.0764,
        "min_ms": 3.1501,
        "max_ms": 4.0764,
        "rounds": 5
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
        "median_ms": 25.6527,
        "p95_ms": 27.9177,
        "min_ms": 19.2743,
        "max_ms": 27.9177,
        "rounds": 5
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
        "median_ms": 23.7914,
        "p95_ms": 45.1716,
        "min_ms": 21.3173,
        "max_ms": 45.1716,
        "rounds": 5
      },
      "reference": {
        "median_ms": 25.6527,
        "p95_ms": 27.9177,
        "min_ms": 19.2743,
        "max_ms": 27.9177,
        "rounds": 5
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
        "median_ms": 23.5158,
        "p95_ms": 25.0443,
        "min_ms": 19.5317,
        "max_ms": 25.0443,
        "rounds": 5
      },
      "reference": {
        "median_ms": 25.6527,
        "p95_ms": 27.9177,
        "min_ms": 19.2743,
        "max_ms": 27.9177,
        "rounds": 5
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
        "median_ms": 13.4286,
        "p95_ms": 16.7822,
        "min_ms": 9.6684,
        "max_ms": 16.7822,
        "rounds": 5
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
        "median_ms": 20.1441,
        "p95_ms": 26.3627,
        "min_ms": 18.5444,
        "max_ms": 26.3627,
        "rounds": 5
      },
      "reference": {
        "median_ms": 13.4286,
        "p95_ms": 16.7822,
        "min_ms": 9.6684,
        "max_ms": 16.7822,
        "rounds": 5
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
        "median_ms": 24.7419,
        "p95_ms": 26.8036,
        "min_ms": 15.3678,
        "max_ms": 26.8036,
        "rounds": 5
      },
      "reference": {
        "median_ms": 13.4286,
        "p95_ms": 16.7822,
        "min_ms": 9.6684,
        "max_ms": 16.7822,
        "rounds": 5
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
      "workload": "server-face-ops@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 4.1447,
        "p95_ms": 4.9382,
        "min_ms": 3.1309,
        "max_ms": 4.9382,
        "rounds": 5
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
        "median_ms": 4.0905,
        "p95_ms": 4.3085,
        "min_ms": 2.9962,
        "max_ms": 4.3085,
        "rounds": 5
      },
      "reference": {
        "median_ms": 4.1447,
        "p95_ms": 4.9382,
        "min_ms": 3.1309,
        "max_ms": 4.9382,
        "rounds": 5
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
        "median_ms": 4.0487,
        "p95_ms": 5.0846,
        "min_ms": 3.8665,
        "max_ms": 5.0846,
        "rounds": 5
      },
      "reference": {
        "median_ms": 4.1447,
        "p95_ms": 4.9382,
        "min_ms": 3.1309,
        "max_ms": 4.9382,
        "rounds": 5
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
        "median_ms": 4.133,
        "p95_ms": 4.4827,
        "min_ms": 3.1513,
        "max_ms": 4.4827,
        "rounds": 5
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
        "median_ms": 3.2901,
        "p95_ms": 3.8204,
        "min_ms": 2.1793,
        "max_ms": 3.8204,
        "rounds": 5
      },
      "reference": {
        "median_ms": 4.133,
        "p95_ms": 4.4827,
        "min_ms": 3.1513,
        "max_ms": 4.4827,
        "rounds": 5
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
        "median_ms": 3.7788,
        "p95_ms": 4.9919,
        "min_ms": 2.7499,
        "max_ms": 4.9919,
        "rounds": 5
      },
      "reference": {
        "median_ms": 4.133,
        "p95_ms": 4.4827,
        "min_ms": 3.1513,
        "max_ms": 4.4827,
        "rounds": 5
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
        "median_ms": 9.5294,
        "p95_ms": 22.9269,
        "min_ms": 6.3092,
        "max_ms": 22.9269,
        "rounds": 5
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
        "median_ms": 8.6451,
        "p95_ms": 8.7711,
        "min_ms": 8.155,
        "max_ms": 8.7711,
        "rounds": 5
      },
      "reference": {
        "median_ms": 9.5294,
        "p95_ms": 22.9269,
        "min_ms": 6.3092,
        "max_ms": 22.9269,
        "rounds": 5
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
        "median_ms": 7.4098,
        "p95_ms": 26.5909,
        "min_ms": 6.6365,
        "max_ms": 26.5909,
        "rounds": 5
      },
      "reference": {
        "median_ms": 9.5294,
        "p95_ms": 22.9269,
        "min_ms": 6.3092,
        "max_ms": 22.9269,
        "rounds": 5
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
        "median_ms": 22.0196,
        "p95_ms": 37.013,
        "min_ms": 15.1679,
        "max_ms": 37.013,
        "rounds": 5
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
        "median_ms": 21.8338,
        "p95_ms": 51.4221,
        "min_ms": 12.628,
        "max_ms": 51.4221,
        "rounds": 5
      },
      "reference": {
        "median_ms": 22.0196,
        "p95_ms": 37.013,
        "min_ms": 15.1679,
        "max_ms": 37.013,
        "rounds": 5
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
        "median_ms": 38.1013,
        "p95_ms": 56.2459,
        "min_ms": 19.051,
        "max_ms": 56.2459,
        "rounds": 5
      },
      "reference": {
        "median_ms": 22.0196,
        "p95_ms": 37.013,
        "min_ms": 15.1679,
        "max_ms": 37.013,
        "rounds": 5
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
        "median_ms": 15.5082,
        "p95_ms": 21.1794,
        "min_ms": 14.8808,
        "max_ms": 21.1794,
        "rounds": 5
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
        "median_ms": 14.0752,
        "p95_ms": 16.7861,
        "min_ms": 12.9964,
        "max_ms": 16.7861,
        "rounds": 5
      },
      "reference": {
        "median_ms": 15.5082,
        "p95_ms": 21.1794,
        "min_ms": 14.8808,
        "max_ms": 21.1794,
        "rounds": 5
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
        "median_ms": 19.7871,
        "p95_ms": 31.0949,
        "min_ms": 17.6142,
        "max_ms": 31.0949,
        "rounds": 5
      },
      "reference": {
        "median_ms": 15.5082,
        "p95_ms": 21.1794,
        "min_ms": 14.8808,
        "max_ms": 21.1794,
        "rounds": 5
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
        "median_ms": 27.318,
        "p95_ms": 30.963,
        "min_ms": 25.31,
        "max_ms": 30.963,
        "rounds": 5
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
        "median_ms": 28.0405,
        "p95_ms": 50.0003,
        "min_ms": 25.3153,
        "max_ms": 50.0003,
        "rounds": 5
      },
      "reference": {
        "median_ms": 27.318,
        "p95_ms": 30.963,
        "min_ms": 25.31,
        "max_ms": 30.963,
        "rounds": 5
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
        "median_ms": 32.9799,
        "p95_ms": 37.6459,
        "min_ms": 27.9145,
        "max_ms": 37.6459,
        "rounds": 5
      },
      "reference": {
        "median_ms": 27.318,
        "p95_ms": 30.963,
        "min_ms": 25.31,
        "max_ms": 30.963,
        "rounds": 5
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
        "median_ms": 74.0146,
        "p95_ms": 94.9365,
        "min_ms": 62.735,
        "max_ms": 94.9365,
        "rounds": 5
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
        "median_ms": 74.8515,
        "p95_ms": 85.9207,
        "min_ms": 71.7423,
        "max_ms": 85.9207,
        "rounds": 5
      },
      "reference": {
        "median_ms": 74.0146,
        "p95_ms": 94.9365,
        "min_ms": 62.735,
        "max_ms": 94.9365,
        "rounds": 5
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
        "median_ms": 91.8864,
        "p95_ms": 120.7994,
        "min_ms": 80.6131,
        "max_ms": 120.7994,
        "rounds": 5
      },
      "reference": {
        "median_ms": 74.0146,
        "p95_ms": 94.9365,
        "min_ms": 62.735,
        "max_ms": 94.9365,
        "rounds": 5
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
      "workload": "connect@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 126.6703,
        "p95_ms": 181.2017,
        "min_ms": 88.8036,
        "max_ms": 181.2017,
        "rounds": 5
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
        "median_ms": 73.7615,
        "p95_ms": 117.0024,
        "min_ms": 38.3141,
        "max_ms": 117.0024,
        "rounds": 5
      },
      "reference": {
        "median_ms": 126.6703,
        "p95_ms": 181.2017,
        "min_ms": 88.8036,
        "max_ms": 181.2017,
        "rounds": 5
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
        "median_ms": 76.6294,
        "p95_ms": 91.6092,
        "min_ms": 66.6702,
        "max_ms": 91.6092,
        "rounds": 5
      },
      "reference": {
        "median_ms": 126.6703,
        "p95_ms": 181.2017,
        "min_ms": 88.8036,
        "max_ms": 181.2017,
        "rounds": 5
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
