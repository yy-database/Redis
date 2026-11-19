//! The `execute` dispatcher and the host-owned plan switch.
//!
//! The command state machines (`AUTH`, `HELLO`, `QUIT`, `RESET`, `WATCH`, `MULTI`
//! / `EXEC`, `DISCARD`, `UNWATCH`, persistence, `WAIT`, `LATENCY`, `CLIENT`,
//! `COMMAND`, `INFO`, `ACL` and `CONFIG`) live in the upstream embedded gateway.
//! This dispatcher runs the request through that gateway, mirrors the effects it
//! reports onto the session, and keeps only the host-owned families in `plan`.

import { parseInteger } from '../native.js';
import type { Store } from '../native.js';
import { decodeReply } from '../native.js';
import { array, bulk, error as replyError, integer, simple } from '../reply.js';
import type { ReplySpec } from '../reply.js';
import { sweepExpired } from './expiry.js';
import { applyConfigEffects } from './config.js';
import { planCollection, planHyperLogLog, planKeyspace, planSetAggregate, planSMisMember, planSort, planSPop, planString, planZSet } from './forward.js';
import { DATABASES, commandName, unknownCommand, wrongArity } from './kinds.js';
import { planIntrospection } from './introspection.js';
import { isSubscribed, planPubsub, publish, subscriptionFrames } from './pubsub.js';
import { planStream, planXRead, planXReadGroup, planXGroup, planXAck, planXPending, planXClaim, planXAutoClaim, planXInfo } from './streams.js';
import type { BlockDescriptor, CommandPlan, RunOutcome, Session } from './session.js';

/** The frames one executed command owes the connection. */
export interface ExecuteResult {
    reply?: RunOutcome;
    /** Upstream reply bytes written as-is, bypassing the reply specification. */
    frame?: Buffer;
    close?: boolean;
    killed?: number[];
    frames?: ReplySpec[];
    block?: BlockDescriptor;
    /** Set by `SHUTDOWN`: the whole server, not just this connection, goes down. */
    shutdown?: boolean;
}

/**
 * Executes one command and returns the reply specification.
 *
 * `writeFrames` is set by the socket loop, which writes raw bytes: a gateway
 * command then answers with the frame the upstream already built, and a
 * forwarding family command keeps its framed fast path. Every other caller
 * (transactions, the acceptance harness) keeps the specification form.
 * `replaying` marks a command released by `EXEC`, so the gateway answers
 * replay-only commands such as `WAIT` immediately instead of parking.
 */
