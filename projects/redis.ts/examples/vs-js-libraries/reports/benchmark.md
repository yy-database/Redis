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
- `rev`: `a5690c557382d7591f4c16cd58e39a5c76694672`
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
| get-seq | 1.00x | **0.96x** | 1.06x |
| set-seq | 1.00x | **0.88x** | 0.92x |
| set-pipeline | 1.00x | 0.98x | **0.98x** |
| get-pipeline | 1.00x | 0.93x | **0.79x** |
| hash-hset-hget | 1.00x | **0.98x** | 1.07x |
| hash-setnx-hrandfield | 1.00x | **0.98x** | 1.06x |
| list-rpush-lrange | **1.00x** | 1.04x | 1.10x |
| set-sadd-smembers | 1.00x | **0.99x** | 1.01x |
| zset-zadd-zrange | **1.00x** | 1.03x | 1.04x |
| streams-xadd-xrange | 1.00x | **0.95x** | 1.05x |
| pubsub-roundtrip | 1.00x | **0.89x** | 1.09x |
| ttl-setex-expire | 1.00x | **0.97x** | 1.01x |
| multi-exec | 1.00x | 1.01x | **1.00x** |
| set-big | **1.00x** | 1.17x | 1.02x |
| get-big | **1.00x** | 1.01x | 1.04x |
| ping | 1.00x | **1.00x** | 1.39x |
| connect | 1.00x | **0.13x** | 0.29x |

## Median and p95 (ms)

| Workload | ops | ioredis med | ioredis p95 | @yydb/redis med | @yydb/redis p95 | node-redis med | node-redis p95 |
|---------:|----:|-------:|-------:|-------:|-------:|-------:|-------:|
| get-seq | 500 | 73.71 | 85.92 | 70.54 | 74.44 | 77.91 | 81.88 |
| set-seq | 100 | 340.03 | 796.37 | 298.45 | 323.34 | 313.81 | 331.89 |
| set-pipeline | 500 | 2080.63 | 2857.53 | 2049.14 | 2101.00 | 2039.38 | 2420.62 |
| get-pipeline | 500 | 49.91 | 50.87 | 46.62 | 50.13 | 39.59 | 42.46 |
| hash-hset-hget | 401 | 605.00 | 614.84 | 592.35 | 597.41 | 647.41 | 677.48 |
| hash-setnx-hrandfield | 402 | 585.24 | 589.07 | 575.82 | 586.39 | 621.99 | 662.00 |
| list-rpush-lrange | 202 | 665.89 | 1033.89 | 689.93 | 700.14 | 732.09 | 741.95 |
| set-sadd-smembers | 202 | 662.13 | 688.80 | 655.32 | 1419.41 | 670.99 | 683.39 |
| zset-zadd-zrange | 202 | 575.78 | 677.63 | 594.11 | 596.51 | 597.12 | 601.75 |
| streams-xadd-xrange | 202 | 591.33 | 611.68 | 561.67 | 567.42 | 620.53 | 629.15 |
| pubsub-roundtrip | 100 | 12.81 | 13.38 | 11.35 | 12.04 | 13.98 | 14.07 |
| ttl-setex-expire | 90 | 1212.50 | 1231.97 | 1181.42 | 1194.71 | 1226.12 | 1307.99 |
| multi-exec | 102 | 248.01 | 260.73 | 250.10 | 259.59 | 246.82 | 269.13 |
| set-big | 20 | 249.75 | 262.01 | 292.16 | 302.56 | 253.81 | 257.34 |
| get-big | 50 | 1627.00 | 1901.91 | 1635.30 | 1666.98 | 1684.30 | 1686.63 |
| ping | 1000 | 46.79 | 49.88 | 46.64 | 47.19 | 64.98 | 66.17 |
| connect | 50 | 129.47 | 134.20 | 17.35 | 17.45 | 37.15 | 43.58 |

