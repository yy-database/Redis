//! Command semantics composed on top of the native primitives.
//!
//! Every command is planned first and executed second, so a transaction can
//! reject a malformed command while queuing and replay only valid commands.

import { parseInteger } from './native.js';
import { array, bulk, error as replyError, integer, map, nullReply, simple } from './reply.js';

const DATABASES = 16;

const integerError = () => replyError('ERR value is not an integer or out of range');
const wrongArity = name => replyError(`ERR wrong number of arguments for '${name}' command`);
const plainArity = () => replyError('ERR wrong number of arguments');

function commandName(args) {
    return args[0].toString('utf8').toLowerCase();
}

function text(buffer) {
    return buffer.toString('utf8');
}

function secondsDeadline(seconds) {
    const milliseconds = seconds * 1000;
    return Number.isSafeInteger(milliseconds) ? milliseconds : null;
}

function millisecondsDeadline(milliseconds) {
    return Number.isSafeInteger(milliseconds) ? milliseconds : null;
}

/**
 * Builds a deadline factory for one expiry option.
 *
 * `ex` and `px` are relative to the moment the command runs, `exat` and `pxat`
 * are absolute unix timestamps. `null` means the amount overflows.
 */
function deadlineFactory(option, amount) {
    const relative = option === 'ex' || option === 'px';
    const seconds = option === 'ex' || option === 'exat';
    const scaled = seconds ? secondsDeadline(amount) : millisecondsDeadline(amount);
    if (scaled === null) {
        return null;
    }
    return () => (relative ? Date.now() + scaled : scaled);
}

function hello(protocol) {
    return map([
        ['server', bulk('redis')],
        ['version', bulk('7.4.0')],
        ['proto', integer(protocol)],
        ['id', integer(1)],
        ['mode', bulk('standalone')],
        ['role', bulk('master')],
        ['modules', array([])],
    ]);
}

/** Executes one command and returns the reply specification. */
export function execute(store, session, args) {
    if (args.length === 0) {
        return { reply: replyError('ERR Protocol error or request limit exceeded'), close: true };
    }
    const name = commandName(args);

    if (name === 'quit') {
        return args.length === 1 ? { reply: simple('OK'), close: true } : { reply: wrongArity('quit') };
    }
    if (name === 'hello') {
        return helloCommand(session, args);
    }
    if (name === 'multi') {
        if (args.length !== 1) {
            return { reply: wrongArity('multi') };
        }
        if (session.queued) {
            return { reply: replyError('ERR MULTI calls can not be nested') };
        }
        session.queued = [];
        return { reply: simple('OK') };
    }
    if (name === 'exec') {
        if (!session.queued) {
            return { reply: replyError('ERR EXEC without MULTI') };
        }
        const queued = session.queued;
        session.queued = null;
        return { reply: array(queued.map(run => run())) };
    }
    if (name === 'discard') {
        if (!session.queued) {
            return { reply: replyError('ERR DISCARD without MULTI') };
        }
        session.queued = null;
        return { reply: simple('OK') };
    }

    const planned = plan(store, session, name, args);
    if (planned.error) {
        return { reply: planned.error };
    }
    if (session.queued) {
        session.queued.push(planned.run);
        return { reply: simple('QUEUED') };
    }
    return { reply: planned.run() };
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
    return { reply: hello(protocol) };
}

