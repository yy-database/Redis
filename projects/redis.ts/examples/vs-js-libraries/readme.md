# vs-js-libraries

Cross-client conformance and a side-by-side benchmark of the emulated Redis server
against two JavaScript Redis clients over RESP2:

- [`ioredis`](https://github.com/redis/ioredis) — benchmark baseline (`1.00x`)
- [`node-redis`](https://github.com/redis/node-redis) (`redis` npm package)
- `@yydb/redis` — this product's `startServer` plus a minimal RESP2 client built on
  `encodeCommand` and a local framing reader (`src/resp-client.mjs`)

Conformance runs every client against one emulated server process. Each benchmark
(workload, client) cell instead gets its own fresh server and data directory, with the
warmup and measured rounds of that cell sharing it. The product package
does not ship a high-level client, so this example keeps its own request/response
framing and does not use `decodeReply`.

## Layout

- `src/resp-client.mjs` — RESP2 framing reader plus `command` / `pipeline` / `close`
- `src/clients.mjs` — the same adapter surface over ioredis, node-redis, and the product
- `src/timing.mjs` — `hrtime` elapsed time and throughput helpers (no median or p95 here)
- `src/harness-bench.mjs` — the single stats entry: median/p95/min/max via the upstream
  `database.harness::summarize` (`harnessBenchSummary` when the platform binding exposes
  it, otherwise the crate's golden vectors, asserted on every load)
- `tests/conformance.mjs` — writes with one client and reads with the other two
- `tests/benchmark.mjs` — the scenario matrix below, with provenance and optional
  real-server oracle comparison
- `reports/` — captured conformance and benchmark output
- `../shared/product.mjs` — loads the checkout platform binding before importing the product

## Requirements

Build the product once so `@yydb/redis` can resolve its native binding:

```shell
pnpm install
pnpm build
```

The examples resolve `ioredis` and `redis` from the repository root `node_modules`,
just like the SQLite examples (`express` is used by the `with-express` example). Every
example loads `../../shared/product.mjs` first, which points the product at the
checkout's platform binding produced by `pnpm build`, so no environment variable is
needed.

Command names delegated to the native command families are matched case-sensitively by
the current backend. The ioredis and node-redis adapters therefore use their explicit
uppercase command forms (`call('SET', ...)` and `sendCommand(['SET', ...])`) instead of
the lowercase convenience methods.

## Conformance

One server, three clients. Each writer's keys are read by both other clients, `EX 1`
keys expire within 1.1 seconds, and explicit pipelines preserve request order.

```shell
pnpm --dir projects/redis.ts/examples/vs-js-libraries test
```

## Benchmark

One file measures all three clients across the scenario matrix. Each row carries a
stable scenario id, so runs can be compared across revisions:

| Workload | Scenario | Shape |
|----------|----------|-------|
| `get-seq` | `redis-string-get` | awaited `GET` point reads |
| `set-seq` | `redis-string-set` | awaited `SET` point writes |
| `set-pipeline` | `redis-pipeline-set` | `SET` throughput in explicit pipelines |
| `get-pipeline` | `redis-pipeline-get` | `GET` throughput in explicit pipelines |
| `hash-hset-hget` | `redis-hash-hset-hget` | `HSET` + `HGET` on one hash |
| `list-rpush-lrange` | `redis-list-rpush-lrange` | `RPUSH` + `LRANGE` on one list |
| `set-sadd-smembers` | `redis-set-sadd-smembers` | `SADD` + `SMEMBERS` on one set |
| `zset-zadd-zrange` | `redis-zset-zadd-zrange` | `ZADD` + `ZRANGE WITHSCORES` on one zset |
| `set-big` | `redis-big-value-set` | large-value `SET` |
| `get-big` | `redis-big-value-get` | large-value `GET` |
| `ping` | `redis-ping-rtt` | awaited `PING` round-trips |
| `connect` | `redis-connect-open-close` | establish + readiness `PING` + close |

Defaults are `BENCH_SET=100`, `BENCH_GET=500`, `BENCH_PIPE=500`, `BENCH_PING=1000`,
`BENCH_BATCH=500`, `BENCH_COLL=200`, `BENCH_BIG=20`, `BENCH_BIG_GET=50`,
`BENCH_BIG_BYTES=65536`, `BENCH_CONNECT=50`, `BENCH_ROUNDS=3`, `BENCH_WARMUP=1`. The
`SET` counts are lower than the other workloads because each `SET` rewrites the whole
`.yykv` snapshot, so larger key spaces grow super-linearly.

Every cell starts a fresh temporary data directory and a fresh server, runs its untimed
preload on that empty server, warms up, and only then collects `BENCH_ROUNDS` timed
samples on one connection. Statistics never come from a local formula: median, p95,
min, max, and rounds come from `database.harness::summarize` through
`src/harness-bench.mjs` (`harnessBenchSummary` on the platform binding when present,
otherwise the crate's golden vectors, re-asserted on every load). Reports carry
provenance in the harness `BenchReport` wire shape — `node_version`, `rustc_version`,
`target_triple`, `rev`, data scale, scenario params, and the rounds plan.

Real-server comparison: set `BENCH_ORACLE_HOST` (and optionally `BENCH_ORACLE_PORT`) to
a reachable `redis-server` and the same matrix reruns with `ioredis` as the fixed
client against it, reported as a `redis-server (oracle)` column. The script refuses an
oracle that answers `redis_mode:disguise`, so the emulated server can never masquerade
as the expected value. Without a reachable real server the report states the
oracle-limitation instead of silently comparing against this repository.

```shell
pnpm --dir projects/redis.ts/examples/vs-js-libraries benchmark
```

## Reports

- [Conformance report](./reports/conformance.md)
- [Benchmark report](./reports/benchmark.md)

## Intentional deltas

- Each (workload, client) cell is isolated: a fresh data directory and a fresh server,
  then that cell's untimed preload, warmup, and timed rounds on one connection. All
  clients start from the same state.
- Collection workloads begin each round with `DEL` so rounds stay idempotent; the `DEL`
  is timed and counted in ops on every client.
- The `connect` workload measures establish + one readiness `PING` + close per op so
  every client pays a full handshake regardless of lazy-connect behavior.
- The product client has no reconnect, offline queue, or retry behavior; a socket error
  fails the in-flight command.
- No pooling or auto-pipelining anywhere. Pipelined workloads use explicit batches of 500
  on all clients.
- All clients use RESP2 with a single TCP connection.
- `SET` rewrites the whole `.yykv` snapshot, so absolute `SET` numbers are snapshot-bound;
  `GET` and `PING` isolate round-trip overhead.
- The emulated server answers `ZRANGE ... WITHSCORES` with nested pairs even under
  RESP2; the workload normalizes both shapes outside the timed command count.
