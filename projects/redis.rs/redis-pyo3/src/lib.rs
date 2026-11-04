//! Python binding: starts and stops the Rust service from Python.

use std::sync::{Arc, Mutex};

use pyo3::prelude::*;

/// Embedded service instance.
#[pyclass(module = "redis_server")]
struct RedisServer {
    server: Option<redis_napi::Server>,
    data_dir: std::path::PathBuf,
    port: u16,
}

#[pymethods]
impl RedisServer {
    #[new]
    #[pyo3(signature = (port = 0, data_dir = None))]
    fn new(port: u16, data_dir: Option<std::path::PathBuf>) -> PyResult<Self> {
        let data_dir = data_dir.unwrap_or_else(|| {
            std::env::temp_dir().join(format!("redis-pyo3-{}-{}", std::process::id(), port))
        });
        Ok(Self { server: None, data_dir, port })
    }

    /// Starts the service and returns the bound port.
    fn start(&mut self) -> PyResult<u16> {
        let node = redis_napi::Node::open(&self.data_dir)
            .map_err(|error| pyo3::exceptions::PyRuntimeError::new_err(error.to_string()))?;
        let server = redis_napi::Server::start(Arc::new(Mutex::new(node)), self.port)
            .map_err(|error| pyo3::exceptions::PyRuntimeError::new_err(error.to_string()))?;
        self.port = server.addr().port();
        self.server = Some(server);
        Ok(self.port)
    }

    /// Stops the service.
    fn stop(&mut self) {
        if let Some(mut server) = self.server.take() {
            server.shutdown();
        }
    }

    /// Bound port, `0` before a successful start.
    #[getter]
    fn port(&self) -> u16 {
        self.port
    }

    /// Directory holding the `.yyds` catalog and the `.yykv` shard.
    #[getter]
    fn data_dir(&self) -> String {
        self.data_dir.display().to_string()
    }
}

#[pymodule]
fn redis_server(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add_class::<RedisServer>()?;
    module.add("__version__", "0.0.0")?;
    Ok(())
}
