//! Sorted-set forwarding, range-option checks and the `Z*` plans.

import { parseInteger } from '../native.js';
import type { Store } from '../native.js';
import { error as replyError, nullArray } from '../reply.js';
import type { ReplySpec } from '../reply.js';
import { blockingPlan, deferredFailure, notifyPush, parseBlockingTimeout } from './blocking-plan.js';
import { SUFFIX, integerError, text, unknownCommand, wrongArity, wrongType } from './kinds.js';
import { parseScanCursor, parseScanOptions } from './scan.js';
import type { CommandPlan, Session } from './session.js';

/** Forwards one zset request to the upstream facade after rejecting a stream key. */
export function forwardZSet(store: Store, session: Session, args: Buffer[], keys: Buffer[], notifyKeys: Buffer[] = []): () => ReplySpec {
    return () => {
        for (const key of keys) {
            if (store.existsKind(session.db, SUFFIX.stream, key)) return wrongType();
        }
        const reply = store.zsetCommand(session.db, session.protocol ?? 2, args);
        if (reply.type !== 'error') {
            for (const key of notifyKeys) notifyPush(session, session.db, key);
        }
        return reply;
    };
}

/** One non-blocking attempt for a blocking zset command, mapping the empty reply to `null`. */
export function forwardBlockingZSet(store: Store, session: Session, args: Buffer[], keys: Buffer[]): () => ReplySpec | null {
    return () => {
        const reply = forwardZSet(store, session, args, keys)();
        if (reply.type === 'null' || reply.type === 'null-array') return null;
        return reply;
    };
}

/**
 * Validates the option tail of one range command.
 *
 * Only the queue-time rules live here: an unknown option, `LIMIT` outside a
 * score or lex mode, and `WITHSCORES` on a lex command are rejected while the
 * command is queued. Range selection and reply framing run upstream.
 *
 * `scores` tells how the command treats `WITHSCORES`: `allowed` accepts it,
 * `lex-error` answers the dedicated lex message, and `none` keeps it a plain
 * syntax error.
 */
function checkZSetRangeOptions(args: Buffer[], from: number, scores: 'allowed' | 'lex-error' | 'none', initial: 'rank' | 'score' | 'lex'): { error?: ReplySpec } {
    let mode = initial;
    let withScores = false;
    let limited = false;
    for (let index = from; index < args.length;) {
        const option = text(args[index]).toLowerCase();
        if (option === 'byscore') {
            mode = 'score';
            index += 1;
        }
        else if (option === 'bylex') {
            mode = 'lex';
            index += 1;
        }
        else if (option === 'rev') {
            index += 1;
        }
        else if (option === 'withscores') {
            if (scores === 'allowed') {
                withScores = true;
                index += 1;
            }
            else if (scores === 'lex-error') {
                return { error: replyError('ERR syntax error, WITHSCORES not supported in combination with BYLEX') };
            }
            else {
                return { error: replyError('ERR syntax error') };
            }
        }
        else if (option === 'limit') {
            if (index + 2 >= args.length) return { error: replyError('ERR syntax error') };
            limited = true;
            index += 3;
        }
        else {
            return { error: replyError('ERR syntax error') };
        }
    }
    if (mode === 'lex' && withScores) {
        return { error: replyError('ERR syntax error, WITHSCORES not supported in combination with BYLEX') };
    }
    if (limited && mode === 'rank') {
        return { error: replyError('ERR syntax error, LIMIT is only supported in combination with either BYSCORE or BYLEX') };
    }
    return {};
}

/** Validates one positive key count shared by the aggregate commands. */
function checkZSetKeyCount(raw: Buffer, message: string): { error?: ReplySpec; numkeys?: number } {
    const numkeys = parseInteger(raw);
    if (numkeys === null || numkeys <= 0) return { error: replyError(message) };
    return { numkeys };
}

/**
 * Plans one sorted-set command.
 *
 * Arity, option exclusivity and the scan cursor stay here because a transaction
 * rejects a malformed command while it is queued. Scores, range selection, pop
 * order and reply framing all run upstream, so the facade holds one implementation.
 */
