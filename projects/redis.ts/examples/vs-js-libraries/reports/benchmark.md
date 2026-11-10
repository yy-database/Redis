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
- `rev`: `810f1dd4ece9725d956cc9c3c19ef8b88c8cca38`
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
| `hash-setnx-hrandfield` | `redis-hash-setnx-hrandfield` | 402 | {"fields":"200"} |
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
| get-seq | 1.00x | **0.81x** | 0.97x |
| set-seq | 1.00x | 1.01x | **0.99x** |
| set-pipeline | 1.00x | 0.99x | **0.97x** |
| get-pipeline | 1.00x | 0.72x | **0.67x** |
| hash-hset-hget | 1.00x | **0.94x** | 0.98x |
| hash-setnx-hrandfield | 1.00x | **0.86x** | 1.09x |
| list-rpush-lrange | 1.00x | **0.93x** | 0.94x |
| set-sadd-smembers | 1.00x | 0.98x | **0.94x** |
| zset-zadd-zrange | **1.00x** | 1.01x | 1.08x |
| streams-xadd-xrange | 1.00x | **0.89x** | 0.89x |
| pubsub-roundtrip | 1.00x | **0.86x** | 0.98x |
| ttl-setex-expire | 1.00x | **1.00x** | 1.01x |
| multi-exec | 1.00x | **0.94x** | 1.02x |
| set-big | 1.00x | **0.97x** | 1.00x |
| get-big | **1.00x** | 1.03x | 1.00x |
| ping | **1.00x** | 1.16x | 3.25x |
| connect | 1.00x | **0.12x** | 0.25x |

## Median and p95 (ms)

| Workload | ops | ioredis med | ioredis p95 | @yydb/redis med | @yydb/redis p95 | node-redis med | node-redis p95 |
|---------:|----:|-------:|-------:|-------:|-------:|-------:|-------:|
| get-seq | 500 | 99.35 | 103.43 | 80.81 | 87.06 | 96.14 | 100.60 |
| set-seq | 100 | 336.05 | 459.96 | 339.86 | 368.03 | 333.85 | 354.08 |
| set-pipeline | 500 | 2206.15 | 2242.35 | 2177.19 | 2236.11 | 2146.97 | 2159.40 |
| get-pipeline | 500 | 69.37 | 78.33 | 49.88 | 52.52 | 46.21 | 46.75 |
| hash-hset-hget | 401 | 699.10 | 706.60 | 657.21 | 673.69 | 683.63 | 713.68 |
| hash-setnx-hrandfield | 402 | 728.33 | 767.41 | 628.38 | 645.76 | 791.45 | 804.61 |
| list-rpush-lrange | 202 | 963.67 | 989.80 | 899.29 | 963.01 | 909.23 | 941.83 |
| set-sadd-smembers | 202 | 917.16 | 956.29 | 896.69 | 920.81 | 866.54 | 897.59 |
| zset-zadd-zrange | 202 | 902.16 | 918.21 | 909.50 | 1011.01 | 971.78 | 983.66 |
| streams-xadd-xrange | 202 | 961.13 | 1169.43 | 853.79 | 1001.05 | 855.71 | 860.15 |
| pubsub-roundtrip | 100 | 28.20 | 31.53 | 24.27 | 36.81 | 27.63 | 42.48 |
| ttl-setex-expire | 90 | 1233.33 | 1241.64 | 1227.46 | 1237.13 | 1243.45 | 1245.76 |
| multi-exec | 102 | 395.00 | 395.43 | 371.96 | 383.14 | 401.50 | 414.96 |
| set-big | 20 | 395.11 | 427.87 | 381.78 | 385.88 | 396.49 | 407.52 |
| get-big | 50 | 3059.47 | 3100.18 | 3153.78 | 3485.50 | 3072.09 | 3446.31 |
| ping | 1000 | 151.01 | 172.45 | 174.54 | 175.50 | 490.05 | 519.08 |
| connect | 50 | 284.00 | 315.94 | 33.57 | 36.50 | 70.00 | 71.67 |

