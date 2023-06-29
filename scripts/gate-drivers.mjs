//! Drives the emulated server with the real `node-redis` and `redis-py` clients.
//!
//! Both drivers run the same scenario against the installed package and report
//! the values their own client read back. Any mismatch, or a client that cannot
//! decode a reply, fails the gate.

import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
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
    getrange_full: 'This is a string',
    getrange_negative: 'ing',
    getrange_clip: 'string',
    getrange_before_start: 'Thi',
    getrange_missing: '',
    getrange_integer_error: { error: 'value is not an integer or out of range' },
    setrange_zero_fill: 5,
    get_zero_fill: '\u0000\u0000\u0000xy',
    setrange_overwrite: 3,
    get_overwrite: 'aZc',
    setrange_empty_missing: 0,
    exists_empty_missing: 0,
    setrange_empty_present: 4,
    get_after_empty_present: 'abcd',
    setrange_negative: { error: 'offset is out of range' },
    setrange_integer_error: { error: 'value is not an integer or out of range' },
    exists_after_setrange_error: 0,
    setrange_ttl_reply: 3,
    ttl_after_setrange: true,
    get_after_setrange_ttl: 'aZc',
    incrbyfloat_missing: 0.5,
    get_incrbyfloat_missing: '0.5',
    incrbyfloat_integer: 11,
    get_incrbyfloat_integer: '11',
    incrbyfloat_fraction: 1.75,
    get_incrbyfloat_fraction: '1.75',
    incrbyfloat_nan: { error: 'value is not a valid float' },
    exists_after_nan: 0,
    incrbyfloat_positive_inf: { error: 'increment would produce NaN or Infinity' },
    incrbyfloat_negative_inf: { error: 'increment would produce NaN or Infinity' },
    incrbyfloat_invalid_value: { error: 'value is not a valid float' },
    get_after_invalid_value: 'abc',
    incrbyfloat_ttl_reply: 2,
    ttl_after_incrbyfloat: true,
    get_after_incrbyfloat_ttl: '2',
    setbit_create: 0,
    getbit_created: 1,
    getbit_before: 0,
    bitcount_created: 1,
    type_setbit: 'string',
    exists_setbit: 1,
    setbit_previous: 1,
    get_after_setbit_previous: 'a',
    setbit_clear: 0,
    get_after_setbit_clear: 'a',
    setbit_bad_bit: { error: 'bit is not an integer or out of range' },
    setbit_negative_offset: { error: 'bit offset is not an integer or out of range' },
    exists_after_setbit_error: 0,
    getbit_present_one: 1,
    getbit_present_zero: 0,
    getbit_past_end: 0,
    getbit_missing: 0,
    bitcount_all: 26,
    bitcount_byte_range: 4,
    bitcount_negative_range: 10,
    bitcount_bit_range: 17,
    bitcount_bad_unit: { error: 'syntax error' },
    bitcount_missing: 0,
    bitpos_missing_zero: 0,
    bitpos_missing_one: -1,
    bitpos_first_zero: 0,
    bitpos_first_one: 1,
    bitpos_range: 9,
    bitpos_range_exhausted: -1,
    bitpos_padding: 8,
    bitpos_negative_empty_range: -1,
    bitpos_negative_index: 15,
    bitpos_bad_bit: { error: 'The bit argument must be 1 or 0' },
    append_ttl_reply: 6,
    get_after_append: 'abcdef',
    ttl_after_append: true,
    append_missing: 1,
    exists_append_missing: 1,
    strlen_ttl: 6,
    strlen_missing: 0,
    exists_after_setrange: 1,
    type_after_setrange: 'string',
    del_after_setrange: 1,
    exists_after_del: 0,
    getrange_wrongtype: { error: WRONG_TYPE },
    setrange_wrongtype: { error: WRONG_TYPE },
    incrbyfloat_wrongtype: { error: WRONG_TYPE },
    setbit_wrongtype: { error: WRONG_TYPE },
    getbit_wrongtype: { error: WRONG_TYPE },
    bitcount_wrongtype: { error: WRONG_TYPE },
    bitpos_wrongtype: { error: WRONG_TYPE },
    append_wrongtype: { error: WRONG_TYPE },
    strlen_wrongtype: { error: WRONG_TYPE },
    type_wrongtype: 'hash',
    s_inter: ['b', 'c'],
    s_inter_missing: [],
    s_inter_wrongtype: { error: WRONG_TYPE },
    s_intercard: 2,
    s_intercard_limit: 1,
    s_intercard_zero: { error: 'numkeys should be greater than 0' },
    s_intercard_bad_keys: { error: "Number of keys can't be greater than number of args" },
    s_intercard_bad_limit: { error: "LIMIT can't be negative" },
    s_union: ['a', 'b', 'c', 'd'],
    s_diff: ['a'],
    s_interstore: 2,
    s_interstore_members: ['b', 'c'],
    s_interstore_ttl: true,
    s_sunionstore: 4,
    s_sunionstore_members: ['a', 'b', 'c', 'd'],
    s_sdiffstore: 1,
    s_sdiffstore_members: ['a'],
    s_store_type: 'set',
    s_move: 1,
    s_move_src: ['a'],
    s_move_dst_has: 1,
    s_move_missing: 0,
    s_move_wrongtype: { error: WRONG_TYPE },
    s_rand_single: 'a',
    s_rand_missing: null,
    s_rand_count: ['a'],
    s_rand_negative: ['a', 'a', 'a'],
    s_rand_wrongtype: { error: WRONG_TYPE },
    s_scan: ['2', ['a', 'b']],
    s_scan_match: ['2', ['a']],
    s_scan_missing: ['0', []],
    s_scan_wrongtype: { error: WRONG_TYPE },
    zrb_score_all: ['a', 'b', 'c', 'd'],
    zrb_score_exclusive: ['b', 'c', 'd'],
    zrb_score_withscores: ['a', '1', 'b', '2'],
    zrb_score_limit: ['b', 'c'],
    zrb_score_limit_open: ['c', 'd'],
    zrb_score_missing: [],
    zrb_score_bad_bound: { error: 'min or max is not a float' },
    zrb_score_bad_limit: { error: 'value is not an integer or out of range' },
    zrb_score_bad_option: { error: 'syntax error' },
    zrb_score_wrongtype: { error: WRONG_TYPE },
    zrev_score_all: ['d', 'c', 'b', 'a'],
    zrev_score_bounds: ['c', 'b'],
    zrev_score_limit_scores: ['d', '4', 'c', '3'],
    zrb_lex_all: ['a', 'b', 'c', 'd'],
    zrb_lex_open: ['b', 'c'],
    zrb_lex_bad_bound: { error: 'min or max not valid string range item' },
    zrb_lex_withscores: { error: 'syntax error' },
    zrev_lex_all: ['d', 'c', 'b', 'a'],
    zrev_lex_bounds: ['c', 'b', 'a'],
    zrev_lex_limit: ['c', 'b'],
    zrem_rank: 2,
    zrem_rank_rest: ['c', 'd', 'e'],
    zrem_rank_negative: 1,
    zrem_rank_rest2: ['c', 'd'],
    zrem_score: 1,
    zrem_score_rest: ['c'],
    zrem_score_all: 1,
    zrem_score_exists: 0,
    zrem_rank_missing: 0,
    zrem_rank_bad_index: { error: 'value is not an integer or out of range' },
    zrem_lex: 2,
    zrem_lex_rest: ['a', 'd'],
    zrem_lex_bad_bound: { error: 'min or max not valid string range item' },
    zrand_single: 'm',
    zrand_missing: null,
    zrand_count: ['m'],
    zrand_negative: ['m', 'm'],
    zrand_scores: ['m', '1'],
    zrand_wrongtype: { error: WRONG_TYPE },
    zscan_pairs: ['2', ['a', '1', 'b', '2']],
    zscan_match: ['0', ['b', '2']],
    zscan_missing: ['0', []],
    zscan_bad_cursor: { error: 'invalid cursor' },
    zscan_wrongtype: { error: WRONG_TYPE },
    h_setnx_new: 1,
    h_get_new: '4',
    h_setnx_existing: 0,
    h_get_existing: '1',
    h_keys: ['a', 'b', 'c'],
    h_vals: ['1', '2', '3'],
    h_exists_yes: 1,
    h_exists_no: 0,
    h_incrfloat_new: '1.5',
    h_incrfloat_second: '1.75',
    h_rand_single: 'f',
    h_rand_count: ['f'],
    h_rand_values: ['f', 'v'],
    h_scan: ['2', ['a', '1', 'b', '2']],
    h_scan_match: ['0', ['b', '2']],
    h_type: 'hash',
    h_setnx_wrongtype: { error: WRONG_TYPE },
    h_incrfloat_bad: { error: 'value is not a valid float' },
    h_scan_wrongtype: { error: WRONG_TYPE },
    list_insert_before: 4,
    list_insert_before_values: ['a', 'x', 'b', 'c'],
    list_insert_after: 4,
    list_insert_after_values: ['a', 'b', 'x', 'c'],
    list_insert_missing_pivot: -1,
    list_insert_missing_key: 0,
    list_insert_bad_direction: { error: 'syntax error' },
    list_insert_wrongtype: { error: WRONG_TYPE },
    list_mpop_left: [1, ['a', 'b']],
    list_mpop_left_rest: ['c'],
    list_mpop_none: null,
    list_mpop_zero: { error: 'numkeys should be greater than 0' },
    list_mpop_bad_side: { error: 'syntax error' },
    list_mpop_zero_count: { error: 'count should be greater than 0' },
    list_mpop_wrongtype: { error: WRONG_TYPE },
    list_range_full: ['a', 'b', 'c'],
    list_range_tail: ['b', 'c'],
    list_range_clip: ['c'],
    list_range_past: [],
    list_range_negative_stop: [],
    list_range_wrongtype: { error: WRONG_TYPE },
    k_dbsize_empty: 0,
    k_random_empty: true,
    k_random_single: true,
    k_dbsize_one: 1,
    k_random_arity: { error: "wrong number of arguments for 'randomkey' command" },
    k_copy: 1,
    k_copy_value: 'value',
    k_copy_again: 0,
    k_copy_replace: 1,
    k_copy_replace_value: 'value',
    k_copy_replace_ttl: -1,
    k_copy_same: { error: 'source and destination objects are the same' },
    k_copy_db_range: { error: 'DB index is out of range' },
    k_copy_bogus: { error: 'syntax error' },
    k_copy_arity: { error: "wrong number of arguments for 'copy' command" },
    k_copy_missing: 0,
    k_copy_missing_value: null,
    k_copy_ttl: 1,
    k_ttl_copy: true,
    k_copy_cross: 1,
    k_cross_value: 'value',
    k_copy_set: 1,
    k_copy_set_members: ['a'],
    k_copy_set_ttl: true,
    k_copy_zset: 1,
    k_copy_zset_score: 1,
    k_pexpiretime_missing: -2,
    k_expiretime_missing: -2,
    k_pexpiretime_nottl: -1,
    k_expiretime_nottl: -1,
    k_expiretime_floor: true,
    k_expiretime_positive: true,
    k_persist: 1,
    k_ttl_after_persist: -1,
    k_persist_again: 0,
    k_flushdb: true,
    k_dbsize_after_flush: 0,
    k_flushdb_bogus: { error: 'syntax error' },
    k_flushall: true,
    k_size_d12: 0,
    k_size_d13: 0,
    k_flushall_bogus: { error: 'syntax error' },
    za_union: 4,
    za_union_members: ['a', 'b', 'd', 'c'],
    za_union_scores: ['a', '1', 'b', '5', 'd', '5', 'c', '7'],
    za_union_weight_scores: ['a', '2', 'd', '5', 'b', '7', 'c', '10'],
    za_union_max_scores: ['a', '1', 'b', '3', 'c', '4', 'd', '5'],
    za_inter: 2,
    za_inter_scores: ['b', '5', 'c', '7'],
    za_inter_min_scores: ['b', '3', 'c', '4'],
    za_inter_missing: 0,
    za_inter_dest_exists: 0,
    za_diff: ['a'],
    za_diff_scores: ['a', '1'],
    za_diff_missing: ['a', 'b', 'c'],
    za_diffstore: 2,
    za_diffstore_scores: ['a', '1', 'b', '2'],
    za_intercard: 2,
    za_intercard_limit: 1,
    za_intercard_zero_limit: 2,
    za_intercard_missing: 0,
    za_union_dest_ttl: -1,
    za_union_wrongtype: { error: WRONG_TYPE },
    za_intercard_wrongtype: { error: WRONG_TYPE },
    za_union_numkeys_zero: { error: 'at least 1 input key is needed for ZUNIONSTORE/ZINTERSTORE' },
    za_union_numkeys_overflow: { error: 'syntax error' },
    za_union_bad_weight: { error: 'weight value is not a float' },
    za_union_bad_aggregate: { error: 'syntax error' },
    za_intercard_limit_negative: { error: "LIMIT can't be negative" },
    sort_numeric: ['1', '2', '3', '10'],
    sort_desc: ['10', '3', '2', '1'],
    sort_limit: ['2', '3'],
    sort_alpha: ['apple', 'banana', 'cherry'],
    sort_by_pattern: ['b', 'c', 'a'],
    sort_by_hash: ['c', 'a', 'b'],
    sort_get_missing: [null, null, 'va'],
    sort_zset_nosort: ['2', '3', '1'],
    sort_store_reply: 4,
    sort_store_values: ['1', '2', '3', '10'],
    sort_store_ttl: -1,
    sort_ro: ['1', '2', '3', '10'],
    sort_wrongtype: { error: WRONG_TYPE },
    sort_bad_number: { error: "One or more scores can't be converted into double" },
    sort_ro_store: { error: 'SORT_RO does not support the STORE option' },
    sort_bad_option: { error: 'syntax error' },
    bf_set_get: [0, 255],
    bf_get_missing: [0],
    bf_missing_exists: 0,
    bf_wrap_u8: [44],
    bf_sat_u8: [255],
    bf_fail_u8: [null],
    bf_fail_kept: [200],
    bf_i8_wrap: [127],
    bf_u1_wrap: [0, 0],
    bf_i64_get: -1,
    bf_hash_offset: [0, 7],
    bf_ro_get: [200],
    bf_multi_get: [200, 0],
    bf_incr_keep: [98],
    bf_ttl: 100,
    bf_wrongtype: { error: WRONG_TYPE },
    bf_ro_set: { error: 'BITFIELD_RO only supports the GET subcommand' },
    bf_u64: { error: 'Invalid bitfield type. Use something like i16 u8. Note that u64 is not supported but i64 is.' },
    bf_negative_offset: { error: 'bit offset is not an integer or out of range' },
    bf_bad_value: { error: 'value is not an integer or out of range' },
    bf_bad_overflow: { error: 'Invalid OVERFLOW type specified' },
    bf_syntax: { error: 'syntax error' },
    bf_arity: { error: "wrong number of arguments for 'bitfield' command" },
    lp_default: 0,
    lp_missing_element: null,
    lp_rank2: 3,
    lp_rank_neg: 3,
    lp_count_all: [0, 3],
    lp_count_reverse: [3, 0],
    lp_maxlen_miss: null,
    lp_missing_key: null,
    lp_missing_count: [],
    lp_rank_zero: { error: "RANK can't be zero: use 1 to start from the first match, 2 from the second ... or use negative to start from the end of the list" },
    lp_count_negative: { error: "COUNT can't be negative" },
    lp_maxlen_negative: { error: "MAXLEN can't be negative" },
    lp_syntax: { error: 'syntax error' },
    lp_arity: { error: "wrong number of arguments for 'lpos' command" },
    lp_wrongtype: { error: WRONG_TYPE },
    pf_add: 1,
    pf_count: 3,
    pf_add_duplicate: 0,
    pf_add_empty: 1,
    pf_count_empty: 4,
    pf_add_second: 1,
    pf_count_multi: 7,
    pf_count_duplicate: 4,
    pf_merge: true,
    pf_count_merged: 7,
    pf_count_missing: 0,
    pf_merge_missing: true,
    pf_count_empty_merge: 0,
    pf_type: 'string',
    pf_strlen: 12304,
    pf_many: 1,
    pf_many_count: 996,
    pf_ttl_add: 1,
    pf_ttl_kept: true,
    pf_merge_ttl: true,
    pf_merge_ttl_kept: true,
    pf_invalid_string: { error: 'WRONGTYPE Key is not a valid HyperLogLog string value.' },
    pf_hash_wrongtype: { error: WRONG_TYPE },
    pf_add_arity: { error: "wrong number of arguments for 'pfadd' command" },
    pf_count_arity: { error: "wrong number of arguments for 'pfcount' command" },
    pf_merge_arity: { error: "wrong number of arguments for 'pfmerge' command" },
    ks_keys_all: ['ks:order:1', 'ks:order:2', 'ks:order:3', 'ks:user:1', 'ks:user:2', 'ks:user:3'],
    ks_keys_prefix: ['ks:user:1', 'ks:user:2', 'ks:user:3'],
    ks_keys_question: ['ks:user:1', 'ks:user:2', 'ks:user:3'],
    ks_keys_class: ['ks:user:1', 'ks:user:2'],
    ks_keys_class_negated: ['ks:user:2', 'ks:user:3'],
    ks_keys_class_range: ['ks:order:1', 'ks:order:2'],
    ks_keys_exact: ['ks:user:1'],
    ks_keys_no_match: [],
    ks_type_string: 'string',
    ks_type_hash: 'hash',
    ks_type_list: 'list',
    ks_type_set: 'set',
    ks_type_zset: 'zset',
    ks_type_hll: 'string',
    ks_type_missing: 'none',
    ks_type_ttl_kept: true,
    ks_keys_ttl_kept: true,
    ks_scan_first: ['3', ['ks:order:1', 'ks:order:2', 'ks:order:3']],
    ks_scan_second: ['0', ['ks:user:1', 'ks:user:2', 'ks:user:3']],
    ks_scan_match: ['0', ['ks:user:1', 'ks:user:2', 'ks:user:3']],
    ks_scan_match_class: ['0', ['ks:user:1', 'ks:user:2']],
    ks_scan_match_class_negated: ['0', ['ks:order:3']],
    ks_keys_escape: ['ks:star-*'],
    ks_keys_unclosed_class: [],
    ks_scan_count_zero: { error: 'syntax error' },
    ks_scan_invalid_cursor: { error: 'invalid cursor' },
    ks_keys_arity: { error: "wrong number of arguments for 'keys' command" },
    ks_keys_extra: { error: "wrong number of arguments for 'keys' command" },
    ks_type_arity: { error: "wrong number of arguments for 'type' command" },
    ks_type_extra: { error: "wrong number of arguments for 'type' command" },
    ks_scan_arity: { error: "wrong number of arguments for 'scan' command" },
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
const captureError = async (name, action) => {
    try {
        out[name] = await action();
    }
    catch (error) {
        out[name] = { error: error.message.replace(/^ERR /, '') };
    }
};

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

