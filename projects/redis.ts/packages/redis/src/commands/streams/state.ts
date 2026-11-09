//! Stream ids, group/consumer bookkeeping, trimming and option parsing.

import { parseInteger } from '../../native.js';
import { array, bulk, error as replyError } from '../../reply.js';
import type { ReplySpec } from '../../reply.js';
import { integerError, text } from '../kinds.js';
import { STREAM_ID_EMPTY, STREAM_ID_ERROR, STREAM_ID_OLD, STREAM_NODE_SIZE, U64_MAX } from './body.js';
import type { MaxLen, MinId, PendingRow, ResolvedStreamId, StreamBound, StreamConsumer, StreamEntry, StreamGroup, StreamId, StreamMeta, StreamPending, StreamState, TrimParse } from './types.js';

export function compareStreamIds(left: StreamId, right: StreamId): number {
    if (left.ms !== right.ms) return left.ms < right.ms ? -1 : 1;
    if (left.seq !== right.seq) return left.seq < right.seq ? -1 : 1;
    return 0;
}

/** Stream metadata needed to re-encode the body after any mutation. */
export const streamMeta = (stream: StreamState): StreamMeta => ({
    entriesAdded: stream.entriesAdded,
    maxDeleted: stream.maxDeleted,
    groups: stream.groups,
});

export const idText = (id: StreamId): string => `${id.ms}-${id.seq}`;

export function findEntry(stream: StreamState, id: StreamId): StreamEntry | undefined {
    return stream.entries.find(entry => entry.ms === id.ms && entry.seq === id.seq);
}

export function findGroup(stream: StreamState, name: Buffer): StreamGroup | undefined {
    return stream.groups.find(group => group.name.equals(name));
}

export function findConsumer(group: StreamGroup, name: Buffer): StreamConsumer | undefined {
    return group.consumers.find(consumer => consumer.name.equals(name));
}

/** Looks a consumer up and creates it on first use, the way every group command does. */
export function ensureConsumer(group: StreamGroup, name: Buffer, now: number): StreamConsumer {
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
export function removePending(consumer: StreamConsumer, id: StreamId): StreamPending | null {
    const index = consumer.pending.findIndex(pending => pending.ms === id.ms && pending.seq === id.seq);
    if (index < 0) return null;
    return consumer.pending.splice(index, 1)[0];
}

/** Every pending entry of a group, ordered by id the way the radix tree walks them. */
export function pendingList(group: StreamGroup): PendingRow[] {
    const rows: PendingRow[] = [];
    for (const consumer of group.consumers) {
        for (const pending of consumer.pending) rows.push({ consumer, pending });
    }
    rows.sort((left, right) => compareStreamIds(left.pending, right.pending));
    return rows;
}

export function pendingCount(group: StreamGroup): number {
    let total = 0;
    for (const consumer of group.consumers) total += consumer.pending.length;
    return total;
}

/** Groups and consumers live in radix trees, so their listings are byte-ordered. */
export const byName = (left: { name: Buffer }, right: { name: Buffer }): number => Buffer.compare(left.name, right.name);

/**
 * Lag as the server reports it.
 *
 * A group that never moved past `0-0` reports the surviving entry count. A known
 * `entries-read` wins and counts appends that are no longer in the stream. An
 * unknown counter with a group parked before the stream top cannot be computed.
 */
export function groupLag(stream: StreamState, group: StreamGroup): number | null {
    if (group.lastId.ms === 0n && group.lastId.seq === 0n) return stream.entries.length;
    if (group.entriesRead !== null) {
        const lag = stream.entriesAdded - group.entriesRead;
        return lag < 0 ? 0 : lag;
    }
    return compareStreamIds(group.lastId, stream.last) >= 0 ? 0 : null;
}

export const consumerIdle = (consumer: StreamConsumer, now: number): number => Math.max(0, now - consumer.deliveryTime);
export const consumerInactive = (consumer: StreamConsumer, now: number): number => consumer.activeTime < 0
    ? -1
    : Math.max(0, now - consumer.activeTime);

/** One entry as the wire shape: id plus a flat field/value array. */
export function entryReply(entry: StreamEntry): ReplySpec {
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
export function parseExplicitStreamId(raw: Buffer | string): StreamId | null {
    const match = /^(\d+)(?:-(\d+))?$/.exec(text(raw));
    if (match === null) return null;
    const ms = BigInt(match[1]);
    const seq = match[2] === undefined ? 0n : BigInt(match[2]);
    return ms > U64_MAX || seq > U64_MAX ? null : { ms, seq };
}

/** Parses one range bound, keeping the `(` exclusive prefix. */
export function parseStreamBound(raw: Buffer, isEnd: boolean): StreamBound | null {
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
export function resolveStreamId(token: string, last: StreamId | null): ResolvedStreamId | null {
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
export function trimStream(entries: StreamEntry[], maxlen: MaxLen | null, minid: MinId | null): { kept: StreamEntry[]; removed: number } {
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
export function parseTrimOptions(args: Buffer[], start: number, style: 'xadd' | 'xtrim'): TrimParse {
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
