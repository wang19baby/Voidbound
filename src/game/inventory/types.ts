// game/inventory/types.ts — 装备/物品/材料类型定义 (PR #4 / T5-b, 2026-08-13)
// 从 game/equipment.ts 抽出: 纯类型 + 接口, 无运行时代码。
// SetName 用 union 字面量以避免反向依赖 set.ts (后者持有 SET_BONUSES)。

import type { DamageType } from '../combat';
import type { CombatStats } from '../combat';
import type { Theme } from '../state';

// === 5 阶稀有度 (F-ITEM-002: 普通/魔法/稀有/套装/传奇) ===

export type Rarity = 'normal' | 'magic' | 'rare' | 'set' | 'unique';

/** 装备类型 (OPT-014, A1): 4 槽穿戴 */
export type EquipType = 'weapon' | 'armor' | 'charm' | 'ring';

// === 词条系统 ===

export type AffixStat =
  | 'hp' | 'mp' | 'speed'
  | 'physPct' | 'elemPct' | 'critRate' | 'critBonus'
  | 'shred' | 'vuln' | 'res'
  | 'lifesteal';

export interface Affix {
  stat: AffixStat;
  value: number;
  /** 仅 'res' 词条使用: 目标元素系 */
  element?: DamageType;
}

/** 套装 (US-010, F-ITEM-004): 同套装 >=req 件触发加成 */
export interface SetBonusDef { req: number; stat: 'elemPct' | 'critBonus' | 'shred'; value: number; }

/** 套装名集合 (union 字面量, 避免 set.ts 反向依赖) */
export type SetName = 'shadow_set' | 'flame_set' | 'thunder_set' | 'frost_set' | 'void_set';

// === 材料系统 (M5 W4 C-401) ===

export type MaterialId = 'iron_shard' | 'arcane_core' | 'void_fragment';

/** 材料来源 (GameState 结构满足: equip.materials 字段) */
export interface MaterialSrc {
  equip: { materials: Partial<Record<MaterialId, number>> };
}

export interface Equipment {
  id: number;
  name: string;
  rarity: Rarity;
  /** 装备类型 (OPT-014): 对应穿戴槽 */
  type: EquipType;
  pos: { x: number; y: number };
  size: { w: number; h: number };
  affixes: Affix[];
  pickedUp: boolean;
  /** 套装名 (仅 set 稀有度) */
  setName?: SetName;
  /** 落地时间戳 ms (OPT-032: 60s 后自动消失) */
  spawnT?: number;
}

/** 穿戴槽最小输入 (equipItem/unequipItem/recomputeCombat 依赖; GameState 结构满足, 便于单测)
 *  PR #2 适配: _owned/_loot 已搬到 fx 子对象; equip 字段加 materials (测试 MaterialSrc 用) */
export interface EquipState {
  player: { equipped: Partial<Record<EquipType, Equipment>>; hp: number; mp: number; combat: CombatStats };
  fx?: { owned?: Equipment[]; loot?: Equipment[] };
  equip?: { materials: Record<MaterialId, number> };
}
