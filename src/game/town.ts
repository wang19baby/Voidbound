// 城镇/NPC (US-021, F-TOWN-002 子集, D-06 经济 + M5 W3 C-301~303)
// 场景: mode='town' 城镇静止背景 + NPC 站桩; 接近按 E 交互
// 设施: 商人(买/卖) · 重铸师(100金) · 仓库(账号共享) · 难度选择 · 出发
// W3: 3 城镇表 TOWN_DEFS + 解锁链 (森林→商业城, 沙漠+废墟→圣城) + 传送师 + 神秘商人/训练师

import type { GameState } from './state';
import { randomEquipment, getItemSellPrice, getItemBuyPrice, addOwned, rerollAffixes, getOwned, BACKPACK_CAP, materialCount, spendMaterial, rerollCostOption, REROLL_IRON_COST, RUNE_FORGE_COST, IRON_SHARD_PRICE, type Equipment, type Rarity, type MaterialId } from './equipment';

export type NpcKind = 'merchant' | 'smith' | 'difficulty' | 'exit' | 'warehouse' | 'teleport' | 'mystery' | 'trainer' | 'forge';

export interface TownNpc {
  kind: NpcKind;
  name: string;
  pos: { x: number; y: number };
  hint: string;
  /** npcs 图集 sprite 名 (美术: 7 角色 + portal_array 传送阵); difficulty 祭坛为结构物设为空 */
  sprite: string;
}

/** 城镇 id (C-301): 3 镇 */
export type TownId = 'greenwing' | 'harbor' | 'sanctum';
export const TOWN_IDS: readonly TownId[] = ['greenwing', 'harbor', 'sanctum'];

export interface TownDef {
  id: TownId;
  name: string;
  /** 解锁前置主题 (C-301): greenwing=无, harbor=[forest], sanctum=[desert, ruin] */
  requires: readonly string[];
  /** 城镇底色 (C-302): 新手镇深蓝 / 商业城海港蓝 / 圣城圣光金 */
  color: string;
  npcs: TownNpc[];
}

/** 城镇表 (M5 §4.1) */
export const TOWN_DEFS: Record<TownId, TownDef> = {
  greenwing: {
    id: 'greenwing', name: '鲁特·格莱宁', requires: [],
    color: '0.10, 0.11, 0.16',
    npcs: [
      { kind: 'merchant',   name: '商人',       pos: { x: 240, y: 400 }, hint: '买装备 / 卖装备 / 药水', sprite: 'merchant_stand' },
      { kind: 'smith',      name: '重铸师',     pos: { x: 480, y: 400 }, hint: '100金 重铸词条', sprite: 'smith_stand' },
      { kind: 'warehouse',  name: '仓库管理员', pos: { x: 720, y: 400 }, hint: '存取装备 (账号共享)', sprite: 'warehouse_stand' },
      { kind: 'difficulty', name: '挑战祭坛',   pos: { x: 960, y: 400 }, hint: '调整难度', sprite: '' },
      { kind: 'exit',       name: '地下城入口', pos: { x: 600, y: 200 }, hint: '出发', sprite: 'portal_array' },
    ],
  },
  harbor: {
    id: 'harbor', name: '卡斯特蓝港', requires: ['forest'],
    color: '0.08, 0.16, 0.24',
    npcs: [
      { kind: 'merchant',   name: '商人',       pos: { x: 200, y: 400 }, hint: '买装备 / 卖装备 / 药水', sprite: 'merchant_stand' },
      { kind: 'mystery',    name: '神秘商人',   pos: { x: 440, y: 400 }, hint: '传奇装备 (500-2000金)', sprite: 'mystery_stand' },
      { kind: 'smith',      name: '装备重铸师', pos: { x: 680, y: 400 }, hint: '100金 重铸词条', sprite: 'smith_stand' },
      { kind: 'warehouse',  name: '仓库管理员', pos: { x: 920, y: 400 }, hint: '存取装备 (账号共享)', sprite: 'warehouse_stand' },
      { kind: 'teleport',   name: '传送师',     pos: { x: 1140, y: 400 }, hint: '前往其他城镇', sprite: 'teleporter_stand' },
      { kind: 'exit',       name: '地下城入口', pos: { x: 600, y: 200 }, hint: '出发', sprite: 'portal_array' },
    ],
  },
  sanctum: {
    id: 'sanctum', name: '圣所·阿卡拉', requires: ['desert', 'ruin'],
    color: '0.16, 0.13, 0.08',
    npcs: [
      { kind: 'merchant',   name: '商人',       pos: { x: 160, y: 400 }, hint: '买装备 / 卖装备 / 药水', sprite: 'merchant_stand' },
      { kind: 'forge',      name: '符文锻造师', pos: { x: 400, y: 400 }, hint: '5奥术核心+1虚空碎片 重铸符文', sprite: 'forge_stand' },
      { kind: 'trainer',    name: '训练师',     pos: { x: 640, y: 400 }, hint: '技能树开发中', sprite: 'trainer_stand' },
      { kind: 'smith',      name: '重铸师',     pos: { x: 880, y: 400 }, hint: '100金/灵铁 重铸词条', sprite: 'smith_stand' },
      { kind: 'warehouse',  name: '仓库管理员', pos: { x: 1120, y: 400 }, hint: '存取装备 (账号共享)', sprite: 'warehouse_stand' },
      { kind: 'teleport',   name: '传送师',     pos: { x: 1140, y: 220 }, hint: '前往其他城镇', sprite: 'teleporter_stand' },
      { kind: 'exit',       name: '地下城入口', pos: { x: 600, y: 200 }, hint: '出发', sprite: 'portal_array' },
    ],
  },
};

