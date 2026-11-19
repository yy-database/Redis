//! Pub/sub plans and the server-wide delivery hub.
//!
//! The subscription table, the subscriber-mode admission gate and the reply
//! counts live in the upstream gateway. This module only turns the returned
//! counts into reply specifications and routes the deliveries it reports to the
//! host connections that own them.

import type { Store } from '../native.js';
import { array, bulk, error as replyError, integer, nullReply, push } from '../reply.js';
import type { ReplySpec } from '../reply.js';
import { text } from './kinds.js';
import type { CommandPlan, Session } from './session.js';

/** Whether one session holds at least one channel or pattern subscription. */
export function isSubscribed(store: Store, session: Session): boolean {
    return store.pubsubSubscribed(session.id ?? 0);
}

/**
 * Builds one ack frame per name for `SUBSCRIBE`/`PSUBSCRIBE` or `UNSUBSCRIBE`/`PUNSUBSCRIBE`.
 *
 * With no names the whole kind is removed, and when nothing was subscribed Redis
 * still answers one frame whose name is null. The trailing count is the total
 * number of live channel plus pattern subscriptions, exactly as the gateway
 * reports it.
 */
export function subscriptionFrames(
    store: Store,
    session: Session,
    args: Buffer[],
    pattern: boolean,
    removing = false,
): ReplySpec[] {
    const id = session.id ?? 0;
    const kind = removing
        ? (pattern ? 'punsubscribe' : 'unsubscribe')
        : (pattern ? 'psubscribe' : 'subscribe');
    if (!removing) {
        return args.slice(1).map(name => push([
            bulk(kind),
            bulk(name),
            integer(store.pubsubSubscribe(id, name, pattern)),
        ]));
    }
    const names = args.length === 1 ? [] : args.slice(1);
    return store.pubsubUnsubscribe(id, names, pattern).map(ack => push([
        bulk(kind),
        ack.name == null ? nullReply() : bulk(ack.name),
        integer(ack.count),
    ]));
}

export function publish(session: Session, channel: Buffer, payload: Buffer): number {
    return session.pubsub?.publish(channel, payload) ?? 0;
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
 * so each branch mirrors the text the real server answers with. The
 * subscriber-mode gate upstream applies the same precedence.
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

export function planPubsub(store: Store, session: Session, args: Buffer[]): CommandPlan {
    const subcommand = pubsubSubcommand(args);
    const malformed = pubsubSubcommandError(args, subcommand);
    if (malformed !== null) {
        return { error: malformed };
    }
    if (subcommand === 'channels') {
        return { run: () => array(store.pubsubChannels(args[2]).map(name => bulk(name))) };
    }
    if (subcommand === 'numsub') {
        return {
            run: () => array(store.pubsubNumsub(args.slice(2)).flatMap(({ channel, count }) => [bulk(channel), integer(count)])),
        };
    }
    return { run: () => integer(store.pubsubNumpat()) };
}

/**
 * Server-wide pub/sub delivery over the gateway-owned subscription table.
 *
 * The gateway computes the delivery targets; the hub maps each client id back to
 * the host session and writes the push frame through its socket. That keeps the
 * ordering of ack frames and deliveries without a host-side subscription copy.
 */
export class PubSubHub {
    readonly sessions: Map<number, Session>;
    readonly #store: Store;

    constructor(store: Store) {
        this.#store = store;
        this.sessions = new Map();
    }

    attach(session: Session): void {
        if (session.id !== undefined) {
            this.sessions.set(session.id, session);
        }
    }

    detach(session: Session): void {
        if (session.id !== undefined) {
            this.sessions.delete(session.id);
            this.#store.pubsubDetach(session.id);
        }
    }

    publish(channel: Buffer | string, payload: Buffer | string): number {
        const deliveries = this.#store.pubsubPublish(channel, payload);
        let delivered = 0;
        for (const delivery of deliveries) {
            const target = this.sessions.get(delivery.client);
            if (target === undefined) {
                continue;
            }
            target.deliver?.(delivery.pattern == null
                ? push([bulk('message'), bulk(delivery.channel), bulk(delivery.payload)])
                : push([bulk('pmessage'), bulk(delivery.pattern), bulk(delivery.channel), bulk(delivery.payload)]));
            delivered += 1;
        }
        return delivered;
    }

    channels(pattern?: Buffer): Buffer[] {
        return this.#store.pubsubChannels(pattern);
    }

    numpat(): number {
        return this.#store.pubsubNumpat();
    }
}
