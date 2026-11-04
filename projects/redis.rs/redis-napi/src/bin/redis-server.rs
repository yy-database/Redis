//! `redis-server` entry point.

use std::path::PathBuf;
use std::process::ExitCode;

fn main() -> ExitCode {
    let mut port = 6379_u16;
    let mut data_dir = PathBuf::from("./data");
    let mut arguments = std::env::args().skip(1);
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--port" => match arguments.next().and_then(|value| value.parse().ok()) {
                Some(value) => port = value,
                None => return usage("--port expects a number"),
            },
            "--data-dir" => match arguments.next() {
                Some(value) => data_dir = PathBuf::from(value),
                None => return usage("--data-dir expects a path"),
            },
            "--help" | "-h" => {
                print_usage();
                return ExitCode::SUCCESS;
            }
            other => return usage(&format!("unknown option '{other}'")),
        }
    }
    match redis_napi::serve(&data_dir, port) {
        Ok(server) => {
            println!("redis-server listening on {}", server.addr());
            println!("storage: {}", data_dir.canonicalize().unwrap_or(data_dir).display());
            let _server = server;
            std::thread::park();
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("redis-server failed to start: {error}");
            ExitCode::FAILURE
        }
    }
}

fn usage(reason: &str) -> ExitCode {
    eprintln!("redis-server: {reason}");
    print_usage();
    ExitCode::FAILURE
}

fn print_usage() {
    println!("usage: redis-server [--port <port>] [--data-dir <path>]");
}
