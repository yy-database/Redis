//! The remote connection owner: `new RedisClient(options)`.
//!
//! The class owns exactly one socket. Framing goes through the native
//! `encodeCommand` / `decodeReply` primitives and the handshake composes the
//! same `HELLO` / `AUTH` / `SELECT` commands a server-side dispatcher answers;
//! no RESP codec, command semantics or reconnect algorithm lives here.

import { connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import type { Socket } from 'node:net';
import type { ConnectionOptions as NodeTlsConnectionOptions, TLSSocket } from 'node:tls';
import { CommandHost, replyToValue, toBuffers } from './redis.js';
import type { WireSpec } from './redis.js';
import { DATABASES } from './commands/kinds.js';
import { decodeReply, encodeCommand } from './native.js';
import { configurationError, errorFromReply, fromNative, invalidState, RedisError } from './errors.js';
import type {
    ClientState,
    CommandResult,
    RedisAuth,
    RedisClientOptions,
    RedisKey,
    RedisMultiResult,
    RedisTlsOptions,
    RedisValue,
    TcpEndpoint,
} from './options.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 6379;
const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;

/** One request awaiting its reply on the socket. */
interface Waiter {
    resolve(spec: WireSpec): void;
    reject(error: RedisError): void;
}

/** The resolved connection settings after constructor validation. */
interface ResolvedSettings {
    host: string;
    port: number;
    secure: boolean;
    auth?: RedisAuth;
    tls?: RedisTlsOptions;
    database: number;
    name?: string;
    connectTimeoutMs: number;
}

function validateEndpoint(endpoint: TcpEndpoint): void {
    if (endpoint === null || typeof endpoint !== 'object' || typeof endpoint.host !== 'string' || endpoint.host.length === 0) {
        throw configurationError('`endpoint.host` must be a non-empty string');
    }
    if (!Number.isInteger(endpoint.port) || endpoint.port < 0 || endpoint.port > 65535) {
        throw configurationError('`endpoint.port` must be an integer within 0..65535');
    }
}

/** Reads one `redis://` or `rediss://` URL into the resolved settings. */
function parseUrl(url: string, settings: RedisClientSettingsLike): ResolvedSettings {
    let parsed: URL;
    try {
        parsed = new URL(url);
    }
    catch (error) {
        throw configurationError('`url` must be a valid `redis://` or `rediss://` URL', error);
    }
    if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
        throw configurationError('`url` must use the `redis://` or `rediss://` scheme');
    }
    const secure = parsed.protocol === 'rediss:';
    if (settings.tls !== undefined && !secure) {
        throw configurationError('`tls` is only accepted together with a `rediss://` URL or an `endpoint`');
    }
    const host = parsed.hostname.length > 0 ? parsed.hostname : DEFAULT_HOST;
    const port = parsed.port.length > 0 ? Number.parseInt(parsed.port, 10) : DEFAULT_PORT;
    const path = parsed.pathname.replace(/^\//, '');
    const database = path.length > 0 ? Number.parseInt(path, 10) : undefined;
    if (database !== undefined && settings.database !== undefined) {
        throw configurationError('`database` is set both by the URL and by the options');
    }
    if (parsed.username.length > 0 && settings.auth !== undefined) {
        throw configurationError('credentials are set both by the URL and by the options');
    }
    let auth: RedisAuth | undefined = settings.auth;
    if (parsed.username.length > 0 || parsed.password.length > 0) {
        auth = { username: decodeURIComponent(parsed.username) || undefined, password: decodeURIComponent(parsed.password) };
    }
    return {
        host,
        port,
        secure,
        auth,
        tls: settings.tls,
        database: database ?? settings.database ?? 0,
        name: settings.name,
        connectTimeoutMs: settings.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    };
}

type RedisClientSettingsLike = Pick<RedisClientOptions, 'auth' | 'tls' | 'database' | 'name' | 'connectTimeoutMs'>;

function resolveOptions(options: RedisClientOptions): ResolvedSettings {
    if (options === null || typeof options !== 'object') {
        throw configurationError('`options` must be an object');
    }
    if (options.url !== undefined && options.endpoint !== undefined) {
        throw configurationError('`url` and `endpoint` are mutually exclusive');
    }
    if (options.topology !== undefined && options.topology !== 'standalone') {
        throw configurationError(`topology \`${String(options.topology)}\` is not served by the current primitives`);
    }
    const settings: RedisClientSettingsLike = options;
    let resolved: ResolvedSettings;
    if (options.url !== undefined) {
        if (typeof options.url !== 'string') {
            throw configurationError('`url` must be a string');
        }
        resolved = parseUrl(options.url, settings);
    }
    else if (options.endpoint !== undefined) {
        validateEndpoint(options.endpoint);
        if (settings.database !== undefined && (!Number.isInteger(settings.database) || settings.database < 0 || settings.database >= DATABASES)) {
            throw configurationError(`\`database\` must be an integer within 0..${DATABASES - 1}`);
        }
        resolved = {
            host: options.endpoint.host,
            port: options.endpoint.port,
            secure: settings.tls !== undefined,
            auth: settings.auth,
            tls: settings.tls,
            database: settings.database ?? 0,
            name: settings.name,
            connectTimeoutMs: settings.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
        };
    }
    else {
        if (settings.database !== undefined && (!Number.isInteger(settings.database) || settings.database < 0 || settings.database >= DATABASES)) {
            throw configurationError(`\`database\` must be an integer within 0..${DATABASES - 1}`);
        }
        resolved = {
            host: DEFAULT_HOST,
            port: DEFAULT_PORT,
            secure: settings.tls !== undefined,
            auth: settings.auth,
            tls: settings.tls,
            database: settings.database ?? 0,
            name: settings.name,
            connectTimeoutMs: settings.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
        };
    }
    if (!Number.isInteger(resolved.database) || resolved.database < 0 || resolved.database >= DATABASES) {
        throw configurationError(`\`database\` must be an integer within 0..${DATABASES - 1}`);
    }
    return resolved;
}

function connectionError(cause: unknown, settings: ResolvedSettings): RedisError {
    const error = fromNative(cause, 'connect', 'not-sent');
    error.message = `cannot reach ${settings.host}:${settings.port}: ${error.message}`;
    return error;
}

/**
 * The remote connection owner.
 *
 * `connect` opens one socket and runs the handshake; commands share the
 * `RedisCommands` surface with the local class; `close` only takes down this
 * connection.
 */
export class RedisClient extends CommandHost {
    readonly #settings: ResolvedSettings;
    readonly #waiters: Waiter[] = [];
    #state: ClientState = 'new';
    #socket?: Socket | TLSSocket;
    #buffer = Buffer.alloc(0);
    #protocol = 2;
    #connecting?: Promise<void>;
    #closing?: Promise<void>;

    constructor(options: RedisClientOptions) {
        super();
        this.#settings = resolveOptions(options);
    }

    get state(): ClientState {
        return this.#state;
    }

    /** The protocol version the handshake settled on. */
    get protocol(): number {
        return this.#protocol;
    }

    /** Opens the connection and completes the handshake; concurrent calls converge. */
    async connect(): Promise<void> {
        if (this.#state === 'ready') {
            return;
        }
        if (this.#state === 'connecting') {
            return this.#connecting;
        }
        if (this.#state !== 'new') {
            throw invalidState('connect', this.#state, 'connect');
        }
        this.#state = 'connecting';
        this.#connecting = this.#doConnect();
        return this.#connecting;
    }

    /**
     * Closes only this connection.
     *
     * New requests stop immediately; in-flight requests get `timeoutMs` to be
     * answered before the socket is taken down and their outcome is reported
     * as unknown.
     */
    async close(options: { timeoutMs?: number } = {}): Promise<void> {
        if (this.#state === 'closed') {
            return;
        }
        if (this.#state === 'closing') {
            return this.#closing;
        }
        if (this.#state === 'new') {
            this.#state = 'closed';
            return;
        }
        this.#state = 'closing';
        this.#closing = (async () => {
            const timeoutMs = options.timeoutMs ?? 5_000;
            const deadline = Date.now() + timeoutMs;
            while (this.#waiters.length > 0 && this.#socket !== undefined && Date.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, 5));
            }
            const unfinished = this.#waiters.length;
            this.#failAll(new RedisError('the connection was closed before a reply', {
                code: 'connection-closed',
                phase: 'close',
                execution: 'unknown',
                retry: 'application-decision',
            }));
            this.#socket?.destroy();
            this.#socket = undefined;
            this.#buffer = Buffer.alloc(0);
            this.#state = 'closed';
            if (unfinished > 0) {
                throw new RedisError(`${unfinished} request(s) were still unanswered when the connection closed`, {
                    code: 'close-incomplete',
                    phase: 'close',
                    execution: 'unknown',
                    retry: 'application-decision',
                });
            }
        })();
        return this.#closing;
    }

    async [Symbol.asyncDispose](): Promise<void> {
        await this.close();
    }

    /** Queues one command line and returns a builder whose `exec` answers per item. */
    pipeline(): RedisPipelineBuilder<[]> {
        return new Pipeline<[]>(requests => this.#sendMany(requests));
    }

    /** Queues a `MULTI` transaction whose `exec` distinguishes executed from aborted. */
    multi(): RedisMultiBuilder<[]> {
        return new Multi<[]>(requests => this.#sendMany(requests));
    }

    protected async dispatchCommand(args: (RedisValue | number | bigint)[]): Promise<unknown> {
        if (this.#state !== 'ready') {
            throw invalidState('command', this.#state, 'execute');
        }
        const spec = await this.#request(toBuffers(args));
        return replyToValue(spec);
    }

    /** Sends many command lines back to back and answers with their raw specs. */
    async #sendMany(requests: Buffer[][]): Promise<WireSpec[]> {
        if (this.#state !== 'ready') {
            throw invalidState('pipeline', this.#state, 'execute');
        }
        return Promise.all(requests.map(args => this.#request(args)));
    }

    async #doConnect(): Promise<void> {
        const settings = this.#settings;
        let socket: Socket | TLSSocket | undefined;
        try {
            socket = await this.#openSocket(settings);
            this.#socket = socket;
            socket.on('data', chunk => this.#onData(chunk as Buffer));
            socket.on('error', error => this.#onSocketDown(error));
            socket.on('close', () => this.#onSocketDown());
            await this.#handshake(settings);
            this.#state = 'ready';
        }
        catch (error) {
            this.#failAll(error instanceof RedisError ? error : fromNative(error, 'connect', 'unknown'));
            socket?.destroy();
            if (this.#socket === socket) {
                this.#socket = undefined;
            }
            this.#state = 'failed';
            throw error instanceof RedisError ? error : fromNative(error, 'connect', 'unknown');
        }
    }

    #openSocket(settings: ResolvedSettings): Promise<Socket | TLSSocket> {
        return new Promise((resolve, reject) => {
            let settled = false;
            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                socket.destroy();
                reject(new RedisError(`the connection to ${settings.host}:${settings.port} timed out`, {
                    code: 'connect-timeout',
                    phase: 'connect',
                    execution: 'not-sent',
                    retry: 'safe',
                }));
            }, settings.connectTimeoutMs);
            timeout.unref?.();
            const done = (opened: Socket | TLSSocket): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                resolve(opened);
            };
            const fail = (error: Error): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                reject(connectionError(error, settings));
            };
            let socket: Socket | TLSSocket;
            if (settings.secure) {
                const tls: NodeTlsConnectionOptions = {
                    host: settings.host,
                    port: settings.port,
                    servername: settings.tls?.serverName ?? settings.host,
                    cert: settings.tls?.identity ? Buffer.from(settings.tls.identity.certificate) : undefined,
                    key: settings.tls?.identity ? Buffer.from(settings.tls.identity.privateKey) : undefined,
                    ca: settings.tls?.ca?.map(ca => Buffer.from(ca)),
                };
                socket = tlsConnect(tls);
                socket.once('secureConnect', () => done(socket));
            }
            else {
                socket = netConnect({ host: settings.host, port: settings.port });
                socket.once('connect', () => done(socket));
            }
            socket.once('error', fail);
        });
    }

    async #handshake(settings: ResolvedSettings): Promise<void> {
        const hello = await this.#request([Buffer.from('HELLO'), Buffer.from('3')]);
        if (hello.type === 'error') {
            const message = String(hello.value);
            if (/NOPROTO|unknown command/i.test(message)) {
                this.#protocol = 2;
            }
            else {
                const error = errorFromReply(message);
                throw new RedisError(error.message, { code: error.code, phase: 'connect', execution: 'replied', retry: 'never', cause: error });
            }
        }
        else {
            this.#protocol = 3;
        }
        if (settings.auth !== undefined) {
            const args = settings.auth.username === undefined
                ? ['AUTH', settings.auth.password]
                : ['AUTH', settings.auth.username, settings.auth.password];
            await this.#expectOk(args, 'AUTH');
        }
        if (settings.database !== 0) {
            await this.#expectOk(['SELECT', String(settings.database)], 'SELECT');
        }
        if (settings.name !== undefined) {
            await this.#expectOk(['CLIENT', 'SETNAME', settings.name], 'CLIENT SETNAME');
        }
    }

    async #expectOk(args: (string | Uint8Array)[], what: string): Promise<void> {
        const spec = await this.#request(toBuffers(args));
        if (spec.type === 'error') {
            const error = errorFromReply(String(spec.value));
            throw new RedisError(`${what} failed during the handshake: ${error.message}`, {
                code: error.code,
                phase: 'connect',
                execution: 'replied',
                retry: 'never',
                cause: error,
            });
        }
    }

    #request(args: Buffer[]): Promise<WireSpec> {
        const socket = this.#socket;
        if (socket === undefined) {
            return Promise.reject(new RedisError('the connection is not open', {
                code: 'connection-closed',
                phase: 'execute',
                execution: 'not-sent',
                retry: 'never',
            }));
        }
        let encoded: Buffer;
        try {
            encoded = encodeCommand(args);
        }
        catch (error) {
            return Promise.reject(fromNative(error, 'execute', 'not-sent'));
        }
        return new Promise<WireSpec>((resolve, reject) => {
            const waiter: Waiter = { resolve, reject };
            this.#waiters.push(waiter);
            socket.write(encoded, error => {
                if (error === undefined || error === null) {
                    return;
                }
                const index = this.#waiters.indexOf(waiter);
                if (index >= 0) {
                    this.#waiters.splice(index, 1);
                }
                const destroyed = (error as NodeJS.ErrnoException).code === 'ERR_STREAM_DESTROYED'
                    || (error as NodeJS.ErrnoException).code === 'ERR_STREAM_ALREADY_FINISHED';
                reject(new RedisError(`the request could not be delivered: ${error.message}`, {
                    code: 'write-failed',
                    phase: 'execute',
                    execution: destroyed ? 'not-sent' : 'unknown',
                    retry: destroyed ? 'safe' : 'application-decision',
                    cause: error,
                }));
            });
        });
    }

    #onData(chunk: Buffer): void {
        this.#buffer = Buffer.concat([this.#buffer, chunk]);
        this.#pump();
    }

    #pump(): void {
        while (this.#buffer.length > 0) {
            let decoded;
            try {
                decoded = decodeReply(this.#buffer);
            }
            catch (error) {
                this.#failAll(fromNative(error, 'execute', 'unknown'));
                this.#teardown();
                return;
            }
            if (decoded === null) {
                return;
            }
            this.#buffer = this.#buffer.subarray(decoded.consumed);
            const spec = JSON.parse(decoded.spec) as WireSpec;
            if (spec.type === 'push') {
                continue;
            }
            const waiter = this.#waiters.shift();
            if (waiter === undefined) {
                continue;
            }
            waiter.resolve(spec);
        }
    }

    #onSocketDown(error?: Error): void {
        if (this.#state === 'closing' || this.#state === 'closed') {
            this.#failAll(new RedisError('the connection was closed', {
                code: 'connection-closed',
                phase: 'execute',
                execution: 'unknown',
                retry: 'application-decision',
            }));
            return;
        }
        this.#failAll(error !== undefined
            ? fromNative(error, 'execute', 'unknown')
            : new RedisError('the connection closed before a reply', {
                code: 'connection-lost',
                phase: 'execute',
                execution: 'unknown',
                retry: 'application-decision',
            }));
        if (this.#state === 'ready' || this.#state === 'connecting') {
            this.#state = 'failed';
        }
        this.#socket = undefined;
    }

    #failAll(error: RedisError): void {
        while (this.#waiters.length > 0) {
            this.#waiters.shift()!.reject(error);
        }
    }

    #teardown(): void {
        const socket = this.#socket;
        this.#socket = undefined;
        this.#buffer = Buffer.alloc(0);
        if (this.#state !== 'closing' && this.#state !== 'closed') {
            this.#state = 'failed';
        }
        socket?.destroy();
    }
}

