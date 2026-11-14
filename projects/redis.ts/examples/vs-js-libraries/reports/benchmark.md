# Benchmark report

Command: `pnpm --dir projects/redis.ts/examples/vs-js-libraries benchmark`
Binding: `release` — build with `pnpm build:release` and set `BENCH_BINDING_PROFILE=release` for product numbers
Defaults: `BENCH_SET=100`, `BENCH_GET=500`, `BENCH_PIPE=500`, `BENCH_PING=1000`, `BENCH_BATCH=500`, `BENCH_COLL=200`, `BENCH_BIG=20`, `BENCH_BIG_GET=50`, `BENCH_BIG_BYTES=65536`, `BENCH_CONNECT=50`, `BENCH_STREAM=200`, `BENCH_PUBSUB=100`, `BENCH_TTL=30`, `BENCH_TXN=100`, `BENCH_INCR=500`, `BENCH_MSET=500`, `BENCH_DEL=200`, `BENCH_MOVE=200`, `BENCH_BLOCK=100`, `BENCH_PING_CONC=800`, `BENCH_CONC=8`, `BENCH_GROUP=100`, `BENCH_REPEAT=10`, `BENCH_COLL_LARGE=2000`, `BENCH_SWEEP=500`, `BENCH_SWEEP_TTL_MS=50`, `BENCH_SWEEP_WAIT_MS=200`, `BENCH_FANOUT_SUBS=8`, `BENCH_FANOUT=50`, `BENCH_ROUNDS=5`, `BENCH_WARMUP=1`
Baseline: `ioredis` against the emulated server = `1.00x`
Ratio: subject_time / baseline_time (smaller is faster). Fastest cell in each row is bold.
Stats: median/p95/min/max/rounds come from `database.harness::summarize` via `benchSummary` (addon:harnessBenchSummary + harnessBenchPerOp (database.harness::summarize / per_op_ms)); nearest-rank p95, even-length median averages the middle pair. Per-op milliseconds come from `database.harness::per_op_ms` via `benchPerOpMs`, the same DTO the summary returns. No median, p95 or per-op formula lives in this example.

## Provenance

- `node_version`: `v24.18.0`
- `rustc_version`: `rustc 1.101.0-nightly (1c3a65069 2026-11-02)`
- `target_triple`: `x86_64-pc-windows-msvc`
- `rev`: `23e02c596af9f8dfa343537acf53dae26030a7f1`
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
| get-seq | 1.00x | **0.70x** | 1.28x |
| set-seq | 1.00x | **0.92x** | 1.12x |
| mset-seq | **1.00x** | 1.17x | 1.19x |
| incr-seq | 1.00x | **0.76x** | 0.88x |
| set-pipeline | 1.00x | 0.79x | **0.76x** |
| get-pipeline | 1.00x | **0.90x** | 1.64x |
| pipeline-mixed | 1.00x | **0.74x** | 0.98x |
| hash-hset-hget | **1.00x** | 1.02x | 1.36x |
| hash-setnx-hrandfield | 1.00x | **0.95x** | 1.02x |
| list-rpush-lrange | 1.00x | **0.75x** | 0.92x |
| set-sadd-smembers | 1.00x | **0.72x** | 0.82x |
| zset-zadd-zrange | **1.00x** | 1.07x | 1.06x |
| streams-xadd-xrange | 1.00x | **0.90x** | 0.97x |
| pubsub-roundtrip | 1.00x | **0.77x** | 1.27x |
| blpop-roundtrip | 1.00x | **0.86x** | 1.08x |
| scan-full | **1.00x** | 1.10x | 1.07x |
| ping-concurrent | 1.00x | **0.95x** | 1.22x |
| stream-group | 1.00x | **0.86x** | 1.12x |
| ttl-setex-expire | 1.00x | **1.00x** | 1.01x |
| multi-exec | **1.00x** | 1.08x | 1.38x |
| mget-seq | **1.00x** | 1.70x | 1.68x |
| append-getrange | 1.00x | **0.89x** | 1.40x |
| getdel-getex | **1.00x** | 1.00x | 1.10x |
| set-options | **1.00x** | 1.03x | 1.23x |
| exists-type | **1.00x** | 1.01x | 1.49x |
| expire-persist | 1.00x | **0.94x** | 1.00x |
| hash-hgetall-hdel | 1.00x | 1.22x | **0.85x** |
| list-lpush-lpop | **1.00x** | 1.09x | 1.70x |
| set-algebra | 1.00x | **0.94x** | 1.14x |
| set-membership-ops | 1.00x | **0.89x** | 0.91x |
| zset-pop-ops | **1.00x** | 1.09x | 1.05x |
| large-collection-read | 1.00x | 0.54x | **0.50x** |
| resp3-hello | 1.00x | **0.73x** | 0.92x |
| expire-sweep | **1.00x** | 1.03x | 1.06x |
| multi-exec-mixed | **1.00x** | 1.09x | 1.25x |
| pubsub-fanout | 1.00x | **0.82x** | 0.86x |
| zset-score-ops | 1.00x | **0.94x** | 1.09x |
| bitfield-ops | 1.00x | **0.84x** | 1.07x |
| hll-ops | 1.00x | **0.87x** | 1.35x |
| sort-ops | 1.00x | **0.56x** | 0.99x |
| keys-random | **1.00x** | 1.06x | 1.11x |
| stream-xread | 1.00x | 1.04x | **0.99x** |
| server-face-ops | 1.00x | **0.81x** | 1.12x |
| watch-exec | 1.00x | **0.68x** | 1.20x |
| set-big | **1.00x** | 1.40x | 2.80x |
| get-big | **1.00x** | 1.37x | 2.24x |
| del-seq | **1.00x** | 1.35x | 1.33x |
| move-seq | 1.00x | **0.60x** | 0.77x |
| ping | 1.00x | **0.95x** | 1.10x |
| connect | 1.00x | **0.23x** | 0.57x |

## Median and p95 (ms)

