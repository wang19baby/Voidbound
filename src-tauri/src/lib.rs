//! Voidbound 游戏核心库
//!
//! M1 阶段骨架:模块占位 + Tauri 命令注册
//!
//! ## 模块结构
//! - `game/entity`  — 实体(玩家/怪物/子弹)
//! - `game/combat`  — 战斗逻辑(伤害公式 v1.1 D-04)
//! - `game/procgen` — WFC 地图生成(v1.1 D-23 fast-wfc v3)
//! - `render`       — 渲染接口(目前为空 stub)
//! - `save`         — 存档读写(bincode + 文件锁)

pub mod game {
    pub mod entity;
    pub mod combat;
    pub mod procgen;
}

pub mod render;
pub mod save;
pub mod audio;

use std::sync::Arc;

use tauri::{Listener, Manager, State};

use crate::render::atlas::{AtlasLoadError, AtlasRegistry, LoadedAtlas};

/// 应用全局状态(目前只有 atlas 注册表)
pub struct AppState {
    pub atlases: Arc<AtlasRegistry>,
}

/// 把 AtlasLoadError 转成 Tauri 命令可序列化的字符串
fn err_to_string(e: AtlasLoadError) -> String {
    e.to_string()
}

/// 列出所有可用 .bin 图集
#[tauri::command]
fn list_atlases(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    state.atlases.list().map_err(err_to_string)
}

/// 加载单个图集(返回 PNG base64 + sprite 元数据,Web 端直接拿来创建纹理)
#[tauri::command]
fn load_atlas(name: String, state: State<'_, AppState>) -> Result<LoadedAtlas, String> {
    state.atlases.load_for_frontend(&name).map_err(err_to_string)
}

/// Tauri 命令:健康检查
#[tauri::command]
fn ping() -> String {
    "pong from Voidbound".into()
}

/// 前端 JS 错误/日志转发 (调试通道, 让 JS 异常出现在 Rust stdout)
#[tauri::command]
fn js_log(msg: String) {
    log::warn!("[js] {msg}");
}

/// 应用入口
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .init();

    log::info!("Voidbound v0.1.0 starting...");

    let atlases = Arc::new(AtlasRegistry::with_default_dir());
    match atlases.list() {
        Ok(names) => log::info!("Atlas registry: {} atlases available: {names:?}", names.len()),
        Err(e) => log::warn!("Atlas registry 初始化失败: {e}"),
    }

    tauri::Builder::default()
        .setup(move |app| {
            app.manage(AppState {
                atlases: Arc::clone(&atlases),
            });

            if let Err(e) = audio::setup(app) {
                log::warn!("audio init failed: {e}");
            }

            // 窗口探针 (诊断: 窗口是否创建/可见; eval 标题翻转确认 JS 引擎可达)
            match app.get_webview_window("main") {
                Some(w) => {
                    log::info!("window 'main' created: visible={} title={:?}", w.is_visible().unwrap_or(false), w.title().unwrap_or_default());
                    let _ = w.eval("document.title = 'BOOTED'");
                    std::thread::sleep(std::time::Duration::from_secs(2));
                    log::info!("title after eval probe: {:?}", w.title().unwrap_or_default());
                }
                None => log::error!("window 'main' NOT created"),
            }

            app.handle().listen_any("tauri://close_requested", |_| {
                log::info!("Voidbound closing...");
            });

            log::info!("Voidbound ready (M1 MVP scaffold)");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![ping, list_atlases, load_atlas, audio::play_sfx, audio::set_volume, audio::play_bgm, audio::stop_bgm, save::save_game, save::load_game, js_log])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}