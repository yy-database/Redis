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
- `rev`: `285fd04f533edea623162d295bff828a72a2d1d5`
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
| `zset-add-options` | `redis-zset-add-options` | 800 | {"members":"200","commands":"ZADD NX,ZADD XX CH,ZADD GT CH,ZADD INCR"} |
| `expire-options` | `redis-key-expire-options` | 1200 | {"keys":"200","commands":"EXPIRE NX,EXPIRE XX,EXPIRE LT,EXPIRE GT,TTL"} |
| `expire-metadata` | `redis-key-expire-metadata` | 600 | {"keys":"200","commands":"EXPIRETIME,PEXPIRETIME,TTL"} |
| `list-lpos` | `redis-list-lpos` | 800 | {"elements":"200","commands":"LPOS,LPOS RANK -1,LPOS COUNT 2,LPOS miss"} |
| `copy-renamenx` | `redis-key-copy-renamenx` | 400 | {"keys":"200","commands":"COPY,RENAMENX"} |
| `object-encoding` | `redis-object-inspect` | 600 | {"keys":"200","commands":"OBJECT ENCODING,OBJECT REFCOUNT,OBJECT IDLETIME"} |
| `hash-hincrbyfloat` | `redis-hash-hincrbyfloat` | 400 | {"fields":"200","commands":"HINCRBYFLOAT 0.1,HINCRBYFLOAT 0.2"} |
| `list-lset-lrem` | `redis-list-lset-lrem` | 202 | {"members":"200","commands":"LSET,LREM,LLEN"} |
| `connect` | `redis-connect-open-close` | 50 | {"opens":"50","probe":"PING"} |

## Relative to `ioredis`

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|-------:|-------:|-------:|
| get-seq | **1.00x** | 1.03x | 1.24x |
| set-seq | 1.00x | **0.63x** | 1.43x |
| mset-seq | 1.00x | **0.85x** | 0.88x |
| incr-seq | 1.00x | **0.63x** | 0.90x |
| set-pipeline | 1.00x | **0.88x** | 0.97x |
| get-pipeline | 1.00x | **0.87x** | 2.10x |
| pipeline-mixed | **1.00x** | 1.20x | 1.10x |
| hash-hset-hget | 1.00x | **0.94x** | 1.10x |
| hash-setnx-hrandfield | 1.00x | **0.99x** | 1.14x |
| list-rpush-lrange | 1.00x | **0.83x** | 1.11x |
| set-sadd-smembers | 1.00x | **0.89x** | 0.98x |
| zset-zadd-zrange | 1.00x | **0.32x** | 0.40x |
| streams-xadd-xrange | 1.00x | **0.86x** | 1.01x |
| pubsub-roundtrip | 1.00x | **0.39x** | 0.62x |
| blpop-roundtrip | 1.00x | **0.93x** | 1.02x |
| scan-full | 1.00x | 0.90x | **0.86x** |
| ping-concurrent | **1.00x** | 1.04x | 1.58x |
| stream-group | 1.00x | **0.89x** | 1.02x |
| ttl-setex-expire | 1.00x | 1.00x | **1.00x** |
| multi-exec | **1.00x** | 1.03x | 1.27x |
| mget-seq | 1.00x | **0.49x** | 0.75x |
| append-getrange | 1.00x | **0.91x** | 1.78x |
| getdel-getex | 1.00x | **0.68x** | 0.92x |
| set-options | 1.00x | 1.07x | **0.93x** |
| exists-type | 1.00x | **0.78x** | 1.00x |
| expire-persist | 1.00x | **0.74x** | 0.85x |
| hash-hgetall-hdel | 1.00x | **0.58x** | 0.69x |
| hash-keys-values | 1.00x | **0.62x** | 0.92x |
| list-lpush-lpop | **1.00x** | 1.02x | 1.04x |
| set-algebra | 1.00x | 0.84x | **0.59x** |
| set-membership-ops | 1.00x | **0.81x** | 0.87x |
| zset-pop-ops | 1.00x | 0.58x | **0.49x** |
| zset-range-queries | 1.00x | **0.30x** | 0.55x |
| large-collection-read | 1.00x | **0.41x** | 1.50x |
| large-hash-list-read | 1.00x | **0.47x** | 0.55x |
| resp3-hello | 1.00x | **0.56x** | 1.21x |
| expire-sweep | 1.00x | 1.04x | **0.99x** |
| multi-exec-mixed | 1.00x | **0.75x** | 0.78x |
| pubsub-fanout | **1.00x** | 1.08x | 1.20x |
| zset-score-ops | 1.00x | **0.83x** | 1.15x |
| bitfield-ops | 1.00x | 0.79x | **0.66x** |
| hll-ops | 1.00x | 1.13x | **0.97x** |
| sort-ops | 1.00x | **0.63x** | 0.79x |
| keys-random | **1.00x** | 1.08x | 1.11x |
| stream-xread | 1.00x | **0.69x** | 1.15x |
| stream-xadd-xread | 1.00x | 0.99x | **0.89x** |
| hscan-cursor | 1.00x | **0.61x** | 1.04x |
| sscan-zscan-cursor | 1.00x | **0.73x** | 0.88x |
| set-ops-large | **1.00x** | 1.02x | 1.06x |
| lmpop-blocking | 1.00x | 0.76x | **0.69x** |
| key-space-notify | **1.00x** | 1.02x | 1.04x |
| resp3-collections | 1.00x | **0.67x** | 0.88x |
| server-face-ops | 1.00x | 1.21x | **0.97x** |
| watch-exec | 1.00x | 1.83x | **0.98x** |
| set-big | **1.00x** | 1.09x | 1.14x |
| get-big | 1.00x | 2.40x | **0.97x** |
| del-seq | 1.00x | 0.98x | **0.89x** |
| move-seq | 1.00x | **0.92x** | 1.36x |
| ping | 1.00x | **0.86x** | 1.05x |
| bit-ops | **1.00x** | 1.06x | 1.27x |
| setrange-getrange | **1.00x** | 1.02x | 1.09x |
| rename-unlink | 1.00x | 1.09x | **0.89x** |
| setnx-getset | 1.00x | 0.90x | **0.86x** |
| smove-spop | 1.00x | **0.96x** | 1.04x |
| zrangestore-zdiff | 1.00x | 1.10x | **0.99x** |
| zset-add-options | **1.00x** | 1.03x | 1.11x |
| expire-options | 1.00x | 0.73x | **0.72x** |
| expire-metadata | 1.00x | **0.85x** | 1.21x |
| list-lpos | 1.00x | **0.68x** | 0.97x |
| copy-renamenx | 1.00x | **0.92x** | 1.00x |
| object-encoding | **1.00x** | 1.01x | 1.19x |
| hash-hincrbyfloat | 1.00x | **0.96x** | 1.01x |
| list-lset-lrem | **1.00x** | 1.32x | 1.34x |
| connect | 1.00x | **0.34x** | 1.25x |

## Median and p95 (ms)

