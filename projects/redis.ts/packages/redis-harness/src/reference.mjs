//! Independent expectations for the wire format and the storage layout.
//!
//! Every function here is written from the protocol and layout description
//! alone. Acceptance checks compare the native output against these values, so
//! a defect inside the binding cannot validate itself.

export const YYKV_MAGIC = Buffer.from([0x59, 0x59, 0x4b, 0x56, 0x03]);
export const YYDS_MAGIC = Buffer.from([0x59, 0x59, 0x44, 0x53, 0x01]);

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/** FNV-1a over a snapshot body, used as an integrity check only. */
export function fnv1a(bytes) {
    let hash = FNV_OFFSET;
    for (const byte of bytes) {
        hash ^= BigInt(byte);
        hash = (hash * FNV_PRIME) & MASK_64;
    }
    return hash;
}

function take(bytes, cursor, length) {
    if (cursor + length > bytes.length) {
        throw new Error('truncated field');
    }
    return bytes.subarray(cursor, cursor + length);
}

function takeBytes(bytes, cursor) {
    if (cursor + 4 > bytes.length) {
        throw new Error('truncated length');
    }
    const length = bytes.readUInt32LE(cursor);
    return { value: take(bytes, cursor + 4, length), next: cursor + 4 + length };
}

function takeU32(bytes, cursor) {
    return { value: take(bytes, cursor, 4).readUInt32LE(0), next: cursor + 4 };
}

function takeU64(bytes, cursor) {
    return { value: take(bytes, cursor, 8).readBigUInt64LE(0), next: cursor + 8 };
}

/** Reads one `.yykv` snapshot: five byte magic, checksum, then the body. */
export function parseShard(bytes) {
    if (bytes.length < 13) {
        throw new Error('shard shorter than its header');
    }
    if (!bytes.subarray(0, 5).equals(YYKV_MAGIC)) {
        throw new Error('unknown shard magic');
    }
    const checksum = bytes.readBigUInt64LE(5);
    const body = bytes.subarray(13);
    const actual = fnv1a(body);
    if (actual !== checksum) {
        throw new Error(`shard checksum mismatch: ${actual} != ${checksum}`);
    }

    let cursor = 0;
    const next = takeU64(body, cursor);
    const nextRevision = Number(next.value);
    cursor = next.next;
    const count = takeU32(body, cursor);
    cursor = count.next;

    const records = [];
    for (let index = 0; index < count.value; index += 1) {
        const namespace = takeBytes(body, cursor);
        cursor = namespace.next;
        const key = takeBytes(body, cursor);
        cursor = key.next;
        const revision = takeU64(body, cursor);
        cursor = revision.next;
        const deadline = takeU64(body, cursor);
        cursor = deadline.next;
        const tag = take(body, cursor, 1)[0];
        cursor += 1;
        if (tag !== 0) {
            throw new Error('unsupported payload tag');
        }
        const value = takeBytes(body, cursor);
        cursor = value.next;
        records.push({
            namespace: namespace.value.toString('utf8'),
            key: Buffer.from(key.value),
            value: Buffer.from(value.value),
            revision: Number(revision.value),
            expiresAt: deadline.value === 0n ? null : Number(deadline.value),
        });
    }
    if (cursor !== body.length) {
        throw new Error('trailing shard bytes');
    }
    return { checksum, nextRevision, records };
}

/** Reads one `.yyds` catalog header and its shard registrations. */
export function parseCatalog(bytes) {
    if (bytes.length < 9) {
        throw new Error('catalog shorter than its header');
    }
    if (!bytes.subarray(0, 5).equals(YYDS_MAGIC)) {
        throw new Error('unknown catalog magic');
    }
    const version = takeU32(bytes, 5);
    let cursor = version.next + 8;
    const count = takeU32(bytes, cursor);
    cursor = count.next;
    const shardIds = [];
    for (let index = 0; index < count.value; index += 1) {
        const entry = takeBytes(bytes, cursor);
        cursor = entry.next;
        shardIds.push(entry.value.toString('utf8'));
    }
    return { version: version.value, shardIds, trailing: bytes.subarray(cursor) };
}

