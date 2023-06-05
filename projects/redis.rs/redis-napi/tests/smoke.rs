//! Minimal smoke test over the Node-API exports.
//!
//! The binding owns no listener, so this test composes directly: one `Store`
//! open with a set/get pair, one command frame round-trip, one reply frame
//! round-trip. The full acceptance set lives in the TypeScript and Python
//! compositions.

use napi::bindgen_prelude::Buffer;
use redis_napi::{Store, decode_command, decode_reply, encode_command, encode_reply};

#[test]
fn exports_compose_without_a_node_loop() {
    let data_dir = std::env::temp_dir().join(format!("redis-napi-smoke-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&data_dir);

    let mut store = Store::new(data_dir.display().to_string()).expect("open store");
    store.set(0, Buffer::from(b"greeting".to_vec()), Buffer::from(b"hello".to_vec()), None).expect("set");
    let stored = store.get(0, Buffer::from(b"greeting".to_vec())).expect("read back");
    assert_eq!(stored.as_ref(), b"hello");
    assert!(store.get(1, Buffer::from(b"greeting".to_vec())).is_none());
    store.flush().expect("flush");

    let frame = encode_command(vec![Buffer::from(b"SET".to_vec()), Buffer::from(b"key".to_vec()), Buffer::from(b"value".to_vec())]);
    assert_eq!(frame.as_ref(), b"*3\r\n$3\r\nSET\r\n$3\r\nkey\r\n$5\r\nvalue\r\n");
    let decoded = decode_command(frame).expect("decode").expect("complete frame");
    assert_eq!(decoded.consumed as usize, 33);
    assert_eq!(decoded.args.len(), 3);
    assert_eq!(decoded.args[0].as_ref(), b"SET");

    let reply = encode_reply("{\"type\":\"bulk\",\"bytes\":[104,101,108,108,111]}".to_owned(), 2).expect("encode reply");
    assert_eq!(reply.as_ref(), b"$5\r\nhello\r\n");
    let decoded = decode_reply(reply).expect("decode").expect("complete frame");
    assert_eq!(decoded.consumed as usize, 11);
    let spec: serde_json::Value = serde_json::from_str(&decoded.spec).expect("spec json");
    assert_eq!(spec, serde_json::json!({ "type": "bulk", "bytes": [104, 101, 108, 108, 111] }));

    let _ = std::fs::remove_dir_all(&data_dir);
}
