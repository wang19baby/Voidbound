// game/state/equip.ts — 装备/符文子对象 (PR #2 / T4-d)
//
// 单一数据源: 原 GameState 上的装备面板/符文三选一/材料字段已迁入此子对象;
//             顶层字段已删除,所有引用走 state.equip.*。
// 0 行为变更 (纯物理迁移; 顶层 RuneChoice 也搬入此处避免循环)。
//
// 包含: 选中装备索引/装备面板页/符文三选一/拒绝变异的槽/材料

import type { Equipment, EquipType, MaterialId } from '../equipment';
import type { RuneId } from '../rune';
import type { SkillSlot } from '../skill';

/** 符文三选一状态 (从 state.ts 搬入,避免循环) */
export interface RuneChoice {
  slot: SkillSlot;
  options: RuneId[];
}

/** 装备/符文子对象 */
export interface EquipState {
  /** 装备面板: 选中背包索引 */
  sel: number;
  /** 装备面板: 选中的穿戴槽 (单击槽显示详情; 双击槽卸下) */
  selEquipped: EquipType | null;
  /** 装备面板: 当前页 (C-502 网格分页) */
  page: number;
  /** 活跃的符文三选一 (10 级触发) */
  runeChoice: RuneChoice | null;
  /** 已拒绝变异的槽 (本局不再触发) */
  rejectedRunes: SkillSlot[];
  /** 材料 (M5 W4 C-401): 独立计数不占背包, 第二货币 */
  materials: Record<MaterialId, number>;
}

/** 空 EquipState 工厂 (GameState 初始化用) */
export function createEmptyEquipState(): EquipState {
  return {
    sel: 0,
    selEquipped: null,
    page: 0,
    runeChoice: null,
    rejectedRunes: [],
    materials: { iron_shard: 0, arcane_core: 0, void_fragment: 0 },
  };
}
