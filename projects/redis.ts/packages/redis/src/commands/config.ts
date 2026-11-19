//! Runtime effects of the gateway-owned `CONFIG` table.
//!
//! The gateway owns the option registry, its validation and the `requirepass`
//! gate, so the host never rewrites or revalidates a `CONFIG SET`. It only
//! mirrors the effects that live on the host side: the sync policy, the
//! notification flags and the process-wide slow log thresholds.

import type { ServerConfigChange, Store } from '../native.js';
import { parseNotificationFlags } from '../notifications.js';
import { setSlowlogLogSlowerThan, setSlowlogMaxLen } from './introspection.js';
import type { Session } from './session.js';

/** Applies the pairs the gateway accepted to the live listener settings. */
export function applyConfigEffects(store: Store, session: Session, changes: ServerConfigChange[]): void {
    const settings = session.settings;
    if (settings === undefined) {
        return;
    }
    for (const { name, value } of changes) {
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
        else if (name === 'slowlog-max-len') {
            setSlowlogMaxLen(Number(value));
        }
    }
}
