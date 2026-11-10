export function elapsedMs(start) {
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}

// median/p95 不在这里实现：统计口径唯一入口是 `harness-bench.mjs` 的
// `benchSummary`，由上游 `database.harness` 判定。

export function throughput(ops, ms) {
  if (ms <= 0) return 'n/a';
  return `${Math.round((ops / ms) * 1_000).toLocaleString('en-US')}/s`;
}
