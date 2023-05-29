"""Composed primitives over the compiled extension module.

The extension owns the RESP framing, the `.yyds` catalog and the `.yykv`
shard. This package only re-exports them, so a host can compose a client or
a server loop without importing implementation modules directly.
"""

from _native import (  # noqa: F401
    Store,
    decode_command,
    decode_reply,
    encode_command,
    encode_reply,
    parse_integer,
)

__all__ = [
    "Store",
    "decode_command",
    "decode_reply",
    "encode_command",
    "encode_reply",
    "parse_integer",
]
