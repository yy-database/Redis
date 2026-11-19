//! The connection session a command runs against and the planned-command shapes.

import type { BlockingHub } from '../blocking.js';
import type { CommandFrame } from '../native.js';
import type { ReplySpec } from '../reply.js';

/** The pub/sub delivery surface commands reach through the session. */
export interface PubSubTable {
    publish(channel: Buffer | string, payload: Buffer | string): number;
    channels(pattern?: Buffer): Buffer[];
    numpat(): number;
}

/**
 * One queued command replayed by `EXEC`.
 *
 * `frame` is the direct-execution fast path: the upstream facade already framed
 * the reply, so the host can write the bytes without a specification round trip.
 * A queued command replayed inside `EXEC` must use the specification form because
 * its reply is nested inside the transaction's array reply.
 */
export type CommandRun = (() => RunOutcome) & { frame?: () => CommandFrame };

/** What one planned command run answers: a reply specification. */
export type RunOutcome = ReplySpec;

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
    /** Password configured on the server, absent when the default user has none. */
    requirepass?: string;
    /** Live server options, shared by every connection of one listener. */
    settings?: ServerSettings;
    hub?: BlockingHub;
    pubsub?: PubSubTable;
    clients?: Map<number, Session>;
    stats?: Record<string, number>;
    deliver?: (frame: ReplySpec) => void;
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
