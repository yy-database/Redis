//! Loads the platform binding and re-exports its orthogonal primitives.
//! `package.json#main` owns the `.node` filename — callers never concatenate it.

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReplySpec } from './reply.js';

/** One parsed command with the number of bytes it consumed. */
export interface DecodedCommand {
    consumed: number;
    args: Buffer[];
}

/** One parsed reply with the number of bytes it consumed. */
export interface DecodedReply {
    consumed: number;
    spec: string;
}

/** Every complete request decoded from the front of one buffer. */
export interface DecodedCommands {
    consumed: number;
    commands: DecodedCommand[];
    /** Framing error found after the decoded requests, or absent. */
    error?: string | null;
}

/** Every complete reply decoded from the front of one buffer. */
export interface DecodedReplies {
    consumed: number;
    specs: string[];
    /** Framing error found after the decoded replies, or absent. */
    error?: string | null;
}

/** One server-face reply plus the session effects the upstream gateway reports. */
export interface ServerOutcome {
    /** Reply bytes the gateway already framed for the connection protocol. */
    frame: Buffer;
    /** Whether the gateway answered or absorbed the command; the host must not run it. */
    handled: boolean;
    /** Whether the host must close this connection after writing `frame`. */
    close: boolean;
    /** Host connection ids a peer `CLIENT KILL` selected. */
    killed: number[];
    /** The queue `EXEC` released; the host replays each entry in order. */
    replay: Buffer[][];
    /** A `WAIT` park: the host suspends the connection and answers integer `0` at timeout. */
    wait?: number | null;
    /** The effective RESP version after `HELLO` / `RESET`, mirrored by the host. */
    protocol?: number | null;
    /** The connection name written by `HELLO ... SETNAME`, mirrored by the host. */
    name?: Buffer | null;
    /** `RESET` ran; the host drops subscriptions and returns to database `0`. */
    reset: boolean;
    /** Whether the connection is still inside a `MULTI` block after this command. */
    inMulti: boolean;
    /** `SHUTDOWN` ran; the host stops the server after closing the connection. */
    shutdown: boolean;
    /** `CONFIG SET` pairs the gateway stored and the host must mirror at runtime. */
    config: ServerConfigChange[];
}

/** One `CONFIG SET` pair the gateway accepted and the host mirrors. */
export interface ServerConfigChange {
    name: string;
    value: string;
}

/** One subscription acknowledgement the host encodes. */
export interface PubSubAck {
    name: Buffer | null;
    /** Total channel plus pattern subscriptions after the change. */
    count: number;
}

/** One delivery target of a published message. */
export interface PubSubDelivery {
    client: number;
    /** Matching pattern for `pmessage`, absent for a direct channel delivery. */
    pattern: Buffer | null;
    channel: Buffer;
    payload: Buffer;
}

/** Subscriber count of one channel. */
export interface PubSubCount {
    channel: Buffer;
    count: number;
}

/** One reply frame the binding produced upstream, plus whether it is an error. */
export interface CommandFrame {
    frame: Buffer;
    /** Whether the frame starts with the RESP error marker; server-face frames omit it. */
    error?: boolean;
    close?: boolean;
    killed?: number[];
}

/** Result of adding `delta` to an integer value. */
export interface Increment {
    value: number | null;
    error: string | null;
}

/** Value kinds of one logical key, as the binding names them. */
export type ValueKind = '' | 'hash' | 'list' | 'set' | 'zset' | 'stream';

/** Outcome of one `rename` call. */
export type RenameOutcome = 'renamed' | 'missing' | 'destination-present';

/** One logical key a sweep removed because its deadline elapsed. */
export interface ExpiredKey {
    db: number;
    key: Buffer;
}

