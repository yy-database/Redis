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
 * `expired_keys`.
 */
export function sweepExpired(store: Store, stats?: Record<string, number>): number {
    const expired = store.sweepExpired(Date.now());
    if (stats !== undefined && expired > 0) {
        stats.expired = (stats.expired ?? 0) + expired;
    }
    return expired;
}
