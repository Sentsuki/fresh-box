// store/ —— fresh-box 自己的持久化。
//
// 阶段 4 之前这一层是一堆 JSON 文件加手写的读-改-写协调：
// `profile_index.json` + 一把全局互斥 + 每次读都要和磁盘对账、
// `app_settings.json` + 拆出来的 `backend_prefs.json`、
// `priority_config.json`、`config_override.json`。全部作废，换成一个 SQLite
// 库加按 UUID 命名的配置内容文件。
//
//   %LOCALAPPDATA%\fresh-box\
//     fresh-box.db          SQLite（WAL）：profiles / settings / meta
//     profiles\<uuid>.json  配置内容，文件名与显示名彻底解耦
//     log\  crash_reports\  不变
//     elevated\             提权动作的输出，**当前用户只读**
//                           （见 `config::get_elevated_log_dir`）
//
// 换来的：
//   * 同名订阅覆盖在**结构上**不可能（`profiles.name` 的 UNIQUE 约束，H-03）
//   * 事务替掉手写互斥，也就不再需要「索引与磁盘对账」那套自愈逻辑
//   * 一区设置损坏碰不到别的区，`backend_prefs.json` 当初拆分要解决的问题
//     变成 schema 的自然性质
//
// 不做迁移：部署场景是全新安装（见重构方案 01 节末的边界说明）。磁盘上若有
// 旧布局残留，不读也不删。

pub mod profiles;
pub mod schema;
pub mod settings;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

use crate::errors::CommandError;

const DATABASE_FILE: &str = "fresh-box.db";

/// 进程内唯一的数据库句柄，作为 Tauri managed state 注册。
///
/// 用 `Mutex<Connection>` 而不是连接池：这个库只有个位数张表、写入是用户操作
/// 级别的频率，锁竞争不存在。**但持锁期间绝不能做网络 I/O** —— 订阅抓取先在
/// 锁外完成，拿到内容再进事务（见 `commands::config`）。
///
/// `Arc` 包一层是为了能 `clone()` 进 `spawn_blocking`：rusqlite 与文件读写都
/// 是同步的，在 `async fn` 里直接调就把 tokio 的工作线程按住了（审计项
/// L-19）。同步的 `#[tauri::command] fn` 不受影响 —— Tauri 本来就把它们派到
/// 单独的线程上跑。克隆的是句柄，不是连接。
#[derive(Clone)]
pub struct Store {
    connection: Arc<Mutex<Connection>>,
}

impl Store {
    /// 打开（必要时创建）数据库并跑迁移。应用启动时调用一次。
    pub fn open() -> Result<Self, CommandError> {
        let path = database_path()?;
        let connection =
            Connection::open(&path).map_err(|e| CommandError::io("open fresh-box.db", e))?;
        schema::migrate(&connection)?;
        Ok(Self {
            connection: Arc::new(Mutex::new(connection)),
        })
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self, CommandError> {
        let connection = Connection::open_in_memory()
            .map_err(|e| CommandError::io("open in-memory database", e))?;
        schema::migrate(&connection)?;
        Ok(Self {
            connection: Arc::new(Mutex::new(connection)),
        })
    }

    /// 在数据库连接上跑一段闭包。
    ///
    /// 锁被毒化（某个持锁线程 panic 了）时返回错误而不是继续用一个状态不明的
    /// 连接 —— 这是持久化层，宁可这次操作失败也不要写进半截数据。
    pub fn with<T>(
        &self,
        f: impl FnOnce(&Connection) -> Result<T, CommandError>,
    ) -> Result<T, CommandError> {
        let guard = self
            .connection
            .lock()
            .map_err(|_| CommandError::invalid_state("store", "database lock is poisoned"))?;
        f(&guard)
    }

    /// 在阻塞线程池上跑一段 store 操作，供 `async fn` 调用。
    ///
    /// rusqlite 和配置内容文件的读写都是同步的：在 async 上下文里直接调就把
    /// tokio 的一个工作线程按住了，库一忙（WAL checkpoint、大配置落盘）整个
    /// 运行时都跟着卡 —— 连正在推的日志流一起（审计项 L-19）。同步的
    /// `#[tauri::command] fn` 不需要这个，Tauri 本来就把它们派到别的线程。
    pub async fn run_blocking<T, F>(&self, f: F) -> Result<T, CommandError>
    where
        F: FnOnce(&Store) -> Result<T, CommandError> + Send + 'static,
        T: Send + 'static,
    {
        let store = self.clone();
        tokio::task::spawn_blocking(move || f(&store))
            .await
            .map_err(|e| CommandError::invalid_state("store task", e.to_string()))?
    }
}

fn database_path() -> Result<PathBuf, CommandError> {
    Ok(crate::config::get_app_data_root()?.join(DATABASE_FILE))
}

/// 配置内容目录：`profiles\<uuid>.json`。
///
/// 用 UUID 而不是显示名 —— 那正是 H-03 的根因。用户想看内容走
/// 「打开配置文件」，不需要文件名可读。
pub fn profiles_dir() -> Result<PathBuf, CommandError> {
    let dir = crate::config::get_app_data_root()?.join("profiles");
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| CommandError::resource_not_found("profiles directory", e))?;
    }
    Ok(dir)
}
