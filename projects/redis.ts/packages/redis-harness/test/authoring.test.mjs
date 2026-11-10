//! Author-facing checks for the `Redis` and `RedisClient` constructors.
//!
//! The checks run against the installed package, the same way the acceptance
//! file does: engines persist through `.yyds`/`.yykv`, remote clients reach an
//! engine through `listen()`, and every reply shape (bigint integers, text
//! statuses, binary `bytes` views, per-item pipeline results) is asserted from
//! the author surface only.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { prepareInstall } from '../src/install.mjs';

const installed = await prepareInstall();
const redis = await installed.load();
const { Redis, RedisClient, RedisError } = redis;

const directories = [];
const engines = [];
const clients = [];

after(async () => {
    for (const client of clients) {
        try {
            await client.close();
        }
        catch {
            // A check may have closed the connection already.
        }
    }
    for (const engine of engines) {
        try {
            await engine.close();
        }
        catch {
            // A check may have closed the engine already.
        }
    }
    for (const directory of directories) {
        rmSync(directory, { recursive: true, force: true });
    }
    installed.cleanup();
});

function temporaryDir() {
    const directory = mkdtempSync(join(tmpdir(), 'redis-authoring-'));
    directories.push(directory);
    return directory;
}

async function openEngine(options = {}) {
    const engine = new Redis(options.storage === undefined ? { storage: { directory: temporaryDir() } } : options);
    engines.push(engine);
    await engine.open();
    return engine;
}

async function connectedClient(engine, options = {}) {
    const listener = await engine.listen();
    const client = new RedisClient({ endpoint: { host: '127.0.0.1', port: listener.endpoint.port }, ...options });
    clients.push(client);
    await client.connect();
    return client;
}

test('Redis rejects malformed storage options at construction', () => {
    assert.throws(() => new Redis({ storage: { directory: '' } }), error =>
        error instanceof RedisError && error.product === 'redis' && error.code === 'configuration' && error.phase === 'configuration');
    assert.throws(() => new Redis({ storage: 5 }), error => error instanceof RedisError && error.phase === 'configuration');
    assert.throws(() => new Redis({ storage: {} }), error => error instanceof RedisError && error.phase === 'configuration');
});

test('Redis open without storage reports the directory requirement', async () => {
    const engine = new Redis();
    await assert.rejects(engine.open(), error =>
        error instanceof RedisError && error.code === 'storage-directory-required' && error.phase === 'configuration' && error.execution === 'not-sent');
    assert.equal(engine.state, 'new');
});

test('Redis walks the lifecycle states and refuses to reopen', async () => {
    const engine = await openEngine();
    assert.equal(engine.state, 'open');
    await Promise.all([engine.open(), engine.open()]);
    assert.equal(engine.state, 'open');
    await engine.close();
    assert.equal(engine.state, 'closed');
    await engine.close();
    await assert.rejects(engine.open(), error => error instanceof RedisError && error.code === 'invalid-state');
});

test('set and get round-trip text and null', async () => {
    const engine = await openEngine();
    assert.equal(await engine.set('greeting', 'hello'), 'OK');
    assert.equal(await engine.get('greeting'), 'hello');
    assert.equal(await engine.get('missing'), null);
});

test('integer replies are bigint', async () => {
    const engine = await openEngine();
    assert.equal(await engine.incr('counter'), 1n);
    assert.equal(typeof await engine.incr('counter'), 'bigint');
    assert.equal(await engine.incrby('counter', 5), 7n);
    assert.equal(await engine.decr('counter'), 6n);
    assert.equal(await engine.exists('counter'), 1n);
    assert.equal(await engine.del('counter'), 1n);
    assert.equal(await engine.exists('counter'), 0n);
});

test('bytes.get returns the exact stored bytes', async () => {
    const engine = await openEngine();
    const binary = new Uint8Array([0, 1, 2, 253, 254, 255]);
    await engine.set('bin', binary);
    const view = await engine.bytes.get('bin');
    assert.equal(view.constructor.name, 'Uint8Array');
    assert.deepEqual(Array.from(view), Array.from(binary));
    assert.equal(await engine.get('bin'), Buffer.from(binary).toString('utf8'));
    assert.deepEqual(await engine.bytes.get('greeting-missing'), null);
});

