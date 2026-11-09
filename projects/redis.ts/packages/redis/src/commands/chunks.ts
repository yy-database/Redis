//! Chunk framing for the opaque per-kind values the shard stores.

import type { Store } from '../native.js';
import { KINDS, SUFFIX } from './kinds.js';
import type { Kind } from './kinds.js';

export const MAX_CHUNK = 0xffffffff;

/**
 * Frames a sequence of byte chunks as `u32le length + body` pairs.
 *
 * The shard stores one opaque value per kind, so a hash is its field/value pairs
 * and a list its elements. `null` means the encoded length does not fit `u32`.
 */
export function encodeChunks(chunks: Buffer[]): Buffer | null {
    let total = 0;
    for (const chunk of chunks) {
        if (chunk.length > MAX_CHUNK) return null;
        total += 4 + chunk.length;
    }
    const body = Buffer.allocUnsafe(total);
    let offset = 0;
    for (const chunk of chunks) {
        body.writeUInt32LE(chunk.length, offset);
        offset += 4;
        chunk.copy(body, offset);
        offset += chunk.length;
    }
    return body;
}

/** Reads the chunks framed by {@link encodeChunks}, `null` when the body is malformed. */
export function decodeChunks(body: Buffer): Buffer[] | null {
    const chunks: Buffer[] = [];
    let offset = 0;
    while (offset < body.length) {
        if (offset + 4 > body.length) return null;
        const length = body.readUInt32LE(offset);
        offset += 4;
        if (offset + length > body.length) return null;
        chunks.push(body.subarray(offset, offset + length));
        offset += length;
    }
    return chunks;
}

export function encodeHash(fields: [Buffer, Buffer][]): Buffer | null {
    return encodeChunks(fields.flatMap(([field, value]) => [field, value]));
}

export function decodeHash(body: Buffer): [Buffer, Buffer][] | null {
    const chunks = decodeChunks(body);
    if (chunks === null || chunks.length % 2 !== 0) return null;
    const fields: [Buffer, Buffer][] = [];
    for (let index = 0; index < chunks.length; index += 2) {
        fields.push([chunks[index], chunks[index + 1]]);
    }
    return fields;
}

/** Live string bytes, `null` when the key is missing. */
export function readString(store: Store, db: number, key: Buffer | string): Buffer | null {
    const body = store.getKind(db, SUFFIX.string, key);
    return body === null || body === undefined ? null : body;
}

/** Replaces the string bytes while carrying the deadline the key already holds. */
export function rewriteString(store: Store, db: number, key: Buffer | string, body: Buffer): void {
    const expiresAt = store.deadlineKind(db, SUFFIX.string, key);
    store.setKind(db, SUFFIX.string, key, body, expiresAt ?? null);
}

/** Live hash fields, `[]` when the hash is missing and `null` when the body is corrupt. */
export function readHash(store: Store, db: number, key: Buffer | string): [Buffer, Buffer][] | null {
    const body = store.getKind(db, SUFFIX.hash, key);
    return body === null || body === undefined ? [] : decodeHash(body);
}

/** Replaces one kind while carrying the deadline it already holds. */
export function rewriteKind(store: Store, db: number, kind: Kind, key: Buffer | string, body: Buffer): void {
    const expiresAt = store.deadlineKind(db, SUFFIX[kind], key);
    store.setKind(db, SUFFIX[kind], key, body, expiresAt ?? null);
}

/** Removes every representation of one logical key, whatever kind currently holds it. */
export function dropEveryKind(store: Store, db: number, key: Buffer | string): void {
    for (const kind of KINDS) {
        store.deleteKind(db, SUFFIX[kind], key);
    }
}
