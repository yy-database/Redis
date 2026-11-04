//! Command dispatch. Every reply follows real Redis shapes for the supported
//! surface and every unsupported command is rejected with a diagnostic instead
//! of a silent empty answer.

use crate::format::now_unix_ms;
use crate::resp::Reply;
use crate::store::{RenameOutcome, Node, DATABASES};

/// Per-connection state.
#[derive(Debug)]
pub struct Connection {
    /// Selected database index.
    pub db: u8,
    /// Negotiated protocol version, `2` until `HELLO 3`.
    pub protocol: u8,
    /// Pending `MULTI` transaction.
    pub multi: Option<MultiState>,
    /// Set when the client sent `QUIT` or the socket must be closed.
    pub close: bool,
    /// Connection identifier reported by `HELLO`.
    pub id: u64,
}

impl Connection {
    /// Creates a RESP2 connection bound to database zero.
    pub fn new(id: u64) -> Self {
        Self { db: 0, protocol: 2, multi: None, close: false, id }
    }
}

/// Queue of commands accepted inside `MULTI`.
#[derive(Debug, Default)]
pub struct MultiState {
    /// Queued request payloads, each starting with its command name.
    pub queue: Vec<Vec<Vec<u8>>>,
    /// Set when a queued command failed validation, forcing `EXECABORT`.
    pub aborted: bool,
}

/// Server identity reported by `HELLO`.
pub const SERVER_VERSION: &str = "7.4.0";

