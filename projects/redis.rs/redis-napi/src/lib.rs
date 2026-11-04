//! Redis-compatible wire service backed by YYDS `.yyds` and `.yykv` storage.
//!
//! The library exposes the storage node, the RESP front end, and the command
//! dispatcher so the server binary, the Python binding, and tests share one
//! implementation.

pub mod commands;
pub mod format;
pub mod resp;
pub mod server;
pub mod store;

pub use commands::Connection;
pub use resp::Reply;
pub use server::Server;
pub use store::Node;

/// Opens a node over `data_dir` and serves it on `port`.
pub fn serve(data_dir: impl AsRef<std::path::Path>, port: u16) -> std::io::Result<Server> {
    let node = Node::open(data_dir)?;
    Server::start(std::sync::Arc::new(std::sync::Mutex::new(node)), port)
}