await client.select(8);
await client.flushDb();

await client.set(k('gr'), 'This is a string');
out.getrange_full = await client.getRange(k('gr'), 0, -1);
out.getrange_negative = await client.getRange(k('gr'), -3, -1);
out.getrange_clip = await client.getRange(k('gr'), 10, 100);
out.getrange_before_start = await client.getRange(k('gr'), -100, 2);
out.getrange_missing = await client.getRange(k('gr2'), 0, -1);
await captureError('getrange_integer_error', () => client.getRange(k('gr'), 0, '1.5'));

out.setrange_zero_fill = await client.setRange(k('sr'), 3, 'xy');
out.get_zero_fill = await client.get(k('sr'));
await client.set(k('sr2'), 'abc');
out.setrange_overwrite = await client.setRange(k('sr2'), 1, 'Z');
out.get_overwrite = await client.get(k('sr2'));
out.setrange_empty_missing = await client.setRange(k('sr3'), 5, '');
out.exists_empty_missing = await client.exists(k('sr3'));
await client.set(k('sr4'), 'abcd');
out.setrange_empty_present = await client.setRange(k('sr4'), 10, '');
out.get_after_empty_present = await client.get(k('sr4'));
await captureError('setrange_negative', () => client.setRange(k('sr5'), -1, 'x'));
await captureError('setrange_integer_error', () => client.setRange(k('sr5'), '1.5', 'x'));
out.exists_after_setrange_error = await client.exists(k('sr5'));
await client.set(k('sr6'), 'abc');
await client.expire(k('sr6'), 100);
out.setrange_ttl_reply = await client.setRange(k('sr6'), 1, 'Z');
out.ttl_after_setrange = (ttl => ttl > 0 && ttl <= 100)(await client.ttl(k('sr6')));
out.get_after_setrange_ttl = await client.get(k('sr6'));

out.incrbyfloat_missing = Number(await client.incrByFloat(k('if1'), 0.5));
out.get_incrbyfloat_missing = await client.get(k('if1'));
await client.set(k('if2'), '10.5');
out.incrbyfloat_integer = Number(await client.incrByFloat(k('if2'), 0.5));
out.get_incrbyfloat_integer = await client.get(k('if2'));
await client.set(k('if3'), '1.5');
out.incrbyfloat_fraction = Number(await client.incrByFloat(k('if3'), 0.25));
out.get_incrbyfloat_fraction = await client.get(k('if3'));
await captureError('incrbyfloat_nan', () => client.incrByFloat(k('if4'), 'nan'));
out.exists_after_nan = await client.exists(k('if4'));
await captureError('incrbyfloat_positive_inf', () => client.incrByFloat(k('if4'), '+inf'));
await captureError('incrbyfloat_negative_inf', () => client.incrByFloat(k('if4'), '-inf'));
await client.set(k('if5'), 'abc');
await captureError('incrbyfloat_invalid_value', () => client.incrByFloat(k('if5'), 1));
out.get_after_invalid_value = await client.get(k('if5'));
await client.set(k('if6'), '1');
await client.expire(k('if6'), 100);
out.incrbyfloat_ttl_reply = Number(await client.incrByFloat(k('if6'), 1));
out.ttl_after_incrbyfloat = (ttl => ttl > 0 && ttl <= 100)(await client.ttl(k('if6')));
out.get_after_incrbyfloat_ttl = await client.get(k('if6'));

out.setbit_create = await client.setBit(k('sb1'), 7, 1);
out.getbit_created = Number(await client.getBit(k('sb1'), 7));
out.getbit_before = Number(await client.getBit(k('sb1'), 6));
out.bitcount_created = await client.sendCommand(['BITCOUNT', k('sb1')]);
out.type_setbit = await client.type(k('sb1'));
out.exists_setbit = await client.exists(k('sb1'));
await client.set(k('sb2'), 'a');
out.setbit_previous = await client.setBit(k('sb2'), 1, 1);
out.get_after_setbit_previous = await client.get(k('sb2'));
out.setbit_clear = await client.setBit(k('sb2'), 0, 0);
out.get_after_setbit_clear = await client.get(k('sb2'));
await captureError('setbit_bad_bit', () => client.setBit(k('sb3'), 1, 2));
await captureError('setbit_negative_offset', () => client.setBit(k('sb3'), -1, 1));
out.exists_after_setbit_error = await client.exists(k('sb3'));
await client.set(k('sb4'), 'a');
out.getbit_present_one = Number(await client.getBit(k('sb4'), 1));
out.getbit_present_zero = Number(await client.getBit(k('sb4'), 0));
out.getbit_past_end = Number(await client.getBit(k('sb4'), 100));
out.getbit_missing = Number(await client.getBit(k('sb5'), 0));

await client.set(k('bc'), 'foobar');
out.bitcount_all = await client.sendCommand(['BITCOUNT', k('bc')]);
out.bitcount_byte_range = await client.sendCommand(['BITCOUNT', k('bc'), '0', '0']);
out.bitcount_negative_range = await client.sendCommand(['BITCOUNT', k('bc'), '0', '-5']);
out.bitcount_bit_range = await client.sendCommand(['BITCOUNT', k('bc'), '5', '30', 'BIT']);
await captureError('bitcount_bad_unit', () => client.sendCommand(['BITCOUNT', k('bc'), '0', '1', 'WORD']));
out.bitcount_missing = await client.sendCommand(['BITCOUNT', k('bc2')]);

out.bitpos_missing_zero = await client.sendCommand(['BITPOS', k('bp0'), '0']);
out.bitpos_missing_one = await client.sendCommand(['BITPOS', k('bp1'), '1']);
await client.set(k('bp'), 'abc');
out.bitpos_first_zero = await client.sendCommand(['BITPOS', k('bp'), '0']);
out.bitpos_first_one = await client.sendCommand(['BITPOS', k('bp'), '1']);
out.bitpos_range = await client.sendCommand(['BITPOS', k('bp'), '1', '1', '1']);
await client.set(k('bpx'), Buffer.from('ff', 'hex'));
out.bitpos_range_exhausted = await client.sendCommand(['BITPOS', k('bpx'), '0', '0', '0']);
out.bitpos_padding = await client.sendCommand(['BITPOS', k('bpx'), '0', '0']);
out.bitpos_negative_empty_range = await client.sendCommand(['BITPOS', k('bpx'), '0', '-1', '-2']);
await client.set(k('bpn'), Buffer.from('0001', 'hex'));
out.bitpos_negative_index = await client.sendCommand(['BITPOS', k('bpn'), '1', '-1']);
await captureError('bitpos_bad_bit', () => client.sendCommand(['BITPOS', k('bp2'), '2']));

await client.set(k('ap1'), 'abc');
await client.expire(k('ap1'), 100);
out.append_ttl_reply = await client.append(k('ap1'), 'def');
out.get_after_append = await client.get(k('ap1'));
out.ttl_after_append = (ttl => ttl > 0 && ttl <= 100)(await client.ttl(k('ap1')));
out.append_missing = await client.append(k('ap2'), 'x');
out.exists_append_missing = await client.exists(k('ap2'));
out.strlen_ttl = await client.strLen(k('ap1'));
out.strlen_missing = await client.strLen(k('ap3'));

await client.setRange(k('dl'), 2, 'ab');
out.exists_after_setrange = await client.exists(k('dl'));
out.type_after_setrange = await client.type(k('dl'));
out.del_after_setrange = await client.del(k('dl'));
out.exists_after_del = await client.exists(k('dl'));

await client.hSet(k('wt'), 'f', 'v');
await capture('getrange_wrongtype', () => client.getRange(k('wt'), 0, -1));
await capture('setrange_wrongtype', () => client.setRange(k('wt'), 0, 'x'));
await capture('incrbyfloat_wrongtype', () => client.incrByFloat(k('wt'), 1));
await capture('setbit_wrongtype', () => client.setBit(k('wt'), 0, 1));
await capture('getbit_wrongtype', () => client.getBit(k('wt'), 0));
await capture('bitcount_wrongtype', () => client.sendCommand(['BITCOUNT', k('wt')]));
await capture('bitpos_wrongtype', () => client.sendCommand(['BITPOS', k('wt'), '0']));
await capture('append_wrongtype', () => client.append(k('wt'), 'x'));
await capture('strlen_wrongtype', () => client.strLen(k('wt')));
out.type_wrongtype = await client.type(k('wt'));

await client.select(9);
await client.flushDb();
await client.sAdd(k('sa'), ['a', 'b', 'c']);
await client.sAdd(k('sb'), ['b', 'c', 'd']);
out.s_inter = await client.sInter([k('sa'), k('sb')]);
out.s_inter_missing = await client.sInter([k('sa'), k('sc')]);
await client.set(k('swt'), 'v');
await capture('s_inter_wrongtype', () => client.sInter([k('sa'), k('swt')]));
out.s_intercard = await client.sendCommand(['SINTERCARD', '2', k('sa'), k('sb')]);
out.s_intercard_limit = await client.sendCommand(['SINTERCARD', '2', k('sa'), k('sb'), 'LIMIT', '1']);
await captureError('s_intercard_zero', () => client.sendCommand(['SINTERCARD', '0', k('sa')]));
await captureError('s_intercard_bad_keys', () => client.sendCommand(['SINTERCARD', '3', k('sa'), k('sb')]));
await captureError('s_intercard_bad_limit', () => client.sendCommand(['SINTERCARD', '1', k('sa'), 'LIMIT', '-1']));
out.s_union = await client.sUnion([k('sa'), k('sb')]);
out.s_diff = await client.sDiff([k('sa'), k('sb')]);
await client.sAdd(k('sd'), ['x']);
await client.expire(k('sd'), 100);
out.s_interstore = await client.sInterStore(k('sd'), [k('sa'), k('sb')]);
out.s_interstore_members = (await client.sMembers(k('sd'))).sort();
out.s_interstore_ttl = (await client.ttl(k('sd')) === -1);
out.s_sunionstore = await client.sUnionStore(k('su'), [k('sa'), k('sb')]);
out.s_sunionstore_members = (await client.sMembers(k('su'))).sort();
out.s_sdiffstore = await client.sDiffStore(k('sf'), [k('sa'), k('sb')]);
out.s_sdiffstore_members = (await client.sMembers(k('sf'))).sort();
out.s_store_type = await client.type(k('sd'));

await client.sAdd(k('ms'), ['a', 'b']);
await client.sAdd(k('md'), ['c']);
out.s_move = Number(await client.sMove(k('ms'), k('md'), 'b'));
out.s_move_src = await client.sMembers(k('ms'));
out.s_move_dst_has = Number(await client.sIsMember(k('md'), 'b'));
out.s_move_missing = Number(await client.sMove(k('me'), k('md'), 'x'));
await client.set(k('smt'), 'v');
await capture('s_move_wrongtype', () => client.sMove(k('ms'), k('smt'), 'a'));

await client.sAdd(k('sra'), ['a']);
out.s_rand_single = await client.sRandMember(k('sra'));
out.s_rand_missing = await client.sRandMember(k('srn'));
out.s_rand_count = await client.sendCommand(['SRANDMEMBER', k('sra'), '2']);
out.s_rand_negative = await client.sendCommand(['SRANDMEMBER', k('sra'), '-3']);
await client.set(k('srw'), 'v');
await capture('s_rand_wrongtype', () => client.sRandMember(k('srw'), 1));

