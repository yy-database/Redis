import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const platformDir = resolve(here, '../../platforms', `redis-${process.platform}-${process.arch}`);

if (!process.env.REDIS_NATIVE_PATH && existsSync(join(platformDir, 'package.json'))) {
  process.env.REDIS_NATIVE_PATH = platformDir;
}

const product = await import('../../packages/redis/dist/index.js');

export const startServer = product.startServer;
export const encodeCommand = product.encodeCommand;
