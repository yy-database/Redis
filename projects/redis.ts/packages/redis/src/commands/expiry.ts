//! Active expiry: the periodic sweep that accounts for keys past their deadline.
//!
//! The shard keeps records whose deadline elapsed; reads hide them, and this
//! sweep deletes them. The walk happens in the native store, so one pass over a
//! large keyspace costs a single call instead of six probes per key.

import type { Store } from '../native.js';

/**
 * Runs one expiry pass over all databases.
 *
 * Returns the number of keys that expired during the pass and, when a `stats`
 * object is given, adds it to `stats.expired` the way the upstream counts
 * `expired_keys`. `onExpired` receives every key the pass removed, which is what
 * the server uses to publish keyspace notifications.
 */
export function sweepExpired(
    store: Store,
    stats?: Record<string, number>,
    onExpired?: (db: number, key: Buffer) => void,
): number {
    const expired = store.sweepExpired(Date.now());
    for (const entry of expired) {
        onExpired?.(entry.db, entry.key);
    }
    if (stats !== undefined && expired.length > 0) {
        stats.expired = (stats.expired ?? 0) + expired.length;
    }
    return expired.length;
}
