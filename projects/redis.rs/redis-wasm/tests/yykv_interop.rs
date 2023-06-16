//! Cross-repository `.yykv` fixtures.
//!
//! The shard snapshot layout belongs to `database-formats`. These fixtures pin
//! both directions: a snapshot written here must decode upstream, a snapshot
//! upstream writes must decode here, and both writers must produce the same bytes
//! for the same records.

use std::collections::BTreeMap;

use database_formats::yy::yykv::{self, InlineValue, Key, ObjectRef, Record as UpstreamRecord, StoredValue};
use redis_wasm::format::{decode_shard, encode_shard, Record, Records};

/// Next revision above every fixture record, as the shard contract requires.
const NEXT_REVISION: u64 = 4;

/// One record description shared by both writers.
type Fixture = (&'static str, &'static [u8], &'static [u8], u64, Option<i64>);

fn fixtures() -> Vec<Fixture> {
    vec![
        ("redis:db0", &b"alpha"[..], &b"one"[..], 1, None),
        ("redis:db1", &b"beta"[..], &b"two"[..], 2, Some(4_000_000_000_000)),
        ("redis:db0", &b"binary"[..], &[0x00, 0xff, 0x01][..], 3, None),
    ]
}

fn local_records() -> Records {
    let mut records = Records::new();
    for (namespace, key, value, revision, expires_at) in fixtures() {
        records.insert(
            (namespace.to_owned(), key.to_vec()),
            Record {
                namespace: namespace.to_owned(),
                key: key.to_vec(),
                value: value.to_vec(),
                revision,
                expires_at,
            },
        );
    }
    records
}

fn upstream_records() -> BTreeMap<Key, UpstreamRecord> {
    fixtures()
        .into_iter()
        .map(|(namespace, key, value, revision, expires_at)| {
            let key = Key::new(namespace, key.to_vec());
            (
                key.clone(),
                UpstreamRecord {
                    key,
                    value: StoredValue::Inline(InlineValue(value.to_vec())),
                    revision,
                    expires_at,
                },
            )
        })
        .collect()
}

#[test]
fn both_writers_produce_the_same_bytes_and_read_each_other() {
    let local = local_records();
    let upstream = upstream_records();
    let local_bytes = encode_shard(&local, NEXT_REVISION).expect("local encode");
    let upstream_bytes = yykv::encode_snapshot(&upstream, NEXT_REVISION).expect("upstream encode");
    assert_eq!(local_bytes, upstream_bytes, "both writers must emit the same snapshot bytes");

    let decoded = yykv::decode_snapshot_strict(&local_bytes).expect("upstream reads the local snapshot");
    assert_eq!(decoded.next_revision, NEXT_REVISION);
    assert_eq!(decoded.records, upstream);

    let (read_back, next_revision) = decode_shard(&upstream_bytes).expect("local reads the upstream snapshot");
    assert_eq!(next_revision, NEXT_REVISION);
    assert_eq!(read_back, local);
}

#[test]
fn object_backed_snapshots_are_rejected() {
    let key = Key::new("redis:db0", b"large".to_vec());
    let upstream: BTreeMap<Key, UpstreamRecord> = [(
        key.clone(),
        UpstreamRecord {
            key,
            value: StoredValue::Object(ObjectRef { hash_hex: "ab".to_owned() }),
            revision: 1,
            expires_at: None,
        },
    )]
    .into_iter()
    .collect();
    let bytes = yykv::encode_snapshot(&upstream, 2).expect("upstream writes object-backed values");

    assert!(yykv::decode_snapshot_strict(&bytes).is_ok());
    assert_eq!(
        decode_shard(&bytes).unwrap_err().0,
        "shared object payloads are not supported here"
    );
}

#[test]
fn legacy_v2_snapshots_are_rejected() {
    let mut bytes = yykv::KV_LEGACY_MAGIC.to_vec();
    bytes.extend_from_slice(&[0_u8; 8]);
    assert_eq!(
        decode_shard(&bytes).unwrap_err().0,
        "legacy .yykv v2 snapshot carries no checksum: delete the shard and let the node recreate it"
    );
}
