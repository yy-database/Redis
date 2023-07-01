//! 阻塞命令的跨连接等待队列。
//!
//! The server runs one event loop, so a blocking command cannot sleep inside
//! `execute`. Instead it returns a block descriptor and `startServer` parks it
//! here. A push then wakes the first waiter of that key synchronously, which
//! keeps wake-ups in registration order and lets the mover wake consumers of
//! its destination.

/** Key identity inside the wait table: database index plus raw key bytes. */
function slotOf(db, key) {
    return `${db}\u0000${Buffer.isBuffer(key) ? key.toString('hex') : String(key)}`;
}

/**
 * One wait queue per logical key shared by every connection of a server.
 *
 * An entry is `{ db, keys, timeoutMs, attempt, timeoutReply, deliver }`.
 * `attempt()` returns a reply specification when it could claim a value and
 * `null` when the key is still empty. `deliver(reply)` writes the reply to the
 * blocked connection.
 */
export class BlockingHub {
    constructor() {
        this.queues = new Map();
    }

    /** Parks one command until a push to any of its keys or the timeout. */
    wait(entry) {
        entry.registered = true;
        for (const key of entry.keys) {
            const slot = slotOf(entry.db, key);
            let queue = this.queues.get(slot);
            if (queue === undefined) {
                queue = [];
                this.queues.set(slot, queue);
            }
            queue.push(entry);
        }
        if (entry.timeoutMs > 0) {
            entry.timer = setTimeout(() => this.expire(entry), entry.timeoutMs);
            entry.timer.unref?.();
        }
    }

    /** Serves the waiters of one key after a push, first registered first served. */
    wake(db, key) {
        const slot = slotOf(db, key);
        const queue = this.queues.get(slot);
        if (queue === undefined) return;
        while (queue.length > 0) {
            const entry = queue[0];
            const reply = entry.attempt();
            if (reply === null) return;
            this.settle(entry);
            entry.deliver(reply);
        }
    }

    /** Drops one parked command, used when its connection closes. */
    cancel(entry) {
        if (entry.registered) this.settle(entry);
    }

    expire(entry) {
        if (!entry.registered) return;
        const reply = entry.attempt();
        this.settle(entry);
        entry.deliver(reply ?? entry.timeoutReply);
    }

    settle(entry) {
        entry.registered = false;
        if (entry.timer !== undefined) {
            clearTimeout(entry.timer);
            entry.timer = undefined;
        }
        for (const key of entry.keys) {
            const slot = slotOf(entry.db, key);
            const queue = this.queues.get(slot);
            if (queue === undefined) continue;
            const index = queue.indexOf(entry);
            if (index >= 0) queue.splice(index, 1);
            if (queue.length === 0) this.queues.delete(slot);
        }
    }
}
