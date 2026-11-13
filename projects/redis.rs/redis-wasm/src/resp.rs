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
/// Payload size from which a bulk reply crosses the binding as base64.
///
/// Smaller payloads stay a JSON number array so the reply specification keeps
/// its established shape. A numeric array costs one JSON node per byte, which
/// dominates every large reply (a 64 KiB value becomes a 196 KiB spec), so the
/// larger ones travel as one base64 string instead.
pub const BULK_SPEC_BASE64_THRESHOLD: usize = 4096;

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
    /// Null array (`*-1` on RESP2, `_` on RESP3).
    NullArray,
    /// Double (a comma-prefixed double on RESP3, a bulk string on RESP2).
    ///
    /// The original text is kept so a reply round-trips byte for byte, which
    /// matters for sorted-set scores whose formatting is part of the contract.
    Double(String),
    /// Ordered array.
    Array(Vec<Reply>),
    /// Set aggregate (`~` on RESP3, a plain array on RESP2).
    Set(Vec<Reply>),
    /// Push frame (`>` on RESP3, a plain array on RESP2), used by pub/sub delivery.
    Push(Vec<Reply>),
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
            Self::NullArray => {
                out.extend_from_slice(if protocol >= 3 { b"_\r\n" } else { b"*-1\r\n" });
            }
            Self::Double(value) => {
                if protocol >= 3 {
                    out.push(b',');
                    out.extend_from_slice(value.as_bytes());
                    out.extend_from_slice(b"\r\n");
                } else {
                    out.extend_from_slice(format!("${}\r\n", value.len()).as_bytes());
                    out.extend_from_slice(value.as_bytes());
                    out.extend_from_slice(b"\r\n");
                }
            }
            Self::Array(values) => {
                out.extend_from_slice(format!("*{}\r\n", values.len()).as_bytes());
                for value in values {
                    value.encode(protocol, out);
                }
            }
            Self::Set(values) => {
                out.extend_from_slice(if protocol >= 3 { b"~" } else { b"*" });
                out.extend_from_slice(format!("{}\r\n", values.len()).as_bytes());
                for value in values {
                    value.encode(protocol, out);
                }
            }
            Self::Push(values) => {
                out.extend_from_slice(if protocol >= 3 { b">" } else { b"*" });
                out.extend_from_slice(format!("{}\r\n", values.len()).as_bytes());
                for value in values {
                    value.encode(protocol, out);
                }
            }
            Self::Map(entries) => {
                if protocol >= 3 {
                    out.extend_from_slice(format!("%{}\r\n", entries.len()).as_bytes());
                } else {
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
            Self::Bulk(value) => {
                if value.len() >= BULK_SPEC_BASE64_THRESHOLD {
                    serde_json::json!({ "type": "bulk", "b64": base64_encode(value) })
                } else {
                    serde_json::json!({ "type": "bulk", "bytes": value })
                }
            }
            Self::Null => serde_json::json!({ "type": "null" }),
            Self::NullArray => serde_json::json!({ "type": "null-array" }),
            Self::Double(value) => serde_json::json!({ "type": "double", "value": value }),
            Self::Array(values) => {
                serde_json::json!({ "type": "array", "value": values.iter().map(Self::to_spec).collect::<Vec<_>>() })
            }
            Self::Set(values) => {
                serde_json::json!({ "type": "set", "value": values.iter().map(Self::to_spec).collect::<Vec<_>>() })
            }
            Self::Push(values) => {
                serde_json::json!({ "type": "push", "value": values.iter().map(Self::to_spec).collect::<Vec<_>>() })
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
        let kind = spec
            .get("type")
            .and_then(Json::as_str)
            .ok_or("reply specification is missing `type`")?;
        match kind {
            "simple" => Ok(Self::Simple(text(spec)?)),
            "error" => Ok(Self::Error(text(spec)?)),
            "int" => Ok(Self::Integer(
                spec.get("value")
                    .and_then(Json::as_i64)
                    .ok_or("reply specification `int` needs an integer `value`")?,
            )),
            "bulk" => {
                if let Some(encoded) = spec.get("b64").and_then(Json::as_str) {
                    return Ok(Self::Bulk(base64_decode(encoded)?));
                }
                let bytes = match spec.get("bytes") {
                    Some(Json::Array(values)) => values
                        .iter()
                        .map(|value| {
                            value
                                .as_u64()
                                .and_then(|value| u8::try_from(value).ok())
                                .ok_or("reply specification `bulk` has a non byte `bytes` entry")
                        })
                        .collect::<Result<Vec<u8>, _>>()?,
                    _ => text(spec)?.into_bytes(),
                };
                Ok(Self::Bulk(bytes))
            }
            "null" => Ok(Self::Null),
            "null-array" => Ok(Self::NullArray),
            "double" => Ok(Self::Double(text(spec)?)),
            "array" => {
                let values = spec
                    .get("value")
                    .and_then(Json::as_array)
                    .ok_or("reply specification `array` needs a `value` list")?;
                let mut replies = Vec::with_capacity(values.len());
                for value in values {
                    replies.push(Self::from_spec(value)?);
                }
                Ok(Self::Array(replies))
            }
            "set" => {
                let values = spec
                    .get("value")
                    .and_then(Json::as_array)
                    .ok_or("reply specification `set` needs a `value` list")?;
                let mut replies = Vec::with_capacity(values.len());
                for value in values {
                    replies.push(Self::from_spec(value)?);
                }
                Ok(Self::Set(replies))
            }
            "push" => {
                let values = spec
                    .get("value")
                    .and_then(Json::as_array)
                    .ok_or("reply specification `push` needs a `value` list")?;
                let mut replies = Vec::with_capacity(values.len());
                for value in values {
                    replies.push(Self::from_spec(value)?);
                }
                Ok(Self::Push(replies))
            }
            "map" => {
                let values = spec
                    .get("value")
                    .and_then(Json::as_array)
                    .ok_or("reply specification `map` needs a `value` list")?;
                let mut entries = Vec::with_capacity(values.len());
                for pair in values {
                    let pair = pair
                        .as_array()
                        .filter(|pair| pair.len() == 2)
                        .ok_or("each `map` entry needs exactly two replies")?;
                    entries.push((Self::from_spec(&pair[0])?, Self::from_spec(&pair[1])?));
                }
                Ok(Self::Map(entries))
            }
            other => Err(format!("unknown reply type '{other}'")),
        }
    }
}

fn text(spec: &Json) -> Result<String, String> {
    spec.get("value")
        .and_then(Json::as_str)
        .map(str::to_owned)
        .ok_or_else(|| "reply specification needs a string `value`".to_owned())
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
/// bytes are required. A zero or negative multibulk length is a request with no
/// arguments that Redis consumes without replying, so callers must skip an empty
/// `args` list instead of executing it. Any other framing violation is reported
/// as an `ERR Protocol error: ...` string so the caller can reply with it and
/// close the connection.
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
    if count <= 0 {
        return Ok(Some((Request { args: Vec::new() }, offset)));
    }
    if count as usize > MAX_REQUEST_ARGS {
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

/// Encodes several commands back to back, as one pipeline write.
pub fn encode_commands(commands: &[Vec<Vec<u8>>]) -> Vec<u8> {
    let mut out = Vec::with_capacity(
        commands
            .iter()
            .flat_map(|args| args.iter())
            .map(|arg| arg.len() + 16)
            .sum::<usize>()
            + 16,
    );
    for args in commands {
        out.extend_from_slice(&encode_command(args));
    }
    out
}

/// Several complete requests decoded from the front of one buffer.
pub struct CommandBatch {
    /// Bytes covered by `requests`, stopping before any framing error.
    pub consumed: usize,
    /// Complete requests with their own wire length, including empty ones the
    /// caller must skip.
    pub requests: Vec<(Request, usize)>,
    /// Framing error found after the decoded requests, or `None`.
    pub error: Option<String>,
}

/// Decodes every complete request at the front of `input`.
///
/// A framing error stops the batch and is reported together with the requests
/// that precede it, so a caller can run the valid prefix before closing.
pub fn decode_commands(input: &[u8]) -> CommandBatch {
    let mut consumed = 0;
    let mut requests = Vec::new();
    while consumed < input.len() {
        match decode_command(&input[consumed..]) {
            Ok(Some((request, length))) => {
                consumed += length;
                requests.push((request, length));
            }
            Ok(None) => break,
            Err(error) => {
                return CommandBatch {
                    consumed,
                    requests,
                    error: Some(error),
                };
            }
        }
    }
    CommandBatch {
        consumed,
        requests,
        error: None,
    }
}

/// Encodes one reply with an explicit protocol version.
pub fn encode_reply(reply: &Reply, protocol: u8) -> Vec<u8> {
    let mut out = Vec::new();
    reply.encode(protocol, &mut out);
    out
}

/// Encodes several replies back to back, as one pipeline response.
pub fn encode_replies(replies: &[Reply], protocol: u8) -> Vec<u8> {
    let mut out = Vec::new();
    for reply in replies {
        reply.encode(protocol, &mut out);
    }
    out
}

/// Several complete replies decoded from the front of one buffer.
pub struct ReplyBatch {
    /// Bytes covered by `replies`, stopping before any framing error.
    pub consumed: usize,
    /// Complete replies in wire order.
    pub replies: Vec<Reply>,
    /// Framing error found after the decoded replies, or `None`.
    pub error: Option<String>,
}

/// Decodes every complete reply at the front of `input`.
pub fn decode_replies(input: &[u8]) -> ReplyBatch {
    let mut consumed = 0;
    let mut replies = Vec::new();
    while consumed < input.len() {
        match decode_reply(&input[consumed..]) {
            Ok(Some((reply, length))) => {
                consumed += length;
                replies.push(reply);
            }
            Ok(None) => break,
            Err(error) => {
                return ReplyBatch {
                    consumed,
                    replies,
                    error: Some(error),
                };
            }
        }
    }
    ReplyBatch {
        consumed,
        replies,
        error: None,
    }
}

/// Parses one reply from the front of `input`, returning the consumed byte count.
pub fn decode_reply(input: &[u8]) -> Result<Option<(Reply, usize)>, String> {
    if input.is_empty() {
        return Ok(None);
    }
    let Some((line, next)) = line(input, 1) else {
        return Ok(None);
    };
    parse_reply(input[0], line, next, input)
}

fn parse_reply(kind: u8, header: &[u8], next: usize, input: &[u8]) -> Result<Option<(Reply, usize)>, String> {
    match kind {
        b'+' => Ok(Some((
            Reply::Simple(String::from_utf8_lossy(header).into_owned()),
            next,
        ))),
        b'-' => Ok(Some((Reply::Error(String::from_utf8_lossy(header).into_owned()), next))),
        b':' => {
            let value = parse_count(header).ok_or("reply integer is not canonical")?;
            Ok(Some((Reply::Integer(value), next)))
        }
        b'_' => Ok(Some((Reply::Null, next))),
        b',' => Ok(Some((
            Reply::Double(String::from_utf8_lossy(header).into_owned()),
            next,
        ))),
        b'$' => {
            let length = parse_count(header).ok_or("reply bulk length is not canonical")?;
            if length < 0 {
                return Ok(Some((Reply::Null, next)));
            }
            let end = next + length as usize;
            let terminator = end + 2;
            if input.len() < terminator {
                return Ok(None);
            }
            Ok(Some((Reply::Bulk(input[next..end].to_vec()), terminator)))
        }
        b'*' | b'%' | b'>' | b'~' => {
            let count = parse_count(header).ok_or("reply aggregate length is not canonical")?;
            if count < 0 {
                return Ok(Some((Reply::NullArray, next)));
            }
            let mut offset = next;
            let mut values = Vec::new();
            let replies = if kind == b'%' {
                count.checked_mul(2).ok_or("reply aggregate length is out of range")?
            } else {
                count
            };
            for _ in 0..replies {
                let Some((value, consumed)) = nested_reply(input, offset)? else {
                    return Ok(None);
                };
                values.push(value);
                offset = consumed;
            }
            if kind == b'%' {
                let mut entries = Vec::new();
                let mut iterator = values.into_iter();
                while let (Some(key), Some(value)) = (iterator.next(), iterator.next()) {
                    entries.push((key, value));
                }
                Ok(Some((Reply::Map(entries), offset)))
            } else if kind == b'>' {
                Ok(Some((Reply::Push(values), offset)))
            } else if kind == b'~' {
                Ok(Some((Reply::Set(values), offset)))
            } else {
                Ok(Some((Reply::Array(values), offset)))
            }
        }
        other => Err(format!("unknown reply prefix '{}'", char::from(other))),
    }
}

/// Parses a nested reply, reporting `None` when the frame continues past `input`.
fn nested_reply(input: &[u8], offset: usize) -> Result<Option<(Reply, usize)>, String> {
    let Some(rest) = input.get(offset..) else {
        return Ok(None);
    };
    match decode_reply(rest)? {
        Some((reply, consumed)) => Ok(Some((reply, offset + consumed))),
        None => Ok(None),
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
///
/// 负数的下界比正数上界多一格，`-9223372036854775808` 同样是规范整数，
/// 因此按无符号量累加后再单独处理符号位。
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
    let magnitude = digits.iter().try_fold(0_u64, |accumulator, byte| {
        accumulator
            .checked_mul(10)
            .and_then(|value| value.checked_add(u64::from(byte - b'0')))
    })?;
    if negative {
        if magnitude == 1 << 63 {
            return Some(i64::MIN);
        }
        if magnitude > 1 << 63 {
            return None;
        }
        Some(-(magnitude as i64))
    } else if magnitude <= i64::MAX as u64 {
        Some(magnitude as i64)
    } else {
        None
    }
}

/// Writes an encoded reply to a writer.
pub fn write_reply(writer: &mut impl Write, reply: &Reply, protocol: u8) -> std::io::Result<()> {
    writer.write_all(&encode_reply(reply, protocol))
}

const BASE64_ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Encodes bytes with the standard padded base64 alphabet.
fn base64_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let first = u32::from(chunk[0]);
        let second = u32::from(*chunk.get(1).unwrap_or(&0));
        let third = u32::from(*chunk.get(2).unwrap_or(&0));
        let triple = (first << 16) | (second << 8) | third;
        out.push(BASE64_ALPHABET[(triple >> 18) as usize & 0x3f] as char);
        out.push(BASE64_ALPHABET[(triple >> 12) as usize & 0x3f] as char);
        out.push(if chunk.len() > 1 {
            BASE64_ALPHABET[(triple >> 6) as usize & 0x3f] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            BASE64_ALPHABET[triple as usize & 0x3f] as char
        } else {
            '='
        });
    }
    out
}

/// Decodes the standard padded base64 alphabet.
fn base64_decode(text: &str) -> Result<Vec<u8>, String> {
    let malformed = || "reply specification `bulk` has a malformed `b64` payload".to_owned();
    let raw = text.as_bytes();
    if raw.len() % 4 != 0 {
        return Err(malformed());
    }
    let mut out = Vec::with_capacity(raw.len() / 4 * 3);
    for (index, chunk) in raw.chunks(4).enumerate() {
        let last = index + 1 == raw.len() / 4;
        let padding = chunk.iter().rev().take_while(|byte| **byte == b'=').count();
        if padding > 2 || (padding > 0 && !last) || chunk[..4 - padding].contains(&b'=') {
            return Err(malformed());
        }
        let digit = |byte: u8| -> Option<u32> {
            Some(match byte {
                b'A'..=b'Z' => u32::from(byte - b'A'),
                b'a'..=b'z' => u32::from(byte - b'a') + 26,
                b'0'..=b'9' => u32::from(byte - b'0') + 52,
                b'+' => 62,
                b'/' => 63,
                _ => return None,
            })
        };
        let first = digit(chunk[0]).ok_or_else(malformed)?;
        let second = digit(chunk[1]).ok_or_else(malformed)?;
        let third = if padding >= 2 {
            0
        } else {
            digit(chunk[2]).ok_or_else(malformed)?
        };
        let fourth = if padding >= 1 {
            0
        } else {
            digit(chunk[3]).ok_or_else(malformed)?
        };
        out.push(((first << 2) | (second >> 4)) as u8);
        if padding < 2 {
            out.push(((second << 4) | (third >> 2)) as u8);
        }
        if padding < 1 {
            out.push(((third << 6) | fourth) as u8);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::{BULK_SPEC_BASE64_THRESHOLD, Reply, base64_decode, base64_encode};

    #[test]
    fn base64_round_trips_every_tail_length() {
        for length in 0..32 {
            let bytes = (0..length).map(|index| (index * 37 + 11) as u8).collect::<Vec<_>>();
            let encoded = base64_encode(&bytes);
            assert_eq!(base64_decode(&encoded).expect("decode"), bytes, "length {length}");
        }
    }

    #[test]
    fn base64_rejects_malformed_payloads() {
        for text in ["A", "AA=A", "A===", "AA==AA==", "AA*="] {
            assert!(base64_decode(text).is_err(), "{text} must be rejected");
        }
    }

    #[test]
    fn large_bulks_cross_the_specification_as_base64() {
        let large = vec![0xab; BULK_SPEC_BASE64_THRESHOLD];
        let spec = Reply::Bulk(large.clone()).to_spec();
        assert!(spec.get("b64").is_some());
        assert_eq!(Reply::from_spec(&spec).expect("round trip"), Reply::Bulk(large));

        let small = Reply::Bulk(b"hello".to_vec()).to_spec();
        assert!(small.get("bytes").is_some());
    }

    #[test]
    fn batches_round_trip_and_leave_the_partial_tail() {
        use super::{decode_commands, decode_replies, encode_commands, encode_replies};
        let commands = vec![
            vec![b"SET".to_vec(), b"a".to_vec(), b"1".to_vec()],
            vec![b"GET".to_vec(), b"a".to_vec()],
        ];
        let mut wire = encode_commands(&commands);
        let complete = wire.len();
        wire.extend_from_slice(b"*2\r\n$3\r\nGET");
        let batch = decode_commands(&wire);
        assert_eq!(batch.consumed, complete);
        assert_eq!(batch.requests.len(), 2);
        assert!(batch.error.is_none());

        let replies = vec![Reply::Simple("OK".to_owned()), Reply::Bulk(b"1".to_vec())];
        let encoded = encode_replies(&replies, 2);
        let decoded = decode_replies(&encoded);
        assert_eq!(decoded.consumed, encoded.len());
        assert_eq!(decoded.replies, replies);
        assert!(decoded.error.is_none());
    }
}
