//! Installed-state acceptance checks for `@yydb/redis`.
//!
//! The checks run against a tarball installed into a scratch project, never
//! against the workspace sources. Expectations come from the independent
//! computations in `src/reference.mjs`.

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';

import { parseCatalog, parseShard, canonicalInteger, encodeCommand as referenceCommand, encodeReply as referenceReply, decodeReply as referenceDecodeReply, decodeCommand as referenceDecodeCommand } from '../src/reference.mjs';
import { prepareInstall } from '../src/install.mjs';

const installed = await prepareInstall();
const redis = await installed.load();
const { Store, decodeCommand, decodeReply, encodeCommand, encodeReply, parseInteger, execute, startServer, array, bulk, error: replyError, integer, map, nullReply } = redis;

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
    assert.match(resolved.replaceAll('\\', '/'), /\/node_modules\/@yydb\/redis\/dist\/index\.js$/);
    assert.deepEqual(installed.tarballs.length, 2);
});

test('the platform binding resolves from the installed tree', () => {
    const manifest = installed.resolve(`@yydb/redis-${installed.platform}/package.json`);
    const binding = join(dirname(manifest), `redis.${installed.platform}.node`);
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

test('empty multibulk headers consume without arguments', () => {
    for (const frame of ['*0\r\n', '*-1\r\n', '*-5\r\n']) {
        const buffer = Buffer.from(frame);
        const decoded = decodeCommand(buffer);
        assert.deepEqual(decoded.args, []);
        assert.equal(decoded.consumed, buffer.length);
        assert.deepEqual(referenceDecodeCommand(buffer), { args: [], consumed: buffer.length });
    }
});

test('command framing violations are rejected', () => {
    assert.throws(() => decodeCommand(Buffer.from('GET key\r\n')), /expected a multibulk request/);
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

test('a truncated bulk reply reports incompleteness instead of a null value', () => {
    const truncated = Buffer.from('$5\r\nhel');
    assert.equal(decodeReply(truncated), null);
    assert.equal(referenceDecodeReply(truncated), null);
    assert.equal(decodeReply(Buffer.from('*2\r\n$3\r\nabc\r\n:4')), null);
    const hole = Buffer.from('$0\r\n\r\n');
    assert.deepEqual(JSON.parse(decodeReply(hole).spec), { type: 'bulk', bytes: [] });
    assert.equal(decodeReply(hole).consumed, hole.length);
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

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const textOf = spec => Buffer.from(spec.bytes ?? []).toString('utf8');

/** 安装态服务端的裸 socket 客户端，逐帧解析回复供双连接场景断言。 */
async function connectClient(port) {
    const socket = net.connect({ host: '127.0.0.1', port });
    await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('error', reject);
    });
    let buffer = Buffer.alloc(0);
    const frames = [];
    const waiters = [];
    const flush = () => {
        while (frames.length > 0 && waiters.length > 0) waiters.shift()(frames.shift());
    };
    socket.on('data', chunk => {
        buffer = Buffer.concat([buffer, chunk]);
        for (;;) {
            const decoded = decodeReply(buffer);
            if (decoded === null) break;
            buffer = buffer.subarray(decoded.consumed);
            frames.push(JSON.parse(decoded.spec));
        }
        flush();
    });
    return {
        send(...args) {
            socket.write(encodeCommand(args.map(argument => (Buffer.isBuffer(argument) ? argument : String(argument)))));
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error(`timed out waiting for ${args[0]}`)), 5_000);
                waiters.push(spec => {
                    clearTimeout(timer);
                    resolve(spec);
                });
                flush();
            });
        },
        /** Waits for the next unsolicited frame, such as a pub/sub delivery. */
        next() {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('timed out waiting for a frame')), 5_000);
                waiters.push(spec => {
                    clearTimeout(timer);
                    resolve(spec);
                });
                flush();
            });
        },
        close() {
            socket.destroy();
        },
    };
}

/** 在 `ms` 内没有回复就回 `null`，用于断言命令仍在阻塞。 */
async function settledWithin(promise, ms) {
    let timer;
    const marker = new Promise(resolve => {
        timer = setTimeout(() => resolve(null), ms);
    });
    const result = await Promise.race([promise, marker]);
    clearTimeout(timer);
    return result;
}

