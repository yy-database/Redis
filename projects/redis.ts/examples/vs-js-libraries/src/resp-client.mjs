import { connect } from 'node:net';
import { encodeCommand } from '../../shared/product.mjs';

const CRLF = '\r\n';

function parseFrame(buffer, offset = 0) {
  if (buffer.length <= offset) return null;

  const marker = buffer[offset];
  const lineEnd = buffer.indexOf(CRLF, offset + 1);
  if (lineEnd === -1) return null;

  const line = buffer.toString('utf8', offset + 1, lineEnd);
  const headerBytes = lineEnd + 2 - offset;

  switch (marker) {
    case 0x2b: // +
      return { value: line, consumed: headerBytes };
    case 0x2d: // -
      return { error: new Error(line), consumed: headerBytes };
    case 0x3a: // :
      return { value: Number.parseInt(line, 10), consumed: headerBytes };
    case 0x24: { // $
      const length = Number.parseInt(line, 10);
      if (length === -1) return { value: null, consumed: headerBytes };
      const start = lineEnd + 2;
      const end = start + length;
      if (buffer.length < end + 2) return null;
      return { value: buffer.toString('utf8', start, end), consumed: end + 2 - offset };
    }
    case 0x2a: { // *
      const count = Number.parseInt(line, 10);
      if (count === -1) return { value: null, consumed: headerBytes };
      let cursor = lineEnd + 2;
      const items = [];
      for (let index = 0; index < count; index += 1) {
        const child = parseFrame(buffer, cursor);
        if (child === null) return null;
        if (child.error) {
          return { error: child.error, consumed: cursor + child.consumed - offset };
        }
        items.push(child.value);
        cursor += child.consumed;
      }
      return { value: items, consumed: cursor - offset };
    }
    default:
      throw new Error(`unsupported RESP2 frame marker 0x${marker.toString(16)}`);
  }
}

/**
 * Minimal RESP2 client: one socket, explicit command writes, reply frames read
 * in order. Pipelining writes one batch and waits for one reply per command.
 */
export function createRespClient({ host = '127.0.0.1', port } = {}) {
  const socket = connect({ host, port });
  let buffer = Buffer.alloc(0);
  let failure = null;
  const pending = [];

  const ready = new Promise((resolve, reject) => {
    socket.once('connect', () => {
      socket.setNoDelay(true);
      resolve();
    });
    socket.once('error', reject);
  });

  function fail(error) {
    if (failure === null) failure = error;
    for (const entry of pending.splice(0)) entry.reject(error);
  }

  function flush() {
    while (pending.length > 0) {
      let frame;
      try {
        frame = parseFrame(buffer);
      } catch (error) {
        fail(error);
        return;
      }
      if (frame === null) return;
      buffer = buffer.subarray(frame.consumed);
      const entry = pending.shift();
      if (frame.error) entry.reject(frame.error);
      else entry.resolve(frame.value);
    }
  }

  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    flush();
  });
  socket.on('error', error => fail(error));
  socket.on('close', () => fail(new Error('connection closed')));

  function enqueue() {
    return new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
    });
  }

  async function command(args) {
    await ready;
    if (failure) throw failure;
    const reply = enqueue();
    socket.write(Buffer.from(encodeCommand(args)));
    return reply;
  }

  async function pipeline(commands) {
    await ready;
    if (failure) throw failure;
    if (commands.length === 0) return [];
    const replies = commands.map(() => enqueue());
    const payload = Buffer.concat(commands.map(args => Buffer.from(encodeCommand(args))));
    socket.write(payload);
    return Promise.all(replies);
  }

  async function close() {
    if (socket.destroyed) return;
    await new Promise(resolve => {
      socket.once('close', resolve);
      socket.end();
    });
  }

  return { command, pipeline, close };
}
