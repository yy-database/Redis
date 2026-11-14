import { connect } from 'node:net';
import { encodeCommand, encodeCommands } from '../../shared/product.mjs';

const CRLF = '\r\n';
const HELLO = 0x2b; // +
const ERROR = 0x2d; // -
const INTEGER = 0x3a; // :
const BULK = 0x24; // $
const ARRAY = 0x2a; // *
const NULL = 0x5f; // _
const DOUBLE = 0x2c; // ,
const BOOLEAN = 0x23; // #
const MAP = 0x25; // %
const SET = 0x7e; // ~
const PUSH = 0x3e; // >
const BLOB_ERROR = 0x21; // !
const VERBATIM = 0x3d; // =
const BIG_NUMBER = 0x28; // (

/**
 * Reads the decimal digits of a length header straight from the buffer.
 *
 * A collection reply carries one length header per element; decoding the digits
 * in place avoids the temporary string and `Number.parseInt` call per member
 * that dominated a large full-collection read.
 */
function readLength(buffer, start, end) {
  // `$-1` / `*-1` are the RESP2 null forms, so the sign has to survive.
  let negative = false;
  if (buffer[start] === 0x2d) {
    negative = true;
    start += 1;
  }
  let value = 0;
  for (let index = start; index < end; index += 1) value = value * 10 + (buffer[index] - 48);
  return negative ? -value : value;
}

function readDouble(buffer, start, end) {
  const length = end - start;
  if (length === 3 && buffer[start] === 0x69) return Infinity; // inf
  if (length === 4 && buffer[start] === 0x2d) return -Infinity; // -inf
  if (length === 3 && buffer[start] === 0x6e) return NaN; // nan
  const text = buffer.toString('utf8', start, end);
  const value = Number(text);
  return Number.isNaN(value) ? NaN : value;
}

function parseArray(buffer, offset, lineEnd, headerBytes) {
  const count = readLength(buffer, offset + 1, lineEnd);
  if (count === -1) return { value: null, consumed: headerBytes };
  let cursor = lineEnd + 2;
  const items = new Array(count);
  for (let index = 0; index < count; index += 1) {
    // The common collection reply is a flat array of bulk strings; decode that
    // element in place instead of allocating a `{ value, consumed }` per member.
    if (buffer.length > cursor && buffer[cursor] === BULK) {
      const bulkEnd = buffer.indexOf(CRLF, cursor + 1);
      if (bulkEnd === -1) return null;
      const length = readLength(buffer, cursor + 1, bulkEnd);
      if (length === -1) {
        items[index] = null;
        cursor = bulkEnd + 2;
        continue;
      }
      const start = bulkEnd + 2;
      const end = start + length;
      if (buffer.length < end + 2) return null;
      items[index] = buffer.toString('utf8', start, end);
      cursor = end + 2;
      continue;
    }
    const child = parseFrame(buffer, cursor);
    if (child === null) return null;
    if (child.error) return { error: child.error, consumed: cursor + child.consumed - offset };
    items[index] = child.value;
    cursor += child.consumed;
  }
  return { value: items, consumed: cursor - offset };
}

/**
 * Parses one complete RESP2/RESP3 frame at `offset`, or `null` when the buffer
 * needs more bytes.
 *
 * RESP3 markers are parsed into the same plain values a RESP2 client sees
 * (`%` maps become plain objects, `~` and `>` become arrays, `_` is `null`),
 * so a workload can switch protocol without a second value model.
 */