test('blocking commands wake across installed connections', async () => {
    const server = await startServer({ dataDir: temporaryDir() });
    const first = await connectClient(server.port);
    const second = await connectClient(server.port);
    const writer = await connectClient(server.port);
    try {
        const parked = first.send('BLPOP', 'wq', '0');
        await delay(50);
        await writer.send('RPUSH', 'wq', 'one');
        const popped = await parked;
        assert.equal(popped.type, 'array');
        assert.equal(textOf(popped.value[0]), 'wq');
        assert.equal(textOf(popped.value[1]), 'one');

        const firstParked = first.send('BLPOP', 'fq', '0');
        await delay(50);
        const secondParked = second.send('BLPOP', 'fq', '0');
        await delay(50);
        await writer.send('RPUSH', 'fq', 'a', 'b');
        assert.equal(textOf((await firstParked).value[1]), 'a');
        assert.equal(textOf((await secondParked).value[1]), 'b');

        const zpark = first.send('BZPOPMIN', 'zq', '0');
        await delay(50);
        await writer.send('ZADD', 'zq', '1', 'm');
        assert.equal(textOf((await zpark).value[1]), 'm');

        const mpop = first.send('BZMPOP', '0', '2', 'zm', 'zm2', 'MIN');
        await delay(50);
        await writer.send('ZADD', 'zm2', '1', 'deep');
        const mpopOut = await mpop;
        assert.equal(textOf(mpopOut.value[0]), 'zm2');
        assert.equal(textOf(mpopOut.value[1].value[0].value[0]), 'deep');

        await writer.send('RPUSH', 'rsrc', 'renamed');
        const renamePark = first.send('BLPOP', 'rdest', '0');
        await delay(50);
        await writer.send('RENAME', 'rsrc', 'rdest');
        assert.equal(textOf((await renamePark).value[1]), 'renamed');

        await writer.send('RPUSH', 'csrc', 'copied');
        const copyPark = first.send('BLPOP', 'cdest', '0');
        await delay(50);
        await writer.send('COPY', 'csrc', 'cdest');
        assert.equal(textOf((await copyPark).value[1]), 'copied');

        await writer.send('RPUSH', 'ssrc', '2', '1');
        const sortPark = first.send('BLPOP', 'sdest', '0');
        await delay(50);
        await writer.send('SORT', 'ssrc', 'STORE', 'sdest');
        assert.equal(textOf((await sortPark).value[1]), '1');

        await second.send('SELECT', '1');
        await writer.send('RPUSH', 'dbsrc', 'cross');
        const dbPark = second.send('BLPOP', 'dbdest', '0');
        await delay(50);
        await writer.send('COPY', 'dbsrc', 'dbdest', 'DB', '1');
        assert.equal(textOf((await dbPark).value[1]), 'cross');
        await second.send('SELECT', '0');
    }
    finally {
        first.close();
        second.close();
        writer.close();
        await server.close();
    }
});

test('blocking timeouts truncate like the real server', async () => {
    const server = await startServer({ dataDir: temporaryDir() });
    const first = await connectClient(server.port);
    const writer = await connectClient(server.port);
    try {
        const positive = await settledWithin(first.send('BLPOP', 'tq', '0.0005'), 3_000);
        assert.equal(positive.type, 'null-array');

        const nanosecond = await first.send('BLPOP', 'tq', '1e-9');
        assert.equal(nanosecond.type, 'null-array');

        for (const value of ['0', '0.000', '-0', '-0.0001', '-0.0005']) {
            const parked = first.send('BLPOP', `tq:${value}`, value);
            assert.equal(await settledWithin(parked, 300), null, `${value} returned early`);
            await writer.send('RPUSH', `tq:${value}`, 'v');
            const popped = await parked;
            assert.equal(popped.type, 'array');
            assert.equal(textOf(popped.value[1]), 'v');
        }

        const negative = await first.send('BLPOP', 'tq', '-1');
        assert.equal(negative.type, 'error');
        assert.equal(negative.value, 'ERR timeout is negative');

        const range = await first.send('BLPOP', 'tq', 'inf');
        assert.equal(range.type, 'error');
        assert.equal(range.value, 'ERR timeout is out of range');

        const float = await first.send('BLPOP', 'tq', 'nan');
        assert.equal(float.type, 'error');
        assert.equal(float.value, 'ERR timeout is not a float or out of range');
    }
    finally {
        first.close();
        writer.close();
        await server.close();
    }
});

