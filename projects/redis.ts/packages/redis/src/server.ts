//! Socket loop composed from the native framing primitives.

import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { createServer } from 'node:net';
import type { AddressInfo, Socket } from 'node:net';
import { join, resolve } from 'node:path';
import { BlockingHub } from './blocking.js';
import type { BlockEntry } from './blocking.js';
import { clearWatches, execute, PubSubHub } from './commands.js';
import { sweepExpired } from './commands/expiry.js';
import { slowlogObserve } from './commands/introspection.js';
import type { ExecuteResult } from './commands/execute.js';
import type { Session } from './commands/session.js';
import { decodeCommand, encodeReply, Store } from './native.js';
import type { DecodedCommand } from './native.js';
import { error as replyError } from './reply.js';
import type { ReplySpec } from './reply.js';
import { notifyExpired, parseNotificationFlags } from './notifications.js';

const PROTOCOL_ERROR = 'ERR Protocol error or request limit exceeded';

/** Run identifier reported by `INFO server`, one per process. */
const RUN_ID = Array.from({ length: 40 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
const SERVER_STARTED_AT = Date.now();

/** Lock file naming the process that serves a data directory. */
const LOCK_FILE = '.redis-server.lock';

/** Data directories locked by this process, with the number of live listeners. */
const processLocks = new Map<string, number>();

function pidAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}

function lockReleaser(directory: string): () => void {
    return () => {
        const held = processLocks.get(directory);
        if (held === undefined) {
            return;
        }
        if (held > 1) {
            processLocks.set(directory, held - 1);
            return;
        }
        processLocks.delete(directory);
        try {
            unlinkSync(join(directory, LOCK_FILE));
        }
        catch {
            // The holder of a reclaimed lock may already have replaced ours.
        }
    };
}

/**
 * Claims exclusive use of one data directory for the lifetime of a listener.
 *
 * A second server on the same directory is refused while its holder lives; a
 * lock left behind by a dead process is reclaimed. Listeners opened in this very
 * process share the claim, so one engine can serve several endpoints.
 */
function acquireDataDirLock(dataDir: string): () => void {
    const directory = resolve(dataDir);
    if (processLocks.has(directory)) {
        processLocks.set(directory, (processLocks.get(directory) ?? 0) + 1);
        return lockReleaser(directory);
    }
    mkdirSync(directory, { recursive: true });
    const path = join(directory, LOCK_FILE);
    const claim = () => {
        const fd = openSync(path, 'wx');
        try {
            writeSync(fd, String(process.pid));
        }
        finally {
            closeSync(fd);
        }
    };
    try {
        claim();
    }
    catch (error) {
        const cause = error as NodeJS.ErrnoException;
        if (cause.code !== 'EEXIST') {
            throw cause;
        }
        const owner = Number.parseInt(readFileSync(path, 'utf8').trim(), 10);
        if (Number.isInteger(owner) && owner > 0 && owner !== process.pid && pidAlive(owner)) {
            throw new Error(`data directory '${directory}' is already served by process ${owner}; stop that server or choose another directory`);
        }
        unlinkSync(path);
        claim();
    }
    processLocks.set(directory, 1);
    return lockReleaser(directory);
}

/** Per-connection counters and traffic totals reported through the server face. */
interface ServerStats {
    [counter: string]: number;
    connections: number;
    commands: number;
    netInput: number;
    netOutput: number;
    reads: number;
    writes: number;
    expired: number;
    evicted: number;
    hits: number;
    misses: number;
    pubsubChannels: number;
    pubsubPatterns: number;
}

/** The handle `startServer` answers with. */
export interface ServerHandle {
    host: string;
    port: number;
    dataDir: string;
    store: Store;
    close: () => Promise<void>;
    /** Registers the callback a `SHUTDOWN` runs after the server is torn down. */
    onShutdown: (callback: () => void) => void;
}

/**
 * Starts an emulated server bound to `host`, persisting through `.yyds` and `.yykv`.
 *
 * The caller owns the process lifetime. `close` flushes buffered counter updates,
 * stops the listener and the open connections, and leaves the storage directory
 * in place. Passing an existing `store` binds the listener to that engine instead
 * of opening a second one on `dataDir`. The directory is claimed through a lock
 * file for as long as a listener serves it, and a periodic sweep accounts for
 * keys whose deadline elapsed while the server ran.
 */
export async function startServer(
    {
        dataDir,
        host = '127.0.0.1',
        port = 0,
        store: providedStore,
        appendfsync = 'everysec',
        requirepass,
        notifyKeyspaceEvents = '',
    }: {
        dataDir?: string;
        host?: string;
        port?: number;
        store?: Store;
        /** `everysec` syncs once per second, `always` syncs on every snapshot write. */
        appendfsync?: 'always' | 'everysec';
        /** Password for the default user; absent leaves the server open. */
        requirepass?: string;
        /** Keyspace notification flags; only the `expired` class is emitted today. */
        notifyKeyspaceEvents?: string;
    } = {},
): Promise<ServerHandle> {
    const directory = providedStore !== undefined ? providedStore.dataDir() : dataDir as string;
    const releaseLock = acquireDataDirLock(directory);
    let store: Store;
    try {
        store = providedStore ?? new Store(dataDir as string);
    }
    catch (error) {
        releaseLock();
        throw error;
    }
    store.setSyncAlways(appendfsync === 'always');
    const connections = new Set<Socket>();
    // Sessions keyed by client id, so `CLIENT LIST` and `CLIENT KILL` see peers.
    const clients = new Map<number, Session>();
    const stats: ServerStats = {
        connections: 0,
        commands: 0,
        netInput: 0,
        netOutput: 0,
        reads: 0,
        writes: 0,
        expired: 0,
        evicted: 0,
        hits: 0,
        misses: 0,
        pubsubChannels: 0,
        pubsubPatterns: 0,
    };
    let nextClientId = 1;
    const hub = new BlockingHub();
    const pubsub = new PubSubHub();
    const listener = createServer(socket => {
        connections.add(socket);
        const id = nextClientId;
        const handle = (socket as unknown as { _handle?: { fd?: number } })._handle;
        const session: Session = {
            id,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            commandCount: 0,
            db: 0,
            protocol: 2,
            queued: null,
            watched: [],
            authenticated: requirepass === undefined,
            requirepass,
            name: '',
            hub,
            pubsub,
            clients,
            stats,
            runId: RUN_ID,
            serverStartedAt: SERVER_STARTED_AT,
            port: (listener.address() as AddressInfo).port,
            bind: host,
            remoteAddress: { address: socket.remoteAddress, port: socket.remotePort },
            localAddress: { address: socket.localAddress, port: socket.localPort },
            fd: handle?.fd !== undefined && handle.fd >= 0 ? handle.fd : id,
            libName: '',
            libVer: '',
            kill: () => socket.destroy(),
        };
        nextClientId += 1;
        clients.set(id, session);
        stats.connections += 1;
        // Publishing runs synchronously on this loop, so a subscriber's push
        // frame is written straight to its socket, after any ack frames of the
        // command that produced it.
        session.deliver = frame => {
            if (!socket.destroyed) socket.write(encodeReply(frame, session.protocol as number));
        };
        pubsub.attach(session);
        let pending = Buffer.alloc(0);
        let blocked: BlockEntry | null = null;
        function send(frame: ReplySpec): void {
            const encoded = encodeReply(frame, session.protocol as number);
            stats.netOutput += encoded.length;
            socket.write(encoded);
        }
        function write(result: ExecuteResult): void {
            if (result.frames !== undefined) {
                for (const frame of result.frames) send(frame);
                return;
            }
            if (result.reply === undefined) {
                return;
            }
            send(result.reply as ReplySpec);
        }
        function pump(): void {
            if (pending.length === 0 || blocked !== null) {
                return;
            }
            // One socket read can carry a whole pipelined burst or a `MULTI`
            // queue. Mutations land in memory as each command runs, and the
            // shard is rewritten once when the burst ends instead of once per
            // command. Replies are already buffered on the socket before the
            // batch closes, so no client observes the deferred write.
            store.beginBatch();
            try {
                while (pending.length > 0 && blocked === null) {
                    let decoded: DecodedCommand | null;
                    try {
                        decoded = decodeCommand(pending);
                    }
                    catch {
                        send(replyError(PROTOCOL_ERROR));
                        socket.destroy();
                        return;
                    }
                    if (decoded === null) {
                        return;
                    }
                    pending = pending.subarray(decoded.consumed);
                    // Redis consumes `*0` and a negative multibulk length as an
                    // empty request and never answers it, so the loop just moves on.
                    if (decoded.args.length === 0) {
                        continue;
                    }
                    const startedAt = process.hrtime.bigint();
                    const result = execute(store, session, decoded.args);
                    if (result.block === undefined) {
                        slowlogObserve(Number((process.hrtime.bigint() - startedAt) / 1000n), decoded.args, session);
                    }
                    if (result.block !== undefined) {
                        // Park the command until another connection pushes to one of
                        // its keys or its timeout fires. The reply is written by the
                        // hub callback instead of this loop.
                        blocked = {
                            ...result.block,
                            deliver: reply => {
                                blocked = null;
                                send(reply);
                                if (!socket.destroyed) pump();
                            },
                        };
                        hub.wait(blocked);
                        return;
                    }
                    write(result);
                    // A peer `CLIENT KILL` is reported by the binding, because the
                    // killed connection lives on another socket owned by this loop.
                    for (const killed of result.killed ?? []) {
                        clients.get(killed)?.kill();
                    }
                    if (result.shutdown) {
                        // `SHUTDOWN` has already persisted when it asked to leave;
                        // the whole server goes down, so this loop stops pumping.
                        performShutdown();
                        return;
                    }
                    if (result.close) {
                        socket.end();
                        return;
                    }
                }
            }
            finally {
                store.endBatch();
            }
        }
        socket.on('data', chunk => {
            stats.netInput += chunk.length;
            stats.reads += 1;
            pending = Buffer.concat([pending, chunk]);
            pump();
        });
        socket.on('close', () => {
            if (blocked !== null) hub.cancel(blocked);
            pubsub.detach(session);
            clearWatches(store, session);
            connections.delete(socket);
            clients.delete(id);
            store.serverRelease(id);
        });
        socket.on('error', () => {
            clearWatches(store, session);
            connections.delete(socket);
            clients.delete(id);
            store.serverRelease(id);
        });
    });
    try {
        await new Promise<void>((resolveListen, rejectListen) => {
            listener.once('error', rejectListen);
            listener.listen(port, host, resolveListen);
        });
    }
    catch (error) {
        releaseLock();
        throw error;
    }
    const notifications = parseNotificationFlags(notifyKeyspaceEvents);
    // Active expiry: the upstream samples the keyspace on a fast cadence, so a
    // hundred-millisecond sweep keeps `expired` close to the real counter.
    const expiryTimer = setInterval(() => {
        sweepExpired(store, stats, (db, key) => notifyExpired(pubsub, notifications, db, key));
    }, 100);
    expiryTimer.unref();
    // The buffered counters reach the shard on a one-second cadence, and the
    // `everysec` fsync policy makes the shard stable on the same cadence, so a
    // power loss loses at most one second of accounting rather than the whole
    // session. Under `always` both calls are no-ops.
    const flushTimer = setInterval(() => {
        store.flush();
        store.sync();
    }, 1000);
    flushTimer.unref();
    const shutdownCallbacks: Array<() => void> = [];
    let torn = false;
    const teardown = (): Promise<void> => new Promise<void>(resolve => {
        if (torn) {
            resolve();
            return;
        }
        torn = true;
        clearInterval(expiryTimer);
        clearInterval(flushTimer);
        store.flush();
        store.sync();
        releaseLock();
        for (const socket of connections) {
            socket.destroy();
        }
        connections.clear();
        listener.close(() => resolve());
    });
    const performShutdown = () => {
        void teardown().then(() => {
            for (const callback of shutdownCallbacks) {
                callback();
            }
        });
    };
    const address = listener.address() as AddressInfo;
    return {
        host,
        port: address.port,
        dataDir: store.dataDir(),
        store,
        close: teardown,
        onShutdown: callback => {
            shutdownCallbacks.push(callback);
        },
    };
}
