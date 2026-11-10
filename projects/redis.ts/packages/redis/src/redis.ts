//! The local engine owner: `new Redis(options?)`.
//!
//! The class owns one native `Store`, the lifecycle state machine and the
//! cascade over its listeners and logical sessions. Every command call goes
//! through the existing `execute` dispatcher, which composes the native
//! primitives; this module adds no command semantics, no RESP codec and no
//! storage of its own.

import { BlockingHub } from './blocking.js';
import { execute } from './commands.js';
import type { ExecuteResult } from './commands/execute.js';
import { DATABASES } from './commands/kinds.js';
import type { Session } from './commands/session.js';
import { configurationError, errorFromReply, fromNative, invalidState, RedisError } from './errors.js';
import { Store } from './native.js';
import { bulkBytes } from './reply.js';
import type { ReplySpec } from './reply.js';
import { startServer } from './server.js';
import type { ServerHandle } from './server.js';
import type {
    LocalState,
    RedisCommands,
    RedisKey,
    RedisListenOptions,
    RedisOptions,
    RedisSessionOptions,
    RedisValue,
    TcpEndpoint,
} from './options.js';

/** A reply specification as it crosses the binding, including the RESP3-only shapes. */
export type WireSpec = ReplySpec | { type: 'double'; value: string } | { type: 'set'; value: WireSpec[] };

/** Converts one reply specification into the author-facing value. */
export function replyToValue(spec: WireSpec): unknown {
    switch (spec.type) {
        case 'simple':
            return spec.value;
        case 'error':
            throw errorFromReply(spec.value);
        case 'int':
            return BigInt(spec.value);
        case 'double':
            return Number(spec.value);
        case 'null':
        case 'null-array':
            return null;
        case 'bulk': {
            const bytes = bulkBytes(spec);
            return bytes === null ? null : bytes.toString('utf8');
        }
        case 'array':
        case 'push':
        case 'set':
            return (spec.value as WireSpec[]).map(replyToValue);
        case 'map':
            return (spec.value as [WireSpec, WireSpec][]).map(([key, value]) => [replyToValue(key), replyToValue(value)]);
        default:
            throw new RedisError(`unknown reply type \`${(spec as { type: string }).type}\``, {
                code: 'protocol',
                phase: 'execute',
                execution: 'replied',
                retry: 'never',
            });
    }
}

/** Turns one author value into the bytes a command argument carries. */
export function toBuffer(value: RedisValue | number | bigint): Buffer {
    if (typeof value === 'string') {
        return Buffer.from(value, 'utf8');
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
        return Buffer.from(String(value));
    }
    return Buffer.from(value);
}

/** Turns one command line into request arguments. */
export function toBuffers(args: (RedisValue | number | bigint)[]): Buffer[] {
    return args.map(toBuffer);
}

/**
 * The typed command surface shared by the local and remote classes.
 *
 * Subclasses provide one `dispatchCommand`; the typed methods only assemble
 * argument lists and cast the generic reply to the documented value shape.
 */
export abstract class CommandHost implements RedisCommands {
    protected abstract dispatchCommand(args: (RedisValue | number | bigint)[]): Promise<unknown>;

    call(command: string, ...args: (RedisValue | number | bigint)[]): Promise<unknown> {
        return this.dispatchCommand([command, ...args]);
    }

    set(key: RedisKey, value: RedisValue): Promise<string | null> {
        return this.dispatchCommand(['SET', key, value]) as Promise<string | null>;
    }

    get(key: RedisKey): Promise<string | null> {
        return this.dispatchCommand(['GET', key]) as Promise<string | null>;
    }

    append(key: RedisKey, value: RedisValue): Promise<bigint> {
        return this.dispatchCommand(['APPEND', key, value]) as Promise<bigint>;
    }

    strlen(key: RedisKey): Promise<bigint> {
        return this.dispatchCommand(['STRLEN', key]) as Promise<bigint>;
    }

    incr(key: RedisKey): Promise<bigint> {
        return this.dispatchCommand(['INCR', key]) as Promise<bigint>;
    }

    decr(key: RedisKey): Promise<bigint> {
        return this.dispatchCommand(['DECR', key]) as Promise<bigint>;
    }

    incrby(key: RedisKey, delta: number | bigint): Promise<bigint> {
        return this.dispatchCommand(['INCRBY', key, String(delta)]) as Promise<bigint>;
    }

    decrby(key: RedisKey, delta: number | bigint): Promise<bigint> {
        return this.dispatchCommand(['DECRBY', key, String(delta)]) as Promise<bigint>;
    }

