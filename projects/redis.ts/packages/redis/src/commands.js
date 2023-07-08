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

const INT64_MIN = -(1n << 63n);
const INT64_MAX = (1n << 63n) - 1n;

/** Parses one signed 64-bit integer exactly, `null` outside the range or on bad text. */
function parseI64(raw) {
    const value = text(raw);
    const negative = value.startsWith('-');
    const digits = negative ? value.slice(1) : value;
    if (digits.length === 0 || digits.length > 19 || !/^\d+$/.test(digits)) return null;
    if (digits.length > 1 && digits.startsWith('0')) return null;
    const magnitude = BigInt(digits);
    const parsed = negative ? -magnitude : magnitude;
    return parsed >= INT64_MIN && parsed <= INT64_MAX ? parsed : null;
}

/**
 * Parses `iN` / `uN` the way the gateway does.
 *
 * Unsigned widths stop at `u63` and signed widths stop at `i64`, matching the
 * documented rejection of `u64`.
 */
function parseBitEncoding(raw) {
    const value = text(raw);
    const match = /^(i|u)(\d+)$/.exec(value.toLowerCase());
    if (match === null) return null;
    const signed = match[1] === 'i';
    const bits = Number(match[2]);
    if (!Number.isSafeInteger(bits) || bits < 1) return null;
    if (bits > (signed ? 64 : 63)) return null;
    return { signed, bits };
}

/** Parses a bit offset: plain bit index, or `#n` multiplied by the encoding width. */
function parseBitfieldOffset(raw, bits) {
    const value = text(raw);
    let big;
    if (value.startsWith('#')) {
        const scaled = parseI64(value.slice(1));
        big = scaled === null ? null : scaled * BigInt(bits);
    }
    else {
        big = parseI64(value);
    }
    if (big === null || big < 0n || big > BigInt(MAX_BIT_OFFSET)) return null;
    return Number(big);
}

/** Reads one bitfield value, missing bits counting as zero. */
function readBitfield(body, offset, encoding) {
    let raw = 0n;
    for (let step = 0; step < encoding.bits; step += 1) {
        const position = offset + step;
        const index = Math.floor(position / 8);
        const bit = index < body.length ? (body[index] >> (7 - (position % 8))) & 1 : 0;
        raw = (raw << 1n) | BigInt(bit);
    }
    if (encoding.signed && raw >= (1n << BigInt(encoding.bits - 1))) {
        return raw - (1n << BigInt(encoding.bits));
    }
    return raw;
}

/** Writes one bitfield value, growing the body and zero filling as needed. */
function writeBitfield(body, offset, encoding, value) {
    const bits = encoding.bits;
    const mask = (1n << BigInt(bits)) - 1n;
    const raw = value & mask;
    const needed = Math.floor((offset + bits + 7) / 8);
    if (body.length < needed) {
        const grown = Buffer.alloc(needed);
        body.copy(grown, 0);
        body = grown;
    }
    for (let step = 0; step < bits; step += 1) {
        const position = offset + step;
        const byte = Math.floor(position / 8);
        const bit = (raw >> BigInt(bits - 1 - step)) & 1n;
        const shift = 7 - (position % 8);
        if (bit === 1n) body[byte] |= 1 << shift;
        else body[byte] &= ~(1 << shift);
    }
    return body;
}

