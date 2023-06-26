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

/** Live string bytes, `null` when the key is missing. */
function readString(store, db, key) {
    const body = store.getKind(db, SUFFIX.string, key);
    return body === null || body === undefined ? null : body;
}

/** Replaces the string bytes while carrying the deadline the key already holds. */
function rewriteString(store, db, key, body) {
    const expiresAt = store.deadlineKind(db, SUFFIX.string, key);
    store.setKind(db, SUFFIX.string, key, body, expiresAt ?? null);
}

/** Inclusive byte range clamped to `length`, `null` when it selects nothing. */
function byteRange(start, stop, length) {
    const begin = start < 0 ? Math.max(0, length + start) : start;
    const end = stop < 0 ? length + stop : Math.min(stop, length - 1);
    if (begin > end || begin >= length || end < 0) return null;
    return [begin, end];
}

/** Clamps one byte or bit index into the units the value holds. */
function clampIndex(index, units) {
    const normalized = index < 0 ? units + index : index;
    return Math.min(Math.max(normalized, 0), Math.max(units - 1, 0));
}

/** Reads one bit of `body`, MSB first, answering `0` past the end of the value. */
function bitAt(body, offset) {
    const index = Math.floor(offset / 8);
    if (index >= body.length) return 0;
    return (body[index] >> (7 - (offset % 8))) & 1;
}

/** Counts the set bits of an inclusive bit range. */
function countBitRange(body, begin, end) {
    let total = 0;
    for (let offset = begin; offset <= end; offset += 1) {
        total += bitAt(body, offset);
    }
    return total;
}

const MAX_BIT_OFFSET = 0xffffffff;
const MAX_STRING = 512 * 1024 * 1024;

/** Parses a canonical bit index in `0..2^32-1`, `null` otherwise. */
function parseBitOffset(raw) {
    const value = parseInteger(raw);
    return value !== null && value >= 0 && value <= MAX_BIT_OFFSET ? value : null;
}

/**
 * Parses one float the way `INCRBYFLOAT` reads it.
 *
 * Decimal literals and the infinity words are accepted, `NaN` is returned as a
 * number so the caller can reject it, and anything else answers `null`.
 */
