//! Command semantics composed on top of the native primitives.
//!
//! Every command is planned first and executed second, so a transaction can
//! reject a malformed command while queuing and replay only valid commands.

import { parseInteger } from './native.js';
import { array, bulk, error as replyError, integer, map, nullArray, nullReply, push, simple } from './reply.js';

const DATABASES = 16;

const integerError = () => replyError('ERR value is not an integer or out of range');
const wrongArity = name => replyError(`ERR wrong number of arguments for '${name}' command`);
/** Upstream names the command in every arity error, so unknown names keep the sent spelling. */
const unknownCommand = args => {
    const shown = args.slice(1).map(arg => `'${text(arg)}'`).join(' ');
    const name = text(args[0]);
    return replyError(shown.length === 0
        ? `ERR unknown command '${name}'`
        : `ERR unknown command '${name}', with args beginning with: ${shown} `);
};

/** Value kinds of one logical key, in probe order. */
const KINDS = ['string', 'hash', 'list', 'set', 'zset', 'stream'];
/** Storage namespace suffix of each value kind. */
const SUFFIX = { string: '', hash: 'hash', list: 'list', set: 'set', zset: 'zset', stream: 'stream' };
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

/** Decimal places the server prints for `HINCRBYFLOAT` results. */
const LONG_DOUBLE_PLACES = 10n ** 17n;
/** Significand width and exponent window of the x87 `long double` the server uses. */
const LONG_DOUBLE_BITS = 64;
const LONG_DOUBLE_MAX_EXPONENT = 16320;
const LONG_DOUBLE_MIN_EXPONENT = -16508;

/** Bit count of a non-negative BigInt. */
function bitLengthOf(value) {
    return value === 0n ? 0 : value.toString(2).length;
}

/** Divides two BigInts, rounding halves to the even neighbour. */
function divideHalfEven(numerator, denominator) {
    let quotient = numerator / denominator;
    const remainder = numerator % denominator;
    const doubled = remainder * 2n;
    if (doubled > denominator || (doubled === denominator && (quotient & 1n) === 1n)) quotient += 1n;
    return quotient;
}

/** Rounds `magnitude * 2^exponent` down to the 64-bit significand the CPU keeps. */
function roundToLongDouble(magnitude, exponent) {
    if (magnitude === 0n) return { m: 0n, e: 0 };
    const bits = bitLengthOf(magnitude);
    if (bits <= LONG_DOUBLE_BITS) return { m: magnitude, e: exponent };
    const shift = BigInt(bits - LONG_DOUBLE_BITS);
    let m = magnitude >> shift;
    const rest = magnitude - (m << shift);
    const halfway = 1n << (shift - 1n);
    if (rest > halfway || (rest === halfway && (m & 1n) === 1n)) m += 1n;
    let e = exponent + Number(shift);
    if (bitLengthOf(m) > LONG_DOUBLE_BITS) {
        m >>= 1n;
        e += 1;
    }
    return { m, e };
}

/**
 * Parses one decimal exactly the way the server's `long double` reader does.
 *
 * `null` is text the reader rejects, `{inf}` a signed infinity, and `{m, e,
 * negative}` the finite value `±m * 2^e` rounded to 64 significand bits.
 */
function parseLongDouble(raw) {
    const value = text(raw);
    if (/^[+-]?(?:inf(?:inity)?)$/i.test(value)) {
        return { inf: value.startsWith('-') ? -1 : 1 };
    }
    const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(value);
    if (match === null) return null;
    const negative = match[1] === '-';
    const fraction = match[3] ?? match[4] ?? '';
    const digits = `${match[2] ?? ''}${fraction}`;
    const magnitude = digits === '' ? 0n : BigInt(digits);
    if (magnitude === 0n) return { m: 0n, e: 0, negative: false };
    const exponent10 = Number(match[5] ?? 0) - fraction.length;
    // The reader overflows past ~1e4932 and underflows below ~1e-4951.
    if (exponent10 + digits.length > 4933) return { inf: negative ? -1 : 1 };
    if (exponent10 + digits.length < -4952) return { m: 0n, e: 0, negative: false };
    const numerator = exponent10 >= 0 ? magnitude * 10n ** BigInt(exponent10) : magnitude;
    const denominator = exponent10 >= 0 ? 1n : 10n ** BigInt(-exponent10);
    let exponent = bitLengthOf(numerator) - bitLengthOf(denominator) - LONG_DOUBLE_BITS;
    let rounded = 0n;
    for (;;) {
        const scaledNumerator = exponent >= 0 ? numerator : numerator << BigInt(-exponent);
        const scaledDenominator = exponent >= 0 ? denominator << BigInt(exponent) : denominator;
        rounded = divideHalfEven(scaledNumerator, scaledDenominator);
        if (rounded >= 1n << 64n) {
            exponent += 1;
            continue;
        }
        if (rounded !== 0n && rounded < 1n << 63n) {
            exponent -= 1;
            continue;
        }
        break;
    }
    if (exponent > LONG_DOUBLE_MAX_EXPONENT) return { inf: negative ? -1 : 1 };
    if (exponent < LONG_DOUBLE_MIN_EXPONENT) return { m: 0n, e: 0, negative: false };
    return { m: rounded, e: exponent, negative };
}

/** Adds two parsed long doubles, answering `{nan}` for infinity minus infinity. */
function addLongDoubles(left, right) {
    const leftInf = left.inf ?? 0;
    const rightInf = right.inf ?? 0;
    if (leftInf !== 0 || rightInf !== 0) {
        if (leftInf !== 0 && rightInf !== 0) return leftInf === rightInf ? { inf: leftInf } : { nan: true };
        return { inf: leftInf !== 0 ? leftInf : rightInf };
    }
    const exponent = Math.min(left.e, right.e);
    const leftScaled = (left.negative ? -1n : 1n) * (left.m << BigInt(left.e - exponent));
    const rightScaled = (right.negative ? -1n : 1n) * (right.m << BigInt(right.e - exponent));
    const sum = leftScaled + rightScaled;
    if (sum === 0n) return { m: 0n, e: 0, negative: false };
    const negative = sum < 0n;
    const rounded = roundToLongDouble(negative ? -sum : sum, exponent);
    if (rounded.e > LONG_DOUBLE_MAX_EXPONENT) return { inf: negative ? -1 : 1 };
    if (rounded.e < LONG_DOUBLE_MIN_EXPONENT) return { m: 0n, e: 0, negative: false };
    return { m: rounded.m, e: rounded.e, negative };
}

/** Renders one long double with the server's `%.17Lf` plus trailing-zero trim. */
function longDoubleText(value) {
    if (value.m === 0n) return '0';
    const scaled = value.e >= 0
        ? (value.m << BigInt(value.e)) * LONG_DOUBLE_PLACES
        : divideHalfEven(value.m * LONG_DOUBLE_PLACES, 1n << BigInt(-value.e));
    if (scaled === 0n) return '0';
    const digitsText = String(scaled).padStart(18, '0');
    const whole = digitsText.slice(0, -17);
    const fraction = digitsText.slice(-17).replace(/0+$/, '');
    const body = fraction.length === 0 ? whole : `${whole}.${fraction}`;
    return value.negative ? `-${body}` : body;
}

/**
 * Parses a blocking timeout in seconds.
 *
 * `0` means wait forever. Negative values and anything that is not a finite
 * decimal answer the upstream error strings.
 */
function parseBlockingTimeout(raw) {
    const value = parseFloatText(raw);
    if (value === null || !Number.isFinite(value)) {
        return { error: 'ERR timeout is not a float or out of range' };
    }
    if (value < 0) {
        return { error: 'ERR timeout is negative' };
    }
    return { timeoutMs: value === 0 ? 0 : value * 1000 };
}

/** Wakes consumers parked on `key` once a push has landed. */
function notifyPush(session, db, key) {
    session.hub?.wake(db, key);
}

/**
 * Wraps one blocking attempt into the descriptor `startServer` parks.
 *
 * `attempt` returns a reply specification when it can claim a value and `null`
 * while the key is still empty. `run` is the non-blocking form used inside
 * `EXEC`, where upstream Redis answers the timeout reply at once.
 */
function blockingPlan(db, keys, timeoutMs, attempt, timeoutReply) {
    return {
        block: { db, keys, timeoutMs, attempt, timeoutReply },
        run: () => attempt() ?? timeoutReply,
    };
}

/** Live hash fields, `[]` when the hash is missing and `null` when the body is corrupt. */
function readHash(store, db, key) {
    const body = store.getKind(db, SUFFIX.hash, key);
    return body === null || body === undefined ? [] : decodeHash(body);
}

/** Replaces one kind while carrying the deadline it already holds. */
function rewriteKind(store, db, kind, key, body) {
    const expiresAt = store.deadlineKind(db, SUFFIX[kind], key);
    store.setKind(db, SUFFIX[kind], key, body, expiresAt ?? null);
}

function commandName(args) {
    return args[0].toString('utf8').toLowerCase();
}

/**
 * Plans `PFADD` / `PFCOUNT` / `PFMERGE`.
 *
 * Arity stays here because a transaction rejects a malformed command while it is
 * queued. Element hashing, register updates, estimation and reply framing all run
 * upstream.
 */
function planHyperLogLog(store, session, name, args) {
    if (args.length < 2) return { error: wrongArity(name) };
    return { run: () => store.hyperloglogCommand(session.db, args) };
}

function text(buffer) {
    return buffer.toString('utf8');
}

function hello(protocol, id) {
    return map([
        ['server', bulk('redis')],
        ['version', bulk('7.4.0')],
        ['proto', integer(protocol)],
        ['id', integer(id ?? 1)],
        ['mode', bulk('standalone')],
        ['role', bulk('master')],
        ['modules', array([])],
    ]);
}

/** Executes one command and returns the reply specification. */
export function execute(store, session, args) {
    if (args.length === 0) {
        // An empty multibulk request is a no-op on the real server: no reply,
        // and the connection stays open for the next command.
        return { reply: undefined };
    }
    const name = commandName(args);

    // RESP2 subscriber mode: only the pub/sub verbs, PING, QUIT and RESET may run.
    // RESP3 dropped the restriction and runs any command while subscribed.
    // Following Redis, an unknown `PUBSUB` subcommand is reported before the
    // restriction, and a known one is named `pubsub|<subcommand>`.
    if (session.protocol === 2 && subscribed(session) && !SUBSCRIBER_COMMANDS.has(name)) {
        const subcommand = name === 'pubsub' ? pubsubSubcommand(args) : null;
        if (name === 'pubsub') {
            const unknown = pubsubSubcommandError(args, subcommand);
            if (unknown !== null) return { reply: unknown };
        }
        const context = subcommand === null ? name : `pubsub|${subcommand}`;
        return {
            reply: replyError(
                `ERR Can't execute '${context}': only (P|S)SUBSCRIBE / (P|S)UNSUBSCRIBE / PING / QUIT / RESET are allowed in this context`,
            ),
        };
    }

    if (name === 'quit') {
        // The connection layer accepts QUIT with any extra arguments and always
        // answers OK before closing, so there is no arity check here.
        return { reply: simple('OK'), close: true };
    }
    if (name === 'hello') {
        return helloCommand(session, args);
    }
    if (name === 'reset') {
        if (args.length !== 1) {
            return { reply: wrongArity('reset') };
        }
        session.subscriptions?.channels.clear();
        session.subscriptions?.patterns.clear();
        session.queued = null;
        session.protocol = 2;
        session.db = 0;
        return { reply: simple('RESET') };
    }
    if (name === 'multi') {
        if (args.length !== 1) {
            return { reply: wrongArity('multi') };
        }
        if (session.queued) {
            return { reply: replyError('ERR MULTI calls can not be nested') };
        }
        session.queued = [];
        session.multiError = false;
        return { reply: simple('OK') };
    }
    if (name === 'exec') {
        if (!session.queued) {
            return { reply: replyError('ERR EXEC without MULTI') };
        }
        const queued = session.queued;
        const dirty = session.multiError === true;
        session.queued = null;
        session.multiError = false;
        if (dirty) {
            return { reply: replyError('EXECABORT Transaction discarded because of previous errors.') };
        }
        return { reply: array(queued.map(run => run())) };
    }
    if (name === 'discard') {
        if (!session.queued) {
            return { reply: replyError('ERR DISCARD without MULTI') };
        }
        session.queued = null;
        session.multiError = false;
        return { reply: simple('OK') };
    }

    const planned = plan(store, session, name, args);
    if (planned.error) {
        // A command rejected while queued poisons the transaction: EXEC answers
        // EXECABORT and drops every command queued so far.
        if (session.queued) session.multiError = true;
        return { reply: planned.error };
    }
    if (planned.frames !== undefined) {
        return { frames: planned.frames() };
    }
    if (session.queued) {
        session.queued.push(planned.run);
        return { reply: simple('QUEUED') };
    }
    if (planned.block !== undefined) {
        // A blocking command tries once before parking. Without a hub (the
        // conformance harness drives `execute` directly) it keeps the shape of
        // the timeout reply but never waits.
        const immediate = planned.block.attempt();
        if (immediate !== null) {
            return { reply: immediate };
        }
        if (session.hub === undefined) {
            return { reply: planned.block.timeoutReply };
        }
        return { block: planned.block };
    }
    const outcome = planned.run();
    if (outcome !== null && typeof outcome === 'object' && outcome.close !== undefined) {
        return { reply: outcome.reply, close: outcome.close, killed: outcome.killed };
    }
    return { reply: outcome };
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
    return { reply: hello(protocol, session.id) };
}

