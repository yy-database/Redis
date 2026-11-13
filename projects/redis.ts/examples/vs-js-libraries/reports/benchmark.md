# Benchmark report

Command: `pnpm --dir projects/redis.ts/examples/vs-js-libraries benchmark`
Binding: `release` — build with `pnpm build:release` and set `BENCH_BINDING_PROFILE=release` for product numbers
Defaults: `BENCH_SET=100`, `BENCH_GET=500`, `BENCH_PIPE=500`, `BENCH_PING=1000`, `BENCH_BATCH=500`, `BENCH_COLL=200`, `BENCH_BIG=20`, `BENCH_BIG_GET=50`, `BENCH_BIG_BYTES=65536`, `BENCH_CONNECT=50`, `BENCH_STREAM=200`, `BENCH_PUBSUB=100`, `BENCH_TTL=30`, `BENCH_TXN=100`, `BENCH_INCR=500`, `BENCH_MSET=500`, `BENCH_DEL=200`, `BENCH_MOVE=200`, `BENCH_BLOCK=100`, `BENCH_PING_CONC=800`, `BENCH_CONC=8`, `BENCH_GROUP=100`, `BENCH_ROUNDS=3`, `BENCH_WARMUP=1`
Baseline: `ioredis` against the emulated server = `1.00x`
Ratio: subject_time / baseline_time (smaller is faster). Fastest cell in each row is bold.
Stats: median/p95/min/max/rounds come from `database.harness::summarize` via `benchSummary` (addon:harnessBenchSummary + harnessBenchPerOp (database.harness::summarize / per_op_ms)); nearest-rank p95, even-length median averages the middle pair. Per-op milliseconds come from `database.harness::per_op_ms` via `benchPerOpMs`, the same DTO the summary returns. No median, p95 or per-op formula lives in this example.

## Provenance

- `node_version`: `v24.18.0`
- `rustc_version`: `rustc 1.101.0-nightly (1c3a65069 2026-11-02)`
- `target_triple`: `x86_64-pc-windows-msvc`
- `rev`: `8ee828ea465fc70234bea76d8bffcb48cf80e8f3`
- `plan`: `rounds=3, warmup=1`
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
| `set-big` | `redis-big-value-set` | 20 | {"ops":"20","value_bytes":"65536"} |
| `get-big` | `redis-big-value-get` | 50 | {"ops":"50","value_bytes":"65536"} |
| `del-seq` | `redis-key-del` | 200 | {"keys":"200"} |
| `move-seq` | `redis-key-move` | 200 | {"ops":"200","databases":"2"} |
| `ping` | `redis-ping-rtt` | 1000 | {"ops":"1000"} |
| `connect` | `redis-connect-open-close` | 50 | {"opens":"50","probe":"PING"} |

## Relative to `ioredis`

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|-------:|-------:|-------:|
| get-seq | 1.00x | **0.79x** | 1.32x |
| set-seq | **1.00x** | 1.19x | 1.75x |
| mset-seq | **1.00x** | 1.31x | 1.35x |
| incr-seq | 1.00x | **0.66x** | 0.77x |
| set-pipeline | **1.00x** | 1.18x | 1.17x |
| get-pipeline | **1.00x** | 1.02x | 1.01x |
| hash-hset-hget | 1.00x | 1.08x | **1.00x** |
| hash-setnx-hrandfield | 1.00x | **0.77x** | 0.84x |
| list-rpush-lrange | 1.00x | **0.88x** | 1.05x |
| set-sadd-smembers | **1.00x** | 1.11x | 1.71x |
| zset-zadd-zrange | 1.00x | 0.93x | **0.78x** |
| streams-xadd-xrange | 1.00x | **0.97x** | 0.98x |
| pubsub-roundtrip | 1.00x | **0.89x** | 1.12x |
| blpop-roundtrip | 1.00x | **0.94x** | 1.26x |
| scan-full | **1.00x** | 1.01x | 1.16x |
| ping-concurrent | **1.00x** | 1.05x | 1.32x |
| stream-group | **1.00x** | 1.18x | 1.14x |
| ttl-setex-expire | **1.00x** | 1.00x | 1.01x |
| multi-exec | **1.00x** | 1.17x | 1.37x |
| set-big | 1.00x | **0.61x** | 0.61x |
| get-big | **1.00x** | 1.17x | 1.77x |
| del-seq | **1.00x** | 2.68x | 1.31x |
| move-seq | 1.00x | 0.85x | **0.78x** |
| ping | **1.00x** | 1.03x | 1.22x |
| connect | 1.00x | **0.23x** | 0.61x |

