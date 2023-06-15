Redis composition for Python
============================

The package re-exports the orthogonal primitives that the `redis._native`
extension provides: the RESP encoder and decoder, the integer parser, and the
`.yyds` / `.yykv` store. The extension itself is built with `maturin` from
`projects/redis.rs/redis-pyo3` and is shipped inside this wheel.

Limits and costs
----------------

`.yykv` is a whole-snapshot format: every accepted write re-serializes the shard
body and rewrites the file through a synced temporary file plus an atomic
rename. Write amplification therefore grows linearly with the number of records
in the shard. Measured on one Windows/NTFS host with the debug extension, one
isolated `SET` costs (median of three):

| records in shard | single `SET` | bytes rewritten | write amplification |
| ---------------- | ------------ | --------------- | ------------------- |
| 1e3              | 8.71 ms      | 49 KB           | 848×                |
| 1e4              | 26.75 ms     | 499 KB          | 8,607×              |
| 1e5              | 205 ms       | 5.09 MB         | 87,700×             |

At 1e5 records an isolated single-key write takes about 205 ms, roughly five
writes per second on one shard. That is a property of the format, not a tunable
parameter.

The high-throughput path is batching: `Store.set_many` folds many keys into one
snapshot write. The same 1e5 keys take about 0.2–0.5 s in one call, against
roughly 2.8 h and about 250 GB written when issued as 1e5 separate `SET`
calls.

`INCR` and `INCRBY` are buffered in memory and become durable only at a `flush`
boundary: an explicit `Store.flush()`, any other mutation, or dropping the
handle. A crash loses every increment applied since the last flush, and
reopening returns the value as of that flush, never below it.

A directory whose `.yyds` catalog is valid but whose registered `.yykv` shard is
absent fails to open with the error `catalog.shard-file: <id>.yykv is missing`.
This is deliberate: silently creating an empty shard would mask a shard that was
never written or was lost. A new directory writes the shard before the catalog,
so a crash between the two renames reopens by recreating the catalog around the
shard that is already there. An explicitly incomplete directory — a catalog
written by another tool, or a backup that carried only `.yyds` — is repaired
with `repair_shard(data_dir)`, which creates the empty shard the catalog
registers, never rewrites the catalog, and never overwrites an existing shard.

Not supported:

- Incremental single-key rewrites of `.yykv`: there is no offset index or
  append log, so any edit rewrites the whole shard.
- Multiple shards per catalog: the `.yyds` reader accepts exactly one shard
  registration and rejects `count > 1`.
- Sidecar indexes next to `.yykv`: no file outside the documented `.yyds` and
  `.yykv` bytes carries state, so anything else would be a stale read.

Acceptance runs against an installed wheel
-----------------------------------------

`npm run gate:test-count:py` builds the wheel, installs it into a fingerprinted
virtual environment under the system temporary directory
(`redis-python-<fingerprint>`), and only then runs the cases. The environment is
created on first use and reused while the source fingerprint is unchanged; run
`node scripts/run-python-tests.mjs --force` to rebuild it. The environment
borrows the host `pytest` through `--system-site-packages` so the run needs no
network.

The wheel contains the `redis` package and the compiled `redis._native`
extension together, so an installed copy has no source-path dependency. The
cases assert that the loaded extension lives under `site-packages/redis/`
(`.pyd` on Windows, `.so` elsewhere), so the suite fails when the entry resolves
to the workspace sources instead of the installed artifact.

`npm run gate:install:py` is the narrower installation gate: it builds the
wheel, installs it into a clean virtual environment with no access to the host
site-packages, then imports the package and performs a real write and read.