test('WATCH aborts EXEC when another connection writes the key', async () => {
    const server = await startServer({ dataDir: temporaryDir() });
    const first = await connectClient(server.port);
    const second = await connectClient(server.port);
    try {
        assert.equal((await first.send('SET', 'wk', 'one')).value, 'OK');
        assert.equal((await first.send('WATCH', 'wk')).value, 'OK');
        await second.send('SET', 'wk', 'two');
        await first.send('MULTI');
        assert.equal((await first.send('SET', 'wk', 'three')).value, 'QUEUED');
        assert.equal((await first.send('EXEC')).type, 'null-array');
        assert.equal(textOf(await first.send('GET', 'wk')), 'two');

        // A byte-identical rewrite still counts as a modification.
        await first.send('WATCH', 'wk');
        await second.send('SET', 'wk', 'two');
        await first.send('MULTI');
        await first.send('SET', 'wk', 'four');
        assert.equal((await first.send('EXEC')).type, 'null-array');

        // With no modification the transaction runs and the watch is cleared.
        await first.send('WATCH', 'wk');
        await first.send('MULTI');
        await first.send('SET', 'wk', 'five');
        const committed = await first.send('EXEC');
        assert.equal(committed.type, 'array');
        assert.equal(committed.value[0].value, 'OK');
        assert.equal(textOf(await first.send('GET', 'wk')), 'five');

        // UNWATCH releases the pin.
        await first.send('WATCH', 'wk');
        assert.equal((await first.send('UNWATCH')).value, 'OK');
        await second.send('SET', 'wk', 'six');
        await first.send('MULTI');
        await first.send('SET', 'wk', 'seven');
        assert.equal((await first.send('EXEC')).type, 'array');
        assert.equal(textOf(await first.send('GET', 'wk')), 'seven');

        // DISCARD drops the pin without poisoning the next transaction.
        await first.send('WATCH', 'wk');
        await first.send('MULTI');
        assert.equal((await first.send('DISCARD')).value, 'OK');
        await second.send('SET', 'wk', 'eight');
        await first.send('MULTI');
        await first.send('SET', 'wk', 'nine');
        assert.equal((await first.send('EXEC')).type, 'array');

        // WATCH inside MULTI is rejected but leaves the transaction usable.
        await first.send('MULTI');
        const rejected = await first.send('WATCH', 'wk');
        assert.equal(rejected.type, 'error');
        assert.match(rejected.value, /WATCH inside MULTI is not allowed/);
        await first.send('SET', 'wk', 'ten');
        assert.equal((await first.send('EXEC')).type, 'array');
        assert.equal(textOf(await first.send('GET', 'wk')), 'ten');
    }
    finally {
        first.close();
        second.close();
        await server.close();
    }
});

test('requirepass gates commands until AUTH succeeds', async () => {
    const server = await startServer({ dataDir: temporaryDir(), requirepass: 'secret' });
    const guest = await connectClient(server.port);
    const peer = await connectClient(server.port);
    try {
        const denied = await guest.send('GET', 'k');
        assert.equal(denied.type, 'error');
        assert.match(denied.value, /NOAUTH Authentication required/);

        const bad = await guest.send('AUTH', 'wrong');
        assert.equal(bad.type, 'error');
        assert.match(bad.value, /WRONGPASS/);
        assert.match((await guest.send('GET', 'k')).value, /NOAUTH/);

        assert.match((await guest.send('AUTH', 'someone', 'secret')).value, /WRONGPASS/);

        assert.equal((await guest.send('AUTH', 'secret')).value, 'OK');
        assert.equal((await guest.send('SET', 'k', 'v')).value, 'OK');
        assert.equal(textOf(await guest.send('GET', 'k')), 'v');

        // Authentication is per connection, and the ACL form targets `default`.
        assert.match((await peer.send('GET', 'k')).value, /NOAUTH/);
        assert.equal((await peer.send('AUTH', 'default', 'secret')).value, 'OK');
        assert.equal(textOf(await peer.send('GET', 'k')), 'v');

        // HELLO and RESET stay available before authentication.
        const fresh = await connectClient(server.port);
        try {
            assert.equal((await fresh.send('HELLO', '3')).type, 'map');
            assert.equal((await fresh.send('RESET')).value, 'RESET');
        }
        finally {
            fresh.close();
        }

        // HELLO can carry the credentials and a client name.
        const helloClient = await connectClient(server.port);
        try {
            const badHello = await helloClient.send('HELLO', '3', 'AUTH', 'default', 'nope');
            assert.match(badHello.value, /WRONGPASS/);
            assert.match((await helloClient.send('GET', 'k')).value, /NOAUTH/);

            const hello = await helloClient.send('HELLO', '3', 'AUTH', 'default', 'secret', 'SETNAME', 'agent');
            assert.equal(hello.type, 'map');
            assert.equal(textOf(await helloClient.send('CLIENT', 'GETNAME')), 'agent');
            assert.equal(textOf(await helloClient.send('GET', 'k')), 'v');
        }
        finally {
            helloClient.close();
        }
    }
    finally {
        guest.close();
        peer.close();
        await server.close();
    }
});