## Median and p95 (ms)

| Workload | ops | ioredis med | ioredis p95 | @yydb/redis med | @yydb/redis p95 | node-redis med | node-redis p95 |
|---------:|----:|-------:|-------:|-------:|-------:|-------:|-------:|
| get-seq | 500 | 43.69 | 58.79 | 34.47 | 44.65 | 57.82 | 61.13 |
| set-seq | 100 | 70.60 | 70.76 | 84.03 | 108.19 | 123.79 | 131.72 |
| mset-seq | 500 | 5.92 | 7.10 | 7.75 | 8.12 | 7.97 | 13.52 |
| incr-seq | 500 | 48.23 | 53.39 | 31.95 | 33.21 | 37.08 | 49.19 |
| set-pipeline | 500 | 10.48 | 12.39 | 12.36 | 13.64 | 12.21 | 13.29 |
| get-pipeline | 500 | 12.23 | 14.60 | 12.42 | 12.77 | 12.33 | 12.58 |
| hash-hset-hget | 401 | 158.12 | 160.57 | 170.42 | 174.51 | 157.43 | 158.73 |
| hash-setnx-hrandfield | 402 | 157.98 | 185.22 | 121.73 | 130.57 | 132.90 | 141.18 |
| list-rpush-lrange | 202 | 144.82 | 186.25 | 127.95 | 132.88 | 151.63 | 153.27 |
| set-sadd-smembers | 202 | 152.62 | 153.35 | 170.04 | 192.60 | 260.22 | 260.24 |
| zset-zadd-zrange | 202 | 176.68 | 191.64 | 164.06 | 167.57 | 138.66 | 150.09 |
| streams-xadd-xrange | 202 | 144.06 | 175.88 | 140.07 | 151.50 | 140.88 | 165.16 |
| pubsub-roundtrip | 100 | 9.01 | 10.50 | 8.04 | 8.09 | 10.07 | 12.39 |
| blpop-roundtrip | 100 | 61.86 | 62.01 | 57.92 | 59.85 | 77.65 | 137.92 |
| scan-full | 200 | 3.46 | 4.83 | 3.48 | 4.53 | 4.00 | 4.57 |
| ping-concurrent | 800 | 28.07 | 29.76 | 29.52 | 31.21 | 37.10 | 37.69 |
| stream-group | 300 | 200.71 | 221.88 | 237.49 | 276.50 | 228.10 | 234.47 |
| ttl-setex-expire | 90 | 1128.61 | 1130.47 | 1131.10 | 1131.36 | 1142.40 | 1146.38 |
| multi-exec | 102 | 13.61 | 18.49 | 15.86 | 66.74 | 18.71 | 54.77 |
| set-big | 20 | 163.49 | 164.75 | 99.34 | 104.06 | 99.97 | 123.32 |
| get-big | 50 | 59.13 | 59.91 | 69.41 | 75.34 | 104.37 | 106.01 |
| del-seq | 200 | 126.57 | 133.50 | 338.66 | 346.06 | 165.21 | 190.01 |
| move-seq | 200 | 163.66 | 166.31 | 139.15 | 163.11 | 127.09 | 150.33 |
| ping | 1000 | 37.55 | 42.42 | 38.80 | 42.46 | 45.99 | 51.49 |
| connect | 50 | 76.95 | 87.99 | 17.75 | 23.17 | 46.58 | 46.95 |

