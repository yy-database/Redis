//! Public package entry for the emulated Redis server and client primitives.

export { Store, decodeCommand, decodeReply, encodeCommand, encodeReply, parseInteger, repairShard } from './native.js';
export { execute } from './commands.js';
export { startServer } from './server.js';
export { bulk, bulkBytes, error, integer, map, nullReply, simple, array } from './reply.js';
export { Redis, RedisListener, RedisSession } from './redis.js';
export type { WireSpec } from './redis.js';
export { RedisClient } from './client.js';
export type { RedisMultiBuilder, RedisPipelineBuilder } from './client.js';
export { RedisError } from './errors.js';
export type { RedisErrorDetails, RedisErrorPhase, RedisExecution, RedisRetry } from './errors.js';
export type {
    ClientState,
    CommandResult,
    LocalState,
    LocalStorage,
    RedisAddress,
    RedisAuth,
    RedisClientOptions,
    RedisClientSettings,
    RedisCommands,
    RedisKey,
    RedisListenOptions,
    RedisMultiResult,
    RedisOptions,
    RedisSessionOptions,
    RedisTlsOptions,
    RedisValue,
    TcpEndpoint,
} from './options.js';
