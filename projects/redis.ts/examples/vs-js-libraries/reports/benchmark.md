# Benchmark report

Command: `pnpm --dir projects/redis.ts/examples/vs-js-libraries benchmark`
Binding: `release` — build with `pnpm build:release` and set `BENCH_BINDING_PROFILE=release` for product numbers
Defaults: `BENCH_SET=100`, `BENCH_GET=500`, `BENCH_PIPE=500`, `BENCH_PING=1000`, `BENCH_BATCH=500`, `BENCH_COLL=200`, `BENCH_BIG=20`, `BENCH_BIG_GET=50`, `BENCH_BIG_BYTES=65536`, `BENCH_CONNECT=50`, `BENCH_STREAM=200`, `BENCH_PUBSUB=100`, `BENCH_TTL=30`, `BENCH_TXN=100`, `BENCH_INCR=500`, `BENCH_MSET=500`, `BENCH_DEL=200`, `BENCH_MOVE=200`, `BENCH_BLOCK=100`, `BENCH_PING_CONC=800`, `BENCH_CONC=8`, `BENCH_GROUP=100`, `BENCH_REPEAT=10`, `BENCH_ROUNDS=5`, `BENCH_WARMUP=1`
Baseline: `ioredis` against the emulated server = `1.00x`
Ratio: subject_time / baseline_time (smaller is faster). Fastest cell in each row is bold.
Stats: median/p95/min/max/rounds come from `database.harness::summarize` via `benchSummary` (addon:harnessBenchSummary + harnessBenchPerOp (database.harness::summarize / per_op_ms)); nearest-rank p95, even-length median averages the middle pair. Per-op milliseconds come from `database.harness::per_op_ms` via `benchPerOpMs`, the same DTO the summary returns. No median, p95 or per-op formula lives in this example.

## Provenance

- `node_version`: `v24.18.0`
- `rustc_version`: `rustc 1.101.0-nightly (1c3a65069 2026-11-02)`
- `target_triple`: `x86_64-pc-windows-msvc`
- `rev`: `fc21e7db6557dbf126348ae6b28fab452665d5bb`
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
| get-seq | 1.00x | **0.93x** | 1.02x |
| set-seq | **1.00x** | 1.14x | 1.03x |
| mset-seq | **1.00x** | 1.07x | 1.10x |
| incr-seq | 1.00x | **0.95x** | 1.02x |
| set-pipeline | 1.00x | **0.98x** | 1.17x |
| get-pipeline | 1.00x | 1.02x | **0.99x** |
| hash-hset-hget | **1.00x** | 1.10x | 1.53x |
| hash-setnx-hrandfield | 1.00x | **0.91x** | 1.00x |
| list-rpush-lrange | 1.00x | 1.01x | **0.98x** |
| set-sadd-smembers | 1.00x | **0.93x** | 1.02x |
| zset-zadd-zrange | 1.00x | **0.91x** | 0.95x |
| streams-xadd-xrange | 1.00x | 1.05x | **0.96x** |
| pubsub-roundtrip | 1.00x | **0.88x** | 0.96x |
| blpop-roundtrip | **1.00x** | 1.10x | 1.05x |
| scan-full | **1.00x** | 1.02x | 1.06x |
| ping-concurrent | **1.00x** | 1.04x | 1.05x |
| stream-group | 1.00x | 0.96x | **0.93x** |
| ttl-setex-expire | 1.00x | 1.00x | **1.00x** |
| multi-exec | 1.00x | **0.96x** | 1.13x |
| mget-seq | **1.00x** | 1.00x | 1.11x |
| append-getrange | 1.00x | **0.99x** | 1.07x |
| getdel-getex | 1.00x | **0.95x** | 1.02x |
| set-options | 1.00x | **0.97x** | 0.99x |
| exists-type | **1.00x** | 1.16x | 1.09x |
| expire-persist | **1.00x** | 1.02x | 1.02x |
| hash-hgetall-hdel | 1.00x | 1.11x | **0.98x** |
| list-lpush-lpop | 1.00x | **0.98x** | 0.98x |
| set-algebra | 1.00x | 0.99x | **0.98x** |
| zset-score-ops | 1.00x | 1.03x | **0.98x** |
| bitfield-ops | 1.00x | **0.99x** | 1.03x |
| hll-ops | 1.00x | **1.00x** | 1.01x |
| sort-ops | **1.00x** | 1.00x | 1.01x |
| keys-random | **1.00x** | 1.00x | 1.00x |
| stream-xread | 1.00x | 0.97x | **0.97x** |
| server-face-ops | 1.00x | **0.99x** | 1.01x |
| watch-exec | 1.00x | **0.97x** | 1.08x |
| set-big | 1.00x | 1.01x | **0.97x** |
| get-big | 1.00x | **1.00x** | 1.00x |
| del-seq | 1.00x | 1.00x | **0.99x** |
| move-seq | 1.00x | 0.92x | **0.92x** |
| ping | **1.00x** | 1.02x | 1.19x |
| connect | 1.00x | **0.14x** | 0.29x |

## Median and p95 (ms)