/** The raw surface of the platform binding, as the napi crate exports it. */
interface NativeBinding {
    decodeCommand(input: Buffer): DecodedCommand | null;
    decodeCommands(input: Buffer): DecodedCommands;
    encodeCommand(args: Buffer[]): Buffer;
    encodeCommands(commands: Buffer[][]): Buffer;
    encodeReply(spec: string, protocol: number): Buffer;
    encodeReplies(specs: string, protocol: number): Buffer;
    decodeReply(input: Buffer): DecodedReply | null;
    decodeReplies(input: Buffer): DecodedReplies;
    parseInteger(value: Buffer): number | null;
    repairShard(dataDir: string): string;
    Store: new (dataDir: string) => NativeStore;
}

interface NativeStore {
    get(db: number, key: Buffer): Buffer | null;
    set(db: number, key: Buffer, value: Buffer, expiresAt: number | null): void;
    delete(db: number, key: Buffer): boolean;
    exists(db: number, key: Buffer): boolean;
    deadline(db: number, key: Buffer): number | null;
    expire(db: number, key: Buffer, expiresAt: number | null): boolean;
    getKind(db: number, kind: string, key: Buffer): Buffer | null;
    setKind(db: number, kind: string, key: Buffer, value: Buffer, expiresAt: number | null): void;
    deleteKind(db: number, kind: string, key: Buffer): boolean;
    existsKind(db: number, kind: string, key: Buffer): boolean;
    deadlineKind(db: number, kind: string, key: Buffer): number | null;
    expireKind(db: number, kind: string, key: Buffer, expiresAt: number | null): boolean;
    rename(db: number, source: Buffer, destination: Buffer, ifAbsent: boolean): RenameOutcome;
    append(db: number, key: Buffer, suffix: Buffer): number;
    keys(db: number): Buffer[];
    setMany(db: number, keys: Buffer[], values: Buffer[]): void;
    flush(): void;
    incrBy(db: number, key: Buffer, delta: number): Increment;
    flushDb(db: number): void;
    sweepExpired(nowUnixMs: number): ExpiredKey[];
    beginBatch(): void;
    endBatch(): void;
    endBatchDeferred(): void;
    setSyncAlways(always: boolean): void;
    sync(): void;
    watchKey(db: number, key: Buffer): number;
    unwatchKey(db: number, key: Buffer): void;
    watchVersion(db: number, key: Buffer): number;
    size(db: number): number;
    dataDir(): string;
    hashCommand(db: number, protocol: number, args: Buffer[]): string;
    hashCommandFrame(db: number, protocol: number, args: Buffer[]): CommandFrame;
    setCommand(db: number, protocol: number, args: Buffer[]): string;
    setCommandFrame(db: number, protocol: number, args: Buffer[]): CommandFrame;
    listCommand(db: number, protocol: number, args: Buffer[]): string;
    listCommandFrame(db: number, protocol: number, args: Buffer[]): CommandFrame;
    zsetCommand(db: number, protocol: number, args: Buffer[]): string;
    zsetCommandFrame(db: number, protocol: number, args: Buffer[]): CommandFrame;
    stringCommand(db: number, protocol: number, args: Buffer[]): string;
    stringCommandFrame(db: number, protocol: number, args: Buffer[]): CommandFrame;
    keyspaceCommand(db: number, protocol: number, args: Buffer[]): string;
    keyspaceCommandFrame(db: number, protocol: number, args: Buffer[]): CommandFrame;
    hyperloglogCommand(db: number, args: Buffer[]): string;
    hyperloglogCommandFrame(db: number, args: Buffer[]): CommandFrame;
    serverExecute(session: number, db: number, protocol: number, args: Buffer[], replaying: boolean): ServerOutcome;
    serverQueue(session: number, protocol: number, args: Buffer[]): Buffer;
    serverPoison(session: number): void;
    serverWaitComplete(protocol: number): Buffer;
    setRequirepass(requirepass: string | null): void;
    setConfig(name: string, value: string): void;
    serverRelease(session: number): void;
    pubsubSubscribe(session: number, name: Buffer, pattern: boolean): number;
    pubsubUnsubscribe(session: number, names: Buffer[], pattern: boolean): PubSubAck[];
    pubsubSubscribed(session: number): boolean;
    pubsubDetach(session: number): void;
    pubsubPublish(channel: Buffer, payload: Buffer): PubSubDelivery[];
    pubsubChannels(pattern: Buffer | null): Buffer[];
    pubsubNumsub(channels: Buffer[]): PubSubCount[];
    pubsubNumpat(): number;
}

