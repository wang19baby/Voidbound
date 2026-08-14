// 诊断日志通道: 事件级 (首次/异常/状态变化), 不走每帧; 全部转发 Rust 侧 pty/终端可见
//
// 规则:
// - 只打"事实" (sprite 名/uv/坐标/计数/时长), 不打推测
// - 高频路径 (drawSprite) 每个 sprite 只打首次; 异常路径 (缺 sprite / 阶段抛错) 必打
// - cat 用于归类: atlas/sprite/map/render/save/spawn/ui
import { invoke } from '@tauri-apps/api/core';

export type DiagCat = 'atlas' | 'sprite' | 'map' | 'render' | 'save' | 'spawn' | 'ui';

export function diag(cat: DiagCat, msg: string): void {
  invoke('js_log', { msg: `[diag:${cat}] ${msg}` }).catch(() => { /* 静默 */ });
}