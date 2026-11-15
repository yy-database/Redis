// 场景矩阵对照：`@yydb/redis` 仿真服务端 vs `ioredis` / `node-redis`，RESP2 与 RESP3。
// 统计口径唯一入口是 `src/harness-bench.mjs` 的 `benchSummary`（上游
// `database.harness::summarize` 的 median/p95/极值），TS 侧不重写公式。
// 报告 provenance 对齐 harness 的 `BenchProvenance` 线格式（snake_case 键）。
//
// 运行：`pnpm --dir projects/redis.ts/examples/vs-js-libraries benchmark`
// 环境变量：BENCH_ROUNDS (3), BENCH_WARMUP (1), BENCH_SET (100), BENCH_GET (500),
//   BENCH_PIPE (500), BENCH_PING (1000), BENCH_BATCH (500), BENCH_COLL (200),
//   BENCH_BIG (20), BENCH_BIG_GET (50), BENCH_BIG_BYTES (65536), BENCH_CONNECT (50),
//   BENCH_STREAM (200), BENCH_PUBSUB (100), BENCH_TTL (30), BENCH_TXN (100),
//   BENCH_INCR (500), BENCH_MSET (500), BENCH_DEL (200), BENCH_MOVE (200),
//   BENCH_BLOCK (100), BENCH_PING_CONC (800), BENCH_CONC (8), BENCH_GROUP (100),
//   BENCH_REPEAT (10), BENCH_COLL_LARGE (2000), BENCH_SWEEP (500),
//   BENCH_SWEEP_TTL_MS (50), BENCH_SWEEP_WAIT_MS (200), BENCH_FANOUT_SUBS (8),
//   BENCH_FANOUT (50), BENCH_WORKLOADS (all)
// 真机对照：设 BENCH_ORACLE_HOST / BENCH_ORACLE_PORT 指向真实 redis-server 后，
//   同一矩阵以 `ioredis` 为固定客户端再跑一轮，作为 oracle 列写进报告。

