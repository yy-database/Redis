//! RESP2 / RESP3 framing.
//!
//! A connection starts on RESP2 and switches to RESP3 only after `HELLO 3`.
//! Under RESP2 a missing bulk value is `$-1\r\n`; under RESP3 it is `_\r\n`,
//! and a map reply is `%N` instead of a flattened array.

use std::io::{self, BufRead, Write};

/// Largest accepted request in bytes.
pub const MAX_REQUEST_BYTES: usize = 64 * 1024 * 1024;
/// Largest accepted argument count in one request.
pub const MAX_REQUEST_ARGS: usize = 1024 * 1024;

/// One protocol reply.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Reply {
    /// Simple string.
    Simple(String),
    /// Error string without the leading `-`.
    Error(String),
    /// Signed integer.
    Integer(i64),
    /// Bulk bytes.
    Bulk(Vec<u8>),
    /// Null bulk (`$-1` on RESP2, `_` on RESP3).
    Null,
    /// Ordered array.
    Array(Vec<Reply>),
    /// Ordered map (`%` on RESP3, flattened array on RESP2).
    Map(Vec<(Reply, Reply)>),
}

impl Reply {
    /// Encodes the reply for the negotiated protocol version.
    pub fn encode(&self, protocol: u8, out: &mut Vec<u8>) {
        match self {
            Self::Simple(value) => write_simple(out, value),
            Self::Error(value) => write_error(out, value),
            Self::Integer(value) => out.extend_from_slice(format!(":{value}\r\n").as_bytes()),
            Self::Bulk(value) => write_bulk(out, value),
            Self::Null => {
                if protocol >= 3 {
                    out.extend_from_slice(b"_\r\n");
                }
                else {
                    out.extend_from_slice(b"$-1\r\n");
                }
            }
            Self::Array(values) => {
                out.extend_from_slice(format!("*{}\r\n", values.len()).as_bytes());
                for value in values {
                    value.encode(protocol, out);
                }
            }
            Self::Map(entries) => {
                if protocol >= 3 {
                    out.extend_from_slice(format!("%{}\r\n", entries.len()).as_bytes());
                }
                else {
                    out.extend_from_slice(format!("*{}\r\n", entries.len() * 2).as_bytes());
                }
                for (key, value) in entries {
                    key.encode(protocol, out);
                    value.encode(protocol, out);
                }
            }
        }
    }
}

/// One parsed client request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Request {
    /// Command name followed by its arguments, each as raw bytes.
    pub args: Vec<Vec<u8>>,
}

/// Reads one multibulk request.
///
/// Returns `Ok(None)` on a clean end of stream. Any framing violation is
/// reported as [`io::ErrorKind::InvalidData`] so the caller can send a protocol
/// error and close the connection, exactly like Redis.
pub fn read_request(reader: &mut impl BufRead) -> io::Result<Option<Request>> {
    let mut line = Vec::new();
    let read = read_line(reader, &mut line)?;
    if read == 0 {
        return Ok(None);
    }
    if line.first() != Some(&b'*') {
        return Err(protocol_error("expected a multibulk request"));
    }
    let count = parse_decimal(&line[1..]).ok_or_else(|| protocol_error("invalid multibulk length"))?;
    if count <= 0 {
        return Err(protocol_error("invalid multibulk length"));
    }
    if count as usize > MAX_REQUEST_ARGS {
        return Err(protocol_error("invalid multibulk length"));
    }
    let mut args = Vec::with_capacity(count as usize);
    let mut total = 0usize;
    for _ in 0..count {
        let mut header = Vec::new();
        if read_line(reader, &mut header)? == 0 {
            return Err(protocol_error("unexpected end of request"));
        }
        if header.first() != Some(&b'$') {
            return Err(protocol_error("expected a bulk string"));
        }
        let length = parse_decimal(&header[1..]).ok_or_else(|| protocol_error("invalid bulk length"))?;
        if length < 0 || length as usize > MAX_REQUEST_BYTES {
            return Err(protocol_error("invalid bulk length"));
        }
        total += length as usize;
        if total > MAX_REQUEST_BYTES {
            return Err(protocol_error("request exceeds the size limit"));
        }
        let mut value = vec![0u8; length as usize];
        reader.read_exact(&mut value)?;
        let mut terminator = [0u8; 2];
        reader.read_exact(&mut terminator)?;
        if &terminator != b"\r\n" {
            return Err(protocol_error("invalid bulk string terminator"));
        }
        args.push(value);
    }
    Ok(Some(Request { args }))
}

