"""Installed-state acceptance checks for the Python binding.

The extension module comes from a wheel installed into a scratch environment,
so these checks exercise the shipped artifact and the documented layouts.
"""

import json
import sys
from pathlib import Path

import pytest

import reference
from redis import Store, decode_command, decode_reply, encode_command, encode_reply, parse_integer

import redis._native as _native


def bulk(value) -> dict:
    return {"type": "bulk", "bytes": list(bytes(value))}


def hello_spec(protocol: int) -> dict:
    """Reply specification documented for `HELLO` on either protocol version."""
    return {
        "type": "map",
        "value": [
            [bulk(b"server"), bulk(b"redis")],
            [bulk(b"version"), bulk(b"7.4.0")],
            [bulk(b"proto"), {"type": "int", "value": protocol}],
            [bulk(b"id"), {"type": "int", "value": 1}],
            [bulk(b"mode"), bulk(b"standalone")],
            [bulk(b"role"), bulk(b"master")],
            [bulk(b"modules"), {"type": "array", "value": []}],
        ],
    }


def test_extension_is_an_installed_binary(tmp_path):
    package_dir = Path(_native.__file__).parent
    assert "site-packages" in package_dir.as_posix(), package_dir
    assert str(tmp_path) not in package_dir.as_posix()
    suffix = ".pyd" if sys.platform == "win32" else ".so"
    binaries = sorted(package_dir.glob(f"*{suffix}"))
    assert binaries, f"no {suffix} binary below {package_dir}"
    assert all("site-packages" in binary.as_posix() for binary in binaries)


def test_values_persist_across_reopen(tmp_path):
    data_dir = str(tmp_path)
    writer = Store(data_dir)
    writer.set(0, b"greeting", b"hello")
    assert writer.get(0, b"greeting") == b"hello"
    assert writer.get(1, b"greeting") is None

    reader = Store(data_dir)
    assert reader.get(0, b"greeting") == b"hello"
    assert reader.get(1, b"greeting") is None


def test_shard_layout_matches_the_documented_bytes(tmp_path):
    data_dir = str(tmp_path)
    store = Store(data_dir)
    deadline = 4_000_000_000_000
    store.set(0, b"alpha", b"one")
    store.set(1, b"beta", b"two", deadline)
    store.set(0, b"gamma", b"three")

    snapshot = reference.parse_shard((tmp_path / "local-0.yykv").read_bytes())
    assert snapshot["records"] and len(snapshot["records"]) == 3
    by_key = {record["key"]: record for record in snapshot["records"]}
    assert set(by_key) == {b"alpha", b"beta", b"gamma"}
    assert by_key[b"alpha"]["namespace"] == "redis:db0"
    assert by_key[b"beta"]["namespace"] == "redis:db1"
    assert by_key[b"alpha"]["value"] == b"one"
    assert by_key[b"beta"]["expires_at"] == deadline
    assert by_key[b"gamma"]["expires_at"] is None


def test_shard_revisions_stay_inside_the_snapshot(tmp_path):
    data_dir = str(tmp_path)
    store = Store(data_dir)
    store.set(0, b"one", b"1")
    store.set(0, b"two", b"2")

    first = reference.parse_shard((tmp_path / "local-0.yykv").read_bytes())
    revisions = [record["revision"] for record in first["records"]]
    assert len(set(revisions)) == len(revisions)
    assert all(revision >= 1 for revision in revisions)
    assert all(revision <= first["next_revision"] for revision in revisions)
    assert first["next_revision"] >= len(revisions)

    reopened = Store(data_dir)
    reopened.set(0, b"three", b"3")
    second = reference.parse_shard((tmp_path / "local-0.yykv").read_bytes())
    assert len(second["records"]) == 3
    assert second["next_revision"] > first["next_revision"]


def test_rename_carries_the_deadline(tmp_path):
    store = Store(str(tmp_path))
    deadline = 4_000_000_000_000
    store.set(0, b"source", b"value", deadline)
    assert store.rename(0, b"source", b"destination") == "renamed"
    assert store.get(0, b"source") is None
    assert store.get(0, b"destination") == b"value"
    assert store.deadline(0, b"destination") == deadline

    assert store.rename(0, b"missing", b"destination") == "missing"
    store.set(0, b"other", b"occupant")
    store.set(0, b"destination", b"value", deadline)
    assert store.rename(0, b"destination", b"other", True) == "destination-present"
    assert store.deadline(0, b"other") is None
    assert store.deadline(0, b"destination") == deadline