/** Canonical signed 64 bit integer: no plus sign, no leading zeros. */
export function canonicalInteger(bytes) {
    if (bytes.length === 0) {
        return null;
    }
    const negative = bytes[0] === 0x2d;
    const digits = negative ? bytes.subarray(1) : bytes;
    if (digits.length === 0 || digits.length > 19) {
        return null;
    }
    for (const byte of digits) {
        if (byte < 0x30 || byte > 0x39) {
            return null;
        }
    }
    if (digits.length > 1 && digits[0] === 0x30) {
        return null;
    }
    const magnitude = BigInt(digits.toString('ascii'));
    if (magnitude > 9223372036854775807n) {
        return null;
    }
    const value = Number(magnitude);
    return negative ? -value : value;
}

/** Multibulk request: a length header followed by length prefixed arguments. */
export function encodeCommand(args) {
    const parts = [Buffer.from(`*${args.length}\r\n`)];
    for (const arg of args) {
        const raw = Buffer.from(arg);
        parts.push(Buffer.from(`$${raw.length}\r\n`), raw, Buffer.from('\r\n'));
    }
    return Buffer.concat(parts);
}

function line(bytes, start) {
    const end = bytes.indexOf('\r\n', start);
    return end < 0 ? null : { value: bytes.subarray(start, end), next: end + 2 };
}

function count(raw) {
    if (raw.length === 0 || raw.length > 20) {
        return null;
    }
    const negative = raw[0] === 0x2d;
    const digits = negative ? raw.subarray(1) : raw;
    if (digits.length === 0) {
        return null;
    }
    for (const byte of digits) {
        if (byte < 0x30 || byte > 0x39) {
            return null;
        }
    }
    const value = Number(digits.toString('ascii'));
    if (!Number.isSafeInteger(value)) {
        return null;
    }
    return negative ? -value : value;
}

/** Parses one request from the front, or returns `null` when incomplete. */
export function decodeCommand(bytes) {
    if (bytes.length === 0) {
        return null;
    }
    if (bytes[0] !== 0x2a) {
        throw new Error('expected a multibulk request');
    }
    const header = line(bytes, 1);
    if (header === null) {
        return null;
    }
    const total = count(header.value);
    if (total === null) {
        throw new Error('invalid multibulk length');
    }
    if (total <= 0) {
        // Redis consumes an empty or negative multibulk header without replying.
        return { args: [], consumed: header.next };
    }
    let offset = header.next;
    const args = [];
    for (let index = 0; index < total; index += 1) {
        if (offset >= bytes.length) {
            return null;
        }
        if (bytes[offset] !== 0x24) {
            throw new Error('expected a bulk string');
        }
        const bulkHeader = line(bytes, offset + 1);
        if (bulkHeader === null) {
            return null;
        }
        offset = bulkHeader.next;
        const length = count(bulkHeader.value);
        if (length === null || length < 0) {
            throw new Error('invalid bulk length');
        }
        const end = offset + length;
        if (bytes.length < end + 2) {
            return null;
        }
        if (bytes[end] !== 0x0d || bytes[end + 1] !== 0x0a) {
            throw new Error('invalid bulk string terminator');
        }
        args.push(Buffer.from(bytes.subarray(offset, end)));
        offset = end + 2;
    }
    return { args, consumed: offset };
}

/** RESP2 / RESP3 frame for one reply specification. */
export function encodeReply(spec, protocol) {
    const parts = [];
    encodeInto(spec, protocol, parts);
    return Buffer.concat(parts);
}

