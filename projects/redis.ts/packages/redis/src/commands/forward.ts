//! Family forwarding: queue-time validation, then one upstream facade call.

import { parseInteger } from '../native.js';
import type { Store } from '../native.js';
import { array, bulk, error as replyError, integer, nullArray, nullReply } from '../reply.js';
import type { ReplySpec } from '../reply.js';
import { blockingPlan, deferredFailure, notifyPush, parseBlockingTimeout } from './blocking-plan.js';
import { encodeHash, readHash, rewriteKind } from './chunks.js';
import { DATABASES, SUFFIX, integerError, kindOf, text, unknownCommand, wrongArity, wrongType } from './kinds.js';
import { addLongDoubles, longDoubleText, parseLongDouble } from './long-double.js';
import type { LongDouble } from './long-double.js';
import { parseScanCursor, parseScanOptions, randomMember, sampleMembers } from './scan.js';
import type { CommandPlan, Session } from './session.js';

/**
 * Plans `PFADD` / `PFCOUNT` / `PFMERGE`.
 *
 * Arity stays here because a transaction rejects a malformed command while it is
 * queued. Element hashing, register updates, estimation and reply framing all run
 * upstream.
 */
export function planHyperLogLog(store: Store, session: Session, name: string, args: Buffer[]): CommandPlan {
    if (args.length < 2) return { error: wrongArity(name) };
    return { run: () => store.hyperloglogCommand(session.db, args) };
}

/** Queue-time arity of the keyspace family, as `[minimum, maximum]` arguments. */
const KEYSPACE_ARITY: Record<string, [number, number]> = {
    keys: [2, 2],
    scan: [2, Infinity],
    type: [2, 2],
    object: [2, Infinity],
};

/** Queue-time arity of the string/key family, as `[minimum, maximum]` arguments. */
const STRING_ARITY: Record<string, [number, number]> = {
    get: [2, 2],
    set: [3, Infinity],
    setnx: [3, 3],
    setex: [4, 4],
    psetex: [4, 4],
    getset: [3, 3],
    getdel: [2, 2],
    getex: [2, Infinity],
    mget: [2, Infinity],
    mset: [3, Infinity],
    del: [2, Infinity],
    exists: [2, Infinity],
    type: [2, 2],
    strlen: [2, 2],
    append: [3, 3],
    getrange: [4, 4],
    setrange: [4, 4],
    incr: [2, 2],
    decr: [2, 2],
    incrby: [3, 3],
    decrby: [3, 3],
    incrbyfloat: [3, 3],
    setbit: [4, 4],
    getbit: [3, 3],
    bitcount: [2, 5],
    bitpos: [3, 6],
    bitfield: [2, Infinity],
    bitfield_ro: [2, Infinity],
    ttl: [2, 2],
    pttl: [2, 2],
    expire: [3, Infinity],
    pexpire: [3, Infinity],
    expireat: [3, Infinity],
    pexpireat: [3, Infinity],
    expiretime: [2, 2],
    pexpiretime: [2, 2],
    persist: [2, 2],
    rename: [3, 3],
    renamenx: [3, 3],
    copy: [3, Infinity],
    randomkey: [1, 1],
    dbsize: [1, 1],
    flushdb: [1, 2],
    flushall: [1, 2],
};

/**
 * Plans one keyspace-family command.
 *
 * Only arity is checked here so a transaction rejects a malformed command while it
 * is queued. Pattern matching, cursor paging, type probing and object encoding all
 * run upstream behind one binding primitive.
 */
export function planKeyspace(store: Store, session: Session, name: string, args: Buffer[]): CommandPlan {
    const [minimum, maximum] = KEYSPACE_ARITY[name];
    if (args.length < minimum || args.length > maximum) return { error: wrongArity(name) };
    return { run: () => store.keyspaceCommand(session.db, session.protocol ?? 2, args) };
}

/**
 * Plans one string/key-family command.
 *
 * Arity and the two fixed-shape rules (`MSET` pairs, `BITCOUNT` ranges) stay here
 * because a transaction rejects a malformed command while it is queued. Option
 * parsing, type checks, storage and reply framing all run upstream.
 */