test('AUTH without a configured password reports the legacy error', () => {
    const store = new Store(temporaryDir());
    const state = session(2);
    const legacy = execute(store, state, [Buffer.from('AUTH'), Buffer.from('x')]);
    assert.equal(legacy.reply.type, 'error');
    assert.match(legacy.reply.value, /called without any password configured/);

    const acl = execute(store, state, [Buffer.from('AUTH'), Buffer.from('default'), Buffer.from('x')]);
    assert.equal(acl.reply.type, 'simple');
    assert.equal(acl.reply.value, 'OK');
});

test('expired keys publish keyspace notifications when enabled', async () => {
    const server = await startServer({ dataDir: temporaryDir(), notifyKeyspaceEvents: 'KEx' });
    const subscriber = await connectClient(server.port);
    const writer = await connectClient(server.port);
    try {
        await subscriber.send('SUBSCRIBE', '__keyspace@0__:ttl-key');
        await subscriber.send('SUBSCRIBE', '__keyevent@0__:expired');
        await writer.send('PSETEX', 'ttl-key', '60', 'v');

        const keyspace = await subscriber.next();
        assert.equal(keyspace.type, 'array');
        assert.equal(textOf(keyspace.value[0]), 'message');
        assert.equal(textOf(keyspace.value[1]), '__keyspace@0__:ttl-key');
        assert.equal(textOf(keyspace.value[2]), 'expired');

        const keyevent = await subscriber.next();
        assert.equal(keyevent.type, 'array');
        assert.equal(textOf(keyevent.value[0]), 'message');
        assert.equal(textOf(keyevent.value[1]), '__keyevent@0__:expired');
        assert.equal(textOf(keyevent.value[2]), 'ttl-key');
    }
    finally {
        subscriber.close();
        writer.close();
        await server.close();
    }
});

test('CONFIG SET requirepass gates the connections opened after it', async () => {
    const server = await startServer({ dataDir: temporaryDir() });
    const writer = await connectClient(server.port);
    try {
        const set = await writer.send('CONFIG', 'SET', 'requirepass', 'secret');
        assert.equal(set.value, 'OK');
        const reported = await writer.send('CONFIG', 'GET', 'requirepass');
        assert.equal(reported.type, 'array');
        assert.equal(textOf(reported.value[0]), 'requirepass');
        assert.equal(textOf(reported.value[1]), 'secret');

        // The connection that was already authenticated stays usable.
        assert.equal((await writer.send('SET', 'live', 'v')).value, 'OK');

        const guest = await connectClient(server.port);
        try {
            assert.match((await guest.send('GET', 'live')).value, /NOAUTH/);
            assert.equal((await guest.send('AUTH', 'secret')).value, 'OK');
            assert.equal(textOf(await guest.send('GET', 'live')), 'v');
        }
        finally {
            guest.close();
        }

        // An empty password removes the requirement again.
        assert.equal((await writer.send('CONFIG', 'SET', 'requirepass', '')).value, 'OK');
        const open = await connectClient(server.port);
        try {
            assert.equal(textOf(await open.send('GET', 'live')), 'v');
        }
        finally {
            open.close();
        }
    }
    finally {
        writer.close();
        await server.close();
    }
});

