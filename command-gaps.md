# Command gaps

Every command in the Redis surface that is not served by the shared
`database-server` facade is listed here, with the upstream coordinate that would
have to change, the behavior a real Redis server shows, and how the gap is
classified. A command that is forwarded to the facade is not repeated here.

Upstream means the `database-server` crate, module `yyds::redis`
(`src/yyds/redis/collections.rs` and `src/yyds/redis/mod.rs`). The public family
entries are `execute_hash_command` (`mod.rs`, line 56), `execute_set_command`
(line 76) and `execute_list_command` (line 95); they forward to `handle_hash`
(line 560), `handle_set` (line 2114) and `handle_list` (line 1476), which own
command semantics, type checks and reply framing.

## Hash family

| Command | Upstream coordinate | Real server behavior | Class |
| ------- | ------------------- | -------------------- | ----- |
| `HSETNX` | absent from `is_hash_command` (line 264) and `handle_hash` (line 551) | Sets the field only when it is absent and replies `1`/`0`; an existing field keeps its value and the key keeps its deadline | upstream-missing, served by the TypeScript planner |
| `HRANDFIELD` | absent from `is_hash_command` and `handle_hash` | Replies one random field, or `count` fields when a count is given, repeating fields for a negative count, and interleaves values under `WITHVALUES` | upstream-missing, served by the TypeScript planner |
| `HINCRBYFLOAT` | present in `handle_hash` (line 751) | Adds the increment as a long double and replies the shortest decimal text: `0.1` then `0.2` replies `0.3` | upstream-present but divergent: the facade formats the sum through Rust `f64::to_string` and would reply `0.30000000000000004`, so the planner keeps its decimal implementation |

## Set family

No gaps left. `SPOP`, `SMISMEMBER` and `SINTERCARD` used to be absent from
`is_set_command` (line 322) and `handle_set` (line 2114). They now live in
`handle_set` with the rest of the family, so every set command is forwarded to
the facade and the TypeScript planner keeps only queued-time argument checks.

## List family

No gaps left. `LSET`, `LTRIM`, `LREM`, `RPOPLPUSH` and `LMOVE` had no planner
branch before and are now served by `handle_list`. `LMPOP` was missing from
`handle_list` and is now implemented there: it scans keys in argument order,
honours `LEFT`, `RIGHT` and `COUNT`, drops the key once it empties and replies a
null array when nothing was popped. `BLPOP`, `BRPOP`, `BLMOVE`, `BRPOPLPUSH` and
`BLMPOP` are forwarded in their non-blocking form, with the wait loop staying in
the planner exactly as before.

## Storage revision drift

`.yykv` records carry a per-record revision counter taken from `next_revision`.
The old path deleted and re-created a set on `SADD` and `SMOVE`, while the
facade writes each command in place once. Eight comparison fixtures therefore
show a different revision counter in `local-0.yykv` than before the move, even
though the member payload, kind and deadline are byte-identical.

This is an observable difference caused by the number of writes, not a behavior
change: a raw snapshot comparison of `local-0.yykv` will see it, while logical
reads, TTLs and replies do not. It is expected and not a defect. Comparing
snapshots by payload (`get` / `getKind` / deadline) is the supported way to
detect real regressions.

## Settled divergences

RESP3 set aggregation now uses the `~` prefix for `SMEMBERS`, `SINTER`,
`SUNION`, `SDIFF` and `SPOP` with a count, matching a real server; RESP2 still
degrades to `*`.

Under RESP3 the list null replies (`LPOP key count`, `LMPOP` with nothing to pop)
now use the single null `_`. The old planner kept emitting the RESP2 null array
`*-1` even after `HELLO 3`, which a real server does not do. RESP2 framing is
unchanged.

`SMOVE` used to probe the destination type before checking the source. The
facade checks the source first, matching a real server: a missing source replies
`0` without looking at the destination, so a wrong-typed destination is only an
error when the source exists and holds the member. The planner now forwards the
command, so the divergence is gone.

## Verifying a gap

`pnpm gate:oracle` rechecks the wire and layout bytes of the implemented
surface, and `pnpm gate:drivers` replays the command cases through the real
`node-redis` and `redis-py` clients. A command listed above as
upstream-missing is not covered by either gate through the facade; it is covered
only by the planner tests in the case tables.
