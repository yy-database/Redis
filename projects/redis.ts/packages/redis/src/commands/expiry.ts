//! Active expiry: the periodic sweep that accounts for keys past their deadline.
//!
//! The engine hides a record the moment its deadline elapses, so a sweep can only
//! observe keys that are still live. The tracker therefore remembers the deadline
//! of every key that had one at the previous pass; when the next pass finds that
//! deadline elapsed, the key expired in between and is counted. Keys whose record
//! is still reachable at an elapsed deadline (the boundary between two passes) are
//! deleted directly.

import type { Store } from '../native.js';
import { DATABASES, KINDS, SUFFIX } from './kinds.js';

/** Per-store tracker: `db:hexkey` -> the deadline observed at the previous sweep. */
const trackers = new WeakMap<Store, Map<string, number>>();

/** Drops one logical key from every kind namespace it could occupy. */
function removeKey(store: Store, db: number, key: Buffer): void {
    for (const kind of KINDS) {
        store.deleteKind(db, SUFFIX[kind], key);
    }
}

/**
 * Runs one expiry pass over all databases.
 *
 * Returns the number of keys accounted for as expired during the pass and, when a
 * `stats` object is given, adds it to `stats.expired` the way the upstream counts
 * `expired_keys`.
 */
export function sweepExpired(store: Store, stats?: Record<string, number>): number {
    const tracker = trackers.get(store) ?? new Map<string, number>();
    const now = Date.now();
    const observed = new Map<string, number>();
    const dropped = new Set<string>();
    let expired = 0;
    for (let db = 0; db < DATABASES; db += 1) {
        for (const key of store.keys(db)) {
            // One logical key can live in any kind namespace, and each namespace
            // carries its own deadline, so the sweep probes them in turn.
            let deadline: number | null = null;
            for (const kind of KINDS) {
                deadline = store.deadlineKind(db, SUFFIX[kind], key);
                if (deadline !== null) {
                    break;
                }
            }
            if (deadline === null) {
                continue;
            }
            if (deadline > now) {
                observed.set(`${db}:${key.toString('hex')}`, deadline);
                continue;
            }
            // Visible with an elapsed deadline: the boundary case where the record
            // has not been hidden yet. Drop it while the API can still reach it.
            removeKey(store, db, key);
            expired += 1;
            dropped.add(`${db}:${key.toString('hex')}`);
        }
    }
    for (const [id, deadline] of tracker) {
        // A tracked deadline that elapsed while the record went invisible is an
        // expiry; renewals, persists and deletes simply do not reappear here.
        if (deadline <= now && !observed.has(id) && !dropped.has(id)) {
            expired += 1;
        }
    }
    if (stats !== undefined && expired > 0) {
        stats.expired = (stats.expired ?? 0) + expired;
    }
    trackers.set(store, observed);
    return expired;
}
