# `@yydb/redis`

Redis-compatible server and command line client. Every value is persisted
through `.yyds` and `.yykv`, and the wire protocol is encoded by the native
`redis-napi` binding.

```sh
redis-server --port 6379 --data-dir ./data
redis-cli -p 6379 SET greeting hello
redis-cli -p 6379 GET greeting
```

The package exposes the same primitives the binaries compose: `startServer`,
`Store`, `decodeCommand`, `encodeCommand`, `encodeReply`, and `decodeReply`.
