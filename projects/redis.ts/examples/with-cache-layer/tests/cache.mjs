import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Redis from 'ioredis';
import { startServer } from '../../shared/product.mjs';
import { createCache } from '../src/cache.mjs';
import { createRepository } from '../src/repository.mjs';

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

const dataDir = await mkdtemp(join(tmpdir(), 'yydb-redis-cache-test-'));
const server = await startServer({ dataDir, host: '127.0.0.1', port: 0 });
const client = new Redis({ host: server.host, port: server.port, maxRetriesPerRequest: 1, enableOfflineQueue: false });
await waitForReady(client);

const cache = createCache({ client, prefix: 'test' });
const repository = createRepository({ delayMs: 15 });

function pass(message) {
  console.log(`PASS ${message}`);
}

try {
  let missLoads = 0;
  const product = await cache.getOrLoad('SKU-1', () => {
    missLoads += 1;
    return repository.loadProduct('SKU-1');
  }, { ttlSeconds: 10 });
  assert.deepEqual(product, { sku: 'SKU-1', name: 'Widget', price: 9.5 });
  assert.equal(missLoads, 1);
  pass('miss -> loader called once');

  const hit = await cache.getOrLoad('SKU-1', () => {
    throw new Error('loader must not run on a hit');
  }, { ttlSeconds: 10 });
  assert.deepEqual(hit, product);
  pass('hit -> loader skipped');

  let coldLoads = 0;
  const cold = await Promise.all(Array.from({ length: 5 }, () =>
    cache.getOrLoad('SKU-2', () => {
      coldLoads += 1;
      return repository.loadProduct('SKU-2');
    }, { ttlSeconds: 10 })));
  assert.equal(coldLoads, 1);
  assert.ok(cold.every(value => value.sku === 'SKU-2'));
  pass('5 concurrent cold gets -> loader called once');

  let ttlLoads = 0;
  const beforeExpiry = await cache.getOrLoad('SKU-3', () => {
    ttlLoads += 1;
    return repository.loadProduct('SKU-3');
  }, { ttlSeconds: 1 });
  assert.equal(beforeExpiry.sku, 'SKU-3');
  await sleep(1_100);
  const afterExpiry = await cache.getOrLoad('SKU-3', () => {
    ttlLoads += 1;
    return repository.loadProduct('SKU-3');
  }, { ttlSeconds: 1 });
  assert.equal(ttlLoads, 2);
  assert.equal(afterExpiry.sku, 'SKU-3');
  pass('TTL key reloads after expiry');

  assert.equal(await cache.invalidate('SKU-1'), true);
  assert.equal(await cache.invalidate('SKU-1'), false);
  let invalidateLoads = 0;
  const reloaded = await cache.getOrLoad('SKU-1', () => {
    invalidateLoads += 1;
    return repository.loadProduct('SKU-1');
  }, { ttlSeconds: 10 });
  assert.equal(invalidateLoads, 1);
  assert.equal(reloaded.sku, 'SKU-1');
  pass('invalidate -> next read reloads, missing delete -> false');

  assert.deepEqual(cache.stats(), { hits: 1, misses: 5, loads: 5, errors: 0 });
  pass('stats: hits=1 misses=5 loads=5 errors=0');

  console.log('PASS cache layer (6 checks)');
} finally {
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
  await server.close();
}
