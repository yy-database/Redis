//! 阻塞命令的跨连接等待队列。
//!
//! The server runs one event loop, so a blocking command cannot sleep inside
//! `execute`. Instead it returns a block descriptor and `startServer` parks it
//! here. A push then wakes the first waiter of that key synchronously, which
//! keeps wake-ups in registration order and lets the mover wake consumers of
//! its destination.

import type { ReplySpec } from './reply.js';

/** One parked blocking command, served by {@link BlockingHub}. */
export interface BlockEntry {
    db: number;
    keys: (Buffer | string)[];
    timeoutMs: number;
    /** Returns a reply when it could claim a value, `null` when the key is still empty. */
    attempt: () => ReplySpec | null;
    timeoutReply: ReplySpec;
    /** Writes the reply to the blocked connection. */
    deliver: (reply: ReplySpec) => void;
    registered?: boolean;
    timer?: ReturnType<typeof setTimeout>;
}

/** Key identity inside the wait table: database index plus raw key bytes. */
function slotOf(db: number, key: Buffer | string): string {
    return `${db}\u0000${Buffer.isBuffer(key) ? key.toString('hex') : String(key)}`;
}

/**
 * 32 位有符号定时器上限。Node 把超过它的延迟当成 1 毫秒立刻触发，所以更长的
 * 超时只能按「等同不超时」处理；真机在 24.8 天这个量级也只是继续阻塞。
 */
const MAX_TIMER_MS = 2147483647;

/**
 * One wait queue per logical key shared by every connection of a server.
 *
 * An entry is `{ db, keys, timeoutMs, attempt, timeoutReply, deliver }`.
 * `attempt()` returns a reply specification when it could claim a value and
 * `null` when the key is still empty. `deliver(reply)` writes the reply to the
 * blocked connection.
 */
export class BlockingHub {
    readonly queues = new Map<string, BlockEntry[]>();

    /** Parks one command until a push to any of its keys or the timeout. */
    wait(entry: BlockEntry): void {
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
        if (entry.timeoutMs > 0 && entry.timeoutMs <= MAX_TIMER_MS) {
            entry.timer = setTimeout(() => this.expire(entry), entry.timeoutMs);
            entry.timer.unref?.();
        }
    }

    /** Serves the waiters of one key after a push, first registered first served. */
    wake(db: number, key: Buffer | string): void {
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
    cancel(entry: BlockEntry): void {
        if (entry.registered) this.settle(entry);
    }

    expire(entry: BlockEntry): void {
        if (!entry.registered) return;
        const reply = entry.attempt();
        this.settle(entry);
        entry.deliver(reply ?? entry.timeoutReply);
    }

    settle(entry: BlockEntry): void {
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
