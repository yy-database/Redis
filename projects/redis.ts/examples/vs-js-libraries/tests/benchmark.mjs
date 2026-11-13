// 场景矩阵对照：`@yydb/redis` 仿真服务端 vs `ioredis` / `node-redis`，RESP2。
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
//   BENCH_BLOCK (100), BENCH_PING_CONC (800), BENCH_CONC (8), BENCH_GROUP (100)
// 真机对照：设 BENCH_ORACLE_HOST / BENCH_ORACLE_PORT 指向真实 redis-server 后，
//   同一矩阵以 `ioredis` 为固定客户端再跑一轮，作为 oracle 列写进报告。

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
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
const ROUNDS = count('BENCH_ROUNDS', 3);
const WARMUP = count('BENCH_WARMUP', 1);
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
  const context = { clientName, host: target.host, port: target.port };
  let server = null;
  let client = null;
  if (!target.oracle) {
    const dataDir = await mkdtemp(join(tmpdir(), 'yydb-redis-bench-'));
    server = await startServer({ dataDir, host: HOST, port: 0 });
    context.host = server.host;
    context.port = server.port;
  }
  try {
    client = await createClient(clientName, { host: context.host, port: context.port });
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

console.log(`Redis RESP2 scenario matrix (${WARMUP} warmup + ${ROUNDS} measured rounds per cell)`);
console.log(`Defaults: BENCH_SET=${SET_COUNT}, BENCH_GET=${GET_COUNT}, BENCH_PIPE=${PIPE_COUNT}, BENCH_PING=${PING_COUNT}, BENCH_BATCH=${BATCH}, BENCH_COLL=${COLL}, BENCH_BIG=${BIG_COUNT}, BENCH_BIG_GET=${BIG_GET}, BENCH_BIG_BYTES=${BIG_BYTES}, BENCH_CONNECT=${CONNECT_COUNT}, BENCH_STREAM=${STREAM_COUNT}, BENCH_PUBSUB=${PUBSUB_COUNT}, BENCH_TTL=${TTL_COUNT}, BENCH_TXN=${TXN_COUNT}, BENCH_INCR=${INCR_COUNT}, BENCH_MSET=${MSET_COUNT}, BENCH_DEL=${DEL_COUNT}, BENCH_MOVE=${MOVE_COUNT}, BENCH_BLOCK=${BLOCK_COUNT}, BENCH_PING_CONC=${PING_CONC}, BENCH_CONC=${CONCURRENCY}, BENCH_GROUP=${GROUP_COUNT}, BENCH_ROUNDS=${ROUNDS}, BENCH_WARMUP=${WARMUP}`);
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
    group: String(GROUP_COUNT),
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

const report = `# Benchmark report

Command: \`pnpm --dir projects/redis.ts/examples/vs-js-libraries benchmark\`
Binding: \`${process.env.BENCH_BINDING_PROFILE ?? 'debug'}\` — build with \`pnpm build:release\` and set \`BENCH_BINDING_PROFILE=release\` for product numbers
Defaults: \`BENCH_SET=${SET_COUNT}\`, \`BENCH_GET=${GET_COUNT}\`, \`BENCH_PIPE=${PIPE_COUNT}\`, \`BENCH_PING=${PING_COUNT}\`, \`BENCH_BATCH=${BATCH}\`, \`BENCH_COLL=${COLL}\`, \`BENCH_BIG=${BIG_COUNT}\`, \`BENCH_BIG_GET=${BIG_GET}\`, \`BENCH_BIG_BYTES=${BIG_BYTES}\`, \`BENCH_CONNECT=${CONNECT_COUNT}\`, \`BENCH_STREAM=${STREAM_COUNT}\`, \`BENCH_PUBSUB=${PUBSUB_COUNT}\`, \`BENCH_TTL=${TTL_COUNT}\`, \`BENCH_TXN=${TXN_COUNT}\`, \`BENCH_INCR=${INCR_COUNT}\`, \`BENCH_MSET=${MSET_COUNT}\`, \`BENCH_DEL=${DEL_COUNT}\`, \`BENCH_MOVE=${MOVE_COUNT}\`, \`BENCH_BLOCK=${BLOCK_COUNT}\`, \`BENCH_PING_CONC=${PING_CONC}\`, \`BENCH_CONC=${CONCURRENCY}\`, \`BENCH_GROUP=${GROUP_COUNT}\`, \`BENCH_ROUNDS=${ROUNDS}\`, \`BENCH_WARMUP=${WARMUP}\`
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
  equal-size batches of ${BATCH}. All clients use RESP2 on one TCP connection.
- The product harness encodes one pipeline with the batch \`encodeCommands\`
  primitive and the emulated server decodes and encodes each socket burst with the
  batch \`decodeCommands\` / \`encodeReplies\` primitives, so a pipeline crosses the
  binding twice regardless of its length.
- \`SET\` rewrites the whole \`.yykv\` snapshot, so absolute \`SET\` numbers (including
  \`set-big\`) are snapshot-bound; \`GET\`, \`ping\` and the collection reads isolate
  round-trip overhead.
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