test('CONFIG SET notify-keyspace-events applies to the running listener', async () => {
    const server = await startServer({ dataDir: temporaryDir() });
    const subscriber = await connectClient(server.port);
    const writer = await connectClient(server.port);
    try {
        await subscriber.send('SUBSCRIBE', '__keyevent@0__:expired');
        assert.equal((await writer.send('CONFIG', 'SET', 'notify-keyspace-events', 'Ex')).value, 'OK');
        assert.equal(textOf((await writer.send('CONFIG', 'GET', 'notify-keyspace-events')).value[1]), 'Ex');

        await writer.send('PSETEX', 'live-ttl', '60', 'v');
        const event = await subscriber.next();
        assert.equal(textOf(event.value[0]), 'message');
        assert.equal(textOf(event.value[1]), '__keyevent@0__:expired');
        assert.equal(textOf(event.value[2]), 'live-ttl');
    }
    finally {
        subscriber.close();
        writer.close();
        await server.close();
    }
});

test('CONFIG SET appendfsync validates the policy and reports it live', async () => {
    const server = await startServer({ dataDir: temporaryDir() });
    const writer = await connectClient(server.port);
    try {
        assert.equal(textOf((await writer.send('CONFIG', 'GET', 'appendfsync')).value[1]), 'everysec');

        const rejected = await writer.send('CONFIG', 'SET', 'appendfsync', 'sometimes');
        assert.equal(rejected.type, 'error');
        assert.match(rejected.value, /argument\(s\) must be one of the following: always, everysec/);

        assert.equal((await writer.send('CONFIG', 'SET', 'appendfsync', 'always')).value, 'OK');
        assert.equal(textOf((await writer.send('CONFIG', 'GET', 'appendfsync')).value[1]), 'always');

        const unknown = await writer.send('CONFIG', 'SET', 'nosuchoption', 'x');
        assert.equal(unknown.type, 'error');
        assert.match(unknown.value, /Unknown option or number of arguments for CONFIG SET - 'nosuchoption'/);
    }
    finally {
        writer.close();
        await server.close();
    }
});

