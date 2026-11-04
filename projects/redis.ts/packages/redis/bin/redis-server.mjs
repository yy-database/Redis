#!/usr/bin/env node
//! Composes the server loop from the package primitives.

import { startServer } from '../src/server.js';

function usage() {
    return 'usage: redis-server [--host <host>] [--port <port>] [--data-dir <dir>]';
}

function parseArguments(argv) {
    const options = { host: '127.0.0.1', port: 6379, dataDir: 'data' };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--help' || argument === '-h') {
            console.log(usage());
            process.exit(0);
        }
        if (argument === '--host' || argument === '--port' || argument === '--data-dir') {
            const value = argv[index + 1];
            if (value === undefined) {
                throw new Error(`${argument} needs a value`);
            }
            index += 1;
            if (argument === '--host') options.host = value;
            else if (argument === '--port') options.port = Number.parseInt(value, 10);
            else options.dataDir = value;
            continue;
        }
        throw new Error(`unknown option ${argument}`);
    }
    if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
        throw new Error('port must be an integer in 0..65535');
    }
    return options;
}

try {
    const options = parseArguments(process.argv.slice(2));
    const server = await startServer(options);
    console.log(`ready to accept connections on ${server.host}:${server.port} using ${server.dataDir}`);
    const shutdown = () => server.close().then(() => process.exit(0));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}
catch (error) {
    console.error(String(error instanceof Error ? error.message : error));
    console.error(usage());
    process.exit(1);
}
