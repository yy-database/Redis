import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Redis from 'ioredis';
import { startServer } from '../../../packages/redis/dist/index.js';
import { createApp } from '../src/app.mjs';

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

const dataDir = await mkdtemp(join(tmpdir(), 'yydb-redis-express-'));
const product = await startServer({ dataDir, host: '127.0.0.1', port: 0 });
const client = new Redis({
  host: product.host,
  port: product.port,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});
await waitForReady(client);

const app = createApp({ client });
const api = app.listen(0, '127.0.0.1');
await new Promise(resolve => api.once('listening', resolve));
const base = `http://127.0.0.1:${api.address().port}`;

async function call(method, path, body) {
  const options = { method };
  if (body !== undefined) {
    options.headers = { 'content-type': 'application/json' };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${base}${path}`, options);
  const text = await response.text();
  let payload = null;
  if (text.length > 0) payload = JSON.parse(text);
  return { status: response.status, payload };
}

function pass(message) {
  console.log(`PASS ${message}`);
}

try {
  const health = await call('GET', '/health');
  assert.equal(health.status, 200);
  assert.deepEqual(health.payload, { status: 'ok' });
  pass('GET /health -> 200');

  const missing = await call('GET', '/cache/missing');
  assert.equal(missing.status, 404);
  pass('GET /cache/missing -> 404');

  const object = { name: 'widget', price: 9.5, tags: ['a', 'b'] };
  const put = await call('PUT', '/cache/widget', { value: object });
  assert.equal(put.status, 204);
  const got = await call('GET', '/cache/widget');
  assert.equal(got.status, 200);
  assert.equal(got.payload.key, 'widget');
  assert.deepEqual(got.payload.value, object);
  pass('PUT/GET object round-trip -> 204/200');

  const ttl = await call('PUT', '/cache/short', { value: 'expires', ttlSeconds: 1 });
  assert.equal(ttl.status, 204);
  assert.equal((await call('GET', '/cache/short')).status, 200);
  await sleep(1_100);
  assert.equal((await call('GET', '/cache/short')).status, 404);
  pass('TTL key expires after 1100ms -> 404');

  const missingValue = await call('PUT', '/cache/bad', {});
  assert.equal(missingValue.status, 400);
  const badTtl = await call('PUT', '/cache/bad', { value: 'ok', ttlSeconds: 0 });
  assert.equal(badTtl.status, 400);
  pass('invalid bodies -> 400');

  const removed = await call('DELETE', '/cache/widget');
  assert.equal(removed.status, 204);
  assert.equal((await call('GET', '/cache/widget')).status, 404);
  assert.equal((await call('DELETE', '/cache/widget')).status, 404);
  pass('DELETE existing -> 204, missing -> 404');

  console.log('PASS express cache API (7 checks)');
} finally {
  await new Promise(resolve => api.close(resolve));
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
  await product.close();
}
