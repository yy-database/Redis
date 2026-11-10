//! bench 测量口径的唯一入口：median/p95/极值来自上游 `database.harness`。
//!
//! 平台 addon 暴露 `harnessBenchSummary` 时，全部统计直接走 Rust 实现。
//! addon 尚未带该绑定时，退回 `database.harness::summarize` 钉死的 golden
//! 向量口径（nearest-rank p95、偶数长度 median 取中间两值平均），并在每次
//! 加载时用 crate 内的全部 golden 向量自校验，任何漂移直接终止运行。
//! addon 补上绑定后本文件无需改动即自动切换。

import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function loadAddon() {
  const fromEnv = process.env.REDIS_NATIVE_PATH?.trim();
  const packageDir = fromEnv || resolve(here, '..', '..', '..', 'platforms', `redis-${process.platform}-${process.arch}`);
  try {
    return createRequire(import.meta.url)(packageDir);
  }
  catch {
    return null;
  }
}

const addon = loadAddon();
const native = typeof addon?.harnessBenchSummary === 'function' ? addon : null;

/** `database.harness::summarize` 的钉死口径，字段名与 addon 的 camelCase DTO 对齐。 */
function pinnedSummary(samplesMs) {
  const rounds = samplesMs.length;
  if (rounds === 0 || !samplesMs.every(value => Number.isFinite(value))) {
    return { medianMs: Number.NaN, p95Ms: Number.NaN, minMs: Number.NaN, maxMs: Number.NaN, rounds };
  }
  const sorted = [...samplesMs].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  const rank = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return { medianMs, p95Ms: sorted[rank], minMs: sorted[0], maxMs: sorted[sorted.length - 1], rounds };
}

/** 对一组毫秒样本求 median/p95/极值，返回 `{medianMs, p95Ms, minMs, maxMs, rounds}`。 */
export function benchSummary(samplesMs) {
  return native ? native.harnessBenchSummary([...samplesMs]) : pinnedSummary(samplesMs);
}

/** `database.harness::per_op_ms` 的钉死口径：median / ops，`ops` 为 0 时 NaN。 */
function pinnedPerOpMs(stats, ops) {
  return ops === 0 ? Number.NaN : stats.medianMs / ops;
}

/** 单次操作的归一毫秒（median / ops），口径与 `benchSummary` 同源。 */
export function benchPerOpMs(stats, ops) {
  return native ? native.harnessBenchPerOp(stats, ops) : pinnedPerOpMs(stats, ops);
}

/** 统计口径的实际来源，报告 provenance 必须原样标注。 */
export const benchSummarySource = native
  ? 'addon:harnessBenchSummary + harnessBenchPerOp (database.harness::summarize / per_op_ms)'
  : 'pinned:database.harness::summarize golden vectors (addon binding missing)';

// `database.harness` bench.rs 的 golden 向量，逐条钉死口径；漂移即终止。
const GOLDEN_VECTORS = [
  { samples: [1, 2, 3, 4, 5], medianMs: 3, p95Ms: 5 },
  { samples: [1, 2, 3, 4], medianMs: 2.5, p95Ms: 4 },
  { samples: Array.from({ length: 100 }, (_, index) => index + 1), medianMs: 50.5, p95Ms: 95 },
  { samples: [7.5], medianMs: 7.5, p95Ms: 7.5 },
  { samples: Array.from({ length: 20 }, (_, index) => index + 1), medianMs: 10.5, p95Ms: 19 },
];

for (const vector of GOLDEN_VECTORS) {
  const got = benchSummary(vector.samples);
  if (got.medianMs !== vector.medianMs || got.p95Ms !== vector.p95Ms) {
    throw new Error(
      `bench summary disagrees with the harness golden vectors (${benchSummarySource}): `
      + `samples 1..${vector.samples.length} expected median ${vector.medianMs} p95 ${vector.p95Ms}, `
      + `got median ${got.medianMs} p95 ${got.p95Ms}`,
    );
  }
}
