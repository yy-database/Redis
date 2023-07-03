#!/usr/bin/env node
//! Replays conformance cases against a real Redis instance.
//!
//! The reader below is a self-contained RESP parser so the oracle never leans on
//! this repository's codec. Set `REDIS_ORACLE_HOST` and `REDIS_ORACLE_PORT` to
//! point at the instance under test.

import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';

const HOST = process.env.REDIS_ORACLE_HOST ?? '127.0.0.1';
const PORT = Number(process.env.REDIS_ORACLE_PORT ?? 6379);
const ROOT = process.env.REDIS_ORACLE_ROOT ?? process.cwd();
const TABLES = process.argv.slice(2).filter(argument => !argument.startsWith('--'));
const PROTOCOL = Number((process.argv.find(argument => argument.startsWith('--protocol=') ?? '') ?? '').split('=')[1] ?? 2);

/** Parses one RESP frame starting at `offset`, returning the frame and the next offset. */
function parseFrame(bytes, offset) {
    const prefix = String.fromCharCode(bytes[offset]);
    const lineEnd = bytes.indexOf('\r\n', offset);
    if (lineEnd === -1) throw new Error('truncated RESP frame');
    const line = bytes.subarray(offset + 1, lineEnd).toString('utf8');
    const next = lineEnd + 2;
    switch (prefix) {
        case '+': return [{ kind: 'simple', value: line }, next];
        case '-': return [{ kind: 'error', value: line }, next];
        case ':': return [{ kind: 'int', value: Number(line) }, next];
        case '$': {
            const length = Number(line);
            if (length === -1) return [{ kind: 'null', value: null }, next];
            const body = bytes.subarray(next, next + length);
            return [{ kind: 'bulk', value: body.toString('utf8'), bytes: body }, next + length + 2];
        }
        case '*': {
            const count = Number(line);
            if (count === -1) return [{ kind: 'null-array', value: null }, next];
            const items = [];
            let cursor = next;
            for (let index = 0; index < count; index += 1) {
                const [item, after] = parseFrame(bytes, cursor);
                items.push(item);
                cursor = after;
            }
            return [{ kind: 'array', value: items }, cursor];
        }
        case '_': return [{ kind: 'null', value: null }, next];
        case '#': return [{ kind: 'bool', value: line === 't' }, next];
        case ',': return [{ kind: 'double', value: Number(line) }, next];
        case '(': return [{ kind: 'int', value: Number(line) }, next];
        case '%': {
            const count = Number(line);
            const pairs = [];
            let cursor = next;
            for (let index = 0; index < count; index += 1) {
                const [key, afterKey] = parseFrame(bytes, cursor);
                const [value, afterValue] = parseFrame(bytes, afterKey);
                pairs.push([key, value]);
                cursor = afterValue;
            }
            return [{ kind: 'map', value: pairs }, cursor];
        }
        case '>': {
            const count = Number(line);
            const items = [];
            let cursor = next;
            for (let index = 0; index < count; index += 1) {
                const [item, after] = parseFrame(bytes, cursor);
                items.push(item);
                cursor = after;
            }
            return [{ kind: 'push', value: items }, cursor];
        }
        default:
            throw new Error(`unsupported RESP prefix ${prefix}`);
    }
}

class Link {
    constructor(socket) {
        this.socket = socket;
        this.buffer = Buffer.alloc(0);
        this.waiter = null;
        socket.on('data', chunk => {
            this.buffer = Buffer.concat([this.buffer, chunk]);
            this.pump();
        });
    }

    /** Parses one buffered frame, `null` while the buffer still holds a partial frame. */
    take() {
        if (this.buffer.length === 0) return null;
        try {
            const [frame, next] = parseFrame(this.buffer, 0);
            this.buffer = this.buffer.subarray(next);
            return frame;
        }
        catch (error) {
            if (String(error.message).startsWith('truncated')) return null;
            throw error;
        }
    }

    pump() {
        while (this.waiter !== null) {
            const frame = this.take();
            if (frame === null) return;
            const resolve = this.waiter;
            this.waiter = null;
            resolve(frame);
        }
    }

