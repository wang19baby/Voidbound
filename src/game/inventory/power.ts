// game/inventory/power.ts — 战力评分 (PR #4 / T5-b, 2026-08-13)
// 从 game/equipment.ts 抽出: itemPower / itemPowerDelta。
// 依赖: ./types

import type { Equipment } from './types';

/** 简化战力评分 (展示用): 词条数值加权和 */
export function itemPower(eq: Equipment): number {
  let p = 5; // 基础
  for (const a of eq.affixes) {
    if (a.stat === 'physPct' || a.stat === 'elemPct') p += Math.round(a.value * 100);
    else if (a.stat === 'critRate') p += Math.round(a.value * 100);
    else if (a.stat === 'critBonus') p += Math.round(a.value);
    else if (a.stat === 'shred' || a.stat === 'vuln') p += Math.round(a.value);
    else if (a.stat === 'res') p += Math.round(a.value * 0.5);
    else if (a.stat === 'hp' || a.stat === 'mp') p += Math.round(a.value * 0.3);
  }
  return p;
}

/** 战力增量: 该件 vs 当前同槽穿戴 (正=更强, 负=更弱) */
export function itemPowerDelta(eq: Equipment, old: Equipment | undefined): number {
  return itemPower(eq) - (old ? itemPower(old) : 0);
}
