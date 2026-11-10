# Benchmark report

Command: `pnpm --dir projects/redis.ts/examples/vs-js-libraries benchmark`
Defaults: `BENCH_SET=100`, `BENCH_GET=500`, `BENCH_PIPE=500`, `BENCH_PING=1000`, `BENCH_BATCH=500`, `BENCH_COLL=200`, `BENCH_BIG=20`, `BENCH_BIG_GET=50`, `BENCH_BIG_BYTES=65536`, `BENCH_CONNECT=50`, `BENCH_STREAM=200`, `BENCH_PUBSUB=100`, `BENCH_TTL=30`, `BENCH_TXN=100`, `BENCH_ROUNDS=3`, `BENCH_WARMUP=1`
Baseline: `ioredis` against the emulated server = `1.00x`
Ratio: subject_time / baseline_time (smaller is faster). Fastest cell in each row is bold.
Stats: median/p95/min/max/rounds come from `database.harness::summarize` via `benchSummary` (addon:harnessBenchSummary + harnessBenchPerOp (database.harness::summarize / per_op_ms)); nearest-rank p95, even-length median averages the middle pair. Per-op milliseconds come from `database.harness::per_op_ms` via `benchPerOpMs`, the same DTO the summary returns. No median, p95 or per-op formula lives in this example.

## Provenance

- `node_version`: `v24.18.0`
- `rustc_version`: `rustc 1.101.0-nightly (1c3a65069 2026-11-02)`
- `target_triple`: `x86_64-pc-windows-msvc`
- `rev`: `6dec5a52a17968f59522321e5800952a4c002345`
- `plan`: `rounds=3, warmup=1`
- host: `win32-x64`
- oracle: unavailable on this host (see limitation below)

## Scenario matrix

| Workload | Scenario | Ops/round | Shape |
|----------|----------|----------:|-------|
| `get-seq` | `redis-string-get` | 500 | {"ops":"500","value_bytes":"64"} |
| `set-seq` | `redis-string-set` | 100 | {"ops":"100","value_bytes":"64"} |
| `set-pipeline` | `redis-pipeline-set` | 500 | {"ops":"500","batch":"500","value_bytes":"64"} |
| `get-pipeline` | `redis-pipeline-get` | 500 | {"ops":"500","batch":"500","value_bytes":"64"} |
| `hash-hset-hget` | `redis-hash-hset-hget` | 401 | {"fields":"200"} |
| `list-rpush-lrange` | `redis-list-rpush-lrange` | 202 | {"elements":"200"} |
| `set-sadd-smembers` | `redis-set-sadd-smembers` | 202 | {"members":"200"} |
| `zset-zadd-zrange` | `redis-zset-zadd-zrange` | 202 | {"members":"200","withscores":"true"} |
| `streams-xadd-xrange` | `redis-stream-xadd-xrange` | 202 | {"entries":"200","fields":"1"} |
| `pubsub-roundtrip` | `redis-pubsub-publish-deliver` | 100 | {"messages":"100","channels":"1"} |
| `ttl-setex-expire` | `redis-ttl-setex-expire` | 90 | {"keys":"30","ttl_seconds":"1","wait_ms":"1100"} |
| `multi-exec` | `redis-txn-multi-exec` | 102 | {"commands":"100","probe":"SET"} |
| `set-big` | `redis-big-value-set` | 20 | {"ops":"20","value_bytes":"65536"} |
| `get-big` | `redis-big-value-get` | 50 | {"ops":"50","value_bytes":"65536"} |
| `ping` | `redis-ping-rtt` | 1000 | {"ops":"1000"} |
| `connect` | `redis-connect-open-close` | 50 | {"opens":"50","probe":"PING"} |