/** The builder `RedisClient#pipeline` answers with; each step accumulates its item type. */
export interface RedisPipelineBuilder<T extends readonly unknown[]> {
    call(command: string, ...args: (RedisValue | number | bigint)[]): RedisPipelineBuilder<[...T, unknown]>;
    set(key: RedisKey, value: RedisValue): RedisPipelineBuilder<[...T, string | null]>;
    get(key: RedisKey): RedisPipelineBuilder<[...T, string | null]>;
    incr(key: RedisKey): RedisPipelineBuilder<[...T, bigint]>;
    decr(key: RedisKey): RedisPipelineBuilder<[...T, bigint]>;
    del(...keys: RedisKey[]): RedisPipelineBuilder<[...T, bigint]>;
    hset(key: RedisKey, field: RedisValue, ...more: RedisValue[]): RedisPipelineBuilder<[...T, bigint]>;
    hget(key: RedisKey, field: RedisValue): RedisPipelineBuilder<[...T, string | null]>;
    lpush(key: RedisKey, ...members: RedisValue[]): RedisPipelineBuilder<[...T, bigint]>;
    rpush(key: RedisKey, ...members: RedisValue[]): RedisPipelineBuilder<[...T, bigint]>;
    sadd(key: RedisKey, ...members: RedisValue[]): RedisPipelineBuilder<[...T, bigint]>;
    zadd(key: RedisKey, score: number | bigint, member: RedisValue, ...more: (RedisValue | number | bigint)[]): RedisPipelineBuilder<[...T, bigint]>;
    exec(): Promise<{ [K in keyof T]: CommandResult<T[K]> }>;
}

