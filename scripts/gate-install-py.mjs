#!/usr/bin/env node
//! Installed-state gate for the Python `redis` wheel.
//!
//! Builds the wheel from the product package, installs it into a clean virtual
//! environment, then imports the installed package and performs a real write and
//! read. Nothing from the workspace is on `sys.path`, so a wheel that is missing
//! the extension module fails here.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = join(root, 'projects', 'redis.py', 'packages', 'redis');
const python = process.env.PYTHON ?? 'python';

const scratch = mkdtempSync(join(tmpdir(), 'redis-wheel-gate-'));
const dist = join(scratch, 'dist');
const environment = join(scratch, 'venv');
const interpreter = process.platform === 'win32'
    ? join(environment, 'Scripts', 'python.exe')
    : join(environment, 'bin', 'python');
const call = join(scratch, 'installed-call.py');

try {
    mkdirSync(dist, { recursive: true });
    execFileSync(python, ['-m', 'maturin', 'build', '--out', dist, '--profile', 'dev', '-i', python], {
        cwd: project,
        stdio: 'inherit',
    });
    const wheels = readdirSync(dist).filter(name => name.endsWith('.whl'));
    if (wheels.length !== 1) {
        throw new Error(`expected one wheel in ${dist}, found ${wheels.length}`);
    }
    const wheel = join(dist, wheels[0]);

    execFileSync(python, ['-m', 'venv', environment], { stdio: 'inherit' });
    execFileSync(interpreter, ['-m', 'pip', 'install', '--no-input', '--disable-pip-version-check', '--no-index', wheel], {
        stdio: 'inherit',
    });

    writeFileSync(call, [
        'import tempfile',
        'import redis',
        'from redis import Store',
        '',
        'assert "site-packages" in redis.__file__, redis.__file__',
        'directory = tempfile.mkdtemp(prefix="redis-wheel-call-")',
        'store = Store(directory)',
        'store.set(0, b"gate", b"installed")',
        'assert store.get(0, b"gate") == b"installed"',
        'assert store.get(1, b"gate") is None',
        'print("py installed-state call ok")',
        '',
    ].join('\n'));

    execFileSync(interpreter, [call], { cwd: scratch, stdio: 'inherit' });
}
finally {
    rmSync(scratch, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
