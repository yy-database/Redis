//! Plans for `XGROUP`, `XACK` and `XPENDING`, and the shared group-key lookup.

import { parseInteger } from '../../native.js';
import type { Store } from '../../native.js';
import { array, bulk, error as replyError, integer, nullArray, nullReply, simple } from '../../reply.js';
import type { ReplySpec } from '../../reply.js';
import { rewriteKind } from '../chunks.js';
import { integerError, kindOf, text, wrongArity, wrongType } from '../kinds.js';
import type { CommandPlan, Session } from '../session.js';
import { STREAM_ID_ERROR, ZERO_ID, encodeStream, readStream } from './body.js';
import { byName, compareStreamIds, consumerIdle, ensureConsumer, findConsumer, findGroup, idText, parseExplicitStreamId, parseStreamBound, pendingList, removePending, streamMeta } from './state.js';
import type { StreamId, StreamLookup, StreamState } from './types.js';

const STREAM_REQUIRES_KEY = 'ERR The XGROUP subcommand requires the key to exist. Note that for CREATE you may want to use the MKSTREAM option to create an empty stream automatically.';
const BUSYGROUP = 'BUSYGROUP Consumer Group name already exists';
const groupHelp = (sub: string): ReplySpec => replyError(`ERR unknown subcommand or wrong number of arguments for '${sub}'. Try XGROUP HELP.`);
export const groupNoGroup = (group: Buffer | string, key: Buffer | string): ReplySpec => replyError(`NOGROUP No such consumer group '${group}' for key name '${key}'`);
export const commandNoGroup = (key: Buffer | string, group: Buffer | string): ReplySpec => replyError(`NOGROUP No such key '${key}' or consumer group '${group}'`);

/** Decoded stream or the reply a group command owes a missing or wrong-typed key. */
export function streamState(store: Store, db: number, key: Buffer | string): StreamLookup {
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
