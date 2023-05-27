//! Installed-state acceptance checks for `@yydb/redis`.
//!
//! The checks run against a tarball installed into a scratch project, never
//! against the workspace sources. Expectations come from the independent
//! computations in `src/reference.mjs`.

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';

import { parseCatalog, parseShard, canonicalInteger, encodeCommand as referenceCommand, encodeReply as referenceReply, decodeReply as referenceDecodeReply, decodeCommand as referenceDecodeCommand } from '../src/reference.mjs';
import { prepareInstall } from '../src/install.mjs';

const installed = await prepareInstall();
const redis = await installed.load();
const { Store, decodeCommand, decodeReply, encodeCommand, encodeReply, parseInteger, execute, array, bulk, error: replyError, integer, map, nullReply } = redis;

const directories = [];
after(() => {
    for (const directory of directories) {
        rmSync(directory, { recursive: true, force: true });
    }
    installed.cleanup();
});

function temporaryDir() {
    const directory = mkdtempSync(join(tmpdir(), 'redis-acceptance-'));
    directories.push(directory);
    return directory;
}

function session(protocol = 2) {
    return { db: 0, protocol, queued: null, name: '' };
}

function helloSpec(protocol) {
    return map([
        ['server', bulk('redis')],
        ['version', bulk('7.4.0')],
        ['proto', integer(protocol)],
        ['id', integer(1)],
        ['mode', bulk('standalone')],
        ['role', bulk('master')],
        ['modules', array([])],
    ]);
}

function record(snapshot, key) {
    const found = snapshot.records.find(entry => entry.key.equals(Buffer.from(key)));
    assert.ok(found !== undefined, `record ${key} is missing`);
    return found;
}

test('the composition package resolves from the installed tree', () => {
    const resolved = installed.resolve('@yydb/redis');
    assert.ok(resolved.startsWith(installed.scratch), resolved);
    assert.match(resolved.replaceAll('\\', '/'), /\/node_modules\/@yydb\/redis\/src\/index\.js$/);
    assert.deepEqual(installed.tarballs.length, 2);
});

test('the platform binding resolves from the installed tree', () => {
    const manifest = installed.resolve(`@yydb/redis-${installed.platform}/package.json`);
    const binding = join(dirname(manifest), 'lib', `redis-${installed.platform}.node`);
    assert.ok(binding.startsWith(installed.scratch), binding);
    assert.ok(binding.endsWith('.node'), binding);
    assert.ok(existsSync(binding), `missing installed binding ${binding}`);
});

test('values persist across reopen', () => {
    const directory = temporaryDir();
    {
        const store = new Store(directory);
        store.set(0, 'greeting', 'hello');
        assert.equal(store.get(0, 'greeting'), 'hello');
        assert.equal(store.get(1, 'greeting'), null);
    }
    const reopened = new Store(directory);
    assert.equal(reopened.get(0, 'greeting'), 'hello');
    assert.equal(reopened.get(1, 'greeting'), null);
});

test('the shard matches the documented byte layout', () => {
    const directory = temporaryDir();
    const deadline = 4_000_000_000_000;
    const store = new Store(directory);
    store.set(0, 'alpha', 'one');
    store.set(1, 'beta', 'two', deadline);
    store.set(0, 'gamma', 'three');

    const snapshot = parseShard(readFileSync(join(directory, 'local-0.yykv')));
    assert.equal(snapshot.records.length, 3);
    assert.equal(record(snapshot, 'alpha').namespace, 'redis:db0');
    assert.equal(record(snapshot, 'beta').namespace, 'redis:db1');
    assert.equal(record(snapshot, 'alpha').value.toString('utf8'), 'one');
    assert.equal(record(snapshot, 'beta').expiresAt, deadline);
    assert.equal(record(snapshot, 'gamma').expiresAt, null);
});

test('shard revisions stay inside the snapshot', () => {
    const directory = temporaryDir();
    const store = new Store(directory);
    store.set(0, 'one', '1');
    store.set(0, 'two', '2');

    const first = parseShard(readFileSync(join(directory, 'local-0.yykv')));
    const revisions = first.records.map(entry => entry.revision);
    assert.equal(new Set(revisions).size, revisions.length);
    assert.ok(revisions.every(revision => revision >= 1), String(revisions));
    assert.ok(revisions.every(revision => revision <= first.nextRevision), String(revisions));
    assert.ok(first.nextRevision >= revisions.length);

    const reopened = new Store(directory);
    reopened.set(0, 'three', '3');
    const second = parseShard(readFileSync(join(directory, 'local-0.yykv')));
    assert.equal(second.records.length, 3);
    assert.ok(second.nextRevision > first.nextRevision, String(second.nextRevision));
});