/** The builder `RedisClient#multi` answers with; `exec` distinguishes executed from aborted. */
export interface RedisMultiBuilder<T extends readonly unknown[]> {
    call(command: string, ...args: (RedisValue | number | bigint)[]): RedisMultiBuilder<[...T, unknown]>;
    set(key: RedisKey, value: RedisValue): RedisMultiBuilder<[...T, string | null]>;
    get(key: RedisKey): RedisMultiBuilder<[...T, string | null]>;
    incr(key: RedisKey): RedisMultiBuilder<[...T, bigint]>;
    decr(key: RedisKey): RedisMultiBuilder<[...T, bigint]>;
    del(...keys: RedisKey[]): RedisMultiBuilder<[...T, bigint]>;
    hset(key: RedisKey, field: RedisValue, ...more: RedisValue[]): RedisMultiBuilder<[...T, bigint]>;
    hget(key: RedisKey, field: RedisValue): RedisMultiBuilder<[...T, string | null]>;
    lpush(key: RedisKey, ...members: RedisValue[]): RedisMultiBuilder<[...T, bigint]>;
    rpush(key: RedisKey, ...members: RedisValue[]): RedisMultiBuilder<[...T, bigint]>;
    sadd(key: RedisKey, ...members: RedisValue[]): RedisMultiBuilder<[...T, bigint]>;
    zadd(key: RedisKey, score: number | bigint, member: RedisValue, ...more: (RedisValue | number | bigint)[]): RedisMultiBuilder<[...T, bigint]>;
    exec(): Promise<RedisMultiResult<T>>;
}

