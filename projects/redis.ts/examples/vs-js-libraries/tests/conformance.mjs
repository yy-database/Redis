import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../../packages/redis/dist/index.js';
import { createClients, closeClients } from '../src/clients.mjs';

const VALUE = 'v'.repeat(64);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function checkCrossReads(clients) {
  let checks = 0;
  for (const writer of clients) {
    for (let index = 0; index < 3; index += 1) {
      const key = `conformance:value:${writer.name}:${index}`;
      const value = `${writer.name}-value-${index}`;
      assert.equal(await writer.set(key, value), 'OK');
      for (const reader of clients) {
        if (reader === writer) continue;
        assert.equal(await reader.get(key), value, `${reader.name} must read ${writer.name} key`);
      }
      checks += 1;
    }
    console.log(`PASS cross-read ${writer.name} -> peers (3 keys)`);
  }
  return checks;
}

async function checkExpiry(clients) {
  let checks = 0;
  for (const writer of clients) {
    const key = `conformance:ttl:${writer.name}`;
    assert.equal(await writer.setEx(key, VALUE, 1), 'OK');
    for (const reader of clients) {
      const ttl = await reader.ttl(key);
      assert.ok(ttl >= 0 && ttl <= 1, `${reader.name} TTL must be within 0..1, got ${ttl}`);
    }
    await sleep(1_100);
    for (const reader of clients) {
      assert.equal(await reader.get(key), null, `${reader.name} must see ${key} expired`);
    }
    checks += 1;
    console.log(`PASS expiry ${writer.name} -> peers (EX 1, 1100ms)`);
  }
  return checks;
}

async function checkPipelineOrder(clients) {
  let checks = 0;
  for (const writer of clients) {
    const prefix = `conformance:pipe:${writer.name}`;
    const values = ['a', 'b', 'c', 'd', 'e'];
    const writes = values.map((value, index) => ['SET', `${prefix}:${index}`, value]);
    const writeReplies = await writer.pipeline(writes);
    assert.deepEqual(writeReplies, values.map(() => 'OK'));

    for (const reader of clients) {
      if (reader === writer) continue;
      const reads = values.map((_, index) => ['GET', `${prefix}:${index}`]);
      const readReplies = await reader.pipeline(reads);
      assert.deepEqual(readReplies, values, `${reader.name} pipeline order must match`);
    }
    checks += 1;
    console.log(`PASS pipeline order ${writer.name} -> peers (5 keys)`);
  }
  return checks;
}

const dataDir = await mkdtemp(join(tmpdir(), 'yydb-redis-conformance-'));
const server = await startServer({ dataDir, host: '127.0.0.1', port: 0 });
const clients = await createClients({ host: server.host, port: server.port });

try {
  const checks = (await checkCrossReads(clients)) + (await checkExpiry(clients)) + (await checkPipelineOrder(clients));
  console.log(`PASS conformance (${checks} scenario checks, 3 clients, RESP2)`);
} finally {
  await closeClients(clients);
  await server.close();
}
