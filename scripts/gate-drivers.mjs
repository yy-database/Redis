//! Drives the emulated server with the real `node-redis` and `redis-py` clients.
//!
//! Both drivers run the same scenario against the installed package and report
//! the values their own client read back. Any mismatch, or a client that cannot
//! decode a reply, fails the gate.

import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { installPackages, prepareInstall } from '../projects/redis.ts/packages/redis-harness/src/install.mjs';

const run = promisify(execFile);

const WRONG_TYPE = 'WRONGTYPE Operation against a key holding the wrong kind of value';

const EXPECTED = {
    hset: 2,
    hget: 'v1',
    hgetall: { f1: 'v1', f2: 'v2' },
    hlen: 2,
    hset_update: 0,
    hget_update: 'u1',
    hdel: 1,
    hget_deleted: null,
    hdel_last: 1,
    exists_hash: 0,
    lpush: 3,
    lrange_head: ['c', 'b', 'a'],
    rpush: 4,
    lrange_all: ['c', 'b', 'a', 'd'],
    lpop: 'c',
    rpop: 'd',
    lrange_rest: ['b', 'a'],
    llen: 2,
    lpop_count: ['b', 'a'],
    exists_list: 0,
    rpush2: 4,
    rpop_count: ['d', 'c'],
    lrange2: ['a', 'b'],
    hset_w: 1,
    get_error: { error: WRONG_TYPE },
    incr_error: { error: WRONG_TYPE },
    set_plain: true,
    hset_on_string: { error: WRONG_TYPE },
    lpush_on_string: { error: WRONG_TYPE },
    del_cross: 3,
    exists_d1: 0,
    exists_d2: 0,
    exists_d3: 0,
    expire_hash: true,
    ttl_hash: true,
    type_hash: 'hash',
    expire_list: true,
    ttl_list: true,
    pttl_list: true,
    set_after_hash: true,
    type_after_set: 'string',
    get_after_set: 'plain',
    hgetall_after_set: { error: WRONG_TYPE },
    lrange_after_set: { error: WRONG_TYPE },
    setnx_hash: 0,
    hget_after_setnx: 'v',
    type_list: 'list',
};

const NODE_DRIVER = `import { createClient } from 'redis';

const client = createClient({
    socket: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) },
    RESP: 2,
});
await client.connect();

const k = name => 'n:' + name;
const out = {};
const capture = async (name, action) => {
    try {
        out[name] = await action();
    }
    catch (error) {
        out[name] = { error: error.message };
    }
};
const plain = value => Object.fromEntries(Object.entries(value));

await capture('hset', () => client.hSet(k('h1'), { f1: 'v1', f2: 'v2' }));
out.hget = await client.hGet(k('h1'), 'f1');
out.hgetall = plain(await client.hGetAll(k('h1')));
out.hlen = await client.hLen(k('h1'));
out.hset_update = await client.hSet(k('h1'), 'f1', 'u1');
out.hget_update = await client.hGet(k('h1'), 'f1');
out.hdel = await client.hDel(k('h1'), 'f2');
out.hget_deleted = await client.hGet(k('h1'), 'f2');
out.hdel_last = await client.hDel(k('h1'), 'f1');
out.exists_hash = await client.exists(k('h1'));

out.lpush = await client.lPush(k('l1'), ['a', 'b', 'c']);
out.lrange_head = await client.lRange(k('l1'), 0, -1);
out.rpush = await client.rPush(k('l1'), 'd');
out.lrange_all = await client.lRange(k('l1'), 0, -1);
out.lpop = await client.lPop(k('l1'));
out.rpop = await client.rPop(k('l1'));
out.lrange_rest = await client.lRange(k('l1'), 0, -1);
out.llen = await client.lLen(k('l1'));
out.lpop_count = await client.lPopCount(k('l1'), 2);
out.exists_list = await client.exists(k('l1'));

out.rpush2 = await client.rPush(k('l2'), ['a', 'b', 'c', 'd']);
out.rpop_count = await client.rPopCount(k('l2'), 2);
out.lrange2 = await client.lRange(k('l2'), 0, -1);

out.hset_w = await client.hSet(k('h2'), 'f', 'v');
await capture('get_error', () => client.get(k('h2')));
await capture('incr_error', () => client.incr(k('h2')));
out.set_plain = (await client.set(k('s1'), 'value')) === 'OK';
await capture('hset_on_string', () => client.hSet(k('s1'), 'f', 'v'));
await capture('lpush_on_string', () => client.lPush(k('s1'), 'a'));

await client.set(k('d1'), 'v');
await client.hSet(k('d2'), 'f', 'v');
await client.rPush(k('d3'), 'a');
out.del_cross = await client.del([k('d1'), k('d2'), k('d3')]);
out.exists_d1 = await client.exists(k('d1'));
out.exists_d2 = await client.exists(k('d2'));
out.exists_d3 = await client.exists(k('d3'));

await client.hSet(k('e1'), 'f', 'v');
out.expire_hash = await client.expire(k('e1'), 100);
out.ttl_hash = (ttl => ttl > 0 && ttl <= 100)(await client.ttl(k('e1')));
out.type_hash = await client.type(k('e1'));
await client.rPush(k('e2'), 'a');
out.expire_list = await client.expire(k('e2'), 100);
out.ttl_list = (ttl => ttl > 0 && ttl <= 100)(await client.ttl(k('e2')));
out.pttl_list = (ttl => ttl > 0)(await client.pTTL(k('e2')));

await client.hSet(k('c1'), 'f', 'v');
out.set_after_hash = (await client.set(k('c1'), 'plain')) === 'OK';
out.type_after_set = await client.type(k('c1'));
out.get_after_set = await client.get(k('c1'));
await capture('hgetall_after_set', async () => plain(await client.hGetAll(k('c1'))));
await client.rPush(k('c2'), 'a');
await client.set(k('c2'), 'plain');
await capture('lrange_after_set', () => client.lRange(k('c2'), 0, -1));

await client.hSet(k('u1'), 'f', 'v');
out.setnx_hash = Number(await client.setNX(k('u1'), 'x'));
out.hget_after_setnx = await client.hGet(k('u1'), 'f');
await client.rPush(k('l3'), 'a');
out.type_list = await client.type(k('l3'));

await client.quit();
process.stdout.write(JSON.stringify(out));
`;