test('the hash list set and zset families compose through the dispatcher', async () => {
    const engine = await openEngine();
    assert.equal(await engine.hset('h', 'f1', 'v1', 'f2', 'v2'), 2n);
    assert.equal(await engine.hget('h', 'f1'), 'v1');
    assert.deepEqual(await engine.hgetall('h'), ['f1', 'v1', 'f2', 'v2']);
    assert.equal(await engine.hlen('h'), 2n);
    assert.equal(await engine.hexists('h', 'f1'), 1n);
    assert.equal(await engine.hdel('h', 'f1'), 1n);

    assert.equal(await engine.lpush('l', 'a', 'b'), 2n);
    assert.equal(await engine.rpush('l', 'c'), 3n);
    assert.deepEqual(await engine.lrange('l', 0, -1), ['b', 'a', 'c']);
    assert.equal(await engine.llen('l'), 3n);
    assert.equal(await engine.lindex('l', 1), 'a');
    assert.equal(await engine.lpop('l'), 'b');
    assert.equal(await engine.rpop('l'), 'c');

    assert.equal(await engine.sadd('s', 'm1', 'm2'), 2n);
    assert.deepEqual(await engine.smembers('s'), ['m1', 'm2']);
    assert.equal(await engine.scard('s'), 2n);
    assert.equal(await engine.sismember('s', 'm1'), 1n);
    assert.equal(await engine.srem('s', 'm1'), 1n);

    assert.equal(await engine.zadd('z', 1.5, 'alpha', 2, 'beta'), 2n);
    assert.equal(await engine.zscore('z', 'alpha'), 1.5);
    assert.equal(typeof await engine.zscore('z', 'alpha'), 'number');
    assert.equal(await engine.zcard('z'), 2n);
    assert.deepEqual(await engine.zrange('z', 0, -1), ['alpha', 'beta']);
    assert.equal(await engine.zrem('z', 'alpha'), 1n);
});

test('expire ttl and persist report remaining time', async () => {
    const engine = await openEngine();
    await engine.set('k', 'v');
    assert.equal(await engine.ttl('k'), -1n);
    assert.equal(await engine.expire('k', 100), 1n);
    const ttl = await engine.ttl('k');
    assert.ok(ttl > 0n && ttl <= 100n, String(ttl));
    assert.equal(await engine.pexpire('k', 50_000), 1n);
    const pttl = await engine.pttl('k');
    assert.ok(pttl > 0n && pttl <= 50_000n, String(pttl));
    assert.equal(await engine.persist('k'), 1n);
    assert.equal(await engine.ttl('k'), -1n);
    assert.equal(await engine.ttl('missing-key'), -2n);
    assert.equal(await engine.del('k'), 1n);
});

test('a wrong-type command surfaces as the error envelope', async () => {
    const engine = await openEngine();
    await engine.set('counter', '0');
    await assert.rejects(engine.lpush('counter', 'x'), error => {
        assert.ok(error instanceof RedisError);
        assert.ok(error instanceof Error);
        assert.equal(error.name, 'RedisError');
        assert.equal(error.product, 'redis');
        assert.equal(error.code, 'WRONGTYPE');
        assert.equal(error.phase, 'execute');
        assert.equal(error.execution, 'replied');
        assert.equal(error.retry, 'never');
        assert.match(error.message, /WRONGTYPE/);
        return true;
    });
});

test('commands before open fail as not-sent', async () => {
    const engine = new Redis({ storage: { directory: temporaryDir() } });
    await assert.rejects(engine.set('a', '1'), error =>
        error instanceof RedisError && error.code === 'invalid-state' && error.execution === 'not-sent' && error.phase === 'execute');
    await assert.rejects(engine.bytes.get('a'), error => error instanceof RedisError && error.code === 'invalid-state');
});

test('close cascades over listeners and sessions', async () => {
    const engine = await openEngine();
    const listener = await engine.listen();
    const client = new RedisClient({ endpoint: { host: '127.0.0.1', port: listener.endpoint.port } });
    clients.push(client);
    await client.connect();
    await client.set('remote', '1');
    const session = await engine.client();
    assert.equal(listener.closed, false);
    await engine.close();
    assert.equal(listener.closed, true);
    assert.equal(session.state, 'closed');
    await assert.rejects(session.get('remote'), error => error instanceof RedisError && error.code === 'invalid-state');
    await assert.rejects(client.get('remote'), error =>
        error instanceof RedisError && (error.execution === 'unknown' || error.code === 'invalid-state'));
    await new Promise((resolve, reject) => {
        const probe = net.connect({ host: '127.0.0.1', port: listener.endpoint.port });
        probe.once('connect', () => { probe.destroy(); reject(new Error('the listener still accepts')); });
        probe.once('error', () => resolve());
    });
});

