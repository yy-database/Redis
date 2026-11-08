# Benchmark report

Command: `pnpm --dir projects/redis.ts/examples/vs-js-libraries benchmark`
Defaults: `BENCH_SET=100`, `BENCH_PIPE=500`, `BENCH_GET=500`, `BENCH_PING=1000`, `BENCH_ROUNDS=3`
Baseline: `ioredis` = `1.00x`
Ratio: subject_time / baseline_time (smaller is faster). Fastest cell in each row is bold.
Measured: 1 untimed warmup round plus the median of 3 measured rounds. Each round starts a
fresh temporary data directory and a fresh server, shared by all three clients.

The `SET` counts are lower than the original plan because every `SET` rewrites the whole
`.yykv` snapshot, so growing key spaces make those workloads super-linear. The tuned
counts keep a full run to roughly one minute without changing the protocol or client
options.

## Relative to `ioredis`

| Workload | ioredis | @yydb/redis | node-redis |
|---------:|-------:|-----------:|-----------:|
| set-seq | 1.00x | **0.99x** | 1.03x |
| set-pipeline | **1.00x** | 1.26x | 1.22x |
| get-seq | 1.00x | **0.91x** | 0.99x |
| ping | **1.00x** | 1.03x | 1.26x |

## Median time and throughput

| Workload | ops | ioredis | @yydb/redis | node-redis |
|---------:|----:|--------:|------------:|-----------:|
| set-seq | 100 | 4.173 ms/op, 240/s | 4.138 ms/op, 242/s | 4.282 ms/op, 234/s |
| set-pipeline | 500 | 5.461 ms/op, 183/s | 6.893 ms/op, 145/s | 6.667 ms/op, 150/s |
| get-seq | 500 | 0.362 ms/op, 2,761/s | 0.330 ms/op, 3,032/s | 0.358 ms/op, 2,793/s |
| ping | 1000 | 0.129 ms/op, 7,758/s | 0.133 ms/op, 7,498/s | 0.163 ms/op, 6,145/s |

## Intentional deltas

- Every client talks to the same server process within a round. Earlier clients leave
  keys and snapshot growth behind, so later clients rewrite a larger `.yykv` snapshot.
- The product client has no reconnect, offline queue, or retry behavior. A socket error
  fails the in-flight command, while ioredis and node-redis carry their own reconnect and
  offline-queue machinery (offline queue disabled here).
- There is no pooling and no auto-pipelining on any client. Pipelined workloads send
  explicit equal-size batches of 500.
- All clients use RESP2 and one TCP connection per client. No TLS and no compression.
- `SET` rewrites the whole `.yykv` snapshot, so absolute `SET` numbers are snapshot-bound
  and depend on key-space size. `GET` and `PING` isolate round-trip overhead.
- Command names delegated to the native command families are matched case-sensitively by
  the current backend, so the ioredis and node-redis adapters use explicit uppercase
  command forms instead of the lowercase convenience methods.

Regenerate: `pnpm --dir projects/redis.ts/examples/vs-js-libraries benchmark`
