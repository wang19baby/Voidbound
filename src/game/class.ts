// 职业系统 (M5 C-102): 6 职业定义 + bindClass
// 槽位配置引用 SKILL_SPECS 技能 id; bindClass 重绑 6 槽 (等级/符文按槽保留)

import type { GameState } from './state';
import { SKILL_SLOTS, bindSkill, type SkillSlot, type SkillId } from './skill';

export type ClassId = 'barbarian' | 'paladin' | 'mage' | 'necromancer' | 'ranger' | 'assassin';
export type ClassAttr = 'str' | 'dex' | 'vit' | 'int' | 'fai' | 'cha';

export interface ClassDef {
  id: ClassId;
  name: string;
  title: string;
  desc: string;
  color: string;
  attr: ClassAttr;
  /** 升级自动加点倍率 (C-105): attr 增量 = round(5 × weight) */
  attrWeight: number;
  skillSlots: Record<SkillSlot, SkillId>;
}

export const CLASS_DEFS: Record<ClassId, ClassDef> = {
  barbarian: {
    id: 'barbarian', name: '野蛮人', title: '狂暴战士', desc: '近战高伤, 血厚耐打', color: '#ff6a4a',
    attr: 'str', attrWeight: 1.0,
    skillSlots: { LMB: 'melee', RMB: 'bash', Q: 'whirlwind', W: 'thrust', E: 'heal', R: 'ultimate' },
  },
  paladin: {
    id: 'paladin', name: '圣骑士', title: '圣光卫士', desc: '圣光输出, 稳定自愈', color: '#ffd64a',
    attr: 'fai', attrWeight: 0.8,
    skillSlots: { LMB: 'melee', RMB: 'holy_bolt', Q: 'frost_nova', W: 'heal', E: 'fireball', R: 'ultimate' },
  },
  mage: {
    id: 'mage', name: '法师', title: '元素学者', desc: '远程爆发, 高蓝耗', color: '#66ccff',
    attr: 'int', attrWeight: 0.8,
    skillSlots: { LMB: 'fireball', RMB: 'multi_fireball', Q: 'frost_nova', W: 'chain_lightning', E: 'heal', R: 'ultimate' },
  },
  necromancer: {
    id: 'necromancer', name: '死灵法师', title: '暗夜术士', desc: '暗影与剧毒, 持续伤害', color: '#c9aaff',
    attr: 'cha', attrWeight: 0.8,
    skillSlots: { LMB: 'shadow_bolt', RMB: 'poison_dart', Q: 'frost_nova', W: 'melee', E: 'heal', R: 'ultimate' },
  },
  ranger: {
    id: 'ranger', name: '游侠', title: '荒野猎手', desc: '双远程, 走位灵活', color: '#66ff66',
    attr: 'dex', attrWeight: 0.8,
    skillSlots: { LMB: 'poison_dart', RMB: 'fireball', Q: 'melee', W: 'multi_fireball', E: 'heal', R: 'ultimate' },
  },
  assassin: {
    id: 'assassin', name: '刺客', title: '暗影行者', desc: '高速近身, 爆发收割', color: '#ff7ad9',
    attr: 'dex', attrWeight: 0.8,
    skillSlots: { LMB: 'melee', RMB: 'shadow_bolt', Q: 'poison_dart', W: 'whirlwind', E: 'heal', R: 'ultimate' },
  },
};

export const CLASS_IDS: readonly ClassId[] = ['barbarian', 'paladin', 'mage', 'necromancer', 'ranger', 'assassin'];

export function classById(id: ClassId): ClassDef {
  return CLASS_DEFS[id];
}

/** 升级属性权重 (C-105) */
export function classAttrWeight(id: ClassId): number {
  return CLASS_DEFS[id]?.attrWeight ?? 1.0;
}

/** 绑定职业: 重绑 6 槽技能 id + 记录 classId (等级/符文保留) */
export function bindClass(state: GameState, classId: ClassId): void {
  const def = CLASS_DEFS[classId];
  for (const slot of SKILL_SLOTS) {
    bindSkill(slot, def.skillSlots[slot]);
  }
  state.player.classId = classId;
}