export function execute(store: Store, session: Session, args: Buffer[], writeFrames = false, replaying = false): ExecuteResult {
    if (args.length === 0) {
        // An empty multibulk request is a no-op on the real server: no reply,
        // and the connection stays open for the next command.
        return { reply: undefined };
    }
    const name = commandName(args);

    // The gateway owns the subscriber-mode admission gate, the `CONFIG` option
    // table and its validation, keyed by the host connection id.
    const face = session.id ?? 0;
    const outcome = store.serverExecute(face, session.db ?? 0, session.protocol ?? 2, args, replaying);

    if (outcome.handled) {
        if (outcome.protocol !== null && outcome.protocol !== undefined) {
            session.protocol = outcome.protocol;
        }
        if (outcome.name !== null && outcome.name !== undefined) {
            session.name = outcome.name.toString('utf8');
        }
        if (outcome.reset) {
            store.pubsubDetach(face);
            session.db = 0;
        }
        if (outcome.wait !== null && outcome.wait !== undefined) {
            // The gateway parked `WAIT`: the connection suspends and answers the
            // integer `0` the binding encodes once the timeout elapses.
            const timeoutReply = specOf(store.serverWaitComplete(session.protocol ?? 2));
            if (session.hub === undefined) {
                return { reply: timeoutReply };
            }
            return { block: { db: 0, keys: [], timeoutMs: outcome.wait, attempt: () => null, timeoutReply } };
        }
        if (outcome.replay.length > 0) {
            // `EXEC` released its queue through the gateway: replay every entry in
            // order and assemble the nested array from the individual replies.
            const specs = outcome.replay.map((entry) => execute(store, session, entry, false, true).reply ?? null);
            return { reply: array(specs as ReplySpec[]) };
        }
        if (outcome.shutdown) {
            return { reply: undefined, close: true, shutdown: true };
        }
        if (outcome.config.length > 0) {
            applyConfigEffects(store, session, outcome.config);
        }
        if (writeFrames) {
            return { frame: outcome.frame, close: outcome.close, killed: outcome.killed };
        }
        return { reply: outcome.frame.length === 0 ? undefined : specOf(outcome.frame), close: outcome.close, killed: outcome.killed };
    }

    if (outcome.inMulti) {
        // The gateway validated the command family but does not execute it, so the
        // host plans it and forwards it into the upstream queue, which keeps the
        // ordering, the poison flag and the `EXEC` release. A command the host
        // rejects now poisons the transaction, exactly as upstream validation does.
        const planned = plan(store, session, name, args);
        if (planned.error !== undefined) {
            store.serverPoison(face);
            return { reply: planned.error };
        }
        if (planned.frames !== undefined) {
            return { frames: planned.frames() };
        }
        const queued = store.serverQueue(face, session.protocol ?? 2, args);
        return writeFrames ? { frame: queued } : { reply: specOf(queued) };
    }

    // Host-owned families outside a transaction.
    const planned = plan(store, session, name, args);
    if (planned.error !== undefined) {
        return { reply: planned.error };
    }
    if (planned.frames !== undefined) {
        return { frames: planned.frames() };
    }
    // The facade already framed this reply for the connection protocol, so hand
    // the bytes to the socket loop instead of decoding and re-encoding them.
    if (writeFrames && planned.run?.frame !== undefined) {
        const framed = planned.run.frame();
        return { frame: framed.frame, close: framed.close, killed: framed.killed };
    }
    if (planned.block !== undefined) {
        // A blocking command tries once before parking. Without a hub (the
        // conformance harness drives `execute` directly) it keeps the shape of
        // the timeout reply but never waits.
        const immediate = planned.block.attempt();
        if (immediate !== null) {
            return { reply: immediate };
        }
        if (session.hub === undefined) {
            return { reply: planned.block.timeoutReply };
        }
        return { block: planned.block };
    }
    return { reply: planned.run() };
}

/** Decodes one upstream reply frame into the specification the host re-encodes. */
function specOf(frame: Buffer): ReplySpec {
    return JSON.parse(decodeReply(frame).spec) as ReplySpec;
}

