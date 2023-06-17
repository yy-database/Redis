//! Command semantics composed on top of the native primitives.
//!
//! Every command is planned first and executed second, so a transaction can
//! reject a malformed command while queuing and replay only valid commands.

import { parseInteger } from './native.js';
import { array, bulk, error as replyError, integer, map, nullArray, nullReply, simple } from './reply.js';

const DATABASES = 16;

const integerError = () => replyError('ERR value is not an integer or out of range');
const wrongArity = name => replyError(`ERR wrong number of arguments for '${name}' command`);
const plainArity = () => replyError('ERR wrong number of arguments');

/** Value kinds of one logical key, in probe order. */
const KINDS = ['string', 'hash', 'list', 'set', 'zset'];
/** Storage namespace suffix of each value kind. */
const SUFFIX = { string: '', hash: 'hash', list: 'list', set: 'set', zset: 'zset' };
const WRONG_TYPE = 'WRONGTYPE Operation against a key holding the wrong kind of value';

const wrongType = () => replyError(WRONG_TYPE);

/** Kind currently holding `key`, or `null` when every kind namespace is empty. */
function kindOf(store, db, key) {
    for (const kind of KINDS) {
        if (store.existsKind(db, SUFFIX[kind], key)) return kind;
    }
    return null;
}

const MAX_CHUNK = 0xffffffff;

/**
 * Frames a sequence of byte chunks as `u32le length + body` pairs.
 *
 * The shard stores one opaque value per kind, so a hash is its field/value pairs
 * and a list its elements. `null` means the encoded length does not fit `u32`.
 */
function encodeChunks(chunks) {
    let total = 0;
    for (const chunk of chunks) {
        if (chunk.length > MAX_CHUNK) return null;
        total += 4 + chunk.length;
    }
    const body = Buffer.allocUnsafe(total);
    let offset = 0;
    for (const chunk of chunks) {
        body.writeUInt32LE(chunk.length, offset);
        offset += 4;
        chunk.copy(body, offset);
        offset += chunk.length;
    }
    return body;
}

/** Reads the chunks framed by {@link encodeChunks}, `null` when the body is malformed. */
function decodeChunks(body) {
    const chunks = [];
    let offset = 0;
    while (offset < body.length) {
        if (offset + 4 > body.length) return null;
        const length = body.readUInt32LE(offset);
        offset += 4;
        if (offset + length > body.length) return null;
        chunks.push(body.subarray(offset, offset + length));
        offset += length;
    }
    return chunks;
}

function encodeHash(fields) {
    return encodeChunks(fields.flatMap(([field, value]) => [field, value]));
}

function decodeHash(body) {
    const chunks = decodeChunks(body);
    if (chunks === null || chunks.length % 2 !== 0) return null;
    const fields = [];
    for (let index = 0; index < chunks.length; index += 2) {
        fields.push([chunks[index], chunks[index + 1]]);
    }
    return fields;
}

function encodeList(elements) {
    return encodeChunks(elements);
}

function decodeList(body) {
    return decodeChunks(body);
}

/** Set members share the list framing and keep insertion order. */
function encodeSet(members) {
    return encodeChunks(members);
}

function decodeSet(body) {
    return decodeChunks(body);
}

/**
 * Frames a sorted set as `u32 count` plus one `u32 length + member + f64 LE score` per entry.
 *
 * `null` means one member or the score array does not fit the storage layout.
 */
function encodeZSet(entries) {
    let total = 4;
    for (const [member] of entries) {
        if (member.length > MAX_CHUNK) return null;
        total += 4 + member.length + 8;
    }
    const body = Buffer.allocUnsafe(total);
    body.writeUInt32LE(entries.length, 0);
    let offset = 4;
    for (const [member, score] of entries) {
        body.writeUInt32LE(member.length, offset);
        offset += 4;
        member.copy(body, offset);
        offset += member.length;
        body.writeDoubleLE(score, offset);
        offset += 8;
    }
    return body;
}

function decodeZSet(body) {
    if (body.length < 4) {
        return null;
    }
    const count = body.readUInt32LE(0);
    const entries = [];
    let offset = 4;
    for (let index = 0; index < count; index += 1) {
        if (offset + 4 > body.length) return null;
        const length = body.readUInt32LE(offset);
        offset += 4;
        if (offset + length + 8 > body.length) return null;
        const member = body.subarray(offset, offset + length);
        offset += length;
        entries.push([member, body.readDoubleLE(offset)]);
        offset += 8;
    }
    return offset === body.length ? entries : null;
}

/**
 * Parses one ZADD score the way the gateway does.
 *
 * A decimal literal (optional sign, fraction and exponent) or an infinity word
 * is accepted. `NaN` and anything else is rejected, so a bad score never
 * reaches the shard.
 */
function parseScore(raw) {
    const value = text(raw).trim();
    if (/^[+-]?inf(?:inity)?$/i.test(value)) {
        return value.startsWith('-') ? -Infinity : Infinity;
    }
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) {
        return null;
    }
    return Number(value);
}

/** Ascending score order, ties broken by member bytes. */
function sortZSet(entries) {
    entries.sort((left, right) => (left[1] - right[1]) || Buffer.compare(left[0], right[0]));
}