## Per-op and throughput (median)

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|--------:|--------:|--------:|
| get-seq | 0.147 ms/op, 6,784/s | 0.141 ms/op, 7,088/s | 0.156 ms/op, 6,418/s |
| set-seq | 3.400 ms/op, 294/s | 2.984 ms/op, 335/s | 3.138 ms/op, 319/s |
| set-pipeline | 4.161 ms/op, 240/s | 4.098 ms/op, 244/s | 4.079 ms/op, 245/s |
| get-pipeline | 0.100 ms/op, 10,019/s | 0.093 ms/op, 10,724/s | 0.079 ms/op, 12,628/s |
| hash-hset-hget | 1.509 ms/op, 663/s | 1.477 ms/op, 677/s | 1.615 ms/op, 619/s |
| hash-setnx-hrandfield | 1.456 ms/op, 687/s | 1.432 ms/op, 698/s | 1.547 ms/op, 646/s |
| list-rpush-lrange | 3.296 ms/op, 303/s | 3.415 ms/op, 293/s | 3.624 ms/op, 276/s |
| set-sadd-smembers | 3.278 ms/op, 305/s | 3.244 ms/op, 308/s | 3.322 ms/op, 301/s |
| zset-zadd-zrange | 2.850 ms/op, 351/s | 2.941 ms/op, 340/s | 2.956 ms/op, 338/s |
| streams-xadd-xrange | 2.927 ms/op, 342/s | 2.781 ms/op, 360/s | 3.072 ms/op, 326/s |
| pubsub-roundtrip | 0.128 ms/op, 7,804/s | 0.114 ms/op, 8,809/s | 0.140 ms/op, 7,153/s |
| ttl-setex-expire | 13.472 ms/op, 74/s | 13.127 ms/op, 76/s | 13.624 ms/op, 73/s |
| multi-exec | 2.431 ms/op, 411/s | 2.452 ms/op, 408/s | 2.420 ms/op, 413/s |
| set-big | 12.487 ms/op, 80/s | 14.608 ms/op, 68/s | 12.691 ms/op, 79/s |
| get-big | 32.540 ms/op, 31/s | 32.706 ms/op, 31/s | 33.686 ms/op, 30/s |
| ping | 0.047 ms/op, 21,373/s | 0.047 ms/op, 21,439/s | 0.065 ms/op, 15,390/s |
| connect | 2.589 ms/op, 386/s | 0.347 ms/op, 2,882/s | 0.743 ms/op, 1,346/s |

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
    "rev": "a5690c557382d7591f4c16cd58e39a5c76694672",
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
        "median_ms": 73.7069,
        "p95_ms": 85.9227,
        "min_ms": 71.8556,
        "max_ms": 85.9227,
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
        "median_ms": 70.5383,
        "p95_ms": 74.4391,
        "min_ms": 70.2087,
        "max_ms": 74.4391,
        "rounds": 3
      },
      "reference": {
        "median_ms": 73.7069,
        "p95_ms": 85.9227,
        "min_ms": 71.8556,
        "max_ms": 85.9227,
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
        "median_ms": 77.9099,
        "p95_ms": 81.8785,
        "min_ms": 75.9458,
        "max_ms": 81.8785,
        "rounds": 3
      },
      "reference": {
        "median_ms": 73.7069,
        "p95_ms": 85.9227,
        "min_ms": 71.8556,
        "max_ms": 85.9227,
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
        "median_ms": 340.0335,
        "p95_ms": 796.3706,
        "min_ms": 329.5094,
        "max_ms": 796.3706,
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
        "median_ms": 298.4467,
        "p95_ms": 323.3409,
        "min_ms": 294.162,
        "max_ms": 323.3409,
        "rounds": 3
      },
      "reference": {
        "median_ms": 340.0335,
        "p95_ms": 796.3706,
        "min_ms": 329.5094,
        "max_ms": 796.3706,
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
        "median_ms": 313.8114,
        "p95_ms": 331.8921,
        "min_ms": 299.7801,
        "max_ms": 331.8921,
        "rounds": 3
      },
      "reference": {
        "median_ms": 340.0335,
        "p95_ms": 796.3706,
        "min_ms": 329.5094,
        "max_ms": 796.3706,
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
        "median_ms": 2080.6329,
        "p95_ms": 2857.5304,
        "min_ms": 2048.4597,
        "max_ms": 2857.5304,
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
        "median_ms": 2049.1382,
        "p95_ms": 2100.9958,
        "min_ms": 2023.0032,
        "max_ms": 2100.9958,
        "rounds": 3
      },
      "reference": {
        "median_ms": 2080.6329,
        "p95_ms": 2857.5304,
        "min_ms": 2048.4597,
        "max_ms": 2857.5304,
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
        "median_ms": 2039.3846,
        "p95_ms": 2420.6168,
        "min_ms": 2037.5932,
        "max_ms": 2420.6168,
        "rounds": 3
      },
      "reference": {
        "median_ms": 2080.6329,
        "p95_ms": 2857.5304,
        "min_ms": 2048.4597,
        "max_ms": 2857.5304,
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
        "median_ms": 49.9056,
        "p95_ms": 50.869,
        "min_ms": 48.8846,
        "max_ms": 50.869,
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
        "median_ms": 46.6224,
        "p95_ms": 50.1262,
        "min_ms": 46.3927,
        "max_ms": 50.1262,
        "rounds": 3
      },
      "reference": {
        "median_ms": 49.9056,
        "p95_ms": 50.869,
        "min_ms": 48.8846,
        "max_ms": 50.869,
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
        "median_ms": 39.5931,
        "p95_ms": 42.4579,
        "min_ms": 38.1285,
        "max_ms": 42.4579,
        "rounds": 3
      },
      "reference": {
        "median_ms": 49.9056,
        "p95_ms": 50.869,
        "min_ms": 48.8846,
        "max_ms": 50.869,
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
        "median_ms": 605.0046,
        "p95_ms": 614.8357,
        "min_ms": 597.7588,
        "max_ms": 614.8357,
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
        "median_ms": 592.354,
        "p95_ms": 597.4072,
        "min_ms": 576.9063,
        "max_ms": 597.4072,
        "rounds": 3
      },
      "reference": {
        "median_ms": 605.0046,
        "p95_ms": 614.8357,
        "min_ms": 597.7588,
        "max_ms": 614.8357,
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
        "median_ms": 647.4145,
        "p95_ms": 677.4752,
        "min_ms": 634.5759,
        "max_ms": 677.4752,
        "rounds": 3
      },
      "reference": {
        "median_ms": 605.0046,
        "p95_ms": 614.8357,
        "min_ms": 597.7588,
        "max_ms": 614.8357,
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
        "median_ms": 585.2373,
        "p95_ms": 589.0668,
        "min_ms": 566.1798,
        "max_ms": 589.0668,
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
        "median_ms": 575.8164,
        "p95_ms": 586.3862,
        "min_ms": 571.8575,
        "max_ms": 586.3862,
        "rounds": 3
      },
      "reference": {
        "median_ms": 585.2373,
        "p95_ms": 589.0668,
        "min_ms": 566.1798,
        "max_ms": 589.0668,
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
        "median_ms": 621.9878,
        "p95_ms": 661.9974,
        "min_ms": 612.2106,
        "max_ms": 661.9974,
        "rounds": 3
      },
      "reference": {
        "median_ms": 585.2373,
        "p95_ms": 589.0668,
        "min_ms": 566.1798,
        "max_ms": 589.0668,
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
        "median_ms": 665.8905,
        "p95_ms": 1033.8854,
        "min_ms": 637.8557,
        "max_ms": 1033.8854,
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
        "median_ms": 689.9273,
        "p95_ms": 700.1445,
        "min_ms": 654.8617,
        "max_ms": 700.1445,
        "rounds": 3
      },
      "reference": {
        "median_ms": 665.8905,
        "p95_ms": 1033.8854,
        "min_ms": 637.8557,
        "max_ms": 1033.8854,
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
        "median_ms": 732.0939,
        "p95_ms": 741.9476,
        "min_ms": 681.3155,
        "max_ms": 741.9476,
        "rounds": 3
      },
      "reference": {
        "median_ms": 665.8905,
        "p95_ms": 1033.8854,
        "min_ms": 637.8557,
        "max_ms": 1033.8854,
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
        "median_ms": 662.1337,
        "p95_ms": 688.8009,
        "min_ms": 651.151,
        "max_ms": 688.8009,
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
        "median_ms": 655.3221,
        "p95_ms": 1419.4071,
        "min_ms": 650.6246,
        "max_ms": 1419.4071,
        "rounds": 3
      },
      "reference": {
        "median_ms": 662.1337,
        "p95_ms": 688.8009,
        "min_ms": 651.151,
        "max_ms": 688.8009,
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
        "median_ms": 670.9911,
        "p95_ms": 683.386,
        "min_ms": 669.6903,
        "max_ms": 683.386,
        "rounds": 3
      },
      "reference": {
        "median_ms": 662.1337,
        "p95_ms": 688.8009,
        "min_ms": 651.151,
        "max_ms": 688.8009,
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
        "median_ms": 575.7788,
        "p95_ms": 677.6329,
        "min_ms": 568.4081,
        "max_ms": 677.6329,
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
        "median_ms": 594.1149,
        "p95_ms": 596.5058,
        "min_ms": 566.6669,
        "max_ms": 596.5058,
        "rounds": 3
      },
      "reference": {
        "median_ms": 575.7788,
        "p95_ms": 677.6329,
        "min_ms": 568.4081,
        "max_ms": 677.6329,
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
        "median_ms": 597.1173,
        "p95_ms": 601.7496,
        "min_ms": 596.4992,
        "max_ms": 601.7496,
        "rounds": 3
      },
      "reference": {
        "median_ms": 575.7788,
        "p95_ms": 677.6329,
        "min_ms": 568.4081,
        "max_ms": 677.6329,
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
        "median_ms": 591.3322,
        "p95_ms": 611.68,
        "min_ms": 556.2236,
        "max_ms": 611.68,
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
        "median_ms": 561.6747,
        "p95_ms": 567.4178,
        "min_ms": 532.5396,
        "max_ms": 567.4178,
        "rounds": 3
      },
      "reference": {
        "median_ms": 591.3322,
        "p95_ms": 611.68,
        "min_ms": 556.2236,
        "max_ms": 611.68,
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
        "median_ms": 620.5256,
        "p95_ms": 629.1512,
        "min_ms": 599.7103,
        "max_ms": 629.1512,
        "rounds": 3
      },
      "reference": {
        "median_ms": 591.3322,
        "p95_ms": 611.68,
        "min_ms": 556.2236,
        "max_ms": 611.68,
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
        "median_ms": 12.8145,
        "p95_ms": 13.3755,
        "min_ms": 12.1508,
        "max_ms": 13.3755,
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
        "median_ms": 11.3526,
        "p95_ms": 12.038,
        "min_ms": 10.9988,
        "max_ms": 12.038,
        "rounds": 3
      },
      "reference": {
        "median_ms": 12.8145,
        "p95_ms": 13.3755,
        "min_ms": 12.1508,
        "max_ms": 13.3755,
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
        "median_ms": 13.9793,
        "p95_ms": 14.0694,
        "min_ms": 12.9535,
        "max_ms": 14.0694,
        "rounds": 3
      },
      "reference": {
        "median_ms": 12.8145,
        "p95_ms": 13.3755,
        "min_ms": 12.1508,
        "max_ms": 13.3755,
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
        "median_ms": 1212.4975,
        "p95_ms": 1231.9684,
        "min_ms": 1194.5503,
        "max_ms": 1231.9684,
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
        "median_ms": 1181.4248,
        "p95_ms": 1194.709,
        "min_ms": 1179.456,
        "max_ms": 1194.709,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1212.4975,
        "p95_ms": 1231.9684,
        "min_ms": 1194.5503,
        "max_ms": 1231.9684,
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
        "median_ms": 1226.1151,
        "p95_ms": 1307.9935,
        "min_ms": 1193.1926,
        "max_ms": 1307.9935,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1212.4975,
        "p95_ms": 1231.9684,
        "min_ms": 1194.5503,
        "max_ms": 1231.9684,
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
        "median_ms": 248.0082,
        "p95_ms": 260.728,
        "min_ms": 241.9586,
        "max_ms": 260.728,
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
        "median_ms": 250.1007,
        "p95_ms": 259.594,
        "min_ms": 247.7882,
        "max_ms": 259.594,
        "rounds": 3
      },
      "reference": {
        "median_ms": 248.0082,
        "p95_ms": 260.728,
        "min_ms": 241.9586,
        "max_ms": 260.728,
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
        "median_ms": 246.8178,
        "p95_ms": 269.1347,
        "min_ms": 246.1273,
        "max_ms": 269.1347,
        "rounds": 3
      },
      "reference": {
        "median_ms": 248.0082,
        "p95_ms": 260.728,
        "min_ms": 241.9586,
        "max_ms": 260.728,
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
        "median_ms": 249.7458,
        "p95_ms": 262.0147,
        "min_ms": 237.7159,
        "max_ms": 262.0147,
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
        "median_ms": 292.1593,
        "p95_ms": 302.5631,
        "min_ms": 239.3013,
        "max_ms": 302.5631,
        "rounds": 3
      },
      "reference": {
        "median_ms": 249.7458,
        "p95_ms": 262.0147,
        "min_ms": 237.7159,
        "max_ms": 262.0147,
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
        "median_ms": 253.8141,
        "p95_ms": 257.3386,
        "min_ms": 236.0162,
        "max_ms": 257.3386,
        "rounds": 3
      },
      "reference": {
        "median_ms": 249.7458,
        "p95_ms": 262.0147,
        "min_ms": 237.7159,
        "max_ms": 262.0147,
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
        "median_ms": 1626.997,
        "p95_ms": 1901.9078,
        "min_ms": 1622.671,
        "max_ms": 1901.9078,
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
        "median_ms": 1635.2954,
        "p95_ms": 1666.9822,
        "min_ms": 1597.9767,
        "max_ms": 1666.9822,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1626.997,
        "p95_ms": 1901.9078,
        "min_ms": 1622.671,
        "max_ms": 1901.9078,
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
        "median_ms": 1684.2952,
        "p95_ms": 1686.6335,
        "min_ms": 1624.0323,
        "max_ms": 1686.6335,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1626.997,
        "p95_ms": 1901.9078,
        "min_ms": 1622.671,
        "max_ms": 1901.9078,
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
        "median_ms": 46.7884,
        "p95_ms": 49.8751,
        "min_ms": 46.6204,
        "max_ms": 49.8751,
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
        "median_ms": 46.6449,
        "p95_ms": 47.1878,
        "min_ms": 44.7522,
        "max_ms": 47.1878,
        "rounds": 3
      },
      "reference": {
        "median_ms": 46.7884,
        "p95_ms": 49.8751,
        "min_ms": 46.6204,
        "max_ms": 49.8751,
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
        "median_ms": 64.9758,
        "p95_ms": 66.1667,
        "min_ms": 62.8318,
        "max_ms": 66.1667,
        "rounds": 3
      },
      "reference": {
        "median_ms": 46.7884,
        "p95_ms": 49.8751,
        "min_ms": 46.6204,
        "max_ms": 49.8751,
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
        "median_ms": 129.4662,
        "p95_ms": 134.2033,
        "min_ms": 127.2546,
        "max_ms": 134.2033,
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
        "median_ms": 17.3492,
        "p95_ms": 17.4457,
        "min_ms": 17.2484,
        "max_ms": 17.4457,
        "rounds": 3
      },
      "reference": {
        "median_ms": 129.4662,
        "p95_ms": 134.2033,
        "min_ms": 127.2546,
        "max_ms": 134.2033,
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
        "median_ms": 37.146,
        "p95_ms": 43.579,
        "min_ms": 36.6254,
        "max_ms": 43.579,
        "rounds": 3
      },
      "reference": {
        "median_ms": 129.4662,
        "p95_ms": 134.2033,
        "min_ms": 127.2546,
        "max_ms": 134.2033,
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
