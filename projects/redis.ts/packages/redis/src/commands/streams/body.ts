//! Stream body encoding and the live-state reader.

import type { Store } from '../../native.js';
import { MAX_CHUNK } from '../chunks.js';
import { SUFFIX } from '../kinds.js';
import type { StreamConsumer, StreamEntry, StreamGroup, StreamId, StreamMeta, StreamPending, StreamState } from './types.js';

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
export const STREAM_NODE_SIZE = 100;
export const U64_MAX = (1n << 64n) - 1n;
export const STREAM_ID_ERROR = 'ERR Invalid stream ID specified as stream command argument';
export const STREAM_ID_EMPTY = 'ERR The ID specified in XADD must be greater than 0-0';
export const STREAM_ID_OLD = 'ERR The ID specified in XADD is equal or smaller than the target stream top item';
/** Marks the optional trailer that carries counters and consumer-group state. */
const STREAM_TRAILER = 0x5354524d;
export const ZERO_ID: StreamId = { ms: 0n, seq: 0n };

/** Bytes one consumer group adds to the stream trailer. */
function groupByteLength(group: StreamGroup): number | null {
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
export function encodeStream(entries: StreamEntry[], last: StreamId, meta: StreamMeta | null = null): Buffer | null {
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

function decodeStream(body: Buffer): StreamState | null {
    if (body.length < 20) return null;
    const last = { ms: body.readBigUInt64LE(0), seq: body.readBigUInt64LE(8) };
    const count = body.readUInt32LE(16);
    const entries: StreamEntry[] = [];
    let offset = 20;
    for (let index = 0; index < count; index += 1) {
        if (offset + 20 > body.length) return null;
        const ms = body.readBigUInt64LE(offset);
        offset += 8;
        const seq = body.readBigUInt64LE(offset);
        offset += 8;
        const fieldCount = body.readUInt32LE(offset);
        offset += 4;
        const fields: [Buffer, Buffer][] = [];
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
    const groups: StreamGroup[] = [];
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
        const consumers: StreamConsumer[] = [];
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
            const pending: StreamPending[] = [];
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
export function readStream(store: Store, db: number, key: Buffer | string): StreamState | null {
    const body = store.getKind(db, SUFFIX.stream, key);
    if (body === null || body === undefined) return null;
    const decoded = decodeStream(body);
    return decoded === null ? { error: true } as StreamState : decoded;
}
