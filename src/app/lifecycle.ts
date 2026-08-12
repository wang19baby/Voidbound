// app/lifecycle.ts — 失焦暂停 / 关窗确认 / 格式化工具 (T1b, 2026-08-12)
//
// 从 main.ts 拆出: 原 line 492-559 (mouseAimDirection/autoPauseOnBlur/confirmCloseSave/Cancel),
//                  原 line 1431-1447 (formatTime/keyHintMain/keyHintSkills/ATTR_NAMES/SAVE_FMT_LABEL)
//
// 设计:
// - 失焦暂停监听器一次性注册 (autoPauseOnBlur)
// - 关窗确认 emit 由 tauri 主进程接收, JS 兜底直接 destroy
// - 格式化工具是纯函数, 易测
// - 不依赖 main.ts 模块级变量, 全部接 state 或回调注入

import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import type { GameState, Screen } from '../game/state';
import { setScreen } from '../game/state';
import { setCloseConfirmOpen } from './screenMachine';
import { persistNowApp } from './save';

const invoke = tauriInvoke;

/** 失焦自动暂停 (OPT-001): dungeon/town/equipment 切走 → pause; 回焦点需手动继续 */
export function autoPauseOnBlur(state: GameState): void {
  const onBlur = (): void => {
    if (state.screen === 'dungeon' || state.screen === 'town' || state.screen === 'equipment') {
      setScreen(state, 'pause');
    }
  };
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', () => { if (document.hidden) onBlur(); });
}

// 关窗确认 (M5 W3 C-303)
let closeConfirmSaving = false;
let closeEmit: ((event: string) => Promise<void>) | null = null;

/** 注册 close 事件 emit 函数 (由 main.ts 启动时一次性调用) */
export function registerCloseEmit(emit: (event: string) => Promise<void>): void {
  closeEmit = emit;
}

/** 关窗确认 → 保存退出 (实际数据保留由 emit 异步持久化完成) */
export function confirmCloseSave(state: GameState): void {
  setCloseConfirmOpen(false);
  closeConfirmSaving = true;
  const done = (): void => {
    if (closeEmit) { void closeEmit('close-confirmed'); }
    else {
      // 事件模块未就绪的兜底: JS 直接销毁
      void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().destroy());
    }
  };
  // 标题页无游戏进度, 直接退出; 其余屏先持久化再退出
  if (state.screen === 'title') { done(); return; }
  void persistNowApp(state).finally(done);
}

/** 关窗确认 → 取消 */
export function confirmCloseCancel(): void {
  setCloseConfirmOpen(false);
}

/** 鼠标瞄准方向: 从鼠标屏幕坐标算出世界方向 */
export function mouseAimDirection(state: GameState, mouseScreen: { x: number; y: number }): { x: number; y: number } {
  const cx = state.viewport.w / 2;
  const cy = state.viewport.h / 2;
  const dx = mouseScreen.x - cx;
  const dy = mouseScreen.y - cy;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** 秒 → "m:ss" */
export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// 提示字符串生成: 用于 settings 面板 + title 屏底部
import { loadKeybinds } from '../game/keybind';

/** 主操作提示行 (空格/tab/e) — 依赖当前键位 */
export function keyHintMain(): string {
  const kb = loadKeybinds();
  const parts: string[] = [];
  parts.push(`[${kb.dodge.toUpperCase()}] 翻滚`);
  parts.push(`[${kb.potionHp}] HP`);
  parts.push(`[${kb.potionMp}] MP`);
  parts.push(`[${kb.interact.toUpperCase()}] 交互`);
  return parts.join(' · ');
}

/** 技能行提示 (Q/W/E/R) */
export function keyHintSkills(): string {
  const kb = loadKeybinds();
  return `技能 [${kb.skill[0].toUpperCase()}]/[${kb.skill[1].toUpperCase()}]/[${kb.skill[2].toUpperCase()}]/[${kb.skill[3].toUpperCase()}]`;
}

/** 存档格式版本 (M5: v11) */
export const SAVE_FMT_LABEL = 'v11';

/** 测试/重启用: 重置模块级状态 */
export function _resetLifecycle(): void {
  closeConfirmSaving = false;
  closeEmit = null;
}

// 类型引用防止 tree-shake
type _Screen = Screen;