/** 城镇 NPC 基准视口 (1280×720 为设计基准) */
const BASE_W = 1280;
const BASE_H = 720;

/** 当前镇 NPC 列表 (C-301): 按 townId 取, viewport 缩放 (修复: 窗口放大 NPC 不跑左上角) */
export function townNpcs(townId: TownId, viewport?: { w: number; h: number }): TownNpc[] {
  const base = TOWN_DEFS[townId]?.npcs ?? TOWN_DEFS.greenwing.npcs;
  if (!viewport || (viewport.w === BASE_W && viewport.h === BASE_H)) return base;
  const sx = viewport.w / BASE_W;
  const sy = viewport.h / BASE_H;
  return base.map(n => ({ ...n, pos: { x: n.pos.x * sx, y: n.pos.y * sy } }));
}

/** 城镇解锁判定 (C-301): 通关前置主题全部 → 解锁; 新手镇默认 */
export function unlockedTown(cleared: readonly string[], townId: TownId): boolean {
  const def = TOWN_DEFS[townId];
  if (!def) return false;
  return def.requires.every(t => cleared.includes(t));
}

/** 已解锁城镇列表 (C-302 传送师目标) */
export function unlockedTowns(cleared: readonly string[]): TownId[] {
  return TOWN_IDS.filter(t => unlockedTown(cleared, t));
}

/** 最近 NPC (80px 内; 按当前镇布局 + viewport 缩放) */
export function nearestNpc(state: GameState, townId: TownId): TownNpc | null {
  const p = state.player.pos;
  const npcs = townNpcs(townId, { w: state.viewport.w, h: state.viewport.h });
  let best: TownNpc | null = null;
  let bestD = 80 * 80;
  for (const n of npcs) {
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

/** 神秘商人库存 (C-303): 每局 4 件传奇, 500-2000 金 */
export interface MysteryStock { item: Equipment; price: number; }
export function genMysteryStock(): MysteryStock[] {
  const out: MysteryStock[] = [];
  for (let i = 0; i < 4; i++) {
    const eq = randomEquipment('unique');
    const price = 500 + Math.floor(Math.random() * 1501);  // 500-2000
    out.push({ item: eq, price });
  }
  return out;
}

/** 购买: 扣金 + 入库 (背包满拒绝买入, 不扣金) */
export function buyItem(state: GameState, stock: MerchantStock | MysteryStock): boolean {
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

/** 重铸 (C-402 双轨): 100 金 或 灵铁 (rare 10/set 20/unique 40); 返回 'gold' | 'iron' | null */
export function rerollOwned(state: GameState, idx: number): 'gold' | 'iron' | null {
  const owned = getOwned(state);
  const eq = owned[idx];
  if (!eq) return null;
  const opt = rerollCostOption(state, eq);
  if (opt === 'iron') {
    if (!spendMaterial(state, 'iron_shard', REROLL_IRON_COST[eq.rarity])) return null;
    rerollAffixes(eq);
    return 'iron';
  }
  if (opt === 'gold') {
    if (state.player.gold < 100) return null;
    state.player.gold -= 100;
    rerollAffixes(eq);
    return 'gold';
  }
  return null;
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
export type TownPanel = 'merchant' | 'smith' | 'warehouse' | 'warehouseTake' | 'mystery' | 'teleport' | 'forge' | 'trainer' | null;

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

/** 符文锻造 (C-403): 消耗 5 奥术核心 + 1 虚空碎片 → 返回是否成功 (具体重铸由调用方触发三选一) */
export function runeForgePay(state: GameState): boolean {
  if (materialCount(state, 'arcane_core') < RUNE_FORGE_COST.arcane_core) return false;
  if (materialCount(state, 'void_fragment') < RUNE_FORGE_COST.void_fragment) return false;
  spendMaterial(state, 'arcane_core', RUNE_FORGE_COST.arcane_core);
  spendMaterial(state, 'void_fragment', RUNE_FORGE_COST.void_fragment);
  return true;
}