//! List-family forwarding with stream-key guards and push wake-ups.

import type { Store } from '../native.js';
import type { ReplySpec } from '../reply.js';
import { notifyPush } from './blocking-plan.js';
import { SUFFIX, wrongType } from './kinds.js';
import type { Session } from './session.js';

/** Runs one list request upstream, rejecting stream keys the facade has no kind for. */
function runListCommand(store: Store, session: Session, args: Buffer[], keys: Buffer[]): ReplySpec {
    for (const key of keys) {
        if (store.existsKind(session.db, SUFFIX.stream, key)) return wrongType();
    }
    return store.listCommand(session.db, session.protocol ?? 2, args);
}

/** Forwards a list command and wakes anyone blocked on the keys it wrote. */
export function forwardList(store: Store, session: Session, args: Buffer[], keys: Buffer[], notifyKeys: Buffer[] = []): () => ReplySpec {
    return () => {
        const reply = runListCommand(store, session, args, keys);
        if (reply.type !== 'error') {
            for (const key of notifyKeys) notifyPush(session, session.db, key);
        }
        return reply;
    };
}

/** One non-blocking attempt for a blocking list command, mapping the empty reply to `null`. */
export function forwardBlockingList(store: Store, session: Session, args: Buffer[], keys: Buffer[]): () => ReplySpec | null {
    return () => {
        const reply = runListCommand(store, session, args, keys);
        if (reply.type === 'null' || reply.type === 'null-array') return null;
        return reply;
    };
}
