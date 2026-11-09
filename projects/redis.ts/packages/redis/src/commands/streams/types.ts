//! Shared stream state shapes for the `streams` modules.

import type { ReplySpec } from '../../reply.js';

/** One stream id: a millisecond part and a sequence part. */
export interface StreamId {
    ms: bigint;
    seq: bigint;
}

/** One stream entry: its id halves and its field pairs. */
export interface StreamEntry extends StreamId {
    fields: [Buffer, Buffer][];
}

/** One pending entry inside a consumer group. */
export interface StreamPending extends StreamId {
    deliveryTime: number;
    deliveryCount: number;
}

/** One consumer of a group, with its pending entries. */
export interface StreamConsumer {
    name: Buffer;
    seenTime: number;
    activeTime: number;
    deliveryTime: number;
    pending: StreamPending[];
}

/** One consumer group of a stream. */
export interface StreamGroup {
    name: Buffer;
    lastId: StreamId;
    entriesRead: number | null;
    consumers: StreamConsumer[];
}

/** The metadata a body carries beyond the surviving entries. */
export interface StreamMeta {
    entriesAdded: number;
    maxDeleted: StreamId;
    groups: StreamGroup[];
}

/** Decoded stream state; `error` marks a corrupt body. */
export interface StreamState extends StreamMeta {
    entries: StreamEntry[];
    last: StreamId;
    error?: boolean;
}

/** One pending row paired with the consumer holding it. */
export interface PendingRow {
    consumer: StreamConsumer;
    pending: StreamPending;
}

/** A parsed `MAXLEN` threshold. */
export interface MaxLen {
    approx: boolean;
    value: number;
    limit: number | null;
}

/** A parsed `MINID` threshold. */
export interface MinId {
    approx: boolean;
    id: StreamId;
    limit: number | null;
}

/** The outcome of parsing one range bound. */
export interface StreamBound {
    id: StreamId;
    exclusive: boolean;
}

/** The outcome of `XADD` id resolution: an id, `{error}` or `null`. */
export interface ResolvedStreamId {
    ms?: bigint;
    seq?: bigint;
    error?: string;
}

/** The outcome of parsing the `NOMKSTREAM` / `MAXLEN` / `MINID` prefix. */
export interface TrimParse {
    error?: ReplySpec;
    nomkstream?: boolean;
    maxlen?: MaxLen | null;
    minid?: MinId | null;
    index?: number;
}

/** Decoded stream or the reply a group command owes a missing or wrong-typed key. */
export interface StreamLookup {
    missing?: boolean;
    error?: ReplySpec;
    stream?: StreamState;
}