function plan(store, session, name, args) {
    switch (name) {
        case 'ping':
            if (args.length > 2) return { error: wrongArity('ping') };
            return {
                run: () => {
                    if (args.length === 2) return bulk(args[1]);
                    // A RESP2 subscriber gets the two-element `pong` array instead
                    // of the simple string. RESP3 keeps the ordinary reply.
                    if (session.protocol === 2 && subscribed(session)) {
                        return array([bulk('pong'), bulk('')]);
                    }
                    return simple('PONG');
                },
            };

        case 'subscribe':
            return args.length < 2 ? { error: wrongArity('subscribe') } : { frames: () => subscriptionFrames(session, args, false) };

        case 'unsubscribe':
            return { frames: () => subscriptionFrames(session, args, false, true) };

        case 'psubscribe':
            return args.length < 2 ? { error: wrongArity('psubscribe') } : { frames: () => subscriptionFrames(session, args, true) };

        case 'punsubscribe':
            return { frames: () => subscriptionFrames(session, args, true, true) };

        case 'publish':
            if (args.length !== 3) return { error: wrongArity('publish') };
            return { run: () => integer(publish(session, args[1], args[2])) };

        case 'pubsub':
            return planPubsub(session, args);

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
        case 'command':
        case 'info':
        case 'config':
        case 'acl':
            return { run: () => store.serverCommand(session.id ?? 0, session.db, session.protocol ?? 2, args) };

        case 'get':
        case 'set':
        case 'setnx':
        case 'setex':
        case 'psetex':
        case 'getset':
        case 'getdel':
        case 'getex':
        case 'mget':
        case 'mset':
        case 'del':
        case 'exists':
        case 'type':
        case 'strlen':
        case 'append':
        case 'getrange':
        case 'setrange':
        case 'incr':
        case 'decr':
        case 'incrby':
        case 'decrby':
        case 'incrbyfloat':
        case 'setbit':
        case 'getbit':
        case 'bitcount':
        case 'bitpos':
        case 'bitfield':
        case 'bitfield_ro':
        case 'ttl':
        case 'pttl':
        case 'expire':
        case 'pexpire':
        case 'expireat':
        case 'pexpireat':
        case 'expiretime':
        case 'pexpiretime':
        case 'persist':
        case 'rename':
        case 'renamenx':
        case 'copy':
        case 'keys':
        case 'scan':
        case 'randomkey':
        case 'dbsize':
        case 'flushdb':
        case 'flushall':
        case 'object':
            return planString(store, session, name, args);

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
        case 'lpos':
        case 'lpush':
        case 'rpush':
        case 'lrange':
        case 'lindex':
        case 'lpop':
        case 'rpop':
        case 'llen':
        case 'linsert':
        case 'lset':
        case 'ltrim':
        case 'lrem':
        case 'rpoplpush':
        case 'lmove':
        case 'lmpop':
        case 'blpop':
        case 'brpop':
        case 'blmove':
        case 'brpoplpush':
        case 'blmpop':
        case 'sadd':
        case 'srem':
        case 'smembers':
        case 'scard':
        case 'sismember':
        case 'smove':
        case 'srandmember':
        case 'sscan':
            return planCollection(store, session, name, args);

        case 'xadd':
        case 'xlen':
        case 'xrange':
        case 'xrevrange':
        case 'xdel':
        case 'xtrim':
            return planStream(store, session, name, args);

        case 'xread':
            return planXRead(store, session, args);

        case 'xgroup':
            return planXGroup(store, session, args);

        case 'xack':
            return planXAck(store, session, args);

        case 'xpending':
            return planXPending(store, session, args);

        case 'xclaim':
            return planXClaim(store, session, args);

        case 'xautoclaim':
            return planXAutoClaim(store, session, args);

        case 'xinfo':
            return planXInfo(store, session, args);

        case 'pfadd':
        case 'pfcount':
        case 'pfmerge':
            return planHyperLogLog(store, session, name, args);

        case 'zadd':
        case 'zincrby':
        case 'zcard':
        case 'zcount':
        case 'zlexcount':
        case 'zrange':
        case 'zrevrange':
        case 'zrangebyscore':
        case 'zrevrangebyscore':
        case 'zrangebylex':
        case 'zrevrangebylex':
        case 'zrangestore':
        case 'zrank':
        case 'zrevrank':
        case 'zrem':
        case 'zremrangebyrank':
        case 'zremrangebyscore':
        case 'zremrangebylex':
        case 'zscore':
        case 'zmscore':
        case 'zpopmin':
        case 'zpopmax':
        case 'zrandmember':
        case 'zscan':
        case 'zunionstore':
        case 'zinterstore':
        case 'zdiffstore':
        case 'zunion':
        case 'zinter':
        case 'zdiff':
        case 'zintercard':
        case 'zmpop':
        case 'bzpopmin':
        case 'bzpopmax':
        case 'bzmpop':
            return planZSet(store, session, name, args);

        case 'sort':
        case 'sort_ro':
            return planSort(store, session, name, args);

        case 'sinter':
        case 'sintercard':
        case 'sunion':
        case 'sdiff':
        case 'sinterstore':
        case 'sunionstore':
        case 'sdiffstore':
            return planSetAggregate(store, session, name, args);

        case 'spop':
            return planSPop(store, session, args);

        case 'smismember':
            return planSMisMember(store, session, args);

        default:
            return { error: unknownCommand(args) };
    }
}

/**
 * Matches `key` bytes against the Redis glob dialect `*`, `?`, `[...]` classes and
 * backslash escapes.
 *
 * A class may be negated with `[^...]` and hold `a-z` ranges, mirroring the gateway
 * `stringmatchlen` rules byte for byte.
 */