await client.sAdd(k('sc1'), ['a', 'b', 'c']);
const sscan = await client.sScan(k('sc1'), 0, { COUNT: 2 });
out.s_scan = [String(sscan.cursor), sscan.members];
const sscanMatch = await client.sScan(k('sc1'), 0, { MATCH: 'a*', COUNT: 2 });
out.s_scan_match = [String(sscanMatch.cursor), sscanMatch.members];
const sscanMissing = await client.sScan(k('sc9'), 0);
out.s_scan_missing = [String(sscanMissing.cursor), sscanMissing.members];
await capture('s_scan_wrongtype', () => client.sScan(k('smt'), 0));

await client.select(10);
await client.flushDb();
await client.zAdd(k('za'), [{ score: 1, value: 'a' }, { score: 2, value: 'b' }, { score: 3, value: 'c' }, { score: 4, value: 'd' }]);
out.zrb_score_all = await client.sendCommand(['ZRANGEBYSCORE', k('za'), '-inf', '+inf']);
out.zrb_score_exclusive = await client.sendCommand(['ZRANGEBYSCORE', k('za'), '(1', '+inf']);
out.zrb_score_withscores = await client.sendCommand(['ZRANGEBYSCORE', k('za'), '-inf', '(3', 'WITHSCORES']);
out.zrb_score_limit = await client.sendCommand(['ZRANGEBYSCORE', k('za'), '-inf', '+inf', 'LIMIT', '1', '2']);
out.zrb_score_limit_open = await client.sendCommand(['ZRANGEBYSCORE', k('za'), '-inf', '+inf', 'LIMIT', '2', '-1']);
out.zrb_score_missing = await client.sendCommand(['ZRANGEBYSCORE', k('z9'), '-inf', '+inf']);
await captureError('zrb_score_bad_bound', () => client.sendCommand(['ZRANGEBYSCORE', k('za'), 'bad', '+inf']));
await captureError('zrb_score_bad_limit', () => client.sendCommand(['ZRANGEBYSCORE', k('za'), '-inf', '+inf', 'LIMIT', 'x', '1']));
await captureError('zrb_score_bad_option', () => client.sendCommand(['ZRANGEBYSCORE', k('za'), '-inf', '+inf', 'BOGUS']));
out.zrev_score_all = await client.sendCommand(['ZREVRANGEBYSCORE', k('za'), '+inf', '-inf']);
out.zrev_score_bounds = await client.sendCommand(['ZREVRANGEBYSCORE', k('za'), '3', '(1']);
out.zrev_score_limit_scores = await client.sendCommand(['ZREVRANGEBYSCORE', k('za'), '+inf', '-inf', 'LIMIT', '0', '2', 'WITHSCORES']);
await client.set(k('zw'), 'v');
await capture('zrb_score_wrongtype', () => client.sendCommand(['ZRANGEBYSCORE', k('zw'), '-inf', '+inf']));

await client.zAdd(k('zl'), [{ score: 0, value: 'a' }, { score: 0, value: 'b' }, { score: 0, value: 'c' }, { score: 0, value: 'd' }]);
out.zrb_lex_all = await client.sendCommand(['ZRANGEBYLEX', k('zl'), '-', '+']);
out.zrb_lex_open = await client.sendCommand(['ZRANGEBYLEX', k('zl'), '[b', '(d']);
await captureError('zrb_lex_bad_bound', () => client.sendCommand(['ZRANGEBYLEX', k('zl'), 'a', '+']));
await captureError('zrb_lex_withscores', () => client.sendCommand(['ZRANGEBYLEX', k('zl'), '-', '+', 'WITHSCORES']));
out.zrev_lex_all = await client.sendCommand(['ZREVRANGEBYLEX', k('zl'), '+', '-']);
out.zrev_lex_bounds = await client.sendCommand(['ZREVRANGEBYLEX', k('zl'), '(d', '[a']);
out.zrev_lex_limit = await client.sendCommand(['ZREVRANGEBYLEX', k('zl'), '+', '-', 'LIMIT', '1', '2']);

await client.zAdd(k('zr'), [{ score: 1, value: 'a' }, { score: 2, value: 'b' }, { score: 3, value: 'c' }, { score: 4, value: 'd' }, { score: 5, value: 'e' }]);
out.zrem_rank = Number(await client.sendCommand(['ZREMRANGEBYRANK', k('zr'), '0', '1']));
out.zrem_rank_rest = await client.sendCommand(['ZRANGE', k('zr'), '0', '-1']);
out.zrem_rank_negative = Number(await client.sendCommand(['ZREMRANGEBYRANK', k('zr'), '-1', '-1']));
out.zrem_rank_rest2 = await client.sendCommand(['ZRANGE', k('zr'), '0', '-1']);
out.zrem_score = Number(await client.sendCommand(['ZREMRANGEBYSCORE', k('zr'), '(3', '4']));
out.zrem_score_rest = await client.sendCommand(['ZRANGE', k('zr'), '0', '-1']);
out.zrem_score_all = Number(await client.sendCommand(['ZREMRANGEBYSCORE', k('zr'), '-inf', '+inf']));
out.zrem_score_exists = await client.exists(k('zr'));
out.zrem_rank_missing = Number(await client.sendCommand(['ZREMRANGEBYRANK', k('z9'), '0', '-1']));
await captureError('zrem_rank_bad_index', () => client.sendCommand(['ZREMRANGEBYRANK', k('zl'), 'x', '0']));

await client.zAdd(k('zlex'), [{ score: 0, value: 'a' }, { score: 0, value: 'b' }, { score: 0, value: 'c' }, { score: 0, value: 'd' }]);
out.zrem_lex = Number(await client.sendCommand(['ZREMRANGEBYLEX', k('zlex'), '(a', '[c']));
out.zrem_lex_rest = await client.sendCommand(['ZRANGE', k('zlex'), '0', '-1']);
await captureError('zrem_lex_bad_bound', () => client.sendCommand(['ZREMRANGEBYLEX', k('zlex'), 'a', '+']));

await client.zAdd(k('zs'), [{ score: 1, value: 'm' }]);
out.zrand_single = await client.sendCommand(['ZRANDMEMBER', k('zs')]);
out.zrand_missing = await client.sendCommand(['ZRANDMEMBER', k('zm')]);
out.zrand_count = await client.sendCommand(['ZRANDMEMBER', k('zs'), '3']);
out.zrand_negative = await client.sendCommand(['ZRANDMEMBER', k('zs'), '-2']);
out.zrand_scores = await client.sendCommand(['ZRANDMEMBER', k('zs'), '1', 'WITHSCORES']);
await capture('zrand_wrongtype', () => client.sendCommand(['ZRANDMEMBER', k('zw'), '1']));

const zscan = await client.sendCommand(['ZSCAN', k('za'), '0', 'COUNT', '2']);
out.zscan_pairs = [String(zscan[0]), zscan[1]];
out.zscan_match = await client.sendCommand(['ZSCAN', k('za'), '0', 'MATCH', 'b*', 'COUNT', '100']);
out.zscan_missing = await client.sendCommand(['ZSCAN', k('zm'), '0']);
await captureError('zscan_bad_cursor', () => client.sendCommand(['ZSCAN', k('za'), 'not-a-cursor']));
await capture('zscan_wrongtype', () => client.sendCommand(['ZSCAN', k('zw'), '0']));

await client.select(11);
await client.flushDb();
await client.hSet(k('h1'), { a: '1', b: '2', c: '3' });
out.h_keys = await client.hKeys(k('h1'));
out.h_vals = await client.hVals(k('h1'));
out.h_setnx_new = Number(await client.hSetNX(k('h1'), 'd', '4'));
out.h_get_new = await client.hGet(k('h1'), 'd');
out.h_setnx_existing = Number(await client.hSetNX(k('h1'), 'a', '9'));
out.h_get_existing = await client.hGet(k('h1'), 'a');
out.h_exists_yes = Number(await client.hExists(k('h1'), 'a'));
out.h_exists_no = Number(await client.hExists(k('h1'), 'z'));
out.h_incrfloat_new = await client.sendCommand(['HINCRBYFLOAT', k('h1'), 'n', '1.5']);
out.h_incrfloat_second = await client.sendCommand(['HINCRBYFLOAT', k('h1'), 'n', '0.25']);
out.h_type = await client.type(k('h1'));
await client.hSet(k('hf'), 'f', 'v');
out.h_rand_single = await client.sendCommand(['HRANDFIELD', k('hf')]);
out.h_rand_count = await client.sendCommand(['HRANDFIELD', k('hf'), '2']);
out.h_rand_values = await client.sendCommand(['HRANDFIELD', k('hf'), '1', 'WITHVALUES']);
const hscan = await client.sendCommand(['HSCAN', k('h1'), '0', 'COUNT', '2']);
out.h_scan = [String(hscan[0]), hscan[1]];
out.h_scan_match = await client.sendCommand(['HSCAN', k('h1'), '0', 'MATCH', 'b*', 'COUNT', '100']);
await client.set(k('hw'), 'v');
await capture('h_setnx_wrongtype', () => client.hSetNX(k('hw'), 'f', 'v'));
await captureError('h_incrfloat_bad', () => client.sendCommand(['HINCRBYFLOAT', k('h1'), 'n', 'bad']));
await capture('h_scan_wrongtype', () => client.sendCommand(['HSCAN', k('hw'), '0']));

await client.rPush(k('li'), ['a', 'b', 'c']);
await client.rPush(k('lj'), ['a', 'b', 'c']);
out.list_insert_before = Number(await client.sendCommand(['LINSERT', k('li'), 'BEFORE', 'b', 'x']));
out.list_insert_before_values = await client.lRange(k('li'), 0, -1);
out.list_insert_after = Number(await client.sendCommand(['LINSERT', k('lj'), 'AFTER', 'b', 'x']));
out.list_insert_after_values = await client.lRange(k('lj'), 0, -1);
out.list_insert_missing_pivot = Number(await client.sendCommand(['LINSERT', k('li'), 'BEFORE', 'z', 'x']));
out.list_insert_missing_key = Number(await client.sendCommand(['LINSERT', k('ln'), 'BEFORE', 'a', 'x']));
await captureError('list_insert_bad_direction', () => client.sendCommand(['LINSERT', k('li'), 'MIDDLE', 'a', 'x']));
await capture('list_insert_wrongtype', () => client.sendCommand(['LINSERT', k('hw'), 'BEFORE', 'a', 'x']));
await client.rPush(k('lp'), ['a', 'b', 'c']);
const lmpop = await client.sendCommand(['LMPOP', '1', k('lp'), 'LEFT', 'COUNT', '2']);
out.list_mpop_left = [lmpop[0] === k('lp') ? 1 : 0, lmpop[1]];
out.list_mpop_left_rest = await client.lRange(k('lp'), 0, -1);
out.list_mpop_none = await client.sendCommand(['LMPOP', '2', k('ln'), k('lm'), 'LEFT']);
await captureError('list_mpop_zero', () => client.sendCommand(['LMPOP', '0', k('lp'), 'LEFT']));
await captureError('list_mpop_bad_side', () => client.sendCommand(['LMPOP', '1', k('lp'), 'UP']));
await captureError('list_mpop_zero_count', () => client.sendCommand(['LMPOP', '1', k('lp'), 'LEFT', 'COUNT', '0']));
await capture('list_mpop_wrongtype', () => client.sendCommand(['LMPOP', '1', k('hw'), 'LEFT']));
await client.rPush(k('lb'), ['a', 'b', 'c']);
out.list_range_full = await client.lRange(k('lb'), 0, -1);
out.list_range_tail = await client.lRange(k('lb'), -2, -1);
out.list_range_clip = await client.lRange(k('lb'), 2, 100);
out.list_range_past = await client.lRange(k('lb'), 100, 200);
out.list_range_negative_stop = await client.lRange(k('lb'), 0, -100);
await capture('list_range_wrongtype', () => client.lRange(k('hw'), 0, -1));

await client.select(12);
await client.flushDb();
out.k_dbsize_empty = Number(await client.dbSize());
out.k_random_empty = (await client.randomKey()) === null;
await client.set(k('only'), 'v');
out.k_random_single = (await client.randomKey()) === k('only');
out.k_dbsize_one = Number(await client.dbSize());
await captureError('k_random_arity', () => client.sendCommand(['RANDOMKEY', 'extra']));

await client.set(k('src'), 'value');
out.k_copy = Number(await client.sendCommand(['COPY', k('src'), k('dst')]));
out.k_copy_value = await client.get(k('dst'));
out.k_copy_again = Number(await client.sendCommand(['COPY', k('src'), k('dst')]));
await client.set(k('dst'), 'other');
out.k_copy_replace = Number(await client.sendCommand(['COPY', k('src'), k('dst'), 'REPLACE']));
out.k_copy_replace_value = await client.get(k('dst'));
out.k_copy_replace_ttl = Number(await client.ttl(k('dst')));
await captureError('k_copy_same', () => client.sendCommand(['COPY', k('src'), k('src')]));
await captureError('k_copy_db_range', () => client.sendCommand(['COPY', k('src'), k('x'), 'DB', '99']));
await captureError('k_copy_bogus', () => client.sendCommand(['COPY', k('src'), k('x'), 'BOGUS']));
await captureError('k_copy_arity', () => client.sendCommand(['COPY', k('src')]));
out.k_copy_missing = Number(await client.sendCommand(['COPY', k('gone'), k('nowhere')]));
out.k_copy_missing_value = await client.get(k('nowhere'));

await client.sendCommand(['SET', k('ttl'), 'value', 'EX', '100']);
out.k_copy_ttl = Number(await client.sendCommand(['COPY', k('ttl'), k('ttlcopy')]));
out.k_ttl_copy = Number(await client.ttl(k('ttlcopy'))) > 0;
out.k_copy_cross = Number(await client.sendCommand(['COPY', k('src'), k('remote'), 'DB', '13']));
await client.select(13);
out.k_cross_value = await client.get(k('remote'));
await client.select(12);

await client.sAdd(k('st'), ['a']);
await client.expire(k('st'), 100);
out.k_copy_set = Number(await client.sendCommand(['COPY', k('st'), k('stcopy')]));
out.k_copy_set_members = await client.sMembers(k('stcopy'));
out.k_copy_set_ttl = Number(await client.ttl(k('stcopy'))) > 0;
await client.zAdd(k('zt'), [{ score: 1, value: 'm' }]);
out.k_copy_zset = Number(await client.sendCommand(['COPY', k('zt'), k('ztcopy')]));
out.k_copy_zset_score = Number(await client.zScore(k('ztcopy'), 'm'));

await client.sendCommand(['SET', k('et'), 'value', 'EX', '100']);
out.k_pexpiretime_missing = Number(await client.sendCommand(['PEXPIRETIME', k('gone')]));
out.k_expiretime_missing = Number(await client.sendCommand(['EXPIRETIME', k('gone')]));
out.k_pexpiretime_nottl = Number(await client.sendCommand(['PEXPIRETIME', k('src')]));
out.k_expiretime_nottl = Number(await client.sendCommand(['EXPIRETIME', k('src')]));
const pexpiretime = Number(await client.sendCommand(['PEXPIRETIME', k('et')]));
const expiretime = Number(await client.sendCommand(['EXPIRETIME', k('et')]));
out.k_expiretime_floor = pexpiretime > 0 && Math.floor(pexpiretime / 1000) === expiretime;
out.k_expiretime_positive = expiretime > 0;