    read(label = 'a reply') {
        const frame = this.take();
        if (frame !== null) return Promise.resolve(frame);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.waiter = null;
                reject(new Error(`timed out waiting for ${label}`));
            }, 10000);
            this.waiter = frame => {
                clearTimeout(timer);
                resolve(frame);
            };
        });
    }

    /** Frames one command without waiting for a reply. */
    write(parts) {
        const encoded = `*${parts.length}\r\n` + parts
            .map(part => `$${Buffer.byteLength(String(part))}\r\n${part}\r\n`)
            .join('');
        this.socket.write(encoded);
    }

    send(parts, label = parts[0]) {
        this.write(parts);
        return this.read(label);
    }

    close() {
        this.socket.end();
    }
}

async function open(count) {
    const links = [];
    for (let index = 0; index < count; index += 1) {
        const socket = connect({ host: HOST, port: PORT });
        await new Promise((resolve, reject) => {
            socket.once('connect', resolve);
            socket.once('error', reject);
        });
        links.push(new Link(socket));
    }
    return links;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Runs the multi-connection blocking scenario and prints what the server did. */
async function blockingScenario() {
    const links = await open(3);
    const [first, second, third] = links;
    for (const link of links) await link.send(['SELECT', '0']);
    await third.send(['FLUSHDB']);
    const observed = {};

    const parkedZero = first.send(['BLPOP', 'zq', '0']);
    await sleep(100);
    await third.send(['RPUSH', 'zq', 'w']);
    observed.zero_timeout = readBlockingPop(await parkedZero);

    const parkedFirst = first.send(['BLPOP', 'fq', '0']);
    await sleep(100);
    const parkedSecond = second.send(['BLPOP', 'fq', '0']);
    await sleep(100);
    await third.send(['RPUSH', 'fq', 'one', 'two']);
    observed.fifo = [readBlockingPop(await parkedFirst)[1], readBlockingPop(await parkedSecond)[1]];

    await third.send(['RPUSH', 'tq', 'a', 'b', 'c']);
    observed.brpop_tail = readBlockingPop(await second.send(['BRPOP', 'tq', '0']))[1];

    const parkedDestination = first.send(['BLPOP', 'dq', '0']);
    await sleep(100);
    const parkedMove = second.send(['BLMOVE', 'sq', 'dq', 'LEFT', 'RIGHT', '0']);
    await sleep(100);
    await third.send(['LPUSH', 'sq', 'moved']);
    observed.blmove_value = (await parkedMove).value;
    observed.blmove_wake = readBlockingPop(await parkedDestination);

    const started = Date.now();
    const timedOut = await first.send(['BLPOP', 'missing', '0.05']);
    observed.timeout_frame = timedOut.kind;
    observed.timeout_elapsed_ms = Date.now() - started;

    for (const link of links) link.close();
    console.log(JSON.stringify(observed, null, 2));
}

/** Reads a `[key, element]` pair from a blocking pop reply. */
function readBlockingPop(frame) {
    if (frame.kind !== 'array') return [frame.kind, null];
    return [frame.value[0].value, frame.value[1].value];
}

/** Runs a pub/sub scenario over four links and prints the frame shapes. */
async function pubsubScenario() {
    const links = await open(4);
    const [subscriber, publisher, plain, plainTwo] = links;
    for (const link of links) await link.send(['SELECT', '0']);
    if (PROTOCOL !== 2) {
        for (const link of links) await link.send(['HELLO', String(PROTOCOL)]);
    }
    const observed = { protocol: PROTOCOL };

    observed.publish_none = shape(await publisher.send(['PUBLISH', 'solo', 'nobody'], 'publish_none'));

    observed.pubsub_numsub_empty = shape(await plain.send(['PUBSUB', 'NUMSUB'], 'numsub empty'));
    observed.pubsub_channels_empty = shape(await plain.send(['PUBSUB', 'CHANNELS'], 'channels empty'));
    observed.pubsub_numpat_zero = shape(await plain.send(['PUBSUB', 'NUMPAT'], 'numpat zero'));
    observed.pubsub_unknown = shape(await plain.send(['PUBSUB', 'BOGUS'], 'pubsub unknown'));

    subscriber.write(['SUBSCRIBE', 'ch', 'ch2']);
    observed.subscribe = [shape(await subscriber.read('subscribe ch')), shape(await subscriber.read('subscribe ch2'))];
    subscriber.write(['SUBSCRIBE', 'ch']);
    observed.subscribe_duplicate = shape(await subscriber.read('subscribe duplicate'));
    observed.numsub = shape(await publisher.send(['PUBSUB', 'NUMSUB', 'ch', 'ch2', 'missing'], 'numsub'));
    observed.channels = shape(await publisher.send(['PUBSUB', 'CHANNELS'], 'channels'));

    observed.publish_one = shape(await publisher.send(['PUBLISH', 'ch', 'hello'], 'publish_one'));
    observed.message = shape(await subscriber.read('message'));

    observed.ping_while_subscribed = shape(await subscriber.send(['PING'], 'ping subscribed'));
    observed.restricted_get = shape(await subscriber.send(['GET', 'plain'], 'get subscribed'));

    subscriber.write(['UNSUBSCRIBE', 'ch']);
    observed.unsubscribe = shape(await subscriber.read('unsubscribe ch'));

    subscriber.write(['PSUBSCRIBE', 'news.*']);
    observed.psubscribe = shape(await subscriber.read('psubscribe'));
    observed.numpat = shape(await publisher.send(['PUBSUB', 'NUMPAT'], 'numpat'));

    observed.publish_pattern = shape(await publisher.send(['PUBLISH', 'news.tech', 'tick'], 'publish_pattern'));
    observed.pmessage = shape(await subscriber.read('pmessage'));
    observed.channels_with_pattern = shape(await publisher.send(['PUBSUB', 'CHANNELS', 'news.*'], 'channels pattern'));

    subscriber.write(['SUBSCRIBE', 'news.tech']);
    observed.resubscribe = shape(await subscriber.read('resubscribe'));
    observed.publish_both = shape(await publisher.send(['PUBLISH', 'news.tech', 'both'], 'publish_both'));
    observed.message_direct = shape(await subscriber.read('message direct'));
    observed.pmessage_then = shape(await subscriber.read('pmessage then'));

    subscriber.write(['PUNSUBSCRIBE', 'news.*']);
    observed.punsubscribe = shape(await subscriber.read('punsubscribe'));

    observed.unsubscribe_when_none = shape(await plain.send(['UNSUBSCRIBE'], 'unsubscribe idle'));
    observed.punsubscribe_when_none = shape(await plainTwo.send(['PUNSUBSCRIBE'], 'punsubscribe idle'));

    observed.subscribe_no_args = shape(await publisher.send(['SUBSCRIBE'], 'subscribe no args'));
    observed.publish_after = shape(await publisher.send(['PUBLISH', 'news.tech', 'late'], 'publish_after'));
    observed.message_after = shape(await subscriber.read('message after'));
    observed.reset = shape(await subscriber.send(['RESET'], 'reset'));
    observed.get_after_reset = shape(await subscriber.send(['GET', 'plain'], 'get after reset'));

    for (const link of links) link.close();
    console.log(JSON.stringify(observed, null, 2));
}

/** Reduces one parsed frame to its kind and payload, recursively. */
function shape(frame) {
    if (frame.kind === 'array' || frame.kind === 'push') {
        return { kind: frame.kind, value: frame.value.map(shape) };
    }
    if (frame.kind === 'map') {
        return { kind: 'map', value: frame.value.map(([key, value]) => [shape(key), shape(value)]) };
    }
    return { kind: frame.kind, value: frame.value };
}

async function main() {
    if (TABLES.includes('pubsub-scenario')) {
        await pubsubScenario();
        return;
    }
    if (TABLES.includes('blocking-scenario')) {
        await blockingScenario();
        return;
    }
    const socket = connect({ host: HOST, port: PORT });
    await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('error', reject);
    });
    const link = new Link(socket);
    const banner = await link.send(['PING']);
    if (PROTOCOL !== 2) await link.send(['HELLO', String(PROTOCOL)]);

    const problems = [];
    let checked = 0;
    for (const table of TABLES.length > 0 ? TABLES : ['blocking-ops']) {
        const payload = JSON.parse(readFileSync(join(ROOT, 'tests', 'cases', `${table}.json`), 'utf8'));
        for (const entry of payload.cases) {
            if (entry.op === 'dispatch') {
                // `RESET` drops subscriptions in the real server and returns the
                // connection to RESP2, so a case cannot leak into the next one.
                await link.send(['RESET']);
                await link.send(['SELECT', String(entry.db ?? 0)]);
                await link.send(['FLUSHDB']);
                const outcome = await replayDispatch(link, entry, 2);
                checked += 1;
                for (const mismatch of outcome) problems.push(`${table}/${entry.id}: ${mismatch}`);
                continue;
            }
            await link.send(['SELECT', String(entry.db ?? 0)]);
            await link.send(['FLUSHDB']);
            for (const step of entry.setup ?? []) {
                for (const command of setupCommands(step)) await link.send(command);
            }
            const reply = await link.send(entry.argsText);
            checked += 1;
            const mismatch = compareReply(entry.reply, reply);
            if (mismatch !== null) problems.push(`${table}/${entry.id}: reply ${mismatch}`);
            for (const step of entry.effect ?? []) {
                const diff = await checkEffect(link, step);
                if (diff !== null) problems.push(`${table}/${entry.id}: effect ${diff}`);
            }
        }
    }
    link.close();
    if (banner.kind !== 'simple') console.log(`note: unexpected banner ${JSON.stringify(banner)}`);
    if (problems.length > 0) {
        console.log(`live oracle disagreed on ${problems.length} check(s):`);
        for (const problem of problems) console.log(`  ${problem}`);
        process.exitCode = 1;
        return;
    }
    console.log(`live oracle: ${checked} case(s) replayed against ${HOST}:${PORT}, 0 mismatches`);
}

