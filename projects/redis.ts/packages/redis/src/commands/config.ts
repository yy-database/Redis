//! `CONFIG`: the upstream gateway answers its own option table, while the host
//! overlays the options it owns at runtime (`requirepass`,
//! `notify-keyspace-events`, `appendfsync` and the two `slowlog-*` knobs).
//! `execute` asks this module which pairs to rewrite out of the forwarded
//! request and what to apply once the gateway answered, so a `CONFIG SET` still
//! takes effect on the live server instead of only at startup.

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
import type { ServerSettings, Session } from './session.js';

/** Options whose value lives in the listener's `ServerSettings`. */
const SERVER_OPTIONS = ['appendfsync', 'requirepass', 'notify-keyspace-events'] as const;
/** Options owned by the process-wide slow log, changed without a listener copy. */
const SLOWLOG_OPTIONS = ['slowlog-log-slower-than', 'slowlog-max-len'] as const;
/** Option names the host applies itself; everything else is the gateway's. */
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

/** Error text the gateway answers for a non-integer slow log setting. */
function invalidSlowlogInteger(name: string): ReplySpec {
    return replyError(
        `ERR CONFIG SET failed (possibly related to argument '${name}') - argument couldn't be parsed into an integer`,
    );
}

/** Overlays the host-owned options on the array reply the gateway answered. */
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

/** What one `CONFIG` request needs from the host beyond the gateway answer. */
export interface ConfigOverlay {
    /** `CONFIG GET` patterns whose host-owned values merge into the gateway reply. */
    getPatterns: Buffer[] | null;
    /** Host-owned pairs to apply once the gateway accepted the forwarded ones. */
    local: [LocalOption, string][];
    /** Pairs the gateway validates and applies itself; empty when all are host-owned. */
    forwarded: Buffer[];
    /** Host validation error that must be answered before any option applies. */
    error: ReplySpec | null;
}

/**
 * Inspects one `CONFIG` request, or returns `null` when the gateway answers it
 * verbatim. A host validation failure is reported here without collecting any
 * pairs, so the forwarded request is neutralized before the gateway sees it.
 */
export function inspectConfig(session: Session, args: Buffer[]): ConfigOverlay | null {
    const settings = session.settings;
    if (settings === undefined || args.length < 2) {
        return null;
    }
    const subcommand = text(args[1]).toLowerCase();
    if (subcommand === 'get') {
        if (args.length < 3) {
            return null;
        }
        return { getPatterns: args.slice(2), local: [], forwarded: [], error: null };
    }
    if (subcommand !== 'set' || args.length < 4 || args.length % 2 !== 0) {
        return null;
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
            return { getPatterns: null, local: [], forwarded: [], error: invalidNotificationClass() };
        }
        if (name === 'appendfsync' && value !== 'always' && value !== 'everysec') {
            return { getPatterns: null, local: [], forwarded: [], error: invalidAppendfsync() };
        }
        if (name === 'slowlog-log-slower-than') {
            const parsed = parseInteger(args[index + 1]);
            if (parsed === null || parsed < -1) {
                return { getPatterns: null, local: [], forwarded: [], error: invalidSlowlogInteger(name) };
            }
        }
        if (name === 'slowlog-max-len') {
            const parsed = parseInteger(args[index + 1]);
            if (parsed === null || parsed < 0) {
                return { getPatterns: null, local: [], forwarded: [], error: invalidSlowlogInteger(name) };
            }
        }
        local.push([name, value]);
    }
    return { getPatterns: null, local, forwarded, error: null };
}

/**
 * Answers one gateway `CONFIG` reply after the host overlay has been applied.
 *
 * The gateway runs first, so its `NOAUTH` gate wins over any host validation,
 * and the old precedence is kept after that: a host validation error is answered
 * before the forwarded pairs could matter, a forwarded-pair error is answered
 * verbatim, and only a clean round lets the host options take effect.
 */
export function applyConfigOverlay(
    store: Store,
    session: Session,
    overlay: ConfigOverlay,
    spec: ReplySpec | undefined,
): { reply: ReplySpec } {
    if (spec !== undefined && spec.type === 'error' && spec.value.startsWith('NOAUTH')) {
        return { reply: spec };
    }
    if (overlay.error !== null) {
        return { reply: overlay.error };
    }
    const settings = session.settings as ServerSettings;
    if (overlay.getPatterns !== null) {
        return { reply: mergeLocalGet(settings, overlay.getPatterns, spec ?? array([])) };
    }
    if (overlay.forwarded.length > 0 && spec !== undefined && spec.type === 'error') {
        return { reply: spec };
    }
    for (const [name, value] of overlay.local) {
        if (name === 'appendfsync') {
            settings.appendfsync = value === 'always' ? 'always' : 'everysec';
            store.setSyncAlways(settings.appendfsync === 'always');
        }
        else if (name === 'requirepass') {
            settings.requirepass = value.length === 0 ? undefined : value;
            // The gateway's gate reads the listener password from the registry.
            store.setRequirepass(value.length === 0 ? null : value);
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
    return { reply: simple('OK') };
}