import { execFileSync } from 'node:child_process';
import { statSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../../shared/product.mjs';
import { createClient } from '../src/clients.mjs';
import { benchPerOpMs, benchSummary, benchSummarySource } from '../src/harness-bench.mjs';
import { elapsedMs, throughput } from '../src/timing.mjs';

const exampleRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = join(exampleRoot, '..', '..', '..', '..');

const HOST = '127.0.0.1';
const VALUE = 'v'.repeat(64);

function count(name, fallback) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got ${raw}`);
  }
  return value;
}

const SET_COUNT = count('BENCH_SET', 100);
const PIPE_COUNT = count('BENCH_PIPE', 500);
const GET_COUNT = count('BENCH_GET', 500);
const PING_COUNT = count('BENCH_PING', 1_000);
const BATCH = count('BENCH_BATCH', 500);
const COLL = count('BENCH_COLL', 200);
const BIG_COUNT = count('BENCH_BIG', 20);
const BIG_GET = count('BENCH_BIG_GET', 50);
const BIG_BYTES = count('BENCH_BIG_BYTES', 65_536);
const CONNECT_COUNT = count('BENCH_CONNECT', 50);
const STREAM_COUNT = count('BENCH_STREAM', 200);
const PUBSUB_COUNT = count('BENCH_PUBSUB', 100);
const TTL_COUNT = count('BENCH_TTL', 30);
const TXN_COUNT = count('BENCH_TXN', 100);
const INCR_COUNT = count('BENCH_INCR', 500);
const MSET_COUNT = count('BENCH_MSET', 500);
const DEL_COUNT = count('BENCH_DEL', 200);
const MOVE_COUNT = count('BENCH_MOVE', 200);
const BLOCK_COUNT = count('BENCH_BLOCK', 100);
const PING_CONC = count('BENCH_PING_CONC', 800);
const CONCURRENCY = count('BENCH_CONC', 8);
const GROUP_COUNT = count('BENCH_GROUP', 100);
const LARGE_COLL = count('BENCH_COLL_LARGE', 2_000);
const SWEEP_COUNT = count('BENCH_SWEEP', 500);
const SWEEP_TTL_MS = count('BENCH_SWEEP_TTL_MS', 50);
const SWEEP_WAIT_MS = count('BENCH_SWEEP_WAIT_MS', 200);
const FANOUT_SUBS = count('BENCH_FANOUT_SUBS', 8);
const FANOUT_MESSAGES = count('BENCH_FANOUT', 50);
const ROUNDS = count('BENCH_ROUNDS', 3);
const WARMUP = count('BENCH_WARMUP', 1);
const REPEAT = count('BENCH_REPEAT', 10);
const BIG_VALUE = 'b'.repeat(BIG_BYTES);

const clientNames = ['ioredis', '@yydb/redis', 'node-redis'];

function runQuiet(command, args, cwd) {
  try {
    return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  }
  catch {
    return null;
  }
}

// provenance 采集：在仓根执行以便 rustup 按 `rust-toolchain.toml` 解析钉住的工具链。
const rustcVersion = runQuiet('rustc', ['--version'], repoRoot);
const rustcVerbose = runQuiet('rustc', ['-vV'], repoRoot);
const targetTriple = rustcVerbose === null ? null : /\bhost:\s*(\S+)/.exec(rustcVerbose)?.[1] ?? null;
const gitRev = runQuiet('git', ['rev-parse', 'HEAD'], repoRoot);

// 场景矩阵：每格一个 workload，`scenario` 是跨运行对比的连接键，
// `params` 与 `dataScale` 进 provenance，`ops` 是本轮发出的命令数。
const workloads = [
  {
    name: 'get-seq',
    scenario: 'redis-string-get',
    ops: GET_COUNT,
    params: { ops: String(GET_COUNT), value_bytes: '64' },
    dataScale: `keys=${GET_COUNT}`,
    async prepare(ctx) {
      await preload(ctx, GET_COUNT, 'bench:get');
    },
    async run({ client }) {
      for (let index = 0; index < GET_COUNT; index += 1) {
        const value = await client.get(`bench:get:${index}`);
        if (value !== VALUE) throw new Error(`get-seq mismatch at ${index}`);
      }
    },
  },
  {
    name: 'set-seq',
    scenario: 'redis-string-set',
    ops: SET_COUNT,
    params: { ops: String(SET_COUNT), value_bytes: '64' },
    dataScale: `keys=${SET_COUNT}`,
    async run({ client }) {
      for (let index = 0; index < SET_COUNT; index += 1) {
        await client.set(`bench:set:${index}`, VALUE);
      }
    },
  },
  {
    name: 'mset-seq',
    scenario: 'redis-string-mset',
    ops: MSET_COUNT,
    params: { keys: String(MSET_COUNT), value_bytes: '64' },
    dataScale: `keys=${MSET_COUNT}`,
    async run({ client }) {
      const args = [];
      for (let index = 0; index < MSET_COUNT; index += 1) {
        args.push(`bench:mset:${index}`, VALUE);
      }
      await client.call(['MSET', ...args]);
    },
  },
  {
    name: 'incr-seq',
    scenario: 'redis-string-incr',
    ops: INCR_COUNT,
    params: { ops: String(INCR_COUNT) },
    dataScale: 'keys=1',
    async reset(ctx) {
      await ctx.client.call(['DEL', 'bench:counter']);
    },
    async run({ client }) {
      for (let index = 0; index < INCR_COUNT; index += 1) {
        await client.call(['INCR', 'bench:counter']);
      }
    },
  },
  {
    name: 'set-pipeline',
    scenario: 'redis-pipeline-set',
    ops: PIPE_COUNT,
    params: { ops: String(PIPE_COUNT), batch: String(BATCH), value_bytes: '64' },
    dataScale: `keys=${PIPE_COUNT}`,
    async run({ client }) {
      for (let start = 0; start < PIPE_COUNT; start += BATCH) {
        const commands = [];
        for (let index = start; index < Math.min(start + BATCH, PIPE_COUNT); index += 1) {
          commands.push(['SET', `bench:pipe:${index}`, VALUE]);
        }
        await client.pipeline(commands);
      }
    },
  },
  {
    name: 'get-pipeline',
    scenario: 'redis-pipeline-get',
    ops: PIPE_COUNT,
    params: { ops: String(PIPE_COUNT), batch: String(BATCH), value_bytes: '64' },
    dataScale: `keys=${PIPE_COUNT}`,
    async prepare(ctx) {
      await preload(ctx, PIPE_COUNT, 'bench:pipeget');
    },
    async run({ client }) {
      for (let start = 0; start < PIPE_COUNT; start += BATCH) {
        const commands = [];
        for (let index = start; index < Math.min(start + BATCH, PIPE_COUNT); index += 1) {
          commands.push(['GET', `bench:pipeget:${index}`]);
        }
        await client.pipeline(commands);
      }
    },
  },
  {
    name: 'pipeline-mixed',
    scenario: 'redis-pipeline-mixed-families',
    ops: PIPE_COUNT,
    params: {
      ops: String(PIPE_COUNT),
      batch: String(BATCH),
      value_bytes: '64',
      families: 'SET,GET,INCR,HSET,LPUSH,SADD',
    },
    dataScale: `keys=${PIPE_COUNT}`,
    async prepare(ctx) {
      await preload(ctx, PIPE_COUNT, 'bench:mixget');
    },
    async reset(ctx) {
      // The write families grow their collections and counter across rounds, so
      // every round starts from the same preloaded state outside the timed region.
      await ctx.client.call(['DEL', 'bench:mix:hash', 'bench:mix:list', 'bench:mix:sset', 'bench:mix:counter']);
    },
    async run({ client }) {
      for (let start = 0; start < PIPE_COUNT; start += BATCH) {
        const commands = [];
        for (let index = start; index < Math.min(start + BATCH, PIPE_COUNT); index += 1) {
          switch (index % 6) {
            case 0: commands.push(['SET', `bench:mix:${index}`, VALUE]); break;
            case 1: commands.push(['GET', `bench:mixget:${index}`]); break;
            case 2: commands.push(['INCR', 'bench:mix:counter']); break;
            case 3: commands.push(['HSET', 'bench:mix:hash', `f${index}`, `v${index}`]); break;
            case 4: commands.push(['LPUSH', 'bench:mix:list', `e${index}`]); break;
            default: commands.push(['SADD', 'bench:mix:sset', `m${index}`]); break;
          }
        }
        const replies = await client.pipeline(commands);
        if (!Array.isArray(replies) || replies.length !== commands.length) {
          throw new Error(`mixed pipeline replies ${Array.isArray(replies) ? replies.length : replies}, expected ${commands.length}`);
        }
      }
    },
  },
  {
    name: 'hash-hset-hget',
    scenario: 'redis-hash-hset-hget',
    ops: COLL * 2 + 1,
    params: { fields: String(COLL) },
    dataScale: `key=1,fields=${COLL}`,
    async run({ client }) {
      await client.call(['DEL', 'bench:hash']);
      for (let index = 0; index < COLL; index += 1) {
        await client.call(['HSET', 'bench:hash', `f${index}`, `v${index}`]);
      }
      for (let index = 0; index < COLL; index += 1) {
        const value = await client.call(['HGET', 'bench:hash', `f${index}`]);
        if (value !== `v${index}`) throw new Error(`hash mismatch at ${index}`);
      }
    },
  },
  {
    name: 'hash-setnx-hrandfield',
    scenario: 'redis-hash-setnx-hrandfield',
    ops: COLL * 2 + 2,
    params: { fields: String(COLL) },
    dataScale: `key=1,fields=${COLL}`,
    async run({ client }) {
      await client.call(['DEL', 'bench:hashnx']);
      for (let index = 0; index < COLL; index += 1) {
        await client.call(['HSETNX', 'bench:hashnx', `f${index}`, `v${index}`]);
      }
      const overwritten = await client.call(['HSETNX', 'bench:hashnx', 'f0', 'x']);
      if (Number(overwritten) !== 0) throw new Error(`HSETNX overwrote f0: ${overwritten}`);
      const single = await client.call(['HRANDFIELD', 'bench:hashnx']);
      if (typeof single !== 'string' || !single.startsWith('f')) throw new Error(`HRANDFIELD returned ${single}`);
      const picks = await client.call(['HRANDFIELD', 'bench:hashnx', '4']);
      if (!Array.isArray(picks) || picks.length !== Math.min(4, COLL)) {
        throw new Error(`HRANDFIELD count returned ${Array.isArray(picks) ? picks.length : picks}`);
      }
    },
  },
  {
    name: 'list-rpush-lrange',
    scenario: 'redis-list-rpush-lrange',
    ops: COLL + 2,
    params: { elements: String(COLL) },
    dataScale: `key=1,elements=${COLL}`,
    async run({ client }) {
      await client.call(['DEL', 'bench:list']);
      for (let index = 0; index < COLL; index += 1) {
        await client.call(['RPUSH', 'bench:list', `e${index}`]);
      }
      const rows = await client.call(['LRANGE', 'bench:list', '0', '-1']);
      if (rows.length !== COLL) throw new Error(`list length ${rows.length}, expected ${COLL}`);
    },
  },
  {
    name: 'set-sadd-smembers',
    scenario: 'redis-set-sadd-smembers',
    ops: COLL + 2,
    params: { members: String(COLL) },
    dataScale: `key=1,members=${COLL}`,
    async run({ client }) {
      await client.call(['DEL', 'bench:sset']);
      for (let index = 0; index < COLL; index += 1) {
        await client.call(['SADD', 'bench:sset', `m${index}`]);
      }
      const members = await client.call(['SMEMBERS', 'bench:sset']);
      if (members.length !== COLL) throw new Error(`set size ${members.length}, expected ${COLL}`);
    },
  },
  {
    name: 'zset-zadd-zrange',
    scenario: 'redis-zset-zadd-zrange',
    ops: COLL + 2,
    params: { members: String(COLL), withscores: 'true' },
    dataScale: `key=1,members=${COLL}`,
    async run({ client }) {
      await client.call(['DEL', 'bench:zset']);
      for (let index = 0; index < COLL; index += 1) {
        await client.call(['ZADD', 'bench:zset', String(index), `z${index}`]);
      }
      const rows = await client.call(['ZRANGE', 'bench:zset', '0', '-1', 'WITHSCORES']);
      // 仿真器 RESP2 下以嵌套 pair 回 `WITHSCORES`，真 redis-server 平铺，两种形态都归一。
      const pairs = Array.isArray(rows[0]) ? rows.length : rows.length / 2;
      if (pairs !== COLL) throw new Error(`zset pairs ${pairs}, expected ${COLL}`);
    },
  },
  {
    name: 'streams-xadd-xrange',
    scenario: 'redis-stream-xadd-xrange',
    ops: STREAM_COUNT + 2,
    params: { entries: String(STREAM_COUNT), fields: '1' },
    dataScale: `key=1,entries=${STREAM_COUNT}`,
    async run({ client }) {
      await client.call(['DEL', 'bench:stream']);
      for (let index = 0; index < STREAM_COUNT; index += 1) {
        await client.call(['XADD', 'bench:stream', '*', 'entry', `v${index}`]);
      }
      const rows = await client.call(['XRANGE', 'bench:stream', '-', '+']);
      if (!Array.isArray(rows) || rows.length !== STREAM_COUNT) {
        throw new Error(`stream length ${Array.isArray(rows) ? rows.length : rows}, expected ${STREAM_COUNT}`);
      }
    },
  },
  {
    name: 'pubsub-roundtrip',
    scenario: 'redis-pubsub-publish-deliver',
    ops: PUBSUB_COUNT,
    params: { messages: String(PUBSUB_COUNT), channels: '1' },
    dataScale: 'keys=0,channel=bench:news',
    async prepare(ctx) {
      ctx.subscriber = await createClient(ctx.clientName, { host: ctx.host, port: ctx.port });
      await ctx.subscriber.subscribe('bench:news');
    },
    async cleanup(ctx) {
      await ctx.subscriber?.close();
    },
    async run({ client, subscriber }) {
      for (let index = 0; index < PUBSUB_COUNT; index += 1) {
        const payload = `m${index}`;
        const receivers = await client.call(['PUBLISH', 'bench:news', payload]);
        if (receivers !== 1) throw new Error(`publish reported ${receivers} receivers, expected 1`);
        const received = await subscriber.nextMessage();
        if (received !== payload) throw new Error(`pubsub mismatch at ${index}: ${received}`);
      }
    },
  },
  {
    name: 'blpop-roundtrip',
    scenario: 'redis-list-blpop-push',
    ops: BLOCK_COUNT,
    params: { roundtrips: String(BLOCK_COUNT), timeout_seconds: '5' },
    dataScale: 'keys=0,list=bench:blocking',
    async prepare(ctx) {
      ctx.blocker = await createClient(ctx.clientName, { host: ctx.host, port: ctx.port });
    },
    async cleanup(ctx) {
      await ctx.blocker?.close();
    },
    async reset(ctx) {
      await ctx.client.call(['DEL', 'bench:blocking']);
    },
    async run({ client, blocker }) {
      for (let index = 0; index < BLOCK_COUNT; index += 1) {
        const payload = `v${index}`;
        // Park the consumer first, then wake it from the writer connection.
        const parked = blocker.call(['BLPOP', 'bench:blocking', '5']);
        const pushed = await client.call(['RPUSH', 'bench:blocking', payload]);
        if (pushed !== 1) throw new Error(`blpop-roundtrip push replied ${pushed}`);
        const popped = await parked;
        if (!Array.isArray(popped) || popped[1] !== payload) {
          throw new Error(`blpop-roundtrip mismatch at ${index}: ${JSON.stringify(popped)}`);
        }
      }
    },
  },
  {
    name: 'scan-full',
    scenario: 'redis-scan-full-keyspace',
    ops: COLL,
    params: { keys: String(COLL), count_hint: '50' },
    dataScale: `keys=${COLL}`,
    async prepare(ctx) {
      await preload(ctx, COLL, 'bench:scan');
    },
    async run({ client }) {
      let cursor = '0';
      let seen = 0;
      do {
        const [next, keys] = await client.call(['SCAN', cursor, 'COUNT', '50']);
        cursor = String(next);
        seen += keys.length;
      } while (cursor !== '0');
      if (seen !== COLL) throw new Error(`scan-full visited ${seen}, expected ${COLL}`);
    },
  },
  {
    name: 'ping-concurrent',
    scenario: 'redis-ping-concurrent',
    ops: PING_CONC,
    params: { ops: String(PING_CONC), connections: String(CONCURRENCY) },
    dataScale: `connections=${CONCURRENCY}`,
    async prepare(ctx) {
      ctx.peers = await Promise.all(Array.from({ length: CONCURRENCY }, () => (
        createClient(ctx.clientName, { host: ctx.host, port: ctx.port })
      )));
    },
    async cleanup(ctx) {
      await Promise.all((ctx.peers ?? []).map(peer => peer.close()));
    },
    async run({ peers }) {
      // Every connection keeps its own request/response chain; the server sees
      // them interleaved on one event loop.
      const perPeer = Math.ceil(PING_CONC / peers.length);
      await Promise.all(peers.map(async peer => {
        for (let index = 0; index < perPeer; index += 1) {
          await peer.ping();
        }
      }));
    },
  },
  {
    name: 'stream-group',
    scenario: 'redis-stream-consumer-group',
    ops: GROUP_COUNT * 3,
    params: { entries: String(GROUP_COUNT), group: 'workers', consumer: 'c1' },
    dataScale: `entries=${GROUP_COUNT}`,
    async reset(ctx) {
      await ctx.client.call(['DEL', 'bench:group']);
      await ctx.client.call(['XGROUP', 'CREATE', 'bench:group', 'workers', '0', 'MKSTREAM']);
    },
    async run({ client }) {
      for (let index = 0; index < GROUP_COUNT; index += 1) {
        const id = await client.call(['XADD', 'bench:group', '*', 'f', `v${index}`]);
        const read = await client.call([
          'XREADGROUP', 'GROUP', 'workers', 'c1', 'COUNT', '1', 'STREAMS', 'bench:group', '>',
        ]);
        if (!Array.isArray(read) || read.length === 0) {
          throw new Error(`stream-group read missed entry ${index}`);
        }
        const acked = await client.call(['XACK', 'bench:group', 'workers', String(id)]);
        if (acked !== 1) throw new Error(`stream-group ack replied ${acked}`);
      }
    },
  },
  {
    name: 'ttl-setex-expire',
    scenario: 'redis-ttl-setex-expire',
    ops: TTL_COUNT * 3,
    params: { keys: String(TTL_COUNT), ttl_seconds: '1', wait_ms: '1100' },
    dataScale: `keys=${TTL_COUNT},value_bytes=64`,
    async run({ client }) {
      for (let index = 0; index < TTL_COUNT; index += 1) {
        await client.call(['SETEX', `bench:ttl:${index}`, '1', VALUE]);
      }
      for (let index = 0; index < TTL_COUNT; index += 1) {
        const remaining = await client.ttl(`bench:ttl:${index}`);
        if (!(remaining > 0)) throw new Error(`ttl ${remaining} at ${index}, expected a live deadline`);
      }
      await new Promise(resolve => setTimeout(resolve, 1_100));
      for (let index = 0; index < TTL_COUNT; index += 1) {
        const value = await client.get(`bench:ttl:${index}`);
        if (value !== null) throw new Error(`ttl-expire miss at ${index}: key still live`);
      }
    },
  },
  {
    name: 'multi-exec',
    scenario: 'redis-txn-multi-exec',
    ops: TXN_COUNT + 2,
    params: { commands: String(TXN_COUNT), probe: 'SET' },
    dataScale: `keys=${TXN_COUNT},value_bytes=64`,
    async run({ client }) {
      await client.call(['MULTI']);
      for (let index = 0; index < TXN_COUNT; index += 1) {
        const queued = await client.call(['SET', `bench:txn:${index}`, VALUE]);
        if (queued !== 'QUEUED') throw new Error(`multi queue failed at ${index}: ${queued}`);
      }
      const replies = await client.call(['EXEC']);
      if (!Array.isArray(replies) || replies.length !== TXN_COUNT) {
        throw new Error(`exec replies ${Array.isArray(replies) ? replies.length : replies}, expected ${TXN_COUNT}`);
      }
    },
  },
  {
    name: 'mget-seq',
    scenario: 'redis-string-mget',
    ops: COLL,
    params: { keys: String(COLL), value_bytes: '64' },
    dataScale: `keys=${COLL}`,
    async prepare(ctx) {
      await preload(ctx, COLL, 'bench:mget');
    },
    async run({ client }) {
      const keys = Array.from({ length: COLL }, (_, index) => `bench:mget:${index}`);
      const values = await client.call(['MGET', ...keys]);
      if (!Array.isArray(values) || values.length !== COLL) {
        throw new Error(`mget returned ${Array.isArray(values) ? values.length : values} values, expected ${COLL}`);
      }
      if (values[0] !== VALUE || values[COLL - 1] !== VALUE) throw new Error('mget value mismatch');
    },
  },
  {
    name: 'append-getrange',
    scenario: 'redis-string-append-getrange',
    ops: COLL + 1,
    params: { appends: String(COLL), chunk_bytes: '16' },
    dataScale: 'key=1',
    async reset(ctx) {
      await ctx.client.call(['DEL', 'bench:append']);
    },
    async run({ client }) {
      const chunk = 'c'.repeat(16);
      for (let index = 0; index < COLL; index += 1) {
        const length = await client.call(['APPEND', 'bench:append', chunk]);
        if (length !== (index + 1) * 16) {
          throw new Error(`append length ${length} at ${index}, expected ${(index + 1) * 16}`);
        }
      }
      const tail = await client.call(['GETRANGE', 'bench:append', '-16', '-1']);
      if (typeof tail !== 'string' || tail !== chunk) throw new Error(`getrange tail was ${tail}`);
    },
  },
  {
    name: 'getdel-getex',
    scenario: 'redis-string-getdel-getex',
    ops: COLL * 2,
    params: { keys: String(COLL), ttl_seconds: '100' },
    dataScale: `keys=${COLL},value_bytes=64`,
    async reset(ctx) {
      const commands = [];
      for (let index = 0; index < COLL; index += 1) {
        commands.push(['SET', `bench:getdel:${index}`, VALUE, 'EX', '100']);
      }
      for (let start = 0; start < commands.length; start += BATCH) {
        await ctx.client.pipeline(commands.slice(start, start + BATCH));
      }
    },
    async run({ client }) {
      for (let index = 0; index < COLL; index += 1) {
        const key = `bench:getdel:${index}`;
        const refreshed = await client.call(['GETEX', key, 'EX', '100']);
        if (refreshed !== VALUE) throw new Error(`getex mismatch at ${index}: ${refreshed}`);
        const removed = await client.call(['GETDEL', key]);
        if (removed !== VALUE) throw new Error(`getdel mismatch at ${index}: ${removed}`);
      }
    },
  },
  {
    name: 'set-options',
    scenario: 'redis-string-set-options',
    ops: COLL * 2,
    params: { keys: String(COLL), options: 'NX,XX,GET' },
    dataScale: `keys=${COLL},value_bytes=64`,
    async reset(ctx) {
      const commands = [];
      for (let index = 0; index < COLL; index += 1) {
        commands.push(['DEL', `bench:setopt:${index}`]);
      }
      for (let start = 0; start < commands.length; start += BATCH) {
        await ctx.client.pipeline(commands.slice(start, start + BATCH));
      }
    },
    async run({ client }) {
      for (let index = 0; index < COLL; index += 1) {
        const key = `bench:setopt:${index}`;
        const created = await client.call(['SET', key, VALUE, 'NX']);
        if (created !== 'OK') throw new Error(`SET NX replied ${created} at ${index}`);
        const previous = await client.call(['SET', key, `${VALUE}x`, 'XX', 'GET']);
        if (previous !== VALUE) throw new Error(`SET XX GET replied ${previous} at ${index}`);
      }
    },
  },
  {
    name: 'exists-type',
    scenario: 'redis-key-exists-type',
    ops: COLL * 2,
    params: { keys: String(COLL) },
    dataScale: `keys=${COLL},value_bytes=64`,
    async prepare(ctx) {
      await preload(ctx, COLL, 'bench:exists');
    },
    async run({ client }) {
      for (let index = 0; index < COLL; index += 1) {
        const key = `bench:exists:${index}`;
        const present = await client.call(['EXISTS', key]);
        if (present !== 1) throw new Error(`EXISTS replied ${present} at ${index}`);
        const type = await client.call(['TYPE', key]);
        if (type !== 'string') throw new Error(`TYPE replied ${type} at ${index}`);
      }
    },
  },
  {
    name: 'expire-persist',
    scenario: 'redis-key-expire-persist',
    ops: COLL * 3,
    params: { keys: String(COLL), ttl_seconds: '100' },
    dataScale: `keys=${COLL},value_bytes=64`,
    async prepare(ctx) {
      await preload(ctx, COLL, 'bench:expire');
    },
    async run({ client }) {
      for (let index = 0; index < COLL; index += 1) {
        const key = `bench:expire:${index}`;
        const attached = await client.call(['EXPIRE', key, '100']);
        if (attached !== 1) throw new Error(`EXPIRE replied ${attached} at ${index}`);
        const remaining = await client.call(['TTL', key]);
        if (!(remaining > 0 && remaining <= 100)) {
          throw new Error(`TTL replied ${remaining} at ${index}`);
        }
        const persisted = await client.call(['PERSIST', key]);
        if (persisted !== 1) throw new Error(`PERSIST replied ${persisted} at ${index}`);
      }
    },
  },
  {
    name: 'hash-hgetall-hdel',
    scenario: 'redis-hash-hgetall-hdel',
    ops: COLL + 2,
    params: { fields: String(COLL) },
    dataScale: `key=1,fields=${COLL}`,
    async run({ client }) {
      await client.call(['DEL', 'bench:hashall']);
      const pairs = [];
      const fields = [];
      for (let index = 0; index < COLL; index += 1) {
        pairs.push(`f${index}`, `v${index}`);
        fields.push(`f${index}`);
      }
      await client.call(['HSET', 'bench:hashall', ...pairs]);
      const flat = await client.call(['HGETALL', 'bench:hashall']);
      if (!Array.isArray(flat) || flat.length !== COLL * 2) {
        throw new Error(`HGETALL returned ${Array.isArray(flat) ? flat.length : flat} items, expected ${COLL * 2}`);
      }
      const removed = await client.call(['HDEL', 'bench:hashall', ...fields]);
      if (removed !== COLL) throw new Error(`HDEL removed ${removed}, expected ${COLL}`);
    },
  },
  {
    name: 'hash-keys-values',
    scenario: 'redis-hash-hkeys-hvals-hlen-hincrby',
    ops: REPEAT * 4,
    params: { fields: String(COLL), repeat: String(REPEAT), commands: 'HKEYS,HVALS,HLEN,HINCRBY' },
    dataScale: `key=1,fields=${COLL}`,
    async reset(ctx) {
      // The field values are numeric so `HINCRBY` keeps the field count stable;
      // the seed runs outside the timed region so every round starts equal.
      const pairs = [];
      for (let index = 0; index < COLL; index += 1) pairs.push(`f${index}`, String(index));
      await ctx.client.call(['DEL', 'bench:hkv']);
      await ctx.client.call(['HSET', 'bench:hkv', ...pairs]);
    },
    async run({ client }) {
      // `reset` seeds once before the timed rounds, so `f0` keeps its value
      // across repeats and clients; assert each bump adds exactly one rather
      // than pinning an absolute reply.
      let previous = null;
      for (let round = 0; round < REPEAT; round += 1) {
        const keys = await client.call(['HKEYS', 'bench:hkv']);
        if (!Array.isArray(keys) || keys.length !== COLL) {
          throw new Error(`hash-keys-values HKEYS replied ${Array.isArray(keys) ? keys.length : keys}`);
        }
        const values = await client.call(['HVALS', 'bench:hkv']);
        if (!Array.isArray(values) || values.length !== COLL) {
          throw new Error(`hash-keys-values HVALS replied ${Array.isArray(values) ? values.length : values}`);
        }
        const size = await client.call(['HLEN', 'bench:hkv']);
        if (size !== COLL) throw new Error(`hash-keys-values HLEN replied ${size}`);
        const bumped = await client.call(['HINCRBY', 'bench:hkv', 'f0', '1']);
        if (previous !== null && bumped !== previous + 1) {
          throw new Error(`hash-keys-values HINCRBY replied ${bumped}, expected ${previous + 1}`);
        }
        previous = bumped;
      }
    },
  },
  {
    name: 'list-lpush-lpop',
    scenario: 'redis-list-lpush-lpop',
    ops: COLL * 2,
    params: { elements: String(COLL) },
    dataScale: 'key=1,elements=' + COLL,
    async run({ client }) {
      await client.call(['DEL', 'bench:lpoplist']);
      for (let index = 0; index < COLL; index += 1) {
        await client.call(['LPUSH', 'bench:lpoplist', `e${index}`]);
      }
      for (let index = 0; index < COLL; index += 1) {
        const popped = await client.call(['LPOP', 'bench:lpoplist']);
        if (popped !== `e${COLL - 1 - index}`) {
          throw new Error(`LPOP replied ${popped} at ${index}, expected e${COLL - 1 - index}`);
        }
      }
    },
  },
  {
    name: 'set-algebra',
    scenario: 'redis-set-sinter-sunion-sdiff',
    ops: REPEAT * 3,
    params: { members: String(COLL), repeat: String(REPEAT) },
    dataScale: `keys=2,members=${COLL}`,
    async prepare(ctx) {
      const left = Array.from({ length: COLL }, (_, index) => `m${index}`);
      const right = Array.from({ length: COLL }, (_, index) => `m${index + Math.floor(COLL / 2)}`);
      await ctx.client.call(['SADD', 'bench:alg:a', ...left]);
      await ctx.client.call(['SADD', 'bench:alg:b', ...right]);
    },
    async run({ client }) {
      for (let round = 0; round < REPEAT; round += 1) {
        const intersection = await client.call(['SINTER', 'bench:alg:a', 'bench:alg:b']);
        const union = await client.call(['SUNION', 'bench:alg:a', 'bench:alg:b']);
        const difference = await client.call(['SDIFF', 'bench:alg:a', 'bench:alg:b']);
        if (!Array.isArray(intersection) || intersection.length !== Math.ceil(COLL / 2)) {
          throw new Error(`SINTER size ${Array.isArray(intersection) ? intersection.length : intersection}`);
        }
        if (!Array.isArray(union) || union.length !== COLL + Math.floor(COLL / 2)) {
          throw new Error(`SUNION size ${Array.isArray(union) ? union.length : union}`);
        }
        if (!Array.isArray(difference) || difference.length !== Math.floor(COLL / 2)) {
          throw new Error(`SDIFF size ${Array.isArray(difference) ? difference.length : difference}`);
        }
      }
    },
  },
  {
    name: 'set-membership-ops',
    scenario: 'redis-set-membership-cardinality',
    ops: REPEAT * 3,
    params: { members: String(COLL), repeat: String(REPEAT), commands: 'SMISMEMBER,SINTERCARD,SRANDMEMBER' },
    dataScale: `keys=2,members=${COLL}`,
    async reset(ctx) {
      const left = Array.from({ length: COLL }, (_, index) => `m${index}`);
      const right = Array.from({ length: COLL }, (_, index) => `m${index + Math.floor(COLL / 2)}`);
      await ctx.client.call(['DEL', 'bench:mem:a', 'bench:mem:b']);
      await ctx.client.call(['SADD', 'bench:mem:a', ...left]);
      await ctx.client.call(['SADD', 'bench:mem:b', ...right]);
    },
    async run({ client }) {
      const members = Array.from({ length: COLL }, (_, index) => `m${index}`);
      const half = Math.ceil(COLL / 2);
      for (let round = 0; round < REPEAT; round += 1) {
        const flags = await client.call(['SMISMEMBER', 'bench:mem:a', ...members]);
        if (!Array.isArray(flags) || flags.length !== COLL || flags.some(flag => flag !== 1)) {
          throw new Error(`SMISMEMBER replied ${Array.isArray(flags) ? flags.length : flags} members`);
        }
        const cardinality = await client.call(['SINTERCARD', '2', 'bench:mem:a', 'bench:mem:b']);
        if (cardinality !== half) throw new Error(`SINTERCARD replied ${cardinality}, expected ${half}`);
        const picks = await client.call(['SRANDMEMBER', 'bench:mem:a', String(half)]);
        if (!Array.isArray(picks) || picks.length !== half) {
          throw new Error(`SRANDMEMBER replied ${Array.isArray(picks) ? picks.length : picks}, expected ${half}`);
        }
      }
    },
  },
  {
    name: 'zset-pop-ops',
    scenario: 'redis-zset-pop-random-score',
    ops: 4,
    params: { members: String(COLL), commands: 'ZMSCORE,ZRANDMEMBER,ZPOPMIN,ZPOPMAX' },
    dataScale: `key=1,members=${COLL}`,
    async reset(ctx) {
      const args = [];
      for (let index = 0; index < COLL; index += 1) {
        args.push(String(index), `z${index}`);
      }
      await ctx.client.call(['DEL', 'bench:zpop']);
      await ctx.client.call(['ZADD', 'bench:zpop', ...args]);
    },
    async run({ client }) {
      const members = Array.from({ length: COLL }, (_, index) => `z${index}`);
      const half = Math.floor(COLL / 2);
      const scores = await client.call(['ZMSCORE', 'bench:zpop', ...members]);
      if (!Array.isArray(scores) || scores.length !== COLL) {
        throw new Error(`ZMSCORE replied ${Array.isArray(scores) ? scores.length : scores}, expected ${COLL}`);
      }
      const random = await client.call(['ZRANDMEMBER', 'bench:zpop', String(COLL)]);
      if (!Array.isArray(random) || random.length !== COLL) {
        throw new Error(`ZRANDMEMBER replied ${Array.isArray(random) ? random.length : random}, expected ${COLL}`);
      }
      // RESP2 flattens `WITHSCORES` pairs on a real server; the emulator may nest
      // them. Both shapes carry the same pair count.
      const pairCount = rows => (Array.isArray(rows[0]) ? rows.length : rows.length / 2);
      const lowest = await client.call(['ZPOPMIN', 'bench:zpop', String(half)]);
      if (pairCount(lowest) !== half) throw new Error(`ZPOPMIN replied ${pairCount(lowest)} pairs`);
      const highest = await client.call(['ZPOPMAX', 'bench:zpop', String(half)]);
      if (pairCount(highest) !== half) throw new Error(`ZPOPMAX replied ${pairCount(highest)} pairs`);
    },
  },
  {
    name: 'zset-range-queries',
    scenario: 'redis-zset-rangebyscore-rangebylex',
    ops: REPEAT * 4,
    params: {
      members: String(COLL),
      repeat: String(REPEAT),
      commands: 'ZCOUNT,ZRANGEBYSCORE,ZREVRANGEBYSCORE,ZRANGEBYLEX',
    },
    dataScale: `keys=2,members=${COLL}`,
    async reset(ctx) {
      // One zset spreads its scores so the score ranges select everything, the
      // other puts every member at score 0 so the lex range is well defined.
      const scored = [];
      const lex = [];
      for (let index = 0; index < COLL; index += 1) {
        scored.push(String(index), `z${index}`);
        lex.push('0', `m${String(index).padStart(4, '0')}`);
      }
      await ctx.client.call(['DEL', 'bench:zrange', 'bench:zlex']);
      await ctx.client.call(['ZADD', 'bench:zrange', ...scored]);
      await ctx.client.call(['ZADD', 'bench:zlex', ...lex]);
    },
    async run({ client }) {
      const high = String(COLL - 1);
      for (let round = 0; round < REPEAT; round += 1) {
        const counted = await client.call(['ZCOUNT', 'bench:zrange', '0', high]);
        if (counted !== COLL) throw new Error(`zset-range-queries ZCOUNT replied ${counted}, expected ${COLL}`);
        const ascending = await client.call(['ZRANGEBYSCORE', 'bench:zrange', '0', high]);
        if (!Array.isArray(ascending) || ascending.length !== COLL) {
          throw new Error(`zset-range-queries ZRANGEBYSCORE replied ${Array.isArray(ascending) ? ascending.length : ascending}`);
        }
        const descending = await client.call(['ZREVRANGEBYSCORE', 'bench:zrange', high, '0']);
        if (!Array.isArray(descending) || descending.length !== COLL) {
          throw new Error(`zset-range-queries ZREVRANGEBYSCORE replied ${Array.isArray(descending) ? descending.length : descending}`);
        }
        const lexical = await client.call(['ZRANGEBYLEX', 'bench:zlex', '-', '+']);
        if (!Array.isArray(lexical) || lexical.length !== COLL) {
          throw new Error(`zset-range-queries ZRANGEBYLEX replied ${Array.isArray(lexical) ? lexical.length : lexical}`);
        }
      }
    },
  },
  {
    name: 'large-collection-read',
    scenario: 'redis-large-collection-full-read',
    ops: REPEAT * 2,
    params: { members: String(LARGE_COLL), repeat: String(REPEAT), commands: 'SMEMBERS,ZRANGE' },
    dataScale: `keys=2,members=${LARGE_COLL}`,
    async prepare(ctx) {
      const members = Array.from({ length: LARGE_COLL }, (_, index) => `m${index}`);
      const scored = [];
      for (let index = 0; index < LARGE_COLL; index += 1) {
        scored.push(String(index), `m${index}`);
      }
      await ctx.client.call(['DEL', 'bench:largeset', 'bench:largezset']);
      await ctx.client.call(['SADD', 'bench:largeset', ...members]);
      await ctx.client.call(['ZADD', 'bench:largezset', ...scored]);
    },
    async run({ client }) {
      for (let round = 0; round < REPEAT; round += 1) {
        const members = await client.call(['SMEMBERS', 'bench:largeset']);
        if (!Array.isArray(members) || members.length !== LARGE_COLL) {
          throw new Error(`SMEMBERS replied ${Array.isArray(members) ? members.length : members}, expected ${LARGE_COLL}`);
        }
        const rows = await client.call(['ZRANGE', 'bench:largezset', '0', '-1']);
        if (!Array.isArray(rows) || rows.length !== LARGE_COLL) {
          throw new Error(`ZRANGE replied ${Array.isArray(rows) ? rows.length : rows}, expected ${LARGE_COLL}`);
        }
      }
    },
  },
  {
    name: 'large-hash-list-read',
    scenario: 'redis-large-hash-list-full-read',
    ops: REPEAT * 2,
    params: { members: String(LARGE_COLL), repeat: String(REPEAT), commands: 'HGETALL,LRANGE' },
    dataScale: `keys=2,members=${LARGE_COLL}`,
    async prepare(ctx) {
      // Seed in bounded calls so neither the client nor the server sees one
      // multi-thousand-argument command; the seeding stays outside the timed run.
      await ctx.client.call(['DEL', 'bench:largehash', 'bench:largelist']);
      for (let start = 0; start < LARGE_COLL; start += 100) {
        const pairs = ['HSET', 'bench:largehash'];
        const elements = ['RPUSH', 'bench:largelist'];
        for (let index = start; index < Math.min(start + 100, LARGE_COLL); index += 1) {
          pairs.push(`f${index}`, `v${index}`);
          elements.push(`e${index}`);
        }
        await ctx.client.pipeline([pairs, elements]);
      }
    },
    async run({ client }) {
      for (let round = 0; round < REPEAT; round += 1) {
        const pairs = await client.call(['HGETALL', 'bench:largehash']);
        const fields = Array.isArray(pairs) ? pairs.length / 2 : Object.keys(pairs ?? {}).length;
        if (fields !== LARGE_COLL) throw new Error(`large-hash-list-read HGETALL pairs ${fields}`);
        const elements = await client.call(['LRANGE', 'bench:largelist', '0', '-1']);
        if (!Array.isArray(elements) || elements.length !== LARGE_COLL) {
          throw new Error(`large-hash-list-read LRANGE replied ${Array.isArray(elements) ? elements.length : elements}`);
        }
      }
    },
  },
  {
    name: 'resp3-hello',
    scenario: 'redis-resp3-hello-roundtrip',
    // Every client in this cell negotiates RESP3, so the reply framing itself
    // (map header for `HELLO`, `~` for `SMEMBERS`) is part of the measurement.
    protocol: 3,
    ops: REPEAT * 4,
    params: { repeat: String(REPEAT), commands: 'HELLO,GET,SMEMBERS,PING', value_bytes: '64' },
    dataScale: `keys=${COLL},members=${COLL}`,
    async prepare(ctx) {
      await preload(ctx, COLL, 'bench:resp3');
      const members = Array.from({ length: COLL }, (_, index) => `m${index}`);
      await ctx.client.call(['DEL', 'bench:resp3:sset']);
      await ctx.client.call(['SADD', 'bench:resp3:sset', ...members]);
    },
    async run({ client }) {
      for (let round = 0; round < REPEAT; round += 1) {
        const hello = await client.call(['HELLO', '3']);
        // ioredis flattens a RESP3 map to a flat array, node-redis hands back a
        // Map and the product client a plain object; accept all three shapes.
        const proto = Array.isArray(hello)
          ? hello[hello.indexOf('proto') + 1]
          : (hello?.proto ?? hello?.get?.('proto'));
        if (Number(proto) !== 3) throw new Error(`HELLO 3 replied proto=${proto}`);
        const value = await client.get('bench:resp3:0');
        if (value !== VALUE) throw new Error(`resp3 GET missed the preloaded value`);
        const members = await client.call(['SMEMBERS', 'bench:resp3:sset']);
        if (!Array.isArray(members) || members.length !== COLL) {
          throw new Error(`resp3 SMEMBERS replied ${Array.isArray(members) ? members.length : members}`);
        }
        await client.ping();
      }
    },
  },
  {
    name: 'expire-sweep',
    scenario: 'redis-expire-sweep',
    ops: SWEEP_COUNT * 2 + 2,
    params: {
      keys: String(SWEEP_COUNT),
      ttl_ms: String(SWEEP_TTL_MS),
      wait_ms: String(SWEEP_WAIT_MS),
      value_bytes: '64',
    },
    dataScale: `keys=${SWEEP_COUNT},value_bytes=64`,
    async reset(ctx) {
      // The previous round may leave a key live if its deadline has not been
      // swept yet, so every round starts from an empty database.
      await ctx.client.call(['FLUSHDB']);
    },
    async run({ client }) {
      const commands = [];
      for (let index = 0; index < SWEEP_COUNT; index += 1) {
        commands.push(['SET', `bench:sweep:${index}`, VALUE, 'PX', String(SWEEP_TTL_MS)]);
      }
      for (let start = 0; start < commands.length; start += BATCH) {
        await client.pipeline(commands.slice(start, start + BATCH));
      }
      const live = await client.call(['DBSIZE']);
      // A slow host can take longer than the TTL to write the whole batch, so
      // keys written first may already be swept. The wait below still proves the
      // cleanup path; only a larger-than-seeded count would be a defect.
      if (live > SWEEP_COUNT) throw new Error(`DBSIZE replied ${live} before expiry, expected at most ${SWEEP_COUNT}`);
      // The server's active sweep runs every 100ms, so a wait comfortably above
      // one tick is enough to drop the whole expired set.
      await new Promise(resolve => setTimeout(resolve, SWEEP_WAIT_MS));
      const remaining = await client.call(['DBSIZE']);
      if (remaining !== 0) throw new Error(`DBSIZE replied ${remaining} after expiry, expected 0`);
      for (let index = 0; index < SWEEP_COUNT; index += 1) {
        const value = await client.get(`bench:sweep:${index}`);
        if (value !== null) throw new Error(`expired key ${index} is still live`);
      }
    },
  },
  {
    name: 'multi-exec-mixed',
    scenario: 'redis-txn-multi-exec-families',
    ops: TXN_COUNT + 2,
    params: {
      commands: String(TXN_COUNT),
      families: 'SET,GET,INCR,HSET,LPUSH,SADD',
      value_bytes: '64',
    },
    dataScale: `keys=${TXN_COUNT},value_bytes=64`,
    async prepare(ctx) {
      await preload(ctx, TXN_COUNT, 'bench:txnmix');
    },
    async reset(ctx) {
      const keys = [];
      for (let index = 0; index < TXN_COUNT; index += 6) keys.push(`bench:txnmix:w:${index}`);
      await ctx.client.call([
        'DEL',
        ...keys,
        'bench:txnmix:hash',
        'bench:txnmix:list',
        'bench:txnmix:set',
        'bench:txnmix:counter',
      ]);
    },
    async run({ client }) {
      await client.call(['MULTI']);
      for (let index = 0; index < TXN_COUNT; index += 1) {
        let queued;
        switch (index % 6) {
          case 0: queued = await client.call(['SET', `bench:txnmix:w:${index}`, VALUE]); break;
          case 1: queued = await client.call(['GET', `bench:txnmix:${index}`]); break;
          case 2: queued = await client.call(['INCR', 'bench:txnmix:counter']); break;
          case 3: queued = await client.call(['HSET', 'bench:txnmix:hash', `f${index}`, `v${index}`]); break;
          case 4: queued = await client.call(['LPUSH', 'bench:txnmix:list', `e${index}`]); break;
          default: queued = await client.call(['SADD', 'bench:txnmix:set', `m${index}`]); break;
        }
        if (queued !== 'QUEUED') throw new Error(`multi queue failed at ${index}: ${queued}`);
      }
      const replies = await client.call(['EXEC']);
      if (!Array.isArray(replies) || replies.length !== TXN_COUNT) {
        throw new Error(`exec replies ${Array.isArray(replies) ? replies.length : replies}, expected ${TXN_COUNT}`);
      }
      if (replies[1] !== VALUE) throw new Error(`exec GET replied ${replies[1]}`);
    },
  },
  {
    name: 'pubsub-fanout',
    scenario: 'redis-pubsub-fanout',
    ops: FANOUT_MESSAGES * FANOUT_SUBS,
    params: { messages: String(FANOUT_MESSAGES), subscribers: String(FANOUT_SUBS), channels: '1' },
    dataScale: `keys=0,channel=bench:fanout,subscribers=${FANOUT_SUBS}`,
    async prepare(ctx) {
      ctx.fanout = await Promise.all(Array.from({ length: FANOUT_SUBS }, () => (
        createClient(ctx.clientName, { host: ctx.host, port: ctx.port, protocol: ctx.protocol })
      )));
      await Promise.all(ctx.fanout.map(subscriber => subscriber.subscribe('bench:fanout')));
    },
    async cleanup(ctx) {
      await Promise.all((ctx.fanout ?? []).map(subscriber => subscriber.close()));
    },
    async run({ client, fanout }) {
      for (let index = 0; index < FANOUT_MESSAGES; index += 1) {
        const payload = `f${index}`;
        const receivers = await client.call(['PUBLISH', 'bench:fanout', payload]);
        if (receivers !== FANOUT_SUBS) {
          throw new Error(`publish reported ${receivers} receivers, expected ${FANOUT_SUBS}`);
        }
        const delivered = await Promise.all(fanout.map(subscriber => subscriber.nextMessage()));
        for (const message of delivered) {
          if (message !== payload) throw new Error(`fanout mismatch at ${index}: ${message}`);
        }
      }
    },
  },
  {
    name: 'zset-score-ops',
    scenario: 'redis-zset-increment-rank',
    ops: COLL * 3,
    params: { members: String(COLL) },
    dataScale: 'key=1,members=' + COLL,
    async run({ client }) {
      await client.call(['DEL', 'bench:zscore']);
      for (let index = 0; index < COLL; index += 1) {
        const member = `z${index}`;
        const increment = String(index + 1);
        await client.call(['ZINCRBY', 'bench:zscore', increment, member]);
        const score = await client.call(['ZSCORE', 'bench:zscore', member]);
        if (String(score) !== increment) throw new Error(`ZSCORE replied ${score} at ${index}`);
        const rank = await client.call(['ZRANK', 'bench:zscore', member]);
        if (rank !== index) throw new Error(`ZRANK replied ${rank} at ${index}, expected ${index}`);
      }
    },
  },
  {
    name: 'bitfield-ops',
    scenario: 'redis-bitfield-increment',
    ops: COLL + 1,
    params: { increments: String(COLL), type: 'u32' },
    dataScale: 'key=1,bit_offset=0',
    async run({ client }) {
      await client.call(['DEL', 'bench:bitfield']);
      let last = 0;
      for (let index = 0; index < COLL; index += 1) {
        const reply = await client.call(['BITFIELD', 'bench:bitfield', 'INCRBY', 'u32', '0', '1']);
        last = Array.isArray(reply) ? reply[0] : reply;
      }
      if (last !== COLL) throw new Error(`BITFIELD INCRBY ended at ${last}, expected ${COLL}`);
      const read = await client.call(['BITFIELD', 'bench:bitfield', 'GET', 'u32', '0']);
      if ((Array.isArray(read) ? read[0] : read) !== COLL) throw new Error(`BITFIELD GET replied ${read}`);
    },
  },
  {
    name: 'hll-ops',
    scenario: 'redis-hyperloglog-add-count',
    ops: COLL + 1,
    params: { elements: String(COLL) },
    dataScale: 'key=1',
    async run({ client }) {
      await client.call(['DEL', 'bench:hll']);
      for (let index = 0; index < COLL; index += 1) {
        await client.call(['PFADD', 'bench:hll', `m${index}`]);
      }
      const count = await client.call(['PFCOUNT', 'bench:hll']);
      // HyperLogLog is an estimator; a small cardinality may come back a few
      // units off. Keep a 2% band instead of pinning the exact register estimate.
      if (!(Math.abs(count - COLL) <= Math.ceil(COLL * 0.02))) {
        throw new Error(`PFCOUNT replied ${count}, expected ${COLL} +/-2%`);
      }
    },
  },
  {
    name: 'sort-ops',
    scenario: 'redis-sort-list',
    ops: REPEAT,
    params: { elements: String(COLL), repeat: String(REPEAT), mode: 'SORT_RO' },
    dataScale: 'key=1,elements=' + COLL,
    async prepare(ctx) {
      for (let start = 0; start < COLL; start += BATCH) {
        const commands = [];
        for (let index = start; index < Math.min(start + BATCH, COLL); index += 1) {
          commands.push(['RPUSH', 'bench:sort', String((index * 7919) % COLL)]);
        }
        await ctx.client.pipeline(commands);
      }
    },
    async run({ client }) {
      for (let round = 0; round < REPEAT; round += 1) {
        const sorted = await client.call(['SORT_RO', 'bench:sort']);
        if (!Array.isArray(sorted) || sorted.length !== COLL) {
          throw new Error(`SORT_RO size ${Array.isArray(sorted) ? sorted.length : sorted}`);
        }
      }
    },
  },
  {
    name: 'keys-random',
    scenario: 'redis-keys-random-dbsize',
    ops: REPEAT * 3,
    params: { keys: String(COLL), repeat: String(REPEAT) },
    dataScale: `keys=${COLL}`,
    async prepare(ctx) {
      await preload(ctx, COLL, 'bench:keys');
    },
    async run({ client }) {
      for (let round = 0; round < REPEAT; round += 1) {
        const keys = await client.call(['KEYS', 'bench:keys:*']);
        if (!Array.isArray(keys) || keys.length !== COLL) {
          throw new Error(`KEYS matched ${Array.isArray(keys) ? keys.length : keys}, expected ${COLL}`);
        }
        const random = await client.call(['RANDOMKEY']);
        if (typeof random !== 'string') throw new Error(`RANDOMKEY replied ${random}`);
        const size = await client.call(['DBSIZE']);
        if (size !== COLL) throw new Error(`DBSIZE replied ${size}, expected ${COLL}`);
      }
    },
  },
  {
    name: 'stream-xread',
    scenario: 'redis-stream-xread',
    ops: REPEAT,
    params: { entries: String(COLL), repeat: String(REPEAT) },
    dataScale: 'key=1,entries=' + COLL,
    async reset(ctx) {
      await ctx.client.call(['DEL', 'bench:xread']);
      const commands = [];
      for (let index = 0; index < COLL; index += 1) {
        commands.push(['XADD', 'bench:xread', '*', 'f', `v${index}`]);
      }
      for (let start = 0; start < commands.length; start += BATCH) {
        await ctx.client.pipeline(commands.slice(start, start + BATCH));
      }
    },
    async run({ client }) {
      for (let round = 0; round < REPEAT; round += 1) {
        const read = await client.call(['XREAD', 'COUNT', '100', 'STREAMS', 'bench:xread', '0']);
        if (!Array.isArray(read) || read.length === 0) throw new Error('XREAD returned no stream');
        const entries = read[0]?.[1];
        if (!Array.isArray(entries) || entries.length !== Math.min(100, COLL)) {
          throw new Error(`XREAD entries ${Array.isArray(entries) ? entries.length : entries}`);
        }
      }
    },
  },
  {
    name: 'stream-xadd-xread',
    scenario: 'redis-stream-xadd-xread',
    ops: STREAM_COUNT + 2,
    params: { entries: String(STREAM_COUNT), read_count: '20', fields: '2' },
    dataScale: `key=1,entries=${STREAM_COUNT}`,
    async run({ client }) {
      await client.call(['DEL', 'bench:streamrw']);
      for (let index = 0; index < STREAM_COUNT; index += 1) {
        await client.call(['XADD', 'bench:streamrw', '*', 'k', `v${index}`, 'n', String(index)]);
      }
      const range = await client.call(['XRANGE', 'bench:streamrw', '-', '+', 'COUNT', '20']);
      if (!Array.isArray(range) || range.length !== Math.min(20, STREAM_COUNT)) {
        throw new Error(`stream-xadd-xread XRANGE rows ${Array.isArray(range) ? range.length : range}`);
      }
      const read = await client.call(['XREAD', 'COUNT', '20', 'STREAMS', 'bench:streamrw', '0']);
      const entries = read[0]?.[1];
      if (!Array.isArray(entries) || entries.length !== Math.min(20, STREAM_COUNT)) {
        throw new Error(`stream-xadd-xread XREAD entries ${Array.isArray(entries) ? entries.length : entries}`);
      }
    },
  },
  {
    name: 'hscan-cursor',
    scenario: 'redis-hash-scan-cursor',
    ops: COLL,
    params: { fields: String(COLL), count_hint: '32' },
    dataScale: `key=1,fields=${COLL}`,
    async prepare(ctx) {
      const commands = [];
      for (let start = 0; start < COLL; start += 50) {
        const args = ['HSET', 'bench:hscan'];
        for (let index = start; index < Math.min(start + 50, COLL); index += 1) {
          args.push(`f${index}`, `v${index}`);
        }
        commands.push(args);
      }
      await ctx.client.pipeline(commands);
    },
    async run({ client }) {
      let cursor = '0';
      let seen = 0;
      let calls = 0;
      do {
        const reply = await client.call(['HSCAN', 'bench:hscan', cursor, 'COUNT', '32']);
        if (!Array.isArray(reply) || reply.length !== 2) throw new Error('hscan-cursor malformed reply');
        cursor = String(reply[0]);
        // HSCAN answers field/value pairs, so the field count is half the list.
        seen += Array.isArray(reply[1]) ? reply[1].length / 2 : 0;
        calls += 1;
        if (calls > COLL + 10) throw new Error('hscan-cursor did not terminate');
      } while (cursor !== '0');
      if (seen !== COLL) throw new Error(`hscan-cursor visited ${seen}, expected ${COLL}`);
    },
  },
  {
    name: 'sscan-zscan-cursor',
    scenario: 'redis-set-zset-scan-cursor',
    ops: COLL * 2,
    params: { members: String(COLL), count_hint: '32', commands: 'SSCAN,ZSCAN' },
    dataScale: `keys=2,members=${COLL}`,
    async prepare(ctx) {
      const commands = [];
      for (let start = 0; start < COLL; start += 50) {
        const members = ['SADD', 'bench:sscan'];
        const scored = ['ZADD', 'bench:zscan'];
        for (let index = start; index < Math.min(start + 50, COLL); index += 1) {
          members.push(`m${index}`);
          scored.push(String(index), `m${index}`);
        }
        commands.push(members, scored);
      }
      await ctx.client.pipeline(commands);
    },
    async run({ client }) {
      let cursor = '0';
      let seen = 0;
      let calls = 0;
      do {
        const reply = await client.call(['SSCAN', 'bench:sscan', cursor, 'COUNT', '32']);
        if (!Array.isArray(reply) || reply.length !== 2) throw new Error('sscan-zscan-cursor malformed SSCAN reply');
        cursor = String(reply[0]);
        seen += Array.isArray(reply[1]) ? reply[1].length : 0;
        calls += 1;
        if (calls > COLL + 10) throw new Error('sscan-zscan-cursor SSCAN did not terminate');
      } while (cursor !== '0');
      if (seen !== COLL) throw new Error(`sscan-zscan-cursor SSCAN visited ${seen}, expected ${COLL}`);

      cursor = '0';
      seen = 0;
      calls = 0;
      do {
        const reply = await client.call(['ZSCAN', 'bench:zscan', cursor, 'COUNT', '32']);
        if (!Array.isArray(reply) || reply.length !== 2) throw new Error('sscan-zscan-cursor malformed ZSCAN reply');
        cursor = String(reply[0]);
        // ZSCAN answers member/score pairs, so the member count is half the list.
        seen += Array.isArray(reply[1]) ? reply[1].length / 2 : 0;
        calls += 1;
        if (calls > COLL + 10) throw new Error('sscan-zscan-cursor ZSCAN did not terminate');
      } while (cursor !== '0');
      if (seen !== COLL) throw new Error(`sscan-zscan-cursor ZSCAN visited ${seen}, expected ${COLL}`);
    },
  },
  {
    name: 'set-ops-large',
    scenario: 'redis-set-large-sinter-sunion-sdiff',
    ops: REPEAT * 3,
    params: { members: String(LARGE_COLL), repeat: String(REPEAT), commands: 'SINTER,SUNION,SDIFF' },
    dataScale: `keys=2,members=${LARGE_COLL}`,
    async prepare(ctx) {
      await ctx.client.call(['DEL', 'bench:bigset:a', 'bench:bigset:b']);
      for (let start = 0; start < LARGE_COLL; start += 100) {
        const all = ['SADD', 'bench:bigset:a'];
        const even = ['SADD', 'bench:bigset:b'];
        for (let index = start; index < Math.min(start + 100, LARGE_COLL); index += 1) {
          all.push(`m${index}`);
          if (index % 2 === 0) even.push(`m${index}`);
        }
        await ctx.client.pipeline([all, even]);
      }
    },
    async run({ client }) {
      const overlap = Math.ceil(LARGE_COLL / 2);
      for (let round = 0; round < REPEAT; round += 1) {
        const intersection = await client.call(['SINTER', 'bench:bigset:a', 'bench:bigset:b']);
        if (!Array.isArray(intersection) || intersection.length !== overlap) {
          throw new Error(`set-ops-large SINTER size ${Array.isArray(intersection) ? intersection.length : intersection}`);
        }
        const union = await client.call(['SUNION', 'bench:bigset:a', 'bench:bigset:b']);
        if (!Array.isArray(union) || union.length !== LARGE_COLL) {
          throw new Error(`set-ops-large SUNION size ${Array.isArray(union) ? union.length : union}`);
        }
        const difference = await client.call(['SDIFF', 'bench:bigset:a', 'bench:bigset:b']);
        if (!Array.isArray(difference) || difference.length !== overlap) {
          throw new Error(`set-ops-large SDIFF size ${Array.isArray(difference) ? difference.length : difference}`);
        }
      }
    },
  },
  {
    name: 'lmpop-blocking',
    scenario: 'redis-list-lmpop-blpop-replay',
    ops: BLOCK_COUNT,
    params: { pops: String(BLOCK_COUNT), commands: 'LMPOP,BLPOP', mode: 'non-blocking replay' },
    dataScale: `key=1,elements=${BLOCK_COUNT}`,
    async reset(ctx) {
      await ctx.client.call(['DEL', 'bench:lmpop']);
      for (let start = 0; start < BLOCK_COUNT; start += 100) {
        const args = ['RPUSH', 'bench:lmpop'];
        for (let index = start; index < Math.min(start + 100, BLOCK_COUNT); index += 1) {
          args.push(`v${index}`);
        }
        await ctx.client.call(args);
      }
    },
    async run({ client }) {
      for (let index = 0; index < BLOCK_COUNT; index += 1) {
        if (index % 2 === 0) {
          const popped = await client.call(['LMPOP', '1', 'bench:lmpop', 'LEFT', 'COUNT', '1']);
          if (!Array.isArray(popped) || popped[0] !== 'bench:lmpop' || !Array.isArray(popped[1]) || popped[1].length !== 1) {
            throw new Error(`lmpop-blocking LMPOP reply ${JSON.stringify(popped)}`);
          }
        }
        else {
          const popped = await client.call(['BLPOP', 'bench:lmpop', '0']);
          if (!Array.isArray(popped) || popped[0] !== 'bench:lmpop' || typeof popped[1] !== 'string') {
            throw new Error(`lmpop-blocking BLPOP reply ${JSON.stringify(popped)}`);
          }
        }
      }
    },
  },
  {
    name: 'key-space-notify',
    scenario: 'redis-keyspace-expired-notification',
    ops: TTL_COUNT,
    params: { keys: String(TTL_COUNT), ttl_ms: '10', channel: '__keyevent@0__:expired' },
    dataScale: `keys=${TTL_COUNT}`,
    async prepare(ctx) {
      ctx.notifier = await createClient(ctx.clientName, { host: ctx.host, port: ctx.port });
      await ctx.notifier.subscribe('__keyevent@0__:expired');
      const configured = await ctx.client.call(['CONFIG', 'SET', 'notify-keyspace-events', 'Ex']);
      if (configured !== 'OK') throw new Error(`key-space-notify CONFIG SET replied ${configured}`);
    },
    async cleanup(ctx) {
      await ctx.notifier?.close();
    },
    async run({ client, notifier }) {
      // Write every key first so one sweep can expire the whole batch; awaiting
      // each delivery then only pays the sweep cadence once per round instead of
      // once per key.
      for (let index = 0; index < TTL_COUNT; index += 1) {
        const written = await client.call(['SET', `bench:notify:${index}`, 'v', 'PX', '10']);
        if (written !== 'OK') throw new Error(`key-space-notify SET replied ${written}`);
      }
      const received = new Set();
      for (let index = 0; index < TTL_COUNT; index += 1) received.add(await notifier.nextMessage());
      for (let index = 0; index < TTL_COUNT; index += 1) {
        if (!received.has(`bench:notify:${index}`)) {
          throw new Error(`key-space-notify missed bench:notify:${index}`);
        }
      }
    },
  },
  {
    name: 'resp3-collections',
    scenario: 'redis-resp3-collection-families',
    protocol: 3,
    ops: REPEAT * 4,
    params: { members: String(COLL), repeat: String(REPEAT), commands: 'SMEMBERS,HGETALL,ZRANGE WITHSCORES,SINTER' },
    dataScale: `keys=4,members=${COLL}`,
    async prepare(ctx) {
      await ctx.client.call(['DEL', 'bench:r3set', 'bench:r3even', 'bench:r3hash', 'bench:r3zset']);
      for (let start = 0; start < COLL; start += 100) {
        const setArgs = ['SADD', 'bench:r3set'];
        const evenArgs = ['SADD', 'bench:r3even'];
        const hashArgs = ['HSET', 'bench:r3hash'];
        for (let index = start; index < Math.min(start + 100, COLL); index += 1) {
          setArgs.push(`m${index}`);
          if (index % 2 === 0) evenArgs.push(`m${index}`);
          hashArgs.push(`f${index}`, `v${index}`);
        }
        const commands = [setArgs, evenArgs, hashArgs];
        for (let index = start; index < Math.min(start + 100, COLL); index += 1) {
          commands.push(['ZADD', 'bench:r3zset', String(index), `m${index}`]);
        }
        await ctx.client.pipeline(commands);
      }
    },
    async run({ client }) {
      for (let round = 0; round < REPEAT; round += 1) {
        const members = await client.call(['SMEMBERS', 'bench:r3set']);
        if (!Array.isArray(members) || members.length !== COLL) {
          throw new Error(`resp3-collections SMEMBERS size ${Array.isArray(members) ? members.length : members}`);
        }
        const hash = await client.call(['HGETALL', 'bench:r3hash']);
        const pairs = Array.isArray(hash) ? hash.length / 2 : Object.keys(hash ?? {}).length;
        if (pairs !== COLL) throw new Error(`resp3-collections HGETALL pairs ${pairs}`);
        const rows = await client.call(['ZRANGE', 'bench:r3zset', '0', '-1', 'WITHSCORES']);
        const count = Array.isArray(rows[0]) ? rows.length : rows.length / 2;
        if (count !== COLL) throw new Error(`resp3-collections ZRANGE pairs ${count}`);
        const intersection = await client.call(['SINTER', 'bench:r3set', 'bench:r3even']);
        if (!Array.isArray(intersection) || intersection.length !== Math.ceil(COLL / 2)) {
          throw new Error(`resp3-collections SINTER size ${Array.isArray(intersection) ? intersection.length : intersection}`);
        }
      }
    },
  },
  {
    name: 'server-face-ops',
    scenario: 'redis-server-face',
    ops: REPEAT * 4,
    params: { repeat: String(REPEAT), commands: 'INFO,COMMAND COUNT,CONFIG GET,CONFIG SET' },
    dataScale: 'keys=0',
    async run({ client }) {
      for (let round = 0; round < REPEAT; round += 1) {
        const info = await client.call(['INFO', 'server']);
        if (typeof info !== 'string' || !/^redis_version:/m.test(info)) {
          throw new Error('INFO server did not report redis_version');
        }
        const commands = await client.call(['COMMAND', 'COUNT']);
        if (!(typeof commands === 'number' && commands > 0)) {
          throw new Error(`COMMAND COUNT replied ${commands}`);
        }
        const options = await client.call(['CONFIG', 'GET', 'appendfsync']);
        if (!Array.isArray(options) || options[0] !== 'appendfsync') {
          throw new Error(`CONFIG GET replied ${JSON.stringify(options)}`);
        }
        const set = await client.call(['CONFIG', 'SET', 'appendfsync', 'everysec']);
        if (set !== 'OK') throw new Error(`CONFIG SET replied ${set}`);
      }
    },
  },
  {
    name: 'watch-exec',
    scenario: 'redis-txn-watch-exec',
    ops: REPEAT * 4,
    params: { keys: '1', repeat: String(REPEAT) },
    dataScale: 'keys=1,value_bytes=64',
    async reset(ctx) {
      await ctx.client.call(['DEL', 'bench:watch']);
    },
    async run({ client }) {
      for (let round = 0; round < REPEAT; round += 1) {
        const watched = await client.call(['WATCH', 'bench:watch']);
        if (watched !== 'OK') throw new Error(`WATCH replied ${watched}`);
        await client.call(['MULTI']);
        await client.call(['SET', 'bench:watch', VALUE]);
        const replies = await client.call(['EXEC']);
        if (!Array.isArray(replies) || replies.length !== 1 || replies[0] !== 'OK') {
          throw new Error(`EXEC replied ${JSON.stringify(replies)}`);
        }
      }
    },
  },
  {
    name: 'set-big',
    scenario: 'redis-big-value-set',
    ops: BIG_COUNT,
    params: { ops: String(BIG_COUNT), value_bytes: String(BIG_BYTES) },
    dataScale: `keys=${BIG_COUNT},value_bytes=${BIG_BYTES}`,
    async run({ client }) {
      for (let index = 0; index < BIG_COUNT; index += 1) {
        await client.set(`bench:big:${index}`, BIG_VALUE);
      }
    },
  },
  {
    name: 'get-big',
    scenario: 'redis-big-value-get',
    ops: BIG_GET,
    params: { ops: String(BIG_GET), value_bytes: String(BIG_BYTES) },
    dataScale: `keys=${BIG_GET},value_bytes=${BIG_BYTES}`,
    async prepare(ctx) {
      await preload(ctx, BIG_GET, 'bench:bigget', BIG_VALUE);
    },
    async run({ client }) {
      for (let index = 0; index < BIG_GET; index += 1) {
        const value = await client.get(`bench:bigget:${index}`);
        if (value === null) throw new Error(`get-big miss at ${index}`);
      }
    },
  },
  {
    name: 'del-seq',
    scenario: 'redis-key-del',
    ops: DEL_COUNT,
    params: { keys: String(DEL_COUNT) },
    dataScale: `keys=${DEL_COUNT}`,
    async reset(ctx) {
      await preload(ctx, DEL_COUNT, 'bench:del');
    },
    async run({ client }) {
      for (let index = 0; index < DEL_COUNT; index += 1) {
        const removed = await client.call(['DEL', `bench:del:${index}`]);
        if (removed !== 1) throw new Error(`del-seq miss at ${index}`);
      }
    },
  },
  {
    name: 'move-seq',
    scenario: 'redis-key-move',
    ops: MOVE_COUNT,
    params: { ops: String(MOVE_COUNT), databases: '2' },
    dataScale: `keys=${MOVE_COUNT},databases=2`,
    async reset(ctx) {
      // Re-seed the source database and empty the destination outside timing.
      await ctx.client.call(['SELECT', '1']);
      await ctx.client.call(['FLUSHDB']);
      await ctx.client.call(['SELECT', '0']);
      await ctx.client.call(['FLUSHDB']);
      await preload(ctx, MOVE_COUNT, 'bench:move');
    },
    async run({ client }) {
      for (let index = 0; index < MOVE_COUNT; index += 1) {
        const moved = await client.call(['MOVE', `bench:move:${index}`, '1']);
        if (moved !== 1) throw new Error(`move-seq blocked at ${index}`);
      }
    },
  },
  {
    name: 'ping',
    scenario: 'redis-ping-rtt',
    ops: PING_COUNT,
    params: { ops: String(PING_COUNT) },
    dataScale: 'keys=0',
    async run({ client }) {
      for (let index = 0; index < PING_COUNT; index += 1) {
        await client.ping();
      }
    },
  },
  {
    name: 'bit-ops',
    scenario: 'redis-string-bitfield-ops',
    ops: COLL * 4,
    params: { keys: String(COLL), commands: 'SETBIT,GETBIT,BITCOUNT,BITPOS' },
    dataScale: `keys=${COLL}`,
    async reset(ctx) {
      // Start from missing keys so the first `SETBIT` reports a zero previous
      // bit and `BITCOUNT` sees exactly the one bit the run sets.
      for (let index = 0; index < COLL; index += 1) {
        await ctx.client.call(['DEL', `bench:bit:${index}`]);
      }
    },
    async run({ client }) {
      for (let index = 0; index < COLL; index += 1) {
        const key = `bench:bit:${index}`;
        const previous = await client.call(['SETBIT', key, '7', '1']);
        if (previous !== 0) throw new Error(`bit-ops SETBIT previous ${previous} at ${index}`);
        const bit = await client.call(['GETBIT', key, '7']);
        if (bit !== 1) throw new Error(`bit-ops GETBIT replied ${bit} at ${index}`);
        const count = await client.call(['BITCOUNT', key]);
        if (count !== 1) throw new Error(`bit-ops BITCOUNT replied ${count} at ${index}`);
        const first = await client.call(['BITPOS', key, '1']);
        if (first !== 7) throw new Error(`bit-ops BITPOS replied ${first} at ${index}`);
      }
    },
  },
  {
    name: 'setrange-getrange',
    scenario: 'redis-string-setrange-getrange',
    ops: COLL * 2,
    params: { keys: String(COLL), chunk_bytes: '8' },
    dataScale: `keys=${COLL}`,
    async reset(ctx) {
      for (let index = 0; index < COLL; index += 1) {
        await ctx.client.call(['DEL', `bench:range:${index}`]);
      }
    },
    async run({ client }) {
      for (let index = 0; index < COLL; index += 1) {
        const key = `bench:range:${index}`;
        const written = await client.call(['SETRANGE', key, '0', 'abcdefgh']);
        if (written !== 8) throw new Error(`setrange-getrange SETRANGE replied ${written} at ${index}`);
        const slice = await client.call(['GETRANGE', key, '0', '3']);
        if (slice !== 'abcd') throw new Error(`setrange-getrange GETRANGE replied ${slice} at ${index}`);
      }
    },
  },
  {
    name: 'rename-unlink',
    scenario: 'redis-key-rename-unlink',
    ops: COLL * 2,
    params: { keys: String(COLL), commands: 'RENAME,UNLINK' },
    dataScale: `keys=${COLL}`,
    async reset(ctx) {
      await preload(ctx, COLL, 'bench:ren');
      for (let index = 0; index < COLL; index += 1) {
        await ctx.client.call(['DEL', `bench:unl:${index}`]);
      }
    },
    async run({ client }) {
      for (let index = 0; index < COLL; index += 1) {
        const renamed = await client.call(['RENAME', `bench:ren:${index}`, `bench:unl:${index}`]);
        if (renamed !== 'OK') throw new Error(`rename-unlink RENAME replied ${renamed} at ${index}`);
        const removed = await client.call(['UNLINK', `bench:unl:${index}`]);
        if (removed !== 1) throw new Error(`rename-unlink UNLINK replied ${removed} at ${index}`);
      }
    },
  },
  {
    name: 'setnx-getset',
    scenario: 'redis-string-setnx-getset',
    ops: COLL * 2,
    params: { keys: String(COLL), commands: 'SETNX,GETSET', value_bytes: '64' },
    dataScale: `keys=${COLL}`,
    async reset(ctx) {
      for (let index = 0; index < COLL; index += 1) {
        await ctx.client.call(['DEL', `bench:setnx:${index}`]);
      }
    },
    async run({ client }) {
      for (let index = 0; index < COLL; index += 1) {
        const key = `bench:setnx:${index}`;
        const created = await client.call(['SETNX', key, VALUE]);
        if (created !== 1) throw new Error(`setnx-getset SETNX replied ${created} at ${index}`);
        const previous = await client.call(['GETSET', key, VALUE]);
        if (previous !== VALUE) throw new Error(`setnx-getset GETSET lost the value at ${index}`);
      }
    },
  },
  {
    name: 'smove-spop',
    scenario: 'redis-set-smove-spop',
    ops: COLL * 2,
    params: { members: String(COLL), commands: 'SMOVE,SPOP' },
    dataScale: `keys=2,members=${COLL}`,
    async reset(ctx) {
      const members = Array.from({ length: COLL }, (_, index) => `m${index}`);
      await ctx.client.call(['DEL', 'bench:smovesrc', 'bench:smovedst']);
      await ctx.client.call(['SADD', 'bench:smovesrc', ...members]);
    },
    async run({ client }) {
      for (let index = 0; index < COLL; index += 1) {
        const moved = await client.call(['SMOVE', 'bench:smovesrc', 'bench:smovedst', `m${index}`]);
        if (moved !== 1) throw new Error(`smove-spop SMOVE replied ${moved} at ${index}`);
        const popped = await client.call(['SPOP', 'bench:smovedst']);
        if (popped !== `m${index}`) throw new Error(`smove-spop SPOP replied ${popped} at ${index}`);
      }
    },
  },
  {
    name: 'zrangestore-zdiff',
    scenario: 'redis-zset-zrangestore-zdiff',
    ops: COLL * 2,
    params: { members: String(COLL), commands: 'ZRANGESTORE,ZDIFF' },
    dataScale: `keys=3,members=${COLL}`,
    async reset(ctx) {
      const left = [];
      const right = [];
      for (let index = 0; index < COLL; index += 1) {
        left.push(String(index), `m${index}`);
        if (index % 2 === 0) right.push(String(index), `m${index}`);
      }
      await ctx.client.call(['DEL', 'bench:zsrc', 'bench:zother', 'bench:zdst']);
      await ctx.client.call(['ZADD', 'bench:zsrc', ...left]);
      await ctx.client.call(['ZADD', 'bench:zother', ...right]);
    },
    async run({ client }) {
      const stored = await client.call(['ZRANGESTORE', 'bench:zdst', 'bench:zsrc', '0', '-1']);
      if (stored !== COLL) throw new Error(`zrangestore-zdiff ZRANGESTORE replied ${stored}`);
      // `WITHSCORES` is not served by the zset facade yet, so the row counts
      // members only; the difference itself must still drop every even member.
      const diff = await client.call(['ZDIFF', '2', 'bench:zsrc', 'bench:zother']);
      if (!Array.isArray(diff) || diff.length !== Math.floor(COLL / 2)) {
        throw new Error(`zrangestore-zdiff ZDIFF replied ${Array.isArray(diff) ? diff.length : diff} items`);
      }
    },
  },
  {
    name: 'zset-add-options',
    scenario: 'redis-zset-add-options',
    ops: COLL * 4,
    params: { members: String(COLL), commands: 'ZADD NX,ZADD XX CH,ZADD GT CH,ZADD INCR' },
    dataScale: `key=1,members=${COLL}`,
    async reset(ctx) {
      await ctx.client.call(['DEL', 'bench:zopt']);
    },
    async run({ client }) {
      for (let index = 0; index < COLL; index += 1) {
        const member = `m${index}`;
        const added = await client.call(['ZADD', 'bench:zopt', 'NX', String(index), member]);
        if (added !== 1) throw new Error(`zset-add-options NX replied ${added} at ${index}`);
        const changed = await client.call(['ZADD', 'bench:zopt', 'XX', 'CH', String(index + 1), member]);
        if (changed !== 1) throw new Error(`zset-add-options XX CH replied ${changed} at ${index}`);
        // `GT` 只在分数升高时写入，回填更小的分数必须报 0 次变更。
        const lowered = await client.call(['ZADD', 'bench:zopt', 'GT', 'CH', String(index), member]);
        if (lowered !== 0) throw new Error(`zset-add-options GT CH replied ${lowered} at ${index}`);
        const incremented = await client.call(['ZADD', 'bench:zopt', 'INCR', '1', member]);
        if (Number(incremented) !== index + 2) {
          throw new Error(`zset-add-options INCR replied ${incremented} at ${index}`);
        }
      }
    },
  },
  {
    name: 'expire-options',
    scenario: 'redis-key-expire-options',
    ops: COLL * 6,
    params: { keys: String(COLL), commands: 'EXPIRE NX,EXPIRE XX,EXPIRE LT,EXPIRE GT,TTL' },
    dataScale: `keys=${COLL},value_bytes=64`,
    async prepare(ctx) {
      await preload(ctx, COLL, 'bench:expopt');
    },
    async reset(ctx) {
      // 上一轮可能已经挂上 TTL，重置回无过期状态，让每条命令都走同一分支。
      for (let index = 0; index < COLL; index += 1) {
        await ctx.client.call(['SET', `bench:expopt:${index}`, VALUE]);
      }
    },
    async run({ client }) {
      for (let index = 0; index < COLL; index += 1) {
        const key = `bench:expopt:${index}`;
        const attached = await client.call(['EXPIRE', key, '100', 'NX']);
        if (attached !== 1) throw new Error(`expire-options NX replied ${attached} at ${index}`);
        const skipped = await client.call(['EXPIRE', key, '200', 'NX']);
        if (skipped !== 0) throw new Error(`expire-options NX re-attach replied ${skipped} at ${index}`);
        const replaced = await client.call(['EXPIRE', key, '200', 'XX']);
        if (replaced !== 1) throw new Error(`expire-options XX replied ${replaced} at ${index}`);
        const shortened = await client.call(['EXPIRE', key, '50', 'LT']);
        if (shortened !== 1) throw new Error(`expire-options LT replied ${shortened} at ${index}`);
        const extended = await client.call(['EXPIRE', key, '300', 'GT']);
        if (extended !== 1) throw new Error(`expire-options GT replied ${extended} at ${index}`);
        const remaining = await client.call(['TTL', key]);
        if (remaining !== 300) throw new Error(`expire-options TTL replied ${remaining} at ${index}`);
      }
    },
  },
  {
    name: 'expire-metadata',
    scenario: 'redis-key-expire-metadata',
    ops: COLL * 3,
    params: { keys: String(COLL), commands: 'EXPIRETIME,PEXPIRETIME,TTL' },
    dataScale: `keys=${COLL},value_bytes=64`,
    async prepare(ctx) {
      await preload(ctx, COLL, 'bench:expmeta');
    },
    async reset(ctx) {
      // 每条命令都要求键带过期：上一轮可能已经过期，重新写入并挂 100 秒。
      for (let index = 0; index < COLL; index += 1) {
        await ctx.client.call(['SET', `bench:expmeta:${index}`, VALUE, 'EX', '100']);
      }
    },
    async run({ client }) {
      for (let index = 0; index < COLL; index += 1) {
        const key = `bench:expmeta:${index}`;
        const seconds = await client.call(['EXPIRETIME', key]);
        if (!Number.isInteger(seconds) || seconds <= 0) {
          throw new Error(`expire-metadata EXPIRETIME replied ${seconds} at ${index}`);
        }
        const millis = await client.call(['PEXPIRETIME', key]);
        if (!Number.isInteger(millis) || millis <= 0) {
          throw new Error(`expire-metadata PEXPIRETIME replied ${millis} at ${index}`);
        }
        // 秒级预期值按毫秒余数四舍五入，两者允许相差不到一秒。
        if (Math.abs(millis - seconds * 1000) >= 1000) {
          throw new Error(`expire-metadata EXPIRETIME/PEXPIRETIME disagree ${seconds}/${millis} at ${index}`);
        }
        const ttl = await client.call(['TTL', key]);
        if (!Number.isInteger(ttl) || ttl <= 0 || ttl > 100) {
          throw new Error(`expire-metadata TTL replied ${ttl} at ${index}`);
        }
      }
    },
  },
  {
    name: 'list-lpos',
    scenario: 'redis-list-lpos',
    ops: COLL * 4,
    params: { elements: String(COLL), commands: 'LPOS,LPOS RANK -1,LPOS COUNT 2,LPOS miss' },
    dataScale: `key=1,elements=${COLL}`,
    async reset(ctx) {
      const members = Array.from({ length: COLL }, (_, index) => `e${index}`);
      await ctx.client.call(['DEL', 'bench:lpos']);
      await ctx.client.call(['RPUSH', 'bench:lpos', ...members]);
    },
    async run({ client }) {
      for (let index = 0; index < COLL; index += 1) {
        const member = `e${index}`;
        const head = await client.call(['LPOS', 'bench:lpos', member]);
        if (head !== index) throw new Error(`list-lpos head replied ${head} at ${index}`);
        const tail = await client.call(['LPOS', 'bench:lpos', member, 'RANK', '-1']);
        if (tail !== index) throw new Error(`list-lpos RANK -1 replied ${tail} at ${index}`);
        const counted = await client.call(['LPOS', 'bench:lpos', member, 'COUNT', '2']);
        if (!Array.isArray(counted) || counted.length !== 1 || counted[0] !== index) {
          throw new Error(`list-lpos COUNT replied ${JSON.stringify(counted)} at ${index}`);
        }
        const miss = await client.call(['LPOS', 'bench:lpos', 'missing-member']);
        if (miss !== null) throw new Error(`list-lpos miss replied ${miss} at ${index}`);
      }
    },
  },
  {
    name: 'copy-renamenx',
    scenario: 'redis-key-copy-renamenx',
    ops: COLL * 2,
    params: { keys: String(COLL), commands: 'COPY,RENAMENX' },
    dataScale: `keys=${COLL},value_bytes=64`,
    async prepare(ctx) {
      await preload(ctx, COLL, 'bench:csrc');
    },
    async reset(ctx) {
      const stale = [];
      for (let index = 0; index < COLL; index += 1) {
        stale.push(`bench:ccopy:${index}`, `bench:cmove:${index}`);
      }
      await ctx.client.call(['DEL', ...stale]);
      await preload(ctx, COLL, 'bench:csrc');
    },
    async run({ client }) {
      for (let index = 0; index < COLL; index += 1) {
        const copied = await client.call(['COPY', `bench:csrc:${index}`, `bench:ccopy:${index}`]);
        if (copied !== 1) throw new Error(`copy-renamenx COPY replied ${copied} at ${index}`);
        const moved = await client.call(['RENAMENX', `bench:csrc:${index}`, `bench:cmove:${index}`]);
        if (moved !== 1) throw new Error(`copy-renamenx RENAMENX replied ${moved} at ${index}`);
      }
    },
  },
  {
    name: 'object-encoding',
    scenario: 'redis-object-inspect',
    ops: COLL * 3,
    params: { keys: String(COLL), commands: 'OBJECT ENCODING,OBJECT REFCOUNT,OBJECT IDLETIME' },
    dataScale: `keys=${COLL},value_bytes=64`,
    async prepare(ctx) {
      await preload(ctx, COLL, 'bench:object');
    },
    async run({ client }) {
      for (let index = 0; index < COLL; index += 1) {
        const key = `bench:object:${index}`;
        const encoding = await client.call(['OBJECT', 'ENCODING', key]);
        // 键名加 64 字节值超过 41 字节阈值，真机同样报告 `raw`。
        if (encoding !== 'raw') throw new Error(`object-encoding replied ${encoding} at ${index}`);
        const references = await client.call(['OBJECT', 'REFCOUNT', key]);
        if (references !== 1) throw new Error(`object-encoding REFCOUNT replied ${references} at ${index}`);
        const idle = await client.call(['OBJECT', 'IDLETIME', key]);
        if (!(typeof idle === 'number' && idle >= 0)) {
          throw new Error(`object-encoding IDLETIME replied ${idle} at ${index}`);
        }
      }
    },
  },
  {
    name: 'hash-hincrbyfloat',
    scenario: 'redis-hash-hincrbyfloat',
    ops: COLL * 2,
    params: { fields: String(COLL), commands: 'HINCRBYFLOAT 0.1,HINCRBYFLOAT 0.2' },
    dataScale: `key=1,fields=${COLL}`,
    async reset(ctx) {
      await ctx.client.call(['DEL', 'bench:hfloat']);
    },
    async run({ client }) {
      for (let index = 0; index < COLL; index += 1) {
        await client.call(['HINCRBYFLOAT', 'bench:hfloat', `f${index}`, '0.1']);
      }
      let last = null;
      for (let index = 0; index < COLL; index += 1) {
        last = await client.call(['HINCRBYFLOAT', 'bench:hfloat', `f${index}`, '0.2']);
      }
      // 十进制语义：0.1 + 0.2 必须回 `0.3`，不是二进制浮点的尾数。
      if (last !== '0.3') throw new Error(`hash-hincrbyfloat replied ${last}, expected 0.3`);
    },
  },
  {
    name: 'list-lset-lrem',
    scenario: 'redis-list-lset-lrem',
    ops: COLL + 2,
    params: { members: String(COLL), commands: 'LSET,LREM,LLEN' },
    dataScale: `key=1,members=${COLL}`,
    async reset(ctx) {
      const members = Array.from({ length: COLL }, (_, index) => `m${index}`);
      await ctx.client.call(['DEL', 'bench:lset']);
      await ctx.client.call(['RPUSH', 'bench:lset', ...members]);
    },
    async run({ client }) {
      for (let index = 0; index < COLL; index += 1) {
        await client.call(['LSET', 'bench:lset', String(index), `s${index}`]);
      }
      const removed = await client.call(['LREM', 'bench:lset', '0', 's0']);
      if (removed !== 1) throw new Error(`list-lset-lrem LREM replied ${removed}`);
      const length = await client.call(['LLEN', 'bench:lset']);
      if (length !== COLL - 1) throw new Error(`list-lset-lrem LLEN replied ${length}, expected ${COLL - 1}`);
    },
  },
  {
    name: 'connect',
    scenario: 'redis-connect-open-close',
    ops: CONNECT_COUNT,
    params: { opens: String(CONNECT_COUNT), probe: 'PING' },
    dataScale: 'keys=0',
    async run({ clientName, host, port }) {
      for (let index = 0; index < CONNECT_COUNT; index += 1) {
        const client = await createClient(clientName, { host, port });
        await client.ping();
        await client.close();
      }
    },
  },
];

// Optional subset for a focused rerun, e.g. `BENCH_WORKLOADS=expire-persist,ping`.
// The full report stays the default; filtering only shortens the matrix.
const requestedWorkloads = (process.env.BENCH_WORKLOADS ?? '').split(',').map(part => part.trim()).filter(Boolean);
if (requestedWorkloads.length > 0) {
  const unknown = requestedWorkloads.filter(name => !workloads.some(workload => workload.name === name));
  if (unknown.length > 0) throw new Error(`unknown BENCH_WORKLOADS entries: ${unknown.join(', ')}`);
  const requested = new Set(requestedWorkloads);
  workloads.splice(0, workloads.length, ...workloads.filter(workload => requested.has(workload.name)));
}

async function preload(ctx, total, prefix, value = VALUE) {
  for (let start = 0; start < total; start += BATCH) {
    const commands = [];
    for (let index = start; index < Math.min(start + BATCH, total); index += 1) {
      commands.push(['SET', `${prefix}:${index}`, value]);
    }
    await ctx.client.pipeline(commands);
  }
}

async function measure(clientName, workload, target) {
  const context = { clientName, host: target.host, port: target.port, protocol: workload.protocol };
  let server = null;
  let client = null;
  if (!target.oracle) {
    const dataDir = await mkdtemp(join(tmpdir(), 'yydb-redis-bench-'));
    server = await startServer({ dataDir, host: HOST, port: 0 });
    context.host = server.host;
    context.port = server.port;
  }
  try {
    client = await createClient(clientName, { host: context.host, port: context.port, protocol: workload.protocol });
    context.client = client;
    await workload.prepare?.(context);
    for (let round = 0; round < WARMUP; round += 1) {
      await workload.reset?.(context);
      await workload.run(context);
    }
    const samples = [];
    for (let round = 0; round < ROUNDS; round += 1) {
      // Destructive workloads re-seed outside the timed region so every round
      // starts from the same state without paying the setup cost.
      await workload.reset?.(context);
      const start = process.hrtime.bigint();
      await workload.run(context);
      samples.push(elapsedMs(start));
    }
    return benchSummary(samples);
  }
  finally {
    try {
      await workload.cleanup?.(context);
    }
    finally {
      try {
        await client?.close();
      }
      finally {
        await server?.close();
      }
    }
  }
}

// 真机对照：同一矩阵以 ioredis 为固定客户端打真实 redis-server，
// 用 `INFO` 证明对端不是本仓仿真器（仿真器回 `redis_mode:disguise`）。
async function oracleTarget() {
  const host = process.env.BENCH_ORACLE_HOST;
  if (!host) return null;
  const port = Number(process.env.BENCH_ORACLE_PORT ?? 6379);
  const probe = await createClient('ioredis', { host, port });
  try {
    const info = await probe.call(['INFO', 'server']);
    const version = /^redis_version:(.+)$/m.exec(info)?.[1]?.trim() ?? 'unknown';
    if (/redis_mode:disguise/.test(info)) {
      throw new Error(`BENCH_ORACLE_HOST ${host}:${port} is the emulated server, not a real redis-server`);
    }
    console.log(`oracle: real redis-server ${version} at ${host}:${port}`);
    return { host, port, oracle: true, version };
  }
  finally {
    await probe.close();
  }
}

const names = workloads.map(workload => workload.name);
const results = {};
const oracle = await oracleTarget();

console.log(`Redis RESP2/RESP3 scenario matrix (${WARMUP} warmup + ${ROUNDS} measured rounds per cell)`);
console.log(`Defaults: BENCH_SET=${SET_COUNT}, BENCH_GET=${GET_COUNT}, BENCH_PIPE=${PIPE_COUNT}, BENCH_PING=${PING_COUNT}, BENCH_BATCH=${BATCH}, BENCH_COLL=${COLL}, BENCH_BIG=${BIG_COUNT}, BENCH_BIG_GET=${BIG_GET}, BENCH_BIG_BYTES=${BIG_BYTES}, BENCH_CONNECT=${CONNECT_COUNT}, BENCH_STREAM=${STREAM_COUNT}, BENCH_PUBSUB=${PUBSUB_COUNT}, BENCH_TTL=${TTL_COUNT}, BENCH_TXN=${TXN_COUNT}, BENCH_INCR=${INCR_COUNT}, BENCH_MSET=${MSET_COUNT}, BENCH_DEL=${DEL_COUNT}, BENCH_MOVE=${MOVE_COUNT}, BENCH_BLOCK=${BLOCK_COUNT}, BENCH_PING_CONC=${PING_CONC}, BENCH_CONC=${CONCURRENCY}, BENCH_GROUP=${GROUP_COUNT}, BENCH_REPEAT=${REPEAT}, BENCH_COLL_LARGE=${LARGE_COLL}, BENCH_SWEEP=${SWEEP_COUNT}, BENCH_SWEEP_TTL_MS=${SWEEP_TTL_MS}, BENCH_SWEEP_WAIT_MS=${SWEEP_WAIT_MS}, BENCH_FANOUT_SUBS=${FANOUT_SUBS}, BENCH_FANOUT=${FANOUT_MESSAGES}, BENCH_ROUNDS=${ROUNDS}, BENCH_WARMUP=${WARMUP}`);
console.log(`Stats: benchSummary via ${benchSummarySource}`);
console.log('Server: fresh emulated server and dataDir per (workload, client); rounds share one server and one connection');
console.log('');

for (const workload of workloads) {
  results[workload.name] = {};
  for (const clientName of clientNames) {
    results[workload.name][clientName] = await measure(clientName, workload, { host: HOST, port: 0 });
    const stats = results[workload.name][clientName];
    console.log(`${workload.name.padEnd(20)} ${clientName.padEnd(13)} median=${stats.medianMs.toFixed(2)}ms p95=${stats.p95Ms.toFixed(2)}ms`);
  }
  if (oracle !== null) {
    results[workload.name]['redis-server (oracle)'] = await measure('ioredis', workload, oracle);
    const stats = results[workload.name]['redis-server (oracle)'];
    console.log(`${workload.name.padEnd(20)} oracle          median=${stats.medianMs.toFixed(2)}ms p95=${stats.p95Ms.toFixed(2)}ms`);
  }
}

const reportClients = oracle !== null ? [...clientNames, 'redis-server (oracle)'] : clientNames;
const medians = Object.fromEntries(names.map(name => [name, Object.fromEntries(reportClients.map(client => [client, results[name][client].medianMs]))]));

const ratioCell = (ms, baseline, fastest) => {
  const ratio = ms / baseline;
  const cell = `${ratio >= 10 ? ratio.toFixed(1) : ratio.toFixed(2)}x`;
  return ms === fastest ? `**${cell}**` : cell;
};

function relativeTable() {
  const lines = ['| Workload | ' + reportClients.join(' | ') + ' |', '|---------:|' + reportClients.map(() => '-------:').join('|') + '|'];
  for (const name of names) {
    const baseline = medians[name].ioredis;
    const fastest = Math.min(...reportClients.map(client => medians[name][client]));
    lines.push(`| ${name} | ${reportClients.map(client => ratioCell(medians[name][client], baseline, fastest)).join(' | ')} |`);
  }
  return lines.join('\n');
}

function statsTable() {
  const lines = [
    '| Workload | ops | ' + reportClients.flatMap(client => [`${client} med`, `${client} p95`]).join(' | ') + ' |',
    `|---------:|----:|${reportClients.flatMap(() => ['-------:', '-------:']).join('|')}|`,
  ];
  for (const name of names) {
    const cells = reportClients.flatMap(client => {
      const stats = results[name][client];
      return [`${stats.medianMs.toFixed(2)}`, `${stats.p95Ms.toFixed(2)}`];
    });
    lines.push(`| ${name} | ${workloads.find(workload => workload.name === name).ops} | ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

function perOpTable() {
  const lines = ['| Workload | ' + reportClients.join(' | ') + ' |', '|---------:|' + reportClients.map(() => '--------:').join('|') + '|'];
  for (const workload of workloads) {
    const cells = reportClients.map(client => {
      const stats = results[workload.name][client];
      return `${benchPerOpMs(stats, workload.ops).toFixed(3)} ms/op, ${throughput(workload.ops, stats.medianMs)}`;
    });
    lines.push(`| ${workload.name} | ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

// 机器可读块：harness `BenchReport` 线格式（snake_case），行级 provenance
// 带场景格，运行级 provenance 带工具链、rev 与轮数口径。
const runProvenance = {
  scenario: 'redis-vs-js-libraries-matrix',
  scenario_params: {
    rounds: String(ROUNDS), warmup: String(WARMUP), batch: String(BATCH),
    set: String(SET_COUNT), get: String(GET_COUNT), pipe: String(PIPE_COUNT),
    ping: String(PING_COUNT), coll: String(COLL), big: String(BIG_COUNT),
    big_get: String(BIG_GET), big_bytes: String(BIG_BYTES), connect: String(CONNECT_COUNT),
    stream: String(STREAM_COUNT), pubsub: String(PUBSUB_COUNT), ttl: String(TTL_COUNT), txn: String(TXN_COUNT),
    incr: String(INCR_COUNT), mset: String(MSET_COUNT), del: String(DEL_COUNT), move: String(MOVE_COUNT),
    block: String(BLOCK_COUNT), ping_conc: String(PING_CONC), conc: String(CONCURRENCY),
    group: String(GROUP_COUNT), repeat: String(REPEAT), coll_large: String(LARGE_COLL),
    sweep: String(SWEEP_COUNT), sweep_ttl_ms: String(SWEEP_TTL_MS), sweep_wait_ms: String(SWEEP_WAIT_MS),
    fanout_subs: String(FANOUT_SUBS), fanout_messages: String(FANOUT_MESSAGES),
  },
  data_scale: `matrix=${workloads.length}x${reportClients.length}`,
  rustc_version: rustcVersion,
  node_version: process.version,
  target_triple: targetTriple,
  rev: gitRev,
  plan: { rounds: ROUNDS, warmup: WARMUP },
};

const benchRows = [];
for (const workload of workloads) {
  for (const client of reportClients) {
    const baseline = client === 'ioredis' || client === 'redis-server (oracle)' ? null : results[workload.name].ioredis;
    benchRows.push({
      workload: `${workload.name}@${client}`,
      unit: 'ms',
      ours: wireStats(results[workload.name][client]),
      reference: client === 'redis-server (oracle)'
        ? wireStats(results[workload.name].ioredis)
        : baseline === null ? null : wireStats(baseline),
      reference_engine: client === 'redis-server (oracle)' ? 'ioredis@emulated-server' : client === 'ioredis' ? null : 'ioredis',
      provenance: { scenario: workload.scenario, scenario_params: workload.params, data_scale: workload.dataScale },
    });
  }
}

function wireStats(stats) {
  return { median_ms: stats.medianMs, p95_ms: stats.p95Ms, min_ms: stats.minMs, max_ms: stats.maxMs, rounds: stats.rounds };
}

const oracleSection = oracle === null
  ? `## Oracle comparison — limitation

No real \`redis-server\` is reachable from this host: no \`redis-server\`/\`redis-cli\`
binary on \`PATH\`, no listening instance on \`127.0.0.1:6379\`, and no \`docker\` or
\`wsl\` fallback. The numbers above therefore compare three clients against the
emulated server only; the emulated implementation is never used as the expected
value. The conformance corpus separately records its live-oracle provenance
(\`redis-server 8.10.3\`, verified 2026-11-08, see \`packages/redis-harness/oracle-provenance.json\`).
To run the bidirectional comparison, start a real \`redis-server\` and set
\`BENCH_ORACLE_HOST\` (and optionally \`BENCH_ORACLE_PORT\`) before regenerating: the
matrix reruns with \`ioredis\` against the real server as a \`redis-server (oracle)\`
column, and the script refuses an oracle that answers \`redis_mode:disguise\`.`
  : `## Oracle comparison

Real \`redis-server ${oracle.version}\` at \`${oracle.host}:${oracle.port}\` ran the same
matrix with \`ioredis\` as the fixed client (\`redis-server (oracle)\` column). The
emulated server refuses to be mistaken for the oracle (\`INFO\` shows
\`redis_mode:disguise\`).`;

// `redis-unknown-wasm32` has no runnable artifact today. Detect the placeholder
// instead of pretending the platform ran; the report then says n/a with a reason.
const wasmArtifact = join(repoRoot, 'projects', 'redis.ts', 'platforms', 'redis-unknown-wasm32', 'redis.unknown-wasm32.node');
const wasmCoverage = (() => {
  try {
    const { size } = statSync(wasmArtifact);
    return size > 1024
      ? 'ready — artifact present'
      : `n/a — placeholder artifact (${size} bytes), no wasm-bindgen entry to load`;
  }
  catch {
    return 'n/a — platform package not built';
  }
})();

const report = `# Benchmark report

Command: \`pnpm --dir projects/redis.ts/examples/vs-js-libraries benchmark\`
Binding: \`${process.env.BENCH_BINDING_PROFILE ?? 'debug'}\` — build with \`pnpm build:release\` and set \`BENCH_BINDING_PROFILE=release\` for product numbers
Defaults: \`BENCH_SET=${SET_COUNT}\`, \`BENCH_GET=${GET_COUNT}\`, \`BENCH_PIPE=${PIPE_COUNT}\`, \`BENCH_PING=${PING_COUNT}\`, \`BENCH_BATCH=${BATCH}\`, \`BENCH_COLL=${COLL}\`, \`BENCH_BIG=${BIG_COUNT}\`, \`BENCH_BIG_GET=${BIG_GET}\`, \`BENCH_BIG_BYTES=${BIG_BYTES}\`, \`BENCH_CONNECT=${CONNECT_COUNT}\`, \`BENCH_STREAM=${STREAM_COUNT}\`, \`BENCH_PUBSUB=${PUBSUB_COUNT}\`, \`BENCH_TTL=${TTL_COUNT}\`, \`BENCH_TXN=${TXN_COUNT}\`, \`BENCH_INCR=${INCR_COUNT}\`, \`BENCH_MSET=${MSET_COUNT}\`, \`BENCH_DEL=${DEL_COUNT}\`, \`BENCH_MOVE=${MOVE_COUNT}\`, \`BENCH_BLOCK=${BLOCK_COUNT}\`, \`BENCH_PING_CONC=${PING_CONC}\`, \`BENCH_CONC=${CONCURRENCY}\`, \`BENCH_GROUP=${GROUP_COUNT}\`, \`BENCH_REPEAT=${REPEAT}\`, \`BENCH_COLL_LARGE=${LARGE_COLL}\`, \`BENCH_SWEEP=${SWEEP_COUNT}\`, \`BENCH_SWEEP_TTL_MS=${SWEEP_TTL_MS}\`, \`BENCH_SWEEP_WAIT_MS=${SWEEP_WAIT_MS}\`, \`BENCH_FANOUT_SUBS=${FANOUT_SUBS}\`, \`BENCH_FANOUT=${FANOUT_MESSAGES}\`, \`BENCH_ROUNDS=${ROUNDS}\`, \`BENCH_WARMUP=${WARMUP}\`
Baseline: \`ioredis\` against the emulated server = \`1.00x\`
Ratio: subject_time / baseline_time (smaller is faster). Fastest cell in each row is bold.
Stats: median/p95/min/max/rounds come from \`database.harness::summarize\` via \`benchSummary\` (${benchSummarySource}); nearest-rank p95, even-length median averages the middle pair. Per-op milliseconds come from \`database.harness::per_op_ms\` via \`benchPerOpMs\`, the same DTO the summary returns. No median, p95 or per-op formula lives in this example.

## Provenance

- \`node_version\`: \`${process.version}\`
- \`rustc_version\`: \`${rustcVersion ?? 'unavailable'}\`
- \`target_triple\`: \`${targetTriple ?? 'unavailable'}\`
- \`rev\`: \`${gitRev ?? 'unavailable'}\`
- \`plan\`: \`rounds=${ROUNDS}, warmup=${WARMUP}\`
- host: \`${process.platform}-${process.arch}\`
- oracle: ${oracle === null ? 'unavailable on this host (see limitation below)' : `real redis-server ${oracle.version} at ${oracle.host}:${oracle.port}`}

## Scenario matrix

| Workload | Scenario | Ops/round | Shape |
|----------|----------|----------:|-------|
${workloads.map(workload => `| \`${workload.name}\` | \`${workload.scenario}\` | ${workload.ops} | ${JSON.stringify(workload.params)} |`).join('\n')}

## Relative to \`ioredis\`

${relativeTable()}

## Median and p95 (ms)

${statsTable()}

## Per-op and throughput (median)

${perOpTable()}

${oracleSection}

## Additional platform coverage

- \`redis-unknown-wasm32\`: ${wasmCoverage}
- The matrix above runs on \`${process.platform}-${process.arch}\` with the ${process.env.BENCH_BINDING_PROFILE ?? 'debug'} binding.

## Intentional deltas

- This host shows large run-to-run variance: repeating the same tree can move one
  cell by up to about 2x. Compare cells inside one report rather than absolute
  numbers across reports, and set \`BENCH_ROUNDS\` higher when a decision needs it.
- One fresh emulated server and data directory per (workload, client); the warmup
  and measured rounds of that cell share one server and one connection. Preload
  stays outside the timed region.
- Collection workloads start each round with \`DEL\` so rounds stay idempotent; the
  \`DEL\` is inside the timed region and counted in ops on every client.
- Destructive point workloads (\`incr-seq\`, \`del-seq\`, \`move-seq\`) re-seed through the
  untimed \`reset\` hook before every round, so the timed region only measures the
  command under test.
- The \`connect\` workload measures establish + one readiness \`PING\` + close per op,
  so every client pays a full handshake regardless of its lazy-connect behavior.
- The product client has no reconnect, offline queue, or retry behavior. A socket
  error fails the in-flight command, while ioredis and node-redis carry their own
  machinery (offline queue disabled).
- No pooling and no auto-pipelining anywhere; pipelined cells send explicit
  equal-size batches of ${BATCH} on one TCP connection. The protocol column is
  not uniform: ioredis 6 negotiates RESP3 by default, while node-redis and
  \`@yydb/redis\` run RESP2 unless a workload sets \`protocol: 3\`.
- The product harness encodes one pipeline with the batch \`encodeCommands\`
  primitive and the emulated server decodes and encodes each socket burst with the
  batch \`decodeCommands\` / \`encodeReplies\` primitives, so a pipeline crosses the
  binding twice regardless of its length.
- The product adapter's RESP parser reads length headers straight from the frame
  bytes and decodes bulk elements inside an array in place, so a full-collection
  reply does not allocate a string header or a temporary element object per
  member. An in-array \`$\` length is scanned digit by digit instead of calling
  \`indexOf\` once per member. It also parses RESP3 \`%\` / \`~\` / \`_\` / \`,\` / \`>\`
  frames, which is what lets \`resp3-hello\` and \`resp3-collections\` run on the
  same adapter. All three columns share the emulated server, so a server-side
  reply improvement moves every client down together and only the client-side
  parser changes the ratio.
- An \`XADD\` append into a compact stream copies the stored body and writes only
  the new entry; the full decode/encode path remains for \`MAXLEN\` / \`MINID\`,
  deleted entries and consumer-group trailers, so the fast path never changes an
  observable reply.
- The socket server applies mutations in memory and writes the whole \`.yykv\`
  snapshot on its one-second flush cadence, so sequential \`SET\` and collection
  writes no longer pay a full-shard rewrite per command. A pipeline still folds
  into one in-memory batch, and a batch that mutates while counters are buffered
  writes through immediately. \`GET\`, \`ping\` and the collection reads still
  isolate round-trip overhead.
- Command names delegated to the native command families are matched
  case-sensitively by the current backend, so the peer adapters use explicit
  uppercase command forms.
- \`ZRANGE ... WITHSCORES\` comes back as nested \`[member, score]\` pairs from the
  emulated server even under RESP2, while a real \`redis-server\` replies flat; the
  workload normalizes both shapes, so reply parsing never changes the timed region.
- \`pubsub-roundtrip\` opens one dedicated subscriber connection per cell during the
  untimed \`prepare\` and closes it after the measured rounds; each op is one
  \`PUBLISH\` on the main connection plus the awaited delivery on the subscriber, so
  the timing covers the server-wide fan-out path, not the handshake.
- \`ttl-setex-expire\` writes \`BENCH_TTL\` keys with \`SETEX … 1\`, reads \`TTL\` on each,
  waits \`1100ms\` inside the timed region, then asserts every \`GET\` answers nil. The
  wait is a fixed constant shared by all three clients, so the absolute ms/op is
  dominated by the wait while the relative column still compares command overhead.
- \`multi-exec\` queues \`BENCH_TXN\` \`SET\`s after \`MULTI\` (each answering \`QUEUED\`) and
  commits them with one \`EXEC\`; \`MULTI\` and \`EXEC\` are counted in ops on every
  client, and the snapshot rewrite happens once at commit, not per queued command.
- \`streams-xadd-xrange\` starts each round with \`DEL\` like the other collection
  cells; \`XADD\` auto-ids are server-generated, so every client pays the same id
  allocation cost inside the timed region.
- The command-family cells added for coverage (\`mget-seq\`, \`append-getrange\`,
  \`getdel-getex\`, \`set-options\`, \`exists-type\`, \`expire-persist\`,
  \`hash-hgetall-hdel\`, \`list-lpush-lpop\`, \`set-algebra\`, \`zset-score-ops\`,
  \`bitfield-ops\`, \`hll-ops\`, \`sort-ops\`, \`keys-random\`, \`stream-xread\`,
  \`server-face-ops\`, \`watch-exec\`) keep one command shape per family and reuse
  \`BENCH_COLL\` for their key/field count. Micro cells repeat \`BENCH_REPEAT\` times
  inside one timed run so a single sub-millisecond call does not dominate the
  median, and every \`ops\` value is the real command count sent in a round.
- \`pipeline-mixed\` sends one equal-size \`BENCH_BATCH\` burst per chunk and cycles
  SET / GET / INCR / HSET / LPUSH / SADD inside it, so a single socket read crosses
  every forwarded family instead of repeating one command. GET keys are preloaded
  in \`prepare\`; the growing collections and counter are dropped in \`reset\` before
  every round, outside the timed region.
- \`set-membership-ops\` and \`zset-pop-ops\` cover the remaining family verbs
  (\`SMISMEMBER\`, \`SINTERCARD\`, \`SRANDMEMBER\`; \`ZMSCORE\`, \`ZRANDMEMBER\`,
  \`ZPOPMIN\`, \`ZPOPMAX\`). Both re-seed their keys in \`reset\` so every round sees
  the same cardinality, and both normalize the RESP2 nested-versus-flat
  \`WITHSCORES\` shape the same way \`zset-zadd-zrange\` does.
- \`large-collection-read\` builds one \`BENCH_COLL_LARGE\`-member set and zset in
  \`prepare\` and reads them whole with \`SMEMBERS\` and \`ZRANGE 0 -1\` per
  \`BENCH_REPEAT\` round, isolating full-collection reply encoding and allocation
  from the per-command round trip the \`BENCH_COLL\` cells measure. The facade
  writes both replies straight from the stored member blob: \`SMEMBERS\` counts
  and validates the length-framed chunks without decoding them, and a full
  \`ZRANGE\` sorts a borrowed view instead of copying every member.
- \`resp3-hello\` sets \`protocol: 3\` for the whole cell, so all three clients
  negotiate RESP3 and the measured round trip covers the map reply of
  \`HELLO 3\`, a bulk \`GET\`, the \`~\` set header of \`SMEMBERS\` and a \`PING\`.
  Together with \`resp3-collections\` it is one of the cells that force RESP3 on
  \`node-redis\` and \`@yydb/redis\`.
- \`expire-sweep\` writes \`BENCH_SWEEP\` keys with \`SET ... PX\`, asserts
  \`DBSIZE\`, waits \`BENCH_SWEEP_WAIT_MS\` (above the server's 100ms sweep tick)
  and then asserts \`DBSIZE\` is zero and every \`GET\` answers nil. The pre-wait
  count is an upper bound, because a slow host can take longer than the TTL to
  write the whole batch and already sweep the first keys. The fixed wait is
  shared by all clients, so the cell verifies the cleanup path rather than
  comparing raw command latency.
- \`multi-exec-mixed\` queues \`BENCH_TXN\` commands cycling
  SET / GET / INCR / HSET / LPUSH / SADD behind one \`MULTI\` and commits with
  one \`EXEC\`, so a transaction crosses every forwarded family. The growing
  collections and counter are dropped in \`reset\` outside the timed region; the
  preloaded \`GET\` keys stay outside it too.
- \`pubsub-fanout\` opens \`BENCH_FANOUT_SUBS\` dedicated subscriber connections in
  \`prepare\` and publishes \`BENCH_FANOUT\` messages to the shared channel, awaiting
  every delivery on every subscriber before the next publish. One \`ops\` unit is
  one delivery, so the cell measures fan-out rather than a single round trip.
- \`stream-xadd-xread\` writes \`BENCH_STREAM\` entries with \`XADD\` and then reads a
  bounded slice with both \`XRANGE … COUNT 20\` and \`XREAD COUNT 20\`, so the write
  path and a range read share one round. The append path copies the stored body
  and writes only the new entry instead of decoding and re-encoding every entry.
- \`hscan-cursor\` seeds \`BENCH_COLL\` fields in \`prepare\` and walks the hash with
  \`HSCAN <cursor> COUNT 32\` until the cursor returns to \`0\`. \`HSCAN\` answers
  field/value pairs, so the visited field count is half the reply list and \`ops\`
  is the seeded field count.
- \`set-ops-large\` builds two \`BENCH_COLL_LARGE\`-member sets with a half overlap in
  \`prepare\` and runs \`SINTER\`, \`SUNION\` and \`SDIFF\` \`BENCH_REPEAT\` times,
  asserting each cardinality. Preloading stays outside the timed region, so the
  cell isolates the large set-operation and full-reply encoding cost.
- \`lmpop-blocking\` re-seeds \`BENCH_BLOCK\` list elements in \`reset\` and alternates
  \`LMPOP … LEFT COUNT 1\` with \`BLPOP\` on an always-ready key. Both commands are
  served in their non-blocking replay form, so no round ever parks.
- \`key-space-notify\` subscribes one dedicated connection to
  \`__keyevent@0__:expired\`, sets \`notify-keyspace-events\` to \`Ex\`, writes
  \`BENCH_TTL\` keys with \`PX 10\` and awaits every delivery. The server's 100ms
  sweep tick is a fixed cost shared by all clients, so the cell compares the
  notification path rather than raw command latency.
- \`resp3-collections\` sets \`protocol: 3\` and repeats \`SMEMBERS\`, \`HGETALL\`,
  \`ZRANGE … WITHSCORES\` and \`SINTER\` over \`BENCH_COLL\` members, so the RESP3
  set (\`~\`), map (\`%\`) and nested score shapes cross the same adapter as the
  RESP2 cells. Both flat and nested \`WITHSCORES\` shapes are normalized.
- \`hash-keys-values\` seeds \`BENCH_COLL\` numeric fields in the untimed \`reset\`
  and repeats \`HKEYS\`, \`HVALS\`, \`HLEN\` and \`HINCRBY\` \`BENCH_REPEAT\` times. The
  seed is refreshed before every round so the increment always starts from the
  same value and the field count stays \`BENCH_COLL\`.
- \`zset-range-queries\` keeps one zset with spread scores and one with every
  member at score 0, then repeats \`ZCOUNT\`, \`ZRANGEBYSCORE\`,
  \`ZREVRANGEBYSCORE\` and \`ZRANGEBYLEX\` \`BENCH_REPEAT\` times. The bounds are
  numeric so both the emulator and a real server accept them, and the score
  range selects every member.
- \`sscan-zscan-cursor\` seeds a set and a zset with \`BENCH_COLL\` members in
  \`prepare\` and walks each with \`SSCAN\` / \`ZSCAN <cursor> COUNT 32\` until the
  cursor returns to \`0\`. \`ZSCAN\` answers member/score pairs, so the visited
  member count is half the reply list.
- \`large-hash-list-read\` seeds a \`BENCH_COLL_LARGE\`-field hash and list in
  bounded 100-element calls during \`prepare\`, then reads them whole with
  \`HGETALL\` and \`LRANGE 0 -1\` per \`BENCH_REPEAT\` round. It pairs with
  \`large-collection-read\`, which covers the set and zset families.

## Machine-readable summary

Harness \`BenchReport\` wire shape (\`database.harness\` serde contract: run-level
provenance applies to all rows, row-level \`provenance\` overrides field by field):

\`\`\`json
${JSON.stringify({ provenance: runProvenance, rows: benchRows }, null, 2)}
\`\`\`

Regenerate: \`pnpm --dir projects/redis.ts/examples/vs-js-libraries benchmark\`
`;

writeFileSync(join(exampleRoot, 'reports', 'benchmark.md'), report, 'utf8');

console.log('');
console.log('Per-workload median (ms):');
console.log(relativeTable());
console.log('');
console.log(`report written: projects/redis.ts/examples/vs-js-libraries/reports/benchmark.md`);
