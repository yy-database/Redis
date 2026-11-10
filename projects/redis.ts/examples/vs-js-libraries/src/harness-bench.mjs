//! bench 测量口径的唯一入口：median/p95/极值来自上游 `database.harness`。
//!
//! 统计只走 addon 暴露的 `harnessBenchSummary` / `harnessBenchPerOp`。
//! addon 缺失或没有该能力时直接报错，不在 JS 里保留第二套实现。

import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function loadAddon() {
  const fromEnv = process.env.REDIS_NATIVE_PATH?.trim();
  const packageDir = fromEnv || resolve(here, '..', '..', '..', 'platforms', `redis-${process.platform}-${process.arch}`);
  return createRequire(import.meta.url)(packageDir);
}

const addon = loadAddon();
if (typeof addon?.harnessBenchSummary !== 'function' || typeof addon?.harnessBenchPerOp !== 'function') {
  throw new Error(
    'redis addon is missing harnessBenchSummary / harnessBenchPerOp; '
    + 'database.harness must be reached through the native binding, not a JS fallback',
  );
}

/** 对一组毫秒样本求 median/p95/极值，返回 `{medianMs, p95Ms, minMs, maxMs, rounds}`。 */
export function benchSummary(samplesMs) {
  return addon.harnessBenchSummary([...samplesMs]);
}

/** 单次操作的归一毫秒（median / ops），口径与 `benchSummary` 同源。 */
export function benchPerOpMs(stats, ops) {
  return addon.harnessBenchPerOp(stats, ops);
}

/** 统计口径的实际来源，报告 provenance 必须原样标注。 */
export const benchSummarySource = 'addon:harnessBenchSummary + harnessBenchPerOp (database.harness::summarize / per_op_ms)';

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