function encodeInto(spec, protocol, parts) {
    switch (spec.type) {
        case 'simple':
            parts.push(Buffer.from(`+${spec.value}\r\n`));
            return;
        case 'error':
            parts.push(Buffer.from(`-${spec.value}\r\n`));
            return;
        case 'int':
            parts.push(Buffer.from(`:${spec.value}\r\n`));
            return;
        case 'bulk': {
            const raw = Buffer.from(spec.bytes ?? spec.value);
            parts.push(Buffer.from(`$${raw.length}\r\n`), raw, Buffer.from('\r\n'));
            return;
        }
        case 'null':
            parts.push(Buffer.from(protocol >= 3 ? '_\r\n' : '$-1\r\n'));
            return;
        case 'array':
            parts.push(Buffer.from(`*${spec.value.length}\r\n`));
            for (const value of spec.value) {
                encodeInto(value, protocol, parts);
            }
            return;
        case 'set':
            parts.push(Buffer.from(`${protocol >= 3 ? '~' : '*'}${spec.value.length}\r\n`));
            for (const value of spec.value) {
                encodeInto(value, protocol, parts);
            }
            return;
        case 'push':
            parts.push(Buffer.from(`${protocol >= 3 ? '>' : '*'}${spec.value.length}\r\n`));
            for (const value of spec.value) {
                encodeInto(value, protocol, parts);
            }
            return;
        case 'map': {
            const entries = spec.value;
            parts.push(Buffer.from(protocol >= 3 ? `%${entries.length}\r\n` : `*${entries.length * 2}\r\n`));
            for (const [key, value] of entries) {
                encodeInto(key, protocol, parts);
                encodeInto(value, protocol, parts);
            }
            return;
        }
        default:
            throw new Error(`unknown reply type ${spec.type}`);
    }
}

/** Parses one reply from the front, or returns `null` when incomplete. */
export function decodeReply(bytes) {
    if (bytes.length === 0) {
        return null;
    }
    const header = line(bytes, 1);
    if (header === null) {
        return null;
    }
    const prefix = bytes[0];
    const raw = header.value;
    const next = header.next;
    if (prefix === 0x2b) {
        return { spec: { type: 'simple', value: raw.toString('utf8') }, consumed: next };
    }
    if (prefix === 0x2d) {
        return { spec: { type: 'error', value: raw.toString('utf8') }, consumed: next };
    }
    if (prefix === 0x3a) {
        const value = count(raw);
        if (value === null) {
            throw new Error('reply integer is not canonical');
        }
        return { spec: { type: 'int', value }, consumed: next };
    }
    if (prefix === 0x5f) {
        return { spec: { type: 'null' }, consumed: next };
    }
    if (prefix === 0x24) {
        const length = count(raw);
        if (length === null) {
            throw new Error('reply bulk length is not canonical');
        }
        if (length < 0) {
            return { spec: { type: 'null' }, consumed: next };
        }
        const end = next + length;
        if (bytes.length < end + 2) {
            return null;
        }
        return { spec: { type: 'bulk', bytes: Array.from(bytes.subarray(next, end)) }, consumed: end + 2 };
    }
    if (prefix === 0x2a || prefix === 0x25 || prefix === 0x3e || prefix === 0x7e) {
        const total = count(raw);
        if (total === null || total < 0) {
            throw new Error('reply aggregate length is not canonical');
        }
        let offset = next;
        const values = [];
        const replies = prefix === 0x25 ? total * 2 : total;
        for (let index = 0; index < replies; index += 1) {
            const nested = decodeReply(bytes.subarray(offset));
            if (nested === null) {
                return null;
            }
            values.push(nested.spec);
            offset += nested.consumed;
        }
        if (prefix === 0x25) {
            const entries = [];
            for (let index = 0; index < values.length; index += 2) {
                entries.push([values[index], values[index + 1]]);
            }
            return { spec: { type: 'map', value: entries }, consumed: offset };
        }
        if (prefix === 0x3e) {
            return { spec: { type: 'push', value: values }, consumed: offset };
        }
        if (prefix === 0x7e) {
            return { spec: { type: 'set', value: values }, consumed: offset };
        }
        return { spec: { type: 'array', value: values }, consumed: offset };
    }
    throw new Error(`unknown reply prefix ${String.fromCharCode(prefix)}`);
}