| Workload | ops | ioredis med | ioredis p95 | @yydb/redis med | @yydb/redis p95 | node-redis med | node-redis p95 |
|---------:|----:|-------:|-------:|-------:|-------:|-------:|-------:|
| get-seq | 500 | 80.14 | 80.42 | 74.85 | 76.57 | 82.14 | 86.98 |
| set-seq | 100 | 74.60 | 107.57 | 85.16 | 90.47 | 76.95 | 93.89 |
| mset-seq | 500 | 7.22 | 7.81 | 7.74 | 7.86 | 7.91 | 8.96 |
| incr-seq | 500 | 58.39 | 73.14 | 55.38 | 57.50 | 59.63 | 61.53 |
| set-pipeline | 500 | 20.27 | 27.35 | 19.87 | 21.49 | 23.68 | 31.60 |
| get-pipeline | 500 | 30.65 | 32.30 | 31.15 | 36.10 | 30.20 | 30.96 |
| hash-hset-hget | 401 | 194.18 | 202.95 | 212.92 | 307.06 | 296.41 | 315.41 |
| hash-setnx-hrandfield | 402 | 215.79 | 529.15 | 196.00 | 206.08 | 216.81 | 231.07 |
| list-rpush-lrange | 202 | 228.59 | 247.11 | 231.19 | 245.98 | 224.93 | 260.10 |
| set-sadd-smembers | 202 | 231.86 | 243.86 | 216.65 | 231.29 | 236.65 | 256.34 |
| zset-zadd-zrange | 202 | 217.22 | 242.37 | 198.32 | 214.44 | 205.82 | 229.94 |
| streams-xadd-xrange | 202 | 165.31 | 179.35 | 173.64 | 183.40 | 158.37 | 170.57 |
| pubsub-roundtrip | 100 | 14.14 | 14.61 | 12.46 | 13.71 | 13.61 | 14.86 |
| blpop-roundtrip | 100 | 77.66 | 83.21 | 85.16 | 89.85 | 81.26 | 86.99 |
| scan-full | 200 | 9.07 | 9.57 | 9.26 | 11.06 | 9.62 | 9.73 |
| ping-concurrent | 800 | 39.87 | 45.72 | 41.59 | 42.06 | 41.75 | 45.40 |
| stream-group | 300 | 231.98 | 249.17 | 222.62 | 229.49 | 216.74 | 227.13 |
| ttl-setex-expire | 90 | 1134.60 | 1137.06 | 1132.57 | 1143.94 | 1130.75 | 1134.33 |
| multi-exec | 102 | 11.73 | 12.89 | 11.21 | 15.00 | 13.28 | 14.41 |
| mget-seq | 200 | 10.22 | 11.59 | 10.26 | 10.65 | 11.34 | 12.14 |
| append-getrange | 201 | 126.91 | 139.14 | 126.10 | 131.54 | 136.08 | 157.61 |
| getdel-getex | 400 | 348.34 | 805.09 | 331.92 | 337.48 | 354.62 | 370.34 |
| set-options | 400 | 346.52 | 369.28 | 337.63 | 358.84 | 342.26 | 348.61 |
| exists-type | 400 | 41.24 | 42.70 | 47.66 | 69.55 | 44.79 | 46.52 |
| expire-persist | 600 | 370.74 | 390.58 | 377.61 | 403.03 | 377.35 | 391.10 |
| hash-hgetall-hdel | 202 | 7.12 | 7.51 | 7.87 | 9.63 | 6.99 | 7.94 |
| list-lpush-lpop | 400 | 269.61 | 283.25 | 263.35 | 269.12 | 263.87 | 287.31 |
| set-algebra | 30 | 71.31 | 72.96 | 70.82 | 73.81 | 69.69 | 71.85 |
| zset-score-ops | 600 | 198.06 | 223.12 | 204.57 | 228.63 | 194.60 | 219.41 |
| bitfield-ops | 201 | 117.52 | 120.77 | 116.85 | 118.56 | 121.16 | 128.04 |
| hll-ops | 201 | 135.59 | 148.72 | 135.05 | 149.11 | 136.52 | 146.41 |
| sort-ops | 10 | 23.38 | 26.32 | 23.42 | 24.17 | 23.68 | 24.90 |
| keys-random | 30 | 47.85 | 48.70 | 48.08 | 49.66 | 48.08 | 52.18 |
| stream-xread | 10 | 30.08 | 31.01 | 29.16 | 31.41 | 29.11 | 31.93 |
| server-face-ops | 40 | 6.99 | 7.53 | 6.89 | 7.59 | 7.05 | 7.94 |
| watch-exec | 40 | 8.07 | 8.91 | 7.83 | 8.75 | 8.72 | 10.61 |
| set-big | 20 | 159.16 | 191.17 | 160.79 | 164.21 | 155.11 | 158.45 |
| get-big | 50 | 375.40 | 397.41 | 374.59 | 379.80 | 376.13 | 395.84 |
| del-seq | 200 | 142.71 | 148.40 | 142.33 | 154.83 | 141.76 | 145.43 |
| move-seq | 200 | 185.64 | 191.45 | 171.59 | 183.24 | 170.82 | 209.25 |
| ping | 1000 | 57.86 | 74.19 | 59.26 | 64.75 | 68.96 | 73.97 |
| connect | 50 | 121.43 | 130.44 | 17.09 | 18.17 | 35.67 | 37.60 |

