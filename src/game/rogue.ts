// game/rogue.ts — A-W5 肉鸽模式局内临时练级
//
// 语义: 肉鸽地图内角色从 Lv1 开始练级 (局内临时), 挑战地图 (linear/gauntlet/extract)
//   才把练级写到持久角色。肉鸽局内战利品 (装备/金币/材料) 保留带回, 等级/经验/技能点
//   不写回 —— 回城/结算时用进入时快照还原持久进度。
//
// 生命周期:
// - startRun(mode='rogue') → beginRogue: 首次快照持久角色 (重开不覆盖) + 局内重置 Lv1
// - enterTown (死亡/通关/传送门/放弃/硬核后重开) → endRogue: 还原快照 + 清空
//
// 快照内容: level / exp / skillPoints / combat.attr / 每槽技能等级
//   (attr 仅由升级产生, recomputeCombat 会从装备聚合清零 → 还原需手动回写)
// 不含: 装备/金币/材料/被动 (这些本就持久保留)

import type { GameState } from './state';
import { SKILL_SLOTS, getSkill, type SkillSlot } from './skill';
import { MAX_HP, MAX_MP } from './character/base';

/** 进入肉鸽局: 首次拍持久快照 (重开不覆盖), 局内重置到 Lv1 基础 */
export function beginRogue(state: GameState): void {
  if (!state.run.rogueSnapshot) {
    const skillLevels: Partial<Record<SkillSlot, number>> = {};
    for (const slot of SKILL_SLOTS) skillLevels[slot] = getSkill(slot).level;
    state.run.rogueSnapshot = {
      level: state.player.level,
      exp: state.player.exp ?? 0,
      skillPoints: state.player.skillPoints ?? 0,
      attr: state.player.combat.attr ?? 0,
      skillLevels,
    };
  }
  resetRogueLevel(state);
}

/** 局内重置到 Lv1 基础 (装备/被动保留, 血量法按上限) */
function resetRogueLevel(state: GameState): void {
  state.player.level = 1;
  state.player.exp = 0;
  state.player.skillPoints = 0;
  state.player.combat.attr = 0;
  for (const slot of SKILL_SLOTS) getSkill(slot).level = 1;
  state.player.hp = state.player.hpMax ?? MAX_HP;
  state.player.mp = state.player.mpMax ?? MAX_MP;
}

/** 回城/结算: 还原持久快照, 清空局内临时状态 */
export function endRogue(state: GameState): void {
  const s = state.run.rogueSnapshot;
  if (!s) return;
  state.player.level = s.level;
  state.player.exp = s.exp;
  state.player.skillPoints = s.skillPoints;
  state.player.combat.attr = s.attr;
  for (const slot of SKILL_SLOTS) {
    const lv = s.skillLevels[slot];
    if (lv !== undefined) getSkill(slot).level = lv;
  }
  state.run.rogueSnapshot = null;
}
