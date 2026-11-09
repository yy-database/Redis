//! Plans for `XCLAIM` and `XAUTOCLAIM`.

import { parseInteger } from '../../native.js';
import type { Store } from '../../native.js';
import { array, bulk, error as replyError } from '../../reply.js';
import type { ReplySpec } from '../../reply.js';
import { rewriteKind } from '../chunks.js';
import { text, wrongArity } from '../kinds.js';
import type { CommandPlan, Session } from '../session.js';
import { STREAM_ID_ERROR, encodeStream } from './body.js';
import { commandNoGroup, streamState } from './groups.js';
import { compareStreamIds, entryReply, findEntry, findGroup, idText, parseExplicitStreamId, pendingList, removePending, ensureConsumer, streamMeta } from './state.js';
import type { StreamId } from './types.js';

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
