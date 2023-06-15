#!/usr/bin/env node
//! Installed-state gate for `@yydb/redis`.
//!
//! Packs the composition package and the current platform package, installs the
//! tarballs into a scratch directory, then runs the real call from a plain
//! `node` child process: no TypeScript loader, no workspace links. A failure in
//! the packed artifact fails this gate.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { prepareInstall } from '../projects/redis.ts/packages/redis-harness/src/install.mjs';

const installed = await prepareInstall();

try {
    const entry = installed.resolve('@yydb/redis').replaceAll('\\', '/');
    if (!entry.startsWith(installed.scratch.replaceAll('\\', '/'))) {
        throw new Error(`the entry resolved outside the scratch install: ${entry}`);
    }
    if (!entry.endsWith('/node_modules/@yydb/redis/dist/index.js')) {
        throw new Error(`the entry does not point at the compiled artifact: ${entry}`);
    }

    const runner = join(installed.scratch, 'installed-call.mjs');
    writeFileSync(runner, [
        "import assert from 'node:assert/strict';",
        "import { mkdtempSync, rmSync } from 'node:fs';",
        "import { tmpdir } from 'node:os';",
        "import { join } from 'node:path';",
        "import { Store } from '@yydb/redis';",
        "const directory = mkdtempSync(join(tmpdir(), 'redis-installed-call-'));",
        "try {",
        "    const store = new Store(directory);",
        "    store.set(0, 'gate', 'installed');",
        "    assert.equal(store.get(0, 'gate'), 'installed');",
        "    assert.equal(store.get(1, 'gate'), null);",
        '}',
        "finally { rmSync(directory, { recursive: true, force: true }); }",
        "console.log('ts installed-state call ok');",
        '',
    ].join('\n'));

    console.log(`entry: ${entry}`);
    execFileSync(process.execPath, [runner], { cwd: installed.scratch, stdio: 'inherit' });
}
finally {
    installed.cleanup();
}
