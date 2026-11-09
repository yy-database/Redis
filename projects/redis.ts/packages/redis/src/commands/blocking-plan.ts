//! Timeout parsing and the blocking descriptors handed to the socket loop.

import type { ReplySpec } from '../reply.js';
import type { CommandPlan, Session } from './session.js';
import { parseFloatText } from './long-double.js';

/** 真机的超时上限钉在 `i64::MAX` 毫秒，浮点表示即 `2^63`。 */
export const TIMEOUT_MAX_MILLIS = 2 ** 63;

/**
 * Parses a blocking timeout in seconds.
 *
 * 真机先按浮点秒解析，再把毫秒向零截断：截断后为负才是「negative」，正的亚毫秒值
 * 按最短 1 毫秒处理，`0` 与负的亚毫秒值表示无限等待。非数字、越界与截断后为负
 * 分别回答上游的三条错误文案。
 */
export function parseBlockingTimeout(raw: Buffer | string): { error?: string; timeoutMs?: number } {
    const seconds = parseFloatText(raw);
    if (seconds === null || Number.isNaN(seconds)) {
        return { error: 'ERR timeout is not a float or out of range' };
    }
    const whole = Math.trunc(seconds * 1000);
    if (whole > TIMEOUT_MAX_MILLIS) {
        return { error: 'ERR timeout is out of range' };
    }
    if (whole < 0) {
        return { error: 'ERR timeout is negative' };
    }
    if (whole === 0) {
        return { timeoutMs: seconds > 0 ? 1 : 0 };
    }
    return { timeoutMs: whole };
}

/** Wakes consumers parked on `key` once a push has landed. */
export function notifyPush(session: Session, db: number, key: Buffer | string): void {
    session.hub?.wake(db, key);
}

/**
 * Wraps one blocking attempt into the descriptor `startServer` parks.
 *
 * `attempt` returns a reply specification when it can claim a value and `null`
 * while the key is still empty. `run` is the non-blocking form used inside
 * `EXEC`, where upstream Redis answers the timeout reply at once.
 */
export function blockingPlan(
    db: number,
    keys: (Buffer | string)[],
    timeoutMs: number,
    attempt: () => ReplySpec | null,
    timeoutReply: ReplySpec,
): CommandPlan {
    return {
        block: { db, keys, timeoutMs, attempt, timeoutReply },
        run: () => attempt() ?? timeoutReply,
    };
}

/**
 * 把一条校验失败延后到 `run`，排队期只回 `QUEUED`。
 *
 * 真机在 `MULTI` 里只有参数个数错误会让整笔事务 `EXECABORT`，超时取值、方向与
 * 计数一类的校验都要等 `EXEC` 复放时按元素级错误返回。
 */
export function deferredFailure(reply: ReplySpec): CommandPlan {
    return { run: () => reply };
}