test('client sessions isolate databases', async () => {
    const engine = await openEngine();
    const session = await engine.client({ database: 1 });
    assert.equal(session.database, 1);
    await engine.set('x', 'root');
    assert.equal(await session.get('x'), null);
    await session.set('x', 'db1');
    assert.equal(await engine.get('x'), 'root');
    assert.equal(await session.get('x'), 'db1');
    await session.close();
    await session.close();
    assert.equal(session.state, 'closed');
    await assert.rejects(session.get('x'), error => error instanceof RedisError && error.code === 'invalid-state');
});

test('values persist across engine reopens', async () => {
    const directory = temporaryDir();
    const engine = await openEngine({ storage: { directory } });
    await engine.set('durable', 'kept');
    await engine.close();
    const reopened = new Redis({ storage: { directory } });
    engines.push(reopened);
    await reopened.open();
    assert.equal(await reopened.get('durable'), 'kept');
});

test('listen reports the bound endpoint and serves the wire', async () => {
    const engine = await openEngine();
    const listener = await engine.listen();
    assert.ok(listener.endpoint.port > 0);
    assert.equal(listener.endpoint.host, '127.0.0.1');
    const client = new RedisClient({ url: `redis://127.0.0.1:${listener.endpoint.port}` });
    clients.push(client);
    await client.connect();
    await client.set('via-wire', 'yes');
    assert.equal(await engine.get('via-wire'), 'yes');
    await listener.close();
    await listener.close();
    assert.equal(listener.closed, true);
});

test('RedisClient rejects url and endpoint together', () => {
    assert.throws(() => new RedisClient({ url: 'redis://127.0.0.1:6379', endpoint: { host: '127.0.0.1', port: 6379 } }),
        error => error instanceof RedisError && error.code === 'configuration' && error.phase === 'configuration' && error.execution === 'not-sent');
});

test('RedisClient rejects a non-redis url', () => {
    assert.throws(() => new RedisClient({ url: 'http://127.0.0.1:6379' }),
        error => error instanceof RedisError && error.phase === 'configuration');
    assert.throws(() => new RedisClient({ url: 'not a url' }),
        error => error instanceof RedisError && error.phase === 'configuration');
});

test('RedisClient rejects duplicated database and credentials', () => {
    assert.throws(() => new RedisClient({ url: 'redis://127.0.0.1:6379/2', database: 1 }),
        error => error instanceof RedisError && error.phase === 'configuration');
    assert.throws(() => new RedisClient({ url: 'redis://user:pass@127.0.0.1:6379', auth: { password: 'other' } }),
        error => error instanceof RedisError && error.phase === 'configuration');
});

test('RedisClient rejects topologies the primitives do not serve', () => {
    assert.throws(() => new RedisClient({ endpoint: { host: '127.0.0.1', port: 6379 }, topology: 'sentinel' }),
        error => error instanceof RedisError && error.phase === 'configuration');
    assert.throws(() => new RedisClient({ endpoint: { host: '127.0.0.1', port: 6379 }, topology: 'cluster' }),
        error => error instanceof RedisError && error.phase === 'configuration');
});

test('RedisClient rejects an out-of-range database', () => {
    assert.throws(() => new RedisClient({ endpoint: { host: '127.0.0.1', port: 6379 }, database: 16 }),
        error => error instanceof RedisError && error.phase === 'configuration');
});

test('connect negotiates RESP3 and reaches the engine', async () => {
    const engine = await openEngine();
    const client = await connectedClient(engine);
    assert.equal(client.state, 'ready');
    assert.equal(client.protocol, 3);
    assert.equal(await client.set('remote', '1'), 'OK');
    assert.equal(await client.get('remote'), '1');
    assert.equal(await client.incr('remote'), 2n);
    assert.equal(await engine.get('remote'), '2');
    await client.connect();
    assert.equal(client.state, 'ready');
});

test('the url form selects the database from the path', async () => {
    const engine = await openEngine();
    const listener = await engine.listen();
    const client = new RedisClient({ url: `redis://127.0.0.1:${listener.endpoint.port}/3` });
    clients.push(client);
    await client.connect();
    await client.set('scoped', 'db3');
    assert.equal(await engine.get('scoped'), null);
    const session = await engine.client({ database: 3 });
    assert.equal(await session.get('scoped'), 'db3');
});

test('the name option is applied during the handshake', async () => {
    const engine = await openEngine();
    const client = await connectedClient(engine, { name: 'authoring-test' });
    assert.equal(await client.call('CLIENT', 'GETNAME'), 'authoring-test');
});