function toResult(spec: WireSpec): CommandResult<unknown> {
    if (spec.type === 'error') {
        return { ok: false, error: errorFromReply(String(spec.value)) };
    }
    try {
        return { ok: true, value: replyToValue(spec) };
    }
    catch (error) {
        return { ok: false, error: error as RedisError };
    }
}

/** One queued line inside a pipeline or transaction. */
interface Queued {
    args: (RedisValue | number | bigint)[];
}

/** Sends many command lines back to back and answers with their raw specs. */
type RequestSender = (requests: Buffer[][]) => Promise<WireSpec[]>;

class Pipeline<T extends readonly unknown[]> implements RedisPipelineBuilder<T> {
    readonly #send: RequestSender;
    readonly #queued: Queued[] = [];

    constructor(send: RequestSender) {
        this.#send = send;
    }

    call(command: string, ...args: (RedisValue | number | bigint)[]): RedisPipelineBuilder<[...T, unknown]> {
        this.#queued.push({ args: [command, ...args] });
        return this as unknown as RedisPipelineBuilder<[...T, unknown]>;
    }

    set(key: RedisKey, value: RedisValue): RedisPipelineBuilder<[...T, string | null]> {
        return this.call('SET', key, value) as RedisPipelineBuilder<[...T, string | null]>;
    }

