//! Pub/sub subscriptions, the server-wide hub and the `PUBSUB` plans.

import { array, bulk, error as replyError, integer, nullReply, push } from '../reply.js';
import type { ReplySpec } from '../reply.js';
import { globMatch } from './glob.js';
import { text } from './kinds.js';
import type { CommandPlan, Session, Subscriptions } from './session.js';

/** Commands Redis still honours while a RESP2 connection is in subscriber mode. */
export const SUBSCRIBER_COMMANDS: Set<string> = new Set(['subscribe', 'unsubscribe', 'psubscribe', 'punsubscribe', 'ping', 'quit', 'reset']);

/** Canonical map key of one channel or pattern so duplicate names deduplicate. */
function subscriptionKey(name: Buffer | string): string {
    return Buffer.from(name).toString('hex');
}

function ensureSubscriptions(session: Session): Subscriptions {
    if (session.subscriptions === undefined) {
        session.subscriptions = { channels: new Map(), patterns: new Map() };
    }
    return session.subscriptions;
}

export function subscribed(session: Session): boolean {
    const subscriptions = session.subscriptions;
    return subscriptions !== undefined && (subscriptions.channels.size > 0 || subscriptions.patterns.size > 0);
}

/**
 * Builds one ack frame per name for `SUBSCRIBE`/`PSUBSCRIBE` or `UNSUBSCRIBE`/`PUNSUBSCRIBE`.
 *
 * With no names the whole kind is removed, and when nothing was subscribed Redis still
 * answers one frame whose name is null. The trailing count is the total number of live
 * channel plus pattern subscriptions, exactly as the receiver-side Redis reports it.
 */
export function subscriptionFrames(session: Session, args: Buffer[], pattern: boolean, removing = false): ReplySpec[] {
    const subscriptions = ensureSubscriptions(session);
    const target = pattern ? subscriptions.patterns : subscriptions.channels;
    const kind = removing
        ? (pattern ? 'punsubscribe' : 'unsubscribe')
        : (pattern ? 'psubscribe' : 'subscribe');
    const frames: ReplySpec[] = [];
    if (removing && args.length === 1) {
        if (target.size === 0) {
            frames.push(push([bulk(kind), nullReply(), integer(subscriptions.channels.size + subscriptions.patterns.size)]));
            return frames;
        }
        for (const [key, name] of target) {
            target.delete(key);
            frames.push(push([bulk(kind), bulk(name), integer(subscriptions.channels.size + subscriptions.patterns.size)]));
        }
        return frames;
    }
    if (!removing) {
        for (const name of args.slice(1)) {
            const key = subscriptionKey(name);
            if (!target.has(key)) {
                target.set(key, Buffer.from(name));
            }
            frames.push(push([bulk(kind), bulk(name), integer(subscriptions.channels.size + subscriptions.patterns.size)]));
        }
        return frames;
    }
    for (const name of args.slice(1)) {
        target.delete(subscriptionKey(name));
        frames.push(push([bulk(kind), bulk(name), integer(subscriptions.channels.size + subscriptions.patterns.size)]));
    }
    return frames;
}

/** Delivers one published message to a single session, answering its receiver count. */
function deliverTo(session: Session, channel: Buffer | string, payload: Buffer | string): number {
    const subscriptions = session.subscriptions;
    if (subscriptions === undefined) {
        return 0;
    }
    const channelBytes = Buffer.from(channel);
    const payloadBytes = Buffer.from(payload);
    let delivered = 0;
    if (subscriptions.channels.has(subscriptionKey(channelBytes))) {
        session.deliver?.(push([bulk('message'), bulk(channelBytes), bulk(payloadBytes)]));
        delivered += 1;
    }
    for (const pattern of subscriptions.patterns.values()) {
        if (globMatch(pattern, channelBytes)) {
            session.deliver?.(push([bulk('pmessage'), bulk(pattern), bulk(channelBytes), bulk(payloadBytes)]));
            delivered += 1;
        }
    }
    return delivered;
}

/** Collects the active channels of one session, optionally filtered by a glob. */
function channelNames(session: Session, pattern?: Buffer): Buffer[] {
    const subscriptions = session.subscriptions;
    if (subscriptions === undefined) {
        return [];
    }
    const names: Buffer[] = [];
    for (const name of subscriptions.channels.values()) {
        if (pattern === undefined || globMatch(pattern, name)) {
            names.push(name);
        }
    }
    return names;
}

