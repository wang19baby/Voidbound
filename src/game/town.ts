// 城镇/NPC (US-021, F-TOWN-002 子集, D-06 经济)
// 场景: mode='town' 城镇静止背景 + NPC 站桩; 接近按 E 交互
// 设施: 商人(买/卖) · 重铸师(100金) · 难度选择 · 出发

import type { GameState } from './state';
import { randomEquipment, getItemSellPrice, getItemBuyPrice, addOwned, rerollAffixes, getOwned, BACKPACK_CAP, type Equipment, type Rarity } from './equipment';

export type NpcKind = 'merchant' | 'smith' | 'difficulty' | 'exit' | 'warehouse';

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
  { kind: 'warehouse',  name: '仓库管理员',  pos: { x: 780, y: 400 }, hint: '存取装备 (账号共享)' },
  { kind: 'difficulty', name: '挑战祭坛',    pos: { x: 1020, y: 400 }, hint: '调整难度' },
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
    // 第 5 格 20% rare 刷新格 (OPT-021)
    const rarity: Rarity = i === 4 && Math.random() < 0.2 ? 'rare' : Math.random() < 0.5 ? 'magic' : 'rare';
    const eq = randomEquipment(rarity);
    out.push({ item: eq, price: getItemBuyPrice(eq.rarity, eq.affixes.length) });
  }
  return out;
}

/** 购买: 扣金 + 入库 (背包满拒绝买入, 不扣金) */
export function buyItem(state: GameState, stock: MerchantStock): boolean {
  if (state.player.gold < stock.price) return false;
  if (getOwned(state).length >= BACKPACK_CAP) return false;
  state.player.gold -= stock.price;
  return addOwned(state, stock.item);
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

/** 药水价格 (OPT-028) */
export const POTION_PRICES: Record<'hp' | 'mp', number> = { hp: 40, mp: 30 };

/** 药水购买最小输入 (GameState 结构满足, 便于单测) */
export interface PotionBuySrc {
  player: { gold: number; potions: { hp: number; mp: number } };
}

/** 购买药水 (OPT-028): 扣金 + 库存, 上限 3; 返回成功 */
export function buyPotion(state: PotionBuySrc, kind: 'hp' | 'mp'): boolean {
  if (state.player.potions[kind] >= 3) return false;
  if (state.player.gold < POTION_PRICES[kind]) return false;
  state.player.gold -= POTION_PRICES[kind];
  state.player.potions[kind]++;
  return true;
}

/** 城镇面板状态 (存 GameState 内部) */
export type TownPanel = 'merchant' | 'smith' | 'warehouse' | 'warehouseTake' | null;

/** 仓库容量 (C-503, 拍板 J5=b): 账号层共享 20 格 */
export const WAREHOUSE_CAP = 20;

/** 仓库最小输入 (GameState 结构满足, 便于单测) */
export interface WarehouseSrc {
  warehouse: Equipment[];
  player: { gold: number; potions: { hp: number; mp: number } };
}

/** 仓库: 背包格存入 (从 owned 移除 → 入仓); 仓库满拒绝 */
export function warehouseStore(state: GameState & WarehouseSrc, backpackIdx: number): boolean {
  const owned = getOwned(state);
  const eq = owned[backpackIdx];
  if (!eq) return false;
  if (state.warehouse.length >= WAREHOUSE_CAP) return false;
  owned.splice(backpackIdx, 1);
  state.warehouse.push(eq);
  return true;
}

/** 仓库: 取回背包 (从仓移除 → 入 owned); 背包满拒绝 */
export function warehouseTake(state: GameState & WarehouseSrc, warehouseIdx: number): boolean {
  const eq = state.warehouse[warehouseIdx];
  if (!eq) return false;
  if (getOwned(state).length >= BACKPACK_CAP) return false;
  state.warehouse.splice(warehouseIdx, 1);
  return addOwned(state, eq);
}