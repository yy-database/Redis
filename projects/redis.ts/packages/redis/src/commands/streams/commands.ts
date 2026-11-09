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
import { compareStreamIds, parseExplicitStreamId, parseStreamBound, parseTrimOptions, resolveStreamId, streamMeta, trimStream } from './state.js';
import type { StreamEntry, StreamId } from './types.js';

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