const require = createRequire(import.meta.url);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const platforms: Record<string, Record<string, string>> = {
    win32: { x64: 'win32-x64' },
    darwin: { arm64: 'darwin-arm64', x64: 'darwin-x64' },
    linux: { x64: 'linux-x64' },
};

let binding: NativeBinding | undefined;

function load(): NativeBinding {
    if (binding) {
        return binding;
    }
    if (process.env.REDIS_NATIVE_PATH) {
        binding = require(process.env.REDIS_NATIVE_PATH) as NativeBinding;
        return binding;
    }
    const platform = platforms[process.platform]?.[process.arch];
    if (!platform) {
        throw new Error(`no native binding for ${process.platform}-${process.arch}`);
    }
    const platformPackage = `@yydb/redis-${platform}`;
    try {
        binding = require(platformPackage) as NativeBinding;
        return binding;
    } catch (error) {
        const repo = resolve(packageRoot, '..', '..', '..', '..');
        const local = join(repo, 'projects', 'redis.ts', 'platforms', `redis-${platform}`);
        if (existsSync(join(local, 'package.json'))) {
            binding = require(local) as NativeBinding;
            return binding;
        }
        throw new Error(
            `cannot resolve ${platformPackage}: install the matching platform package (${(error as Error).message})`,
        );
    }
}

/** Resolves the wire and storage primitives exported by the platform binding. */
function primitives(): NativeBinding {
    return load();
}

const bytes = (value: string | Buffer): Buffer => (Buffer.isBuffer(value) ? value : Buffer.from(value));

export const decodeCommand = (input: string | Buffer): DecodedCommand | null => primitives().decodeCommand(bytes(input));
export const decodeCommands = (input: string | Buffer): DecodedCommands => primitives().decodeCommands(bytes(input));
export const encodeCommand = (args: (string | Buffer)[]): Buffer => primitives().encodeCommand(args.map(bytes));
/** Encodes many commands into one buffer, so a pipeline crosses the binding once. */
export const encodeCommands = (commands: (string | Buffer)[][]): Buffer => primitives().encodeCommands(commands.map(args => args.map(bytes)));
export const encodeReply = (spec: ReplySpec, protocol: number): Buffer => primitives().encodeReply(JSON.stringify(spec), protocol);
/** Encodes many replies into one buffer, so a burst crosses the binding once. */
export const encodeReplies = (specs: ReplySpec[], protocol: number): Buffer => primitives().encodeReplies(JSON.stringify(specs), protocol);
export const decodeReply = (input: string | Buffer): DecodedReply | null => primitives().decodeReply(bytes(input));
/** Decodes every complete reply in the buffer, leaving the trailing partial frame. */
export const decodeReplies = (input: string | Buffer): DecodedReplies => primitives().decodeReplies(bytes(input));
export const parseInteger = (value: string | Buffer): number | null => primitives().parseInteger(bytes(value));
export const repairShard = (dataDir: string): string => primitives().repairShard(String(dataDir));

export class Store {
    private readonly native: NativeStore;

    constructor(dataDir: string) {
        this.native = new (primitives().Store)(dataDir);
    }

    get(db: number, key: string | Buffer): string | null {
        const value = this.native.get(db, bytes(key));
        return value === null ? null : value.toString('utf8');
    }

    set(db: number, key: string | Buffer, value: string | Buffer, expiresAt: number | null = null): void {
        this.native.set(db, bytes(key), bytes(value), expiresAt);
    }

