import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export default require('./lib/redis-darwin-arm64.node');
