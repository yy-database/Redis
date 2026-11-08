//! Shared-case conformance checks for `@yydb/redis`.
//!
//! Every case in `cases` is also executed by the Python package checks.
//! Expected values are literal: they come from the documented wire grammar, the
//! documented shard/catalog layout, and documented Redis command semantics. No
//! check compares one implementation against another at run time.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { loadCases } from '../src/cases.mjs';
import { prepareInstall } from '../src/install.mjs';

const installed = await prepareInstall();
const redis = await installed.load();
// The checks speak in raw byte values, so they use the binding directly. A `.node`
// addon is CommonJS-only, which is why this goes through `require` instead of `import`.
const NativeStore = installed.loadBinding(`@yydb/redis-${installed.platform}`).Store;

const { decodeCommand, decodeReply, encodeCommand, encodeReply, parseInteger, repairShard, execute } = redis;

/**
 * Adapts the raw binding to the surface `execute` expects.
 *
 * Every primitive already matches, except the collection command entries, whose
 * replies cross the binding as JSON text and are parsed by the composition package.
 * The adapter keeps the byte-level `Store` the layout checks need while giving
 * `execute` parsed specs.
 */
function commandStore(store) {
    return new Proxy(store, {
        get(target, property) {
            if (property === 'hashCommand' || property === 'setCommand' || property === 'listCommand'
                || property === 'zsetCommand' || property === 'stringCommand' || property === 'hyperloglogCommand'
                || property === 'keyspaceCommand' || property === 'serverCommand') {
                return (...call) => JSON.parse(target[property](...call));
            }
            const value = Reflect.get(target, property);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}

const directories = [];
const observations = [];

after(() => {
    writeReport();
    for (const directory of directories) {
        rmSync(directory, { recursive: true, force: true });
    }
    installed.cleanup();
});

function temporaryDir() {
    const directory = mkdtempSync(join(tmpdir(), 'redis-conformance-'));
    directories.push(directory);
    return directory;
}

function seedDirectory(entry, directory) {
    for (const seed of entry.seed ?? []) {
        const path = join(directory, seed.path);
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, bytes(seed.hex));
    }
}

function writeReport() {
    const target = process.env.REDIS_CONFORMANCE_REPORT;
    if (target === undefined || target.length === 0) {
        return;
    }
    const payload = {
        format: 'redis.conformance-report/v1',
        side: 'ts',
        cases: observations,
    };
    writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
}

const bytes = hex => Buffer.from(hex, 'hex');
const hexOf = value => (Buffer.isBuffer(value) ? value.toString('hex') : value);

function normalize(value) {
    if (value === undefined) {
        return null;
    }
    if (Buffer.isBuffer(value)) {
        return { kind: 'bytes', hex: value.toString('hex') };
    }
    if (Array.isArray(value) && value.every(item => Buffer.isBuffer(item))) {
        return { kind: 'bytes-list', hex: value.map(item => item.toString('hex')) };
    }
    if (value !== null && typeof value === 'object' && value.kind === 'increment') {
        return value;
    }
    if (value !== null && typeof value === 'object' && 'error' in value) {
        return { kind: 'increment', value: value.value ?? null, error: value.error ?? null };
    }
    return value;
}

function assertExpectation(observed, expected, label) {
    if (expected === null) {
        assert.equal(observed, null, label);
        return;
    }
    if (expected.bytes !== undefined) {
        assert.equal(hexOf(observed), expected.bytes, label);
        return;
    }
    if (expected.int !== undefined) {
        assert.equal(observed, expected.int, label);
        return;
    }
    if (expected.bool !== undefined) {
        assert.equal(observed, expected.bool, label);
        return;
    }
    if (expected.text !== undefined) {
        assert.equal(observed, expected.text, label);
        return;
    }
    if (expected.hexList !== undefined) {
        assert.deepEqual(observed.map(hexOf), expected.hexList, label);
        return;
    }
    if (expected.increment !== undefined) {
        assert.deepEqual(
            { value: observed.value ?? null, error: observed.error ?? null },
            expected.increment,
            label,
        );
        return;
    }
    assert.fail(`${label}: unsupported expectation ${JSON.stringify(expected)}`);
}

function perform(store, entry) {
    switch (entry.call) {
        case 'command':
            // 需要命令语义才能搭出的前置状态（例如 HLL 的寄存器积累）走真实命令路径。
            return execute(store, session(), entry.argsText.map(value => Buffer.from(value, 'utf8'))).reply;
        case 'set':
            return store.set(entry.db, bytes(entry.keyHex), bytes(entry.valueHex), entry.expiresAt ?? null);
        case 'get':
            return store.get(entry.db, bytes(entry.keyHex));
        case 'exists':
            return store.exists(entry.db, bytes(entry.keyHex));
        case 'delete':
            return store.delete(entry.db, bytes(entry.keyHex));
        case 'deadline':
            return store.deadline(entry.db, bytes(entry.keyHex));
        case 'deadline_set':
            return store.deadline(entry.db, bytes(entry.keyHex)) !== null;
        case 'expire':
            return store.expire(entry.db, bytes(entry.keyHex), entry.expiresAt ?? null);
        case 'get_kind':
            return store.getKind(entry.db, entry.kind, bytes(entry.keyHex));
        case 'set_kind':
            return store.setKind(entry.db, entry.kind, bytes(entry.keyHex), bytes(entry.valueHex), entry.expiresAt ?? null);
        case 'delete_kind':
            return store.deleteKind(entry.db, entry.kind, bytes(entry.keyHex));
        case 'exists_kind':
            return store.existsKind(entry.db, entry.kind, bytes(entry.keyHex));
        case 'deadline_kind':
            return store.deadlineKind(entry.db, entry.kind, bytes(entry.keyHex));
        case 'expire_kind':
            return store.expireKind(entry.db, entry.kind, bytes(entry.keyHex), entry.expiresAt ?? null);
        case 'rename':
            return store.rename(entry.db, bytes(entry.sourceHex), bytes(entry.destinationHex), entry.ifAbsent === true);
        case 'append':
            return store.append(entry.db, bytes(entry.keyHex), bytes(entry.valueHex));
        case 'incr_by': {
            const outcome = store.incrBy(entry.db, bytes(entry.keyHex), entry.delta);
            return { kind: 'increment', value: outcome.value ?? null, error: outcome.error ?? null };
        }
        case 'keys':
            return store.keys(entry.db);
        case 'set_many':
            return store.setMany(
                entry.db,
                entry.entries.map(([key, value]) => bytes(key)),
                entry.entries.map(([, value]) => bytes(value)),
            );
        case 'flush_db':
            return store.flushDb(entry.db);
        case 'size':
            return store.size(entry.db);
        default:
            throw new Error(`unsupported store call ${entry.call}`);
    }
}

function runSteps(store, steps, directory) {
    let current = store;
    const seen = [];
    for (const entry of steps) {
        if (entry.call === 'reopen') {
            current.flush();
            current = new NativeStore(directory);
            seen.push({ call: 'reopen', value: null });
            continue;
        }
        if (entry.call === 'repair_shard') {
            const shardId = repairShard(directory);
            if (entry.expect !== undefined) {
                assertExpectation(shardId, entry.expect, entry.call);
            }
            seen.push({ call: 'repair_shard', value: shardId });
            continue;
        }
        const value = perform(current, entry);
        if (entry.expect !== undefined) {
            assertExpectation(value, entry.expect, entry.call);
        }
        seen.push({ call: entry.call, value: normalize(value) });
    }
    return seen;
}

/** One harness connection: `id` matches the first id a fresh registry hands out. */
function session() {
    return { id: 1, db: 0, protocol: 2, queued: null, name: '' };
}

/** Executes one scan-family command, returning its cursor and page tokens in hex. */
function scanPage(store, entry, args) {
    const result = execute(store, session(), args.map(value => Buffer.from(value)));
    assert.equal(result.reply.type, 'array', `${entry.id}: expected a scan reply array`);
    assert.equal(result.reply.value.length, 2, `${entry.id}: expected a cursor and an element array`);
    const [cursorSpec, elementsSpec] = result.reply.value;
    assert.equal(cursorSpec.type, 'bulk', `${entry.id}: expected a bulk cursor`);
    const cursor = Buffer.from(cursorSpec.bytes).toString('utf8');
    assert.match(cursor, /^\d+$/, `${entry.id}: expected a canonical cursor, read '${cursor}'`);
    assert.equal(elementsSpec.type, 'array', `${entry.id}: expected an element array`);
    const elements = elementsSpec.value.map(spec => {
        assert.equal(spec.type, 'bulk', `${entry.id}: expected bulk elements`);
        return Buffer.from(spec.bytes).toString('hex');
    });
    return { cursor, elements };
}

/** Checks one page against the declared universe and the no-repeat-in-page rule. */
function checkScanPage(entry, page, label) {
    const seen = new Set();
    for (const element of page.elements) {
        assert.ok(entry.scanContract.universe.includes(element), `${entry.id}: ${label} returned '${element}' outside the declared universe`);
        assert.ok(!seen.has(element), `${entry.id}: ${label} repeated '${element}' inside one page`);
        seen.add(element);
    }
}

/**
 * Asserts the cursor contract a live-compatible scan obeys.
 *
 * The exact cursor numbers are implementation details of the server's hash
 * table, so only the semantics are checked: cursor 0 ends the iteration, every
 * page stays inside the universe, and replaying from cursor 0 reaches every
 * member exactly at least once (repeats across pages are allowed).
 */
function assertScanContract(entry, store) {
    checkScanPage(entry, scanPage(store, entry, entry.argsText), 'the requested page');
    const args = entry.argsText.slice();
    const index = entry.scanContract.cursorIndex;
    args[index] = '0';
    const collected = new Set();
    for (let step = 0; step < 1000; step += 1) {
        const page = scanPage(store, entry, args);
        checkScanPage(entry, page, 'a traversal page');
        for (const element of page.elements) collected.add(element);
        if (page.cursor === '0') {
            for (const element of entry.scanContract.universe) {
                assert.ok(collected.has(element), `${entry.id}: traversal from cursor 0 never returned '${element}'`);
            }
            return;
        }
        args[index] = page.cursor;
    }
    assert.fail(`${entry.id}: scan traversal never reached cursor 0`);
}

/** Compares one reply spec, honouring the case's unordered-set marker. */
function assertReply(entry, observed) {
    if (entry.replyUnordered !== true) {
        assert.deepEqual(observed, entry.reply);
        return;
    }
    assert.equal(observed.type, entry.reply.type, `${entry.id}: reply kind`);
    const sorted = spec => spec.value.map(item => JSON.stringify(item)).sort();
    assert.deepEqual(sorted(observed), sorted(entry.reply), `${entry.id}: unordered members`);
}

function runCase(entry) {
    switch (entry.op) {
        case 'encode_command': {
            const frame = encodeCommand(entry.argsHex.map(bytes));
            assert.equal(frame.toString('hex'), entry.expect.hex);
            return { hex: frame.toString('hex') };
        }
        case 'decode_command': {
            let decoded;
            try {
                decoded = decodeCommand(bytes(entry.inputHex));
            }
            catch (cause) {
                assert.equal(cause.message, entry.expect.error);
                return { error: cause.message };
            }
            if (decoded === null) {
                assert.equal(entry.expect.incomplete, true);
                return { incomplete: true };
            }
            assert.equal(decoded.consumed, entry.expect.consumed);
            assert.deepEqual(decoded.args.map(hexOf), entry.expect.argsHex);
            return { consumed: decoded.consumed, argsHex: decoded.args.map(hexOf) };
        }
        case 'encode_reply': {
            let frame;
            try {
                frame = encodeReply(entry.spec, entry.protocol);
            }
            catch (cause) {
                assert.equal(cause.message, entry.expect.error);
                return { error: cause.message };
            }
            assert.equal(frame.toString('hex'), entry.expect.hex);
            return { hex: frame.toString('hex') };
        }
        case 'decode_reply': {
            let decoded;
            try {
                decoded = decodeReply(bytes(entry.inputHex));
            }
            catch (cause) {
                assert.equal(cause.message, entry.expect.error);
                return { error: cause.message };
            }
            if (decoded === null) {
                assert.equal(entry.expect.incomplete, true);
                return { incomplete: true };
            }
            assert.equal(decoded.consumed, entry.expect.consumed);
            assert.deepEqual(JSON.parse(decoded.spec), entry.expect.spec);
            return { consumed: decoded.consumed, spec: JSON.parse(decoded.spec) };
        }
        case 'parse_integer': {
            const value = parseInteger(entry.inputText);
            assert.equal(value, entry.expect.value);
            return { value };
        }
        case 'store':
        case 'layout': {
            const directory = temporaryDir();
            seedDirectory(entry, directory);
            if (entry.expectOpenError !== undefined) {
                let message;
                try {
                    new NativeStore(directory);
                }
                catch (cause) {
                    message = cause.message;
                }
                assert.equal(message, entry.expectOpenError);
                return { openError: message ?? null };
            }
            const store = new NativeStore(directory);
            if (entry.op === 'layout') {
                runSteps(store, entry.steps, directory);
                store.flush();
                const shard = readFileSync(join(directory, 'local-0.yykv')).toString('hex');
                const catalog = readFileSync(join(directory, 'local-0.yyds')).toString('hex');
                assert.equal(shard, entry.shardHex);
                assert.equal(catalog, entry.catalogHex);
                assert.equal(shard.length / 2, entry.shardLen);
                return { shardHex: shard, catalogHex: catalog, shardLen: shard.length / 2 };
            }
            return { steps: runSteps(store, entry.steps, directory) };
        }
        case 'repair': {
            const directory = temporaryDir();
            seedDirectory(entry, directory);
            let message = null;
            try {
                new NativeStore(directory);
            }
            catch (cause) {
                message = cause.message;
            }
            assert.equal(message, entry.expectOpenError);
            const shardId = repairShard(directory);
            assert.equal(shardId, entry.expectShardId);
            const catalog = readFileSync(join(directory, 'local-0.yyds')).toString('hex');
            assert.equal(catalog, entry.catalogHex);
            const store = new NativeStore(directory);
            return { openError: message, shardId, catalogHex: catalog, steps: runSteps(store, entry.steps, directory) };
        }
        case 'command': {
            const directory = temporaryDir();
            const store = commandStore(new NativeStore(directory));
            runSteps(store, entry.setup, directory);
            let result;
            try {
                result = execute(store, session(), entry.argsText.map(value => Buffer.from(value)));
            }
            catch (cause) {
                assert.equal(cause.message, entry.reply.value);
                return { steps: [], replyErrorThrown: cause.message };
            }
            if (entry.sides === undefined || entry.sides.includes('ts')) {
                if (entry.scanContract === undefined) {
                    assertReply(entry, result.reply);
                }
                else {
                    assertScanContract(entry, store);
                }
            }
            const steps = runSteps(store, entry.effect, directory);
            return { steps };
        }
        case 'dispatch': {
            const directory = temporaryDir();
            const store = commandStore(new NativeStore(directory));
            runSteps(store, entry.setup, directory);
            const state = session();
            const seen = [];
            for (const item of entry.steps) {
                if (item.db !== undefined) {
                    state.db = item.db;
                }
                if (item.protocol !== undefined) {
                    state.protocol = item.protocol;
                }
                const result = execute(store, state, item.argsText.map(value => Buffer.from(value)));
                if (item.frames !== undefined) {
                    assert.deepEqual(result.frames, item.frames);
                }
                else {
                    assert.deepEqual(result.reply, item.reply);
                }
                if (item.close !== undefined) {
                    assert.equal(result.close === true, item.close);
                }
                runSteps(store, item.effect ?? [], directory);
                seen.push({ args: item.argsText, reply: result.reply });
            }
            return { calls: seen.length, lastReply: seen[seen.length - 1].reply };
        }
        case 'stress':
            return runStress(entry);
        default:
            throw new Error(`unsupported case op ${entry.op}`);
    }
}

function runStress(entry) {
    switch (entry.kind) {
        case 'scale': {
            const directory = temporaryDir();
            const store = new NativeStore(directory);
            const keys = [];
            const values = [];
            for (let index = 0; index < entry.count; index += 1) {
                keys.push(Buffer.from(`${entry.prefix}${String(index).padStart(6, '0')}`));
                values.push(Buffer.from(`v${index}`));
            }
            const started = Date.now();
            store.setMany(0, keys, values);
            const writeMs = Date.now() - started;
            const sized = Date.now();
            assert.equal(store.size(0), entry.expect.size);
            const sizeMs = Date.now() - sized;
            const all = store.keys(0);
            assert.equal(all.length, entry.expect.keysLength);
            assert.equal(all[0].toString('hex'), entry.expect.first);
            assert.equal(all[all.length - 1].toString('hex'), entry.expect.last);
            const reopened = Date.now();
            const again = new NativeStore(directory);
            assert.equal(again.size(0), entry.expect.reopenSize);
            const reopenMs = Date.now() - reopened;
            assert.equal(readFileSync(join(directory, 'local-0.yykv')).length, entry.expect.shardLen);
            assert.ok(writeMs < 120_000 && reopenMs < 120_000);
            return { writeMs, sizeMs, reopenMs, size: entry.expect.size };
        }
        case 'bulk': {
            const directory = temporaryDir();
            const store = new NativeStore(directory);
            const value = Buffer.from('0123456789abcdef'.repeat(entry.size / 16));
            const started = Date.now();
            store.set(0, Buffer.from('big'), value);
            const writeMs = Date.now() - started;
            const readStart = Date.now();
            const back = store.get(0, Buffer.from('big'));
            const readMs = Date.now() - readStart;
            assert.equal(back.length, entry.expect.length);
            assert.equal(back.subarray(0, 16).toString('hex'), entry.expect.prefixHex);
            assert.equal(back.subarray(back.length - 16).toString('hex'), entry.expect.suffixHex);
            assert.equal(readFileSync(join(directory, 'local-0.yykv')).length, entry.expect.shardLen);
            assert.ok(writeMs < 120_000 && readMs < 120_000);
            return { writeMs, readMs, length: back.length };
        }
        case 'reply-bulk': {
            const value = Buffer.from('0123456789abcdef'.repeat(entry.size / 16));
            const started = Date.now();
            const frame = encodeReply({ type: 'bulk', bytes: Array.from(value) }, 2);
            const encodeMs = Date.now() - started;
            assert.equal(frame.length, entry.expect.frameLen);
            const decoded = decodeReply(frame);
            assert.equal(decoded.consumed, entry.expect.consumed);
            assert.equal(JSON.parse(decoded.spec).bytes.length, entry.size);
            return { encodeMs, frameLen: frame.length };
        }
        case 'nesting': {
            let spec = { type: 'bulk', bytes: [120] };
            for (let index = 0; index < entry.depth; index += 1) {
                spec = { type: 'array', value: [spec] };
            }
            const frame = encodeReply(spec, 2);
            assert.equal(frame.length, entry.expect.frameLen);
            const decoded = decodeReply(frame);
            assert.equal(decoded.consumed, entry.expect.consumed);
            return { frameLen: frame.length, depth: entry.depth };
        }
        case 'stream': {
            const frames = [];
            for (let index = 0; index < entry.count; index += 1) {
                frames.push(encodeCommand([Buffer.from('SET'), Buffer.from(`k${index}`), Buffer.from(`v${index}`)]));
            }
            const stream = Buffer.concat(frames);
            let offset = 0;
            const started = Date.now();
            let last = null;
            while (offset < stream.length) {
                const decoded = decodeCommand(stream.subarray(offset));
                assert.notEqual(decoded, null);
                offset += decoded.consumed;
                last = decoded.args;
            }
            const decodeMs = Date.now() - started;
            assert.equal(offset, entry.expect.totalConsumed);
            assert.equal(last[0].toString(), 'SET');
            assert.equal(last[1].toString(), entry.expect.lastKey);
            assert.equal(last[2].toString(), entry.expect.lastValue);
            return { decodeMs, totalConsumed: offset };
        }
        case 'reply-stream': {
            const stream = Buffer.concat(Array.from({ length: entry.count }, () => Buffer.from('+OK\r\n')));
            let offset = 0;
            const started = Date.now();
            while (offset < stream.length) {
                const decoded = decodeReply(stream.subarray(offset));
                assert.notEqual(decoded, null);
                offset += decoded.consumed;
            }
            const decodeMs = Date.now() - started;
            assert.equal(offset, entry.expect.totalConsumed);
            return { decodeMs, totalConsumed: offset };
        }
        case 'incr': {
            const directory = temporaryDir();
            const store = new NativeStore(directory);
            if (entry.seed > 0) {
                const keys = [];
                const values = [];
                for (let index = 0; index < entry.seed; index += 1) {
                    keys.push(Buffer.from(`${entry.prefix}${String(index).padStart(6, '0')}`));
                    values.push(Buffer.from(`v${index}`));
                }
                store.setMany(0, keys, values);
            }
            const started = Date.now();
            let last = null;
            for (let index = 0; index < entry.count; index += 1) {
                last = store.incrBy(0, Buffer.from('counter'), 1);
            }
            const writeMs = Date.now() - started;
            const flushStarted = Date.now();
            store.flush();
            const flushMs = Date.now() - flushStarted;
            assert.equal(last.value, entry.expect.value);
            assert.equal(store.get(0, Buffer.from('counter')).toString(), String(entry.expect.value));
            const reopened = Date.now();
            const again = new NativeStore(directory);
            const persisted = again.get(0, Buffer.from('counter'));
            const reopenMs = Date.now() - reopened;
            assert.equal(persisted.toString(), String(entry.expect.value));
            assert.ok(writeMs < 120_000 && flushMs < 120_000 && reopenMs < 120_000);
            return { writeMs, flushMs, reopenMs, value: last.value, persisted: true };
        }
        default:
            throw new Error(`unsupported stress kind ${entry.kind}`);
    }
}

for (const entry of loadCases()) {
    if (entry.sides !== undefined && !entry.sides.includes('ts')) {
        continue;
    }
    test(entry.id, () => {
        const started = Date.now();
        let observed;
        try {
            observed = runCase(entry);
            observations.push({ id: entry.id, face: entry.face, ok: true, ms: Date.now() - started, observed });
        }
        catch (cause) {
            observations.push({
                id: entry.id,
                face: entry.face,
                ok: false,
                ms: Date.now() - started,
                observed,
                error: String((cause && cause.message) || cause),
            });
            throw cause;
        }
    });
}