/** Replays a multi-step dispatcher case, comparing replies and push frames. */
async function replayDispatch(link, entry, initialProtocol) {
    const problems = [];
    let protocol = initialProtocol;
    for (const step of entry.steps) {
        if (step.protocol !== undefined && step.protocol !== protocol) {
            await link.send(['HELLO', String(step.protocol)]);
            protocol = step.protocol;
        }
        if (step.frames === undefined) {
            const reply = await link.send(step.argsText);
            const mismatch = compareReply(step.reply, reply, protocol);
            if (mismatch !== null) problems.push(`${step.argsText.join(' ')}: reply ${mismatch}`);
            if (step.argsText[0].toUpperCase() === 'RESET') protocol = 2;
            continue;
        }
        link.write(step.argsText);
        for (const [index, expected] of step.frames.entries()) {
            const frame = await link.read(`${step.argsText[0]} frame ${index}`);
            const mismatch = compareFrame(expected, frame, protocol);
            if (mismatch !== null) problems.push(`${step.argsText.join(' ')} frame ${index}: ${mismatch}`);
        }
    }
    return problems;
}

/** Compares one push specification with a frame; RESP2 answers it as a plain array. */
function compareFrame(expected, actual, protocol) {
    if (expected.type !== 'push') {
        return compareReply(expected, actual);
    }
    const kind = protocol >= 3 ? 'push' : 'array';
    if (actual.kind !== kind) {
        return `expected a ${kind}, read ${describe(actual)}`;
    }
    if (actual.value.length !== expected.value.length) {
        return `expected ${expected.value.length} element(s), read ${actual.value.length}`;
    }
    for (let index = 0; index < expected.value.length; index += 1) {
        const inner = compareReply(expected.value[index], actual.value[index], protocol);
        if (inner !== null) return `element ${index}: ${inner}`;
    }
    return null;
}