| Workload | ops | ioredis med | ioredis p95 | @yydb/redis med | @yydb/redis p95 | node-redis med | node-redis p95 |
|---------:|----:|-------:|-------:|-------:|-------:|-------:|-------:|
| get-seq | 500 | 63.66 | 71.62 | 44.57 | 54.40 | 81.80 | 89.76 |
| set-seq | 100 | 16.35 | 18.27 | 15.08 | 16.72 | 18.26 | 51.61 |
| mset-seq | 500 | 7.21 | 8.81 | 8.43 | 10.93 | 8.60 | 9.38 |
| incr-seq | 500 | 62.94 | 68.55 | 47.60 | 53.96 | 55.49 | 68.34 |
| set-pipeline | 500 | 20.96 | 28.36 | 16.47 | 20.32 | 15.92 | 87.46 |
| get-pipeline | 500 | 11.64 | 17.26 | 10.47 | 13.20 | 19.15 | 22.89 |
| pipeline-mixed | 500 | 21.41 | 36.52 | 15.75 | 16.85 | 20.93 | 27.62 |
| hash-hset-hget | 401 | 54.42 | 62.60 | 55.55 | 72.35 | 74.20 | 97.00 |
| hash-setnx-hrandfield | 402 | 31.03 | 33.30 | 29.49 | 38.38 | 31.53 | 38.94 |
| list-rpush-lrange | 202 | 30.64 | 48.06 | 23.08 | 25.62 | 28.15 | 48.64 |
| set-sadd-smembers | 202 | 28.83 | 40.02 | 20.75 | 25.89 | 23.55 | 27.38 |
| zset-zadd-zrange | 202 | 27.88 | 30.92 | 29.80 | 34.31 | 29.61 | 32.08 |
| streams-xadd-xrange | 202 | 65.03 | 73.15 | 58.24 | 62.20 | 62.84 | 68.54 |
| pubsub-roundtrip | 100 | 19.09 | 27.96 | 14.73 | 17.28 | 24.19 | 30.41 |
| blpop-roundtrip | 100 | 37.93 | 54.60 | 32.75 | 51.96 | 40.90 | 50.55 |
| scan-full | 200 | 5.39 | 6.34 | 5.92 | 7.84 | 5.77 | 6.69 |
| ping-concurrent | 800 | 62.34 | 68.07 | 59.23 | 59.82 | 76.17 | 77.81 |
| stream-group | 300 | 87.88 | 91.92 | 75.28 | 92.21 | 98.61 | 108.52 |
| ttl-setex-expire | 90 | 1119.60 | 1120.34 | 1117.00 | 1125.80 | 1125.94 | 1131.37 |
| multi-exec | 102 | 9.96 | 16.80 | 10.75 | 14.44 | 13.72 | 19.43 |
| mget-seq | 200 | 0.99 | 3.28 | 1.69 | 2.10 | 1.66 | 2.23 |
| append-getrange | 201 | 23.46 | 47.57 | 20.79 | 20.95 | 32.83 | 41.30 |
| getdel-getex | 400 | 37.67 | 56.37 | 37.73 | 58.73 | 41.43 | 55.96 |
| set-options | 400 | 41.91 | 106.57 | 42.99 | 51.18 | 51.61 | 78.80 |
| exists-type | 400 | 30.45 | 32.59 | 30.64 | 37.37 | 45.29 | 52.62 |
| expire-persist | 600 | 53.60 | 74.99 | 50.54 | 62.33 | 53.68 | 76.72 |
| hash-hgetall-hdel | 202 | 2.49 | 3.13 | 3.03 | 4.33 | 2.11 | 29.40 |
| list-lpush-lpop | 400 | 43.22 | 47.18 | 47.18 | 63.40 | 73.43 | 96.64 |
| set-algebra | 30 | 15.96 | 18.91 | 15.05 | 19.26 | 18.27 | 27.34 |
| set-membership-ops | 30 | 18.33 | 22.54 | 16.24 | 23.86 | 16.76 | 21.00 |
| zset-pop-ops | 4 | 1.87 | 2.37 | 2.04 | 2.47 | 1.97 | 2.52 |
| large-collection-read | 20 | 28.81 | 38.34 | 15.67 | 22.29 | 14.40 | 19.10 |
| resp3-hello | 40 | 5.33 | 9.79 | 3.90 | 4.61 | 4.93 | 8.03 |
| expire-sweep | 1002 | 282.20 | 307.18 | 291.56 | 331.07 | 299.28 | 329.77 |
| multi-exec-mixed | 102 | 11.12 | 12.03 | 12.13 | 15.32 | 13.85 | 16.34 |
| pubsub-fanout | 400 | 29.27 | 44.35 | 23.86 | 26.99 | 25.08 | 28.16 |
| zset-score-ops | 600 | 74.89 | 97.94 | 70.40 | 77.40 | 81.61 | 149.10 |
| bitfield-ops | 201 | 19.94 | 20.44 | 16.81 | 17.04 | 21.44 | 42.89 |
| hll-ops | 201 | 16.11 | 20.26 | 13.96 | 18.17 | 21.69 | 24.07 |
| sort-ops | 10 | 3.53 | 3.78 | 1.97 | 2.27 | 3.49 | 3.69 |
| keys-random | 30 | 38.38 | 43.34 | 40.73 | 84.06 | 42.77 | 70.72 |
| stream-xread | 10 | 24.30 | 26.61 | 25.30 | 27.50 | 24.15 | 29.01 |
| server-face-ops | 40 | 6.95 | 7.88 | 5.64 | 8.76 | 7.77 | 8.17 |
| watch-exec | 40 | 4.75 | 5.97 | 3.21 | 4.06 | 5.70 | 6.13 |
| set-big | 20 | 7.47 | 31.50 | 10.43 | 12.53 | 20.93 | 36.64 |
| get-big | 50 | 34.54 | 85.47 | 47.20 | 81.80 | 77.31 | 109.35 |
| del-seq | 200 | 47.51 | 52.74 | 63.94 | 77.13 | 63.33 | 76.45 |
| move-seq | 200 | 79.90 | 112.78 | 47.63 | 129.28 | 61.74 | 82.39 |
| ping | 1000 | 124.49 | 133.53 | 118.73 | 134.40 | 136.65 | 177.36 |
| connect | 50 | 198.49 | 267.65 | 45.00 | 62.91 | 113.88 | 134.22 |

