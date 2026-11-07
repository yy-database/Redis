# Command gaps

Every command in the Redis surface that is not served by the shared
`database-server` facade is listed here, with the upstream coordinate that would
have to change, the behavior a real Redis server shows, and how the gap is
classified. A command that is forwarded to the facade is not repeated here.

Upstream means the `database-server` crate, module `yyds::redis`
(`src/yyds/redis/collections.rs` and `src/yyds/redis/mod.rs`). The public family
entries are `execute_hash_command` (`mod.rs`, line 56) and `execute_set_command`
(`mod.rs`, line 76); both forward to `handle_hash` (line 551) and `handle_set`
(line 2027), which own command semantics, type checks and reply framing.

## Hash family

| Command | Upstream coordinate | Real server behavior | Class |
| ------- | ------------------- | -------------------- | ----- |
| `HSETNX` | absent from `is_hash_command` (line 264) and `handle_hash` (line 551) | Sets the field only when it is absent and replies `1`/`0`; an existing field keeps its value and the key keeps its deadline | upstream-missing, served by the TypeScript planner |
| `HRANDFIELD` | absent from `is_hash_command` and `handle_hash` | Replies one random field, or `count` fields when a count is given, repeating fields for a negative count, and interleaves values under `WITHVALUES` | upstream-missing, served by the TypeScript planner |
| `HINCRBYFLOAT` | present in `handle_hash` (line 751) | Adds the increment as a long double and replies the shortest decimal text: `0.1` then `0.2` replies `0.3` | upstream-present but divergent: the facade formats the sum through Rust `f64::to_string` and would reply `0.30000000000000004`, so the planner keeps its decimal implementation |

## Set family

| Command | Upstream coordinate | Real server behavior | Class |
| ------- | ------------------- | -------------------- | ----- |
| `SPOP` | absent from `is_set_command` (line 316) and `handle_set` (line 2027) | Removes and replies one random member, or up to `count` members when a count is given, and removes the key once it empties | upstream-missing, not implemented on either side; the command answers `ERR unknown command 'SPOP'` |
| `SMISMEMBER` | absent from `is_set_command` and `handle_set` | Replies one integer per asked member, `1` when present and `0` when not | upstream-missing, not implemented on either side; the command answers `ERR unknown command 'SMISMEMBER'` |
| `SINTERCARD` | absent from `is_set_command` and `handle_set` | Replies the cardinality of the intersection, with `LIMIT` stopping the count as soon as it is reached | upstream-missing, served by the TypeScript planner |

## Settled divergences

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
