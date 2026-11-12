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
- `rev`: `8e9ef2d4cec15c0a4898f9ce77056c956430608f`
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
| get-seq | 1.00x | **0.89x** | 1.01x |
| set-seq | 1.00x | **0.94x** | 1.17x |
| set-pipeline | 1.00x | 1.25x | **0.77x** |
| get-pipeline | 1.00x | 0.99x | **0.98x** |
| hash-hset-hget | 1.00x | **0.93x** | 1.01x |
| hash-setnx-hrandfield | 1.00x | 0.98x | **0.94x** |
| list-rpush-lrange | 1.00x | **0.96x** | 1.31x |
| set-sadd-smembers | **1.00x** | 1.06x | 1.05x |
| zset-zadd-zrange | 1.00x | **0.91x** | 1.04x |
| streams-xadd-xrange | 1.00x | **0.70x** | 0.82x |
| pubsub-roundtrip | 1.00x | **0.87x** | 1.30x |
| ttl-setex-expire | **1.00x** | 1.00x | 1.01x |
| multi-exec | 1.00x | **0.73x** | 1.13x |
| set-big | 1.00x | 0.89x | **0.87x** |
| get-big | 1.00x | 0.99x | **0.97x** |
| ping | 1.00x | **0.79x** | 1.12x |
| connect | 1.00x | **0.28x** | 0.66x |

## Median and p95 (ms)

| Workload | ops | ioredis med | ioredis p95 | @yydb/redis med | @yydb/redis p95 | node-redis med | node-redis p95 |
|---------:|----:|-------:|-------:|-------:|-------:|-------:|-------:|
| get-seq | 500 | 47.39 | 52.28 | 42.04 | 45.10 | 47.72 | 50.49 |
| set-seq | 100 | 67.13 | 80.91 | 63.04 | 65.80 | 78.45 | 88.75 |
| set-pipeline | 500 | 24.71 | 34.31 | 30.99 | 41.79 | 19.00 | 24.42 |
| get-pipeline | 500 | 23.51 | 28.91 | 23.21 | 28.57 | 23.08 | 28.36 |
| hash-hset-hget | 401 | 151.65 | 156.82 | 141.47 | 150.08 | 152.70 | 177.85 |
| hash-setnx-hrandfield | 402 | 133.58 | 137.23 | 130.37 | 143.33 | 125.95 | 148.12 |
| list-rpush-lrange | 202 | 125.69 | 128.62 | 120.50 | 124.86 | 164.94 | 176.84 |
| set-sadd-smembers | 202 | 175.56 | 182.61 | 186.84 | 199.14 | 184.80 | 243.07 |
| zset-zadd-zrange | 202 | 203.20 | 206.71 | 183.90 | 184.21 | 211.59 | 223.79 |
| streams-xadd-xrange | 202 | 267.15 | 273.16 | 186.56 | 227.52 | 218.97 | 231.24 |
| pubsub-roundtrip | 100 | 13.50 | 15.19 | 11.69 | 13.14 | 17.60 | 17.67 |
| ttl-setex-expire | 90 | 1138.22 | 1142.39 | 1142.48 | 1150.12 | 1147.54 | 1155.41 |
| multi-exec | 102 | 15.46 | 17.53 | 11.21 | 12.36 | 17.48 | 19.19 |
| set-big | 20 | 161.00 | 168.93 | 143.11 | 148.22 | 139.90 | 212.96 |
| get-big | 50 | 128.87 | 164.67 | 128.01 | 141.08 | 125.55 | 137.25 |
| ping | 1000 | 89.98 | 98.80 | 71.50 | 80.19 | 100.93 | 102.27 |
| connect | 50 | 129.93 | 134.63 | 36.68 | 46.74 | 86.00 | 87.65 |

