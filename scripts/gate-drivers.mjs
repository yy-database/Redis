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
    hincrby: 5,
    hget_incr: '5',
    lindex_head: 'a',
    lindex_negative: 'd',
    lindex_missing: null,
    sadd: 2,
    smembers: ['a', 'b'],
    scard: 2,
    sismember_yes: 1,
    sismember_no: 0,
    srem: 1,
    smembers_after_srem: ['b'],
    type_set: 'set',
    expire_set: true,
    ttl_set: true,
    zadd: 3,
    zrange: ['a', 'b', 'c'],
    zrange_scores: [['a', 1], ['b', 2], ['c', 2]],
    zscore: 1,
    zcard: 3,
    zrem: 1,
    zrange_after_zrem: ['a', 'c'],
    type_zset: 'zset',
    expire_zset: true,
    ttl_zset: true,
    get_on_set: { error: WRONG_TYPE },
    sadd_on_string: { error: WRONG_TYPE },
    zadd_on_list: { error: WRONG_TYPE },
    del_five: 5,
    exists_five: 0,
    scan_first: ['2', ['a', 'b']],
    scan_match_empty: ['2', []],
    scan_match_hit: ['4', ['c']],
    scan_last: ['0', ['e']],
    scan_end: ['0', []],
    rename_cross: true,
    type_after_rename: 'zset',
    zscore_after_rename: 1,
    ttl_after_rename: true,
    rename_overwrite: true,
    type_after_overwrite: 'string',
    get_after_overwrite: 'v',
    zscore_after_overwrite: { error: WRONG_TYPE },
    renamenx_present: 0,
    renamenx_moved: 1,
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

out.hincrby = await client.hIncrBy(k('hi'), 'f', 5);
out.hget_incr = await client.hGet(k('hi'), 'f');

await client.rPush(k('li'), ['a', 'b', 'c', 'd']);
out.lindex_head = await client.lIndex(k('li'), 0);
out.lindex_negative = await client.lIndex(k('li'), -1);
out.lindex_missing = await client.lIndex(k('li'), 99);

out.sadd = await client.sAdd(k('se'), ['a', 'b', 'a']);
out.smembers = (await client.sMembers(k('se'))).sort();
out.scard = await client.sCard(k('se'));
out.sismember_yes = Number(await client.sIsMember(k('se'), 'b'));
out.sismember_no = Number(await client.sIsMember(k('se'), 'c'));
out.srem = await client.sRem(k('se'), 'a');
out.smembers_after_srem = (await client.sMembers(k('se'))).sort();
out.type_set = await client.type(k('se'));
out.expire_set = await client.expire(k('se'), 100);
out.ttl_set = (ttl => ttl > 0 && ttl <= 100)(await client.ttl(k('se')));

out.zadd = await client.zAdd(k('zs'), [{ score: 2, value: 'b' }, { score: 1, value: 'a' }, { score: 2, value: 'c' }]);
out.zrange = await client.zRange(k('zs'), 0, -1);
out.zrange_scores = (await client.zRangeWithScores(k('zs'), 0, -1)).map(entry => [entry.value, Number(entry.score)]);
out.zscore = Number(await client.zScore(k('zs'), 'a'));
out.zcard = await client.zCard(k('zs'));
out.zrem = await client.zRem(k('zs'), 'b');
out.zrange_after_zrem = await client.zRange(k('zs'), 0, -1);
out.type_zset = await client.type(k('zs'));
out.expire_zset = await client.expire(k('zs'), 100);
out.ttl_zset = (ttl => ttl > 0 && ttl <= 100)(await client.ttl(k('zs')));

await capture('get_on_set', () => client.get(k('se')));
await capture('sadd_on_string', () => client.sAdd(k('s1'), ['x']));
await capture('zadd_on_list', () => client.zAdd(k('l2'), [{ score: 1, value: 'x' }]));

await client.set(k('f1'), 'v');
await client.hSet(k('f2'), 'f', 'v');
await client.rPush(k('f3'), 'a');
await client.sAdd(k('f4'), ['a']);
await client.zAdd(k('f5'), [{ score: 1, value: 'a' }]);
out.del_five = await client.del([k('f1'), k('f2'), k('f3'), k('f4'), k('f5')]);
out.exists_five = await client.exists(k('f5'));

await client.select(5);
await client.flushDb();
await client.set('a', 'v');
await client.hSet('b', 'f', 'v');
await client.rPush('c', 'a');
await client.sAdd('d', ['a']);
await client.zAdd('e', [{ score: 1, value: 'a' }]);
const first = await client.scan(0, { COUNT: 2 });
out.scan_first = [String(first.cursor), first.keys];
const empty = await client.scan(0, { MATCH: 'c', COUNT: 2 });
out.scan_match_empty = [String(empty.cursor), empty.keys];
const hit = await client.scan(2, { MATCH: 'c', COUNT: 2 });
out.scan_match_hit = [String(hit.cursor), hit.keys];
const last = await client.scan(4, { COUNT: 2 });
out.scan_last = [String(last.cursor), last.keys];
const end = await client.scan(5, { COUNT: 2 });
out.scan_end = [String(end.cursor), end.keys];