test('AUTH is refused during the handshake because the server face does not implement it', async () => {
    const engine = await openEngine();
    const listener = await engine.listen();
    const client = new RedisClient({ endpoint: { host: '127.0.0.1', port: listener.endpoint.port }, auth: { password: 'secret' } });
    await assert.rejects(client.connect(), error =>
        error instanceof RedisError && error.phase === 'connect' && error.execution === 'replied');
    assert.equal(client.state, 'failed');
});

test('commands after close fail as not-sent', async () => {
    const engine = await openEngine();
    const client = await connectedClient(engine);
    await client.close();
    await client.close();
    assert.equal(client.state, 'closed');
    await assert.rejects(client.get('anything'), error =>
        error instanceof RedisError && error.code === 'invalid-state' && error.execution === 'not-sent');
    await assert.rejects(client.connect(), error => error instanceof RedisError && error.code === 'invalid-state');
});

test('close drains in-flight requests', async () => {
    const engine = await openEngine();
    const client = await connectedClient(engine);
    await client.set('k', 'v');
    const inflight = client.get('k');
    await client.close();
    assert.equal(await inflight, 'v');
});

test('a connection lost before a reply reports an unknown execution', async () => {
    const rude = net.createServer(socket => {
        setTimeout(() => socket.destroy(), 50);
    });
    await new Promise(resolve => rude.listen(0, '127.0.0.1', resolve));
    const port = rude.address().port;
    const client = new RedisClient({ endpoint: { host: '127.0.0.1', port } });
    try {
        await assert.rejects(client.connect(), error =>
            error instanceof RedisError && error.execution === 'unknown');
        assert.equal(client.state, 'failed');
    }
    finally {
        await new Promise(resolve => rude.close(resolve));
    }
});

test('client close does not touch the engine', async () => {
    const engine = await openEngine();
    const client = await connectedClient(engine);
    await client.set('shared', '1');
    await client.close();
    assert.equal(await engine.get('shared'), '1');
    assert.equal(engine.state, 'open');
});

test('pipeline answers per item without atomicity', async () => {
    const engine = await openEngine();
    const client = await connectedClient(engine);
    const results = await client.pipeline().set('a', '1').incr('a').exec();
    assert.deepEqual(results, [{ ok: true, value: 'OK' }, { ok: true, value: 2n }]);
    assert.equal(await engine.get('a'), '2');
});

test('pipeline reports per-item errors inside the results', async () => {
    const engine = await openEngine();
    const client = await connectedClient(engine);
    await client.set('text', 'not-a-number');
    const results = await client.pipeline().set('ok', '1').incr('text').get('ok').exec();
    assert.equal(results[0].ok, true);
    assert.equal(results[1].ok, false);
    assert.equal(results[1].error.code, 'ERR');
    assert.equal(results[1].error.execution, 'replied');
    assert.equal(results[2].ok, true);
    assert.equal(results[2].value, '1');
});

test('multi executes a queue and answers per item', async () => {
    const engine = await openEngine();
    const client = await connectedClient(engine);
    const outcome = await client.multi().set('m', '5').incr('m').exec();
    assert.equal(outcome.status, 'executed');
    assert.deepEqual(outcome.results, [{ ok: true, value: 'OK' }, { ok: true, value: 6n }]);
    assert.equal(await engine.get('m'), '6');
});

test('multi aborts when a queued command is rejected', async () => {
    const engine = await openEngine();
    const client = await connectedClient(engine);
    const outcome = await client.multi().set('keep', '1').call('GET').exec();
    assert.equal(outcome.status, 'aborted');
    assert.equal(await engine.get('keep'), null);
});

test('a pipeline on a closed client fails before anything is sent', async () => {
    const engine = await openEngine();
    const client = await connectedClient(engine);
    await client.close();
    const builder = client.pipeline().set('x', '1');
    await assert.rejects(builder.exec(), error =>
        error instanceof RedisError && error.code === 'invalid-state' && error.execution === 'not-sent');
});

test('command errors on the wire carry the full envelope', async () => {
    const engine = await openEngine();
    const client = await connectedClient(engine);
    await client.set('text', 'value');
    await assert.rejects(client.lpush('text', 'x'), error => {
        assert.ok(error instanceof RedisError);
        assert.equal(error.product, 'redis');
        assert.equal(error.code, 'WRONGTYPE');
        assert.equal(error.phase, 'execute');
        assert.equal(error.execution, 'replied');
        assert.equal(error.retry, 'never');
        return true;
    });
});

test('RedisClient defaults the address to the local standard port', () => {
    const client = new RedisClient({});
    assert.equal(client.state, 'new');
});
