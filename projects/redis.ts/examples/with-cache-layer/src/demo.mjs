import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Redis from 'ioredis';
import { startServer } from '../../../packages/redis/dist/index.js';
import { createCache } from './cache.mjs';
import { createRepository } from './repository.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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

const dataDir = await mkdtemp(join(tmpdir(), 'yydb-redis-cache-demo-'));
const server = await startServer({ dataDir, host: '127.0.0.1', port: 0 });
const client = new Redis({ host: server.host, port: server.port, maxRetriesPerRequest: 1, enableOfflineQueue: false });
await waitForReady(client);

const cache = createCache({ client, prefix: 'demo' });
const repository = createRepository();

try {
  console.log(`[demo] product server ${server.host}:${server.port}`);

  let loads = 0;
  const miss = await cache.getOrLoad('SKU-1', () => {
    loads += 1;
    return repository.loadProduct('SKU-1');
  }, { ttlSeconds: 10 });
  console.log(`[demo] miss: ${JSON.stringify(miss)} loader calls=${loads}`);

  let singleFlightLoads = 0;
  const shared = await Promise.all(Array.from({ length: 5 }, () =>
    cache.getOrLoad('SKU-2', () => {
      singleFlightLoads += 1;
      return repository.loadProduct('SKU-2');
    }, { ttlSeconds: 10 })));
  console.log(`[demo] single-flight: ${shared.length} concurrent gets -> loader calls=${singleFlightLoads}`);

  let hitLoads = 0;
  const hit = await cache.getOrLoad('SKU-1', () => {
    hitLoads += 1;
    return repository.loadProduct('SKU-1');
  }, { ttlSeconds: 10 });
  console.log(`[demo] hit: ${JSON.stringify(hit)} loader calls=${hitLoads}`);

  repository.updateProduct('SKU-1', { price: 11.5 });
  await cache.invalidate('SKU-1');
  console.log('[demo] invalidated SKU-1 after price update');

  let refreshLoads = 0;
  const refreshed = await cache.getOrLoad('SKU-1', () => {
    refreshLoads += 1;
    return repository.loadProduct('SKU-1');
  }, { ttlSeconds: 10 });
  console.log(`[demo] refreshed: ${JSON.stringify(refreshed)} loader calls=${refreshLoads}`);

  await cache.getOrLoad('SKU-3', () => repository.loadProduct('SKU-3'), { ttlSeconds: 1 });
  console.log('[demo] set SKU-3 with ttlSeconds=1');
  await sleep(1_100);
  let expiredLoads = 0;
  const expired = await cache.getOrLoad('SKU-3', () => {
    expiredLoads += 1;
    return repository.loadProduct('SKU-3');
  }, { ttlSeconds: 1 });
  console.log(`[demo] expired: ${JSON.stringify(expired)} loader calls=${expiredLoads}`);

  console.log(`[demo] stats: ${JSON.stringify(cache.stats())}`);
} finally {
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
  await server.close();
}