## Relative to `ioredis`

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|-------:|-------:|-------:|
| get-seq | **1.00x** | 1.13x | 1.12x |
| set-seq | **1.00x** | 1.01x | 1.03x |
| set-pipeline | 1.00x | 0.96x | **0.92x** |
| get-pipeline | 1.00x | 1.01x | **0.83x** |
| hash-hset-hget | **1.00x** | 1.30x | 1.02x |
| list-rpush-lrange | 1.00x | 0.98x | **0.98x** |
| set-sadd-smembers | 1.00x | **0.93x** | 1.04x |
| zset-zadd-zrange | 1.00x | **0.98x** | 1.02x |
| streams-xadd-xrange | 1.00x | **0.97x** | 0.99x |
| pubsub-roundtrip | **1.00x** | 1.08x | 1.08x |
| ttl-setex-expire | 1.00x | 0.99x | **0.99x** |
| multi-exec | 1.00x | 1.01x | **0.94x** |
| set-big | 1.00x | **0.96x** | 0.97x |
| get-big | 1.00x | 1.13x | **0.99x** |
| ping | **1.00x** | 1.07x | 1.54x |
| connect | 1.00x | **0.13x** | 0.32x |

## Median and p95 (ms)

| Workload | ops | ioredis med | ioredis p95 | @yydb/redis med | @yydb/redis p95 | node-redis med | node-redis p95 |
|---------:|----:|-------:|-------:|-------:|-------:|-------:|-------:|
| get-seq | 500 | 79.13 | 88.35 | 89.62 | 130.24 | 88.29 | 110.72 |
| set-seq | 100 | 399.89 | 404.54 | 402.14 | 679.94 | 411.86 | 413.99 |
| set-pipeline | 500 | 3369.56 | 3604.82 | 3232.05 | 3281.86 | 3106.05 | 3180.33 |
| get-pipeline | 500 | 100.07 | 102.04 | 100.94 | 108.74 | 83.31 | 91.23 |
| hash-hset-hget | 401 | 984.14 | 1002.54 | 1283.34 | 1444.03 | 1004.66 | 1022.93 |
| list-rpush-lrange | 202 | 1027.72 | 1080.80 | 1009.89 | 1159.92 | 1003.97 | 1360.94 |
| set-sadd-smembers | 202 | 1061.35 | 1064.24 | 990.03 | 1010.29 | 1102.39 | 1387.35 |
| zset-zadd-zrange | 202 | 940.11 | 955.65 | 916.85 | 941.35 | 956.75 | 969.01 |
| streams-xadd-xrange | 202 | 850.51 | 868.73 | 824.84 | 835.54 | 843.79 | 852.33 |
| pubsub-roundtrip | 100 | 22.86 | 24.42 | 24.74 | 25.19 | 24.66 | 34.04 |
| ttl-setex-expire | 90 | 1229.32 | 1239.65 | 1222.65 | 1232.93 | 1221.74 | 1232.34 |
| multi-exec | 102 | 389.47 | 401.08 | 392.39 | 408.44 | 367.92 | 692.68 |
| set-big | 20 | 389.76 | 1012.07 | 375.98 | 390.03 | 376.50 | 383.58 |
| get-big | 50 | 2918.97 | 3055.33 | 3298.54 | 3437.33 | 2885.81 | 2941.56 |
| ping | 1000 | 88.86 | 90.05 | 94.83 | 99.17 | 136.85 | 145.99 |
| connect | 50 | 239.88 | 256.15 | 31.39 | 32.11 | 75.74 | 80.11 |