    delete(db: number, key: string | Buffer): boolean {
        return this.native.delete(db, bytes(key));
    }

    exists(db: number, key: string | Buffer): boolean {
        return this.native.exists(db, bytes(key));
    }

    deadline(db: number, key: string | Buffer): number | null {
        return this.native.deadline(db, bytes(key));
    }

    expire(db: number, key: string | Buffer, expiresAt: number | null): boolean {
        return this.native.expire(db, bytes(key), expiresAt);
    }

    /** Reads one kind (`""`, `hash`, `list`, `set` or `zset`) as raw bytes. */
    getKind(db: number, kind: ValueKind, key: string | Buffer): Buffer | null {
        const value = this.native.getKind(db, kind, bytes(key));
        return value === null ? null : Buffer.from(value);
    }

    /** Inserts or replaces one kind, keeping the value bytes untouched. */
    setKind(db: number, kind: ValueKind, key: string | Buffer, value: string | Buffer, expiresAt: number | null = null): void {
        this.native.setKind(db, kind, bytes(key), Buffer.from(value), expiresAt);
    }

    deleteKind(db: number, kind: ValueKind, key: string | Buffer): boolean {
        return this.native.deleteKind(db, kind, bytes(key));
    }

    existsKind(db: number, kind: ValueKind, key: string | Buffer): boolean {
        return this.native.existsKind(db, kind, bytes(key));
    }

    deadlineKind(db: number, kind: ValueKind, key: string | Buffer): number | null {
        return this.native.deadlineKind(db, kind, bytes(key));
    }

    expireKind(db: number, kind: ValueKind, key: string | Buffer, expiresAt: number | null): boolean {
        return this.native.expireKind(db, kind, bytes(key), expiresAt);
    }

    rename(db: number, source: string | Buffer, destination: string | Buffer, ifAbsent = false): RenameOutcome {
        return this.native.rename(db, bytes(source), bytes(destination), ifAbsent);
    }

    append(db: number, key: string | Buffer, suffix: string | Buffer): number {
        return this.native.append(db, bytes(key), bytes(suffix));
    }

    keys(db: number): Buffer[] {
        return this.native.keys(db);
    }

    setMany(db: number, keys: (string | Buffer)[], values: (string | Buffer)[]): void {
        this.native.setMany(db, keys.map(bytes), values.map(bytes));
    }

    flush(): void {
        this.native.flush();
    }

    incrBy(db: number, key: string | Buffer, delta: number): Increment {
        return this.native.incrBy(db, bytes(key), delta);
    }

    flushDb(db: number): void {
        this.native.flushDb(db);
    }

    /** Drops every record already past its deadline; returns the expired keys. */
    sweepExpired(nowUnixMs: number): ExpiredKey[] {
        return this.native.sweepExpired(nowUnixMs);
    }

    /** Opens a batch whose mutations share one snapshot write. */
    beginBatch(): void {
        this.native.beginBatch();
    }

    /** Closes a batch and writes the shard at the outermost depth. */
    endBatch(): void {
        this.native.endBatch();
    }

    /**
     * Closes a batch without writing the shard.
     *
     * The socket loop uses this so a sequential command does not rewrite the
     * whole snapshot; the server's flush timer, `SAVE` and shutdown persist the
     * accumulated mutations. `appendfsync always` writes through instead.
     */
    endBatchDeferred(): void {
        this.native.endBatchDeferred();
    }

    /** Selects `fsync` on every write (`always`) or only on `sync` (`everysec`). */
    setSyncAlways(always: boolean): void {
        this.native.setSyncAlways(always);
    }

    /** Flushes an unsynced snapshot to stable storage. */
    sync(): void {
        this.native.sync();
    }

    /** Registers one `WATCH` on a logical key and returns its mutation version. */
    watchKey(db: number, key: string | Buffer): number {
        return this.native.watchKey(db, bytes(key));
    }

