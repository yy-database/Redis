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
    encodeCommand(args: Buffer[]): Buffer;
    encodeReply(spec: string, protocol: number): Buffer;
    decodeReply(input: Buffer): DecodedReply | null;
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
    setSyncAlways(always: boolean): void;
    sync(): void;
    watchKey(db: number, key: Buffer): number;
    unwatchKey(db: number, key: Buffer): void;
    watchVersion(db: number, key: Buffer): number;
    size(db: number): number;
    dataDir(): string;
    hashCommand(db: number, protocol: number, args: Buffer[]): string;
    setCommand(db: number, protocol: number, args: Buffer[]): string;
    listCommand(db: number, protocol: number, args: Buffer[]): string;
    zsetCommand(db: number, protocol: number, args: Buffer[]): string;
    stringCommand(db: number, protocol: number, args: Buffer[]): string;
    keyspaceCommand(db: number, protocol: number, args: Buffer[]): string;
    hyperloglogCommand(db: number, args: Buffer[]): string;
    serverCommand(session: number, db: number, protocol: number, args: Buffer[]): string;
    serverRelease(session: number): void;
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

const bytes = (value: string | Buffer): Buffer => Buffer.from(value);

export const decodeCommand = (input: string | Buffer): DecodedCommand | null => primitives().decodeCommand(bytes(input));
export const encodeCommand = (args: (string | Buffer)[]): Buffer => primitives().encodeCommand(args.map(bytes));
export const encodeReply = (spec: ReplySpec, protocol: number): Buffer => primitives().encodeReply(JSON.stringify(spec), protocol);
export const decodeReply = (input: string | Buffer): DecodedReply | null => primitives().decodeReply(bytes(input));
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

    /** Server-face commands keep their per-connection session state inside the binding. */
    serverCommand(session: number, db: number, protocol: number, args: (string | Buffer)[]): ReplySpec {
        return JSON.parse(this.native.serverCommand(session, db, protocol, args.map(bytes)));
    }

    /** Drops the embedded session of one connection that just closed. */
    serverRelease(session: number): void {
        this.native.serverRelease(session);
    }
}