## Per-op and throughput (median)

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|--------:|--------:|--------:|
| get-seq | 0.158 ms/op, 6,319/s | 0.179 ms/op, 5,579/s | 0.177 ms/op, 5,663/s |
| set-seq | 3.999 ms/op, 250/s | 4.021 ms/op, 249/s | 4.119 ms/op, 243/s |
| set-pipeline | 6.739 ms/op, 148/s | 6.464 ms/op, 155/s | 6.212 ms/op, 161/s |
| get-pipeline | 0.200 ms/op, 4,996/s | 0.202 ms/op, 4,953/s | 0.167 ms/op, 6,002/s |
| hash-hset-hget | 2.454 ms/op, 407/s | 3.200 ms/op, 312/s | 2.505 ms/op, 399/s |
| list-rpush-lrange | 5.088 ms/op, 197/s | 4.999 ms/op, 200/s | 4.970 ms/op, 201/s |
| set-sadd-smembers | 5.254 ms/op, 190/s | 4.901 ms/op, 204/s | 5.457 ms/op, 183/s |
| zset-zadd-zrange | 4.654 ms/op, 215/s | 4.539 ms/op, 220/s | 4.736 ms/op, 211/s |
| streams-xadd-xrange | 4.210 ms/op, 238/s | 4.083 ms/op, 245/s | 4.177 ms/op, 239/s |
| pubsub-roundtrip | 0.229 ms/op, 4,375/s | 0.247 ms/op, 4,043/s | 0.247 ms/op, 4,055/s |
| ttl-setex-expire | 13.659 ms/op, 73/s | 13.585 ms/op, 74/s | 13.575 ms/op, 74/s |
| multi-exec | 3.818 ms/op, 262/s | 3.847 ms/op, 260/s | 3.607 ms/op, 277/s |
| set-big | 19.488 ms/op, 51/s | 18.799 ms/op, 53/s | 18.825 ms/op, 53/s |
| get-big | 58.379 ms/op, 17/s | 65.971 ms/op, 15/s | 57.716 ms/op, 17/s |
| ping | 0.089 ms/op, 11,253/s | 0.095 ms/op, 10,545/s | 0.137 ms/op, 7,307/s |
| connect | 4.798 ms/op, 208/s | 0.628 ms/op, 1,593/s | 1.515 ms/op, 660/s |

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

## Intentional deltas

- One fresh emulated server and data directory per (workload, client); the warmup
  and measured rounds of that cell share one server and one connection. Preload
  stays outside the timed region.
- Collection workloads start each round with `DEL` so rounds stay idempotent; the
  `DEL` is inside the timed region and counted in ops on every client.
- The `connect` workload measures establish + one readiness `PING` + close per op,
  so every client pays a full handshake regardless of its lazy-connect behavior.
- The product client has no reconnect, offline queue, or retry behavior. A socket
  error fails the in-flight command, while ioredis and node-redis carry their own
  machinery (offline queue disabled).
