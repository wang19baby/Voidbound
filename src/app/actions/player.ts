// app/actions/player.ts — 玩家侧动作 (US-029 后续拆分)
//
// 本次拆分: 从 main.ts 搬出 4 个玩家侧副作用函数
// - notifyCastFail: 施法失败反馈 (OPT-007)
// - requestDifficulty: 难度切换入口 (OPT-015)
// - hardcoreWipe: 硬核永久死亡 (D-09)
// - revivePlayer: 原地复活 (OPT-011)
//
// 依赖: game/* 领域模块 (只读 state, 不引入循环依赖)

import type { GameState } from '../../game/state';
import type { Difficulty } from '../../game/difficulty';
import type { SkillSlot } from '../../game/skill';
import { unlockedDifficulty, DIFFICULTY_MODS } from '../../game/difficulty';
import { pushToast } from '../../game/toast';
import { getOwned, recomputeCombat, emptyMaterials } from '../../game/equipment';
import { recomputePassives } from '../../game/passive';
import { getSkill, SKILL_SLOTS } from '../../game/skill';
import { MAX_HP, MAX_MP } from '../../game/player';
import { inf } from '../../util/log';

/** 施法失败反馈 (OPT-007): toast 区分 MP/CD; 主技能槽 0.4s 红闪 */
export function notifyCastFail(state: GameState, slot: SkillSlot): void {
  const sk = getSkill(slot);
  const msg = state.player.mp < sk.mpCost ? 'MP 不足' : '冷却中';
  pushToast(state, `${sk.name}: ${msg}`, '#ff5555');
  if (slot === 'Q' || slot === 'W' || slot === 'E' || slot === 'R') {
    state.castFailFlash = { slot, t: 0.4 };
  }
}

/** 难度切换入口 (OPT-015): 未解锁拒绝 + toast; 硬核走二段确认 (OPT-006) */
export function requestDifficulty(state: GameState, d: Difficulty): void {
  if (d === state.difficulty) return;
  if (!unlockedDifficulty(state.cleared, d)) {
    pushToast(state, `${DIFFICULTY_MODS[d].name} 未解锁 (通关前置)`, '#f66');
    return;
  }
  if (d === 'hardcore') {
    state.pendingDifficulty = d;
    state.confirmHardcore = true;
    return;
  }
  state.difficulty = d;
  inf('game', `难度 → ${DIFFICULTY_MODS[d].name}`);
}

/** 硬核永久死亡 (D-09): 清空装备/等级/技能/符文 (OPT-011 死亡结算"重开"路径调用) */
export function hardcoreWipe(state: GameState): void {
  getOwned(state).length = 0;
  recomputeCombat(state);
  state.player.level = 1;
  state.player.exp = 0;
  state.player.skillPoints = 0;
  state.materials = emptyMaterials();  // M5 W4 C-401: 硬核清档含材料
  state.player.passives = {};
  recomputePassives(state);  // v9: 硬核清档含被动
  for (const slot of SKILL_SLOTS) {
    const sk = getSkill(slot);
    sk.level = 1;
    sk.rune = null;
  }
  state.rejectedRunes.length = 0;
  inf('game', 'HARDCORE: 永久死亡, 进度已清空');
}

/** 原地复活 (OPT-011): 满血蓝 + 5s 无敌, 药水不补 (死亡不再自动补满) */
export function revivePlayer(state: GameState): void {
  state.player.hp = MAX_HP;
  state.player.mp = MAX_MP;
  state.reviveInvuln = 5;
  state.player.dodgeT = 0;
  state.player.dodgeCd = 0;
  state.fireballs.length = 0;
  inf('gl', 'revived in place (5s invuln)');
}