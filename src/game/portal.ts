// A-W1 门结算: Boss 死亡位置生门 → 玩家走到门前交互 → 面板 [回城/继续]
// 设计文档 §3: 回城 = 提前结算 (战利品/经验保留, 无全清奖励); 门持续到本局结束

import type { GameState } from './state';

/** 玩家与门的交互距离 (px) */
export const PORTAL_INTERACT_RANGE = 56;

/** 门是否可交互 (Boss 已杀且门在场) */
export function portalActive(state: GameState): boolean {
  return !!state.run.portal && state.run.portal.used === false && state.run.bossKilled;
}

/** 玩家是否站在门交互范围内 */
export function nearPortal(state: GameState): boolean {
  const p = state.run.portal;
  if (!p) return false;
  const dx = state.player.pos.x + state.player.size.w / 2 - p.x;
  const dy = state.player.pos.y + state.player.size.h / 2 - p.y;
  return Math.hypot(dx, dy) <= PORTAL_INTERACT_RANGE;
}

/** 回城: 提前结算 (保留战利品/经验, 结束本局) */
export function leaveThroughPortal(state: GameState): void {
  if (!state.run.portal) return;
  state.run.portal.used = true;
  // 门持续到本局结束: 标记已使用, 结算后由 main 切换城镇
}