## Per-op and throughput (median)

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|--------:|--------:|--------:|
| get-seq | 0.095 ms/op, 10,551/s | 0.084 ms/op, 11,893/s | 0.095 ms/op, 10,478/s |
| set-seq | 0.671 ms/op, 1,490/s | 0.630 ms/op, 1,586/s | 0.785 ms/op, 1,275/s |
| set-pipeline | 0.049 ms/op, 20,234/s | 0.062 ms/op, 16,136/s | 0.038 ms/op, 26,318/s |
| get-pipeline | 0.047 ms/op, 21,263/s | 0.046 ms/op, 21,541/s | 0.046 ms/op, 21,666/s |
| hash-hset-hget | 0.378 ms/op, 2,644/s | 0.353 ms/op, 2,834/s | 0.381 ms/op, 2,626/s |
| hash-setnx-hrandfield | 0.332 ms/op, 3,010/s | 0.324 ms/op, 3,083/s | 0.313 ms/op, 3,192/s |
| list-rpush-lrange | 0.622 ms/op, 1,607/s | 0.597 ms/op, 1,676/s | 0.817 ms/op, 1,225/s |
| set-sadd-smembers | 0.869 ms/op, 1,151/s | 0.925 ms/op, 1,081/s | 0.915 ms/op, 1,093/s |
| zset-zadd-zrange | 1.006 ms/op, 994/s | 0.910 ms/op, 1,098/s | 1.047 ms/op, 955/s |
| streams-xadd-xrange | 1.323 ms/op, 756/s | 0.924 ms/op, 1,083/s | 1.084 ms/op, 923/s |
| pubsub-roundtrip | 0.135 ms/op, 7,405/s | 0.117 ms/op, 8,556/s | 0.176 ms/op, 5,681/s |
| ttl-setex-expire | 12.647 ms/op, 79/s | 12.694 ms/op, 79/s | 12.750 ms/op, 78/s |
| multi-exec | 0.152 ms/op, 6,600/s | 0.110 ms/op, 9,102/s | 0.171 ms/op, 5,834/s |
| set-big | 8.050 ms/op, 124/s | 7.156 ms/op, 140/s | 6.995 ms/op, 143/s |
| get-big | 2.577 ms/op, 388/s | 2.560 ms/op, 391/s | 2.511 ms/op, 398/s |
| ping | 0.090 ms/op, 11,114/s | 0.072 ms/op, 13,986/s | 0.101 ms/op, 9,908/s |
| connect | 2.599 ms/op, 385/s | 0.734 ms/op, 1,363/s | 1.720 ms/op, 581/s |

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
    "rev": "8e9ef2d4cec15c0a4898f9ce77056c956430608f",
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
        "median_ms": 47.3892,
        "p95_ms": 52.2792,
        "min_ms": 43.6517,
        "max_ms": 52.2792,
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
        "median_ms": 42.0422,
        "p95_ms": 45.0961,
        "min_ms": 41.0823,
        "max_ms": 45.0961,
        "rounds": 3
      },
      "reference": {
        "median_ms": 47.3892,
        "p95_ms": 52.2792,
        "min_ms": 43.6517,
        "max_ms": 52.2792,
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
        "median_ms": 47.7208,
        "p95_ms": 50.4876,
        "min_ms": 45.4702,
        "max_ms": 50.4876,
        "rounds": 3
      },
      "reference": {
        "median_ms": 47.3892,
        "p95_ms": 52.2792,
        "min_ms": 43.6517,
        "max_ms": 52.2792,
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
        "median_ms": 67.1271,
        "p95_ms": 80.905,
        "min_ms": 62.1253,
        "max_ms": 80.905,
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
        "median_ms": 63.0434,
        "p95_ms": 65.798,
        "min_ms": 61.8989,
        "max_ms": 65.798,
        "rounds": 3
      },
      "reference": {
        "median_ms": 67.1271,
        "p95_ms": 80.905,
        "min_ms": 62.1253,
        "max_ms": 80.905,
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
        "median_ms": 78.4515,
        "p95_ms": 88.7487,
        "min_ms": 69.6279,
        "max_ms": 88.7487,
        "rounds": 3
      },
      "reference": {
        "median_ms": 67.1271,
        "p95_ms": 80.905,
        "min_ms": 62.1253,
        "max_ms": 80.905,
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
        "median_ms": 24.7111,
        "p95_ms": 34.3054,
        "min_ms": 24.646,
        "max_ms": 34.3054,
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
        "median_ms": 30.9862,
        "p95_ms": 41.7938,
        "min_ms": 25.3776,
        "max_ms": 41.7938,
        "rounds": 3
      },
      "reference": {
        "median_ms": 24.7111,
        "p95_ms": 34.3054,
        "min_ms": 24.646,
        "max_ms": 34.3054,
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
        "median_ms": 18.9987,
        "p95_ms": 24.4182,
        "min_ms": 18.8901,
        "max_ms": 24.4182,
        "rounds": 3
      },
      "reference": {
        "median_ms": 24.7111,
        "p95_ms": 34.3054,
        "min_ms": 24.646,
        "max_ms": 34.3054,
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
        "median_ms": 23.5149,
        "p95_ms": 28.909,
        "min_ms": 18.9518,
        "max_ms": 28.909,
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
        "median_ms": 23.2119,
        "p95_ms": 28.57,
        "min_ms": 20.1443,
        "max_ms": 28.57,
        "rounds": 3
      },
      "reference": {
        "median_ms": 23.5149,
        "p95_ms": 28.909,
        "min_ms": 18.9518,
        "max_ms": 28.909,
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
        "median_ms": 23.0778,
        "p95_ms": 28.3619,
        "min_ms": 19.19,
        "max_ms": 28.3619,
        "rounds": 3
      },
      "reference": {
        "median_ms": 23.5149,
        "p95_ms": 28.909,
        "min_ms": 18.9518,
        "max_ms": 28.909,
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
        "median_ms": 151.6476,
        "p95_ms": 156.8247,
        "min_ms": 144.7088,
        "max_ms": 156.8247,
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
        "median_ms": 141.4736,
        "p95_ms": 150.0791,
        "min_ms": 139.3582,
        "max_ms": 150.0791,
        "rounds": 3
      },
      "reference": {
        "median_ms": 151.6476,
        "p95_ms": 156.8247,
        "min_ms": 144.7088,
        "max_ms": 156.8247,
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
        "median_ms": 152.6977,
        "p95_ms": 177.8488,
        "min_ms": 151.3767,
        "max_ms": 177.8488,
        "rounds": 3
      },
      "reference": {
        "median_ms": 151.6476,
        "p95_ms": 156.8247,
        "min_ms": 144.7088,
        "max_ms": 156.8247,
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
        "median_ms": 133.5755,
        "p95_ms": 137.2261,
        "min_ms": 122.3261,
        "max_ms": 137.2261,
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
        "median_ms": 130.3728,
        "p95_ms": 143.3336,
        "min_ms": 128.7187,
        "max_ms": 143.3336,
        "rounds": 3
      },
      "reference": {
        "median_ms": 133.5755,
        "p95_ms": 137.2261,
        "min_ms": 122.3261,
        "max_ms": 137.2261,
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
        "median_ms": 125.9456,
        "p95_ms": 148.1216,
        "min_ms": 121.5369,
        "max_ms": 148.1216,
        "rounds": 3
      },
      "reference": {
        "median_ms": 133.5755,
        "p95_ms": 137.2261,
        "min_ms": 122.3261,
        "max_ms": 137.2261,
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
        "median_ms": 125.6886,
        "p95_ms": 128.6233,
        "min_ms": 122.4499,
        "max_ms": 128.6233,
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
        "median_ms": 120.496,
        "p95_ms": 124.8597,
        "min_ms": 120.0183,
        "max_ms": 124.8597,
        "rounds": 3
      },
      "reference": {
        "median_ms": 125.6886,
        "p95_ms": 128.6233,
        "min_ms": 122.4499,
        "max_ms": 128.6233,
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
        "median_ms": 164.9356,
        "p95_ms": 176.8367,
        "min_ms": 122.6793,
        "max_ms": 176.8367,
        "rounds": 3
      },
      "reference": {
        "median_ms": 125.6886,
        "p95_ms": 128.6233,
        "min_ms": 122.4499,
        "max_ms": 128.6233,
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
        "median_ms": 175.556,
        "p95_ms": 182.607,
        "min_ms": 167.5438,
        "max_ms": 182.607,
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
        "median_ms": 186.8445,
        "p95_ms": 199.1371,
        "min_ms": 178.4413,
        "max_ms": 199.1371,
        "rounds": 3
      },
      "reference": {
        "median_ms": 175.556,
        "p95_ms": 182.607,
        "min_ms": 167.5438,
        "max_ms": 182.607,
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
        "median_ms": 184.8023,
        "p95_ms": 243.0721,
        "min_ms": 171.2797,
        "max_ms": 243.0721,
        "rounds": 3
      },
      "reference": {
        "median_ms": 175.556,
        "p95_ms": 182.607,
        "min_ms": 167.5438,
        "max_ms": 182.607,
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
        "median_ms": 203.1968,
        "p95_ms": 206.7124,
        "min_ms": 175.2191,
        "max_ms": 206.7124,
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
        "median_ms": 183.8989,
        "p95_ms": 184.2148,
        "min_ms": 175.6735,
        "max_ms": 184.2148,
        "rounds": 3
      },
      "reference": {
        "median_ms": 203.1968,
        "p95_ms": 206.7124,
        "min_ms": 175.2191,
        "max_ms": 206.7124,
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
        "median_ms": 211.5873,
        "p95_ms": 223.7856,
        "min_ms": 160.5426,
        "max_ms": 223.7856,
        "rounds": 3
      },
      "reference": {
        "median_ms": 203.1968,
        "p95_ms": 206.7124,
        "min_ms": 175.2191,
        "max_ms": 206.7124,
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
        "median_ms": 267.1526,
        "p95_ms": 273.1637,
        "min_ms": 234.2274,
        "max_ms": 273.1637,
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
        "median_ms": 186.5558,
        "p95_ms": 227.5223,
        "min_ms": 186.1824,
        "max_ms": 227.5223,
        "rounds": 3
      },
      "reference": {
        "median_ms": 267.1526,
        "p95_ms": 273.1637,
        "min_ms": 234.2274,
        "max_ms": 273.1637,
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
        "median_ms": 218.9654,
        "p95_ms": 231.237,
        "min_ms": 206.8601,
        "max_ms": 231.237,
        "rounds": 3
      },
      "reference": {
        "median_ms": 267.1526,
        "p95_ms": 273.1637,
        "min_ms": 234.2274,
        "max_ms": 273.1637,
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
        "median_ms": 13.5038,
        "p95_ms": 15.185,
        "min_ms": 11.5547,
        "max_ms": 15.185,
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
        "median_ms": 11.6881,
        "p95_ms": 13.1445,
        "min_ms": 10.1145,
        "max_ms": 13.1445,
        "rounds": 3
      },
      "reference": {
        "median_ms": 13.5038,
        "p95_ms": 15.185,
        "min_ms": 11.5547,
        "max_ms": 15.185,
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
        "median_ms": 17.6035,
        "p95_ms": 17.6738,
        "min_ms": 15.2349,
        "max_ms": 17.6738,
        "rounds": 3
      },
      "reference": {
        "median_ms": 13.5038,
        "p95_ms": 15.185,
        "min_ms": 11.5547,
        "max_ms": 15.185,
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
        "median_ms": 1138.2232,
        "p95_ms": 1142.3859,
        "min_ms": 1135.6495,
        "max_ms": 1142.3859,
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
        "median_ms": 1142.4823,
        "p95_ms": 1150.1233,
        "min_ms": 1134.6511,
        "max_ms": 1150.1233,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1138.2232,
        "p95_ms": 1142.3859,
        "min_ms": 1135.6495,
        "max_ms": 1142.3859,
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
        "median_ms": 1147.5372,
        "p95_ms": 1155.409,
        "min_ms": 1137.4661,
        "max_ms": 1155.409,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1138.2232,
        "p95_ms": 1142.3859,
        "min_ms": 1135.6495,
        "max_ms": 1142.3859,
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
        "median_ms": 15.4555,
        "p95_ms": 17.5342,
        "min_ms": 14.5855,
        "max_ms": 17.5342,
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
        "median_ms": 11.2067,
        "p95_ms": 12.3609,
        "min_ms": 9.4533,
        "max_ms": 12.3609,
        "rounds": 3
      },
      "reference": {
        "median_ms": 15.4555,
        "p95_ms": 17.5342,
        "min_ms": 14.5855,
        "max_ms": 17.5342,
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
        "median_ms": 17.4842,
        "p95_ms": 19.1895,
        "min_ms": 14.2387,
        "max_ms": 19.1895,
        "rounds": 3
      },
      "reference": {
        "median_ms": 15.4555,
        "p95_ms": 17.5342,
        "min_ms": 14.5855,
        "max_ms": 17.5342,
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
        "median_ms": 161.0036,
        "p95_ms": 168.9339,
        "min_ms": 143.1212,
        "max_ms": 168.9339,
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
        "median_ms": 143.1129,
        "p95_ms": 148.2169,
        "min_ms": 122.1387,
        "max_ms": 148.2169,
        "rounds": 3
      },
      "reference": {
        "median_ms": 161.0036,
        "p95_ms": 168.9339,
        "min_ms": 143.1212,
        "max_ms": 168.9339,
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
        "median_ms": 139.9024,
        "p95_ms": 212.9628,
        "min_ms": 139.8951,
        "max_ms": 212.9628,
        "rounds": 3
      },
      "reference": {
        "median_ms": 161.0036,
        "p95_ms": 168.9339,
        "min_ms": 143.1212,
        "max_ms": 168.9339,
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
        "median_ms": 128.8664,
        "p95_ms": 164.668,
        "min_ms": 124.3657,
        "max_ms": 164.668,
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
        "median_ms": 128.0054,
        "p95_ms": 141.076,
        "min_ms": 88.5446,
        "max_ms": 141.076,
        "rounds": 3
      },
      "reference": {
        "median_ms": 128.8664,
        "p95_ms": 164.668,
        "min_ms": 124.3657,
        "max_ms": 164.668,
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
        "median_ms": 125.5484,
        "p95_ms": 137.2453,
        "min_ms": 116.3088,
        "max_ms": 137.2453,
        "rounds": 3
      },
      "reference": {
        "median_ms": 128.8664,
        "p95_ms": 164.668,
        "min_ms": 124.3657,
        "max_ms": 164.668,
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
        "median_ms": 89.9791,
        "p95_ms": 98.8034,
        "min_ms": 85.2293,
        "max_ms": 98.8034,
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
        "median_ms": 71.5023,
        "p95_ms": 80.1909,
        "min_ms": 69.4347,
        "max_ms": 80.1909,
        "rounds": 3
      },
      "reference": {
        "median_ms": 89.9791,
        "p95_ms": 98.8034,
        "min_ms": 85.2293,
        "max_ms": 98.8034,
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
        "median_ms": 100.9312,
        "p95_ms": 102.2655,
        "min_ms": 93.6697,
        "max_ms": 102.2655,
        "rounds": 3
      },
      "reference": {
        "median_ms": 89.9791,
        "p95_ms": 98.8034,
        "min_ms": 85.2293,
        "max_ms": 98.8034,
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
        "median_ms": 129.9284,
        "p95_ms": 134.6338,
        "min_ms": 119.4586,
        "max_ms": 134.6338,
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
        "median_ms": 36.6849,
        "p95_ms": 46.7419,
        "min_ms": 31.7907,
        "max_ms": 46.7419,
        "rounds": 3
      },
      "reference": {
        "median_ms": 129.9284,
        "p95_ms": 134.6338,
        "min_ms": 119.4586,
        "max_ms": 134.6338,
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
        "median_ms": 86.0001,
        "p95_ms": 87.6493,
        "min_ms": 76.6792,
        "max_ms": 87.6493,
        "rounds": 3
      },
      "reference": {
        "median_ms": 129.9284,
        "p95_ms": 134.6338,
        "min_ms": 119.4586,
        "max_ms": 134.6338,
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