test('rename carries the deadline', () => {
    const directory = temporaryDir();
    const store = new Store(directory);
    const deadline = Date.now() + 120_000;
    store.set(0, 'source', 'value', deadline);
    assert.equal(store.rename(0, 'source', 'destination'), 'renamed');
    assert.equal(store.get(0, 'source'), null);
    assert.equal(store.get(0, 'destination'), 'value');
    assert.equal(store.deadline(0, 'destination'), deadline);
});

test('rename reports missing and occupied destinations', () => {
    const directory = temporaryDir();
    const store = new Store(directory);
    store.set(0, 'destination', 'kept', Date.now() + 120_000);
    assert.equal(store.rename(0, 'missing', 'destination'), 'missing');
    store.set(0, 'other', 'occupant');
    assert.equal(store.rename(0, 'destination', 'other', true), 'destination-present');
    assert.equal(store.deadline(0, 'other'), null);
    assert.equal(store.get(0, 'destination'), 'kept');
});

test('commands decode incrementally', () => {
    const first = referenceCommand(['SET', 'key', 'value']);
    const second = referenceCommand(['GET', 'key']);

    const decoded = decodeCommand(first);
    assert.equal(decoded.consumed, first.length);
    assert.deepEqual(decoded.args.map(argument => argument.toString('utf8')), ['SET', 'key', 'value']);
    assert.deepEqual(referenceDecodeCommand(first).args.map(argument => argument.toString('utf8')), ['SET', 'key', 'value']);

    const stream = Buffer.concat([first, second]);
    assert.equal(decodeCommand(stream).consumed, first.length);
    const tail = decodeCommand(stream.subarray(decodeCommand(stream).consumed));
    assert.deepEqual(tail.args.map(argument => argument.toString('utf8')), ['GET', 'key']);
});

test('commands report incompleteness instead of consuming a partial frame', () => {
    const frame = referenceCommand(['SET', 'key', 'value']);
    assert.equal(decodeCommand(frame.subarray(0, frame.length - 1)), null);
    assert.equal(decodeCommand(frame.subarray(0, 6)), null);
    assert.equal(decodeCommand(Buffer.alloc(0)), null);
});

test('command encoding matches the multibulk layout', () => {
    const args = ['SET', 'greeting', 'hello'];
    assert.deepEqual(encodeCommand(args), referenceCommand(args));
    const binary = ['SET', 'binary', Buffer.from([0x00, 0xff, 0x01])];
    assert.deepEqual(encodeCommand(binary), referenceCommand(binary));
    assert.equal(encodeCommand(binary).toString('hex'), '2a330d0a24330d0a5345540d0a24360d0a62696e6172790d0a24330d0a00ff010d0a');
});

test('command framing violations are rejected', () => {
    assert.throws(() => decodeCommand(Buffer.from('GET key\r\n')), /expected a multibulk request/);
    assert.throws(() => decodeCommand(Buffer.from('*0\r\n')), /invalid multibulk length/);
    assert.throws(() => decodeCommand(Buffer.from('*1\r\n$-2\r\n')), /invalid bulk length/);
    assert.throws(() => decodeCommand(Buffer.from('*1\r\nx\r\n')), /expected a bulk string/);
    assert.throws(() => decodeCommand(Buffer.from('*1\r\n$2\r\nab\rX')), /invalid bulk string terminator/);
});

test('integers reject non-canonical forms', () => {
    for (const raw of ['01', '+1', '1.5', '', '00', '1_0', ' 1', '1 ', '0x10', '-', '9223372036854775808']) {
        assert.equal(parseInteger(raw), null, raw);
        assert.equal(canonicalInteger(Buffer.from(raw)), null, raw);
    }
});

test('integers accept canonical signed forms', () => {
    const accepted = [
        ['42', 42],
        ['-7', -7],
        ['0', 0],
        ['9007199254740991', 9007199254740991],
        ['-9007199254740991', -9007199254740991],
    ];
    for (const [raw, expected] of accepted) {
        assert.equal(parseInteger(raw), expected, raw);
        assert.equal(canonicalInteger(Buffer.from(raw)), expected, raw);
    }
});

