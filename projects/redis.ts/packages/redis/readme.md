# `@yydb/redis`

Redis-compatible server and command line client. Values are persisted in the
`.yykv` shard and registered by the `.yyds` catalog, and the wire protocol is
encoded by the native `redis-napi` binding.

```sh
redis-server --port 6379 --data-dir ./data
redis-cli -p 6379 SET greeting hello
redis-cli -p 6379 GET greeting
```

The package exposes the same primitives the binaries compose: `startServer`,
`Store`, `decodeCommand`, `encodeCommand`, `encodeReply`, and `decodeReply`.

## Limits and costs

`.yykv` is a whole-snapshot format: every write that reaches the shard
re-serializes the shard body and rewrites the file through a temporary file plus
an atomic rename. Write amplification therefore grows linearly with the number of
records in the shard. The server batches every command that arrives in one socket
read into a single rewrite, so a pipelined burst or a `MULTI` queue pays one
rewrite rather than one per command. `startServer({ appendfsync })` selects
`everysec` (default, fsync once per second and on `SAVE`, `BGSAVE` and close) or
`always` (fsync every rewrite); `Redis`'s `redis-server` accepts the same choice
as `--appendfsync`. `startServer({ requirepass })` and `--requirepass` require
`AUTH` on every new connection before other commands run.

Historical reference costs, recorded on one Windows/NTFS host with the debug
binding before the in-place commit change (median of three, one isolated `SET`):

| records in shard | single `SET` | bytes rewritten | write amplification |
| ---------------- | ------------ | --------------- | ------------------- |
| 1e3              | 8.71 ms      | 49 KB           | 848×                |
| 1e4              | 26.75 ms     | 499 KB          | 8,607×              |
| 1e5              | 205 ms       | 5.09 MB         | 87,700×             |

The byte counts still describe the layout. Rewriting a large shard remains
format-bound: at 1e5 records a single isolated write moves about 11 MB.

The high-throughput path is batching, and the server now applies it
automatically: one socket read, a pipeline, or a `MULTI` queue folds into one
snapshot write. Library users can do the same with `Store.beginBatch` /
`Store.endBatch`, or load many keys at once with `setMany`, which folds them into
a single write. The same 1e5 keys take about 0.2–0.5 s in one `setMany` call,
against roughly 2.8 h and about 250 GB written when issued as 1e5 separate `SET`
commands at the historical debug cost.

`INCR` and `INCRBY` are buffered in memory and become durable only at a `flush`
boundary: an explicit `Store.flush()`, any other mutation, or dropping the
handle; the server also flushes when it closes. A process crash loses every
increment applied since the last flush, and reopening returns the value as of
that flush, never below it. Under the default `everysec` policy a power loss can
additionally drop writes that were not yet fsynced.

A directory whose `.yyds` catalog is valid but whose registered `.yykv` shard is
absent fails to open with the error `catalog.shard-file: <id>.yykv is missing`.
This is deliberate: silently creating an empty shard would mask a shard that was
never written or was lost. A new directory writes the shard before the catalog,
so a crash between the two renames reopens by recreating the catalog around the
shard that is already there. An explicitly incomplete directory — a catalog
written by another tool, or a backup that carried only `.yyds` — is repaired
with `repairShard(dataDir)`, which creates the empty shard the catalog registers,
never rewrites the catalog, and never overwrites an existing shard.

Not supported:

- Incremental single-key rewrites of `.yykv`: there is no offset index or
  append log, so any edit rewrites the whole shard.
- Multiple shards per catalog: the `.yyds` reader accepts exactly one shard
  registration and rejects `count > 1`.
- Sidecar indexes next to `.yykv`: no file outside the documented `.yyds` and
  `.yykv` bytes carries data, so anything else would be a stale read. The
  transient `.redis-server.lock` only names the serving process.
