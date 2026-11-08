# with-express

Express 5 REST cache API backed by the emulated `@yydb/redis` server. The app stores
JSON values, optional per-key TTLs, and exposes hit/miss as HTTP status codes.

## What it demonstrates

- `startServer` from `@yydb/redis` as the cache backend
- `ioredis` as the HTTP layer's only Redis connection
- JSON object round-trips (the app calls `JSON.stringify` before `SET` and
  `JSON.parse` after `GET`)
- TTL through `SET ... EX` and expiry observed as `404`
- explicit `204` / `404` delete semantics

Command names delegated to the native command families are matched case-sensitively by
the current backend, so `src/app.mjs` uses the explicit uppercase forms
`client.call('GET', ...)`, `client.call('SET', ...)`, and `client.call('DEL', ...)`.

## Layout

- `src/app.mjs` — `createApp({ client })`, routes, validation, error mapping
- `src/server.mjs` — env parsing, `ioredis` connection, listener, signal handling
- `tests/api.mjs` — in-process product server plus `fetch` assertions

## Endpoints

| Method | Path | Behaviour |
|--------|------|-----------|
| `GET` | `/health` | `200 {"status":"ok"}` |
| `GET` | `/cache/:key` | `200 {"key":...,"value":...}` or `404` |
| `PUT` | `/cache/:key` | body `{"value":..., "ttlSeconds"?: positive integer}`; `204` or `400` |
| `DELETE` | `/cache/:key` | `204` when a key was removed, otherwise `404` |

`value` may be any JSON value; the app stringifies it before storing, so objects and
arrays round-trip unchanged.

## Run

Start the product server in one terminal:

```shell
pnpm build
node projects/redis.ts/packages/redis/bin/redis-server.mjs --data-dir ./.redis-data --port 6379
```

Point the API at it and start Express:

```shell
REDIS_HOST=127.0.0.1 REDIS_PORT=6379 PORT=3000 pnpm --dir projects/redis.ts/examples/with-express start
```

## Configuration

| Variable | Default | Meaning |
|----------|---------|---------|
| `REDIS_HOST` | `127.0.0.1` | product server host |
| `REDIS_PORT` | `6379` | product server port |
| `REDIS_URL` | unset | full Redis URL, overrides host/port |
| `PORT` | `3000` | Express listen port (bound to `127.0.0.1`) |

## Test

```shell
pnpm --dir projects/redis.ts/examples/with-express test
```

The test starts the product server on port 0 with a temporary data directory, connects
`ioredis`, listens on port 0, and exercises health, 404, object round-trip, TTL expiry,
invalid bodies, and delete semantics.