    get(key: RedisKey): RedisPipelineBuilder<[...T, string | null]> {
        return this.call('GET', key) as RedisPipelineBuilder<[...T, string | null]>;
    }

    incr(key: RedisKey): RedisPipelineBuilder<[...T, bigint]> {
        return this.call('INCR', key) as RedisPipelineBuilder<[...T, bigint]>;
    }

    decr(key: RedisKey): RedisPipelineBuilder<[...T, bigint]> {
        return this.call('DECR', key) as RedisPipelineBuilder<[...T, bigint]>;
    }

    del(...keys: RedisKey[]): RedisPipelineBuilder<[...T, bigint]> {
        return this.call('DEL', ...keys) as RedisPipelineBuilder<[...T, bigint]>;
    }

    hset(key: RedisKey, field: RedisValue, ...more: RedisValue[]): RedisPipelineBuilder<[...T, bigint]> {
        return this.call('HSET', key, field, ...more) as RedisPipelineBuilder<[...T, bigint]>;
    }

    hget(key: RedisKey, field: RedisValue): RedisPipelineBuilder<[...T, string | null]> {
        return this.call('HGET', key, field) as RedisPipelineBuilder<[...T, string | null]>;
    }

    lpush(key: RedisKey, ...members: RedisValue[]): RedisPipelineBuilder<[...T, bigint]> {
        return this.call('LPUSH', key, ...members) as RedisPipelineBuilder<[...T, bigint]>;
    }

