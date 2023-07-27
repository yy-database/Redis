//! Builds the Node-API binding and places it in the matching platform package.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const crateDir = join(root, 'projects', 'redis.rs');
const platform = `${process.platform}-${process.arch}`;
const packageDir = join(root, 'projects', 'redis.ts', 'platforms', `redis-${platform}`);
const nodeName = `redis.${platform}.node`;

const artifact = {
    win32: { name: 'redis_napi.dll' },
    darwin: { name: 'libredis_napi.dylib' },
    linux: { name: 'libredis_napi.so' },
}[process.platform];

if (!artifact) {
    console.log(`no platform package for ${process.platform}-${process.arch}`);
    process.exit(0);
}

const release = process.argv.includes('--release');
execFileSync(
    'cargo',
    ['build', '--manifest-path', join(crateDir, 'Cargo.toml'), '-p', 'redis-napi', ...(release ? ['--release'] : [])],
    { stdio: 'inherit' },
);

const profile = release ? 'release' : 'debug';
const targetDir = resolve(crateDir, process.env.CARGO_TARGET_DIR ?? 'target');
const source = join(targetDir, profile, artifact.name);
if (!existsSync(source)) {
    throw new Error(`missing build artifact ${source}`);
}

const dest = join(packageDir, nodeName);
copyFileSync(source, dest);
console.log(`napi addon -> ${dest}`);
