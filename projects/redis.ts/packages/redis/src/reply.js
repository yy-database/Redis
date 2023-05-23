//! Reply specifications exchanged with the native encoder.

export const simple = value => ({ type: 'simple', value });
export const error = value => ({ type: 'error', value });
export const integer = value => ({ type: 'int', value });
export const nullReply = () => ({ type: 'null' });
export const array = values => ({ type: 'array', value: values });

export function bulk(value) {
    if (value === null || value === undefined) {
        return nullReply();
    }
    return { type: 'bulk', bytes: Array.from(Buffer.isBuffer(value) ? value : Buffer.from(String(value))) };
}

export function map(entries) {
    return { type: 'map', value: entries.map(([key, value]) => [bulk(key), value]) };
}

/** Reads the bytes carried by a bulk specification. */
export function bulkBytes(spec) {
    if (spec.type !== 'bulk') {
        return null;
    }
    return Buffer.from(spec.bytes ?? Buffer.from(spec.value ?? ''));
}