const PYTHON_DRIVER = `import json
import os
import redis

client = redis.Redis(
    host=os.environ['REDIS_HOST'],
    port=int(os.environ['REDIS_PORT']),
    protocol=2,
    decode_responses=True,
)

out = {}


def capture(name, action):
    try:
        out[name] = action()
    except redis.ResponseError as error:
        out[name] = {'error': str(error)}


def k(name):
    return 'p:' + name


out['hset'] = client.hset(k('h1'), mapping={'f1': 'v1', 'f2': 'v2'})
out['hget'] = client.hget(k('h1'), 'f1')
out['hgetall'] = client.hgetall(k('h1'))
out['hlen'] = client.hlen(k('h1'))
out['hset_update'] = client.hset(k('h1'), 'f1', 'u1')
out['hget_update'] = client.hget(k('h1'), 'f1')
out['hdel'] = client.hdel(k('h1'), 'f2')
out['hget_deleted'] = client.hget(k('h1'), 'f2')
out['hdel_last'] = client.hdel(k('h1'), 'f1')
out['exists_hash'] = client.exists(k('h1'))

out['lpush'] = client.lpush(k('l1'), 'a', 'b', 'c')
out['lrange_head'] = client.lrange(k('l1'), 0, -1)
out['rpush'] = client.rpush(k('l1'), 'd')
out['lrange_all'] = client.lrange(k('l1'), 0, -1)
out['lpop'] = client.lpop(k('l1'))
out['rpop'] = client.rpop(k('l1'))
out['lrange_rest'] = client.lrange(k('l1'), 0, -1)
out['llen'] = client.llen(k('l1'))
out['lpop_count'] = client.lpop(k('l1'), 2)
out['exists_list'] = client.exists(k('l1'))

out['rpush2'] = client.rpush(k('l2'), 'a', 'b', 'c', 'd')
out['rpop_count'] = client.rpop(k('l2'), 2)
out['lrange2'] = client.lrange(k('l2'), 0, -1)

out['hset_w'] = client.hset(k('h2'), 'f', 'v')
capture('get_error', lambda: client.get(k('h2')))
capture('incr_error', lambda: client.incr(k('h2')))
out['set_plain'] = bool(client.set(k('s1'), 'value'))
capture('hset_on_string', lambda: client.hset(k('s1'), 'f', 'v'))
capture('lpush_on_string', lambda: client.lpush(k('s1'), 'a'))

client.set(k('d1'), 'v')
client.hset(k('d2'), 'f', 'v')
client.rpush(k('d3'), 'a')
out['del_cross'] = client.delete(k('d1'), k('d2'), k('d3'))
out['exists_d1'] = client.exists(k('d1'))
out['exists_d2'] = client.exists(k('d2'))
out['exists_d3'] = client.exists(k('d3'))

client.hset(k('e1'), 'f', 'v')
out['expire_hash'] = bool(client.expire(k('e1'), 100))
out['ttl_hash'] = 0 < client.ttl(k('e1')) <= 100
out['type_hash'] = client.type(k('e1'))
client.rpush(k('e2'), 'a')
out['expire_list'] = bool(client.expire(k('e2'), 100))
out['ttl_list'] = 0 < client.ttl(k('e2')) <= 100
out['pttl_list'] = client.pttl(k('e2')) > 0

client.hset(k('c1'), 'f', 'v')
out['set_after_hash'] = bool(client.set(k('c1'), 'plain'))
out['type_after_set'] = client.type(k('c1'))
out['get_after_set'] = client.get(k('c1'))
capture('hgetall_after_set', lambda: client.hgetall(k('c1')))
client.rpush(k('c2'), 'a')
client.set(k('c2'), 'plain')
capture('lrange_after_set', lambda: client.lrange(k('c2'), 0, -1))

client.hset(k('u1'), 'f', 'v')
out['setnx_hash'] = int(client.setnx(k('u1'), 'x'))
out['hget_after_setnx'] = client.hget(k('u1'), 'f')
client.rpush(k('l3'), 'a')
out['type_list'] = client.type(k('l3'))

client.close()
print(json.dumps(out))
`;