export function planZSet(store: Store, session: Session, name: string, args: Buffer[]): CommandPlan {
    const length = args.length;
    const forward = (keys: Buffer[], notifyKeys: Buffer[] = []) => ({ run: forwardZSet(store, session, args, keys, notifyKeys) });
    switch (name) {
        case 'zadd': {
            if (length < 4) return { error: wrongArity(name) };
            const options = { nx: false, xx: false, gt: false, lt: false, ch: false, incr: false };
            let index = 2;
            for (; index < length; index += 1) {
                const option = text(args[index]).toLowerCase();
                if (option === 'nx') options.nx = true;
                else if (option === 'xx') options.xx = true;
                else if (option === 'gt') options.gt = true;
                else if (option === 'lt') options.lt = true;
                else if (option === 'ch') options.ch = true;
                else if (option === 'incr') options.incr = true;
                else break;
            }
            if (options.nx && options.xx) {
                return { error: replyError('ERR XX and NX options at the same time are not compatible') };
            }
            if ((options.gt || options.lt) && (options.nx || (options.gt && options.lt))) {
                return { error: replyError('ERR GT, LT, and/or NX options at the same time are not compatible') };
            }
            const remaining = length - index;
            if (remaining === 0 || remaining % 2 !== 0) return { error: replyError('ERR syntax error') };
            if (options.incr && remaining !== 2) {
                return { error: replyError('ERR INCR option supports a single increment-element pair') };
            }
            return forward([args[1]], [args[1]]);
        }

        case 'zincrby':
            if (length !== 4) return { error: wrongArity(name) };
            return forward([args[1]], [args[1]]);

        case 'zcard':
            if (length !== 2) return { error: wrongArity(name) };
            return forward([args[1]]);

        case 'zscore':
            if (length !== 3) return { error: wrongArity(name) };
            return forward([args[1]]);

        case 'zcount':
        case 'zlexcount':
        case 'zremrangebyrank':
        case 'zremrangebyscore':
        case 'zremrangebylex':
            if (length !== 4) return { error: wrongArity(name) };
            return forward([args[1]]);

        case 'zrank':
        case 'zrevrank':
            if (length !== 3 && length !== 4) return { error: wrongArity(name) };
            if (length === 4 && text(args[3]).toLowerCase() !== 'withscore') {
                return { error: replyError('ERR syntax error') };
            }
            return forward([args[1]]);

        case 'zrem':
        case 'zmscore':
            if (length < 3) return { error: wrongArity(name) };
            return forward([args[1]]);

        case 'zrange': {
            if (length < 4) return { error: wrongArity(name) };
            const checked = checkZSetRangeOptions(args, 4, 'allowed', 'rank');
            if (checked.error !== undefined) return checked;
            return forward([args[1]]);
        }

        case 'zrevrange':
            if (length !== 4 && length !== 5) return { error: wrongArity(name) };
            if (length === 5 && text(args[4]).toLowerCase() !== 'withscores') {
                return { error: replyError('ERR syntax error') };
            }
            return forward([args[1]]);

        case 'zrangebyscore':
        case 'zrevrangebyscore': {
            if (length < 4) return { error: wrongArity(name) };
            const checked = checkZSetRangeOptions(args, 4, 'allowed', 'score');
            if (checked.error !== undefined) return checked;
            return forward([args[1]]);
        }

        case 'zrangebylex':
        case 'zrevrangebylex': {
            if (length < 4) return { error: wrongArity(name) };
            const checked = checkZSetRangeOptions(args, 4, 'lex-error', 'lex');
            if (checked.error !== undefined) return checked;
            return forward([args[1]]);
        }

        case 'zrangestore': {
            if (length < 5) return { error: wrongArity(name) };
            const checked = checkZSetRangeOptions(args, 5, 'none', 'rank');
            if (checked.error !== undefined) return checked;
            return forward([args[1], args[2]], [args[1]]);
        }

        case 'zpopmin':
        case 'zpopmax': {
            if (length !== 2 && length !== 3) return { error: wrongArity(name) };
            if (length === 3) {
                // 真机对非整数与负数使用同一条「必须为正」的提示。
                const count = parseInteger(args[2]);
                if (count === null || count < 0) {
                    return { error: replyError('ERR value is out of range, must be positive') };
                }
            }
            return forward([args[1]]);
        }

        case 'zrandmember':
            if (length < 2 || length > 4) return { error: wrongArity(name) };
            if (length >= 3 && parseInteger(args[2]) === null) return { error: integerError() };
            if (length === 4 && text(args[3]).toLowerCase() !== 'withscores') {
                return { error: replyError('ERR syntax error') };
            }
            return forward([args[1]]);

        case 'zscan': {
            if (length < 3) return { error: wrongArity(name) };
            if (parseScanCursor(args[2]) === null) return { error: replyError('ERR invalid cursor') };
            const options = parseScanOptions(args, 3);
            if (options.error !== undefined) return { error: options.error };
            return forward([args[1]]);
        }

        case 'zunionstore':
        case 'zinterstore': {
            if (length < 4) return { error: wrongArity(name) };
            const counted = checkZSetKeyCount(args[2], `ERR at least 1 input key is needed for '${name}' command`);
            if (counted.error !== undefined) return counted;
            if (length < 3 + counted.numkeys) return { error: replyError('ERR syntax error') };
            return forward([args[1], ...args.slice(3, 3 + counted.numkeys)], [args[1]]);
        }

        case 'zunion':
        case 'zinter': {
            if (length < 3) return { error: wrongArity(name) };
            const counted = checkZSetKeyCount(args[1], `ERR at least 1 input key is needed for '${name}' command`);
            if (counted.error !== undefined) return counted;
            if (length < 2 + counted.numkeys) return { error: replyError('ERR syntax error') };
            return forward(args.slice(2, 2 + counted.numkeys));
        }

        case 'zdiffstore': {
            if (length < 4) return { error: wrongArity(name) };
            const counted = checkZSetKeyCount(args[2], "ERR at least 1 input key is needed for 'zdiffstore' command");
            if (counted.error !== undefined) return counted;
            if (length < 3 + counted.numkeys) return { error: replyError('ERR syntax error') };
            return forward([args[1], ...args.slice(3, 3 + counted.numkeys)], [args[1]]);
        }

        case 'zdiff': {
            if (length < 3) return { error: wrongArity(name) };
            const counted = checkZSetKeyCount(args[1], "ERR at least 1 input key is needed for 'zdiff' command");
            if (counted.error !== undefined) return counted;
            if (length < 2 + counted.numkeys) return { error: replyError('ERR syntax error') };
            return forward(args.slice(2, 2 + counted.numkeys));
        }

        case 'zintercard': {
            if (length < 3) return { error: wrongArity(name) };
            const counted = checkZSetKeyCount(args[1], "ERR at least 1 input key is needed for 'zintercard' command");
            if (counted.error !== undefined) return counted;
            if (length < 2 + counted.numkeys) return { error: replyError('ERR syntax error') };
            const tail = length - (2 + counted.numkeys);
            if (tail !== 0) {
                if (tail !== 2 || text(args[2 + counted.numkeys]).toLowerCase() !== 'limit') {
                    return { error: replyError('ERR syntax error') };
                }
                // 真机对非整数与负数统一回复「不能为负」。
                const limit = parseInteger(args[3 + counted.numkeys]);
                if (limit === null || limit < 0) {
                    return { error: replyError("ERR LIMIT can't be negative") };
                }
            }
            return forward(args.slice(2, 2 + counted.numkeys));
        }

        case 'zmpop': {
            if (length < 4) return { error: wrongArity(name) };
            const counted = checkZSetKeyCount(args[1], 'ERR numkeys should be greater than 0');
            if (counted.error !== undefined) return counted;
            const counter = checkZSetMpopTail(args, 2 + counted.numkeys, length);
            if (counter.error !== undefined) return counter;
            return forward(args.slice(2, 2 + counted.numkeys));
        }

        case 'bzpopmin':
        case 'bzpopmax': {
            if (length < 3) return { error: wrongArity(name) };
            const timeout = parseBlockingTimeout(args[length - 1]);
            if (timeout.error !== undefined) return deferredFailure(replyError(timeout.error));
            const keys = args.slice(1, length - 1);
            return blockingPlan(
                session.db,
                keys,
                timeout.timeoutMs,
                forwardBlockingZSet(store, session, args, keys),
                nullArray(),
            );
        }

        case 'bzmpop': {
            if (length < 5) return { error: wrongArity(name) };
            const timeout = parseBlockingTimeout(args[1]);
            if (timeout.error !== undefined) return deferredFailure(replyError(timeout.error));
            const counted = checkZSetKeyCount(args[2], 'ERR numkeys should be greater than 0');
            if (counted.error !== undefined) return deferredFailure(counted.error);
            const counter = checkZSetMpopTail(args, 3 + counted.numkeys, length);
            if (counter.error !== undefined) return deferredFailure(counter.error);
            const keys = args.slice(3, 3 + counted.numkeys);
            return blockingPlan(
                session.db,
                keys,
                timeout.timeoutMs,
                forwardBlockingZSet(store, session, args, keys),
                nullArray(),
            );
        }

        default:
            return { error: unknownCommand(args) };
    }
}

/** Validates the `MIN|MAX [COUNT n]` tail shared by `ZMPOP` and `BZMPOP`. */
function checkZSetMpopTail(args: Buffer[], sideIndex: number, length: number): { error?: ReplySpec } {
    if (sideIndex >= length) return { error: replyError('ERR syntax error') };
    const side = text(args[sideIndex]).toLowerCase();
    if (side !== 'min' && side !== 'max') return { error: replyError('ERR syntax error') };
    if (sideIndex + 1 < length) {
        if (text(args[sideIndex + 1]).toLowerCase() !== 'count' || sideIndex + 3 !== length) {
            return { error: replyError('ERR syntax error') };
        }
        const count = parseInteger(args[sideIndex + 2]);
        if (count === null) return { error: integerError() };
        if (count <= 0) return { error: replyError('ERR count should be greater than 0') };
    }
    return {};
}