def test_commands_decode_incrementally(tmp_path):
    first = reference.encode_command([b"SET", b"key", b"value"])
    second = reference.encode_command([b"GET", b"key"])
    decoded = decode_command(first)
    assert decoded is not None
    consumed, args = decoded
    assert consumed == len(first)
    assert args == [b"SET", b"key", b"value"]

    stream = first + second
    head_consumed, _ = decode_command(stream)
    assert head_consumed == len(first)
    tail = decode_command(stream[head_consumed:])
    assert tail is not None
    assert tail[1] == [b"GET", b"key"]

    assert decode_command(first[:-1]) is None
    assert decode_command(b"") is None


def test_integers_reject_non_canonical_forms():
    accepted = {
        b"42": 42,
        b"-7": -7,
        b"0": 0,
        b"-0": 0,
        b"9007199254740991": 9007199254740991,
        b"-9007199254740991": -9007199254740991,
    }
    for raw, expected in accepted.items():
        assert parse_integer(raw) == expected
        assert reference.canonical_integer(raw) == expected

    rejected = [b"01", b"+1", b"1.5", b"", b"00", b"1_0", b" 1", b"1 ", b"0x10", b"-", b"9223372036854775808"]
    for raw in rejected:
        assert parse_integer(raw) is None
        assert reference.canonical_integer(raw) is None


def test_increments_reject_non_integers(tmp_path):
    store = Store(str(tmp_path))
    assert store.incr_by(0, b"counter", 1) == (1, None)
    store.set(0, b"text", b"hello")
    assert store.incr_by(0, b"text", 1) == (None, "value is not an integer or out of range")
    store.set(0, b"huge", b"9223372036854775807")
    assert store.incr_by(0, b"huge", 1) == (None, "increment or decrement would overflow")


def test_maps_become_flat_arrays_before_hello_three():
    frame = encode_reply(json.dumps(hello_spec(2)), 2)
    assert frame.startswith(b"*14\r\n")
    assert frame == reference.encode_reply(hello_spec(2), 2)
    parsed = reference.decode_reply(frame)
    assert parsed is not None
    spec, consumed = parsed
    assert consumed == len(frame)
    assert spec["type"] == "array"
    assert len(spec["value"]) == 14


def test_maps_use_the_map_header_after_hello_three():
    frame = encode_reply(json.dumps(hello_spec(3)), 3)
    assert frame.startswith(b"%7\r\n")
    assert frame == reference.encode_reply(hello_spec(3), 3)
    parsed = decode_reply(frame)
    assert parsed is not None
    spec_text, consumed = parsed
    assert consumed == len(frame)
    assert json.loads(spec_text) == hello_spec(3)


def test_null_uses_the_negotiated_shape():
    assert encode_reply(json.dumps({"type": "null"}), 2) == b"$-1\r\n"
    assert encode_reply(json.dumps({"type": "null"}), 3) == b"_\r\n"

    null_three = decode_reply(b"_\r\n")
    assert null_three is not None
    assert json.loads(null_three[0]) == {"type": "null"}
    assert null_three[1] == 3
    null_two = decode_reply(b"$-1\r\n")
    assert null_two is not None
    assert json.loads(null_two[0]) == {"type": "null"}
    assert null_two[1] == 5


def test_replies_round_trip_through_their_specification():
    specs = [
        {"type": "simple", "value": "OK"},
        {"type": "error", "value": "ERR no such key"},
        {"type": "int", "value": -3},
        {"type": "bulk", "bytes": list(b"hello")},
        {"type": "bulk", "bytes": [0, 255, 1]},
        {"type": "null"},
        {"type": "array", "value": [{"type": "int", "value": 1}, {"type": "bulk", "bytes": list(b"a")}]},
    ]
    for protocol in (2, 3):
        for spec in specs:
            frame = encode_reply(json.dumps(spec), protocol)
            assert frame == reference.encode_reply(spec, protocol)
            decoded = decode_reply(frame)
            assert decoded is not None
            text, consumed = decoded
            assert consumed == len(frame)
            assert json.loads(text) == spec

    mapping = {"type": "map", "value": [[bulk(b"k"), {"type": "int", "value": 7}]]}
    assert encode_reply(json.dumps(mapping), 3) == b"%1\r\n$1\r\nk\r\n:7\r\n"
    assert encode_reply(json.dumps(mapping), 2) == b"*2\r\n$1\r\nk\r\n:7\r\n"
    decoded = decode_reply(b"%1\r\n$1\r\nk\r\n:7\r\n")
    assert decoded is not None
    assert json.loads(decoded[0]) == mapping
    assert decoded[1] == 15


