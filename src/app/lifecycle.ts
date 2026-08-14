// app/lifecycle.ts — 失焦暂停 / 关窗确认 / 输入辅助 / 格式化工具 (T1b + PR-008, 2026-08-13)
//
// PR-008: 把 main.ts 内 mouseAimDirection / autoPauseOnBlur / confirmCloseSave / Cancel 整体搬到本模块
//        原 line 492-559 (main.ts), 0 行为变更, 仅闭包依赖 → 模块级 + 参数注入
//
// 设计:
// - 失焦暂停监听器在 installAutoPauseListeners 中注册 (main.ts 启动时调用一次)
// - 关窗确认 emit 由 tauri 主进程接收, JS 兜底直接 destroy
// - mouseAimDirection 接受 mouse.state() 的 pos 字段 (与 main.ts 局部版本一致, 返回原始偏移不归一化)
// - 模块级 state 由 setLifecycleState 注入 (避免循环依赖, main.ts 不必 export state)
// - 监听器在 state 注入之前注册也无妨: 调用时 state 若未注入则短路返回

import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import type { GameState, Screen } from '../game/state';
import { setScreen } from '../game/state';
import { setCloseConfirmOpen } from './screenMachine';
import { persistNowApp } from './save';
import { inf } from '../util/log';

const invoke = tauriInvoke;

// 模块级 state 注入 (PR-008): 由 main.ts 启动时调用 setLifecycleState(state)
let lifecycleState: GameState | null = null;

/** 注入 game state; 必须先于任何回调触发 (autoPauseOnBlur / confirmCloseSave) 调用 */
export function setLifecycleState(s: GameState): void {
  lifecycleState = s;
}

/** 失焦自动暂停 (OPT-001): 战斗/装备面板中切走 → 暂停; 城镇不暂停 (回焦点仍停留); 回焦点需手动继续
 *  注册一次性监听器; main.ts 启动时调用 (state 注入之后或之前都可 — state 未注入时调用短路) */
export function installAutoPauseListeners(): void {
  const handler = (): void => {
    if (!lifecycleState) return;
    if (lifecycleState.screen !== 'dungeon' && lifecycleState.screen !== 'equipment') return;
    lifecycleState.pauseFrom = 'dungeon';
    setScreen(lifecycleState, 'pause');
    inf('gl', 'auto-paused (blur)');
  };
  window.addEventListener('blur', handler);
  document.addEventListener('visibilitychange', () => { if (document.hidden) handler(); });
}

// 关窗确认 (US-026): isCloseConfirmOpen() 移至 app/screenMachine.ts 模块状态
let closeConfirmSaving = false;
let closeEmit: ((event: string) => Promise<void>) | null = null;

/** 注册 close-requested 监听 + emit 函数 — main.ts 启动时一次性调用 */
export function installCloseConfirmListeners(): void {
  void import('@tauri-apps/api/event').then(({ listen, emit }) => {
    closeEmit = emit;
    void listen('close-requested', () => {
      setCloseConfirmOpen(true);
      closeConfirmSaving = false;
      inf('ui', 'close-requested: 显示退出确认');
    });
  });
}

/** 关窗确认 → 保存退出 (实际数据保留由 emit 异步持久化完成) */
export function confirmCloseSave(): void {
  if (!lifecycleState) return;
  if (closeConfirmSaving) return;
  closeConfirmSaving = true;
  const done = (): void => {
    if (closeEmit) { void closeEmit('close-confirmed'); }
    else {
      // 事件模块未就绪的兜底: JS 直接销毁
      void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().destroy());
    }
  };
  // 标题页无游戏进度, 直接退出; 其余屏先持久化再退出
  if (lifecycleState.screen === 'title') { done(); return; }
  void persistNowApp(lifecycleState).finally(done);
}

/** 关窗确认 → 取消 */
export function confirmCloseCancel(): void {
  setCloseConfirmOpen(false);
}

/** 是否正在保存 (closeConfirmSaving 标志) — drawCloseConfirm 用 */
export function isCloseConfirmSaving(): boolean {
  return closeConfirmSaving;
}

/** 鼠标位置 → 世界坐标方向 (Diablo 风格: 技能瞄准鼠标; 返回原始偏移不归一化) */
export function mouseAimDirection(state: GameState, m: { pos: { x: number; y: number } }): { x: number; y: number } {
  const cx = state.viewport.w / 2;
  const cy = state.viewport.h / 2;
  return { x: m.pos.x - cx, y: m.pos.y - cy };
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
  lifecycleState = null;
}

// 类型引用防止 tree-shake
type _Screen = Screen;