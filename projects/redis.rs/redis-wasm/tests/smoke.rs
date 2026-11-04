//! Minimal Rust smoke test over the portable primitives.
//!
//! A library user composes a command frame, a shard write, and a reply frame.
//! The full acceptance set lives in the TypeScript and Python compositions.

use std::io;

use redis_wasm::format::Record;
use redis_wasm::resp::{decode_command, encode_command, encode_reply, Reply};
use redis_wasm::store::Node;

fn temporary_dir(name: &str) -> std::path::PathBuf {
    let path = std::env::temp_dir().join(format!("redis-smoke-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&path);
    path
}

#[test]
fn command_frame_round_trips_without_a_listener() -> io::Result<()> {
    let args = vec![b"SET".to_vec(), b"greeting".to_vec(), b"hello".to_vec()];
    let bytes = encode_command(&args);
    let (request, consumed) = decode_command(&bytes).expect("decode").expect("complete request");
    assert_eq!(consumed, bytes.len());
    assert_eq!(request.args, args);
    Ok(())
}

#[test]
fn storage_round_trip_through_the_shard() -> io::Result<()> {
    let data_dir = temporary_dir("storage");
    let mut node = Node::open(&data_dir)?;
    node.set(0, b"greeting", b"hello", None)?;
    let stored: Option<&Record> = node.get(0, b"greeting");
    assert_eq!(stored.map(|record| record.value.as_slice()), Some(b"hello".as_slice()));
    assert!(node.get(1, b"greeting").is_none());
    assert!(node.delete(0, b"greeting")?);
    let reply = encode_reply(&Reply::Bulk(b"hello".to_vec()), 2);
    assert_eq!(reply, b"$5\r\nhello\r\n");
    let _ = std::fs::remove_dir_all(&data_dir);
    Ok(())
}
