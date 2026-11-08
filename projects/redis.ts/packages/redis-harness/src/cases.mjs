//! 读取 `cases` 目录下的静态用例。
//!
//! 文件按名称排序，内部用例保持原有顺序，因此同一目录在任何平台都得到相同的清单。

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'cases');

export function caseManifest(directory = defaultDirectory) {
    const files = readdirSync(directory).filter(entry => entry.endsWith('.json')).sort();
    const cases = [];
    for (const name of files) {
        const payload = JSON.parse(readFileSync(join(directory, name), 'utf8'));
        for (const entry of payload.cases) {
            cases.push({ ...entry, table: payload.table });
        }
    }
    return { files, cases };
}

export function loadCases(directory = defaultDirectory) {
    return caseManifest(directory).cases;
}
