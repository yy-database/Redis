//! TCP front end: one thread per client, no async runtime required.

use std::io::{BufReader, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use crate::commands::{dispatch, Connection};
use crate::resp::{read_request, write_reply, Reply};
use crate::store::Node;

/// Running server handle.
#[derive(Debug)]
pub struct Server {
    addr: SocketAddr,
    shutdown: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

impl Server {
    /// Binds `port` on the loopback interface, using `0` for an ephemeral port.
    pub fn start(node: Arc<Mutex<Node>>, port: u16) -> std::io::Result<Self> {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, port))?;
        listener.set_nonblocking(true)?;
        let addr = listener.local_addr()?;
        let shutdown = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&shutdown);
        let worker = std::thread::Builder::new().name("redis-accept".to_owned()).spawn(move || {
            let counter = AtomicU64::new(1);
            while !flag.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        // Windows propagates the listener non-blocking flag to accepted sockets.
                        let _ = stream.set_nonblocking(false);
                        let node = Arc::clone(&node);
                        let id = counter.fetch_add(1, Ordering::Relaxed);
                        let _ = std::thread::Builder::new()
                            .name(format!("redis-client-{id}"))
                            .spawn(move || handle_connection(stream, node, id));
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(2));
                    }
                    Err(_) => break,
                }
            }
        })?;
        Ok(Self { addr, shutdown, worker: Some(worker) })
    }

    /// Address clients should connect to.
    pub fn addr(&self) -> SocketAddr {
        self.addr
    }

    /// Stops accepting and waits for the accept loop to finish.
    pub fn shutdown(&mut self) {
        self.shutdown.store(true, Ordering::Relaxed);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn handle_connection(stream: TcpStream, node: Arc<Mutex<Node>>, id: u64) {
    let Ok(writer_stream) = stream.try_clone() else {
        return;
    };
    let mut writer = writer_stream;
    let mut reader = BufReader::new(stream);
    let mut connection = Connection::new(id);
    loop {
        match read_request(&mut reader) {
            Ok(Some(request)) => {
                let reply = match node.lock() {
                    Ok(mut node) => dispatch(&mut node, &mut connection, &request.args),
                    Err(_) => {
                        let _ = write_reply(&mut writer, &Reply::Error("ERR storage lock poisoned".to_owned()), 2);
                        break;
                    }
                };
                if write_reply(&mut writer, &reply, connection.protocol).is_err() {
                    if std::env::var_os("REDIS_SERVER_TRACE").is_some() {
                        eprintln!("redis-server connection {id} write failed");
                    }
                    break;
                }
                if connection.close {
                    break;
                }
            }
            Ok(None) => break,
            Err(error) => {
                if std::env::var_os("REDIS_SERVER_TRACE").is_some() {
                    eprintln!("redis-server connection {id} failed: {error}");
                }
                let message = if error.kind() == std::io::ErrorKind::InvalidData {
                    error.to_string()
                }
                else {
                    "ERR Protocol error: unexpected end of stream".to_owned()
                };
                let _ = write_reply(&mut writer, &Reply::Error(message), connection.protocol);
                break;
            }
        }
    }
}

/// Synchronous `PING` probe used by readiness checks.
pub fn ping(addr: SocketAddr) -> std::io::Result<bool> {
    let mut stream = TcpStream::connect(addr)?;
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
    stream.write_all(b"*1\r\n$4\r\nPING\r\n")?;
    let mut reader = BufReader::new(stream);
    let Some(request) = read_request(&mut reader)? else {
        return Ok(false);
    };
    Ok(request.args.len() == 1)
}