out.k_persist = Number(await client.persist(k('et')));
out.k_ttl_after_persist = Number(await client.ttl(k('et')));
out.k_persist_again = Number(await client.persist(k('et')));

await client.set(k('fdb'), 'v');
out.k_flushdb = (await client.sendCommand(['FLUSHDB', 'ASYNC'])) === 'OK';
out.k_dbsize_after_flush = Number(await client.dbSize());
await captureError('k_flushdb_bogus', () => client.sendCommand(['FLUSHDB', 'BOGUS']));
await client.select(13);
await client.set(k('other'), 'v');
await client.select(12);
await client.set(k('mine'), 'v');
out.k_flushall = (await client.sendCommand(['FLUSHALL', 'ASYNC'])) === 'OK';
out.k_size_d12 = Number(await client.dbSize());
await client.select(13);
out.k_size_d13 = Number(await client.dbSize());
await client.select(12);
await captureError('k_flushall_bogus', () => client.sendCommand(['FLUSHALL', 'BOGUS']));

await client.select(14);
await client.flushDb();
await client.zAdd(k('zqa'), [{ score: 1, value: 'a' }, { score: 2, value: 'b' }, { score: 3, value: 'c' }]);
await client.zAdd(k('zqb'), [{ score: 3, value: 'b' }, { score: 4, value: 'c' }, { score: 5, value: 'd' }]);
out.za_union = Number(await client.sendCommand(['ZUNIONSTORE', k('zu'), '2', k('zqa'), k('zqb')]));
out.za_union_members = await client.sendCommand(['ZRANGE', k('zu'), '0', '-1']);
out.za_union_scores = await client.sendCommand(['ZRANGE', k('zu'), '0', '-1', 'WITHSCORES']);
out.za_union_weight_scores = await client.sendCommand([
    'ZUNIONSTORE', k('zu2'), '2', k('zqa'), k('zqb'), 'WEIGHTS', '2', '1',
]).then(() => client.sendCommand(['ZRANGE', k('zu2'), '0', '-1', 'WITHSCORES']));
out.za_union_max_scores = await client.sendCommand([
    'ZUNIONSTORE', k('zu3'), '2', k('zqa'), k('zqb'), 'AGGREGATE', 'MAX',
]).then(() => client.sendCommand(['ZRANGE', k('zu3'), '0', '-1', 'WITHSCORES']));
out.za_inter = Number(await client.sendCommand(['ZINTERSTORE', k('zi'), '2', k('zqa'), k('zqb')]));
out.za_inter_scores = await client.sendCommand(['ZRANGE', k('zi'), '0', '-1', 'WITHSCORES']);
out.za_inter_min_scores = await client.sendCommand([
    'ZINTERSTORE', k('zi2'), '2', k('zqa'), k('zqb'), 'WEIGHTS', '3', '1', 'AGGREGATE', 'MIN',
]).then(() => client.sendCommand(['ZRANGE', k('zi2'), '0', '-1', 'WITHSCORES']));
out.za_inter_missing = Number(await client.sendCommand(['ZINTERSTORE', k('zi3'), '2', k('zqa'), k('zqmissing')]));
out.za_inter_dest_exists = Number(await client.exists(k('zi3')));
out.za_diff = await client.sendCommand(['ZDIFF', '2', k('zqa'), k('zqb')]);
out.za_diff_scores = await client.sendCommand(['ZDIFF', '2', k('zqa'), k('zqb'), 'WITHSCORES']);
out.za_diff_missing = await client.sendCommand(['ZDIFF', '2', k('zqa'), k('zqmissing')]);
await client.zAdd(k('zqc'), [{ score: 9, value: 'c' }]);
out.za_diffstore = Number(await client.sendCommand(['ZDIFFSTORE', k('zd'), '2', k('zqa'), k('zqc')]));
out.za_diffstore_scores = await client.sendCommand(['ZRANGE', k('zd'), '0', '-1', 'WITHSCORES']);
out.za_intercard = Number(await client.sendCommand(['ZINTERCARD', '2', k('zqa'), k('zqb')]));
out.za_intercard_limit = Number(await client.sendCommand(['ZINTERCARD', '2', k('zqa'), k('zqb'), 'LIMIT', '1']));
out.za_intercard_zero_limit = Number(await client.sendCommand(['ZINTERCARD', '2', k('zqa'), k('zqb'), 'LIMIT', '0']));
out.za_intercard_missing = Number(await client.sendCommand(['ZINTERCARD', '2', k('zqa'), k('zqmissing')]));
await client.sendCommand(['SET', k('zud'), 'old', 'EX', '100']);
await client.sendCommand(['ZUNIONSTORE', k('zud'), '1', k('zqa')]);
out.za_union_dest_ttl = Number(await client.ttl(k('zud')));
await client.set(k('zstr'), 'v');
await capture('za_union_wrongtype', () => client.sendCommand(['ZUNIONSTORE', k('zx'), '2', k('zqa'), k('zstr')]));
await capture('za_intercard_wrongtype', () => client.sendCommand(['ZINTERCARD', '2', k('zqa'), k('zstr')]));
await captureError('za_union_numkeys_zero', () => client.sendCommand(['ZUNIONSTORE', k('zx'), '0', k('zqa')]));
await captureError('za_union_numkeys_overflow', () => client.sendCommand(['ZUNIONSTORE', k('zx'), '2', k('zqa')]));
await captureError('za_union_bad_weight', () => client.sendCommand([
    'ZUNIONSTORE', k('zx'), '2', k('zqa'), k('zqb'), 'WEIGHTS', '1', 'x',
]));
await captureError('za_union_bad_aggregate', () => client.sendCommand([
    'ZUNIONSTORE', k('zx'), '2', k('zqa'), k('zqb'), 'AGGREGATE', 'AVG',
]));
await captureError('za_intercard_limit_negative', () => client.sendCommand([
    'ZINTERCARD', '2', k('zqa'), k('zqb'), 'LIMIT', '-1',
]));

await client.rPush(k('srtn'), ['3', '1', '2', '10']);
out.sort_numeric = await client.sendCommand(['SORT', k('srtn')]);
out.sort_desc = await client.sendCommand(['SORT', k('srtn'), 'DESC']);
out.sort_limit = await client.sendCommand(['SORT', k('srtn'), 'LIMIT', '1', '2']);
out.sort_ro = await client.sendCommand(['SORT_RO', k('srtn')]);
await client.rPush(k('srtw'), ['banana', 'apple', 'cherry']);
out.sort_alpha = await client.sendCommand(['SORT', k('srtw'), 'ALPHA']);
await client.rPush(k('srti'), ['a', 'b', 'c']);
await client.set(k('srtw_a'), '10');
await client.set(k('srtw_b'), '1');
await client.set(k('srtw_c'), '5');
out.sort_by_pattern = await client.sendCommand(['SORT', k('srti'), 'BY', k('srtw_') + '*']);
await client.set(k('srtd_a'), 'va');
out.sort_get_missing = await client.sendCommand([
    'SORT', k('srti'), 'BY', k('srtw_') + '*', 'GET', k('srtd_') + '*',
]);
await client.hSet(k('srth_a'), 'v', '7');
await client.hSet(k('srth_b'), 'v', '9');
await client.hSet(k('srth_c'), 'v', '1');
out.sort_by_hash = await client.sendCommand(['SORT', k('srti'), 'BY', k('srth_') + '*->v']);
await client.zAdd(k('srtz'), [{ score: 5, value: '3' }, { score: 9, value: '1' }, { score: 1, value: '2' }]);
out.sort_zset_nosort = await client.sendCommand(['SORT', k('srtz'), 'BY', 'nosort']);
await client.sendCommand(['SET', k('srto'), 'old', 'EX', '100']);
out.sort_store_reply = Number(await client.sendCommand(['SORT', k('srtn'), 'STORE', k('srto')]));
out.sort_store_values = await client.lRange(k('srto'), 0, -1);
out.sort_store_ttl = Number(await client.ttl(k('srto')));
await client.set(k('srtp'), 'v');
await capture('sort_wrongtype', () => client.sendCommand(['SORT', k('srtp')]));
await client.rPush(k('srtb'), ['x', '1']);
await captureError('sort_bad_number', () => client.sendCommand(['SORT', k('srtb')]));
await captureError('sort_ro_store', () => client.sendCommand(['SORT_RO', k('srtn'), 'STORE', k('srto')]));
await captureError('sort_bad_option', () => client.sendCommand(['SORT', k('srtn'), 'BOGUS']));

const bitfield = async (...parts) => (await client.sendCommand(['BITFIELD', ...parts]))
    .map(value => (value === null ? null : Number(value)));
const bitfieldRo = async (...parts) => (await client.sendCommand(['BITFIELD_RO', ...parts]))
    .map(value => (value === null ? null : Number(value)));
out.bf_set_get = await bitfield(k('bf1'), 'SET', 'u8', '0', '255', 'GET', 'u8', '0');
out.bf_get_missing = await bitfield(k('bfmissing'), 'GET', 'u8', '0');
out.bf_missing_exists = Number(await client.exists(k('bfmissing')));
await bitfield(k('bf2'), 'SET', 'u8', '0', '200');
out.bf_wrap_u8 = await bitfield(k('bf2'), 'INCRBY', 'u8', '0', '100');
await bitfield(k('bf2'), 'SET', 'u8', '0', '200');
out.bf_sat_u8 = await bitfield(k('bf2'), 'OVERFLOW', 'SAT', 'INCRBY', 'u8', '0', '100');
await bitfield(k('bf2'), 'SET', 'u8', '0', '200');
out.bf_fail_u8 = await bitfield(k('bf2'), 'OVERFLOW', 'FAIL', 'INCRBY', 'u8', '0', '100');
out.bf_fail_kept = await bitfield(k('bf2'), 'GET', 'u8', '0');
await bitfield(k('bf3'), 'SET', 'i8', '0', '-128');
out.bf_i8_wrap = await bitfield(k('bf3'), 'INCRBY', 'i8', '0', '-1');
out.bf_u1_wrap = await bitfield(k('bf4'), 'SET', 'u1', '0', '1', 'INCRBY', 'u1', '0', '1');
await bitfield(k('bf5'), 'SET', 'i64', '0', '-1');
out.bf_i64_get = (await bitfield(k('bf5'), 'GET', 'i64', '0'))[0];
out.bf_hash_offset = await bitfield(k('bf6'), 'SET', 'u8', '#1', '7', 'GET', 'u8', '8');
await bitfield(k('bf7'), 'SET', 'u8', '0', '200');
out.bf_ro_get = await bitfieldRo(k('bf7'), 'GET', 'u8', '0');
out.bf_multi_get = await bitfield(k('bf7'), 'GET', 'u8', '0', 'GET', 'u8', '8');
await client.set(k('bf8'), 'abc', { EX: 100 });
out.bf_incr_keep = await bitfield(k('bf8'), 'INCRBY', 'u8', '0', '1');
out.bf_ttl = Number(await client.ttl(k('bf8')));
await client.hSet(k('bfhash'), 'f', '1');
await capture('bf_wrongtype', () => client.sendCommand(['BITFIELD', k('bfhash'), 'GET', 'u8', '0']));
await captureError('bf_ro_set', () => client.sendCommand(['BITFIELD_RO', k('bf7'), 'SET', 'u8', '0', '1']));
await captureError('bf_u64', () => client.sendCommand(['BITFIELD', k('bf7'), 'GET', 'u64', '0']));
await captureError('bf_negative_offset', () => client.sendCommand(['BITFIELD', k('bf7'), 'GET', 'u8', '-1']));
await captureError('bf_bad_value', () => client.sendCommand(['BITFIELD', k('bf7'), 'SET', 'u8', '0', 'x']));
await captureError('bf_bad_overflow', () => client.sendCommand(['BITFIELD', k('bf7'), 'OVERFLOW', 'PREV', 'INCRBY', 'u8', '0', '1']));
await captureError('bf_syntax', () => client.sendCommand(['BITFIELD', k('bf7'), 'BOGUS', 'u8', '0']));
await captureError('bf_arity', () => client.sendCommand(['BITFIELD']));

await client.rPush(k('lst'), ['a', 'b', 'c', 'a', 'b', 'c']);
out.lp_default = Number(await client.lPos(k('lst'), 'a'));
out.lp_missing_element = await client.lPos(k('lst'), 'd');
out.lp_rank2 = Number(await client.sendCommand(['LPOS', k('lst'), 'a', 'RANK', '2']));
out.lp_rank_neg = Number(await client.sendCommand(['LPOS', k('lst'), 'a', 'RANK', '-1']));
out.lp_count_all = (await client.sendCommand(['LPOS', k('lst'), 'a', 'COUNT', '0'])).map(Number);
out.lp_count_reverse = (await client.sendCommand(['LPOS', k('lst'), 'a', 'RANK', '-1', 'COUNT', '0'])).map(Number);
out.lp_maxlen_miss = await client.sendCommand(['LPOS', k('lst'), 'a', 'RANK', '2', 'MAXLEN', '3']);
out.lp_missing_key = await client.sendCommand(['LPOS', k('nolist'), 'a']);
out.lp_missing_count = await client.sendCommand(['LPOS', k('nolist'), 'a', 'COUNT', '0']);
await captureError('lp_rank_zero', () => client.sendCommand(['LPOS', k('lst'), 'a', 'RANK', '0']));
await captureError('lp_count_negative', () => client.sendCommand(['LPOS', k('lst'), 'a', 'COUNT', '-1']));
await captureError('lp_maxlen_negative', () => client.sendCommand(['LPOS', k('lst'), 'a', 'MAXLEN', '-1']));
await captureError('lp_syntax', () => client.sendCommand(['LPOS', k('lst'), 'a', 'BOGUS', '1']));
await captureError('lp_arity', () => client.sendCommand(['LPOS', k('lst')]));
await client.set(k('lpstr'), 'v');
await capture('lp_wrongtype', () => client.sendCommand(['LPOS', k('lpstr'), 'v']));

