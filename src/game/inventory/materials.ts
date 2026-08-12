// game/inventory/materials.ts — 材料系统 (PR #4 / T5-b, 2026-08-13)
// 从 game/equipment.ts 抽出: addMaterial / spendMaterial / materialCount / emptyMaterials / materialDrop。
// 依赖: ./types (MaterialId, MaterialSrc)

import type { MaterialId, MaterialSrc } from './types';

export function emptyMaterials(): Record<MaterialId, number> {
  return { iron_shard: 0, arcane_core: 0, void_fragment: 0 };
}

export function materialCount(state: MaterialSrc, id: MaterialId): number {
  return state.equip.materials?.[id] ?? 0;
}

/** 材料入库 (掉落/购买) */
export function addMaterial(state: MaterialSrc, id: MaterialId, n: number): void {
  const m = state.equip.materials;
  m[id] = (m[id] ?? 0) + n;
}

/** 材料扣除 (消耗渠道); 不足返回 false 不扣 */
export function spendMaterial(state: MaterialSrc, id: MaterialId, n: number): boolean {
  const have = state.equip.materials?.[id] ?? 0;
  if (have < n) return false;
  state.equip.materials[id] = have - n;
  return true;
}

/** 材料掉落判定 (C-401, 纯函数便于单测): roll∈[0,1)
 *  - Boss: 必掉 1-2 虚空碎片
 *  - 精英: 必掉 1 奥术核心
 *  - 小怪: 8% 掉 1 灵铁碎片
 */
export function materialDrop(roll: number, isBoss: boolean, isElite: boolean): Array<[MaterialId, number]> {
  if (isBoss) return [['void_fragment', roll < 0.5 ? 1 : 2]];
  if (isElite) return [['arcane_core', 1]];
  if (roll < 0.08) return [['iron_shard', 1]];
  return [];
}
