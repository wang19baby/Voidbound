//! Voidbound Tauri 应用入口
//!
//! M1 启动文件(Day 1 第一行代码)
//!
//! 当前职责:启动 Tauri 应用 + 注册 game 模块命令

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use voidbound::run;

fn main() {
    run();
}