import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../../packages/redis/dist/index.js';
import { createClients, closeClients } from '../src/clients.mjs';
import { elapsedMs, median, throughput } from '../src/timing.mjs';

const HOST = '127.0.0.1';
const VALUE = 'v'.repeat(64);
const BATCH = 500;

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
const ROUNDS = count('BENCH_ROUNDS', 3);

const workloads = [
  {
    name: 'set-seq',
    ops: SET_COUNT,
    async run(client) {
      for (let index = 0; index < SET_COUNT; index += 1) {
        await client.set(`bench:set:${index}`, VALUE);
      }
    },
  },
  {
    name: 'set-pipeline',
    ops: PIPE_COUNT,
    async run(client) {
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
    name: 'get-seq',
    ops: GET_COUNT,
    async prepare(client) {
      for (let start = 0; start < GET_COUNT; start += BATCH) {
        const commands = [];
        for (let index = start; index < Math.min(start + BATCH, GET_COUNT); index += 1) {
          commands.push(['SET', `bench:get:${index}`, VALUE]);
        }
        await client.pipeline(commands);
      }
    },
    async run(client) {
      for (let index = 0; index < GET_COUNT; index += 1) {
        await client.get(`bench:get:${index}`);
      }
    },
  },
  {
    name: 'ping',
    ops: PING_COUNT,
    async run(client) {
      for (let index = 0; index < PING_COUNT; index += 1) {
        await client.ping();
      }
    },
  },
];

const names = workloads.map(workload => workload.name);

async function runRound() {
  const dataDir = await mkdtemp(join(tmpdir(), 'yydb-redis-bench-'));
  const server = await startServer({ dataDir, host: HOST, port: 0 });
  const clients = await createClients({ host: server.host, port: server.port });
  const result = Object.fromEntries(names.map(name => [name, {}]));
  try {
    for (const workload of workloads) {
      for (const client of clients) {
        await workload.prepare?.(client);
        const start = process.hrtime.bigint();
        await workload.run(client);
        result[workload.name][client.name] = elapsedMs(start);
      }
    }
  } finally {
    await closeClients(clients);
    await server.close();
  }
  return result;
}

console.log(`Redis RESP2 benchmark (1 warmup + ${ROUNDS} measured rounds)`);
console.log(`Defaults: BENCH_SET=${SET_COUNT}, BENCH_PIPE=${PIPE_COUNT}, BENCH_GET=${GET_COUNT}, BENCH_PING=${PING_COUNT}, BENCH_ROUNDS=${ROUNDS}`);
console.log('Server: fresh emulated server and dataDir per round, shared by every client');
console.log('');

await runRound();

const rounds = [];
for (let round = 1; round <= ROUNDS; round += 1) {
  const result = await runRound();
  rounds.push(result);
  const total = clientsTotal(result);
  console.log(
    `round ${round} total: ioredis=${total.ioredis.toFixed(1)}ms @yydb/redis=${total['@yydb/redis'].toFixed(1)}ms node-redis=${total['node-redis'].toFixed(1)}ms`,
  );
}

function clientsTotal(result) {
  return {
    ioredis: names.reduce((sum, name) => sum + result[name].ioredis, 0),
    '@yydb/redis': names.reduce((sum, name) => sum + result[name]['@yydb/redis'], 0),
    'node-redis': names.reduce((sum, name) => sum + result[name]['node-redis'], 0),
  };
}

const clientNames = ['ioredis', '@yydb/redis', 'node-redis'];
const medians = Object.fromEntries(
  names.map(name => [
    name,
    Object.fromEntries(clientNames.map(client => [client, median(rounds.map(result => result[name][client]))])),
  ]),
);

console.log('');
console.log('Per-workload median time (ms):');
console.log('| Workload | ioredis | @yydb/redis | node-redis |');
console.log('|----------|--------:|------------:|-----------:|');
for (const name of names) {
  console.log(
    `| ${name} | ${medians[name].ioredis.toFixed(2)} | ${medians[name]['@yydb/redis'].toFixed(2)} | ${medians[name]['node-redis'].toFixed(2)} |`,
  );
}

const ratioCell = (ms, baseline, fastest) => {
  const ratio = ms / baseline;
  const cell = `${ratio >= 10 ? ratio.toFixed(1) : ratio.toFixed(2)}x`;
  return ms === fastest ? `**${cell}**` : cell;
};

console.log('');
console.log('Relative to ioredis (1.00x; smaller is faster, bold = fastest):');
console.log('| Workload | ioredis | @yydb/redis | node-redis |');
console.log('|----------|--------:|------------:|-----------:|');
for (const name of names) {
  const baseline = medians[name].ioredis;
  const fastest = Math.min(...clientNames.map(client => medians[name][client]));
  console.log(
    `| ${name} | ${ratioCell(baseline, baseline, fastest)} | ${ratioCell(medians[name]['@yydb/redis'], baseline, fastest)} | ${ratioCell(medians[name]['node-redis'], baseline, fastest)} |`,
  );
}

console.log('');
console.log('Absolute throughput (median):');
console.log('| Workload | ops | ioredis | @yydb/redis | node-redis |');
console.log('|----------|----:|--------:|------------:|-----------:|');
for (const workload of workloads) {
  const cells = clientNames.map(client => {
    const ms = medians[workload.name][client];
    return `${(ms / workload.ops).toFixed(3)} ms/op, ${throughput(workload.ops, ms)}`;
  });
  console.log(`| ${workload.name} | ${workload.ops} | ${cells.join(' | ')} |`);
}
