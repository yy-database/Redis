//! Packs the composition package and the current platform package, then installs
//! both tarballs into a scratch project. Checks then run against the installed
//! copy, so a missing or stale artifact cannot hide behind workspace links.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PLATFORMS = {
    win32: { x64: 'win32-x64' },
    darwin: { arm64: 'darwin-arm64', x64: 'darwin-x64' },
    linux: { x64: 'linux-x64' },
};

const here = dirname(fileURLToPath(import.meta.url));

/** Walks up from `from` until the workspace manifest is found. */
export function repositoryRoot(from = here) {
    let current = resolve(from);
    for (;;) {
        if (existsSync(join(current, 'pnpm-workspace.yaml')) && existsSync(join(current, 'package.json'))) {
            return current;
        }
        const parent = dirname(current);
        if (parent === current) {
            throw new Error(`cannot find the workspace root above ${from}`);
        }
        current = parent;
    }
}

function scriptEntry(candidates, what) {
    const found = candidates.find(candidate => typeof candidate === 'string' && candidate.length > 0 && existsSync(candidate));
    if (found === undefined) {
        throw new Error(`cannot locate the ${what} CLI from ${process.execPath}`);
    }
    return found;
}

const nodeModules = join(dirname(process.execPath), 'node_modules');

function pnpmEntry() {
    return scriptEntry(
        [process.env.npm_execpath, join(nodeModules, 'corepack', 'dist', 'pnpm.js')],
        'pnpm',
    );
}

function npmEntry() {
    return scriptEntry(
        [join(nodeModules, 'npm', 'bin', 'npm-cli.js'), join(dirname(process.execPath), 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')],
        'npm',
    );
}

function run(entry, args, cwd) {
    execFileSync(process.execPath, [entry, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * Prepares one scratch installation and returns the handles the checks use.
 *
 * The tarballs are produced by the workspace package manager, so the installed
 * manifests are exactly what a consumer would download.
 */
export async function prepareInstall() {
    const root = repositoryRoot();
    const platform = PLATFORMS[process.platform]?.[process.arch];
    if (platform === undefined) {
        throw new Error(`no platform package for ${process.platform}-${process.arch}`);
    }
    const composition = join(root, 'projects', 'redis.ts', 'packages', 'redis');
    const platformDir = join(root, 'projects', 'redis.ts', 'platforms', `redis-${platform}`);
    const binding = join(platformDir, 'lib', `redis-${platform}.node`);
    if (!existsSync(binding)) {
        throw new Error(`missing ${binding}: run \`node scripts/build-platforms.mjs\` from the repository root first`);
    }

    const scratch = mkdtempSync(join(tmpdir(), 'redis-harness-install-'));
    const pnpm = pnpmEntry();
    const npm = npmEntry();
    const tarballs = [];
    for (const directory of [composition, platformDir]) {
        const before = new Set(readdirSync(scratch));
        run(pnpm, ['pack', '--pack-destination', scratch], directory);
        const produced = readdirSync(scratch).filter(name => name.endsWith('.tgz') && !before.has(name));
        if (produced.length !== 1) {
            throw new Error(`expected one tarball from ${directory}, found ${produced.length}`);
        }
        tarballs.push(join(scratch, produced[0]));
    }

    writeFileSync(join(scratch, 'package.json'), `${JSON.stringify({ name: 'redis-install-state', version: '0.0.0', private: true, type: 'module' }, null, 2)}\n`);
    writeFileSync(join(scratch, 'entry.mjs'), "export * from '@yydb/redis';\n");
    run(npm, ['install', '--omit=optional', '--no-audit', '--no-fund', ...tarballs], scratch);

    const require = createRequire(join(scratch, 'entry.mjs'));
    return {
        root,
        scratch,
        platform,
        tarballs,
        resolve: specifier => require.resolve(specifier),
        async load() {
            return import(pathToFileURL(require.resolve('@yydb/redis')).href);
        },
        cleanup() {
            try {
                rmSync(scratch, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
            }
            catch {
                // A loaded binding keeps its `.node` file open on Windows.
            }
        },
    };
}
