// A-W1/A-W4 门结算: Boss/外层 Boss 死亡位生门 → 玩家走到门前交互 → 面板 [回城/继续]
// 设计文档 §3: 回城 = 提前结算 (战利品/经验保留, 无全清奖励); 门持续到本局结束
// §2.3 挑战(提取制): 每个 Boss 死亡位都生成门 (4 外向 + 1 终), 击杀 ≥1 即可随时撤退
//
// portals 为数组: 普通/高级 1 门 (最终 Boss 死亡位), 挑战最多 5 门并存

import type { GameState } from './state';

/** 玩家与门的交互距离 (px) */
export const PORTAL_INTERACT_RANGE = 56;

/** 门是否可交互 (任一未使用门在场; 杀死任意 Boss/外层 Boss 即开放, 不要求最终通关) */
export function portalActive(state: GameState): boolean {
  return state.run.portals.some(p => !p.used);
}

/** 玩家是否站在任一未使用门交互范围内 */
export function nearPortal(state: GameState): boolean {
  return state.run.portals.some(p => {
    if (p.used) return false;
    const dx = state.player.pos.x + state.player.size.w / 2 - p.x;
    const dy = state.player.pos.y + state.player.size.h / 2 - p.y;
    return Math.hypot(dx, dy) <= PORTAL_INTERACT_RANGE;
  });
}

/** 最近的未使用门 (HUD 方向指引用); 无门返回 null */
export function nearestPortal(state: GameState): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const p of state.run.portals) {
    if (p.used) continue;
    const dx = state.player.pos.x + state.player.size.w / 2 - p.x;
    const dy = state.player.pos.y + state.player.size.h / 2 - p.y;
    const d = Math.hypot(dx, dy);
    if (d < bestD) { bestD = d; best = { x: p.x, y: p.y }; }
  }
  return best;
}

/** 回城: 提前结算 (保留战利品/经验, 结束本局) */
export function leaveThroughPortal(state: GameState): void {
  // 结束本局: 全部门标记已使用 (结算后由 main 切换城镇)
  for (const p of state.run.portals) p.used = true;
}