def test_reply_decoding_reports_the_consumed_bytes():
    first = b"+OK\r\n"
    second = b"*2\r\n:7\r\n$3\r\nabc\r\n"
    stream = first + second

    head = decode_reply(stream)
    assert head is not None
    assert json.loads(head[0]) == {"type": "simple", "value": "OK"}
    assert head[1] == len(first)
    tail = decode_reply(stream[len(first):])
    assert tail is not None
    spec_text, consumed = tail
    assert consumed == len(second)
    assert json.loads(spec_text) == {
        "type": "array",
        "value": [{"type": "int", "value": 7}, {"type": "bulk", "bytes": list(b"abc")}],
    }


def test_a_truncated_bulk_reply_reports_incompleteness():
    truncated = b"$5\r\nhel"
    assert decode_reply(truncated) is None
    assert reference.decode_reply(truncated) is None
    assert decode_reply(b"*2\r\n$3\r\nabc\r\n:4") is None

    hole = b"$0\r\n\r\n"
    spec_text, consumed = decode_reply(hole)
    assert json.loads(spec_text) == {"type": "bulk", "bytes": []}
    assert consumed == len(hole)


def test_command_encoding_matches_the_multibulk_layout():
    args = [b"SET", b"greeting", b"hello"]
    assert encode_command(args) == reference.encode_command(args)

    binary = [b"SET", b"binary", b"\x00\xff\x01"]
    assert encode_command(binary) == b"*3\r\n$3\r\nSET\r\n$6\r\nbinary\r\n$3\r\n\x00\xff\x01\r\n"


def test_command_framing_violations_are_rejected():
    for raw, message in (
        (b"GET key\r\n", "expected a multibulk request"),
        (b"*0\r\n", "invalid multibulk length"),
        (b"*1\r\n$-2\r\n", "invalid bulk length"),
        (b"*1\r\nx\r\n", "expected a bulk string"),
        (b"*1\r\n$2\r\nab\rX", "invalid bulk string terminator"),
    ):
        with pytest.raises(ValueError, match=message):
            decode_command(raw)


def test_corrupted_shard_bodies_are_rejected(tmp_path):
    data_dir = str(tmp_path)
    Store(data_dir).set(0, b"key", b"value")
    shard_path = tmp_path / "local-0.yykv"
    bytes_written = bytearray(shard_path.read_bytes())
    reference.parse_shard(bytes(bytes_written))

    bytes_written[-1] ^= 0xFF
    shard_path.write_bytes(bytes(bytes_written))
    with pytest.raises(RuntimeError, match="checksum mismatch"):
        Store(data_dir)

    shard_path.write_bytes(b"YYKV\x03short")
    with pytest.raises(RuntimeError, match="truncated"):
        Store(data_dir)


def test_catalog_names_the_routed_shard(tmp_path):
    data_dir = str(tmp_path)
    Store(data_dir).set(0, b"key", b"value")
    catalog = reference.parse_catalog((tmp_path / "local-0.yyds").read_bytes())
    assert catalog["version"] == 0
    assert catalog["shard_ids"] == ["local-0"]
    assert (tmp_path / "local-0.yykv").exists()


def test_append_preserves_the_deadline(tmp_path):
    store = Store(str(tmp_path))
    deadline = 4_000_000_000_000
    store.set(0, b"key", b"abc", deadline)
    assert store.append(0, b"key", b"def") == 6
    assert store.get(0, b"key") == b"abcdef"
    assert store.deadline(0, b"key") == deadline
    assert store.incr_by(0, b"counter", 2) == (2, None)
