// game/inventory/price.ts — 定价 + 重铸 (PR #4 / T5-b, 2026-08-13)
// 从 game/equipment.ts 抽出: getItemBuyPrice / getItemSellPrice / rerollAffixes / rerollCostOption。
// 依赖: ./types, ./constants, ./affix, ./materials

import type { Equipment, Rarity } from './types';
import { RARITY_VALUE_MULT } from './constants';
import { genAffix } from './affix';
import { materialCount } from './materials';
import { REROLL_IRON_COST } from './constants';

/** 买价 (US-021): 稀有度基价 × 词条加成 */
export function getItemBuyPrice(rarity: Rarity, affixCount: number): number {
  const base: Record<Rarity, number> = { normal: 10, magic: 40, rare: 120, set: 250, unique: 500 };
  return Math.round(base[rarity] * (1 + affixCount * 0.35));
}

/** 卖价 (半价) */
export function getItemSellPrice(rarity: Rarity, affixCount: number): number {
  return Math.floor(getItemBuyPrice(rarity, affixCount) * 0.4);
}

/** 重铸词条 (US-021): 同稀有度同词条数, 全部重roll (数值分层随稀有度, OPT-020) */
export function rerollAffixes(eq: Equipment): void {
  const n = eq.affixes.length;
  eq.affixes.length = 0;
  const mult = RARITY_VALUE_MULT[eq.rarity];
  for (let i = 0; i < n; i++) eq.affixes.push(genAffix(mult));
}

/** 重铸双轨: 100 金 或 灵铁 (C-402); 返回 'gold' | 'iron' | null */
export function rerollCostOption(state: { equip: { materials: Partial<Record<import('./types').MaterialId, number>> }; player: { gold: number } }, eq: Equipment): 'gold' | 'iron' | null {
  if (!eq) return null;
  const ironNeed = REROLL_IRON_COST[eq.rarity];
  if (ironNeed > 0 && materialCount(state, 'iron_shard') >= ironNeed) return 'iron';
  if (state.player.gold >= 100) return 'gold';
  return null;
}
