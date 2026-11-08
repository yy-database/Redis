//! 影子模式：对静态用例清单取摘要，并比较 `database.harness` 与既有路径。
//!
//! 该脚本不启动服务、不执行用例，只验证纯数据层。
//! 用例目录是唯一输入，台账为空：Redis 的静态用例没有已知差异。

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { caseManifest } from '../src/cases.mjs';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const platform = `${process.platform}-${process.arch}`;
const binding = createRequire(import.meta.url)(
    join(packageDir, '..', '..', 'platforms', `redis-${platform}`),
);

const manifest = caseManifest();
const canonical = JSON.stringify(manifest);
const failures = [];
const compare = (label, legacy, candidate) => {
    if (legacy !== candidate) failures.push({ label, legacy, candidate });
};

const nodeDigest = createHash('sha256').update(canonical).digest('hex');
const candidateDigest = binding.harnessDigest(Buffer.from(canonical));
compare('digest/manifest', nodeDigest, candidateDigest);

const identity = {
    spec: { version: 1, seed: 0, count: manifest.cases.length },
    digest: candidateDigest,
};
const baseline = { identity, entries: [] };
const verdict = JSON.parse(binding.harnessCheckBaseline(
    JSON.stringify(baseline),
    JSON.stringify(identity),
    JSON.stringify([]),
));
const legacyLedger = JSON.stringify({ matched: 0, problems: [] });
const candidateLedger = JSON.stringify({
    matched: verdict.matched,
    problems: verdict.problems.map((problem) => problem.kind),
});
compare('ledger/clean', legacyLedger, candidateLedger);

const report = {
    version: 1,
    command: 'cases',
    corpus: {
        spec: identity.spec,
        digest: candidateDigest,
        matched: verdict.matched,
        problems: [],
        clean: verdict.problems.length === 0,
    },
};
const legacyText = `${JSON.stringify(report, null, 2)}\n`;
const candidateText = binding.harnessRenderReport(JSON.stringify(report));
compare('report/cases', legacyText, candidateText);

console.log(JSON.stringify({
    digest: nodeDigest,
    files: manifest.files.length,
    cases: manifest.cases.length,
    ledger: candidateLedger,
    failures,
}, null, 2));
if (failures.length > 0) {
    console.error(`harness shadow mismatch: ${failures.length} difference(s)`);
    process.exit(1);
}
