//! Socket loop composed from the native framing primitives.

import { createServer } from 'node:net';
import { BlockingHub } from './blocking.js';
import { execute, PubSubHub } from './commands.js';
import { decodeCommand, encodeReply, Store } from './native.js';
import { error as replyError } from './reply.js';

const PROTOCOL_ERROR = 'ERR Protocol error or request limit exceeded';

/** Run identifier reported by `INFO server`, one per process. */
const RUN_ID = Array.from({ length: 40 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
const SERVER_STARTED_AT = Date.now();

/**
 * Starts an emulated server bound to `host`, persisting through `.yyds` and `.yykv`.
 *
 * The caller owns the process lifetime. `close` flushes buffered counter updates,
 * stops the listener and the open connections, and leaves the storage directory
 * in place.
 */
export async function startServer({ dataDir, host = '127.0.0.1', port = 0 } = {}) {
    const store = new Store(dataDir);
    const connections = new Set();
    // Sessions keyed by client id, so `CLIENT LIST` and `CLIENT KILL` see peers.
    const clients = new Map();
    const stats = {
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
        const session = {
            id: nextClientId,
            createdAt: Date.now(),
            lastActivity: Date.now(),
            commandCount: 0,
            db: 0,
            protocol: 2,
            queued: null,
            name: '',
            hub,
            pubsub,
            clients,
            stats,
            runId: RUN_ID,
            serverStartedAt: SERVER_STARTED_AT,
            port: listener.address().port,
            bind: host,
            remoteAddress: { address: socket.remoteAddress, port: socket.remotePort },
            localAddress: { address: socket.localAddress, port: socket.localPort },
            fd: socket._handle?.fd >= 0 ? socket._handle.fd : nextClientId,
            libName: '',
            libVer: '',
            kill: () => socket.destroy(),
        };
        nextClientId += 1;
        clients.set(session.id, session);
        stats.connections += 1;
        // Publishing runs synchronously on this loop, so a subscriber's push
        // frame is written straight to its socket, after any ack frames of the
        // command that produced it.
        session.deliver = frame => {
            if (!socket.destroyed) socket.write(encodeReply(frame, session.protocol));
        };
        pubsub.attach(session);
        let pending = Buffer.alloc(0);
        let blocked = null;
        function send(frame) {
            const encoded = encodeReply(frame, session.protocol);
            stats.netOutput += encoded.length;
            socket.write(encoded);
        }
        function write(result) {
            if (result.frames !== undefined) {
                for (const frame of result.frames) send(frame);
                return;
            }
            if (result.reply === undefined) {
                return;
            }
            send(result.reply);
        }
        function pump() {
            while (pending.length > 0 && blocked === null) {
                let decoded;
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
                const result = execute(store, session, decoded.args);
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
                for (const id of result.killed ?? []) {
                    clients.get(id)?.kill();
                }
                if (result.close) {
                    socket.end();
                    return;
                }
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
            connections.delete(socket);
            clients.delete(session.id);
            store.serverRelease(session.id);
        });
        socket.on('error', () => {
            connections.delete(socket);
            clients.delete(session.id);
            store.serverRelease(session.id);
        });
    });
    await new Promise((resolve, reject) => {
        listener.once('error', reject);
        listener.listen(port, host, resolve);
    });
    const address = listener.address();
    return {
        host,
        port: address.port,
        dataDir: store.dataDir(),
        store,
        close: () => new Promise(resolve => {
            store.flush();
            for (const socket of connections) {
                socket.destroy();
            }
            connections.clear();
            listener.close(() => resolve());
        }),
    };
}
