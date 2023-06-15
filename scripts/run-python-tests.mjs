#!/usr/bin/env node
//! Builds the extension wheel, installs it into a scratch environment, and runs
//! the acceptance suite with that environment's interpreter.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const crate = join(root, 'projects', 'redis.rs', 'redis-pyo3');
const project = join(root, 'projects', 'redis.py', 'packages', 'redis');
const tests = join(project, 'tests');
const python = process.env.PYTHON ?? 'python';
const force = process.argv.includes('--force');

function fingerprint() {
    const hash = createHash('sha256');
    const sources = [
        join(project, 'pyproject.toml'),
        join(project, 'redis', '__init__.py'),
        join(crate, 'Cargo.toml'),
        join(crate, 'src', 'lib.rs'),
        join(root, 'projects', 'redis.rs', 'Cargo.lock'),
        ...readdirSync(join(root, 'projects', 'redis.rs', 'redis-wasm', 'src'))
            .sort()
            .map(name => join(root, 'projects', 'redis.rs', 'redis-wasm', 'src', name)),
    ];
    for (const file of sources) {
        hash.update(readFileSync(file));
    }
    hash.update(python);
    return hash.digest('hex').slice(0, 16);
}

function run(executable, args, options = {}) {
    return execFileSync(executable, args, { cwd: root, stdio: 'inherit', ...options });
}

const cache = join(tmpdir(), `redis-python-${fingerprint()}`);
const dist = join(cache, 'dist');
const environment = join(cache, 'venv');
const interpreter = process.platform === 'win32'
    ? join(environment, 'Scripts', 'python.exe')
    : join(environment, 'bin', 'python');
const marker = join(cache, 'installed.json');

if (force || !existsSync(marker)) {
    mkdirSync(dist, { recursive: true });
    run(python, ['-m', 'maturin', 'build', '--out', dist, '--profile', 'dev', '-i', python], { cwd: project });
    const wheel = readdirSync(dist).find(name => name.endsWith('.whl'));
    if (wheel === undefined) {
        throw new Error(`no wheel produced in ${dist}`);
    }
    if (!existsSync(interpreter)) {
        run(python, ['-m', 'venv', '--system-site-packages', environment]);
    }
    run(interpreter, ['-m', 'pip', 'install', '--no-input', '--disable-pip-version-check', '--no-index', join(dist, wheel), 'pytest']);
    writeFileSync(marker, `${JSON.stringify({ wheel, interpreter }, null, 2)}\n`);
}

const result = spawnSync(interpreter, ['-m', 'pytest', tests, '-q'], { cwd: root, stdio: 'inherit' });
process.exit(result.status ?? 1);
