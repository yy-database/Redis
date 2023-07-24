//! Portable primitives: RESP framing, YYDS storage codecs, and the `.yykv` node.
//!
//! No socket listener, no command dispatcher, no process entry point lives here.
//! Every function is a single orthogonal operation a library user can compose.

pub mod format;
pub mod resp;
pub mod store;

pub use format::{FormatError, Record, Records};
pub use resp::{Reply, Request, decode_command, decode_reply, encode_command, encode_reply};
pub use store::{Node, RenameOutcome};
