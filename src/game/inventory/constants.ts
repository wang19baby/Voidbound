// game/inventory/constants.ts — 装备/材料/价格常量 (PR #4 / T5-b, 2026-08-13)
// 从 game/equipment.ts 抽出: 纯常量, 无运行时依赖。
// 依赖: ./types (Rarity, EquipType, MaterialId), ../combat (DamageType)

import type { Rarity, EquipType, MaterialId } from './types';
import type { DamageType } from '../combat';
import type { SetName } from './types';
import { SET_BONUSES } from './set';

// === 稀有度 (F-ITEM-002) ===

export const RARITY_COLORS: Record<Rarity, [number, number, number]> = {
  normal: [0.95, 0.95, 0.95],   // 白
  magic:  [0.30, 0.50, 1.00],   // 蓝
  rare:   [1.00, 0.85, 0.30],   // 黄
  set:    [0.30, 1.00, 0.30],   // 绿
  unique: [1.00, 0.70, 0.10],   // 金 (暗金)
};

export const RARITY_DROP_RATE: Record<Rarity, number> = {
  normal: 0.40,
  magic:  0.25,
  rare:   0.15,
  set:    0.06,
  unique: 0.02,
};

/** 每档词条数量范围 [min, max] */
export const RARITY_AFFIX_COUNT: Record<Rarity, [number, number]> = {
  normal: [0, 0],
  magic:  [1, 2],
  rare:   [2, 3],
  set:    [3, 4],
  unique: [4, 5],
};

/** 词条数值按稀有度分层 (OPT-020): 高稀有度每条更强, 不只条数更多 */
export const RARITY_VALUE_MULT: Record<Rarity, number> = {
  normal: 1.0,
  magic:  1.0,
  rare:   1.25,
  set:    1.5,
  unique: 1.75,
};

// === 穿戴槽 (OPT-014) ===

export const EQUIP_SLOTS: readonly EquipType[] = ['weapon', 'armor', 'charm', 'ring'];

/** 槽位显示名 */
export const EQUIP_NAMES: Record<EquipType, string> = {
  weapon: '武器', armor: '护甲', charm: '护符', ring: '戒指',
};

/** 背包容量 (OPT-014): 满则地上装备不拾取 — 10×10 网格 × 5 页 (2026-08-16 由 100 扩至 500) */
export const BACKPACK_CAP = 500;

/** 装备类型掉落权重 (总数求和) */
export const EQUIP_TYPE_WEIGHTS: Array<[EquipType, number]> = [
  ['weapon', 45], ['armor', 30], ['charm', 15], ['ring', 10],
];

// === 主题词条倾向 (OPT-021) ===

/** 主题词条倾向 (OPT-021): 沙漠→火系 / 废墟→冰系 / 虚空→暗影系 / 森林→生命 */
export const THEME_ELEMENT: Partial<Record<import('../state').Theme, DamageType>> = {
  desert: 'fire', ruin: 'ice', void: 'shadow',
};

/** 主题 Boss 专属套装 (OPT-021) */
export const THEME_BOSS_SET: Record<import('../state').Theme, SetName> = {
  forest: 'flame_set',
  desert: 'shadow_set',
  ruin:   'frost_set',
  void:   'thunder_set',
};

// === 材料系统 (M5 W4 C-401) ===

export const MATERIAL_IDS: readonly MaterialId[] = ['iron_shard', 'arcane_core', 'void_fragment'];

export const MATERIAL_NAMES: Record<MaterialId, string> = {
  iron_shard: '灵铁碎片',
  arcane_core: '奥术核心',
  void_fragment: '虚空碎片',
};

/** 符文锻造材料需求 (C-403): 5 奥术核心 + 1 虚空碎片 */
export const RUNE_FORGE_COST = { arcane_core: 5, void_fragment: 1 } as const;

/** 灵铁碎片价格 (C-401 商店可购) */
export const IRON_SHARD_PRICE = 25;

/** 重铸双轨 (C-402): 灵铁消耗按稀有度 (rare 10 / set 20 / unique 40); 普通/魔法无此轨 */
export const REROLL_IRON_COST: Record<Rarity, number> = {
  normal: 0, magic: 0, rare: 10, set: 20, unique: 40,
};

/** 地面掉落寿命秒 (OPT-032) */
export const LOOT_LIFETIME_SEC = 60;

// === 元素名 (描述用) ===

export const ELEM_NAMES: Record<DamageType, string> = {
  physical: '物理', fire: '火', ice: '冰', lightning: '雷', poison: '毒', shadow: '暗', holy: '圣',
};

// === 随机名 (PR #4 / T5-b, 抽到此处供 drop.ts 使用) ===

export const PREFIXES = ['暗影', '烈焰', '寒霜', '雷霆', '虚空', '圣光', '古龙', '深渊'];
export const SUFFIXES = ['之牙', '之心', '之手', '之眼', '之魂', '之怒', '之誓', '之拥'];

// 重新导出 SET_BONUSES (供 affix.ts / 其它模块通过 constants 入口访问)
export { SET_BONUSES };
