# Benchmark report

Command: `pnpm --dir projects/redis.ts/examples/vs-js-libraries benchmark`
Defaults: `BENCH_SET=100`, `BENCH_GET=500`, `BENCH_PIPE=500`, `BENCH_PING=1000`, `BENCH_BATCH=500`, `BENCH_COLL=200`, `BENCH_BIG=20`, `BENCH_BIG_GET=50`, `BENCH_BIG_BYTES=65536`, `BENCH_CONNECT=50`, `BENCH_ROUNDS=3`, `BENCH_WARMUP=1`
Baseline: `ioredis` against the emulated server = `1.00x`
Ratio: subject_time / baseline_time (smaller is faster). Fastest cell in each row is bold.
Stats: median/p95/min/max/rounds come from `database.harness::summarize` via `benchSummary` (pinned:database.harness::summarize golden vectors (addon binding missing)); nearest-rank p95, even-length median averages the middle pair. No median or p95 formula lives in this example.

## Provenance

- `node_version`: `v24.18.0`
- `rustc_version`: `rustc 1.101.0-nightly (1c3a65069 2026-11-02)`
- `target_triple`: `x86_64-pc-windows-msvc`
- `rev`: `269d8748bdcea902215515b63187d44ffc1f536c`
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
| `set-big` | `redis-big-value-set` | 20 | {"ops":"20","value_bytes":"65536"} |
| `get-big` | `redis-big-value-get` | 50 | {"ops":"50","value_bytes":"65536"} |
| `ping` | `redis-ping-rtt` | 1000 | {"ops":"1000"} |
| `connect` | `redis-connect-open-close` | 50 | {"opens":"50","probe":"PING"} |

## Relative to `ioredis`

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|-------:|-------:|-------:|
| get-seq | **1.00x** | 1.08x | 2.01x |
| set-seq | **1.00x** | 1.08x | 1.00x |
| set-pipeline | **1.00x** | 1.05x | 1.01x |
| get-pipeline | 1.00x | 1.15x | **0.72x** |
| hash-hset-hget | **1.00x** | 1.01x | 1.22x |
| list-rpush-lrange | **1.00x** | 1.01x | 1.06x |
| set-sadd-smembers | 1.00x | **0.96x** | 1.01x |
| zset-zadd-zrange | 1.00x | 1.00x | **0.99x** |
| set-big | 1.00x | 1.00x | **0.87x** |
| get-big | 1.00x | 0.97x | **0.93x** |
| ping | **1.00x** | 1.11x | 1.51x |
| connect | 1.00x | **0.13x** | 0.32x |

## Median and p95 (ms)

| Workload | ops | ioredis med | ioredis p95 | @yydb/redis med | @yydb/redis p95 | node-redis med | node-redis p95 |
|---------:|----:|-------:|-------:|-------:|-------:|-------:|-------:|
| get-seq | 500 | 76.39 | 88.86 | 82.86 | 94.26 | 153.34 | 163.36 |
| set-seq | 100 | 497.25 | 518.53 | 536.01 | 549.18 | 499.72 | 886.05 |
| set-pipeline | 500 | 3901.26 | 4064.13 | 4100.34 | 4121.55 | 3922.28 | 4701.69 |
| get-pipeline | 500 | 111.01 | 117.72 | 127.79 | 128.99 | 80.25 | 87.31 |
| hash-hset-hget | 401 | 1224.79 | 1251.87 | 1231.08 | 1301.58 | 1497.33 | 1715.47 |
| list-rpush-lrange | 202 | 1226.39 | 1275.05 | 1233.02 | 1243.19 | 1300.68 | 2252.76 |
| set-sadd-smembers | 202 | 1253.35 | 1281.11 | 1202.21 | 1277.86 | 1265.58 | 1354.49 |
| zset-zadd-zrange | 202 | 1139.97 | 1162.51 | 1139.14 | 1157.34 | 1129.42 | 1226.66 |
| set-big | 20 | 457.62 | 462.45 | 455.56 | 461.07 | 397.36 | 457.23 |
| get-big | 50 | 3186.28 | 3629.17 | 3078.25 | 3097.26 | 2963.08 | 3095.15 |
| ping | 1000 | 90.93 | 101.19 | 100.90 | 101.38 | 137.57 | 140.70 |
| connect | 50 | 264.80 | 268.67 | 35.26 | 42.52 | 84.19 | 101.71 |

