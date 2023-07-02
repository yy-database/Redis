#!/usr/bin/env node
//! Cross-implementation oracle: recomputes the same behaviour independently and
//! fails when the installed binding disagrees with the reference layout.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { prepareInstall } from '../src/install.mjs';
import { canonicalInteger, decodeReply as referenceDecodeReply, encodeCommand as referenceCommand, encodeReply as referenceReply, fnv1a, parseCatalog, parseShard } from '../src/reference.mjs';

const installed = await prepareInstall();
const redis = await installed.load();
const { Store, decodeCommand, decodeReply, encodeCommand, encodeReply, parseInteger } = redis;

const checks = [];
function check(name, run) {
    try {
        run();
        checks.push({ name, ok: true });
    }
    catch (error) {
        checks.push({ name, ok: false, reason: error instanceof Error ? error.message : String(error) });
    }
}

const bulk = value => ({ type: 'bulk', bytes: Array.from(Buffer.from(value)) });
const specs = [
    { type: 'simple', value: 'OK' },
    { type: 'error', value: 'ERR wrong number of arguments' },
    { type: 'int', value: 0 },
    { type: 'int', value: -42 },
    { type: 'bulk', bytes: [] },
    { type: 'bulk', bytes: Array.from(Buffer.from('hello')) },
    { type: 'bulk', bytes: [0, 255, 1] },
    { type: 'null' },
    { type: 'array', value: [] },
    { type: 'array', value: [bulk('a'), { type: 'int', value: 3 }, { type: 'null' }] },
    { type: 'push', value: [bulk('message'), bulk('news'), bulk('hello')] },
    { type: 'map', value: [[bulk('k'), { type: 'int', value: 7 }]] },
    { type: 'map', value: [] },
];

for (const protocol of [2, 3]) {
    for (const [index, spec] of specs.entries()) {
        check(`encode reply ${index} on protocol ${protocol}`, () => {
            assert.deepEqual(encodeReply(spec, protocol), referenceReply(spec, protocol));
        });
    }
}

const frames = [
    '+OK\r\n',
    '-ERR unknown command\r\n',
    ':17\r\n',
    '$-1\r\n',
    '_\r\n',
    '$0\r\n\r\n',
    '$5\r\nhello\r\n',
    '*0\r\n',
    '*3\r\n:1\r\n$2\r\nab\r\n_\r\n',
    '>3\r\n$7\r\nmessage\r\n$4\r\nnews\r\n$5\r\nhello\r\n',
    '%2\r\n$1\r\na\r\n:1\r\n$1\r\nb\r\n:2\r\n',
];
for (const [index, frame] of frames.entries()) {
    check(`decode frame ${index}`, () => {
        const actual = decodeReply(Buffer.from(frame));
        const expected = referenceDecodeReply(Buffer.from(frame));
        assert.deepEqual(JSON.parse(actual.spec), expected.spec);
        assert.equal(actual.consumed, expected.consumed);
    });
}

const argumentSets = [
    ['PING'],
    ['SET', 'key', 'value'],
    ['SET', 'binary', Buffer.from([0x00, 0xff, 0x01])],
    ['MSET', 'a', '1', 'b', '2'],
];
for (const [index, args] of argumentSets.entries()) {
    check(`encode command ${index}`, () => {
        assert.deepEqual(encodeCommand(args), referenceCommand(args));
    });
    check(`decode command ${index}`, () => {
        const frame = referenceCommand(args);
        const actual = decodeCommand(frame);
        assert.equal(actual.consumed, frame.length);
        assert.deepEqual(actual.args.map(argument => argument.toString('hex')), args.map(argument => Buffer.from(argument).toString('hex')));
    });
}

for (const [raw, expected] of [[42, '42'], [-7, '-7'], [0, '0'], [9007199254740991, '9007199254740991'], [null, '01'], [null, '+1'], [null, '1.5'], [null, ''], [null, '9223372036854775808'], [null, ' 1']]) {
    check(`integer ${JSON.stringify(raw ?? expected)}`, () => {
        assert.equal(parseInteger(expected), raw);
        assert.equal(canonicalInteger(Buffer.from(expected)), raw);
    });
}

const directory = mkdtempSync(join(tmpdir(), 'redis-oracle-'));
try {
    const deadline = 4_000_000_000_000;
    const store = new Store(directory);
    store.set(0, 'alpha', 'one');
    store.set(1, 'beta', 'two', deadline);
    store.set(0, 'gamma', 'three');

    check('shard bytes match the layout', () => {
        const bytes = readFileSync(join(directory, 'local-0.yykv'));
        const snapshot = parseShard(bytes);
        assert.deepEqual(snapshot.checksum, fnv1a(bytes.subarray(13)));
        assert.equal(snapshot.records.length, 3);
        const alpha = snapshot.records.find(entry => entry.key.equals(Buffer.from('alpha')));
        const beta = snapshot.records.find(entry => entry.key.equals(Buffer.from('beta')));
        assert.equal(alpha.namespace, 'redis:db0');
        assert.equal(alpha.value.toString('utf8'), 'one');
        assert.equal(beta.namespace, 'redis:db1');
        assert.equal(beta.expiresAt, deadline);
        const revisions = snapshot.records.map(entry => entry.revision);
        assert.equal(new Set(revisions).size, revisions.length);
        assert.ok(revisions.every(revision => revision >= 1 && revision <= snapshot.nextRevision));
    });

    check('catalog matches the layout', () => {
        const catalog = parseCatalog(readFileSync(join(directory, 'local-0.yyds')));
        assert.equal(catalog.version, 0);
        assert.deepEqual(catalog.shardIds, ['local-0']);
    });
}
finally {
    rmSync(directory, { recursive: true, force: true });
}

installed.cleanup();

const failures = checks.filter(entry => !entry.ok);
for (const entry of checks) {
    console.log(`${entry.ok ? 'ok' : 'not ok'} - ${entry.name}${entry.ok ? '' : `: ${entry.reason}`}`);
}
console.log(`oracle: ${checks.length - failures.length} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
