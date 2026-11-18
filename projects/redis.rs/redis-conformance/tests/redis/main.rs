//! Redis gateway detailed correctness matrix migrated from the upstream
//! `database-server` integration suite `tests/redis/`.
//!
//! 用例身份保留：测试二进制名仍为 `redis`，模块路径与测试名和上游旧套件一致，
//! 中文意图注释与期望值原样搬运，判定全部走上游公开 API，不在下游重造。
//! 上游最小 smoke（`gateway.rs` 的 `PING` / `INFO` 两例）保留在上游仓，不在此重复。

mod blocking;
mod collections;
mod face_parity;
mod getex;
mod object;
mod pubsub;
mod resp;
mod strings;
mod watch;
