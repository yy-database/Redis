//! Host-side hash plans plus the list and set command plans.

import { parseInteger } from '../native.js';
import type { Store } from '../native.js';
import { bulk, error as replyError, nullArray } from '../reply.js';
import { blockingPlan, deferredFailure, parseBlockingTimeout } from './blocking-plan.js';
import { encodeHash, readHash, rewriteKind } from './chunks.js';
import { SUFFIX, integerError, kindOf, text, unknownCommand, wrongArity, wrongType } from './kinds.js';
import { addLongDoubles, longDoubleText, parseLongDouble } from './long-double.js';
import type { LongDouble } from './long-double.js';
import { forwardBlockingList, forwardList } from './lists.js';
import { parseScanCursor, parseScanOptions } from './scan.js';
import type { CommandPlan, Session } from './session.js';
import { forwardSet } from './sets.js';

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

        case 'hsetnx':
        case 'hrandfield':
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
            const fixed = { hsetnx: 4, hget: 3, hgetall: 2, hlen: 2, hincrby: 4, hkeys: 2, hvals: 2, hexists: 3 }[name];
            if (fixed !== undefined && args.length !== fixed) {
                return { error: wrongArity(name) };
            }
            if (name === 'hincrby' && parseInteger(args[3]) === null) {
                return { error: integerError() };
            }
            if (name === 'hrandfield') {
                if (args.length < 2 || args.length > 4) return { error: wrongArity('hrandfield') };
                if (args.length >= 3 && parseInteger(args[2]) === null) return { error: integerError() };
                if (args.length === 4 && text(args[3]).toLowerCase() !== 'withvalues') {
                    return { error: replyError('ERR syntax error') };
                }
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