    /** Drops one `WATCH` on a logical key. */
    unwatchKey(db: number, key: string | Buffer): void {
        this.native.unwatchKey(db, bytes(key));
    }

    /** Current mutation version of a watched logical key, `0` when unwatched. */
    watchVersion(db: number, key: string | Buffer): number {
        return this.native.watchVersion(db, bytes(key));
    }

    size(db: number): number {
        return this.native.size(db);
    }

    dataDir(): string {
        return this.native.dataDir();
    }

    /** Runs one hash-family request in the binding and returns its reply specification. */
    hashCommand(db: number, protocol: number, args: (string | Buffer)[]): ReplySpec {
        return JSON.parse(this.native.hashCommand(db, protocol, args.map(bytes)));
    }

    /** Runs one set-family request in the binding and returns its reply specification. */
    setCommand(db: number, protocol: number, args: (string | Buffer)[]): ReplySpec {
        return JSON.parse(this.native.setCommand(db, protocol, args.map(bytes)));
    }

    /** Runs one list-family request in the binding and returns its reply specification. */
    listCommand(db: number, protocol: number, args: (string | Buffer)[]): ReplySpec {
        return JSON.parse(this.native.listCommand(db, protocol, args.map(bytes)));
    }

    /** Runs one zset-family request in the binding and returns its reply specification. */
    zsetCommand(db: number, protocol: number, args: (string | Buffer)[]): ReplySpec {
        return JSON.parse(this.native.zsetCommand(db, protocol, args.map(bytes)));
    }

    /** Runs one string/key-family request in the binding and returns its reply specification. */
    stringCommand(db: number, protocol: number, args: (string | Buffer)[]): ReplySpec {
        return JSON.parse(this.native.stringCommand(db, protocol, args.map(bytes)));
    }

    /** Runs one keyspace-family request in the binding and returns its reply specification. */
    keyspaceCommand(db: number, protocol: number, args: (string | Buffer)[]): ReplySpec {
        return JSON.parse(this.native.keyspaceCommand(db, protocol, args.map(bytes)));
    }

    /** Runs one HyperLogLog-family request in the binding and returns its reply specification. */
    hyperloglogCommand(db: number, args: (string | Buffer)[]): ReplySpec {
        return JSON.parse(this.native.hyperloglogCommand(db, args.map(bytes)));
    }

    /**
     * Runs one family request and returns the upstream reply frame verbatim.
     *
     * The facade already framed the reply for `protocol`, so the socket loop can
     * write these bytes directly instead of decoding them into a specification and
     * encoding them again.
     */
    hashCommandFrame(db: number, protocol: number, args: (string | Buffer)[]): CommandFrame {
        return this.native.hashCommandFrame(db, protocol, args.map(bytes));
    }

    /** Runs one set-family request and returns the upstream reply frame verbatim. */
    setCommandFrame(db: number, protocol: number, args: (string | Buffer)[]): CommandFrame {
        return this.native.setCommandFrame(db, protocol, args.map(bytes));
    }

    /** Runs one list-family request and returns the upstream reply frame verbatim. */
    listCommandFrame(db: number, protocol: number, args: (string | Buffer)[]): CommandFrame {
        return this.native.listCommandFrame(db, protocol, args.map(bytes));
    }

    /** Runs one zset-family request and returns the upstream reply frame verbatim. */
    zsetCommandFrame(db: number, protocol: number, args: (string | Buffer)[]): CommandFrame {
        return this.native.zsetCommandFrame(db, protocol, args.map(bytes));
    }

    /** Runs one string/key-family request and returns the upstream reply frame verbatim. */
    stringCommandFrame(db: number, protocol: number, args: (string | Buffer)[]): CommandFrame {
        return this.native.stringCommandFrame(db, protocol, args.map(bytes));
    }