function parseFloatText(raw) {
    const value = text(raw);
    if (/^[+-]?(?:inf(?:inity)?|nan)$/i.test(value)) {
        if (/nan/i.test(value)) return NaN;
        return value.startsWith('-') ? -Infinity : Infinity;
    }
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) {
        return null;
    }
    return Number(value);
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

        case 'getrange': {
            if (args.length !== 4) return { error: wrongArity('getrange') };
            const start = parseInteger(args[2]);
            const stop = parseInteger(args[3]);
            if (start === null || stop === null) return { error: integerError() };
            return {
                run: () => {
                    const kind = kindOf(store, session.db, args[1]);
                    if (kind !== null && kind !== 'string') return wrongType();
                    const body = readString(store, session.db, args[1]);
                    if (body === null) return bulk('');
                    const range = byteRange(start, stop, body.length);
                    if (range === null) return bulk('');
                    return bulk(body.subarray(range[0], range[1] + 1));
                },
            };
        }

        case 'setrange': {
            if (args.length !== 4) return { error: wrongArity('setrange') };
            const offset = parseInteger(args[2]);
            if (offset === null) return { error: integerError() };
            if (offset < 0) return { error: replyError('ERR offset is out of range') };
            const replacement = args[3];
            const end = offset + replacement.length;
            if (end > MAX_STRING) {
                return { error: replyError('ERR string exceeds maximum allowed size (proto-max-bulk-len)') };
            }
            return {
                run: () => {
                    const kind = kindOf(store, session.db, args[1]);
                    if (kind !== null && kind !== 'string') return wrongType();
                    const current = readString(store, session.db, args[1]);
                    if (replacement.length === 0) return integer(current === null ? 0 : current.length);
                    const length = Math.max(current === null ? 0 : current.length, end);
                    const body = Buffer.alloc(length);
                    if (current !== null) current.copy(body, 0);
                    replacement.copy(body, offset);
                    rewriteString(store, session.db, args[1], body);
                    return integer(length);
                },
            };
        }

        case 'incrbyfloat': {
            if (args.length !== 3) return { error: wrongArity('incrbyfloat') };
            const increment = parseFloatText(args[2]);
            if (increment === null || Number.isNaN(increment)) {
                return { error: replyError('ERR value is not a valid float') };
            }
            const key = args[1];
            return {
                run: () => {
                    const kind = kindOf(store, session.db, key);
                    if (kind !== null && kind !== 'string') return wrongType();
                    const current = readString(store, session.db, key);
                    let value = 0;
                    if (current !== null) {
                        const parsed = parseFloatText(current);
                        if (parsed === null || Number.isNaN(parsed)) {
                            return replyError('ERR value is not a valid float');
                        }
                        value = parsed;
                    }
                    const updated = value + increment;
                    if (!Number.isFinite(updated)) {
                        return replyError('ERR increment would produce NaN or Infinity');
                    }
                    const result = scoreText(updated);
                    rewriteString(store, session.db, key, Buffer.from(result));
                    return bulk(result);
                },
            };
        }

        case 'setbit': {
            if (args.length !== 4) return { error: wrongArity('setbit') };
            const offset = parseBitOffset(args[2]);
            if (offset === null) {
                return { error: replyError('ERR bit offset is not an integer or out of range') };
            }
            const bitText = text(args[3]);
            if (bitText !== '0' && bitText !== '1') {
                return { error: replyError('ERR bit is not an integer or out of range') };
            }
            return {
                run: () => {
                    const kind = kindOf(store, session.db, args[1]);
                    if (kind !== null && kind !== 'string') return wrongType();
                    const current = readString(store, session.db, args[1]);
                    const index = Math.floor(offset / 8);
                    const length = Math.max(current === null ? 0 : current.length, index + 1);
                    const body = Buffer.alloc(length);
                    if (current !== null) current.copy(body, 0);
                    const mask = 1 << (7 - (offset % 8));
                    const previous = (body[index] & mask) === 0 ? 0 : 1;
                    if (bitText === '1') {
                        body[index] |= mask;
                    }
                    else {
                        body[index] &= ~mask;
                    }
                    rewriteString(store, session.db, args[1], body);
                    return integer(previous);
                },
            };
        }

        case 'getbit': {
            if (args.length !== 3) return { error: wrongArity('getbit') };
            const offset = parseBitOffset(args[2]);
            if (offset === null) {
                return { error: replyError('ERR bit offset is not an integer or out of range') };
            }
            return {
                run: () => {
                    const kind = kindOf(store, session.db, args[1]);
                    if (kind !== null && kind !== 'string') return wrongType();
                    const body = readString(store, session.db, args[1]);
                    return integer(body === null ? 0 : bitAt(body, offset));
                },
            };
        }

        case 'bitcount': {
            if (args.length !== 2 && args.length !== 4 && args.length !== 5) {
                return { error: wrongArity('bitcount') };
            }
            let bitUnit = false;
            if (args.length === 5) {
                const unitText = text(args[4]).toLowerCase();
                if (unitText !== 'byte' && unitText !== 'bit') {
                    return { error: replyError('ERR syntax error') };
                }
                bitUnit = unitText === 'bit';
            }
            let start = null;
            let stop = null;
            if (args.length >= 4) {
                start = parseInteger(args[2]);
                stop = parseInteger(args[3]);
                if (start === null || stop === null) return { error: integerError() };
            }
            return {
                run: () => {
                    const kind = kindOf(store, session.db, args[1]);
                    if (kind !== null && kind !== 'string') return wrongType();
                    const body = readString(store, session.db, args[1]);
                    if (body === null) return integer(0);
                    if (start === null) return integer(countBitRange(body, 0, body.length * 8 - 1));
                    const units = bitUnit ? body.length * 8 : body.length;
                    const range = byteRange(start, stop, units);
                    if (range === null) return integer(0);
                    if (bitUnit) return integer(countBitRange(body, range[0], range[1]));
                    return integer(countBitRange(body, range[0] * 8, range[1] * 8 + 7));
                },
            };
        }

        case 'bitpos': {
            if (args.length < 3 || args.length > 6) return { error: wrongArity('bitpos') };
            const target = text(args[2]);
            if (target !== '0' && target !== '1') {
                return { error: replyError('ERR The bit argument must be 1 or 0') };
            }
            let bitUnit = false;
            if (args.length === 6) {
                const unitText = text(args[5]).toLowerCase();
                if (unitText !== 'byte' && unitText !== 'bit') {
                    return { error: replyError('ERR syntax error') };
                }
                bitUnit = unitText === 'bit';
            }
            let start = null;
            let stop = null;
            if (args.length >= 4) {
                start = parseInteger(args[3]);
                if (start === null) return { error: integerError() };
            }
            if (args.length >= 5) {
                stop = parseInteger(args[4]);
                if (stop === null) return { error: integerError() };
            }
            const wanted = target === '1' ? 1 : 0;
            const endGiven = stop !== null;
            return {
                run: () => {
                    const kind = kindOf(store, session.db, args[1]);
                    if (kind !== null && kind !== 'string') return wrongType();
                    const body = readString(store, session.db, args[1]);
                    if (body === null) return integer(wanted === 0 ? 0 : -1);
                    if (start !== null && stop !== null && start < 0 && stop < 0 && start > stop) {
                        return integer(-1);
                    }
                    const units = bitUnit ? body.length * 8 : body.length;
                    const begin = start === null ? 0 : clampIndex(start, units);
                    const end = stop === null ? units - 1 : clampIndex(stop, units);
                    if (begin > end) return integer(-1);
                    const first = bitUnit ? begin : begin * 8;
                    const last = bitUnit ? end : end * 8 + 7;
                    for (let offset = first; offset <= last; offset += 1) {
                        if (bitAt(body, offset) === wanted) return integer(offset);
                    }
                    return integer(wanted === 0 && !endGiven ? body.length * 8 : -1);
                },
            };
        }

        case 'hset':
        case 'hget':
        case 'hgetall':
        case 'hdel':
        case 'hlen':
        case 'hincrby':
        case 'hsetnx':
        case 'hkeys':
        case 'hvals':
        case 'hexists':
        case 'hincrbyfloat':
        case 'hrandfield':
        case 'hscan':
        case 'lpush':
        case 'rpush':
        case 'lrange':
        case 'lindex':
        case 'lpop':
        case 'rpop':
        case 'llen':
        case 'linsert':
        case 'lmpop':
        case 'sadd':
        case 'srem':
        case 'smembers':
        case 'scard':
        case 'sismember':
        case 'smove':
        case 'srandmember':
        case 'sscan':
        case 'zadd':
        case 'zscore':
        case 'zrem':
        case 'zcard':
        case 'zrange':
        case 'zscan':
            return planCollection(store, session, name, args);

        case 'zrangebyscore':
        case 'zrevrangebyscore':
        case 'zrangebylex':
        case 'zrevrangebylex':
            return planZSetRange(store, session, name, args);

        case 'zremrangebyrank':
        case 'zremrangebyscore':
        case 'zremrangebylex':
            return planZSetRemoveRange(store, session, name, args);

        case 'zrandmember':
            return planZRandMember(store, session, args);

        case 'zunionstore':
        case 'zinterstore':
        case 'zdiff':
        case 'zdiffstore':
        case 'zintercard':
            return planZSetAggregate(store, session, name, args);

        case 'sinter':
        case 'sintercard':
        case 'sunion':
        case 'sdiff':
        case 'sinterstore':
        case 'sunionstore':
        case 'sdiffstore':
            return planSetAggregate(store, session, name, args);

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

        case 'flushdb':
        case 'flushall': {
            if (args.length > 2) return { error: replyError('ERR syntax error') };
            if (args.length === 2) {
                const option = text(args[1]).toLowerCase();
                if (option !== 'async' && option !== 'sync') {
                    return { error: replyError('ERR syntax error') };
                }
            }
            const everyDatabase = name === 'flushall';
            return {
                run: () => {
                    if (everyDatabase) {
                        for (let index = 0; index < DATABASES; index += 1) store.flushDb(index);
                    }
                    else {
                        store.flushDb(session.db);
                    }
                    return simple('OK');
                },
            };
        }

        case 'dbsize': {
            if (args.length !== 1) return { error: wrongArity('dbsize') };
            return { run: () => integer(store.size(session.db)) };
        }

        case 'randomkey': {
            if (args.length !== 1) return { error: wrongArity('randomkey') };
            return {
                run: () => {
                    const picked = randomMember(store.keys(session.db));
                    return picked === null ? nullReply() : bulk(picked);
                },
            };
        }

        case 'copy':
            return planCopy(store, session, args);

        case 'expiretime':
        case 'pexpiretime': {
            if (args.length !== 2) return { error: wrongArity(name) };
            const milliseconds = name === 'pexpiretime';
            return {
                run: () => {
                    const kind = kindOf(store, session.db, args[1]);
                    if (kind === null) return integer(-2);
                    const deadline = store.deadlineKind(session.db, SUFFIX[kind], args[1]);
                    if (deadline === null || deadline === undefined) return integer(-1);
                    return integer(milliseconds ? deadline : Math.floor(deadline / 1000));
                },
            };
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

/** Plans `COPY source destination [DB index] [REPLACE]`. */
function planCopy(store, session, args) {
    if (args.length < 3) {
        return { error: wrongArity('copy') };
    }
    const source = args[1];
    const destination = args[2];
    let targetDb = session.db;
    let replace = false;
    for (let index = 3; index < args.length; index += 1) {
        const option = text(args[index]).toLowerCase();
        if (option === 'replace') {
            replace = true;
            continue;
        }
        if (option === 'db') {
            const raw = args[index + 1];
            if (raw === undefined) return { error: replyError('ERR syntax error') };
            index += 1;
            const database = parseInteger(raw);
            if (database === null || database < 0 || database >= DATABASES) {
                return { error: replyError('ERR DB index is out of range') };
            }
            targetDb = database;
            continue;
        }
        return { error: replyError('ERR syntax error') };
    }
    if (targetDb === session.db && source.equals(destination)) {
        return { error: replyError('ERR source and destination objects are the same') };
    }
    const database = session.db;
    return {
        run: () => {
            const kind = kindOf(store, database, source);
            if (kind === null) return integer(0);
            if (!replace && kindOf(store, targetDb, destination) !== null) return integer(0);
            const body = kind === 'string'
                ? store.get(database, source)
                : store.getKind(database, SUFFIX[kind], source);
            if (body === null || body === undefined) return integer(0);
            const deadline = kind === 'string'
                ? store.deadline(database, source)
                : store.deadlineKind(database, SUFFIX[kind], source);
            dropEveryKind(store, targetDb, destination);
            if (kind === 'string') store.set(targetDb, destination, body, deadline ?? null);
            else store.setKind(targetDb, SUFFIX[kind], destination, body, deadline ?? null);
            return integer(1);
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
 * Plans one set aggregate: intersection, union or difference, optionally stored.
 *
 * The `*STORE` forms read the sources first, so a wrong type aborts before the
 * destination is touched, then drop every representation of the destination
 * because a store resets its value and its deadline.
 */
function planSetAggregate(store, session, name, args) {
    if (name === 'sintercard') return planSInterCard(store, session, args);
    const keeps = name.endsWith('store');
    if (keeps ? args.length < 3 : args.length < 2) {
        return { error: wrongArity(name) };
    }
    const destination = keeps ? args[1] : null;
    const keys = keeps ? args.slice(2) : args.slice(1);
    const db = session.db;
    return {
        run: () => {
            const sets = readSetsForAggregate(store, db, keys);
            if (sets === null) return wrongType();
            let result;
            if (name.startsWith('sinter')) {
                result = intersectMembers(sets);
            }
            else if (name.startsWith('sunion')) {
                result = uniqueMembers(sets.flat());
            }
            else {
                result = differenceMembers(sets);
            }
            if (!keeps) return array(result.map(member => bulk(member)));
            dropEveryKind(store, db, destination);
            if (result.length === 0) return integer(0);
            const body = encodeSet(result);
            if (body === null) return replyError('ERR set value exceeds the storage limit');
            store.setKind(db, 'set', destination, body, null);
            return integer(result.length);
        },
    };
}

/** Reads every named set, `null` when one of them holds another kind or a corrupt body. */
function readSetsForAggregate(store, db, keys) {
    const sets = [];
    for (const key of keys) {
        const kind = kindOf(store, db, key);
        if (kind === null) {
            sets.push([]);
            continue;
        }
        if (kind !== 'set') return null;
        const members = readSet(store, db, key);
        if (members === null) return null;
        sets.push(members);
    }
    return sets;
}

function uniqueMembers(members) {
    const seen = [];
    for (const member of members) {
        if (!seen.some(existing => existing.equals(member))) seen.push(member);
    }
    return seen;
}

function intersectMembers(sets) {
    if (sets.length === 0) return [];
    return uniqueMembers(sets[0]).filter(member => sets.every(set => set.some(entry => entry.equals(member))));
}

function differenceMembers(sets) {
    if (sets.length === 0) return [];
    return uniqueMembers(sets[0]).filter(member => !sets.slice(1).some(set => set.some(entry => entry.equals(member))));
}

/** Plans `SINTERCARD`, whose keys are counted from a leading length and may carry `LIMIT`. */
function planSInterCard(store, session, args) {
    if (args.length < 3) return { error: wrongArity('sintercard') };
    const count = parseInteger(args[1]);
    if (count === null || count <= 0) {
        return { error: replyError('ERR numkeys should be greater than 0') };
    }
    if (count > args.length - 2) {
        return { error: replyError("ERR Number of keys can't be greater than number of args") };
    }
    let limit = 0;
    const index = 2 + count;
    if (index < args.length) {
        if (text(args[index]).toLowerCase() !== 'limit' || index + 2 !== args.length) {
            return { error: replyError('ERR syntax error') };
        }
        limit = parseInteger(args[index + 1]);
        if (limit === null || limit < 0) return { error: replyError("ERR LIMIT can't be negative") };
    }
    const keys = args.slice(2, 2 + count);
    const db = session.db;
    return {
        run: () => {
            const sets = readSetsForAggregate(store, db, keys);
            if (sets === null) return wrongType();
            const found = intersectMembers(sets).length;
            return integer(limit > 0 ? Math.min(found, limit) : found);
        },
    };
}

/** Removes every representation of one logical key, whatever kind currently holds it. */
function dropEveryKind(store, db, key) {
    for (const kind of KINDS) {
        store.deleteKind(db, SUFFIX[kind], key);
    }
}

/** Parses one `SSCAN`-style cursor in canonical decimal form, `null` when it is not. */
function parseScanCursor(raw) {
    const cursorText = text(raw);
    if (!/^\d+$/.test(cursorText)) return null;
    const cursor = Number(cursorText);
    return Number.isFinite(cursor) ? cursor : null;
}

/** Parses `MATCH` and `COUNT` options shared by the collection scans. */
function parseScanOptions(args, from) {
    let pattern = null;
    let count = 10;
    for (let index = from; index < args.length; index += 2) {
        const option = text(args[index]).toLowerCase();
        const raw = args[index + 1];
        if (raw === undefined) return { error: replyError('ERR syntax error') };
        if (option === 'match') {
            pattern = raw;
            continue;
        }
        if (option === 'count') {
            const amount = parseInteger(raw);
            if (amount === null || amount <= 0) return { error: replyError('ERR syntax error') };
            count = amount;
            continue;
        }
        return { error: replyError('ERR syntax error') };
    }
    return { pattern, count };
}

/** Pages one collection scan by cursor, filtering and rendering each selected entry. */
function scanReply(entries, cursor, count, pattern, subject, render) {
    const start = Math.min(cursor, entries.length);
    if (start >= entries.length) return array([bulk('0'), array([])]);
    const end = Math.min(start + count, entries.length);
    const next = end >= entries.length ? '0' : String(end);
    const page = [];
    for (let index = start; index < end; index += 1) {
        const entry = entries[index];
        if (pattern !== null && !globMatch(pattern, subject(entry))) continue;
        page.push(...render(entry));
    }
    return array([bulk(next), array(page)]);
}

/** Picks one random member, `null` when the collection is empty. */
function randomMember(members) {
    if (members.length === 0) return null;
    return members[Math.floor(Math.random() * members.length)];
}

/** Samples `count` members: positive counts are unique, negative counts allow repeats. */
function sampleMembers(members, count) {
    if (count === 0 || members.length === 0) return [];
    if (count < 0) {
        const picks = [];
        for (let index = 0; index < -count; index += 1) picks.push(randomMember(members));
        return picks;
    }
    const pool = members.slice();
    const take = Math.min(count, pool.length);
    for (let index = 0; index < take; index += 1) {
        const swap = index + Math.floor(Math.random() * (pool.length - index));
        const held = pool[index];
        pool[index] = pool[swap];
        pool[swap] = held;
    }
    return pool.slice(0, take);
}

/** Parses one score range bound, accepting an exclusive `(` prefix and infinities. */
function parseScoreBound(raw) {
    const value = text(raw);
    const exclusive = value.startsWith('(');
    const body = Buffer.from(exclusive ? value.slice(1) : value, 'utf8');
    const score = parseScore(body);
    return score === null ? null : { score, exclusive };
}

/** Parses one lexicographic range bound: `-`, `+`, `[value` or `(value`. */
function parseLexBound(raw) {
    const value = text(raw);
    if (value === '-') return { infinity: -1, bytes: null, exclusive: false };
    if (value === '+') return { infinity: 1, bytes: null, exclusive: false };
    if (value.startsWith('[') || value.startsWith('(')) {
        return { infinity: 0, bytes: Buffer.from(value.slice(1), 'utf8'), exclusive: value.startsWith('(') };
    }
    return null;
}

/** Whether one score falls inside the inclusive or exclusive bounds. */
function scoreInRange(score, min, max) {
    const above = min.exclusive ? score > min.score : score >= min.score;
    const below = max.exclusive ? score < max.score : score <= max.score;
    return above && below;
}

/** Whether one member falls inside the lexicographic bounds. */
function lexInRange(member, min, max) {
    if (min.infinity === 1) return false;
    if (max.infinity === -1) return false;
    if (min.infinity === 0) {
        const order = Buffer.compare(member, min.bytes);
        if (min.exclusive ? order <= 0 : order < 0) return false;
    }
    if (max.infinity === 0) {
        const order = Buffer.compare(member, max.bytes);
        if (max.exclusive ? order >= 0 : order > 0) return false;
    }
    return true;
}

/**
 * Reads `WITHSCORES` and `LIMIT` options of the score and lex range commands.
 *
 * `allowScores` is false for the lex commands, where `WITHSCORES` is a syntax
 * error just like the gateway answers.
 */
function parseZRangeOptions(args, from, allowScores) {
    let withScores = false;
    let offset = 0;
    let count = -1;
    for (let index = from; index < args.length;) {
        const option = text(args[index]).toLowerCase();
        if (option === 'withscores') {
            if (!allowScores) return { error: replyError('ERR syntax error') };
            withScores = true;
            index += 1;
            continue;
        }
        if (option === 'limit') {
            if (index + 2 >= args.length) return { error: replyError('ERR syntax error') };
            const start = parseInteger(args[index + 1]);
            if (start === null) return { error: integerError() };
            const amount = parseInteger(args[index + 2]);
            if (amount === null) return { error: integerError() };
            offset = Math.max(start, 0);
            count = amount;
            index += 3;
            continue;
        }
        return { error: replyError('ERR syntax error') };
    }
    return { withScores, offset, count };
}

/** Applies a parsed `LIMIT` to one ordered result, where a negative count means all. */
function limitResult(entries, offset, count) {
    if (count < 0) return entries.slice(offset);
    return entries.slice(offset, offset + count);
}

/** Renders sorted-set entries as members, optionally interleaved with their score text. */
function renderZSet(entries, withScores) {
    const items = [];
    for (const [member, score] of entries) {
        items.push(bulk(member));
        if (withScores) items.push(bulk(scoreText(score)));
    }
    return array(items);
}

/** Plans one sorted-set range command over scores or lexicographic member bounds. */
function planZSetRange(store, session, name, args) {
    if (args.length < 4) return { error: wrongArity(name) };
    const reverse = name.startsWith('zrevrange');
    const lexicographic = name.includes('bylex');
    const allowScores = !lexicographic;
    const options = parseZRangeOptions(args, 4, allowScores);
    if (options.error !== undefined) return { error: options.error };
    let min;
    let max;
    if (lexicographic) {
        const first = parseLexBound(args[2]);
        const second = parseLexBound(args[3]);
        if (first === null || second === null) {
            return { error: replyError('ERR min or max not valid string range item') };
        }
        min = reverse ? second : first;
        max = reverse ? first : second;
    }
    else {
        const first = parseScoreBound(args[2]);
        const second = parseScoreBound(args[3]);
        if (first === null || second === null) return { error: replyError('ERR min or max is not a float') };
        min = reverse ? second : first;
        max = reverse ? first : second;
    }
    const db = session.db;
    const key = args[1];
    return {
        run: () => {
            const kind = kindOf(store, db, key);
            if (kind !== null && kind !== 'zset') return wrongType();
            if (kind === null) return array([]);
            const entries = readZSet(store, db, key);
            if (entries === null) return replyError('ERR stored zset value is corrupt');
            const ordered = entries.slice().sort((left, right) => (left[1] - right[1]) || Buffer.compare(left[0], right[0]));
            const matched = ordered.filter(([member, score]) => (lexicographic
                ? lexInRange(member, min, max)
                : scoreInRange(score, min, max)));
            if (reverse) matched.reverse();
            return renderZSet(limitResult(matched, options.offset, options.count), options.withScores);
        },
    };
}

/** Plans one sorted-set range removal and rewrites or deletes the key. */
function planZSetRemoveRange(store, session, name, args) {
    if (args.length !== 4) return { error: wrongArity(name) };
    const mode = name.endsWith('byrank') ? 'rank' : name.endsWith('byscore') ? 'score' : 'lex';
    let start = null;
    let stop = null;
    let min = null;
    let max = null;
    if (mode === 'rank') {
        start = parseInteger(args[2]);
        stop = parseInteger(args[3]);
        if (start === null || stop === null) return { error: integerError() };
    }
    else if (mode === 'score') {
        min = parseScoreBound(args[2]);
        max = parseScoreBound(args[3]);
        if (min === null || max === null) return { error: replyError('ERR min or max is not a float') };
    }
    else {
        min = parseLexBound(args[2]);
        max = parseLexBound(args[3]);
        if (min === null || max === null) {
            return { error: replyError('ERR min or max not valid string range item') };
        }
    }
    const db = session.db;
    const key = args[1];
    return {
        run: () => {
            const kind = kindOf(store, db, key);
            if (kind !== null && kind !== 'zset') return wrongType();
            if (kind === null) return integer(0);
            const entries = readZSet(store, db, key);
            if (entries === null) return replyError('ERR stored zset value is corrupt');
            let kept;
            if (mode === 'rank') {
                const ordered = entries.slice().sort((left, right) => (left[1] - right[1]) || Buffer.compare(left[0], right[0]));
                const length = ordered.length;
                const begin = start < 0 ? Math.max(0, length + start) : start;
                const end = stop < 0 ? length + stop : Math.min(stop, length - 1);
                if (begin > end || begin >= length || end < 0) return integer(0);
                const removed = new Set(ordered.slice(begin, end + 1).map(([member]) => text(member)));
                kept = entries.filter(([member]) => !removed.has(text(member)));
            }
            else if (mode === 'score') {
                kept = entries.filter(([, score]) => !scoreInRange(score, min, max));
            }
            else {
                kept = entries.filter(([member]) => !lexInRange(member, min, max));
            }
            const removedCount = entries.length - kept.length;
            if (removedCount === 0) return integer(0);
            if (kept.length === 0) store.deleteKind(db, SUFFIX.zset, key);
            else {
                const body = encodeZSet(kept);
                if (body === null) return replyError('ERR zset value exceeds the storage limit');
                rewriteKind(store, db, 'zset', key, body);
            }
            return integer(removedCount);
        },
    };
}

/** Plans `ZRANDMEMBER`, whose optional count controls repeats and score rendering. */
function planZRandMember(store, session, args) {
    if (args.length < 2 || args.length > 4) return { error: wrongArity('zrandmember') };
    let count = null;
    let withScores = false;
    if (args.length >= 3) {
        count = parseInteger(args[2]);
        if (count === null) return { error: integerError() };
        if (args.length === 4) {
            if (text(args[3]).toLowerCase() !== 'withscores') return { error: replyError('ERR syntax error') };
            withScores = true;
        }
        else {
            withScores = false;
        }
    }
    const db = session.db;
    const key = args[1];
    return {
        run: () => {
            const kind = kindOf(store, db, key);
            if (kind !== null && kind !== 'zset') return wrongType();
            const entries = kind === null ? [] : readZSet(store, db, key);
            if (entries === null) return replyError('ERR stored zset value is corrupt');
            if (count === null) {
                if (entries.length === 0) return nullReply();
                return bulk(randomMember(entries)[0]);
            }
            const picked = sampleMembers(entries, count);
            return renderZSet(picked, withScores);
        },
    };
}

/**
 * Plans one sorted-set aggregate: union, intersection or difference, optionally stored.
 *
 * Sources are read before the destination is touched, so a wrong type aborts the
 * whole command, and the store forms drop every representation plus the deadline
 * the destination may hold.
 */
function planZSetAggregate(store, session, name, args) {
    const db = session.db;
    if (name === 'zunionstore' || name === 'zinterstore') {
        if (args.length < 4) return { error: wrongArity(name) };
        const plan = parseZSetStorePlan(args);
        if (plan.error !== undefined) return { error: plan.error };
        const destination = args[1];
        const mode = name === 'zunionstore' ? 'union' : 'inter';
        return {
            run: () => {
                const sets = readZSetsForAggregate(store, db, plan.keys);
                if (sets === null) return wrongType();
                return storeZSetResult(store, db, destination, combineZSets(sets, plan.weights, plan.aggregate, mode));
            },
        };
    }
    if (name === 'zdiff' || name === 'zdiffstore') {
        const keeps = name === 'zdiffstore';
        const numkeysIndex = keeps ? 2 : 1;
        if (keeps ? args.length < 4 : args.length < 3) return { error: wrongArity(name) };
        const numkeys = parseInteger(args[numkeysIndex]);
        if (numkeys === null || numkeys <= 0) {
            return { error: replyError(`ERR at least 1 input key is needed for ${keeps ? 'ZDIFFSTORE' : 'ZDIFF'}`) };
        }
        if (args.length < numkeysIndex + 1 + numkeys) return { error: replyError('ERR syntax error') };
        const keys = args.slice(numkeysIndex + 1, numkeysIndex + 1 + numkeys);
        const next = numkeysIndex + 1 + numkeys;
        let withScores = false;
        if (keeps) {
            if (next !== args.length) return { error: replyError('ERR syntax error') };
        }
        else if (args.length - next === 1) {
            if (text(args[next]).toLowerCase() !== 'withscores') return { error: replyError('ERR syntax error') };
            withScores = true;
        }
        else if (args.length - next > 1) {
            return { error: replyError('ERR syntax error') };
        }
        const destination = keeps ? args[1] : null;
        return {
            run: () => {
                const sets = readZSetsForAggregate(store, db, keys);
                if (sets === null) return wrongType();
                const result = combineZSets(sets, keys.map(() => 1), 'sum', 'diff');
                if (keeps) return storeZSetResult(store, db, destination, result);
                return renderZSet(result, withScores);
            },
        };
    }
    // zintercard counts only the intersection and never reads scores.
    if (args.length < 3) return { error: wrongArity('zintercard') };
    const numkeys = parseInteger(args[1]);
    if (numkeys === null || numkeys <= 0) {
        return { error: replyError('ERR numkeys should be greater than 0') };
    }
    if (args.length < 2 + numkeys) {
        return { error: replyError("ERR Number of keys can't be greater than number of args") };
    }
    const keys = args.slice(2, 2 + numkeys);
    let limit = 0;
    const next = 2 + numkeys;
    if (next < args.length) {
        if (text(args[next]).toLowerCase() !== 'limit' || next + 2 !== args.length) {
            return { error: replyError('ERR syntax error') };
        }
        limit = parseInteger(args[next + 1]);
        if (limit === null) return { error: integerError() };
        if (limit < 0) return { error: replyError("ERR LIMIT can't be negative") };
    }
    return {
        run: () => {
            const sets = readZSetsForAggregate(store, db, keys);
            if (sets === null) return wrongType();
            if (sets.length === 0) return integer(0);
            let found = 0;
            for (const [member] of sets[0]) {
                if (!sets.slice(1).every(set => set.some(([candidate]) => candidate.equals(member)))) continue;
                found += 1;
                if (limit > 0 && found >= limit) break;
            }
            return integer(found);
        },
    };
}

/** Parses `numkeys` plus optional `WEIGHTS` and `AGGREGATE` for the sorted-set stores. */
function parseZSetStorePlan(args) {
    const numkeys = parseInteger(args[2]);
    if (numkeys === null || numkeys <= 0) {
        return { error: replyError('ERR at least 1 input key is needed for ZUNIONSTORE/ZINTERSTORE') };
    }
    if (args.length < 3 + numkeys) return { error: replyError('ERR syntax error') };
    const keys = args.slice(3, 3 + numkeys);
    const weights = keys.map(() => 1);
    let aggregate = 'sum';
    let index = 3 + numkeys;
    while (index < args.length) {
        const option = text(args[index]).toLowerCase();
        if (option === 'weights') {
            if (index + numkeys >= args.length) return { error: replyError('ERR syntax error') };
            for (let slot = 0; slot < numkeys; slot += 1) {
                const weight = parseScore(args[index + 1 + slot]);
                if (weight === null) return { error: replyError('ERR weight value is not a float') };
                weights[slot] = weight;
            }
            index += 1 + numkeys;
            continue;
        }
        if (option === 'aggregate') {
            const mode = args[index + 1] === undefined ? '' : text(args[index + 1]).toLowerCase();
            if (mode !== 'sum' && mode !== 'min' && mode !== 'max') {
                return { error: replyError('ERR syntax error') };
            }
            aggregate = mode;
            index += 2;
            continue;
        }
        return { error: replyError('ERR syntax error') };
    }
    return { keys, weights, aggregate };
}

/** Reads every named sorted set, `null` when one holds another kind or a corrupt body. */
function readZSetsForAggregate(store, db, keys) {
    const sets = [];
    for (const key of keys) {
        const kind = kindOf(store, db, key);
        if (kind === null) {
            sets.push([]);
            continue;
        }
        if (kind !== 'zset') return null;
        const entries = readZSet(store, db, key);
        if (entries === null) return null;
        sets.push(entries);
    }
    return sets;
}

/** Computes the weighted union, intersection or difference, sorted by score then member. */
function combineZSets(sets, weights, aggregate, mode) {
    const weighted = (score, weight) => {
        const value = score * weight;
        return Number.isNaN(value) ? 0 : value;
    };
    const combine = (left, right) => {
        const value = aggregate === 'min' ? Math.min(left, right) : aggregate === 'max' ? Math.max(left, right) : left + right;
        return Number.isNaN(value) ? 0 : value;
    };
    const result = [];
    if (mode === 'union') {
        sets.forEach((set, index) => {
            const weight = weights[index] ?? 1;
            for (const [member, score] of set) {
                const value = weighted(score, weight);
                const hit = result.find(([existing]) => existing.equals(member));
                if (hit === undefined) result.push([member, value]);
                else hit[1] = combine(hit[1], value);
            }
        });
    }
    else if (mode === 'inter') {
        if (sets.length > 0) {
            for (const [member, score] of sets[0]) {
                let combined = weighted(score, weights[0] ?? 1);
                let present = true;
                for (let index = 1; index < sets.length; index += 1) {
                    const hit = sets[index].find(([candidate]) => candidate.equals(member));
                    if (hit === undefined) {
                        present = false;
                        break;
                    }
                    combined = combine(combined, weighted(hit[1], weights[index] ?? 1));
                }
                if (present) result.push([member, combined]);
            }
        }
    }
    else if (sets.length > 0) {
        for (const [member, score] of sets[0]) {
            if (sets.slice(1).some(set => set.some(([candidate]) => candidate.equals(member))) === false) {
                result.push([member, score]);
            }
        }
    }
    sortZSet(result);
    return result;
}

/** Overwrites the store destination: an empty result removes the key entirely. */
function storeZSetResult(store, db, destination, result) {
    dropEveryKind(store, db, destination);
    if (result.length === 0) return integer(0);
    const body = encodeZSet(result);
    if (body === null) return replyError('ERR zset value exceeds the storage limit');
    store.setKind(db, 'zset', destination, body, null);
    return integer(result.length);
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
        case 'hsetnx': {
            if (args.length !== 4) return { error: wrongArity('hsetnx') };
            const field = args[2];
            const value = args[3];
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind !== null && kind !== 'hash') return wrongType();
                    const fields = kind === null ? [] : readHash(store, db, key);
                    if (fields === null) return replyError('ERR stored hash value is corrupt');
                    if (fields.some(([name]) => name.equals(field))) return integer(0);
                    fields.push([field, value]);
                    const body = encodeHash(fields);
                    if (body === null) return replyError('ERR hash value exceeds the storage limit');
                    rewriteKind(store, db, 'hash', key, body);
                    return integer(1);
                },
            };
        }

        case 'hkeys':
        case 'hvals': {
            if (args.length !== 2) return { error: wrongArity(name) };
            const byName = name === 'hkeys';
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind !== null && kind !== 'hash') return wrongType();
                    if (kind === null) return array([]);
                    const fields = readHash(store, db, key);
                    if (fields === null) return replyError('ERR stored hash value is corrupt');
                    return array(fields.map(([field, value]) => bulk(byName ? field : value)));
                },
            };
        }

        case 'hexists': {
            if (args.length !== 3) return { error: wrongArity('hexists') };
            const field = args[2];
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind !== null && kind !== 'hash') return wrongType();
                    if (kind === null) return integer(0);
                    const fields = readHash(store, db, key);
                    if (fields === null) return replyError('ERR stored hash value is corrupt');
                    return integer(fields.some(([name]) => name.equals(field)) ? 1 : 0);
                },
            };
        }

        case 'hincrbyfloat': {
            if (args.length !== 4) return { error: wrongArity('hincrbyfloat') };
            const increment = parseFloatText(args[3]);
            if (increment === null || !Number.isFinite(increment)) {
                return { error: replyError('ERR value is not a valid float') };
            }
            const field = args[2];
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind !== null && kind !== 'hash') return wrongType();
                    const fields = kind === null ? [] : readHash(store, db, key);
                    if (fields === null) return replyError('ERR stored hash value is corrupt');
                    const position = fields.findIndex(([name]) => name.equals(field));
                    let current = 0;
                    if (position >= 0) {
                        const parsed = parseFloatText(fields[position][1]);
                        if (parsed === null || Number.isNaN(parsed)) {
                            return replyError('ERR hash value is not a float');
                        }
                        current = parsed;
                    }
                    const updated = current + increment;
                    if (!Number.isFinite(updated)) {
                        return replyError('ERR increment would produce NaN or Infinity');
                    }
                    const value = Buffer.from(scoreText(updated), 'utf8');
                    if (position >= 0) fields[position] = [field, value];
                    else fields.push([field, value]);
                    const body = encodeHash(fields);
                    if (body === null) return replyError('ERR hash value exceeds the storage limit');
                    rewriteKind(store, db, 'hash', key, body);
                    return bulk(value);
                },
            };
        }

        case 'hrandfield': {
            if (args.length < 2 || args.length > 4) return { error: wrongArity('hrandfield') };
            let count = null;
            let withValues = false;
            if (args.length >= 3) {
                count = parseInteger(args[2]);
                if (count === null) return { error: integerError() };
                if (args.length === 4) {
                    if (text(args[3]).toLowerCase() !== 'withvalues') return { error: replyError('ERR syntax error') };
                    withValues = true;
                }
            }
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind !== null && kind !== 'hash') return wrongType();
                    const fields = kind === null ? [] : readHash(store, db, key);
                    if (fields === null) return replyError('ERR stored hash value is corrupt');
                    if (count === null) {
                        if (fields.length === 0) return nullReply();
                        return bulk(randomMember(fields)[0]);
                    }
                    const items = [];
                    for (const [field, value] of sampleMembers(fields, count)) {
                        items.push(bulk(field));
                        if (withValues) items.push(bulk(value));
                    }
                    return array(items);
                },
            };
        }

        case 'hscan': {
            if (args.length < 3) return { error: wrongArity('hscan') };
            const cursor = parseScanCursor(args[2]);
            if (cursor === null) return { error: replyError('ERR invalid cursor') };
            const options = parseScanOptions(args, 3);
            if (options.error !== undefined) return { error: options.error };
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind !== null && kind !== 'hash') return wrongType();
                    const fields = kind === null ? [] : readHash(store, db, key);
                    if (fields === null) return replyError('ERR stored hash value is corrupt');
                    return scanReply(
                        fields,
                        cursor,
                        options.count,
                        options.pattern,
                        entry => entry[0],
                        entry => [bulk(entry[0]), bulk(entry[1])],
                    );
                },
            };
        }

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

        case 'linsert': {
            if (args.length !== 5) return { error: wrongArity('linsert') };
            const where = text(args[2]).toLowerCase();
            if (where !== 'before' && where !== 'after') return { error: replyError('ERR syntax error') };
            const pivot = args[3];
            const element = args[4];
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind !== null && kind !== 'list') return wrongType();
                    if (kind === null) return integer(0);
                    const elements = readList(store, db, key);
                    if (elements === null) return replyError('ERR stored list value is corrupt');
                    const position = elements.findIndex(entry => entry.equals(pivot));
                    if (position < 0) return integer(-1);
                    const at = where === 'before' ? position : position + 1;
                    const updated = elements.slice(0, at).concat([element], elements.slice(at));
                    const body = encodeList(updated);
                    if (body === null) return replyError('ERR list value exceeds the storage limit');
                    rewriteKind(store, db, 'list', key, body);
                    return integer(updated.length);
                },
            };
        }

        case 'lmpop': {
            if (args.length < 4) return { error: wrongArity('lmpop') };
            const count = parseInteger(args[1]);
            if (count === null || count <= 0) {
                return { error: replyError('ERR numkeys should be greater than 0') };
            }
            if (count > args.length - 2) {
                return { error: replyError("ERR Number of keys can't be greater than number of args") };
            }
            const keys = args.slice(2, 2 + count);
            const sideIndex = 2 + count;
            const side = text(args[sideIndex]).toLowerCase();
            if (side !== 'left' && side !== 'right') return { error: replyError('ERR syntax error') };
            let amount = 1;
            if (sideIndex + 1 < args.length) {
                if (text(args[sideIndex + 1]).toLowerCase() !== 'count' || sideIndex + 3 !== args.length) {
                    return { error: replyError('ERR syntax error') };
                }
                const requested = parseInteger(args[sideIndex + 2]);
                if (requested === null || requested <= 0) {
                    return { error: replyError('ERR count should be greater than 0') };
                }
                amount = requested;
            }
            return {
                run: () => {
                    for (const candidate of keys) {
                        const kind = kindOf(store, db, candidate);
                        if (kind === null) continue;
                        if (kind !== 'list') return wrongType();
                        const elements = readList(store, db, candidate);
                        if (elements === null) return replyError('ERR stored list value is corrupt');
                        if (elements.length === 0) continue;
                        const take = Math.min(amount, elements.length);
                        const popped = side === 'left' ? elements.slice(0, take) : elements.slice(-take).reverse();
                        const kept = side === 'left' ? elements.slice(take) : elements.slice(0, elements.length - take);
                        if (kept.length === 0) {
                            store.deleteKind(db, SUFFIX.list, candidate);
                        }
                        else {
                            const body = encodeList(kept);
                            if (body === null) return replyError('ERR list value exceeds the storage limit');
                            rewriteKind(store, db, 'list', candidate, body);
                        }
                        return array([bulk(candidate), array(popped.map(element => bulk(element)))]);
                    }
                    return nullArray();
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

        case 'smove': {
            if (args.length !== 4) return { error: wrongArity('smove') };
            const source = args[1];
            const destination = args[2];
            const member = args[3];
            return {
                run: () => {
                    const sourceKind = kindOf(store, db, source);
                    const destinationKind = kindOf(store, db, destination);
                    if ((sourceKind !== null && sourceKind !== 'set')
                        || (destinationKind !== null && destinationKind !== 'set')) {
                        return wrongType();
                    }
                    if (sourceKind === null) return integer(0);
                    const sourceMembers = readSet(store, db, source);
                    if (sourceMembers === null) return replyError('ERR stored set value is corrupt');
                    const position = sourceMembers.findIndex(entry => entry.equals(member));
                    if (position < 0) return integer(0);
                    if (source.equals(destination)) return integer(1);
                    const kept = sourceMembers.filter((entry, index) => index !== position);
                    if (kept.length === 0) {
                        store.deleteKind(db, SUFFIX.set, source);
                    }
                    else {
                        const body = encodeSet(kept);
                        if (body === null) return replyError('ERR set value exceeds the storage limit');
                        rewriteKind(store, db, 'set', source, body);
                    }
                    const destinationMembers = destinationKind === null ? [] : readSet(store, db, destination);
                    if (destinationMembers === null) return replyError('ERR stored set value is corrupt');
                    if (!destinationMembers.some(entry => entry.equals(member))) destinationMembers.push(member);
                    const body = encodeSet(destinationMembers);
                    if (body === null) return replyError('ERR set value exceeds the storage limit');
                    rewriteKind(store, db, 'set', destination, body);
                    return integer(1);
                },
            };
        }

        case 'srandmember': {
            if (args.length !== 2 && args.length !== 3) return { error: wrongArity('srandmember') };
            let count = null;
            if (args.length === 3) {
                count = parseInteger(args[2]);
                if (count === null) return { error: integerError() };
            }
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind !== null && kind !== 'set') return wrongType();
                    const members = kind === null ? [] : readSet(store, db, key);
                    if (members === null) return replyError('ERR stored set value is corrupt');
                    if (count === null) return members.length === 0 ? nullReply() : bulk(randomMember(members));
                    return array(sampleMembers(members, count).map(member => bulk(member)));
                },
            };
        }

        case 'sscan': {
            if (args.length < 3) return { error: wrongArity('sscan') };
            const cursor = parseScanCursor(args[2]);
            if (cursor === null) return { error: replyError('ERR invalid cursor') };
            const options = parseScanOptions(args, 3);
            if (options.error !== undefined) return { error: options.error };
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind !== null && kind !== 'set') return wrongType();
                    const members = kind === null ? [] : readSet(store, db, key);
                    if (members === null) return replyError('ERR stored set value is corrupt');
                    return scanReply(members, cursor, options.count, options.pattern, member => member, member => [bulk(member)]);
                },
            };
        }

        case 'zscan': {
            if (args.length < 3) return { error: wrongArity('zscan') };
            const cursor = parseScanCursor(args[2]);
            if (cursor === null) return { error: replyError('ERR invalid cursor') };
            const options = parseScanOptions(args, 3);
            if (options.error !== undefined) return { error: options.error };
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind !== null && kind !== 'zset') return wrongType();
                    const entries = kind === null ? [] : readZSet(store, db, key);
                    if (entries === null) return replyError('ERR stored zset value is corrupt');
                    return scanReply(
                        entries,
                        cursor,
                        options.count,
                        options.pattern,
                        entry => entry[0],
                        entry => [bulk(entry[0]), bulk(scoreText(entry[1]))],
                    );
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
