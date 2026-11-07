"""Shared-case conformance checks for the installed Python package.

Every case under `projects/redis.ts/packages/redis-harness/cases` is also executed
by the TypeScript package checks.
Expected values are literal: they come from the documented wire grammar, the
documented shard/catalog layout, and documented Redis command semantics. No
check compares one implementation against another at run time.
"""

import json
import os
import tempfile
from pathlib import Path

import pytest

from redis import (
    Store,
    decode_command,
    decode_reply,
    encode_command,
    encode_reply,
    parse_integer,
    repair_shard,
)

CASES_ENV = "REDIS_CONFORMANCE_REPORT"


def _seed_directory(entry, directory):
    for seed in entry.get("seed", []):
        path = os.path.join(directory, seed["path"])
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(raw(seed["hex"]))


def _cases_directory():
    relative = Path("projects", "redis.ts", "packages", "redis-harness", "cases")
    for parent in Path(__file__).resolve().parents:
        candidate = parent / relative
        if candidate.is_dir():
            return candidate
    raise RuntimeError("could not locate the harness cases")


def _load_cases():
    directory = _cases_directory()
    rows = []
    for path in sorted(directory.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        for entry in payload["cases"]:
            if "sides" in entry and "py" not in entry["sides"]:
                continue
            entry["table"] = payload["table"]
            rows.append(entry)
    return rows


CASES = _load_cases()
OBSERVATIONS = []


def raw(hex_text):
    return bytes.fromhex(hex_text)


def hex_of(value):
    if isinstance(value, (bytes, bytearray)):
        return bytes(value).hex()
    return value


def normalize(value):
    if isinstance(value, (bytes, bytearray)):
        return {"kind": "bytes", "hex": bytes(value).hex()}
    if isinstance(value, list) and all(isinstance(item, (bytes, bytearray)) for item in value):
        return {"kind": "bytes-list", "hex": [bytes(item).hex() for item in value]}
    if isinstance(value, tuple) and len(value) == 2:
        return {"kind": "increment", "value": value[0], "error": value[1]}
    return value


def assert_expectation(observed, expected, label):
    if expected is None:
        assert observed is None, label
        return
    if "bytes" in expected:
        assert hex_of(observed) == expected["bytes"], label
        return
    if "int" in expected:
        assert observed == expected["int"], label
        return
    if "bool" in expected:
        assert observed == expected["bool"], label
        return
    if "text" in expected:
        assert observed == expected["text"], label
        return
    if "hexList" in expected:
        assert [hex_of(item) for item in observed] == expected["hexList"], label
        return
    if "increment" in expected:
        assert {"value": observed[0], "error": observed[1]} == expected["increment"], label
        return
    raise AssertionError(f"{label}: unsupported expectation {expected!r}")


def perform(store, entry):
    call = entry["call"]
    if call == "set":
        return store.set(entry["db"], raw(entry["keyHex"]), raw(entry["valueHex"]), entry.get("expiresAt"))
    if call == "get":
        return store.get(entry["db"], raw(entry["keyHex"]))
    if call == "exists":
        return store.exists(entry["db"], raw(entry["keyHex"]))
    if call == "delete":
        return store.delete(entry["db"], raw(entry["keyHex"]))
    if call == "deadline":
        return store.deadline(entry["db"], raw(entry["keyHex"]))
    if call == "deadline_set":
        return store.deadline(entry["db"], raw(entry["keyHex"])) is not None
    if call == "expire":
        return store.expire(entry["db"], raw(entry["keyHex"]), entry.get("expiresAt"))
    if call == "get_kind":
        return store.get_kind(entry["db"], entry["kind"], raw(entry["keyHex"]))
    if call == "set_kind":
        return store.set_kind(
            entry["db"],
            entry["kind"],
            raw(entry["keyHex"]),
            raw(entry["valueHex"]),
            entry.get("expiresAt"),
        )
    if call == "delete_kind":
        return store.delete_kind(entry["db"], entry["kind"], raw(entry["keyHex"]))
    if call == "exists_kind":
        return store.exists_kind(entry["db"], entry["kind"], raw(entry["keyHex"]))
    if call == "deadline_kind":
        return store.deadline_kind(entry["db"], entry["kind"], raw(entry["keyHex"]))
    if call == "expire_kind":
        return store.expire_kind(entry["db"], entry["kind"], raw(entry["keyHex"]), entry.get("expiresAt"))
    if call == "rename":
        return store.rename(
            entry["db"],
            raw(entry["sourceHex"]),
            raw(entry["destinationHex"]),
            entry.get("ifAbsent") is True,
        )
    if call == "append":
        return store.append(entry["db"], raw(entry["keyHex"]), raw(entry["valueHex"]))
    if call == "incr_by":
        return store.incr_by(entry["db"], raw(entry["keyHex"]), entry["delta"])
    if call == "keys":
        return store.keys(entry["db"])
    if call == "set_many":
        return store.set_many(entry["db"], [(raw(key), raw(value)) for key, value in entry["entries"]])
    if call == "flush_db":
        return store.flush_db(entry["db"])
    if call == "size":
        return store.size(entry["db"])
    raise AssertionError(f"unsupported store call {call}")


def run_steps(store, steps, directory):
    current = store
    seen = []
    for entry in steps:
        if entry["call"] == "reopen":
            current.flush()
            current = Store(directory)
            seen.append({"call": "reopen", "value": None})
            continue
        if entry["call"] == "repair_shard":
            shard_id = repair_shard(directory)
            if "expect" in entry:
                assert_expectation(shard_id, entry["expect"], entry["call"])
            seen.append({"call": "repair_shard", "value": shard_id})
            continue
        value = perform(current, entry)
        if "expect" in entry:
            assert_expectation(value, entry["expect"], entry["call"])
        seen.append({"call": entry["call"], "value": normalize(value)})
    return seen


def _canonical_int(text):
    try:
        return int(text)
    except (ValueError, TypeError):
        return None


def _string_body(store, db, key):
    value = store.get(db, key)
    return b"" if value is None else value


def _write_string(store, db, key, value):
    """Rewrites the string bytes while carrying the deadline the key already holds."""
    store.set(db, key, value, store.deadline(db, key))


def _wrong_type(store, db, key):
    return any(store.exists_kind(db, kind, key) for kind in ("hash", "list", "set", "zset"))


def py_command(store, db, args):
    """Drives the documented command semantics through the exported primitives.

    The Python package intentionally ships primitives only, so command cases are
    applied here with the documented Redis semantics and then checked against the
    same literal post-state expectations the TypeScript dispatcher is checked
    against.
    """
    import math
    import time

    name = args[0].decode().upper()
    rest = args[1:]
    if name == "SET" and len(rest) == 2:
        store.set(db, rest[0], rest[1])
    elif name == "SETNX" and len(rest) == 2:
        if not store.exists(db, rest[0]):
            store.set(db, rest[0], rest[1])
    elif name == "SETEX" and len(rest) == 3:
        try:
            seconds = int(rest[1].decode())
        except (ValueError, TypeError):
            seconds = None
        if seconds is not None and seconds > 0:
            store.set(db, rest[0], rest[2], int(time.time_ns() // 1_000_000) + seconds * 1000)
    elif name == "GETSET" and len(rest) == 2:
        store.set(db, rest[0], rest[1])
    elif name == "GETDEL" and len(rest) == 1:
        store.delete(db, rest[0])
    elif name == "APPEND" and len(rest) == 2:
        if not _wrong_type(store, db, rest[0]):
            store.append(db, rest[0], rest[1])
    elif name == "SETRANGE" and len(rest) == 3:
        offset = _canonical_int(rest[1].decode())
        if offset is not None and offset >= 0 and not _wrong_type(store, db, rest[0]):
            replacement = rest[2]
            if replacement:
                body = bytearray(_string_body(store, db, rest[0]))
                if len(body) < offset:
                    body.extend(bytes(offset - len(body)))
                body[offset:offset + len(replacement)] = replacement
                _write_string(store, db, rest[0], bytes(body))
    elif name == "INCRBYFLOAT" and len(rest) == 2:
        if not _wrong_type(store, db, rest[0]):
            try:
                increment = float(rest[1].decode())
            except (ValueError, TypeError):
                increment = None
            if increment is not None and math.isfinite(increment):
                try:
                    current = float(_string_body(store, db, rest[0]).decode()) if store.exists(db, rest[0]) else 0.0
                except ValueError:
                    current = None
                if current is not None and math.isfinite(current):
                    result = current + increment
                    if math.isfinite(result):
                        text = repr(result)
                        if text.endswith(".0"):
                            text = text[:-2]
                        _write_string(store, db, rest[0], text.encode())
    elif name == "SETBIT" and len(rest) == 3:
        offset = _canonical_int(rest[1].decode())
        bit = rest[2].decode()
        if offset is not None and 0 <= offset <= 0xffffffff and bit in ("0", "1") and not _wrong_type(store, db, rest[0]):
            body = bytearray(_string_body(store, db, rest[0]))
            index = offset // 8
            if len(body) <= index:
                body.extend(bytes(index + 1 - len(body)))
            shift = 7 - offset % 8
            if bit == "1":
                body[index] |= 1 << shift
            else:
                body[index] &= ~(1 << shift) & 0xff
            _write_string(store, db, rest[0], bytes(body))
    elif name == "DEL":
        for key in rest:
            store.delete(db, key)
    elif name == "MSET":
        store.set_many(db, list(zip(rest[0::2], rest[1::2])))
    elif name in ("INCR", "DECR", "INCRBY", "DECRBY"):
        delta = 1 if name == "INCR" else -1 if name == "DECR" else None
        if name in ("INCRBY", "DECRBY"):
            try:
                delta = int(rest[1].decode())
            except (ValueError, TypeError, IndexError):
                delta = None
            if name == "DECRBY" and delta is not None:
                delta = -delta
        if delta is not None:
            store.incr_by(db, rest[0], delta)
    elif name == "PERSIST" and len(rest) == 1:
        if store.exists(db, rest[0]) and store.deadline(db, rest[0]) is not None:
            store.expire(db, rest[0], None)
    elif name in ("EXPIRE", "PEXPIRE") and len(rest) == 2:
        try:
            amount = int(rest[1].decode())
        except (ValueError, TypeError):
            amount = None
        if amount is not None and store.exists(db, rest[0]):
            if amount <= 0:
                store.delete(db, rest[0])
            else:
                scale = 1000 if name == "EXPIRE" else 1
                store.expire(db, rest[0], int(time.time_ns() // 1_000_000) + amount * scale)
    elif name == "RENAME" and len(rest) == 2:
        store.rename(db, rest[0], rest[1])
    elif name == "RENAMENX" and len(rest) == 2:
        store.rename(db, rest[0], rest[1], True)
    elif name == "FLUSHDB":
        store.flush_db(db)
    elif name == "FLUSHALL":
        for index in range(16):
            store.flush_db(index)


def run_case(entry):
    op = entry["op"]
    if op == "encode_command":
        frame = encode_command([raw(item) for item in entry["argsHex"]])
        assert frame.hex() == entry["expect"]["hex"]
        return {"hex": frame.hex()}
    if op == "decode_command":
        try:
            decoded = decode_command(raw(entry["inputHex"]))
        except ValueError as error:
            assert str(error) == entry["expect"]["error"]
            return {"error": str(error)}
        if decoded is None:
            assert entry["expect"].get("incomplete") is True
            return {"incomplete": True}
        consumed, args = decoded
        assert consumed == entry["expect"]["consumed"]
        assert [item.hex() for item in args] == entry["expect"]["argsHex"]
        return {"consumed": consumed, "argsHex": [item.hex() for item in args]}
    if op == "encode_reply":
        try:
            frame = encode_reply(json.dumps(entry["spec"]), entry["protocol"])
        except ValueError as error:
            assert str(error) == entry["expect"]["error"]
            return {"error": str(error)}
        assert frame.hex() == entry["expect"]["hex"]
        return {"hex": frame.hex()}
    if op == "decode_reply":
        try:
            decoded = decode_reply(raw(entry["inputHex"]))
        except ValueError as error:
            assert str(error) == entry["expect"]["error"]
            return {"error": str(error)}
        if decoded is None:
            assert entry["expect"].get("incomplete") is True
            return {"incomplete": True}
        spec_text, consumed = decoded
        assert consumed == entry["expect"]["consumed"]
        assert json.loads(spec_text) == entry["expect"]["spec"]
        return {"consumed": consumed, "spec": json.loads(spec_text)}
    if op == "parse_integer":
        value = parse_integer(entry["inputText"].encode())
        assert value == entry["expect"]["value"]
        return {"value": value}
    if op in ("store", "layout"):
        directory = tempfile.mkdtemp(prefix="redis-conformance-")
        _seed_directory(entry, directory)
        if "expectOpenError" in entry:
            message = None
            try:
                Store(directory)
            except RuntimeError as error:
                message = str(error)
            assert message == entry["expectOpenError"]
            return {"openError": message}
        store = Store(directory)
        if op == "layout":
            run_steps(store, entry["steps"], directory)
            store.flush()
            shard = Path(directory, "local-0.yykv").read_bytes().hex()
            catalog = Path(directory, "local-0.yyds").read_bytes().hex()
            assert shard == entry["shardHex"]
            assert catalog == entry["catalogHex"]
            assert len(shard) // 2 == entry["shardLen"]
            return {"shardHex": shard, "catalogHex": catalog, "shardLen": len(shard) // 2}
        return {"steps": run_steps(store, entry["steps"], directory)}
    if op == "repair":
        directory = tempfile.mkdtemp(prefix="redis-conformance-")
        _seed_directory(entry, directory)
        message = None
        try:
            Store(directory)
        except RuntimeError as error:
            message = str(error)
        assert message == entry["expectOpenError"]
        shard_id = repair_shard(directory)
        assert shard_id == entry["expectShardId"]
        catalog = Path(directory, "local-0.yyds").read_bytes().hex()
        assert catalog == entry["catalogHex"]
        store = Store(directory)
        return {
            "openError": message,
            "shardId": shard_id,
            "catalogHex": catalog,
            "steps": run_steps(store, entry["steps"], directory),
        }
    if op == "command":
        directory = tempfile.mkdtemp(prefix="redis-conformance-")
        store = Store(directory)
        run_steps(store, entry["setup"], directory)
        py_command(store, 0, [item.encode() for item in entry["argsText"]])
        return {"steps": run_steps(store, entry["effect"], directory)}
    if op == "stress":
        return run_stress(entry)
    raise AssertionError(f"unsupported case op {op}")


def run_stress(entry):
    import time

    kind = entry["kind"]
    if kind == "scale":
        directory = tempfile.mkdtemp(prefix="redis-stress-")
        store = Store(directory)
        keys = [("%s%06d" % (entry["prefix"], index)).encode() for index in range(entry["count"])]
        values = [("v%d" % index).encode() for index in range(entry["count"])]
        started = time.perf_counter()
        store.set_many(0, list(zip(keys, values)))
        write_ms = int((time.perf_counter() - started) * 1000)
        assert store.size(0) == entry["expect"]["size"]
        all_keys = store.keys(0)
        assert len(all_keys) == entry["expect"]["keysLength"]
        assert all_keys[0].hex() == entry["expect"]["first"]
        assert all_keys[-1].hex() == entry["expect"]["last"]
        reopen_started = time.perf_counter()
        again = Store(directory)
        assert again.size(0) == entry["expect"]["reopenSize"]
        reopen_ms = int((time.perf_counter() - reopen_started) * 1000)
        assert os.path.getsize(os.path.join(directory, "local-0.yykv")) == entry["expect"]["shardLen"]
        assert write_ms < 120_000 and reopen_ms < 120_000
        return {"writeMs": write_ms, "reopenMs": reopen_ms, "size": entry["expect"]["size"]}
    if kind == "bulk":
        directory = tempfile.mkdtemp(prefix="redis-stress-")
        store = Store(directory)
        value = b"0123456789abcdef" * (entry["size"] // 16)
        started = time.perf_counter()
        store.set(0, b"big", value)
        write_ms = int((time.perf_counter() - started) * 1000)
        read_started = time.perf_counter()
        back = store.get(0, b"big")
        read_ms = int((time.perf_counter() - read_started) * 1000)
        assert len(back) == entry["expect"]["length"]
        assert back[:16].hex() == entry["expect"]["prefixHex"]
        assert back[-16:].hex() == entry["expect"]["suffixHex"]
        assert os.path.getsize(os.path.join(directory, "local-0.yykv")) == entry["expect"]["shardLen"]
        assert write_ms < 120_000 and read_ms < 120_000
        return {"writeMs": write_ms, "readMs": read_ms, "length": len(back)}
    if kind == "reply-bulk":
        value = b"0123456789abcdef" * (entry["size"] // 16)
        started = time.perf_counter()
        frame = encode_reply(json.dumps({"type": "bulk", "bytes": list(value)}), 2)
        encode_ms = int((time.perf_counter() - started) * 1000)
        assert len(frame) == entry["expect"]["frameLen"]
        spec_text, consumed = decode_reply(frame)
        assert consumed == entry["expect"]["consumed"]
        assert len(json.loads(spec_text)["bytes"]) == entry["size"]
        return {"encodeMs": encode_ms, "frameLen": len(frame)}
    if kind == "nesting":
        spec = {"type": "bulk", "bytes": [120]}
        for _ in range(entry["depth"]):
            spec = {"type": "array", "value": [spec]}
        frame = encode_reply(json.dumps(spec), 2)
        assert len(frame) == entry["expect"]["frameLen"]
        spec_text, consumed = decode_reply(frame)
        assert consumed == entry["expect"]["consumed"]
        return {"frameLen": len(frame), "depth": entry["depth"]}
    if kind == "stream":
        frames = [encode_command([b"SET", ("k%d" % index).encode(), ("v%d" % index).encode()]) for index in range(entry["count"])]
        stream = b"".join(frames)
        offset = 0
        last = None
        started = time.perf_counter()
        while offset < len(stream):
            decoded = decode_command(stream[offset:])
            assert decoded is not None
            offset += decoded[0]
            last = decoded[1]
        decode_ms = int((time.perf_counter() - started) * 1000)
        assert offset == entry["expect"]["totalConsumed"]
        assert last[0] == b"SET"
        assert last[1] == entry["expect"]["lastKey"].encode()
        assert last[2] == entry["expect"]["lastValue"].encode()
        return {"decodeMs": decode_ms, "totalConsumed": offset}
    if kind == "reply-stream":
        stream = b"+OK\r\n" * entry["count"]
        offset = 0
        started = time.perf_counter()
        while offset < len(stream):
            decoded = decode_reply(stream[offset:])
            assert decoded is not None
            offset += decoded[1]
        decode_ms = int((time.perf_counter() - started) * 1000)
        assert offset == entry["expect"]["totalConsumed"]
        return {"decodeMs": decode_ms, "totalConsumed": offset}
    if kind == "incr":
        directory = tempfile.mkdtemp(prefix="redis-stress-")
        store = Store(directory)
        if entry.get("seed", 0) > 0:
            keys = [("%s%06d" % (entry["prefix"], index)).encode() for index in range(entry["seed"])]
            values = [("v%d" % index).encode() for index in range(entry["seed"])]
            store.set_many(0, list(zip(keys, values)))
        last = None
        started = time.perf_counter()
        for _ in range(entry["count"]):
            last = store.incr_by(0, b"counter", 1)
        write_ms = int((time.perf_counter() - started) * 1000)
        flush_started = time.perf_counter()
        store.flush()
        flush_ms = int((time.perf_counter() - flush_started) * 1000)
        assert last[0] == entry["expect"]["value"]
        assert store.get(0, b"counter") == str(entry["expect"]["value"]).encode()
        reopen_started = time.perf_counter()
        again = Store(directory)
        persisted = again.get(0, b"counter")
        reopen_ms = int((time.perf_counter() - reopen_started) * 1000)
        assert persisted == str(entry["expect"]["value"]).encode()
        assert write_ms < 120_000 and flush_ms < 120_000 and reopen_ms < 120_000
        return {"writeMs": write_ms, "flushMs": flush_ms, "reopenMs": reopen_ms, "value": last[0], "persisted": True}
    raise AssertionError(f"unsupported stress kind {kind}")


@pytest.mark.parametrize("entry", CASES, ids=[entry["id"] for entry in CASES])
def test_conformance(entry):
    try:
        observed = run_case(entry)
    except AssertionError as error:
        OBSERVATIONS.append({"id": entry["id"], "face": entry["face"], "ok": False, "observed": None, "error": str(error)})
        raise
    OBSERVATIONS.append({"id": entry["id"], "face": entry["face"], "ok": True, "observed": observed})


@pytest.fixture(scope="module", autouse=True)
def _conformance_report():
    yield
    target = os.environ.get(CASES_ENV)
    if not target:
        return
    payload = {
        "format": "redis.conformance-report/v1",
        "side": "py",
        "cases": OBSERVATIONS,
    }
    with open(target, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