    /** Runs one keyspace-family request and returns the upstream reply frame verbatim. */
    keyspaceCommandFrame(db: number, protocol: number, args: (string | Buffer)[]): CommandFrame {
        return this.native.keyspaceCommandFrame(db, protocol, args.map(bytes));
    }

    /** Runs one HyperLogLog-family request and returns the upstream reply frame verbatim. */
    hyperloglogCommandFrame(db: number, args: (string | Buffer)[]): CommandFrame {
        return this.native.hyperloglogCommandFrame(db, args.map(bytes));
    }

    /**
     * Runs one request against the upstream session gateway.
     *
     * The gateway owns the command state machines (`AUTH`, `HELLO`, `MULTI` / `EXEC`,
     * `WATCH`, `RESET`, persistence and `WAIT`) and the per-connection `CLIENT` state,
     * so the host only mirrors the outcome fields and replays what `EXEC` releases.
     */
    serverExecute(session: number, db: number, protocol: number, args: (string | Buffer)[], replaying: boolean): ServerOutcome {
        return this.native.serverExecute(session, db, protocol, args.map(bytes), replaying);
    }

    /** Queues one host-owned command inside the open `MULTI` block, returning the `+QUEUED` frame. */
    serverQueue(session: number, protocol: number, args: (string | Buffer)[]): Buffer {
        return this.native.serverQueue(session, protocol, args.map(bytes));
    }

    /** Marks the open `MULTI` block dirty after a host-side queue validation error. */
    serverPoison(session: number): void {
        this.native.serverPoison(session);
    }

    /** Encodes the integer `0` reply a parked `WAIT` answers at its timeout. */
    serverWaitComplete(protocol: number): Buffer {
        return this.native.serverWaitComplete(protocol);
    }

    /** Sets the listener-wide `requirepass` the gateway gate reads per command. */
    setRequirepass(requirepass: string | null): void {
        this.native.setRequirepass(requirepass);
    }

    /** Aligns one gateway `CONFIG` value with the host's runtime settings. */
    setConfig(name: string, value: string): void {
        this.native.setConfig(name, value);
    }

    /** Drops the embedded session of one connection that just closed. */
    serverRelease(session: number): void {
        this.native.serverRelease(session);
    }

    /** Registers one subscription in the gateway table and returns the total count. */
    pubsubSubscribe(session: number, name: string | Buffer, pattern: boolean): number {
        return this.native.pubsubSubscribe(session, bytes(name), pattern);
    }

    /** Removes subscriptions and returns one acknowledgement per reply frame. */
    pubsubUnsubscribe(session: number, names: (string | Buffer)[], pattern: boolean): PubSubAck[] {
        return this.native.pubsubUnsubscribe(session, names.map(bytes), pattern);
    }

    /** Whether one session holds at least one channel or pattern subscription. */
    pubsubSubscribed(session: number): boolean {
        return this.native.pubsubSubscribed(session);
    }

    /** Drops every subscription of one session. */
    pubsubDetach(session: number): void {
        this.native.pubsubDetach(session);
    }

    /** Publishes one message and returns every delivery the host must write. */
    pubsubPublish(channel: string | Buffer, payload: string | Buffer): PubSubDelivery[] {
        return this.native.pubsubPublish(bytes(channel), bytes(payload));
    }

    /** Active channels, optionally filtered by a glob, in sorted order. */
    pubsubChannels(pattern?: string | Buffer): Buffer[] {
        return this.native.pubsubChannels(pattern === undefined ? null : bytes(pattern));
    }

    /** Subscriber count of each requested channel, unknown channels counting zero. */
    pubsubNumsub(channels: (string | Buffer)[]): PubSubCount[] {
        return this.native.pubsubNumsub(channels.map(bytes));
    }

    /** Number of distinct patterns subscribed across every session. */
    pubsubNumpat(): number {
        return this.native.pubsubNumpat();
    }
}
