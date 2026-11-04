#!/usr/bin/env node
//! Command line client composed from the native framing primitives.

import { connect } from 'node:net';
import { createInterface } from 'node:readline';
import { decodeReply, encodeCommand } from '../src/native.js';

const USAGE = 'usage: redis-cli [-h <host>] [-p <port>] [-3] [command [argument ...]]';

function parseArguments(argv) {
    const options = { host: '127.0.0.1', port: 6379, resp3: false, command: [] };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--help') {
            console.log(USAGE);
            process.exit(0);
        }
        if (argument === '-h' || argument === '--host') {
            options.host = argv[index + 1];
            index += 1;
            continue;
        }
        if (argument === '-p' || argument === '--port') {
            options.port = Number.parseInt(argv[index + 1], 10);
            index += 1;
            continue;
        }
        if (argument === '-3' || argument === '--resp3') {
            options.resp3 = true;
            continue;
        }
        options.command = argv.slice(index);
        break;
    }
    return options;
}

/** Splits a command line into arguments, honouring single and double quotes. */
export function splitArguments(line) {
    const parts = [];
    let current = '';
    let quote = null;
    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (quote !== null) {
            if (character === '\\' && index + 1 < line.length) {
                index += 1;
                current += line[index];
                continue;
            }
            if (character === quote) {
                quote = null;
                continue;
            }
            current += character;
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            continue;
        }
        if (character === ' ' || character === '\t') {
            if (current.length > 0) {
                parts.push(current);
                current = '';
            }
            continue;
        }
        current += character;
    }
    if (quote !== null) {
        throw new Error('unbalanced quotes in request');
    }
    if (current.length > 0) {
        parts.push(current);
    }
    return parts;
}

function printReply(spec, prefix = '') {
    const padding = prefix.length > 0 ? `${prefix} ` : '';
    switch (spec.type) {
        case 'simple':
            console.log(`${padding}${spec.value}`);
            break;
        case 'int':
            console.log(`${padding}(integer) ${spec.value}`);
            break;
        case 'bulk':
            console.log(`${padding}${Buffer.from(spec.bytes ?? []).toString('utf8')}`);
            break;
        case 'null':
            console.log(`${padding}(nil)`);
            break;
        case 'error':
            console.log(`${padding}(error) ${spec.value}`);
            break;
        case 'array':
        case 'map':
            (spec.value ?? []).forEach((entry, index) => {
                if (Array.isArray(entry) && entry.length === 2 && spec.type === 'map') {
                    printReply(entry[0], `${prefix}${index})`);
                    printReply(entry[1], `${prefix}${index})`);
                }
                else {
                    printReply(entry, `${prefix}${index})`);
                }
            });
            break;
        default:
            console.log(`${padding}${JSON.stringify(spec)}`);
    }
}

class Connection {
    constructor(socket) {
        this.socket = socket;
        this.pending = Buffer.alloc(0);
    }

    request(args) {
        const request = encodeCommand(args.map(argument => Buffer.from(argument)));
        return new Promise((resolve, reject) => {
            const listener = chunk => {
                this.pending = Buffer.concat([this.pending, chunk]);
                try {
                    const decoded = decodeReply(this.pending);
                    if (decoded === null) {
                        return;
                    }
                    this.pending = this.pending.subarray(decoded.consumed);
                    this.socket.off('data', listener);
                    resolve(JSON.parse(decoded.spec));
                }
                catch (error) {
                    this.socket.off('data', listener);
                    reject(error);
                }
            };
            this.socket.on('data', listener);
            this.socket.once('error', reject);
            this.socket.write(request);
        });
    }

    async negotiate(protocol) {
        if (protocol === 3) {
            await this.request(['HELLO', '3']);
        }
    }
}

function openConnection(options) {
    return new Promise((resolve, reject) => {
        const socket = connect({ host: options.host, port: options.port });
        socket.once('error', reject);
        socket.once('connect', () => resolve(new Connection(socket)));
    });
}

async function runOnce(options, command, protocol) {
    const connection = await openConnection(options);
    await connection.negotiate(protocol);
    const reply = await connection.request(command);
    printReply(reply);
    connection.socket.end();
    return reply.type === 'error' ? 1 : 0;
}

async function runInteractive(options, protocol) {
    const connection = await openConnection(options);
    await connection.negotiate(protocol);
    const lines = createInterface({ input: process.stdin, output: process.stdout, terminal: false, prompt: '' });
    for await (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
            continue;
        }
        try {
            const args = splitArguments(trimmed);
            if (args.length === 0) {
                continue;
            }
            const reply = await connection.request(args);
            printReply(reply);
            if (args[0].toLowerCase() === 'quit') {
                break;
            }
        }
        catch (error) {
            console.log(`(error) ${error.message ?? error}`);
        }
    }
    connection.socket.end();
}

const options = parseArguments(process.argv.slice(2));
const protocol = options.resp3 ? 3 : 2;
try {
    if (options.command.length > 0) {
        process.exit(await runOnce(options, options.command, protocol));
    }
    await runInteractive(options, protocol);
}
catch (error) {
    console.error(String(error instanceof Error ? error.message : error));
    process.exit(1);
}

export { printReply };