test('increments reject non-integers', () => {
    const directory = temporaryDir();
    const store = new Store(directory);
    assert.equal(store.incrBy(0, 'counter', 1).value, 1);
    store.set(0, 'text', 'hello');
    assert.equal(store.incrBy(0, 'text', 1).value ?? null, null);
    assert.equal(store.incrBy(0, 'text', 1).error, 'value is not an integer or out of range');

    const result = execute(store, session(), [Buffer.from('INCR'), Buffer.from('text')]);
    assert.deepEqual(result.reply, replyError('ERR value is not an integer or out of range'));
    assert.equal(encodeReply(result.reply, 2).toString('utf8'), '-ERR value is not an integer or out of range\r\n');
});

test('increments overflow instead of wrapping', () => {
    const directory = temporaryDir();
    const store = new Store(directory);
    store.set(0, 'huge', '9223372036854775807');
    assert.equal(store.incrBy(0, 'huge', 1).value ?? null, null);
    assert.equal(store.incrBy(0, 'huge', 1).error, 'increment or decrement would overflow');
});

test('maps become flat arrays before hello three', () => {
    const store = new Store(temporaryDir());
    const state = session(2);
    const result = execute(store, state, [Buffer.from('HELLO')]);
    assert.equal(state.protocol, 2);
    assert.deepEqual(result.reply, helloSpec(2));

    const frame = encodeReply(result.reply, 2);
    assert.deepEqual(frame, referenceReply(helloSpec(2), 2));
    assert.ok(frame.subarray(0, 5).equals(Buffer.from('*14\r\n')), frame.subarray(0, 5).toString());
    const decoded = decodeReply(frame);
    assert.equal(decoded.consumed, frame.length);
    assert.equal(JSON.parse(decoded.spec).type, 'array');
    assert.equal(JSON.parse(decoded.spec).value.length, 14);
});

test('maps use the map header after hello three', () => {
    const store = new Store(temporaryDir());
    const state = session(2);
    const result = execute(store, state, [Buffer.from('HELLO'), Buffer.from('3')]);
    assert.equal(state.protocol, 3);
    assert.deepEqual(result.reply, helloSpec(3));
    assert.equal(result.reply.value.length, 7);

    const frame = encodeReply(result.reply, 3);
    assert.deepEqual(frame, referenceReply(helloSpec(3), 3));
    assert.ok(frame.subarray(0, 4).equals(Buffer.from('%7\r\n')), frame.subarray(0, 4).toString());
    const decoded = decodeReply(frame);
    assert.equal(decoded.consumed, frame.length);
    assert.deepEqual(JSON.parse(decoded.spec), helloSpec(3));

    const rejected = execute(store, session(), [Buffer.from('HELLO'), Buffer.from('4')]);
    assert.deepEqual(rejected.reply, replyError('NOPROTO unsupported protocol version'));
});

test('null uses the negotiated shape', () => {
    assert.equal(encodeReply(nullReply(), 2).toString('utf8'), '$-1\r\n');
    assert.equal(encodeReply(nullReply(), 3).toString('utf8'), '_\r\n');

    const three = decodeReply(Buffer.from('_\r\n'));
    assert.deepEqual(JSON.parse(three.spec), { type: 'null' });
    assert.equal(three.consumed, 3);
    const two = decodeReply(Buffer.from('$-1\r\n'));
    assert.deepEqual(JSON.parse(two.spec), { type: 'null' });
    assert.equal(two.consumed, 5);

    const missing = execute(new Store(temporaryDir()), session(), [Buffer.from('GET'), Buffer.from('absent')]);
    assert.deepEqual(missing.reply, nullReply());
});

test('replies round trip through their specification', () => {
    const specs = [
        { type: 'simple', value: 'OK' },
        { type: 'error', value: 'ERR no such key' },
        { type: 'int', value: -3 },
        { type: 'bulk', bytes: Array.from(Buffer.from('hello')) },
        { type: 'bulk', bytes: [0, 255, 1] },
        { type: 'null' },
        { type: 'array', value: [{ type: 'int', value: 7 }, bulk('abc'), nullReply()] },
    ];
    for (const protocol of [2, 3]) {
        for (const spec of specs) {
            const frame = encodeReply(spec, protocol);
            assert.deepEqual(frame, referenceReply(spec, protocol));
            const decoded = decodeReply(frame);
            assert.equal(decoded.consumed, frame.length);
            assert.deepEqual(JSON.parse(decoded.spec), spec);
        }
    }

    const mapping = { type: 'map', value: [[bulk('k'), integer(7)]] };
    assert.deepEqual(encodeReply(mapping, 3), referenceReply(mapping, 3));
    assert.equal(encodeReply(mapping, 3).toString('utf8'), '%1\r\n$1\r\nk\r\n:7\r\n');
    assert.equal(encodeReply(mapping, 2).toString('utf8'), '*2\r\n$1\r\nk\r\n:7\r\n');
    const frame = encodeReply(mapping, 3);
    assert.deepEqual(JSON.parse(decodeReply(frame).spec), mapping);
});