    rpush(key: RedisKey, ...members: RedisValue[]): RedisPipelineBuilder<[...T, bigint]> {
        return this.call('RPUSH', key, ...members) as RedisPipelineBuilder<[...T, bigint]>;
    }

    sadd(key: RedisKey, ...members: RedisValue[]): RedisPipelineBuilder<[...T, bigint]> {
        return this.call('SADD', key, ...members) as RedisPipelineBuilder<[...T, bigint]>;
    }

    zadd(key: RedisKey, score: number | bigint, member: RedisValue, ...more: (RedisValue | number | bigint)[]): RedisPipelineBuilder<[...T, bigint]> {
        return this.call('ZADD', key, String(score), member, ...more) as RedisPipelineBuilder<[...T, bigint]>;
    }

    async exec(): Promise<{ [K in keyof T]: CommandResult<T[K]> }> {
        const requests = this.#queued.map(entry => toBuffers(entry.args));
        this.#queued.length = 0;
        const specs = await this.#send(requests);
        return specs.map(toResult) as { [K in keyof T]: CommandResult<T[K]> };
    }
}

class Multi<T extends readonly unknown[]> implements RedisMultiBuilder<T> {
    readonly #send: RequestSender;
    readonly #queued: Queued[] = [];

    constructor(send: RequestSender) {
        this.#send = send;
    }

