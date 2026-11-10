//! The `DatabaseError` envelope shared by the `Redis` and `RedisClient` classes.
//!
//! Errors keep the product identity, the lifecycle phase that produced them and
//! how certain the outcome is. The envelope never re-decides command semantics:
//! server error replies and native binding throws are mapped, not reinterpreted.

/** The lifecycle phase an error was produced in. */
export type RedisErrorPhase = 'configuration' | 'open' | 'connect' | 'execute' | 'commit' | 'close';

/** Whether the request reached the executor and whether its reply was seen. */
export type RedisExecution = 'not-sent' | 'unknown' | 'replied';

/** Whether a caller may repeat the operation. This is advice, never an automatic retry instruction. */
export type RedisRetry = 'never' | 'safe' | 'application-decision';

/** The fields every {@link RedisError} carries besides the message. */
export interface RedisErrorDetails {
    code: string;
    phase: RedisErrorPhase;
    execution: RedisExecution;
    retry: RedisRetry;
    cause?: unknown;
}

/** One Redis-family failure with the family-wide locating fields. */
export class RedisError extends Error {
    readonly product = 'redis' as const;
    readonly code: string;
    readonly phase: RedisErrorPhase;
    readonly execution: RedisExecution;
    readonly retry: RedisRetry;

    constructor(message: string, details: RedisErrorDetails) {
        super(message, details.cause === undefined ? undefined : { cause: details.cause });
        this.name = 'RedisError';
        this.code = details.code;
        this.phase = details.phase;
        this.execution = details.execution;
        this.retry = details.retry;
    }
}

/** Reads the leading reply code out of an error message (`WRONGTYPE ...`, `ERR ...`). */
export function replyCode(message: string): string {
    const first = message.split(' ', 1)[0] ?? '';
    return /^[A-Z][A-Z0-9_]*$/.test(first) ? first : 'error';
}

/** Wraps one error reply received from the server face. */
export function errorFromReply(message: string): RedisError {
    return new RedisError(message, {
        code: replyCode(message),
        phase: 'execute',
        execution: 'replied',
        retry: 'never',
    });
}

/** Wraps a throw coming out of the native binding or the socket layer. */
export function fromNative(cause: unknown, phase: RedisErrorPhase, execution: RedisExecution): RedisError {
    const message = cause instanceof Error ? cause.message : String(cause);
    return new RedisError(message, {
        code: replyCode(message) === 'error' ? 'native' : replyCode(message),
        phase,
        execution,
        retry: 'never',
        cause,
    });
}

/** Rejects a call whose shape the lifecycle state machine does not allow. */
export function invalidState(action: string, state: string, phase: RedisErrorPhase): RedisError {
    return new RedisError(`${action} is not allowed while the resource is \`${state}\``, {
        code: 'invalid-state',
        phase,
        execution: 'not-sent',
        retry: 'never',
    });
}

/** Rejects a configuration that cannot produce a usable object. */
export function configurationError(message: string, cause?: unknown): RedisError {
    return new RedisError(message, {
        code: 'configuration',
        phase: 'configuration',
        execution: 'not-sent',
        retry: 'never',
        cause,
    });
}
