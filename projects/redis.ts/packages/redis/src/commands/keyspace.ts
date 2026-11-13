//! Keyspace, string/key and HyperLogLog forwarding plans.

import { parseInteger } from '../native.js';
import type { Store, ValueKind } from '../native.js';
import { notifyPush } from './blocking-plan.js';
import { DATABASES, KINDS, SUFFIX, kindOf, text, wrongArity } from './kinds.js';
import { error as replyError, array, bulk, integer, simple } from '../reply.js';
import { globMatch } from './glob.js';
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
    move: [3, 3],
    swapdb: [3, 3],
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
    unlink: [2, Infinity],
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
 * run upstream behind one binding primitive. `MOVE` and `SWAPDB` run here because
 * the upstream facade has no cross-database entry.
 */
export function planKeyspace(store: Store, session: Session, name: string, args: Buffer[]): CommandPlan {
    const [minimum, maximum] = KEYSPACE_ARITY[name];
    if (args.length < minimum || args.length > maximum) return { error: wrongArity(name) };
    if (name === 'keys') return planKeys(store, session, args);
    if (name === 'move') return planMove(store, session, args);
    if (name === 'swapdb') return planSwapDb(store, args);
    return { run: () => store.keyspaceCommand(session.db, session.protocol ?? 2, args) };
}

/**
 * Plans `KEYS pattern`.
 *
 * The upstream facade keeps a narrow matcher, so `KEYS` runs here on the same
 * byte-exact glob the gateway uses for pattern subscriptions. The reply stays one
 * bulk string per live logical key, in the store's ascending byte order.
 */
function planKeys(store: Store, session: Session, args: Buffer[]): CommandPlan {
    const pattern = args[1];
    return {
        run: () => array(
            store.keys(session.db ?? 0)
                .filter(key => globMatch(pattern, key))
                .map(key => bulk(key)),
        ),
    };
}

/** One live kind namespace of a logical key, read for a cross-database move. */
interface KindRecord {
    kind: ValueKind;
    value: Buffer;
    deadline: number | null;
}

/** Reads every live kind namespace of `key` in `db`. */
function readKinds(store: Store, db: number, key: Buffer): KindRecord[] {
    const records: KindRecord[] = [];
    for (const kind of KINDS) {
        const suffix = SUFFIX[kind];
        const value = store.getKind(db, suffix, key);
        if (value === null) {
            continue;
        }
        records.push({ kind: suffix, value, deadline: store.deadlineKind(db, suffix, key) });
    }
    return records;
}

/** Writes every captured kind namespace of `key` into `db`. */
function writeKinds(store: Store, db: number, key: Buffer, records: KindRecord[]): void {
    for (const record of records) {
        store.setKind(db, record.kind, key, record.value, record.deadline);
    }
}

/** Removes every captured kind namespace of `key` from `db`. */
function dropKinds(store: Store, db: number, key: Buffer, records: KindRecord[]): void {
    for (const record of records) {
        store.deleteKind(db, record.kind, key);
    }
}

/** Parses one database index for `MOVE` / `SWAPDB`, answering the upstream range error. */
function databaseIndex(value: Buffer): number | null {
    const parsed = parseInteger(value);
    return parsed !== null && parsed >= 0 && parsed < DATABASES ? parsed : null;
}

/**
 * Plans `MOVE key db`.
 *
 * The key keeps its deadline and every kind namespace it holds. A missing source
 * or an occupied destination answers `0` without touching either side, and moving
 * into the current database is rejected before any read.
 */
function planMove(store: Store, session: Session, args: Buffer[]): CommandPlan {
    const target = databaseIndex(args[2]);
    if (target === null) return { error: replyError('ERR DB index is out of range') };
    const source = session.db ?? 0;
    if (target === source) return { error: replyError('ERR source and destination objects are the same') };
    const key = args[1];
    return {
        run: () => {
            if (kindOf(store, source, key) === null || kindOf(store, target, key) !== null) {
                return integer(0);
            }
            const records = readKinds(store, source, key);
            dropKinds(store, source, key, records);
            writeKinds(store, target, key, records);
            return integer(1);
        },
    };
}

/** Captures every live key of one database with all of its kind namespaces. */
function snapshotDb(store: Store, db: number): Map<string, { key: Buffer; records: KindRecord[] }> {
    const snapshot = new Map<string, { key: Buffer; records: KindRecord[] }>();
    for (const key of store.keys(db)) {
        snapshot.set(key.toString('hex'), { key, records: readKinds(store, db, key) });
    }
    return snapshot;
}

/** Re-creates a captured database in another index. */
function restoreDb(store: Store, db: number, snapshot: Map<string, { key: Buffer; records: KindRecord[] }>): void {
    for (const { key, records } of snapshot.values()) {
        writeKinds(store, db, key, records);
    }
}

/** Empties one database from a captured snapshot. */
function eraseDb(store: Store, db: number, snapshot: Map<string, { key: Buffer; records: KindRecord[] }>): void {
    for (const { key, records } of snapshot.values()) {
        dropKinds(store, db, key, records);
    }
}

/**
 * Plans `SWAPDB index1 index2`.
 *
 * Both databases are captured before either side is erased, so the swap is
 * symmetric even when it touches every key. The server's command batch keeps the
 * whole swap in one shard write.
 */
function planSwapDb(store: Store, args: Buffer[]): CommandPlan {
    const left = databaseIndex(args[1]);
    const right = databaseIndex(args[2]);
    if (left === null || right === null) {
        return { error: replyError('ERR DB index is out of range') };
    }
    return {
        run: () => {
            if (left === right) {
                return simple('OK');
            }
            const fromLeft = snapshotDb(store, left);
            const fromRight = snapshotDb(store, right);
            eraseDb(store, left, fromLeft);
            eraseDb(store, right, fromRight);
            restoreDb(store, right, fromLeft);
            restoreDb(store, left, fromRight);
            return simple('OK');
        },
    };
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
    // `UNLINK` shares the `DEL` semantics and reply; the facade knows only `DEL`.
    const forwarded = name === 'unlink' ? [Buffer.from('DEL'), ...args.slice(1)] : args;
    return {
        run: () => {
            const reply = store.stringCommand(session.db, session.protocol ?? 2, forwarded);
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