| Workload | ops | ioredis med | ioredis p95 | @yydb/redis med | @yydb/redis p95 | node-redis med | node-redis p95 |
|---------:|----:|-------:|-------:|-------:|-------:|-------:|-------:|
| get-seq | 500 | 24.42 | 24.42 | 25.05 | 25.05 | 30.16 | 30.16 |
| set-seq | 100 | 6.25 | 6.25 | 3.95 | 3.95 | 8.95 | 8.95 |
| mset-seq | 500 | 3.63 | 3.63 | 3.08 | 3.08 | 3.19 | 3.19 |
| incr-seq | 500 | 33.22 | 33.22 | 21.01 | 21.01 | 29.90 | 29.90 |
| set-pipeline | 500 | 8.92 | 8.92 | 7.85 | 7.85 | 8.66 | 8.66 |
| get-pipeline | 500 | 4.81 | 4.81 | 4.20 | 4.20 | 10.10 | 10.10 |
| pipeline-mixed | 500 | 7.74 | 7.74 | 9.27 | 9.27 | 8.50 | 8.50 |
| hash-hset-hget | 401 | 22.29 | 22.29 | 20.91 | 20.91 | 24.44 | 24.44 |
| hash-setnx-hrandfield | 402 | 11.49 | 11.49 | 11.43 | 11.43 | 13.12 | 13.12 |
| list-rpush-lrange | 202 | 10.87 | 10.87 | 8.99 | 8.99 | 12.11 | 12.11 |
| set-sadd-smembers | 202 | 10.54 | 10.54 | 9.39 | 9.39 | 10.33 | 10.33 |
| zset-zadd-zrange | 202 | 29.76 | 29.76 | 9.59 | 9.59 | 11.95 | 11.95 |
| streams-xadd-xrange | 202 | 19.81 | 19.81 | 17.00 | 17.00 | 19.93 | 19.93 |
| pubsub-roundtrip | 100 | 13.44 | 13.44 | 5.22 | 5.22 | 8.29 | 8.29 |
| blpop-roundtrip | 100 | 13.93 | 13.93 | 12.93 | 12.93 | 14.14 | 14.14 |
| scan-full | 200 | 2.08 | 2.08 | 1.87 | 1.87 | 1.79 | 1.79 |
| ping-concurrent | 800 | 20.42 | 20.42 | 21.30 | 21.30 | 32.17 | 32.17 |
| stream-group | 300 | 39.73 | 39.73 | 35.30 | 35.30 | 40.36 | 40.36 |
| ttl-setex-expire | 90 | 1116.74 | 1116.74 | 1117.30 | 1117.30 | 1112.52 | 1112.52 |
| multi-exec | 102 | 6.49 | 6.49 | 6.70 | 6.70 | 8.23 | 8.23 |
| mget-seq | 200 | 1.16 | 1.16 | 0.57 | 0.57 | 0.87 | 0.87 |
| append-getrange | 201 | 9.48 | 9.48 | 8.64 | 8.64 | 16.85 | 16.85 |
| getdel-getex | 400 | 32.20 | 32.20 | 21.78 | 21.78 | 29.46 | 29.46 |
| set-options | 400 | 27.73 | 27.73 | 29.73 | 29.73 | 25.91 | 25.91 |
| exists-type | 400 | 22.55 | 22.55 | 17.53 | 17.53 | 22.50 | 22.50 |
| expire-persist | 600 | 30.24 | 30.24 | 22.48 | 22.48 | 25.71 | 25.71 |
| hash-hgetall-hdel | 202 | 1.98 | 1.98 | 1.14 | 1.14 | 1.36 | 1.36 |
| hash-keys-values | 40 | 4.82 | 4.82 | 2.97 | 2.97 | 4.44 | 4.44 |
| list-lpush-lpop | 400 | 21.72 | 21.72 | 22.26 | 22.26 | 22.57 | 22.57 |
| set-algebra | 30 | 7.93 | 7.93 | 6.68 | 6.68 | 4.64 | 4.64 |
| set-membership-ops | 30 | 8.92 | 8.92 | 7.26 | 7.26 | 7.81 | 7.81 |
| zset-pop-ops | 4 | 2.03 | 2.03 | 1.17 | 1.17 | 0.99 | 0.99 |
| zset-range-queries | 40 | 8.06 | 8.06 | 2.45 | 2.45 | 4.40 | 4.40 |
| large-collection-read | 20 | 21.63 | 21.63 | 8.78 | 8.78 | 32.46 | 32.46 |
| large-hash-list-read | 20 | 29.50 | 29.50 | 13.72 | 13.72 | 16.19 | 16.19 |
| resp3-hello | 40 | 3.41 | 3.41 | 1.91 | 1.91 | 4.12 | 4.12 |
| expire-sweep | 1002 | 243.07 | 243.07 | 252.31 | 252.31 | 241.75 | 241.75 |
| multi-exec-mixed | 102 | 7.11 | 7.11 | 5.33 | 5.33 | 5.56 | 5.56 |
| pubsub-fanout | 400 | 10.71 | 10.71 | 11.54 | 11.54 | 12.81 | 12.81 |
| zset-score-ops | 600 | 36.53 | 36.53 | 30.20 | 30.20 | 42.05 | 42.05 |
| bitfield-ops | 201 | 13.17 | 13.17 | 10.41 | 10.41 | 8.64 | 8.64 |
| hll-ops | 201 | 10.14 | 10.14 | 11.49 | 11.49 | 9.88 | 9.88 |
| sort-ops | 10 | 2.37 | 2.37 | 1.51 | 1.51 | 1.87 | 1.87 |
| keys-random | 30 | 20.01 | 20.01 | 21.53 | 21.53 | 22.16 | 22.16 |
| stream-xread | 10 | 10.38 | 10.38 | 7.20 | 7.20 | 11.90 | 11.90 |
| stream-xadd-xread | 202 | 23.53 | 23.53 | 23.20 | 23.20 | 20.95 | 20.95 |
| hscan-cursor | 200 | 0.89 | 0.89 | 0.54 | 0.54 | 0.92 | 0.92 |
| sscan-zscan-cursor | 400 | 0.97 | 0.97 | 0.70 | 0.70 | 0.85 | 0.85 |
| set-ops-large | 30 | 154.35 | 154.35 | 157.06 | 157.06 | 163.15 | 163.15 |
| lmpop-blocking | 100 | 11.14 | 11.14 | 8.47 | 8.47 | 7.64 | 7.64 |
| key-space-notify | 30 | 106.41 | 106.41 | 108.51 | 108.51 | 110.37 | 110.37 |
| resp3-collections | 40 | 7.98 | 7.98 | 5.32 | 5.32 | 7.03 | 7.03 |
| server-face-ops | 40 | 2.91 | 2.91 | 3.51 | 3.51 | 2.82 | 2.82 |
| watch-exec | 40 | 1.63 | 1.63 | 2.98 | 2.98 | 1.60 | 1.60 |
| set-big | 20 | 4.66 | 4.66 | 5.10 | 5.10 | 5.30 | 5.30 |
| get-big | 50 | 10.05 | 10.05 | 24.14 | 24.14 | 9.75 | 9.75 |
| del-seq | 200 | 9.37 | 9.37 | 9.21 | 9.21 | 8.34 | 8.34 |
| move-seq | 200 | 14.14 | 14.14 | 13.04 | 13.04 | 19.27 | 19.27 |
| ping | 1000 | 49.13 | 49.13 | 42.48 | 42.48 | 51.71 | 51.71 |
| bit-ops | 800 | 38.14 | 38.14 | 40.34 | 40.34 | 48.55 | 48.55 |
| setrange-getrange | 400 | 22.97 | 22.97 | 23.47 | 23.47 | 25.02 | 25.02 |
| rename-unlink | 400 | 25.55 | 25.55 | 27.93 | 27.93 | 22.72 | 22.72 |
| setnx-getset | 400 | 20.14 | 20.14 | 18.21 | 18.21 | 17.35 | 17.35 |
| smove-spop | 400 | 26.14 | 26.14 | 25.19 | 25.19 | 27.23 | 27.23 |
| zrangestore-zdiff | 400 | 0.34 | 0.34 | 0.37 | 0.37 | 0.34 | 0.34 |
| zset-add-options | 800 | 57.46 | 57.46 | 59.11 | 59.11 | 63.92 | 63.92 |
| expire-options | 1200 | 93.81 | 93.81 | 68.55 | 68.55 | 67.97 | 67.97 |
| expire-metadata | 600 | 29.01 | 29.01 | 24.68 | 24.68 | 35.22 | 35.22 |
| list-lpos | 800 | 60.52 | 60.52 | 41.21 | 41.21 | 58.99 | 58.99 |
| copy-renamenx | 400 | 28.14 | 28.14 | 25.80 | 25.80 | 28.09 | 28.09 |
| object-encoding | 600 | 31.49 | 31.49 | 31.89 | 31.89 | 37.46 | 37.46 |
| hash-hincrbyfloat | 400 | 55.18 | 55.18 | 52.89 | 52.89 | 55.52 | 55.52 |
| list-lset-lrem | 202 | 10.86 | 10.86 | 14.32 | 14.32 | 14.57 | 14.57 |
| connect | 50 | 52.12 | 52.12 | 17.74 | 17.74 | 65.31 | 65.31 |

