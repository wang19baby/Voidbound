// game/inventory/equipment.ts — 装备核心操作 (PR #4 / T5-b, 2026-08-13)
// 从 game/equipment.ts 抽出: allocEquipmentId / rollEquipType / aggregateCombat /
// recomputeCombat / getEquippedValues / applyInstant / equipItem / unequipItem / unequipSlot / addOwned / getOwned。
// 依赖: ./types, ./constants, ./set, ../combat, ../../core/eventBus

import type { Equipment, EquipState, EquipType } from './types';
import { EQUIP_SLOTS, EQUIP_TYPE_WEIGHTS, BACKPACK_CAP, SET_BONUSES } from './constants';
import { SET_KEYS } from './set';
import { baseCombat, type CombatStats } from '../combat';
import { bus } from '../../core/eventBus';

// === id 分配 (nextEqId 模块私有) ===

let nextEqId = 1;

/** 分配新装备 id (读档重建使用) */
export function allocEquipmentId(): number {
  return nextEqId++;
}

/** 装备类型随机选择 (内部) */
export function rollEquipType(): EquipType {
  const total = EQUIP_TYPE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [t, w] of EQUIP_TYPE_WEIGHTS) {
    r -= w;
    if (r < 0) return t;
  }
  return 'weapon';
}

/** 聚合所有已装备词条 → CombatStats (纯函数, 供单测) */
export function aggregateCombat(items: readonly Equipment[]): CombatStats {
  const c = baseCombat();
  for (const eq of items) {
    for (const a of eq.affixes) {
      switch (a.stat) {
        case 'hp':
        case 'mp':
        case 'speed':
          break; // 即时效果, 不进入战斗属性聚合
        case 'physPct':   c.physPct += a.value; break;
        case 'elemPct':   c.elemPct += a.value; break;
        case 'critRate':  c.critRate = Math.min(1, c.critRate + a.value); break;
        case 'critBonus': c.critBonus += a.value; break;
        case 'shred':     c.shred += a.value; break;
        case 'vuln':      c.vuln += a.value; break;
        case 'lifesteal': c.lifesteal += a.value; break;
        case 'res':       if (a.element) c.res[a.element] += a.value; break;
      }
    }
  }
  // 套装加成 (US-010): 同套装 ≥req 件触发
  const setCount: Record<string, number> = {};
  for (const eq of items) if (eq.setName) setCount[eq.setName] = (setCount[eq.setName] ?? 0) + 1;
  for (const key of SET_KEYS) {
    const n = setCount[key] ?? 0;
    if (n <= 0) continue;
    for (const b of SET_BONUSES[key].bonuses) {
      if (n >= b.req) {
        if (b.stat === 'elemPct') c.elemPct += b.value;
        else if (b.stat === 'critBonus') c.critBonus += b.value;
        else c.shred += b.value;
      }
    }
  }
  return c;
}

/** 当前穿戴 (聚合用) */
export function getEquippedValues(state: EquipState): Equipment[] {
  return EQUIP_SLOTS
    .map(t => state.player.equipped[t])
    .filter((x): x is Equipment => !!x);
}

/** 从当前穿戴装备重算 player.combat (拾取/穿戴/卸下/读档后调用) */
export function recomputeCombat(state: EquipState): void {
  state.player.combat = aggregateCombat(getEquippedValues(state));
}

/** hp/mp 词条即时生效 (拾取/穿戴时) */
function applyInstant(state: EquipState, eq: Equipment): void {
  for (const a of eq.affixes) {
    if (a.stat === 'hp') state.player.hp = Math.min(state.player.hpMax ?? 100, state.player.hp + a.value);
    else if (a.stat === 'mp') state.player.mp = Math.min(state.player.mpMax ?? 100, state.player.mp + a.value);
  }
}

/** 穿戴: 背包 → 槽 (同槽旧件回背包); 返回成功 */
export function equipItem(state: EquipState, eq: Equipment): boolean {
  const slot = eq.type;
  const inv = getOwned(state);
  const idx = inv.indexOf(eq);
  if (idx < 0) return false;
  const old = state.player.equipped[slot];
  if (old) {
    inv[idx] = old;          // 旧件占据 eq 的背包位
    state.player.equipped[slot] = eq;
  } else {
    inv.splice(idx, 1);
    state.player.equipped[slot] = eq;
  }
  applyInstant(state, eq);
  recomputeCombat(state);
  // T1a: emit 事件
  bus.emit('item.equipped', { item: eq, slot: eq.type });
  return true;
}

/** 卸下: 槽 → 背包 (背包满时拒绝); 返回成功 */
export function unequipItem(state: EquipState, eq: Equipment): boolean {
  const slot = eq.type;
  if (state.player.equipped[slot] !== eq) return false;
  const inv = getOwned(state);
  if (inv.length >= BACKPACK_CAP) return false;
  state.player.equipped[slot] = undefined;
  inv.push(eq);
  recomputeCombat(state);
  return true;
}

/** 卸下指定槽位 (面板 D 键); 返回成功 */
export function unequipSlot(state: EquipState, slot: EquipType): boolean {
  const eq = state.player.equipped[slot];
  if (!eq) return false;
  return unequipItem(state, eq);
}

/** 丢弃: 从背包移除 (面板右键/丢弃按钮); 返回被丢弃物品 */
export function discardItem(state: EquipState, idx: number): Equipment | null {
  const inv = getOwned(state);
  if (idx < 0 || idx >= inv.length) return null;
  const eq = inv[idx];
  inv.splice(idx, 1);
  return eq;
}

/** 入库 (商店购买/读档重建共用): push owned + 重算 combat; 背包满返回 false */
export function addOwned(state: EquipState, eq: Equipment): boolean {
  const inv = getOwned(state);
  if (inv.length >= BACKPACK_CAP) return false;
  eq.pickedUp = true;
  eq.pos = { x: 0, y: 0 };
  inv.push(eq);
  recomputeCombat(state);
  return true;
}

/** 已拾取(装备中)的列表 */
export function getOwned(state: EquipState): Equipment[] {
  return state.fx!.owned!;
}