## Per-op and throughput (median)

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|--------:|--------:|--------:|
| get-seq | 0.127 ms/op, 7,854/s | 0.089 ms/op, 11,218/s | 0.164 ms/op, 6,113/s |
| set-seq | 0.164 ms/op, 6,115/s | 0.151 ms/op, 6,629/s | 0.183 ms/op, 5,477/s |
| mset-seq | 0.014 ms/op, 69,328/s | 0.017 ms/op, 59,296/s | 0.017 ms/op, 58,112/s |
| incr-seq | 0.126 ms/op, 7,943/s | 0.095 ms/op, 10,505/s | 0.111 ms/op, 9,010/s |
| set-pipeline | 0.042 ms/op, 23,858/s | 0.033 ms/op, 30,350/s | 0.032 ms/op, 31,407/s |
| get-pipeline | 0.023 ms/op, 42,938/s | 0.021 ms/op, 47,737/s | 0.038 ms/op, 26,105/s |
| pipeline-mixed | 0.043 ms/op, 23,355/s | 0.031 ms/op, 31,755/s | 0.042 ms/op, 23,889/s |
| hash-hset-hget | 0.136 ms/op, 7,369/s | 0.139 ms/op, 7,219/s | 0.185 ms/op, 5,404/s |
| hash-setnx-hrandfield | 0.077 ms/op, 12,955/s | 0.073 ms/op, 13,631/s | 0.078 ms/op, 12,749/s |
| list-rpush-lrange | 0.152 ms/op, 6,592/s | 0.114 ms/op, 8,751/s | 0.139 ms/op, 7,175/s |
| set-sadd-smembers | 0.143 ms/op, 7,008/s | 0.103 ms/op, 9,736/s | 0.117 ms/op, 8,579/s |
| zset-zadd-zrange | 0.138 ms/op, 7,246/s | 0.148 ms/op, 6,778/s | 0.147 ms/op, 6,823/s |
| streams-xadd-xrange | 0.322 ms/op, 3,106/s | 0.288 ms/op, 3,468/s | 0.311 ms/op, 3,215/s |
| pubsub-roundtrip | 0.191 ms/op, 5,240/s | 0.147 ms/op, 6,790/s | 0.242 ms/op, 4,133/s |
| blpop-roundtrip | 0.379 ms/op, 2,636/s | 0.328 ms/op, 3,053/s | 0.409 ms/op, 2,445/s |
| scan-full | 0.027 ms/op, 37,093/s | 0.030 ms/op, 33,758/s | 0.029 ms/op, 34,653/s |
| ping-concurrent | 0.078 ms/op, 12,833/s | 0.074 ms/op, 13,506/s | 0.095 ms/op, 10,503/s |
| stream-group | 0.293 ms/op, 3,414/s | 0.251 ms/op, 3,985/s | 0.329 ms/op, 3,042/s |
| ttl-setex-expire | 12.440 ms/op, 80/s | 12.411 ms/op, 81/s | 12.510 ms/op, 80/s |
| multi-exec | 0.098 ms/op, 10,237/s | 0.105 ms/op, 9,486/s | 0.135 ms/op, 7,433/s |
| mget-seq | 0.005 ms/op, 201,898/s | 0.008 ms/op, 118,568/s | 0.008 ms/op, 120,402/s |
| append-getrange | 0.117 ms/op, 8,568/s | 0.103 ms/op, 9,666/s | 0.163 ms/op, 6,122/s |
| getdel-getex | 0.094 ms/op, 10,620/s | 0.094 ms/op, 10,601/s | 0.104 ms/op, 9,656/s |
| set-options | 0.105 ms/op, 9,545/s | 0.107 ms/op, 9,304/s | 0.129 ms/op, 7,750/s |
| exists-type | 0.076 ms/op, 13,136/s | 0.077 ms/op, 13,053/s | 0.113 ms/op, 8,832/s |
| expire-persist | 0.089 ms/op, 11,194/s | 0.084 ms/op, 11,871/s | 0.089 ms/op, 11,177/s |
| hash-hgetall-hdel | 0.012 ms/op, 81,239/s | 0.015 ms/op, 66,724/s | 0.010 ms/op, 95,599/s |
| list-lpush-lpop | 0.108 ms/op, 9,254/s | 0.118 ms/op, 8,478/s | 0.184 ms/op, 5,448/s |
| set-algebra | 0.532 ms/op, 1,879/s | 0.502 ms/op, 1,993/s | 0.609 ms/op, 1,642/s |
| set-membership-ops | 0.611 ms/op, 1,637/s | 0.541 ms/op, 1,847/s | 0.559 ms/op, 1,790/s |
| zset-pop-ops | 0.468 ms/op, 2,136/s | 0.509 ms/op, 1,965/s | 0.493 ms/op, 2,026/s |
| large-collection-read | 1.441 ms/op, 694/s | 0.783 ms/op, 1,276/s | 0.720 ms/op, 1,389/s |
| resp3-hello | 0.133 ms/op, 7,498/s | 0.097 ms/op, 10,267/s | 0.123 ms/op, 8,120/s |
| expire-sweep | 0.282 ms/op, 3,551/s | 0.291 ms/op, 3,437/s | 0.299 ms/op, 3,348/s |
| multi-exec-mixed | 0.109 ms/op, 9,171/s | 0.119 ms/op, 8,409/s | 0.136 ms/op, 7,364/s |
| pubsub-fanout | 0.073 ms/op, 13,667/s | 0.060 ms/op, 16,765/s | 0.063 ms/op, 15,951/s |
| zset-score-ops | 0.125 ms/op, 8,012/s | 0.117 ms/op, 8,523/s | 0.136 ms/op, 7,352/s |
| bitfield-ops | 0.099 ms/op, 10,079/s | 0.084 ms/op, 11,954/s | 0.107 ms/op, 9,377/s |
| hll-ops | 0.080 ms/op, 12,476/s | 0.069 ms/op, 14,400/s | 0.108 ms/op, 9,265/s |
| sort-ops | 0.353 ms/op, 2,834/s | 0.197 ms/op, 5,077/s | 0.349 ms/op, 2,862/s |
| keys-random | 1.279 ms/op, 782/s | 1.358 ms/op, 737/s | 1.426 ms/op, 701/s |
| stream-xread | 2.430 ms/op, 412/s | 2.530 ms/op, 395/s | 2.415 ms/op, 414/s |
| server-face-ops | 0.174 ms/op, 5,757/s | 0.141 ms/op, 7,088/s | 0.194 ms/op, 5,145/s |
| watch-exec | 0.119 ms/op, 8,429/s | 0.080 ms/op, 12,449/s | 0.143 ms/op, 7,012/s |
| set-big | 0.373 ms/op, 2,678/s | 0.522 ms/op, 1,917/s | 1.046 ms/op, 956/s |
| get-big | 0.691 ms/op, 1,447/s | 0.944 ms/op, 1,059/s | 1.546 ms/op, 647/s |
| del-seq | 0.238 ms/op, 4,210/s | 0.320 ms/op, 3,128/s | 0.317 ms/op, 3,158/s |
| move-seq | 0.400 ms/op, 2,503/s | 0.238 ms/op, 4,199/s | 0.309 ms/op, 3,239/s |
| ping | 0.124 ms/op, 8,033/s | 0.119 ms/op, 8,423/s | 0.137 ms/op, 7,318/s |
| connect | 3.970 ms/op, 252/s | 0.900 ms/op, 1,111/s | 2.278 ms/op, 439/s |

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
  member. It also parses RESP3 `%` / `~` / `_` / `,` / `>` frames, which is
  what lets `resp3-hello` run on the same adapter. All three columns share the
  emulated server, so a server-side reply improvement moves every client down
  together and only the client-side parser changes the ratio.
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
  It is the only cell that forces RESP3 on `node-redis` and `@yydb/redis`.