/** Score text as the gateway writes it: the shortest decimal form, no trailing `.0`. */
function scoreText(score) {
    return String(score);
}

/** Live hash fields, `[]` when the hash is missing and `null` when the body is corrupt. */
function readHash(store, db, key) {
    const body = store.getKind(db, SUFFIX.hash, key);
    return body === null || body === undefined ? [] : decodeHash(body);
}

/** Live list elements, `[]` when the list is missing and `null` when the body is corrupt. */
function readList(store, db, key) {
    const body = store.getKind(db, SUFFIX.list, key);
    return body === null || body === undefined ? [] : decodeList(body);
}

/** Live set members, `[]` when the set is missing and `null` when the body is corrupt. */
function readSet(store, db, key) {
    const body = store.getKind(db, SUFFIX.set, key);
    return body === null || body === undefined ? [] : decodeSet(body);
}

/** Live sorted-set entries, `[]` when the key is missing and `null` when the body is corrupt. */
function readZSet(store, db, key) {
    const body = store.getKind(db, SUFFIX.zset, key);
    return body === null || body === undefined ? [] : decodeZSet(body);
}

/** Replaces one kind while carrying the deadline it already holds. */
function rewriteKind(store, db, kind, key, body) {
    const expiresAt = store.deadlineKind(db, SUFFIX[kind], key);
    store.setKind(db, SUFFIX[kind], key, body, expiresAt ?? null);
}

/** Drops every non-string representation, keeping one logical key per name. */
function dropOtherKinds(store, db, key) {
    for (const kind of KINDS) {
        if (kind !== 'string') store.deleteKind(db, SUFFIX[kind], key);
    }
}

function commandName(args) {
    return args[0].toString('utf8').toLowerCase();
}

function text(buffer) {
    return buffer.toString('utf8');
}

function secondsDeadline(seconds) {
    const milliseconds = seconds * 1000;
    return Number.isSafeInteger(milliseconds) ? milliseconds : null;
}

function millisecondsDeadline(milliseconds) {
    return Number.isSafeInteger(milliseconds) ? milliseconds : null;
}

/**
 * Builds a deadline factory for one expiry option.
 *
 * `ex` and `px` are relative to the moment the command runs, `exat` and `pxat`
 * are absolute unix timestamps. `null` means the amount overflows.
 */
function deadlineFactory(option, amount) {
    const relative = option === 'ex' || option === 'px';
    const seconds = option === 'ex' || option === 'exat';
    const scaled = seconds ? secondsDeadline(amount) : millisecondsDeadline(amount);
    if (scaled === null) {
        return null;
    }
    return () => (relative ? Date.now() + scaled : scaled);
}

