//! Introspection command family: `WAIT`, `LATENCY`, `SLOWLOG` and `MEMORY`.
//!
//! The semantics follow the upstream command implementations: a single
//! instance has no replicas, no latency events and no allocator statistics,
//! so the answers that depend on those subsystems collapse to the shapes the
//! real server produces in the same situation.

import { parseInteger } from '../native.js';
import type { Store } from '../native.js';
import { array, bulk, error as replyError, integer, map, nullReply, simple } from '../reply.js';
import type { ReplySpec } from '../reply.js';
import { blockingPlan } from './blocking-plan.js';
import { DATABASES, kindOf, text, wrongArity } from './kinds.js';
import type { CommandPlan, Session } from './session.js';

/** Upstream echoes the subcommand exactly as typed, capped at 128 bytes. */
function subcommandSyntaxError(command: string, typed: string): ReplySpec {
    return replyError(`ERR Unknown subcommand or wrong number of arguments for '${typed.slice(0, 128)}'. Try ${command} HELP.`);
}

/* ---------------------------------- WAIT ---------------------------------- */

/**
 * Plans `WAIT numreplicas timeout`.
 *
 * A single instance never has a replica to acknowledge, so the answered count
 * is always zero. `numreplicas <= 0` is satisfied without blocking, and any
 * larger value parks the connection for `timeout` milliseconds and answers
 * zero when it expires, exactly like the upstream timeout path. A timeout of
 * zero blocks forever, which is what the upstream documents for `WAIT`.
 * Inside `MULTI` the blocking context is denied, so the plan also carries the
 * immediate non-blocking `run` form.
 */
function planWait(session: Session, args: Buffer[]): CommandPlan {
    if (args.length !== 3) {
        return { error: wrongArity('wait') };
    }
    const numreplicas = parseInteger(args[1]);
    if (numreplicas === null) {
        return { error: replyError('ERR value is not an integer or out of range') };
    }
    const timeout = parseInteger(args[2]);
    if (timeout === null) {
        return { error: replyError('ERR timeout is not an integer or out of range') };
    }
    if (timeout < 0) {
        return { error: replyError('ERR timeout is negative') };
    }
    if (numreplicas <= 0) {
        return { run: () => integer(0) };
    }
    return blockingPlan(session.db ?? 0, [], timeout, () => null, integer(0));
}

/* -------------------------------- LATENCY --------------------------------- */

/** The report upstream answers when the latency monitor was never enabled. */
const LATENCY_DOCTOR_DISABLED =
    'I\'m sorry, Dave, I can\'t do that. Latency monitoring is disabled in this Redis instance. '
    + 'You may use "CONFIG SET latency-monitor-threshold <milliseconds>." in order to enable it. '
    + 'If we weren\'t in a deep space mission I\'d suggest to take a look at '
    + 'https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/latency-monitor.\n';

const LATENCY_HELP: string[] = [
    'LATENCY <subcommand> [<arg> [value] [opt] ...]. Subcommands are:',
    'DOCTOR',
    '    Return a human readable latency analysis report.',
    'GRAPH <event>',
    '    Return an ASCII latency graph for the <event> class.',
    'HISTORY <event>',
    '    Return time-latency samples for the <event> class.',
    'LATEST',
    '    Return the latest latency samples for all events.',
    'RESET [<event> ...]',
    '    Reset latency data of one or more <event> classes.',
    '    (default: reset all data for all event classes)',
    'HISTOGRAM [COMMAND ...]',
    '    Return a cumulative distribution of latencies in the format of a histogram for the specified command names.',
    '    If no commands are specified then all histograms are replied.',
    'HELP',
    '    Print this help.',
];

/**
 * Plans the `LATENCY` family.
 *
 * This server records no latency events, so `LATEST` and `HISTORY` answer with
 * empty arrays, `RESET` answers the number of events it cleared (always zero)
 * and `GRAPH` reports the upstream "no samples" error for the requested event.
 */
function planLatency(args: Buffer[]): CommandPlan {
    if (args.length < 2) {
        return { error: wrongArity('latency') };
    }
    const typed = text(args[1]);
    const subcommand = typed.toLowerCase();
    if (subcommand === 'latest' && args.length === 2) {
        return { run: () => array([]) };
    }
    if (subcommand === 'history' && args.length === 3) {
        return { run: () => array([]) };
    }
    if (subcommand === 'graph' && args.length === 3) {
        return { run: () => replyError(`ERR No samples available for event '${text(args[2])}'`) };
    }
    if (subcommand === 'doctor' && args.length === 2) {
        return { run: () => bulk(LATENCY_DOCTOR_DISABLED) };
    }
    if (subcommand === 'reset' && args.length >= 2) {
        return { run: () => integer(0) };
    }
    if (subcommand === 'histogram' && args.length >= 2) {
        return { run: () => map([]) };
    }
    if (subcommand === 'help' && args.length === 2) {
        return { run: () => array(LATENCY_HELP.map(line => bulk(line))) };
    }
    return { error: subcommandSyntaxError('LATENCY', typed) };
}

