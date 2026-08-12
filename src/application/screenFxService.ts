// application/screenFxService.ts — 屏幕/伤害跨域订阅服务 (T1a, 2026-08-12)
//
// 职责: 订阅 player.damaged / screen.changed 等新事件, 集中处理
//        镜头震动、bgm 切换、伤害飘字 等跨域副作用。
//        模式与 combatFxService 一致 (单点订阅 + uninstall 卸载)
//
// 设计:
// - 当前阶段只日志 + 镜头震动衰减, 未来可挂 bgm 切换 / 成就统计 / 录像
// - 不动任何业务状态 (业务字段更新由各域函数同步完成)

import { bus } from '../core/eventBus';
import { inf } from '../util/log';
import type { GameState } from '../game/state';

/** 镜头震动处理器 (player.damaged → 屏幕震动) */
function handlePlayerDamaged(payload: { dmg: number; src: string }, state: GameState | null): void {
  if (!state) return;
  // 受击时叠加震动: 受击震动强度按 dmg 缩放, 上限 8
  const shake = Math.min(8, 1.5 + payload.dmg * 0.05);
  state.cameraShake = Math.max(state.cameraShake ?? 0, shake);
  inf('screen.fx', `player damaged ${payload.dmg.toFixed(1)} from ${payload.src}, shake=${shake.toFixed(2)}`);
}

/** 屏幕切换处理器 (screen.changed → 日志 + 后续可挂 bgm) */
function handleScreenChanged(payload: { from: string; to: string }): void {
  inf('screen.fx', `screen changed: ${payload.from} → ${payload.to}`);
}

/** 注册所有 screenFx 订阅者; 返回 unsubscribe 用于测试或重启 */
export function installScreenFxService(state: GameState | null): () => void {
  const off1 = bus.on('player.damaged', p => handlePlayerDamaged(p, state));
  const off2 = bus.on('screen.changed', handleScreenChanged);
  return () => { off1(); off2(); };
}