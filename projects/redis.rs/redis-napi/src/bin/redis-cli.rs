//! `redis-cli` entry point: executes one command or reads commands from stdin.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpStream;
use std::process::ExitCode;

fn main() -> ExitCode {
    let mut host = "127.0.0.1".to_owned();
    let mut port = 6379_u16;
    let mut database = 0_u8;
    let mut command = Vec::new();
    let mut arguments = std::env::args().skip(1);
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "-h" | "--host" => match arguments.next() {
                Some(value) => host = value,
                None => return usage("-h expects a host"),
            },
            "-p" | "--port" => match arguments.next().and_then(|value| value.parse().ok()) {
                Some(value) => port = value,
                None => return usage("-p expects a port"),
            },
            "-n" | "--database" => match arguments.next().and_then(|value| value.parse().ok()) {
                Some(value) => database = value,
                None => return usage("-n expects a database index"),
            },
            "--help" => {
                print_usage();
                return ExitCode::SUCCESS;
            }
            other => {
                command.push(other.to_owned());
                command.extend(arguments);
                break;
            }
        }
    }

    let mut client = match Client::connect(&host, port) {
        Ok(client) => client,
        Err(error) => {
            eprintln!("Could not connect to Redis at {host}:{port}: {error}");
            return ExitCode::FAILURE;
        }
    };
    if database != 0 && !client.execute(&["SELECT".to_owned(), database.to_string()]).is_ok() {
        return ExitCode::FAILURE;
    }

    if command.is_empty() {
        let stdin = std::io::stdin();
        let mut failed = false;
        for line in stdin.lock().lines() {
            let Ok(line) = line else {
                break;
            };
            let parts: Vec<String> = line.split_whitespace().map(str::to_owned).collect();
            if parts.is_empty() {
                continue;
            }
            if !client.execute(&parts).is_ok() {
                failed = true;
            }
        }
        return if failed { ExitCode::FAILURE } else { ExitCode::SUCCESS };
    }

    if client.execute(&command).is_ok() { ExitCode::SUCCESS } else { ExitCode::FAILURE }
}

struct Client {
    writer: TcpStream,
    reader: BufReader<TcpStream>,
}

impl Client {
    fn connect(host: &str, port: u16) -> std::io::Result<Self> {
        let stream = TcpStream::connect((host, port))?;
        stream.set_read_timeout(Some(std::time::Duration::from_secs(5)))?;
        let reader = BufReader::new(stream.try_clone()?);
        Ok(Self { writer: stream, reader })
    }

    fn execute(&mut self, parts: &[String]) -> Result<(), ()> {
        let mut request = format!("*{}\r\n", parts.len()).into_bytes();
        for part in parts {
            request.extend_from_slice(format!("${}\r\n{part}\r\n", part.len()).as_bytes());
        }
        if self.writer.write_all(&request).is_err() {
            eprintln!("Error: connection lost");
            return Err(());
        }
        match read_value(&mut self.reader) {
            Ok(value) => {
                let failed = matches!(value, Value::Error(_));
                print_value(&value, 0);
                if failed { Err(()) } else { Ok(()) }
            }
            Err(error) => {
                eprintln!("Error: {error}");
                Err(())
            }
        }
    }
}

#[derive(Debug)]
enum Value {
    Simple(String),
    Error(String),
    Integer(i64),
    Bulk(Option<Vec<u8>>),
    Array(Vec<Value>),
    Map(Vec<(Value, Value)>),
    Null,
    Boolean(bool),
    Double(String),
}

fn read_value(reader: &mut impl BufRead) -> std::io::Result<Value> {
    let mut line = String::new();
    reader.read_line(&mut line)?;
    if line.is_empty() {
        return Err(std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "connection closed"));
    }
    let (kind, payload) = line.trim_end_matches(['\r', '\n']).split_at(1);
    let payload = payload.to_owned();
    Ok(match kind {
        "+" => Value::Simple(payload),
        "-" => Value::Error(payload),
        ":" => Value::Integer(payload.parse().unwrap_or(0)),
        "_" => Value::Null,
        "#" => Value::Boolean(payload == "t"),
        "," => Value::Double(payload),
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
                Value::Bulk(Some(bytes))
            }
        }
        "*" | "%" => {
            let count: i64 = payload.parse().unwrap_or(0);
            if count < 0 {
                Value::Null
            }
            else {
                let pairs = kind == "%";
                let mut values = Vec::with_capacity(count as usize * if pairs { 2 } else { 1 });
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
        }
        _ => return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "unknown reply type")),
    })
}

fn print_value(value: &Value, depth: usize) {
    let indent = "  ".repeat(depth);
    match value {
        Value::Simple(text) => println!("{indent}{text}"),
        Value::Error(text) => println!("{indent}(error) {text}"),
        Value::Integer(number) => println!("{indent}(integer) {number}"),
        Value::Bulk(Some(bytes)) => println!("{indent}\"{}\"", String::from_utf8_lossy(bytes).replace('"', "\\\"")),
        Value::Bulk(None) | Value::Null => println!("{indent}(nil)"),
        Value::Boolean(flag) => println!("{indent}(integer) {}", i32::from(*flag)),
        Value::Double(number) => println!("{indent}(double) {number}"),
        Value::Array(values) => {
            if values.is_empty() {
                println!("{indent}(empty array)");
                return;
            }
            for (index, value) in values.iter().enumerate() {
                print!("{indent}{}) ", index + 1);
                print_value(value, depth + 1);
            }
        }
        Value::Map(entries) => {
            if entries.is_empty() {
                println!("{indent}(empty map)");
                return;
            }
            for (index, (key, value)) in entries.iter().enumerate() {
                print!("{indent}{}) ", index + 1);
                print_key(key);
                println!();
                print_value(value, depth + 1);
            }
        }
    }
}

fn print_key(value: &Value) {
    match value {
        Value::Bulk(Some(bytes)) => print!("\"{}\"", String::from_utf8_lossy(bytes)),
        other => print!("{other:?}"),
    }
}

fn usage(reason: &str) -> ExitCode {
    eprintln!("redis-cli: {reason}");
    print_usage();
    ExitCode::FAILURE
}

fn print_usage() {
    println!("usage: redis-cli [-h <host>] [-p <port>] [-n <database>] [command [arguments...]]");
}
