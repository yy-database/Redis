import Redis from 'ioredis';
import { createApp } from './app.mjs';

const host = process.env.REDIS_HOST ?? '127.0.0.1';
const port = Number(process.env.REDIS_PORT ?? 6379);
const url = process.env.REDIS_URL;
const listenPort = Number(process.env.PORT ?? 3000);

const client = url ? new Redis(url) : new Redis({ host, port });
client.on('error', error => console.error('[redis]', error.message));

const app = createApp({ client });
const server = app.listen(listenPort, '127.0.0.1', () => {
  const address = server.address();
  console.log(`[api] listening on http://127.0.0.1:${address.port}`);
  console.log(`[api] redis target ${url ?? `${host}:${port}`}`);
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] ${signal} received, shutting down`);
  await new Promise(resolve => server.close(resolve));
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
