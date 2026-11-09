//! Queue-time validation for `SORT` / `SORT_RO`, forwarded through the zset facade.

import { parseInteger } from '../native.js';
import type { Store } from '../native.js';
import { error as replyError } from '../reply.js';
import { integerError, text, wrongArity } from './kinds.js';
import type { CommandPlan, Session } from './session.js';
import { forwardZSet } from './zsets.js';

/**
 * 规划一条 `SORT` / `SORT_RO` 命令。
 *
 * 排队阶段只校验参数成形：选项是否带够取值、`LIMIT` 两个数是否为整数、
 * `SORT_RO` 是否误带 `STORE`。取值来源、`BY` / `GET` 展开、排序与 `STORE`
 * 写入一律由上游族入口执行，这里只把参数原样转发。
 */
export function planSort(store: Store, session: Session, name: string, args: Buffer[]): CommandPlan {
    const readonly = name === 'sort_ro';
    if (args.length < 2) return { error: wrongArity(name) };
    let stores = false;
    let storeKey: Buffer | null = null;
    let index = 2;
    while (index < args.length) {
        const option = text(args[index]).toLowerCase();
        if (option === 'by' || option === 'get') {
            if (args[index + 1] === undefined) return { error: replyError('ERR syntax error') };
            index += 2;
            continue;
        }
        if (option === 'limit') {
            if (args[index + 1] === undefined || args[index + 2] === undefined) {
                return { error: replyError('ERR syntax error') };
            }
            const offset = parseInteger(args[index + 1]);
            const count = parseInteger(args[index + 2]);
            if (offset === null || count === null) return { error: integerError() };
            index += 3;
            continue;
        }
        if (option === 'asc' || option === 'desc' || option === 'alpha') {
            index += 1;
            continue;
        }
        if (option === 'store') {
            if (args[index + 1] === undefined) return { error: replyError('ERR syntax error') };
            stores = true;
            storeKey = args[index + 1];
            index += 2;
            continue;
        }
        return { error: replyError('ERR syntax error') };
    }
    if (readonly && stores) return { error: replyError('ERR syntax error') };
    return { run: forwardZSet(store, session, args, [args[1]], storeKey === null ? [] : [storeKey]) };
}