/// Executes one request and returns the reply for the negotiated protocol.
pub fn dispatch(node: &mut Node, connection: &mut Connection, request: &[Vec<u8>]) -> Reply {
    let Some((name, arguments)) = request.split_first() else {
        return Reply::Error("ERR empty request".to_owned());
    };
    let name = ascii_upper(name);

    if let Some(multi) = &mut connection.multi {
        let immediate = matches!(name.as_str(), "EXEC" | "DISCARD" | "MULTI" | "QUIT");
        if !immediate {
            let Some((minimum, maximum)) = arity(&name) else {
                multi.aborted = true;
                return unknown_command(request);
            };
            if !fits(arguments.len() + 1, minimum, maximum) {
                multi.aborted = true;
                return wrong_arity(&name);
            }
            multi.queue.push(request.to_vec());
            return Reply::Simple("QUEUED".to_owned());
        }
    }

    match name.as_str() {
        "PING" => match arguments.len() {
            0 => Reply::Simple("PONG".to_owned()),
            1 => Reply::Bulk(arguments[0].clone()),
            _ => wrong_arity(&name),
        },
        "ECHO" if arguments.len() == 1 => Reply::Bulk(arguments[0].clone()),
        "QUIT" if arguments.is_empty() => {
            connection.close = true;
            Reply::Simple("OK".to_owned())
        }
        "SELECT" if arguments.len() == 1 => match parse_i64(&arguments[0]) {
            Some(index) if (0..i64::from(DATABASES)).contains(&index) => {
                connection.db = index as u8;
                Reply::Simple("OK".to_owned())
            }
            Some(_) => Reply::Error("ERR DB index is out of range".to_owned()),
            None => Reply::Error("ERR value is not an integer or out of range".to_owned()),
        },
        "HELLO" => hello(connection, arguments),
        "CLIENT" => client(connection, arguments),
        "MULTI" if arguments.is_empty() => {
            if connection.multi.is_some() {
                return Reply::Error("ERR MULTI calls can not be nested".to_owned());
            }
            connection.multi = Some(MultiState::default());
            Reply::Simple("OK".to_owned())
        },
        "DISCARD" if arguments.is_empty() => {
            if connection.multi.take().is_none() {
                return Reply::Error("ERR DISCARD without MULTI".to_owned());
            }
            Reply::Simple("OK".to_owned())
        }
        "EXEC" if arguments.is_empty() => exec(node, connection),
        "FLUSHDB" if arguments.is_empty() => match node.flush_db(connection.db) {
            Ok(()) => Reply::Simple("OK".to_owned()),
            Err(error) => store_error(error),
        },
        "FLUSHALL" if arguments.is_empty() => {
            for index in 0..DATABASES {
                if let Err(error) = node.flush_db(index) {
                    return store_error(error);
                }
            }
            Reply::Simple("OK".to_owned())
        }
        "DBSIZE" if arguments.is_empty() => Reply::Integer(node.len(connection.db) as i64),
        "GET" if arguments.len() == 1 => read(node, connection.db, &arguments[0]),
        "SET" => set(node, connection.db, arguments),
        "SETNX" if arguments.len() == 2 => {
            if node.contains(connection.db, &arguments[0]) {
                Reply::Integer(0)
            }
            else {
                match node.set(connection.db, &arguments[0], &arguments[1], None) {
                    Ok(()) => Reply::Integer(1),
                    Err(error) => store_error(error),
                }
            }
        }
        "GETSET" if arguments.len() == 2 => {
            let previous = node.get(connection.db, &arguments[0]).map(|record| record.value.clone());
            match node.set(connection.db, &arguments[0], &arguments[1], None) {
                Ok(()) => previous.map_or(Reply::Null, Reply::Bulk),
                Err(error) => store_error(error),
            }
        }
        "GETDEL" if arguments.len() == 1 => {
            let previous = node.get(connection.db, &arguments[0]).map(|record| record.value.clone());
            match node.delete(connection.db, &arguments[0]) {
                Ok(_) => previous.map_or(Reply::Null, Reply::Bulk),
                Err(error) => store_error(error),
            }
        }
        "GETEX" if (1..=4).contains(&arguments.len()) => getex(node, connection.db, arguments),
        "MGET" if arguments.len() >= 1 => Reply::Array(
            arguments
                .iter()
                .map(|key| node.get(connection.db, key).map_or(Reply::Null, |record| Reply::Bulk(record.value.clone())))
                .collect(),
        ),
        "MSET" if arguments.len() >= 2 && arguments.len() % 2 == 0 => {
            for pair in arguments.chunks(2) {
                if let Err(error) = node.set(connection.db, &pair[0], &pair[1], None) {
                    return store_error(error);
                }
            }
            Reply::Simple("OK".to_owned())
        }
        "DEL" if arguments.len() >= 1 => {
            let mut removed = 0;
            for key in arguments {
                match node.delete(connection.db, key) {
                    Ok(true) => removed += 1,
                    Ok(false) => {}
                    Err(error) => return store_error(error),
                }
            }
            Reply::Integer(removed)
        }
        "EXISTS" if arguments.len() >= 1 => {
            Reply::Integer(arguments.iter().filter(|key| node.contains(connection.db, key)).count() as i64)
        }
        "TYPE" if arguments.len() == 1 => {
            Reply::Simple(if node.contains(connection.db, &arguments[0]) { "string" } else { "none" }.to_owned())
        }
        "STRLEN" if arguments.len() == 1 => {
            Reply::Integer(node.get(connection.db, &arguments[0]).map_or(0, |record| record.value.len() as i64))
        }
        "APPEND" if arguments.len() == 2 => append(node, connection.db, arguments),
        "INCR" if arguments.len() == 1 => increment(node, connection.db, &arguments[0], 1),
        "DECR" if arguments.len() == 1 => increment(node, connection.db, &arguments[0], -1),
        "INCRBY" | "DECRBY" if arguments.len() == 2 => match parse_i64(&arguments[1]) {
            Some(step) => {
                let step = if name == "DECRBY" { step.checked_neg() } else { Some(step) };
                match step {
                    Some(step) => increment(node, connection.db, &arguments[0], step),
                    None => Reply::Error("ERR increment or decrement would overflow".to_owned()),
                }
            }
            None => Reply::Error("ERR value is not an integer or out of range".to_owned()),
        },
        "TTL" if arguments.len() == 1 => ttl(node, connection.db, &arguments[0], false),
        "PTTL" if arguments.len() == 1 => ttl(node, connection.db, &arguments[0], true),
        "EXPIRE" | "PEXPIRE" | "EXPIREAT" | "PEXPIREAT" if arguments.len() == 2 => {
            expire(node, connection.db, &arguments[0], &name, &arguments[1])
        }
        "PERSIST" if arguments.len() == 1 => match node.set_deadline(connection.db, &arguments[0], None) {
            Ok(true) => Reply::Integer(1),
            Ok(false) => Reply::Integer(0),
            Err(error) => store_error(error),
        },
        "RENAME" | "RENAMENX" if arguments.len() == 2 => {
            match node.rename(connection.db, &arguments[0], &arguments[1], name == "RENAMENX") {
                Ok(RenameOutcome::Renamed) => {
                    if name == "RENAMENX" {
                        Reply::Integer(1)
                    }
                    else {
                        Reply::Simple("OK".to_owned())
                    }
                }
                Ok(RenameOutcome::DestinationPresent) => Reply::Integer(0),
                Ok(RenameOutcome::Missing) => Reply::Error("ERR no such key".to_owned()),
                Err(error) => store_error(error),
            }
        }
        _ => match arity(&name) {
            Some((minimum, maximum)) if !fits(arguments.len() + 1, minimum, maximum) => wrong_arity(&name),
            Some(_) => Reply::Error(format!(
                "ERR command '{}' is not implemented by this service",
                name.to_ascii_lowercase()
            )),
            None => unknown_command(request),
        },
    }
}