/** Replays one setup step with the commands a client would issue. */
function setupCommands(step) {
    const key = Buffer.from(step.keyHex, 'hex').toString('utf8');
    const body = Buffer.from(step.valueHex ?? '', 'hex');
    const commands = [];
    if (step.call === 'set') {
        commands.push(['SET', key, body.toString('utf8')]);
    }
    else if (step.kind === '') commands.push(['SET', key, body.toString('utf8')]);
    else if (step.kind === 'hash') {
        const chunks = decodeChunks(body);
        const command = ['HSET', key];
        for (let index = 0; index < chunks.length; index += 2) {
            command.push(chunks[index].toString(), chunks[index + 1].toString());
        }
        commands.push(command);
    }
    else if (step.kind === 'list') commands.push(['RPUSH', key, ...decodeChunks(body).map(item => item.toString())]);
    else if (step.kind === 'set') commands.push(['SADD', key, ...decodeChunks(body).map(item => item.toString())]);
    else if (step.kind === 'zset') {
        const command = ['ZADD', key];
        for (const [member, score] of decodeZSet(body)) command.push(String(score), member.toString());
        commands.push(command);
    }
    else throw new Error(`unsupported setup kind ${step.kind}`);
    if (step.expiresAt !== undefined) commands.push(['PEXPIREAT', key, String(step.expiresAt)]);
    return commands;
}

