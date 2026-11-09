//! Plans for `XINFO STREAM|GROUPS|CONSUMERS` and their reply shaping.

import { parseInteger } from '../../native.js';
import type { Store } from '../../native.js';
import { array, bulk, error as replyError, integer, nullReply } from '../../reply.js';
import type { ReplySpec } from '../../reply.js';
import { integerError, kindOf, text, wrongArity, wrongType } from '../kinds.js';
import type { CommandPlan, Session } from '../session.js';
import { STREAM_NODE_SIZE, readStream } from './body.js';
import { groupNoGroup } from './groups.js';
import { byName, compareStreamIds, consumerIdle, consumerInactive, entryReply, findGroup, groupLag, idText, pendingCount, pendingList } from './state.js';
import type { StreamGroup, StreamState } from './types.js';

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
