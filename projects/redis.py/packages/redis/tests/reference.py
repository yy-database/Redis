"""Independent expectations for the wire format and the storage layout.

Every function here is written from the protocol and layout description
alone. Acceptance checks compare the extension output against these values,
so a defect in the extension cannot validate itself.
"""

YYKV_MAGIC = b"YYKV\x03"
YYDS_MAGIC = b"YYDS\x01"


def fnv1a(data: bytes) -> int:
    """FNV-1a over a snapshot body, used as an integrity check only."""
    value = 0xCBF29CE484222325
    for byte in data:
        value ^= byte
        value = (value * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return value


def _take(data: bytes, cursor: int, length: int) -> tuple[bytes, int]:
    if cursor + length > len(data):
        raise ValueError("truncated field")
    return data[cursor:cursor + length], cursor + length


def _take_bytes(data: bytes, cursor: int) -> tuple[bytes, int]:
    if cursor + 4 > len(data):
        raise ValueError("truncated length")
    length = int.from_bytes(data[cursor:cursor + 4], "little")
    return _take(data, cursor + 4, length)


def _take_u32(data: bytes, cursor: int) -> tuple[int, int]:
    raw, cursor = _take(data, cursor, 4)
    return int.from_bytes(raw, "little"), cursor


def _take_u64(data: bytes, cursor: int) -> tuple[int, int]:
    raw, cursor = _take(data, cursor, 8)
    return int.from_bytes(raw, "little"), cursor


def parse_shard(data: bytes) -> dict:
    """Reads one `.yykv` snapshot: five byte magic, checksum, then the body."""
    if len(data) < 13:
        raise ValueError("shard shorter than its header")
    if data[:5] != YYKV_MAGIC:
        raise ValueError("unknown shard magic")
    checksum = int.from_bytes(data[5:13], "little")
    body = data[13:]
    if fnv1a(body) != checksum:
        raise ValueError("shard checksum mismatch")
    next_revision, cursor = _take_u64(body, 0)
    count, cursor = _take_u32(body, cursor)
    records = []
    for _ in range(count):
        namespace, cursor = _take_bytes(body, cursor)
        key, cursor = _take_bytes(body, cursor)
        revision, cursor = _take_u64(body, cursor)
        deadline, cursor = _take_u64(body, cursor)
        tag_raw, cursor = _take(body, cursor, 1)
        if tag_raw[0] != 0:
            raise ValueError("unsupported payload tag")
        value, cursor = _take_bytes(body, cursor)
        records.append(
            {
                "namespace": namespace.decode("utf-8"),
                "key": key,
                "value": value,
                "revision": revision,
                "expires_at": None if deadline == 0 else deadline,
            }
        )
    if cursor != len(body):
        raise ValueError("trailing shard bytes")
    return {"checksum": checksum, "next_revision": next_revision, "records": records}


def parse_catalog(data: bytes) -> dict:
    """Reads one `.yyds` catalog header and its shard registrations."""
    if len(data) < 9:
        raise ValueError("catalog shorter than its header")
    if data[:5] != YYDS_MAGIC:
        raise ValueError("unknown catalog magic")
    version, cursor = _take_u32(data, 5)
    cursor += 8  # schema section and routing epoch, both zero for this contract
    count, cursor = _take_u32(data, cursor)
    shard_ids = []
    for _ in range(count):
        raw, cursor = _take_bytes(data, cursor)
        shard_ids.append(raw.decode("utf-8"))
    return {"version": version, "shard_ids": shard_ids, "trailing": data[cursor:]}


def canonical_integer(data: bytes) -> int | None:
    """Canonical signed 64 bit integer: no plus sign, no leading zeros."""
    if not data:
        return None
    digits = data[1:] if data[:1] == b"-" else data
    if not digits or len(digits) > 19:
        return None
    if not all(0x30 <= byte <= 0x39 for byte in digits):
        return None
    if len(digits) > 1 and digits[:1] == b"0":
        return None
    value = int(digits)
    if data[:1] == b"-":
        value = -value
    if value < -(2**63) or value > 2**63 - 1:
        return None
    return value


def encode_command(args: list) -> bytes:
    """Multibulk request: a length header followed by length prefixed arguments."""
    out = bytearray(b"*%d\r\n" % len(args))
    for arg in args:
        raw = bytes(arg)
        out += b"$%d\r\n" % len(raw)
        out += raw
        out += b"\r\n"
    return bytes(out)


def _line(data: bytes, start: int):
    end = data.find(b"\r\n", start)
    if end < 0:
        return None
    return data[start:end], end + 2


def _count(raw: bytes) -> int | None:
    if not raw or len(raw) > 20:
        return None
    digits = raw[1:] if raw[:1] == b"-" else raw
    if not digits or not all(0x30 <= byte <= 0x39 for byte in digits):
        return None
    value = int(digits)
    if value > 2**63 - 1:
        return None
    return -value if raw[:1] == b"-" else value


def decode_command(data: bytes):
    """Parses one request from the front, or returns `None` when incomplete."""
    if not data:
        return None
    if data[:1] != b"*":
        raise ValueError("expected a multibulk request")
    header = _line(data, 1)
    if header is None:
        return None
    raw, offset = header
    count = _count(raw)
    if count is None or count <= 0:
        raise ValueError("invalid multibulk length")
    args = []
    for _ in range(count):
        if offset >= len(data):
            return None
        if data[offset:offset + 1] != b"$":
            raise ValueError("expected a bulk string")
        header = _line(data, offset + 1)
        if header is None:
            return None
        raw, offset = header
        length = _count(raw)
        if length is None or length < 0:
            raise ValueError("invalid bulk length")
        end = offset + length
        if len(data) < end + 2:
            return None
        if data[end:end + 2] != b"\r\n":
            raise ValueError("invalid bulk string terminator")
        args.append(data[offset:end])
        offset = end + 2
    return args, offset


def encode_reply(spec: dict, protocol: int) -> bytes:
    """RESP2 / RESP3 frame for one reply specification."""
    kind = spec["type"]
    if kind == "simple":
        return b"+" + spec["value"].encode() + b"\r\n"
    if kind == "error":
        return b"-" + spec["value"].encode() + b"\r\n"
    if kind == "int":
        return b":%d\r\n" % spec["value"]
    if kind == "bulk":
        raw = bytes(spec["bytes"])
        return b"$%d\r\n" % len(raw) + raw + b"\r\n"
    if kind == "null":
        return b"_\r\n" if protocol >= 3 else b"$-1\r\n"
    if kind == "array":
        return b"*%d\r\n" % len(spec["value"]) + b"".join(
            encode_reply(item, protocol) for item in spec["value"]
        )
    if kind == "map":
        entries = spec["value"]
        head = b"%%%d\r\n" % len(entries) if protocol >= 3 else b"*%d\r\n" % (len(entries) * 2)
        return head + b"".join(
            encode_reply(key, protocol) + encode_reply(value, protocol) for key, value in entries
        )
    raise ValueError(f"unknown reply type {kind}")


def decode_reply(data: bytes):
    """Parses one reply from the front, or returns `None` when incomplete."""
    if not data:
        return None
    header = _line(data, 1)
    if header is None:
        return None
    raw, next_offset = header
    prefix = data[:1]
    if prefix == b"+":
        return {"type": "simple", "value": raw.decode()}, next_offset
    if prefix == b"-":
        return {"type": "error", "value": raw.decode()}, next_offset
    if prefix == b":":
        value = _count(raw)
        if value is None:
            raise ValueError("reply integer is not canonical")
        return {"type": "int", "value": value}, next_offset
    if prefix == b"_":
        return {"type": "null"}, next_offset
    if prefix == b"$":
        length = _count(raw)
        if length is None:
            raise ValueError("reply bulk length is not canonical")
        if length < 0:
            return {"type": "null"}, next_offset
        end = next_offset + length
        if len(data) < end + 2:
            return None
        return {"type": "bulk", "bytes": list(data[next_offset:end])}, end + 2
    if prefix in (b"*", b"%"):
        count = _count(raw)
        if count is None or count < 0:
            raise ValueError("reply aggregate length is not canonical")
        values = []
        offset = next_offset
        replies = count * 2 if prefix == b"%" else count
        for _ in range(replies):
            nested = decode_reply(data[offset:])
            if nested is None:
                return None
            value, consumed = nested
            values.append(value)
            offset += consumed
        if prefix == b"%":
            entries = [[values[index], values[index + 1]] for index in range(0, len(values), 2)]
            return {"type": "map", "value": entries}, offset
        return {"type": "array", "value": values}, offset
    raise ValueError("unknown reply prefix")
