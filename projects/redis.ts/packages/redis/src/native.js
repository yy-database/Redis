//! Loads the platform binding and re-exports its orthogonal primitives.

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

const platforms = {
    win32: { x64: 'win32-x64' },
    darwin: { arm64: 'darwin-arm64', x64: 'darwin-x64' },
    linux: { x64: 'linux-x64' },
};

let binding;

function load() {
    if (binding) {
        return binding;
    }
    if (process.env.REDIS_NATIVE_PATH) {
        binding = require(process.env.REDIS_NATIVE_PATH);
        return binding;
    }
    const platform = platforms[process.platform]?.[process.arch];
    if (!platform) {
        throw new Error(`no native binding for ${process.platform}-${process.arch}`);
    }
    const manifest = require.resolve(`@yydb/redis-${platform}/package.json`);
    binding = require(join(dirname(manifest), 'lib', `redis-${platform}.node`));
    return binding;
}

/** Resolves the wire and storage primitives exported by the platform binding. */
function primitives() {
    return load();
}

const bytes = value => Buffer.from(value);

export const decodeCommand = input => primitives().decodeCommand(bytes(input));
export const encodeCommand = args => primitives().encodeCommand(args.map(bytes));
export const encodeReply = (spec, protocol) => primitives().encodeReply(JSON.stringify(spec), protocol);
export const decodeReply = input => primitives().decodeReply(bytes(input));
export const parseInteger = value => primitives().parseInteger(bytes(value));
export const repairShard = dataDir => primitives().repairShard(String(dataDir));

export class Store {
    constructor(dataDir) {
        this.native = new (primitives().Store)(dataDir);
    }

    get(db, key) {
        const value = this.native.get(db, bytes(key));
        return value === null ? null : value.toString('utf8');
    }

    set(db, key, value, expiresAt = null) {
        return this.native.set(db, bytes(key), bytes(value), expiresAt);
    }

    delete(db, key) {
        return this.native.delete(db, bytes(key));
    }

    exists(db, key) {
        return this.native.exists(db, bytes(key));
    }

    deadline(db, key) {
        return this.native.deadline(db, bytes(key));
    }

    expire(db, key, expiresAt) {
        return this.native.expire(db, bytes(key), expiresAt);
    }

    /** Reads one kind (`""`, `hash` or `list`) as raw bytes. */
    getKind(db, kind, key) {
        const value = this.native.getKind(db, kind, bytes(key));
        return value === null ? null : Buffer.from(value);
    }

    /** Inserts or replaces one kind, keeping the value bytes untouched. */
    setKind(db, kind, key, value, expiresAt = null) {
        return this.native.setKind(db, kind, bytes(key), Buffer.from(value), expiresAt);
    }

    deleteKind(db, kind, key) {
        return this.native.deleteKind(db, kind, bytes(key));
    }

    existsKind(db, kind, key) {
        return this.native.existsKind(db, kind, bytes(key));
    }

    deadlineKind(db, kind, key) {
        return this.native.deadlineKind(db, kind, bytes(key));
    }

    expireKind(db, kind, key, expiresAt) {
        return this.native.expireKind(db, kind, bytes(key), expiresAt);
    }

    rename(db, source, destination, ifAbsent = false) {
        return this.native.rename(db, bytes(source), bytes(destination), ifAbsent);
    }

    append(db, key, suffix) {
        return this.native.append(db, bytes(key), bytes(suffix));
    }

    keys(db) {
        return this.native.keys(db);
    }

    setMany(db, keys, values) {
        return this.native.setMany(db, keys.map(bytes), values.map(bytes));
    }

    flush() {
        return this.native.flush();
    }

    incrBy(db, key, delta) {
        return this.native.incrBy(db, bytes(key), delta);
    }

    flushDb(db) {
        return this.native.flushDb(db);
    }

    size(db) {
        return this.native.size(db);
    }

    dataDir() {
        return this.native.dataDir();
    }
}
