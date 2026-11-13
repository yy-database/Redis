//! Plans for `XADD`, `XLEN`, `XRANGE`, `XREVRANGE`, `XDEL`, `XTRIM` and `XREAD`.

import { parseInteger } from '../../native.js';
import type { Store } from '../../native.js';
import { array, bulk, error as replyError, integer, nullArray, nullReply } from '../../reply.js';
import type { ReplySpec } from '../../reply.js';
import { blockingPlan, notifyPush } from '../blocking-plan.js';
import { rewriteKind } from '../chunks.js';
import { integerError, kindOf, text, wrongArity, wrongType } from '../kinds.js';
import type { CommandPlan, Session } from '../session.js';
import { STREAM_ID_ERROR, U64_MAX, ZERO_ID, encodeStream, readStream } from './body.js';
import { compareStreamIds, ensureConsumer, entryReply, findConsumer, findEntry, findGroup, parseExplicitStreamId, parseStreamBound, parseTrimOptions, resolveStreamId, streamMeta, trimStream } from './state.js';
import type { StreamEntry, StreamId, StreamPending } from './types.js';

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
 * Plans `XREADGROUP`.
 *
 * `>` claims entries past the group's last-delivered id and records each one in
 * the consumer's pending list unless `NOACK` is set. An explicit id replays that
 * consumer's pending history instead, incrementing delivery counts. Every key and
 * group is validated before a single entry is claimed, so an error never leaves a
 * half-updated group behind.
 */
export function planXReadGroup(store: Store, session: Session, args: Buffer[]): CommandPlan {
    const db = session.db;
    if (text(args[1] ?? '').toUpperCase() !== 'GROUP') {
        return { error: replyError(MISSING_GROUP) };
    }
    if (args.length < 7) return { error: wrongArity('xreadgroup') };
    const groupName = args[2];
    const consumerName = args[3];
    let count: number | null = null;
    let timeoutMs: number | null = null;
    let noack = false;
    let index = 4;
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
        if (token === 'NOACK') {
            noack = true;
            index += 1;
            continue;
        }
        if (token === 'STREAMS') break;
        return { error: replyError('ERR syntax error') };
    }

    const tokens = args.slice(index + 1);
    if (tokens.length < 2) return { error: wrongArity('xreadgroup') };
    if (tokens.length % 2 !== 0) return { error: replyError(STREAM_UNBALANCED) };
    const half = tokens.length / 2;
    const keys = tokens.slice(0, half);
    const fresh: boolean[] = [];
    const cursors: StreamId[] = [];
    for (let position = 0; position < half; position += 1) {
        const raw = text(tokens[half + position]);
        if (raw === '>') {
            fresh.push(true);
            cursors.push(ZERO_ID);
            continue;
        }
        const id = parseExplicitStreamId(raw);
        if (id === null) return { error: replyError(STREAM_ID_ERROR) };
        fresh.push(false);
        cursors.push(id);
    }

    const attempt = () => {
        // Validate every stream and group before claiming anything.
        const states = [];
        for (let position = 0; position < half; position += 1) {
            const key = keys[position];
            const kind = kindOf(store, db, key);
            if (kind !== null && kind !== 'stream') return wrongType();
            if (kind === null) return readGroupMissing(key, groupName);
            const stream = readStream(store, db, key);
            if (stream === null || stream.error === true) return wrongType();
            if (findGroup(stream, groupName) === undefined) return readGroupMissing(key, groupName);
            states.push(stream);
        }

        const now = Date.now();
        const rows: ReplySpec[] = [];
        const touched = new Set<number>();
        for (let position = 0; position < half; position += 1) {
            const stream = states[position];
            const group = findGroup(stream, groupName);
            if (group === undefined) continue;
            const replies: ReplySpec[] = [];
            if (fresh[position]) {
                const selected: StreamEntry[] = [];
                for (const entry of stream.entries) {
                    if (compareStreamIds(entry, group.lastId) <= 0) continue;
                    selected.push(entry);
                    if (count !== null && selected.length >= count) break;
                }
                if (selected.length === 0) continue;
                const consumer = ensureConsumer(group, consumerName, now);
                consumer.deliveryTime = now;
                consumer.activeTime = now;
                for (const entry of selected) {
                    replies.push(entryReply(entry));
                    if (!noack) {
                        consumer.pending.push({ ms: entry.ms, seq: entry.seq, deliveryTime: now, deliveryCount: 1 });
                    }
                }
                const last = selected[selected.length - 1];
                group.lastId = { ms: last.ms, seq: last.seq };
                if (group.entriesRead !== null) {
                    group.entriesRead = Math.min(stream.entriesAdded, group.entriesRead + selected.length);
                }
            }
            else {
                const consumer = findConsumer(group, consumerName);
                if (consumer === undefined) continue;
                const delivered: StreamPending[] = [];
                for (const pending of consumer.pending) {
                    if (compareStreamIds(pending, cursors[position]) <= 0) continue;
                    const entry = findEntry(stream, pending);
                    // A trimmed or deleted entry keeps its id with a nil payload.
                    replies.push(entry === undefined
                        ? array([bulk(`${pending.ms}-${pending.seq}`), nullReply()])
                        : entryReply(entry));
                    delivered.push(pending);
                    if (count !== null && delivered.length >= count) break;
                }
                if (delivered.length === 0) continue;
                consumer.deliveryTime = now;
                consumer.activeTime = now;
                for (const pending of delivered) {
                    pending.deliveryTime = now;
                    pending.deliveryCount += 1;
                }
            }
            touched.add(position);
            rows.push(array([bulk(keys[position]), array(replies)]));
        }
        if (touched.size === 0) return null;
        for (const position of touched) {
            const key = keys[position];
            const stream = states[position];
            rewriteKind(store, db, 'stream', key, encodeStream(stream.entries, stream.last, streamMeta(stream)));
        }
        return array(rows);
    };

    if (timeoutMs === null) return { run: () => attempt() ?? nullArray() };
    return blockingPlan(db, keys, timeoutMs, attempt, nullArray());
}

/** Error text a real server answers for `XREADGROUP` without a `GROUP` clause. */
const MISSING_GROUP = 'ERR Missing GROUP keyword or consumer/group name in XREADGROUP';

/** `NOGROUP` wording for `XREADGROUP`, which names the missing key and group. */
function readGroupMissing(key: Buffer, group: Buffer): ReplySpec {
    return replyError(`NOGROUP No such key '${text(key)}' or consumer group '${text(group)}' in XREADGROUP with GROUP option`);
}

/**
 * Plans `XADD`, `XLEN`, `XRANGE`, `XREVRANGE`, `XDEL`, `XTRIM` and `XREAD`.
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
