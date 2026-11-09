//! Command semantics composed on top of the native primitives.
//!
//! Every command is planned first and executed second, so a transaction can
//! reject a malformed command while queuing and replay only valid commands.

import { parseInteger } from './native.js';
import { array, bulk, error as replyError, integer, map, simple } from './reply.js';
import { planCollection, planHyperLogLog, planKeyspace, planSetAggregate, planSMisMember, planSort, planSPop, planString, planZSet } from './commands/forward.js';
import { DATABASES, commandName, unknownCommand, wrongArity } from './commands/kinds.js';
import { planStream, planXRead, planXGroup, planXAck, planXPending, planXClaim, planXAutoClaim, planXInfo } from './commands/streams.js';
import { planPubsub, pubsubSubcommand, pubsubSubcommandError, publish, SUBSCRIBER_COMMANDS, subscribed, subscriptionFrames } from './commands/pubsub.js';

export { globMatch } from './commands/glob.js';
export { PubSubHub } from './commands/pubsub.js';

function hello(protocol, id) {
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
export function execute(store, session, args) {
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
        session.protocol = 2;
        session.db = 0;
        return { reply: simple('RESET') };
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
            return { reply: replyError('EXECABORT Transaction discarded because of previous errors.') };
        }
        return { reply: array(queued.map(run => run())) };
    }
    if (name === 'discard') {
        if (!session.queued) {
            return { reply: replyError('ERR DISCARD without MULTI') };
        }
        session.queued = null;
        session.multiError = false;
        return { reply: simple('OK') };
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
    const outcome = planned.run();
    if (outcome !== null && typeof outcome === 'object' && outcome.close !== undefined) {
        return { reply: outcome.reply, close: outcome.close, killed: outcome.killed };
    }
    return { reply: outcome };
}

function helloCommand(session, args) {
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

function plan(store, session, name, args) {
    switch (name) {
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
        case 'flushdb':
        case 'flushall':
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

        default:
            return { error: unknownCommand(args) };
    }
}