## Per-op and throughput (median)

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|--------:|--------:|--------:|
| get-seq | 0.049 ms/op, 20,475/s | 0.050 ms/op, 19,958/s | 0.060 ms/op, 16,577/s |
| set-seq | 0.062 ms/op, 16,005/s | 0.039 ms/op, 25,327/s | 0.090 ms/op, 11,172/s |
| mset-seq | 0.007 ms/op, 137,874/s | 0.006 ms/op, 162,528/s | 0.006 ms/op, 156,647/s |
| incr-seq | 0.066 ms/op, 15,049/s | 0.042 ms/op, 23,795/s | 0.060 ms/op, 16,724/s |
| set-pipeline | 0.018 ms/op, 56,061/s | 0.016 ms/op, 63,710/s | 0.017 ms/op, 57,750/s |
| get-pipeline | 0.010 ms/op, 103,993/s | 0.008 ms/op, 119,056/s | 0.020 ms/op, 49,512/s |
| pipeline-mixed | 0.015 ms/op, 64,565/s | 0.019 ms/op, 53,916/s | 0.017 ms/op, 58,790/s |
| hash-hset-hget | 0.056 ms/op, 17,990/s | 0.052 ms/op, 19,179/s | 0.061 ms/op, 16,409/s |
| hash-setnx-hrandfield | 0.029 ms/op, 35,002/s | 0.028 ms/op, 35,186/s | 0.033 ms/op, 30,651/s |
| list-rpush-lrange | 0.054 ms/op, 18,587/s | 0.045 ms/op, 22,463/s | 0.060 ms/op, 16,675/s |
| set-sadd-smembers | 0.052 ms/op, 19,173/s | 0.046 ms/op, 21,514/s | 0.051 ms/op, 19,559/s |
| zset-zadd-zrange | 0.147 ms/op, 6,788/s | 0.047 ms/op, 21,067/s | 0.059 ms/op, 16,910/s |
| streams-xadd-xrange | 0.098 ms/op, 10,198/s | 0.084 ms/op, 11,884/s | 0.099 ms/op, 10,136/s |
| pubsub-roundtrip | 0.134 ms/op, 7,440/s | 0.052 ms/op, 19,150/s | 0.083 ms/op, 12,057/s |
| blpop-roundtrip | 0.139 ms/op, 7,181/s | 0.129 ms/op, 7,735/s | 0.141 ms/op, 7,073/s |
| scan-full | 0.010 ms/op, 96,325/s | 0.009 ms/op, 107,147/s | 0.009 ms/op, 111,813/s |
| ping-concurrent | 0.026 ms/op, 39,176/s | 0.027 ms/op, 37,565/s | 0.040 ms/op, 24,867/s |
| stream-group | 0.132 ms/op, 7,551/s | 0.118 ms/op, 8,498/s | 0.135 ms/op, 7,433/s |
| ttl-setex-expire | 12.408 ms/op, 81/s | 12.414 ms/op, 81/s | 12.361 ms/op, 81/s |
| multi-exec | 0.064 ms/op, 15,721/s | 0.066 ms/op, 15,219/s | 0.081 ms/op, 12,390/s |
| mget-seq | 0.006 ms/op, 172,861/s | 0.003 ms/op, 349,589/s | 0.004 ms/op, 230,335/s |
| append-getrange | 0.047 ms/op, 21,201/s | 0.043 ms/op, 23,251/s | 0.084 ms/op, 11,931/s |
| getdel-getex | 0.081 ms/op, 12,422/s | 0.054 ms/op, 18,368/s | 0.074 ms/op, 13,576/s |
| set-options | 0.069 ms/op, 14,424/s | 0.074 ms/op, 13,455/s | 0.065 ms/op, 15,437/s |
| exists-type | 0.056 ms/op, 17,736/s | 0.044 ms/op, 22,812/s | 0.056 ms/op, 17,775/s |
| expire-persist | 0.050 ms/op, 19,843/s | 0.037 ms/op, 26,692/s | 0.043 ms/op, 23,341/s |
| hash-hgetall-hdel | 0.010 ms/op, 102,165/s | 0.006 ms/op, 176,435/s | 0.007 ms/op, 148,650/s |
| hash-keys-values | 0.120 ms/op, 8,305/s | 0.074 ms/op, 13,473/s | 0.111 ms/op, 9,001/s |
| list-lpush-lpop | 0.054 ms/op, 18,420/s | 0.056 ms/op, 17,972/s | 0.056 ms/op, 17,726/s |
| set-algebra | 0.264 ms/op, 3,781/s | 0.223 ms/op, 4,491/s | 0.155 ms/op, 6,461/s |
| set-membership-ops | 0.297 ms/op, 3,362/s | 0.242 ms/op, 4,130/s | 0.260 ms/op, 3,843/s |
| zset-pop-ops | 0.507 ms/op, 1,971/s | 0.292 ms/op, 3,421/s | 0.248 ms/op, 4,028/s |
| zset-range-queries | 0.201 ms/op, 4,966/s | 0.061 ms/op, 16,317/s | 0.110 ms/op, 9,094/s |
| large-collection-read | 1.081 ms/op, 925/s | 0.439 ms/op, 2,278/s | 1.623 ms/op, 616/s |
| large-hash-list-read | 1.475 ms/op, 678/s | 0.686 ms/op, 1,458/s | 0.810 ms/op, 1,235/s |
| resp3-hello | 0.085 ms/op, 11,731/s | 0.048 ms/op, 20,996/s | 0.103 ms/op, 9,702/s |
| expire-sweep | 0.243 ms/op, 4,122/s | 0.252 ms/op, 3,971/s | 0.241 ms/op, 4,145/s |
| multi-exec-mixed | 0.070 ms/op, 14,344/s | 0.052 ms/op, 19,145/s | 0.055 ms/op, 18,330/s |
| pubsub-fanout | 0.027 ms/op, 37,342/s | 0.029 ms/op, 34,668/s | 0.032 ms/op, 31,227/s |
| zset-score-ops | 0.061 ms/op, 16,427/s | 0.050 ms/op, 19,870/s | 0.070 ms/op, 14,268/s |
| bitfield-ops | 0.066 ms/op, 15,260/s | 0.052 ms/op, 19,311/s | 0.043 ms/op, 23,276/s |
| hll-ops | 0.050 ms/op, 19,828/s | 0.057 ms/op, 17,491/s | 0.049 ms/op, 20,346/s |
| sort-ops | 0.237 ms/op, 4,211/s | 0.151 ms/op, 6,639/s | 0.187 ms/op, 5,359/s |
| keys-random | 0.667 ms/op, 1,499/s | 0.718 ms/op, 1,393/s | 0.739 ms/op, 1,354/s |
| stream-xread | 1.038 ms/op, 963/s | 0.720 ms/op, 1,388/s | 1.190 ms/op, 841/s |
| stream-xadd-xread | 0.116 ms/op, 8,586/s | 0.115 ms/op, 8,708/s | 0.104 ms/op, 9,643/s |
| hscan-cursor | 0.004 ms/op, 224,997/s | 0.003 ms/op, 371,058/s | 0.005 ms/op, 216,896/s |
| sscan-zscan-cursor | 0.002 ms/op, 413,864/s | 0.002 ms/op, 567,537/s | 0.002 ms/op, 470,367/s |
| set-ops-large | 5.145 ms/op, 194/s | 5.235 ms/op, 191/s | 5.438 ms/op, 184/s |
| lmpop-blocking | 0.111 ms/op, 8,980/s | 0.085 ms/op, 11,800/s | 0.076 ms/op, 13,088/s |
| key-space-notify | 3.547 ms/op, 282/s | 3.617 ms/op, 276/s | 3.679 ms/op, 272/s |
| resp3-collections | 0.200 ms/op, 5,012/s | 0.133 ms/op, 7,518/s | 0.176 ms/op, 5,689/s |
| server-face-ops | 0.073 ms/op, 13,762/s | 0.088 ms/op, 11,383/s | 0.071 ms/op, 14,170/s |
| watch-exec | 0.041 ms/op, 24,596/s | 0.074 ms/op, 13,435/s | 0.040 ms/op, 25,060/s |
| set-big | 0.233 ms/op, 4,295/s | 0.255 ms/op, 3,923/s | 0.265 ms/op, 3,776/s |
| get-big | 0.201 ms/op, 4,976/s | 0.483 ms/op, 2,072/s | 0.195 ms/op, 5,129/s |
| del-seq | 0.047 ms/op, 21,336/s | 0.046 ms/op, 21,706/s | 0.042 ms/op, 23,995/s |
| move-seq | 0.071 ms/op, 14,145/s | 0.065 ms/op, 15,339/s | 0.096 ms/op, 10,378/s |
| ping | 0.049 ms/op, 20,355/s | 0.042 ms/op, 23,539/s | 0.052 ms/op, 19,340/s |
| bit-ops | 0.048 ms/op, 20,975/s | 0.050 ms/op, 19,830/s | 0.061 ms/op, 16,479/s |
| setrange-getrange | 0.057 ms/op, 17,414/s | 0.059 ms/op, 17,043/s | 0.063 ms/op, 15,987/s |
| rename-unlink | 0.064 ms/op, 15,654/s | 0.070 ms/op, 14,320/s | 0.057 ms/op, 17,605/s |
| setnx-getset | 0.050 ms/op, 19,860/s | 0.046 ms/op, 21,962/s | 0.043 ms/op, 23,061/s |
| smove-spop | 0.065 ms/op, 15,300/s | 0.063 ms/op, 15,882/s | 0.068 ms/op, 14,692/s |
| zrangestore-zdiff | 0.001 ms/op, 1,179,941/s | 0.001 ms/op, 1,077,006/s | 0.001 ms/op, 1,192,250/s |
| zset-add-options | 0.072 ms/op, 13,923/s | 0.074 ms/op, 13,534/s | 0.080 ms/op, 12,516/s |
| expire-options | 0.078 ms/op, 12,792/s | 0.057 ms/op, 17,506/s | 0.057 ms/op, 17,654/s |
| expire-metadata | 0.048 ms/op, 20,684/s | 0.041 ms/op, 24,307/s | 0.059 ms/op, 17,036/s |
| list-lpos | 0.076 ms/op, 13,219/s | 0.052 ms/op, 19,412/s | 0.074 ms/op, 13,562/s |
| copy-renamenx | 0.070 ms/op, 14,213/s | 0.064 ms/op, 15,505/s | 0.070 ms/op, 14,238/s |
| object-encoding | 0.052 ms/op, 19,055/s | 0.053 ms/op, 18,812/s | 0.062 ms/op, 16,017/s |
| hash-hincrbyfloat | 0.138 ms/op, 7,248/s | 0.132 ms/op, 7,563/s | 0.139 ms/op, 7,204/s |
| list-lset-lrem | 0.054 ms/op, 18,606/s | 0.071 ms/op, 14,108/s | 0.072 ms/op, 13,861/s |
| connect | 1.042 ms/op, 959/s | 0.355 ms/op, 2,818/s | 1.306 ms/op, 766/s |

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
    "data_scale": "matrix=74x3",
    "rustc_version": "rustc 1.101.0-nightly (1c3a65069 2026-11-02)",
    "node_version": "v24.18.0",
    "target_triple": "x86_64-pc-windows-msvc",
    "rev": "285fd04f533edea623162d295bff828a72a2d1d5",
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
        "median_ms": 24.4195,
        "p95_ms": 24.4195,
        "min_ms": 24.4195,
        "max_ms": 24.4195,
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
        "median_ms": 25.0523,
        "p95_ms": 25.0523,
        "min_ms": 25.0523,
        "max_ms": 25.0523,
        "rounds": 1
      },
      "reference": {
        "median_ms": 24.4195,
        "p95_ms": 24.4195,
        "min_ms": 24.4195,
        "max_ms": 24.4195,
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
        "median_ms": 30.1627,
        "p95_ms": 30.1627,
        "min_ms": 30.1627,
        "max_ms": 30.1627,
        "rounds": 1
      },
      "reference": {
        "median_ms": 24.4195,
        "p95_ms": 24.4195,
        "min_ms": 24.4195,
        "max_ms": 24.4195,
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
        "median_ms": 6.248,
        "p95_ms": 6.248,
        "min_ms": 6.248,
        "max_ms": 6.248,
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
        "median_ms": 3.9484,
        "p95_ms": 3.9484,
        "min_ms": 3.9484,
        "max_ms": 3.9484,
        "rounds": 1
      },
      "reference": {
        "median_ms": 6.248,
        "p95_ms": 6.248,
        "min_ms": 6.248,
        "max_ms": 6.248,
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
        "median_ms": 8.9511,
        "p95_ms": 8.9511,
        "min_ms": 8.9511,
        "max_ms": 8.9511,
        "rounds": 1
      },
      "reference": {
        "median_ms": 6.248,
        "p95_ms": 6.248,
        "min_ms": 6.248,
        "max_ms": 6.248,
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
        "median_ms": 3.6265,
        "p95_ms": 3.6265,
        "min_ms": 3.6265,
        "max_ms": 3.6265,
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
        "median_ms": 3.0764,
        "p95_ms": 3.0764,
        "min_ms": 3.0764,
        "max_ms": 3.0764,
        "rounds": 1
      },
      "reference": {
        "median_ms": 3.6265,
        "p95_ms": 3.6265,
        "min_ms": 3.6265,
        "max_ms": 3.6265,
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
        "median_ms": 3.1919,
        "p95_ms": 3.1919,
        "min_ms": 3.1919,
        "max_ms": 3.1919,
        "rounds": 1
      },
      "reference": {
        "median_ms": 3.6265,
        "p95_ms": 3.6265,
        "min_ms": 3.6265,
        "max_ms": 3.6265,
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
        "median_ms": 33.224,
        "p95_ms": 33.224,
        "min_ms": 33.224,
        "max_ms": 33.224,
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
        "median_ms": 21.0125,
        "p95_ms": 21.0125,
        "min_ms": 21.0125,
        "max_ms": 21.0125,
        "rounds": 1
      },
      "reference": {
        "median_ms": 33.224,
        "p95_ms": 33.224,
        "min_ms": 33.224,
        "max_ms": 33.224,
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
        "median_ms": 29.8965,
        "p95_ms": 29.8965,
        "min_ms": 29.8965,
        "max_ms": 29.8965,
        "rounds": 1
      },
      "reference": {
        "median_ms": 33.224,
        "p95_ms": 33.224,
        "min_ms": 33.224,
        "max_ms": 33.224,
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
        "median_ms": 8.9188,
        "p95_ms": 8.9188,
        "min_ms": 8.9188,
        "max_ms": 8.9188,
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
        "median_ms": 7.8481,
        "p95_ms": 7.8481,
        "min_ms": 7.8481,
        "max_ms": 7.8481,
        "rounds": 1
      },
      "reference": {
        "median_ms": 8.9188,
        "p95_ms": 8.9188,
        "min_ms": 8.9188,
        "max_ms": 8.9188,
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
        "median_ms": 8.658,
        "p95_ms": 8.658,
        "min_ms": 8.658,
        "max_ms": 8.658,
        "rounds": 1
      },
      "reference": {
        "median_ms": 8.9188,
        "p95_ms": 8.9188,
        "min_ms": 8.9188,
        "max_ms": 8.9188,
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
        "median_ms": 4.808,
        "p95_ms": 4.808,
        "min_ms": 4.808,
        "max_ms": 4.808,
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
        "median_ms": 4.1997,
        "p95_ms": 4.1997,
        "min_ms": 4.1997,
        "max_ms": 4.1997,
        "rounds": 1
      },
      "reference": {
        "median_ms": 4.808,
        "p95_ms": 4.808,
        "min_ms": 4.808,
        "max_ms": 4.808,
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
        "median_ms": 10.0985,
        "p95_ms": 10.0985,
        "min_ms": 10.0985,
        "max_ms": 10.0985,
        "rounds": 1
      },
      "reference": {
        "median_ms": 4.808,
        "p95_ms": 4.808,
        "min_ms": 4.808,
        "max_ms": 4.808,
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
        "median_ms": 7.7441,
        "p95_ms": 7.7441,
        "min_ms": 7.7441,
        "max_ms": 7.7441,
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
        "median_ms": 9.2737,
        "p95_ms": 9.2737,
        "min_ms": 9.2737,
        "max_ms": 9.2737,
        "rounds": 1
      },
      "reference": {
        "median_ms": 7.7441,
        "p95_ms": 7.7441,
        "min_ms": 7.7441,
        "max_ms": 7.7441,
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
        "median_ms": 8.5048,
        "p95_ms": 8.5048,
        "min_ms": 8.5048,
        "max_ms": 8.5048,
        "rounds": 1
      },
      "reference": {
        "median_ms": 7.7441,
        "p95_ms": 7.7441,
        "min_ms": 7.7441,
        "max_ms": 7.7441,
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
        "median_ms": 22.2896,
        "p95_ms": 22.2896,
        "min_ms": 22.2896,
        "max_ms": 22.2896,
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
        "median_ms": 20.9078,
        "p95_ms": 20.9078,
        "min_ms": 20.9078,
        "max_ms": 20.9078,
        "rounds": 1
      },
      "reference": {
        "median_ms": 22.2896,
        "p95_ms": 22.2896,
        "min_ms": 22.2896,
        "max_ms": 22.2896,
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
        "median_ms": 24.4371,
        "p95_ms": 24.4371,
        "min_ms": 24.4371,
        "max_ms": 24.4371,
        "rounds": 1
      },
      "reference": {
        "median_ms": 22.2896,
        "p95_ms": 22.2896,
        "min_ms": 22.2896,
        "max_ms": 22.2896,
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
        "median_ms": 11.4851,
        "p95_ms": 11.4851,
        "min_ms": 11.4851,
        "max_ms": 11.4851,
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
        "median_ms": 11.4251,
        "p95_ms": 11.4251,
        "min_ms": 11.4251,
        "max_ms": 11.4251,
        "rounds": 1
      },
      "reference": {
        "median_ms": 11.4851,
        "p95_ms": 11.4851,
        "min_ms": 11.4851,
        "max_ms": 11.4851,
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
        "median_ms": 13.1152,
        "p95_ms": 13.1152,
        "min_ms": 13.1152,
        "max_ms": 13.1152,
        "rounds": 1
      },
      "reference": {
        "median_ms": 11.4851,
        "p95_ms": 11.4851,
        "min_ms": 11.4851,
        "max_ms": 11.4851,
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
        "median_ms": 10.8681,
        "p95_ms": 10.8681,
        "min_ms": 10.8681,
        "max_ms": 10.8681,
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
        "median_ms": 8.9926,
        "p95_ms": 8.9926,
        "min_ms": 8.9926,
        "max_ms": 8.9926,
        "rounds": 1
      },
      "reference": {
        "median_ms": 10.8681,
        "p95_ms": 10.8681,
        "min_ms": 10.8681,
        "max_ms": 10.8681,
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
        "median_ms": 12.1139,
        "p95_ms": 12.1139,
        "min_ms": 12.1139,
        "max_ms": 12.1139,
        "rounds": 1
      },
      "reference": {
        "median_ms": 10.8681,
        "p95_ms": 10.8681,
        "min_ms": 10.8681,
        "max_ms": 10.8681,
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
        "median_ms": 10.5355,
        "p95_ms": 10.5355,
        "min_ms": 10.5355,
        "max_ms": 10.5355,
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
        "median_ms": 9.3894,
        "p95_ms": 9.3894,
        "min_ms": 9.3894,
        "max_ms": 9.3894,
        "rounds": 1
      },
      "reference": {
        "median_ms": 10.5355,
        "p95_ms": 10.5355,
        "min_ms": 10.5355,
        "max_ms": 10.5355,
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
        "median_ms": 10.3276,
        "p95_ms": 10.3276,
        "min_ms": 10.3276,
        "max_ms": 10.3276,
        "rounds": 1
      },
      "reference": {
        "median_ms": 10.5355,
        "p95_ms": 10.5355,
        "min_ms": 10.5355,
        "max_ms": 10.5355,
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
        "median_ms": 29.7564,
        "p95_ms": 29.7564,
        "min_ms": 29.7564,
        "max_ms": 29.7564,
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
        "median_ms": 9.5884,
        "p95_ms": 9.5884,
        "min_ms": 9.5884,
        "max_ms": 9.5884,
        "rounds": 1
      },
      "reference": {
        "median_ms": 29.7564,
        "p95_ms": 29.7564,
        "min_ms": 29.7564,
        "max_ms": 29.7564,
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
        "median_ms": 11.9454,
        "p95_ms": 11.9454,
        "min_ms": 11.9454,
        "max_ms": 11.9454,
        "rounds": 1
      },
      "reference": {
        "median_ms": 29.7564,
        "p95_ms": 29.7564,
        "min_ms": 29.7564,
        "max_ms": 29.7564,
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
        "median_ms": 19.8085,
        "p95_ms": 19.8085,
        "min_ms": 19.8085,
        "max_ms": 19.8085,
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
        "median_ms": 16.998,
        "p95_ms": 16.998,
        "min_ms": 16.998,
        "max_ms": 16.998,
        "rounds": 1
      },
      "reference": {
        "median_ms": 19.8085,
        "p95_ms": 19.8085,
        "min_ms": 19.8085,
        "max_ms": 19.8085,
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
        "median_ms": 19.9289,
        "p95_ms": 19.9289,
        "min_ms": 19.9289,
        "max_ms": 19.9289,
        "rounds": 1
      },
      "reference": {
        "median_ms": 19.8085,
        "p95_ms": 19.8085,
        "min_ms": 19.8085,
        "max_ms": 19.8085,
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
        "median_ms": 13.4408,
        "p95_ms": 13.4408,
        "min_ms": 13.4408,
        "max_ms": 13.4408,
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
        "median_ms": 5.2218,
        "p95_ms": 5.2218,
        "min_ms": 5.2218,
        "max_ms": 5.2218,
        "rounds": 1
      },
      "reference": {
        "median_ms": 13.4408,
        "p95_ms": 13.4408,
        "min_ms": 13.4408,
        "max_ms": 13.4408,
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
        "median_ms": 8.294,
        "p95_ms": 8.294,
        "min_ms": 8.294,
        "max_ms": 8.294,
        "rounds": 1
      },
      "reference": {
        "median_ms": 13.4408,
        "p95_ms": 13.4408,
        "min_ms": 13.4408,
        "max_ms": 13.4408,
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
        "median_ms": 13.925,
        "p95_ms": 13.925,
        "min_ms": 13.925,
        "max_ms": 13.925,
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
        "median_ms": 12.9276,
        "p95_ms": 12.9276,
        "min_ms": 12.9276,
        "max_ms": 12.9276,
        "rounds": 1
      },
      "reference": {
        "median_ms": 13.925,
        "p95_ms": 13.925,
        "min_ms": 13.925,
        "max_ms": 13.925,
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
        "median_ms": 14.1379,
        "p95_ms": 14.1379,
        "min_ms": 14.1379,
        "max_ms": 14.1379,
        "rounds": 1
      },
      "reference": {
        "median_ms": 13.925,
        "p95_ms": 13.925,
        "min_ms": 13.925,
        "max_ms": 13.925,
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
        "median_ms": 2.0763,
        "p95_ms": 2.0763,
        "min_ms": 2.0763,
        "max_ms": 2.0763,
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
        "median_ms": 1.8666,
        "p95_ms": 1.8666,
        "min_ms": 1.8666,
        "max_ms": 1.8666,
        "rounds": 1
      },
      "reference": {
        "median_ms": 2.0763,
        "p95_ms": 2.0763,
        "min_ms": 2.0763,
        "max_ms": 2.0763,
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
        "median_ms": 1.7887,
        "p95_ms": 1.7887,
        "min_ms": 1.7887,
        "max_ms": 1.7887,
        "rounds": 1
      },
      "reference": {
        "median_ms": 2.0763,
        "p95_ms": 2.0763,
        "min_ms": 2.0763,
        "max_ms": 2.0763,
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
        "median_ms": 20.4206,
        "p95_ms": 20.4206,
        "min_ms": 20.4206,
        "max_ms": 20.4206,
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
        "median_ms": 21.2964,
        "p95_ms": 21.2964,
        "min_ms": 21.2964,
        "max_ms": 21.2964,
        "rounds": 1
      },
      "reference": {
        "median_ms": 20.4206,
        "p95_ms": 20.4206,
        "min_ms": 20.4206,
        "max_ms": 20.4206,
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
        "median_ms": 32.1713,
        "p95_ms": 32.1713,
        "min_ms": 32.1713,
        "max_ms": 32.1713,
        "rounds": 1
      },
      "reference": {
        "median_ms": 20.4206,
        "p95_ms": 20.4206,
        "min_ms": 20.4206,
        "max_ms": 20.4206,
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
        "median_ms": 39.7279,
        "p95_ms": 39.7279,
        "min_ms": 39.7279,
        "max_ms": 39.7279,
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
        "median_ms": 35.3018,
        "p95_ms": 35.3018,
        "min_ms": 35.3018,
        "max_ms": 35.3018,
        "rounds": 1
      },
      "reference": {
        "median_ms": 39.7279,
        "p95_ms": 39.7279,
        "min_ms": 39.7279,
        "max_ms": 39.7279,
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
        "median_ms": 40.362,
        "p95_ms": 40.362,
        "min_ms": 40.362,
        "max_ms": 40.362,
        "rounds": 1
      },
      "reference": {
        "median_ms": 39.7279,
        "p95_ms": 39.7279,
        "min_ms": 39.7279,
        "max_ms": 39.7279,
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
        "median_ms": 1116.7358,
        "p95_ms": 1116.7358,
        "min_ms": 1116.7358,
        "max_ms": 1116.7358,
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
        "median_ms": 1117.2966,
        "p95_ms": 1117.2966,
        "min_ms": 1117.2966,
        "max_ms": 1117.2966,
        "rounds": 1
      },
      "reference": {
        "median_ms": 1116.7358,
        "p95_ms": 1116.7358,
        "min_ms": 1116.7358,
        "max_ms": 1116.7358,
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
        "median_ms": 1112.5246,
        "p95_ms": 1112.5246,
        "min_ms": 1112.5246,
        "max_ms": 1112.5246,
        "rounds": 1
      },
      "reference": {
        "median_ms": 1116.7358,
        "p95_ms": 1116.7358,
        "min_ms": 1116.7358,
        "max_ms": 1116.7358,
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
        "median_ms": 6.4883,
        "p95_ms": 6.4883,
        "min_ms": 6.4883,
        "max_ms": 6.4883,
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
        "median_ms": 6.702,
        "p95_ms": 6.702,
        "min_ms": 6.702,
        "max_ms": 6.702,
        "rounds": 1
      },
      "reference": {
        "median_ms": 6.4883,
        "p95_ms": 6.4883,
        "min_ms": 6.4883,
        "max_ms": 6.4883,
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
        "median_ms": 8.2326,
        "p95_ms": 8.2326,
        "min_ms": 8.2326,
        "max_ms": 8.2326,
        "rounds": 1
      },
      "reference": {
        "median_ms": 6.4883,
        "p95_ms": 6.4883,
        "min_ms": 6.4883,
        "max_ms": 6.4883,
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
        "median_ms": 1.157,
        "p95_ms": 1.157,
        "min_ms": 1.157,
        "max_ms": 1.157,
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
        "median_ms": 0.5721,
        "p95_ms": 0.5721,
        "min_ms": 0.5721,
        "max_ms": 0.5721,
        "rounds": 1
      },
      "reference": {
        "median_ms": 1.157,
        "p95_ms": 1.157,
        "min_ms": 1.157,
        "max_ms": 1.157,
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
        "median_ms": 0.8683,
        "p95_ms": 0.8683,
        "min_ms": 0.8683,
        "max_ms": 0.8683,
        "rounds": 1
      },
      "reference": {
        "median_ms": 1.157,
        "p95_ms": 1.157,
        "min_ms": 1.157,
        "max_ms": 1.157,
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
        "median_ms": 9.4807,
        "p95_ms": 9.4807,
        "min_ms": 9.4807,
        "max_ms": 9.4807,
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
        "median_ms": 8.6447,
        "p95_ms": 8.6447,
        "min_ms": 8.6447,
        "max_ms": 8.6447,
        "rounds": 1
      },
      "reference": {
        "median_ms": 9.4807,
        "p95_ms": 9.4807,
        "min_ms": 9.4807,
        "max_ms": 9.4807,
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
        "median_ms": 16.8467,
        "p95_ms": 16.8467,
        "min_ms": 16.8467,
        "max_ms": 16.8467,
        "rounds": 1
      },
      "reference": {
        "median_ms": 9.4807,
        "p95_ms": 9.4807,
        "min_ms": 9.4807,
        "max_ms": 9.4807,
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
        "median_ms": 32.2003,
        "p95_ms": 32.2003,
        "min_ms": 32.2003,
        "max_ms": 32.2003,
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
        "median_ms": 21.7775,
        "p95_ms": 21.7775,
        "min_ms": 21.7775,
        "max_ms": 21.7775,
        "rounds": 1
      },
      "reference": {
        "median_ms": 32.2003,
        "p95_ms": 32.2003,
        "min_ms": 32.2003,
        "max_ms": 32.2003,
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
        "median_ms": 29.4642,
        "p95_ms": 29.4642,
        "min_ms": 29.4642,
        "max_ms": 29.4642,
        "rounds": 1
      },
      "reference": {
        "median_ms": 32.2003,
        "p95_ms": 32.2003,
        "min_ms": 32.2003,
        "max_ms": 32.2003,
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
        "median_ms": 27.7306,
        "p95_ms": 27.7306,
        "min_ms": 27.7306,
        "max_ms": 27.7306,
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
        "median_ms": 29.7277,
        "p95_ms": 29.7277,
        "min_ms": 29.7277,
        "max_ms": 29.7277,
        "rounds": 1
      },
      "reference": {
        "median_ms": 27.7306,
        "p95_ms": 27.7306,
        "min_ms": 27.7306,
        "max_ms": 27.7306,
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
        "median_ms": 25.911,
        "p95_ms": 25.911,
        "min_ms": 25.911,
        "max_ms": 25.911,
        "rounds": 1
      },
      "reference": {
        "median_ms": 27.7306,
        "p95_ms": 27.7306,
        "min_ms": 27.7306,
        "max_ms": 27.7306,
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
        "median_ms": 22.5527,
        "p95_ms": 22.5527,
        "min_ms": 22.5527,
        "max_ms": 22.5527,
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
        "median_ms": 17.5349,
        "p95_ms": 17.5349,
        "min_ms": 17.5349,
        "max_ms": 17.5349,
        "rounds": 1
      },
      "reference": {
        "median_ms": 22.5527,
        "p95_ms": 22.5527,
        "min_ms": 22.5527,
        "max_ms": 22.5527,
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
        "median_ms": 22.5039,
        "p95_ms": 22.5039,
        "min_ms": 22.5039,
        "max_ms": 22.5039,
        "rounds": 1
      },
      "reference": {
        "median_ms": 22.5527,
        "p95_ms": 22.5527,
        "min_ms": 22.5527,
        "max_ms": 22.5527,
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
        "median_ms": 30.2373,
        "p95_ms": 30.2373,
        "min_ms": 30.2373,
        "max_ms": 30.2373,
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
        "median_ms": 22.4785,
        "p95_ms": 22.4785,
        "min_ms": 22.4785,
        "max_ms": 22.4785,
        "rounds": 1
      },
      "reference": {
        "median_ms": 30.2373,
        "p95_ms": 30.2373,
        "min_ms": 30.2373,
        "max_ms": 30.2373,
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
        "median_ms": 25.7053,
        "p95_ms": 25.7053,
        "min_ms": 25.7053,
        "max_ms": 25.7053,
        "rounds": 1
      },
      "reference": {
        "median_ms": 30.2373,
        "p95_ms": 30.2373,
        "min_ms": 30.2373,
        "max_ms": 30.2373,
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
        "median_ms": 1.9772,
        "p95_ms": 1.9772,
        "min_ms": 1.9772,
        "max_ms": 1.9772,
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
        "median_ms": 1.1449,
        "p95_ms": 1.1449,
        "min_ms": 1.1449,
        "max_ms": 1.1449,
        "rounds": 1
      },
      "reference": {
        "median_ms": 1.9772,
        "p95_ms": 1.9772,
        "min_ms": 1.9772,
        "max_ms": 1.9772,
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
        "median_ms": 1.3589,
        "p95_ms": 1.3589,
        "min_ms": 1.3589,
        "max_ms": 1.3589,
        "rounds": 1
      },
      "reference": {
        "median_ms": 1.9772,
        "p95_ms": 1.9772,
        "min_ms": 1.9772,
        "max_ms": 1.9772,
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
        "median_ms": 4.8162,
        "p95_ms": 4.8162,
        "min_ms": 4.8162,
        "max_ms": 4.8162,
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
        "median_ms": 2.9689,
        "p95_ms": 2.9689,
        "min_ms": 2.9689,
        "max_ms": 2.9689,
        "rounds": 1
      },
      "reference": {
        "median_ms": 4.8162,
        "p95_ms": 4.8162,
        "min_ms": 4.8162,
        "max_ms": 4.8162,
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
        "median_ms": 4.4441,
        "p95_ms": 4.4441,
        "min_ms": 4.4441,
        "max_ms": 4.4441,
        "rounds": 1
      },
      "reference": {
        "median_ms": 4.8162,
        "p95_ms": 4.8162,
        "min_ms": 4.8162,
        "max_ms": 4.8162,
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
        "median_ms": 21.7156,
        "p95_ms": 21.7156,
        "min_ms": 21.7156,
        "max_ms": 21.7156,
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
        "median_ms": 22.2567,
        "p95_ms": 22.2567,
        "min_ms": 22.2567,
        "max_ms": 22.2567,
        "rounds": 1
      },
      "reference": {
        "median_ms": 21.7156,
        "p95_ms": 21.7156,
        "min_ms": 21.7156,
        "max_ms": 21.7156,
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
        "median_ms": 22.5662,
        "p95_ms": 22.5662,
        "min_ms": 22.5662,
        "max_ms": 22.5662,
        "rounds": 1
      },
      "reference": {
        "median_ms": 21.7156,
        "p95_ms": 21.7156,
        "min_ms": 21.7156,
        "max_ms": 21.7156,
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
        "median_ms": 7.9346,
        "p95_ms": 7.9346,
        "min_ms": 7.9346,
        "max_ms": 7.9346,
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
        "median_ms": 6.6807,
        "p95_ms": 6.6807,
        "min_ms": 6.6807,
        "max_ms": 6.6807,
        "rounds": 1
      },
      "reference": {
        "median_ms": 7.9346,
        "p95_ms": 7.9346,
        "min_ms": 7.9346,
        "max_ms": 7.9346,
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
        "median_ms": 4.6435,
        "p95_ms": 4.6435,
        "min_ms": 4.6435,
        "max_ms": 4.6435,
        "rounds": 1
      },
      "reference": {
        "median_ms": 7.9346,
        "p95_ms": 7.9346,
        "min_ms": 7.9346,
        "max_ms": 7.9346,
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
        "median_ms": 8.9242,
        "p95_ms": 8.9242,
        "min_ms": 8.9242,
        "max_ms": 8.9242,
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
        "median_ms": 7.2635,
        "p95_ms": 7.2635,
        "min_ms": 7.2635,
        "max_ms": 7.2635,
        "rounds": 1
      },
      "reference": {
        "median_ms": 8.9242,
        "p95_ms": 8.9242,
        "min_ms": 8.9242,
        "max_ms": 8.9242,
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
        "median_ms": 7.8071,
        "p95_ms": 7.8071,
        "min_ms": 7.8071,
        "max_ms": 7.8071,
        "rounds": 1
      },
      "reference": {
        "median_ms": 8.9242,
        "p95_ms": 8.9242,
        "min_ms": 8.9242,
        "max_ms": 8.9242,
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
        "median_ms": 2.0291,
        "p95_ms": 2.0291,
        "min_ms": 2.0291,
        "max_ms": 2.0291,
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
        "median_ms": 1.1692,
        "p95_ms": 1.1692,
        "min_ms": 1.1692,
        "max_ms": 1.1692,
        "rounds": 1
      },
      "reference": {
        "median_ms": 2.0291,
        "p95_ms": 2.0291,
        "min_ms": 2.0291,
        "max_ms": 2.0291,
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
        "median_ms": 0.9931,
        "p95_ms": 0.9931,
        "min_ms": 0.9931,
        "max_ms": 0.9931,
        "rounds": 1
      },
      "reference": {
        "median_ms": 2.0291,
        "p95_ms": 2.0291,
        "min_ms": 2.0291,
        "max_ms": 2.0291,
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
        "median_ms": 8.0554,
        "p95_ms": 8.0554,
        "min_ms": 8.0554,
        "max_ms": 8.0554,
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
        "median_ms": 2.4515,
        "p95_ms": 2.4515,
        "min_ms": 2.4515,
        "max_ms": 2.4515,
        "rounds": 1
      },
      "reference": {
        "median_ms": 8.0554,
        "p95_ms": 8.0554,
        "min_ms": 8.0554,
        "max_ms": 8.0554,
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
        "median_ms": 4.3984,
        "p95_ms": 4.3984,
        "min_ms": 4.3984,
        "max_ms": 4.3984,
        "rounds": 1
      },
      "reference": {
        "median_ms": 8.0554,
        "p95_ms": 8.0554,
        "min_ms": 8.0554,
        "max_ms": 8.0554,
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
        "median_ms": 21.6276,
        "p95_ms": 21.6276,
        "min_ms": 21.6276,
        "max_ms": 21.6276,
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
        "median_ms": 8.7813,
        "p95_ms": 8.7813,
        "min_ms": 8.7813,
        "max_ms": 8.7813,
        "rounds": 1
      },
      "reference": {
        "median_ms": 21.6276,
        "p95_ms": 21.6276,
        "min_ms": 21.6276,
        "max_ms": 21.6276,
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
        "median_ms": 32.4618,
        "p95_ms": 32.4618,
        "min_ms": 32.4618,
        "max_ms": 32.4618,
        "rounds": 1
      },
      "reference": {
        "median_ms": 21.6276,
        "p95_ms": 21.6276,
        "min_ms": 21.6276,
        "max_ms": 21.6276,
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
        "median_ms": 29.4978,
        "p95_ms": 29.4978,
        "min_ms": 29.4978,
        "max_ms": 29.4978,
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
        "median_ms": 13.7177,
        "p95_ms": 13.7177,
        "min_ms": 13.7177,
        "max_ms": 13.7177,
        "rounds": 1
      },
      "reference": {
        "median_ms": 29.4978,
        "p95_ms": 29.4978,
        "min_ms": 29.4978,
        "max_ms": 29.4978,
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
        "median_ms": 16.1942,
        "p95_ms": 16.1942,
        "min_ms": 16.1942,
        "max_ms": 16.1942,
        "rounds": 1
      },
      "reference": {
        "median_ms": 29.4978,
        "p95_ms": 29.4978,
        "min_ms": 29.4978,
        "max_ms": 29.4978,
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
        "median_ms": 3.4099,
        "p95_ms": 3.4099,
        "min_ms": 3.4099,
        "max_ms": 3.4099,
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
        "median_ms": 1.9051,
        "p95_ms": 1.9051,
        "min_ms": 1.9051,
        "max_ms": 1.9051,
        "rounds": 1
      },
      "reference": {
        "median_ms": 3.4099,
        "p95_ms": 3.4099,
        "min_ms": 3.4099,
        "max_ms": 3.4099,
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
        "median_ms": 4.1228,
        "p95_ms": 4.1228,
        "min_ms": 4.1228,
        "max_ms": 4.1228,
        "rounds": 1
      },
      "reference": {
        "median_ms": 3.4099,
        "p95_ms": 3.4099,
        "min_ms": 3.4099,
        "max_ms": 3.4099,
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
        "median_ms": 243.0702,
        "p95_ms": 243.0702,
        "min_ms": 243.0702,
        "max_ms": 243.0702,
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
        "median_ms": 252.3118,
        "p95_ms": 252.3118,
        "min_ms": 252.3118,
        "max_ms": 252.3118,
        "rounds": 1
      },
      "reference": {
        "median_ms": 243.0702,
        "p95_ms": 243.0702,
        "min_ms": 243.0702,
        "max_ms": 243.0702,
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
        "median_ms": 241.754,
        "p95_ms": 241.754,
        "min_ms": 241.754,
        "max_ms": 241.754,
        "rounds": 1
      },
      "reference": {
        "median_ms": 243.0702,
        "p95_ms": 243.0702,
        "min_ms": 243.0702,
        "max_ms": 243.0702,
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
        "median_ms": 7.1108,
        "p95_ms": 7.1108,
        "min_ms": 7.1108,
        "max_ms": 7.1108,
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
        "median_ms": 5.3277,
        "p95_ms": 5.3277,
        "min_ms": 5.3277,
        "max_ms": 5.3277,
        "rounds": 1
      },
      "reference": {
        "median_ms": 7.1108,
        "p95_ms": 7.1108,
        "min_ms": 7.1108,
        "max_ms": 7.1108,
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
        "median_ms": 5.5647,
        "p95_ms": 5.5647,
        "min_ms": 5.5647,
        "max_ms": 5.5647,
        "rounds": 1
      },
      "reference": {
        "median_ms": 7.1108,
        "p95_ms": 7.1108,
        "min_ms": 7.1108,
        "max_ms": 7.1108,
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
        "median_ms": 10.7119,
        "p95_ms": 10.7119,
        "min_ms": 10.7119,
        "max_ms": 10.7119,
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
        "median_ms": 11.5379,
        "p95_ms": 11.5379,
        "min_ms": 11.5379,
        "max_ms": 11.5379,
        "rounds": 1
      },
      "reference": {
        "median_ms": 10.7119,
        "p95_ms": 10.7119,
        "min_ms": 10.7119,
        "max_ms": 10.7119,
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
        "median_ms": 12.8093,
        "p95_ms": 12.8093,
        "min_ms": 12.8093,
        "max_ms": 12.8093,
        "rounds": 1
      },
      "reference": {
        "median_ms": 10.7119,
        "p95_ms": 10.7119,
        "min_ms": 10.7119,
        "max_ms": 10.7119,
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
        "median_ms": 36.5262,
        "p95_ms": 36.5262,
        "min_ms": 36.5262,
        "max_ms": 36.5262,
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
        "median_ms": 30.1969,
        "p95_ms": 30.1969,
        "min_ms": 30.1969,
        "max_ms": 30.1969,
        "rounds": 1
      },
      "reference": {
        "median_ms": 36.5262,
        "p95_ms": 36.5262,
        "min_ms": 36.5262,
        "max_ms": 36.5262,
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
        "median_ms": 42.0524,
        "p95_ms": 42.0524,
        "min_ms": 42.0524,
        "max_ms": 42.0524,
        "rounds": 1
      },
      "reference": {
        "median_ms": 36.5262,
        "p95_ms": 36.5262,
        "min_ms": 36.5262,
        "max_ms": 36.5262,
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
        "median_ms": 13.1716,
        "p95_ms": 13.1716,
        "min_ms": 13.1716,
        "max_ms": 13.1716,
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
        "median_ms": 10.4084,
        "p95_ms": 10.4084,
        "min_ms": 10.4084,
        "max_ms": 10.4084,
        "rounds": 1
      },
      "reference": {
        "median_ms": 13.1716,
        "p95_ms": 13.1716,
        "min_ms": 13.1716,
        "max_ms": 13.1716,
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
        "median_ms": 8.6356,
        "p95_ms": 8.6356,
        "min_ms": 8.6356,
        "max_ms": 8.6356,
        "rounds": 1
      },
      "reference": {
        "median_ms": 13.1716,
        "p95_ms": 13.1716,
        "min_ms": 13.1716,
        "max_ms": 13.1716,
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
        "median_ms": 10.137,
        "p95_ms": 10.137,
        "min_ms": 10.137,
        "max_ms": 10.137,
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
        "median_ms": 11.4913,
        "p95_ms": 11.4913,
        "min_ms": 11.4913,
        "max_ms": 11.4913,
        "rounds": 1
      },
      "reference": {
        "median_ms": 10.137,
        "p95_ms": 10.137,
        "min_ms": 10.137,
        "max_ms": 10.137,
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
        "median_ms": 9.8791,
        "p95_ms": 9.8791,
        "min_ms": 9.8791,
        "max_ms": 9.8791,
        "rounds": 1
      },
      "reference": {
        "median_ms": 10.137,
        "p95_ms": 10.137,
        "min_ms": 10.137,
        "max_ms": 10.137,
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
        "median_ms": 2.3749,
        "p95_ms": 2.3749,
        "min_ms": 2.3749,
        "max_ms": 2.3749,
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
        "median_ms": 1.5063,
        "p95_ms": 1.5063,
        "min_ms": 1.5063,
        "max_ms": 1.5063,
        "rounds": 1
      },
      "reference": {
        "median_ms": 2.3749,
        "p95_ms": 2.3749,
        "min_ms": 2.3749,
        "max_ms": 2.3749,
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
        "median_ms": 1.866,
        "p95_ms": 1.866,
        "min_ms": 1.866,
        "max_ms": 1.866,
        "rounds": 1
      },
      "reference": {
        "median_ms": 2.3749,
        "p95_ms": 2.3749,
        "min_ms": 2.3749,
        "max_ms": 2.3749,
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
        "median_ms": 20.0113,
        "p95_ms": 20.0113,
        "min_ms": 20.0113,
        "max_ms": 20.0113,
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
        "median_ms": 21.5303,
        "p95_ms": 21.5303,
        "min_ms": 21.5303,
        "max_ms": 21.5303,
        "rounds": 1
      },
      "reference": {
        "median_ms": 20.0113,
        "p95_ms": 20.0113,
        "min_ms": 20.0113,
        "max_ms": 20.0113,
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
        "median_ms": 22.159,
        "p95_ms": 22.159,
        "min_ms": 22.159,
        "max_ms": 22.159,
        "rounds": 1
      },
      "reference": {
        "median_ms": 20.0113,
        "p95_ms": 20.0113,
        "min_ms": 20.0113,
        "max_ms": 20.0113,
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
        "median_ms": 10.3811,
        "p95_ms": 10.3811,
        "min_ms": 10.3811,
        "max_ms": 10.3811,
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
        "median_ms": 7.2047,
        "p95_ms": 7.2047,
        "min_ms": 7.2047,
        "max_ms": 7.2047,
        "rounds": 1
      },
      "reference": {
        "median_ms": 10.3811,
        "p95_ms": 10.3811,
        "min_ms": 10.3811,
        "max_ms": 10.3811,
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
        "median_ms": 11.8955,
        "p95_ms": 11.8955,
        "min_ms": 11.8955,
        "max_ms": 11.8955,
        "rounds": 1
      },
      "reference": {
        "median_ms": 10.3811,
        "p95_ms": 10.3811,
        "min_ms": 10.3811,
        "max_ms": 10.3811,
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
        "median_ms": 23.5276,
        "p95_ms": 23.5276,
        "min_ms": 23.5276,
        "max_ms": 23.5276,
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
        "median_ms": 23.1977,
        "p95_ms": 23.1977,
        "min_ms": 23.1977,
        "max_ms": 23.1977,
        "rounds": 1
      },
      "reference": {
        "median_ms": 23.5276,
        "p95_ms": 23.5276,
        "min_ms": 23.5276,
        "max_ms": 23.5276,
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
        "median_ms": 20.948,
        "p95_ms": 20.948,
        "min_ms": 20.948,
        "max_ms": 20.948,
        "rounds": 1
      },
      "reference": {
        "median_ms": 23.5276,
        "p95_ms": 23.5276,
        "min_ms": 23.5276,
        "max_ms": 23.5276,
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
        "median_ms": 0.8889,
        "p95_ms": 0.8889,
        "min_ms": 0.8889,
        "max_ms": 0.8889,
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
        "median_ms": 0.539,
        "p95_ms": 0.539,
        "min_ms": 0.539,
        "max_ms": 0.539,
        "rounds": 1
      },
      "reference": {
        "median_ms": 0.8889,
        "p95_ms": 0.8889,
        "min_ms": 0.8889,
        "max_ms": 0.8889,
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
        "median_ms": 0.9221,
        "p95_ms": 0.9221,
        "min_ms": 0.9221,
        "max_ms": 0.9221,
        "rounds": 1
      },
      "reference": {
        "median_ms": 0.8889,
        "p95_ms": 0.8889,
        "min_ms": 0.8889,
        "max_ms": 0.8889,
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
        "median_ms": 0.9665,
        "p95_ms": 0.9665,
        "min_ms": 0.9665,
        "max_ms": 0.9665,
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
        "median_ms": 0.7048,
        "p95_ms": 0.7048,
        "min_ms": 0.7048,
        "max_ms": 0.7048,
        "rounds": 1
      },
      "reference": {
        "median_ms": 0.9665,
        "p95_ms": 0.9665,
        "min_ms": 0.9665,
        "max_ms": 0.9665,
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
        "median_ms": 0.8504,
        "p95_ms": 0.8504,
        "min_ms": 0.8504,
        "max_ms": 0.8504,
        "rounds": 1
      },
      "reference": {
        "median_ms": 0.9665,
        "p95_ms": 0.9665,
        "min_ms": 0.9665,
        "max_ms": 0.9665,
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
        "median_ms": 154.3523,
        "p95_ms": 154.3523,
        "min_ms": 154.3523,
        "max_ms": 154.3523,
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
        "median_ms": 157.0633,
        "p95_ms": 157.0633,
        "min_ms": 157.0633,
        "max_ms": 157.0633,
        "rounds": 1
      },
      "reference": {
        "median_ms": 154.3523,
        "p95_ms": 154.3523,
        "min_ms": 154.3523,
        "max_ms": 154.3523,
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
        "median_ms": 163.1543,
        "p95_ms": 163.1543,
        "min_ms": 163.1543,
        "max_ms": 163.1543,
        "rounds": 1
      },
      "reference": {
        "median_ms": 154.3523,
        "p95_ms": 154.3523,
        "min_ms": 154.3523,
        "max_ms": 154.3523,
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
        "median_ms": 11.1363,
        "p95_ms": 11.1363,
        "min_ms": 11.1363,
        "max_ms": 11.1363,
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
        "median_ms": 8.4749,
        "p95_ms": 8.4749,
        "min_ms": 8.4749,
        "max_ms": 8.4749,
        "rounds": 1
      },
      "reference": {
        "median_ms": 11.1363,
        "p95_ms": 11.1363,
        "min_ms": 11.1363,
        "max_ms": 11.1363,
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
        "median_ms": 7.6407,
        "p95_ms": 7.6407,
        "min_ms": 7.6407,
        "max_ms": 7.6407,
        "rounds": 1
      },
      "reference": {
        "median_ms": 11.1363,
        "p95_ms": 11.1363,
        "min_ms": 11.1363,
        "max_ms": 11.1363,
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
        "median_ms": 106.4061,
        "p95_ms": 106.4061,
        "min_ms": 106.4061,
        "max_ms": 106.4061,
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
        "median_ms": 108.506,
        "p95_ms": 108.506,
        "min_ms": 108.506,
        "max_ms": 108.506,
        "rounds": 1
      },
      "reference": {
        "median_ms": 106.4061,
        "p95_ms": 106.4061,
        "min_ms": 106.4061,
        "max_ms": 106.4061,
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
        "median_ms": 110.3663,
        "p95_ms": 110.3663,
        "min_ms": 110.3663,
        "max_ms": 110.3663,
        "rounds": 1
      },
      "reference": {
        "median_ms": 106.4061,
        "p95_ms": 106.4061,
        "min_ms": 106.4061,
        "max_ms": 106.4061,
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
        "median_ms": 7.9803,
        "p95_ms": 7.9803,
        "min_ms": 7.9803,
        "max_ms": 7.9803,
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
        "median_ms": 5.3203,
        "p95_ms": 5.3203,
        "min_ms": 5.3203,
        "max_ms": 5.3203,
        "rounds": 1
      },
      "reference": {
        "median_ms": 7.9803,
        "p95_ms": 7.9803,
        "min_ms": 7.9803,
        "max_ms": 7.9803,
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
        "median_ms": 7.0314,
        "p95_ms": 7.0314,
        "min_ms": 7.0314,
        "max_ms": 7.0314,
        "rounds": 1
      },
      "reference": {
        "median_ms": 7.9803,
        "p95_ms": 7.9803,
        "min_ms": 7.9803,
        "max_ms": 7.9803,
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
        "median_ms": 2.9065,
        "p95_ms": 2.9065,
        "min_ms": 2.9065,
        "max_ms": 2.9065,
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
        "median_ms": 3.5141,
        "p95_ms": 3.5141,
        "min_ms": 3.5141,
        "max_ms": 3.5141,
        "rounds": 1
      },
      "reference": {
        "median_ms": 2.9065,
        "p95_ms": 2.9065,
        "min_ms": 2.9065,
        "max_ms": 2.9065,
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
        "median_ms": 2.8228,
        "p95_ms": 2.8228,
        "min_ms": 2.8228,
        "max_ms": 2.8228,
        "rounds": 1
      },
      "reference": {
        "median_ms": 2.9065,
        "p95_ms": 2.9065,
        "min_ms": 2.9065,
        "max_ms": 2.9065,
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
        "median_ms": 1.6263,
        "p95_ms": 1.6263,
        "min_ms": 1.6263,
        "max_ms": 1.6263,
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
        "median_ms": 2.9773,
        "p95_ms": 2.9773,
        "min_ms": 2.9773,
        "max_ms": 2.9773,
        "rounds": 1
      },
      "reference": {
        "median_ms": 1.6263,
        "p95_ms": 1.6263,
        "min_ms": 1.6263,
        "max_ms": 1.6263,
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
        "median_ms": 1.5962,
        "p95_ms": 1.5962,
        "min_ms": 1.5962,
        "max_ms": 1.5962,
        "rounds": 1
      },
      "reference": {
        "median_ms": 1.6263,
        "p95_ms": 1.6263,
        "min_ms": 1.6263,
        "max_ms": 1.6263,
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
        "median_ms": 4.6568,
        "p95_ms": 4.6568,
        "min_ms": 4.6568,
        "max_ms": 4.6568,
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
        "median_ms": 5.0977,
        "p95_ms": 5.0977,
        "min_ms": 5.0977,
        "max_ms": 5.0977,
        "rounds": 1
      },
      "reference": {
        "median_ms": 4.6568,
        "p95_ms": 4.6568,
        "min_ms": 4.6568,
        "max_ms": 4.6568,
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
        "median_ms": 5.2962,
        "p95_ms": 5.2962,
        "min_ms": 5.2962,
        "max_ms": 5.2962,
        "rounds": 1
      },
      "reference": {
        "median_ms": 4.6568,
        "p95_ms": 4.6568,
        "min_ms": 4.6568,
        "max_ms": 4.6568,
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
        "median_ms": 10.0485,
        "p95_ms": 10.0485,
        "min_ms": 10.0485,
        "max_ms": 10.0485,
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
        "median_ms": 24.137,
        "p95_ms": 24.137,
        "min_ms": 24.137,
        "max_ms": 24.137,
        "rounds": 1
      },
      "reference": {
        "median_ms": 10.0485,
        "p95_ms": 10.0485,
        "min_ms": 10.0485,
        "max_ms": 10.0485,
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
        "median_ms": 9.7491,
        "p95_ms": 9.7491,
        "min_ms": 9.7491,
        "max_ms": 9.7491,
        "rounds": 1
      },
      "reference": {
        "median_ms": 10.0485,
        "p95_ms": 10.0485,
        "min_ms": 10.0485,
        "max_ms": 10.0485,
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
        "median_ms": 9.3738,
        "p95_ms": 9.3738,
        "min_ms": 9.3738,
        "max_ms": 9.3738,
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
        "median_ms": 9.214,
        "p95_ms": 9.214,
        "min_ms": 9.214,
        "max_ms": 9.214,
        "rounds": 1
      },
      "reference": {
        "median_ms": 9.3738,
        "p95_ms": 9.3738,
        "min_ms": 9.3738,
        "max_ms": 9.3738,
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
        "median_ms": 8.335,
        "p95_ms": 8.335,
        "min_ms": 8.335,
        "max_ms": 8.335,
        "rounds": 1
      },
      "reference": {
        "median_ms": 9.3738,
        "p95_ms": 9.3738,
        "min_ms": 9.3738,
        "max_ms": 9.3738,
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
        "median_ms": 14.1391,
        "p95_ms": 14.1391,
        "min_ms": 14.1391,
        "max_ms": 14.1391,
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
        "median_ms": 13.0384,
        "p95_ms": 13.0384,
        "min_ms": 13.0384,
        "max_ms": 13.0384,
        "rounds": 1
      },
      "reference": {
        "median_ms": 14.1391,
        "p95_ms": 14.1391,
        "min_ms": 14.1391,
        "max_ms": 14.1391,
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
        "median_ms": 19.2723,
        "p95_ms": 19.2723,
        "min_ms": 19.2723,
        "max_ms": 19.2723,
        "rounds": 1
      },
      "reference": {
        "median_ms": 14.1391,
        "p95_ms": 14.1391,
        "min_ms": 14.1391,
        "max_ms": 14.1391,
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
        "median_ms": 49.1281,
        "p95_ms": 49.1281,
        "min_ms": 49.1281,
        "max_ms": 49.1281,
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
        "median_ms": 42.4829,
        "p95_ms": 42.4829,
        "min_ms": 42.4829,
        "max_ms": 42.4829,
        "rounds": 1
      },
      "reference": {
        "median_ms": 49.1281,
        "p95_ms": 49.1281,
        "min_ms": 49.1281,
        "max_ms": 49.1281,
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
        "median_ms": 51.7068,
        "p95_ms": 51.7068,
        "min_ms": 51.7068,
        "max_ms": 51.7068,
        "rounds": 1
      },
      "reference": {
        "median_ms": 49.1281,
        "p95_ms": 49.1281,
        "min_ms": 49.1281,
        "max_ms": 49.1281,
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
        "median_ms": 38.1414,
        "p95_ms": 38.1414,
        "min_ms": 38.1414,
        "max_ms": 38.1414,
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
        "median_ms": 40.3419,
        "p95_ms": 40.3419,
        "min_ms": 40.3419,
        "max_ms": 40.3419,
        "rounds": 1
      },
      "reference": {
        "median_ms": 38.1414,
        "p95_ms": 38.1414,
        "min_ms": 38.1414,
        "max_ms": 38.1414,
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
        "median_ms": 48.5475,
        "p95_ms": 48.5475,
        "min_ms": 48.5475,
        "max_ms": 48.5475,
        "rounds": 1
      },
      "reference": {
        "median_ms": 38.1414,
        "p95_ms": 38.1414,
        "min_ms": 38.1414,
        "max_ms": 38.1414,
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
        "median_ms": 22.9694,
        "p95_ms": 22.9694,
        "min_ms": 22.9694,
        "max_ms": 22.9694,
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
        "median_ms": 23.4707,
        "p95_ms": 23.4707,
        "min_ms": 23.4707,
        "max_ms": 23.4707,
        "rounds": 1
      },
      "reference": {
        "median_ms": 22.9694,
        "p95_ms": 22.9694,
        "min_ms": 22.9694,
        "max_ms": 22.9694,
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
        "median_ms": 25.02,
        "p95_ms": 25.02,
        "min_ms": 25.02,
        "max_ms": 25.02,
        "rounds": 1
      },
      "reference": {
        "median_ms": 22.9694,
        "p95_ms": 22.9694,
        "min_ms": 22.9694,
        "max_ms": 22.9694,
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
        "median_ms": 25.5529,
        "p95_ms": 25.5529,
        "min_ms": 25.5529,
        "max_ms": 25.5529,
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
        "median_ms": 27.9337,
        "p95_ms": 27.9337,
        "min_ms": 27.9337,
        "max_ms": 27.9337,
        "rounds": 1
      },
      "reference": {
        "median_ms": 25.5529,
        "p95_ms": 25.5529,
        "min_ms": 25.5529,
        "max_ms": 25.5529,
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
        "median_ms": 22.7203,
        "p95_ms": 22.7203,
        "min_ms": 22.7203,
        "max_ms": 22.7203,
        "rounds": 1
      },
      "reference": {
        "median_ms": 25.5529,
        "p95_ms": 25.5529,
        "min_ms": 25.5529,
        "max_ms": 25.5529,
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
        "median_ms": 20.1409,
        "p95_ms": 20.1409,
        "min_ms": 20.1409,
        "max_ms": 20.1409,
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
        "median_ms": 18.2134,
        "p95_ms": 18.2134,
        "min_ms": 18.2134,
        "max_ms": 18.2134,
        "rounds": 1
      },
      "reference": {
        "median_ms": 20.1409,
        "p95_ms": 20.1409,
        "min_ms": 20.1409,
        "max_ms": 20.1409,
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
        "median_ms": 17.3452,
        "p95_ms": 17.3452,
        "min_ms": 17.3452,
        "max_ms": 17.3452,
        "rounds": 1
      },
      "reference": {
        "median_ms": 20.1409,
        "p95_ms": 20.1409,
        "min_ms": 20.1409,
        "max_ms": 20.1409,
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
        "median_ms": 26.1433,
        "p95_ms": 26.1433,
        "min_ms": 26.1433,
        "max_ms": 26.1433,
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
        "median_ms": 25.1864,
        "p95_ms": 25.1864,
        "min_ms": 25.1864,
        "max_ms": 25.1864,
        "rounds": 1
      },
      "reference": {
        "median_ms": 26.1433,
        "p95_ms": 26.1433,
        "min_ms": 26.1433,
        "max_ms": 26.1433,
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
        "median_ms": 27.2256,
        "p95_ms": 27.2256,
        "min_ms": 27.2256,
        "max_ms": 27.2256,
        "rounds": 1
      },
      "reference": {
        "median_ms": 26.1433,
        "p95_ms": 26.1433,
        "min_ms": 26.1433,
        "max_ms": 26.1433,
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
        "median_ms": 0.339,
        "p95_ms": 0.339,
        "min_ms": 0.339,
        "max_ms": 0.339,
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
        "median_ms": 0.3714,
        "p95_ms": 0.3714,
        "min_ms": 0.3714,
        "max_ms": 0.3714,
        "rounds": 1
      },
      "reference": {
        "median_ms": 0.339,
        "p95_ms": 0.339,
        "min_ms": 0.339,
        "max_ms": 0.339,
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
        "median_ms": 0.3355,
        "p95_ms": 0.3355,
        "min_ms": 0.3355,
        "max_ms": 0.3355,
        "rounds": 1
      },
      "reference": {
        "median_ms": 0.339,
        "p95_ms": 0.339,
        "min_ms": 0.339,
        "max_ms": 0.339,
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
      "workload": "zset-add-options@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 57.4608,
        "p95_ms": 57.4608,
        "min_ms": 57.4608,
        "max_ms": 57.4608,
        "rounds": 1
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
        "median_ms": 59.1087,
        "p95_ms": 59.1087,
        "min_ms": 59.1087,
        "max_ms": 59.1087,
        "rounds": 1
      },
      "reference": {
        "median_ms": 57.4608,
        "p95_ms": 57.4608,
        "min_ms": 57.4608,
        "max_ms": 57.4608,
        "rounds": 1
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
        "median_ms": 63.9207,
        "p95_ms": 63.9207,
        "min_ms": 63.9207,
        "max_ms": 63.9207,
        "rounds": 1
      },
      "reference": {
        "median_ms": 57.4608,
        "p95_ms": 57.4608,
        "min_ms": 57.4608,
        "max_ms": 57.4608,
        "rounds": 1
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
        "median_ms": 93.812,
        "p95_ms": 93.812,
        "min_ms": 93.812,
        "max_ms": 93.812,
        "rounds": 1
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
        "median_ms": 68.5498,
        "p95_ms": 68.5498,
        "min_ms": 68.5498,
        "max_ms": 68.5498,
        "rounds": 1
      },
      "reference": {
        "median_ms": 93.812,
        "p95_ms": 93.812,
        "min_ms": 93.812,
        "max_ms": 93.812,
        "rounds": 1
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
        "median_ms": 67.9726,
        "p95_ms": 67.9726,
        "min_ms": 67.9726,
        "max_ms": 67.9726,
        "rounds": 1
      },
      "reference": {
        "median_ms": 93.812,
        "p95_ms": 93.812,
        "min_ms": 93.812,
        "max_ms": 93.812,
        "rounds": 1
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
        "median_ms": 29.0075,
        "p95_ms": 29.0075,
        "min_ms": 29.0075,
        "max_ms": 29.0075,
        "rounds": 1
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
        "median_ms": 24.6847,
        "p95_ms": 24.6847,
        "min_ms": 24.6847,
        "max_ms": 24.6847,
        "rounds": 1
      },
      "reference": {
        "median_ms": 29.0075,
        "p95_ms": 29.0075,
        "min_ms": 29.0075,
        "max_ms": 29.0075,
        "rounds": 1
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
        "median_ms": 35.2196,
        "p95_ms": 35.2196,
        "min_ms": 35.2196,
        "max_ms": 35.2196,
        "rounds": 1
      },
      "reference": {
        "median_ms": 29.0075,
        "p95_ms": 29.0075,
        "min_ms": 29.0075,
        "max_ms": 29.0075,
        "rounds": 1
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
        "median_ms": 60.5184,
        "p95_ms": 60.5184,
        "min_ms": 60.5184,
        "max_ms": 60.5184,
        "rounds": 1
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
        "median_ms": 41.2107,
        "p95_ms": 41.2107,
        "min_ms": 41.2107,
        "max_ms": 41.2107,
        "rounds": 1
      },
      "reference": {
        "median_ms": 60.5184,
        "p95_ms": 60.5184,
        "min_ms": 60.5184,
        "max_ms": 60.5184,
        "rounds": 1
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
        "median_ms": 58.9905,
        "p95_ms": 58.9905,
        "min_ms": 58.9905,
        "max_ms": 58.9905,
        "rounds": 1
      },
      "reference": {
        "median_ms": 60.5184,
        "p95_ms": 60.5184,
        "min_ms": 60.5184,
        "max_ms": 60.5184,
        "rounds": 1
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
        "median_ms": 28.1436,
        "p95_ms": 28.1436,
        "min_ms": 28.1436,
        "max_ms": 28.1436,
        "rounds": 1
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
        "median_ms": 25.7978,
        "p95_ms": 25.7978,
        "min_ms": 25.7978,
        "max_ms": 25.7978,
        "rounds": 1
      },
      "reference": {
        "median_ms": 28.1436,
        "p95_ms": 28.1436,
        "min_ms": 28.1436,
        "max_ms": 28.1436,
        "rounds": 1
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
        "median_ms": 28.0934,
        "p95_ms": 28.0934,
        "min_ms": 28.0934,
        "max_ms": 28.0934,
        "rounds": 1
      },
      "reference": {
        "median_ms": 28.1436,
        "p95_ms": 28.1436,
        "min_ms": 28.1436,
        "max_ms": 28.1436,
        "rounds": 1
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
        "median_ms": 31.4885,
        "p95_ms": 31.4885,
        "min_ms": 31.4885,
        "max_ms": 31.4885,
        "rounds": 1
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
        "median_ms": 31.894,
        "p95_ms": 31.894,
        "min_ms": 31.894,
        "max_ms": 31.894,
        "rounds": 1
      },
      "reference": {
        "median_ms": 31.4885,
        "p95_ms": 31.4885,
        "min_ms": 31.4885,
        "max_ms": 31.4885,
        "rounds": 1
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
        "median_ms": 37.4597,
        "p95_ms": 37.4597,
        "min_ms": 37.4597,
        "max_ms": 37.4597,
        "rounds": 1
      },
      "reference": {
        "median_ms": 31.4885,
        "p95_ms": 31.4885,
        "min_ms": 31.4885,
        "max_ms": 31.4885,
        "rounds": 1
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
        "median_ms": 55.1843,
        "p95_ms": 55.1843,
        "min_ms": 55.1843,
        "max_ms": 55.1843,
        "rounds": 1
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
        "median_ms": 52.8866,
        "p95_ms": 52.8866,
        "min_ms": 52.8866,
        "max_ms": 52.8866,
        "rounds": 1
      },
      "reference": {
        "median_ms": 55.1843,
        "p95_ms": 55.1843,
        "min_ms": 55.1843,
        "max_ms": 55.1843,
        "rounds": 1
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
        "median_ms": 55.5234,
        "p95_ms": 55.5234,
        "min_ms": 55.5234,
        "max_ms": 55.5234,
        "rounds": 1
      },
      "reference": {
        "median_ms": 55.1843,
        "p95_ms": 55.1843,
        "min_ms": 55.1843,
        "max_ms": 55.1843,
        "rounds": 1
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
        "median_ms": 10.8565,
        "p95_ms": 10.8565,
        "min_ms": 10.8565,
        "max_ms": 10.8565,
        "rounds": 1
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
        "median_ms": 14.3177,
        "p95_ms": 14.3177,
        "min_ms": 14.3177,
        "max_ms": 14.3177,
        "rounds": 1
      },
      "reference": {
        "median_ms": 10.8565,
        "p95_ms": 10.8565,
        "min_ms": 10.8565,
        "max_ms": 10.8565,
        "rounds": 1
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
        "median_ms": 14.5729,
        "p95_ms": 14.5729,
        "min_ms": 14.5729,
        "max_ms": 14.5729,
        "rounds": 1
      },
      "reference": {
        "median_ms": 10.8565,
        "p95_ms": 10.8565,
        "min_ms": 10.8565,
        "max_ms": 10.8565,
        "rounds": 1
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
        "median_ms": 52.1181,
        "p95_ms": 52.1181,
        "min_ms": 52.1181,
        "max_ms": 52.1181,
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
        "median_ms": 17.7427,
        "p95_ms": 17.7427,
        "min_ms": 17.7427,
        "max_ms": 17.7427,
        "rounds": 1
      },
      "reference": {
        "median_ms": 52.1181,
        "p95_ms": 52.1181,
        "min_ms": 52.1181,
        "max_ms": 52.1181,
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
        "median_ms": 65.3108,
        "p95_ms": 65.3108,
        "min_ms": 65.3108,
        "max_ms": 65.3108,
        "rounds": 1
      },
      "reference": {
        "median_ms": 52.1181,
        "p95_ms": 52.1181,
        "min_ms": 52.1181,
        "max_ms": 52.1181,
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