/** Range check plus the selected `WRAP` / `SAT` / `FAIL` policy; `null` on `FAIL`. */
function normalizeBitfield(value, encoding, overflow) {
    const bits = BigInt(encoding.bits);
    const minimum = encoding.signed ? -(1n << (bits - 1n)) : 0n;
    const maximum = encoding.signed ? (1n << (bits - 1n)) - 1n : (1n << bits) - 1n;
    if (value >= minimum && value <= maximum) return value;
    if (overflow === 'fail') return null;
    if (overflow === 'sat') return value < minimum ? minimum : maximum;
    const span = maximum - minimum + 1n;
    return minimum + (((value - minimum) % span) + span) % span;
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

const HLL_P = 14;
const HLL_Q = 50;
const HLL_REGISTERS = 1 << HLL_P;
const HLL_BITS = 6;
const HLL_HEADER = 16;
const HLL_REGISTER_BYTES = (HLL_REGISTERS * HLL_BITS) / 8;
const HLL_DENSE_SIZE = HLL_HEADER + HLL_REGISTER_BYTES;
const HLL_ALPHA_INF = 0.721347520444481703680;
const INVALID_HLL = 'WRONGTYPE Key is not a valid HyperLogLog string value.';
const MURMUR_M = 0xc6a4a7935bd1e995n;
const MURMUR_R = 47n;
const MASK64 = 0xffffffffffffffffn;

/** Redis 的 MurmurHash64A，种子固定为 `0xadc83b19`。 */
function murmur64a(buffer) {
    const seed = 0xadc83b19n;
    let hash = (seed ^ ((BigInt(buffer.length) * MURMUR_M) & MASK64)) & MASK64;
    let offset = 0;
    while (offset + 8 <= buffer.length) {
        let block = 0n;
        for (let index = 0; index < 8; index += 1) {
            block |= BigInt(buffer[offset + index]) << BigInt(8 * index);
        }
        block = (block * MURMUR_M) & MASK64;
        block ^= block >> MURMUR_R;
        block = (block * MURMUR_M) & MASK64;
        hash ^= block;
        hash = (hash * MURMUR_M) & MASK64;
        offset += 8;
    }
    if (offset < buffer.length) {
        let extra = 0n;
        for (let index = offset; index < buffer.length; index += 1) {
            extra |= BigInt(buffer[index]) << BigInt(8 * (index - offset));
        }
        hash ^= extra;
        hash = (hash * MURMUR_M) & MASK64;
    }
    hash ^= hash >> MURMUR_R;
    hash = (hash * MURMUR_M) & MASK64;
    hash ^= hash >> MURMUR_R;
    return hash;
}

/** 元素映射为「寄存器下标 + 尾零计数」。 */
function hllPatLen(element) {
    const buffer = Buffer.isBuffer(element) ? element : Buffer.from(String(element));
    let hash = murmur64a(buffer);
    const index = Number(hash & BigInt(HLL_REGISTERS - 1));
    hash >>= BigInt(HLL_P);
    hash |= 1n << BigInt(HLL_Q);
    let bit = 1n;
    let count = 1;
    while ((hash & bit) === 0n) {
        count += 1;
        bit <<= 1n;
    }
    return [index, count];
}

function hllGetRegister(registers, index) {
    const bit = index * HLL_BITS;
    const byte = Math.floor(bit / 8);
    const shift = bit % 8;
    const low = registers[byte];
    const high = byte + 1 < registers.length ? registers[byte + 1] : 0;
    return ((low >> shift) | (high << (8 - shift))) & 63;
}

function hllSetRegister(registers, index, value) {
    const register = value & 63;
    const bit = index * HLL_BITS;
    const byte = Math.floor(bit / 8);
    const shift = bit % 8;
    const lowBits = Math.min(8 - shift, HLL_BITS);
    const lowMask = (((1 << lowBits) - 1) << shift) & 0xff;
    registers[byte] = (registers[byte] & ~lowMask & 0xff) | ((register << shift) & lowMask);
    if (shift + HLL_BITS > 8) {
        const spill = shift + HLL_BITS - 8;
        const mask = (1 << spill) - 1;
        const next = byte + 1;
        if (next < registers.length) {
            registers[next] = (registers[next] & ~mask & 0xff) | ((register >> (8 - shift)) & mask);
        }
    }
}

function hllTau(value) {
    if (value === 0 || value === 1) return 0;
    let x = value;
    let y = 1;
    let z = 1 - x;
    for (;;) {
        x = Math.sqrt(x);
        const previous = z;
        y *= 0.5;
        z -= (1 - x) * (1 - x) * y;
        if (previous === z) return z / 3;
    }
}

function hllSigma(value) {
    if (value === 1) return Infinity;
    let x = value;
    let y = 1;
    let z = x;
    for (;;) {
        x *= x;
        const previous = z;
        z += x * y;
        y += y;
        if (previous === z) return z;
    }
}

/** 从寄存器直方图做基数估计，公式与真机一致。 */
function hllEstimate(registers) {
    const m = HLL_REGISTERS;
    const histogram = new Array(64).fill(0);
    for (let index = 0; index < HLL_REGISTERS; index += 1) {
        histogram[hllGetRegister(registers, index)] += 1;
    }
    let z = m * hllTau((m - histogram[HLL_Q + 1]) / m);
    for (let j = HLL_Q; j >= 1; j -= 1) {
        z += histogram[j];
        z *= 0.5;
    }
    z += m * hllSigma(histogram[0] / m);
    return Math.round((HLL_ALPHA_INF * m * m) / z);
}

function newHllBytes() {
    const bytes = Buffer.alloc(HLL_DENSE_SIZE);
    bytes.write('HYLL', 0, 'ascii');
    return bytes;
}

/** 校验 dense HyperLogLog，返回寄存器区；不合法时返回 `null`。 */
function hllRegisters(body) {
    if (body === null || body === undefined || body.length !== HLL_DENSE_SIZE) return null;
    if (body[0] !== 0x48 || body[1] !== 0x59 || body[2] !== 0x4c || body[3] !== 0x4c) return null;
    if (body[4] !== 0) return null;
    return body.subarray(HLL_HEADER);
}

function hllMergeMax(target, source) {
    for (let index = 0; index < HLL_REGISTERS; index += 1) {
        const value = hllGetRegister(source, index);
        if (value > hllGetRegister(target, index)) hllSetRegister(target, index, value);
    }
}

/**
 * 读取一个 HLL 键。
 *
 * HLL 在真机上就是字符串，所以它落在字符串命名空间，`TYPE` 也回复 `string`。
 */
function loadHll(store, db, key) {
    const kind = kindOf(store, db, key);
    if (kind === null) return { state: 'missing' };
    if (kind !== 'string') return { state: 'wrong-type' };
    const body = store.getKind(db, SUFFIX.string, key);
    if (body === null || body === undefined) return { state: 'missing' };
    if (hllRegisters(body) === null) return { state: 'invalid' };
    return { state: 'found', body: Buffer.from(body) };
}

function planHyperLogLog(store, session, name, args) {
    if (name === 'pfadd') {
        if (args.length < 2) return { error: wrongArity('pfadd') };
        const key = args[1];
        return {
            run: () => {
                const loaded = loadHll(store, session.db, key);
                if (loaded.state === 'wrong-type') return wrongType();
                if (loaded.state === 'invalid') return replyError(INVALID_HLL);
                const body = loaded.state === 'found' ? loaded.body : newHllBytes();
                const registers = body.subarray(HLL_HEADER);
                let modified = loaded.state === 'missing';
                for (const element of args.slice(2)) {
                    const [index, count] = hllPatLen(element);
                    if (hllGetRegister(registers, index) < count) {
                        hllSetRegister(registers, index, count);
                        modified = true;
                    }
                }
                if (modified) {
                    body[15] |= 0x80;
                    rewriteString(store, session.db, key, body);
                }
                return integer(modified ? 1 : 0);
            },
        };
    }
    if (name === 'pfcount') {
        if (args.length < 2) return { error: wrongArity('pfcount') };
        return {
            run: () => {
                if (args.length === 2) {
                    const loaded = loadHll(store, session.db, args[1]);
                    if (loaded.state === 'wrong-type') return wrongType();
                    if (loaded.state === 'invalid') return replyError(INVALID_HLL);
                    if (loaded.state === 'missing') return integer(0);
                    return integer(hllEstimate(hllRegisters(loaded.body)));
                }
                const merged = Buffer.alloc(HLL_REGISTER_BYTES);
                for (const key of args.slice(1)) {
                    const loaded = loadHll(store, session.db, key);
                    if (loaded.state === 'wrong-type') return wrongType();
                    if (loaded.state === 'invalid') return replyError(INVALID_HLL);
                    if (loaded.state === 'missing') continue;
                    hllMergeMax(merged, hllRegisters(loaded.body));
                }
                return integer(hllEstimate(merged));
            },
        };
    }
    // `PFMERGE` accepts only a destination and folds zero sources into it.
    if (args.length < 2) return { error: wrongArity('pfmerge') };

    return {
        run: () => {
            const merged = Buffer.alloc(HLL_REGISTER_BYTES);
            for (const key of args.slice(1)) {
                const loaded = loadHll(store, session.db, key);
                if (loaded.state === 'wrong-type') return wrongType();
                if (loaded.state === 'invalid') return replyError(INVALID_HLL);
                if (loaded.state === 'missing') continue;
                hllMergeMax(merged, hllRegisters(loaded.body));
            }
            const destination = args[1];
            const loaded = loadHll(store, session.db, destination);
            if (loaded.state === 'wrong-type') return wrongType();
            if (loaded.state === 'invalid') return replyError(INVALID_HLL);
            const body = loaded.state === 'found' ? loaded.body : newHllBytes();
            body.subarray(HLL_HEADER).set(merged);
            body[15] |= 0x80;
            rewriteString(store, session.db, destination, body);
            return simple('OK');
        },
    };
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

    // `CLIENT LIST` and `INFO` read the connection's own bookkeeping, so every
    // command updates the context, activity stamp and counters before running.
    session.lastCommand = commandContext(name, args);
    session.lastActivity = Date.now();
    session.commandCount = (session.commandCount ?? 0) + 1;
    if (session.stats !== undefined) session.stats.commands += 1;

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
        return { reply: outcome.reply, close: outcome.close };
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
            return planClient(session, args);

        case 'command':
            return planCommand(args);

        case 'info':
            return planInfo(store, session, args);

        case 'config':
            return planConfig(session, args);

        case 'acl':
            return planAcl(args);

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
            if (args.length !== 3) return { error: wrongArity('getset') };
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
            if (args.length < 2) return { error: wrongArity('mget') };
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
                return { error: replyError('ERR The bit argument must be 1 or 0.') };
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

        case 'bitfield':
        case 'bitfield_ro':
            return planBitfield(store, session, name, args);

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
        case 'zadd':
        case 'zscore':
        case 'zrem':
        case 'zcard':
        case 'zrange':
        case 'zscan':
            return planCollection(store, session, name, args);

        case 'lpos':
            return planLpos(store, session, args);

        case 'pfadd':
        case 'pfcount':
        case 'pfmerge':
            return planHyperLogLog(store, session, name, args);

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

        case 'incr':
            if (args.length !== 2) return { error: wrongArity('incr') };
            return incremental(store, session, args[1], 1);

        case 'decr':
            if (args.length !== 2) return { error: wrongArity('decr') };
            return incremental(store, session, args[1], -1);

        case 'incrby':
        case 'decrby': {
            if (args.length !== 3) return { error: wrongArity(name) };
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
                    // 真机 `EXPIRETIME` 按毫秒位四舍五入到秒（余数 >= 500 进位），不是截断。
                    return integer(milliseconds ? deadline : Math.round(deadline / 1000));
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

/** Container commands whose `cmd` field in `CLIENT LIST` is rendered as `parent|sub`. */
const CONTAINER_COMMANDS = new Set([
    'acl', 'client', 'command', 'config', 'function', 'latency', 'memory', 'object',
    'pubsub', 'script', 'xgroup', 'xinfo',
]);

/** Command context displayed by `CLIENT LIST`: the name alone, or `parent|sub`. */
function commandContext(name, args) {
    return CONTAINER_COMMANDS.has(name) && args.length > 1 ? `${name}|${text(args[1]).toLowerCase()}` : name;
}

/** Redis accepts client names made of printable ASCII only, and an empty name clears it. */
function validClientName(name) {
    for (let index = 0; index < name.length; index += 1) {
        const code = name.charCodeAt(index);
        if (code < 0x21 || code > 0x7e) return false;
    }
    return true;
}

/** `addr` / `laddr` text of one session, `host:port` like the upstream client line. */
function clientAddress(session, local) {
    const address = local ? session.localAddress : session.remoteAddress;
    if (address === null || address === undefined) return '127.0.0.1:0';
    if (typeof address === 'string') return address;
    const host = address.address ?? '127.0.0.1';
    return `${host.includes(':') ? `[${host}]` : host}:${address.port ?? 0}`;
}

/** One `CLIENT LIST` line, in the field order the upstream server emits. */
function clientLine(session) {
    const now = Date.now();
    const created = session.createdAt ?? now;
    const subscriptions = session.subscriptions;
    const fields = [
        `id=${session.id ?? 1}`,
        `addr=${clientAddress(session, false)}`,
        `laddr=${clientAddress(session, true)}`,
        `fd=${session.fd ?? (session.id ?? 1)}`,
        `name=${session.name ?? ''}`,
        `age=${Math.max(0, Math.floor((now - created) / 1000))}`,
        `idle=${Math.max(0, Math.floor((now - (session.lastActivity ?? created)) / 1000))}`,
        'flags=N',
        `db=${session.db ?? 0}`,
        `sub=${subscriptions?.channels.size ?? 0}`,
        `psub=${subscriptions?.patterns.size ?? 0}`,
        'ssub=0',
        `multi=${session.queued ? session.queued.length : -1}`,
        'watch=0',
        'qbuf=0',
        'qbuf-free=0',
        'argv-mem=0',
        'multi-mem=0',
        'rbs=1024',
        'rbp=0',
        'obl=0',
        'oll=0',
        'omem=0',
        'omem-shared=0',
        'omem-unshared=0',
        'tot-mem=0',
        'events=r',
        `cmd=${session.lastCommand ?? 'client|list'}`,
        'user=default',
        'redir=-1',
        `resp=${session.protocol ?? 2}`,
        `lib-name=${session.libName ?? ''}`,
        `lib-ver=${session.libVer ?? ''}`,
        'io-thread=0',
        'tot-net-in=0',
        'tot-net-out=0',
        `tot-cmds=${session.commandCount ?? 0}`,
        'read-events=0',
        'avg-pipeline-len-sum=0',
        'avg-pipeline-len-cnt=0',
    ];
    return fields.join(' ');
}

/** Sessions the server owns, or just the current one when no registry is attached. */
function knownSessions(session) {
    return session.clients ? Array.from(session.clients.values()) : [session];
}

/** Parses `CLIENT LIST` filters; `null` means a malformed or unknown option. */
function clientListFilter(raw) {
    let type = null;
    let id = null;
    let laddr = null;
    for (let index = 0; index < raw.length; index += 2) {
        const option = text(raw[index]).toLowerCase();
        if (index + 1 >= raw.length) return null;
        const value = text(raw[index + 1]);
        if (option === 'type') {
            if (['normal', 'master', 'replica', 'pubsub'].includes(value.toLowerCase())) {
                type = value.toLowerCase();
            }
            else {
                return null;
            }
        }
        else if (option === 'id') {
            const parsed = parseInteger(raw[index + 1]);
            if (parsed === null || parsed <= 0) return null;
            id = parsed;
        }
        else if (option === 'laddr') {
            laddr = value;
        }
        else if (option === 'user') {
            if (value !== 'default') return null;
        }
        else {
            return null;
        }
    }
    return { type, id, laddr };
}

function planClientList(session, args) {
    const filter = clientListFilter(args.slice(2));
    if (filter === null) {
        return { error: replyError('ERR syntax error') };
    }
    return {
        run: () => {
            const lines = knownSessions(session).filter(entry => {
                if (filter.id !== null && (entry.id ?? 1) !== filter.id) return false;
                if (filter.laddr !== null && clientAddress(entry, true) !== filter.laddr) return false;
                if (filter.type !== null) {
                    const kind = subscriptionsSize(entry) > 0 ? 'pubsub' : 'normal';
                    if (kind !== filter.type) return false;
                }
                return true;
            });
            // Upstream answers with one bulk string whose lines are joined by `\n`.
            return bulk(lines.map(entry => clientLine(entry)).join('\n'));
        },
    };
}

function subscriptionsSize(session) {
    const subscriptions = session.subscriptions;
    return subscriptions === undefined ? 0 : subscriptions.channels.size + subscriptions.patterns.size;
}

/** Parses `CLIENT KILL` filters into a predicate, `null` when the option list is malformed. */
function parseClientKillFilters(raw) {
    const filters = [];
    let skipme = true;
    for (let index = 0; index < raw.length; index += 2) {
        if (index + 1 >= raw.length) return { error: replyError('ERR syntax error') };
        const option = text(raw[index]).toLowerCase();
        const value = text(raw[index + 1]);
        if (option === 'id') {
            const parsed = parseInteger(raw[index + 1]);
            if (parsed === null || parsed <= 0) {
                return { error: replyError('ERR client-id should be greater than 0') };
            }
            filters.push({ option, value: parsed });
        }
        else if (option === 'type') {
            const kind = value.toLowerCase();
            if (!['normal', 'master', 'replica', 'pubsub'].includes(kind)) {
                return { error: replyError(`ERR Unknown client type '${value}'`) };
            }
            filters.push({ option, value: kind });
        }
        else if (option === 'user') {
            if (value !== 'default') return { error: replyError(`ERR No such user '${value}'`) };
            filters.push({ option, value });
        }
        else if (option === 'addr' || option === 'laddr') {
            filters.push({ option, value });
        }
        else if (option === 'maxage') {
            const parsed = parseInteger(raw[index + 1]);
            if (parsed === null) return { error: replyError('ERR maxage is not an integer or out of range') };
            filters.push({ option, value: parsed });
        }
        else if (option === 'skipme') {
            const kind = value.toLowerCase();
            if (kind !== 'yes' && kind !== 'no') return { error: replyError('ERR syntax error') };
            skipme = kind === 'yes';
        }
        else {
            return { error: replyError('ERR syntax error') };
        }
    }
    return { filters, skipme };
}

function planClientKill(session, args) {
    if (args.length === 2) {
        return { error: wrongArity('client|kill') };
    }
    const sessions = knownSessions(session);
    if (args.length === 3) {
        // Legacy form: `CLIENT KILL ip:port` answers OK instead of a count.
        const address = text(args[2]);
        const target = sessions.find(entry => clientAddress(entry, false) === address);
        if (target === undefined) {
            return { error: replyError('ERR No such client') };
        }
        return {
            run: () => {
                if (target !== session) target.kill?.();
                return { reply: simple('OK'), close: target === session };
            },
        };
    }
    const parsed = parseClientKillFilters(args.slice(2));
    if (parsed.error !== undefined) return { error: parsed.error };
    return {
        run: () => {
            const now = Date.now();
            const matched = sessions.filter(entry => {
                if (entry === session && parsed.skipme) return false;
                for (const filter of parsed.filters) {
                    if (filter.option === 'id' && (entry.id ?? 1) !== filter.value) return false;
                    if (filter.option === 'addr' && clientAddress(entry, false) !== filter.value) return false;
                    if (filter.option === 'laddr' && clientAddress(entry, true) !== filter.value) return false;
                    if (filter.option === 'user' && filter.value !== 'default') return false;
                    if (filter.option === 'maxage') {
                        const age = Math.floor((now - (entry.createdAt ?? now)) / 1000);
                        if (age < filter.value) return false;
                    }
                    if (filter.option === 'type') {
                        const kind = subscriptionsSize(entry) > 0 ? 'pubsub' : 'normal';
                        if (kind !== filter.value) return false;
                    }
                }
                return true;
            });
            let self = false;
            for (const entry of matched) {
                if (entry === session) self = true;
                else entry.kill?.();
            }
            return { reply: integer(matched.length), close: self };
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
        case 'setname': {
            if (args.length !== 3) return { error: wrongArity('client|setname') };
            const name = text(args[2]);
            if (!validClientName(name)) {
                return { error: replyError('ERR Client names cannot contain spaces, newlines or special characters.') };
            }
            return { run: () => { session.name = name; return simple('OK'); } };
        }
        case 'getname':
            if (args.length !== 2) return { error: wrongArity('client|getname') };
            return { run: () => (session.name ? bulk(session.name) : nullReply()) };
        case 'id':
            if (args.length !== 2) return { error: wrongArity('client|id') };
            return { run: () => integer(session.id ?? 1) };
        case 'list':
            return planClientList(session, args);
        case 'info':
            if (args.length !== 2) return { error: wrongArity('client|info') };
            return { run: () => bulk(clientLine(session)) };
        case 'no-evict':
        case 'no-touch': {
            if (args.length !== 3) return { error: wrongArity(`client|${subcommand}`) };
            const value = text(args[2]).toLowerCase();
            if (value !== 'on' && value !== 'off') {
                return { error: replyError('ERR syntax error') };
            }
            return {
                run: () => {
                    if (subcommand === 'no-evict') session.noEvict = value === 'on';
                    else session.noTouch = value === 'on';
                    return simple('OK');
                },
            };
        }
        case 'unpause':
            if (args.length !== 2) return { error: wrongArity('client|unpause') };
            return { run: () => simple('OK') };
        case 'kill':
            return planClientKill(session, args);
        default:
            return { error: replyError(`ERR unknown subcommand '${text(args[1])}'. Try CLIENT HELP.`) };
    }
}

/** Nested `COMMAND INFO` metadata: maps flatten to arrays under RESP2. */
function keySpecValue(key, value) {
    if (key === 'flags') return array(value.map(simple));
    if (Array.isArray(value)) return keySpecSpec(value);
    if (typeof value === 'number') return integer(value);
    return bulk(value);
}

function keySpecSpec(flat) {
    const values = [];
    for (let index = 0; index + 1 < flat.length; index += 2) {
        values.push(bulk(flat[index]), keySpecValue(flat[index], flat[index + 1]));
    }
    return array(values);
}

/** One ten-element `COMMAND INFO` tuple in upstream order. */
function commandInfoSpec(entry) {
    return array([
        bulk(entry[0]),
        integer(entry[1]),
        array(entry[2].map(simple)),
        integer(entry[3]),
        integer(entry[4]),
        integer(entry[5]),
        array(entry[6].map(simple)),
        array(entry[7].map(bulk)),
        array(entry[8].map(keySpecSpec)),
        array(entry[9].map(commandInfoSpec)),
    ]);
}

/** `COMMAND DOCS` values use bulk strings and integers, maps flattened. */
function docsSpec(value) {
    if (typeof value === 'number') return integer(value);
    if (Array.isArray(value)) return array(value.map(docsSpec));
    return bulk(value);
}

function commandCatalogNames() {
    return Object.keys(COMMAND_INFO_DATA);
}

function commandInfoAll() {
    return array(commandCatalogNames().map(name => commandInfoSpec(COMMAND_INFO_DATA[name])));
}

function planCommand(args) {
    if (args.length === 1) {
        return { run: commandInfoAll };
    }
    const subcommand = text(args[1]).toLowerCase();
    if (subcommand === 'count') {
        if (args.length !== 2) return { error: wrongArity('command|count') };
        return { run: () => integer(commandCatalogNames().length) };
    }
    if (subcommand === 'info') {
        if (args.length === 2) return { run: commandInfoAll };
        return {
            run: () => array(args.slice(2).map(raw => {
                const entry = COMMAND_INFO_DATA[text(raw).toLowerCase()];
                return entry === undefined ? nullReply() : commandInfoSpec(entry);
            })),
        };
    }
    if (subcommand === 'docs') {
        const names = args.length === 2
            ? Object.keys(COMMAND_DOCS_DATA)
            : args.slice(2).map(raw => text(raw).toLowerCase()).filter(name => COMMAND_DOCS_DATA[name] !== undefined);
        return {
            run: () => array(names.flatMap(name => [bulk(name), docsSpec(COMMAND_DOCS_DATA[name])])),
        };
    }
    return { error: replyError(`ERR unknown subcommand '${text(args[1])}'. Try COMMAND HELP.`) };
}

const INFO_SECTION_ORDER = ['server', 'clients', 'memory', 'stats', 'keyspace'];

function humanBytes(bytes) {
    const units = ['B', 'K', 'M', 'G', 'T'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(2)}${units[unit]}`;
}

function infoServer(session) {
    const uptime = Math.max(0, Math.floor((Date.now() - (session.serverStartedAt ?? Date.now())) / 1000));
    return [
        '# Server',
        'redis_version:7.4.0',
        'redis_git_sha1:00000000',
        'redis_git_dirty:0',
        'redis_build_id:0',
        'redis_mode:standalone',
        `os:${process.platform} ${process.arch}`,
        `arch_bits:${64}`,
        'monotonic_clock:POSIX clock_gettime',
        'multiplexing_api:epoll',
        'atomicvar_api:c11-builtin',
        `process_id:${process.pid}`,
        'process_supervised:no',
        `run_id:${session.runId ?? '0000000000000000000000000000000000000000'}`,
        `tcp_port:${session.port ?? 0}`,
        `server_time_usec:${Date.now() * 1000}`,
        `uptime_in_seconds:${uptime}`,
        `uptime_in_days:${Math.floor(uptime / 86400)}`,
        'hz:10',
        'configured_hz:10',
        `lru_clock:${(Math.floor(Date.now() / 1000) % 1073741824)}`,
        `executable:${process.execPath}`,
        'config_file:',
        'io_threads_active:0',
        `listener0:name=tcp,bind=${session.bind ?? '127.0.0.1'},port=${session.port ?? 0}`,
        '',
    ].join('\r\n');
}

function infoClients(session) {
    const clients = knownSessions(session);
    let pubsub = 0;
    for (const entry of clients) {
        if (subscriptionsSize(entry) > 0) pubsub += 1;
    }
    return [
        '# Clients',
        `connected_clients:${clients.length}`,
        'cluster_connections:0',
        'maxclients:10000',
        'client_recent_max_input_buffer:0',
        'client_recent_max_output_buffer:0',
        'blocked_clients:0',
        'tracking_clients:0',
        `pubsub_clients:${pubsub}`,
        'watching_clients:0',
        'clients_in_timeout_table:0',
        `active_clients:${clients.length}`,
        'total_watched_keys:0',
        'total_blocking_keys:0',
        'total_blocking_keys_on_nokey:0',
        '',
    ].join('\r\n');
}

function infoMemory() {
    const usage = process.memoryUsage();
    const used = usage.heapUsed;
    const peak = usage.heapTotal;
    return [
        '# Memory',
        `used_memory:${used}`,
        `used_memory_human:${humanBytes(used)}`,
        `used_memory_rss:${usage.rss}`,
        `used_memory_rss_human:${humanBytes(usage.rss)}`,
        `used_memory_peak:${peak}`,
        `used_memory_peak_human:${humanBytes(peak)}`,
        'used_memory_peak_perc:100.00%',
        `used_memory_overhead:${usage.external}`,
        'used_memory_startup:0',
        `used_memory_dataset:${Math.max(0, used - usage.external)}`,
        'used_memory_dataset_perc:0.00%',
        'allocator_allocated:0',
        'allocator_active:0',
        'allocator_resident:0',
        'total_system_memory:0',
        'total_system_memory_human:0.00B',
        'used_memory_lua:0',
        'used_memory_vm_eval:0',
        'used_memory_scripts_eval:0',
        'number_of_cached_scripts:0',
        'number_of_functions:0',
        'number_of_libraries:0',
        'used_memory_vm_functions:0',
        'used_memory_vm_total:0',
        'used_memory_functions:0',
        'used_memory_scripts:0',
        'used_memory_scripts_human:0.00B',
        'maxmemory:0',
        'maxmemory_human:0.00B',
        'maxmemory_policy:noeviction',
        'mem_fragmentation_ratio:1.00',
        'mem_fragmentation_bytes:0',
        'mem_not_counted_for_evict:0',
        'mem_replication_backlog:0',
        'mem_total_replication_buffers:0',
        'mem_clients_slaves:0',
        'mem_clients_normal:0',
        'mem_cluster_links:0',
        'mem_aof_buffer:0',
        'mem_allocator:libc',
        'active_defrag_running:0',
        'lazyfree_pending_objects:0',
        'lazyfree_objects_pending:0',
        'lazyfreed_objects:0',
        '',
    ].join('\r\n');
}

function infoStats(session) {
    const stats = session.stats ?? {};
    return [
        '# Stats',
        `total_connections_received:${stats.connections ?? 0}`,
        `total_commands_processed:${stats.commands ?? 0}`,
        'instantaneous_ops_per_sec:0',
        `total_net_input_bytes:${stats.netInput ?? 0}`,
        `total_net_output_bytes:${stats.netOutput ?? 0}`,
        'total_net_repl_input_bytes:0',
        'total_net_repl_output_bytes:0',
        'instantaneous_input_kbps:0.00',
        'instantaneous_output_kbps:0.00',
        'rejected_connections:0',
        'sync_full:0',
        'sync_partial_ok:0',
        'sync_partial_err:0',
        `expired_keys:${stats.expired ?? 0}`,
        'expired_subkeys:0',
        `evicted_keys:${stats.evicted ?? 0}`,
        'evicted_subkeys:0',
        `keyspace_hits:${stats.hits ?? 0}`,
        `keyspace_misses:${stats.misses ?? 0}`,
        `pubsub_channels:${stats.pubsubChannels ?? 0}`,
        `pubsub_patterns:${stats.pubsubPatterns ?? 0}`,
        'pubsubshard_channels:0',
        'latest_fork_usec:0',
        'total_forks:0',
        'migrate_cached_sockets:0',
        'slave_expires_count:0',
        'used_cpu_sys:0.000000',
        'used_cpu_user:0.000000',
        'used_cpu_sys_children:0.000000',
        'used_cpu_user_children:0.000000',
        `total_reads_processed:${stats.reads ?? 0}`,
        `total_writes_processed:${stats.writes ?? 0}`,
        'io_threaded_reads_processed:0',
        'io_threaded_writes_processed:0',
        'reply_buffer_shrinks:0',
        'reply_buffer_expands:0',
        'eventloop_cycles:0',
        'eventloop_duration_sum:0',
        'eventloop_duration_cmd_sum:0',
        'instantaneous_eventloop_cycles_per_sec:0',
        'instantaneous_eventloop_duration_usec:0',
        'tracking_total_keys:0',
        'tracking_total_items:0',
        'tracking_total_prefixes:0',
        'unexpected_error_replies:0',
        'total_error_replies:0',
        'total_eviction_exceeded_time:0',
        'current_eviction_exceeded_time:0',
        '',
    ].join('\r\n');
}

function infoKeyspace(store) {
    const lines = ['# Keyspace'];
    for (let db = 0; db < DATABASES; db += 1) {
        const keys = store.size(db);
        if (keys === 0) continue;
        let expires = 0;
        for (const key of store.keys(db)) {
            if (store.deadline(db, key) !== null) expires += 1;
        }
        lines.push(`db${db}:keys=${keys},expires=${expires},avg_ttl=0,subexpiry=0`);
    }
    lines.push('');
    return lines.join('\r\n');
}

function infoText(store, session, requested) {
    const all = requested.length === 0
        || requested.includes('all')
        || requested.includes('everything')
        || requested.includes('default');
    const parts = [];
    for (const section of INFO_SECTION_ORDER) {
        if (!all && !requested.includes(section)) continue;
        if (section === 'server') parts.push(infoServer(session));
        else if (section === 'clients') parts.push(infoClients(session));
        else if (section === 'memory') parts.push(infoMemory());
        else if (section === 'stats') parts.push(infoStats(session));
        else if (section === 'keyspace') parts.push(infoKeyspace(store));
    }
    return parts.join('');
}

function planInfo(store, session, args) {
    const requested = args.slice(1).map(raw => text(raw).toLowerCase());
    return { run: () => bulk(infoText(store, session, requested)) };
}

const CONFIG_VALUES = new Map([
    ['maxmemory', '0'],
    ['maxmemory-policy', 'noeviction'],
    ['maxmemory-samples', '5'],
    ['maxmemory-eviction-tenacity', '10'],
    ['maxmemory-clients', '0'],
    ['save', ''],
    ['appendonly', 'no'],
    ['appendfsync', 'everysec'],
    ['timeout', '0'],
    ['tcp-keepalive', '300'],
    ['databases', '16'],
    ['bind', '127.0.0.1'],
    ['port', '0'],
    ['protected-mode', 'yes'],
    ['loglevel', 'notice'],
    ['slowlog-log-slower-than', '10000'],
    ['slowlog-max-len', '128'],
]);

const CONFIG_IMMUTABLE = new Set(['databases', 'port', 'supervised']);

const MAXMEMORY_POLICIES = [
    'volatile-lru', 'volatile-lfu', 'volatile-random', 'volatile-ttl', 'volatile-lrm',
    'allkeys-lru', 'allkeys-lfu', 'allkeys-random', 'allkeys-lrm', 'noeviction',
];

/** Parses `100mb` / `1gb` / plain bytes, `null` when the text is not a memory value. */
function parseMemoryValue(raw) {
    const value = text(raw).trim().toLowerCase();
    const match = /^([0-9]+)(b|k|kb|m|mb|g|gb|t|tb)?$/.exec(value);
    if (match === null) return null;
    const scale = { b: 1, k: 1024, kb: 1024, m: 1024 ** 2, mb: 1024 ** 2, g: 1024 ** 3, gb: 1024 ** 3, t: 1024 ** 4, tb: 1024 ** 4 };
    const factor = match[2] === undefined ? 1 : scale[match[2]];
    const parsed = Number(match[1]) * factor;
    return Number.isSafeInteger(parsed) ? parsed : null;
}

function configSetError(name, reason) {
    return replyError(`ERR CONFIG SET failed (possibly related to argument '${name}') - ${reason}`);
}

/** Validates every `CONFIG SET` pair before applying any of them. */
function validateConfigSet(pairs) {
    for (const [name, value] of pairs) {
        if (CONFIG_IMMUTABLE.has(name)) return configSetError(name, "can't set immutable config");
        if (name === 'maxmemory') {
            if (parseMemoryValue(value) === null) return configSetError(name, 'argument must be a memory value');
        }
        else if (name === 'maxmemory-policy') {
            if (!MAXMEMORY_POLICIES.includes(text(value).toLowerCase())) {
                return configSetError(name, `argument(s) must be one of the following: ${MAXMEMORY_POLICIES.join(', ')}`);
            }
        }
        else if (name === 'appendonly') {
            const lowered = text(value).toLowerCase();
            if (lowered !== 'yes' && lowered !== 'no') return configSetError(name, "argument must be 'yes' or 'no'");
        }
        else if (name === 'timeout' || name === 'maxmemory-samples' || name === 'slowlog-max-len') {
            const parsed = parseInteger(value);
            if (parsed === null || parsed < 0) return configSetError(name, "argument couldn't be parsed into an integer");
        }
        else if (name === 'save') {
            const textValue = text(value);
            if (textValue !== '' && !/^(?:\d+\s+\d+)(?:\s+\d+\s+\d+)*$/.test(textValue)) {
                return configSetError(name, 'Invalid save parameters');
            }
        }
    }
    return null;
}

function planConfig(session, args) {
    if (args.length < 2) {
        return { error: wrongArity('config') };
    }
    const subcommand = text(args[1]).toLowerCase();
    if (subcommand === 'get') {
        if (args.length < 3) return { error: wrongArity('config|get') };
        return {
            run: () => {
                const names = new Set();
                for (const pattern of args.slice(2)) {
                    const bytes = Buffer.from(text(pattern));
                    for (const name of CONFIG_VALUES.keys()) {
                        if (globMatch(bytes, Buffer.from(name))) names.add(name);
                    }
                }
                const entries = Array.from(names).map(name => [name, CONFIG_VALUES.get(name)]);
                return array(entries.flatMap(([name, value]) => [bulk(name), bulk(value)]));
            },
        };
    }
    if (subcommand === 'set') {
        if (args.length < 4 || (args.length % 2) !== 0) {
            return { error: replyError('ERR Unknown option or number of arguments for CONFIG SET') };
        }
        const pairs = [];
        for (let index = 2; index + 1 < args.length; index += 2) {
            const name = text(args[index]).toLowerCase();
            if (!CONFIG_VALUES.has(name)) {
                return { error: replyError(`ERR Unknown option or number of arguments for CONFIG SET - '${text(args[index])}'`) };
            }
            pairs.push([name, text(args[index + 1])]);
        }
        const invalid = validateConfigSet(pairs);
        if (invalid !== null) return { error: invalid };
        return {
            run: () => {
                for (const [name, value] of pairs) {
                    if (name === 'maxmemory') CONFIG_VALUES.set(name, String(parseMemoryValue(value)));
                    else CONFIG_VALUES.set(name, value);
                }
                return simple('OK');
            },
        };
    }
    return { error: replyError(`ERR unknown subcommand '${text(args[1])}'. Try CONFIG HELP.`) };
}

const ACL_CATEGORIES = [
    'keyspace', 'read', 'write', 'set', 'sortedset', 'list', 'hash', 'string', 'array',
    'bitmap', 'hyperloglog', 'geo', 'stream', 'pubsub', 'admin', 'fast', 'slow',
    'blocking', 'dangerous', 'connection', 'transaction', 'scripting',
];

function planAcl(args) {
    if (args.length < 2) {
        return { error: wrongArity('acl') };
    }
    const subcommand = text(args[1]).toLowerCase();
    if (subcommand === 'whoami') {
        if (args.length !== 2) return { error: wrongArity('acl|whoami') };
        return { run: () => bulk('default') };
    }
    if (subcommand === 'list') {
        if (args.length !== 2) return { error: wrongArity('acl|list') };
        return { run: () => array([bulk('user default on nopass sanitize-payload ~* &* +@all')]) };
    }
    if (subcommand === 'cat') {
        if (args.length === 2) {
            return { run: () => array(ACL_CATEGORIES.map(name => bulk(name))) };
        }
        if (args.length !== 3) {
            return { error: replyError(`ERR unknown subcommand or wrong number of arguments for 'CAT'. Try ACL HELP.`) };
        }
        const category = text(args[2]).toLowerCase();
        if (!ACL_CATEGORIES.includes(category)) {
            return { error: replyError(`ERR Unknown category '${text(args[2])}'`) };
        }
        return {
            run: () => array(commandCatalogNames()
                .filter(name => COMMAND_INFO_DATA[name][6].includes(`@${category}`))
                .map(name => bulk(name))),
        };
    }
    if (subcommand === 'getuser') {
        if (args.length !== 3) return { error: wrongArity('acl|getuser') };
        if (text(args[2]) !== 'default') return { run: () => nullReply() };
        return {
            run: () => array([
                bulk('flags'), array([bulk('on'), bulk('nopass'), bulk('sanitize-payload')]),
                bulk('passwords'), array([]),
                bulk('commands'), bulk('+@all'),
                bulk('keys'), bulk('~*'),
                bulk('channels'), bulk('&*'),
                bulk('selectors'), array([]),
            ]),
        };
    }
    return { error: replyError(`ERR unknown subcommand '${text(args[1])}'. Try ACL HELP.`) };
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
            if (expiry !== null) return { error: replyError('ERR syntax error') };
            keepDeadline = true;
            continue;
        }
        const unit = option === 'ex' || option === 'px' || option === 'exat' || option === 'pxat' ? option : null;
        if (unit === null) {
            return { error: replyError('ERR syntax error') };
        }
        if (keepDeadline) {
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
        // Upstream keeps the last expiry option when one is repeated.
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
            if (!allowScores) {
                return { error: replyError('ERR syntax error, WITHSCORES not supported in combination with BYLEX') };
            }
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
        const plan = parseZSetStorePlan(args, name);
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
            return { error: replyError(`ERR at least 1 input key is needed for '${keeps ? 'zdiffstore' : 'zdiff'}' command`) };
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
function parseZSetStorePlan(args, name) {
    const numkeys = parseInteger(args[2]);
    if (numkeys === null || numkeys <= 0) {
        return { error: replyError(`ERR at least 1 input key is needed for '${name}' command`) };
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
 * Plans one `SORT` / `SORT_RO` command.
 *
 * Elements come from a list, set or sorted set, `BY` replaces `*` per element,
 * `GET` maps the selected elements, and `STORE` always writes a fresh list.
 */
function planSort(store, session, name, args) {
    const db = session.db;
    const readonly = name === 'sort_ro';
    if (args.length < 2) return { error: wrongArity(name) };
    const options = { by: null, limit: null, get: [], descending: false, alpha: false, store: null };
    let index = 2;
    while (index < args.length) {
        const option = text(args[index]).toLowerCase();
        if (option === 'by') {
            if (args[index + 1] === undefined) return { error: replyError('ERR syntax error') };
            options.by = args[index + 1];
            index += 2;
            continue;
        }
        if (option === 'limit') {
            const offset = parseInteger(args[index + 1]);
            const count = parseInteger(args[index + 2]);
            if (offset === null || count === null) return { error: replyError('ERR syntax error') };
            options.limit = [Math.max(offset, 0), count < 0 ? null : count];
            index += 3;
            continue;
        }
        if (option === 'get') {
            if (args[index + 1] === undefined) return { error: replyError('ERR syntax error') };
            options.get.push(args[index + 1]);
            index += 2;
            continue;
        }
        if (option === 'asc') {
            options.descending = false;
            index += 1;
            continue;
        }
        if (option === 'desc') {
            options.descending = true;
            index += 1;
            continue;
        }
        if (option === 'alpha') {
            options.alpha = true;
            index += 1;
            continue;
        }
        if (option === 'store') {
            if (args[index + 1] === undefined) return { error: replyError('ERR syntax error') };
            options.store = args[index + 1];
            index += 2;
            continue;
        }
        return { error: replyError('ERR syntax error') };
    }
    if (readonly && options.store !== null) {
        return { error: replyError('ERR syntax error') };
    }
    return {
        run: () => {
            const kind = kindOf(store, db, args[1]);
            let elements;
            if (kind === null) elements = [];
            else if (kind === 'list') elements = readList(store, db, args[1]);
            else if (kind === 'set') elements = readSet(store, db, args[1]);
            else if (kind === 'zset') {
                const entries = readZSet(store, db, args[1]);
                sortZSet(entries);
                elements = entries.map(([member]) => member);
            }
            else return wrongType();
            if (elements === null) return replyError('ERR stored collection value is corrupt');
            const noSort = options.by !== null && !options.by.includes(0x2a);
            const sortKeys = [];
            for (const element of elements) {
                if (noSort) {
                    sortKeys.push(null);
                    continue;
                }
                const lookedUp = options.by === null ? element : lookupSortPattern(store, db, options.by, element);
                if (options.alpha) {
                    sortKeys.push(lookedUp ?? Buffer.alloc(0));
                    continue;
                }
                if (lookedUp === null) {
                    sortKeys.push(0);
                    continue;
                }
                const value = parseScore(lookedUp);
                if (value === null) {
                    return replyError("ERR One or more scores can't be converted into double");
                }
                sortKeys.push(value);
            }
            const order = elements.map((element, position) => ({ element, key: sortKeys[position], position }));
            if (!noSort) {
                order.sort((left, right) => {
                    const compared = options.alpha ? Buffer.compare(left.key, right.key) : left.key - right.key;
                    if (compared !== 0) return options.descending ? -compared : compared;
                    return left.position - right.position;
                });
            }
            const [offset, count] = options.limit ?? [0, null];
            const selected = order.slice(offset, count === null ? undefined : offset + count);
            const gathered = selected.flatMap(({ element }) => {
                if (options.get.length === 0) return [element];
                return options.get.map(pattern => pattern.equals(Buffer.from('#'))
                    ? element
                    : lookupSortPattern(store, db, pattern, element));
            });
            if (options.store !== null) {
                dropEveryKind(store, db, options.store);
                if (gathered.length === 0) return integer(0);
                const body = encodeList(gathered.map(value => value ?? Buffer.alloc(0)));
                if (body === null) return replyError('ERR list value exceeds the storage limit');
                store.setKind(db, 'list', options.store, body, null);
                return integer(gathered.length);
            }
            return array(gathered.map(value => (value === null ? nullReply() : bulk(value))));
        },
    };
}

/**
 * Plans one `BITFIELD` / `BITFIELD_RO` call.
 *
 * Every subcommand is parsed before the key is touched, so a malformed encoding
 * or value rejects the whole call without creating or rewriting the key. Only
 * `GET` leaves the body untouched, which is why a read never materialises an
 * absent key.
 */
function planBitfield(store, session, name, args) {
    const db = session.db;
    const readonly = name === 'bitfield_ro';
    if (args.length < 2) return { error: wrongArity(name) };
    let overflow = 'wrap';
    const operations = [];
    let index = 2;
    while (index < args.length) {
        const keyword = text(args[index]).toLowerCase();
        if (keyword === 'overflow') {
            const policy = args[index + 1] === undefined ? null : text(args[index + 1]).toLowerCase();
            if (policy === null) return { error: replyError('ERR syntax error') };
            if (policy !== 'wrap' && policy !== 'sat' && policy !== 'fail') {
                return { error: replyError('ERR Invalid OVERFLOW type specified') };
            }
            overflow = policy;
            index += 2;
            continue;
        }
        const writing = keyword === 'set' || keyword === 'incrby';
        if (readonly && writing) {
            return { error: replyError('ERR BITFIELD_RO only supports the GET subcommand') };
        }
        const needed = keyword === 'get' ? 3 : writing ? 4 : 0;
        if (needed === 0 || index + needed > args.length) {
            return { error: replyError('ERR syntax error') };
        }
        const encoding = parseBitEncoding(args[index + 1]);
        if (encoding === null) {
            return { error: replyError('ERR Invalid bitfield type. Use something like i16 u8. Note that u64 is not supported but i64 is.') };
        }
        const offset = parseBitfieldOffset(args[index + 2], encoding.bits);
        if (offset === null) {
            return { error: replyError('ERR bit offset is not an integer or out of range') };
        }
        if (keyword === 'get') {
            operations.push({ kind: 'get', encoding, offset });
        }
        else {
            const value = parseI64(args[index + 3]);
            if (value === null) {
                return { error: replyError('ERR value is not an integer or out of range') };
            }
            operations.push({ kind: keyword, encoding, offset, value, overflow });
        }
        index += needed;
    }
    return {
        run: () => {
            const kind = kindOf(store, db, args[1]);
            if (kind !== null && kind !== 'string') return wrongType();
            let body = readString(store, db, args[1]) ?? Buffer.alloc(0);
            const results = [];
            let changed = false;
            for (const operation of operations) {
                if (operation.kind === 'get') {
                    results.push(readBitfield(body, operation.offset, operation.encoding));
                    continue;
                }
                const previous = readBitfield(body, operation.offset, operation.encoding);
                if (operation.kind === 'set') {
                    body = writeBitfield(body, operation.offset, operation.encoding, operation.value);
                    changed = true;
                    results.push(previous);
                    continue;
                }
                const updated = normalizeBitfield(previous + operation.value, operation.encoding, operation.overflow);
                if (updated === null) {
                    results.push(null);
                    continue;
                }
                body = writeBitfield(body, operation.offset, operation.encoding, updated);
                changed = true;
                results.push(updated);
            }
            if (changed) rewriteString(store, db, args[1], body);
            return array(results.map(value => (value === null ? nullReply() : integer(Number(value)))));
        },
    };
}

/**
 * Plans one `LPOS` call.
 *
 * `RANK` counts matches from the head for positive values and from the tail for
 * negative ones, `COUNT 0` returns every match, and `MAXLEN` only caps the
 * number of elements compared in that direction.
 */
function planLpos(store, session, args) {
    const db = session.db;
    if (args.length < 3) return { error: wrongArity('lpos') };
    const key = args[1];
    const element = args[2];
    let rank = 1;
    let count = null;
    let maxlen = null;
    let index = 3;
    while (index < args.length) {
        const option = text(args[index]).toUpperCase();
        if (option === 'RANK' || option === 'COUNT' || option === 'MAXLEN') {
            if (args[index + 1] === undefined) return { error: replyError('ERR syntax error') };
            const value = parseInteger(args[index + 1]);
            if (value === null) return { error: integerError() };
            if (option === 'RANK') {
                if (value === 0) {
                    return { error: replyError("ERR RANK can't be zero: use 1 to start from the first match, 2 from the second ... or use negative to start from the end of the list") };
                }
                rank = value;
            }
            else if (option === 'COUNT') {
                if (value < 0) return { error: replyError("ERR COUNT can't be negative") };
                count = value === 0 ? Infinity : value;
            }
            else {
                if (value < 0) return { error: replyError("ERR MAXLEN can't be negative") };
                maxlen = value === 0 ? null : value;
            }
            index += 2;
            continue;
        }
        return { error: replyError('ERR syntax error') };
    }
    return {
        run: () => {
            const kind = kindOf(store, db, key);
            if (kind !== null && kind !== 'list') return wrongType();
            const elements = readList(store, db, key) ?? [];
            const forward = rank > 0;
            const skip = Math.abs(rank) - 1;
            const matches = [];
            let hits = 0;
            const limit = maxlen === null ? elements.length : Math.min(elements.length, maxlen);
            for (let step = 0; step < limit; step += 1) {
                const position = forward ? step : elements.length - 1 - step;
                if (Buffer.compare(elements[position], element) === 0) {
                    hits += 1;
                    if (hits > skip) {
                        matches.push(position);
                        if (count === null) break;
                        if (matches.length >= count) break;
                    }
                }
            }
            if (count !== null) return array(matches.map(position => integer(position)));
            return matches.length === 0 ? nullReply() : integer(matches[0]);
        },
    };
}

/** Expands one `BY` / `GET` pattern: `*` becomes the element and `->` selects a hash field. */
function lookupSortPattern(store, db, pattern, element) {
    const parts = [];
    let start = 0;
    for (let position = 0; position < pattern.length; position += 1) {
        if (pattern[position] !== 0x2a) continue;
        parts.push(pattern.subarray(start, position), element);
        start = position + 1;
    }
    parts.push(pattern.subarray(start));
    const expanded = Buffer.concat(parts);
    const arrow = expanded.indexOf('->');
    const key = arrow === -1 ? expanded : expanded.subarray(0, arrow);
    const kind = kindOf(store, db, key);
    if (arrow === -1) {
        return kind === 'string' ? readString(store, db, key) : null;
    }
    if (kind !== 'hash') return null;
    const field = expanded.subarray(arrow + 2);
    const fields = readHash(store, db, key);
    if (fields === null) return null;
    const hit = fields.find(([candidate]) => candidate.equals(field));
    return hit === undefined ? null : hit[1];
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
                    notifyPush(session, db, key);
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

        case 'blpop':
        case 'brpop': {
            if (args.length < 3) return { error: wrongArity(name) };
            const timeout = parseBlockingTimeout(args[args.length - 1]);
            if (timeout.error !== undefined) return { error: replyError(timeout.error) };
            const keys = args.slice(1, args.length - 1);
            const attempt = () => {
                for (const candidate of keys) {
                    const kind = kindOf(store, db, candidate);
                    if (kind === null) continue;
                    if (kind !== 'list') return wrongType();
                    const elements = readList(store, db, candidate);
                    if (elements === null) return replyError('ERR stored list value is corrupt');
                    if (elements.length === 0) continue;
                    const element = name === 'blpop' ? elements.shift() : elements.pop();
                    if (elements.length === 0) {
                        store.deleteKind(db, SUFFIX.list, candidate);
                    }
                    else {
                        const body = encodeList(elements);
                        if (body === null) return replyError('ERR list value exceeds the storage limit');
                        rewriteKind(store, db, 'list', candidate, body);
                    }
                    return array([bulk(candidate), bulk(element)]);
                }
                return null;
            };
            return blockingPlan(db, keys, timeout.timeoutMs, attempt, nullArray());
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
            const sameKey = source.equals(destination);
            const attempt = () => {
                const kind = kindOf(store, db, source);
                if (kind !== null && kind !== 'list') return wrongType();
                if (kind === null) return null;
                const elements = readList(store, db, source);
                if (elements === null) return replyError('ERR stored list value is corrupt');
                if (elements.length === 0) return null;
                let destinationElements = null;
                if (!sameKey) {
                    const destinationKind = kindOf(store, db, destination);
                    if (destinationKind !== null && destinationKind !== 'list') return wrongType();
                    destinationElements = destinationKind === null ? [] : readList(store, db, destination);
                    if (destinationElements === null) return replyError('ERR stored list value is corrupt');
                }
                const element = sourceSide === 'left' ? elements.shift() : elements.pop();
                if (sameKey) {
                    if (destinationSide === 'left') elements.unshift(element);
                    else elements.push(element);
                }
                else if (destinationSide === 'left') {
                    destinationElements.unshift(element);
                }
                else {
                    destinationElements.push(element);
                }
                const body = encodeList(elements);
                if (body === null) return replyError('ERR list value exceeds the storage limit');
                rewriteKind(store, db, 'list', source, body);
                if (!sameKey) {
                    const destinationBody = encodeList(destinationElements);
                    if (destinationBody === null) return replyError('ERR list value exceeds the storage limit');
                    rewriteKind(store, db, 'list', destination, destinationBody);
                    notifyPush(session, db, destination);
                }
                return bulk(element);
            };
            return blockingPlan(db, [source], timeout.timeoutMs, attempt, nullArray());
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
            let amount = 1;
            const tail = 4 + numkeys;
            if (args.length > tail) {
                if (text(args[tail]).toLowerCase() !== 'count' || tail + 2 !== args.length) {
                    return { error: replyError('ERR syntax error') };
                }
                const requested = parseInteger(args[tail + 1]);
                if (requested === null) return { error: integerError() };
                if (requested <= 0) return { error: replyError('ERR count should be greater than 0') };
                amount = requested;
            }
            const attempt = () => {
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
                    return array([bulk(candidate), array(popped.map(value => bulk(value)))]);
                }
                return null;
            };
            return blockingPlan(db, keys, timeout.timeoutMs, attempt, nullArray());
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
                    notifyPush(session, db, key);
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
            return { error: unknownCommand(args) };
    }
}

/**
 * `COMMAND INFO` metadata of the commands the gateway answers, captured from the
 * live server so flags, key specs and ACL categories keep the upstream shape.
 */
const COMMAND_INFO_DATA = {
    get: ["get",2,["readonly","fast"],1,1,1,["@read","@string","@fast"],[],[["flags",["RO","access"],"begin_search",["type","index","spec",["index",1]],"find_keys",["type","range","spec",["lastkey",0,"keystep",1,"limit",0]]]],[]],
    set: ["set",-3,["write","denyoom"],1,1,1,["@write","@string","@slow"],[],[["notes","RW and ACCESS due to the optional `GET` argument","flags",["RW","access","update","variable_flags"],"begin_search",["type","index","spec",["index",1]],"find_keys",["type","range","spec",["lastkey",0,"keystep",1,"limit",0]]]],[]],
    del: ["del",-2,["write"],1,-1,1,["@keyspace","@write","@slow"],["request_policy:multi_shard","response_policy:agg_sum"],[["flags",["RM","delete"],"begin_search",["type","index","spec",["index",1]],"find_keys",["type","range","spec",["lastkey",-1,"keystep",1,"limit",0]]]],[]],
    exists: ["exists",-2,["readonly","fast"],1,-1,1,["@keyspace","@read","@fast"],["request_policy:multi_shard","response_policy:agg_sum"],[["flags",["RO"],"begin_search",["type","index","spec",["index",1]],"find_keys",["type","range","spec",["lastkey",-1,"keystep",1,"limit",0]]]],[]],
    expire: ["expire",-3,["write","fast"],1,1,1,["@keyspace","@write","@fast"],[],[["flags",["RW","update"],"begin_search",["type","index","spec",["index",1]],"find_keys",["type","range","spec",["lastkey",0,"keystep",1,"limit",0]]]],[]],
    ttl: ["ttl",2,["readonly","fast"],1,1,1,["@keyspace","@read","@fast"],["nondeterministic_output"],[["flags",["RO","access"],"begin_search",["type","index","spec",["index",1]],"find_keys",["type","range","spec",["lastkey",0,"keystep",1,"limit",0]]]],[]],
    type: ["type",2,["readonly","fast"],1,1,1,["@keyspace","@read","@fast"],[],[["flags",["RO"],"begin_search",["type","index","spec",["index",1]],"find_keys",["type","range","spec",["lastkey",0,"keystep",1,"limit",0]]]],[]],
    keys: ["keys",2,["readonly"],0,0,0,["@keyspace","@read","@slow","@dangerous"],["request_policy:all_shards","nondeterministic_output_order"],[],[]],
    scan: ["scan",-2,["readonly"],0,0,0,["@keyspace","@read","@slow"],["nondeterministic_output","request_policy:special","response_policy:special"],[],[]],
    ping: ["ping",-1,["fast"],0,0,0,["@fast","@connection"],["request_policy:all_shards","response_policy:all_succeeded"],[],[]],
    client: ["client",-2,[],0,0,0,["@slow"],[],[],[["client|list",-2,["admin","noscript","loading","stale"],0,0,0,["@admin","@slow","@dangerous","@connection"],["nondeterministic_output"],[],[]],["client|getname",2,["noscript","loading","stale"],0,0,0,["@slow","@connection"],[],[],[]],["client|unblock",-3,["admin","noscript","loading","stale"],0,0,0,["@admin","@slow","@dangerous","@connection"],[],[],[]],["client|info",2,["noscript","loading","stale"],0,0,0,["@slow","@connection"],["nondeterministic_output"],[],[]],["client|no-evict",3,["admin","noscript","loading","stale"],0,0,0,["@admin","@slow","@dangerous","@connection"],[],[],[]],["client|setname",3,["noscript","loading","stale"],0,0,0,["@slow","@connection"],["request_policy:all_nodes","response_policy:all_succeeded"],[],[]],["client|unpause",2,["admin","noscript","loading","stale"],0,0,0,["@admin","@slow","@dangerous","@connection"],[],[],[]],["client|id",2,["noscript","loading","stale"],0,0,0,["@slow","@connection"],[],[],[]],["client|kill",-3,["admin","noscript","loading","stale"],0,0,0,["@admin","@slow","@dangerous","@connection"],[],[],[]],["client|no-touch",3,["noscript","loading","stale"],0,0,0,["@slow","@connection"],[],[],[]],["client|pause",-3,["admin","noscript","loading","stale"],0,0,0,["@admin","@slow","@dangerous","@connection"],[],[],[]],["client|caching",3,["noscript","loading","stale"],0,0,0,["@slow","@connection"],[],[],[]],["client|getredir",2,["noscript","loading","stale"],0,0,0,["@slow","@connection"],[],[],[]],["client|help",2,["loading","stale"],0,0,0,["@slow","@connection"],[],[],[]],["client|setinfo",4,["noscript","loading","stale"],0,0,0,["@slow","@connection"],["request_policy:all_nodes","response_policy:all_succeeded"],[],[]],["client|reply",3,["noscript","loading","stale"],0,0,0,["@slow","@connection"],[],[],[]],["client|trackinginfo",2,["noscript","loading","stale"],0,0,0,["@slow","@connection"],[],[],[]],["client|tracking",-3,["noscript","loading","stale"],0,0,0,["@slow","@connection"],[],[],[]]]],
    command: ["command",-1,["loading","stale"],0,0,0,["@slow","@connection"],["nondeterministic_output_order"],[],[["command|list",-2,["loading","stale"],0,0,0,["@slow","@connection"],["nondeterministic_output_order"],[],[]],["command|info",-2,["loading","stale"],0,0,0,["@slow","@connection"],["nondeterministic_output_order"],[],[]],["command|docs",-2,["loading","stale"],0,0,0,["@slow","@connection"],["nondeterministic_output_order"],[],[]],["command|getkeysandflags",-3,["loading","stale"],0,0,0,["@slow","@connection"],[],[],[]],["command|help",2,["loading","stale"],0,0,0,["@slow","@connection"],[],[],[]],["command|count",2,["loading","stale"],0,0,0,["@slow","@connection"],[],[],[]],["command|getkeys",-3,["loading","stale"],0,0,0,["@slow","@connection"],[],[],[]]]],
    info: ["info",-1,["loading","stale"],0,0,0,["@slow","@dangerous"],["nondeterministic_output","request_policy:all_shards","response_policy:special"],[],[]],
    config: ["config",-2,[],0,0,0,["@slow"],[],[],[["config|get",-3,["admin","noscript","loading","stale"],0,0,0,["@admin","@slow","@dangerous"],[],[],[]],["config|rewrite",2,["admin","noscript","loading","stale"],0,0,0,["@admin","@slow","@dangerous"],["request_policy:all_nodes","response_policy:all_succeeded"],[],[]],["config|set",-4,["admin","noscript","loading","stale"],0,0,0,["@admin","@slow","@dangerous"],["request_policy:all_nodes","response_policy:all_succeeded"],[],[]],["config|help",2,["loading","stale"],0,0,0,["@slow"],[],[],[]],["config|resetstat",2,["admin","noscript","loading","stale"],0,0,0,["@admin","@slow","@dangerous"],["request_policy:all_nodes","response_policy:all_succeeded"],[],[]]]],
    acl: ["acl",-2,[],0,0,0,["@slow"],[],[],[["acl|list",2,["admin","noscript","loading","stale"],0,0,0,["@admin","@slow","@dangerous"],[],[],[]],["acl|genpass",-2,["noscript","loading","stale"],0,0,0,["@slow"],[],[],[]],["acl|dryrun",-4,["admin","noscript","loading","stale"],0,0,0,["@admin","@slow","@dangerous"],[],[],[]],["acl|deluser",-3,["admin","noscript","loading","stale"],0,0,0,["@admin","@slow","@dangerous"],["request_policy:all_nodes","response_policy:all_succeeded"],[],[]],["acl|save",2,["admin","noscript","loading","stale"],0,0,0,["@admin","@slow","@dangerous"],["request_policy:all_nodes","response_policy:all_succeeded"],[],[]],["acl|log",-2,["admin","noscript","loading","stale"],0,0,0,["@admin","@slow","@dangerous"],[],[],[]],["acl|load",2,["admin","noscript","loading","stale"],0,0,0,["@admin","@slow","@dangerous"],[],[],[]],["acl|users",2,["admin","noscript","loading","stale"],0,0,0,["@admin","@slow","@dangerous"],[],[],[]],["acl|getuser",3,["admin","noscript","loading","stale"],0,0,0,["@admin","@slow","@dangerous"],[],[],[]],["acl|help",2,["loading","stale"],0,0,0,["@slow"],[],[],[]],["acl|whoami",2,["noscript","loading","stale"],0,0,0,["@slow"],[],[],[]],["acl|setuser",-3,["admin","noscript","loading","stale"],0,0,0,["@admin","@slow","@dangerous"],["request_policy:all_nodes","response_policy:all_succeeded"],[],[]],["acl|cat",-2,["noscript","loading","stale"],0,0,0,["@slow"],[],[],[]]]],
    hset: ["hset",-4,["write","denyoom","fast"],1,1,1,["@write","@hash","@fast"],[],[["flags",["RW","update"],"begin_search",["type","index","spec",["index",1]],"find_keys",["type","range","spec",["lastkey",0,"keystep",1,"limit",0]]]],[]],
    hget: ["hget",3,["readonly","fast"],1,1,1,["@read","@hash","@fast"],[],[["flags",["RO","access"],"begin_search",["type","index","spec",["index",1]],"find_keys",["type","range","spec",["lastkey",0,"keystep",1,"limit",0]]]],[]],
    lpush: ["lpush",-3,["write","denyoom","fast"],1,1,1,["@write","@list","@fast"],[],[["flags",["RW","insert"],"begin_search",["type","index","spec",["index",1]],"find_keys",["type","range","spec",["lastkey",0,"keystep",1,"limit",0]]]],[]],
    lrange: ["lrange",4,["readonly"],1,1,1,["@read","@list","@slow"],[],[["flags",["RO","access"],"begin_search",["type","index","spec",["index",1]],"find_keys",["type","range","spec",["lastkey",0,"keystep",1,"limit",0]]]],[]],
    sadd: ["sadd",-3,["write","denyoom","fast"],1,1,1,["@write","@set","@fast"],[],[["flags",["RW","insert"],"begin_search",["type","index","spec",["index",1]],"find_keys",["type","range","spec",["lastkey",0,"keystep",1,"limit",0]]]],[]],
    smembers: ["smembers",2,["readonly"],1,1,1,["@read","@set","@slow"],["nondeterministic_output_order"],[["flags",["RO","access"],"begin_search",["type","index","spec",["index",1]],"find_keys",["type","range","spec",["lastkey",0,"keystep",1,"limit",0]]]],[]],
    zadd: ["zadd",-4,["write","denyoom","fast"],1,1,1,["@write","@sortedset","@fast"],[],[["flags",["RW","update"],"begin_search",["type","index","spec",["index",1]],"find_keys",["type","range","spec",["lastkey",0,"keystep",1,"limit",0]]]],[]],
    zrange: ["zrange",-4,["readonly"],1,1,1,["@read","@sortedset","@slow"],[],[["flags",["RO","access"],"begin_search",["type","index","spec",["index",1]],"find_keys",["type","range","spec",["lastkey",0,"keystep",1,"limit",0]]]],[]],
    incr: ["incr",2,["write","denyoom","fast"],1,1,1,["@write","@string","@fast"],[],[["flags",["RW","access","update"],"begin_search",["type","index","spec",["index",1]],"find_keys",["type","range","spec",["lastkey",0,"keystep",1,"limit",0]]]],[]],
    mget: ["mget",-2,["readonly","fast"],1,-1,1,["@read","@string","@fast"],["request_policy:multi_shard"],[["flags",["RO","access"],"begin_search",["type","index","spec",["index",1]],"find_keys",["type","range","spec",["lastkey",-1,"keystep",1,"limit",0]]]],[]],
    dbsize: ["dbsize",1,["readonly","fast"],0,0,0,["@keyspace","@read","@fast"],["request_policy:all_shards","response_policy:agg_sum"],[],[]],
    flushdb: ["flushdb",-1,["write"],0,0,0,["@keyspace","@write","@slow","@dangerous"],["request_policy:all_shards","response_policy:all_succeeded"],[],[]],
    select: ["select",2,["loading","stale","fast"],0,0,0,["@fast","@connection"],[],[],[]],
    echo: ["echo",2,["loading","stale","fast"],0,0,0,["@fast","@connection"],[],[],[]],
    quit: ["quit",-1,["noscript","loading","stale","fast","no_auth","allow_busy"],0,0,0,["@fast","@connection"],[],[],[]],
};

/** `COMMAND DOCS` maps for the commands whose documentation the gateway serves. */
const COMMAND_DOCS_DATA = {
    get: ["summary","Returns the string value of a key.","since","1.0.0","group","string","complexity","O(1)","arguments",[["name","key","type","key","display_text","key","key_spec_index",0]]],
};

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
