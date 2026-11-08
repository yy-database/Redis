# with-cache-layer

A cache-aside layer over the emulated `@yydb/redis` server with JSON values, per-entry
TTL, in-process single-flight, explicit invalidation, and fail-open Redis errors.

## What it demonstrates

- `getOrLoad(key, loader, { ttlSeconds })` checks the product first and only calls the
  loader on a miss
- five concurrent cold reads share one loader invocation
- cache hits skip the loader entirely
- `invalidate(key)` deletes the entry so the next read reloads
- TTL entries disappear after their deadline and the next read reloads
- loader failures are surfaced and never cached; Redis read/write failures log and fall
  back to the loader (fail-open), without caching the fallback result

Values are stored as `JSON.stringify(value)` under `"<prefix>:<key>"`. Command names
delegated to the native command families are matched case-sensitively by the current
backend, so the layer uses `client.call('GET' | 'SET' | 'DEL', ...)`.

## Layout

- `src/cache.mjs` — `createCache({ client, prefix })` with `getOrLoad`, `invalidate`,
  `stats`
- `src/repository.mjs` — simulated product repository with a small artificial delay
- `src/demo.mjs` — readable trace of miss, single-flight, hit, invalidation, expiry
- `tests/cache.mjs` — assertions for the same paths plus exact stats counts

## Run

The demo and test start their own in-process product server on a temporary data
directory, so they run standalone after the product is built:

```shell
pnpm build
pnpm --dir projects/redis.ts/examples/with-cache-layer demo
pnpm --dir projects/redis.ts/examples/with-cache-layer test
```

## Design notes

- **TTL** is passed straight to `SET ... EX`, so expiry is owned by the server clock.
- **Single-flight** keeps a `Map` of in-flight loader promises per cache key; waiters
  reuse the promise and are not counted as cache hits.
- **Fail-open** treats Redis as an optimization: a read error still runs the loader and
  skips the write. Loader errors increment `errors`, reject the caller, and are never
  written to the cache.
- `stats()` returns `{ hits, misses, loads, errors }`; `loads` counts successful loader
  invocations, `errors` counts loader rejections and Redis failures.