- `expire-sweep` writes `BENCH_SWEEP` keys with `SET ... PX`, asserts
  `DBSIZE`, waits `BENCH_SWEEP_WAIT_MS` (above the server's 100ms sweep tick)
  and then asserts `DBSIZE` is zero and every `GET` answers nil. The fixed wait
  is shared by all clients, so the cell verifies the cleanup path rather than
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
      "coll_large": "2000",
      "sweep": "500",
      "sweep_ttl_ms": "50",
      "sweep_wait_ms": "200",
      "fanout_subs": "8",
      "fanout_messages": "50"
    },
    "data_scale": "matrix=50x3",
    "rustc_version": "rustc 1.101.0-nightly (1c3a65069 2026-11-02)",
    "node_version": "v24.18.0",
    "target_triple": "x86_64-pc-windows-msvc",
    "rev": "23e02c596af9f8dfa343537acf53dae26030a7f1",
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
        "median_ms": 63.6641,
        "p95_ms": 71.6214,
        "min_ms": 51.9176,
        "max_ms": 71.6214,
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
        "median_ms": 44.5705,
        "p95_ms": 54.4011,
        "min_ms": 36.9295,
        "max_ms": 54.4011,
        "rounds": 5
      },
      "reference": {
        "median_ms": 63.6641,
        "p95_ms": 71.6214,
        "min_ms": 51.9176,
        "max_ms": 71.6214,
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
        "median_ms": 81.7992,
        "p95_ms": 89.7613,
        "min_ms": 68.4386,
        "max_ms": 89.7613,
        "rounds": 5
      },
      "reference": {
        "median_ms": 63.6641,
        "p95_ms": 71.6214,
        "min_ms": 51.9176,
        "max_ms": 71.6214,
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
        "median_ms": 16.352,
        "p95_ms": 18.2715,
        "min_ms": 13.9324,
        "max_ms": 18.2715,
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
        "median_ms": 15.0842,
        "p95_ms": 16.7156,
        "min_ms": 12.8916,
        "max_ms": 16.7156,
        "rounds": 5
      },
      "reference": {
        "median_ms": 16.352,
        "p95_ms": 18.2715,
        "min_ms": 13.9324,
        "max_ms": 18.2715,
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
        "median_ms": 18.2589,
        "p95_ms": 51.6066,
        "min_ms": 16.6688,
        "max_ms": 51.6066,
        "rounds": 5
      },
      "reference": {
        "median_ms": 16.352,
        "p95_ms": 18.2715,
        "min_ms": 13.9324,
        "max_ms": 18.2715,
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
        "median_ms": 7.2121,
        "p95_ms": 8.8131,
        "min_ms": 6.8077,
        "max_ms": 8.8131,
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
        "median_ms": 8.4323,
        "p95_ms": 10.927,
        "min_ms": 7.3443,
        "max_ms": 10.927,
        "rounds": 5
      },
      "reference": {
        "median_ms": 7.2121,
        "p95_ms": 8.8131,
        "min_ms": 6.8077,
        "max_ms": 8.8131,
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
        "median_ms": 8.6041,
        "p95_ms": 9.3814,
        "min_ms": 6.5295,
        "max_ms": 9.3814,
        "rounds": 5
      },
      "reference": {
        "median_ms": 7.2121,
        "p95_ms": 8.8131,
        "min_ms": 6.8077,
        "max_ms": 8.8131,
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
        "median_ms": 62.9446,
        "p95_ms": 68.5523,
        "min_ms": 53.0204,
        "max_ms": 68.5523,
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
        "median_ms": 47.5985,
        "p95_ms": 53.9557,
        "min_ms": 40.7679,
        "max_ms": 53.9557,
        "rounds": 5
      },
      "reference": {
        "median_ms": 62.9446,
        "p95_ms": 68.5523,
        "min_ms": 53.0204,
        "max_ms": 68.5523,
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
        "median_ms": 55.4916,
        "p95_ms": 68.3396,
        "min_ms": 51.3849,
        "max_ms": 68.3396,
        "rounds": 5
      },
      "reference": {
        "median_ms": 62.9446,
        "p95_ms": 68.5523,
        "min_ms": 53.0204,
        "max_ms": 68.5523,
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
        "median_ms": 20.9572,
        "p95_ms": 28.3568,
        "min_ms": 16.6152,
        "max_ms": 28.3568,
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
        "median_ms": 16.4743,
        "p95_ms": 20.3153,
        "min_ms": 12.8438,
        "max_ms": 20.3153,
        "rounds": 5
      },
      "reference": {
        "median_ms": 20.9572,
        "p95_ms": 28.3568,
        "min_ms": 16.6152,
        "max_ms": 28.3568,
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
        "median_ms": 15.9198,
        "p95_ms": 87.4613,
        "min_ms": 15.3588,
        "max_ms": 87.4613,
        "rounds": 5
      },
      "reference": {
        "median_ms": 20.9572,
        "p95_ms": 28.3568,
        "min_ms": 16.6152,
        "max_ms": 28.3568,
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
        "median_ms": 11.6447,
        "p95_ms": 17.264,
        "min_ms": 10.4623,
        "max_ms": 17.264,
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
        "median_ms": 10.4741,
        "p95_ms": 13.1953,
        "min_ms": 7.0096,
        "max_ms": 13.1953,
        "rounds": 5
      },
      "reference": {
        "median_ms": 11.6447,
        "p95_ms": 17.264,
        "min_ms": 10.4623,
        "max_ms": 17.264,
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
        "median_ms": 19.1536,
        "p95_ms": 22.8878,
        "min_ms": 16.2158,
        "max_ms": 22.8878,
        "rounds": 5
      },
      "reference": {
        "median_ms": 11.6447,
        "p95_ms": 17.264,
        "min_ms": 10.4623,
        "max_ms": 17.264,
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
        "median_ms": 21.4084,
        "p95_ms": 36.5206,
        "min_ms": 20.1628,
        "max_ms": 36.5206,
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
        "median_ms": 15.7456,
        "p95_ms": 16.8454,
        "min_ms": 15.0518,
        "max_ms": 16.8454,
        "rounds": 5
      },
      "reference": {
        "median_ms": 21.4084,
        "p95_ms": 36.5206,
        "min_ms": 20.1628,
        "max_ms": 36.5206,
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
        "median_ms": 20.9298,
        "p95_ms": 27.6181,
        "min_ms": 18.1381,
        "max_ms": 27.6181,
        "rounds": 5
      },
      "reference": {
        "median_ms": 21.4084,
        "p95_ms": 36.5206,
        "min_ms": 20.1628,
        "max_ms": 36.5206,
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
        "median_ms": 54.4198,
        "p95_ms": 62.5992,
        "min_ms": 49.7761,
        "max_ms": 62.5992,
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
        "median_ms": 55.55,
        "p95_ms": 72.3475,
        "min_ms": 46.7119,
        "max_ms": 72.3475,
        "rounds": 5
      },
      "reference": {
        "median_ms": 54.4198,
        "p95_ms": 62.5992,
        "min_ms": 49.7761,
        "max_ms": 62.5992,
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
        "median_ms": 74.199,
        "p95_ms": 97.0033,
        "min_ms": 70.5761,
        "max_ms": 97.0033,
        "rounds": 5
      },
      "reference": {
        "median_ms": 54.4198,
        "p95_ms": 62.5992,
        "min_ms": 49.7761,
        "max_ms": 62.5992,
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
        "median_ms": 31.0304,
        "p95_ms": 33.3026,
        "min_ms": 28.0427,
        "max_ms": 33.3026,
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
        "median_ms": 29.4919,
        "p95_ms": 38.3825,
        "min_ms": 27.1952,
        "max_ms": 38.3825,
        "rounds": 5
      },
      "reference": {
        "median_ms": 31.0304,
        "p95_ms": 33.3026,
        "min_ms": 28.0427,
        "max_ms": 33.3026,
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
        "median_ms": 31.5308,
        "p95_ms": 38.9354,
        "min_ms": 27.3858,
        "max_ms": 38.9354,
        "rounds": 5
      },
      "reference": {
        "median_ms": 31.0304,
        "p95_ms": 33.3026,
        "min_ms": 28.0427,
        "max_ms": 33.3026,
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
        "median_ms": 30.6417,
        "p95_ms": 48.0608,
        "min_ms": 25.5159,
        "max_ms": 48.0608,
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
        "median_ms": 23.0831,
        "p95_ms": 25.6182,
        "min_ms": 21.3523,
        "max_ms": 25.6182,
        "rounds": 5
      },
      "reference": {
        "median_ms": 30.6417,
        "p95_ms": 48.0608,
        "min_ms": 25.5159,
        "max_ms": 48.0608,
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
        "median_ms": 28.1526,
        "p95_ms": 48.6362,
        "min_ms": 20.4207,
        "max_ms": 48.6362,
        "rounds": 5
      },
      "reference": {
        "median_ms": 30.6417,
        "p95_ms": 48.0608,
        "min_ms": 25.5159,
        "max_ms": 48.0608,
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
        "median_ms": 28.8261,
        "p95_ms": 40.0236,
        "min_ms": 25.1445,
        "max_ms": 40.0236,
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
        "median_ms": 20.7468,
        "p95_ms": 25.8895,
        "min_ms": 19.3629,
        "max_ms": 25.8895,
        "rounds": 5
      },
      "reference": {
        "median_ms": 28.8261,
        "p95_ms": 40.0236,
        "min_ms": 25.1445,
        "max_ms": 40.0236,
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
        "median_ms": 23.5461,
        "p95_ms": 27.3844,
        "min_ms": 22.6802,
        "max_ms": 27.3844,
        "rounds": 5
      },
      "reference": {
        "median_ms": 28.8261,
        "p95_ms": 40.0236,
        "min_ms": 25.1445,
        "max_ms": 40.0236,
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
        "median_ms": 27.8784,
        "p95_ms": 30.9158,
        "min_ms": 24.8549,
        "max_ms": 30.9158,
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
        "median_ms": 29.8045,
        "p95_ms": 34.3083,
        "min_ms": 26.1412,
        "max_ms": 34.3083,
        "rounds": 5
      },
      "reference": {
        "median_ms": 27.8784,
        "p95_ms": 30.9158,
        "min_ms": 24.8549,
        "max_ms": 30.9158,
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
        "median_ms": 29.6072,
        "p95_ms": 32.0756,
        "min_ms": 25.9859,
        "max_ms": 32.0756,
        "rounds": 5
      },
      "reference": {
        "median_ms": 27.8784,
        "p95_ms": 30.9158,
        "min_ms": 24.8549,
        "max_ms": 30.9158,
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
        "median_ms": 65.0316,
        "p95_ms": 73.1515,
        "min_ms": 60.9436,
        "max_ms": 73.1515,
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
        "median_ms": 58.2427,
        "p95_ms": 62.2033,
        "min_ms": 54.7217,
        "max_ms": 62.2033,
        "rounds": 5
      },
      "reference": {
        "median_ms": 65.0316,
        "p95_ms": 73.1515,
        "min_ms": 60.9436,
        "max_ms": 73.1515,
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
        "median_ms": 62.84,
        "p95_ms": 68.5426,
        "min_ms": 56.6524,
        "max_ms": 68.5426,
        "rounds": 5
      },
      "reference": {
        "median_ms": 65.0316,
        "p95_ms": 73.1515,
        "min_ms": 60.9436,
        "max_ms": 73.1515,
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
        "median_ms": 19.0857,
        "p95_ms": 27.9632,
        "min_ms": 15.0158,
        "max_ms": 27.9632,
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
        "median_ms": 14.7268,
        "p95_ms": 17.2771,
        "min_ms": 13.2179,
        "max_ms": 17.2771,
        "rounds": 5
      },
      "reference": {
        "median_ms": 19.0857,
        "p95_ms": 27.9632,
        "min_ms": 15.0158,
        "max_ms": 27.9632,
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
        "median_ms": 24.1926,
        "p95_ms": 30.4074,
        "min_ms": 18.0949,
        "max_ms": 30.4074,
        "rounds": 5
      },
      "reference": {
        "median_ms": 19.0857,
        "p95_ms": 27.9632,
        "min_ms": 15.0158,
        "max_ms": 27.9632,
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
        "median_ms": 37.931,
        "p95_ms": 54.602,
        "min_ms": 35.8835,
        "max_ms": 54.602,
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
        "median_ms": 32.7539,
        "p95_ms": 51.9592,
        "min_ms": 32.265,
        "max_ms": 51.9592,
        "rounds": 5
      },
      "reference": {
        "median_ms": 37.931,
        "p95_ms": 54.602,
        "min_ms": 35.8835,
        "max_ms": 54.602,
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
        "median_ms": 40.8977,
        "p95_ms": 50.5452,
        "min_ms": 36.7827,
        "max_ms": 50.5452,
        "rounds": 5
      },
      "reference": {
        "median_ms": 37.931,
        "p95_ms": 54.602,
        "min_ms": 35.8835,
        "max_ms": 54.602,
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
        "median_ms": 5.3918,
        "p95_ms": 6.3365,
        "min_ms": 5.0521,
        "max_ms": 6.3365,
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
        "median_ms": 5.9246,
        "p95_ms": 7.8437,
        "min_ms": 5.3921,
        "max_ms": 7.8437,
        "rounds": 5
      },
      "reference": {
        "median_ms": 5.3918,
        "p95_ms": 6.3365,
        "min_ms": 5.0521,
        "max_ms": 6.3365,
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
        "median_ms": 5.7715,
        "p95_ms": 6.6946,
        "min_ms": 4.5718,
        "max_ms": 6.6946,
        "rounds": 5
      },
      "reference": {
        "median_ms": 5.3918,
        "p95_ms": 6.3365,
        "min_ms": 5.0521,
        "max_ms": 6.3365,
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
        "median_ms": 62.3387,
        "p95_ms": 68.0652,
        "min_ms": 52.7246,
        "max_ms": 68.0652,
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
        "median_ms": 59.2349,
        "p95_ms": 59.8206,
        "min_ms": 54.581,
        "max_ms": 59.8206,
        "rounds": 5
      },
      "reference": {
        "median_ms": 62.3387,
        "p95_ms": 68.0652,
        "min_ms": 52.7246,
        "max_ms": 68.0652,
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
        "median_ms": 76.17,
        "p95_ms": 77.8077,
        "min_ms": 63.9216,
        "max_ms": 77.8077,
        "rounds": 5
      },
      "reference": {
        "median_ms": 62.3387,
        "p95_ms": 68.0652,
        "min_ms": 52.7246,
        "max_ms": 68.0652,
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
        "median_ms": 87.8759,
        "p95_ms": 91.918,
        "min_ms": 76.9782,
        "max_ms": 91.918,
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
        "median_ms": 75.2778,
        "p95_ms": 92.2079,
        "min_ms": 71.7907,
        "max_ms": 92.2079,
        "rounds": 5
      },
      "reference": {
        "median_ms": 87.8759,
        "p95_ms": 91.918,
        "min_ms": 76.9782,
        "max_ms": 91.918,
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
        "median_ms": 98.6069,
        "p95_ms": 108.5193,
        "min_ms": 86.4377,
        "max_ms": 108.5193,
        "rounds": 5
      },
      "reference": {
        "median_ms": 87.8759,
        "p95_ms": 91.918,
        "min_ms": 76.9782,
        "max_ms": 91.918,
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
        "median_ms": 1119.5974,
        "p95_ms": 1120.3423,
        "min_ms": 1111.7109,
        "max_ms": 1120.3423,
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
        "median_ms": 1116.9974,
        "p95_ms": 1125.8048,
        "min_ms": 1108.1797,
        "max_ms": 1125.8048,
        "rounds": 5
      },
      "reference": {
        "median_ms": 1119.5974,
        "p95_ms": 1120.3423,
        "min_ms": 1111.7109,
        "max_ms": 1120.3423,
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
        "median_ms": 1125.9395,
        "p95_ms": 1131.3681,
        "min_ms": 1118.5767,
        "max_ms": 1131.3681,
        "rounds": 5
      },
      "reference": {
        "median_ms": 1119.5974,
        "p95_ms": 1120.3423,
        "min_ms": 1111.7109,
        "max_ms": 1120.3423,
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
        "median_ms": 9.9638,
        "p95_ms": 16.7984,
        "min_ms": 9.2553,
        "max_ms": 16.7984,
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
        "median_ms": 10.7526,
        "p95_ms": 14.4393,
        "min_ms": 9.3408,
        "max_ms": 14.4393,
        "rounds": 5
      },
      "reference": {
        "median_ms": 9.9638,
        "p95_ms": 16.7984,
        "min_ms": 9.2553,
        "max_ms": 16.7984,
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
        "median_ms": 13.7218,
        "p95_ms": 19.4332,
        "min_ms": 10.5573,
        "max_ms": 19.4332,
        "rounds": 5
      },
      "reference": {
        "median_ms": 9.9638,
        "p95_ms": 16.7984,
        "min_ms": 9.2553,
        "max_ms": 16.7984,
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
        "median_ms": 0.9906,
        "p95_ms": 3.2821,
        "min_ms": 0.8544,
        "max_ms": 3.2821,
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
        "median_ms": 1.6868,
        "p95_ms": 2.0985,
        "min_ms": 1.2872,
        "max_ms": 2.0985,
        "rounds": 5
      },
      "reference": {
        "median_ms": 0.9906,
        "p95_ms": 3.2821,
        "min_ms": 0.8544,
        "max_ms": 3.2821,
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
        "median_ms": 1.6611,
        "p95_ms": 2.2269,
        "min_ms": 1.2536,
        "max_ms": 2.2269,
        "rounds": 5
      },
      "reference": {
        "median_ms": 0.9906,
        "p95_ms": 3.2821,
        "min_ms": 0.8544,
        "max_ms": 3.2821,
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
        "median_ms": 23.4597,
        "p95_ms": 47.5668,
        "min_ms": 18.028,
        "max_ms": 47.5668,
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
        "median_ms": 20.7937,
        "p95_ms": 20.9464,
        "min_ms": 18.4356,
        "max_ms": 20.9464,
        "rounds": 5
      },
      "reference": {
        "median_ms": 23.4597,
        "p95_ms": 47.5668,
        "min_ms": 18.028,
        "max_ms": 47.5668,
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
        "median_ms": 32.8332,
        "p95_ms": 41.3049,
        "min_ms": 26.1148,
        "max_ms": 41.3049,
        "rounds": 5
      },
      "reference": {
        "median_ms": 23.4597,
        "p95_ms": 47.5668,
        "min_ms": 18.028,
        "max_ms": 47.5668,
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
        "median_ms": 37.6659,
        "p95_ms": 56.3741,
        "min_ms": 31.7386,
        "max_ms": 56.3741,
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
        "median_ms": 37.7306,
        "p95_ms": 58.7326,
        "min_ms": 31.2346,
        "max_ms": 58.7326,
        "rounds": 5
      },
      "reference": {
        "median_ms": 37.6659,
        "p95_ms": 56.3741,
        "min_ms": 31.7386,
        "max_ms": 56.3741,
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
        "median_ms": 41.4268,
        "p95_ms": 55.9555,
        "min_ms": 33.3214,
        "max_ms": 55.9555,
        "rounds": 5
      },
      "reference": {
        "median_ms": 37.6659,
        "p95_ms": 56.3741,
        "min_ms": 31.7386,
        "max_ms": 56.3741,
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
        "median_ms": 41.9083,
        "p95_ms": 106.5683,
        "min_ms": 39.7507,
        "max_ms": 106.5683,
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
        "median_ms": 42.991,
        "p95_ms": 51.1846,
        "min_ms": 36.5823,
        "max_ms": 51.1846,
        "rounds": 5
      },
      "reference": {
        "median_ms": 41.9083,
        "p95_ms": 106.5683,
        "min_ms": 39.7507,
        "max_ms": 106.5683,
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
        "median_ms": 51.6132,
        "p95_ms": 78.7973,
        "min_ms": 44.4776,
        "max_ms": 78.7973,
        "rounds": 5
      },
      "reference": {
        "median_ms": 41.9083,
        "p95_ms": 106.5683,
        "min_ms": 39.7507,
        "max_ms": 106.5683,
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
        "median_ms": 30.4518,
        "p95_ms": 32.5853,
        "min_ms": 27.2686,
        "max_ms": 32.5853,
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
        "median_ms": 30.6443,
        "p95_ms": 37.3749,
        "min_ms": 29.348,
        "max_ms": 37.3749,
        "rounds": 5
      },
      "reference": {
        "median_ms": 30.4518,
        "p95_ms": 32.5853,
        "min_ms": 27.2686,
        "max_ms": 32.5853,
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
        "median_ms": 45.2881,
        "p95_ms": 52.6182,
        "min_ms": 39.8287,
        "max_ms": 52.6182,
        "rounds": 5
      },
      "reference": {
        "median_ms": 30.4518,
        "p95_ms": 32.5853,
        "min_ms": 27.2686,
        "max_ms": 32.5853,
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
        "median_ms": 53.5998,
        "p95_ms": 74.9946,
        "min_ms": 50.4906,
        "max_ms": 74.9946,
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
        "median_ms": 50.5448,
        "p95_ms": 62.3267,
        "min_ms": 44.0162,
        "max_ms": 62.3267,
        "rounds": 5
      },
      "reference": {
        "median_ms": 53.5998,
        "p95_ms": 74.9946,
        "min_ms": 50.4906,
        "max_ms": 74.9946,
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
        "median_ms": 53.6822,
        "p95_ms": 76.7158,
        "min_ms": 49.9881,
        "max_ms": 76.7158,
        "rounds": 5
      },
      "reference": {
        "median_ms": 53.5998,
        "p95_ms": 74.9946,
        "min_ms": 50.4906,
        "max_ms": 74.9946,
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
        "median_ms": 2.4865,
        "p95_ms": 3.1345,
        "min_ms": 2.1619,
        "max_ms": 3.1345,
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
        "median_ms": 3.0274,
        "p95_ms": 4.3274,
        "min_ms": 2.4451,
        "max_ms": 4.3274,
        "rounds": 5
      },
      "reference": {
        "median_ms": 2.4865,
        "p95_ms": 3.1345,
        "min_ms": 2.1619,
        "max_ms": 3.1345,
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
        "median_ms": 2.113,
        "p95_ms": 29.4015,
        "min_ms": 1.5828,
        "max_ms": 29.4015,
        "rounds": 5
      },
      "reference": {
        "median_ms": 2.4865,
        "p95_ms": 3.1345,
        "min_ms": 2.1619,
        "max_ms": 3.1345,
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
        "median_ms": 43.2246,
        "p95_ms": 47.1796,
        "min_ms": 38.2027,
        "max_ms": 47.1796,
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
        "median_ms": 47.1816,
        "p95_ms": 63.3991,
        "min_ms": 37.3453,
        "max_ms": 63.3991,
        "rounds": 5
      },
      "reference": {
        "median_ms": 43.2246,
        "p95_ms": 47.1796,
        "min_ms": 38.2027,
        "max_ms": 47.1796,
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
        "median_ms": 73.4258,
        "p95_ms": 96.6375,
        "min_ms": 62.2972,
        "max_ms": 96.6375,
        "rounds": 5
      },
      "reference": {
        "median_ms": 43.2246,
        "p95_ms": 47.1796,
        "min_ms": 38.2027,
        "max_ms": 47.1796,
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
        "median_ms": 15.962,
        "p95_ms": 18.9111,
        "min_ms": 13.2196,
        "max_ms": 18.9111,
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
        "median_ms": 15.0494,
        "p95_ms": 19.2611,
        "min_ms": 13.7813,
        "max_ms": 19.2611,
        "rounds": 5
      },
      "reference": {
        "median_ms": 15.962,
        "p95_ms": 18.9111,
        "min_ms": 13.2196,
        "max_ms": 18.9111,
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
        "median_ms": 18.2686,
        "p95_ms": 27.3374,
        "min_ms": 13.4365,
        "max_ms": 27.3374,
        "rounds": 5
      },
      "reference": {
        "median_ms": 15.962,
        "p95_ms": 18.9111,
        "min_ms": 13.2196,
        "max_ms": 18.9111,
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
        "median_ms": 18.3287,
        "p95_ms": 22.5425,
        "min_ms": 15.5285,
        "max_ms": 22.5425,
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
        "median_ms": 16.2422,
        "p95_ms": 23.8625,
        "min_ms": 14.5369,
        "max_ms": 23.8625,
        "rounds": 5
      },
      "reference": {
        "median_ms": 18.3287,
        "p95_ms": 22.5425,
        "min_ms": 15.5285,
        "max_ms": 22.5425,
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
        "median_ms": 16.76,
        "p95_ms": 21.0049,
        "min_ms": 14.2757,
        "max_ms": 21.0049,
        "rounds": 5
      },
      "reference": {
        "median_ms": 18.3287,
        "p95_ms": 22.5425,
        "min_ms": 15.5285,
        "max_ms": 22.5425,
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
        "median_ms": 1.8726,
        "p95_ms": 2.3669,
        "min_ms": 1.7256,
        "max_ms": 2.3669,
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
        "median_ms": 2.0357,
        "p95_ms": 2.472,
        "min_ms": 1.2114,
        "max_ms": 2.472,
        "rounds": 5
      },
      "reference": {
        "median_ms": 1.8726,
        "p95_ms": 2.3669,
        "min_ms": 1.7256,
        "max_ms": 2.3669,
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
        "median_ms": 1.974,
        "p95_ms": 2.5188,
        "min_ms": 1.0789,
        "max_ms": 2.5188,
        "rounds": 5
      },
      "reference": {
        "median_ms": 1.8726,
        "p95_ms": 2.3669,
        "min_ms": 1.7256,
        "max_ms": 2.3669,
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
        "median_ms": 28.8128,
        "p95_ms": 38.3384,
        "min_ms": 26.1392,
        "max_ms": 38.3384,
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
        "median_ms": 15.668,
        "p95_ms": 22.2944,
        "min_ms": 14.4271,
        "max_ms": 22.2944,
        "rounds": 5
      },
      "reference": {
        "median_ms": 28.8128,
        "p95_ms": 38.3384,
        "min_ms": 26.1392,
        "max_ms": 38.3384,
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
        "median_ms": 14.3965,
        "p95_ms": 19.0971,
        "min_ms": 11.3616,
        "max_ms": 19.0971,
        "rounds": 5
      },
      "reference": {
        "median_ms": 28.8128,
        "p95_ms": 38.3384,
        "min_ms": 26.1392,
        "max_ms": 38.3384,
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
      "workload": "resp3-hello@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 5.335,
        "p95_ms": 9.7891,
        "min_ms": 4.1799,
        "max_ms": 9.7891,
        "rounds": 5
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
        "median_ms": 3.896,
        "p95_ms": 4.6145,
        "min_ms": 3.4071,
        "max_ms": 4.6145,
        "rounds": 5
      },
      "reference": {
        "median_ms": 5.335,
        "p95_ms": 9.7891,
        "min_ms": 4.1799,
        "max_ms": 9.7891,
        "rounds": 5
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
        "median_ms": 4.9259,
        "p95_ms": 8.0318,
        "min_ms": 4.2035,
        "max_ms": 8.0318,
        "rounds": 5
      },
      "reference": {
        "median_ms": 5.335,
        "p95_ms": 9.7891,
        "min_ms": 4.1799,
        "max_ms": 9.7891,
        "rounds": 5
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
        "median_ms": 282.2042,
        "p95_ms": 307.1808,
        "min_ms": 266.7097,
        "max_ms": 307.1808,
        "rounds": 5
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
        "median_ms": 291.5624,
        "p95_ms": 331.0724,
        "min_ms": 280.5017,
        "max_ms": 331.0724,
        "rounds": 5
      },
      "reference": {
        "median_ms": 282.2042,
        "p95_ms": 307.1808,
        "min_ms": 266.7097,
        "max_ms": 307.1808,
        "rounds": 5
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
        "median_ms": 299.2833,
        "p95_ms": 329.7721,
        "min_ms": 273.7491,
        "max_ms": 329.7721,
        "rounds": 5
      },
      "reference": {
        "median_ms": 282.2042,
        "p95_ms": 307.1808,
        "min_ms": 266.7097,
        "max_ms": 307.1808,
        "rounds": 5
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
        "median_ms": 11.1226,
        "p95_ms": 12.027,
        "min_ms": 9.6085,
        "max_ms": 12.027,
        "rounds": 5
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
        "median_ms": 12.1305,
        "p95_ms": 15.3161,
        "min_ms": 11.4427,
        "max_ms": 15.3161,
        "rounds": 5
      },
      "reference": {
        "median_ms": 11.1226,
        "p95_ms": 12.027,
        "min_ms": 9.6085,
        "max_ms": 12.027,
        "rounds": 5
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
        "median_ms": 13.8513,
        "p95_ms": 16.3414,
        "min_ms": 11.4228,
        "max_ms": 16.3414,
        "rounds": 5
      },
      "reference": {
        "median_ms": 11.1226,
        "p95_ms": 12.027,
        "min_ms": 9.6085,
        "max_ms": 12.027,
        "rounds": 5
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
        "median_ms": 29.2668,
        "p95_ms": 44.3471,
        "min_ms": 23.8545,
        "max_ms": 44.3471,
        "rounds": 5
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
        "median_ms": 23.8593,
        "p95_ms": 26.986,
        "min_ms": 21.2108,
        "max_ms": 26.986,
        "rounds": 5
      },
      "reference": {
        "median_ms": 29.2668,
        "p95_ms": 44.3471,
        "min_ms": 23.8545,
        "max_ms": 44.3471,
        "rounds": 5
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
        "median_ms": 25.0771,
        "p95_ms": 28.1581,
        "min_ms": 20.0828,
        "max_ms": 28.1581,
        "rounds": 5
      },
      "reference": {
        "median_ms": 29.2668,
        "p95_ms": 44.3471,
        "min_ms": 23.8545,
        "max_ms": 44.3471,
        "rounds": 5
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
        "median_ms": 74.8858,
        "p95_ms": 97.9395,
        "min_ms": 68.272,
        "max_ms": 97.9395,
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
        "median_ms": 70.3974,
        "p95_ms": 77.3978,
        "min_ms": 61.4738,
        "max_ms": 77.3978,
        "rounds": 5
      },
      "reference": {
        "median_ms": 74.8858,
        "p95_ms": 97.9395,
        "min_ms": 68.272,
        "max_ms": 97.9395,
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
        "median_ms": 81.6113,
        "p95_ms": 149.1016,
        "min_ms": 75.2783,
        "max_ms": 149.1016,
        "rounds": 5
      },
      "reference": {
        "median_ms": 74.8858,
        "p95_ms": 97.9395,
        "min_ms": 68.272,
        "max_ms": 97.9395,
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
        "median_ms": 19.9431,
        "p95_ms": 20.4363,
        "min_ms": 17.0531,
        "max_ms": 20.4363,
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
        "median_ms": 16.8138,
        "p95_ms": 17.0399,
        "min_ms": 14.2054,
        "max_ms": 17.0399,
        "rounds": 5
      },
      "reference": {
        "median_ms": 19.9431,
        "p95_ms": 20.4363,
        "min_ms": 17.0531,
        "max_ms": 20.4363,
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
        "median_ms": 21.4361,
        "p95_ms": 42.8875,
        "min_ms": 17.1516,
        "max_ms": 42.8875,
        "rounds": 5
      },
      "reference": {
        "median_ms": 19.9431,
        "p95_ms": 20.4363,
        "min_ms": 17.0531,
        "max_ms": 20.4363,
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
        "median_ms": 16.1103,
        "p95_ms": 20.2595,
        "min_ms": 14.4577,
        "max_ms": 20.2595,
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
        "median_ms": 13.9587,
        "p95_ms": 18.1659,
        "min_ms": 13.1861,
        "max_ms": 18.1659,
        "rounds": 5
      },
      "reference": {
        "median_ms": 16.1103,
        "p95_ms": 20.2595,
        "min_ms": 14.4577,
        "max_ms": 20.2595,
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
        "median_ms": 21.694,
        "p95_ms": 24.0729,
        "min_ms": 18.4275,
        "max_ms": 24.0729,
        "rounds": 5
      },
      "reference": {
        "median_ms": 16.1103,
        "p95_ms": 20.2595,
        "min_ms": 14.4577,
        "max_ms": 20.2595,
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
        "median_ms": 3.5288,
        "p95_ms": 3.7774,
        "min_ms": 3.3118,
        "max_ms": 3.7774,
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
        "median_ms": 1.9696,
        "p95_ms": 2.2746,
        "min_ms": 1.6332,
        "max_ms": 2.2746,
        "rounds": 5
      },
      "reference": {
        "median_ms": 3.5288,
        "p95_ms": 3.7774,
        "min_ms": 3.3118,
        "max_ms": 3.7774,
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
        "median_ms": 3.4941,
        "p95_ms": 3.6873,
        "min_ms": 3.2152,
        "max_ms": 3.6873,
        "rounds": 5
      },
      "reference": {
        "median_ms": 3.5288,
        "p95_ms": 3.7774,
        "min_ms": 3.3118,
        "max_ms": 3.7774,
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
        "median_ms": 38.383,
        "p95_ms": 43.3401,
        "min_ms": 34.5918,
        "max_ms": 43.3401,
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
        "median_ms": 40.7316,
        "p95_ms": 84.057,
        "min_ms": 32.9853,
        "max_ms": 84.057,
        "rounds": 5
      },
      "reference": {
        "median_ms": 38.383,
        "p95_ms": 43.3401,
        "min_ms": 34.5918,
        "max_ms": 43.3401,
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
        "median_ms": 42.7657,
        "p95_ms": 70.7166,
        "min_ms": 40.5866,
        "max_ms": 70.7166,
        "rounds": 5
      },
      "reference": {
        "median_ms": 38.383,
        "p95_ms": 43.3401,
        "min_ms": 34.5918,
        "max_ms": 43.3401,
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
        "median_ms": 24.2973,
        "p95_ms": 26.6082,
        "min_ms": 23.2032,
        "max_ms": 26.6082,
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
        "median_ms": 25.3003,
        "p95_ms": 27.501,
        "min_ms": 23.4827,
        "max_ms": 27.501,
        "rounds": 5
      },
      "reference": {
        "median_ms": 24.2973,
        "p95_ms": 26.6082,
        "min_ms": 23.2032,
        "max_ms": 26.6082,
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
        "median_ms": 24.1459,
        "p95_ms": 29.0062,
        "min_ms": 21.1457,
        "max_ms": 29.0062,
        "rounds": 5
      },
      "reference": {
        "median_ms": 24.2973,
        "p95_ms": 26.6082,
        "min_ms": 23.2032,
        "max_ms": 26.6082,
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
        "median_ms": 6.9482,
        "p95_ms": 7.8803,
        "min_ms": 6.0679,
        "max_ms": 7.8803,
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
        "median_ms": 5.6435,
        "p95_ms": 8.7631,
        "min_ms": 4.7376,
        "max_ms": 8.7631,
        "rounds": 5
      },
      "reference": {
        "median_ms": 6.9482,
        "p95_ms": 7.8803,
        "min_ms": 6.0679,
        "max_ms": 7.8803,
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
        "median_ms": 7.7742,
        "p95_ms": 8.1688,
        "min_ms": 5.5587,
        "max_ms": 8.1688,
        "rounds": 5
      },
      "reference": {
        "median_ms": 6.9482,
        "p95_ms": 7.8803,
        "min_ms": 6.0679,
        "max_ms": 7.8803,
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
        "median_ms": 4.7455,
        "p95_ms": 5.9728,
        "min_ms": 4.2528,
        "max_ms": 5.9728,
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
        "median_ms": 3.213,
        "p95_ms": 4.0649,
        "min_ms": 2.3631,
        "max_ms": 4.0649,
        "rounds": 5
      },
      "reference": {
        "median_ms": 4.7455,
        "p95_ms": 5.9728,
        "min_ms": 4.2528,
        "max_ms": 5.9728,
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
        "median_ms": 5.7046,
        "p95_ms": 6.1334,
        "min_ms": 4.8016,
        "max_ms": 6.1334,
        "rounds": 5
      },
      "reference": {
        "median_ms": 4.7455,
        "p95_ms": 5.9728,
        "min_ms": 4.2528,
        "max_ms": 5.9728,
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
        "median_ms": 7.4685,
        "p95_ms": 31.4983,
        "min_ms": 6.5529,
        "max_ms": 31.4983,
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
        "median_ms": 10.4329,
        "p95_ms": 12.5327,
        "min_ms": 7.6518,
        "max_ms": 12.5327,
        "rounds": 5
      },
      "reference": {
        "median_ms": 7.4685,
        "p95_ms": 31.4983,
        "min_ms": 6.5529,
        "max_ms": 31.4983,
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
        "median_ms": 20.9295,
        "p95_ms": 36.6363,
        "min_ms": 10.0368,
        "max_ms": 36.6363,
        "rounds": 5
      },
      "reference": {
        "median_ms": 7.4685,
        "p95_ms": 31.4983,
        "min_ms": 6.5529,
        "max_ms": 31.4983,
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
        "median_ms": 34.5445,
        "p95_ms": 85.4674,
        "min_ms": 24.0701,
        "max_ms": 85.4674,
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
        "median_ms": 47.2004,
        "p95_ms": 81.8044,
        "min_ms": 23.8343,
        "max_ms": 81.8044,
        "rounds": 5
      },
      "reference": {
        "median_ms": 34.5445,
        "p95_ms": 85.4674,
        "min_ms": 24.0701,
        "max_ms": 85.4674,
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
        "median_ms": 77.3097,
        "p95_ms": 109.3477,
        "min_ms": 42.0332,
        "max_ms": 109.3477,
        "rounds": 5
      },
      "reference": {
        "median_ms": 34.5445,
        "p95_ms": 85.4674,
        "min_ms": 24.0701,
        "max_ms": 85.4674,
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
        "median_ms": 47.5062,
        "p95_ms": 52.7356,
        "min_ms": 33.3841,
        "max_ms": 52.7356,
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
        "median_ms": 63.9411,
        "p95_ms": 77.1255,
        "min_ms": 27.2013,
        "max_ms": 77.1255,
        "rounds": 5
      },
      "reference": {
        "median_ms": 47.5062,
        "p95_ms": 52.7356,
        "min_ms": 33.3841,
        "max_ms": 52.7356,
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
        "median_ms": 63.3259,
        "p95_ms": 76.4524,
        "min_ms": 36.3862,
        "max_ms": 76.4524,
        "rounds": 5
      },
      "reference": {
        "median_ms": 47.5062,
        "p95_ms": 52.7356,
        "min_ms": 33.3841,
        "max_ms": 52.7356,
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
        "median_ms": 79.9023,
        "p95_ms": 112.7819,
        "min_ms": 68.0679,
        "max_ms": 112.7819,
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
        "median_ms": 47.6292,
        "p95_ms": 129.2764,
        "min_ms": 44.0705,
        "max_ms": 129.2764,
        "rounds": 5
      },
      "reference": {
        "median_ms": 79.9023,
        "p95_ms": 112.7819,
        "min_ms": 68.0679,
        "max_ms": 112.7819,
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
        "median_ms": 61.74,
        "p95_ms": 82.395,
        "min_ms": 52.5404,
        "max_ms": 82.395,
        "rounds": 5
      },
      "reference": {
        "median_ms": 79.9023,
        "p95_ms": 112.7819,
        "min_ms": 68.0679,
        "max_ms": 112.7819,
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
        "median_ms": 124.489,
        "p95_ms": 133.5331,
        "min_ms": 100.8961,
        "max_ms": 133.5331,
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
        "median_ms": 118.7259,
        "p95_ms": 134.3966,
        "min_ms": 82.5447,
        "max_ms": 134.3966,
        "rounds": 5
      },
      "reference": {
        "median_ms": 124.489,
        "p95_ms": 133.5331,
        "min_ms": 100.8961,
        "max_ms": 133.5331,
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
        "median_ms": 136.6507,
        "p95_ms": 177.3613,
        "min_ms": 119.3417,
        "max_ms": 177.3613,
        "rounds": 5
      },
      "reference": {
        "median_ms": 124.489,
        "p95_ms": 133.5331,
        "min_ms": 100.8961,
        "max_ms": 133.5331,
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
        "median_ms": 198.4869,
        "p95_ms": 267.6488,
        "min_ms": 131.5515,
        "max_ms": 267.6488,
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
        "median_ms": 44.9984,
        "p95_ms": 62.9105,
        "min_ms": 36.7681,
        "max_ms": 62.9105,
        "rounds": 5
      },
      "reference": {
        "median_ms": 198.4869,
        "p95_ms": 267.6488,
        "min_ms": 131.5515,
        "max_ms": 267.6488,
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
        "median_ms": 113.8781,
        "p95_ms": 134.2241,
        "min_ms": 99.6135,
        "max_ms": 134.2241,
        "rounds": 5
      },
      "reference": {
        "median_ms": 198.4869,
        "p95_ms": 267.6488,
        "min_ms": 131.5515,
        "max_ms": 267.6488,
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
