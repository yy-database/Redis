//! Scan cursors, scan options and random-member sampling.

import { parseInteger } from '../native.js';
import { error as replyError } from '../reply.js';
import type { ReplySpec } from '../reply.js';
import { text } from './kinds.js';

/** Parses one `SSCAN`-style cursor in canonical decimal form, `null` when it is not. */
export function parseScanCursor(raw: Buffer): number | null {
    const cursorText = text(raw);
    if (!/^\d+$/.test(cursorText)) return null;
    const cursor = Number(cursorText);
    return Number.isFinite(cursor) ? cursor : null;
}

/** Parses `MATCH` and `COUNT` options shared by the collection scans. */
export function parseScanOptions(args: Buffer[], from: number): { error?: ReplySpec; pattern?: Buffer | null; count?: number } {
    let pattern: Buffer | null = null;
    let count = 10;
    for (let index = from; index < args.length; index += 2) {
        const option = text(args[index]).toLowerCase();
        const raw = args[index + 1];
        if (raw === undefined) return { error: replyError('ERR syntax error') };
        if (option === 'match') {
            pattern = raw;
            continue;
        }
        if (option === 'count') {
            const amount = parseInteger(raw);
            if (amount === null || amount <= 0) return { error: replyError('ERR syntax error') };
            count = amount;
            continue;
        }
        return { error: replyError('ERR syntax error') };
    }
    return { pattern, count };
}

/** Picks one random member, `null` when the collection is empty. */
export function randomMember<T>(members: T[]): T | null {
    if (members.length === 0) return null;
    return members[Math.floor(Math.random() * members.length)];
}

/** Samples `count` members: positive counts are unique, negative counts allow repeats. */
export function sampleMembers<T>(members: T[], count: number): T[] {
    if (count === 0 || members.length === 0) return [];
    if (count < 0) {
        const picks: T[] = [];
        for (let index = 0; index < -count; index += 1) picks.push(randomMember(members));
        return picks;
    }
    const pool = members.slice();
    const take = Math.min(count, pool.length);
    for (let index = 0; index < take; index += 1) {
        const swap = index + Math.floor(Math.random() * (pool.length - index));
        const held = pool[index];
        pool[index] = pool[swap];
        pool[swap] = held;
    }
    return pool.slice(0, take);
}
