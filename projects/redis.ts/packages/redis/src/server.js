//! Socket loop composed from the native framing primitives.

import { createServer } from 'node:net';
import { BlockingHub } from './blocking.js';
import { execute } from './commands.js';
import { decodeCommand, encodeReply, Store } from './native.js';
import { error as replyError } from './reply.js';

const PROTOCOL_ERROR = 'ERR Protocol error or request limit exceeded';

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
    const hub = new BlockingHub();
    const listener = createServer(socket => {
        connections.add(socket);
        const session = { db: 0, protocol: 2, queued: null, name: '', hub };
        let pending = Buffer.alloc(0);
        let blocked = null;
        function pump() {
            while (pending.length > 0 && blocked === null) {
                let decoded;
                try {
                    decoded = decodeCommand(pending);
                }
                catch {
                    socket.write(encodeReply(replyError(PROTOCOL_ERROR), session.protocol));
                    socket.destroy();
                    return;
                }
                if (decoded === null) {
                    return;
                }
                pending = pending.subarray(decoded.consumed);
                const result = execute(store, session, decoded.args);
                if (result.block !== undefined) {
                    // Park the command until another connection pushes to one of
                    // its keys or its timeout fires. The reply is written by the
                    // hub callback instead of this loop.
                    blocked = {
                        ...result.block,
                        deliver: reply => {
                            blocked = null;
                            socket.write(encodeReply(reply, session.protocol));
                            if (!socket.destroyed) pump();
                        },
                    };
                    hub.wait(blocked);
                    return;
                }
                socket.write(encodeReply(result.reply, session.protocol));
                if (result.close) {
                    socket.end();
                    return;
                }
            }
        }
        socket.on('data', chunk => {
            pending = Buffer.concat([pending, chunk]);
            pump();
        });
        socket.on('close', () => {
            if (blocked !== null) hub.cancel(blocked);
            connections.delete(socket);
        });
        socket.on('error', () => connections.delete(socket));
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