    call(command: string, ...args: (RedisValue | number | bigint)[]): RedisMultiBuilder<[...T, unknown]> {
        this.#queued.push({ args: [command, ...args] });
        return this as unknown as RedisMultiBuilder<[...T, unknown]>;
    }

    set(key: RedisKey, value: RedisValue): RedisMultiBuilder<[...T, string | null]> {
        return this.call('SET', key, value) as RedisMultiBuilder<[...T, string | null]>;
    }

    get(key: RedisKey): RedisMultiBuilder<[...T, string | null]> {
        return this.call('GET', key) as RedisMultiBuilder<[...T, string | null]>;
    }

    incr(key: RedisKey): RedisMultiBuilder<[...T, bigint]> {
        return this.call('INCR', key) as RedisMultiBuilder<[...T, bigint]>;
    }

    decr(key: RedisKey): RedisMultiBuilder<[...T, bigint]> {
        return this.call('DECR', key) as RedisMultiBuilder<[...T, bigint]>;
    }

    del(...keys: RedisKey[]): RedisMultiBuilder<[...T, bigint]> {
        return this.call('DEL', ...keys) as RedisMultiBuilder<[...T, bigint]>;
    }

    hset(key: RedisKey, field: RedisValue, ...more: RedisValue[]): RedisMultiBuilder<[...T, bigint]> {
        return this.call('HSET', key, field, ...more) as RedisMultiBuilder<[...T, bigint]>;
    }

    hget(key: RedisKey, field: RedisValue): RedisMultiBuilder<[...T, string | null]> {
        return this.call('HGET', key, field) as RedisMultiBuilder<[...T, string | null]>;
    }

    lpush(key: RedisKey, ...members: RedisValue[]): RedisMultiBuilder<[...T, bigint]> {
        return this.call('LPUSH', key, ...members) as RedisMultiBuilder<[...T, bigint]>;
    }

    rpush(key: RedisKey, ...members: RedisValue[]): RedisMultiBuilder<[...T, bigint]> {
        return this.call('RPUSH', key, ...members) as RedisMultiBuilder<[...T, bigint]>;
    }

    sadd(key: RedisKey, ...members: RedisValue[]): RedisMultiBuilder<[...T, bigint]> {
        return this.call('SADD', key, ...members) as RedisMultiBuilder<[...T, bigint]>;
    }

    zadd(key: RedisKey, score: number | bigint, member: RedisValue, ...more: (RedisValue | number | bigint)[]): RedisMultiBuilder<[...T, bigint]> {
        return this.call('ZADD', key, String(score), member, ...more) as RedisMultiBuilder<[...T, bigint]>;
    }

    async exec(): Promise<RedisMultiResult<T>> {
        const requests = [
            toBuffers(['MULTI']),
            ...this.#queued.map(entry => toBuffers(entry.args)),
            toBuffers(['EXEC']),
        ];
        this.#queued.length = 0;
        const specs = await this.#send(requests);
        const [multi, ...rest] = specs;
        const exec = rest.pop()!;
        if (multi.type === 'error') {
            throw errorFromReply(String(multi.value));
        }
        if (exec.type === 'error') {
            const error = errorFromReply(String(exec.value));
            if (error.code === 'EXECABORT') {
                return { status: 'aborted' };
            }
            throw error;
        }
        if (exec.type === 'null' || exec.type === 'null-array') {
            return { status: 'aborted' };
        }
        const items = (exec as { type: 'array' | 'set'; value: WireSpec[] }).value.map(toResult);
        return { status: 'executed', results: items } as RedisMultiResult<T>;
    }
}


