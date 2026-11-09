//! Keyspace, string/key and HyperLogLog forwarding plans.

import { parseInteger } from '../native.js';
import type { Store } from '../native.js';
import { notifyPush } from './blocking-plan.js';
import { DATABASES, text, wrongArity } from './kinds.js';
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