    del(...keys: RedisKey[]): Promise<bigint> {
        return this.dispatchCommand(['DEL', ...keys]) as Promise<bigint>;
    }

    exists(...keys: RedisKey[]): Promise<bigint> {
        return this.dispatchCommand(['EXISTS', ...keys]) as Promise<bigint>;
    }

    ttl(key: RedisKey): Promise<bigint> {
        return this.dispatchCommand(['TTL', key]) as Promise<bigint>;
    }

    pttl(key: RedisKey): Promise<bigint> {
        return this.dispatchCommand(['PTTL', key]) as Promise<bigint>;
    }

    expire(key: RedisKey, seconds: number | bigint): Promise<bigint> {
        return this.dispatchCommand(['EXPIRE', key, String(seconds)]) as Promise<bigint>;
    }

    pexpire(key: RedisKey, milliseconds: number | bigint): Promise<bigint> {
        return this.dispatchCommand(['PEXPIRE', key, String(milliseconds)]) as Promise<bigint>;
    }

    persist(key: RedisKey): Promise<bigint> {
        return this.dispatchCommand(['PERSIST', key]) as Promise<bigint>;
    }

    hset(key: RedisKey, field: RedisValue, ...more: RedisValue[]): Promise<bigint> {
        return this.dispatchCommand(['HSET', key, field, ...more]) as Promise<bigint>;
    }

    hget(key: RedisKey, field: RedisValue): Promise<string | null> {
        return this.dispatchCommand(['HGET', key, field]) as Promise<string | null>;
    }

    hgetall(key: RedisKey): Promise<unknown[]> {
        return this.dispatchCommand(['HGETALL', key]) as Promise<unknown[]>;
    }

    hdel(key: RedisKey, ...fields: RedisValue[]): Promise<bigint> {
        return this.dispatchCommand(['HDEL', key, ...fields]) as Promise<bigint>;
    }

    hlen(key: RedisKey): Promise<bigint> {
        return this.dispatchCommand(['HLEN', key]) as Promise<bigint>;
    }

    hexists(key: RedisKey, field: RedisValue): Promise<bigint> {
        return this.dispatchCommand(['HEXISTS', key, field]) as Promise<bigint>;
    }

    lpush(key: RedisKey, ...members: RedisValue[]): Promise<bigint> {
        return this.dispatchCommand(['LPUSH', key, ...members]) as Promise<bigint>;
    }

    rpush(key: RedisKey, ...members: RedisValue[]): Promise<bigint> {
        return this.dispatchCommand(['RPUSH', key, ...members]) as Promise<bigint>;
    }

    lrange(key: RedisKey, start: number, stop: number): Promise<unknown[]> {
        return this.dispatchCommand(['LRANGE', key, String(start), String(stop)]) as Promise<unknown[]>;
    }

    llen(key: RedisKey): Promise<bigint> {
        return this.dispatchCommand(['LLEN', key]) as Promise<bigint>;
    }

    lindex(key: RedisKey, index: number): Promise<string | null> {
        return this.dispatchCommand(['LINDEX', key, String(index)]) as Promise<string | null>;
    }

    lpop(key: RedisKey): Promise<string | null> {
        return this.dispatchCommand(['LPOP', key]) as Promise<string | null>;
    }

    rpop(key: RedisKey): Promise<string | null> {
        return this.dispatchCommand(['RPOP', key]) as Promise<string | null>;
    }

    sadd(key: RedisKey, ...members: RedisValue[]): Promise<bigint> {
        return this.dispatchCommand(['SADD', key, ...members]) as Promise<bigint>;
    }

    srem(key: RedisKey, ...members: RedisValue[]): Promise<bigint> {
        return this.dispatchCommand(['SREM', key, ...members]) as Promise<bigint>;
    }

    smembers(key: RedisKey): Promise<unknown[]> {
        return this.dispatchCommand(['SMEMBERS', key]) as Promise<unknown[]>;
    }

    scard(key: RedisKey): Promise<bigint> {
        return this.dispatchCommand(['SCARD', key]) as Promise<bigint>;
    }

    sismember(key: RedisKey, member: RedisValue): Promise<bigint> {
        return this.dispatchCommand(['SISMEMBER', key, member]) as Promise<bigint>;
    }

    zadd(key: RedisKey, score: number | bigint, member: RedisValue, ...more: (RedisValue | number | bigint)[]): Promise<bigint> {
        return this.dispatchCommand(['ZADD', key, String(score), member, ...more]) as Promise<bigint>;
    }

    zrem(key: RedisKey, ...members: RedisValue[]): Promise<bigint> {
        return this.dispatchCommand(['ZREM', key, ...members]) as Promise<bigint>;
    }

