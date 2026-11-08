# vs-js-libraries

Cross-client conformance and a side-by-side benchmark of the emulated Redis server
against two JavaScript Redis clients over RESP2:

- [`ioredis`](https://github.com/redis/ioredis) — benchmark baseline (`1.00x`)
- [`node-redis`](https://github.com/redis/node-redis) (`redis` npm package)
- `@yydb/redis` — this product's `startServer` plus a minimal RESP2 client built on
  `encodeCommand` and a local framing reader (`src/resp-client.mjs`)

Every client talks to the same emulated server process. The product package does not
ship a high-level client, so this example keeps its own request/response framing and
does not use `decodeReply`.

## Layout

- `src/resp-client.mjs` — RESP2 framing reader plus `command` / `pipeline` / `close`
- `src/clients.mjs` — the same adapter surface over ioredis, node-redis, and the product
- `src/timing.mjs` — `hrtime` elapsed time, median, p95, and throughput helpers
- `tests/conformance.mjs` — writes with one client and reads with the other two
- `tests/benchmark.mjs` — sequential, pipelined, GET, and PING workloads
- `reports/` — captured conformance and benchmark output

## Requirements

Build the product once so `@yydb/redis` can resolve its native binding:

```shell
pnpm install
pnpm build
```

The examples resolve `ioredis` and `redis` from the repository root `node_modules`,
just like the SQLite examples (`express` is used by the `with-express` example).

If pnpm still loads an older injected copy of the native platform package after
`pnpm build`, point `REDIS_NATIVE_PATH` at
`projects/redis.ts/platforms/redis-<platform>/redis.<platform>.node` for the run.

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

One file measures all three clients on four workloads:

| Workload | Shape |
|----------|-------|
| `set-seq` | 100 sequential awaited `SET` |
| `set-pipeline` | 500 `SET` in explicit pipelines of 500 |
| `get-seq` | 500 keys preloaded untimed, then 500 awaited `GET` |
| `ping` | 1,000 awaited `PING` |

Defaults are `BENCH_SET=100`, `BENCH_PIPE=500`, `BENCH_GET=500`, `BENCH_PING=1000`,
`BENCH_ROUNDS=3`. The `SET` counts are lower than the other workloads because each
`SET` rewrites the whole `.yykv` snapshot, so larger key spaces grow super-linearly.
Each round starts a fresh temporary data directory and a fresh server,
then runs every client against that same server. Reports use the median of the measured
rounds, milliseconds per operation, and operations per second.

```shell
pnpm --dir projects/redis.ts/examples/vs-js-libraries benchmark
```

## Reports

- [Conformance report](./reports/conformance.md)
- [Benchmark report](./reports/benchmark.md)

## Intentional deltas

- All clients share one server process per round; earlier clients leave keys and snapshot
  growth behind, so later clients write into a larger `.yykv` snapshot.
- The product client has no reconnect, offline queue, or retry behavior; a socket error
  fails the in-flight command.
- No pooling or auto-pipelining anywhere. Pipelined workloads use explicit batches of 500
  on all clients.
- All clients use RESP2 with a single TCP connection.
- `SET` rewrites the whole `.yykv` snapshot, so absolute `SET` numbers are snapshot-bound;
  `GET` and `PING` isolate round-trip overhead.