## Per-op and throughput (median)

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|--------:|--------:|--------:|
| get-seq | 0.153 ms/op, 6,545/s | 0.166 ms/op, 6,034/s | 0.307 ms/op, 3,261/s |
| set-seq | 4.972 ms/op, 201/s | 5.360 ms/op, 187/s | 4.997 ms/op, 200/s |
| set-pipeline | 7.803 ms/op, 128/s | 8.201 ms/op, 122/s | 7.845 ms/op, 127/s |
| get-pipeline | 0.222 ms/op, 4,504/s | 0.256 ms/op, 3,913/s | 0.160 ms/op, 6,231/s |
| hash-hset-hget | 3.054 ms/op, 327/s | 3.070 ms/op, 326/s | 3.734 ms/op, 268/s |
| list-rpush-lrange | 6.071 ms/op, 165/s | 6.104 ms/op, 164/s | 6.439 ms/op, 155/s |
| set-sadd-smembers | 6.205 ms/op, 161/s | 5.952 ms/op, 168/s | 6.265 ms/op, 160/s |
| zset-zadd-zrange | 5.643 ms/op, 177/s | 5.639 ms/op, 177/s | 5.591 ms/op, 179/s |
| set-big | 22.881 ms/op, 44/s | 22.778 ms/op, 44/s | 19.868 ms/op, 50/s |
| get-big | 63.726 ms/op, 16/s | 61.565 ms/op, 16/s | 59.262 ms/op, 17/s |
| ping | 0.091 ms/op, 10,997/s | 0.101 ms/op, 9,910/s | 0.138 ms/op, 7,269/s |
| connect | 5.296 ms/op, 189/s | 0.705 ms/op, 1,418/s | 1.684 ms/op, 594/s |

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
      "connect": "50"
    },
    "data_scale": "matrix=12x3",
    "rustc_version": "rustc 1.101.0-nightly (1c3a65069 2026-11-02)",
    "node_version": "v24.18.0",
    "target_triple": "x86_64-pc-windows-msvc",
    "rev": "269d8748bdcea902215515b63187d44ffc1f536c",
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
        "median_ms": 76.395,
        "p95_ms": 88.8622,
        "min_ms": 73.6444,
        "max_ms": 88.8622,
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
        "median_ms": 82.861,
        "p95_ms": 94.2587,
        "min_ms": 82.4194,
        "max_ms": 94.2587,
        "rounds": 3
      },
      "reference": {
        "median_ms": 76.395,
        "p95_ms": 88.8622,
        "min_ms": 73.6444,
        "max_ms": 88.8622,
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
        "median_ms": 153.3432,
        "p95_ms": 163.3603,
        "min_ms": 152.7107,
        "max_ms": 163.3603,
        "rounds": 3
      },
      "reference": {
        "median_ms": 76.395,
        "p95_ms": 88.8622,
        "min_ms": 73.6444,
        "max_ms": 88.8622,
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
        "median_ms": 497.2461,
        "p95_ms": 518.5325,
        "min_ms": 491.3307,
        "max_ms": 518.5325,
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
        "median_ms": 536.0123,
        "p95_ms": 549.177,
        "min_ms": 532.2225,
        "max_ms": 549.177,
        "rounds": 3
      },
      "reference": {
        "median_ms": 497.2461,
        "p95_ms": 518.5325,
        "min_ms": 491.3307,
        "max_ms": 518.5325,
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
        "median_ms": 499.7194,
        "p95_ms": 886.0529,
        "min_ms": 496.6741,
        "max_ms": 886.0529,
        "rounds": 3
      },
      "reference": {
        "median_ms": 497.2461,
        "p95_ms": 518.5325,
        "min_ms": 491.3307,
        "max_ms": 518.5325,
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
        "median_ms": 3901.2583,
        "p95_ms": 4064.1347,
        "min_ms": 3887.8538,
        "max_ms": 4064.1347,
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
        "median_ms": 4100.3359,
        "p95_ms": 4121.5464,
        "min_ms": 4055.1073,
        "max_ms": 4121.5464,
        "rounds": 3
      },
      "reference": {
        "median_ms": 3901.2583,
        "p95_ms": 4064.1347,
        "min_ms": 3887.8538,
        "max_ms": 4064.1347,
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
        "median_ms": 3922.2753,
        "p95_ms": 4701.6895,
        "min_ms": 3918.3574,
        "max_ms": 4701.6895,
        "rounds": 3
      },
      "reference": {
        "median_ms": 3901.2583,
        "p95_ms": 4064.1347,
        "min_ms": 3887.8538,
        "max_ms": 4064.1347,
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
        "median_ms": 111.0108,
        "p95_ms": 117.7167,
        "min_ms": 99.0095,
        "max_ms": 117.7167,
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
        "median_ms": 127.7934,
        "p95_ms": 128.9855,
        "min_ms": 123.9738,
        "max_ms": 128.9855,
        "rounds": 3
      },
      "reference": {
        "median_ms": 111.0108,
        "p95_ms": 117.7167,
        "min_ms": 99.0095,
        "max_ms": 117.7167,
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
        "median_ms": 80.2472,
        "p95_ms": 87.3065,
        "min_ms": 80.0308,
        "max_ms": 87.3065,
        "rounds": 3
      },
      "reference": {
        "median_ms": 111.0108,
        "p95_ms": 117.7167,
        "min_ms": 99.0095,
        "max_ms": 117.7167,
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
        "median_ms": 1224.7893,
        "p95_ms": 1251.8661,
        "min_ms": 1184.1289,
        "max_ms": 1251.8661,
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
        "median_ms": 1231.083,
        "p95_ms": 1301.5768,
        "min_ms": 1179.4507,
        "max_ms": 1301.5768,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1224.7893,
        "p95_ms": 1251.8661,
        "min_ms": 1184.1289,
        "max_ms": 1251.8661,
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
        "median_ms": 1497.3306,
        "p95_ms": 1715.4685,
        "min_ms": 1332.1706,
        "max_ms": 1715.4685,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1224.7893,
        "p95_ms": 1251.8661,
        "min_ms": 1184.1289,
        "max_ms": 1251.8661,
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
        "median_ms": 1226.3905,
        "p95_ms": 1275.0546,
        "min_ms": 1206.3093,
        "max_ms": 1275.0546,
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
        "median_ms": 1233.0228,
        "p95_ms": 1243.1868,
        "min_ms": 1158.1063,
        "max_ms": 1243.1868,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1226.3905,
        "p95_ms": 1275.0546,
        "min_ms": 1206.3093,
        "max_ms": 1275.0546,
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
        "median_ms": 1300.6826,
        "p95_ms": 2252.756,
        "min_ms": 1194.4989,
        "max_ms": 2252.756,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1226.3905,
        "p95_ms": 1275.0546,
        "min_ms": 1206.3093,
        "max_ms": 1275.0546,
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
        "median_ms": 1253.3545,
        "p95_ms": 1281.1099,
        "min_ms": 1203.5443,
        "max_ms": 1281.1099,
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
        "median_ms": 1202.2099,
        "p95_ms": 1277.8581,
        "min_ms": 1195.317,
        "max_ms": 1277.8581,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1253.3545,
        "p95_ms": 1281.1099,
        "min_ms": 1203.5443,
        "max_ms": 1281.1099,
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
        "median_ms": 1265.5798,
        "p95_ms": 1354.4908,
        "min_ms": 1255.9843,
        "max_ms": 1354.4908,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1253.3545,
        "p95_ms": 1281.1099,
        "min_ms": 1203.5443,
        "max_ms": 1281.1099,
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
        "median_ms": 1139.9726,
        "p95_ms": 1162.5123,
        "min_ms": 1138.1636,
        "max_ms": 1162.5123,
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
        "median_ms": 1139.1362,
        "p95_ms": 1157.3395,
        "min_ms": 1096.0054,
        "max_ms": 1157.3395,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1139.9726,
        "p95_ms": 1162.5123,
        "min_ms": 1138.1636,
        "max_ms": 1162.5123,
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
        "median_ms": 1129.4167,
        "p95_ms": 1226.6595,
        "min_ms": 1050.2486,
        "max_ms": 1226.6595,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1139.9726,
        "p95_ms": 1162.5123,
        "min_ms": 1138.1636,
        "max_ms": 1162.5123,
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
      "workload": "set-big@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 457.6206,
        "p95_ms": 462.455,
        "min_ms": 386.2156,
        "max_ms": 462.455,
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
        "median_ms": 455.5609,
        "p95_ms": 461.0665,
        "min_ms": 403.2012,
        "max_ms": 461.0665,
        "rounds": 3
      },
      "reference": {
        "median_ms": 457.6206,
        "p95_ms": 462.455,
        "min_ms": 386.2156,
        "max_ms": 462.455,
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
        "median_ms": 397.3579,
        "p95_ms": 457.2338,
        "min_ms": 387.2685,
        "max_ms": 457.2338,
        "rounds": 3
      },
      "reference": {
        "median_ms": 457.6206,
        "p95_ms": 462.455,
        "min_ms": 386.2156,
        "max_ms": 462.455,
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
        "median_ms": 3186.2781,
        "p95_ms": 3629.1703,
        "min_ms": 3106.2641,
        "max_ms": 3629.1703,
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
        "median_ms": 3078.2465,
        "p95_ms": 3097.2556,
        "min_ms": 2992.9339,
        "max_ms": 3097.2556,
        "rounds": 3
      },
      "reference": {
        "median_ms": 3186.2781,
        "p95_ms": 3629.1703,
        "min_ms": 3106.2641,
        "max_ms": 3629.1703,
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
        "median_ms": 2963.0755,
        "p95_ms": 3095.1456,
        "min_ms": 2949.7452,
        "max_ms": 3095.1456,
        "rounds": 3
      },
      "reference": {
        "median_ms": 3186.2781,
        "p95_ms": 3629.1703,
        "min_ms": 3106.2641,
        "max_ms": 3629.1703,
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
        "median_ms": 90.9312,
        "p95_ms": 101.1909,
        "min_ms": 90.4597,
        "max_ms": 101.1909,
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
        "median_ms": 100.9042,
        "p95_ms": 101.3756,
        "min_ms": 100.5595,
        "max_ms": 101.3756,
        "rounds": 3
      },
      "reference": {
        "median_ms": 90.9312,
        "p95_ms": 101.1909,
        "min_ms": 90.4597,
        "max_ms": 101.1909,
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
        "median_ms": 137.5676,
        "p95_ms": 140.6975,
        "min_ms": 133.7582,
        "max_ms": 140.6975,
        "rounds": 3
      },
      "reference": {
        "median_ms": 90.9312,
        "p95_ms": 101.1909,
        "min_ms": 90.4597,
        "max_ms": 101.1909,
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
        "median_ms": 264.7951,
        "p95_ms": 268.6669,
        "min_ms": 258.1911,
        "max_ms": 268.6669,
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
        "median_ms": 35.2633,
        "p95_ms": 42.5203,
        "min_ms": 32.2488,
        "max_ms": 42.5203,
        "rounds": 3
      },
      "reference": {
        "median_ms": 264.7951,
        "p95_ms": 268.6669,
        "min_ms": 258.1911,
        "max_ms": 268.6669,
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
        "median_ms": 84.1946,
        "p95_ms": 101.714,
        "min_ms": 81.5447,
        "max_ms": 101.714,
        "rounds": 3
      },
      "reference": {
        "median_ms": 264.7951,
        "p95_ms": 268.6669,
        "min_ms": 258.1911,
        "max_ms": 268.6669,
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
