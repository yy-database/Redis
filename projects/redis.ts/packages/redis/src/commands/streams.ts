//! Stream encoding, ids, trimming and the `X*` command plans.

import { parseInteger } from '../native.js';
import type { Store } from '../native.js';
import { array, bulk, error as replyError, integer, nullArray, nullReply, simple } from '../reply.js';
import type { ReplySpec } from '../reply.js';
import { blockingPlan, notifyPush } from './blocking-plan.js';
import { MAX_CHUNK, rewriteKind } from './chunks.js';
import { SUFFIX, integerError, kindOf, text, wrongArity, wrongType } from './kinds.js';
import type { CommandPlan, Session } from './session.js';

/** One stream id: a millisecond part and a sequence part. */
export interface StreamId {
    ms: bigint;
    seq: bigint;
}

/** One stream entry: its id halves and its field pairs. */
export interface StreamEntry extends StreamId {
    fields: [Buffer, Buffer][];
}

/** One pending entry inside a consumer group. */
export interface StreamPending extends StreamId {
    deliveryTime: number;
    deliveryCount: number;
}

/** One consumer of a group, with its pending entries. */
export interface StreamConsumer {
    name: Buffer;
    seenTime: number;
    activeTime: number;
    deliveryTime: number;
    pending: StreamPending[];
}

/** One consumer group of a stream. */
export interface StreamGroup {
    name: Buffer;
    lastId: StreamId;
    entriesRead: number | null;
    consumers: StreamConsumer[];
}

/** The metadata a body carries beyond the surviving entries. */
export interface StreamMeta {
    entriesAdded: number;
    maxDeleted: StreamId;
    groups: StreamGroup[];
}

/** Decoded stream state; `error` marks a corrupt body. */
export interface StreamState extends StreamMeta {
    entries: StreamEntry[];
    last: StreamId;
    error?: boolean;
}

/** One pending row paired with the consumer holding it. */
interface PendingRow {
    consumer: StreamConsumer;
    pending: StreamPending;
}

/** A parsed `MAXLEN` threshold. */
interface MaxLen {
    approx: boolean;
    value: number;
    limit: number | null;
}

/** A parsed `MINID` threshold. */
interface MinId {
    approx: boolean;
    id: StreamId;
    limit: number | null;
}

/** The outcome of parsing one range bound. */
interface StreamBound {
    id: StreamId;
    exclusive: boolean;
}

/** The outcome of `XADD` id resolution: an id, `{error}` or `null`. */
interface ResolvedStreamId {
    ms?: bigint;
    seq?: bigint;
    error?: string;
}

/** The outcome of parsing the `NOMKSTREAM` / `MAXLEN` / `MINID` prefix. */
interface TrimParse {
    error?: ReplySpec;
    nomkstream?: boolean;
    maxlen?: MaxLen | null;
    minid?: MinId | null;
    index?: number;
}