const okReply = async (...parts) => (await client.sendCommand(parts)) === 'OK';
out.pf_add = Number(await client.pfAdd(k('pfh'), ['a', 'b', 'c']));
out.pf_count = Number(await client.pfCount(k('pfh')));
out.pf_add_duplicate = Number(await client.pfAdd(k('pfh'), ['a', 'b', 'c']));
out.pf_add_empty = Number(await client.pfAdd(k('pfh'), ['']));
out.pf_count_empty = Number(await client.pfCount(k('pfh')));
out.pf_add_second = Number(await client.pfAdd(k('pfh2'), ['d', 'e', 'f']));
out.pf_count_multi = Number(await client.pfCount([k('pfh'), k('pfh2')]));
out.pf_count_duplicate = Number(await client.pfCount([k('pfh'), k('pfh')]));
out.pf_merge = await okReply('PFMERGE', k('pfd'), k('pfh'), k('pfh2'));
out.pf_count_merged = Number(await client.pfCount(k('pfd')));
out.pf_count_missing = Number(await client.pfCount(k('pfmissing')));
out.pf_merge_missing = await okReply('PFMERGE', k('pfd2'), k('pfmissing'), k('pfmissing2'));
out.pf_count_empty_merge = Number(await client.pfCount(k('pfd2')));
out.pf_type = await client.type(k('pfh'));
out.pf_strlen = Number(await client.strLen(k('pfh')));
const manyElements = Array.from({ length: 1000 }, (_, index) => 'item-' + index);
out.pf_many = Number(await client.pfAdd(k('pfmany'), manyElements));
out.pf_many_count = Number(await client.pfCount(k('pfmany')));
await client.pfAdd(k('pfttl'), ['a']);
await client.expire(k('pfttl'), 100);
out.pf_ttl_add = Number(await client.pfAdd(k('pfttl'), ['b']));
out.pf_ttl_kept = (ttl => ttl > 0 && ttl <= 100)(await client.ttl(k('pfttl')));
await client.pfAdd(k('pfdt'), ['a']);
await client.expire(k('pfdt'), 100);
out.pf_merge_ttl = await okReply('PFMERGE', k('pfdt'), k('pfh'));
out.pf_merge_ttl_kept = (ttl => ttl > 0 && ttl <= 100)(await client.ttl(k('pfdt')));
await client.set(k('pfplain'), 'v');
await capture('pf_invalid_string', () => client.pfAdd(k('pfplain'), ['x']));
await client.hSet(k('pfhash'), 'f', '1');
await capture('pf_hash_wrongtype', () => client.pfCount(k('pfhash')));
await captureError('pf_add_arity', () => client.sendCommand(['PFADD']));
await captureError('pf_count_arity', () => client.sendCommand(['PFCOUNT']));
await captureError('pf_merge_arity', () => client.sendCommand(['PFMERGE', k('pfd')]));

// Key space in an isolated database: KEYS, TYPE and SCAN over every value kind.
await client.select(1);
await client.flushDb();
await client.set('ks:user:1', 'v');
await client.hSet('ks:user:2', 'f', 'v');
await client.rPush('ks:user:3', 'v');
await client.sAdd('ks:order:1', 'v');
await client.zAdd('ks:order:2', [{ score: 1, value: 'v' }]);
await client.pfAdd('ks:order:3', ['v']);
out.ks_keys_all = await client.sendCommand(['KEYS', 'ks:*']);
out.ks_keys_prefix = await client.sendCommand(['KEYS', 'ks:user:*']);
out.ks_keys_question = await client.sendCommand(['KEYS', 'ks:user:?']);
out.ks_keys_class = await client.sendCommand(['KEYS', 'ks:user:[12]']);
out.ks_keys_class_negated = await client.sendCommand(['KEYS', 'ks:user:[^1]']);
out.ks_keys_class_range = await client.sendCommand(['KEYS', 'ks:order:[1-2]']);
out.ks_keys_exact = await client.sendCommand(['KEYS', 'ks:user:1']);
out.ks_keys_no_match = await client.sendCommand(['KEYS', 'ks:nope*']);
out.ks_type_string = await client.type('ks:user:1');
out.ks_type_hash = await client.type('ks:user:2');
out.ks_type_list = await client.type('ks:user:3');
out.ks_type_set = await client.type('ks:order:1');
out.ks_type_zset = await client.type('ks:order:2');
out.ks_type_hll = await client.type('ks:order:3');
out.ks_type_missing = await client.type('ks:ghost');
await client.expire('ks:user:2', 100);
out.ks_type_hash = await client.type('ks:user:2');
out.ks_type_ttl_kept = (ttl => ttl > 0 && ttl <= 100)(await client.ttl('ks:user:2'));
out.ks_keys_prefix = await client.sendCommand(['KEYS', 'ks:user:*']);
out.ks_keys_ttl_kept = (ttl => ttl > 0 && ttl <= 100)(await client.ttl('ks:user:2'));
out.ks_scan_first = await client.sendCommand(['SCAN', '0', 'COUNT', '3']);
out.ks_scan_second = await client.sendCommand(['SCAN', '3', 'COUNT', '3']);
out.ks_scan_match = await client.sendCommand(['SCAN', '0', 'MATCH', 'ks:user:*', 'COUNT', '100']);
out.ks_scan_match_class = await client.sendCommand(['SCAN', '0', 'MATCH', 'ks:user:[12]', 'COUNT', '100']);
out.ks_scan_match_class_negated = await client.sendCommand(['SCAN', '0', 'MATCH', 'ks:order:[^12]', 'COUNT', '100']);
await captureError('ks_scan_count_zero', () => client.sendCommand(['SCAN', '0', 'COUNT', '0']));
await captureError('ks_scan_invalid_cursor', () => client.sendCommand(['SCAN', 'nope']));
await captureError('ks_keys_arity', () => client.sendCommand(['KEYS']));
await captureError('ks_keys_extra', () => client.sendCommand(['KEYS', 'ks:*', 'extra']));
await captureError('ks_type_arity', () => client.sendCommand(['TYPE']));
await captureError('ks_type_extra', () => client.sendCommand(['TYPE', 'ks:user:1', 'extra']));
await captureError('ks_scan_arity', () => client.sendCommand(['SCAN']));
await client.set('ks:star-*', 'v');
out.ks_keys_escape = await client.sendCommand(['KEYS', 'ks:star-' + String.fromCharCode(92) + '*']);
out.ks_keys_unclosed_class = await client.sendCommand(['KEYS', 'ks:user:[1']);

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


def capture_error(name, action):
    try:
        out[name] = action()
    except redis.ResponseError as error:
        out[name] = {'error': str(error).removeprefix('ERR ')}


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

client.execute_command('SELECT', 8)
client.flushdb()

client.set(k('gr'), 'This is a string')
out['getrange_full'] = client.getrange(k('gr'), 0, -1)
out['getrange_negative'] = client.getrange(k('gr'), -3, -1)
out['getrange_clip'] = client.getrange(k('gr'), 10, 100)
out['getrange_before_start'] = client.getrange(k('gr'), -100, 2)
out['getrange_missing'] = client.getrange(k('gr2'), 0, -1)
capture_error('getrange_integer_error', lambda: client.getrange(k('gr'), 0, '1.5'))

out['setrange_zero_fill'] = client.setrange(k('sr'), 3, 'xy')
out['get_zero_fill'] = client.get(k('sr'))
client.set(k('sr2'), 'abc')
out['setrange_overwrite'] = client.setrange(k('sr2'), 1, 'Z')
out['get_overwrite'] = client.get(k('sr2'))
out['setrange_empty_missing'] = client.setrange(k('sr3'), 5, '')
out['exists_empty_missing'] = client.exists(k('sr3'))
client.set(k('sr4'), 'abcd')
out['setrange_empty_present'] = client.setrange(k('sr4'), 10, '')
out['get_after_empty_present'] = client.get(k('sr4'))
capture_error('setrange_negative', lambda: client.setrange(k('sr5'), -1, 'x'))
capture_error('setrange_integer_error', lambda: client.setrange(k('sr5'), '1.5', 'x'))
out['exists_after_setrange_error'] = client.exists(k('sr5'))
client.set(k('sr6'), 'abc')
client.expire(k('sr6'), 100)
out['setrange_ttl_reply'] = client.setrange(k('sr6'), 1, 'Z')
out['ttl_after_setrange'] = 0 < client.ttl(k('sr6')) <= 100
out['get_after_setrange_ttl'] = client.get(k('sr6'))

out['incrbyfloat_missing'] = client.incrbyfloat(k('if1'), 0.5)
out['get_incrbyfloat_missing'] = client.get(k('if1'))
client.set(k('if2'), '10.5')
out['incrbyfloat_integer'] = client.incrbyfloat(k('if2'), 0.5)
out['get_incrbyfloat_integer'] = client.get(k('if2'))
client.set(k('if3'), '1.5')
out['incrbyfloat_fraction'] = client.incrbyfloat(k('if3'), 0.25)
out['get_incrbyfloat_fraction'] = client.get(k('if3'))
capture_error('incrbyfloat_nan', lambda: client.incrbyfloat(k('if4'), 'nan'))
out['exists_after_nan'] = client.exists(k('if4'))
capture_error('incrbyfloat_positive_inf', lambda: client.incrbyfloat(k('if4'), '+inf'))
capture_error('incrbyfloat_negative_inf', lambda: client.incrbyfloat(k('if4'), '-inf'))
client.set(k('if5'), 'abc')
capture_error('incrbyfloat_invalid_value', lambda: client.incrbyfloat(k('if5'), 1))
out['get_after_invalid_value'] = client.get(k('if5'))
client.set(k('if6'), '1')
client.expire(k('if6'), 100)
out['incrbyfloat_ttl_reply'] = client.incrbyfloat(k('if6'), 1)
out['ttl_after_incrbyfloat'] = 0 < client.ttl(k('if6')) <= 100
out['get_after_incrbyfloat_ttl'] = client.get(k('if6'))

out['setbit_create'] = client.setbit(k('sb1'), 7, 1)
out['getbit_created'] = int(client.getbit(k('sb1'), 7))
out['getbit_before'] = int(client.getbit(k('sb1'), 6))
out['bitcount_created'] = client.execute_command('BITCOUNT', k('sb1'))
out['type_setbit'] = client.type(k('sb1'))
out['exists_setbit'] = client.exists(k('sb1'))
client.set(k('sb2'), 'a')
out['setbit_previous'] = client.setbit(k('sb2'), 1, 1)
out['get_after_setbit_previous'] = client.get(k('sb2'))
out['setbit_clear'] = client.setbit(k('sb2'), 0, 0)
out['get_after_setbit_clear'] = client.get(k('sb2'))
capture_error('setbit_bad_bit', lambda: client.execute_command('SETBIT', k('sb3'), 1, 2))
capture_error('setbit_negative_offset', lambda: client.setbit(k('sb3'), -1, 1))
out['exists_after_setbit_error'] = client.exists(k('sb3'))
client.set(k('sb4'), 'a')
out['getbit_present_one'] = int(client.getbit(k('sb4'), 1))
out['getbit_present_zero'] = int(client.getbit(k('sb4'), 0))
out['getbit_past_end'] = int(client.getbit(k('sb4'), 100))
out['getbit_missing'] = int(client.getbit(k('sb5'), 0))

client.set(k('bc'), 'foobar')
out['bitcount_all'] = client.execute_command('BITCOUNT', k('bc'))
out['bitcount_byte_range'] = client.execute_command('BITCOUNT', k('bc'), 0, 0)
out['bitcount_negative_range'] = client.execute_command('BITCOUNT', k('bc'), 0, -5)
out['bitcount_bit_range'] = client.execute_command('BITCOUNT', k('bc'), 5, 30, 'BIT')
capture_error('bitcount_bad_unit', lambda: client.execute_command('BITCOUNT', k('bc'), 0, 1, 'WORD'))
out['bitcount_missing'] = client.execute_command('BITCOUNT', k('bc2'))

out['bitpos_missing_zero'] = client.execute_command('BITPOS', k('bp0'), '0')
out['bitpos_missing_one'] = client.execute_command('BITPOS', k('bp1'), '1')
client.set(k('bp'), 'abc')
out['bitpos_first_zero'] = client.execute_command('BITPOS', k('bp'), '0')
out['bitpos_first_one'] = client.execute_command('BITPOS', k('bp'), '1')
out['bitpos_range'] = client.execute_command('BITPOS', k('bp'), '1', '1', '1')
client.set(k('bpx'), bytes([255]))
out['bitpos_range_exhausted'] = client.execute_command('BITPOS', k('bpx'), '0', '0', '0')
out['bitpos_padding'] = client.execute_command('BITPOS', k('bpx'), '0', '0')
out['bitpos_negative_empty_range'] = client.execute_command('BITPOS', k('bpx'), '0', '-1', '-2')
client.set(k('bpn'), bytes([0, 1]))
out['bitpos_negative_index'] = client.execute_command('BITPOS', k('bpn'), '1', '-1')
capture_error('bitpos_bad_bit', lambda: client.execute_command('BITPOS', k('bp2'), '2'))

client.set(k('ap1'), 'abc')
client.expire(k('ap1'), 100)
out['append_ttl_reply'] = client.append(k('ap1'), 'def')
out['get_after_append'] = client.get(k('ap1'))
out['ttl_after_append'] = 0 < client.ttl(k('ap1')) <= 100
out['append_missing'] = client.append(k('ap2'), 'x')
out['exists_append_missing'] = client.exists(k('ap2'))
out['strlen_ttl'] = client.strlen(k('ap1'))
out['strlen_missing'] = client.strlen(k('ap3'))

client.setrange(k('dl'), 2, 'ab')
out['exists_after_setrange'] = client.exists(k('dl'))
out['type_after_setrange'] = client.type(k('dl'))
out['del_after_setrange'] = client.delete(k('dl'))
out['exists_after_del'] = client.exists(k('dl'))

client.hset(k('wt'), 'f', 'v')
capture('getrange_wrongtype', lambda: client.getrange(k('wt'), 0, -1))
capture('setrange_wrongtype', lambda: client.setrange(k('wt'), 0, 'x'))
capture('incrbyfloat_wrongtype', lambda: client.incrbyfloat(k('wt'), 1))
capture('setbit_wrongtype', lambda: client.setbit(k('wt'), 0, 1))
capture('getbit_wrongtype', lambda: client.getbit(k('wt'), 0))
capture('bitcount_wrongtype', lambda: client.execute_command('BITCOUNT', k('wt')))
capture('bitpos_wrongtype', lambda: client.execute_command('BITPOS', k('wt'), '0'))
capture('append_wrongtype', lambda: client.append(k('wt'), 'x'))
capture('strlen_wrongtype', lambda: client.strlen(k('wt')))
out['type_wrongtype'] = client.type(k('wt'))

client.execute_command('SELECT', 9)
client.flushdb()
client.sadd(k('sa'), 'a', 'b', 'c')
client.sadd(k('sb'), 'b', 'c', 'd')
out['s_inter'] = sorted(client.sinter(k('sa'), k('sb')))
out['s_inter_missing'] = sorted(client.sinter(k('sa'), k('sc')))
client.set(k('swt'), 'v')
capture('s_inter_wrongtype', lambda: client.sinter(k('sa'), k('swt')))
out['s_intercard'] = client.execute_command('SINTERCARD', 2, k('sa'), k('sb'))
out['s_intercard_limit'] = client.execute_command('SINTERCARD', 2, k('sa'), k('sb'), 'LIMIT', 1)
capture_error('s_intercard_zero', lambda: client.execute_command('SINTERCARD', 0, k('sa')))
capture_error('s_intercard_bad_keys', lambda: client.execute_command('SINTERCARD', 3, k('sa'), k('sb')))
capture_error('s_intercard_bad_limit', lambda: client.execute_command('SINTERCARD', 1, k('sa'), 'LIMIT', -1))
out['s_union'] = sorted(client.sunion(k('sa'), k('sb')))
out['s_diff'] = sorted(client.sdiff(k('sa'), k('sb')))
client.sadd(k('sd'), 'x')
client.expire(k('sd'), 100)
out['s_interstore'] = client.sinterstore(k('sd'), (k('sa'), k('sb')))
out['s_interstore_members'] = sorted(client.smembers(k('sd')))
out['s_interstore_ttl'] = client.ttl(k('sd')) == -1
out['s_sunionstore'] = client.sunionstore(k('su'), (k('sa'), k('sb')))
out['s_sunionstore_members'] = sorted(client.smembers(k('su')))
out['s_sdiffstore'] = client.sdiffstore(k('sf'), (k('sa'), k('sb')))
out['s_sdiffstore_members'] = sorted(client.smembers(k('sf')))
out['s_store_type'] = client.type(k('sd'))

