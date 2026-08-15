// game/inventory/loot.ts — 拾取 + 地上物品管理 (PR #4 / T5-b, 2026-08-13)
// 从 game/equipment.ts 抽出: pickupLoot / collectAllLoot / getLoot / applyInstant(供 pickup 用)。
// 依赖: ./types, ./constants, ./equipment

import type { Equipment, EquipState } from './types';
import type { GameState } from '../state';
import { BACKPACK_CAP } from './constants';
import { getOwned, recomputeCombat } from './equipment';

/** hp/mp 词条即时生效 (拾取/穿戴时) — 复用 equipment.ts 内部 applyInstant 的相同逻辑 */
function applyInstant(state: EquipState, eq: Equipment): void {
  for (const a of eq.affixes) {
    if (a.stat === 'hp') state.player.hp = Math.min(state.player.hpMax ?? 100, state.player.hp + a.value);
    else if (a.stat === 'mp') state.player.mp = Math.min(state.player.mpMax ?? 100, state.player.mp + a.value);
  }
}

/** 检查拾取: hp/mp 即时生效; 背包满不拾取 (留地 + 提示), 其余词条聚合进 combat */
export function pickupLoot(state: GameState): Equipment[] {
  const picked: Equipment[] = [];
  state.fx.loot = state.fx.loot.filter(eq => {
    if (eq.pickedUp) return false;
    if (state.player.pos.x < eq.pos.x + eq.size.w &&
        state.player.pos.x + state.player.size.w > eq.pos.x &&
        state.player.pos.y < eq.pos.y + eq.size.h &&
        state.player.pos.y + state.player.size.h > eq.pos.y) {
      // 背包满: 留在地上不拾取, 1s 节流提示一次
      if (getOwned(state).length >= BACKPACK_CAP) {
        void import('../toast').then(({ pushToast }) => {
          pushToast(state, '背包已满, 未拾取', '#ff5555');
        });
        return true;
      }
      eq.pickedUp = true;
      picked.push(eq);
      getOwned(state).push(eq);
      applyInstant(state, eq);
      return false;
    }
    return true;
  });
  if (picked.length) recomputeCombat(state);
  return picked;
}

/** 通关收集地上掉落 (M5 实测修复): 全部入背包, 满则留地并提示; 返回收集数 */
export function collectAllLoot(state: GameState): Equipment[] {
  const picked: Equipment[] = [];
  let rejected = 0;
  state.fx.loot = state.fx.loot.filter(eq => {
    if (eq.pickedUp) return false;
    if (getOwned(state).length >= BACKPACK_CAP) { rejected++; return true; }
    eq.pickedUp = true;
    picked.push(eq);
    getOwned(state).push(eq);
    applyInstant(state, eq);
    return false;
  });
  if (rejected > 0) {
    void import('../toast').then(({ pushToast }) => pushToast(state, `背包已满, ${rejected} 件未拾取`, '#ff5555'));
  }
  if (picked.length) recomputeCombat(state);
  return picked;
}

export function getLoot(state: GameState): readonly Equipment[] {
  return state.fx.loot;
}