/** Decoded stream or the reply a group command owes a missing or wrong-typed key. */
interface StreamLookup {
    missing?: boolean;
    error?: ReplySpec;
    stream?: StreamState;
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
const ZERO_ID: StreamId = { ms: 0n, seq: 0n };

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
function encodeStream(entries: StreamEntry[], last: StreamId, meta: StreamMeta | null = null): Buffer | null {
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
function readStream(store: Store, db: number, key: Buffer | string): StreamState | null {
    const body = store.getKind(db, SUFFIX.stream, key);
    if (body === null || body === undefined) return null;
    const decoded = decodeStream(body);
    return decoded === null ? { error: true } as StreamState : decoded;
}

function compareStreamIds(left: StreamId, right: StreamId): number {
    if (left.ms !== right.ms) return left.ms < right.ms ? -1 : 1;
    if (left.seq !== right.seq) return left.seq < right.seq ? -1 : 1;
    return 0;
}

/** Stream metadata needed to re-encode the body after any mutation. */
const streamMeta = (stream: StreamState): StreamMeta => ({
    entriesAdded: stream.entriesAdded,
    maxDeleted: stream.maxDeleted,
    groups: stream.groups,
});

const idText = (id: StreamId): string => `${id.ms}-${id.seq}`;

function findEntry(stream: StreamState, id: StreamId): StreamEntry | undefined {
    return stream.entries.find(entry => entry.ms === id.ms && entry.seq === id.seq);
}

function findGroup(stream: StreamState, name: Buffer): StreamGroup | undefined {
    return stream.groups.find(group => group.name.equals(name));
}

function findConsumer(group: StreamGroup, name: Buffer): StreamConsumer | undefined {
    return group.consumers.find(consumer => consumer.name.equals(name));
}

/** Looks a consumer up and creates it on first use, the way every group command does. */
function ensureConsumer(group: StreamGroup, name: Buffer, now: number): StreamConsumer {
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
function removePending(consumer: StreamConsumer, id: StreamId): StreamPending | null {
    const index = consumer.pending.findIndex(pending => pending.ms === id.ms && pending.seq === id.seq);
    if (index < 0) return null;
    return consumer.pending.splice(index, 1)[0];
}

/** Every pending entry of a group, ordered by id the way the radix tree walks them. */
function pendingList(group: StreamGroup): PendingRow[] {
    const rows: PendingRow[] = [];
    for (const consumer of group.consumers) {
        for (const pending of consumer.pending) rows.push({ consumer, pending });
    }
    rows.sort((left, right) => compareStreamIds(left.pending, right.pending));
    return rows;
}

function pendingCount(group: StreamGroup): number {
    let total = 0;
    for (const consumer of group.consumers) total += consumer.pending.length;
    return total;
}

/** Groups and consumers live in radix trees, so their listings are byte-ordered. */
const byName = (left: { name: Buffer }, right: { name: Buffer }): number => Buffer.compare(left.name, right.name);

/**
 * Lag as the server reports it.
 *
 * A group that never moved past `0-0` reports the surviving entry count. A known
 * `entries-read` wins and counts appends that are no longer in the stream. An
 * unknown counter with a group parked before the stream top cannot be computed.
 */
function groupLag(stream: StreamState, group: StreamGroup): number | null {
    if (group.lastId.ms === 0n && group.lastId.seq === 0n) return stream.entries.length;
    if (group.entriesRead !== null) {
        const lag = stream.entriesAdded - group.entriesRead;
        return lag < 0 ? 0 : lag;
    }
    return compareStreamIds(group.lastId, stream.last) >= 0 ? 0 : null;
}

const consumerIdle = (consumer: StreamConsumer, now: number): number => Math.max(0, now - consumer.deliveryTime);
const consumerInactive = (consumer: StreamConsumer, now: number): number => consumer.activeTime < 0
    ? -1
    : Math.max(0, now - consumer.activeTime);

/** One entry as the wire shape: id plus a flat field/value array. */
function entryReply(entry: StreamEntry): ReplySpec {
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
function parseStreamId(raw: Buffer, isEnd = false): StreamId | null {
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
function parseExplicitStreamId(raw: Buffer | string): StreamId | null {
    const match = /^(\d+)(?:-(\d+))?$/.exec(text(raw));
    if (match === null) return null;
    const ms = BigInt(match[1]);
    const seq = match[2] === undefined ? 0n : BigInt(match[2]);
    return ms > U64_MAX || seq > U64_MAX ? null : { ms, seq };
}

/** Parses one range bound, keeping the `(` exclusive prefix. */
function parseStreamBound(raw: Buffer, isEnd: boolean): StreamBound | null {
    const value = text(raw);
    const exclusive = value.startsWith('(');
    const body = exclusive ? value.slice(1) : value;
    let id: StreamId;
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
function resolveStreamId(token: string, last: StreamId | null): ResolvedStreamId | null {
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
function trimStream(entries: StreamEntry[], maxlen: MaxLen | null, minid: MinId | null): { kept: StreamEntry[]; removed: number } {
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
function parseTrimOptions(args: Buffer[], start: number, style: 'xadd' | 'xtrim'): TrimParse {
    let nomkstream = false;
    let maxlen: MaxLen | null = null;
    let minid: MinId | null = null;
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
        let limit: number | null = null;
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
export function planXRead(store: Store, session: Session, args: Buffer[]): CommandPlan {
    const db = session.db;
    if (args.length < 4) return { error: wrongArity('xread') };
    let count: number | null = null;
    let timeoutMs: number | null = null;
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
    const cursors: { id: StreamId; inclusive: boolean }[] = [];
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
        const rows: ReplySpec[] = [];
        for (let position = 0; position < keys.length; position += 1) {
            const key = keys[position];
            const kind = kindOf(store, db, key);
            if (kind !== null && kind !== 'stream') return wrongType();
            if (kind === null) continue;
            const stream = readStream(store, db, key);
            if (stream === null || stream.error === true) return wrongType();
            const cursor = cursors[position];
            const selected: StreamEntry[] = [];
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
export function planStream(store: Store, session: Session, name: string, args: Buffer[]): CommandPlan {
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
        let count: number | null = null;
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
                const selected: StreamEntry[] = [];
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
                const targets = new Set<string>();
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
            const entries: StreamEntry[] = stream === null ? [] : stream.entries;
            const last = stream === null ? null : stream.last;
            const id = resolveStreamId(text(idToken), last);
            if (id === null) return replyError(STREAM_ID_ERROR);
            if (id.error !== undefined) return replyError(id.error);
            const fields: [Buffer, Buffer][] = [];
            for (let pair = 0; pair < pairs.length; pair += 2) fields.push([pairs[pair], pairs[pair + 1]]);
            entries.push({ ms: id.ms, seq: id.seq, fields });
            const kept = trimStream(entries, parsed.maxlen, parsed.minid).kept;
            rewriteKind(store, db, 'stream', key, encodeStream(kept, id as StreamId, {
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
const groupHelp = (sub: string): ReplySpec => replyError(`ERR unknown subcommand or wrong number of arguments for '${sub}'. Try XGROUP HELP.`);
const groupNoGroup = (group: Buffer | string, key: Buffer | string): ReplySpec => replyError(`NOGROUP No such consumer group '${group}' for key name '${key}'`);
const commandNoGroup = (key: Buffer | string, group: Buffer | string): ReplySpec => replyError(`NOGROUP No such key '${key}' or consumer group '${group}'`);

/** Decoded stream or the reply a group command owes a missing or wrong-typed key. */
function streamState(store: Store, db: number, key: Buffer | string): StreamLookup {
    const kind = kindOf(store, db, key);
    if (kind === null) return { missing: true };
    if (kind !== 'stream') return { error: wrongType() };
    const stream = readStream(store, db, key);
    return stream === null || stream.error === true ? { error: wrongType() } : { stream };
}

/** Reads `ENTRIESREAD n` from the tail of `CREATE` / `SETID`. */
function parseEntriesRead(args: Buffer[], start: number): { error?: ReplySpec; value?: number; provided?: boolean; index?: number } {
    let value: number | null = null;
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
export function planXGroup(store: Store, session: Session, args: Buffer[]): CommandPlan {
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
        let entriesRead: number | null = null;
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
                let stream: StreamState;
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
export function planXAck(store: Store, session: Session, args: Buffer[]): CommandPlan {
    const db = session.db;
    if (args.length < 3) return { error: wrongArity('xack') };
    const key = args[1];
    const groupName = args[2];
    const ids: StreamId[] = [];
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
export function planXPending(store: Store, session: Session, args: Buffer[]): CommandPlan {
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
            const rows: ReplySpec[] = [];
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
export function planXClaim(store: Store, session: Session, args: Buffer[]): CommandPlan {
    const db = session.db;
    if (args.length < 6) return { error: wrongArity('xclaim') };
    const key = args[1];
    const groupName = args[2];
    const consumerName = args[3];
    const minIdle = parseInteger(text(args[4]));
    if (minIdle === null) return { error: replyError('ERR Invalid min-idle-time argument for XCLAIM') };
    const minimum = Math.max(0, minIdle);
    const ids: StreamId[] = [];
    let force = false;
    let justid = false;
    let idle: number | null = null;
    let time: number | null = null;
    let retrycount: number | null = null;
    let lastid: StreamId | null = null;
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
            const deliveries: ReplySpec[] = [];
            for (const id of ids) {
                const entry = findEntry(state.stream, id);
                if (entry === undefined) continue;
                const row = pendingList(group).find(item => item.pending.ms === id.ms && item.pending.seq === id.seq);
                let count: number;
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
export function planXAutoClaim(store: Store, session: Session, args: Buffer[]): CommandPlan {
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
            const claimed: ReplySpec[] = [];
            const deleted: ReplySpec[] = [];
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
function streamInfoPairs(stream: StreamState): [string, ReplySpec][] {
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
function flatPairs(pairs: [string, ReplySpec][]): ReplySpec {
    return array(pairs.flatMap(([name, value]) => [bulk(name), value]));
}

function groupFullMap(stream: StreamState, group: StreamGroup): ReplySpec {
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
export function planXInfo(store: Store, session: Session, args: Buffer[]): CommandPlan {
    const db = session.db;
    if (args.length < 2) return { error: wrongArity('xinfo') };
    const sub = text(args[1]).toUpperCase();
    const unknown = () => replyError(`ERR unknown subcommand '${text(args[1])}'. Try XINFO HELP.`);
    const malformed = () => replyError(`ERR unknown subcommand or wrong number of arguments for '${text(args[1])}'. Try XINFO HELP.`);
    if (sub === 'STREAM') {
        if (args.length < 3) return { error: wrongArity('xinfo|stream') };
        const key = args[2];
        let full = false;
        let count: number | null = null;
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