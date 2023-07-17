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

    // XREAD parks on a stream and must return the entries appended after it parked.
    const problems = [];
    const expectRows = (name, rows, expected) => {
        const actual = JSON.stringify(rows);
        if (actual !== JSON.stringify(expected)) {
            problems.push(`${name}: expected ${JSON.stringify(expected)}, read ${JSON.stringify(rows)}`);
        }
    };

    await third.send(['XADD', 'xr', '1-1', 'seed', '1']);
    const parkedRead = first.send(['XREAD', 'BLOCK', '0', 'STREAMS', 'xr', '$']);
    await sleep(100);
    await third.send(['XADD', 'xr', '2-2', 'next', '2']);
    observed.xread_dollar = readStreamRows(await parkedRead);
    expectRows('xread dollar', observed.xread_dollar, [{ key: 'xr', ids: ['2-2'] }]);

    const parkedMulti = first.send(['XREAD', 'BLOCK', '0', 'STREAMS', 'm1', 'm2', '$', '$']);
    await sleep(100);
    await third.send(['XADD', 'm2', '1-1', 'k', 'v']);
    observed.xread_multi = readStreamRows(await parkedMulti);
    expectRows('xread multi', observed.xread_multi, [{ key: 'm2', ids: ['1-1'] }]);

    const readTimeoutAt = Date.now();
    observed.xread_timeout = readStreamRows(await first.send(['XREAD', 'BLOCK', '40', 'STREAMS', 'xmiss', '0']));
    observed.xread_timeout_elapsed_ms = Date.now() - readTimeoutAt;
    if (observed.xread_timeout.length !== 0) problems.push(`xread timeout returned rows ${JSON.stringify(observed.xread_timeout)}`);
    if (observed.xread_timeout_elapsed_ms < 20) problems.push(`xread timeout returned after ${observed.xread_timeout_elapsed_ms}ms`);

    const parkedTrimmed = first.send(['XREAD', 'BLOCK', '80', 'STREAMS', 'xtrimq', '0']);
    await sleep(120);
    await third.send(['XADD', 'xtrimq', 'MAXLEN', '0', '1-1', 'f', 'v']);
    observed.xread_trimmed = readStreamRows(await parkedTrimmed);
    expectRows('xread trimmed append', observed.xread_trimmed, []);

    await third.send(['XADD', 'xs', '7-7', 'x', '1']);
    const parkedSnapshot = first.send(['XREAD', 'BLOCK', '0', 'STREAMS', 'xs', '$']);
    await sleep(100);
    await third.send(['XADD', 'xs', '8-8', 'y', '2']);
    observed.xread_snapshot = readStreamRows(await parkedSnapshot);
    expectRows('xread dollar snapshot', observed.xread_snapshot, [{ key: 'xs', ids: ['8-8'] }]);

    const plusAt = Date.now();
    observed.xread_plus = readStreamRows(await first.send(['XREAD', 'BLOCK', '0', 'STREAMS', 'xr', '+']));
    observed.xread_plus_elapsed_ms = Date.now() - plusAt;
    expectRows('xread plus', observed.xread_plus, [{ key: 'xr', ids: ['2-2'] }]);
    if (observed.xread_plus_elapsed_ms >= 100) problems.push(`xread plus parked for ${observed.xread_plus_elapsed_ms}ms`);

    for (const link of links) link.close();
    console.log(JSON.stringify(observed, null, 2));
    if (problems.length > 0) {
        for (const problem of problems) console.log(`blocking scenario: ${problem}`);
        process.exitCode = 1;
    }
}