fn read(node: &Node, db: u8, key: &[u8]) -> Reply {
    node.get(db, key).map_or(Reply::Null, |record| Reply::Bulk(record.value.clone()))
}

fn set(node: &mut Node, db: u8, arguments: &[Vec<u8>]) -> Reply {
    const SYNTAX: &str = "ERR syntax error";
    if arguments.len() < 2 {
        return wrong_arity("SET");
    }
    let key = &arguments[0];
    let value = &arguments[1];
    let mut only_if_absent = false;
    let mut only_if_present = false;
    let mut keep_ttl = false;
    let mut return_previous = false;
    let mut deadline = None;
    let mut index = 2;
    while index < arguments.len() {
        match ascii_upper(&arguments[index]).as_str() {
            "NX" => only_if_absent = true,
            "XX" => only_if_present = true,
            "GET" => return_previous = true,
            "KEEPTTL" => keep_ttl = true,
            option @ ("EX" | "PX" | "EXAT" | "PXAT") => {
                let Some(raw) = arguments.get(index + 1) else {
                    return Reply::Error(SYNTAX.to_owned());
                };
                let Some(amount) = parse_i64(raw) else {
                    return Reply::Error("ERR value is not an integer or out of range".to_owned());
                };
                let now = now_unix_ms();
                let milliseconds = match option {
                    "EX" => amount.checked_mul(1000),
                    "PX" => Some(amount),
                    "EXAT" => amount.checked_mul(1000),
                    _ => Some(amount),
                };
                let Some(milliseconds) = milliseconds else {
                    return Reply::Error("ERR invalid expire time in 'set' command".to_owned());
                };
                if matches!(option, "EX" | "PX") {
                    if milliseconds <= 0 {
                        return Reply::Error("ERR invalid expire time in 'set' command".to_owned());
                    }
                    deadline = Some(now.saturating_add(milliseconds));
                }
                else {
                    deadline = Some(milliseconds);
                }
                index += 1;
            }
            _ => return Reply::Error(SYNTAX.to_owned()),
        }
        index += 1;
    }
    if only_if_absent && only_if_present {
        return Reply::Error(SYNTAX.to_owned());
    }
    let previous = node.get(db, key).map(|record| record.value.clone());
    if (only_if_absent && previous.is_some()) || (only_if_present && previous.is_none()) {
        return if return_previous { previous.map_or(Reply::Null, Reply::Bulk) } else { Reply::Null };
    }
    if keep_ttl {
        deadline = node.deadline(db, key);
    }
    match node.set(db, key, value, deadline) {
        Ok(()) => {
            if return_previous {
                previous.map_or(Reply::Null, Reply::Bulk)
            }
            else {
                Reply::Simple("OK".to_owned())
            }
        }
        Err(error) => store_error(error),
    }
}

fn getex(node: &mut Node, db: u8, arguments: &[Vec<u8>]) -> Reply {
    let key = &arguments[0];
    if arguments.len() == 1 {
        return read(node, db, key);
    }
    if arguments.len() != 2 && arguments.len() != 3 {
        return Reply::Error("ERR syntax error".to_owned());
    }
    let option = ascii_upper(&arguments[1]);
    if option == "PERSIST" {
        if arguments.len() != 2 {
            return Reply::Error("ERR syntax error".to_owned());
        }
        let value = node.get(db, key).map(|record| record.value.clone());
        if value.is_some() {
            if let Err(error) = node.set_deadline(db, key, None) {
                return store_error(error);
            }
        }
        return value.map_or(Reply::Null, Reply::Bulk);
    }
    if !matches!(option.as_str(), "EX" | "PX" | "EXAT" | "PXAT") || arguments.len() != 3 {
        return Reply::Error("ERR syntax error".to_owned());
    }
    let Some(amount) = parse_i64(&arguments[2]) else {
        return Reply::Error("ERR value is not an integer or out of range".to_owned());
    };
    let now = now_unix_ms();
    let deadline = match option.as_str() {
        "EX" | "EXAT" => amount.checked_mul(1000),
        _ => Some(amount),
    };
    let Some(deadline) = deadline else {
        return Reply::Error("ERR invalid expire time in 'getex' command".to_owned());
    };
    let deadline = if matches!(option.as_str(), "EX" | "PX") { now.saturating_add(deadline) } else { deadline };
    if matches!(option.as_str(), "EX" | "PX") && deadline <= now {
        return Reply::Error("ERR invalid expire time in 'getex' command".to_owned());
    }
    match node.set_deadline(db, key, Some(deadline)) {
        Ok(true) => read(node, db, key),
        Ok(false) => Reply::Null,
        Err(error) => store_error(error),
    }
}

