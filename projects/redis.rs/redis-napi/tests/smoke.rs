//! Minimal Rust smoke test: the service accepts a connection and completes a
//! `SET` / `GET` round trip, and switches the null shape after `HELLO 3`.

use std::collections::BTreeMap;
use std::io::{BufRead, Write};
use std::net::TcpStream;
use std::sync::{Arc, Mutex};

use redis_napi::{Node, Server};

fn temporary_dir(name: &str) -> std::path::PathBuf {
    let path = std::env::temp_dir().join(format!("redis-smoke-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&path);
    path
}

#[derive(Debug, PartialEq, Eq)]
enum Value {
    Simple(String),
    Error(String),
    Integer(i64),
    Bulk(Option<String>),
    Array(Vec<Value>),
    Map(Vec<(Value, Value)>),
    Null,
}

fn command(stream: &mut TcpStream, parts: &[&str]) -> Value {
    let mut request = format!("*{}\r\n", parts.len()).into_bytes();
    for part in parts {
        request.extend_from_slice(format!("${}\r\n{part}\r\n", part.len()).as_bytes());
    }
    stream.write_all(&request).expect("write request");
    let mut reader = std::io::BufReader::new(stream.try_clone().expect("clone stream"));
    read_value(&mut reader).expect("read reply")
}

fn read_value(reader: &mut impl BufRead) -> std::io::Result<Value> {
    let mut line = String::new();
    reader.read_line(&mut line)?;
    let line = line.trim_end_matches(['\r', '\n']);
    let (kind, payload) = line.split_at(1);
    Ok(match kind {
        "+" => Value::Simple(payload.to_owned()),
        "-" => Value::Error(payload.to_owned()),
        ":" => Value::Integer(payload.parse().unwrap_or_default()),
        "_" => Value::Null,
        "$" => {
            let length: i64 = payload.parse().unwrap_or(-1);
            if length < 0 {
                Value::Bulk(None)
            }
            else {
                let mut bytes = vec![0_u8; length as usize];
                reader.read_exact(&mut bytes)?;
                let mut terminator = [0_u8; 2];
                reader.read_exact(&mut terminator)?;
                Value::Bulk(Some(String::from_utf8_lossy(&bytes).into_owned()))
            }
        }
        "*" | "%" => {
            let count: i64 = payload.parse().unwrap_or_default();
            let pairs = kind == "%";
            let mut values = Vec::new();
            for _ in 0..count {
                values.push(read_value(reader)?);
                if pairs {
                    values.push(read_value(reader)?);
                }
            }
            if pairs {
                let mut entries = Vec::new();
                let mut iterator = values.into_iter();
                while let (Some(key), Some(value)) = (iterator.next(), iterator.next()) {
                    entries.push((key, value));
                }
                Value::Map(entries)
            }
            else {
                Value::Array(values)
            }
        }
        other => panic!("unexpected reply prefix '{other}'"),
    })
}

#[test]
fn set_and_get_round_trip() {
    let data_dir = temporary_dir("round-trip");
    let node = Node::open(&data_dir).expect("open node");
    let mut server = Server::start(Arc::new(Mutex::new(node)), 0).expect("start server");
    let mut stream = TcpStream::connect(server.addr()).expect("connect");
    assert_eq!(command(&mut stream, &["SET", "greeting", "hello"]), Value::Simple("OK".to_owned()));
    assert_eq!(command(&mut stream, &["GET", "greeting"]), Value::Bulk(Some("hello".to_owned())));
    server.shutdown();
    let _ = std::fs::remove_dir_all(&data_dir);
}

#[test]
fn null_reply_uses_resp3_after_hello_three() {
    let data_dir = temporary_dir("hello-three");
    let node = Node::open(&data_dir).expect("open node");
    let mut server = Server::start(Arc::new(Mutex::new(node)), 0).expect("start server");
    let mut stream = TcpStream::connect(server.addr()).expect("connect");
    assert_eq!(command(&mut stream, &["GET", "absent"]), Value::Bulk(None));
    let hello = command(&mut stream, &["HELLO", "3"]);
    let Value::Map(entries) = hello else {
        panic!("HELLO 3 must answer a RESP3 map");
    };
    let fields: BTreeMap<String, Value> = entries
        .into_iter()
        .map(|(key, value)| match (key, value) {
            (Value::Bulk(Some(key)), value) => (key, value),
            other => panic!("unexpected HELLO entry: {other:?}"),
        })
        .collect();
    assert_eq!(fields.get("proto"), Some(&Value::Integer(3)));
    assert_eq!(fields.get("server"), Some(&Value::Bulk(Some("redis".to_owned()))));
    assert_eq!(command(&mut stream, &["GET", "absent"]), Value::Null);
    server.shutdown();
    let _ = std::fs::remove_dir_all(&data_dir);
}

#[test]
fn ttl_and_rename_carry_the_deadline() {
    let data_dir = temporary_dir("ttl-rename");
    let node = Node::open(&data_dir).expect("open node");
    let mut server = Server::start(Arc::new(Mutex::new(node)), 0).expect("start server");
    let mut stream = TcpStream::connect(server.addr()).expect("connect");
    assert_eq!(command(&mut stream, &["SET", "source", "value"]), Value::Simple("OK".to_owned()));
    assert_eq!(command(&mut stream, &["EXPIRE", "source", "10"]), Value::Integer(1));
    let ttl = command(&mut stream, &["TTL", "source"]);
    assert!(matches!(ttl, Value::Integer(value) if (9..=10).contains(&value)));
    assert_eq!(command(&mut stream, &["RENAME", "source", "target"]), Value::Simple("OK".to_owned()));
    assert_eq!(command(&mut stream, &["GET", "source"]), Value::Bulk(None));
    let ttl = command(&mut stream, &["TTL", "target"]);
    assert!(matches!(ttl, Value::Integer(value) if (9..=10).contains(&value)));
    server.shutdown();
    let _ = std::fs::remove_dir_all(&data_dir);
}