/// Writes a simple string reply.
pub fn write_simple(out: &mut Vec<u8>, value: &str) {
    out.push(b'+');
    out.extend_from_slice(value.as_bytes());
    out.extend_from_slice(b"\r\n");
}

/// Writes an error reply.
pub fn write_error(out: &mut Vec<u8>, value: &str) {
    out.push(b'-');
    out.extend_from_slice(value.as_bytes());
    out.extend_from_slice(b"\r\n");
}

/// Writes a bulk string reply.
pub fn write_bulk(out: &mut Vec<u8>, value: &[u8]) {
    out.extend_from_slice(format!("${}\r\n", value.len()).as_bytes());
    out.extend_from_slice(value);
    out.extend_from_slice(b"\r\n");
}

/// Writes one reply to `writer` using the negotiated protocol version.
pub fn write_reply(writer: &mut impl Write, reply: &Reply, protocol: u8) -> io::Result<()> {
    let mut bytes = Vec::new();
    reply.encode(protocol, &mut bytes);
    writer.write_all(&bytes)?;
    writer.flush()
}

fn protocol_error(reason: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, format!("ERR Protocol error: {reason}"))
}

/// Reads one CRLF terminated line without the terminator.
fn read_line(reader: &mut impl BufRead, line: &mut Vec<u8>) -> io::Result<usize> {
    let read = reader.read_until(b'\n', line)?;
    if read == 0 {
        return Ok(0);
    }
    if line.last() != Some(&b'\n') {
        return Err(protocol_error("unterminated line"));
    }
    line.pop();
    if line.last() != Some(&b'\r') {
        return Err(protocol_error("unterminated line"));
    }
    line.pop();
    if line.len() > MAX_REQUEST_BYTES {
        return Err(protocol_error("request exceeds the size limit"));
    }
    Ok(read)
}

fn parse_decimal(bytes: &[u8]) -> Option<i64> {
    if bytes.is_empty() || bytes.len() > 20 {
        return None;
    }
    let negative = bytes[0] == b'-';
    let digits = if negative { &bytes[1..] } else { bytes };
    if digits.is_empty() || !digits.iter().all(u8::is_ascii_digit) {
        return None;
    }
    let text = std::str::from_utf8(digits).ok()?;
    let value: i64 = text.parse().ok()?;
    Some(if negative { -value } else { value })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encode_request(parts: &[&str]) -> Vec<u8> {
        let mut bytes = format!("*{}\r\n", parts.len()).into_bytes();
        for part in parts {
            bytes.extend_from_slice(format!("${}\r\n{part}\r\n", part.len()).as_bytes());
        }
        bytes
    }

    #[test]
    fn null_bulk_shape_depends_on_protocol() {
        let mut resp2 = Vec::new();
        Reply::Null.encode(2, &mut resp2);
        assert_eq!(resp2, b"$-1\r\n");
        let mut resp3 = Vec::new();
        Reply::Null.encode(3, &mut resp3);
        assert_eq!(resp3, b"_\r\n");
    }

    #[test]
    fn map_flattens_on_resp2_and_uses_percent_on_resp3() {
        let map = Reply::Map(vec![(Reply::Bulk(b"proto".to_vec()), Reply::Integer(3))]);
        let mut resp2 = Vec::new();
        map.encode(2, &mut resp2);
        assert_eq!(resp2, b"*2\r\n$5\r\nproto\r\n:3\r\n");
        let mut resp3 = Vec::new();
        map.encode(3, &mut resp3);
        assert_eq!(resp3, b"%1\r\n$5\r\nproto\r\n:3\r\n");
    }

    #[test]
    fn request_round_trip_and_protocol_errors() {
        let mut reader = io::Cursor::new(encode_request(&["SET", "k", "v"]));
        let request = read_request(&mut reader).expect("parse").expect("request");
        assert_eq!(request.args, vec![b"SET".to_vec(), b"k".to_vec(), b"v".to_vec()]);

        let mut inline = io::Cursor::new(b"PING\r\n".to_vec());
        let failure = read_request(&mut inline).expect_err("inline commands are rejected");
        assert_eq!(failure.kind(), io::ErrorKind::InvalidData);
    }
}
