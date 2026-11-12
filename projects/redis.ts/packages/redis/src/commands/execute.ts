//! The `execute` dispatcher, the plan switch and `HELLO` framing.

import { parseInteger } from '../native.js';
import type { Store } from '../native.js';
import { array, bulk, error as replyError, integer, map, nullArray, simple } from '../reply.js';
import type { ReplySpec } from '../reply.js';
import { sweepExpired } from './expiry.js';
import { planCollection, planHyperLogLog, planKeyspace, planSetAggregate, planSMisMember, planSort, planSPop, planString, planZSet } from './forward.js';
import { DATABASES, commandName, unknownCommand, wrongArity } from './kinds.js';
import { planIntrospection } from './introspection.js';
import { planPersistence } from './persistence.js';
import { planPubsub, pubsubSubcommand, pubsubSubcommandError, publish, SUBSCRIBER_COMMANDS, subscribed, subscriptionFrames } from './pubsub.js';
import { planStream, planXRead, planXGroup, planXAck, planXPending, planXClaim, planXAutoClaim, planXInfo } from './streams.js';
import type { BlockDescriptor, CommandPlan, RunOutcome, ServerOutcome, Session } from './session.js';

/** The frames one executed command owes the connection. */
export interface ExecuteResult {
    reply?: RunOutcome;
    close?: boolean;
    killed?: number[];
    frames?: ReplySpec[];
    block?: BlockDescriptor;
    /** Set by `SHUTDOWN`: the whole server, not just this connection, goes down. */
    shutdown?: boolean;
}

/** Commands the upstream refuses to queue; they never enter a transaction. */
const NO_MULTI_COMMANDS = new Set(['save', 'shutdown']);

function hello(protocol: number, id?: number): ReplySpec {
    return map([
        ['server', bulk('redis')],
        ['version', bulk('7.4.0')],
        ['proto', integer(protocol)],
        ['id', integer(id ?? 1)],
        ['mode', bulk('standalone')],
        ['role', bulk('master')],
        ['modules', array([])],
    ]);
}

