//! Reply-error helpers and the value-kind probe shared by the command modules.

import type { Store, ValueKind } from '../native.js';
import { error as replyError } from '../reply.js';
import type { ReplySpec } from '../reply.js';

export const DATABASES = 16;

export const integerError = (): ReplySpec => replyError('ERR value is not an integer or out of range');
export const wrongArity = (name: string): ReplySpec => replyError(`ERR wrong number of arguments for '${name}' command`);
/** Upstream names the command in every arity error, so unknown names keep the sent spelling. */
export const unknownCommand = (args: Buffer[]): ReplySpec => {
    const shown = args.slice(1).map(arg => `'${text(arg)}'`).join(' ');
    const name = text(args[0]);
    return replyError(shown.length === 0
        ? `ERR unknown command '${name}'`
        : `ERR unknown command '${name}', with args beginning with: ${shown} `);
};

/** Value kind names, in probe order. */
export type Kind = 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream';

/** Value kinds of one logical key, in probe order. */
export const KINDS: Kind[] = ['string', 'hash', 'list', 'set', 'zset', 'stream'];
/** Storage namespace suffix of each value kind. */
export const SUFFIX: Record<Kind, ValueKind> = { string: '', hash: 'hash', list: 'list', set: 'set', zset: 'zset', stream: 'stream' };
export const WRONG_TYPE = 'WRONGTYPE Operation against a key holding the wrong kind of value';

export const wrongType = (): ReplySpec => replyError(WRONG_TYPE);

/** Kind currently holding `key`, or `null` when every kind namespace is empty. */
export function kindOf(store: Store, db: number, key: Buffer | string): Kind | null {
    for (const kind of KINDS) {
        if (store.existsKind(db, SUFFIX[kind], key)) return kind;
    }
    return null;
}

export function commandName(args: Buffer[]): string {
    return args[0].toString('utf8').toLowerCase();
}

export function text(buffer: Buffer | string): string {
    return (buffer as Buffer).toString('utf8');
}