function assertSame(driver, actual) {
    const problems = [];
    for (const name of Object.keys(EXPECTED)) {
        if (!(name in actual)) {
            problems.push(`${name}: missing from the driver output`);
            continue;
        }
        if (JSON.stringify(actual[name]) !== JSON.stringify(EXPECTED[name])) {
            problems.push(`${name}: expected ${JSON.stringify(EXPECTED[name])}, read ${JSON.stringify(actual[name])}`);
        }
    }
    for (const name of Object.keys(actual)) {
        if (!(name in EXPECTED)) {
            problems.push(`${name}: unexpected observation ${JSON.stringify(actual[name])}`);
        }
    }
    if (problems.length > 0) {
        throw new Error(`${driver} disagreed on ${problems.length} observation(s):\n  ${problems.join('\n  ')}`);
    }
    return Object.keys(EXPECTED).length;
}

async function pythonDriverScript(interpreter) {
    const { stdout } = await run(interpreter, ['-c', 'import redis; print(redis.__version__)'], { encoding: 'utf8' });
    const version = stdout.trim();
    if (Number.parseInt(version, 10) < 5) {
        throw new Error(`redis-py at ${interpreter} reports version ${version}: install redis>=5`);
    }
    return version;
}

const install = await prepareInstall();
try {
    installPackages(install.scratch, ['redis@4.7.1']);
    writeFileSync(join(install.scratch, 'driver-node.mjs'), NODE_DRIVER);
    writeFileSync(join(install.scratch, 'driver-py.py'), PYTHON_DRIVER);

    const entry = await install.load();
    const server = await entry.startServer({ dataDir: join(install.scratch, 'data') });
    const environment = { ...process.env, REDIS_HOST: server.host, REDIS_PORT: String(server.port) };
    try {
        const interpreter = process.env.DRIVER_PYTHON ?? 'python';
        const pythonVersion = await pythonDriverScript(interpreter);

        const { stdout: nodeOutput } = await run(process.execPath, [join(install.scratch, 'driver-node.mjs')], {
            cwd: install.scratch,
            env: environment,
            encoding: 'utf8',
            timeout: 120000,
        });
        const nodeRead = assertSame('node-redis', JSON.parse(nodeOutput));

        const { stdout: pythonOutput } = await run(interpreter, [join(install.scratch, 'driver-py.py')], {
            cwd: install.scratch,
            env: environment,
            encoding: 'utf8',
            timeout: 120000,
        });
        const pythonRead = assertSame('redis-py', JSON.parse(pythonOutput));

        process.stdout.write(`drivers: node-redis ${nodeRead} assertions, redis-py ${pythonVersion} ${pythonRead} assertions, 0 mismatches\n`);
    }
    finally {
        await server.close();
    }
}
finally {
    install.cleanup();
}
