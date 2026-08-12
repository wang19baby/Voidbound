// 死亡结算 (OPT-011, B1): 结算摘要 + 金币惩罚纯函数
// 软核: 回城 -25% 金币(药水补满) / 原地复活 -10%(药水不补, 5s 无敌) / 重开(满状态)
// 硬核: 永久死亡, 金币惩罚恒 0 (清档语义, 由 hardcoreWipe 处理)

import type { Difficulty } from './difficulty';

export type DeathChoice = 'town' | 'revive' | 'rerun';

/** 结算摘要 (死亡瞬间快照, 供结算屏显示) */
export interface DeathSummary {
  level: number;
  kills: number;
  maxCombo: number;
  gold: number;
  hardcore: boolean;
  /** 击杀者 (内容扩充): 最近伤害来源 */
  killer: string | null;
}

/** deathSummary 的最小输入结构 (GameState 结构满足, 便于纯函数单测) */
export interface DeathSrc {
  player: { level: number; gold: number };
  killsTotal: number;
  combo: { count: number };
  difficulty: Difficulty;
  lastKiller?: string | null;
}

/** 死亡瞬间生成结算摘要 */
export function deathSummary(state: DeathSrc): DeathSummary {
  return {
    level: state.player.level,
    kills: state.combat.killsTotal,
    maxCombo: state.combat.combo.count,
    gold: state.player.gold,
    hardcore: state.difficulty === 'hardcore',
    killer: state.combat.lastKiller ?? null,
  };
}

/** 金币损失: 软核按选择扣; 硬核恒 0 (清档)。返回值已 clamp ≥0 */
export function deathGoldPenalty(gold: number, choice: DeathChoice, hardcore: boolean): number {
  if (hardcore) return 0;
  const rate = choice === 'town' ? 0.25 : choice === 'revive' ? 0.10 : 0;
  return Math.max(0, Math.round(gold * rate));
}