function hello(protocol) {
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

/** Executes one command and returns the reply specification. */
export function execute(store, session, args) {
    if (args.length === 0) {
        return { reply: replyError('ERR Protocol error or request limit exceeded'), close: true };
    }
    const name = commandName(args);

    if (name === 'quit') {
        return args.length === 1 ? { reply: simple('OK'), close: true } : { reply: wrongArity('quit') };
    }
    if (name === 'hello') {
        return helloCommand(session, args);
    }
    if (name === 'multi') {
        if (args.length !== 1) {
            return { reply: wrongArity('multi') };
        }
        if (session.queued) {
            return { reply: replyError('ERR MULTI calls can not be nested') };
        }
        session.queued = [];
        return { reply: simple('OK') };
    }
    if (name === 'exec') {
        if (!session.queued) {
            return { reply: replyError('ERR EXEC without MULTI') };
        }
        const queued = session.queued;
        session.queued = null;
        return { reply: array(queued.map(run => run())) };
    }
    if (name === 'discard') {
        if (!session.queued) {
            return { reply: replyError('ERR DISCARD without MULTI') };
        }
        session.queued = null;
        return { reply: simple('OK') };
    }

    const planned = plan(store, session, name, args);
    if (planned.error) {
        return { reply: planned.error };
    }
    if (session.queued) {
        session.queued.push(planned.run);
        return { reply: simple('QUEUED') };
    }
    return { reply: planned.run() };
}

function helloCommand(session, args) {
    if (args.length > 2) {
        return { reply: replyError('ERR syntax error') };
    }
    const protocol = args.length === 2 ? parseInteger(args[1]) : session.protocol;
    if (protocol !== 2 && protocol !== 3) {
        return { reply: replyError('NOPROTO unsupported protocol version') };
    }
    session.protocol = protocol;
    return { reply: hello(protocol) };
}

function plan(store, session, name, args) {
    switch (name) {
        case 'ping':
            if (args.length > 2) return { error: wrongArity('ping') };
            return { run: () => (args.length === 2 ? bulk(args[1]) : simple('PONG')) };

        case 'echo':
            if (args.length !== 2) return { error: wrongArity('echo') };
            return { run: () => bulk(args[1]) };

        case 'select': {
            if (args.length !== 2) return { error: wrongArity('select') };
            const index = parseInteger(args[1]);
            if (index === null || index < 0 || index >= DATABASES) {
                return { error: replyError('ERR DB index is out of range') };
            }
            return { run: () => { session.db = index; return simple('OK'); } };
        }

        case 'client':
            return planClient(session, args);

        case 'get':
            if (args.length !== 2) return { error: wrongArity('get') };
            return {
                run: () => {
                    const kind = kindOf(store, session.db, args[1]);
                    if (kind !== null && kind !== 'string') return wrongType();
                    return bulk(store.get(session.db, args[1]));
                },
            };

        case 'set':
            return planSet(store, session, args);

        case 'setnx': {
            if (args.length !== 3) return { error: wrongArity('setnx') };
            return {
                run: () => {
                    if (kindOf(store, session.db, args[1]) !== null) return integer(0);
                    store.set(session.db, args[1], args[2], null);
                    return integer(1);
                },
            };
        }

        case 'setex': {
            if (args.length !== 4) return { error: wrongArity('setex') };
            const seconds = parseInteger(args[2]);
            if (seconds === null) return { error: integerError() };
            const offset = seconds > 0 ? secondsDeadline(seconds) : null;
            if (offset === null) return { error: replyError("ERR invalid expire time in 'setex' command") };
            return {
                run: () => {
                    store.set(session.db, args[1], args[3], Date.now() + offset);
                    dropOtherKinds(store, session.db, args[1]);
                    return simple('OK');
                },
            };
        }

        case 'getset': {
            if (args.length !== 3) return { error: plainArity() };
            return {
                run: () => {
                    const kind = kindOf(store, session.db, args[1]);
                    if (kind !== null && kind !== 'string') return wrongType();
                    const previous = store.get(session.db, args[1]);
                    store.set(session.db, args[1], args[2], null);
                    return bulk(previous);
                },
            };
        }

        case 'getdel': {
            if (args.length !== 2) return { error: wrongArity('getdel') };
            return {
                run: () => {
                    const kind = kindOf(store, session.db, args[1]);
                    if (kind !== null && kind !== 'string') return wrongType();
                    const previous = store.get(session.db, args[1]);
                    if (previous !== null && previous !== undefined) store.delete(session.db, args[1]);
                    return bulk(previous);
                },
            };
        }

        case 'getex':
            return planGetEx(store, session, args);

        case 'mget': {
            if (args.length < 2) return { error: plainArity() };
            return { run: () => array(args.slice(1).map(key => bulk(store.get(session.db, key)))) };
        }

        case 'mset': {
            if (args.length < 3 || args.length % 2 === 0) return { error: wrongArity('mset') };
            return {
                run: () => {
                    for (let index = 1; index < args.length; index += 2) {
                        store.set(session.db, args[index], args[index + 1], null);
                        dropOtherKinds(store, session.db, args[index]);
                    }
                    return simple('OK');
                },
            };
        }

        case 'del': {
            if (args.length < 2) return { error: wrongArity('del') };
            return {
                run: () => {
                    let removed = 0;
                    for (const key of args.slice(1)) {
                        let dropped = false;
                        for (const kind of KINDS) {
                            if (store.deleteKind(session.db, SUFFIX[kind], key)) dropped = true;
                        }
                        if (dropped) removed += 1;
                    }
                    return integer(removed);
                },
            };
        }

        case 'exists': {
            if (args.length < 2) return { error: wrongArity('exists') };
            return {
                run: () => integer(args.slice(1).filter(key => kindOf(store, session.db, key) !== null).length),
            };
        }

        case 'type': {
            if (args.length !== 2) return { error: wrongArity('type') };
            return { run: () => simple(kindOf(store, session.db, args[1]) ?? 'none') };
        }

        case 'strlen': {
            if (args.length !== 2) return { error: wrongArity('strlen') };
            return {
                run: () => {
                    const kind = kindOf(store, session.db, args[1]);
                    if (kind !== null && kind !== 'string') return wrongType();
                    const value = store.get(session.db, args[1]);
                    return integer(value === null || value === undefined ? 0 : value.length);
                },
            };
        }

        case 'append': {
            if (args.length !== 3) return { error: wrongArity('append') };
            return {
                run: () => {
                    const kind = kindOf(store, session.db, args[1]);
                    if (kind !== null && kind !== 'string') return wrongType();
                    return integer(store.append(session.db, args[1], args[2]));
                },
            };
        }

        case 'hset':
        case 'hget':
        case 'hgetall':
        case 'hdel':
        case 'hlen':
        case 'hincrby':
        case 'lpush':
        case 'rpush':
        case 'lrange':
        case 'lindex':
        case 'lpop':
        case 'rpop':
        case 'llen':
        case 'sadd':
        case 'srem':
        case 'smembers':
        case 'scard':
        case 'sismember':
        case 'zadd':
        case 'zscore':
        case 'zrem':
        case 'zcard':
        case 'zrange':
            return planCollection(store, session, name, args);

        case 'incr':
            if (args.length !== 2) return { error: plainArity() };
            return incremental(store, session, args[1], 1);

        case 'decr':
            if (args.length !== 2) return { error: plainArity() };
            return incremental(store, session, args[1], -1);

        case 'incrby':
        case 'decrby': {
            if (args.length !== 3) return { error: plainArity() };
            const delta = parseInteger(args[2]);
            if (delta === null) return { error: integerError() };
            return incremental(store, session, args[1], name === 'incrby' ? delta : -delta);
        }

        case 'ttl':
        case 'pttl': {
            if (args.length !== 2) return { error: wrongArity(name) };
            const milliseconds = name === 'pttl';
            return {
                run: () => {
                    const kind = kindOf(store, session.db, args[1]);
                    if (kind === null) return integer(-2);
                    const deadline = store.deadlineKind(session.db, SUFFIX[kind], args[1]);
                    if (deadline === null || deadline === undefined) return integer(-1);
                    const remaining = deadline - Date.now();
                    if (remaining <= 0) return integer(-2);
                    return integer(milliseconds ? remaining : Math.trunc((remaining + 500) / 1000));
                },
            };
        }

        case 'expire':
        case 'pexpire':
        case 'expireat':
        case 'pexpireat':
            return planExpire(store, session, name, args);

        case 'persist': {
            if (args.length !== 2) return { error: wrongArity('persist') };
            return {
                run: () => {
                    const kind = kindOf(store, session.db, args[1]);
                    if (kind === null) return integer(0);
                    const suffix = SUFFIX[kind];
                    if (store.deadlineKind(session.db, suffix, args[1]) === null) return integer(0);
                    store.expireKind(session.db, suffix, args[1], null);
                    return integer(1);
                },
            };
        }

        case 'rename':
        case 'renamenx':
            return planRename(store, session, name, args);

        case 'flushdb': {
            if (args.length !== 1) return { error: wrongArity('flushdb') };
            return { run: () => { store.flushDb(session.db); return simple('OK'); } };
        }

        case 'flushall': {
            if (args.length !== 1) return { error: wrongArity('flushall') };
            return {
                run: () => {
                    for (let index = 0; index < DATABASES; index += 1) store.flushDb(index);
                    return simple('OK');
                },
            };
        }

        case 'dbsize': {
            if (args.length !== 1) return { error: wrongArity('dbsize') };
            return { run: () => integer(store.size(session.db)) };
        }

        case 'keys': {
            if (args.length !== 2) return { error: wrongArity('keys') };
            const pattern = args[1];
            return {
                run: () => array(
                    store.keys(session.db)
                        .filter(key => globMatch(pattern, key))
                        .map(key => bulk(key)),
                ),
            };
        }

        case 'scan':
            return planScan(store, session, args);

        default:
            return { error: replyError('ERR unsupported command') };
    }
}

/** Matches `key` bytes against the Redis glob subset `*`, `?` and literals. */
export function globMatch(pattern, key) {
    let patternIndex = 0;
    let keyIndex = 0;
    let star = -1;
    let resume = 0;
    while (keyIndex < key.length) {
        if (patternIndex < pattern.length && (pattern[patternIndex] === 0x3f || pattern[patternIndex] === key[keyIndex])) {
            patternIndex += 1;
            keyIndex += 1;
            continue;
        }
        if (patternIndex < pattern.length && pattern[patternIndex] === 0x2a) {
            star = patternIndex;
            patternIndex += 1;
            resume = keyIndex;
            continue;
        }
        if (star >= 0) {
            patternIndex = star + 1;
            resume += 1;
            keyIndex = resume;
            continue;
        }
        return false;
    }
    while (patternIndex < pattern.length && pattern[patternIndex] === 0x2a) {
        patternIndex += 1;
    }
    return patternIndex === pattern.length;
}

function planScan(store, session, args) {
    if (args.length < 2) {
        return { error: wrongArity('scan') };
    }
    const cursorText = text(args[1]);
    if (!/^\d+$/.test(cursorText)) {
        return { error: replyError('ERR invalid cursor') };
    }
    const cursor = Number(cursorText);
    if (!Number.isFinite(cursor)) {
        return { error: replyError('ERR invalid cursor') };
    }
    let pattern = null;
    let count = 10;
    for (let index = 2; index < args.length; index += 2) {
        const option = text(args[index]).toLowerCase();
        const raw = args[index + 1];
        if (raw === undefined) {
            return { error: replyError('ERR syntax error') };
        }
        if (option === 'match') {
            pattern = raw;
            continue;
        }
        if (option === 'count') {
            const amount = parseInteger(raw);
            if (amount === null || amount <= 0) {
                return { error: replyError('ERR syntax error') };
            }
            count = amount;
            continue;
        }
        return { error: replyError('ERR syntax error') };
    }
    const database = session.db;
    return {
        run: () => {
            const keys = store.keys(database);
            const start = Math.min(cursor, keys.length);
            if (start >= keys.length) {
                return array([bulk('0'), array([])]);
            }
            const end = Math.min(start + count, keys.length);
            const next = end >= keys.length ? '0' : String(end);
            const page = keys
                .slice(start, end)
                .filter(key => pattern === null || globMatch(pattern, key));
            return array([bulk(next), array(page.map(key => bulk(key)))]);
        },
    };
}

function planClient(session, args) {
    if (args.length < 2) {
        return { error: wrongArity('client') };
    }
    const subcommand = text(args[1]).toLowerCase();
    switch (subcommand) {
        case 'setinfo':
            if (args.length !== 4) return { error: wrongArity('client|setinfo') };
            return { run: () => simple('OK') };
        case 'setname':
            if (args.length !== 3) return { error: wrongArity('client|setname') };
            return { run: () => { session.name = text(args[2]); return simple('OK'); } };
        case 'getname':
            if (args.length !== 2) return { error: wrongArity('client|getname') };
            return { run: () => (session.name ? bulk(session.name) : nullReply()) };
        case 'id':
            if (args.length !== 2) return { error: wrongArity('client|id') };
            return { run: () => integer(1) };
        default:
            return { error: replyError('ERR unsupported CLIENT subcommand') };
    }
}

function planSet(store, session, args) {
    if (args.length < 3) {
        return { error: wrongArity('set') };
    }
    let ifAbsent = false;
    let ifPresent = false;
    let keepDeadline = false;
    let expiry = null;
    for (let index = 3; index < args.length; index += 1) {
        const option = text(args[index]).toLowerCase();
        if (option === 'nx') {
            ifAbsent = true;
            continue;
        }
        if (option === 'xx') {
            ifPresent = true;
            continue;
        }
        if (option === 'keepttl') {
            keepDeadline = true;
            continue;
        }
        const unit = option === 'ex' || option === 'px' || option === 'exat' || option === 'pxat' ? option : null;
        if (unit === null) {
            return { error: replyError('ERR unsupported SET options') };
        }
        if (expiry !== null || keepDeadline) {
            return { error: replyError('ERR syntax error') };
        }
        const raw = args[index + 1];
        if (raw === undefined) {
            return { error: replyError('ERR syntax error') };
        }
        index += 1;
        const amount = parseInteger(raw);
        if (amount === null) {
            return { error: integerError() };
        }
        if (amount <= 0) {
            return { error: replyError("ERR invalid expire time in 'set' command") };
        }
        expiry = deadlineFactory(unit, amount);
        if (expiry === null) {
            return { error: replyError("ERR invalid expire time in 'set' command") };
        }
    }
    if (ifAbsent && ifPresent) {
        return { error: replyError('ERR syntax error') };
    }
    const key = args[1];
    const value = args[2];
    return {
        run: () => {
            const kind = kindOf(store, session.db, key);
            if ((ifAbsent && kind !== null) || (ifPresent && kind === null)) {
                return nullReply();
            }
            const deadline = expiry !== null
                ? expiry()
                : keepDeadline && kind !== null
                    ? store.deadlineKind(session.db, SUFFIX[kind], key)
                    : null;
            store.set(session.db, key, value, deadline ?? null);
            dropOtherKinds(store, session.db, key);
            return simple('OK');
        },
    };
}

function planGetEx(store, session, args) {
    if (args.length < 2) {
        return { error: wrongArity('getex') };
    }
    let deadline = null;
    let persist = false;
    let touched = false;
    if (args.length >= 3) {
        const option = text(args[2]).toLowerCase();
        if (option === 'persist') {
            if (args.length !== 3) return { error: replyError('ERR syntax error') };
            persist = true;
            touched = true;
        }
        else if (option === 'ex' || option === 'px' || option === 'exat' || option === 'pxat') {
            const raw = args[3];
            if (raw === undefined || args.length !== 4) return { error: replyError('ERR syntax error') };
            const amount = parseInteger(raw);
            if (amount === null) return { error: integerError() };
            if (amount <= 0) return { error: replyError("ERR invalid expire time in 'getex' command") };
            deadline = deadlineFactory(option, amount);
            if (deadline === null) return { error: replyError("ERR invalid expire time in 'getex' command") };
            touched = true;
        }
        else {
            return { error: replyError('ERR syntax error') };
        }
    }
    const key = args[1];
    return {
        run: () => {
            const kind = kindOf(store, session.db, key);
            if (kind !== null && kind !== 'string') return wrongType();
            const value = store.get(session.db, key);
            if (value === null || value === undefined) {
                return nullReply();
            }
            if (persist) {
                store.expire(session.db, key, null);
            }
            else if (touched) {
                store.expire(session.db, key, deadline());
            }
            return bulk(value);
        },
    };
}

function planExpire(store, session, name, args) {
    if (args.length !== 3) {
        return { error: wrongArity(name) };
    }
    const amount = parseInteger(args[2]);
    if (amount === null) {
        return { error: integerError() };
    }
    const absolute = name === 'expireat' || name === 'pexpireat';
    const factory = deadlineFactory(absolute ? (name === 'expireat' ? 'exat' : 'pxat') : (name === 'expire' ? 'ex' : 'px'), amount);
    if (factory === null) {
        return { error: replyError(`ERR invalid expire time in '${name}' command`) };
    }
    const key = args[1];
    return {
        run: () => {
            const kind = kindOf(store, session.db, key);
            if (kind === null) return integer(0);
            const suffix = SUFFIX[kind];
            const deadline = factory();
            if (deadline <= 0 || (!absolute && amount <= 0)) {
                store.deleteKind(session.db, suffix, key);
                return integer(1);
            }
            store.expireKind(session.db, suffix, key, deadline);
            return integer(1);
        },
    };
}

function planRename(store, session, name, args) {
    if (args.length !== 3) {
        return { error: wrongArity(name) };
    }
    const ifAbsent = name === 'renamenx';
    const source = args[1];
    const destination = args[2];
    return {
        run: () => {
            if (source.equals(destination)) {
                if (kindOf(store, session.db, source) === null) return replyError('ERR no such key');
                return ifAbsent ? integer(0) : simple('OK');
            }
            const outcome = store.rename(session.db, source, destination, ifAbsent);
            if (outcome === 'missing') return replyError('ERR no such key');
            if (outcome === 'destination-present') return integer(0);
            return ifAbsent ? integer(1) : simple('OK');
        },
    };
}

function incremental(store, session, key, delta) {
    return {
        run: () => {
            const kind = kindOf(store, session.db, key);
            if (kind !== null && kind !== 'string') return wrongType();
            const outcome = store.incrBy(session.db, key, delta);
            if (outcome.error) return replyError(`ERR ${outcome.error}`);
            return integer(outcome.value);
        },
    };
}

/**
 * Plans one hash or list command.
 *
 * The hash and list kinds keep their fields and elements in one opaque value
 * each, so every mutation decodes the current body, edits it and writes it back
 * while carrying the deadline the key already holds.
 */
function planCollection(store, session, name, args) {
    const db = session.db;
    const key = args.length > 1 ? args[1] : null;
    switch (name) {
        case 'hset': {
            if (args.length < 4 || (args.length - 2) % 2 !== 0) return { error: wrongArity('hset') };
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind !== null && kind !== 'hash') return wrongType();
                    const fields = readHash(store, db, key);
                    if (fields === null) return replyError('ERR stored hash value is corrupt');
                    let added = 0;
                    for (let index = 2; index < args.length; index += 2) {
                        const field = args[index];
                        const value = args[index + 1];
                        const position = fields.findIndex(entry => entry[0].equals(field));
                        if (position >= 0) {
                            fields[position] = [field, value];
                        }
                        else {
                            fields.push([field, value]);
                            added += 1;
                        }
                    }
                    const body = encodeHash(fields);
                    if (body === null) return replyError('ERR hash value exceeds the storage limit');
                    rewriteKind(store, db, 'hash', key, body);
                    return integer(added);
                },
            };
        }

        case 'hget': {
            if (args.length !== 3) return { error: wrongArity('hget') };
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind !== null && kind !== 'hash') return wrongType();
                    const fields = readHash(store, db, key);
                    if (fields === null) return replyError('ERR stored hash value is corrupt');
                    const field = fields.find(entry => entry[0].equals(args[2]));
                    return bulk(field ? field[1] : null);
                },
            };
        }

        case 'hgetall': {
            if (args.length !== 2) return { error: wrongArity('hgetall') };
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind !== null && kind !== 'hash') return wrongType();
                    const fields = readHash(store, db, key);
                    if (fields === null) return replyError('ERR stored hash value is corrupt');
                    return array(fields.flatMap(([field, value]) => [bulk(field), bulk(value)]));
                },
            };
        }

        case 'hdel': {
            if (args.length < 3) return { error: wrongArity('hdel') };
            const names = args.slice(2);
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind === null) return integer(0);
                    if (kind !== 'hash') return wrongType();
                    const fields = readHash(store, db, key);
                    if (fields === null) return replyError('ERR stored hash value is corrupt');
                    let removed = 0;
                    const kept = [];
                    for (const [field, value] of fields) {
                        if (names.some(candidate => candidate.equals(field))) {
                            removed += 1;
                        }
                        else {
                            kept.push([field, value]);
                        }
                    }
                    if (kept.length === 0) {
                        store.deleteKind(db, SUFFIX.hash, key);
                    }
                    else {
                        const body = encodeHash(kept);
                        if (body === null) return replyError('ERR hash value exceeds the storage limit');
                        rewriteKind(store, db, 'hash', key, body);
                    }
                    return integer(removed);
                },
            };
        }

        case 'hlen': {
            if (args.length !== 2) return { error: wrongArity('hlen') };
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind === null) return integer(0);
                    if (kind !== 'hash') return wrongType();
                    const fields = readHash(store, db, key);
                    if (fields === null) return replyError('ERR stored hash value is corrupt');
                    return integer(fields.length);
                },
            };
        }

        case 'hincrby': {
            if (args.length !== 4) return { error: wrongArity('hincrby') };
            const delta = parseInteger(args[3]);
            if (delta === null) return { error: integerError() };
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind !== null && kind !== 'hash') return wrongType();
                    const fields = readHash(store, db, key);
                    if (fields === null) return replyError('ERR stored hash value is corrupt');
                    const position = fields.findIndex(entry => entry[0].equals(args[2]));
                    let current = 0;
                    if (position >= 0) {
                        const parsed = parseInteger(fields[position][1]);
                        if (parsed === null) return replyError('ERR hash value is not an integer');
                        current = parsed;
                    }
                    const updated = current + delta;
                    if (!Number.isSafeInteger(updated)) {
                        return replyError('ERR increment or decrement would overflow');
                    }
                    const encoded = Buffer.from(String(updated));
                    if (position >= 0) {
                        fields[position] = [args[2], encoded];
                    }
                    else {
                        fields.push([args[2], encoded]);
                    }
                    const body = encodeHash(fields);
                    if (body === null) return replyError('ERR hash value exceeds the storage limit');
                    rewriteKind(store, db, 'hash', key, body);
                    return integer(updated);
                },
            };
        }

        case 'lpush':
        case 'rpush': {
            if (args.length < 3) return { error: wrongArity(name) };
            const values = args.slice(2);
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind !== null && kind !== 'list') return wrongType();
                    const elements = readList(store, db, key);
                    if (elements === null) return replyError('ERR stored list value is corrupt');
                    if (name === 'lpush') {
                        for (const value of values) elements.unshift(value);
                    }
                    else {
                        elements.push(...values);
                    }
                    const body = encodeList(elements);
                    if (body === null) return replyError('ERR list value exceeds the storage limit');
                    rewriteKind(store, db, 'list', key, body);
                    return integer(elements.length);
                },
            };
        }

        case 'lrange': {
            if (args.length !== 4) return { error: wrongArity('lrange') };
            const start = parseInteger(args[2]);
            const stop = parseInteger(args[3]);
            if (start === null || stop === null) return { error: integerError() };
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind === null) return array([]);
                    if (kind !== 'list') return wrongType();
                    const elements = readList(store, db, key);
                    if (elements === null) return replyError('ERR stored list value is corrupt');
                    let begin = start < 0 ? elements.length + start : start;
                    let end = stop < 0 ? elements.length + stop : stop;
                    if (begin < 0) begin = 0;
                    if (end >= elements.length) end = elements.length - 1;
                    if (begin > end || begin >= elements.length || end < 0) return array([]);
                    return array(elements.slice(begin, end + 1).map(value => bulk(value)));
                },
            };
        }

        case 'lindex': {
            if (args.length !== 3) return { error: wrongArity('lindex') };
            const index = parseInteger(args[2]);
            if (index === null) return { error: integerError() };
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind === null) return nullReply();
                    if (kind !== 'list') return wrongType();
                    const elements = readList(store, db, key);
                    if (elements === null) return replyError('ERR stored list value is corrupt');
                    const position = index < 0 ? elements.length + index : index;
                    if (position < 0 || position >= elements.length) return nullReply();
                    return bulk(elements[position]);
                },
            };
        }

        case 'lpop':
        case 'rpop': {
            if (args.length !== 2 && args.length !== 3) return { error: wrongArity(name) };
            let count = null;
            if (args.length === 3) {
                count = parseInteger(args[2]);
                if (count === null) return { error: integerError() };
                if (count <= 0) return { error: replyError('ERR value is out of range, must be positive') };
            }
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind === null) return count === null ? nullReply() : nullArray();
                    if (kind !== 'list') return wrongType();
                    const elements = readList(store, db, key);
                    if (elements === null) return replyError('ERR stored list value is corrupt');
                    const take = Math.min(count ?? 1, elements.length);
                    let popped;
                    let kept;
                    if (name === 'lpop') {
                        popped = elements.slice(0, take);
                        kept = elements.slice(take);
                    }
                    else {
                        popped = elements.slice(elements.length - take).reverse();
                        kept = elements.slice(0, elements.length - take);
                    }
                    if (kept.length === 0) {
                        store.deleteKind(db, SUFFIX.list, key);
                    }
                    else {
                        const body = encodeList(kept);
                        if (body === null) return replyError('ERR list value exceeds the storage limit');
                        rewriteKind(store, db, 'list', key, body);
                    }
                    return count === null ? bulk(popped[0]) : array(popped.map(value => bulk(value)));
                },
            };
        }

        case 'llen': {
            if (args.length !== 2) return { error: wrongArity('llen') };
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind === null) return integer(0);
                    if (kind !== 'list') return wrongType();
                    const elements = readList(store, db, key);
                    if (elements === null) return replyError('ERR stored list value is corrupt');
                    return integer(elements.length);
                },
            };
        }

        case 'sadd': {
            if (args.length < 3) return { error: wrongArity('sadd') };
            const incoming = args.slice(2);
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind !== null && kind !== 'set') return wrongType();
                    const members = readSet(store, db, key);
                    if (members === null) return replyError('ERR stored set value is corrupt');
                    let added = 0;
                    for (const member of incoming) {
                        if (!members.some(existing => existing.equals(member))) {
                            members.push(member);
                            added += 1;
                        }
                    }
                    if (added > 0) {
                        const body = encodeSet(members);
                        if (body === null) return replyError('ERR set value exceeds the storage limit');
                        rewriteKind(store, db, 'set', key, body);
                    }
                    return integer(added);
                },
            };
        }

        case 'srem': {
            if (args.length < 3) return { error: wrongArity('srem') };
            const dropping = args.slice(2);
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind === null) return integer(0);
                    if (kind !== 'set') return wrongType();
                    const members = readSet(store, db, key);
                    if (members === null) return replyError('ERR stored set value is corrupt');
                    const kept = members.filter(existing => !dropping.some(candidate => candidate.equals(existing)));
                    const removed = members.length - kept.length;
                    if (kept.length === 0) {
                        store.deleteKind(db, SUFFIX.set, key);
                    }
                    else if (removed > 0) {
                        const body = encodeSet(kept);
                        if (body === null) return replyError('ERR set value exceeds the storage limit');
                        rewriteKind(store, db, 'set', key, body);
                    }
                    return integer(removed);
                },
            };
        }

        case 'smembers': {
            if (args.length !== 2) return { error: wrongArity('smembers') };
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind === null) return array([]);
                    if (kind !== 'set') return wrongType();
                    const members = readSet(store, db, key);
                    if (members === null) return replyError('ERR stored set value is corrupt');
                    return array(members.map(member => bulk(member)));
                },
            };
        }

        case 'scard': {
            if (args.length !== 2) return { error: wrongArity('scard') };
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind === null) return integer(0);
                    if (kind !== 'set') return wrongType();
                    const members = readSet(store, db, key);
                    if (members === null) return replyError('ERR stored set value is corrupt');
                    return integer(members.length);
                },
            };
        }

        case 'sismember': {
            if (args.length !== 3) return { error: wrongArity('sismember') };
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind === null) return integer(0);
                    if (kind !== 'set') return wrongType();
                    const members = readSet(store, db, key);
                    if (members === null) return replyError('ERR stored set value is corrupt');
                    return integer(members.some(member => member.equals(args[2])) ? 1 : 0);
                },
            };
        }

        case 'zadd': {
            if (args.length < 4 || (args.length - 2) % 2 !== 0) return { error: wrongArity('zadd') };
            const incoming = [];
            for (let index = 2; index < args.length; index += 2) {
                const score = parseScore(args[index]);
                if (score === null) return { error: replyError('ERR value is not a valid float') };
                incoming.push([args[index + 1], score]);
            }
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind !== null && kind !== 'zset') return wrongType();
                    const entries = readZSet(store, db, key);
                    if (entries === null) return replyError('ERR stored zset value is corrupt');
                    let added = 0;
                    for (const [member, score] of incoming) {
                        const position = entries.findIndex(entry => entry[0].equals(member));
                        if (position >= 0) {
                            entries[position] = [member, score];
                        }
                        else {
                            entries.push([member, score]);
                            added += 1;
                        }
                    }
                    const body = encodeZSet(entries);
                    if (body === null) return replyError('ERR zset value exceeds the storage limit');
                    rewriteKind(store, db, 'zset', key, body);
                    return integer(added);
                },
            };
        }

        case 'zscore': {
            if (args.length !== 3) return { error: wrongArity('zscore') };
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind === null) return nullReply();
                    if (kind !== 'zset') return wrongType();
                    const entries = readZSet(store, db, key);
                    if (entries === null) return replyError('ERR stored zset value is corrupt');
                    const entry = entries.find(candidate => candidate[0].equals(args[2]));
                    return entry ? bulk(scoreText(entry[1])) : nullReply();
                },
            };
        }

        case 'zrem': {
            if (args.length < 3) return { error: wrongArity('zrem') };
            const dropping = args.slice(2);
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind === null) return integer(0);
                    if (kind !== 'zset') return wrongType();
                    const entries = readZSet(store, db, key);
                    if (entries === null) return replyError('ERR stored zset value is corrupt');
                    const kept = entries.filter(([member]) => !dropping.some(candidate => candidate.equals(member)));
                    const removed = entries.length - kept.length;
                    if (kept.length === 0) {
                        store.deleteKind(db, SUFFIX.zset, key);
                    }
                    else if (removed > 0) {
                        const body = encodeZSet(kept);
                        if (body === null) return replyError('ERR zset value exceeds the storage limit');
                        rewriteKind(store, db, 'zset', key, body);
                    }
                    return integer(removed);
                },
            };
        }

        case 'zcard': {
            if (args.length !== 2) return { error: wrongArity('zcard') };
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind === null) return integer(0);
                    if (kind !== 'zset') return wrongType();
                    const entries = readZSet(store, db, key);
                    if (entries === null) return replyError('ERR stored zset value is corrupt');
                    return integer(entries.length);
                },
            };
        }

        case 'zrange': {
            let withScores = false;
            if (args.length === 5) {
                if (text(args[4]).toLowerCase() !== 'withscores') return { error: replyError('ERR syntax error') };
                withScores = true;
            }
            else if (args.length !== 4) {
                return { error: wrongArity('zrange') };
            }
            const start = parseInteger(args[2]);
            const stop = parseInteger(args[3]);
            if (start === null || stop === null) return { error: integerError() };
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind === null) return array([]);
                    if (kind !== 'zset') return wrongType();
                    const entries = readZSet(store, db, key);
                    if (entries === null) return replyError('ERR stored zset value is corrupt');
                    sortZSet(entries);
                    let begin = start < 0 ? entries.length + start : start;
                    let end = stop < 0 ? entries.length + stop : stop;
                    if (begin < 0) begin = 0;
                    if (end >= entries.length) end = entries.length - 1;
                    if (begin > end || begin >= entries.length || end < 0) return array([]);
                    const slice = entries.slice(begin, end + 1);
                    return array(slice.flatMap(([member, score]) => (
                        withScores ? [bulk(member), bulk(scoreText(score))] : [bulk(member)]
                    )));
                },
            };
        }

        default:
            return { error: replyError('ERR unsupported command') };
    }
}