function plan(store, session, name, args) {
    switch (name) {
        case 'ping':
            if (args.length > 2) return { error: wrongArity('ping') };
            return { run: () => (args.length === 2 ? bulk(args[1]) : simple('PONG')) };

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
            return planClient(session, args);

        case 'get':
            if (args.length !== 2) return { error: wrongArity('get') };
            return { run: () => bulk(store.get(session.db, args[1])) };

        case 'set':
            return planSet(store, session, args);

        case 'setnx': {
            if (args.length !== 3) return { error: wrongArity('setnx') };
            return {
                run: () => {
                    if (store.exists(session.db, args[1])) return integer(0);
                    store.set(session.db, args[1], args[2], null);
                    return integer(1);
                },
            };
        }

        case 'setex': {
            if (args.length !== 4) return { error: wrongArity('setex') };
            const seconds = parseInteger(args[2]);
            if (seconds === null) return { error: integerError() };
            const offset = seconds > 0 ? secondsDeadline(seconds) : null;
            if (offset === null) return { error: replyError("ERR invalid expire time in 'setex' command") };
            return { run: () => { store.set(session.db, args[1], args[3], Date.now() + offset); return simple('OK'); } };
        }

        case 'getset': {
            if (args.length !== 3) return { error: plainArity() };
            return {
                run: () => {
                    const previous = store.get(session.db, args[1]);
                    store.set(session.db, args[1], args[2], null);
                    return bulk(previous);
                },
            };
        }

        case 'getdel': {
            if (args.length !== 2) return { error: wrongArity('getdel') };
            return {
                run: () => {
                    const previous = store.get(session.db, args[1]);
                    if (previous !== null && previous !== undefined) store.delete(session.db, args[1]);
                    return bulk(previous);
                },
            };
        }

        case 'getex':
            return planGetEx(store, session, args);

        case 'mget': {
            if (args.length < 2) return { error: plainArity() };
            return { run: () => array(args.slice(1).map(key => bulk(store.get(session.db, key)))) };
        }

        case 'mset': {
            if (args.length < 3 || args.length % 2 === 0) return { error: wrongArity('mset') };
            return {
                run: () => {
                    for (let index = 1; index < args.length; index += 2) {
                        store.set(session.db, args[index], args[index + 1], null);
                    }
                    return simple('OK');
                },
            };
        }

        case 'del': {
            if (args.length < 2) return { error: wrongArity('del') };
            return {
                run: () => {
                    let removed = 0;
                    for (const key of args.slice(1)) {
                        if (store.delete(session.db, key)) removed += 1;
                    }
                    return integer(removed);
                },
            };
        }

        case 'exists': {
            if (args.length < 2) return { error: wrongArity('exists') };
            return {
                run: () => integer(args.slice(1).filter(key => store.exists(session.db, key)).length),
            };
        }

        case 'type': {
            if (args.length !== 2) return { error: wrongArity('type') };
            return { run: () => simple(store.exists(session.db, args[1]) ? 'string' : 'none') };
        }

        case 'strlen': {
            if (args.length !== 2) return { error: wrongArity('strlen') };
            return {
                run: () => {
                    const value = store.get(session.db, args[1]);
                    return integer(value === null || value === undefined ? 0 : value.length);
                },
            };
        }

        case 'append': {
            if (args.length !== 3) return { error: wrongArity('append') };
            return { run: () => integer(store.append(session.db, args[1], args[2])) };
        }

        case 'incr':
            if (args.length !== 2) return { error: plainArity() };
            return incremental(store, session, args[1], 1);

        case 'decr':
            if (args.length !== 2) return { error: plainArity() };
            return incremental(store, session, args[1], -1);

        case 'incrby':
        case 'decrby': {
            if (args.length !== 3) return { error: plainArity() };
            const delta = parseInteger(args[2]);
            if (delta === null) return { error: integerError() };
            return incremental(store, session, args[1], name === 'incrby' ? delta : -delta);
        }

        case 'ttl':
        case 'pttl': {
            if (args.length !== 2) return { error: wrongArity(name) };
            const milliseconds = name === 'pttl';
            return {
                run: () => {
                    if (!store.exists(session.db, args[1])) return integer(-2);
                    const deadline = store.deadline(session.db, args[1]);
                    if (deadline === null || deadline === undefined) return integer(-1);
                    const remaining = deadline - Date.now();
                    if (remaining <= 0) return integer(-2);
                    return integer(milliseconds ? remaining : Math.trunc((remaining + 500) / 1000));
                },
            };
        }

        case 'expire':
        case 'pexpire':
        case 'expireat':
        case 'pexpireat':
            return planExpire(store, session, name, args);

        case 'persist': {
            if (args.length !== 2) return { error: wrongArity('persist') };
            return {
                run: () => {
                    if (store.deadline(session.db, args[1]) === null) return integer(0);
                    store.expire(session.db, args[1], null);
                    return integer(1);
                },
            };
        }

        case 'rename':
        case 'renamenx':
            return planRename(store, session, name, args);

        case 'flushdb': {
            if (args.length !== 1) return { error: wrongArity('flushdb') };
            return { run: () => { store.flushDb(session.db); return simple('OK'); } };
        }

        case 'flushall': {
            if (args.length !== 1) return { error: wrongArity('flushall') };
            return {
                run: () => {
                    for (let index = 0; index < DATABASES; index += 1) store.flushDb(index);
                    return simple('OK');
                },
            };
        }

        case 'dbsize': {
            if (args.length !== 1) return { error: wrongArity('dbsize') };
            return { run: () => integer(store.size(session.db)) };
        }

        case 'keys': {
            if (args.length !== 2) return { error: wrongArity('keys') };
            const pattern = args[1];
            return {
                run: () => array(
                    store.keys(session.db)
                        .filter(key => globMatch(pattern, key))
                        .map(key => bulk(key)),
                ),
            };
        }

        case 'scan':
            return planScan(store, session, args);

        default:
            return { error: replyError('ERR unsupported command') };
    }
}