await client.select(6);
await client.flushDb();
await client.zAdd('z1', [{ score: 1, value: 'a' }]);
await client.expire('z1', 100);
out.rename_cross = (await client.rename('z1', 'z2')) === 'OK';
out.type_after_rename = await client.type('z2');
out.zscore_after_rename = Number(await client.zScore('z2', 'a'));
out.ttl_after_rename = (ttl => ttl > 0)(await client.ttl('z2'));

await client.set('s1', 'v');
await client.zAdd('d1', [{ score: 1, value: 'a' }]);
out.rename_overwrite = (await client.rename('s1', 'd1')) === 'OK';
out.type_after_overwrite = await client.type('d1');
out.get_after_overwrite = await client.get('d1');
await capture('zscore_after_overwrite', () => client.zScore('d1', 'a'));

await client.set('s2', 'v');
await client.zAdd('d2', [{ score: 1, value: 'a' }]);
out.renamenx_present = Number(await client.renameNX('s2', 'd2'));
await client.set('s3', 'v');
out.renamenx_moved = Number(await client.renameNX('s3', 'z9'));

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

out['hincrby'] = client.hincrby(k('hi'), 'f', 5)
out['hget_incr'] = client.hget(k('hi'), 'f')

client.rpush(k('li'), 'a', 'b', 'c', 'd')
out['lindex_head'] = client.lindex(k('li'), 0)
out['lindex_negative'] = client.lindex(k('li'), -1)
out['lindex_missing'] = client.lindex(k('li'), 99)

out['sadd'] = client.sadd(k('se'), 'a', 'b', 'a')
out['smembers'] = sorted(client.smembers(k('se')))
out['scard'] = client.scard(k('se'))
out['sismember_yes'] = int(client.sismember(k('se'), 'b'))
out['sismember_no'] = int(client.sismember(k('se'), 'c'))
out['srem'] = client.srem(k('se'), 'a')
out['smembers_after_srem'] = sorted(client.smembers(k('se')))
out['type_set'] = client.type(k('se'))
out['expire_set'] = bool(client.expire(k('se'), 100))
out['ttl_set'] = 0 < client.ttl(k('se')) <= 100

out['zadd'] = client.zadd(k('zs'), {'b': 2, 'a': 1, 'c': 2})
out['zrange'] = client.zrange(k('zs'), 0, -1)
out['zrange_scores'] = [[member, int(score)] for member, score in client.zrange(k('zs'), 0, -1, withscores=True)]
out['zscore'] = int(client.zscore(k('zs'), 'a'))
out['zcard'] = client.zcard(k('zs'))
out['zrem'] = client.zrem(k('zs'), 'b')
out['zrange_after_zrem'] = client.zrange(k('zs'), 0, -1)
out['type_zset'] = client.type(k('zs'))
out['expire_zset'] = bool(client.expire(k('zs'), 100))
out['ttl_zset'] = 0 < client.ttl(k('zs')) <= 100

capture('get_on_set', lambda: client.get(k('se')))
capture('sadd_on_string', lambda: client.sadd(k('s1'), 'x'))
capture('zadd_on_list', lambda: client.zadd(k('l2'), {'x': 1}))

client.set(k('f1'), 'v')
client.hset(k('f2'), 'f', 'v')
client.rpush(k('f3'), 'a')
client.sadd(k('f4'), 'a')
client.zadd(k('f5'), {'a': 1})
out['del_five'] = client.delete(k('f1'), k('f2'), k('f3'), k('f4'), k('f5'))
out['exists_five'] = client.exists(k('f5'))

client.execute_command('SELECT', 5)
client.flushdb()
client.set('a', 'v')
client.hset('b', 'f', 'v')
client.rpush('c', 'a')
client.sadd('d', 'a')
client.zadd('e', {'a': 1})
cursor, keys = client.scan(0, count=2)
out['scan_first'] = [str(cursor), keys]
cursor, keys = client.scan(0, match='c', count=2)
out['scan_match_empty'] = [str(cursor), keys]
cursor, keys = client.scan(2, match='c', count=2)
out['scan_match_hit'] = [str(cursor), keys]
cursor, keys = client.scan(4, count=2)
out['scan_last'] = [str(cursor), keys]
cursor, keys = client.scan(5, count=2)
out['scan_end'] = [str(cursor), keys]

client.execute_command('SELECT', 6)
client.flushdb()
client.zadd('z1', {'a': 1})
client.expire('z1', 100)
out['rename_cross'] = bool(client.rename('z1', 'z2'))
out['type_after_rename'] = client.type('z2')
out['zscore_after_rename'] = int(client.zscore('z2', 'a'))
out['ttl_after_rename'] = client.ttl('z2') > 0

client.set('s1', 'v')
client.zadd('d1', {'a': 1})
out['rename_overwrite'] = bool(client.rename('s1', 'd1'))
out['type_after_overwrite'] = client.type('d1')
out['get_after_overwrite'] = client.get('d1')
capture('zscore_after_overwrite', lambda: client.zscore('d1', 'a'))

client.set('s2', 'v')
client.zadd('d2', {'a': 1})
out['renamenx_present'] = int(client.renamenx('s2', 'd2'))
client.set('s3', 'v')
out['renamenx_moved'] = int(client.renamenx('s3', 'z9'))

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