/** Decodes the shard chunk framing used by hash, list and set bodies. */
function decodeChunks(body) {
    const chunks = [];
    let offset = 0;
    while (offset < body.length) {
        const length = body.readUInt32LE(offset);
        offset += 4;
        chunks.push(body.subarray(offset, offset + length));
        offset += length;
    }
    return chunks;
}

function decodeZSet(body) {
    const count = body.readUInt32LE(0);
    const entries = [];
    let offset = 4;
    for (let index = 0; index < count; index += 1) {
        const length = body.readUInt32LE(offset);
        offset += 4;
        const member = body.subarray(offset, offset + length);
        offset += length;
        entries.push([member, body.readDoubleLE(offset)]);
        offset += 8;
    }
    return entries;
}

/** Compares one expected reply spec with the frame the real server sent. */
function compareReply(expected, actual, protocol = PROTOCOL) {
    if (expected.type === 'null-array') {
        // RESP3 has no null array, so the server answers `_` instead of `*-1`.
        const kind = protocol >= 3 ? 'null' : 'null-array';
        return actual.kind === kind ? null : `expected a ${kind === 'null' ? 'null' : 'null array'}, read ${describe(actual)}`;
    }
    if (expected.type === 'null') {
        return actual.kind === 'null' ? null : `expected null, read ${describe(actual)}`;
    }
    if (expected.type === 'error') {
        if (actual.kind !== 'error') return `expected an error, read ${describe(actual)}`;
        return actual.value === expected.value ? null : `expected ${JSON.stringify(expected.value)}, read ${JSON.stringify(actual.value)}`;
    }
    if (expected.type === 'simple') {
        return actual.value === expected.value ? null : `expected ${JSON.stringify(expected.value)}, read ${describe(actual)}`;
    }
    if (expected.type === 'int') {
        return actual.kind === 'int' && actual.value === expected.value ? null : `expected ${expected.value}, read ${describe(actual)}`;
    }
    if (expected.type === 'bulk') {
        const text = Buffer.from(expected.bytes).toString('utf8');
        return actual.kind === 'bulk' && actual.value === text ? null : `expected ${JSON.stringify(text)}, read ${describe(actual)}`;
    }
    if (expected.type === 'array') {
        if (actual.kind !== 'array') return `expected an array, read ${describe(actual)}`;
        if (actual.value.length !== expected.value.length) {
            return `expected ${expected.value.length} element(s), read ${actual.value.length}`;
        }
        for (let index = 0; index < expected.value.length; index += 1) {
            const inner = compareReply(expected.value[index], actual.value[index], protocol);
            if (inner !== null) return `element ${index}: ${inner}`;
        }
        return null;
    }
    throw new Error(`unsupported reply spec ${expected.type}`);
}

function describe(frame) {
    if (frame.kind === 'bulk') return JSON.stringify(frame.value);
    if (frame.kind === 'array') return `[${frame.value.map(describe).join(', ')}]`;
    if (frame.kind === 'error') return `error ${JSON.stringify(frame.value)}`;
    return `${frame.kind} ${JSON.stringify(frame.value)}`;
}

/** Replays one post-state check and compares it with the expectation. */
async function checkEffect(link, step) {
    const key = Buffer.from(step.keyHex, 'hex').toString('utf8');
    if (step.call === 'exists_kind') {
        const reply = await link.send(['TYPE', key]);
        const expected = step.expect.bool
            ? (step.kind === '' ? 'string' : step.kind)
            : 'none';
        return reply.value === expected ? null : `TYPE expected ${expected}, read ${describe(reply)}`;
    }
    if (step.call === 'deadline_kind') {
        const reply = await link.send(['PTTL', key]);
        return reply.kind === 'int' && reply.value > 0 ? null : `PTTL expected a live expiry, read ${describe(reply)}`;
    }
    if (step.call !== 'get_kind') throw new Error(`unsupported effect step ${step.call}`);
    const reply = await link.send(['LRANGE', key, '0', '-1']);
    if (step.expect === null) {
        return reply.kind === 'array' && reply.value.length === 0 ? null : `expected an empty list, read ${describe(reply)}`;
    }
    const expected = decodeChunks(Buffer.from(step.expect.bytes, 'hex')).map(chunk => chunk.toString('utf8'));
    const read = reply.kind === 'array' ? reply.value.map(frame => frame.value) : [];
    return JSON.stringify(read) === JSON.stringify(expected)
        ? null
        : `LRANGE expected ${JSON.stringify(expected)}, read ${JSON.stringify(read)}`;
}

await main();
