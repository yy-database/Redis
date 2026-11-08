/**
 * Cache-aside helper over a Redis client.
 *
 * Values are JSON-encoded. Concurrent misses for the same key share one loader
 * promise. Redis failures fail open: the loader still runs and the result is not
 * cached, while loader failures are surfaced to the caller and never cached.
 */
export function createCache({ client, prefix = 'cache', logger = console } = {}) {
  const inflight = new Map();
  const counters = { hits: 0, misses: 0, loads: 0, errors: 0 };

  const cacheKeyOf = key => `${prefix}:${key}`;

  async function load(cacheKey, key, loader, ttlSeconds) {
    let raw;
    try {
      raw = await client.call('GET', cacheKey);
    } catch (error) {
      counters.errors += 1;
      logger.warn?.(`[cache] read failed for ${key}: ${error.message}`);
      return runLoader(cacheKey, loader, ttlSeconds, false);
    }
    if (raw !== null) {
      counters.hits += 1;
      return JSON.parse(raw);
    }
    counters.misses += 1;
    return runLoader(cacheKey, loader, ttlSeconds, true);
  }

  async function runLoader(cacheKey, loader, ttlSeconds, cacheable) {
    let value;
    try {
      value = await loader();
    } catch (error) {
      counters.errors += 1;
      throw error;
    }
    counters.loads += 1;
    if (!cacheable) return value;

    const encoded = JSON.stringify(value);
    if (encoded === undefined) return value;
    try {
      if (ttlSeconds === undefined) {
        await client.call('SET', cacheKey, encoded);
      } else {
        await client.call('SET', cacheKey, encoded, 'EX', String(ttlSeconds));
      }
    } catch (error) {
      counters.errors += 1;
      logger.warn?.(`[cache] write failed for ${cacheKey}: ${error.message}`);
    }
    return value;
  }

  function getOrLoad(key, loader, { ttlSeconds } = {}) {
    const cacheKey = cacheKeyOf(key);
    const running = inflight.get(cacheKey);
    if (running) return running;

    const task = load(cacheKey, key, loader, ttlSeconds);
    inflight.set(cacheKey, task);
    const clear = () => {
      if (inflight.get(cacheKey) === task) inflight.delete(cacheKey);
    };
    task.then(clear, clear);
    return task;
  }

  async function invalidate(key) {
    const removed = await client.call('DEL', cacheKeyOf(key));
    return removed > 0;
  }

  function stats() {
    return { ...counters };
  }

  return { getOrLoad, invalidate, stats };
}