export function planString(store: Store, session: Session, name: string, args: Buffer[]): CommandPlan {
    const [minimum, maximum] = STRING_ARITY[name];
    const malformed = args.length < minimum
        || args.length > maximum
        || (name === 'mset' && args.length % 2 === 0)
        || (name === 'bitcount' && args.length === 3);
    if (malformed) return { error: wrongArity(name) };
    const written = stringWriteTarget(session, name, args);
    return {
        run: () => {
            const reply = store.stringCommand(session.db, session.protocol ?? 2, args);
            if (written !== null && reply.type !== 'error') notifyPush(session, written.db, written.key);
            return reply;
        },
    };
}

/**
 * 字符串族里会写入目的键的命令落点，其余命令返回 `null`。
 *
 * `RENAME` / `RENAMENX` 写目的键，`COPY` 默认写当前库、带 `DB` 选项时写声明的库。
 */
function stringWriteTarget(session: Session, name: string, args: Buffer[]): { db: number; key: Buffer } | null {
    if (name !== 'rename' && name !== 'renamenx' && name !== 'copy') return null;
    let db = session.db;
    if (name === 'copy') {
        for (let index = 3; index < args.length; index += 1) {
            if (text(args[index]).toLowerCase() !== 'db' || args[index + 1] === undefined) continue;
            const target = parseInteger(args[index + 1]);
            if (target !== null && target >= 0 && target < DATABASES) db = target;
        }
    }
    return { db, key: args[2] };
}

/**
 * Plans one set aggregate: intersection, union or difference, optionally stored.
 *
 * Arity stays here because a transaction rejects a malformed command while it is
 * queued. Set algebra, type checks and reply framing all run upstream.
 */
export function planSetAggregate(store: Store, session: Session, name: string, args: Buffer[]): CommandPlan {
    if (name === 'sintercard') return planSInterCard(store, session, args);
    const keeps = name.endsWith('store');
    if (keeps ? args.length < 3 : args.length < 2) {
        return { error: wrongArity(name) };
    }
    const destination = keeps ? args[1] : null;
    const keys = keeps ? args.slice(2) : args.slice(1);
    const guarded = destination === null ? keys : [destination, ...keys];
    return { run: forwardSet(store, session, args, guarded) };
}

/**
 * Forwards one set request to the upstream facade after rejecting a stream key.
 *
 * The upstream type probe knows the five kinds its facade implements and has no
 * stream kind, so a stream operand is rejected here until the stream family moves
 * upstream. Without this guard a set write would fork the key into two live
 * representations.
 */
function forwardSet(store: Store, session: Session, args: Buffer[], keys: Buffer[]): () => ReplySpec {
    return () => {
        for (const key of keys) {
            if (store.existsKind(session.db, SUFFIX.stream, key)) return wrongType();
        }
        return store.setCommand(session.db, session.protocol ?? 2, args);
    };
}

/** Runs one list request upstream, rejecting stream keys the facade has no kind for. */
function runListCommand(store: Store, session: Session, args: Buffer[], keys: Buffer[]): ReplySpec {
    for (const key of keys) {
        if (store.existsKind(session.db, SUFFIX.stream, key)) return wrongType();
    }
    return store.listCommand(session.db, session.protocol ?? 2, args);
}

/** Forwards a list command and wakes anyone blocked on the keys it wrote. */
function forwardList(store: Store, session: Session, args: Buffer[], keys: Buffer[], notifyKeys: Buffer[] = []): () => ReplySpec {
    return () => {
        const reply = runListCommand(store, session, args, keys);
        if (reply.type !== 'error') {
            for (const key of notifyKeys) notifyPush(session, session.db, key);
        }
        return reply;
    };
}

/** One non-blocking attempt for a blocking list command, mapping the empty reply to `null`. */
function forwardBlockingList(store: Store, session: Session, args: Buffer[], keys: Buffer[]): () => ReplySpec | null {
    return () => {
        const reply = runListCommand(store, session, args, keys);
        if (reply.type === 'null' || reply.type === 'null-array') return null;
        return reply;
    };
}

