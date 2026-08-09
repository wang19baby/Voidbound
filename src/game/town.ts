// 城镇/NPC (US-021, F-TOWN-002 子集, D-06 经济)
// 场景: mode='town' 城镇静止背景 + NPC 站桩; 接近按 E 交互
// 设施: 商人(买/卖) · 重铸师(100金) · 难度选择 · 出发

import type { GameState } from './state';
import { randomEquipment, getItemSellPrice, getItemBuyPrice, addOwned, rerollAffixes, getOwned, type Equipment } from './equipment';

export type NpcKind = 'merchant' | 'smith' | 'difficulty' | 'exit';

export interface TownNpc {
  kind: NpcKind;
  name: string;
  pos: { x: number; y: number };
  hint: string;
}

/** 城镇 NPC 布局 (1280x720 房间) */
export const TOWN_NPCS: TownNpc[] = [
  { kind: 'merchant',   name: '商人',        pos: { x: 240, y: 400 }, hint: '买装备 / 卖装备' },
  { kind: 'smith',      name: '重铸师',      pos: { x: 520, y: 400 }, hint: '100金 重铸词条' },
  { kind: 'difficulty', name: '挑战祭坛',    pos: { x: 800, y: 400 }, hint: '调整难度' },
  { kind: 'exit',       name: '地下城入口',  pos: { x: 600, y: 200 }, hint: '出发' },
];

/** 最近 NPC (80px 内) */
export function nearestNpc(state: GameState): TownNpc | null {
  const p = state.player.pos;
  let best: TownNpc | null = null;
  let bestD = 80 * 80;
  for (const n of TOWN_NPCS) {
    const dx = n.pos.x - (p.x + 32);
    const dy = n.pos.y - (p.y + 32);
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

/** 商人库存: 进店随机 5 件 + 买价 */
export interface MerchantStock { item: Equipment; price: number; }
export function genMerchantStock(): MerchantStock[] {
  const out: MerchantStock[] = [];
  for (let i = 0; i < 5; i++) {
    const eq = randomEquipment(Math.random() < 0.5 ? 'magic' : 'rare');
    out.push({ item: eq, price: getItemBuyPrice(eq.rarity, eq.affixes.length) });
  }
  return out;
}

/** 购买: 扣金 + 入库 */
export function buyItem(state: GameState, stock: MerchantStock): boolean {
  if (state.player.gold < stock.price) return false;
  state.player.gold -= stock.price;
  addOwned(state, stock.item);
  return true;
}

/** 卖出: 从 owned 移除 + 入金半价 */
export function sellItem(state: GameState, idx: number): number {
  const owned = getOwned(state);
  const eq = owned[idx];
  if (!eq) return 0;
  const price = getItemSellPrice(eq.rarity, eq.affixes.length);
  owned.splice(idx, 1);
  state.player.gold += price;
  return price;
}

/** 重铸: 100 金重roll (返回是否成功) */
export function rerollOwned(state: GameState, idx: number): boolean {
  const owned = getOwned(state);
  const eq = owned[idx];
  if (!eq) return false;
  if (state.player.gold < 100) return false;
  state.player.gold -= 100;
  rerollAffixes(eq);
  return true;
}

/** 城镇面板状态 (存 GameState 内部) */
export type TownPanel = 'merchant' | 'smith' | null;