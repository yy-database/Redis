import Redis from 'ioredis';
import { createClient as createNodeRedisClient } from 'redis';
import { createRespClient } from './resp-client.mjs';

function waitForReady(client) {
  return new Promise((resolve, reject) => {
    if (client.status === 'ready') {
      resolve();
      return;
    }
    client.once('ready', resolve);
    client.once('error', reject);
  });
}

async function makeIoredis({ host, port }) {
  const client = new Redis({
    host,
    port,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: false,
  });
  await waitForReady(client);
  return {
    name: 'ioredis',
    set: (key, value) => client.call('SET', key, value),
    setEx: (key, value, seconds) => client.call('SET', key, value, 'EX', String(seconds)),
    get: key => client.call('GET', key),
    ttl: key => client.call('TTL', key),
    ping: () => client.ping(),
    call: args => client.call(...args),
    async pipeline(commands) {
      const tx = client.pipeline();
      for (const args of commands) tx.call(...args);
      const replies = await tx.exec();
      if (!replies) throw new Error('ioredis pipeline returned no replies');
      return replies.map(([error, value]) => {
        if (error) throw error;
        return value;
      });
    },
    close: () => client.quit(),
  };
}

async function makeNodeRedis({ host, port }) {
  const client = createNodeRedisClient({ socket: { host, port }, RESP: 2 });
  client.on('error', () => {});
  await client.connect();
  return {
    name: 'node-redis',
    set: (key, value) => client.sendCommand(['SET', key, value]),
    setEx: (key, value, seconds) => client.sendCommand(['SET', key, value, 'EX', String(seconds)]),
    get: key => client.sendCommand(['GET', key]),
    ttl: key => client.sendCommand(['TTL', key]),
    ping: () => client.ping(),
    call: args => client.sendCommand(args),
    async pipeline(commands) {
      const multi = client.multi();
      for (const args of commands) multi.sendCommand(args);
      return multi.exec();
    },
    close: () => client.quit(),
  };
}

async function makeProduct({ host, port }) {
  const client = createRespClient({ host, port });
  return {
    name: '@yydb/redis',
    set: (key, value) => client.command(['SET', key, value]),
    setEx: (key, value, seconds) => client.command(['SET', key, value, 'EX', String(seconds)]),
    get: key => client.command(['GET', key]),
    ttl: key => client.command(['TTL', key]),
    ping: () => client.command(['PING']),
    call: args => client.command(args),
    pipeline: commands => client.pipeline(commands),
    close: () => client.close(),
  };
}

const clientFactories = {
  ioredis: makeIoredis,
  '@yydb/redis': makeProduct,
  'node-redis': makeNodeRedis,
};

/** Creates one adapter by report name so benchmarks can isolate every measurement. */
export async function createClient(name, options) {
  const factory = clientFactories[name];
  if (!factory) throw new Error(`unknown client ${name}`);
  return factory(options);
}

/** One connection per client, ordered as in the reports. */
export async function createClients(options) {
  return [
    await createClient('ioredis', options),
    await createClient('@yydb/redis', options),
    await createClient('node-redis', options),
  ];
}

export async function closeClients(clients) {
  for (const client of clients) {
    try {
      await client.close();
    } catch {
      // Closing after a server-side disconnect is not a test failure.
    }
  }
}