fn append(node: &mut Node, db: u8, arguments: &[Vec<u8>]) -> Reply {
    let mut value = node.get(db, &arguments[0]).map_or_else(Vec::new, |record| record.value.clone());
    value.extend_from_slice(&arguments[1]);
    let deadline = node.deadline(db, &arguments[0]);
    match node.set(db, &arguments[0], &value, deadline) {
        Ok(()) => Reply::Integer(value.len() as i64),
        Err(error) => store_error(error),
    }
}

fn increment(node: &mut Node, db: u8, key: &[u8], step: i64) -> Reply {
    let current = match node.get(db, key) {
        None => 0,
        Some(record) => match parse_i64(&record.value) {
            Some(value) => value,
            None => return Reply::Error("ERR value is not an integer or out of range".to_owned()),
        },
    };
    let Some(total) = current.checked_add(step) else {
        return Reply::Error("ERR increment or decrement would overflow".to_owned());
    };
    let deadline = node.deadline(db, key);
    match node.set(db, key, total.to_string().as_bytes(), deadline) {
        Ok(()) => Reply::Integer(total),
        Err(error) => store_error(error),
    }
}

fn ttl(node: &Node, db: u8, key: &[u8], milliseconds: bool) -> Reply {
    let Some(record) = node.get(db, key) else {
        return Reply::Integer(-2);
    };
    let Some(deadline) = record.expires_at else {
        return Reply::Integer(-1);
    };
    let remaining = (deadline - now_unix_ms()).max(0);
    Reply::Integer(if milliseconds { remaining } else { (remaining + 500) / 1000 })
}

fn expire(node: &mut Node, db: u8, key: &[u8], command: &str, raw: &[u8]) -> Reply {
    let Some(amount) = parse_i64(raw) else {
        return Reply::Error("ERR value is not an integer or out of range".to_owned());
    };
    if node.get(db, key).is_none() {
        return Reply::Integer(0);
    }
    let now = now_unix_ms();
    let absolute = matches!(command, "EXPIREAT" | "PEXPIREAT");
    let milliseconds = if matches!(command, "EXPIRE" | "EXPIREAT") { amount.checked_mul(1000) } else { Some(amount) };
    let Some(milliseconds) = milliseconds else {
        return Reply::Error(format!("ERR invalid expire time in '{}' command", command.to_ascii_lowercase()));
    };
    let deadline = if absolute { milliseconds } else { now.saturating_add(milliseconds) };
    if deadline <= now {
        return match node.delete(db, key) {
            Ok(_) => Reply::Integer(1),
            Err(error) => store_error(error),
        };
    }
    match node.set_deadline(db, key, Some(deadline)) {
        Ok(true) => Reply::Integer(1),
        Ok(false) => Reply::Integer(0),
        Err(error) => store_error(error),
    }
}

fn exec(node: &mut Node, connection: &mut Connection) -> Reply {
    let Some(multi) = connection.multi.take() else {
        return Reply::Error("ERR EXEC without MULTI".to_owned());
    };
    if multi.aborted {
        return Reply::Error("EXECABORT Transaction discarded because of previous errors.".to_owned());
    }
    let mut replies = Vec::with_capacity(multi.queue.len());
    for request in multi.queue {
        replies.push(dispatch(node, connection, &request));
    }
    Reply::Array(replies)
}

fn hello(connection: &mut Connection, arguments: &[Vec<u8>]) -> Reply {
    if arguments.len() > 3 {
        return Reply::Error("ERR syntax error".to_owned());
    }
    if let Some(raw) = arguments.first() {
        match parse_i64(raw) {
            Some(version @ 2) | Some(version @ 3) => {
                connection.protocol = version as u8;
                if arguments.len() > 1 {
                    return Reply::Error("ERR AUTH called without any password configured for the default user. Are you sure your configuration is correct?".to_owned());
                }
            }
            Some(_) => return Reply::Error("NOPROTO unsupported protocol version".to_owned()),
            None => return Reply::Error("NOPROTO unsupported protocol version".to_owned()),
        }
    }
    else {
        connection.protocol = 3;
    }
    Reply::Map(vec![
        (Reply::Bulk(b"server".to_vec()), Reply::Bulk(b"redis".to_vec())),
        (Reply::Bulk(b"version".to_vec()), Reply::Bulk(SERVER_VERSION.as_bytes().to_vec())),
        (Reply::Bulk(b"proto".to_vec()), Reply::Integer(i64::from(connection.protocol))),
        (Reply::Bulk(b"id".to_vec()), Reply::Integer(connection.id as i64)),
        (Reply::Bulk(b"mode".to_vec()), Reply::Bulk(b"standalone".to_vec())),
        (Reply::Bulk(b"role".to_vec()), Reply::Bulk(b"master".to_vec())),
        (Reply::Bulk(b"modules".to_vec()), Reply::Array(Vec::new())),
    ])
}

