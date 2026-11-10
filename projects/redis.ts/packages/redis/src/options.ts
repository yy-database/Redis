//! Options, shared value types and the author-facing command surface.
//!
//! `Redis` (local engine owner) and `RedisClient` (remote connection owner)
//! implement the same `RedisCommands` shape. The interface only describes call
//! shapes; every command is executed by the shared dispatcher or the wire, never
//! by a second implementation in this module.

import type { RedisError } from './errors.js';

/** A key as the author writes it: text or raw bytes. */
export type RedisKey = string | Uint8Array;

/** A value as the author writes it: text or raw bytes. */
export type RedisValue = string | Uint8Array;

/** Directory-backed storage for one local engine. */
export interface LocalStorage {
    directory: string;
}

/** Options for the local `Redis` constructor. */
export interface RedisOptions {
    storage?: LocalStorage;
}

/** A host and port pair. */
export interface TcpEndpoint {
    host: string;
    port: number;
}

/** TLS material for one client connection. Certificates are always verified. */
export interface RedisTlsOptions {
    ca?: readonly Uint8Array[];
    serverName?: string;
    identity?: { certificate: Uint8Array; privateKey: Uint8Array };
}

/** Credentials presented during the connect handshake. */
export interface RedisAuth {
    username?: string;
    password: string;
}

/** The address half of `RedisClientOptions`: a URL or a structured endpoint, never both. */
export type RedisAddress =
    | { url: string; endpoint?: never }
    | { url?: never; endpoint: TcpEndpoint };

/** Settings shared by every standalone client option set. */
export interface RedisClientSettings {
    auth?: RedisAuth;
    tls?: RedisTlsOptions;
    database?: number;
    name?: string;
    connectTimeoutMs?: number;
}

/**
 * Options for the remote `RedisClient` constructor.
 *
 * Only the standalone topology is served today; sentinel and cluster remain
 * outside this shape until the upstream primitives carry them.
 */
export type RedisClientOptions = RedisAddress & RedisClientSettings & { topology?: 'standalone' };

/** The lifecycle of the local engine object. */
export type LocalState = 'new' | 'opening' | 'open' | 'closing' | 'closed' | 'failed';

/** The lifecycle of the remote connection object. */
export type ClientState = 'new' | 'connecting' | 'ready' | 'closing' | 'closed' | 'failed';

/** One pipeline item: a value or the error the server answered for that item. */
export type CommandResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: RedisError };

/** The outcome of one `EXEC`: the queued results, or an aborted transaction. */
export type RedisMultiResult<T extends readonly unknown[]> =
    | { status: 'executed'; results: { [K in keyof T]: CommandResult<T[K]> } }
    | { status: 'aborted' };

/** Options for one logical session opened through `Redis#client`. */
export interface RedisSessionOptions {
    database?: number;
}

/** Options for one listener opened through `Redis#listen`. */
export interface RedisListenOptions {
    endpoint?: TcpEndpoint;
}

/**
 * The author-facing command surface shared by the local and remote classes.
 *
 * Integer replies are `bigint`, double scores are `number`, bulk replies are
 * text `string` and status replies stay text. Anything beyond this surface
 * goes through {@link RedisCommands#call}, which forwards the arguments to the
 * same executor without interpreting them here.
 */
export interface RedisCommands {
    call(command: string, ...args: (RedisValue | number | bigint)[]): Promise<unknown>;

    set(key: RedisKey, value: RedisValue): Promise<string | null>;
    get(key: RedisKey): Promise<string | null>;
    append(key: RedisKey, value: RedisValue): Promise<bigint>;
    strlen(key: RedisKey): Promise<bigint>;
    incr(key: RedisKey): Promise<bigint>;
    decr(key: RedisKey): Promise<bigint>;
    incrby(key: RedisKey, delta: number | bigint): Promise<bigint>;
    decrby(key: RedisKey, delta: number | bigint): Promise<bigint>;

    del(...keys: RedisKey[]): Promise<bigint>;
    exists(...keys: RedisKey[]): Promise<bigint>;
    ttl(key: RedisKey): Promise<bigint>;
    pttl(key: RedisKey): Promise<bigint>;
    expire(key: RedisKey, seconds: number | bigint): Promise<bigint>;
    pexpire(key: RedisKey, milliseconds: number | bigint): Promise<bigint>;
    persist(key: RedisKey): Promise<bigint>;

    hset(key: RedisKey, field: RedisValue, ...more: RedisValue[]): Promise<bigint>;
    hget(key: RedisKey, field: RedisValue): Promise<string | null>;
    hgetall(key: RedisKey): Promise<unknown[]>;
    hdel(key: RedisKey, ...fields: RedisValue[]): Promise<bigint>;
    hlen(key: RedisKey): Promise<bigint>;
    hexists(key: RedisKey, field: RedisValue): Promise<bigint>;

    lpush(key: RedisKey, ...members: RedisValue[]): Promise<bigint>;
    rpush(key: RedisKey, ...members: RedisValue[]): Promise<bigint>;
    lrange(key: RedisKey, start: number, stop: number): Promise<unknown[]>;
    llen(key: RedisKey): Promise<bigint>;
    lindex(key: RedisKey, index: number): Promise<string | null>;
    lpop(key: RedisKey): Promise<string | null>;
    rpop(key: RedisKey): Promise<string | null>;

    sadd(key: RedisKey, ...members: RedisValue[]): Promise<bigint>;
    srem(key: RedisKey, ...members: RedisValue[]): Promise<bigint>;
    smembers(key: RedisKey): Promise<unknown[]>;
    scard(key: RedisKey): Promise<bigint>;
    sismember(key: RedisKey, member: RedisValue): Promise<bigint>;

    zadd(key: RedisKey, score: number | bigint, member: RedisValue, ...more: (RedisValue | number | bigint)[]): Promise<bigint>;
    zrem(key: RedisKey, ...members: RedisValue[]): Promise<bigint>;
    zscore(key: RedisKey, member: RedisValue): Promise<number | null>;
    zcard(key: RedisKey): Promise<bigint>;
    zrange(key: RedisKey, start: number, stop: number): Promise<unknown[]>;
}