    zscore(key: RedisKey, member: RedisValue): Promise<number | null> {
        return this.dispatchCommand(['ZSCORE', key, member]) as Promise<number | null>;
    }

    zcard(key: RedisKey): Promise<bigint> {
        return this.dispatchCommand(['ZCARD', key]) as Promise<bigint>;
    }

    zrange(key: RedisKey, start: number, stop: number): Promise<unknown[]> {
        return this.dispatchCommand(['ZRANGE', key, String(start), String(stop)]) as Promise<unknown[]>;
    }
}

/** Settles one dispatcher outcome into an author-facing value. */
function settleExecution(result: ExecuteResult, hub: BlockingHub): unknown {
    if (result.block !== undefined) {
        const block = result.block;
        return new Promise(resolve => {
            hub.wait({ ...block, deliver: reply => resolve(replyToValue(reply)) });
        });
    }
    if (result.frames !== undefined) {
        const frames = result.frames;
        return frames.length === 1 ? replyToValue(frames[0]) : frames.map(frame => replyToValue(frame));
    }
    if (result.reply === undefined) {
        return null;
    }
    const reply = result.reply as WireSpec;
    if (reply !== null && typeof reply === 'object' && 'reply' in reply) {
        return replyToValue((reply as { reply: WireSpec }).reply);
    }
    return replyToValue(reply);
}

/** One application listener opened through `Redis#listen`, owned by the engine. */
export class RedisListener {
    readonly #handle: ServerHandle;
    readonly #detach: () => void;
    #closed = false;

    constructor(handle: ServerHandle, detach: () => void) {
        this.#handle = handle;
        this.#detach = detach;
    }

    /** The address the listener actually accepted on. */
    get endpoint(): TcpEndpoint {
        return { host: this.#handle.host, port: this.#handle.port };
    }

    get closed(): boolean {
        return this.#closed;
    }

    /** Stops accepting and drains the open connections; the engine keeps running. */
    async close(): Promise<void> {
        if (this.#closed) {
            return;
        }
        this.#closed = true;
        this.#detach();
        await this.#handle.close();
    }
}

/** Runs one command line against the engine through the shared dispatcher. */
type EngineRunner = (session: Session, args: (RedisValue | number | bigint)[]) => Promise<unknown>;

/** One logical session of the local engine, opened through `Redis#client`. */
export class RedisSession extends CommandHost {
    readonly #session: Session;
    readonly #run: EngineRunner;
    readonly #detach: () => void;
    #closed = false;

    constructor(session: Session, run: EngineRunner, detach: () => void) {
        super();
        this.#session = session;
        this.#run = run;
        this.#detach = detach;
    }

    get state(): 'open' | 'closed' {
        return this.#closed ? 'closed' : 'open';
    }

    /** The database index this session selects by default. */
    get database(): number {
        return this.#session.db ?? 0;
    }

    /** Closes the session; a session already closed by its engine closes cleanly. */
    async close(): Promise<void> {
        if (this.#closed) {
            return;
        }
        this.#closed = true;
        this.#detach();
    }

    /** @internal Marks the session closed when the owning engine cascades. */
    cascadeClose(): void {
        if (!this.#closed) {
            this.#closed = true;
            this.#detach();
        }
    }

    protected async dispatchCommand(args: (RedisValue | number | bigint)[]): Promise<unknown> {
        if (this.#closed) {
            throw invalidState('command', 'closed', 'execute');
        }
        return this.#run(this.#session, args);
    }
}

/**
 * The local engine owner.
 *
 * The constructor only validates and stores the options; `open` creates the
 * native `Store`; commands run through the shared dispatcher; `close` cascades
 * over every listener and session the engine still owns.
 */
export class Redis extends CommandHost {
    readonly #directory?: string;
    readonly #hub = new BlockingHub();
    readonly #listeners = new Set<RedisListener>();
    readonly #sessions = new Set<RedisSession>();
    #state: LocalState = 'new';
    #store?: Store;
    #session?: Session;
    #opening?: Promise<void>;
    #closing?: Promise<void>;

    constructor(options: RedisOptions = {}) {
        super();
        if (options === null || typeof options !== 'object') {
            throw configurationError('`options` must be an object');
        }
        const storage = options.storage;
        if (storage !== undefined) {
            if (storage === null || typeof storage !== 'object' || typeof storage.directory !== 'string' || storage.directory.length === 0) {
                throw configurationError('`storage.directory` must be a non-empty string');
            }
            this.#directory = storage.directory;
        }
    }

    get state(): LocalState {
        return this.#state;
    }

