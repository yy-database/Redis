#!/usr/bin/env node
//! Runs a test command and verifies that it executed enough cases and skipped none.

import { spawnSync } from 'node:child_process';

// Minimum executed cases per side, held a few cases below the current count so
// a small refactor does not trip the gate while a real regression still does.
const FLOORS = { ts: 1534, py: 431 };

function usage() {
    return 'usage: node scripts/check-test-floor.mjs --kind ts|py -- <command...>';
}

function parseArguments(argv) {
    let kind = null;
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--') {
            const command = argv.slice(index + 1);
            if (kind === null) {
                throw new Error('`--kind` is required before `--`');
            }
            if (command.length === 0) {
                throw new Error('missing command after `--`');
            }
            return { kind, floor: FLOORS[kind], command };
        }
        if (argument === '--kind') {
            index += 1;
            kind = argv[index];
            if (kind !== 'ts' && kind !== 'py') {
                throw new Error('`--kind` must be `ts` or `py`');
            }
            continue;
        }
        throw new Error(`unknown option ${argument}`);
    }
    throw new Error('missing command after `--`');
}

function reported(output, field) {
    const match = new RegExp(`^# ${field} (\\d+)$`, 'm').exec(output);
    return match === null ? null : Number.parseInt(match[1], 10);
}

function parseTap(output) {
    const passed = reported(output, 'pass');
    const failed = reported(output, 'fail');
    const skipped = reported(output, 'skipped');
    if (passed === null || failed === null) {
        throw new Error('cannot parse a TAP summary');
    }
    const total = reported(output, 'tests');
    return { executed: total ?? passed + failed + (skipped ?? 0), passed, failed, skipped: skipped ?? 0 };
}

function parsePytest(output) {
    const ran = /Ran (\d+) tests?/.exec(output);
    if (ran !== null) {
        const executed = Number.parseInt(ran[1], 10);
        const skipped = /skipped=(\d+)/.exec(output);
        const failed = /failures=(\d+)/.exec(output);
        const errors = /errors=(\d+)/.exec(output);
        const skippedCount = skipped === null ? 0 : Number.parseInt(skipped[1], 10);
        const failedCount = (failed === null ? 0 : Number.parseInt(failed[1], 10))
            + (errors === null ? 0 : Number.parseInt(errors[1], 10));
        return { executed, passed: executed - skippedCount - failedCount, failed: failedCount, skipped: skippedCount };
    }

    const lines = output.split(/\r?\n/).reverse();
    for (const line of lines) {
        if (line.includes('no tests ran')) {
            return { executed: 0, passed: 0, failed: 0, skipped: 0 };
        }
        const passed = /(\d+) passed/.exec(line);
        const failed = /(\d+) failed/.exec(line);
        const skipped = /(\d+) skipped/.exec(line);
        const errors = /(\d+) error/.exec(line);
        if (passed === null && failed === null && skipped === null && errors === null) {
            continue;
        }
        const passedCount = passed === null ? 0 : Number.parseInt(passed[1], 10);
        const failedCount = (failed === null ? 0 : Number.parseInt(failed[1], 10))
            + (errors === null ? 0 : Number.parseInt(errors[1], 10));
        const skippedCount = skipped === null ? 0 : Number.parseInt(skipped[1], 10);
        return {
            executed: passedCount + failedCount + skippedCount,
            passed: passedCount,
            failed: failedCount,
            skipped: skippedCount,
        };
    }
    throw new Error('cannot parse a pytest summary');
}

function tail(output, lines) {
    const all = output.split(/\r?\n/);
    while (all.length > 0 && all[all.length - 1] === '') {
        all.pop();
    }
    return all.slice(-lines).join('\n');
}

const options = parseArguments(process.argv.slice(2));
const commandLine = options.command
    .map(argument => (/[\s"]/.test(argument) ? `"${argument.replaceAll('"', '""')}"` : argument))
    .join(' ');
const result = spawnSync(commandLine, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
});
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

function fail(message, summary) {
    console.log(`test count gate failed: ${message}`);
    if (summary !== null) {
        console.log(`${options.kind}: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped, ${summary.executed} executed, floor ${options.floor}`);
    }
    console.log('--- command output (last 40 lines) ---');
    console.log(tail(output, 40));
    process.exit(1);
}

if (result.error !== undefined) {
    fail(`cannot run the command: ${result.error.message}`, null);
}
let summary = null;
try {
    summary = options.kind === 'ts' ? parseTap(output) : parsePytest(output);
}
catch (error) {
    fail(error.message, null);
}
if (result.status !== 0) {
    fail(`the command exited with status ${result.status}`, summary);
}
if (summary.skipped > 0) {
    fail(`${summary.skipped} cases were skipped`, summary);
}
if (summary.executed < options.floor) {
    fail(`only ${summary.executed} cases executed, the floor is ${options.floor}`, summary);
}
console.log(`${options.kind}: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped, ${summary.executed} executed, floor ${options.floor}`);