/** Reads the `[key, entries]` rows of an `XREAD` reply. */
function readStreamRows(frame) {
    if (frame.kind !== 'array') return [];
    return frame.value.map(row => ({
        key: row.value[0].value,
        ids: row.value[1].value.map(entry => entry.value[0].value),
    }));
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

/**
 * Confirms the gate can still go red before it reports anything green.
 *
 * A replay script that silently stops checking is worse than no script at all, so
 * startup proves the three mechanisms it relies on: setup commands reach the
 * server, an empty multibulk leaves no reply behind, `SELECT` scopes the
 * following writes, and the comparator rejects a known mismatch.
 */
async function selfCheck() {
    const problems = [];
    const expect = (label, ok, detail) => {
        if (!ok) problems.push(`${label}: ${detail}`);
    };
    const [probe] = await open(1);
    await probe.send(['SELECT', '0']);
    await probe.send(['FLUSHALL']);

    // setup 步骤必须真的落到服务端，否则每个用例的前置状态都是假的。
    await probe.send(['SELECT', '3']);
    const key = 'gate:selfcheck';
    const step = {
        kind: '',
        keyHex: Buffer.from(key).toString('hex'),
        valueHex: Buffer.from('here').toString('hex'),
    };
    const setupReplies = [];
    for (const command of setupCommands(step)) setupReplies.push(await probe.send(command));
    const written = await probe.send(['GET', key]);
    expect('setup applies', setupReplies.every(reply => reply.kind === 'simple' && reply.value === 'OK') && written.kind === 'bulk' && written.value === 'here', describe(written));

    // db 切换必须隔离写入，回放时才能放心在每个用例开头 FLUSHALL + SELECT。
    await probe.send(['SELECT', '0']);
    const outside = await probe.send(['GET', key]);
    expect('SELECT scopes writes', outside.kind === 'null', describe(outside));

    // 没有 reply 的步骤是空多批量，服务端不回帧；紧跟的 PING 必须照常对上。
    probe.write([]);
    const afterSilent = await probe.send(['PING']);
    expect('empty multibulk stays silent', afterSilent.kind === 'simple' && afterSilent.value === 'PONG', describe(afterSilent));

    // QUIT 会断开连接，回放必须换一条链路继续。
    const quit = await probe.send(['QUIT']);
    expect('QUIT replies before closing', quit.kind === 'simple' && quit.value === 'OK', describe(quit));
    probe.close();
    const [reopened] = await open(1);
    const afterQuit = await reopened.send(['PING']);
    expect('connection reopens after close', afterQuit.kind === 'simple' && afterQuit.value === 'PONG', describe(afterQuit));
    reopened.close();

    // 已知会失败的探针：比较器若认不出故意写错的期望，整道门禁就是假的。
    const acceptsMatch = compareReply({ type: 'simple', value: 'PONG' }, { kind: 'simple', value: 'PONG' });
    expect('comparator accepts a match', acceptsMatch === null, String(acceptsMatch));
    const rejectsMismatch = compareReply({ type: 'simple', value: 'PONG' }, { kind: 'simple', value: 'NOT-PONG' });
    expect('comparator rejects a known mismatch', rejectsMismatch !== null, 'comparator returned null on a deliberate mismatch');

    if (problems.length > 0) {
        console.log('live oracle self-check failed, refusing to report results:');
        for (const problem of problems) console.log(`  ${problem}`);
        throw new Error('self-check failed');
    }
    console.log(`live oracle self-check: setup, silent step, close handling, db switch and comparator all behave`);
}

async function main() {
    await selfCheck();
    if (TABLES.includes('pubsub-scenario')) {
        await pubsubScenario();
        return;
    }
    if (TABLES.includes('blocking-scenario')) {
        await blockingScenario();
        return;
    }
    const openLink = async () => {
        const socket = connect({ host: HOST, port: PORT });
        await new Promise((resolve, reject) => {
            socket.once('connect', resolve);
            socket.once('error', reject);
        });
        const link = new Link(socket);
        if (PROTOCOL !== 2) await link.send(['HELLO', String(PROTOCOL)]);
        return link;
    };
    let link = await openLink();
    const banner = await link.send(['PING']);

    // Each shared case starts from an empty store, so every database is cleared
    // and each setup step runs in the database it declares.
    const applySetup = async entry => {
        for (const step of entry.setup ?? []) {
            await link.send(['SELECT', String(step.db ?? entry.db ?? 0)]);
            for (const command of setupCommands(step)) await link.send(command);
        }
        await link.send(['SELECT', String(entry.db ?? 0)]);
    };
    const problems = [];
    let checked = 0;
    let storeOnly = 0;
    for (const table of TABLES.length > 0 ? TABLES : ['blocking-ops']) {
        const payload = JSON.parse(readFileSync(join(ROOT, 'tests', 'cases', `${table}.json`), 'utf8'));
        for (const entry of payload.cases) {
            if (entry.op === 'store') {
                // Storage-only cases have no wire command to replay.
                storeOnly += 1;
                continue;
            }
            if (entry.op !== 'command' && entry.op !== 'dispatch') {
                throw new Error(`${table}/${entry.id}: unsupported op ${entry.op}`);
            }
            if (entry.op === 'dispatch') {
                // `RESET` drops subscriptions in the real server and returns the
                // connection to RESP2, so a case cannot leak into the next one.
                await link.send(['RESET']);
                await link.send(['SELECT', String(entry.db ?? 0)]);
                await link.send(['FLUSHALL']);
                await applySetup(entry);
                const outcome = await replayDispatch(link, entry, 2);
                checked += 1;
                for (const mismatch of outcome.problems) problems.push(`${table}/${entry.id}: ${mismatch}`);
                // Cases that close the connection cannot reuse the link.
                if (outcome.closed) {
                    link.close();
                    link = await openLink();
                }
                continue;
            }
            await link.send(['SELECT', String(entry.db ?? 0)]);
            await link.send(['FLUSHALL']);
            await applySetup(entry);
            if (entry.scanContract !== undefined) {
                checked += 1;
                for (const problem of await replayScanContract(link, entry)) {
                    problems.push(`${table}/${entry.id}: ${problem}`);
                }
                continue;
            }
            const reply = await link.send(entry.argsText);
            checked += 1;
            const mismatch = compareReply(entry.reply, reply, PROTOCOL, entry.replyUnordered === true);
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
    console.log(`live oracle: ${checked} case(s) replayed against ${HOST}:${PORT}, 0 mismatches, ${storeOnly} store-only case(s) skipped`);
}

/** Replays a multi-step dispatcher case, comparing replies and push frames. */
async function replayDispatch(link, entry, initialProtocol) {
    const problems = [];
    let protocol = initialProtocol;
    let closed = false;
    for (const step of entry.steps) {
        if (step.protocol !== undefined && step.protocol !== protocol) {
            await link.send(['HELLO', String(step.protocol)]);
            protocol = step.protocol;
        }
        if (step.frames === undefined) {
            if (step.reply === undefined) {
                // A step without a reply is a request the server ignores, such as
                // the empty multibulk that leaves no frame behind.
                link.write(step.argsText);
                continue;
            }
            const reply = await link.send(step.argsText);
            const mismatch = compareReply(step.reply, reply, protocol);
            if (mismatch !== null) problems.push(`${step.argsText.join(' ')}: reply ${mismatch}`);
            if (step.argsText[0].toUpperCase() === 'RESET') protocol = 2;
            if (step.close === true) closed = true;
            continue;
        }
        link.write(step.argsText);
        for (const [index, expected] of step.frames.entries()) {
            const frame = await link.read(`${step.argsText[0]} frame ${index}`);
            const mismatch = compareFrame(expected, frame, protocol);
            if (mismatch !== null) problems.push(`${step.argsText.join(' ')} frame ${index}: ${mismatch}`);
        }
    }
    return { problems, closed };
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
    else if (step.kind === 'stream') {
        const { last, entries } = decodeStream(body);
        for (const entry of entries) {
            const command = ['XADD', key, `${entry.ms}-${entry.seq}`];
            for (const [field, value] of entry.fields) command.push(field, value);
            commands.push(command);
        }
        if (entries.length === 0) commands.push(['XADD', key, '1-0', 'gate', 'seed'], ['XTRIM', key, 'MAXLEN', '0']);
        const tail = entries.length === 0 ? '1-0' : `${entries[entries.length - 1].ms}-${entries[entries.length - 1].seq}`;
        if (tail !== `${last.ms}-${last.seq}`) commands.push(['XSETID', key, `${last.ms}-${last.seq}`]);
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

/** Decodes the stream body: top id, then one id plus field pairs per entry. */
function decodeStream(body) {
    const last = { ms: body.readBigUInt64LE(0), seq: body.readBigUInt64LE(8) };
    const count = body.readUInt32LE(16);
    const entries = [];
    let offset = 20;
    for (let index = 0; index < count; index += 1) {
        const ms = body.readBigUInt64LE(offset);
        offset += 8;
        const seq = body.readBigUInt64LE(offset);
        offset += 8;
        const fieldCount = body.readUInt32LE(offset);
        offset += 4;
        const fields = [];
        for (let pair = 0; pair < fieldCount; pair += 1) {
            const fieldLength = body.readUInt32LE(offset);
            offset += 4;
            const field = body.subarray(offset, offset + fieldLength).toString();
            offset += fieldLength;
            const valueLength = body.readUInt32LE(offset);
            offset += 4;
            const value = body.subarray(offset, offset + valueLength).toString();
            offset += valueLength;
            fields.push([field, value]);
        }
        entries.push({ ms, seq, fields });
    }
    return { last, entries };
}

/** Renders one expected reply spec the way {@link describe} renders a frame. */
function describeSpec(spec) {
    if (spec.type === 'bulk') return JSON.stringify(Buffer.from(spec.bytes).toString('utf8'));
    if (spec.type === 'array') return `[${spec.value.map(describeSpec).join(', ')}]`;
    if (spec.type === 'error') return `error ${JSON.stringify(spec.value)}`;
    if (spec.type === 'simple') return `simple ${JSON.stringify(spec.value)}`;
    if (spec.type === 'int') return `int ${JSON.stringify(spec.value)}`;
    return spec.type;
}

/** Reads one scan page from the server, `{cursor, elements}` or `{problem}`. */
async function readScanPage(link, entry, args) {
    const reply = await link.send(args);
    if (reply.kind !== 'array' || reply.value.length !== 2) {
        return { problem: `expected a cursor and an element array, read ${describe(reply)}` };
    }
    const [cursorFrame, elementsFrame] = reply.value;
    if (cursorFrame.kind !== 'bulk' || !/^\d+$/.test(cursorFrame.value)) {
        return { problem: `expected a canonical cursor, read ${describe(cursorFrame)}` };
    }
    if (elementsFrame.kind !== 'array') {
        return { problem: `expected an element array, read ${describe(elementsFrame)}` };
    }
    const elements = [];
    for (const frame of elementsFrame.value) {
        if (frame.kind !== 'bulk') return { problem: `expected bulk elements, read ${describe(frame)}` };
        elements.push(Buffer.from(frame.value, 'utf8').toString('hex'));
    }
    return { cursor: cursorFrame.value, elements };
}

/**
 * Replays one scan case as a cursor contract.
 *
 * The server's cursor numbers index its own hash table buckets, so only the
 * semantics are comparable: every page stays inside the declared universe,
 * cursor 0 ends the iteration, and replaying from cursor 0 reaches every member
 * at least once (repeats across pages are allowed).
 */
async function replayScanContract(link, entry) {
    const problems = [];
    const checkPage = (page, label) => {
        if (page.problem !== undefined) {
            problems.push(`${label} ${page.problem}`);
            return false;
        }
        const seen = new Set();
        for (const element of page.elements) {
            if (!entry.scanContract.universe.includes(element)) {
                problems.push(`${label} returned '${element}' outside the declared universe`);
            }
            if (seen.has(element)) problems.push(`${label} repeated '${element}' inside one page`);
            seen.add(element);
        }
        return true;
    };
    checkPage(await readScanPage(link, entry, entry.argsText), 'the requested page');
    const args = entry.argsText.slice();
    const index = entry.scanContract.cursorIndex;
    args[index] = '0';
    const collected = new Set();
    for (let step = 0; step < 1000; step += 1) {
        const page = await readScanPage(link, entry, args);
        if (!checkPage(page, 'a traversal page')) break;
        for (const element of page.elements) collected.add(element);
        if (page.cursor === '0') {
            for (const element of entry.scanContract.universe) {
                if (!collected.has(element)) {
                    problems.push(`traversal from cursor 0 never returned '${element}'`);
                }
            }
            return problems;
        }
        args[index] = page.cursor;
    }
    problems.push('traversal never reached cursor 0');
    return problems;
}

/** Compares one expected reply spec with the frame the real server sent. */
function compareReply(expected, actual, protocol = PROTOCOL, unordered = false) {
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
        if (unordered) {
            // Set-returning commands inherit the server's hash table order.
            const wanted = expected.value.map(describeSpec).sort();
            const seen = actual.value.map(describe).sort();
            return JSON.stringify(wanted) === JSON.stringify(seen)
                ? null
                : `expected members ${JSON.stringify(wanted)}, read ${JSON.stringify(seen)}`;
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
    if (step.call === 'size') {
        const reply = await link.send(['DBSIZE']);
        return reply.value === step.expect.int ? null : `DBSIZE expected ${step.expect.int}, read ${describe(reply)}`;
    }
    const key = Buffer.from(step.keyHex, 'hex').toString('utf8');
    if (step.call === 'exists_kind') {
        const reply = await link.send(['TYPE', key]);
        const target = step.kind === '' ? 'string' : step.kind;
        const present = reply.kind === 'simple' && reply.value === target;
        return present === step.expect.bool
            ? null
            : `TYPE expected ${step.expect.bool ? target : `not ${target}`}, read ${describe(reply)}`;
    }
    if (step.call === 'deadline_kind') {
        const reply = await link.send(['PTTL', key]);
        // A live expiry replaces the absolute deadline this repository stores.
        const observed = reply.kind === 'int' && reply.value > 0;
        const expected = step.expect !== null;
        return observed === expected
            ? null
            : `PTTL expected ${expected ? 'a live expiry' : 'no deadline'}, read ${describe(reply)}`;
    }
    if (step.call === 'deadline_set') {
        const reply = await link.send(['PTTL', key]);
        const observed = reply.kind === 'int' && reply.value >= 0;
        return observed === step.expect.bool
            ? null
            : `PTTL expected a deadline of ${step.expect.bool}, read ${describe(reply)}`;
    }
    if (step.call === 'get') {
        const expected = Buffer.from(step.expect.bytes, 'hex').toString('utf8');
        const reply = await link.send(['GET', key]);
        return reply.kind === 'bulk' && reply.value === expected
            ? null
            : `GET expected ${JSON.stringify(expected)}, read ${describe(reply)}`;
    }
    if (step.call !== 'get_kind') throw new Error(`unsupported effect step ${step.call}`);
    const target = step.kind === '' ? 'string' : step.kind;
    const typeReply = await link.send(['TYPE', key]);
    const live = typeReply.kind === 'simple' ? typeReply.value : 'none';
    const expectedEmpty = step.expect == null || step.expect.bytes === undefined;
    if (live !== target) {
        // The shard keeps one namespace per kind, so another kind occupying the
        // key is exactly the "this namespace is empty" case.
        return expectedEmpty ? null : `expected a ${target} value, but the key holds ${live}`;
    }
    if (step.kind === '' || step.kind === 'string') {
        const reply = await link.send(['GET', key]);
        if (expectedEmpty) {
            return reply.kind === 'null' ? null : `GET expected a missing string, read ${describe(reply)}`;
        }
        const expected = Buffer.from(step.expect.bytes, 'hex').toString('utf8');
        return reply.kind === 'bulk' && reply.value === expected
            ? null
            : `GET expected ${JSON.stringify(expected)}, read ${describe(reply)}`;
    }
    if (step.kind === 'hash') {
        const expected = expectedEmpty ? [] : (decodeChunks(Buffer.from(step.expect.bytes, 'hex')) ?? []).map(chunk => chunk.toString('utf8'));
        const reply = await link.send(['HGETALL', key]);
        const read = reply.kind === 'array' ? reply.value.map(frame => frame.value) : [];
        // Field order is a hash-table detail in the real server, so compare pairs.
        const pairs = flat => {
            const out = [];
            for (let index = 0; index + 1 < flat.length; index += 2) out.push([flat[index], flat[index + 1]]);
            return out.sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
        };
        return JSON.stringify(pairs(read)) === JSON.stringify(pairs(expected))
            ? null
            : `HGETALL expected ${JSON.stringify(expected)}, read ${JSON.stringify(read)}`;
    }
    if (step.kind === 'set') {
        const expected = expectedEmpty ? [] : (decodeChunks(Buffer.from(step.expect.bytes, 'hex')) ?? []).map(chunk => chunk.toString('utf8'));
        // The real server returns members in its own order, so compare as a set.
        expected.sort();
        const reply = await link.send(['SMEMBERS', key]);
        const read = reply.kind === 'array' ? reply.value.map(frame => frame.value) : [];
        read.sort();
        return JSON.stringify(read) === JSON.stringify(expected)
            ? null
            : `SMEMBERS expected ${JSON.stringify(expected)}, read ${JSON.stringify(read)}`;
    }
    if (step.kind === 'zset') {
        const expected = expectedEmpty ? [] : decodeZSet(Buffer.from(step.expect.bytes, 'hex'));
        const reply = await link.send(['ZRANGE', key, '0', '-1', 'WITHSCORES']);
        if (reply.kind !== 'array') return `ZRANGE expected an array, read ${describe(reply)}`;
        const read = [];
        for (let index = 0; index + 1 < reply.value.length; index += 2) {
            read.push([reply.value[index].value, Number(reply.value[index + 1].value)]);
        }
        const ordered = list => list.sort((left, right) => (left[1] - right[1])
            || (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
        const want = ordered(expected.map(([member, score]) => [member.toString('utf8'), score]));
        return JSON.stringify(ordered(read)) === JSON.stringify(want)
            ? null
            : `ZRANGE expected ${JSON.stringify(want)}, read ${JSON.stringify(read)}`;
    }
    if (step.kind === 'stream') {
        if (expectedEmpty) {
            const reply = await link.send(['XRANGE', key, '-', '+']);
            return reply.kind === 'array' && reply.value.length === 0
                ? null
                : `XRANGE expected no entries, read ${describe(reply)}`;
        }
        const expected = decodeStream(Buffer.from(step.expect.bytes, 'hex'));
        const reply = await link.send(['XRANGE', key, '-', '+']);
        const read = reply.kind === 'array'
            ? reply.value.map(entry => ({
                id: entry.value[0].value,
                fields: entry.value[1].value.map(item => item.value),
            }))
            : [];
        const want = expected.entries.map(entry => ({
            id: `${entry.ms}-${entry.seq}`,
            fields: entry.fields.flatMap(([field, value]) => [field, value]),
        }));
        if (JSON.stringify(read) !== JSON.stringify(want)) {
            return `XRANGE expected ${JSON.stringify(want)}, read ${JSON.stringify(read)}`;
        }
        const info = await link.send(['XINFO', 'STREAM', key]);
        if (info.kind !== 'array') return `XINFO expected an array, read ${describe(info)}`;
        let top = null;
        for (let index = 0; index + 1 < info.value.length; index += 2) {
            if (info.value[index].value === 'last-generated-id') top = info.value[index + 1].value;
        }
        const expectedTop = `${expected.last.ms}-${expected.last.seq}`;
        return top === expectedTop ? null : `XINFO last-generated-id expected ${expectedTop}, read ${JSON.stringify(top)}`;
    }
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
