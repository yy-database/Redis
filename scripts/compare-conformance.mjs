//! Compares the per-case observations produced by the TypeScript and Python
//! conformance runs. Both runners consume the same harness `cases` tables, so any
//! difference here is a real cross-implementation disagreement.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [tsPath, pyPath] = process.argv.slice(2);
if (tsPath === undefined || pyPath === undefined) {
    console.error('usage: node scripts/compare-conformance.mjs <ts-report.json> <py-report.json>');
    process.exit(2);
}

const load = path => JSON.parse(readFileSync(resolve(path), 'utf8'));

function strip(value) {
    if (Array.isArray(value)) {
        return value.map(strip);
    }
    if (value !== null && typeof value === 'object') {
        const next = {};
        for (const key of Object.keys(value).sort()) {
            if (/Ms$/.test(key)) {
                continue;
            }
            next[key] = strip(value[key]);
        }
        return next;
    }
    return value;
}

const ts = load(tsPath);
const py = load(pyPath);
const python = new Map(py.cases.map(entry => [entry.id, entry]));
const typescript = new Set(ts.cases.map(entry => entry.id));

const mismatches = [];
const onlyPython = [];
let compared = 0;
for (const entry of ts.cases) {
    const other = python.get(entry.id);
    if (other === undefined) {
        continue;
    }
    compared += 1;
    const left = JSON.stringify(strip(entry.observed));
    const right = JSON.stringify(strip(other.observed));
    if (left !== right) {
        mismatches.push({ id: entry.id, ts: left, py: right });
    }
}
for (const entry of py.cases) {
    if (!typescript.has(entry.id)) {
        onlyPython.push(entry.id);
    }
}
const onlyTypeScript = ts.cases.filter(entry => !python.has(entry.id)).map(entry => entry.id);

const failing = ts.cases.filter(entry => entry.ok === false).length + py.cases.filter(entry => entry.ok === false).length;

console.log(`compared ${compared} shared cases`);
console.log(`ts-only cases: ${onlyTypeScript.length}`);
console.log(`py-only cases: ${onlyPython.length}`);
console.log(`failing cases: ${failing}`);
console.log(`mismatches: ${mismatches.length}`);
for (const item of mismatches) {
    console.log(`- ${item.id}\n  ts: ${item.ts}\n  py: ${item.py}`);
}
if (onlyPython.length > 0) {
    for (const id of onlyPython) {
        console.log(`  py-only ${id}`);
    }
}
process.exit(mismatches.length === 0 && failing === 0 ? 0 : 1);