function parseFrame(buffer, offset = 0) {
  if (buffer.length <= offset) return null;

  const marker = buffer[offset];
  const lineEnd = buffer.indexOf(CRLF, offset + 1);
  if (lineEnd === -1) return null;

  const headerBytes = lineEnd + 2 - offset;

  switch (marker) {
    case HELLO:
      return { value: buffer.toString('utf8', offset + 1, lineEnd), consumed: headerBytes };
    case ERROR:
    case BLOB_ERROR: {
      if (marker === BLOB_ERROR) {
        const length = readLength(buffer, offset + 1, lineEnd);
        const start = lineEnd + 2;
        const end = start + length;
        if (buffer.length < end + 2) return null;
        return { error: new Error(buffer.toString('utf8', start, end)), consumed: end + 2 - offset };
      }
      return { error: new Error(buffer.toString('utf8', offset + 1, lineEnd)), consumed: headerBytes };
    }
    case INTEGER:
      return { value: readLength(buffer, offset + 1, lineEnd), consumed: headerBytes };
    case BIG_NUMBER:
      return { value: buffer.toString('utf8', offset + 1, lineEnd), consumed: headerBytes };
    case DOUBLE:
      return { value: readDouble(buffer, offset + 1, lineEnd), consumed: headerBytes };
    case BOOLEAN:
      return { value: buffer[offset + 1] === 0x74, consumed: headerBytes };
    case NULL:
      return { value: null, consumed: headerBytes };
    case BULK:
    case VERBATIM: {
      const length = readLength(buffer, offset + 1, lineEnd);
      if (length === -1) return { value: null, consumed: headerBytes };
      const start = lineEnd + 2;
      const end = start + length;
      if (buffer.length < end + 2) return null;
      return { value: buffer.toString('utf8', start, end), consumed: end + 2 - offset };
    }
    case ARRAY:
    case SET:
    case PUSH: {
      const parsed = parseArray(buffer, offset, lineEnd, headerBytes);
      if (parsed === null) return null;
      if (marker === PUSH && parsed.error === undefined) parsed.push = true;
      return parsed;
    }
    case MAP: {
      const count = readLength(buffer, offset + 1, lineEnd);
      let cursor = lineEnd + 2;
      const value = {};
      for (let index = 0; index < count; index += 1) {
        const key = parseFrame(buffer, cursor);
        if (key === null) return null;
        if (key.error) return { error: key.error, consumed: cursor + key.consumed - offset };
        cursor += key.consumed;
        const item = parseFrame(buffer, cursor);
        if (item === null) return null;
        if (item.error) return { error: item.error, consumed: cursor + item.consumed - offset };
        cursor += item.consumed;
        value[String(key.value)] = item.value;
      }
      return { value, consumed: cursor - offset };
    }
    default:
      throw new Error(`unsupported RESP frame marker 0x${marker.toString(16)}`);
  }
}

/**
 * Minimal RESP2/RESP3 client: one socket, explicit command writes, reply frames
 * read in order. Pipelining writes one batch and waits for one reply per command.
 *
 * `protocol: 3` negotiates RESP3 with one `HELLO 3` before the client reports
 * ready. `onPush` receives complete push/pub-sub frames that arrive while no
 * command is pending, and RESP3 `>` frames even while commands are in flight.
 */
export function createRespClient({ host = '127.0.0.1', port, protocol = 2, onPush = null } = {}) {
  const socket = connect({ host, port });
  let buffer = Buffer.alloc(0);
  let failure = null;
  let ready = false;
  const pending = [];

  const opened = new Promise((resolve, reject) => {
    socket.once('connect', () => {
      socket.setNoDelay(true);
      const negotiate = protocol === 3
        ? new Promise((resolveHello, rejectHello) => {
          const reply = enqueue();
          socket.write(encodeCommand(['HELLO', '3']));
          reply.then(resolveHello, rejectHello);
        })
        : Promise.resolve();
      negotiate.then(() => {
        ready = true;
        resolve();
      }, error => {
        fail(error);
        reject(error);
      });
    });
    socket.once('error', reject);
  });

  function fail(error) {
    if (failure === null) failure = error;
    for (const entry of pending.splice(0)) entry.reject(error);
  }

  function flush() {
    while (true) {
      let frame;
      try {
        frame = parseFrame(buffer);
      }
      catch (error) {
        fail(error);
        return;
      }
      if (frame === null) return;
      buffer = buffer.subarray(frame.consumed);
      // A RESP3 push is out of band: it never resolves a pending command.
      if (frame.push === true) {
        onPush?.(frame.value);
        continue;
      }
      if (pending.length > 0) {
        const entry = pending.shift();
        if (frame.error) entry.reject(frame.error);
        else entry.resolve(frame.value);
        continue;
      }
      if (frame.error) {
        fail(frame.error);
        return;
      }
      onPush?.(frame.value);
    }
  }

  socket.on('data', chunk => {
    buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
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
    // A ready socket skips the promise hop, which matters for sequential cells.
    if (!ready) await opened;
    if (failure) throw failure;
    const reply = enqueue();
    socket.write(encodeCommand(args));
    return reply;
  }

  async function pipeline(commands) {
    if (!ready) await opened;
    if (failure) throw failure;
    if (commands.length === 0) return [];
    const replies = commands.map(() => enqueue());
    socket.write(encodeCommands(commands));
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