## Per-op and throughput (median)

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|--------:|--------:|--------:|
| get-seq | 0.087 ms/op, 11,445/s | 0.069 ms/op, 14,504/s | 0.116 ms/op, 8,647/s |
| set-seq | 0.706 ms/op, 1,416/s | 0.840 ms/op, 1,190/s | 1.238 ms/op, 808/s |
| mset-seq | 0.012 ms/op, 84,435/s | 0.016 ms/op, 64,488/s | 0.016 ms/op, 62,709/s |
| incr-seq | 0.096 ms/op, 10,367/s | 0.064 ms/op, 15,649/s | 0.074 ms/op, 13,485/s |
| set-pipeline | 0.021 ms/op, 47,728/s | 0.025 ms/op, 40,445/s | 0.024 ms/op, 40,948/s |
| get-pipeline | 0.024 ms/op, 40,867/s | 0.025 ms/op, 40,245/s | 0.025 ms/op, 40,547/s |
| hash-hset-hget | 0.394 ms/op, 2,536/s | 0.425 ms/op, 2,353/s | 0.393 ms/op, 2,547/s |
| hash-setnx-hrandfield | 0.393 ms/op, 2,545/s | 0.303 ms/op, 3,302/s | 0.331 ms/op, 3,025/s |
| list-rpush-lrange | 0.717 ms/op, 1,395/s | 0.633 ms/op, 1,579/s | 0.751 ms/op, 1,332/s |
| set-sadd-smembers | 0.756 ms/op, 1,324/s | 0.842 ms/op, 1,188/s | 1.288 ms/op, 776/s |
| zset-zadd-zrange | 0.875 ms/op, 1,143/s | 0.812 ms/op, 1,231/s | 0.686 ms/op, 1,457/s |
| streams-xadd-xrange | 0.713 ms/op, 1,402/s | 0.693 ms/op, 1,442/s | 0.697 ms/op, 1,434/s |
| pubsub-roundtrip | 0.090 ms/op, 11,099/s | 0.080 ms/op, 12,436/s | 0.101 ms/op, 9,927/s |
| blpop-roundtrip | 0.619 ms/op, 1,617/s | 0.579 ms/op, 1,727/s | 0.777 ms/op, 1,288/s |
| scan-full | 0.017 ms/op, 57,837/s | 0.017 ms/op, 57,478/s | 0.020 ms/op, 50,000/s |
| ping-concurrent | 0.035 ms/op, 28,504/s | 0.037 ms/op, 27,104/s | 0.046 ms/op, 21,565/s |
| stream-group | 0.669 ms/op, 1,495/s | 0.792 ms/op, 1,263/s | 0.760 ms/op, 1,315/s |
| ttl-setex-expire | 12.540 ms/op, 80/s | 12.568 ms/op, 80/s | 12.693 ms/op, 79/s |
| multi-exec | 0.133 ms/op, 7,496/s | 0.155 ms/op, 6,431/s | 0.183 ms/op, 5,452/s |
| set-big | 8.174 ms/op, 122/s | 4.967 ms/op, 201/s | 4.998 ms/op, 200/s |
| get-big | 1.183 ms/op, 846/s | 1.388 ms/op, 720/s | 2.087 ms/op, 479/s |
| del-seq | 0.633 ms/op, 1,580/s | 1.693 ms/op, 591/s | 0.826 ms/op, 1,211/s |
| move-seq | 0.818 ms/op, 1,222/s | 0.696 ms/op, 1,437/s | 0.635 ms/op, 1,574/s |
| ping | 0.038 ms/op, 26,631/s | 0.039 ms/op, 25,771/s | 0.046 ms/op, 21,742/s |
| connect | 1.539 ms/op, 650/s | 0.355 ms/op, 2,816/s | 0.932 ms/op, 1,074/s |

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
      "txn": "100",
      "incr": "500",
      "mset": "500",
      "del": "200",
      "move": "200",
      "block": "100",
      "ping_conc": "800",
      "conc": "8",
      "group": "100"
    },
    "data_scale": "matrix=25x3",
    "rustc_version": "rustc 1.101.0-nightly (1c3a65069 2026-11-02)",
    "node_version": "v24.18.0",
    "target_triple": "x86_64-pc-windows-msvc",
    "rev": "8ee828ea465fc70234bea76d8bffcb48cf80e8f3",
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
        "median_ms": 43.6859,
        "p95_ms": 58.793,
        "min_ms": 43.4831,
        "max_ms": 58.793,
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
        "median_ms": 34.4725,
        "p95_ms": 44.6505,
        "min_ms": 32.4642,
        "max_ms": 44.6505,
        "rounds": 3
      },
      "reference": {
        "median_ms": 43.6859,
        "p95_ms": 58.793,
        "min_ms": 43.4831,
        "max_ms": 58.793,
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
        "median_ms": 57.8214,
        "p95_ms": 61.125,
        "min_ms": 57.0774,
        "max_ms": 61.125,
        "rounds": 3
      },
      "reference": {
        "median_ms": 43.6859,
        "p95_ms": 58.793,
        "min_ms": 43.4831,
        "max_ms": 58.793,
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
        "median_ms": 70.6013,
        "p95_ms": 70.7649,
        "min_ms": 67.6836,
        "max_ms": 70.7649,
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
        "median_ms": 84.026,
        "p95_ms": 108.1937,
        "min_ms": 81.8297,
        "max_ms": 108.1937,
        "rounds": 3
      },
      "reference": {
        "median_ms": 70.6013,
        "p95_ms": 70.7649,
        "min_ms": 67.6836,
        "max_ms": 70.7649,
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
        "median_ms": 123.786,
        "p95_ms": 131.7163,
        "min_ms": 99.4067,
        "max_ms": 131.7163,
        "rounds": 3
      },
      "reference": {
        "median_ms": 70.6013,
        "p95_ms": 70.7649,
        "min_ms": 67.6836,
        "max_ms": 70.7649,
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
      "workload": "mset-seq@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 5.9217,
        "p95_ms": 7.1011,
        "min_ms": 5.817,
        "max_ms": 7.1011,
        "rounds": 3
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
        "median_ms": 7.7534,
        "p95_ms": 8.1235,
        "min_ms": 7.5772,
        "max_ms": 8.1235,
        "rounds": 3
      },
      "reference": {
        "median_ms": 5.9217,
        "p95_ms": 7.1011,
        "min_ms": 5.817,
        "max_ms": 7.1011,
        "rounds": 3
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
        "median_ms": 7.9734,
        "p95_ms": 13.5202,
        "min_ms": 7.3695,
        "max_ms": 13.5202,
        "rounds": 3
      },
      "reference": {
        "median_ms": 5.9217,
        "p95_ms": 7.1011,
        "min_ms": 5.817,
        "max_ms": 7.1011,
        "rounds": 3
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
        "median_ms": 48.2302,
        "p95_ms": 53.3905,
        "min_ms": 37.4708,
        "max_ms": 53.3905,
        "rounds": 3
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
        "median_ms": 31.9515,
        "p95_ms": 33.214,
        "min_ms": 28.349,
        "max_ms": 33.214,
        "rounds": 3
      },
      "reference": {
        "median_ms": 48.2302,
        "p95_ms": 53.3905,
        "min_ms": 37.4708,
        "max_ms": 53.3905,
        "rounds": 3
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
        "median_ms": 37.0792,
        "p95_ms": 49.1891,
        "min_ms": 35.443,
        "max_ms": 49.1891,
        "rounds": 3
      },
      "reference": {
        "median_ms": 48.2302,
        "p95_ms": 53.3905,
        "min_ms": 37.4708,
        "max_ms": 53.3905,
        "rounds": 3
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
        "median_ms": 10.4761,
        "p95_ms": 12.386,
        "min_ms": 9.9006,
        "max_ms": 12.386,
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
        "median_ms": 12.3624,
        "p95_ms": 13.6429,
        "min_ms": 12.0738,
        "max_ms": 13.6429,
        "rounds": 3
      },
      "reference": {
        "median_ms": 10.4761,
        "p95_ms": 12.386,
        "min_ms": 9.9006,
        "max_ms": 12.386,
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
        "median_ms": 12.2106,
        "p95_ms": 13.2945,
        "min_ms": 12.0724,
        "max_ms": 13.2945,
        "rounds": 3
      },
      "reference": {
        "median_ms": 10.4761,
        "p95_ms": 12.386,
        "min_ms": 9.9006,
        "max_ms": 12.386,
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
        "median_ms": 12.2348,
        "p95_ms": 14.5974,
        "min_ms": 12.1719,
        "max_ms": 14.5974,
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
        "median_ms": 12.4239,
        "p95_ms": 12.7653,
        "min_ms": 10.7168,
        "max_ms": 12.7653,
        "rounds": 3
      },
      "reference": {
        "median_ms": 12.2348,
        "p95_ms": 14.5974,
        "min_ms": 12.1719,
        "max_ms": 14.5974,
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
        "median_ms": 12.3315,
        "p95_ms": 12.5833,
        "min_ms": 11.0164,
        "max_ms": 12.5833,
        "rounds": 3
      },
      "reference": {
        "median_ms": 12.2348,
        "p95_ms": 14.5974,
        "min_ms": 12.1719,
        "max_ms": 14.5974,
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
        "median_ms": 158.1161,
        "p95_ms": 160.5739,
        "min_ms": 144.0026,
        "max_ms": 160.5739,
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
        "median_ms": 170.4153,
        "p95_ms": 174.513,
        "min_ms": 150.0922,
        "max_ms": 174.513,
        "rounds": 3
      },
      "reference": {
        "median_ms": 158.1161,
        "p95_ms": 160.5739,
        "min_ms": 144.0026,
        "max_ms": 160.5739,
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
        "median_ms": 157.4271,
        "p95_ms": 158.7262,
        "min_ms": 156.8339,
        "max_ms": 158.7262,
        "rounds": 3
      },
      "reference": {
        "median_ms": 158.1161,
        "p95_ms": 160.5739,
        "min_ms": 144.0026,
        "max_ms": 160.5739,
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
        "median_ms": 157.982,
        "p95_ms": 185.2195,
        "min_ms": 135.2244,
        "max_ms": 185.2195,
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
        "median_ms": 121.7262,
        "p95_ms": 130.5674,
        "min_ms": 116.5202,
        "max_ms": 130.5674,
        "rounds": 3
      },
      "reference": {
        "median_ms": 157.982,
        "p95_ms": 185.2195,
        "min_ms": 135.2244,
        "max_ms": 185.2195,
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
        "median_ms": 132.9025,
        "p95_ms": 141.1774,
        "min_ms": 128.735,
        "max_ms": 141.1774,
        "rounds": 3
      },
      "reference": {
        "median_ms": 157.982,
        "p95_ms": 185.2195,
        "min_ms": 135.2244,
        "max_ms": 185.2195,
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
        "median_ms": 144.8246,
        "p95_ms": 186.2512,
        "min_ms": 139.2773,
        "max_ms": 186.2512,
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
        "median_ms": 127.9528,
        "p95_ms": 132.8834,
        "min_ms": 105.8189,
        "max_ms": 132.8834,
        "rounds": 3
      },
      "reference": {
        "median_ms": 144.8246,
        "p95_ms": 186.2512,
        "min_ms": 139.2773,
        "max_ms": 186.2512,
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
        "median_ms": 151.6296,
        "p95_ms": 153.2721,
        "min_ms": 132.4699,
        "max_ms": 153.2721,
        "rounds": 3
      },
      "reference": {
        "median_ms": 144.8246,
        "p95_ms": 186.2512,
        "min_ms": 139.2773,
        "max_ms": 186.2512,
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
        "median_ms": 152.6186,
        "p95_ms": 153.3543,
        "min_ms": 122.6514,
        "max_ms": 153.3543,
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
        "median_ms": 170.0422,
        "p95_ms": 192.6026,
        "min_ms": 146.6299,
        "max_ms": 192.6026,
        "rounds": 3
      },
      "reference": {
        "median_ms": 152.6186,
        "p95_ms": 153.3543,
        "min_ms": 122.6514,
        "max_ms": 153.3543,
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
        "median_ms": 260.2196,
        "p95_ms": 260.2404,
        "min_ms": 213.3656,
        "max_ms": 260.2404,
        "rounds": 3
      },
      "reference": {
        "median_ms": 152.6186,
        "p95_ms": 153.3543,
        "min_ms": 122.6514,
        "max_ms": 153.3543,
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
        "median_ms": 176.6774,
        "p95_ms": 191.6352,
        "min_ms": 172.3967,
        "max_ms": 191.6352,
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
        "median_ms": 164.0645,
        "p95_ms": 167.5672,
        "min_ms": 121.1042,
        "max_ms": 167.5672,
        "rounds": 3
      },
      "reference": {
        "median_ms": 176.6774,
        "p95_ms": 191.6352,
        "min_ms": 172.3967,
        "max_ms": 191.6352,
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
        "median_ms": 138.6572,
        "p95_ms": 150.0907,
        "min_ms": 114.4478,
        "max_ms": 150.0907,
        "rounds": 3
      },
      "reference": {
        "median_ms": 176.6774,
        "p95_ms": 191.6352,
        "min_ms": 172.3967,
        "max_ms": 191.6352,
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
        "median_ms": 144.0635,
        "p95_ms": 175.8802,
        "min_ms": 135.555,
        "max_ms": 175.8802,
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
        "median_ms": 140.07,
        "p95_ms": 151.4994,
        "min_ms": 136.2005,
        "max_ms": 151.4994,
        "rounds": 3
      },
      "reference": {
        "median_ms": 144.0635,
        "p95_ms": 175.8802,
        "min_ms": 135.555,
        "max_ms": 175.8802,
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
        "median_ms": 140.8776,
        "p95_ms": 165.1647,
        "min_ms": 127.5563,
        "max_ms": 165.1647,
        "rounds": 3
      },
      "reference": {
        "median_ms": 144.0635,
        "p95_ms": 175.8802,
        "min_ms": 135.555,
        "max_ms": 175.8802,
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
        "median_ms": 9.0097,
        "p95_ms": 10.4963,
        "min_ms": 8.8082,
        "max_ms": 10.4963,
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
        "median_ms": 8.0409,
        "p95_ms": 8.0903,
        "min_ms": 6.3952,
        "max_ms": 8.0903,
        "rounds": 3
      },
      "reference": {
        "median_ms": 9.0097,
        "p95_ms": 10.4963,
        "min_ms": 8.8082,
        "max_ms": 10.4963,
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
        "median_ms": 10.0735,
        "p95_ms": 12.3904,
        "min_ms": 8.9479,
        "max_ms": 12.3904,
        "rounds": 3
      },
      "reference": {
        "median_ms": 9.0097,
        "p95_ms": 10.4963,
        "min_ms": 8.8082,
        "max_ms": 10.4963,
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
      "workload": "blpop-roundtrip@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 61.8557,
        "p95_ms": 62.0069,
        "min_ms": 58.7762,
        "max_ms": 62.0069,
        "rounds": 3
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
        "median_ms": 57.9164,
        "p95_ms": 59.8493,
        "min_ms": 56.3607,
        "max_ms": 59.8493,
        "rounds": 3
      },
      "reference": {
        "median_ms": 61.8557,
        "p95_ms": 62.0069,
        "min_ms": 58.7762,
        "max_ms": 62.0069,
        "rounds": 3
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
        "median_ms": 77.6523,
        "p95_ms": 137.9241,
        "min_ms": 67.6789,
        "max_ms": 137.9241,
        "rounds": 3
      },
      "reference": {
        "median_ms": 61.8557,
        "p95_ms": 62.0069,
        "min_ms": 58.7762,
        "max_ms": 62.0069,
        "rounds": 3
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
        "median_ms": 3.458,
        "p95_ms": 4.8324,
        "min_ms": 3.3766,
        "max_ms": 4.8324,
        "rounds": 3
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
        "median_ms": 3.4796,
        "p95_ms": 4.5285,
        "min_ms": 3.058,
        "max_ms": 4.5285,
        "rounds": 3
      },
      "reference": {
        "median_ms": 3.458,
        "p95_ms": 4.8324,
        "min_ms": 3.3766,
        "max_ms": 4.8324,
        "rounds": 3
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
        "median_ms": 4,
        "p95_ms": 4.5688,
        "min_ms": 2.849,
        "max_ms": 4.5688,
        "rounds": 3
      },
      "reference": {
        "median_ms": 3.458,
        "p95_ms": 4.8324,
        "min_ms": 3.3766,
        "max_ms": 4.8324,
        "rounds": 3
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
        "median_ms": 28.0658,
        "p95_ms": 29.7595,
        "min_ms": 26.0257,
        "max_ms": 29.7595,
        "rounds": 3
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
        "median_ms": 29.5162,
        "p95_ms": 31.2121,
        "min_ms": 28.4323,
        "max_ms": 31.2121,
        "rounds": 3
      },
      "reference": {
        "median_ms": 28.0658,
        "p95_ms": 29.7595,
        "min_ms": 26.0257,
        "max_ms": 29.7595,
        "rounds": 3
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
        "median_ms": 37.0964,
        "p95_ms": 37.6937,
        "min_ms": 36.2132,
        "max_ms": 37.6937,
        "rounds": 3
      },
      "reference": {
        "median_ms": 28.0658,
        "p95_ms": 29.7595,
        "min_ms": 26.0257,
        "max_ms": 29.7595,
        "rounds": 3
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
        "median_ms": 200.71,
        "p95_ms": 221.8757,
        "min_ms": 191.2843,
        "max_ms": 221.8757,
        "rounds": 3
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
        "median_ms": 237.4918,
        "p95_ms": 276.4979,
        "min_ms": 236.7492,
        "max_ms": 276.4979,
        "rounds": 3
      },
      "reference": {
        "median_ms": 200.71,
        "p95_ms": 221.8757,
        "min_ms": 191.2843,
        "max_ms": 221.8757,
        "rounds": 3
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
        "median_ms": 228.0981,
        "p95_ms": 234.4703,
        "min_ms": 218.8662,
        "max_ms": 234.4703,
        "rounds": 3
      },
      "reference": {
        "median_ms": 200.71,
        "p95_ms": 221.8757,
        "min_ms": 191.2843,
        "max_ms": 221.8757,
        "rounds": 3
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
        "median_ms": 1128.6109,
        "p95_ms": 1130.4744,
        "min_ms": 1122.3213,
        "max_ms": 1130.4744,
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
        "median_ms": 1131.1029,
        "p95_ms": 1131.3577,
        "min_ms": 1129.9042,
        "max_ms": 1131.3577,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1128.6109,
        "p95_ms": 1130.4744,
        "min_ms": 1122.3213,
        "max_ms": 1130.4744,
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
        "median_ms": 1142.3961,
        "p95_ms": 1146.3818,
        "min_ms": 1141.7801,
        "max_ms": 1146.3818,
        "rounds": 3
      },
      "reference": {
        "median_ms": 1128.6109,
        "p95_ms": 1130.4744,
        "min_ms": 1122.3213,
        "max_ms": 1130.4744,
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
        "median_ms": 13.6067,
        "p95_ms": 18.4926,
        "min_ms": 12.3211,
        "max_ms": 18.4926,
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
        "median_ms": 15.8605,
        "p95_ms": 66.7371,
        "min_ms": 15.5758,
        "max_ms": 66.7371,
        "rounds": 3
      },
      "reference": {
        "median_ms": 13.6067,
        "p95_ms": 18.4926,
        "min_ms": 12.3211,
        "max_ms": 18.4926,
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
        "median_ms": 18.7088,
        "p95_ms": 54.7675,
        "min_ms": 15.3469,
        "max_ms": 54.7675,
        "rounds": 3
      },
      "reference": {
        "median_ms": 13.6067,
        "p95_ms": 18.4926,
        "min_ms": 12.3211,
        "max_ms": 18.4926,
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
        "median_ms": 163.4866,
        "p95_ms": 164.7525,
        "min_ms": 113.2487,
        "max_ms": 164.7525,
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
        "median_ms": 99.3351,
        "p95_ms": 104.0643,
        "min_ms": 92.3241,
        "max_ms": 104.0643,
        "rounds": 3
      },
      "reference": {
        "median_ms": 163.4866,
        "p95_ms": 164.7525,
        "min_ms": 113.2487,
        "max_ms": 164.7525,
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
        "median_ms": 99.967,
        "p95_ms": 123.3194,
        "min_ms": 92.634,
        "max_ms": 123.3194,
        "rounds": 3
      },
      "reference": {
        "median_ms": 163.4866,
        "p95_ms": 164.7525,
        "min_ms": 113.2487,
        "max_ms": 164.7525,
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
        "median_ms": 59.1331,
        "p95_ms": 59.9126,
        "min_ms": 54.8558,
        "max_ms": 59.9126,
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
        "median_ms": 69.4093,
        "p95_ms": 75.3361,
        "min_ms": 57.6196,
        "max_ms": 75.3361,
        "rounds": 3
      },
      "reference": {
        "median_ms": 59.1331,
        "p95_ms": 59.9126,
        "min_ms": 54.8558,
        "max_ms": 59.9126,
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
        "median_ms": 104.3732,
        "p95_ms": 106.0104,
        "min_ms": 74.0073,
        "max_ms": 106.0104,
        "rounds": 3
      },
      "reference": {
        "median_ms": 59.1331,
        "p95_ms": 59.9126,
        "min_ms": 54.8558,
        "max_ms": 59.9126,
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
      "workload": "del-seq@ioredis",
      "unit": "ms",
      "ours": {
        "median_ms": 126.5655,
        "p95_ms": 133.4997,
        "min_ms": 121.6794,
        "max_ms": 133.4997,
        "rounds": 3
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
        "median_ms": 338.6562,
        "p95_ms": 346.0615,
        "min_ms": 174.4904,
        "max_ms": 346.0615,
        "rounds": 3
      },
      "reference": {
        "median_ms": 126.5655,
        "p95_ms": 133.4997,
        "min_ms": 121.6794,
        "max_ms": 133.4997,
        "rounds": 3
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
        "median_ms": 165.2102,
        "p95_ms": 190.0085,
        "min_ms": 164.087,
        "max_ms": 190.0085,
        "rounds": 3
      },
      "reference": {
        "median_ms": 126.5655,
        "p95_ms": 133.4997,
        "min_ms": 121.6794,
        "max_ms": 133.4997,
        "rounds": 3
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
        "median_ms": 163.6552,
        "p95_ms": 166.3099,
        "min_ms": 146.9746,
        "max_ms": 166.3099,
        "rounds": 3
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
        "median_ms": 139.1498,
        "p95_ms": 163.1135,
        "min_ms": 131.7916,
        "max_ms": 163.1135,
        "rounds": 3
      },
      "reference": {
        "median_ms": 163.6552,
        "p95_ms": 166.3099,
        "min_ms": 146.9746,
        "max_ms": 166.3099,
        "rounds": 3
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
        "median_ms": 127.093,
        "p95_ms": 150.3278,
        "min_ms": 123.7573,
        "max_ms": 150.3278,
        "rounds": 3
      },
      "reference": {
        "median_ms": 163.6552,
        "p95_ms": 166.3099,
        "min_ms": 146.9746,
        "max_ms": 166.3099,
        "rounds": 3
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
        "median_ms": 37.5505,
        "p95_ms": 42.418,
        "min_ms": 33.847,
        "max_ms": 42.418,
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
        "median_ms": 38.8026,
        "p95_ms": 42.4605,
        "min_ms": 33.7424,
        "max_ms": 42.4605,
        "rounds": 3
      },
      "reference": {
        "median_ms": 37.5505,
        "p95_ms": 42.418,
        "min_ms": 33.847,
        "max_ms": 42.418,
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
        "median_ms": 45.9941,
        "p95_ms": 51.49,
        "min_ms": 38.6735,
        "max_ms": 51.49,
        "rounds": 3
      },
      "reference": {
        "median_ms": 37.5505,
        "p95_ms": 42.418,
        "min_ms": 33.847,
        "max_ms": 42.418,
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
        "median_ms": 76.9526,
        "p95_ms": 87.9852,
        "min_ms": 65.4525,
        "max_ms": 87.9852,
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
        "median_ms": 17.7528,
        "p95_ms": 23.1674,
        "min_ms": 16.562,
        "max_ms": 23.1674,
        "rounds": 3
      },
      "reference": {
        "median_ms": 76.9526,
        "p95_ms": 87.9852,
        "min_ms": 65.4525,
        "max_ms": 87.9852,
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
        "median_ms": 46.576,
        "p95_ms": 46.9487,
        "min_ms": 42.3469,
        "max_ms": 46.9487,
        "rounds": 3
      },
      "reference": {
        "median_ms": 76.9526,
        "p95_ms": 87.9852,
        "min_ms": 65.4525,
        "max_ms": 87.9852,
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