## Per-op and throughput (median)

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|--------:|--------:|--------:|
| get-seq | 0.160 ms/op, 6,239/s | 0.150 ms/op, 6,680/s | 0.164 ms/op, 6,088/s |
| set-seq | 0.746 ms/op, 1,340/s | 0.852 ms/op, 1,174/s | 0.769 ms/op, 1,300/s |
| mset-seq | 0.014 ms/op, 69,260/s | 0.015 ms/op, 64,610/s | 0.016 ms/op, 63,222/s |
| incr-seq | 0.117 ms/op, 8,563/s | 0.111 ms/op, 9,029/s | 0.119 ms/op, 8,385/s |
| set-pipeline | 0.041 ms/op, 24,673/s | 0.040 ms/op, 25,167/s | 0.047 ms/op, 21,115/s |
| get-pipeline | 0.061 ms/op, 16,314/s | 0.062 ms/op, 16,054/s | 0.060 ms/op, 16,555/s |
| hash-hset-hget | 0.484 ms/op, 2,065/s | 0.531 ms/op, 1,883/s | 0.739 ms/op, 1,353/s |
| hash-setnx-hrandfield | 0.537 ms/op, 1,863/s | 0.488 ms/op, 2,051/s | 0.539 ms/op, 1,854/s |
| list-rpush-lrange | 1.132 ms/op, 884/s | 1.145 ms/op, 874/s | 1.113 ms/op, 898/s |
| set-sadd-smembers | 1.148 ms/op, 871/s | 1.073 ms/op, 932/s | 1.172 ms/op, 854/s |
| zset-zadd-zrange | 1.075 ms/op, 930/s | 0.982 ms/op, 1,019/s | 1.019 ms/op, 981/s |
| streams-xadd-xrange | 0.818 ms/op, 1,222/s | 0.860 ms/op, 1,163/s | 0.784 ms/op, 1,276/s |
| pubsub-roundtrip | 0.141 ms/op, 7,071/s | 0.125 ms/op, 8,023/s | 0.136 ms/op, 7,346/s |
| blpop-roundtrip | 0.777 ms/op, 1,288/s | 0.852 ms/op, 1,174/s | 0.813 ms/op, 1,231/s |
| scan-full | 0.045 ms/op, 22,049/s | 0.046 ms/op, 21,599/s | 0.048 ms/op, 20,800/s |
| ping-concurrent | 0.050 ms/op, 20,065/s | 0.052 ms/op, 19,235/s | 0.052 ms/op, 19,163/s |
| stream-group | 0.773 ms/op, 1,293/s | 0.742 ms/op, 1,348/s | 0.722 ms/op, 1,384/s |
| ttl-setex-expire | 12.607 ms/op, 79/s | 12.584 ms/op, 79/s | 12.564 ms/op, 80/s |
| multi-exec | 0.115 ms/op, 8,699/s | 0.110 ms/op, 9,099/s | 0.130 ms/op, 7,679/s |
| mget-seq | 0.051 ms/op, 19,577/s | 0.051 ms/op, 19,495/s | 0.057 ms/op, 17,642/s |
| append-getrange | 0.631 ms/op, 1,584/s | 0.627 ms/op, 1,594/s | 0.677 ms/op, 1,477/s |
| getdel-getex | 0.871 ms/op, 1,148/s | 0.830 ms/op, 1,205/s | 0.887 ms/op, 1,128/s |
| set-options | 0.866 ms/op, 1,154/s | 0.844 ms/op, 1,185/s | 0.856 ms/op, 1,169/s |
| exists-type | 0.103 ms/op, 9,700/s | 0.119 ms/op, 8,393/s | 0.112 ms/op, 8,930/s |
| expire-persist | 0.618 ms/op, 1,618/s | 0.629 ms/op, 1,589/s | 0.629 ms/op, 1,590/s |
| hash-hgetall-hdel | 0.035 ms/op, 28,377/s | 0.039 ms/op, 25,664/s | 0.035 ms/op, 28,908/s |
| list-lpush-lpop | 0.674 ms/op, 1,484/s | 0.658 ms/op, 1,519/s | 0.660 ms/op, 1,516/s |
| set-algebra | 2.377 ms/op, 421/s | 2.361 ms/op, 424/s | 2.323 ms/op, 430/s |
| zset-score-ops | 0.330 ms/op, 3,029/s | 0.341 ms/op, 2,933/s | 0.324 ms/op, 3,083/s |
| bitfield-ops | 0.585 ms/op, 1,710/s | 0.581 ms/op, 1,720/s | 0.603 ms/op, 1,659/s |
| hll-ops | 0.675 ms/op, 1,482/s | 0.672 ms/op, 1,488/s | 0.679 ms/op, 1,472/s |
| sort-ops | 2.338 ms/op, 428/s | 2.342 ms/op, 427/s | 2.368 ms/op, 422/s |
| keys-random | 1.595 ms/op, 627/s | 1.603 ms/op, 624/s | 1.603 ms/op, 624/s |
| stream-xread | 3.008 ms/op, 332/s | 2.916 ms/op, 343/s | 2.911 ms/op, 344/s |
| server-face-ops | 0.175 ms/op, 5,721/s | 0.172 ms/op, 5,807/s | 0.176 ms/op, 5,670/s |
| watch-exec | 0.202 ms/op, 4,954/s | 0.196 ms/op, 5,110/s | 0.218 ms/op, 4,586/s |
| set-big | 7.958 ms/op, 126/s | 8.039 ms/op, 124/s | 7.756 ms/op, 129/s |
| get-big | 7.508 ms/op, 133/s | 7.492 ms/op, 133/s | 7.523 ms/op, 133/s |
| del-seq | 0.714 ms/op, 1,401/s | 0.712 ms/op, 1,405/s | 0.709 ms/op, 1,411/s |
| move-seq | 0.928 ms/op, 1,077/s | 0.858 ms/op, 1,166/s | 0.854 ms/op, 1,171/s |
| ping | 0.058 ms/op, 17,283/s | 0.059 ms/op, 16,874/s | 0.069 ms/op, 14,502/s |
| connect | 2.429 ms/op, 412/s | 0.342 ms/op, 2,925/s | 0.713 ms/op, 1,402/s |

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
- `SET` rewrites the whole `.yykv` snapshot, so absolute `SET` numbers (including
  `set-big`) are snapshot-bound; `GET`, `ping` and the collection reads isolate
  round-trip overhead.
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
      "repeat": "10"
    },
    "data_scale": "matrix=42x3",
    "rustc_version": "rustc 1.101.0-nightly (1c3a65069 2026-11-02)",
    "node_version": "v24.18.0",
    "target_triple": "x86_64-pc-windows-msvc",
    "rev": "fc21e7db6557dbf126348ae6b28fab452665d5bb",
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
        "median_ms": 80.14,
        "p95_ms": 80.4178,
        "min_ms": 75.6182,
        "max_ms": 80.4178,
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
        "median_ms": 74.8483,
        "p95_ms": 76.5659,
        "min_ms": 72.4989,
        "max_ms": 76.5659,
        "rounds": 5
      },
      "reference": {
        "median_ms": 80.14,
        "p95_ms": 80.4178,
        "min_ms": 75.6182,
        "max_ms": 80.4178,
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
        "median_ms": 82.1352,
        "p95_ms": 86.9831,
        "min_ms": 80.5651,
        "max_ms": 86.9831,
        "rounds": 5
      },
      "reference": {
        "median_ms": 80.14,
        "p95_ms": 80.4178,
        "min_ms": 75.6182,
        "max_ms": 80.4178,
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
        "median_ms": 74.5997,
        "p95_ms": 107.5707,
        "min_ms": 69.8122,
        "max_ms": 107.5707,
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
        "median_ms": 85.1597,
        "p95_ms": 90.4709,
        "min_ms": 70.4029,
        "max_ms": 90.4709,
        "rounds": 5
      },
      "reference": {
        "median_ms": 74.5997,
        "p95_ms": 107.5707,
        "min_ms": 69.8122,
        "max_ms": 107.5707,
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
        "median_ms": 76.9472,
        "p95_ms": 93.8884,
        "min_ms": 67.7727,
        "max_ms": 93.8884,
        "rounds": 5
      },
      "reference": {
        "median_ms": 74.5997,
        "p95_ms": 107.5707,
        "min_ms": 69.8122,
        "max_ms": 107.5707,
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
        "median_ms": 7.2192,
        "p95_ms": 7.8077,
        "min_ms": 7.1061,
        "max_ms": 7.8077,
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
        "median_ms": 7.7387,
        "p95_ms": 7.8557,
        "min_ms": 7.57,
        "max_ms": 7.8557,
        "rounds": 5
      },
      "reference": {
        "median_ms": 7.2192,
        "p95_ms": 7.8077,
        "min_ms": 7.1061,
        "max_ms": 7.8077,
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
        "median_ms": 7.9087,
        "p95_ms": 8.9648,
        "min_ms": 7.251,
        "max_ms": 8.9648,
        "rounds": 5
      },
      "reference": {
        "median_ms": 7.2192,
        "p95_ms": 7.8077,
        "min_ms": 7.1061,
        "max_ms": 7.8077,
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
        "median_ms": 58.39,
        "p95_ms": 73.135,
        "min_ms": 57.7708,
        "max_ms": 73.135,
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
        "median_ms": 55.3801,
        "p95_ms": 57.4994,
        "min_ms": 54.2498,
        "max_ms": 57.4994,
        "rounds": 5
      },
      "reference": {
        "median_ms": 58.39,
        "p95_ms": 73.135,
        "min_ms": 57.7708,
        "max_ms": 73.135,
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
        "median_ms": 59.6315,
        "p95_ms": 61.5269,
        "min_ms": 57.6954,
        "max_ms": 61.5269,
        "rounds": 5
      },
      "reference": {
        "median_ms": 58.39,
        "p95_ms": 73.135,
        "min_ms": 57.7708,
        "max_ms": 73.135,
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
        "median_ms": 20.2652,
        "p95_ms": 27.3525,
        "min_ms": 16.7656,
        "max_ms": 27.3525,
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
        "median_ms": 19.8672,
        "p95_ms": 21.4897,
        "min_ms": 19.5291,
        "max_ms": 21.4897,
        "rounds": 5
      },
      "reference": {
        "median_ms": 20.2652,
        "p95_ms": 27.3525,
        "min_ms": 16.7656,
        "max_ms": 27.3525,
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
        "median_ms": 23.6803,
        "p95_ms": 31.6012,
        "min_ms": 20.8668,
        "max_ms": 31.6012,
        "rounds": 5
      },
      "reference": {
        "median_ms": 20.2652,
        "p95_ms": 27.3525,
        "min_ms": 16.7656,
        "max_ms": 27.3525,
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
        "median_ms": 30.6481,
        "p95_ms": 32.3009,
        "min_ms": 26.6335,
        "max_ms": 32.3009,
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
        "median_ms": 31.1458,
        "p95_ms": 36.1006,
        "min_ms": 29.127,
        "max_ms": 36.1006,
        "rounds": 5
      },
      "reference": {
        "median_ms": 30.6481,
        "p95_ms": 32.3009,
        "min_ms": 26.6335,
        "max_ms": 32.3009,
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
        "median_ms": 30.2027,
        "p95_ms": 30.9638,
        "min_ms": 29.2397,
        "max_ms": 30.9638,
        "rounds": 5
      },
      "reference": {
        "median_ms": 30.6481,
        "p95_ms": 32.3009,
        "min_ms": 26.6335,
        "max_ms": 32.3009,
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
      "workload": "hash-hset-hget@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 194.1784,
        "p95_ms": 202.9493,
        "min_ms": 167.0874,
        "max_ms": 202.9493,
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
        "median_ms": 212.9179,
        "p95_ms": 307.0589,
        "min_ms": 195.4988,
        "max_ms": 307.0589,
        "rounds": 5
      },
      "reference": {
        "median_ms": 194.1784,
        "p95_ms": 202.9493,
        "min_ms": 167.0874,
        "max_ms": 202.9493,
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
        "median_ms": 296.4123,
        "p95_ms": 315.4107,
        "min_ms": 281.9878,
        "max_ms": 315.4107,
        "rounds": 5
      },
      "reference": {
        "median_ms": 194.1784,
        "p95_ms": 202.9493,
        "min_ms": 167.0874,
        "max_ms": 202.9493,
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
        "median_ms": 215.7905,
        "p95_ms": 529.1546,
        "min_ms": 185.0403,
        "max_ms": 529.1546,
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
        "median_ms": 196.0003,
        "p95_ms": 206.0798,
        "min_ms": 182.5109,
        "max_ms": 206.0798,
        "rounds": 5
      },
      "reference": {
        "median_ms": 215.7905,
        "p95_ms": 529.1546,
        "min_ms": 185.0403,
        "max_ms": 529.1546,
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
        "median_ms": 216.8147,
        "p95_ms": 231.0744,
        "min_ms": 196.7499,
        "max_ms": 231.0744,
        "rounds": 5
      },
      "reference": {
        "median_ms": 215.7905,
        "p95_ms": 529.1546,
        "min_ms": 185.0403,
        "max_ms": 529.1546,
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
        "median_ms": 228.5883,
        "p95_ms": 247.1143,
        "min_ms": 139.5992,
        "max_ms": 247.1143,
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
        "median_ms": 231.1918,
        "p95_ms": 245.9828,
        "min_ms": 210.6121,
        "max_ms": 245.9828,
        "rounds": 5
      },
      "reference": {
        "median_ms": 228.5883,
        "p95_ms": 247.1143,
        "min_ms": 139.5992,
        "max_ms": 247.1143,
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
        "median_ms": 224.9262,
        "p95_ms": 260.1019,
        "min_ms": 218.0498,
        "max_ms": 260.1019,
        "rounds": 5
      },
      "reference": {
        "median_ms": 228.5883,
        "p95_ms": 247.1143,
        "min_ms": 139.5992,
        "max_ms": 247.1143,
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
        "median_ms": 231.8585,
        "p95_ms": 243.8581,
        "min_ms": 191.2439,
        "max_ms": 243.8581,
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
        "median_ms": 216.648,
        "p95_ms": 231.2891,
        "min_ms": 197.2003,
        "max_ms": 231.2891,
        "rounds": 5
      },
      "reference": {
        "median_ms": 231.8585,
        "p95_ms": 243.8581,
        "min_ms": 191.2439,
        "max_ms": 243.8581,
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
        "median_ms": 236.6527,
        "p95_ms": 256.3389,
        "min_ms": 217.8094,
        "max_ms": 256.3389,
        "rounds": 5
      },
      "reference": {
        "median_ms": 231.8585,
        "p95_ms": 243.8581,
        "min_ms": 191.2439,
        "max_ms": 243.8581,
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
        "median_ms": 217.2249,
        "p95_ms": 242.3738,
        "min_ms": 207.8724,
        "max_ms": 242.3738,
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
        "median_ms": 198.3185,
        "p95_ms": 214.4379,
        "min_ms": 178.7734,
        "max_ms": 214.4379,
        "rounds": 5
      },
      "reference": {
        "median_ms": 217.2249,
        "p95_ms": 242.3738,
        "min_ms": 207.8724,
        "max_ms": 242.3738,
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
        "median_ms": 205.8191,
        "p95_ms": 229.945,
        "min_ms": 165.5619,
        "max_ms": 229.945,
        "rounds": 5
      },
      "reference": {
        "median_ms": 217.2249,
        "p95_ms": 242.3738,
        "min_ms": 207.8724,
        "max_ms": 242.3738,
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
        "median_ms": 165.3115,
        "p95_ms": 179.3526,
        "min_ms": 155.1471,
        "max_ms": 179.3526,
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
        "median_ms": 173.6401,
        "p95_ms": 183.3959,
        "min_ms": 161.1406,
        "max_ms": 183.3959,
        "rounds": 5
      },
      "reference": {
        "median_ms": 165.3115,
        "p95_ms": 179.3526,
        "min_ms": 155.1471,
        "max_ms": 179.3526,
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
        "median_ms": 158.368,
        "p95_ms": 170.574,
        "min_ms": 157.1745,
        "max_ms": 170.574,
        "rounds": 5
      },
      "reference": {
        "median_ms": 165.3115,
        "p95_ms": 179.3526,
        "min_ms": 155.1471,
        "max_ms": 179.3526,
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
        "median_ms": 14.1422,
        "p95_ms": 14.6092,
        "min_ms": 12.8082,
        "max_ms": 14.6092,
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
        "median_ms": 12.4645,
        "p95_ms": 13.7066,
        "min_ms": 12.0877,
        "max_ms": 13.7066,
        "rounds": 5
      },
      "reference": {
        "median_ms": 14.1422,
        "p95_ms": 14.6092,
        "min_ms": 12.8082,
        "max_ms": 14.6092,
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
        "median_ms": 13.6131,
        "p95_ms": 14.8624,
        "min_ms": 13.0239,
        "max_ms": 14.8624,
        "rounds": 5
      },
      "reference": {
        "median_ms": 14.1422,
        "p95_ms": 14.6092,
        "min_ms": 12.8082,
        "max_ms": 14.6092,
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
        "median_ms": 77.6646,
        "p95_ms": 83.2058,
        "min_ms": 74.7169,
        "max_ms": 83.2058,
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
        "median_ms": 85.1554,
        "p95_ms": 89.8477,
        "min_ms": 79.3905,
        "max_ms": 89.8477,
        "rounds": 5
      },
      "reference": {
        "median_ms": 77.6646,
        "p95_ms": 83.2058,
        "min_ms": 74.7169,
        "max_ms": 83.2058,
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
        "median_ms": 81.2555,
        "p95_ms": 86.9885,
        "min_ms": 76.941,
        "max_ms": 86.9885,
        "rounds": 5
      },
      "reference": {
        "median_ms": 77.6646,
        "p95_ms": 83.2058,
        "min_ms": 74.7169,
        "max_ms": 83.2058,
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
        "median_ms": 9.0707,
        "p95_ms": 9.5654,
        "min_ms": 8.8834,
        "max_ms": 9.5654,
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
        "median_ms": 9.2596,
        "p95_ms": 11.0637,
        "min_ms": 9.1266,
        "max_ms": 11.0637,
        "rounds": 5
      },
      "reference": {
        "median_ms": 9.0707,
        "p95_ms": 9.5654,
        "min_ms": 8.8834,
        "max_ms": 9.5654,
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
        "median_ms": 9.6154,
        "p95_ms": 9.7314,
        "min_ms": 8.7434,
        "max_ms": 9.7314,
        "rounds": 5
      },
      "reference": {
        "median_ms": 9.0707,
        "p95_ms": 9.5654,
        "min_ms": 8.8834,
        "max_ms": 9.5654,
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
        "median_ms": 39.8698,
        "p95_ms": 45.7196,
        "min_ms": 36.095,
        "max_ms": 45.7196,
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
        "median_ms": 41.5898,
        "p95_ms": 42.0569,
        "min_ms": 41.2855,
        "max_ms": 42.0569,
        "rounds": 5
      },
      "reference": {
        "median_ms": 39.8698,
        "p95_ms": 45.7196,
        "min_ms": 36.095,
        "max_ms": 45.7196,
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
        "median_ms": 41.7479,
        "p95_ms": 45.3962,
        "min_ms": 38.8871,
        "max_ms": 45.3962,
        "rounds": 5
      },
      "reference": {
        "median_ms": 39.8698,
        "p95_ms": 45.7196,
        "min_ms": 36.095,
        "max_ms": 45.7196,
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
        "median_ms": 231.9753,
        "p95_ms": 249.1695,
        "min_ms": 218.3418,
        "max_ms": 249.1695,
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
        "median_ms": 222.6209,
        "p95_ms": 229.4865,
        "min_ms": 208.1625,
        "max_ms": 229.4865,
        "rounds": 5
      },
      "reference": {
        "median_ms": 231.9753,
        "p95_ms": 249.1695,
        "min_ms": 218.3418,
        "max_ms": 249.1695,
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
        "median_ms": 216.7387,
        "p95_ms": 227.1265,
        "min_ms": 214.3886,
        "max_ms": 227.1265,
        "rounds": 5
      },
      "reference": {
        "median_ms": 231.9753,
        "p95_ms": 249.1695,
        "min_ms": 218.3418,
        "max_ms": 249.1695,
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
        "median_ms": 1134.6023,
        "p95_ms": 1137.0556,
        "min_ms": 1126.3036,
        "max_ms": 1137.0556,
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
        "median_ms": 1132.5688,
        "p95_ms": 1143.9399,
        "min_ms": 1127.42,
        "max_ms": 1143.9399,
        "rounds": 5
      },
      "reference": {
        "median_ms": 1134.6023,
        "p95_ms": 1137.0556,
        "min_ms": 1126.3036,
        "max_ms": 1137.0556,
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
        "median_ms": 1130.7492,
        "p95_ms": 1134.3328,
        "min_ms": 1128.5397,
        "max_ms": 1134.3328,
        "rounds": 5
      },
      "reference": {
        "median_ms": 1134.6023,
        "p95_ms": 1137.0556,
        "min_ms": 1126.3036,
        "max_ms": 1137.0556,
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
        "median_ms": 11.7256,
        "p95_ms": 12.888,
        "min_ms": 11.5094,
        "max_ms": 12.888,
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
        "median_ms": 11.2095,
        "p95_ms": 14.9986,
        "min_ms": 10.8911,
        "max_ms": 14.9986,
        "rounds": 5
      },
      "reference": {
        "median_ms": 11.7256,
        "p95_ms": 12.888,
        "min_ms": 11.5094,
        "max_ms": 12.888,
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
        "median_ms": 13.2826,
        "p95_ms": 14.4052,
        "min_ms": 12.484,
        "max_ms": 14.4052,
        "rounds": 5
      },
      "reference": {
        "median_ms": 11.7256,
        "p95_ms": 12.888,
        "min_ms": 11.5094,
        "max_ms": 12.888,
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
        "median_ms": 10.2162,
        "p95_ms": 11.5857,
        "min_ms": 10.1794,
        "max_ms": 11.5857,
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
        "median_ms": 10.2593,
        "p95_ms": 10.6488,
        "min_ms": 9.7613,
        "max_ms": 10.6488,
        "rounds": 5
      },
      "reference": {
        "median_ms": 10.2162,
        "p95_ms": 11.5857,
        "min_ms": 10.1794,
        "max_ms": 11.5857,
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
        "median_ms": 11.3368,
        "p95_ms": 12.1436,
        "min_ms": 10.632,
        "max_ms": 12.1436,
        "rounds": 5
      },
      "reference": {
        "median_ms": 10.2162,
        "p95_ms": 11.5857,
        "min_ms": 10.1794,
        "max_ms": 11.5857,
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
        "median_ms": 126.9089,
        "p95_ms": 139.1399,
        "min_ms": 121.381,
        "max_ms": 139.1399,
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
        "median_ms": 126.1038,
        "p95_ms": 131.5431,
        "min_ms": 120.4973,
        "max_ms": 131.5431,
        "rounds": 5
      },
      "reference": {
        "median_ms": 126.9089,
        "p95_ms": 139.1399,
        "min_ms": 121.381,
        "max_ms": 139.1399,
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
        "median_ms": 136.0828,
        "p95_ms": 157.6071,
        "min_ms": 128.3464,
        "max_ms": 157.6071,
        "rounds": 5
      },
      "reference": {
        "median_ms": 126.9089,
        "p95_ms": 139.1399,
        "min_ms": 121.381,
        "max_ms": 139.1399,
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
        "median_ms": 348.3378,
        "p95_ms": 805.0937,
        "min_ms": 308.4645,
        "max_ms": 805.0937,
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
        "median_ms": 331.9212,
        "p95_ms": 337.4792,
        "min_ms": 322.8226,
        "max_ms": 337.4792,
        "rounds": 5
      },
      "reference": {
        "median_ms": 348.3378,
        "p95_ms": 805.0937,
        "min_ms": 308.4645,
        "max_ms": 805.0937,
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
        "median_ms": 354.6243,
        "p95_ms": 370.3418,
        "min_ms": 323.3899,
        "max_ms": 370.3418,
        "rounds": 5
      },
      "reference": {
        "median_ms": 348.3378,
        "p95_ms": 805.0937,
        "min_ms": 308.4645,
        "max_ms": 805.0937,
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
        "median_ms": 346.5188,
        "p95_ms": 369.2759,
        "min_ms": 306.8468,
        "max_ms": 369.2759,
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
        "median_ms": 337.6297,
        "p95_ms": 358.8403,
        "min_ms": 330.9484,
        "max_ms": 358.8403,
        "rounds": 5
      },
      "reference": {
        "median_ms": 346.5188,
        "p95_ms": 369.2759,
        "min_ms": 306.8468,
        "max_ms": 369.2759,
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
        "median_ms": 342.2606,
        "p95_ms": 348.6059,
        "min_ms": 319.0728,
        "max_ms": 348.6059,
        "rounds": 5
      },
      "reference": {
        "median_ms": 346.5188,
        "p95_ms": 369.2759,
        "min_ms": 306.8468,
        "max_ms": 369.2759,
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
        "median_ms": 41.2359,
        "p95_ms": 42.7011,
        "min_ms": 38.5783,
        "max_ms": 42.7011,
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
        "median_ms": 47.6582,
        "p95_ms": 69.5531,
        "min_ms": 40.2386,
        "max_ms": 69.5531,
        "rounds": 5
      },
      "reference": {
        "median_ms": 41.2359,
        "p95_ms": 42.7011,
        "min_ms": 38.5783,
        "max_ms": 42.7011,
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
        "median_ms": 44.7919,
        "p95_ms": 46.5205,
        "min_ms": 44.5001,
        "max_ms": 46.5205,
        "rounds": 5
      },
      "reference": {
        "median_ms": 41.2359,
        "p95_ms": 42.7011,
        "min_ms": 38.5783,
        "max_ms": 42.7011,
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
        "median_ms": 370.7354,
        "p95_ms": 390.5833,
        "min_ms": 363.9648,
        "max_ms": 390.5833,
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
        "median_ms": 377.6116,
        "p95_ms": 403.0316,
        "min_ms": 371.2574,
        "max_ms": 403.0316,
        "rounds": 5
      },
      "reference": {
        "median_ms": 370.7354,
        "p95_ms": 390.5833,
        "min_ms": 363.9648,
        "max_ms": 390.5833,
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
        "median_ms": 377.3525,
        "p95_ms": 391.0955,
        "min_ms": 371.1924,
        "max_ms": 391.0955,
        "rounds": 5
      },
      "reference": {
        "median_ms": 370.7354,
        "p95_ms": 390.5833,
        "min_ms": 363.9648,
        "max_ms": 390.5833,
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
        "median_ms": 7.1185,
        "p95_ms": 7.5145,
        "min_ms": 6.8482,
        "max_ms": 7.5145,
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
        "median_ms": 7.8709,
        "p95_ms": 9.6291,
        "min_ms": 6.9971,
        "max_ms": 9.6291,
        "rounds": 5
      },
      "reference": {
        "median_ms": 7.1185,
        "p95_ms": 7.5145,
        "min_ms": 6.8482,
        "max_ms": 7.5145,
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
        "median_ms": 6.9878,
        "p95_ms": 7.9407,
        "min_ms": 6.7288,
        "max_ms": 7.9407,
        "rounds": 5
      },
      "reference": {
        "median_ms": 7.1185,
        "p95_ms": 7.5145,
        "min_ms": 6.8482,
        "max_ms": 7.5145,
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
        "median_ms": 269.608,
        "p95_ms": 283.2542,
        "min_ms": 259.6135,
        "max_ms": 283.2542,
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
        "median_ms": 263.348,
        "p95_ms": 269.1211,
        "min_ms": 256.075,
        "max_ms": 269.1211,
        "rounds": 5
      },
      "reference": {
        "median_ms": 269.608,
        "p95_ms": 283.2542,
        "min_ms": 259.6135,
        "max_ms": 283.2542,
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
        "median_ms": 263.8725,
        "p95_ms": 287.3102,
        "min_ms": 256.2665,
        "max_ms": 287.3102,
        "rounds": 5
      },
      "reference": {
        "median_ms": 269.608,
        "p95_ms": 283.2542,
        "min_ms": 259.6135,
        "max_ms": 283.2542,
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
        "median_ms": 71.3137,
        "p95_ms": 72.9639,
        "min_ms": 69.5816,
        "max_ms": 72.9639,
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
        "median_ms": 70.8228,
        "p95_ms": 73.81,
        "min_ms": 68.446,
        "max_ms": 73.81,
        "rounds": 5
      },
      "reference": {
        "median_ms": 71.3137,
        "p95_ms": 72.9639,
        "min_ms": 69.5816,
        "max_ms": 72.9639,
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
        "median_ms": 69.69,
        "p95_ms": 71.8477,
        "min_ms": 68.2862,
        "max_ms": 71.8477,
        "rounds": 5
      },
      "reference": {
        "median_ms": 71.3137,
        "p95_ms": 72.9639,
        "min_ms": 69.5816,
        "max_ms": 72.9639,
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
      "workload": "zset-score-ops@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 198.0556,
        "p95_ms": 223.1214,
        "min_ms": 186.155,
        "max_ms": 223.1214,
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
        "median_ms": 204.5716,
        "p95_ms": 228.626,
        "min_ms": 192.0979,
        "max_ms": 228.626,
        "rounds": 5
      },
      "reference": {
        "median_ms": 198.0556,
        "p95_ms": 223.1214,
        "min_ms": 186.155,
        "max_ms": 223.1214,
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
        "median_ms": 194.5952,
        "p95_ms": 219.4067,
        "min_ms": 188.1959,
        "max_ms": 219.4067,
        "rounds": 5
      },
      "reference": {
        "median_ms": 198.0556,
        "p95_ms": 223.1214,
        "min_ms": 186.155,
        "max_ms": 223.1214,
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
        "median_ms": 117.517,
        "p95_ms": 120.7744,
        "min_ms": 113.9437,
        "max_ms": 120.7744,
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
        "median_ms": 116.8456,
        "p95_ms": 118.5626,
        "min_ms": 114.4333,
        "max_ms": 118.5626,
        "rounds": 5
      },
      "reference": {
        "median_ms": 117.517,
        "p95_ms": 120.7744,
        "min_ms": 113.9437,
        "max_ms": 120.7744,
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
        "median_ms": 121.1607,
        "p95_ms": 128.044,
        "min_ms": 119.8774,
        "max_ms": 128.044,
        "rounds": 5
      },
      "reference": {
        "median_ms": 117.517,
        "p95_ms": 120.7744,
        "min_ms": 113.9437,
        "max_ms": 120.7744,
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
        "median_ms": 135.5856,
        "p95_ms": 148.7156,
        "min_ms": 129.9956,
        "max_ms": 148.7156,
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
        "median_ms": 135.0487,
        "p95_ms": 149.1104,
        "min_ms": 131.7255,
        "max_ms": 149.1104,
        "rounds": 5
      },
      "reference": {
        "median_ms": 135.5856,
        "p95_ms": 148.7156,
        "min_ms": 129.9956,
        "max_ms": 148.7156,
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
        "median_ms": 136.5179,
        "p95_ms": 146.4051,
        "min_ms": 130.2903,
        "max_ms": 146.4051,
        "rounds": 5
      },
      "reference": {
        "median_ms": 135.5856,
        "p95_ms": 148.7156,
        "min_ms": 129.9956,
        "max_ms": 148.7156,
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
        "median_ms": 23.3785,
        "p95_ms": 26.3196,
        "min_ms": 23.2772,
        "max_ms": 26.3196,
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
        "median_ms": 23.4195,
        "p95_ms": 24.1748,
        "min_ms": 22.9528,
        "max_ms": 24.1748,
        "rounds": 5
      },
      "reference": {
        "median_ms": 23.3785,
        "p95_ms": 26.3196,
        "min_ms": 23.2772,
        "max_ms": 26.3196,
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
        "median_ms": 23.6831,
        "p95_ms": 24.8966,
        "min_ms": 23.2073,
        "max_ms": 24.8966,
        "rounds": 5
      },
      "reference": {
        "median_ms": 23.3785,
        "p95_ms": 26.3196,
        "min_ms": 23.2772,
        "max_ms": 26.3196,
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
        "median_ms": 47.8496,
        "p95_ms": 48.6974,
        "min_ms": 46.3339,
        "max_ms": 48.6974,
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
        "median_ms": 48.0827,
        "p95_ms": 49.6633,
        "min_ms": 46.8889,
        "max_ms": 49.6633,
        "rounds": 5
      },
      "reference": {
        "median_ms": 47.8496,
        "p95_ms": 48.6974,
        "min_ms": 46.3339,
        "max_ms": 48.6974,
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
        "median_ms": 48.0815,
        "p95_ms": 52.18,
        "min_ms": 47.5329,
        "max_ms": 52.18,
        "rounds": 5
      },
      "reference": {
        "median_ms": 47.8496,
        "p95_ms": 48.6974,
        "min_ms": 46.3339,
        "max_ms": 48.6974,
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
        "median_ms": 30.0834,
        "p95_ms": 31.0102,
        "min_ms": 28.7157,
        "max_ms": 31.0102,
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
        "median_ms": 29.1602,
        "p95_ms": 31.4133,
        "min_ms": 28.8609,
        "max_ms": 31.4133,
        "rounds": 5
      },
      "reference": {
        "median_ms": 30.0834,
        "p95_ms": 31.0102,
        "min_ms": 28.7157,
        "max_ms": 31.0102,
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
        "median_ms": 29.1101,
        "p95_ms": 31.9282,
        "min_ms": 27.1331,
        "max_ms": 31.9282,
        "rounds": 5
      },
      "reference": {
        "median_ms": 30.0834,
        "p95_ms": 31.0102,
        "min_ms": 28.7157,
        "max_ms": 31.0102,
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
        "median_ms": 6.9916,
        "p95_ms": 7.5283,
        "min_ms": 6.7933,
        "max_ms": 7.5283,
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
        "median_ms": 6.8886,
        "p95_ms": 7.5893,
        "min_ms": 6.8258,
        "max_ms": 7.5893,
        "rounds": 5
      },
      "reference": {
        "median_ms": 6.9916,
        "p95_ms": 7.5283,
        "min_ms": 6.7933,
        "max_ms": 7.5283,
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
        "median_ms": 7.0546,
        "p95_ms": 7.9403,
        "min_ms": 6.7967,
        "max_ms": 7.9403,
        "rounds": 5
      },
      "reference": {
        "median_ms": 6.9916,
        "p95_ms": 7.5283,
        "min_ms": 6.7933,
        "max_ms": 7.5283,
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
        "median_ms": 8.074,
        "p95_ms": 8.9055,
        "min_ms": 7.1641,
        "max_ms": 8.9055,
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
        "median_ms": 7.828,
        "p95_ms": 8.7471,
        "min_ms": 7.2609,
        "max_ms": 8.7471,
        "rounds": 5
      },
      "reference": {
        "median_ms": 8.074,
        "p95_ms": 8.9055,
        "min_ms": 7.1641,
        "max_ms": 8.9055,
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
        "median_ms": 8.7214,
        "p95_ms": 10.6143,
        "min_ms": 8.5894,
        "max_ms": 10.6143,
        "rounds": 5
      },
      "reference": {
        "median_ms": 8.074,
        "p95_ms": 8.9055,
        "min_ms": 7.1641,
        "max_ms": 8.9055,
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
        "median_ms": 159.1639,
        "p95_ms": 191.1661,
        "min_ms": 154.8268,
        "max_ms": 191.1661,
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
        "median_ms": 160.7888,
        "p95_ms": 164.2107,
        "min_ms": 158.8836,
        "max_ms": 164.2107,
        "rounds": 5
      },
      "reference": {
        "median_ms": 159.1639,
        "p95_ms": 191.1661,
        "min_ms": 154.8268,
        "max_ms": 191.1661,
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
        "median_ms": 155.1102,
        "p95_ms": 158.4527,
        "min_ms": 152.9296,
        "max_ms": 158.4527,
        "rounds": 5
      },
      "reference": {
        "median_ms": 159.1639,
        "p95_ms": 191.1661,
        "min_ms": 154.8268,
        "max_ms": 191.1661,
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
        "median_ms": 375.3965,
        "p95_ms": 397.4118,
        "min_ms": 367.6051,
        "max_ms": 397.4118,
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
        "median_ms": 374.5895,
        "p95_ms": 379.8013,
        "min_ms": 370.9523,
        "max_ms": 379.8013,
        "rounds": 5
      },
      "reference": {
        "median_ms": 375.3965,
        "p95_ms": 397.4118,
        "min_ms": 367.6051,
        "max_ms": 397.4118,
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
        "median_ms": 376.1299,
        "p95_ms": 395.8417,
        "min_ms": 373.6774,
        "max_ms": 395.8417,
        "rounds": 5
      },
      "reference": {
        "median_ms": 375.3965,
        "p95_ms": 397.4118,
        "min_ms": 367.6051,
        "max_ms": 397.4118,
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
        "median_ms": 142.7092,
        "p95_ms": 148.3978,
        "min_ms": 138.7325,
        "max_ms": 148.3978,
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
        "median_ms": 142.3255,
        "p95_ms": 154.829,
        "min_ms": 138.9302,
        "max_ms": 154.829,
        "rounds": 5
      },
      "reference": {
        "median_ms": 142.7092,
        "p95_ms": 148.3978,
        "min_ms": 138.7325,
        "max_ms": 148.3978,
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
        "median_ms": 141.7644,
        "p95_ms": 145.4337,
        "min_ms": 136.7472,
        "max_ms": 145.4337,
        "rounds": 5
      },
      "reference": {
        "median_ms": 142.7092,
        "p95_ms": 148.3978,
        "min_ms": 138.7325,
        "max_ms": 148.3978,
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
        "median_ms": 185.6399,
        "p95_ms": 191.4462,
        "min_ms": 175.583,
        "max_ms": 191.4462,
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
        "median_ms": 171.5895,
        "p95_ms": 183.2441,
        "min_ms": 163.9745,
        "max_ms": 183.2441,
        "rounds": 5
      },
      "reference": {
        "median_ms": 185.6399,
        "p95_ms": 191.4462,
        "min_ms": 175.583,
        "max_ms": 191.4462,
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
        "median_ms": 170.822,
        "p95_ms": 209.2511,
        "min_ms": 169.2017,
        "max_ms": 209.2511,
        "rounds": 5
      },
      "reference": {
        "median_ms": 185.6399,
        "p95_ms": 191.4462,
        "min_ms": 175.583,
        "max_ms": 191.4462,
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
        "median_ms": 57.8599,
        "p95_ms": 74.19,
        "min_ms": 56.3253,
        "max_ms": 74.19,
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
        "median_ms": 59.2642,
        "p95_ms": 64.7468,
        "min_ms": 59.0039,
        "max_ms": 64.7468,
        "rounds": 5
      },
      "reference": {
        "median_ms": 57.8599,
        "p95_ms": 74.19,
        "min_ms": 56.3253,
        "max_ms": 74.19,
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
        "median_ms": 68.9555,
        "p95_ms": 73.9702,
        "min_ms": 66.3944,
        "max_ms": 73.9702,
        "rounds": 5
      },
      "reference": {
        "median_ms": 57.8599,
        "p95_ms": 74.19,
        "min_ms": 56.3253,
        "max_ms": 74.19,
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
        "median_ms": 121.428,
        "p95_ms": 130.4404,
        "min_ms": 117.5308,
        "max_ms": 130.4404,
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
        "median_ms": 17.0924,
        "p95_ms": 18.1745,
        "min_ms": 16.2837,
        "max_ms": 18.1745,
        "rounds": 5
      },
      "reference": {
        "median_ms": 121.428,
        "p95_ms": 130.4404,
        "min_ms": 117.5308,
        "max_ms": 130.4404,
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
        "median_ms": 35.6721,
        "p95_ms": 37.6003,
        "min_ms": 34.8194,
        "max_ms": 37.6003,
        "rounds": 5
      },
      "reference": {
        "median_ms": 121.428,
        "p95_ms": 130.4404,
        "min_ms": 117.5308,
        "max_ms": 130.4404,
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