/** Counts the sessions subscribed directly to each requested channel. */
function channelSubscribers(session: Session, channels: Buffer[]): [Buffer, number][] {
    return channels.map(channel => {
        const key = subscriptionKey(channel);
        if (session.pubsub !== undefined) {
            return [channel, session.pubsub.countSubscribers(key)];
        }
        const subscriptions = session.subscriptions;
        return [channel, subscriptions !== undefined && subscriptions.channels.has(key) ? 1 : 0];
    });
}

/**
 * One server-wide pub/sub table.
 *
 * The server runs a single event loop, so a publish runs synchronously and writes the
 * push frame straight to each subscriber's socket through its `deliver` callback. That
 * keeps a subscriber's ack frames and deliveries ordered without a queue.
 */
export class PubSubHub {
    sessions: Set<Session>;

    constructor() {
        this.sessions = new Set();
    }

    attach(session: Session): void {
        this.sessions.add(session);
    }

    detach(session: Session): void {
        this.sessions.delete(session);
    }

    publish(channel: Buffer | string, payload: Buffer | string): number {
        let delivered = 0;
        for (const session of this.sessions) {
            delivered += deliverTo(session, channel, payload);
        }
        return delivered;
    }

    channels(pattern?: Buffer): Buffer[] {
        const names = new Map<string, Buffer>();
        for (const session of this.sessions) {
            for (const name of channelNames(session, pattern)) {
                names.set(subscriptionKey(name), name);
            }
        }
        return [...names.values()];
    }

    countSubscribers(key: string): number {
        let count = 0;
        for (const session of this.sessions) {
            if (session.subscriptions?.channels.has(key)) {
                count += 1;
            }
        }
        return count;
    }

    numpat(): number {
        let total = 0;
        for (const session of this.sessions) {
            total += session.subscriptions?.patterns.size ?? 0;
        }
        return total;
    }
}

export function publish(session: Session, channel: Buffer, payload: Buffer): number {
    if (session.pubsub !== undefined) {
        return session.pubsub.publish(channel, payload);
    }
    return deliverTo(session, channel, payload);
}

/** Resolved `PUBSUB` subcommand in lower case, `null` when absent or unknown. */
export function pubsubSubcommand(args: Buffer[]): string | null {
    if (args.length < 2) return null;
    const subcommand = text(args[1]).toLowerCase();
    return subcommand === 'channels' || subcommand === 'numsub' || subcommand === 'numpat' ? subcommand : null;
}

/**
 * The error Redis reports for a malformed `PUBSUB` call, before anything else.
 *
 * An absent or unknown subcommand and a bad `NUMPAT` arity differ in wording,
 * so each branch mirrors the text the real server answers with.
 */
export function pubsubSubcommandError(args: Buffer[], subcommand: string | null): ReplySpec | null {
    if (args.length < 2) {
        return replyError("ERR wrong number of arguments for 'pubsub' command");
    }
    const typed = text(args[1]);
    if (subcommand === null) {
        return replyError(`ERR unknown subcommand '${typed}'. Try PUBSUB HELP.`);
    }
    if (subcommand === 'channels' && args.length > 3) {
        return replyError(`ERR unknown subcommand or wrong number of arguments for '${typed}'. Try PUBSUB HELP.`);
    }
    if (subcommand === 'numpat' && args.length > 2) {
        return replyError("ERR wrong number of arguments for 'pubsub|numpat' command");
    }
    return null;
}

export function planPubsub(session: Session, args: Buffer[]): CommandPlan {
    const subcommand = pubsubSubcommand(args);
    const malformed = pubsubSubcommandError(args, subcommand);
    if (malformed !== null) {
        return { error: malformed };
    }
    if (subcommand === 'channels') {
        return {
            run: () => {
                const names = session.pubsub !== undefined
                    ? session.pubsub.channels(args[2])
                    : channelNames(session, args[2]);
                return array(names.map(name => bulk(name)));
            },
        };
    }
    if (subcommand === 'numsub') {
        return {
            run: () => {
                const pairs = channelSubscribers(session, args.slice(2));
                return array(pairs.flatMap(([name, count]) => [bulk(name), integer(count)]));
            },
        };
    }
    return {
        run: () => integer(session.pubsub !== undefined
            ? session.pubsub.numpat()
            : session.subscriptions?.patterns.size ?? 0),
    };
}