/* -------------------------------- SLOWLOG --------------------------------- */

/** Execution time in microseconds a command must exceed to be logged. */
export const SLOWLOG_LOG_SLOWER_THAN_US = 10000;
/** Entries kept in the ring buffer, the upstream `slowlog-max-len` default. */
export const SLOWLOG_MAX_LEN = 128;
/** Argument array truncation of one logged command, the upstream default. */
export const SLOWLOG_MAX_ARGC = 32;
/** Upstream trims each logged string argument to this many bytes. */
export const SLOWLOG_MAX_STRING_LEN = 128;

/**
 * Live `slowlog-log-slower-than` and `slowlog-max-len`.
 *
 * `CONFIG SET` changes them on the running server, so the log never keeps a
 * startup copy. A negative threshold disables logging, matching upstream.
 */
let slowlogThresholdUs = SLOWLOG_LOG_SLOWER_THAN_US;
let slowlogCapacity = SLOWLOG_MAX_LEN;

/** Current `slowlog-log-slower-than`, in microseconds. */
export function slowlogLogSlowerThanUs(): number {
    return slowlogThresholdUs;
}

/** Current `slowlog-max-len`. */
export function slowlogMaxLen(): number {
    return slowlogCapacity;
}

/** Applies a live `slowlog-log-slower-than`; a negative value disables logging. */
export function setSlowlogLogSlowerThan(thresholdUs: number): void {
    slowlogThresholdUs = thresholdUs;
}

/** Applies a live `slowlog-max-len` and trims the log immediately. */
export function setSlowlogMaxLen(maxLen: number): void {
    slowlogCapacity = maxLen;
    slowlogTrim();
}

/** One logged slow query, shaped like the upstream `slowlogEntry`. */
export interface SlowlogEntry {
    id: number;
    /** Unix seconds at which the command was processed. */
    time: number;
    /** Execution time in microseconds. */
    duration: number;
    /** Command and its arguments, truncated per the upstream limits. */
    argv: Buffer[];
    peerid: string;
    cname: string;
    /** Original argument count, captured before truncation. */
    cmdArgc: number;
}

/** The process-wide log: `SLOWLOG` state is server-wide, never per connection. */
const slowlog: SlowlogEntry[] = [];
let slowlogEntryId = 0;

const SLOWLOG_HELP: string[] = [
    'SLOWLOG <subcommand> [<arg> [value] [opt] ...]. Subcommands are:',
    'GET [<count>]',
    '    Return top <count> entries from the slowlog (default: 10, -1 mean all).',
    '    Entries are made of:',
    '    id, timestamp, time in microseconds, arguments array, client IP and port,',
    '    client name, total argument count',
    'LEN',
    '    Return the length of the slowlog.',
    'RESET',
    '    Reset the slowlog.',
    'HELP',
    '    Print this help.',
];

/** Trims one logged argument the way the upstream entry builder does. */
function slowlogTrimArg(arg: Buffer): Buffer {
    if (arg.length <= SLOWLOG_MAX_STRING_LEN) {
        return arg;
    }
    return Buffer.concat([arg.subarray(0, SLOWLOG_MAX_STRING_LEN), Buffer.from('...')]);
}

/** Drops the oldest entries so the log never exceeds the live capacity. */
function slowlogTrim(): void {
    while (slowlog.length > slowlogCapacity) {
        slowlog.pop();
    }
}

/**
 * Records one executed command in the slow log.
 *
 * The socket loop calls this after `execute` with the wall-clock execution
 * time in microseconds and the connection's session; the command is logged
 * only when it reaches the threshold, and the entry keeps the newest first.
 * Returns whether an entry was added.
 */
export function slowlogObserve(durationUs: number, args: Buffer[], session: Session): boolean {
    if (slowlogThresholdUs < 0 || durationUs < slowlogThresholdUs) {
        return false;
    }
    const cmdArgc = args.length;
    let argv = args.map(slowlogTrimArg);
    if (argv.length > SLOWLOG_MAX_ARGC) {
        const omitted = argv.length - SLOWLOG_MAX_ARGC + 1;
        argv = argv.slice(0, SLOWLOG_MAX_ARGC - 1).concat(Buffer.from(`... (${omitted} more arguments)`));
    }
    const remote = session.remoteAddress;
    slowlog.unshift({
        id: slowlogEntryId++,
        time: Math.floor(Date.now() / 1000),
        duration: durationUs,
        argv,
        peerid: remote?.address !== undefined ? `${remote.address}:${remote.port ?? 0}` : '',
        cname: session.name ?? '',
        cmdArgc,
    });
    slowlogTrim();
    return true;
}