/** Executes one command and returns the reply specification. */
export function execute(store: Store, session: Session, args: Buffer[]): ExecuteResult {
    if (args.length === 0) {
        // An empty multibulk request is a no-op on the real server: no reply,
        // and the connection stays open for the next command.
        return { reply: undefined };
    }
    const name = commandName(args);

    // RESP2 subscriber mode: only the pub/sub verbs, PING, QUIT and RESET may run.
    // RESP3 dropped the restriction and runs any command while subscribed.
    // Following Redis, an unknown `PUBSUB` subcommand is reported before the
    // restriction, and a known one is named `pubsub|<subcommand>`.
    if (session.protocol === 2 && subscribed(session) && !SUBSCRIBER_COMMANDS.has(name)) {
        const subcommand = name === 'pubsub' ? pubsubSubcommand(args) : null;
        if (name === 'pubsub') {
            const unknown = pubsubSubcommandError(args, subcommand);
            if (unknown !== null) return { reply: unknown };
        }
        const context = subcommand === null ? name : `pubsub|${subcommand}`;
        return {
            reply: replyError(
                `ERR Can't execute '${context}': only (P|S)SUBSCRIBE / (P|S)UNSUBSCRIBE / PING / QUIT / RESET are allowed in this context`,
            ),
        };
    }

    if (name === 'quit') {
        // The connection layer accepts QUIT with any extra arguments and always
        // answers OK before closing, so there is no arity check here.
        return { reply: simple('OK'), close: true };
    }
    if (name === 'hello') {
        return helloCommand(session, args);
    }
    if (name === 'reset') {
        if (args.length !== 1) {
            return { reply: wrongArity('reset') };
        }
        session.subscriptions?.channels.clear();
        session.subscriptions?.patterns.clear();
        session.queued = null;
        clearWatches(store, session);
        session.protocol = 2;
        session.db = 0;
        return { reply: simple('RESET') };
    }
    if (name === 'watch') {
        if (args.length < 2) {
            return { reply: wrongArity('watch') };
        }
        // `WATCH` is the one command upstream refuses to queue, so it never
        // enters a transaction and the existing watch list stays untouched.
        if (session.queued) {
            return { reply: replyError('ERR WATCH inside MULTI is not allowed') };
        }
        const db = session.db ?? 0;
        const watched = session.watched ?? (session.watched = []);
        for (const key of args.slice(1)) {
            if (watched.some(entry => entry.db === db && entry.key.equals(key))) {
                continue;
            }
            watched.push({ db, key: Buffer.from(key), version: store.watchKey(db, key) });
        }
        return { reply: simple('OK') };
    }
    if (name === 'multi') {
        if (args.length !== 1) {
            return { reply: wrongArity('multi') };
        }
        if (session.queued) {
            return { reply: replyError('ERR MULTI calls can not be nested') };
        }
        session.queued = [];
        session.multiError = false;
        return { reply: simple('OK') };
    }
    if (name === 'exec') {
        if (!session.queued) {
            return { reply: replyError('ERR EXEC without MULTI') };
        }
        const queued = session.queued;
        const dirty = session.multiError === true;
        session.queued = null;
        session.multiError = false;
        if (dirty) {
            clearWatches(store, session);
            return { reply: replyError('EXECABORT Transaction discarded because of previous errors.') };
        }
        // Expired keys count as modified, so sweep them before comparing the
        // watch versions. Without watches the sweep is skipped entirely.
        if (session.watched !== undefined && session.watched.length > 0) {
            sweepExpired(store);
        }
        const modified = watchedModified(store, session);
        clearWatches(store, session);
        if (modified) {
            return { reply: nullArray() };
        }
        return { reply: array(queued.map(run => run()) as ReplySpec[]) };
    }
    if (name === 'discard') {
        if (!session.queued) {
            return { reply: replyError('ERR DISCARD without MULTI') };
        }
        session.queued = null;
        session.multiError = false;
        clearWatches(store, session);
        return { reply: simple('OK') };
    }

    // Upstream rejects the `NO_MULTI` commands while they are being queued, so
    // the transaction is poisoned before the command could ever run.
    if (session.queued && NO_MULTI_COMMANDS.has(name)) {
        session.multiError = true;
        return { reply: replyError(`ERR Command ${name.toUpperCase()} can not be used in MULTI`) };
    }

    const planned = plan(store, session, name, args);
    if (planned.error) {
        // A command rejected while queued poisons the transaction: EXEC answers
        // EXECABORT and drops every command queued so far.
        if (session.queued) session.multiError = true;
        return { reply: planned.error };
    }
    if (planned.frames !== undefined) {
        return { frames: planned.frames() };
    }
    if (session.queued) {
        session.queued.push(planned.run);
        return { reply: simple('QUEUED') };
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
    const outcome = planned.run() as RunOutcome & Partial<ServerOutcome> & { shutdown?: boolean };
    if (outcome !== null && typeof outcome === 'object' && outcome.close !== undefined) {
        return { reply: outcome.reply, close: outcome.close, killed: outcome.killed, shutdown: outcome.shutdown };
    }
    return { reply: outcome };
}

function helloCommand(session: Session, args: Buffer[]): ExecuteResult {
    if (args.length > 2) {
        return { reply: replyError('ERR syntax error') };
    }
    const protocol = args.length === 2 ? parseInteger(args[1]) : session.protocol;
    if (protocol !== 2 && protocol !== 3) {
        return { reply: replyError('NOPROTO unsupported protocol version') };
    }
    session.protocol = protocol;
    return { reply: hello(protocol, session.id) };
}

/** Whether any key pinned by `WATCH` was modified since it was pinned. */
function watchedModified(store: Store, session: Session): boolean {
    return (session.watched ?? []).some(entry => store.watchVersion(entry.db, entry.key) !== entry.version);
}

/** Releases every native watch held by one connection. */
export function clearWatches(store: Store, session: Session): void {
    for (const entry of session.watched ?? []) {
        store.unwatchKey(entry.db, entry.key);
    }
    session.watched = [];
}

function plan(store: Store, session: Session, name: string, args: Buffer[]): CommandPlan {
    switch (name) {
        case 'unwatch':
            if (args.length !== 1) return { error: wrongArity('unwatch') };
            return {
                run: () => {
                    clearWatches(store, session);
                    return simple('OK');
                },
            };

        case 'ping':
            if (args.length > 2) return { error: wrongArity('ping') };
            return {
                run: () => {
                    if (args.length === 2) return bulk(args[1]);
                    // A RESP2 subscriber gets the two-element `pong` array instead
                    // of the simple string. RESP3 keeps the ordinary reply.
                    if (session.protocol === 2 && subscribed(session)) {
                        return array([bulk('pong'), bulk('')]);
                    }
                    return simple('PONG');
                },
            };

        case 'subscribe':
            return args.length < 2 ? { error: wrongArity('subscribe') } : { frames: () => subscriptionFrames(session, args, false) };

        case 'unsubscribe':
            return { frames: () => subscriptionFrames(session, args, false, true) };

        case 'psubscribe':
            return args.length < 2 ? { error: wrongArity('psubscribe') } : { frames: () => subscriptionFrames(session, args, true) };

        case 'punsubscribe':
            return { frames: () => subscriptionFrames(session, args, true, true) };

        case 'publish':
            if (args.length !== 3) return { error: wrongArity('publish') };
            return { run: () => integer(publish(session, args[1], args[2])) };

        case 'pubsub':
            return planPubsub(session, args);

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

        case 'client':
        case 'command':
        case 'info':
        case 'config':
        case 'acl':
            return { run: () => store.serverCommand(session.id ?? 0, session.db, session.protocol ?? 2, args) };

        case 'save':
        case 'bgsave':
        case 'lastsave':
        case 'bgrewriteaof':
        case 'shutdown':
            return planPersistence(store, session, name, args);

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

        case 'wait':
        case 'latency':
        case 'slowlog':
        case 'memory':
            return planIntrospection(store, session, name, args);

        default:
            return { error: unknownCommand(args) };
    }
}
