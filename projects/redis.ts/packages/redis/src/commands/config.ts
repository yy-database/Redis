//! `CONFIG`: the upstream facade answers its own option table, while the host
//! overlays the options it owns at runtime (`requirepass`,
//! `notify-keyspace-events`, `appendfsync` and the two `slowlog-*` knobs).
//! Keeping the overlay here means a `CONFIG SET` takes effect on the live
//! server instead of only at startup.

import type { Store } from '../native.js';
import { parseInteger } from '../native.js';
import { parseNotificationFlags } from '../notifications.js';
import { array, bulk, bulkBytes, error as replyError, simple } from '../reply.js';
import type { ReplySpec } from '../reply.js';
import { globMatch } from './glob.js';
import {
    setSlowlogLogSlowerThan,
    setSlowlogMaxLen,
    slowlogLogSlowerThanUs,
    slowlogMaxLen,
} from './introspection.js';
import { text } from './kinds.js';
import type { CommandPlan, ServerSettings, Session } from './session.js';

/** Options whose value lives in the listener's `ServerSettings`. */
const SERVER_OPTIONS = ['appendfsync', 'requirepass', 'notify-keyspace-events'] as const;
/** Options owned by the process-wide slow log, changed without a listener copy. */
const SLOWLOG_OPTIONS = ['slowlog-log-slower-than', 'slowlog-max-len'] as const;
/** Option names the host applies itself; everything else is the facade's. */
const LOCAL_OPTIONS = [...SERVER_OPTIONS, ...SLOWLOG_OPTIONS] as const;
type LocalOption = (typeof LOCAL_OPTIONS)[number];

/** Notification classes a real server accepts in `notify-keyspace-events`. */
const NOTIFICATION_CLASSES = new Set('AKEg$lshzxetmdn');

function isLocalOption(name: string): name is LocalOption {
    return (LOCAL_OPTIONS as readonly string[]).includes(name);
}

/** The pairs the host reports for its own options, in registration order. */
function localValues(settings: ServerSettings): [LocalOption, string][] {
    return [
        ['appendfsync', settings.appendfsync],
        ['requirepass', settings.requirepass ?? ''],
        ['notify-keyspace-events', settings.notifyKeyspaceEvents],
        ['slowlog-log-slower-than', String(slowlogLogSlowerThanUs())],
        ['slowlog-max-len', String(slowlogMaxLen())],
    ];
}

/** Reads the option name out of one `CONFIG GET` reply pair, or `null` if malformed. */
function pairName(spec: ReplySpec): string | null {
    const bytes = bulkBytes(spec);
    return bytes === null ? null : bytes.toString('utf8');
}

/** Error text a real server answers for an invalid notification class letter. */
function invalidNotificationClass(): ReplySpec {
    return replyError(
        "ERR CONFIG SET failed (possibly related to argument 'notify-keyspace-events') - "
        + "Invalid event class character. Some possible classes are: 'g$lshzxeKE'",
    );
}

/** Error text a real server answers for an unknown `appendfsync` value. */
function invalidAppendfsync(): ReplySpec {
    return replyError(
        "ERR CONFIG SET failed (possibly related to argument 'appendfsync') - "
        + 'argument(s) must be one of the following: always, everysec',
    );
}

/** Error text the facade answers for a non-integer slow log setting. */
function invalidSlowlogInteger(name: string): ReplySpec {
    return replyError(
        `ERR CONFIG SET failed (possibly related to argument '${name}') - argument couldn't be parsed into an integer`,
    );
}

