Redis composition for Python
============================

The package re-exports the orthogonal primitives that the `_native` extension
provides: the RESP encoder and decoder, the integer parser, and the `.yyds` /
`.yykv` store. The extension itself is built with `maturin` from
`projects/redis.rs/redis-pyo3`.

Acceptance runs against an installed wheel
-----------------------------------------

`npm run gate:test-count:py` builds the wheel, installs it into a fresh virtual
environment, and only then runs the cases. The environment borrows the host
`pytest` through `--system-site-packages` so the run needs no network. The
extension under test is still the one installed into the environment, and the
cases assert that the loaded module file lives under
`venv/Lib/site-packages/_native/` (`.pyd` on Windows, `.so` elsewhere). Do not
treat the run as a source tree test: importing the package without that wheel
must fail.