- No pooling and no auto-pipelining anywhere; pipelined cells send explicit
  equal-size batches of 500. All clients use RESP2 on one TCP connection.
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
      "txn": "100"
    },
    "data_scale": "matrix=16x3",
    "rustc_version": "rustc 1.101.0-nightly (1c3a65069 2026-11-02)",
    "node_version": "v24.18.0",
    "target_triple": "x86_64-pc-windows-msvc",
    "rev": "6dec5a52a17968f59522321e5800952a4c002345",
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
        "median_ms": 79.125,
        "p95_ms": 88.3474,
        "min_ms": 76.4249,
        "max_ms": 88.3474,
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
        "median_ms": 89.6162,
        "p95_ms": 130.2445,
        "min_ms": 85.79,
        "max_ms": 130.2445,
        "rounds": 3
      },
      "reference": {
        "median_ms": 79.125,
        "p95_ms": 88.3474,
        "min_ms": 76.4249,
        "max_ms": 88.3474,
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
        "median_ms": 88.2875,
        "p95_ms": 110.7167,
        "min_ms": 81.6685,
        "max_ms": 110.7167,
        "rounds": 3
      },
      "reference": {
        "median_ms": 79.125,
        "p95_ms": 88.3474,
        "min_ms": 76.4249,
        "max_ms": 88.3474,
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
        "median_ms": 399.8925,
        "p95_ms": 404.5361,
        "min_ms": 391.8707,
        "max_ms": 404.5361,
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
        "median_ms": 402.1428,
        "p95_ms": 679.9392,
        "min_ms": 394.0688,
        "max_ms": 679.9392,
        "rounds": 3
      },
      "reference": {
        "median_ms": 399.8925,
        "p95_ms": 404.5361,
        "min_ms": 391.8707,
        "max_ms": 404.5361,
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
        "median_ms": 411.8555,
        "p95_ms": 413.9851,
        "min_ms": 406.3444,
        "max_ms": 413.9851,
        "rounds": 3
      },
      "reference": {
        "median_ms": 399.8925,
        "p95_ms": 404.5361,
        "min_ms": 391.8707,
        "max_ms": 404.5361,
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
      "workload": "set-pipeline@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 3369.5588,
        "p95_ms": 3604.8192,
        "min_ms": 3109.3103,
        "max_ms": 3604.8192,
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
        "median_ms": 3232.0498,
        "p95_ms": 3281.861,
        "min_ms": 3134.2116,
        "max_ms": 3281.861,
        "rounds": 3
      },
      "reference": {
        "median_ms": 3369.5588,
        "p95_ms": 3604.8192,
        "min_ms": 3109.3103,
        "max_ms": 3604.8192,
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
        "median_ms": 3106.0491,
        "p95_ms": 3180.3309,
        "min_ms": 2978.1355,
        "max_ms": 3180.3309,
        "rounds": 3
      },
      "reference": {
        "median_ms": 3369.5588,
        "p95_ms": 3604.8192,
        "min_ms": 3109.3103,
        "max_ms": 3604.8192,
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
        "median_ms": 100.0707,
        "p95_ms": 102.0421,
        "min_ms": 99.8089,
        "max_ms": 102.0421,
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
        "median_ms": 100.9421,
        "p95_ms": 108.7391,
        "min_ms": 95.922,
        "max_ms": 108.7391,
        "rounds": 3
      },
      "reference": {
        "median_ms": 100.0707,
        "p95_ms": 102.0421,
        "min_ms": 99.8089,
        "max_ms": 102.0421,
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
        "median_ms": 83.3102,
        "p95_ms": 91.2276,
        "min_ms": 76.8245,
        "max_ms": 91.2276,
        "rounds": 3
      },
      "reference": {
        "median_ms": 100.0707,
        "p95_ms": 102.0421,
        "min_ms": 99.8089,
        "max_ms": 102.0421,
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
      "workload": "hash-hset-hget@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 984.143,
        "p95_ms": 1002.5407,
        "min_ms": 979.4129,
        "max_ms": 1002.5407,
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
        "median_ms": 1283.3405,
        "p95_ms": 1444.0293,
        "min_ms": 1052.2824,
        "max_ms": 1444.0293,
        "rounds": 3
      },
      "reference": {
        "median_ms": 984.143,
        "p95_ms": 1002.5407,
        "min_ms": 979.4129,
        "max_ms": 1002.5407,
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
        "median_ms": 1004.6644,
        "p95_ms": 1022.9347,
        "min_ms": 998.6813,
        "max_ms": 1022.9347,
        "rounds": 3
      },
      "reference": {
        "median_ms": 984.143,
        "p95_ms": 1002.5407,
        "min_ms": 979.4129,
        "max_ms": 1002.5407,
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
      "workload": "list-rpush-lrange@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 1027.7175,
        "p95_ms": 1080.7965,
        "min_ms": 943.4121,
        "max_ms": 1080.7965,
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
        "median_ms": 1009.889,
        "p95_ms": 1159.9211,
        "min_ms": 1007.9466,
        "max_ms": 1159.9211,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1027.7175,
        "p95_ms": 1080.7965,
        "min_ms": 943.4121,
        "max_ms": 1080.7965,
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
        "median_ms": 1003.9734,
        "p95_ms": 1360.939,
        "min_ms": 945.8147,
        "max_ms": 1360.939,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1027.7175,
        "p95_ms": 1080.7965,
        "min_ms": 943.4121,
        "max_ms": 1080.7965,
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
        "median_ms": 1061.3453,
        "p95_ms": 1064.239,
        "min_ms": 1042.4099,
        "max_ms": 1064.239,
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
        "median_ms": 990.0258,
        "p95_ms": 1010.2918,
        "min_ms": 985.315,
        "max_ms": 1010.2918,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1061.3453,
        "p95_ms": 1064.239,
        "min_ms": 1042.4099,
        "max_ms": 1064.239,
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
        "median_ms": 1102.3916,
        "p95_ms": 1387.3473,
        "min_ms": 1023.8927,
        "max_ms": 1387.3473,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1061.3453,
        "p95_ms": 1064.239,
        "min_ms": 1042.4099,
        "max_ms": 1064.239,
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
        "median_ms": 940.1104,
        "p95_ms": 955.6521,
        "min_ms": 925.515,
        "max_ms": 955.6521,
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
        "median_ms": 916.8458,
        "p95_ms": 941.3471,
        "min_ms": 897.718,
        "max_ms": 941.3471,
        "rounds": 3
      },
      "reference": {
        "median_ms": 940.1104,
        "p95_ms": 955.6521,
        "min_ms": 925.515,
        "max_ms": 955.6521,
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
        "median_ms": 956.75,
        "p95_ms": 969.0137,
        "min_ms": 943.9224,
        "max_ms": 969.0137,
        "rounds": 3
      },
      "reference": {
        "median_ms": 940.1104,
        "p95_ms": 955.6521,
        "min_ms": 925.515,
        "max_ms": 955.6521,
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
        "median_ms": 850.5117,
        "p95_ms": 868.7257,
        "min_ms": 842.7037,
        "max_ms": 868.7257,
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
        "median_ms": 824.8397,
        "p95_ms": 835.5412,
        "min_ms": 823.1111,
        "max_ms": 835.5412,
        "rounds": 3
      },
      "reference": {
        "median_ms": 850.5117,
        "p95_ms": 868.7257,
        "min_ms": 842.7037,
        "max_ms": 868.7257,
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
        "median_ms": 843.7928,
        "p95_ms": 852.3275,
        "min_ms": 836.1159,
        "max_ms": 852.3275,
        "rounds": 3
      },
      "reference": {
        "median_ms": 850.5117,
        "p95_ms": 868.7257,
        "min_ms": 842.7037,
        "max_ms": 868.7257,
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
        "median_ms": 22.8565,
        "p95_ms": 24.4185,
        "min_ms": 21.325,
        "max_ms": 24.4185,
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
        "median_ms": 24.7352,
        "p95_ms": 25.1916,
        "min_ms": 24.6347,
        "max_ms": 25.1916,
        "rounds": 3
      },
      "reference": {
        "median_ms": 22.8565,
        "p95_ms": 24.4185,
        "min_ms": 21.325,
        "max_ms": 24.4185,
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
        "median_ms": 24.6623,
        "p95_ms": 34.0432,
        "min_ms": 23.2568,
        "max_ms": 34.0432,
        "rounds": 3
      },
      "reference": {
        "median_ms": 22.8565,
        "p95_ms": 24.4185,
        "min_ms": 21.325,
        "max_ms": 24.4185,
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
      "workload": "ttl-setex-expire@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 1229.3195,
        "p95_ms": 1239.6488,
        "min_ms": 1207.0105,
        "max_ms": 1239.6488,
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
        "median_ms": 1222.6481,
        "p95_ms": 1232.9327,
        "min_ms": 1219.7496,
        "max_ms": 1232.9327,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1229.3195,
        "p95_ms": 1239.6488,
        "min_ms": 1207.0105,
        "max_ms": 1239.6488,
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
        "median_ms": 1221.7358,
        "p95_ms": 1232.3361,
        "min_ms": 1219.2832,
        "max_ms": 1232.3361,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1229.3195,
        "p95_ms": 1239.6488,
        "min_ms": 1207.0105,
        "max_ms": 1239.6488,
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
        "median_ms": 389.471,
        "p95_ms": 401.0785,
        "min_ms": 377.2941,
        "max_ms": 401.0785,
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
        "median_ms": 392.3914,
        "p95_ms": 408.4376,
        "min_ms": 386.5793,
        "max_ms": 408.4376,
        "rounds": 3
      },
      "reference": {
        "median_ms": 389.471,
        "p95_ms": 401.0785,
        "min_ms": 377.2941,
        "max_ms": 401.0785,
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
        "median_ms": 367.9174,
        "p95_ms": 692.684,
        "min_ms": 359.2535,
        "max_ms": 692.684,
        "rounds": 3
      },
      "reference": {
        "median_ms": 389.471,
        "p95_ms": 401.0785,
        "min_ms": 377.2941,
        "max_ms": 401.0785,
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
      "workload": "set-big@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 389.763,
        "p95_ms": 1012.0733,
        "min_ms": 389.754,
        "max_ms": 1012.0733,
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
        "median_ms": 375.9781,
        "p95_ms": 390.0287,
        "min_ms": 363.7509,
        "max_ms": 390.0287,
        "rounds": 3
      },
      "reference": {
        "median_ms": 389.763,
        "p95_ms": 1012.0733,
        "min_ms": 389.754,
        "max_ms": 1012.0733,
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
        "median_ms": 376.4987,
        "p95_ms": 383.5819,
        "min_ms": 350.0378,
        "max_ms": 383.5819,
        "rounds": 3
      },
      "reference": {
        "median_ms": 389.763,
        "p95_ms": 1012.0733,
        "min_ms": 389.754,
        "max_ms": 1012.0733,
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
        "median_ms": 2918.9657,
        "p95_ms": 3055.3269,
        "min_ms": 2818.1077,
        "max_ms": 3055.3269,
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
        "median_ms": 3298.5435,
        "p95_ms": 3437.3279,
        "min_ms": 3286.1373,
        "max_ms": 3437.3279,
        "rounds": 3
      },
      "reference": {
        "median_ms": 2918.9657,
        "p95_ms": 3055.3269,
        "min_ms": 2818.1077,
        "max_ms": 3055.3269,
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
        "median_ms": 2885.8089,
        "p95_ms": 2941.5646,
        "min_ms": 2829.383,
        "max_ms": 2941.5646,
        "rounds": 3
      },
      "reference": {
        "median_ms": 2918.9657,
        "p95_ms": 3055.3269,
        "min_ms": 2818.1077,
        "max_ms": 3055.3269,
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
      "workload": "ping@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 88.8636,
        "p95_ms": 90.0486,
        "min_ms": 82.6932,
        "max_ms": 90.0486,
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
        "median_ms": 94.8284,
        "p95_ms": 99.1741,
        "min_ms": 92.4985,
        "max_ms": 99.1741,
        "rounds": 3
      },
      "reference": {
        "median_ms": 88.8636,
        "p95_ms": 90.0486,
        "min_ms": 82.6932,
        "max_ms": 90.0486,
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
        "median_ms": 136.8489,
        "p95_ms": 145.9877,
        "min_ms": 116.3154,
        "max_ms": 145.9877,
        "rounds": 3
      },
      "reference": {
        "median_ms": 88.8636,
        "p95_ms": 90.0486,
        "min_ms": 82.6932,
        "max_ms": 90.0486,
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
      "workload": "connect@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 239.8782,
        "p95_ms": 256.1469,
        "min_ms": 232.7318,
        "max_ms": 256.1469,
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
        "median_ms": 31.3933,
        "p95_ms": 32.1118,
        "min_ms": 29.7808,
        "max_ms": 32.1118,
        "rounds": 3
      },
      "reference": {
        "median_ms": 239.8782,
        "p95_ms": 256.1469,
        "min_ms": 232.7318,
        "max_ms": 256.1469,
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
        "median_ms": 75.7393,
        "p95_ms": 80.1149,
        "min_ms": 68.5289,
        "max_ms": 80.1149,
        "rounds": 3
      },
      "reference": {
        "median_ms": 239.8782,
        "p95_ms": 256.1469,
        "min_ms": 232.7318,
        "max_ms": 256.1469,
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
    }
  ]
}
```

Regenerate: `pnpm --dir projects/redis.ts/examples/vs-js-libraries benchmark`