client.sadd(k('ms'), 'a', 'b')
client.sadd(k('md'), 'c')
out['s_move'] = int(client.smove(k('ms'), k('md'), 'b'))
out['s_move_src'] = sorted(client.smembers(k('ms')))
out['s_move_dst_has'] = int(client.sismember(k('md'), 'b'))
out['s_move_missing'] = int(client.smove(k('me'), k('md'), 'x'))
client.set(k('smt'), 'v')
capture('s_move_wrongtype', lambda: client.smove(k('ms'), k('smt'), 'a'))

client.sadd(k('sra'), 'a')
out['s_rand_single'] = client.srandmember(k('sra'))
out['s_rand_missing'] = client.srandmember(k('srn'))
out['s_rand_count'] = client.execute_command('SRANDMEMBER', k('sra'), 2)
out['s_rand_negative'] = client.execute_command('SRANDMEMBER', k('sra'), -3)
client.set(k('srw'), 'v')
capture('s_rand_wrongtype', lambda: client.srandmember(k('srw'), 1))

client.sadd(k('sc1'), 'a', 'b', 'c')
cursor, members = client.sscan(k('sc1'), 0, count=2)
out['s_scan'] = [str(cursor), members]
cursor, members = client.sscan(k('sc1'), 0, match='a*', count=2)
out['s_scan_match'] = [str(cursor), members]
cursor, members = client.sscan(k('sc9'), 0)
out['s_scan_missing'] = [str(cursor), members]
capture('s_scan_wrongtype', lambda: client.sscan(k('smt'), 0))

client.execute_command('SELECT', 10)
client.flushdb()
client.zadd(k('za'), {'a': 1, 'b': 2, 'c': 3, 'd': 4})
out['zrb_score_all'] = client.execute_command('ZRANGEBYSCORE', k('za'), '-inf', '+inf')
out['zrb_score_exclusive'] = client.execute_command('ZRANGEBYSCORE', k('za'), '(1', '+inf')
out['zrb_score_withscores'] = client.execute_command('ZRANGEBYSCORE', k('za'), '-inf', '(3', 'WITHSCORES')
out['zrb_score_limit'] = client.execute_command('ZRANGEBYSCORE', k('za'), '-inf', '+inf', 'LIMIT', 1, 2)
out['zrb_score_limit_open'] = client.execute_command('ZRANGEBYSCORE', k('za'), '-inf', '+inf', 'LIMIT', 2, -1)
out['zrb_score_missing'] = client.execute_command('ZRANGEBYSCORE', k('z9'), '-inf', '+inf')
capture_error('zrb_score_bad_bound', lambda: client.execute_command('ZRANGEBYSCORE', k('za'), 'bad', '+inf'))
capture_error('zrb_score_bad_limit', lambda: client.execute_command('ZRANGEBYSCORE', k('za'), '-inf', '+inf', 'LIMIT', 'x', 1))
capture_error('zrb_score_bad_option', lambda: client.execute_command('ZRANGEBYSCORE', k('za'), '-inf', '+inf', 'BOGUS'))
out['zrev_score_all'] = client.execute_command('ZREVRANGEBYSCORE', k('za'), '+inf', '-inf')
out['zrev_score_bounds'] = client.execute_command('ZREVRANGEBYSCORE', k('za'), 3, '(1')
out['zrev_score_limit_scores'] = client.execute_command('ZREVRANGEBYSCORE', k('za'), '+inf', '-inf', 'LIMIT', 0, 2, 'WITHSCORES')
client.set(k('zw'), 'v')
capture('zrb_score_wrongtype', lambda: client.execute_command('ZRANGEBYSCORE', k('zw'), '-inf', '+inf'))

client.zadd(k('zl'), {'a': 0, 'b': 0, 'c': 0, 'd': 0})
out['zrb_lex_all'] = client.execute_command('ZRANGEBYLEX', k('zl'), '-', '+')
out['zrb_lex_open'] = client.execute_command('ZRANGEBYLEX', k('zl'), '[b', '(d')
capture_error('zrb_lex_bad_bound', lambda: client.execute_command('ZRANGEBYLEX', k('zl'), 'a', '+'))
capture_error('zrb_lex_withscores', lambda: client.execute_command('ZRANGEBYLEX', k('zl'), '-', '+', 'WITHSCORES'))
out['zrev_lex_all'] = client.execute_command('ZREVRANGEBYLEX', k('zl'), '+', '-')
out['zrev_lex_bounds'] = client.execute_command('ZREVRANGEBYLEX', k('zl'), '(d', '[a')
out['zrev_lex_limit'] = client.execute_command('ZREVRANGEBYLEX', k('zl'), '+', '-', 'LIMIT', 1, 2)

client.zadd(k('zr'), {'a': 1, 'b': 2, 'c': 3, 'd': 4, 'e': 5})
out['zrem_rank'] = client.execute_command('ZREMRANGEBYRANK', k('zr'), 0, 1)
out['zrem_rank_rest'] = client.execute_command('ZRANGE', k('zr'), 0, -1)
out['zrem_rank_negative'] = client.execute_command('ZREMRANGEBYRANK', k('zr'), -1, -1)
out['zrem_rank_rest2'] = client.execute_command('ZRANGE', k('zr'), 0, -1)
out['zrem_score'] = client.execute_command('ZREMRANGEBYSCORE', k('zr'), '(3', 4)
out['zrem_score_rest'] = client.execute_command('ZRANGE', k('zr'), 0, -1)
out['zrem_score_all'] = client.execute_command('ZREMRANGEBYSCORE', k('zr'), '-inf', '+inf')
out['zrem_score_exists'] = client.exists(k('zr'))
out['zrem_rank_missing'] = client.execute_command('ZREMRANGEBYRANK', k('z9'), 0, -1)
capture_error('zrem_rank_bad_index', lambda: client.execute_command('ZREMRANGEBYRANK', k('zl'), 'x', 0))

client.zadd(k('zlex'), {'a': 0, 'b': 0, 'c': 0, 'd': 0})
out['zrem_lex'] = client.execute_command('ZREMRANGEBYLEX', k('zlex'), '(a', '[c')
out['zrem_lex_rest'] = client.execute_command('ZRANGE', k('zlex'), 0, -1)
capture_error('zrem_lex_bad_bound', lambda: client.execute_command('ZREMRANGEBYLEX', k('zlex'), 'a', '+'))

client.zadd(k('zs'), {'m': 1})
out['zrand_single'] = client.execute_command('ZRANDMEMBER', k('zs'))
out['zrand_missing'] = client.execute_command('ZRANDMEMBER', k('zm'))
out['zrand_count'] = client.execute_command('ZRANDMEMBER', k('zs'), 3)
out['zrand_negative'] = client.execute_command('ZRANDMEMBER', k('zs'), -2)
out['zrand_scores'] = client.execute_command('ZRANDMEMBER', k('zs'), 1, 'WITHSCORES')
capture('zrand_wrongtype', lambda: client.execute_command('ZRANDMEMBER', k('zw'), 1))

zscan = client.execute_command('ZSCAN', k('za'), 0, 'COUNT', 2)
out['zscan_pairs'] = [str(zscan[0]), [item for pair in zscan[1] for item in (str(pair[0]), '%g' % float(pair[1]))]]
zscan = client.execute_command('ZSCAN', k('za'), 0, 'MATCH', 'b*', 'COUNT', 100)
out['zscan_match'] = [str(zscan[0]), [item for pair in zscan[1] for item in (str(pair[0]), '%g' % float(pair[1]))]]
zscan = client.execute_command('ZSCAN', k('zm'), 0)
out['zscan_missing'] = [str(zscan[0]), [item for pair in zscan[1] for item in (str(pair[0]), '%g' % float(pair[1]))]]
capture_error('zscan_bad_cursor', lambda: client.execute_command('ZSCAN', k('za'), 'not-a-cursor'))
capture('zscan_wrongtype', lambda: client.execute_command('ZSCAN', k('zw'), 0))

client.execute_command('SELECT', 11)
client.flushdb()
client.hset(k('h1'), mapping={'a': '1', 'b': '2', 'c': '3'})
out['h_keys'] = client.hkeys(k('h1'))
out['h_vals'] = client.hvals(k('h1'))
out['h_setnx_new'] = int(client.hsetnx(k('h1'), 'd', '4'))
out['h_get_new'] = client.hget(k('h1'), 'd')
out['h_setnx_existing'] = int(client.hsetnx(k('h1'), 'a', '9'))
out['h_get_existing'] = client.hget(k('h1'), 'a')
out['h_exists_yes'] = int(client.hexists(k('h1'), 'a'))
out['h_exists_no'] = int(client.hexists(k('h1'), 'z'))
out['h_incrfloat_new'] = '%g' % client.hincrbyfloat(k('h1'), 'n', 1.5)
out['h_incrfloat_second'] = '%g' % client.hincrbyfloat(k('h1'), 'n', 0.25)
out['h_type'] = client.type(k('h1'))
client.hset(k('hf'), mapping={'f': 'v'})
out['h_rand_single'] = client.execute_command('HRANDFIELD', k('hf'))
out['h_rand_count'] = client.execute_command('HRANDFIELD', k('hf'), 2)
out['h_rand_values'] = client.execute_command('HRANDFIELD', k('hf'), 1, 'WITHVALUES')
hscan = client.hscan(k('h1'), 0, count=2)
out['h_scan'] = [str(hscan[0]), [item for pair in hscan[1].items() for item in pair]]
hscan = client.hscan(k('h1'), 0, match='b*', count=100)
out['h_scan_match'] = [str(hscan[0]), [item for pair in hscan[1].items() for item in pair]]
client.set(k('hw'), 'v')
capture('h_setnx_wrongtype', lambda: client.hsetnx(k('hw'), 'f', 'v'))
capture_error('h_incrfloat_bad', lambda: client.execute_command('HINCRBYFLOAT', k('h1'), 'n', 'bad'))
capture('h_scan_wrongtype', lambda: client.execute_command('HSCAN', k('hw'), 0))

client.rpush(k('li'), 'a', 'b', 'c')
client.rpush(k('lj'), 'a', 'b', 'c')
out['list_insert_before'] = client.execute_command('LINSERT', k('li'), 'BEFORE', 'b', 'x')
out['list_insert_before_values'] = client.lrange(k('li'), 0, -1)
out['list_insert_after'] = client.execute_command('LINSERT', k('lj'), 'AFTER', 'b', 'x')
out['list_insert_after_values'] = client.lrange(k('lj'), 0, -1)
out['list_insert_missing_pivot'] = client.execute_command('LINSERT', k('li'), 'BEFORE', 'z', 'x')
out['list_insert_missing_key'] = client.execute_command('LINSERT', k('ln'), 'BEFORE', 'a', 'x')
capture_error('list_insert_bad_direction', lambda: client.execute_command('LINSERT', k('li'), 'MIDDLE', 'a', 'x'))
capture('list_insert_wrongtype', lambda: client.execute_command('LINSERT', k('hw'), 'BEFORE', 'a', 'x'))
client.rpush(k('lp'), 'a', 'b', 'c')
lmpop = client.execute_command('LMPOP', 1, k('lp'), 'LEFT', 'COUNT', 2)
out['list_mpop_left'] = [1 if lmpop[0] == k('lp') else 0, lmpop[1]]
out['list_mpop_left_rest'] = client.lrange(k('lp'), 0, -1)
out['list_mpop_none'] = client.execute_command('LMPOP', 2, k('ln'), k('lm'), 'LEFT')
capture_error('list_mpop_zero', lambda: client.execute_command('LMPOP', 0, k('lp'), 'LEFT'))
capture_error('list_mpop_bad_side', lambda: client.execute_command('LMPOP', 1, k('lp'), 'UP'))
capture_error('list_mpop_zero_count', lambda: client.execute_command('LMPOP', 1, k('lp'), 'LEFT', 'COUNT', 0))
capture('list_mpop_wrongtype', lambda: client.execute_command('LMPOP', 1, k('hw'), 'LEFT'))
client.rpush(k('lb'), 'a', 'b', 'c')
out['list_range_full'] = client.lrange(k('lb'), 0, -1)
out['list_range_tail'] = client.lrange(k('lb'), -2, -1)
out['list_range_clip'] = client.lrange(k('lb'), 2, 100)
out['list_range_past'] = client.lrange(k('lb'), 100, 200)
out['list_range_negative_stop'] = client.lrange(k('lb'), 0, -100)
capture('list_range_wrongtype', lambda: client.lrange(k('hw'), 0, -1))

client.execute_command('SELECT', 12)
client.flushdb()
out['k_dbsize_empty'] = client.dbsize()
out['k_random_empty'] = client.randomkey() is None
client.set(k('only'), 'v')
out['k_random_single'] = client.randomkey() == k('only')
out['k_dbsize_one'] = client.dbsize()
capture_error('k_random_arity', lambda: client.execute_command('RANDOMKEY', 'extra'))

client.set(k('src'), 'value')
out['k_copy'] = int(client.execute_command('COPY', k('src'), k('dst')))
out['k_copy_value'] = client.get(k('dst'))
out['k_copy_again'] = int(client.execute_command('COPY', k('src'), k('dst')))
client.set(k('dst'), 'other')
out['k_copy_replace'] = int(client.execute_command('COPY', k('src'), k('dst'), 'REPLACE'))
out['k_copy_replace_value'] = client.get(k('dst'))
out['k_copy_replace_ttl'] = client.ttl(k('dst'))
capture_error('k_copy_same', lambda: client.execute_command('COPY', k('src'), k('src')))
capture_error('k_copy_db_range', lambda: client.execute_command('COPY', k('src'), k('x'), 'DB', '99'))
capture_error('k_copy_bogus', lambda: client.execute_command('COPY', k('src'), k('x'), 'BOGUS'))
capture_error('k_copy_arity', lambda: client.execute_command('COPY', k('src')))
out['k_copy_missing'] = int(client.execute_command('COPY', k('gone'), k('nowhere')))
out['k_copy_missing_value'] = client.get(k('nowhere'))

client.execute_command('SET', k('ttl'), 'value', 'EX', 100)
out['k_copy_ttl'] = int(client.execute_command('COPY', k('ttl'), k('ttlcopy')))
out['k_ttl_copy'] = client.ttl(k('ttlcopy')) > 0
out['k_copy_cross'] = int(client.execute_command('COPY', k('src'), k('remote'), 'DB', 13))
client.execute_command('SELECT', 13)
out['k_cross_value'] = client.get(k('remote'))
client.execute_command('SELECT', 12)

client.sadd(k('st'), 'a')
client.expire(k('st'), 100)
out['k_copy_set'] = int(client.execute_command('COPY', k('st'), k('stcopy')))
out['k_copy_set_members'] = sorted(client.smembers(k('stcopy')))
out['k_copy_set_ttl'] = client.ttl(k('stcopy')) > 0
client.zadd(k('zt'), {'m': 1})
out['k_copy_zset'] = int(client.execute_command('COPY', k('zt'), k('ztcopy')))
out['k_copy_zset_score'] = int(client.zscore(k('ztcopy'), 'm'))