/** Matches `key` bytes against the Redis glob subset `*`, `?` and literals. */
export function globMatch(pattern, key) {
    let patternIndex = 0;
    let keyIndex = 0;
    let star = -1;
    let resume = 0;
    while (keyIndex < key.length) {
        if (patternIndex < pattern.length && (pattern[patternIndex] === 0x3f || pattern[patternIndex] === key[keyIndex])) {
            patternIndex += 1;
            keyIndex += 1;
            continue;
        }
        if (patternIndex < pattern.length && pattern[patternIndex] === 0x2a) {
            star = patternIndex;
            patternIndex += 1;
            resume = keyIndex;
            continue;
        }
        if (star >= 0) {
            patternIndex = star + 1;
            resume += 1;
            keyIndex = resume;
            continue;
        }
        return false;
    }
    while (patternIndex < pattern.length && pattern[patternIndex] === 0x2a) {
        patternIndex += 1;
    }
    return patternIndex === pattern.length;
}

function planScan(store, session, args) {
    if (args.length < 2) {
        return { error: wrongArity('scan') };
    }
    const cursor = parseInteger(args[1]);
    if (cursor === null || cursor < 0) {
        return { error: replyError('ERR invalid cursor') };
    }
    let pattern = null;
    let count = 10;
    for (let index = 2; index < args.length; index += 2) {
        const option = text(args[index]).toLowerCase();
        const raw = args[index + 1];
        if (raw === undefined) {
            return { error: replyError('ERR syntax error') };
        }
        if (option === 'match') {
            pattern = raw;
            continue;
        }
        if (option === 'count') {
            const amount = parseInteger(raw);
            if (amount === null || amount <= 0) {
                return { error: replyError('ERR syntax error') };
            }
            count = amount;
            continue;
        }
        return { error: replyError('ERR syntax error') };
    }
    const database = session.db;
    return {
        run: () => {
            const keys = store.keys(database).filter(key => pattern === null || globMatch(pattern, key));
            const start = Math.min(cursor, keys.length);
            const page = keys.slice(start, start + count);
            const next = start + page.length;
            const position = next >= keys.length ? '0' : String(next);
            return array([bulk(position), array(page.map(key => bulk(key)))]);
        },
    };
}

function planClient(session, args) {
    if (args.length < 2) {
        return { error: wrongArity('client') };
    }
    const subcommand = text(args[1]).toLowerCase();
    switch (subcommand) {
        case 'setinfo':
            if (args.length !== 4) return { error: wrongArity('client|setinfo') };
            return { run: () => simple('OK') };
        case 'setname':
            if (args.length !== 3) return { error: wrongArity('client|setname') };
            return { run: () => { session.name = text(args[2]); return simple('OK'); } };
        case 'getname':
            if (args.length !== 2) return { error: wrongArity('client|getname') };
            return { run: () => (session.name ? bulk(session.name) : nullReply()) };
        case 'id':
            if (args.length !== 2) return { error: wrongArity('client|id') };
            return { run: () => integer(1) };
        default:
            return { error: replyError('ERR unsupported CLIENT subcommand') };
    }
}