export function globMatch(pattern, key) {
    let patternIndex = 0;
    let keyIndex = 0;
    let star = -1;
    let resume = 0;
    while (keyIndex < key.length) {
        if (patternIndex < pattern.length) {
            const current = pattern[patternIndex];
            if (current === 0x3f) {
                patternIndex += 1;
                keyIndex += 1;
                continue;
            }
            if (current === 0x2a) {
                star = patternIndex;
                patternIndex += 1;
                resume = keyIndex;
                continue;
            }
            if (current === 0x5b) {
                const matched = classMatch(pattern, patternIndex, key[keyIndex]);
                if (matched[1]) {
                    patternIndex = matched[0];
                    keyIndex += 1;
                    continue;
                }
            }
            if (current === 0x5c && patternIndex + 1 < pattern.length && pattern[patternIndex + 1] === key[keyIndex]) {
                patternIndex += 2;
                keyIndex += 1;
                continue;
            }
            if (current === key[keyIndex]) {
                patternIndex += 1;
                keyIndex += 1;
                continue;
            }
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

/**
 * Matches one `[...]` class starting at `start`, returning the index past its `]` and
 * whether `byte` hit it. An unterminated class ends with the pattern, like Redis.
 */
function classMatch(pattern, start, byte) {
    let index = start + 1;
    const negated = pattern[index] === 0x5e;
    if (negated) index += 1;
    let matched = false;
    while (index < pattern.length) {
        if (pattern[index] === 0x5d) {
            index += 1;
            break;
        }
        if (pattern[index] === 0x5c && index + 1 < pattern.length) {
            if (pattern[index + 1] === byte) matched = true;
            index += 2;
            continue;
        }
        if (index + 2 < pattern.length && pattern[index + 1] === 0x2d) {
            let low = pattern[index];
            let high = pattern[index + 2];
            if (low > high) [low, high] = [high, low];
            if (byte >= low && byte <= high) matched = true;
            index += 3;
            continue;
        }
        if (pattern[index] === byte) matched = true;
        index += 1;
    }
    // Redis ends an unterminated class at the end of the pattern, so
    // `ks:user:[1` still matches `ks:user:1`.
    return [index, negated ? !matched : matched];
}

/** Queue-time arity of the string/key family, as `[minimum, maximum]` arguments. */
const STRING_ARITY = {
    get: [2, 2],
    set: [3, Infinity],
    setnx: [3, 3],
    setex: [4, 4],
    psetex: [4, 4],
    getset: [3, 3],
    getdel: [2, 2],
    getex: [2, Infinity],
    mget: [2, Infinity],
    mset: [3, Infinity],
    del: [2, Infinity],
    exists: [2, Infinity],
    type: [2, 2],
    strlen: [2, 2],
    append: [3, 3],
    getrange: [4, 4],
    setrange: [4, 4],
    incr: [2, 2],
    decr: [2, 2],
    incrby: [3, 3],
    decrby: [3, 3],
    incrbyfloat: [3, 3],
    setbit: [4, 4],
    getbit: [3, 3],
    bitcount: [2, 5],
    bitpos: [3, 6],
    bitfield: [2, Infinity],
    bitfield_ro: [2, Infinity],
    ttl: [2, 2],
    pttl: [2, 2],
    expire: [3, Infinity],
    pexpire: [3, Infinity],
    expireat: [3, Infinity],
    pexpireat: [3, Infinity],
    expiretime: [2, 2],
    pexpiretime: [2, 2],
    persist: [2, 2],
    rename: [3, 3],
    renamenx: [3, 3],
    copy: [3, Infinity],
    keys: [2, 2],
    scan: [2, Infinity],
    randomkey: [1, 1],
    dbsize: [1, 1],
    flushdb: [1, 2],
    flushall: [1, 2],
    object: [2, Infinity],
};

/**
 * Plans one string/key-family command.
 *
 * Arity and the two fixed-shape rules (`MSET` pairs, `BITCOUNT` ranges) stay here
 * because a transaction rejects a malformed command while it is queued. Option
 * parsing, type checks, storage and reply framing all run upstream.
 */
function planString(store, session, name, args) {
    const [minimum, maximum] = STRING_ARITY[name];
    const malformed = args.length < minimum
        || args.length > maximum
        || (name === 'mset' && args.length % 2 === 0)
        || (name === 'bitcount' && args.length === 3);
    if (malformed) return { error: wrongArity(name) };
    return { run: () => store.stringCommand(session.db, session.protocol ?? 2, args) };
}
/**
 * Plans one set aggregate: intersection, union or difference, optionally stored.
 *
 * Arity stays here because a transaction rejects a malformed command while it is
 * queued. Set algebra, type checks and reply framing all run upstream.
 */
function planSetAggregate(store, session, name, args) {
    if (name === 'sintercard') return planSInterCard(store, session, args);
    const keeps = name.endsWith('store');
    if (keeps ? args.length < 3 : args.length < 2) {
        return { error: wrongArity(name) };
    }
    const destination = keeps ? args[1] : null;
    const keys = keeps ? args.slice(2) : args.slice(1);
    const guarded = destination === null ? keys : [destination, ...keys];
    return { run: forwardSet(store, session, args, guarded) };
}

/**
 * Forwards one set request to the upstream facade after rejecting a stream key.
 *
 * The upstream type probe knows the five kinds its facade implements and has no
 * stream kind, so a stream operand is rejected here until the stream family moves
 * upstream. Without this guard a set write would fork the key into two live
 * representations.
 */
function forwardSet(store, session, args, keys) {
    return () => {
        for (const key of keys) {
            if (store.existsKind(session.db, SUFFIX.stream, key)) return wrongType();
        }
        return store.setCommand(session.db, session.protocol ?? 2, args);
    };
}

/** Runs one list request upstream, rejecting stream keys the facade has no kind for. */
function runListCommand(store, session, args, keys) {
    for (const key of keys) {
        if (store.existsKind(session.db, SUFFIX.stream, key)) return wrongType();
    }
    return store.listCommand(session.db, session.protocol ?? 2, args);
}

/** Forwards a list command and wakes anyone blocked on the keys it wrote. */
function forwardList(store, session, args, keys, notifyKeys = []) {
    return () => {
        const reply = runListCommand(store, session, args, keys);
        if (reply.type !== 'error') {
            for (const key of notifyKeys) notifyPush(session, session.db, key);
        }
        return reply;
    };
}

/** One non-blocking attempt for a blocking list command, mapping the empty reply to `null`. */
function forwardBlockingList(store, session, args, keys) {
    return () => {
        const reply = runListCommand(store, session, args, keys);
        if (reply.type === 'null' || reply.type === 'null-array') return null;
        return reply;
    };
}

/** Forwards one zset request to the upstream facade after rejecting a stream key. */
function forwardZSet(store, session, args, keys) {
    return () => {
        for (const key of keys) {
            if (store.existsKind(session.db, SUFFIX.stream, key)) return wrongType();
        }
        return store.zsetCommand(session.db, session.protocol ?? 2, args);
    };
}

/** One non-blocking attempt for a blocking zset command, mapping the empty reply to `null`. */
function forwardBlockingZSet(store, session, args, keys) {
    return () => {
        const reply = forwardZSet(store, session, args, keys)();
        if (reply.type === 'null' || reply.type === 'null-array') return null;
        return reply;
    };
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
    const index = 2 + count;
    if (index < args.length) {
        if (text(args[index]).toLowerCase() !== 'limit' || index + 2 !== args.length) {
            return { error: replyError('ERR syntax error') };
        }
        const limit = parseInteger(args[index + 1]);
        if (limit === null || limit < 0) return { error: replyError("ERR LIMIT can't be negative") };
    }
    return { run: forwardSet(store, session, args, args.slice(2, 2 + count)) };
}

/** Plans `SPOP`, whose optional count decides between the bulk and set reply forms. */
function planSPop(store, session, args) {
    if (args.length < 2 || args.length > 3) return { error: wrongArity('spop') };
    if (args.length === 3) {
        const count = parseInteger(args[2]);
        if (count === null) return { error: replyError('ERR value is not an integer or out of range') };
        if (count < 0) return { error: replyError('ERR value is out of range, must be positive') };
    }
    return { run: forwardSet(store, session, args, [args[1]]) };
}

/** Plans `SMISMEMBER`, which answers one integer per asked member. */
function planSMisMember(store, session, args) {
    if (args.length < 3) return { error: wrongArity('smismember') };
    return { run: forwardSet(store, session, args, [args[1]]) };
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

/**
 * Validates the option tail of one range command.
 *
 * Only the queue-time rules live here: an unknown option, `LIMIT` outside a
 * score or lex mode, and `WITHSCORES` on a lex command are rejected while the
 * command is queued. Range selection and reply framing run upstream.
 *
 * `scores` tells how the command treats `WITHSCORES`: `allowed` accepts it,
 * `lex-error` answers the dedicated lex message, and `none` keeps it a plain
 * syntax error.
 */
function checkZSetRangeOptions(args, from, scores, initial) {
    let mode = initial;
    let withScores = false;
    let limited = false;
    for (let index = from; index < args.length;) {
        const option = text(args[index]).toLowerCase();
        if (option === 'byscore') {
            mode = 'score';
            index += 1;
        }
        else if (option === 'bylex') {
            mode = 'lex';
            index += 1;
        }
        else if (option === 'rev') {
            index += 1;
        }
        else if (option === 'withscores') {
            if (scores === 'allowed') {
                withScores = true;
                index += 1;
            }
            else if (scores === 'lex-error') {
                return { error: replyError('ERR syntax error, WITHSCORES not supported in combination with BYLEX') };
            }
            else {
                return { error: replyError('ERR syntax error') };
            }
        }
        else if (option === 'limit') {
            if (index + 2 >= args.length) return { error: replyError('ERR syntax error') };
            limited = true;
            index += 3;
        }
        else {
            return { error: replyError('ERR syntax error') };
        }
    }
    if (mode === 'lex' && withScores) {
        return { error: replyError('ERR syntax error, WITHSCORES not supported in combination with BYLEX') };
    }
    if (limited && mode === 'rank') {
        return { error: replyError('ERR syntax error, LIMIT is only supported in combination with either BYSCORE or BYLEX') };
    }
    return {};
}

/** Validates one positive key count shared by the aggregate commands. */
function checkZSetKeyCount(raw, message) {
    const numkeys = parseInteger(raw);
    if (numkeys === null || numkeys <= 0) return { error: replyError(message) };
    return { numkeys };
}

/**
 * Plans one sorted-set command.
 *
 * Arity, option exclusivity and the scan cursor stay here because a transaction
 * rejects a malformed command while it is queued. Scores, range selection, pop
 * order and reply framing all run upstream, so the facade holds one implementation.
 */
function planZSet(store, session, name, args) {
    const length = args.length;
    const forward = keys => ({ run: forwardZSet(store, session, args, keys) });
    switch (name) {
        case 'zadd': {
            if (length < 4) return { error: wrongArity(name) };
            const options = { nx: false, xx: false, gt: false, lt: false, ch: false, incr: false };
            let index = 2;
            for (; index < length; index += 1) {
                const option = text(args[index]).toLowerCase();
                if (option === 'nx') options.nx = true;
                else if (option === 'xx') options.xx = true;
                else if (option === 'gt') options.gt = true;
                else if (option === 'lt') options.lt = true;
                else if (option === 'ch') options.ch = true;
                else if (option === 'incr') options.incr = true;
                else break;
            }
            if (options.nx && options.xx) {
                return { error: replyError('ERR XX and NX options at the same time are not compatible') };
            }
            if ((options.gt || options.lt) && (options.nx || (options.gt && options.lt))) {
                return { error: replyError('ERR GT, LT, and/or NX options at the same time are not compatible') };
            }
            const remaining = length - index;
            if (remaining === 0 || remaining % 2 !== 0) return { error: replyError('ERR syntax error') };
            if (options.incr && remaining !== 2) {
                return { error: replyError('ERR INCR option supports a single increment-element pair') };
            }
            return forward([args[1]]);
        }

        case 'zincrby':
            if (length !== 4) return { error: wrongArity(name) };
            return forward([args[1]]);

        case 'zcard':
            if (length !== 2) return { error: wrongArity(name) };
            return forward([args[1]]);

        case 'zscore':
            if (length !== 3) return { error: wrongArity(name) };
            return forward([args[1]]);

        case 'zcount':
        case 'zlexcount':
        case 'zremrangebyrank':
        case 'zremrangebyscore':
        case 'zremrangebylex':
            if (length !== 4) return { error: wrongArity(name) };
            return forward([args[1]]);

        case 'zrank':
        case 'zrevrank':
            if (length !== 3 && length !== 4) return { error: wrongArity(name) };
            if (length === 4 && text(args[3]).toLowerCase() !== 'withscore') {
                return { error: replyError('ERR syntax error') };
            }
            return forward([args[1]]);

        case 'zrem':
        case 'zmscore':
            if (length < 3) return { error: wrongArity(name) };
            return forward([args[1]]);

        case 'zrange': {
            if (length < 4) return { error: wrongArity(name) };
            const checked = checkZSetRangeOptions(args, 4, 'allowed', 'rank');
            if (checked.error !== undefined) return checked;
            return forward([args[1]]);
        }

        case 'zrevrange':
            if (length !== 4 && length !== 5) return { error: wrongArity(name) };
            if (length === 5 && text(args[4]).toLowerCase() !== 'withscores') {
                return { error: replyError('ERR syntax error') };
            }
            return forward([args[1]]);

        case 'zrangebyscore':
        case 'zrevrangebyscore': {
            if (length < 4) return { error: wrongArity(name) };
            const checked = checkZSetRangeOptions(args, 4, 'allowed', 'score');
            if (checked.error !== undefined) return checked;
            return forward([args[1]]);
        }

        case 'zrangebylex':
        case 'zrevrangebylex': {
            if (length < 4) return { error: wrongArity(name) };
            const checked = checkZSetRangeOptions(args, 4, 'lex-error', 'lex');
            if (checked.error !== undefined) return checked;
            return forward([args[1]]);
        }

        case 'zrangestore': {
            if (length < 5) return { error: wrongArity(name) };
            const checked = checkZSetRangeOptions(args, 5, 'none', 'rank');
            if (checked.error !== undefined) return checked;
            return forward([args[1], args[2]]);
        }

        case 'zpopmin':
        case 'zpopmax': {
            if (length !== 2 && length !== 3) return { error: wrongArity(name) };
            if (length === 3) {
                // 真机对非整数与负数使用同一条「必须为正」的提示。
                const count = parseInteger(args[2]);
                if (count === null || count < 0) {
                    return { error: replyError('ERR value is out of range, must be positive') };
                }
            }
            return forward([args[1]]);
        }

        case 'zrandmember':
            if (length < 2 || length > 4) return { error: wrongArity(name) };
            if (length >= 3 && parseInteger(args[2]) === null) return { error: integerError() };
            if (length === 4 && text(args[3]).toLowerCase() !== 'withscores') {
                return { error: replyError('ERR syntax error') };
            }
            return forward([args[1]]);

        case 'zscan': {
            if (length < 3) return { error: wrongArity(name) };
            if (parseScanCursor(args[2]) === null) return { error: replyError('ERR invalid cursor') };
            const options = parseScanOptions(args, 3);
            if (options.error !== undefined) return { error: options.error };
            return forward([args[1]]);
        }

        case 'zunionstore':
        case 'zinterstore': {
            if (length < 4) return { error: wrongArity(name) };
            const counted = checkZSetKeyCount(args[2], `ERR at least 1 input key is needed for '${name}' command`);
            if (counted.error !== undefined) return counted;
            if (length < 3 + counted.numkeys) return { error: replyError('ERR syntax error') };
            return forward([args[1], ...args.slice(3, 3 + counted.numkeys)]);
        }

        case 'zunion':
        case 'zinter': {
            if (length < 3) return { error: wrongArity(name) };
            const counted = checkZSetKeyCount(args[1], `ERR at least 1 input key is needed for '${name}' command`);
            if (counted.error !== undefined) return counted;
            if (length < 2 + counted.numkeys) return { error: replyError('ERR syntax error') };
            return forward(args.slice(2, 2 + counted.numkeys));
        }

        case 'zdiffstore': {
            if (length < 4) return { error: wrongArity(name) };
            const counted = checkZSetKeyCount(args[2], "ERR at least 1 input key is needed for 'zdiffstore' command");
            if (counted.error !== undefined) return counted;
            if (length < 3 + counted.numkeys) return { error: replyError('ERR syntax error') };
            return forward([args[1], ...args.slice(3, 3 + counted.numkeys)]);
        }

        case 'zdiff': {
            if (length < 3) return { error: wrongArity(name) };
            const counted = checkZSetKeyCount(args[1], "ERR at least 1 input key is needed for 'zdiff' command");
            if (counted.error !== undefined) return counted;
            if (length < 2 + counted.numkeys) return { error: replyError('ERR syntax error') };
            return forward(args.slice(2, 2 + counted.numkeys));
        }

        case 'zintercard': {
            if (length < 3) return { error: wrongArity(name) };
            const counted = checkZSetKeyCount(args[1], "ERR at least 1 input key is needed for 'zintercard' command");
            if (counted.error !== undefined) return counted;
            if (length < 2 + counted.numkeys) return { error: replyError('ERR syntax error') };
            const tail = length - (2 + counted.numkeys);
            if (tail !== 0) {
                if (tail !== 2 || text(args[2 + counted.numkeys]).toLowerCase() !== 'limit') {
                    return { error: replyError('ERR syntax error') };
                }
                // 真机对非整数与负数统一回复「不能为负」。
                const limit = parseInteger(args[3 + counted.numkeys]);
                if (limit === null || limit < 0) {
                    return { error: replyError("ERR LIMIT can't be negative") };
                }
            }
            return forward(args.slice(2, 2 + counted.numkeys));
        }

        case 'zmpop': {
            if (length < 4) return { error: wrongArity(name) };
            const counted = checkZSetKeyCount(args[1], 'ERR numkeys should be greater than 0');
            if (counted.error !== undefined) return counted;
            const counter = checkZSetMpopTail(args, 2 + counted.numkeys, length);
            if (counter.error !== undefined) return counter;
            return forward(args.slice(2, 2 + counted.numkeys));
        }

        case 'bzpopmin':
        case 'bzpopmax': {
            if (length < 3) return { error: wrongArity(name) };
            const timeout = parseBlockingTimeout(args[length - 1]);
            if (timeout.error !== undefined) return { error: replyError(timeout.error) };
            const keys = args.slice(1, length - 1);
            return blockingPlan(
                session.db,
                keys,
                timeout.timeoutMs,
                forwardBlockingZSet(store, session, args, keys),
                nullArray(),
            );
        }

        case 'bzmpop': {
            if (length < 5) return { error: wrongArity(name) };
            const timeout = parseBlockingTimeout(args[1]);
            if (timeout.error !== undefined) return { error: replyError(timeout.error) };
            const counted = checkZSetKeyCount(args[2], 'ERR numkeys should be greater than 0');
            if (counted.error !== undefined) return counted;
            const counter = checkZSetMpopTail(args, 3 + counted.numkeys, length);
            if (counter.error !== undefined) return counter;
            const keys = args.slice(3, 3 + counted.numkeys);
            return blockingPlan(
                session.db,
                keys,
                timeout.timeoutMs,
                forwardBlockingZSet(store, session, args, keys),
                nullArray(),
            );
        }

        default:
            return { error: unknownCommand(args) };
    }
}

/** Validates the `MIN|MAX [COUNT n]` tail shared by `ZMPOP` and `BZMPOP`. */
function checkZSetMpopTail(args, sideIndex, length) {
    if (sideIndex >= length) return { error: replyError('ERR syntax error') };
    const side = text(args[sideIndex]).toLowerCase();
    if (side !== 'min' && side !== 'max') return { error: replyError('ERR syntax error') };
    if (sideIndex + 1 < length) {
        if (text(args[sideIndex + 1]).toLowerCase() !== 'count' || sideIndex + 3 !== length) {
            return { error: replyError('ERR syntax error') };
        }
        const count = parseInteger(args[sideIndex + 2]);
        if (count === null) return { error: integerError() };
        if (count <= 0) return { error: replyError('ERR count should be greater than 0') };
    }
    return {};
}

/**
 * 规划一条 `SORT` / `SORT_RO` 命令。
 *
 * 排队阶段只校验参数成形：选项是否带够取值、`LIMIT` 两个数是否为整数、
 * `SORT_RO` 是否误带 `STORE`。取值来源、`BY` / `GET` 展开、排序与 `STORE`
 * 写入一律由上游族入口执行，这里只把参数原样转发。
 */
function planSort(store, session, name, args) {
    const readonly = name === 'sort_ro';
    if (args.length < 2) return { error: wrongArity(name) };
    let stores = false;
    let index = 2;
    while (index < args.length) {
        const option = text(args[index]).toLowerCase();
        if (option === 'by' || option === 'get') {
            if (args[index + 1] === undefined) return { error: replyError('ERR syntax error') };
            index += 2;
            continue;
        }
        if (option === 'limit') {
            if (args[index + 1] === undefined || args[index + 2] === undefined) {
                return { error: replyError('ERR syntax error') };
            }
            const offset = parseInteger(args[index + 1]);
            const count = parseInteger(args[index + 2]);
            if (offset === null || count === null) return { error: integerError() };
            index += 3;
            continue;
        }
        if (option === 'asc' || option === 'desc' || option === 'alpha') {
            index += 1;
            continue;
        }
        if (option === 'store') {
            if (args[index + 1] === undefined) return { error: replyError('ERR syntax error') };
            stores = true;
            index += 2;
            continue;
        }
        return { error: replyError('ERR syntax error') };
    }
    if (readonly && stores) return { error: replyError('ERR syntax error') };
    return { run: forwardZSet(store, session, args, [args[1]]) };
}

/**
 * One stream entry: a millisecond part, a sequence part and its field pairs.
 *
 * Streams are stored as one opaque value per key, the same shape hashes, lists,
 * sets and sorted sets use. The body starts with the `u64` halves of the last id
 * ever appended — `MAXLEN 0` empties the stream but never rewinds that id — then
 * `u32 count` and, per entry, the two id halves, a `u32` field count and
 * `u32`-framed field/value bytes. An optional trailer carries the append and
 * deletion counters plus every consumer group and its pending entries.
 */
const STREAM_NODE_SIZE = 100;
const U64_MAX = (1n << 64n) - 1n;
const STREAM_ID_ERROR = 'ERR Invalid stream ID specified as stream command argument';
const STREAM_ID_EMPTY = 'ERR The ID specified in XADD must be greater than 0-0';
const STREAM_ID_OLD = 'ERR The ID specified in XADD is equal or smaller than the target stream top item';
/** Marks the optional trailer that carries counters and consumer-group state. */
const STREAM_TRAILER = 0x5354524d;
const ZERO_ID = { ms: 0n, seq: 0n };

/** Bytes one consumer group adds to the stream trailer. */
function groupByteLength(group) {
    let total = 4 + group.name.length + 16 + 8 + 4;
    for (const consumer of group.consumers) {
        if (consumer.name.length > MAX_CHUNK) return null;
        total += 4 + consumer.name.length + 24 + 4;
        for (const pending of consumer.pending) {
            total += 16 + 8 + 8;
        }
    }
    return total;
}

/**
 * Encodes one stream body.
 *
 * `meta.entriesAdded` counts every append ever accepted, including entries later
 * removed by `XDEL` or `XTRIM`. `meta.maxDeleted` tracks the largest id `XDEL`
 * actually removed. Consumer groups are only appended when one exists or the
 * counters no longer match the surviving entries, so an append-only stream keeps
 * the compact legacy layout.
 */
function encodeStream(entries, last, meta = null) {
    const entriesAdded = meta === null ? entries.length : meta.entriesAdded;
    const maxDeleted = meta === null ? ZERO_ID : meta.maxDeleted;
    const groups = meta === null ? [] : meta.groups;
    const trailer = entriesAdded !== entries.length
        || maxDeleted.ms !== 0n
        || maxDeleted.seq !== 0n
        || groups.length > 0;
    let total = 16 + 4;
    for (const entry of entries) {
        total += 16 + 4;
        for (const [field, value] of entry.fields) {
            if (field.length > MAX_CHUNK || value.length > MAX_CHUNK) return null;
            total += 4 + field.length + 4 + value.length;
        }
    }
    if (trailer) {
        total += 4 + 8 + 16 + 4;
        for (const group of groups) {
            const size = groupByteLength(group);
            if (size === null) return null;
            total += size;
        }
    }
    const body = Buffer.allocUnsafe(total);
    body.writeBigUInt64LE(last.ms, 0);
    body.writeBigUInt64LE(last.seq, 8);
    body.writeUInt32LE(entries.length, 16);
    let offset = 20;
    for (const entry of entries) {
        body.writeBigUInt64LE(entry.ms, offset);
        offset += 8;
        body.writeBigUInt64LE(entry.seq, offset);
        offset += 8;
        body.writeUInt32LE(entry.fields.length, offset);
        offset += 4;
        for (const [field, value] of entry.fields) {
            body.writeUInt32LE(field.length, offset);
            offset += 4;
            field.copy(body, offset);
            offset += field.length;
            body.writeUInt32LE(value.length, offset);
            offset += 4;
            value.copy(body, offset);
            offset += value.length;
        }
    }
    if (!trailer) return body;

    body.writeUInt32LE(STREAM_TRAILER, offset);
    offset += 4;
    body.writeBigUInt64LE(BigInt(entriesAdded), offset);
    offset += 8;
    body.writeBigUInt64LE(maxDeleted.ms, offset);
    offset += 8;
    body.writeBigUInt64LE(maxDeleted.seq, offset);
    offset += 8;
    body.writeUInt32LE(groups.length, offset);
    offset += 4;
    for (const group of groups) {
        body.writeUInt32LE(group.name.length, offset);
        offset += 4;
        group.name.copy(body, offset);
        offset += group.name.length;
        body.writeBigUInt64LE(group.lastId.ms, offset);
        offset += 8;
        body.writeBigUInt64LE(group.lastId.seq, offset);
        offset += 8;
        body.writeBigUInt64LE(group.entriesRead === null ? U64_MAX : BigInt(group.entriesRead), offset);
        offset += 8;
        body.writeUInt32LE(group.consumers.length, offset);
        offset += 4;
        for (const consumer of group.consumers) {
            body.writeUInt32LE(consumer.name.length, offset);
            offset += 4;
            consumer.name.copy(body, offset);
            offset += consumer.name.length;
            body.writeBigUInt64LE(BigInt(consumer.seenTime), offset);
            offset += 8;
            body.writeBigUInt64LE(consumer.activeTime < 0 ? U64_MAX : BigInt(consumer.activeTime), offset);
            offset += 8;
            body.writeBigUInt64LE(BigInt(consumer.deliveryTime), offset);
            offset += 8;
            body.writeUInt32LE(consumer.pending.length, offset);
            offset += 4;
            for (const pending of consumer.pending) {
                body.writeBigUInt64LE(pending.ms, offset);
                offset += 8;
                body.writeBigUInt64LE(pending.seq, offset);
                offset += 8;
                body.writeBigUInt64LE(BigInt(pending.deliveryTime), offset);
                offset += 8;
                body.writeBigUInt64LE(BigInt(pending.deliveryCount), offset);
                offset += 8;
            }
        }
    }
    return body;
}

function decodeStream(body) {
    if (body.length < 20) return null;
    const last = { ms: body.readBigUInt64LE(0), seq: body.readBigUInt64LE(8) };
    const count = body.readUInt32LE(16);
    const entries = [];
    let offset = 20;
    for (let index = 0; index < count; index += 1) {
        if (offset + 20 > body.length) return null;
        const ms = body.readBigUInt64LE(offset);
        offset += 8;
        const seq = body.readBigUInt64LE(offset);
        offset += 8;
        const fieldCount = body.readUInt32LE(offset);
        offset += 4;
        const fields = [];
        for (let pair = 0; pair < fieldCount; pair += 1) {
            if (offset + 4 > body.length) return null;
            const fieldLength = body.readUInt32LE(offset);
            offset += 4;
            if (offset + fieldLength + 4 > body.length) return null;
            const field = body.subarray(offset, offset + fieldLength);
            offset += fieldLength;
            const valueLength = body.readUInt32LE(offset);
            offset += 4;
            if (offset + valueLength > body.length) return null;
            const value = body.subarray(offset, offset + valueLength);
            offset += valueLength;
            fields.push([field, value]);
        }
        entries.push({ ms, seq, fields });
    }
    if (offset === body.length) {
        return { entries, last, entriesAdded: entries.length, maxDeleted: ZERO_ID, groups: [] };
    }
    if (offset + 4 > body.length || body.readUInt32LE(offset) !== STREAM_TRAILER) return null;
    offset += 4;
    if (offset + 8 + 16 + 4 > body.length) return null;
    const entriesAdded = Number(body.readBigUInt64LE(offset));
    offset += 8;
    const maxDeleted = { ms: body.readBigUInt64LE(offset), seq: body.readBigUInt64LE(offset + 8) };
    offset += 16;
    const groupCount = body.readUInt32LE(offset);
    offset += 4;
    const groups = [];
    for (let index = 0; index < groupCount; index += 1) {
        if (offset + 4 > body.length) return null;
        const nameLength = body.readUInt32LE(offset);
        offset += 4;
        if (offset + nameLength + 24 + 4 > body.length) return null;
        const name = body.subarray(offset, offset + nameLength);
        offset += nameLength;
        const lastId = { ms: body.readBigUInt64LE(offset), seq: body.readBigUInt64LE(offset + 8) };
        offset += 16;
        const rawEntriesRead = body.readBigUInt64LE(offset);
        offset += 8;
        const entriesRead = rawEntriesRead === U64_MAX ? null : Number(rawEntriesRead);
        const consumerCount = body.readUInt32LE(offset);
        offset += 4;
        const consumers = [];
        for (let slot = 0; slot < consumerCount; slot += 1) {
            if (offset + 4 > body.length) return null;
            const consumerLength = body.readUInt32LE(offset);
            offset += 4;
            if (offset + consumerLength + 24 + 4 > body.length) return null;
            const consumerName = body.subarray(offset, offset + consumerLength);
            offset += consumerLength;
            const seenTime = Number(body.readBigUInt64LE(offset));
            offset += 8;
            const rawActive = body.readBigUInt64LE(offset);
            offset += 8;
            const activeTime = rawActive === U64_MAX ? -1 : Number(rawActive);
            const deliveryTime = Number(body.readBigUInt64LE(offset));
            offset += 8;
            const pendingCount = body.readUInt32LE(offset);
            offset += 4;
            const pending = [];
            for (let entry = 0; entry < pendingCount; entry += 1) {
                if (offset + 32 > body.length) return null;
                const ms = body.readBigUInt64LE(offset);
                offset += 8;
                const seq = body.readBigUInt64LE(offset);
                offset += 8;
                const delivered = Number(body.readBigUInt64LE(offset));
                offset += 8;
                const deliveryCount = Number(body.readBigUInt64LE(offset));
                offset += 8;
                pending.push({ ms, seq, deliveryTime: delivered, deliveryCount });
            }
            consumers.push({ name: consumerName, seenTime, activeTime, deliveryTime, pending });
        }
        groups.push({ name, lastId, entriesRead, consumers });
    }
    return offset === body.length ? { entries, last, entriesAdded, maxDeleted, groups } : null;
}

/**
 * Live stream state, `null` when the key is missing.
 *
 * `states.error` marks a corrupt body so callers answer `WRONGTYPE` the way the
 * other collection readers do.
 */
function readStream(store, db, key) {
    const body = store.getKind(db, SUFFIX.stream, key);
    if (body === null || body === undefined) return null;
    const decoded = decodeStream(body);
    return decoded === null ? { error: true } : decoded;
}

function compareStreamIds(left, right) {
    if (left.ms !== right.ms) return left.ms < right.ms ? -1 : 1;
    if (left.seq !== right.seq) return left.seq < right.seq ? -1 : 1;
    return 0;
}

/** Stream metadata needed to re-encode the body after any mutation. */
const streamMeta = stream => ({
    entriesAdded: stream.entriesAdded,
    maxDeleted: stream.maxDeleted,
    groups: stream.groups,
});

const idText = id => `${id.ms}-${id.seq}`;

function findEntry(stream, id) {
    return stream.entries.find(entry => entry.ms === id.ms && entry.seq === id.seq);
}

function findGroup(stream, name) {
    return stream.groups.find(group => group.name.equals(name));
}

function findConsumer(group, name) {
    return group.consumers.find(consumer => consumer.name.equals(name));
}

/** Looks a consumer up and creates it on first use, the way every group command does. */
function ensureConsumer(group, name, now) {
    const existing = findConsumer(group, name);
    if (existing !== undefined) {
        existing.seenTime = now;
        return existing;
    }
    const consumer = {
        name,
        seenTime: now,
        activeTime: -1,
        deliveryTime: now,
        pending: [],
    };
    group.consumers.push(consumer);
    return consumer;
}

/** Removes one entry from a consumer's pending list, answering whether it was there. */
function removePending(consumer, id) {
    const index = consumer.pending.findIndex(pending => pending.ms === id.ms && pending.seq === id.seq);
    if (index < 0) return null;
    return consumer.pending.splice(index, 1)[0];
}

/** Every pending entry of a group, ordered by id the way the radix tree walks them. */
function pendingList(group) {
    const rows = [];
    for (const consumer of group.consumers) {
        for (const pending of consumer.pending) rows.push({ consumer, pending });
    }
    rows.sort((left, right) => compareStreamIds(left.pending, right.pending));
    return rows;
}

function pendingCount(group) {
    let total = 0;
    for (const consumer of group.consumers) total += consumer.pending.length;
    return total;
}

/** Groups and consumers live in radix trees, so their listings are byte-ordered. */
const byName = (left, right) => Buffer.compare(left.name, right.name);

/**
 * Lag as the server reports it.
 *
 * A group that never moved past `0-0` reports the surviving entry count. A known
 * `entries-read` wins and counts appends that are no longer in the stream. An
 * unknown counter with a group parked before the stream top cannot be computed.
 */
function groupLag(stream, group) {
    if (group.lastId.ms === 0n && group.lastId.seq === 0n) return stream.entries.length;
    if (group.entriesRead !== null) {
        const lag = stream.entriesAdded - group.entriesRead;
        return lag < 0 ? 0 : lag;
    }
    return compareStreamIds(group.lastId, stream.last) >= 0 ? 0 : null;
}

const consumerIdle = (consumer, now) => Math.max(0, now - consumer.deliveryTime);
const consumerInactive = (consumer, now) => consumer.activeTime < 0
    ? -1
    : Math.max(0, now - consumer.activeTime);

/** One entry as the wire shape: id plus a flat field/value array. */
function entryReply(entry) {
    return array([
        bulk(idText(entry)),
        array(entry.fields.flatMap(([field, value]) => [bulk(field), bulk(value)])),
    ]);
}

/**
 * Parses `ms`, `ms-seq` and the two infinity words.
 *
 * A bare `ms` means sequence `0` as a lower bound and `2^64-1` as an upper bound,
 * which is how `XRANGE` selects a whole millisecond with `1526985054069 1526985054069`.
 */
function parseStreamId(raw, isEnd = false) {
    const value = text(raw);
    if (value === '-') return { ms: 0n, seq: 0n };
    if (value === '+') return { ms: U64_MAX, seq: U64_MAX };
    const match = /^(\d+)(?:-(\d+))?$/.exec(value);
    if (match === null) return null;
    const ms = BigInt(match[1]);
    const seq = match[2] === undefined ? (isEnd ? U64_MAX : 0n) : BigInt(match[2]);
    return ms > U64_MAX || seq > U64_MAX ? null : { ms, seq };
}

/** Parses one numeric id, `null` on words, overflow or malformed text. */
function parseExplicitStreamId(raw) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(text(raw));
    if (match === null) return null;
    const ms = BigInt(match[1]);
    const seq = match[2] === undefined ? 0n : BigInt(match[2]);
    return ms > U64_MAX || seq > U64_MAX ? null : { ms, seq };
}

/** Parses one range bound, keeping the `(` exclusive prefix. */
function parseStreamBound(raw, isEnd) {
    const value = text(raw);
    const exclusive = value.startsWith('(');
    const body = exclusive ? value.slice(1) : value;
    let id;
    if (body === '-') {
        if (exclusive) return null;
        id = { ms: 0n, seq: 0n };
    }
    else if (body === '+') {
        if (exclusive) return null;
        id = { ms: U64_MAX, seq: U64_MAX };
    }
    else {
        const match = /^(\d+)(?:-(\d+))?$/.exec(body);
        if (match === null) return null;
        const ms = BigInt(match[1]);
        const seq = match[2] === undefined ? (isEnd ? U64_MAX : 0n) : BigInt(match[2]);
        if (ms > U64_MAX || seq > U64_MAX) return null;
        id = { ms, seq };
    }
    return { id, exclusive };
}

/**
 * Mirrors `XADD` id resolution: `*`, `ms-*` and explicit ids.
 *
 * An explicit id must be above `0-0` and above the stream top id. Auto ids keep
 * the sequence increasing and, on an empty stream, the very first id of
 * millisecond zero is `0-1` rather than the reserved `0-0`.
 */
function resolveStreamId(token, last) {
    if (token === '*') {
        const now = BigInt(Date.now());
        if (last === null) return { ms: now, seq: 0n };
        if (now > last.ms) return { ms: now, seq: 0n };
        if (last.seq >= U64_MAX) return { error: STREAM_ID_OLD };
        return { ms: last.ms, seq: last.seq + 1n };
    }
    const auto = /^(\d+)-\*$/.exec(token);
    if (auto !== null) {
        const ms = BigInt(auto[1]);
        if (ms > U64_MAX) return null;
        let seq = last !== null && last.ms === ms ? last.seq + 1n : 0n;
        if (ms === 0n && seq === 0n) seq = 1n;
        if (seq > U64_MAX) return { error: STREAM_ID_OLD };
        const autoId = { ms, seq };
        if (last !== null && compareStreamIds(autoId, last) <= 0) return { error: STREAM_ID_OLD };
        return autoId;
    }
    const id = parseExplicitStreamId(token);
    if (id === null) return null;
    if (id.ms === 0n && id.seq === 0n) return { error: STREAM_ID_EMPTY };
    if (last !== null && compareStreamIds(id, last) <= 0) return { error: STREAM_ID_OLD };
    return id;
}

/**
 * Applies `MAXLEN` / `MINID` and reports how many entries were evicted.
 *
 * Exact thresholds trim entry by entry. Approximate ones only drop whole nodes of
 * at most {@link STREAM_NODE_SIZE} entries, and `LIMIT` caps the evictions of one
 * call (`0` means no cap). A small stream under `MAXLEN ~ 1` keeps everything
 * because dropping its only node would go below the threshold.
 */
function trimStream(entries, maxlen, minid) {
    let kept = entries;
    let removed = 0;
    if (maxlen !== null) {
        if (!maxlen.approx) {
            const excess = kept.length - maxlen.value;
            if (excess > 0) {
                kept = kept.slice(excess);
                removed += excess;
            }
        }
        else {
            let budget = maxlen.limit === null || maxlen.limit === 0 ? Infinity : maxlen.limit;
            while (kept.length > 0) {
                const node = Math.min(STREAM_NODE_SIZE, kept.length);
                if (kept.length - node < maxlen.value || node > budget) break;
                kept = kept.slice(node);
                removed += node;
                budget -= node;
            }
        }
    }
    if (minid !== null) {
        if (!minid.approx) {
            const first = kept.findIndex(entry => compareStreamIds(entry, minid.id) >= 0);
            const drop = first === -1 ? kept.length : first;
            if (drop > 0) {
                kept = kept.slice(drop);
                removed += drop;
            }
        }
        else {
            let budget = minid.limit === null || minid.limit === 0 ? Infinity : minid.limit;
            while (kept.length > 0) {
                const node = Math.min(STREAM_NODE_SIZE, kept.length);
                const last = kept[node - 1];
                if (compareStreamIds(last, minid.id) >= 0 || node > budget) break;
                kept = kept.slice(node);
                removed += node;
                budget -= node;
            }
        }
    }
    return { kept, removed };
}

const TRIM_INCOMPATIBLE = 'ERR syntax error, MAXLEN and MINID options at the same time are not compatible';
const TRIM_LIMIT_WITHOUT_APPROX = 'ERR syntax error, LIMIT cannot be used without the special ~ option';
const TRIM_LIMIT_NEGATIVE = 'ERR The LIMIT argument must be >= 0.';
const TRIM_MAXLEN_NEGATIVE = 'ERR The MAXLEN argument must be >= 0.';

/**
 * Parses the `NOMKSTREAM` / `MAXLEN` / `MINID` prefix of `XADD` and `XTRIM`.
 *
 * `style` only changes one corner the real server reports differently: a trailing
 * `LIMIT` without a value is an invalid id on `XADD` and a syntax error on
 * `XTRIM`. Returns the first token index after the prefix.
 */
function parseTrimOptions(args, start, style) {
    let nomkstream = false;
    let maxlen = null;
    let minid = null;
    let index = start;
    for (;;) {
        const token = text(args[index] ?? '').toUpperCase();
        if (token === 'NOMKSTREAM') {
            if (style === 'xtrim') return { error: replyError('ERR syntax error') };
            nomkstream = true;
            index += 1;
            continue;
        }
        if (token !== 'MAXLEN' && token !== 'MINID') break;
        if (maxlen !== null || minid !== null) return { error: replyError(TRIM_INCOMPATIBLE) };
        index += 1;
        let approx = false;
        const sign = text(args[index] ?? '');
        if (sign === '~' || sign === '=') {
            approx = sign === '~';
            index += 1;
        }
        const raw = args[index];
        index += 1;
        let limit = null;
        if (text(args[index] ?? '').toUpperCase() === 'LIMIT') {
            if (!approx) return { error: replyError(TRIM_LIMIT_WITHOUT_APPROX) };
            index += 1;
            if (args[index] === undefined) {
                return { error: replyError(style === 'xadd' ? STREAM_ID_ERROR : 'ERR syntax error') };
            }
            const parsed = parseInteger(text(args[index]));
            index += 1;
            if (parsed === null) return { error: integerError() };
            if (parsed < 0) return { error: replyError(TRIM_LIMIT_NEGATIVE) };
            limit = parsed;
        }
        if (token === 'MAXLEN') {
            const value = parseInteger(text(raw ?? ''));
            if (value === null) return { error: integerError() };
            if (value < 0) return { error: replyError(TRIM_MAXLEN_NEGATIVE) };
            maxlen = { approx, value, limit };
        }
        else {
            const id = parseExplicitStreamId(raw ?? '');
            if (id === null) return { error: replyError(STREAM_ID_ERROR) };
            minid = { approx, id, limit };
        }
    }
    return { nomkstream, maxlen, minid, index };
}

const STREAM_UNBALANCED = "ERR Unbalanced 'xread' list of streams: for each stream key an ID, '+', or '$' must be specified.";
const BLOCK_NOT_INTEGER = 'ERR timeout is not an integer or out of range';
const BLOCK_NEGATIVE = 'ERR timeout is negative';

/**
 * Plans one `XREAD` call.
 *
 * `$` snapshots the last generated id and `+` snapshots the last entry id at the
 * moment the command arrives, inclusive of that entry. Both are resolved before
 * the command may park, so appends that wake a blocked reader cannot move the
 * snapshot past the entries it should return.
 */
function planXRead(store, session, args) {
    const db = session.db;
    if (args.length < 4) return { error: wrongArity('xread') };
    let count = null;
    let timeoutMs = null;
    let index = 1;
    for (;;) {
        const token = text(args[index] ?? '').toUpperCase();
        if (token === 'COUNT') {
            const value = args[index + 1] === undefined ? null : parseInteger(text(args[index + 1]));
            if (value === null) return { error: integerError() };
            count = value <= 0 ? null : value;
            index += 2;
            continue;
        }
        if (token === 'BLOCK') {
            const value = args[index + 1] === undefined ? null : parseInteger(text(args[index + 1]));
            if (value === null) return { error: replyError(BLOCK_NOT_INTEGER) };
            if (value < 0) return { error: replyError(BLOCK_NEGATIVE) };
            timeoutMs = value;
            index += 2;
            continue;
        }
        if (token === 'STREAMS') break;
        return { error: replyError('ERR syntax error') };
    }

    const tokens = args.slice(index + 1);
    if (tokens.length < 2) return { error: wrongArity('xread') };
    if (tokens.length % 2 !== 0) return { error: replyError(STREAM_UNBALANCED) };
    const half = tokens.length / 2;
    const keys = tokens.slice(0, half);
    const cursors = [];
    for (let position = 0; position < half; position += 1) {
        const raw = text(tokens[half + position]);
        if (raw === '$' || raw === '+') {
            const kind = kindOf(store, db, keys[position]);
            const stream = kind === 'stream' ? readStream(store, db, keys[position]) : null;
            const top = stream === null || stream.error === true
                ? { ms: 0n, seq: 0n }
                : raw === '+' && stream.entries.length > 0
                    ? stream.entries[stream.entries.length - 1]
                    : stream.last;
            cursors.push({ id: { ms: top.ms, seq: top.seq }, inclusive: raw === '+' });
            continue;
        }
        const id = parseExplicitStreamId(raw);
        if (id === null) return { error: replyError(STREAM_ID_ERROR) };
        cursors.push({ id, inclusive: false });
    }

    const attempt = () => {
        const rows = [];
        for (let position = 0; position < keys.length; position += 1) {
            const key = keys[position];
            const kind = kindOf(store, db, key);
            if (kind !== null && kind !== 'stream') return wrongType();
            if (kind === null) continue;
            const stream = readStream(store, db, key);
            if (stream === null || stream.error === true) return wrongType();
            const cursor = cursors[position];
            const selected = [];
            for (const entry of stream.entries) {
                const order = compareStreamIds(entry, cursor.id);
                if (cursor.inclusive ? order < 0 : order <= 0) continue;
                selected.push(entry);
                if (count !== null && selected.length >= count) break;
            }
            if (selected.length === 0) continue;
            rows.push(array([
                bulk(key),
                array(selected.map(entry => array([
                    bulk(`${entry.ms}-${entry.seq}`),
                    array(entry.fields.flatMap(([field, value]) => [bulk(field), bulk(value)])),
                ]))),
            ]));
        }
        return rows.length === 0 ? null : array(rows);
    };

    if (timeoutMs === null) return { run: () => attempt() ?? nullArray() };
    return blockingPlan(db, keys, timeoutMs, attempt, nullArray());
}

/**
 * Plans `XADD`, `XLEN`, `XRANGE`, `XREVRANGE`, `XDEL`, `XTRIM` and `XREAD`.
 *
 * Consumer groups land in a later slice, so `XGROUP`, `XACK`, `XPENDING` and
 * `XCLAIM` still answer the unknown command error.
 */
function planStream(store, session, name, args) {
    const db = session.db;
    if (name === 'xlen') {
        if (args.length !== 2) return { error: wrongArity('xlen') };
        return {
            run: () => {
                const kind = kindOf(store, db, args[1]);
                if (kind === null) return integer(0);
                if (kind !== 'stream') return wrongType();
                const stream = readStream(store, db, args[1]);
                return stream === null || stream.error === true ? wrongType() : integer(stream.entries.length);
            },
        };
    }
    if (name === 'xrange' || name === 'xrevrange') {
        const reverse = name === 'xrevrange';
        if (args.length < 4) return { error: wrongArity(name) };
        let count = null;
        if (args.length !== 4) {
            if (args.length !== 6 || text(args[4]).toUpperCase() !== 'COUNT') {
                return { error: replyError('ERR syntax error') };
            }
            const parsed = parseInteger(text(args[5]));
            if (parsed === null) return { error: integerError() };
            count = parsed;
        }
        const low = parseStreamBound(args[reverse ? 3 : 2], false);
        const high = parseStreamBound(args[reverse ? 2 : 3], true);
        if (low === null || high === null) return { error: replyError(STREAM_ID_ERROR) };
        if (low.exclusive && low.id.ms === U64_MAX && low.id.seq === U64_MAX) {
            return { error: replyError('ERR invalid start ID for the interval') };
        }
        if (high.exclusive && high.id.ms === 0n && high.id.seq === 0n) {
            return { error: replyError('ERR invalid end ID for the interval') };
        }
        return {
            run: () => {
                const kind = kindOf(store, db, args[1]);
                if (kind === null) return array([]);
                if (kind !== 'stream') return wrongType();
                const stream = readStream(store, db, args[1]);
                if (stream === null || stream.error === true) return wrongType();
                if (count !== null && count <= 0) return nullArray();
                const selected = [];
                const ordered = reverse ? stream.entries.slice().reverse() : stream.entries;
                for (const entry of ordered) {
                    const lowSide = compareStreamIds(entry, low.id);
                    const highSide = compareStreamIds(entry, high.id);
                    if (low.exclusive ? lowSide <= 0 : lowSide < 0) continue;
                    if (high.exclusive ? highSide >= 0 : highSide > 0) continue;
                    selected.push(entry);
                    if (count !== null && selected.length >= count) break;
                }
                return array(selected.map(entry => array([
                    bulk(`${entry.ms}-${entry.seq}`),
                    array(entry.fields.flatMap(([field, value]) => [bulk(field), bulk(value)])),
                ])));
            },
        };
    }

    if (name === 'xdel') {
        if (args.length < 3) return { error: wrongArity('xdel') };
        const key = args[1];
        const ids = args.slice(2);
        return {
            run: () => {
                const kind = kindOf(store, db, key);
                if (kind === null) return integer(0);
                if (kind !== 'stream') return wrongType();
                const stream = readStream(store, db, key);
                if (stream === null || stream.error === true) return wrongType();
                const targets = new Set();
                for (const raw of ids) {
                    const id = parseExplicitStreamId(raw);
                    if (id === null) return replyError(STREAM_ID_ERROR);
                    targets.add(`${id.ms}-${id.seq}`);
                }
                const removedEntries = stream.entries.filter(entry => targets.has(`${entry.ms}-${entry.seq}`));
                const removed = removedEntries.length;
                if (removed > 0) {
                    const kept = stream.entries.filter(entry => !targets.has(`${entry.ms}-${entry.seq}`));
                    let maxDeleted = stream.maxDeleted;
                    for (const entry of removedEntries) {
                        if (compareStreamIds(entry, maxDeleted) > 0) maxDeleted = { ms: entry.ms, seq: entry.seq };
                    }
                    rewriteKind(store, db, 'stream', key, encodeStream(kept, stream.last, {
                        entriesAdded: stream.entriesAdded,
                        maxDeleted,
                        groups: stream.groups,
                    }));
                }
                return integer(removed);
            },
        };
    }

    if (name === 'xtrim') {
        if (args.length < 4) return { error: wrongArity('xtrim') };
        const key = args[1];
        const parsed = parseTrimOptions(args, 2, 'xtrim');
        if (parsed.error !== undefined) return { error: parsed.error };
        if (parsed.index !== args.length) return { error: replyError('ERR syntax error') };
        if (parsed.maxlen === null && parsed.minid === null) return { error: replyError('ERR syntax error') };
        const { maxlen, minid } = parsed;
        return {
            run: () => {
                const kind = kindOf(store, db, key);
                if (kind === null) return integer(0);
                if (kind !== 'stream') return wrongType();
                const stream = readStream(store, db, key);
                if (stream === null || stream.error === true) return wrongType();
                const { kept, removed } = trimStream(stream.entries, maxlen, minid);
                if (removed > 0) rewriteKind(store, db, 'stream', key, encodeStream(kept, stream.last, streamMeta(stream)));
                return integer(removed);
            },
        };
    }

    if (args.length < 5) return { error: wrongArity('xadd') };
    const key = args[1];
    const parsed = parseTrimOptions(args, 2, 'xadd');
    if (parsed.error !== undefined) return { error: parsed.error };
    const idToken = args[parsed.index];
    const pairs = args.slice(parsed.index + 1);
    if (idToken === undefined || pairs.length === 0 || pairs.length % 2 !== 0) return { error: wrongArity('xadd') };
    return {
        run: () => {
            const kind = kindOf(store, db, key);
            if (kind !== null && kind !== 'stream') return wrongType();
            if (kind === null && parsed.nomkstream) return nullReply();
            const stream = readStream(store, db, key);
            if (stream !== null && stream.error === true) return wrongType();
            const entries = stream === null ? [] : stream.entries;
            const last = stream === null ? null : stream.last;
            const id = resolveStreamId(text(idToken), last);
            if (id === null) return replyError(STREAM_ID_ERROR);
            if (id.error !== undefined) return replyError(id.error);
            const fields = [];
            for (let pair = 0; pair < pairs.length; pair += 2) fields.push([pairs[pair], pairs[pair + 1]]);
            entries.push({ ms: id.ms, seq: id.seq, fields });
            const kept = trimStream(entries, parsed.maxlen, parsed.minid).kept;
            rewriteKind(store, db, 'stream', key, encodeStream(kept, id, {
                entriesAdded: (stream === null ? 0 : stream.entriesAdded) + 1,
                maxDeleted: stream === null ? ZERO_ID : stream.maxDeleted,
                groups: stream === null ? [] : stream.groups,
            }));
            notifyPush(session, db, key);
            return bulk(`${id.ms}-${id.seq}`);
        },
    };
}

const STREAM_REQUIRES_KEY = 'ERR The XGROUP subcommand requires the key to exist. Note that for CREATE you may want to use the MKSTREAM option to create an empty stream automatically.';
const BUSYGROUP = 'BUSYGROUP Consumer Group name already exists';
const groupHelp = sub => replyError(`ERR unknown subcommand or wrong number of arguments for '${sub}'. Try XGROUP HELP.`);
const groupNoGroup = (group, key) => replyError(`NOGROUP No such consumer group '${group}' for key name '${key}'`);
const commandNoGroup = (key, group) => replyError(`NOGROUP No such key '${key}' or consumer group '${group}'`);

/** Decoded stream or the reply a group command owes a missing or wrong-typed key. */
function streamState(store, db, key) {
    const kind = kindOf(store, db, key);
    if (kind === null) return { missing: true };
    if (kind !== 'stream') return { error: wrongType() };
    const stream = readStream(store, db, key);
    return stream === null || stream.error === true ? { error: wrongType() } : { stream };
}

/** Reads `ENTRIESREAD n` from the tail of `CREATE` / `SETID`. */
function parseEntriesRead(args, start) {
    let value = null;
    let provided = false;
    let index = start;
    while (index < args.length) {
        if (text(args[index]).toUpperCase() !== 'ENTRIESREAD') {
            return { error: groupHelp(text(args[1])) };
        }
        if (args[index + 1] === undefined) return { error: groupHelp(text(args[1])) };
        const parsed = parseInteger(text(args[index + 1]));
        if (parsed === null) return { error: integerError() };
        value = parsed;
        provided = true;
        index += 2;
    }
    return { value, provided, index };
}

/**
 * Plans `XGROUP CREATE|SETID|DESTROY|CREATECONSUMER|DELCONSUMER`.
 *
 * The group's last-delivered id may move forwards and backwards with `SETID`,
 * while `ENTRIESREAD` is clamped to the number of appends the stream accepted.
 */
function planXGroup(store, session, args) {
    const db = session.db;
    if (args.length < 2) return { error: wrongArity('xgroup') };
    const sub = text(args[1]).toUpperCase();
    if (sub === 'CREATE') {
        if (args.length < 5) return { error: wrongArity('xgroup|create') };
        const key = args[2];
        const groupName = args[3];
        const idToken = text(args[4]);
        if (idToken !== '$' && parseExplicitStreamId(idToken) === null) {
            return { error: replyError(STREAM_ID_ERROR) };
        }
        let mkstream = false;
        let entriesRead = null;
        let entriesReadProvided = false;
        for (let index = 5; index < args.length; index += 1) {
            const token = text(args[index]).toUpperCase();
            if (token === 'MKSTREAM') {
                mkstream = true;
                continue;
            }
            if (token === 'ENTRIESREAD') {
                if (args[index + 1] === undefined) return { error: groupHelp(text(args[1])) };
                const parsed = parseInteger(text(args[index + 1]));
                if (parsed === null) return { error: integerError() };
                entriesRead = parsed;
                entriesReadProvided = true;
                index += 1;
                continue;
            }
            return { error: groupHelp(text(args[1])) };
        }
        return {
            run: () => {
                const state = streamState(store, db, key);
                if (state.error !== undefined) return state.error;
                let stream;
                if (state.missing) {
                    if (!mkstream) return replyError(STREAM_REQUIRES_KEY);
                    stream = {
                        entries: [],
                        last: { ms: 0n, seq: 0n },
                        entriesAdded: 0,
                        maxDeleted: ZERO_ID,
                        groups: [],
                    };
                }
                else {
                    stream = state.stream;
                }
                if (findGroup(stream, groupName) !== undefined) return replyError(BUSYGROUP);
                const lastId = idToken === '$'
                    ? { ms: stream.last.ms, seq: stream.last.seq }
                    : parseExplicitStreamId(idToken);
                stream.groups.push({
                    name: groupName,
                    lastId,
                    entriesRead: entriesReadProvided
                        ? Math.min(Math.max(entriesRead, 0), stream.entriesAdded)
                        : null,
                    consumers: [],
                });
                rewriteKind(store, db, 'stream', key, encodeStream(stream.entries, stream.last, streamMeta(stream)));
                return simple('OK');
            },
        };
    }
    if (sub === 'CREATECONSUMER') {
        if (args.length !== 5) return { error: wrongArity('xgroup|createconsumer') };
        const key = args[2];
        const groupName = args[3];
        const consumerName = args[4];
        return {
            run: () => {
                const state = streamState(store, db, key);
                if (state.missing) return replyError(STREAM_REQUIRES_KEY);
                if (state.error !== undefined) return state.error;
                const group = findGroup(state.stream, groupName);
                if (group === undefined) return groupNoGroup(text(groupName), text(key));
                if (findConsumer(group, consumerName) !== undefined) return integer(0);
                ensureConsumer(group, consumerName, Date.now());
                rewriteKind(store, db, 'stream', key, encodeStream(state.stream.entries, state.stream.last, streamMeta(state.stream)));
                return integer(1);
            },
        };
    }
    if (sub === 'DELCONSUMER') {
        if (args.length !== 5) return { error: wrongArity('xgroup|delconsumer') };
        const key = args[2];
        const groupName = args[3];
        const consumerName = args[4];
        return {
            run: () => {
                const state = streamState(store, db, key);
                if (state.missing) return replyError(STREAM_REQUIRES_KEY);
                if (state.error !== undefined) return state.error;
                const group = findGroup(state.stream, groupName);
                if (group === undefined) return groupNoGroup(text(groupName), text(key));
                const index = group.consumers.findIndex(consumer => consumer.name.equals(consumerName));
                if (index < 0) return integer(0);
                const [consumer] = group.consumers.splice(index, 1);
                rewriteKind(store, db, 'stream', key, encodeStream(state.stream.entries, state.stream.last, streamMeta(state.stream)));
                return integer(consumer.pending.length);
            },
        };
    }
    if (sub === 'DESTROY') {
        if (args.length !== 4) return { error: wrongArity('xgroup|destroy') };
        const key = args[2];
        const groupName = args[3];
        return {
            run: () => {
                const state = streamState(store, db, key);
                if (state.missing) return replyError(STREAM_REQUIRES_KEY);
                if (state.error !== undefined) return state.error;
                const index = state.stream.groups.findIndex(group => group.name.equals(groupName));
                if (index < 0) return integer(0);
                state.stream.groups.splice(index, 1);
                rewriteKind(store, db, 'stream', key, encodeStream(state.stream.entries, state.stream.last, streamMeta(state.stream)));
                return integer(1);
            },
        };
    }
    if (sub === 'SETID') {
        if (args.length < 5) return { error: wrongArity('xgroup|setid') };
        const key = args[2];
        const groupName = args[3];
        const idToken = text(args[4]);
        if (idToken !== '$' && parseExplicitStreamId(idToken) === null) {
            return { error: replyError(STREAM_ID_ERROR) };
        }
        const options = parseEntriesRead(args, 5);
        if (options.error !== undefined) return { error: options.error };
        return {
            run: () => {
                const state = streamState(store, db, key);
                if (state.missing) return replyError(STREAM_REQUIRES_KEY);
                if (state.error !== undefined) return state.error;
                const group = findGroup(state.stream, groupName);
                if (group === undefined) return groupNoGroup(text(groupName), text(key));
                group.lastId = idToken === '$'
                    ? { ms: state.stream.last.ms, seq: state.stream.last.seq }
                    : parseExplicitStreamId(idToken);
                group.entriesRead = options.provided
                    ? Math.min(Math.max(options.value, 0), state.stream.entriesAdded)
                    : null;
                rewriteKind(store, db, 'stream', key, encodeStream(state.stream.entries, state.stream.last, streamMeta(state.stream)));
                return simple('OK');
            },
        };
    }
    return { error: replyError(`ERR unknown subcommand '${text(args[1])}'. Try XGROUP HELP.`) };
}

/**
 * Plans `XACK`.
 *
 * The server acknowledges silently against a missing key or group, but every id
 * is validated before anything leaves the pending list.
 */
function planXAck(store, session, args) {
    const db = session.db;
    if (args.length < 3) return { error: wrongArity('xack') };
    const key = args[1];
    const groupName = args[2];
    const ids = [];
    for (const raw of args.slice(3)) {
        const id = parseExplicitStreamId(raw);
        if (id === null) return { error: replyError(STREAM_ID_ERROR) };
        ids.push(id);
    }
    return {
        run: () => {
            const state = streamState(store, db, key);
            if (state.missing) return integer(0);
            if (state.error !== undefined) return state.error;
            const group = findGroup(state.stream, groupName);
            if (group === undefined) return integer(0);
            let removed = 0;
            const seen = new Set();
            for (const id of ids) {
                const textId = idText(id);
                if (seen.has(textId)) continue;
                seen.add(textId);
                for (const consumer of group.consumers) {
                    if (removePending(consumer, id) !== null) {
                        removed += 1;
                        break;
                    }
                }
            }
            if (removed > 0) {
                rewriteKind(store, db, 'stream', key, encodeStream(state.stream.entries, state.stream.last, streamMeta(state.stream)));
            }
            return integer(removed);
        },
    };
}

/**
 * Plans `XPENDING` in both shapes.
 *
 * The summary always carries four elements. The extended form keeps the idle
 * milliseconds live and accepts the same exclusive `(` bounds as `XRANGE`.
 */
function planXPending(store, session, args) {
    const db = session.db;
    if (args.length < 3) return { error: wrongArity('xpending') };
    const key = args[1];
    const groupName = args[2];
    if (args.length === 3) {
        return {
            run: () => {
                const state = streamState(store, db, key);
                if (state.error !== undefined) return state.error;
                if (state.missing) return commandNoGroup(text(key), text(groupName));
                const group = findGroup(state.stream, groupName);
                if (group === undefined) return commandNoGroup(text(key), text(groupName));
                const rows = pendingList(group);
                if (rows.length === 0) {
                    return array([integer(0), nullReply(), nullReply(), nullArray()]);
                }
                const counts = group.consumers
                    .filter(consumer => consumer.pending.length > 0)
                    .sort(byName)
                    .map(consumer => array([bulk(consumer.name), bulk(String(consumer.pending.length))]));
                return array([
                    integer(rows.length),
                    bulk(idText(rows[0].pending)),
                    bulk(idText(rows[rows.length - 1].pending)),
                    array(counts),
                ]);
            },
        };
    }
    if (args.length < 6) return { error: replyError('ERR syntax error') };
    const low = parseStreamBound(args[3], false);
    const high = parseStreamBound(args[4], true);
    if (low === null || high === null) return { error: replyError(STREAM_ID_ERROR) };
    const count = parseInteger(text(args[5]));
    if (count === null) return { error: integerError() };
    const consumerName = args[6];
    return {
        run: () => {
            const state = streamState(store, db, key);
            if (state.error !== undefined) return state.error;
            if (state.missing) return commandNoGroup(text(key), text(groupName));
            const group = findGroup(state.stream, groupName);
            if (group === undefined) return commandNoGroup(text(key), text(groupName));
            if (count <= 0) return array([]);
            const now = Date.now();
            const rows = [];
            for (const row of pendingList(group)) {
                if (consumerName !== undefined && !row.consumer.name.equals(consumerName)) continue;
                const lowSide = compareStreamIds(row.pending, low.id);
                const highSide = compareStreamIds(row.pending, high.id);
                if (low.exclusive ? lowSide <= 0 : lowSide < 0) continue;
                if (high.exclusive ? highSide >= 0 : highSide > 0) continue;
                rows.push(array([
                    bulk(idText(row.pending)),
                    bulk(row.consumer.name),
                    integer(consumerIdle(row.consumer, now)),
                    integer(row.pending.deliveryCount),
                ]));
                if (rows.length >= count) break;
            }
            return array(rows);
        },
    };
}

/**
 * Plans `XCLAIM`.
 *
 * A claim moves one pending entry between consumers, or creates it with `FORCE`.
 * `JUSTID` suppresses the delivery counter bump. `LASTID` only moves the group
 * forward.
 */
function planXClaim(store, session, args) {
    const db = session.db;
    if (args.length < 6) return { error: wrongArity('xclaim') };
    const key = args[1];
    const groupName = args[2];
    const consumerName = args[3];
    const minIdle = parseInteger(text(args[4]));
    if (minIdle === null) return { error: replyError('ERR Invalid min-idle-time argument for XCLAIM') };
    const minimum = Math.max(0, minIdle);
    const ids = [];
    let force = false;
    let justid = false;
    let idle = null;
    let time = null;
    let retrycount = null;
    let lastid = null;
    for (let index = 5; index < args.length; index += 1) {
        const token = text(args[index]);
        const upper = token.toUpperCase();
        if (upper === 'FORCE') {
            force = true;
            continue;
        }
        if (upper === 'JUSTID') {
            justid = true;
            continue;
        }
        if (upper === 'IDLE' || upper === 'TIME' || upper === 'RETRYCOUNT' || upper === 'LASTID') {
            if (args[index + 1] === undefined) return { error: replyError('ERR syntax error') };
            const value = args[index + 1];
            index += 1;
            if (upper === 'LASTID') {
                const parsed = parseExplicitStreamId(value);
                if (parsed === null) return { error: replyError(STREAM_ID_ERROR) };
                lastid = parsed;
                continue;
            }
            const parsed = parseInteger(text(value));
            if (parsed === null) {
                return { error: replyError(`ERR Invalid ${upper} option argument for XCLAIM`) };
            }
            if (upper === 'IDLE') idle = Math.max(0, parsed);
            else if (upper === 'TIME') time = parsed;
            else retrycount = Math.max(0, parsed);
            continue;
        }
        const id = parseExplicitStreamId(token);
        if (id === null) return { error: replyError(`ERR Unrecognized XCLAIM option '${token}'`) };
        ids.push(id);
    }
    if (ids.length === 0) return { error: wrongArity('xclaim') };
    return {
        run: () => {
            const state = streamState(store, db, key);
            if (state.missing) return commandNoGroup(text(key), text(groupName));
            if (state.error !== undefined) return state.error;
            const group = findGroup(state.stream, groupName);
            if (group === undefined) return commandNoGroup(text(key), text(groupName));
            const now = Date.now();
            const consumer = ensureConsumer(group, consumerName, now);
            const deliveries = [];
            for (const id of ids) {
                const entry = findEntry(state.stream, id);
                if (entry === undefined) continue;
                const row = pendingList(group).find(item => item.pending.ms === id.ms && item.pending.seq === id.seq);
                let count;
                if (row !== undefined) {
                    if (now - row.pending.deliveryTime < minimum) continue;
                    removePending(row.consumer, id);
                    count = row.pending.deliveryCount;
                }
                else {
                    if (!force) continue;
                    count = 1;
                }
                consumer.pending.push({
                    ms: id.ms,
                    seq: id.seq,
                    deliveryTime: idle !== null ? Math.max(0, now - idle) : (time !== null ? time : now),
                    deliveryCount: retrycount !== null ? retrycount : count + (justid ? 0 : 1),
                });
                deliveries.push(justid ? bulk(idText(id)) : entryReply(entry));
            }
            if (deliveries.length > 0) {
                consumer.activeTime = now;
                consumer.deliveryTime = now;
            }
            if (lastid !== null && compareStreamIds(lastid, group.lastId) > 0) {
                group.lastId = { ms: lastid.ms, seq: lastid.seq };
            }
            rewriteKind(store, db, 'stream', key, encodeStream(state.stream.entries, state.stream.last, streamMeta(state.stream)));
            return array(deliveries);
        },
    };
}

/**
 * Plans `XAUTOCLAIM`.
 *
 * The scan starts at the first pending id at or above the cursor, drops pending
 * entries whose message is gone, and stops after claiming `COUNT` entries. The
 * returned cursor is the next id it did not examine, or `0-0` at the end.
 */
function planXAutoClaim(store, session, args) {
    const db = session.db;
    if (args.length < 6) return { error: wrongArity('xautoclaim') };
    const key = args[1];
    const groupName = args[2];
    const consumerName = args[3];
    const minIdle = parseInteger(text(args[4]));
    if (minIdle === null) return { error: replyError('ERR Invalid min-idle-time argument for XAUTOCLAIM') };
    const minimum = Math.max(0, minIdle);
    const start = parseExplicitStreamId(args[5]);
    if (start === null) return { error: replyError(STREAM_ID_ERROR) };
    let count = 100;
    let justid = false;
    for (let index = 6; index < args.length; index += 1) {
        const token = text(args[index]).toUpperCase();
        if (token === 'JUSTID') {
            justid = true;
            continue;
        }
        if (token === 'COUNT') {
            if (args[index + 1] === undefined) return { error: replyError('ERR syntax error') };
            const parsed = parseInteger(text(args[index + 1]));
            if (parsed === null || parsed <= 0) return { error: replyError("ERR COUNT must be > 0") };
            count = parsed;
            index += 1;
            continue;
        }
        return { error: replyError('ERR syntax error') };
    }
    return {
        run: () => {
            const state = streamState(store, db, key);
            if (state.missing) return commandNoGroup(text(key), text(groupName));
            if (state.error !== undefined) return state.error;
            const group = findGroup(state.stream, groupName);
            if (group === undefined) return commandNoGroup(text(key), text(groupName));
            const now = Date.now();
            const consumer = ensureConsumer(group, consumerName, now);
            const list = pendingList(group);
            let position = list.findIndex(row => compareStreamIds(row.pending, start) >= 0);
            if (position < 0) position = list.length;
            const claimed = [];
            const deleted = [];
            let claimedCount = 0;
            while (position < list.length && claimedCount < count) {
                const row = list[position];
                const entry = findEntry(state.stream, row.pending);
                if (entry === undefined) {
                    removePending(row.consumer, row.pending);
                    deleted.push(bulk(idText(row.pending)));
                    position += 1;
                    continue;
                }
                if (now - row.pending.deliveryTime < minimum) {
                    position += 1;
                    continue;
                }
                const deliveryCount = justid ? row.pending.deliveryCount : row.pending.deliveryCount + 1;
                removePending(row.consumer, row.pending);
                consumer.pending.push({
                    ms: row.pending.ms,
                    seq: row.pending.seq,
                    deliveryTime: now,
                    deliveryCount,
                });
                claimed.push(justid ? bulk(idText(row.pending)) : entryReply(entry));
                claimedCount += 1;
                position += 1;
            }
            if (claimedCount > 0) {
                consumer.activeTime = now;
                consumer.deliveryTime = now;
            }
            const cursor = position < list.length ? bulk(idText(list[position].pending)) : bulk('0-0');
            rewriteKind(store, db, 'stream', key, encodeStream(state.stream.entries, state.stream.last, streamMeta(state.stream)));
            return array([cursor, array(claimed), array(deleted)]);
        },
    };
}

/** Fixed metadata the server reports about its idempotency bookkeeping. */
function streamInfoPairs(stream) {
    const keys = stream.entries.length === 0
        ? 0
        : Math.ceil(stream.entries.length / STREAM_NODE_SIZE);
    return [
        ['length', integer(stream.entries.length)],
        ['radix-tree-keys', integer(keys)],
        ['radix-tree-nodes', integer(keys <= 1 ? 1 : keys * 2 - 1)],
        ['last-generated-id', bulk(idText(stream.last))],
        ['max-deleted-entry-id', bulk(idText(stream.maxDeleted))],
        ['entries-added', integer(stream.entriesAdded)],
        ['recorded-first-entry-id', bulk(stream.entries.length === 0 ? '0-0' : idText(stream.entries[0]))],
        ['idmp-duration', integer(100)],
        ['idmp-maxsize', integer(100)],
        ['pids-tracked', integer(0)],
        ['iids-tracked', integer(0)],
        ['iids-added', integer(0)],
        ['iids-duplicates', integer(0)],
        ['groups', integer(stream.groups.length)],
    ];
}

/** Flattens name/value pairs into the RESP2 array shape the server emits. */
function flatPairs(pairs) {
    return array(pairs.flatMap(([name, value]) => [bulk(name), value]));
}

function groupFullMap(stream, group) {
    const rows = pendingList(group);
    const lag = groupLag(stream, group);
    return flatPairs([
        ['name', bulk(group.name)],
        ['last-delivered-id', bulk(idText(group.lastId))],
        ['entries-read', group.entriesRead === null ? nullReply() : integer(group.entriesRead)],
        ['lag', lag === null ? nullReply() : integer(lag)],
        ['pel-count', integer(rows.length)],
        ['nacked-count', integer(0)],
        ['pending', array(rows.map(row => array([
            bulk(idText(row.pending)),
            bulk(row.consumer.name),
            integer(row.pending.deliveryTime),
            integer(row.pending.deliveryCount),
        ])))],
        ['consumers', array(group.consumers.slice().sort(byName).map(consumer => flatPairs([
            ['name', bulk(consumer.name)],
            ['seen-time', integer(consumer.seenTime)],
            ['active-time', integer(consumer.activeTime)],
            ['pel-count', integer(consumer.pending.length)],
            ['pending', array(consumer.pending.slice()
                .sort((left, right) => compareStreamIds(left, right))
                .map(pending => array([
                    bulk(idText(pending)),
                    integer(pending.deliveryTime),
                    integer(pending.deliveryCount),
                ])))],
        ])))],
    ]);
}

/**
 * Plans `XINFO STREAM|GROUPS|CONSUMERS`.
 *
 * The shapes follow the live reply frames: one flat map for `STREAM`, a map per
 * group or consumer for the other two, and `FULL` adds the entries and the
 * nested group state.
 */
function planXInfo(store, session, args) {
    const db = session.db;
    if (args.length < 2) return { error: wrongArity('xinfo') };
    const sub = text(args[1]).toUpperCase();
    const unknown = () => replyError(`ERR unknown subcommand '${text(args[1])}'. Try XINFO HELP.`);
    const malformed = () => replyError(`ERR unknown subcommand or wrong number of arguments for '${text(args[1])}'. Try XINFO HELP.`);
    if (sub === 'STREAM') {
        if (args.length < 3) return { error: wrongArity('xinfo|stream') };
        const key = args[2];
        let full = false;
        let count = null;
        if (args.length >= 4) {
            if (text(args[3]).toUpperCase() !== 'FULL') return { error: malformed() };
            full = true;
            if (args.length === 5 || args.length > 6) return { error: malformed() };
            if (args.length === 6) {
                if (text(args[4]).toUpperCase() !== 'COUNT') return { error: malformed() };
                const parsed = parseInteger(text(args[5]));
                if (parsed === null) return { error: integerError() };
                count = parsed;
            }
        }
        return {
            run: () => {
                const kind = kindOf(store, db, key);
                if (kind === null) return replyError('ERR no such key');
                if (kind !== 'stream') return wrongType();
                const stream = readStream(store, db, key);
                if (stream === null || stream.error === true) return wrongType();
                const entries = count !== null && count > 0
                    ? stream.entries.slice(0, count)
                    : stream.entries;
                const pairs = streamInfoPairs(stream);
                if (full) {
                    // FULL reports the group list itself instead of the group count.
                    pairs.pop();
                    pairs.push(['entries', array(entries.map(entryReply))]);
                    pairs.push(['groups', array(stream.groups.slice().sort(byName).map(group => groupFullMap(stream, group)))]);
                }
                else {
                    pairs.push(['first-entry', entries.length === 0 ? nullReply() : entryReply(stream.entries[0])]);
                    pairs.push(['last-entry', entries.length === 0 ? nullReply() : entryReply(stream.entries[stream.entries.length - 1])]);
                }
                return flatPairs(pairs);
            },
        };
    }
    if (sub === 'GROUPS') {
        if (args.length !== 3) return { error: wrongArity('xinfo|groups') };
        const key = args[2];
        return {
            run: () => {
                const kind = kindOf(store, db, key);
                if (kind === null) return replyError('ERR no such key');
                if (kind !== 'stream') return wrongType();
                const stream = readStream(store, db, key);
                if (stream === null || stream.error === true) return wrongType();
                return array(stream.groups.slice().sort(byName).map(group => {
                    const lag = groupLag(stream, group);
                    return flatPairs([
                        ['name', bulk(group.name)],
                        ['consumers', integer(group.consumers.length)],
                        ['pending', integer(pendingCount(group))],
                        ['last-delivered-id', bulk(idText(group.lastId))],
                        ['entries-read', group.entriesRead === null ? nullReply() : integer(group.entriesRead)],
                        ['lag', lag === null ? nullReply() : integer(lag)],
                    ]);
                }));
            },
        };
    }
    if (sub === 'CONSUMERS') {
        if (args.length !== 4) return { error: wrongArity('xinfo|consumers') };
        const key = args[2];
        const groupName = args[3];
        return {
            run: () => {
                const kind = kindOf(store, db, key);
                if (kind === null) return replyError('ERR no such key');
                if (kind !== 'stream') return wrongType();
                const stream = readStream(store, db, key);
                if (stream === null || stream.error === true) return wrongType();
                const group = findGroup(stream, groupName);
                if (group === undefined) return groupNoGroup(text(groupName), text(key));
                const now = Date.now();
                return array(group.consumers.slice().sort(byName).map(consumer => flatPairs([
                    ['name', bulk(consumer.name)],
                    ['pending', integer(consumer.pending.length)],
                    ['idle', integer(consumerIdle(consumer, now))],
                    ['inactive', integer(consumerInactive(consumer, now))],
                ])));
            },
        };
    }
    return { error: unknown() };
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

        case 'hincrbyfloat': {
            if (args.length !== 4) return { error: wrongArity('hincrbyfloat') };
            const increment = parseLongDouble(args[3]);
            if (increment === null) return { error: replyError('ERR value is not a valid float') };
            if (increment.inf !== undefined) return { error: replyError('ERR value is NaN or Infinity') };
            const field = args[2];
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind !== null && kind !== 'hash') return wrongType();
                    const fields = kind === null ? [] : readHash(store, db, key);
                    if (fields === null) return replyError('ERR stored hash value is corrupt');
                    const position = fields.findIndex(([name]) => name.equals(field));
                    let current = { m: 0n, e: 0, negative: false };
                    if (position >= 0) {
                        const parsed = parseLongDouble(fields[position][1]);
                        if (parsed === null) return replyError('ERR hash value is not a float');
                        current = parsed;
                    }
                    const updated = addLongDoubles(current, increment);
                    if (updated.nan === true || updated.inf !== undefined) {
                        return replyError('ERR increment would produce NaN or Infinity');
                    }
                    const value = Buffer.from(longDoubleText(updated), 'utf8');
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

        case 'hscan':
        case 'hset':
        case 'hget':
        case 'hgetall':
        case 'hdel':
        case 'hlen':
        case 'hincrby':
        case 'hkeys':
        case 'hvals':
        case 'hexists': {
            // Arity, cursor syntax and delta parsing stay here because they run
            // while a transaction queues the command, so `MULTI` still rejects
            // such a command instead of deferring the error to `EXEC`. Field
            // encoding, type checks and reply framing all run upstream.
            if (name === 'hset' && (args.length < 4 || (args.length - 2) % 2 !== 0)) {
                return { error: wrongArity('hset') };
            }
            if (name === 'hdel' && args.length < 3) {
                return { error: wrongArity('hdel') };
            }
            const fixed = { hget: 3, hgetall: 2, hlen: 2, hincrby: 4, hkeys: 2, hvals: 2, hexists: 3 }[name];
            if (fixed !== undefined && args.length !== fixed) {
                return { error: wrongArity(name) };
            }
            if (name === 'hincrby' && parseInteger(args[3]) === null) {
                return { error: integerError() };
            }
            if (name === 'hscan') {
                if (args.length < 3) {
                    return { error: wrongArity('hscan') };
                }
                if (parseScanCursor(args[2]) === null) {
                    return { error: replyError('ERR invalid cursor') };
                }
                const options = parseScanOptions(args, 3);
                if (options.error !== undefined) {
                    return { error: options.error };
                }
            }
            // The upstream type probe knows the five kinds its facade implements
            // and has no stream kind, so a stream key is rejected here until the
            // stream family moves upstream. Without this guard a hash write would
            // fork the key into two live representations.
            return {
                run: () => (key !== null && store.existsKind(db, SUFFIX.stream, key)
                    ? wrongType()
                    : store.hashCommand(db, session.protocol ?? 2, args)),
            };
        }

        case 'linsert': {
            if (args.length !== 5) return { error: wrongArity('linsert') };
            const where = text(args[2]).toLowerCase();
            if (where !== 'before' && where !== 'after') return { error: replyError('ERR syntax error') };
            return { run: forwardList(store, session, args, [key], [key]) };
        }

        case 'lmpop': {
            if (args.length < 4) return { error: wrongArity('lmpop') };
            const count = parseInteger(args[1]);
            if (count === null || count <= 0) {
                return { error: replyError('ERR numkeys should be greater than 0') };
            }
            const keys = args.slice(2, 2 + count);
            const sideIndex = 2 + count;
            if (sideIndex >= args.length) return { error: replyError('ERR syntax error') };
            const side = text(args[sideIndex]).toLowerCase();
            if (side !== 'left' && side !== 'right') return { error: replyError('ERR syntax error') };
            if (sideIndex + 1 < args.length) {
                if (text(args[sideIndex + 1]).toLowerCase() !== 'count' || sideIndex + 3 !== args.length) {
                    return { error: replyError('ERR syntax error') };
                }
                const requested = parseInteger(args[sideIndex + 2]);
                if (requested === null || requested <= 0) {
                    return { error: replyError('ERR count should be greater than 0') };
                }
            }
            return { run: forwardList(store, session, args, keys) };
        }

        case 'blpop':
        case 'brpop': {
            if (args.length < 3) return { error: wrongArity(name) };
            const timeout = parseBlockingTimeout(args[args.length - 1]);
            if (timeout.error !== undefined) return { error: replyError(timeout.error) };
            const keys = args.slice(1, args.length - 1);
            return blockingPlan(db, keys, timeout.timeoutMs, forwardBlockingList(store, session, args, keys), nullArray());
        }

        case 'blmove':
        case 'brpoplpush': {
            let sourceSide = 'right';
            let destinationSide = 'left';
            let timeoutRaw = args[3];
            if (name === 'blmove') {
                if (args.length !== 6) return { error: wrongArity('blmove') };
                sourceSide = text(args[3]).toLowerCase();
                destinationSide = text(args[4]).toLowerCase();
                timeoutRaw = args[5];
            }
            else if (args.length !== 4) {
                return { error: wrongArity('brpoplpush') };
            }
            if ((sourceSide !== 'left' && sourceSide !== 'right') || (destinationSide !== 'left' && destinationSide !== 'right')) {
                return { error: replyError('ERR syntax error') };
            }
            const timeout = parseBlockingTimeout(timeoutRaw);
            if (timeout.error !== undefined) return { error: replyError(timeout.error) };
            const source = args[1];
            const destination = args[2];
            return blockingPlan(
                db,
                [source],
                timeout.timeoutMs,
                forwardBlockingList(store, session, args, [source, destination]),
                nullArray(),
            );
        }

        case 'blmpop': {
            if (args.length < 5) return { error: wrongArity('blmpop') };
            const timeout = parseBlockingTimeout(args[1]);
            if (timeout.error !== undefined) return { error: replyError(timeout.error) };
            const numkeys = parseInteger(args[2]);
            if (numkeys === null) return { error: integerError() };
            if (numkeys <= 0) return { error: replyError('ERR numkeys should be greater than 0') };
            if (args.length < numkeys + 4) return { error: replyError('ERR syntax error') };
            const keys = args.slice(3, 3 + numkeys);
            const side = text(args[3 + numkeys]).toLowerCase();
            if (side !== 'left' && side !== 'right') return { error: replyError('ERR syntax error') };
            const tail = 4 + numkeys;
            if (args.length > tail) {
                if (text(args[tail]).toLowerCase() !== 'count' || tail + 2 !== args.length) {
                    return { error: replyError('ERR syntax error') };
                }
                const requested = parseInteger(args[tail + 1]);
                if (requested === null || requested <= 0) {
                    return { error: replyError('ERR count should be greater than 0') };
                }
            }
            return blockingPlan(db, keys, timeout.timeoutMs, forwardBlockingList(store, session, args, keys), nullArray());
        }

        case 'lpos': {
            if (args.length < 3) return { error: wrongArity('lpos') };
            return { run: forwardList(store, session, args, [key]) };
        }

        case 'lpush':
        case 'rpush': {
            if (args.length < 3) return { error: wrongArity(name) };
            return { run: forwardList(store, session, args, [key], [key]) };
        }

        case 'lrange': {
            if (args.length !== 4) return { error: wrongArity('lrange') };
            if (parseInteger(args[2]) === null || parseInteger(args[3]) === null) {
                return { error: integerError() };
            }
            return { run: forwardList(store, session, args, [key]) };
        }

        case 'lindex': {
            if (args.length !== 3) return { error: wrongArity('lindex') };
            if (parseInteger(args[2]) === null) return { error: integerError() };
            return { run: forwardList(store, session, args, [key]) };
        }

        case 'lset': {
            if (args.length !== 4) return { error: wrongArity('lset') };
            if (parseInteger(args[2]) === null) return { error: integerError() };
            return { run: forwardList(store, session, args, [key]) };
        }

        case 'ltrim': {
            if (args.length !== 4) return { error: wrongArity('ltrim') };
            if (parseInteger(args[2]) === null || parseInteger(args[3]) === null) {
                return { error: integerError() };
            }
            return { run: forwardList(store, session, args, [key]) };
        }

        case 'lrem': {
            if (args.length !== 4) return { error: wrongArity('lrem') };
            if (parseInteger(args[2]) === null) return { error: integerError() };
            return { run: forwardList(store, session, args, [key]) };
        }

        case 'lpop':
        case 'rpop': {
            if (args.length !== 2 && args.length !== 3) return { error: wrongArity(name) };
            if (args.length === 3) {
                const count = parseInteger(args[2]);
                if (count === null) return { error: integerError() };
                if (count <= 0) return { error: replyError('ERR value is out of range, must be positive') };
            }
            return { run: forwardList(store, session, args, [key]) };
        }

        case 'llen': {
            if (args.length !== 2) return { error: wrongArity('llen') };
            return { run: forwardList(store, session, args, [key]) };
        }

        case 'rpoplpush': {
            if (args.length !== 3) return { error: wrongArity('rpoplpush') };
            return { run: forwardList(store, session, args, [args[1], args[2]], [args[2]]) };
        }

        case 'lmove': {
            if (args.length !== 5) return { error: wrongArity('lmove') };
            const sourceSide = text(args[3]).toLowerCase();
            const destinationSide = text(args[4]).toLowerCase();
            if ((sourceSide !== 'left' && sourceSide !== 'right')
                || (destinationSide !== 'left' && destinationSide !== 'right')) {
                return { error: replyError('ERR syntax error') };
            }
            return { run: forwardList(store, session, args, [args[1], args[2]], [args[2]]) };
        }

        case 'sadd': {
            if (args.length < 3) return { error: wrongArity('sadd') };
            return { run: forwardSet(store, session, args, [key]) };
        }

        case 'srem': {
            if (args.length < 3) return { error: wrongArity('srem') };
            return { run: forwardSet(store, session, args, [key]) };
        }

        case 'smembers': {
            if (args.length !== 2) return { error: wrongArity('smembers') };
            return { run: forwardSet(store, session, args, [key]) };
        }

        case 'scard': {
            if (args.length !== 2) return { error: wrongArity('scard') };
            return { run: forwardSet(store, session, args, [key]) };
        }

        case 'sismember': {
            if (args.length !== 3) return { error: wrongArity('sismember') };
            return { run: forwardSet(store, session, args, [key]) };
        }

        case 'smove': {
            if (args.length !== 4) return { error: wrongArity('smove') };
            return { run: forwardSet(store, session, args, [args[1], args[2]]) };
        }

        case 'srandmember': {
            if (args.length !== 2 && args.length !== 3) return { error: wrongArity('srandmember') };
            if (args.length === 3 && parseInteger(args[2]) === null) return { error: integerError() };
            return { run: forwardSet(store, session, args, [key]) };
        }

        case 'sscan': {
            if (args.length < 3) return { error: wrongArity('sscan') };
            const cursor = parseScanCursor(args[2]);
            if (cursor === null) return { error: replyError('ERR invalid cursor') };
            const options = parseScanOptions(args, 3);
            if (options.error !== undefined) return { error: options.error };
            return { run: forwardSet(store, session, args, [key]) };
        }

        default:
            return { error: unknownCommand(args) };
    }
}

/** Commands Redis still honours while a RESP2 connection is in subscriber mode. */
const SUBSCRIBER_COMMANDS = new Set(['subscribe', 'unsubscribe', 'psubscribe', 'punsubscribe', 'ping', 'quit', 'reset']);

/** Canonical map key of one channel or pattern so duplicate names deduplicate. */
function subscriptionKey(name) {
    return Buffer.from(name).toString('hex');
}

function ensureSubscriptions(session) {
    if (session.subscriptions === undefined) {
        session.subscriptions = { channels: new Map(), patterns: new Map() };
    }
    return session.subscriptions;
}

function subscribed(session) {
    const subscriptions = session.subscriptions;
    return subscriptions !== undefined && (subscriptions.channels.size > 0 || subscriptions.patterns.size > 0);
}

/**
 * Builds one ack frame per name for `SUBSCRIBE`/`PSUBSCRIBE` or `UNSUBSCRIBE`/`PUNSUBSCRIBE`.
 *
 * With no names the whole kind is removed, and when nothing was subscribed Redis still
 * answers one frame whose name is null. The trailing count is the total number of live
 * channel plus pattern subscriptions, exactly as the receiver-side Redis reports it.
 */
function subscriptionFrames(session, args, pattern, removing = false) {
    const subscriptions = ensureSubscriptions(session);
    const target = pattern ? subscriptions.patterns : subscriptions.channels;
    const kind = removing
        ? (pattern ? 'punsubscribe' : 'unsubscribe')
        : (pattern ? 'psubscribe' : 'subscribe');
    const frames = [];
    if (removing && args.length === 1) {
        if (target.size === 0) {
            frames.push(push([bulk(kind), nullReply(), integer(subscriptions.channels.size + subscriptions.patterns.size)]));
            return frames;
        }
        for (const [key, name] of target) {
            target.delete(key);
            frames.push(push([bulk(kind), bulk(name), integer(subscriptions.channels.size + subscriptions.patterns.size)]));
        }
        return frames;
    }
    if (!removing) {
        for (const name of args.slice(1)) {
            const key = subscriptionKey(name);
            if (!target.has(key)) {
                target.set(key, Buffer.from(name));
            }
            frames.push(push([bulk(kind), bulk(name), integer(subscriptions.channels.size + subscriptions.patterns.size)]));
        }
        return frames;
    }
    for (const name of args.slice(1)) {
        target.delete(subscriptionKey(name));
        frames.push(push([bulk(kind), bulk(name), integer(subscriptions.channels.size + subscriptions.patterns.size)]));
    }
    return frames;
}

/** Delivers one published message to a single session, answering its receiver count. */
function deliverTo(session, channel, payload) {
    const subscriptions = session.subscriptions;
    if (subscriptions === undefined) {
        return 0;
    }
    const channelBytes = Buffer.from(channel);
    const payloadBytes = Buffer.from(payload);
    let delivered = 0;
    if (subscriptions.channels.has(subscriptionKey(channelBytes))) {
        session.deliver?.(push([bulk('message'), bulk(channelBytes), bulk(payloadBytes)]));
        delivered += 1;
    }
    for (const pattern of subscriptions.patterns.values()) {
        if (globMatch(pattern, channelBytes)) {
            session.deliver?.(push([bulk('pmessage'), bulk(pattern), bulk(channelBytes), bulk(payloadBytes)]));
            delivered += 1;
        }
    }
    return delivered;
}

/** Collects the active channels of one session, optionally filtered by a glob. */
function channelNames(session, pattern) {
    const subscriptions = session.subscriptions;
    if (subscriptions === undefined) {
        return [];
    }
    const names = [];
    for (const name of subscriptions.channels.values()) {
        if (pattern === undefined || globMatch(pattern, name)) {
            names.push(name);
        }
    }
    return names;
}

/** Counts the sessions subscribed directly to each requested channel. */
function channelSubscribers(session, channels) {
    return channels.map(channel => {
        const key = subscriptionKey(channel);
        if (session.pubsub !== undefined) {
            return [channel, session.pubsub.countSubscribers(key)];
        }
        const subscriptions = session.subscriptions;
        return [channel, subscriptions !== undefined && subscriptions.channels.has(key) ? 1 : 0];
    });
}

/**
 * One server-wide pub/sub table.
 *
 * The server runs a single event loop, so a publish runs synchronously and writes the
 * push frame straight to each subscriber's socket through its `deliver` callback. That
 * keeps a subscriber's ack frames and deliveries ordered without a queue.
 */
export class PubSubHub {
    constructor() {
        this.sessions = new Set();
    }

    attach(session) {
        this.sessions.add(session);
    }

    detach(session) {
        this.sessions.delete(session);
    }

    publish(channel, payload) {
        let delivered = 0;
        for (const session of this.sessions) {
            delivered += deliverTo(session, channel, payload);
        }
        return delivered;
    }

    channels(pattern) {
        const names = new Map();
        for (const session of this.sessions) {
            for (const name of channelNames(session, pattern)) {
                names.set(subscriptionKey(name), name);
            }
        }
        return [...names.values()];
    }

    countSubscribers(key) {
        let count = 0;
        for (const session of this.sessions) {
            if (session.subscriptions?.channels.has(key)) {
                count += 1;
            }
        }
        return count;
    }

    numpat() {
        let total = 0;
        for (const session of this.sessions) {
            total += session.subscriptions?.patterns.size ?? 0;
        }
        return total;
    }
}

function publish(session, channel, payload) {
    if (session.pubsub !== undefined) {
        return session.pubsub.publish(channel, payload);
    }
    return deliverTo(session, channel, payload);
}

/** Resolved `PUBSUB` subcommand in lower case, `null` when absent or unknown. */
function pubsubSubcommand(args) {
    if (args.length < 2) return null;
    const subcommand = text(args[1]).toLowerCase();
    return subcommand === 'channels' || subcommand === 'numsub' || subcommand === 'numpat' ? subcommand : null;
}

/**
 * The error Redis reports for a malformed `PUBSUB` call, before anything else.
 *
 * An absent or unknown subcommand and a bad `NUMPAT` arity differ in wording,
 * so each branch mirrors the text the real server answers with.
 */
function pubsubSubcommandError(args, subcommand) {
    if (args.length < 2) {
        return replyError("ERR wrong number of arguments for 'pubsub' command");
    }
    const typed = text(args[1]);
    if (subcommand === null) {
        return replyError(`ERR unknown subcommand '${typed}'. Try PUBSUB HELP.`);
    }
    if (subcommand === 'channels' && args.length > 3) {
        return replyError(`ERR unknown subcommand or wrong number of arguments for '${typed}'. Try PUBSUB HELP.`);
    }
    if (subcommand === 'numpat' && args.length > 2) {
        return replyError("ERR wrong number of arguments for 'pubsub|numpat' command");
    }
    return null;
}

function planPubsub(session, args) {
    const subcommand = pubsubSubcommand(args);
    const malformed = pubsubSubcommandError(args, subcommand);
    if (malformed !== null) {
        return { error: malformed };
    }
    if (subcommand === 'channels') {
        return {
            run: () => {
                const names = session.pubsub !== undefined
                    ? session.pubsub.channels(args[2])
                    : channelNames(session, args[2]);
                return array(names.map(name => bulk(name)));
            },
        };
    }
    if (subcommand === 'numsub') {
        return {
            run: () => {
                const pairs = channelSubscribers(session, args.slice(2));
                return array(pairs.flatMap(([name, count]) => [bulk(name), integer(count)]));
            },
        };
    }
    return {
        run: () => integer(session.pubsub !== undefined
            ? session.pubsub.numpat()
            : session.subscriptions?.patterns.size ?? 0),
    };
}
