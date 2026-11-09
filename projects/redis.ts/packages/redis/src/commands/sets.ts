//! Set-family guards and aggregate plans forwarded to the upstream facade.

import { parseInteger } from '../native.js';
import type { Store } from '../native.js';
import { error as replyError } from '../reply.js';
import type { ReplySpec } from '../reply.js';
import { SUFFIX, text, wrongArity, wrongType } from './kinds.js';
import type { CommandPlan, Session } from './session.js';

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
export function forwardSet(store: Store, session: Session, args: Buffer[], keys: Buffer[]): () => ReplySpec {
    return () => {
        for (const key of keys) {
            if (store.existsKind(session.db, SUFFIX.stream, key)) return wrongType();
        }
        return store.setCommand(session.db, session.protocol ?? 2, args);
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