client.execute_command('SET', k('et'), 'value', 'EX', 100)
out['k_pexpiretime_missing'] = client.execute_command('PEXPIRETIME', k('gone'))
out['k_expiretime_missing'] = client.execute_command('EXPIRETIME', k('gone'))
out['k_pexpiretime_nottl'] = client.execute_command('PEXPIRETIME', k('src'))
out['k_expiretime_nottl'] = client.execute_command('EXPIRETIME', k('src'))
pexpiretime = client.execute_command('PEXPIRETIME', k('et'))
expiretime = client.execute_command('EXPIRETIME', k('et'))
out['k_expiretime_floor'] = pexpiretime > 0 and pexpiretime // 1000 == expiretime
out['k_expiretime_positive'] = expiretime > 0

out['k_persist'] = int(client.persist(k('et')))
out['k_ttl_after_persist'] = client.ttl(k('et'))
out['k_persist_again'] = int(client.persist(k('et')))

client.set(k('fdb'), 'v')
out['k_flushdb'] = bool(client.execute_command('FLUSHDB', 'ASYNC'))
out['k_dbsize_after_flush'] = client.dbsize()
capture_error('k_flushdb_bogus', lambda: client.execute_command('FLUSHDB', 'BOGUS'))
client.execute_command('SELECT', 13)
client.set(k('other'), 'v')
client.execute_command('SELECT', 12)
client.set(k('mine'), 'v')
out['k_flushall'] = bool(client.execute_command('FLUSHALL', 'ASYNC'))
out['k_size_d12'] = client.dbsize()
client.execute_command('SELECT', 13)
out['k_size_d13'] = client.dbsize()
client.execute_command('SELECT', 12)
capture_error('k_flushall_bogus', lambda: client.execute_command('FLUSHALL', 'BOGUS'))

client.execute_command('SELECT', 14)
client.flushdb()
client.zadd(k('zqa'), {'a': 1, 'b': 2, 'c': 3})
client.zadd(k('zqb'), {'b': 3, 'c': 4, 'd': 5})
out['za_union'] = client.execute_command('ZUNIONSTORE', k('zu'), 2, k('zqa'), k('zqb'))
out['za_union_members'] = client.execute_command('ZRANGE', k('zu'), 0, -1)
out['za_union_scores'] = client.execute_command('ZRANGE', k('zu'), 0, -1, 'WITHSCORES')
client.execute_command('ZUNIONSTORE', k('zu2'), 2, k('zqa'), k('zqb'), 'WEIGHTS', 2, 1)
out['za_union_weight_scores'] = client.execute_command('ZRANGE', k('zu2'), 0, -1, 'WITHSCORES')
client.execute_command('ZUNIONSTORE', k('zu3'), 2, k('zqa'), k('zqb'), 'AGGREGATE', 'MAX')
out['za_union_max_scores'] = client.execute_command('ZRANGE', k('zu3'), 0, -1, 'WITHSCORES')
out['za_inter'] = client.execute_command('ZINTERSTORE', k('zi'), 2, k('zqa'), k('zqb'))
out['za_inter_scores'] = client.execute_command('ZRANGE', k('zi'), 0, -1, 'WITHSCORES')
client.execute_command('ZINTERSTORE', k('zi2'), 2, k('zqa'), k('zqb'), 'WEIGHTS', 3, 1, 'AGGREGATE', 'MIN')
out['za_inter_min_scores'] = client.execute_command('ZRANGE', k('zi2'), 0, -1, 'WITHSCORES')
out['za_inter_missing'] = client.execute_command('ZINTERSTORE', k('zi3'), 2, k('zqa'), k('zqmissing'))
out['za_inter_dest_exists'] = client.exists(k('zi3'))
out['za_diff'] = client.execute_command('ZDIFF', 2, k('zqa'), k('zqb'))
out['za_diff_scores'] = client.execute_command('ZDIFF', 2, k('zqa'), k('zqb'), 'WITHSCORES')
out['za_diff_missing'] = client.execute_command('ZDIFF', 2, k('zqa'), k('zqmissing'))
client.zadd(k('zqc'), {'c': 9})
out['za_diffstore'] = client.execute_command('ZDIFFSTORE', k('zd'), 2, k('zqa'), k('zqc'))
out['za_diffstore_scores'] = client.execute_command('ZRANGE', k('zd'), 0, -1, 'WITHSCORES')
out['za_intercard'] = client.execute_command('ZINTERCARD', 2, k('zqa'), k('zqb'))
out['za_intercard_limit'] = client.execute_command('ZINTERCARD', 2, k('zqa'), k('zqb'), 'LIMIT', 1)
out['za_intercard_zero_limit'] = client.execute_command('ZINTERCARD', 2, k('zqa'), k('zqb'), 'LIMIT', 0)
out['za_intercard_missing'] = client.execute_command('ZINTERCARD', 2, k('zqa'), k('zqmissing'))
client.execute_command('SET', k('zud'), 'old', 'EX', 100)
client.execute_command('ZUNIONSTORE', k('zud'), 1, k('zqa'))
out['za_union_dest_ttl'] = client.ttl(k('zud'))
client.set(k('zstr'), 'v')
capture('za_union_wrongtype', lambda: client.execute_command('ZUNIONSTORE', k('zx'), 2, k('zqa'), k('zstr')))
capture('za_intercard_wrongtype', lambda: client.execute_command('ZINTERCARD', 2, k('zqa'), k('zstr')))
capture_error('za_union_numkeys_zero', lambda: client.execute_command('ZUNIONSTORE', k('zx'), 0, k('zqa')))
capture_error('za_union_numkeys_overflow', lambda: client.execute_command('ZUNIONSTORE', k('zx'), 2, k('zqa')))
capture_error('za_union_bad_weight', lambda: client.execute_command(
    'ZUNIONSTORE', k('zx'), 2, k('zqa'), k('zqb'), 'WEIGHTS', 1, 'x'
))
capture_error('za_union_bad_aggregate', lambda: client.execute_command(
    'ZUNIONSTORE', k('zx'), 2, k('zqa'), k('zqb'), 'AGGREGATE', 'AVG'
))
capture_error('za_intercard_limit_negative', lambda: client.execute_command(
    'ZINTERCARD', 2, k('zqa'), k('zqb'), 'LIMIT', -1
))

client.rpush(k('srtn'), '3', '1', '2', '10')
out['sort_numeric'] = client.execute_command('SORT', k('srtn'))
out['sort_desc'] = client.execute_command('SORT', k('srtn'), 'DESC')
out['sort_limit'] = client.execute_command('SORT', k('srtn'), 'LIMIT', 1, 2)
out['sort_ro'] = client.execute_command('SORT_RO', k('srtn'))
client.rpush(k('srtw'), 'banana', 'apple', 'cherry')
out['sort_alpha'] = client.execute_command('SORT', k('srtw'), 'ALPHA')
client.rpush(k('srti'), 'a', 'b', 'c')
client.set(k('srtw_a'), '10')
client.set(k('srtw_b'), '1')
client.set(k('srtw_c'), '5')
out['sort_by_pattern'] = client.execute_command('SORT', k('srti'), 'BY', k('srtw_') + '*')
client.set(k('srtd_a'), 'va')
out['sort_get_missing'] = client.execute_command(
    'SORT', k('srti'), 'BY', k('srtw_') + '*', 'GET', k('srtd_') + '*'
)
client.hset(k('srth_a'), 'v', '7')
client.hset(k('srth_b'), 'v', '9')
client.hset(k('srth_c'), 'v', '1')
out['sort_by_hash'] = client.execute_command('SORT', k('srti'), 'BY', k('srth_') + '*->v')
client.zadd(k('srtz'), {'3': 5, '1': 9, '2': 1})
out['sort_zset_nosort'] = client.execute_command('SORT', k('srtz'), 'BY', 'nosort')
client.execute_command('SET', k('srto'), 'old', 'EX', 100)
out['sort_store_reply'] = client.execute_command('SORT', k('srtn'), 'STORE', k('srto'))
out['sort_store_values'] = client.lrange(k('srto'), 0, -1)
out['sort_store_ttl'] = client.ttl(k('srto'))
client.set(k('srtp'), 'v')
capture('sort_wrongtype', lambda: client.execute_command('SORT', k('srtp')))
client.rpush(k('srtb'), 'x', '1')
capture_error('sort_bad_number', lambda: client.execute_command('SORT', k('srtb')))
capture_error('sort_ro_store', lambda: client.execute_command('SORT_RO', k('srtn'), 'STORE', k('srto')))
capture_error('sort_bad_option', lambda: client.execute_command('SORT', k('srtn'), 'BOGUS'))

def bitfield(*parts):
    return [None if value is None else int(value) for value in client.execute_command('BITFIELD', *parts)]


def bitfield_ro(*parts):
    return [None if value is None else int(value) for value in client.execute_command('BITFIELD_RO', *parts)]


out['bf_set_get'] = bitfield(k('bf1'), 'SET', 'u8', '0', '255', 'GET', 'u8', '0')
out['bf_get_missing'] = bitfield(k('bfmissing'), 'GET', 'u8', '0')
out['bf_missing_exists'] = int(client.exists(k('bfmissing')))
bitfield(k('bf2'), 'SET', 'u8', '0', '200')
out['bf_wrap_u8'] = bitfield(k('bf2'), 'INCRBY', 'u8', '0', '100')
bitfield(k('bf2'), 'SET', 'u8', '0', '200')
out['bf_sat_u8'] = bitfield(k('bf2'), 'OVERFLOW', 'SAT', 'INCRBY', 'u8', '0', '100')
bitfield(k('bf2'), 'SET', 'u8', '0', '200')
out['bf_fail_u8'] = bitfield(k('bf2'), 'OVERFLOW', 'FAIL', 'INCRBY', 'u8', '0', '100')
out['bf_fail_kept'] = bitfield(k('bf2'), 'GET', 'u8', '0')
bitfield(k('bf3'), 'SET', 'i8', '0', '-128')
out['bf_i8_wrap'] = bitfield(k('bf3'), 'INCRBY', 'i8', '0', '-1')
out['bf_u1_wrap'] = bitfield(k('bf4'), 'SET', 'u1', '0', '1', 'INCRBY', 'u1', '0', '1')
bitfield(k('bf5'), 'SET', 'i64', '0', '-1')
out['bf_i64_get'] = bitfield(k('bf5'), 'GET', 'i64', '0')[0]
out['bf_hash_offset'] = bitfield(k('bf6'), 'SET', 'u8', '#1', '7', 'GET', 'u8', '8')
bitfield(k('bf7'), 'SET', 'u8', '0', '200')
out['bf_ro_get'] = bitfield_ro(k('bf7'), 'GET', 'u8', '0')
out['bf_multi_get'] = bitfield(k('bf7'), 'GET', 'u8', '0', 'GET', 'u8', '8')
client.set(k('bf8'), 'abc', ex=100)
out['bf_incr_keep'] = bitfield(k('bf8'), 'INCRBY', 'u8', '0', '1')
out['bf_ttl'] = int(client.ttl(k('bf8')))
client.hset(k('bfhash'), 'f', '1')
capture('bf_wrongtype', lambda: client.execute_command('BITFIELD', k('bfhash'), 'GET', 'u8', '0'))
capture_error('bf_ro_set', lambda: client.execute_command('BITFIELD_RO', k('bf7'), 'SET', 'u8', '0', '1'))
capture_error('bf_u64', lambda: client.execute_command('BITFIELD', k('bf7'), 'GET', 'u64', '0'))
capture_error('bf_negative_offset', lambda: client.execute_command('BITFIELD', k('bf7'), 'GET', 'u8', '-1'))
capture_error('bf_bad_value', lambda: client.execute_command('BITFIELD', k('bf7'), 'SET', 'u8', '0', 'x'))
capture_error('bf_bad_overflow', lambda: client.execute_command('BITFIELD', k('bf7'), 'OVERFLOW', 'PREV', 'INCRBY', 'u8', '0', '1'))
capture_error('bf_syntax', lambda: client.execute_command('BITFIELD', k('bf7'), 'BOGUS', 'u8', '0'))
capture_error('bf_arity', lambda: client.execute_command('BITFIELD'))

client.rpush(k('lst'), 'a', 'b', 'c', 'a', 'b', 'c')
out['lp_default'] = int(client.lpos(k('lst'), 'a'))
out['lp_missing_element'] = client.lpos(k('lst'), 'd')
out['lp_rank2'] = int(client.execute_command('LPOS', k('lst'), 'a', 'RANK', '2'))
out['lp_rank_neg'] = int(client.execute_command('LPOS', k('lst'), 'a', 'RANK', '-1'))
out['lp_count_all'] = [int(value) for value in client.execute_command('LPOS', k('lst'), 'a', 'COUNT', '0')]
out['lp_count_reverse'] = [int(value) for value in client.execute_command('LPOS', k('lst'), 'a', 'RANK', '-1', 'COUNT', '0')]
out['lp_maxlen_miss'] = client.execute_command('LPOS', k('lst'), 'a', 'RANK', '2', 'MAXLEN', '3')
out['lp_missing_key'] = client.execute_command('LPOS', k('nolist'), 'a')
out['lp_missing_count'] = client.execute_command('LPOS', k('nolist'), 'a', 'COUNT', '0')
capture_error('lp_rank_zero', lambda: client.execute_command('LPOS', k('lst'), 'a', 'RANK', '0'))
capture_error('lp_count_negative', lambda: client.execute_command('LPOS', k('lst'), 'a', 'COUNT', '-1'))
capture_error('lp_maxlen_negative', lambda: client.execute_command('LPOS', k('lst'), 'a', 'MAXLEN', '-1'))
capture_error('lp_syntax', lambda: client.execute_command('LPOS', k('lst'), 'a', 'BOGUS', '1'))
capture_error('lp_arity', lambda: client.execute_command('LPOS', k('lst')))
client.set(k('lpstr'), 'v')
capture('lp_wrongtype', lambda: client.execute_command('LPOS', k('lpstr'), 'v'))

out['pf_add'] = int(client.pfadd(k('pfh'), 'a', 'b', 'c'))
out['pf_count'] = int(client.pfcount(k('pfh')))
out['pf_add_duplicate'] = int(client.pfadd(k('pfh'), 'a', 'b', 'c'))
out['pf_add_empty'] = int(client.pfadd(k('pfh'), ''))
out['pf_count_empty'] = int(client.pfcount(k('pfh')))
out['pf_add_second'] = int(client.pfadd(k('pfh2'), 'd', 'e', 'f'))
out['pf_count_multi'] = int(client.pfcount(k('pfh'), k('pfh2')))
out['pf_count_duplicate'] = int(client.pfcount(k('pfh'), k('pfh')))
out['pf_merge'] = bool(client.pfmerge(k('pfd'), k('pfh'), k('pfh2')))
out['pf_count_merged'] = int(client.pfcount(k('pfd')))
out['pf_count_missing'] = int(client.pfcount(k('pfmissing')))
out['pf_merge_missing'] = bool(client.pfmerge(k('pfd2'), k('pfmissing'), k('pfmissing2')))
out['pf_count_empty_merge'] = int(client.pfcount(k('pfd2')))
out['pf_type'] = client.type(k('pfh'))
out['pf_strlen'] = int(client.strlen(k('pfh')))
many_elements = ['item-%d' % index for index in range(1000)]
out['pf_many'] = int(client.pfadd(k('pfmany'), *many_elements))
out['pf_many_count'] = int(client.pfcount(k('pfmany')))
client.pfadd(k('pfttl'), 'a')
client.expire(k('pfttl'), 100)
out['pf_ttl_add'] = int(client.pfadd(k('pfttl'), 'b'))
out['pf_ttl_kept'] = 0 < int(client.ttl(k('pfttl'))) <= 100
client.pfadd(k('pfdt'), 'a')
client.expire(k('pfdt'), 100)
out['pf_merge_ttl'] = bool(client.pfmerge(k('pfdt'), k('pfh')))
out['pf_merge_ttl_kept'] = 0 < int(client.ttl(k('pfdt'))) <= 100
client.set(k('pfplain'), 'v')
capture('pf_invalid_string', lambda: client.pfadd(k('pfplain'), 'x'))
client.hset(k('pfhash'), 'f', '1')
capture('pf_hash_wrongtype', lambda: client.pfcount(k('pfhash')))
capture_error('pf_add_arity', lambda: client.execute_command('PFADD'))
capture_error('pf_count_arity', lambda: client.execute_command('PFCOUNT'))
capture_error('pf_merge_arity', lambda: client.execute_command('PFMERGE', k('pfd')))