fn client(connection: &mut Connection, arguments: &[Vec<u8>]) -> Reply {
    let Some(subcommand) = arguments.first() else {
        return Reply::Error("ERR wrong number of arguments for 'client' command".to_owned());
    };
    match ascii_upper(subcommand).as_str() {
        "SETINFO" if arguments.len() == 3 => Reply::Simple("OK".to_owned()),
        "SETNAME" if arguments.len() == 2 => Reply::Simple("OK".to_owned()),
        "GETNAME" if arguments.len() == 1 => Reply::Bulk(Vec::new()),
        "ID" if arguments.len() == 1 => Reply::Integer(connection.id as i64),
        _ => Reply::Error(format!(
            "ERR unknown subcommand or wrong number of arguments for '{}'. Try CLIENT HELP.",
            String::from_utf8_lossy(subcommand).to_ascii_lowercase()
        )),
    }
}

/// Static arity window, `(minimum, maximum)`, maximum `None` means unbounded.
fn arity(name: &str) -> Option<(usize, Option<usize>)> {
    Some(match name {
        "PING" => (1, Some(2)),
        "ECHO" => (2, Some(2)),
        "SELECT" | "GET" | "GETDEL" | "TYPE" | "STRLEN" | "INCR" | "DECR" | "TTL" | "PTTL" | "PERSIST" => {
            (2, Some(2))
        }
        "GETSET" | "SETNX" | "APPEND" | "INCRBY" | "DECRBY" | "RENAME" | "RENAMENX" | "EXPIRE" | "PEXPIRE"
        | "EXPIREAT" | "PEXPIREAT" => (3, Some(3)),
        "SET" => (3, None),
        "GETEX" | "MGET" | "EXISTS" | "DEL" => (2, None),
        "MSET" => (3, None),
        "HELLO" | "CLIENT" => (1, None),
        "MULTI" | "EXEC" | "DISCARD" | "QUIT" | "FLUSHDB" | "FLUSHALL" | "DBSIZE" => (1, Some(1)),
        _ => return None,
    })
}

fn fits(arguments: usize, minimum: usize, maximum: Option<usize>) -> bool {
    arguments >= minimum && maximum.is_none_or(|maximum| arguments <= maximum)
}

fn wrong_arity(name: &str) -> Reply {
    Reply::Error(format!("ERR wrong number of arguments for '{}' command", name.to_ascii_lowercase()))
}

fn unknown_command(request: &[Vec<u8>]) -> Reply {
    let name = String::from_utf8_lossy(&request[0]);
    let mut message = format!("ERR unknown command '{name}'");
    if request.len() > 1 {
        message.push_str(", with args beginning with: ");
        for argument in &request[1..] {
            message.push_str(&format!("'{}', ", String::from_utf8_lossy(argument)));
        }
    }
    Reply::Error(message)
}

fn store_error(error: std::io::Error) -> Reply {
    Reply::Error(format!("ERR storage failure: {error}"))
}

fn ascii_upper(value: &[u8]) -> String {
    value.iter().map(u8::to_ascii_uppercase).map(char::from).collect()
}

/// Canonical integer parsing: optional minus sign, no leading zeros, no plus sign.
pub fn parse_i64(bytes: &[u8]) -> Option<i64> {
    let text = std::str::from_utf8(bytes).ok()?;
    let (negative, digits) = match text.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, text),
    };
    if digits.is_empty() || digits.len() > 19 || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    if digits.len() > 1 && digits.starts_with('0') {
        return None;
    }
    let value: i64 = digits.parse().ok()?;
    if negative {
        value.checked_neg()
    }
    else {
        Some(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_integers_reject_leading_zero_and_plus() {
        assert_eq!(parse_i64(b"42"), Some(42));
        assert_eq!(parse_i64(b"-7"), Some(-7));
        assert_eq!(parse_i64(b"05"), None);
        assert_eq!(parse_i64(b"+5"), None);
        assert_eq!(parse_i64(b""), None);
    }
}