## Per-op and throughput (median)

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|--------:|--------:|--------:|
| get-seq | 0.199 ms/op, 5,033/s | 0.162 ms/op, 6,188/s | 0.192 ms/op, 5,201/s |
| set-seq | 3.361 ms/op, 298/s | 3.399 ms/op, 294/s | 3.338 ms/op, 300/s |
| set-pipeline | 4.412 ms/op, 227/s | 4.354 ms/op, 230/s | 4.294 ms/op, 233/s |
| get-pipeline | 0.139 ms/op, 7,207/s | 0.100 ms/op, 10,024/s | 0.092 ms/op, 10,820/s |
| hash-hset-hget | 1.743 ms/op, 574/s | 1.639 ms/op, 610/s | 1.705 ms/op, 587/s |
| hash-setnx-hrandfield | 1.812 ms/op, 552/s | 1.563 ms/op, 640/s | 1.969 ms/op, 508/s |
| list-rpush-lrange | 4.771 ms/op, 210/s | 4.452 ms/op, 225/s | 4.501 ms/op, 222/s |
| set-sadd-smembers | 4.540 ms/op, 220/s | 4.439 ms/op, 225/s | 4.290 ms/op, 233/s |
| zset-zadd-zrange | 4.466 ms/op, 224/s | 4.502 ms/op, 222/s | 4.811 ms/op, 208/s |
| streams-xadd-xrange | 4.758 ms/op, 210/s | 4.227 ms/op, 237/s | 4.236 ms/op, 236/s |
| pubsub-roundtrip | 0.282 ms/op, 3,546/s | 0.243 ms/op, 4,121/s | 0.276 ms/op, 3,619/s |
| ttl-setex-expire | 13.704 ms/op, 73/s | 13.638 ms/op, 73/s | 13.816 ms/op, 72/s |
| multi-exec | 3.873 ms/op, 258/s | 3.647 ms/op, 274/s | 3.936 ms/op, 254/s |
| set-big | 19.756 ms/op, 51/s | 19.089 ms/op, 52/s | 19.825 ms/op, 50/s |
| get-big | 61.189 ms/op, 16/s | 63.076 ms/op, 16/s | 61.442 ms/op, 16/s |
| ping | 0.151 ms/op, 6,622/s | 0.175 ms/op, 5,729/s | 0.490 ms/op, 2,041/s |
| connect | 5.680 ms/op, 176/s | 0.671 ms/op, 1,489/s | 1.400 ms/op, 714/s |

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
    "data_scale": "matrix=17x3",
    "rustc_version": "rustc 1.101.0-nightly (1c3a65069 2026-11-02)",
    "node_version": "v24.18.0",
    "target_triple": "x86_64-pc-windows-msvc",
    "rev": "810f1dd4ece9725d956cc9c3c19ef8b88c8cca38",
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
        "median_ms": 99.3474,
        "p95_ms": 103.431,
        "min_ms": 77.0298,
        "max_ms": 103.431,
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
        "median_ms": 80.8068,
        "p95_ms": 87.0606,
        "min_ms": 77.9919,
        "max_ms": 87.0606,
        "rounds": 3
      },
      "reference": {
        "median_ms": 99.3474,
        "p95_ms": 103.431,
        "min_ms": 77.0298,
        "max_ms": 103.431,
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
        "median_ms": 96.1354,
        "p95_ms": 100.6021,
        "min_ms": 87.3963,
        "max_ms": 100.6021,
        "rounds": 3
      },
      "reference": {
        "median_ms": 99.3474,
        "p95_ms": 103.431,
        "min_ms": 77.0298,
        "max_ms": 103.431,
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
        "median_ms": 336.0514,
        "p95_ms": 459.9592,
        "min_ms": 322.0497,
        "max_ms": 459.9592,
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
        "median_ms": 339.859,
        "p95_ms": 368.0262,
        "min_ms": 337.9768,
        "max_ms": 368.0262,
        "rounds": 3
      },
      "reference": {
        "median_ms": 336.0514,
        "p95_ms": 459.9592,
        "min_ms": 322.0497,
        "max_ms": 459.9592,
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
        "median_ms": 333.8462,
        "p95_ms": 354.0831,
        "min_ms": 325.7466,
        "max_ms": 354.0831,
        "rounds": 3
      },
      "reference": {
        "median_ms": 336.0514,
        "p95_ms": 459.9592,
        "min_ms": 322.0497,
        "max_ms": 459.9592,
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
        "median_ms": 2206.149,
        "p95_ms": 2242.3468,
        "min_ms": 2201.9098,
        "max_ms": 2242.3468,
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
        "median_ms": 2177.1851,
        "p95_ms": 2236.106,
        "min_ms": 2159.0063,
        "max_ms": 2236.106,
        "rounds": 3
      },
      "reference": {
        "median_ms": 2206.149,
        "p95_ms": 2242.3468,
        "min_ms": 2201.9098,
        "max_ms": 2242.3468,
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
        "median_ms": 2146.9714,
        "p95_ms": 2159.4045,
        "min_ms": 2109.1638,
        "max_ms": 2159.4045,
        "rounds": 3
      },
      "reference": {
        "median_ms": 2206.149,
        "p95_ms": 2242.3468,
        "min_ms": 2201.9098,
        "max_ms": 2242.3468,
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
        "median_ms": 69.3735,
        "p95_ms": 78.325,
        "min_ms": 56.0188,
        "max_ms": 78.325,
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
        "median_ms": 49.878,
        "p95_ms": 52.523,
        "min_ms": 49.715,
        "max_ms": 52.523,
        "rounds": 3
      },
      "reference": {
        "median_ms": 69.3735,
        "p95_ms": 78.325,
        "min_ms": 56.0188,
        "max_ms": 78.325,
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
        "median_ms": 46.2125,
        "p95_ms": 46.7458,
        "min_ms": 40.5324,
        "max_ms": 46.7458,
        "rounds": 3
      },
      "reference": {
        "median_ms": 69.3735,
        "p95_ms": 78.325,
        "min_ms": 56.0188,
        "max_ms": 78.325,
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
        "median_ms": 699.1027,
        "p95_ms": 706.6026,
        "min_ms": 651.1799,
        "max_ms": 706.6026,
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
        "median_ms": 657.2109,
        "p95_ms": 673.6916,
        "min_ms": 611.723,
        "max_ms": 673.6916,
        "rounds": 3
      },
      "reference": {
        "median_ms": 699.1027,
        "p95_ms": 706.6026,
        "min_ms": 651.1799,
        "max_ms": 706.6026,
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
        "median_ms": 683.6272,
        "p95_ms": 713.6811,
        "min_ms": 659.4969,
        "max_ms": 713.6811,
        "rounds": 3
      },
      "reference": {
        "median_ms": 699.1027,
        "p95_ms": 706.6026,
        "min_ms": 651.1799,
        "max_ms": 706.6026,
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
        "median_ms": 728.3303,
        "p95_ms": 767.4123,
        "min_ms": 673.1742,
        "max_ms": 767.4123,
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
        "median_ms": 628.3793,
        "p95_ms": 645.7643,
        "min_ms": 595.7252,
        "max_ms": 645.7643,
        "rounds": 3
      },
      "reference": {
        "median_ms": 728.3303,
        "p95_ms": 767.4123,
        "min_ms": 673.1742,
        "max_ms": 767.4123,
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
        "median_ms": 791.4474,
        "p95_ms": 804.6146,
        "min_ms": 772.9605,
        "max_ms": 804.6146,
        "rounds": 3
      },
      "reference": {
        "median_ms": 728.3303,
        "p95_ms": 767.4123,
        "min_ms": 673.1742,
        "max_ms": 767.4123,
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
        "median_ms": 963.6675,
        "p95_ms": 989.8004,
        "min_ms": 955.796,
        "max_ms": 989.8004,
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
        "median_ms": 899.2881,
        "p95_ms": 963.0131,
        "min_ms": 895.4676,
        "max_ms": 963.0131,
        "rounds": 3
      },
      "reference": {
        "median_ms": 963.6675,
        "p95_ms": 989.8004,
        "min_ms": 955.796,
        "max_ms": 989.8004,
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
        "median_ms": 909.2279,
        "p95_ms": 941.826,
        "min_ms": 881.1985,
        "max_ms": 941.826,
        "rounds": 3
      },
      "reference": {
        "median_ms": 963.6675,
        "p95_ms": 989.8004,
        "min_ms": 955.796,
        "max_ms": 989.8004,
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
        "median_ms": 917.1638,
        "p95_ms": 956.2888,
        "min_ms": 912.5217,
        "max_ms": 956.2888,
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
        "median_ms": 896.687,
        "p95_ms": 920.8072,
        "min_ms": 875.6004,
        "max_ms": 920.8072,
        "rounds": 3
      },
      "reference": {
        "median_ms": 917.1638,
        "p95_ms": 956.2888,
        "min_ms": 912.5217,
        "max_ms": 956.2888,
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
        "median_ms": 866.5382,
        "p95_ms": 897.589,
        "min_ms": 863.8502,
        "max_ms": 897.589,
        "rounds": 3
      },
      "reference": {
        "median_ms": 917.1638,
        "p95_ms": 956.2888,
        "min_ms": 912.5217,
        "max_ms": 956.2888,
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
        "median_ms": 902.1571,
        "p95_ms": 918.2098,
        "min_ms": 770.3665,
        "max_ms": 918.2098,
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
        "median_ms": 909.4981,
        "p95_ms": 1011.0149,
        "min_ms": 841.862,
        "max_ms": 1011.0149,
        "rounds": 3
      },
      "reference": {
        "median_ms": 902.1571,
        "p95_ms": 918.2098,
        "min_ms": 770.3665,
        "max_ms": 918.2098,
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
        "median_ms": 971.7838,
        "p95_ms": 983.6604,
        "min_ms": 866.1268,
        "max_ms": 983.6604,
        "rounds": 3
      },
      "reference": {
        "median_ms": 902.1571,
        "p95_ms": 918.2098,
        "min_ms": 770.3665,
        "max_ms": 918.2098,
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
        "median_ms": 961.1297,
        "p95_ms": 1169.4317,
        "min_ms": 850.1534,
        "max_ms": 1169.4317,
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
        "median_ms": 853.7861,
        "p95_ms": 1001.0463,
        "min_ms": 803.9596,
        "max_ms": 1001.0463,
        "rounds": 3
      },
      "reference": {
        "median_ms": 961.1297,
        "p95_ms": 1169.4317,
        "min_ms": 850.1534,
        "max_ms": 1169.4317,
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
        "median_ms": 855.7056,
        "p95_ms": 860.1535,
        "min_ms": 780.2884,
        "max_ms": 860.1535,
        "rounds": 3
      },
      "reference": {
        "median_ms": 961.1297,
        "p95_ms": 1169.4317,
        "min_ms": 850.1534,
        "max_ms": 1169.4317,
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
        "median_ms": 28.2007,
        "p95_ms": 31.5315,
        "min_ms": 26.7252,
        "max_ms": 31.5315,
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
        "median_ms": 24.2667,
        "p95_ms": 36.8114,
        "min_ms": 22.8976,
        "max_ms": 36.8114,
        "rounds": 3
      },
      "reference": {
        "median_ms": 28.2007,
        "p95_ms": 31.5315,
        "min_ms": 26.7252,
        "max_ms": 31.5315,
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
        "median_ms": 27.6333,
        "p95_ms": 42.4828,
        "min_ms": 27.4115,
        "max_ms": 42.4828,
        "rounds": 3
      },
      "reference": {
        "median_ms": 28.2007,
        "p95_ms": 31.5315,
        "min_ms": 26.7252,
        "max_ms": 31.5315,
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
        "median_ms": 1233.3252,
        "p95_ms": 1241.6386,
        "min_ms": 1210.3434,
        "max_ms": 1241.6386,
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
        "median_ms": 1227.459,
        "p95_ms": 1237.1336,
        "min_ms": 1226.5991,
        "max_ms": 1237.1336,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1233.3252,
        "p95_ms": 1241.6386,
        "min_ms": 1210.3434,
        "max_ms": 1241.6386,
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
        "median_ms": 1243.4515,
        "p95_ms": 1245.7577,
        "min_ms": 1242.3119,
        "max_ms": 1245.7577,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1233.3252,
        "p95_ms": 1241.6386,
        "min_ms": 1210.3434,
        "max_ms": 1241.6386,
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
        "median_ms": 395.0045,
        "p95_ms": 395.4323,
        "min_ms": 338.0636,
        "max_ms": 395.4323,
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
        "median_ms": 371.956,
        "p95_ms": 383.138,
        "min_ms": 361.2381,
        "max_ms": 383.138,
        "rounds": 3
      },
      "reference": {
        "median_ms": 395.0045,
        "p95_ms": 395.4323,
        "min_ms": 338.0636,
        "max_ms": 395.4323,
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
        "median_ms": 401.5018,
        "p95_ms": 414.9574,
        "min_ms": 381.4762,
        "max_ms": 414.9574,
        "rounds": 3
      },
      "reference": {
        "median_ms": 395.0045,
        "p95_ms": 395.4323,
        "min_ms": 338.0636,
        "max_ms": 395.4323,
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
        "median_ms": 395.1144,
        "p95_ms": 427.8671,
        "min_ms": 383.3154,
        "max_ms": 427.8671,
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
        "median_ms": 381.7787,
        "p95_ms": 385.8839,
        "min_ms": 368.2635,
        "max_ms": 385.8839,
        "rounds": 3
      },
      "reference": {
        "median_ms": 395.1144,
        "p95_ms": 427.8671,
        "min_ms": 383.3154,
        "max_ms": 427.8671,
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
        "median_ms": 396.4946,
        "p95_ms": 407.5242,
        "min_ms": 379.9384,
        "max_ms": 407.5242,
        "rounds": 3
      },
      "reference": {
        "median_ms": 395.1144,
        "p95_ms": 427.8671,
        "min_ms": 383.3154,
        "max_ms": 427.8671,
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
        "median_ms": 3059.4693,
        "p95_ms": 3100.1813,
        "min_ms": 2953.5026,
        "max_ms": 3100.1813,
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
        "median_ms": 3153.7788,
        "p95_ms": 3485.5042,
        "min_ms": 3149.5273,
        "max_ms": 3485.5042,
        "rounds": 3
      },
      "reference": {
        "median_ms": 3059.4693,
        "p95_ms": 3100.1813,
        "min_ms": 2953.5026,
        "max_ms": 3100.1813,
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
        "median_ms": 3072.0867,
        "p95_ms": 3446.3104,
        "min_ms": 2935.8657,
        "max_ms": 3446.3104,
        "rounds": 3
      },
      "reference": {
        "median_ms": 3059.4693,
        "p95_ms": 3100.1813,
        "min_ms": 2953.5026,
        "max_ms": 3100.1813,
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
        "median_ms": 151.0098,
        "p95_ms": 172.4499,
        "min_ms": 147.7383,
        "max_ms": 172.4499,
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
        "median_ms": 174.5406,
        "p95_ms": 175.5011,
        "min_ms": 158.9804,
        "max_ms": 175.5011,
        "rounds": 3
      },
      "reference": {
        "median_ms": 151.0098,
        "p95_ms": 172.4499,
        "min_ms": 147.7383,
        "max_ms": 172.4499,
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
        "median_ms": 490.0528,
        "p95_ms": 519.0843,
        "min_ms": 230.1939,
        "max_ms": 519.0843,
        "rounds": 3
      },
      "reference": {
        "median_ms": 151.0098,
        "p95_ms": 172.4499,
        "min_ms": 147.7383,
        "max_ms": 172.4499,
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
        "median_ms": 283.9979,
        "p95_ms": 315.9429,
        "min_ms": 261.3108,
        "max_ms": 315.9429,
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
        "median_ms": 33.57,
        "p95_ms": 36.5017,
        "min_ms": 28.0475,
        "max_ms": 36.5017,
        "rounds": 3
      },
      "reference": {
        "median_ms": 283.9979,
        "p95_ms": 315.9429,
        "min_ms": 261.3108,
        "max_ms": 315.9429,
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
        "median_ms": 70.0025,
        "p95_ms": 71.6733,
        "min_ms": 68.6211,
        "max_ms": 71.6733,
        "rounds": 3
      },
      "reference": {
        "median_ms": 283.9979,
        "p95_ms": 315.9429,
        "min_ms": 261.3108,
        "max_ms": 315.9429,
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
