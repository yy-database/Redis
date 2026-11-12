//! Reply specifications exchanged with the native encoder.

/** One RESP reply as the plain object the native encoder consumes. */
export type ReplySpec =
    | { type: 'simple' | 'error'; value: string }
    | { type: 'int'; value: number }
    | { type: 'null' | 'null-array' }
    | { type: 'array' | 'push'; value: ReplySpec[] }
    | { type: 'bulk'; bytes?: number[]; b64?: string; value?: string }
    | { type: 'map'; value: [ReplySpec, ReplySpec][] };

export const simple = (value: string): ReplySpec => ({ type: 'simple', value });
export const error = (value: string): ReplySpec => ({ type: 'error', value });
export const integer = (value: number): ReplySpec => ({ type: 'int', value });
export const nullReply = (): ReplySpec => ({ type: 'null' });
export const nullArray = (): ReplySpec => ({ type: 'null-array' });
export const array = (values: ReplySpec[]): ReplySpec => ({ type: 'array', value: values });
/** Push frame: `>` under RESP3, a plain array under RESP2. */
export const push = (values: ReplySpec[]): ReplySpec => ({ type: 'push', value: values });

/** Payload size from which a bulk reply crosses the binding as base64. */
export const BULK_SPEC_BASE64_THRESHOLD = 4096;

export function bulk(value: string | Buffer | null | undefined): ReplySpec {
    if (value === null || value === undefined) {
        return nullReply();
    }
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
    if (bytes.length >= BULK_SPEC_BASE64_THRESHOLD) {
        return { type: 'bulk', b64: bytes.toString('base64') };
    }
    return { type: 'bulk', bytes: Array.from(bytes) };
}

export function map(entries: [string | Buffer, ReplySpec][]): ReplySpec {
    return { type: 'map', value: entries.map(([key, value]) => [bulk(key), value]) };
}

/** Reads the bytes carried by a bulk specification. */
export function bulkBytes(spec: ReplySpec): Buffer | null {
    if (spec.type !== 'bulk') {
        return null;
    }
    if (spec.b64 !== undefined) {
        return Buffer.from(spec.b64, 'base64');
    }
    return Buffer.from(spec.bytes ?? Buffer.from(spec.value ?? ''));
}