# Key space in an isolated database: KEYS, TYPE and SCAN over every value kind.
client.execute_command('SELECT', 1)
client.flushdb()


def scan_pair(*parts):
    cursor, keys = client.execute_command(*parts)
    return [str(cursor), keys]


client.set('ks:user:1', 'v')
client.hset('ks:user:2', 'f', 'v')
client.rpush('ks:user:3', 'v')
client.sadd('ks:order:1', 'v')
client.zadd('ks:order:2', {'v': 1})
client.pfadd('ks:order:3', 'v')
out['ks_keys_all'] = client.execute_command('KEYS', 'ks:*')
out['ks_keys_prefix'] = client.execute_command('KEYS', 'ks:user:*')
out['ks_keys_question'] = client.execute_command('KEYS', 'ks:user:?')
out['ks_keys_class'] = client.execute_command('KEYS', 'ks:user:[12]')
out['ks_keys_class_negated'] = client.execute_command('KEYS', 'ks:user:[^1]')
out['ks_keys_class_range'] = client.execute_command('KEYS', 'ks:order:[1-2]')
out['ks_keys_exact'] = client.execute_command('KEYS', 'ks:user:1')
out['ks_keys_no_match'] = client.execute_command('KEYS', 'ks:nope*')
out['ks_type_string'] = client.type('ks:user:1')
out['ks_type_hash'] = client.type('ks:user:2')
out['ks_type_list'] = client.type('ks:user:3')
out['ks_type_set'] = client.type('ks:order:1')
out['ks_type_zset'] = client.type('ks:order:2')
out['ks_type_hll'] = client.type('ks:order:3')
out['ks_type_missing'] = client.type('ks:ghost')
client.expire('ks:user:2', 100)
out['ks_type_hash'] = client.type('ks:user:2')
out['ks_type_ttl_kept'] = 0 < int(client.ttl('ks:user:2')) <= 100
out['ks_keys_prefix'] = client.execute_command('KEYS', 'ks:user:*')
out['ks_keys_ttl_kept'] = 0 < int(client.ttl('ks:user:2')) <= 100
out['ks_scan_first'] = scan_pair('SCAN', '0', 'COUNT', '3')
out['ks_scan_second'] = scan_pair('SCAN', '3', 'COUNT', '3')
out['ks_scan_match'] = scan_pair('SCAN', '0', 'MATCH', 'ks:user:*', 'COUNT', '100')
out['ks_scan_match_class'] = scan_pair('SCAN', '0', 'MATCH', 'ks:user:[12]', 'COUNT', '100')
out['ks_scan_match_class_negated'] = scan_pair('SCAN', '0', 'MATCH', 'ks:order:[^12]', 'COUNT', '100')
capture_error('ks_scan_count_zero', lambda: client.execute_command('SCAN', '0', 'COUNT', '0'))
capture_error('ks_scan_invalid_cursor', lambda: client.execute_command('SCAN', 'nope'))
capture_error('ks_keys_arity', lambda: client.execute_command('KEYS'))
capture_error('ks_keys_extra', lambda: client.execute_command('KEYS', 'ks:*', 'extra'))
capture_error('ks_type_arity', lambda: client.execute_command('TYPE'))
capture_error('ks_type_extra', lambda: client.execute_command('TYPE', 'ks:user:1', 'extra'))
capture_error('ks_scan_arity', lambda: client.execute_command('SCAN'))
client.set('ks:star-*', 'v')
out['ks_keys_escape'] = client.execute_command('KEYS', 'ks:star-' + chr(92) + '*')
out['ks_keys_unclosed_class'] = client.execute_command('KEYS', 'ks:user:[1')

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

/** Decodes the shard chunk framing used by hash, list and set bodies. */
function decodeChunks(body) {
    const chunks = [];
    let offset = 0;
    while (offset < body.length) {
        const length = body.readUInt32LE(offset);
        offset += 4;
        chunks.push(body.subarray(offset, offset + length));
        offset += length;
    }
    return chunks;
}

/** Decodes the zset framing: `u32 count` plus `u32 length + member + f64 LE score` per entry. */
function decodeZSet(body) {
    const count = body.readUInt32LE(0);
    const entries = [];
    let offset = 4;
    for (let index = 0; index < count; index += 1) {
        const length = body.readUInt32LE(offset);
        offset += 4;
        const member = body.subarray(offset, offset + length);
        offset += length;
        entries.push([member, body.readDoubleLE(offset)]);
        offset += 8;
    }
    return entries;
}

function textOf(hex) {
    return Buffer.from(hex, 'hex').toString('utf8');
}

/** Replays one raw setup step with the real commands a client would issue. */
function setupCommands(step) {
    const key = textOf(step.keyHex);
    if (step.call === 'set') {
        return [['SET', key, textOf(step.valueHex)]];
    }
    if (step.call !== 'set_kind') {
        throw new Error(`unsupported setup step ${step.call}`);
    }
    const body = Buffer.from(step.valueHex, 'hex');
    if (step.kind === '') return [['SET', key, body.toString('utf8')]];
    if (step.kind === 'hash') {
        const chunks = decodeChunks(body);
        const command = ['HSET', key];
        for (let index = 0; index < chunks.length; index += 2) {
            command.push(chunks[index].toString(), chunks[index + 1].toString());
        }
        return [command];
    }
    if (step.kind === 'list') {
        return [['RPUSH', key, ...decodeChunks(body).map(item => item.toString())]];
    }
    if (step.kind === 'set') {
        return [['SADD', key, ...decodeChunks(body).map(item => item.toString())]];
    }
    if (step.kind === 'zset') {
        const command = ['ZADD', key];
        for (const [member, score] of decodeZSet(body)) {
            command.push(String(score), member.toString());
        }
        return [command];
    }
    throw new Error(`unsupported setup kind ${step.kind}`);
}

function replyNative(reply) {
    if (reply.type === 'bulk') return Buffer.from(reply.bytes).toString('utf8');
    if (reply.type === 'simple') return reply.value;
    if (reply.type === 'int') return reply.value;
    if (reply.type === 'null') return null;
    if (reply.type === 'array') return reply.value.map(replyNative);
    throw new Error(`unsupported reply spec ${reply.type}`);
}

/** Expected reply as redis-py reads it: values are native and `ERR ` is stripped. */
function replyExpected(reply) {
    if (reply.type === 'error') {
        return { kind: 'error', value: reply.value.startsWith('ERR ') ? reply.value.slice(4) : reply.value };
    }
    if (reply.type === 'array') {
        return { kind: 'list', value: reply.value.map(replyNative) };
    }
    if (reply.type === 'null') {
        return { kind: 'null', value: null };
    }
    if (reply.type === 'int') {
        return { kind: 'int', value: reply.value };
    }
    return { kind: 'text', value: replyNative(reply) };
}

/** Translates one post-state step into a real read and its expected value. */
function effectExpected(step) {
    if (step.call === 'size') {
        return { kind: 'dbsize', expect: step.expect.int };
    }
    const key = textOf(step.keyHex);
    if (step.call === 'get') {
        return { kind: 'get', key, expect: step.expect === null ? null : textOf(step.expect.bytes) };
    }
    if (step.call === 'exists_kind') {
        const name = step.kind === '' ? 'string' : step.kind;
        return { kind: 'type', key, expect: step.expect.bool ? name : 'none' };
    }
    if (step.call !== 'get_kind') {
        throw new Error(`unsupported effect step ${step.call}`);
    }
    if (step.expect === null) {
        return { kind: 'zset', key, expect: null };
    }
    const body = Buffer.from(step.expect.bytes, 'hex');
    if (step.kind === '') {
        return { kind: 'get', key, expect: body.toString('utf8') };
    }
    if (step.kind === 'hash') {
        const chunks = decodeChunks(body);
        const expect = {};
        for (let index = 0; index < chunks.length; index += 2) {
            expect[chunks[index].toString()] = chunks[index + 1].toString();
        }
        return { kind: 'hash', key, expect };
    }
    if (step.kind === 'set') {
        return { kind: 'members', key, expect: decodeChunks(body).map(item => item.toString()).sort() };
    }
    if (step.kind === 'zset') {
        const expect = decodeZSet(body).map(([member, score]) => [member.toString(), score]);
        expect.sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
        return { kind: 'zset', key, expect };
    }
    throw new Error(`unsupported effect kind ${step.kind}`);
}

/**
 * Re-expresses the wire reply as redis-py hands it to a caller.
 *
 * redis-py runs per-command response callbacks, so `SET` and `RENAME` come back
 * as a boolean, `SCAN` promotes the cursor to an integer, and `SMEMBERS` yields
 * a set. These are driver-side type changes, not gateway differences.
 */
function pythonReplyExpected(id, reply) {
    if (reply.kind === 'text' && reply.value === 'OK' && (id.startsWith('command.rename.') || id === 'command.set.clears-zset')) {
        return { kind: 'int', value: 1 };
    }
    if (id.startsWith('command.scan.') && reply.kind === 'list') {
        return { kind: 'list', value: [Number(reply.value[0]), reply.value[1]] };
    }
    return reply;
}

/** Turns the TS-only command cases into a plan the redis-py case driver can replay. */
function buildCasePlan(root) {
    const payload = JSON.parse(readFileSync(join(root, 'tests', 'cases', 'five-kinds.json'), 'utf8'));
    return payload.cases
        .filter(entry => entry.op === 'command')
        .map(entry => ({
            id: entry.id,
            db: 7,
            setup: entry.setup.flatMap(setupCommands),
            command: entry.argsText,
            reply: pythonReplyExpected(entry.id, replyExpected(entry.reply)),
            effects: entry.effect.map(effectExpected),
        }));
}

function assertCaseResults(actual, plan) {
    const problems = [];
    const byId = new Map(actual.map(item => [item.id, item]));
    for (const entry of plan) {
        const read = byId.get(entry.id);
        if (read === undefined) {
            problems.push(`${entry.id}: missing from the driver output`);
            continue;
        }
        if (JSON.stringify(read.reply) !== JSON.stringify(entry.reply)) {
            problems.push(`${entry.id}: reply expected ${JSON.stringify(entry.reply)}, read ${JSON.stringify(read.reply)}`);
        }
        const expectedEffects = entry.effects.map(effect => effect.expect);
        if (JSON.stringify(read.effects) !== JSON.stringify(expectedEffects)) {
            problems.push(`${entry.id}: effects expected ${JSON.stringify(expectedEffects)}, read ${JSON.stringify(read.effects)}`);
        }
    }
    if (actual.length !== plan.length) {
        problems.push(`driver returned ${actual.length} cases, expected ${plan.length}`);
    }
    if (problems.length > 0) {
        throw new Error(`redis-py case driver disagreed on ${problems.length} check(s):\n  ${problems.join('\n  ')}`);
    }
    return plan.length;
}

const CASE_DRIVER = `
import json
import os
import sys

import redis

plan = json.load(open(sys.argv[1], encoding="utf-8"))
client = redis.Redis(
    host=os.environ["REDIS_HOST"],
    port=int(os.environ["REDIS_PORT"]),
    decode_responses=True,
    protocol=2,
)


def plain(value):
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, float):
        return int(value) if value.is_integer() else value
    if isinstance(value, (set, frozenset)):
        return sorted(value)
    if isinstance(value, (list, tuple)):
        return [plain(item) for item in value]
    return value


def wrapped(value):
    if isinstance(value, (set, frozenset)):
        value = sorted(value)
    if isinstance(value, (list, tuple)):
        return {"kind": "list", "value": [plain(item) for item in value]}
    if value is None:
        return {"kind": "null", "value": None}
    if isinstance(value, bool):
        return {"kind": "int", "value": int(value)}
    if isinstance(value, int):
        return {"kind": "int", "value": value}
    return {"kind": "text", "value": str(plain(value))}


results = []
for case in plan:
    client.execute_command("SELECT", case["db"])
    client.flushdb()
    for command in case["setup"]:
        client.execute_command(*command)
    try:
        reply = wrapped(client.execute_command(*case["command"]))
    except redis.ResponseError as error:
        reply = {"kind": "error", "value": str(error)}
    effects = []
    for effect in case["effects"]:
        kind = effect["kind"]
        key = effect.get("key")
        if kind == "get":
            value = client.get(key)
        elif kind == "type":
            value = client.type(key)
        elif kind == "hash":
            value = dict(client.hgetall(key))
        elif kind == "members":
            value = sorted(client.smembers(key))
        elif kind == "zset":
            if client.type(key) != "zset":
                value = None
            else:
                entries = sorted(client.zrange(key, 0, -1, withscores=True), key=lambda item: item[0])
                value = [[member, plain(score)] for member, score in entries]
        elif kind == "dbsize":
            value = client.dbsize()
        else:
            raise SystemExit("unknown effect kind " + kind)
        effects.append(plain(value))
    results.append({"id": case["id"], "reply": reply, "effects": effects})

client.close()
print(json.dumps(results))
`;

try {
    installPackages(install.scratch, ['redis@4.7.1']);
    writeFileSync(join(install.scratch, 'driver-node.mjs'), NODE_DRIVER);
    writeFileSync(join(install.scratch, 'driver-py.py'), PYTHON_DRIVER);
    const casePlan = buildCasePlan(install.root);
    writeFileSync(join(install.scratch, 'driver-cases.json'), JSON.stringify(casePlan, null, 2));
    writeFileSync(join(install.scratch, 'driver-cases.py'), CASE_DRIVER);

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

        const { stdout: caseOutput } = await run(
            interpreter,
            [join(install.scratch, 'driver-cases.py'), join(install.scratch, 'driver-cases.json')],
            { cwd: install.scratch, env: environment, encoding: 'utf8', timeout: 120000 },
        );
        const caseRead = assertCaseResults(JSON.parse(caseOutput), casePlan);

        process.stdout.write(`drivers: node-redis ${nodeRead} assertions, redis-py ${pythonVersion} ${pythonRead} assertions, ${caseRead} TS-only command cases replayed through redis-py, 0 mismatches\n`);
    }
    finally {
        await server.close();
    }
}
finally {
    install.cleanup();
}