test('CONFIG SET slowlog thresholds apply to the running server', async () => {
    const server = await startServer({ dataDir: temporaryDir() });
    const writer = await connectClient(server.port);
    try {
        assert.equal((await writer.send('CONFIG', 'SET', 'slowlog-log-slower-than', '0')).value, 'OK');
        assert.equal(textOf((await writer.send('CONFIG', 'GET', 'slowlog-log-slower-than')).value[1]), '0');

        // A zero threshold logs every command, including these CONFIG calls.
        await writer.send('PING');
        assert.ok((await writer.send('SLOWLOG', 'LEN')).value >= 1);

        assert.equal((await writer.send('CONFIG', 'SET', 'slowlog-max-len', '2')).value, 'OK');
        assert.equal(textOf((await writer.send('CONFIG', 'GET', 'slowlog-max-len')).value[1]), '2');
        await writer.send('PING');
        await writer.send('PING');
        await writer.send('PING');
        assert.equal((await writer.send('SLOWLOG', 'LEN')).value, 2);

        // A negative threshold disables logging without clearing the log.
        assert.equal((await writer.send('CONFIG', 'SET', 'slowlog-log-slower-than', '-1')).value, 'OK');
        await writer.send('PING');
        assert.equal((await writer.send('SLOWLOG', 'LEN')).value, 2);

        const invalid = await writer.send('CONFIG', 'SET', 'slowlog-max-len', '-1');
        assert.equal(invalid.type, 'error');
        assert.match(invalid.value, /argument couldn't be parsed into an integer/);
    }
    finally {
        // The slow log is process-wide, so the next test must see the defaults.
        await writer.send('CONFIG', 'SET', 'slowlog-log-slower-than', '10000').catch(() => {});
        await writer.send('CONFIG', 'SET', 'slowlog-max-len', '128').catch(() => {});
        writer.close();
        await server.close();
    }
});

test('UNLINK removes keys and MOVE transfers across databases', async () => {
    const server = await startServer({ dataDir: temporaryDir() });
    const writer = await connectClient(server.port);
    try {
        await writer.send('SET', 'u1', 'one');
        await writer.send('SET', 'u2', 'two');
        assert.equal((await writer.send('UNLINK', 'u1', 'u2', 'missing')).value, 2);
        assert.equal((await writer.send('EXISTS', 'u1', 'u2')).value, 0);
        assert.equal((await writer.send('UNLINK', 'u1')).value, 0);

        await writer.send('SET', 'moving', 'v');
        await writer.send('PEXPIRE', 'moving', '60000');
        assert.equal((await writer.send('MOVE', 'moving', '1')).value, 1);
        assert.equal((await writer.send('EXISTS', 'moving')).value, 0);
        assert.equal((await writer.send('SELECT', '1')).value, 'OK');
        assert.equal(textOf(await writer.send('GET', 'moving')), 'v');
        assert.ok((await writer.send('PTTL', 'moving')).value > 0);

        // An occupied destination keeps both keys where they were.
        await writer.send('SET', 'occupied', 'target');
        await writer.send('SELECT', '0');
        await writer.send('SET', 'occupied', 'source');
        assert.equal((await writer.send('MOVE', 'occupied', '1')).value, 0);
        assert.equal(textOf(await writer.send('GET', 'occupied')), 'source');

        const same = await writer.send('MOVE', 'occupied', '0');
        assert.equal(same.type, 'error');
        assert.match(same.value, /source and destination objects are the same/);
        const range = await writer.send('MOVE', 'occupied', '16');
        assert.equal(range.type, 'error');
        assert.match(range.value, /DB index is out of range/);
    }
    finally {
        writer.close();
        await server.close();
    }
});

test('KEYS supports the full Redis glob dialect', async () => {
    const server = await startServer({ dataDir: temporaryDir() });
    const writer = await connectClient(server.port);
    try {
        for (const key of ['hello', 'hallo', 'hxllo', 'hello2', 'he*lo']) {
            await writer.send('SET', key, '1');
        }
        const keys = async pattern => (await writer.send('KEYS', pattern)).value.map(entry => textOf(entry));
        assert.deepEqual(await keys('h?llo'), ['hallo', 'hello', 'hxllo']);
        assert.deepEqual(await keys('h[ae]llo'), ['hallo', 'hello']);
        assert.deepEqual(await keys('h[^e]llo'), ['hallo', 'hxllo']);
        assert.deepEqual(await keys('h[a-b]llo'), ['hallo']);
        assert.deepEqual(await keys('he\\*lo'), ['he*lo']);
    }
    finally {
        writer.close();
        await server.close();
    }
});

test('buffered counters become durable on a mutation and a clean close', async () => {
    const directory = temporaryDir();
    const server = await startServer({ dataDir: directory });
    const writer = await connectClient(server.port);
    try {
        for (let index = 0; index < 50; index += 1) {
            await writer.send('INCR', 'counter');
        }
        // A committed mutation carries the buffered counter into the shard.
        await writer.send('SET', 'marker', 'x');
        const store = new Store(directory);
        assert.equal(store.get(0, 'counter'), '50');
    }
    finally {
        writer.close();
        await server.close();
    }
    const reopened = new Store(directory);
    assert.equal(reopened.get(0, 'counter'), '50');
});

test('SWAPDB exchanges both databases', async () => {
    const server = await startServer({ dataDir: temporaryDir() });
    const writer = await connectClient(server.port);
    try {
        await writer.send('SET', 'zero', 'from-0');
        await writer.send('SELECT', '1');
        await writer.send('SET', 'one', 'from-1');
        assert.equal((await writer.send('SWAPDB', '0', '1')).value, 'OK');

        // The connection keeps its selected index while the contents swap.
        assert.equal(textOf(await writer.send('GET', 'zero')), 'from-0');
        assert.equal((await writer.send('GET', 'one')).type, 'null');
        await writer.send('SELECT', '0');
        assert.equal(textOf(await writer.send('GET', 'one')), 'from-1');
        assert.equal((await writer.send('GET', 'zero')).type, 'null');

        // A self-swap is a no-op rather than an error.
        assert.equal((await writer.send('SWAPDB', '0', '0')).value, 'OK');
        const range = await writer.send('SWAPDB', '0', '16');
        assert.match(range.value, /DB index is out of range/);
    }
    finally {
        writer.close();
        await server.close();
    }
});
