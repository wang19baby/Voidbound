// 难度系统 (US-011, F-DIFF, D-03)
// 3 档: normal / nightmare / hell — 怪物 HP%/伤害%/投射%/掉落%/词条密度

export type Difficulty = 'normal' | 'nightmare' | 'hell';
export const DIFFICULTIES = ['normal', 'nightmare', 'hell'] as const;

export interface DifficultyMods {
  /** 怪物血量倍率 (spawn 时) */
  hpMult: number;
  /** 怪物接触伤害倍率 */
  dmgMult: number;
  /** 敌方投射物伤害倍率 */
  projMult: number;
  /** 掉落概率倍率 */
  dropMult: number;
  /** 掉落词条数加成 */
  affixBonus: number;
}

export const DIFFICULTY_MODS: Record<Difficulty, DifficultyMods> = {
  normal:   { hpMult: 1.0, dmgMult: 1.0, projMult: 1.0, dropMult: 1.0,  affixBonus: 0 },
  nightmare:{ hpMult: 1.8, dmgMult: 1.4, projMult: 1.2, dropMult: 1.25, affixBonus: 1 },
  hell:     { hpMult: 2.8, dmgMult: 1.8, projMult: 1.5, dropMult: 1.5,  affixBonus: 2 },
};

export function cycleDifficulty(d: Difficulty): Difficulty {
  const i = DIFFICULTIES.indexOf(d);
  return DIFFICULTIES[(i + 1) % DIFFICULTIES.length];
}