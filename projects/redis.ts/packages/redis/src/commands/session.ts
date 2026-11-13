//! The connection session a command runs against and the planned-command shapes.

import type { BlockingHub } from '../blocking.js';
import type { ReplySpec } from '../reply.js';

/** Channel and pattern subscriptions of one connection, keyed by hex name. */
export interface Subscriptions {
    channels: Map<string, Buffer>;
    patterns: Map<string, Buffer>;
}

/** The pub/sub table commands reach through the session. */
export interface PubSubTable {
    publish(channel: Buffer | string, payload: Buffer | string): number;
    channels(pattern?: Buffer): Buffer[];
    countSubscribers(key: string): number;
    numpat(): number;
}

/** One queued command replayed by `EXEC`. */
export type CommandRun = () => RunOutcome;

/** A reply plus the connection effects the binding reports for it. */
export interface ServerOutcome {
    reply: ReplySpec;
    close?: boolean;
    killed?: number[];
}

/** What one planned command run answers: a reply specification or a server outcome. */
export type RunOutcome = ReplySpec | ServerOutcome;

/** The descriptor `startServer` parks in the blocking hub. */
export interface BlockDescriptor {
    db: number;
    keys: (Buffer | string)[];
    timeoutMs: number;
    attempt: () => ReplySpec | null;
    timeoutReply: ReplySpec;
}

/** The outcome of planning one command: an error, a run, frames or a block. */
export interface CommandPlan {
    error?: ReplySpec;
    run?: CommandRun;
    frames?: () => ReplySpec[];
    block?: BlockDescriptor;
}

/** One key pinned by `WATCH`, with the version observed when the watch was taken. */
export interface WatchedKey {
    db: number;
    key: Buffer;
    version: number;
}

/** Server-wide options this product adds on top of the upstream command surface. */
export interface ServerSettings {
    appendfsync: 'always' | 'everysec';
    requirepass?: string;
    /** Raw `notify-keyspace-events` string, reported by `CONFIG GET`. */
    notifyKeyspaceEvents: string;
    notifications: { keyspace: boolean; keyevent: boolean; expired: boolean };
}

/**
 * One connection's session, as `server.js` builds it and the commands read it.
 *
 * The fields a command never touches stay optional so the untyped server and
 * the conformance harness can each supply what they own.
 */
export interface Session {
    id?: number;
    db?: number;
    protocol?: number;
    queued?: CommandRun[] | null;
    multiError?: boolean;
    watched?: WatchedKey[];
    /** `false` while the connection still owes an `AUTH`; absent means authorized. */
    authenticated?: boolean;
    /** Password configured on the server, absent when the default user has none. */
    requirepass?: string;
    /** Live server options, shared by every connection of one listener. */
    settings?: ServerSettings;
    hub?: BlockingHub;
    pubsub?: PubSubTable;
    clients?: Map<number, Session>;
    stats?: Record<string, number>;
    deliver?: (frame: ReplySpec) => void;
    subscriptions?: Subscriptions;
    kill?: () => void;
    name?: string;
    runId?: string;
    port?: number;
    bind?: string;
    remoteAddress?: { address?: string; port?: number };
    localAddress?: { address?: string; port?: number };
    fd?: number;
    libName?: string;
    libVer?: string;
    createdAt?: number;
    lastActivity?: number;
    commandCount?: number;
    serverStartedAt?: number;
}
