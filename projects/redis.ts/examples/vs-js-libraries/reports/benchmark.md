# Benchmark report

Command: `pnpm --dir projects/redis.ts/examples/vs-js-libraries benchmark`
Defaults: `BENCH_SET=100`, `BENCH_PIPE=500`, `BENCH_GET=500`, `BENCH_PING=1000`, `BENCH_ROUNDS=3`
Baseline: `ioredis` = `1.00x`
Ratio: subject_time / baseline_time (smaller is faster). Fastest cell in each row is bold.
Measured: 1 untimed warmup round plus the median of 3 measured rounds.

Every `(round, workload, client)` measurement gets a fresh `mkdtemp` data directory and
a fresh server. The client connects, runs its untimed preload on that empty server, and
only then starts the clock. Server start/stop and preload stay outside the timed region,
so all clients start every workload from the same empty state.

The `SET` counts are lower than the original plan because every `SET` rewrites the whole
`.yykv` snapshot, so growing key spaces make those workloads super-linear. The tuned
counts keep a full run to a few minutes without changing the protocol or client options.

## Relative to `ioredis`

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|-------:|-----------:|-----------:|
| set-seq | 1.00x | **0.91x** | 0.99x |
| set-pipeline | 1.00x | 1.04x | **0.98x** |
| get-seq | **1.00x** | 1.01x | 1.02x |
| ping | **1.00x** | 1.10x | 1.24x |

## Median time and throughput

| Workload | ops | ioredis | @yydb/redis | node-redis |
|---------:|----:|--------:|------------:|-----------:|
| set-seq | 100 | 4.046 ms/op, 247/s | 3.688 ms/op, 271/s | 3.986 ms/op, 251/s |
| set-pipeline | 500 | 4.502 ms/op, 222/s | 4.687 ms/op, 213/s | 4.392 ms/op, 228/s |
| get-seq | 500 | 0.289 ms/op, 3,464/s | 0.291 ms/op, 3,438/s | 0.295 ms/op, 3,393/s |
| ping | 1000 | 0.101 ms/op, 9,894/s | 0.112 ms/op, 8,954/s | 0.125 ms/op, 7,981/s |

## Intentional deltas

- Every measurement is isolated: fresh data directory, fresh server, and the client's
  untimed preload on that empty server before the timed workload. All clients start from
  the same state.
- The product client has no reconnect, offline queue, or retry behavior. A socket error
  fails the in-flight command, while ioredis and node-redis carry their own reconnect and
  offline-queue machinery (offline queue disabled here).
- There is no pooling and no auto-pipelining on any client. Pipelined workloads send
  explicit equal-size batches of 500.
- All clients use RESP2 and one TCP connection per client. No TLS and no compression.
- `SET` rewrites the whole `.yykv` snapshot, so absolute `SET` numbers are snapshot-bound
  within a single workload. `GET` and `PING` isolate round-trip overhead.
- Command names delegated to the native command families are matched case-sensitively by
  the current backend, so the ioredis and node-redis adapters use explicit uppercase
  command forms instead of the lowercase convenience methods.

Regenerate: `pnpm --dir projects/redis.ts/examples/vs-js-libraries benchmark`
