//! Keyspace notification flags and publication helpers.
//!
//! The flag parser accepts the full Redis letter set so enabling another event
//! class later never changes the option grammar. Only the `expired` class is
//! emitted today, from the sweep that removes expired records.

import type { PubSubTable } from './commands/session.js';

/** Which notification channels and classes the server publishes. */
export interface NotificationFlags {
    /** Publish on `__keyspace@<db>__:<key>`. */
    keyspace: boolean;
    /** Publish on `__keyevent@<db>__:<event>`. */
    keyevent: boolean;
    /** Emit the `expired` class. */
    expired: boolean;
}

/** Parses a `notify-keyspace-events` string into the classes this server serves. */
export function parseNotificationFlags(text: string): NotificationFlags {
    const flags = new Set(text);
    const all = flags.has('A');
    return {
        keyspace: flags.has('K'),
        keyevent: flags.has('E'),
        expired: all || flags.has('x'),
    };
}

/** Publishes the `expired` event for one key on the channels its flags select. */
export function notifyExpired(pubsub: PubSubTable, flags: NotificationFlags, db: number, key: Buffer): void {
    if ((!flags.keyspace && !flags.keyevent) || !flags.expired) {
        return;
    }
    // Redis publishes the keyspace channel first, then the keyevent one.
    if (flags.keyspace) {
        pubsub.publish(Buffer.concat([Buffer.from(`__keyspace@${db}__:`), key]), Buffer.from('expired'));
    }
    if (flags.keyevent) {
        pubsub.publish(Buffer.from(`__keyevent@${db}__:expired`), key);
    }
}
