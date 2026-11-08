import express from 'express';

/**
 * REST cache API over a Redis client. Values are JSON-stringified by the app,
 * so callers can store objects, arrays, strings, numbers, booleans, and null.
 */
export function createApp({ client }) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/cache/:key', async (request, response, next) => {
    try {
      const raw = await client.call('GET', request.params.key);
      if (raw === null) {
        response.status(404).json({ error: 'not found' });
        return;
      }
      response.json({ key: request.params.key, value: JSON.parse(raw) });
    } catch (error) {
      next(error);
    }
  });

  app.put('/cache/:key', async (request, response, next) => {
    try {
      const body = request.body;
      const valid =
        body !== null &&
        typeof body === 'object' &&
        !Array.isArray(body) &&
        Object.hasOwn(body, 'value');
      if (!valid) {
        response.status(400).json({ error: 'body must be an object with a value field' });
        return;
      }
      const { value, ttlSeconds } = body;
      if (ttlSeconds !== undefined && (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0)) {
        response.status(400).json({ error: 'ttlSeconds must be a positive integer' });
        return;
      }
      const encoded = JSON.stringify(value);
      if (ttlSeconds === undefined) {
        await client.call('SET', request.params.key, encoded);
      } else {
        await client.call('SET', request.params.key, encoded, 'EX', String(ttlSeconds));
      }
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.delete('/cache/:key', async (request, response, next) => {
    try {
      const removed = await client.call('DEL', request.params.key);
      if (removed === 0) {
        response.status(404).json({ error: 'not found' });
        return;
      }
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.use((error, request, response, next) => {
    if (error?.type === 'entity.parse.failed' || error instanceof SyntaxError) {
      response.status(400).json({ error: 'invalid JSON body' });
      return;
    }
    console.error(error);
    response.status(500).json({ error: 'internal error' });
  });

  return app;
}