/** Forwards one zset request to the upstream facade after rejecting a stream key. */
function forwardZSet(store: Store, session: Session, args: Buffer[], keys: Buffer[], notifyKeys: Buffer[] = []): () => ReplySpec {
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
function forwardBlockingZSet(store: Store, session: Session, args: Buffer[], keys: Buffer[]): () => ReplySpec | null {
    return () => {
        const reply = forwardZSet(store, session, args, keys)();
        if (reply.type === 'null' || reply.type === 'null-array') return null;
        return reply;
    };
}

/** Plans `SINTERCARD`, whose keys are counted from a leading length and may carry `LIMIT`. */
function planSInterCard(store: Store, session: Session, args: Buffer[]): CommandPlan {
    if (args.length < 3) return { error: wrongArity('sintercard') };
    const count = parseInteger(args[1]);
    if (count === null || count <= 0) {
        return { error: replyError('ERR numkeys should be greater than 0') };
    }
    if (count > args.length - 2) {
        return { error: replyError("ERR Number of keys can't be greater than number of args") };
    }
    const index = 2 + count;
    if (index < args.length) {
        if (text(args[index]).toLowerCase() !== 'limit' || index + 2 !== args.length) {
            return { error: replyError('ERR syntax error') };
        }
        const limit = parseInteger(args[index + 1]);
        if (limit === null || limit < 0) return { error: replyError("ERR LIMIT can't be negative") };
    }
    return { run: forwardSet(store, session, args, args.slice(2, 2 + count)) };
}

/** Plans `SPOP`, whose optional count decides between the bulk and set reply forms. */
export function planSPop(store: Store, session: Session, args: Buffer[]): CommandPlan {
    if (args.length < 2 || args.length > 3) return { error: wrongArity('spop') };
    if (args.length === 3) {
        const count = parseInteger(args[2]);
        if (count === null) return { error: replyError('ERR value is not an integer or out of range') };
        if (count < 0) return { error: replyError('ERR value is out of range, must be positive') };
    }
    return { run: forwardSet(store, session, args, [args[1]]) };
}

/** Plans `SMISMEMBER`, which answers one integer per asked member. */
export function planSMisMember(store: Store, session: Session, args: Buffer[]): CommandPlan {
    if (args.length < 3) return { error: wrongArity('smismember') };
    return { run: forwardSet(store, session, args, [args[1]]) };
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

/**
 * 规划一条 `SORT` / `SORT_RO` 命令。
 *
 * 排队阶段只校验参数成形：选项是否带够取值、`LIMIT` 两个数是否为整数、
 * `SORT_RO` 是否误带 `STORE`。取值来源、`BY` / `GET` 展开、排序与 `STORE`
 * 写入一律由上游族入口执行，这里只把参数原样转发。
 */
export function planSort(store: Store, session: Session, name: string, args: Buffer[]): CommandPlan {
    const readonly = name === 'sort_ro';
    if (args.length < 2) return { error: wrongArity(name) };
    let stores = false;
    let storeKey: Buffer | null = null;
    let index = 2;
    while (index < args.length) {
        const option = text(args[index]).toLowerCase();
        if (option === 'by' || option === 'get') {
            if (args[index + 1] === undefined) return { error: replyError('ERR syntax error') };
            index += 2;
            continue;
        }
        if (option === 'limit') {
            if (args[index + 1] === undefined || args[index + 2] === undefined) {
                return { error: replyError('ERR syntax error') };
            }
            const offset = parseInteger(args[index + 1]);
            const count = parseInteger(args[index + 2]);
            if (offset === null || count === null) return { error: integerError() };
            index += 3;
            continue;
        }
        if (option === 'asc' || option === 'desc' || option === 'alpha') {
            index += 1;
            continue;
        }
        if (option === 'store') {
            if (args[index + 1] === undefined) return { error: replyError('ERR syntax error') };
            stores = true;
            storeKey = args[index + 1];
            index += 2;
            continue;
        }
        return { error: replyError('ERR syntax error') };
    }
    if (readonly && stores) return { error: replyError('ERR syntax error') };
    return { run: forwardZSet(store, session, args, [args[1]], storeKey === null ? [] : [storeKey]) };
}

/**
 * Plans one hash or list command.
 *
 * The hash and list kinds keep their fields and elements in one opaque value
 * each, so every mutation decodes the current body, edits it and writes it back
 * while carrying the deadline the key already holds.
 */
export function planCollection(store: Store, session: Session, name: string, args: Buffer[]): CommandPlan {
    const db = session.db;
    const key: Buffer | null = args.length > 1 ? args[1] : null;
    switch (name) {
        case 'hsetnx': {
            if (args.length !== 4) return { error: wrongArity('hsetnx') };
            const field = args[2];
            const value = args[3];
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind !== null && kind !== 'hash') return wrongType();
                    const fields: [Buffer, Buffer][] | null = kind === null ? [] : readHash(store, db, key);
                    if (fields === null) return replyError('ERR stored hash value is corrupt');
                    if (fields.some(([name]) => name.equals(field))) return integer(0);
                    fields.push([field, value]);
                    const body = encodeHash(fields);
                    if (body === null) return replyError('ERR hash value exceeds the storage limit');
                    rewriteKind(store, db, 'hash', key, body);
                    return integer(1);
                },
            };
        }

        case 'hincrbyfloat': {
            if (args.length !== 4) return { error: wrongArity('hincrbyfloat') };
            const increment = parseLongDouble(args[3]);
            if (increment === null) return { error: replyError('ERR value is not a valid float') };
            if (increment.inf !== undefined) return { error: replyError('ERR value is NaN or Infinity') };
            const field = args[2];
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind !== null && kind !== 'hash') return wrongType();
                    const fields: [Buffer, Buffer][] | null = kind === null ? [] : readHash(store, db, key);
                    if (fields === null) return replyError('ERR stored hash value is corrupt');
                    const position = fields.findIndex(([name]) => name.equals(field));
                    let current: LongDouble = { m: 0n, e: 0, negative: false };
                    if (position >= 0) {
                        const parsed = parseLongDouble(fields[position][1]);
                        if (parsed === null) return replyError('ERR hash value is not a float');
                        current = parsed;
                    }
                    const updated = addLongDoubles(current, increment);
                    if (updated.nan === true || updated.inf !== undefined) {
                        return replyError('ERR increment would produce NaN or Infinity');
                    }
                    const value = Buffer.from(longDoubleText(updated), 'utf8');
                    if (position >= 0) fields[position] = [field, value];
                    else fields.push([field, value]);
                    const body = encodeHash(fields);
                    if (body === null) return replyError('ERR hash value exceeds the storage limit');
                    rewriteKind(store, db, 'hash', key, body);
                    return bulk(value);
                },
            };
        }

        case 'hrandfield': {
            if (args.length < 2 || args.length > 4) return { error: wrongArity('hrandfield') };
            let count: number | null = null;
            let withValues = false;
            if (args.length >= 3) {
                count = parseInteger(args[2]);
                if (count === null) return { error: integerError() };
                if (args.length === 4) {
                    if (text(args[3]).toLowerCase() !== 'withvalues') return { error: replyError('ERR syntax error') };
                    withValues = true;
                }
            }
            return {
                run: () => {
                    const kind = kindOf(store, db, key);
                    if (kind !== null && kind !== 'hash') return wrongType();
                    const fields: [Buffer, Buffer][] | null = kind === null ? [] : readHash(store, db, key);
                    if (fields === null) return replyError('ERR stored hash value is corrupt');
                    if (count === null) {
                        if (fields.length === 0) return nullReply();
                        return bulk(randomMember(fields)[0]);
                    }
                    const items = [];
                    for (const [field, value] of sampleMembers(fields, count)) {
                        items.push(bulk(field));
                        if (withValues) items.push(bulk(value));
                    }
                    return array(items);
                },
            };
        }

        case 'hscan':
        case 'hset':
        case 'hget':
        case 'hgetall':
        case 'hdel':
        case 'hlen':
        case 'hincrby':
        case 'hkeys':
        case 'hvals':
        case 'hexists': {
            // Arity, cursor syntax and delta parsing stay here because they run
            // while a transaction queues the command, so `MULTI` still rejects
            // such a command instead of deferring the error to `EXEC`. Field
            // encoding, type checks and reply framing all run upstream.
            if (name === 'hset' && (args.length < 4 || (args.length - 2) % 2 !== 0)) {
                return { error: wrongArity('hset') };
            }
            if (name === 'hdel' && args.length < 3) {
                return { error: wrongArity('hdel') };
            }
            const fixed = { hget: 3, hgetall: 2, hlen: 2, hincrby: 4, hkeys: 2, hvals: 2, hexists: 3 }[name];
            if (fixed !== undefined && args.length !== fixed) {
                return { error: wrongArity(name) };
            }
            if (name === 'hincrby' && parseInteger(args[3]) === null) {
                return { error: integerError() };
            }
            if (name === 'hscan') {
                if (args.length < 3) {
                    return { error: wrongArity('hscan') };
                }
                if (parseScanCursor(args[2]) === null) {
                    return { error: replyError('ERR invalid cursor') };
                }
                const options = parseScanOptions(args, 3);
                if (options.error !== undefined) {
                    return { error: options.error };
                }
            }
            // The upstream type probe knows the five kinds its facade implements
            // and has no stream kind, so a stream key is rejected here until the
            // stream family moves upstream. Without this guard a hash write would
            // fork the key into two live representations.
            return {
                run: () => (key !== null && store.existsKind(db, SUFFIX.stream, key)
                    ? wrongType()
                    : store.hashCommand(db, session.protocol ?? 2, args)),
            };
        }

        case 'linsert': {
            if (args.length !== 5) return { error: wrongArity('linsert') };
            const where = text(args[2]).toLowerCase();
            if (where !== 'before' && where !== 'after') return { error: replyError('ERR syntax error') };
            return { run: forwardList(store, session, args, [key], [key]) };
        }

        case 'lmpop': {
            if (args.length < 4) return { error: wrongArity('lmpop') };
            const count = parseInteger(args[1]);
            if (count === null || count <= 0) {
                return { error: replyError('ERR numkeys should be greater than 0') };
            }
            const keys = args.slice(2, 2 + count);
            const sideIndex = 2 + count;
            if (sideIndex >= args.length) return { error: replyError('ERR syntax error') };
            const side = text(args[sideIndex]).toLowerCase();
            if (side !== 'left' && side !== 'right') return { error: replyError('ERR syntax error') };
            if (sideIndex + 1 < args.length) {
                if (text(args[sideIndex + 1]).toLowerCase() !== 'count' || sideIndex + 3 !== args.length) {
                    return { error: replyError('ERR syntax error') };
                }
                const requested = parseInteger(args[sideIndex + 2]);
                if (requested === null || requested <= 0) {
                    return { error: replyError('ERR count should be greater than 0') };
                }
            }
            return { run: forwardList(store, session, args, keys) };
        }

        case 'blpop':
        case 'brpop': {
            if (args.length < 3) return { error: wrongArity(name) };
            const timeout = parseBlockingTimeout(args[args.length - 1]);
            if (timeout.error !== undefined) return deferredFailure(replyError(timeout.error));
            const keys = args.slice(1, args.length - 1);
            return blockingPlan(db, keys, timeout.timeoutMs, forwardBlockingList(store, session, args, keys), nullArray());
        }

        case 'blmove':
        case 'brpoplpush': {
            let sourceSide = 'right';
            let destinationSide = 'left';
            let timeoutRaw = args[3];
            if (name === 'blmove') {
                if (args.length !== 6) return { error: wrongArity('blmove') };
                sourceSide = text(args[3]).toLowerCase();
                destinationSide = text(args[4]).toLowerCase();
                timeoutRaw = args[5];
            }
            else if (args.length !== 4) {
                return { error: wrongArity('brpoplpush') };
            }
            if ((sourceSide !== 'left' && sourceSide !== 'right') || (destinationSide !== 'left' && destinationSide !== 'right')) {
                return deferredFailure(replyError('ERR syntax error'));
            }
            const timeout = parseBlockingTimeout(timeoutRaw);
            if (timeout.error !== undefined) return deferredFailure(replyError(timeout.error));
            const source = args[1];
            const destination = args[2];
            return blockingPlan(
                db,
                [source],
                timeout.timeoutMs,
                forwardBlockingList(store, session, args, [source, destination]),
                nullArray(),
            );
        }

        case 'blmpop': {
            if (args.length < 5) return { error: wrongArity('blmpop') };
            const timeout = parseBlockingTimeout(args[1]);
            if (timeout.error !== undefined) return deferredFailure(replyError(timeout.error));
            const numkeys = parseInteger(args[2]);
            if (numkeys === null || numkeys <= 0) return deferredFailure(replyError('ERR numkeys should be greater than 0'));
            if (args.length < numkeys + 4) return deferredFailure(replyError('ERR syntax error'));
            const keys = args.slice(3, 3 + numkeys);
            const side = text(args[3 + numkeys]).toLowerCase();
            if (side !== 'left' && side !== 'right') return deferredFailure(replyError('ERR syntax error'));
            const tail = 4 + numkeys;
            if (args.length > tail) {
                if (text(args[tail]).toLowerCase() !== 'count' || tail + 2 !== args.length) {
                    return deferredFailure(replyError('ERR syntax error'));
                }
                const requested = parseInteger(args[tail + 1]);
                if (requested === null || requested <= 0) {
                    return deferredFailure(replyError('ERR count should be greater than 0'));
                }
            }
            return blockingPlan(db, keys, timeout.timeoutMs, forwardBlockingList(store, session, args, keys), nullArray());
        }

        case 'lpos': {
            if (args.length < 3) return { error: wrongArity('lpos') };
            return { run: forwardList(store, session, args, [key]) };
        }

        case 'lpush':
        case 'rpush': {
            if (args.length < 3) return { error: wrongArity(name) };
            return { run: forwardList(store, session, args, [key], [key]) };
        }

        case 'lrange': {
            if (args.length !== 4) return { error: wrongArity('lrange') };
            if (parseInteger(args[2]) === null || parseInteger(args[3]) === null) {
                return { error: integerError() };
            }
            return { run: forwardList(store, session, args, [key]) };
        }

        case 'lindex': {
            if (args.length !== 3) return { error: wrongArity('lindex') };
            if (parseInteger(args[2]) === null) return { error: integerError() };
            return { run: forwardList(store, session, args, [key]) };
        }

        case 'lset': {
            if (args.length !== 4) return { error: wrongArity('lset') };
            if (parseInteger(args[2]) === null) return { error: integerError() };
            return { run: forwardList(store, session, args, [key]) };
        }

        case 'ltrim': {
            if (args.length !== 4) return { error: wrongArity('ltrim') };
            if (parseInteger(args[2]) === null || parseInteger(args[3]) === null) {
                return { error: integerError() };
            }
            return { run: forwardList(store, session, args, [key]) };
        }

        case 'lrem': {
            if (args.length !== 4) return { error: wrongArity('lrem') };
            if (parseInteger(args[2]) === null) return { error: integerError() };
            return { run: forwardList(store, session, args, [key]) };
        }

        case 'lpop':
        case 'rpop': {
            if (args.length !== 2 && args.length !== 3) return { error: wrongArity(name) };
            if (args.length === 3) {
                const count = parseInteger(args[2]);
                if (count === null) return { error: integerError() };
                if (count <= 0) return { error: replyError('ERR value is out of range, must be positive') };
            }
            return { run: forwardList(store, session, args, [key]) };
        }

        case 'llen': {
            if (args.length !== 2) return { error: wrongArity('llen') };
            return { run: forwardList(store, session, args, [key]) };
        }

        case 'rpoplpush': {
            if (args.length !== 3) return { error: wrongArity('rpoplpush') };
            return { run: forwardList(store, session, args, [args[1], args[2]], [args[2]]) };
        }

        case 'lmove': {
            if (args.length !== 5) return { error: wrongArity('lmove') };
            const sourceSide = text(args[3]).toLowerCase();
            const destinationSide = text(args[4]).toLowerCase();
            if ((sourceSide !== 'left' && sourceSide !== 'right')
                || (destinationSide !== 'left' && destinationSide !== 'right')) {
                return { error: replyError('ERR syntax error') };
            }
            return { run: forwardList(store, session, args, [args[1], args[2]], [args[2]]) };
        }

        case 'sadd': {
            if (args.length < 3) return { error: wrongArity('sadd') };
            return { run: forwardSet(store, session, args, [key]) };
        }

        case 'srem': {
            if (args.length < 3) return { error: wrongArity('srem') };
            return { run: forwardSet(store, session, args, [key]) };
        }

        case 'smembers': {
            if (args.length !== 2) return { error: wrongArity('smembers') };
            return { run: forwardSet(store, session, args, [key]) };
        }

        case 'scard': {
            if (args.length !== 2) return { error: wrongArity('scard') };
            return { run: forwardSet(store, session, args, [key]) };
        }

        case 'sismember': {
            if (args.length !== 3) return { error: wrongArity('sismember') };
            return { run: forwardSet(store, session, args, [key]) };
        }

        case 'smove': {
            if (args.length !== 4) return { error: wrongArity('smove') };
            return { run: forwardSet(store, session, args, [args[1], args[2]]) };
        }

        case 'srandmember': {
            if (args.length !== 2 && args.length !== 3) return { error: wrongArity('srandmember') };
            if (args.length === 3 && parseInteger(args[2]) === null) return { error: integerError() };
            return { run: forwardSet(store, session, args, [key]) };
        }

        case 'sscan': {
            if (args.length < 3) return { error: wrongArity('sscan') };
            const cursor = parseScanCursor(args[2]);
            if (cursor === null) return { error: replyError('ERR invalid cursor') };
            const options = parseScanOptions(args, 3);
            if (options.error !== undefined) return { error: options.error };
            return { run: forwardSet(store, session, args, [key]) };
        }

        default:
            return { error: unknownCommand(args) };
    }
}