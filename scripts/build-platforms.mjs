//! Builds the Node-API binding and places it in the matching platform package.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = join(root, 'projects', 'redis.rs', 'Cargo.toml');

const platforms = {
    win32: { x64: { name: 'win32-x64', artifact: 'redis_napi.dll' } },
    darwin: {
        arm64: { name: 'darwin-arm64', artifact: 'libredis_napi.dylib' },
        x64: { name: 'darwin-x64', artifact: 'libredis_napi.dylib' },
    },
    linux: { x64: { name: 'linux-x64', artifact: 'libredis_napi.so' } },
};

const target = platforms[process.platform]?.[process.arch];
if (target === undefined) {
    console.log(`no platform package for ${process.platform}-${process.arch}`);
    process.exit(0);
}

execFileSync('cargo', ['build', '--manifest-path', manifest, '-p', 'redis-napi'], { stdio: 'inherit' });

const targetDir = process.env.CARGO_TARGET_DIR ?? join(root, 'projects', 'redis.rs', 'target');
const output = join(targetDir, 'debug', target.artifact);
const destination = join(root, 'projects', 'redis.ts', 'platforms', `redis-${target.name}`, 'lib', `redis-${target.name}.node`);
mkdirSync(dirname(destination), { recursive: true });
copyFileSync(output, destination);
console.log(`installed ${destination}`);