/** Overlays the host-owned options on the array reply the facade answered. */
function mergeLocalGet(settings: ServerSettings, patterns: Buffer[], base: ReplySpec): ReplySpec {
    if (base.type !== 'array') {
        return base;
    }
    const pairs: [string, ReplySpec][] = [];
    for (let index = 0; index + 1 < base.value.length; index += 2) {
        pairs.push([pairName(base.value[index]) ?? '', base.value[index + 1]]);
    }
    for (const [name, value] of localValues(settings)) {
        const known = pairs.find(([known]) => known === name);
        if (known !== undefined) {
            known[1] = bulk(value);
        }
    }
    for (const pattern of patterns) {
        for (const [name, value] of localValues(settings)) {
            if (!globMatch(pattern, Buffer.from(name)) || pairs.some(([known]) => known === name)) {
                continue;
            }
            pairs.push([name, bulk(value)]);
        }
    }
    return array(pairs.flatMap(([name, value]) => [bulk(name), value]));
}

/** Runs one `CONFIG` request through the facade and returns only its reply. */
function serverReply(store: Store, session: Session, args: Buffer[]): ReplySpec {
    return store.serverCommand(session.id ?? 0, session.db ?? 0, session.protocol ?? 2, args).reply;
}

/** Plans one `CONFIG GET` or `CONFIG SET`, delegating every other option. */
export function planConfig(store: Store, session: Session, args: Buffer[]): CommandPlan {
    const settings = session.settings;
    if (settings === undefined || args.length < 2) {
        return { run: () => store.serverCommand(session.id ?? 0, session.db ?? 0, session.protocol ?? 2, args) };
    }
    const subcommand = text(args[1]).toLowerCase();
    if (subcommand === 'get') {
        if (args.length < 3) {
            return { run: () => store.serverCommand(session.id ?? 0, session.db ?? 0, session.protocol ?? 2, args) };
        }
        return {
            run: () => mergeLocalGet(settings, args.slice(2), serverReply(store, session, args)),
        };
    }
    if (subcommand !== 'set' || args.length < 4 || args.length % 2 !== 0) {
        return { run: () => store.serverCommand(session.id ?? 0, session.db ?? 0, session.protocol ?? 2, args) };
    }

    const local: [LocalOption, string][] = [];
    const forwarded: Buffer[] = [];
    for (let index = 2; index < args.length; index += 2) {
        const name = text(args[index]).toLowerCase();
        const value = text(args[index + 1]);
        if (!isLocalOption(name)) {
            forwarded.push(args[index], args[index + 1]);
            continue;
        }
        if (name === 'notify-keyspace-events' && [...value].some(character => !NOTIFICATION_CLASSES.has(character))) {
            return { error: invalidNotificationClass() };
        }
        if (name === 'appendfsync' && value !== 'always' && value !== 'everysec') {
            return { error: invalidAppendfsync() };
        }
        if (name === 'slowlog-log-slower-than') {
            const parsed = parseInteger(args[index + 1]);
            if (parsed === null || parsed < -1) {
                return { error: invalidSlowlogInteger(name) };
            }
        }
        if (name === 'slowlog-max-len') {
            const parsed = parseInteger(args[index + 1]);
            if (parsed === null || parsed < 0) {
                return { error: invalidSlowlogInteger(name) };
            }
        }
        local.push([name, value]);
    }
    return {
        run: () => {
            // The facade owns the rest of the option table and its error text, so
            // it validates the forwarded pairs before any host option is applied.
            if (forwarded.length > 0) {
                const base = serverReply(
                    store,
                    session,
                    [Buffer.from('CONFIG'), Buffer.from('SET'), ...forwarded],
                );
                if (base.type === 'error') {
                    return base;
                }
            }
            for (const [name, value] of local) {
                if (name === 'appendfsync') {
                    settings.appendfsync = value === 'always' ? 'always' : 'everysec';
                    store.setSyncAlways(settings.appendfsync === 'always');
                }
                else if (name === 'requirepass') {
                    settings.requirepass = value.length === 0 ? undefined : value;
                }
                else if (name === 'notify-keyspace-events') {
                    settings.notifyKeyspaceEvents = value;
                    settings.notifications = parseNotificationFlags(value);
                }
                else if (name === 'slowlog-log-slower-than') {
                    setSlowlogLogSlowerThan(Number(value));
                }
                else {
                    setSlowlogMaxLen(Number(value));
                }
            }
            return simple('OK');
        },
    };
}