/** Alias of {@link slowlogObserve} for callers that name the action instead. */
export const recordSlowCommand = slowlogObserve;

/** Empties the log without resetting the entry id counter, as upstream does. */
export function slowlogReset(): void {
    slowlog.length = 0;
}

/** Current number of logged entries. */
export function slowlogLen(): number {
    return slowlog.length;
}

/** Newest-first snapshot of at most `count` entries. */
export function slowlogGet(count: number): SlowlogEntry[] {
    return slowlog.slice(0, count);
}

/** One logged entry as the seven-element array the upstream replies with. */
function slowlogEntrySpec(entry: SlowlogEntry): ReplySpec {
    return array([
        integer(entry.id),
        integer(entry.time),
        integer(entry.duration),
        array(entry.argv.map(arg => bulk(arg))),
        bulk(entry.peerid),
        bulk(entry.cname),
        integer(entry.cmdArgc),
    ]);
}

/**
 * Plans `SLOWLOG GET [count]`, `LEN`, `RESET` and `HELP`.
 *
 * `count` accepts `-1` (all entries) and any non-negative number; the default
 * is ten. Anything else answers the upstream range error text.
 */
function planSlowlog(args: Buffer[]): CommandPlan {
    if (args.length < 2) {
        return { error: wrongArity('slowlog') };
    }
    const typed = text(args[1]);
    const subcommand = typed.toLowerCase();
    if (subcommand === 'get' && (args.length === 2 || args.length === 3)) {
        let count = 10;
        if (args.length === 3) {
            const parsed = parseInteger(args[2]);
            if (parsed === null || parsed < -1) {
                return { error: replyError('ERR count should be greater than or equal to -1') };
            }
            count = parsed === -1 ? slowlog.length : parsed;
        }
        return { run: () => array(slowlogGet(count).map(slowlogEntrySpec)) };
    }
    if (subcommand === 'len' && args.length === 2) {
        return { run: () => integer(slowlog.length) };
    }
    if (subcommand === 'reset' && args.length === 2) {
        return { run: () => { slowlogReset(); return simple('OK'); } };
    }
    if (subcommand === 'help' && args.length === 2) {
        return { run: () => array(SLOWLOG_HELP.map(line => bulk(line))) };
    }
    return { error: subcommandSyntaxError('SLOWLOG', typed) };
}

/* -------------------------------- MEMORY ---------------------------------- */

/** The report upstream answers for an instance using almost no memory. */
const MEMORY_DOCTOR_EMPTY =
    'Hi Sam, this instance is empty or is using very little memory, my issues detector can\'t be used '
    + 'in these conditions. Please, leave for your mission on Earth and fill it with some data. '
    + 'The new Sam and I will be back to our programming as soon as I finished rebooting.\n';

const MEMORY_HELP: string[] = [
    'MEMORY <subcommand> [<arg> [value] [opt] ...]. Subcommands are:',
    'DOCTOR',
    '    Return memory problems reports.',
    'MALLOC-STATS',
    '    Return internal statistics report from the memory allocator.',
    'PURGE',
    '    Attempt to purge dirty pages for reclamation by the allocator.',
    'STATS',
    '    Return information about the memory usage of the server.',
    'USAGE <key> [SAMPLES <count>]',
    '    Return memory in bytes used by <key> and its value. Nested values are',
    '    sampled up to <count> times (default: 5, 0 means sample all).',
    'HELP',
    '    Print this help.',
];

/** Allocator-independent per-key overhead added to a raw byte length. */
const MEMORY_KEY_OVERHEAD = 64;
/** Extra bytes upstream charges for one entry of the expires dictionary. */
const MEMORY_EXPIRE_OVERHEAD = 48;

/**
 * Estimates the bytes one key occupies: the stored value length across every
 * kind namespace plus a fixed per-key overhead, with the expires entry when
 * the key carries a deadline. The real number is allocator-dependent, so this
 * is a shape-compatible estimate, not a byte-for-byte match.
 */
function memoryUsage(store: Store, db: number, key: Buffer, samples: number): number | null {
    if (kindOf(store, db, key) === null) {
        return null;
    }
    // The nested sampling knob only matters for collection members; the stored
    // blobs are already the whole values here, so they are counted as they are.
    void samples;
    const keyBytes = Buffer.byteLength(key);
    let bytes = keyBytes + MEMORY_KEY_OVERHEAD;
    for (const kind of ['', 'hash', 'list', 'set', 'zset', 'stream'] as const) {
        const value = store.getKind(db, kind, key);
        if (value !== null) {
            bytes += value.length;
        }
    }
    if (store.deadline(db, key) !== null) {
        bytes += MEMORY_EXPIRE_OVERHEAD;
    }
    return bytes;
}

