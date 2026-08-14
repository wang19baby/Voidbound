// 转发到 Rust 侧日志 (pty/终端可见, 与 [boot] 同通道); 失败静默
import { invoke } from '@tauri-apps/api/core';

export function jsLog(msg: string): void {
  invoke('js_log', { msg }).catch(() => { /* 静默 */ });
}