    /** Opens the engine; concurrent calls converge on the same operation. */
    async open(): Promise<void> {
        if (this.#state === 'open') {
            return;
        }
        if (this.#state === 'opening') {
            return this.#opening;
        }
        if (this.#state !== 'new') {
            throw invalidState('open', this.#state, 'open');
        }
        if (this.#directory === undefined) {
            throw new RedisError('the native store only serves directory-backed storage: pass `storage.directory`', {
                code: 'storage-directory-required',
                phase: 'configuration',
                execution: 'not-sent',
                retry: 'never',
            });
        }
        this.#state = 'opening';
        const directory = this.#directory;
        this.#opening = (async () => {
            try {
                this.#store = new Store(directory);
                this.#session = { db: 0, protocol: 3, queued: null, name: '', hub: this.#hub };
                this.#state = 'open';
            }
            catch (error) {
                this.#state = 'failed';
                throw fromNative(error, 'open', 'not-sent');
            }
        })();
        return this.#opening;
    }

    /**
     * Closes the engine and cascades over its listeners and sessions.
     *
     * A repeated close succeeds; a closed engine never reopens.
     */
    async close(): Promise<void> {
        if (this.#state === 'closed') {
            return;
        }
        if (this.#state === 'closing') {
            return this.#closing;
        }
        if (this.#state === 'new' || this.#state === 'failed') {
            this.#state = 'closed';
            return;
        }
        this.#state = 'closing';
        this.#closing = (async () => {
            const failures: unknown[] = [];
            for (const listener of [...this.#listeners]) {
                try {
                    await listener.close();
                }
                catch (error) {
                    failures.push(error);
                }
            }
            for (const session of [...this.#sessions]) {
                session.cascadeClose();
            }
            try {
                this.#store?.flush();
            }
            catch (error) {
                failures.push(error);
            }
            this.#store = undefined;
            this.#session = undefined;
            this.#state = 'closed';
            if (failures.length > 0) {
                throw fromNative(failures[0], 'close', 'unknown');
            }
        })();
        return this.#closing;
    }

    /** The binary view of the same storage: reads return the exact stored bytes. */
    readonly bytes = {
        get: async (key: RedisKey): Promise<Uint8Array | null> => {
            this.#requireOpen('bytes.get');
            const value = this.#store!.getKind(this.#session!.db ?? 0, '', toBuffer(key));
            return value === null ? null : new Uint8Array(value);
        },
    };

    /** Opens one application listener backed by this engine. */
    async listen(options: RedisListenOptions = {}): Promise<RedisListener> {
        this.#requireOpen('listen');
        const endpoint = options.endpoint ?? { host: '127.0.0.1', port: 0 };
        if (typeof endpoint.host !== 'string' || !Number.isInteger(endpoint.port) || endpoint.port < 0 || endpoint.port > 65535) {
            throw configurationError('`endpoint` needs a host string and an integer port within 0..65535');
        }
        const handle = await startServer({ host: endpoint.host, port: endpoint.port, store: this.#store });
        const listener = new RedisListener(handle, () => {
            this.#listeners.delete(listener);
        });
        this.#listeners.add(listener);
        return listener;
    }

    /** Opens one logical session of this engine; no socket is involved. */
    async client(options: RedisSessionOptions = {}): Promise<RedisSession> {
        this.#requireOpen('client');
        const database = options.database ?? 0;
        if (!Number.isInteger(database) || database < 0 || database >= DATABASES) {
            throw configurationError(`\`database\` must be an integer within 0..${DATABASES - 1}`);
        }
        const session: Session = { db: database, protocol: 3, queued: null, name: '', hub: this.#hub };
        const runner: EngineRunner = (child, args) => this.#runOn(child, args);
        const handle = new RedisSession(session, runner, () => {
            this.#sessions.delete(handle);
        });
        this.#sessions.add(handle);
        return handle;
    }

    async [Symbol.asyncDispose](): Promise<void> {
        await this.close();
    }

    protected async dispatchCommand(args: (RedisValue | number | bigint)[]): Promise<unknown> {
        this.#requireOpen('command');
        return this.#runOn(this.#session!, args);
    }

    async #runOn(session: Session, args: (RedisValue | number | bigint)[]): Promise<unknown> {
        this.#requireOpen('command');
        let result: ExecuteResult;
        try {
            result = execute(this.#store!, session, toBuffers(args));
        }
        catch (error) {
            throw fromNative(error, 'execute', 'unknown');
        }
        return settleExecution(result, this.#hub);
    }

    #requireOpen(action: string): void {
        if (this.#state !== 'open' || this.#store === undefined || this.#session === undefined) {
            throw invalidState(action, this.#state, 'execute');
        }
    }
}
