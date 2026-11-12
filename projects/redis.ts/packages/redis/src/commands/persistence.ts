//! Persistence and lifecycle commands: `SAVE`, `BGSAVE`, `LASTSAVE`, `BGREWRITEAOF` and `SHUTDOWN`.
//!
//! The `.yykv` shard is the snapshot store, so a save is a flush of the buffered
//! counters behind it. The append-only file is never enabled, but the upstream
//! still accepts `BGREWRITEAOF` and reports that a rewrite started.

import type { Store } from '../native.js';
import { error as replyError, integer, simple } from '../reply.js';
import { text, wrongArity } from './kinds.js';
import type { CommandPlan, RunOutcome, Session } from './session.js';

/** Per-engine persistence bookkeeping, keyed by the store the server runs on. */
interface PersistenceState {
    /** Unix seconds of the last successful save, `null` until the first one. */
    lastSave: number | null;
    /** Whether a background flush is currently running. */
    saving: boolean;
}

const states = new WeakMap<Store, PersistenceState>();

function stateOf(store: Store): PersistenceState {
    let state = states.get(store);
    if (state === undefined) {
        state = { lastSave: null, saving: false };
        states.set(store, state);
    }
    return state;
}

/** Records a completed save on the wall clock, the way upstream stamps `LASTSAVE`. */
function markSaved(store: Store): void {
    stateOf(store).lastSave = Math.floor(Date.now() / 1000);
}

/** Flushes synchronously, the blocking `SAVE` path. */
function performSave(store: Store): void {
    store.flush();
    store.sync();
    markSaved(store);
}

/**
 * Starts the deferred flush a `BGSAVE` promises.
 *
 * The flush runs on the next timer tick, so the caller replies immediately and a
 * second `BGSAVE` sees the save still running, mirroring the forked child the
 * upstream reports while it writes.
 */
function startBackgroundSave(store: Store): void {
    stateOf(store).saving = true;
    setTimeout(() => {
        const state = stateOf(store);
        try {
            store.flush();
            store.sync();
            markSaved(store);
        }
        finally {
            state.saving = false;
        }
    }, 0);
}

/** Modifier tokens `SHUTDOWN` accepts, as the upstream command table declares them. */
const SHUTDOWN_FLAGS = new Set(['nosave', 'save', 'now', 'force', 'abort']);

function planShutdown(store: Store, args: Buffer[]): CommandPlan {
    let nosave = false;
    let save = false;
    let abort = false;
    let other = false;
    for (let index = 1; index < args.length; index += 1) {
        const flag = text(args[index]).toLowerCase();
        if (!SHUTDOWN_FLAGS.has(flag)) return { error: replyError('ERR syntax error') };
        if (flag === 'nosave') nosave = true;
        else if (flag === 'save') save = true;
        else if (flag === 'abort') abort = true;
        else other = true;
    }
    // The upstream rejects ABORT combined with any other modifier, and the two
    // save selectors together, as a plain syntax error.
    if ((abort && (nosave || save || other)) || (nosave && save)) {
        return { error: replyError('ERR syntax error') };
    }
    if (abort) {
        // This implementation shuts down in one step, so there is never an
        // ongoing shutdown for `ABORT` to cancel.
        return { error: replyError('ERR No shutdown in progress.') };
    }
    return {
        run: () => {
            // An unqualified shutdown persists, like the upstream, which saves on
            // a plain `SHUTDOWN` unless `NOSAVE` was given.
            if (!nosave) performSave(store);
            return { reply: undefined, close: true, shutdown: true } as unknown as RunOutcome;
        },
    };
}

/** Plans one persistence or lifecycle command against the store's server state. */
export function planPersistence(store: Store, session: Session, name: string, args: Buffer[]): CommandPlan {
    switch (name) {
        case 'save': {
            if (args.length !== 1) return { error: wrongArity('save') };
            return {
                run: () => {
                    if (stateOf(store).saving) return replyError('ERR Background save already in progress');
                    performSave(store);
                    return simple('OK');
                },
            };
        }

        case 'bgsave': {
            if (args.length === 2) {
                if (text(args[1]).toLowerCase() !== 'schedule') return { error: replyError('ERR syntax error') };
            }
            else if (args.length > 2) {
                return { error: replyError('ERR syntax error') };
            }
            return {
                run: () => {
                    const state = stateOf(store);
                    // An RDB save already running rejects both forms, exactly like
                    // the upstream, where only an AOF child lets SCHEDULE defer.
                    if (state.saving) {
                        return replyError('ERR Background save already in progress');
                    }
                    startBackgroundSave(store);
                    return simple('Background saving started');
                },
            };
        }

        case 'lastsave': {
            if (args.length !== 1) return { error: wrongArity('lastsave') };
            return {
                // Upstream considers the database saved at startup, so the answer
                // before the first save is the moment the server came up.
                run: () => integer(stateOf(store).lastSave ?? Math.floor((session.serverStartedAt ?? 0) / 1000)),
            };
        }

        case 'bgrewriteaof': {
            if (args.length !== 1) return { error: wrongArity('bgrewriteaof') };
            // The upstream starts an AOF rewrite whether or not appendonly is
            // enabled, and answers with the started status.
            return { run: () => simple('Background append only file rewriting started') };
        }

        case 'shutdown':
            return planShutdown(store, args);

        default:
            return { error: wrongArity(name) };
    }
}