function plan(store: Store, session: Session, name: string, args: Buffer[]): CommandPlan {
    switch (name) {
        case 'ping':
            if (args.length > 2) return { error: wrongArity('ping') };
            return {
                run: () => {
                    if (args.length === 2) return bulk(args[1]);
                    // A RESP2 subscriber gets the two-element `pong` array instead
                    // of the simple string. RESP3 keeps the ordinary reply.
                    if (session.protocol === 2 && isSubscribed(store, session)) {
                        return array([bulk('pong'), bulk('')]);
                    }
                    return simple('PONG');
                },
            };

        case 'subscribe':
            return args.length < 2 ? { error: wrongArity('subscribe') } : { frames: () => subscriptionFrames(store, session, args, false) };

        case 'unsubscribe':
            return { frames: () => subscriptionFrames(store, session, args, false, true) };

        case 'psubscribe':
            return args.length < 2 ? { error: wrongArity('psubscribe') } : { frames: () => subscriptionFrames(store, session, args, true) };

        case 'punsubscribe':
            return { frames: () => subscriptionFrames(store, session, args, true, true) };

        case 'publish':
            if (args.length !== 3) return { error: wrongArity('publish') };
            return { run: () => integer(publish(session, args[1], args[2])) };

        case 'pubsub':
            return planPubsub(store, session, args);

        case 'echo':
            if (args.length !== 2) return { error: wrongArity('echo') };
            return { run: () => bulk(args[1]) };

        case 'select': {
            if (args.length !== 2) return { error: wrongArity('select') };
            const index = parseInteger(args[1]);
            if (index === null || index < 0 || index >= DATABASES) {
                return { error: replyError('ERR DB index is out of range') };
            }
            return { run: () => { session.db = index; return simple('OK'); } };
        }

        case 'flushdb':
        case 'flushall': {
            if (args.length > 2) return { error: wrongArity(name) };
            return {
                run: () => {
                    // Account for keys whose deadline elapsed since the previous
                    // sweep before the facade empties the databases.
                    sweepExpired(store, session.stats);
                    return store.stringCommand(session.db, session.protocol ?? 2, args);
                },
            };
        }

        case 'keys':
        case 'scan':
        case 'type':
        case 'object':
        case 'move':
        case 'swapdb':
            return planKeyspace(store, session, name, args);

        case 'get':
        case 'set':
        case 'setnx':
        case 'setex':
        case 'psetex':
        case 'getset':
        case 'getdel':
        case 'getex':
        case 'mget':
        case 'mset':
        case 'del':
        case 'unlink':
        case 'exists':
        case 'strlen':
        case 'append':
        case 'getrange':
        case 'setrange':
        case 'incr':
        case 'decr':
        case 'incrby':
        case 'decrby':
        case 'incrbyfloat':
        case 'setbit':
        case 'getbit':
        case 'bitcount':
        case 'bitpos':
        case 'bitfield':
        case 'bitfield_ro':
        case 'ttl':
        case 'pttl':
        case 'expire':
        case 'pexpire':
        case 'expireat':
        case 'pexpireat':
        case 'expiretime':
        case 'pexpiretime':
        case 'persist':
        case 'rename':
        case 'renamenx':
        case 'copy':
        case 'randomkey':
        case 'dbsize':
            return planString(store, session, name, args);

        case 'hset':
        case 'hget':
        case 'hgetall':
        case 'hdel':
        case 'hlen':
        case 'hincrby':
        case 'hsetnx':
        case 'hkeys':
        case 'hvals':
        case 'hexists':
        case 'hincrbyfloat':
        case 'hrandfield':
        case 'hscan':
        case 'lpos':
        case 'lpush':
        case 'rpush':
        case 'lrange':
        case 'lindex':
        case 'lpop':
        case 'rpop':
        case 'llen':
        case 'linsert':
        case 'lset':
        case 'ltrim':
        case 'lrem':
        case 'rpoplpush':
        case 'lmove':
        case 'lmpop':
        case 'blpop':
        case 'brpop':
        case 'blmove':
        case 'brpoplpush':
        case 'blmpop':
        case 'sadd':
        case 'srem':
        case 'smembers':
        case 'scard':
        case 'sismember':
        case 'smove':
        case 'srandmember':
        case 'sscan':
            return planCollection(store, session, name, args);

        case 'xadd':
        case 'xlen':
        case 'xrange':
        case 'xrevrange':
        case 'xdel':
        case 'xtrim':
            return planStream(store, session, name, args);

        case 'xread':
            return planXRead(store, session, args);

        case 'xreadgroup':
            return planXReadGroup(store, session, args);

        case 'xgroup':
            return planXGroup(store, session, args);

        case 'xack':
            return planXAck(store, session, args);

        case 'xpending':
            return planXPending(store, session, args);

        case 'xclaim':
            return planXClaim(store, session, args);

        case 'xautoclaim':
            return planXAutoClaim(store, session, args);

        case 'xinfo':
            return planXInfo(store, session, args);

        case 'pfadd':
        case 'pfcount':
        case 'pfmerge':
            return planHyperLogLog(store, session, name, args);

        case 'zadd':
        case 'zincrby':
        case 'zcard':
        case 'zcount':
        case 'zlexcount':
        case 'zrange':
        case 'zrevrange':
        case 'zrangebyscore':
        case 'zrevrangebyscore':
        case 'zrangebylex':
        case 'zrevrangebylex':
        case 'zrangestore':
        case 'zrank':
        case 'zrevrank':
        case 'zrem':
        case 'zremrangebyrank':
        case 'zremrangebyscore':
        case 'zremrangebylex':
        case 'zscore':
        case 'zmscore':
        case 'zpopmin':
        case 'zpopmax':
        case 'zrandmember':
        case 'zscan':
        case 'zunionstore':
        case 'zinterstore':
        case 'zdiffstore':
        case 'zunion':
        case 'zinter':
        case 'zdiff':
        case 'zintercard':
        case 'zmpop':
        case 'bzpopmin':
        case 'bzpopmax':
        case 'bzmpop':
            return planZSet(store, session, name, args);

        case 'sort':
        case 'sort_ro':
            return planSort(store, session, name, args);

        case 'sinter':
        case 'sintercard':
        case 'sunion':
        case 'sdiff':
        case 'sinterstore':
        case 'sunionstore':
        case 'sdiffstore':
            return planSetAggregate(store, session, name, args);

        case 'spop':
            return planSPop(store, session, args);

        case 'smismember':
            return planSMisMember(store, session, args);

        case 'slowlog':
        case 'memory':
            return planIntrospection(store, session, name, args);

        default:
            return { error: unknownCommand(args) };
    }
}
