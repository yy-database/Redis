//! RESP2 / RESP3 framing primitives.
//!
//! A connection starts on RESP2 and switches to RESP3 only after `HELLO 3`.
//! Under RESP2 a missing bulk value is `$-1\r\n` and a map is flattened into an
//! array. Under RESP3 the same value is `_\r\n` and a map is `%N`.
//!
//! All parsers accept a byte prefix and report how many bytes they consumed, so
//! a socket loop in JavaScript or Python can feed them incrementally. The
//! parsers never block and own no connection state.

use std::io::Write;

use serde_json::Value as Json;

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
    /// Ordered map (`%` on RESP3, a flattened array on RESP2).
    Map(Vec<(Reply, Reply)>),
}

impl Reply {
    /// Encodes one reply for the negotiated protocol version.
    pub fn encode(&self, protocol: u8, out: &mut Vec<u8>) {
        match self {
            Self::Simple(value) => {
                out.push(b'+');
                out.extend_from_slice(value.as_bytes());
                out.extend_from_slice(b"\r\n");
            }
            Self::Error(value) => {
                out.push(b'-');
                out.extend_from_slice(value.as_bytes());
                out.extend_from_slice(b"\r\n");
            }
            Self::Integer(value) => out.extend_from_slice(format!(":{value}\r\n").as_bytes()),
            Self::Bulk(value) => {
                out.extend_from_slice(format!("${}\r\n", value.len()).as_bytes());
                out.extend_from_slice(value);
                out.extend_from_slice(b"\r\n");
            }
            Self::Null => {
                out.extend_from_slice(if protocol >= 3 { b"_\r\n" } else { b"$-1\r\n" });
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

    /// Converts to the JSON reply specification crossing the binding boundary.
    pub fn to_spec(&self) -> Json {
        match self {
            Self::Simple(value) => serde_json::json!({ "type": "simple", "value": value }),
            Self::Error(value) => serde_json::json!({ "type": "error", "value": value }),
            Self::Integer(value) => serde_json::json!({ "type": "int", "value": value }),
            Self::Bulk(value) => serde_json::json!({ "type": "bulk", "bytes": value }),
            Self::Null => serde_json::json!({ "type": "null" }),
            Self::Array(values) => {
                serde_json::json!({ "type": "array", "value": values.iter().map(Self::to_spec).collect::<Vec<_>>() })
            }
            Self::Map(entries) => serde_json::json!({
                "type": "map",
                "value": entries
                    .iter()
                    .map(|(key, value)| serde_json::json!([key.to_spec(), value.to_spec()]))
                    .collect::<Vec<_>>(),
            }),
        }
    }

    /// Builds a reply from the JSON reply specification.
    pub fn from_spec(spec: &Json) -> Result<Self, String> {
        let kind = spec.get("type").and_then(Json::as_str).ok_or("reply specification is missing `type`")?;
        match kind {
            "simple" => Ok(Self::Simple(text(spec)?)),
            "error" => Ok(Self::Error(text(spec)?)),
            "int" => Ok(Self::Integer(
                spec.get("value").and_then(Json::as_i64).ok_or("reply specification `int` needs an integer `value`")?,
            )),
            "bulk" => {
                let bytes = match spec.get("bytes") {
                    Some(Json::Array(values)) => values
                        .iter()
                        .map(|value| value.as_u64().and_then(|value| u8::try_from(value).ok()).ok_or("reply specification `bulk` has a non byte `bytes` entry"))
                        .collect::<Result<Vec<u8>, _>>()?,
                    _ => text(spec)?.into_bytes(),
                };
                Ok(Self::Bulk(bytes))
            }
            "null" => Ok(Self::Null),
            "array" => {
                let values = spec.get("value").and_then(Json::as_array).ok_or("reply specification `array` needs a `value` list")?;
                let mut replies = Vec::with_capacity(values.len());
                for value in values {
                    replies.push(Self::from_spec(value)?);
                }
                Ok(Self::Array(replies))
            }
            "map" => {
                let values = spec.get("value").and_then(Json::as_array).ok_or("reply specification `map` needs a `value` list")?;
                let mut entries = Vec::with_capacity(values.len());
                for pair in values {
                    let pair = pair.as_array().filter(|pair| pair.len() == 2).ok_or("each `map` entry needs exactly two replies")?;
                    entries.push((Self::from_spec(&pair[0])?, Self::from_spec(&pair[1])?));
                }
                Ok(Self::Map(entries))
            }
            other => Err(format!("unknown reply type '{other}'")),
        }
    }
}

fn text(spec: &Json) -> Result<String, String> {
    spec.get("value").and_then(Json::as_str).map(str::to_owned).ok_or_else(|| "reply specification needs a string `value`".to_owned())
}

/// One parsed client request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Request {
    /// Command name followed by its arguments, each as raw bytes.
    pub args: Vec<Vec<u8>>,
}

/// Parses one command from the front of `input`.
///
/// Returns the request and the number of consumed bytes, or `None` when more
/// bytes are required. A framing violation is reported as an `ERR Protocol
/// error: ...` string so the caller can reply with it and close the connection.
pub fn decode_command(input: &[u8]) -> Result<Option<(Request, usize)>, String> {
    if input.is_empty() {
        return Ok(None);
    }
    if input[0] != b'*' {
        return Err("ERR Protocol error: expected a multibulk request".to_owned());
    }
    let Some((header, mut offset)) = line(input, 1) else {
        return Ok(None);
    };
    let count = parse_count(header).ok_or("ERR Protocol error: invalid multibulk length")?;
    if count <= 0 || count as usize > MAX_REQUEST_ARGS {
        return Err("ERR Protocol error: invalid multibulk length".to_owned());
    }
    let mut args = Vec::with_capacity(count as usize);
    let mut total = 0usize;
    for _ in 0..count {
        let Some(byte) = input.get(offset) else {
            return Ok(None);
        };
        if *byte != b'$' {
            return Err("ERR Protocol error: expected a bulk string".to_owned());
        }
        let Some((header, next)) = line(input, offset + 1) else {
            return Ok(None);
        };
        offset = next;
        let length = parse_count(header).ok_or("ERR Protocol error: invalid bulk length")?;
        if length < 0 || length as usize > MAX_REQUEST_BYTES {
            return Err("ERR Protocol error: invalid bulk length".to_owned());
        }
        total += length as usize;
        if total > MAX_REQUEST_BYTES {
            return Err("ERR Protocol error: request exceeds the size limit".to_owned());
        }
        let end = offset + length as usize;
        let terminator = end + 2;
        if input.len() < terminator {
            return Ok(None);
        }
        if &input[end..terminator] != b"\r\n" {
            return Err("ERR Protocol error: invalid bulk string terminator".to_owned());
        }
        args.push(input[offset..end].to_vec());
        offset = terminator;
    }
    Ok(Some((Request { args }, offset)))
}

/// Encodes one command as a multibulk request.
pub fn encode_command(args: &[Vec<u8>]) -> Vec<u8> {
    let mut out = Vec::with_capacity(args.iter().map(|arg| arg.len() + 16).sum::<usize>() + 16);
    out.extend_from_slice(format!("*{}\r\n", args.len()).as_bytes());
    for arg in args {
        out.extend_from_slice(format!("${}\r\n", arg.len()).as_bytes());
        out.extend_from_slice(arg);
        out.extend_from_slice(b"\r\n");
    }
    out
}

/// Encodes one reply with an explicit protocol version.
pub fn encode_reply(reply: &Reply, protocol: u8) -> Vec<u8> {
    let mut out = Vec::new();
    reply.encode(protocol, &mut out);
    out
}

/// Parses one reply from the front of `input`, returning the consumed byte count.
pub fn decode_reply(input: &[u8]) -> Result<Option<(Reply, usize)>, String> {
    if input.is_empty() {
        return Ok(None);
    }
    let Some((line, next)) = line(input, 1) else {
        return Ok(None);
    };
    Ok(Some(parse_reply(input[0], line, next, input)?))
}

fn parse_reply(kind: u8, header: &[u8], next: usize, input: &[u8]) -> Result<(Reply, usize), String> {
    match kind {
        b'+' => Ok((Reply::Simple(String::from_utf8_lossy(header).into_owned()), next)),
        b'-' => Ok((Reply::Error(String::from_utf8_lossy(header).into_owned()), next)),
        b':' => {
            let value = parse_count(header).ok_or("reply integer is not canonical")?;
            Ok((Reply::Integer(value), next))
        }
        b'_' => Ok((Reply::Null, next)),
        b'$' => {
            let length = parse_count(header).ok_or("reply bulk length is not canonical")?;
            if length < 0 {
                return Ok((Reply::Null, next));
            }
            let end = next + length as usize;
            let terminator = end + 2;
            if input.len() < terminator {
                return Ok((Reply::Null, next));
            }
            Ok((Reply::Bulk(input[next..end].to_vec()), terminator))
        }
        b'*' | b'%' => {
            let count = parse_count(header).ok_or("reply aggregate length is not canonical")?;
            if count < 0 {
                return Ok((Reply::Null, next));
            }
            let mut offset = next;
            let mut values = Vec::new();
            for _ in 0..count {
                let (value, consumed) = complete_reply(input, offset)?;
                values.push(value);
                offset = consumed;
            }
            if kind == b'%' {
                let mut entries = Vec::new();
                let mut iterator = values.into_iter();
                while let (Some(key), Some(value)) = (iterator.next(), iterator.next()) {
                    entries.push((key, value));
                }
                Ok((Reply::Map(entries), offset))
            }
            else {
                Ok((Reply::Array(values), offset))
            }
        }
        other => Err(format!("unknown reply prefix '{}'", char::from(other))),
    }
}

/// Parses a nested reply that must be complete.
fn complete_reply(input: &[u8], offset: usize) -> Result<(Reply, usize), String> {
    match decode_reply(&input[offset..]) {
        Ok(Some((reply, consumed))) => Ok((reply, offset + consumed)),
        _ => Err("incomplete nested reply".to_owned()),
    }
}

/// Finds the next CRLF terminated line starting at `start`.
fn line(input: &[u8], start: usize) -> Option<(&[u8], usize)> {
    let tail = input.get(start..)?;
    let end = tail.windows(2).position(|window| window == b"\r\n")?;
    if start + end > MAX_REQUEST_BYTES {
        return None;
    }
    Some((&tail[..end], start + end + 2))
}

/// Parses a canonical decimal integer, used for lengths inside the protocol.
fn parse_count(bytes: &[u8]) -> Option<i64> {
    if bytes.is_empty() || bytes.len() > 20 {
        return None;
    }
    let (negative, digits) = match bytes[0] {
        b'-' => (true, &bytes[1..]),
        _ => (false, bytes),
    };
    if digits.is_empty() || !digits.iter().all(u8::is_ascii_digit) {
        return None;
    }
    let magnitude = digits.iter().try_fold(0_i64, |accumulator, byte| {
        accumulator
            .checked_mul(10)
            .and_then(|value| value.checked_add(i64::from(byte - b'0')))
    })?;
    if negative {
        magnitude.checked_neg()
    }
    else {
        Some(magnitude)
    }
}

/// Writes an encoded reply to a writer.
pub fn write_reply(writer: &mut impl Write, reply: &Reply, protocol: u8) -> std::io::Result<()> {
    writer.write_all(&encode_reply(reply, protocol))
}
