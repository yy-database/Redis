# Conformance report

Command: `pnpm --dir projects/redis.ts/examples/vs-js-libraries test`

One product server, three clients (`ioredis`, `@yydb/redis`, `node-redis`) on RESP2.
Each writer's keys are read by both other clients, a writer sets `EX 1` keys that all
clients must see expire after 1.1 seconds, and explicit pipelines must preserve request
order in both directions.

## Captured output

```text
PASS cross-read ioredis -> peers (3 keys)
PASS cross-read @yydb/redis -> peers (3 keys)
PASS cross-read node-redis -> peers (3 keys)
PASS expiry ioredis -> peers (EX 1, 1100ms)
PASS expiry @yydb/redis -> peers (EX 1, 1100ms)
PASS expiry node-redis -> peers (EX 1, 1100ms)
PASS pipeline order ioredis -> peers (5 keys)
PASS pipeline order @yydb/redis -> peers (5 keys)
PASS pipeline order node-redis -> peers (5 keys)
PASS conformance (15 scenario checks, 3 clients, RESP2)
```