test('reply decoding reports the consumed bytes', () => {
    const first = Buffer.from('+OK\r\n');
    const second = Buffer.from('*2\r\n:7\r\n$3\r\nabc\r\n');
    const stream = Buffer.concat([first, second]);

    const head = decodeReply(stream);
    assert.deepEqual(JSON.parse(head.spec), { type: 'simple', value: 'OK' });
    assert.equal(head.consumed, first.length);

    const tail = decodeReply(stream.subarray(first.length));
    assert.equal(tail.consumed, second.length);
    assert.deepEqual(JSON.parse(tail.spec), referenceDecodeReply(stream.subarray(first.length)).spec);
});

test('binary bulk bytes survive the round trip', () => {
    const spec = { type: 'bulk', bytes: [0, 255, 1] };
    const frame = encodeReply(spec, 2);
    assert.equal(frame.toString('hex'), '24330d0a00ff010d0a');
    assert.deepEqual(JSON.parse(decodeReply(frame).spec), spec);
});

test('a corrupted shard body is rejected at open', () => {
    const directory = temporaryDir();
    new Store(directory).set(0, 'key', 'value');
    const shardPath = join(directory, 'local-0.yykv');
    const original = readFileSync(shardPath);
    parseShard(original);

    const damaged = Buffer.from(original);
    damaged[damaged.length - 1] ^= 0xff;
    writeFileSync(shardPath, damaged);
    assert.throws(() => new Store(directory), /checksum mismatch/);

    writeFileSync(shardPath, Buffer.from('YYKV\x03short'));
    assert.throws(() => new Store(directory), /truncated/);
});

test('the catalog names the routed shard', () => {
    const directory = temporaryDir();
    new Store(directory).set(0, 'key', 'value');
    const catalog = parseCatalog(readFileSync(join(directory, 'local-0.yyds')));
    assert.equal(catalog.version, 0);
    assert.deepEqual(catalog.shardIds, ['local-0']);
    assert.ok(existsSync(join(directory, 'local-0.yykv')));
});

test('a fresh data directory writes a valid catalog and empty shard', () => {
    const directory = temporaryDir();
    new Store(directory);
    const snapshot = parseShard(readFileSync(join(directory, 'local-0.yykv')));
    assert.equal(snapshot.records.length, 0);
    assert.ok(snapshot.nextRevision >= 1, String(snapshot.nextRevision));
    assert.deepEqual(parseCatalog(readFileSync(join(directory, 'local-0.yyds'))).shardIds, ['local-0']);
});

test('append and increment preserve the deadline', () => {
    const directory = temporaryDir();
    const store = new Store(directory);
    const deadline = Date.now() + 120_000;
    store.set(0, 'key', 'abc', deadline);
    assert.equal(store.append(0, 'key', 'def'), 6);
    assert.equal(store.get(0, 'key'), 'abcdef');
    assert.equal(store.deadline(0, 'key'), deadline);

    store.set(0, 'counter', '5', deadline);
    assert.equal(store.incrBy(0, 'counter', 2).value, 7);
    assert.equal(store.deadline(0, 'counter'), deadline);
});

test('flushing one database leaves the others intact', () => {
    const store = new Store(temporaryDir());
    store.set(0, 'zero', 'value');
    store.set(1, 'one', 'value');
    assert.equal(store.size(0), 1);
    assert.equal(store.size(1), 1);
    store.flushDb(0);
    assert.equal(store.size(0), 0);
    assert.equal(store.size(1), 1);
    assert.equal(store.get(1, 'one'), 'value');
});

test('expired deadlines hide the value', () => {
    const store = new Store(temporaryDir());
    store.set(0, 'stale', 'value', Date.now() - 1);
    assert.equal(store.get(0, 'stale'), null);
    assert.equal(store.exists(0, 'stale'), false);
    assert.equal(store.deadline(0, 'stale'), null);
});