function planSet(store, session, args) {
    if (args.length < 3) {
        return { error: wrongArity('set') };
    }
    let ifAbsent = false;
    let ifPresent = false;
    let keepDeadline = false;
    let expiry = null;
    for (let index = 3; index < args.length; index += 1) {
        const option = text(args[index]).toLowerCase();
        if (option === 'nx') {
            ifAbsent = true;
            continue;
        }
        if (option === 'xx') {
            ifPresent = true;
            continue;
        }
        if (option === 'keepttl') {
            keepDeadline = true;
            continue;
        }
        const unit = option === 'ex' || option === 'px' || option === 'exat' || option === 'pxat' ? option : null;
        if (unit === null) {
            return { error: replyError('ERR unsupported SET options') };
        }
        if (expiry !== null || keepDeadline) {
            return { error: replyError('ERR syntax error') };
        }
        const raw = args[index + 1];
        if (raw === undefined) {
            return { error: replyError('ERR syntax error') };
        }
        index += 1;
        const amount = parseInteger(raw);
        if (amount === null) {
            return { error: integerError() };
        }
        if (amount <= 0) {
            return { error: replyError("ERR invalid expire time in 'set' command") };
        }
        expiry = deadlineFactory(unit, amount);
        if (expiry === null) {
            return { error: replyError("ERR invalid expire time in 'set' command") };
        }
    }
    if (ifAbsent && ifPresent) {
        return { error: replyError('ERR syntax error') };
    }
    const key = args[1];
    const value = args[2];
    return {
        run: () => {
            const exists = store.exists(session.db, key);
            if ((ifAbsent && exists) || (ifPresent && !exists)) {
                return nullReply();
            }
            const deadline = expiry !== null
                ? expiry()
                : keepDeadline && exists
                    ? store.deadline(session.db, key)
                    : null;
            store.set(session.db, key, value, deadline ?? null);
            return simple('OK');
        },
    };
}

function planGetEx(store, session, args) {
    if (args.length < 2) {
        return { error: wrongArity('getex') };
    }
    let deadline = null;
    let persist = false;
    let touched = false;
    if (args.length >= 3) {
        const option = text(args[2]).toLowerCase();
        if (option === 'persist') {
            if (args.length !== 3) return { error: replyError('ERR syntax error') };
            persist = true;
            touched = true;
        }
        else if (option === 'ex' || option === 'px' || option === 'exat' || option === 'pxat') {
            const raw = args[3];
            if (raw === undefined || args.length !== 4) return { error: replyError('ERR syntax error') };
            const amount = parseInteger(raw);
            if (amount === null) return { error: integerError() };
            if (amount <= 0) return { error: replyError("ERR invalid expire time in 'getex' command") };
            deadline = deadlineFactory(option, amount);
            if (deadline === null) return { error: replyError("ERR invalid expire time in 'getex' command") };
            touched = true;
        }
        else {
            return { error: replyError('ERR syntax error') };
        }
    }
    const key = args[1];
    return {
        run: () => {
            const value = store.get(session.db, key);
            if (value === null || value === undefined) {
                return nullReply();
            }
            if (persist) {
                store.expire(session.db, key, null);
            }
            else if (touched) {
                store.expire(session.db, key, deadline());
            }
            return bulk(value);
        },
    };
}

function planExpire(store, session, name, args) {
    if (args.length !== 3) {
        return { error: wrongArity(name) };
    }
    const amount = parseInteger(args[2]);
    if (amount === null) {
        return { error: integerError() };
    }
    const absolute = name === 'expireat' || name === 'pexpireat';
    const factory = deadlineFactory(absolute ? (name === 'expireat' ? 'exat' : 'pxat') : (name === 'expire' ? 'ex' : 'px'), amount);
    if (factory === null) {
        return { error: replyError(`ERR invalid expire time in '${name}' command`) };
    }
    const key = args[1];
    return {
        run: () => {
            if (!store.exists(session.db, key)) return integer(0);
            const deadline = factory();
            if (deadline <= 0 || (!absolute && amount <= 0)) {
                store.delete(session.db, key);
                return integer(1);
            }
            store.expire(session.db, key, deadline);
            return integer(1);
        },
    };
}

function planRename(store, session, name, args) {
    if (args.length !== 3) {
        return { error: wrongArity(name) };
    }
    const ifAbsent = name === 'renamenx';
    const source = args[1];
    const destination = args[2];
    return {
        run: () => {
            if (source.equals(destination)) {
                if (!store.exists(session.db, source)) return replyError('ERR no such key');
                return ifAbsent ? integer(0) : simple('OK');
            }
            const outcome = store.rename(session.db, source, destination, ifAbsent);
            if (outcome === 'missing') return replyError('ERR no such key');
            if (outcome === 'destination-present') return integer(0);
            return ifAbsent ? integer(1) : simple('OK');
        },
    };
}

function incremental(store, session, key, delta) {
    return {
        run: () => {
            const outcome = store.incrBy(session.db, key, delta);
            if (outcome.error) return replyError(`ERR ${outcome.error}`);
            return integer(outcome.value);
        },
    };
}