/** A shape-correct `MEMORY STATS` map: the counters this server can observe. */
function memoryStats(store: Store, session: Session): ReplySpec {
    const stats = session.stats ?? {};
    let keys = 0;
    for (let db = 0; db < DATABASES; db += 1) {
        keys += store.size(db);
    }
    const allocated = stats.netInput ?? 0;
    return map([
        ['peak.allocated', integer(allocated)],
        ['total.allocated', integer(allocated)],
        ['startup.allocated', integer(0)],
        ['replication.backlog', integer(0)],
        ['clients.slaves', integer(0)],
        ['clients.normal', integer(stats.connections ?? 0)],
        ['aof.buffer', integer(0)],
        ['lua.caches', integer(0)],
        ['functions.caches', integer(0)],
        ['overhead.total', integer(0)],
        ['keys.count', integer(keys)],
        ['keys.bytes-per-key', integer(keys > 0 ? Math.floor(allocated / keys) : 0)],
        ['dataset.bytes', integer(0)],
        ['dataset.percentage', integer(0)],
        ['peak.percentage', integer(0)],
        ['allocator.allocated', integer(allocated)],
        ['allocator.active', integer(allocated)],
        ['allocator.resident', integer(allocated)],
        ['allocator-fragmentation.ratio', integer(0)],
        ['allocator-fragmentation.bytes', integer(0)],
        ['allocator-rss.ratio', integer(0)],
        ['allocator-rss.bytes', integer(0)],
        ['rss-overhead.ratio', integer(0)],
        ['rss-overhead.bytes', integer(0)],
        ['fragmentation', integer(0)],
        ['fragmentation.bytes', integer(0)],
    ]);
}

/**
 * Plans the `MEMORY` family.
 *
 * `USAGE` estimates the key size, `DOCTOR` answers the upstream report for an
 * almost-empty instance, `MALLOC-STATS` answers the upstream text for a build
 * without jemalloc, `PURGE` answers `OK` like the upstream non-jemalloc stub,
 * and `STATS` returns a shape-correct map of the counters this server knows.
 */
function planMemory(store: Store, session: Session, args: Buffer[]): CommandPlan {
    if (args.length < 2) {
        return { error: wrongArity('memory') };
    }
    const typed = text(args[1]);
    const subcommand = typed.toLowerCase();
    if (subcommand === 'help' && args.length === 2) {
        return { run: () => array(MEMORY_HELP.map(line => bulk(line))) };
    }
    if (subcommand === 'usage' && args.length >= 3) {
        let samples = 5;
        for (let j = 3; j < args.length; j += 1) {
            if (text(args[j]).toLowerCase() === 'samples' && j + 1 < args.length) {
                const parsed = parseInteger(args[j + 1]);
                if (parsed === null) {
                    return { error: replyError('ERR value is not an integer or out of range') };
                }
                if (parsed < 0) {
                    return { error: replyError('ERR syntax error') };
                }
                samples = parsed === 0 ? Number.MAX_SAFE_INTEGER : parsed;
                j += 1;
            }
            else {
                return { error: replyError('ERR syntax error') };
            }
        }
        const db = session.db ?? 0;
        const key = args[2];
        return { run: () => {
            const usage = memoryUsage(store, db, key, samples);
            return usage === null ? nullReply() : integer(usage);
        } };
    }
    if (subcommand === 'stats' && args.length === 2) {
        return { run: () => memoryStats(store, session) };
    }
    if (subcommand === 'malloc-stats' && args.length === 2) {
        return { run: () => bulk('Stats not supported for the current allocator') };
    }
    if (subcommand === 'doctor' && args.length === 2) {
        return { run: () => bulk(MEMORY_DOCTOR_EMPTY) };
    }
    if (subcommand === 'purge' && args.length === 2) {
        return { run: () => simple('OK') };
    }
    return { error: subcommandSyntaxError('MEMORY', typed) };
}

/* ------------------------------- dispatcher ------------------------------- */

/** Plans one `WAIT`, `LATENCY`, `SLOWLOG` or `MEMORY` request. */
export function planIntrospection(store: Store, session: Session, name: string, args: Buffer[]): CommandPlan {
    switch (name) {
        case 'wait':
            return planWait(session, args);
        case 'latency':
            return planLatency(args);
        case 'slowlog':
            return planSlowlog(args);
        case 'memory':
            return planMemory(store, session, args);
        default:
            return { error: subcommandSyntaxError(name.toUpperCase(), text(args[1] ?? Buffer.from(''))) };
    }
}
