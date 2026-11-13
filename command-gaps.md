# Command gaps

Every command in the Redis surface that is not served by the shared
`database-server` facade is listed here, with the upstream coordinate that would
have to change, the behavior a real Redis server shows, and how the gap is
classified. A command that is forwarded to the facade is not repeated here.

Upstream means the `database-server` crate, module `yyds::redis`
(`src/yyds/redis/collections.rs` and `src/yyds/redis/mod.rs`). The public family
entries are `execute_hash_command` (`mod.rs`, line 56), `execute_set_command`
(line 76), `execute_list_command` (line 95) and `execute_zset_command`
(line 115); they forward to `handle_hash` (line 647), `handle_set` (line 2201),
`handle_list` (line 1563) and `handle_zset` (line 4179), which own command
semantics, type checks and reply framing.

The server face has its own entry: `execute_server_command` (`mod.rs`), which
sets the host session fields on `server_face::EmbeddedServerFace` and dispatches
to `server_face::handle_client`, `handle_command`, `handle_info`, `handle_config`
and `handle_acl`. `server_face::ClientRegistry` is the listener-level registry
shared by every embedded session.

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

## ZSet family

No gaps left. `ZREVRANGE`, `ZLEXCOUNT`, `ZRANGESTORE`, `ZMSCORE`, `ZPOPMIN`,
`ZPOPMAX`, `ZRANDMEMBER`, `ZREMRANGEBYLEX`, the read-only `ZUNION` / `ZINTER`,
`ZMPOP` and the blocking `BZPOPMIN` / `BZPOPMAX` / `BZMPOP` were absent from
`is_zset_command` (line 350) and `handle_zset` (line 4179). They are implemented
there now, so every zset command is forwarded to the facade and the planner keeps
only queued-time argument checks. The blocking family is forwarded in its
non-blocking form, with the wait loop staying in the planner.

`ZADD` owns its option grammar upstream: `NX` / `XX` / `GT` / `LT` / `CH` /
`INCR` and their mutual exclusions, including the single-pair rule for `INCR`.

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

Under RESP3 the sorted-set scores are native doubles and `WITHSCORES` answers
nested `[member, double]` pairs, matching a real server byte for byte. The reply
codec keeps the raw score text so the shortest form survives the round trip.

A missing member under `ZRANK` / `ZREVRANK ... WITHSCORE` replies a null array
under RESP2 (`*-1`) rather than a null bulk, because a hit is an array. RESP3
answers `_` for both.

Lexicographic ranges (`ZRANGEBYLEX`, `ZREVRANGEBYLEX`, `ZRANGE ... BYLEX`,
`ZREMRANGEBYLEX`) walk the stored score order and only then apply the member
bounds, which is what a real server does. With mixed scores this keeps score
order, and a first element already past `max` empties the range.

Scores keep the integer form up to and including `2^62` and switch to the
shortest round-trip digits above it, as measured against Redis 8.10.3.

Option conflicts inside `MULTI` are rejected while the command is queued, while a
real server queues the command and reports the error inside `EXEC`. Arity errors
abort the queue on both sides.

## Server face

No gaps left. `CLIENT`, `COMMAND`, `INFO`, `CONFIG` and `ACL` are served by
`EmbeddedServerFace`; the TypeScript side only forwards them through
`Store.serverCommand`. `CONFIG` is the one overlay: the host answers the options
it owns at runtime (`requirepass`, `notify-keyspace-events`, `appendfsync` and
the two `slowlog-*` knobs) and merges them into the facade's `CONFIG GET` reply,
while every other option and every error text still comes from the facade.

Each host connection owns one embedded session keyed by the connection id, and
all sessions share one `ClientRegistry`. `CLIENT SETNAME` / `SETINFO`,
`CONFIG SET` and the negotiated RESP version therefore stay connection-scoped,
while `CLIENT LIST`, `CLIENT INFO` and `CLIENT KILL` see the host's other
connections. A peer kill marks the record closed and reports its id back to the
host, which closes the matching socket; the host also calls
`Store.serverRelease` when a connection ends so the registry stops listing it.

`CLIENT KILL` on the current session is reported through the `close` flag and is
not repeated in the killed list. Detached sessions have no socket, so their
`addr` / `laddr` are `127.0.0.1:0` by construction.

## Host-served commands

`UNLINK`, `MOVE`, `SWAPDB` and `KEYS` have no facade entry that fits, so the
TypeScript planner serves them without changing the shard layout. `UNLINK`
forwards the `DEL` semantics, `MOVE` copies every kind namespace of one logical
key together with its deadline and refuses an occupied destination, `SWAPDB`
captures both databases before erasing either side, and `KEYS` applies the same
byte-exact glob the gateway uses for pattern subscriptions so classes and escapes
work. One command still reaches the shard as a single batch write.

## Verifying a gap

`pnpm gate:oracle` rechecks the wire and layout bytes of the implemented
surface, and `pnpm gate:drivers` replays the command cases through the real
`node-redis` and `redis-py` clients. `pnpm gate:oracle:live` replays every wire
case against a real Redis and refuses to run when the server version differs
from `projects/redis.ts/packages/redis-harness/oracle-provenance.json`; CI runs
it against the `redis:8.10.3` service so the corpus provenance and the oracle
image cannot drift apart silently. A command listed above as upstream-missing is
not covered by either gate through the facade; it is covered only by the planner
tests in the case tables.
