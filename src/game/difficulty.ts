// 难度系统 (US-011, F-DIFF, D-03)
// 3 档: normal / nightmare / hell — 怪物 HP%/伤害%/投射%/掉落%/词条密度

export type Difficulty = 'normal' | 'nightmare' | 'hell' | 'inferno' | 'hardcore';
export const DIFFICULTIES = ['normal', 'nightmare', 'hell', 'inferno', 'hardcore'] as const;

export interface DifficultyMods {
  /** 显示名 */
  name: string;
  /** 数量级倍率 (spawn 时) */
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
  normal:   { name: '普通',   hpMult: 1.0, dmgMult: 1.0, projMult: 1.0, dropMult: 1.0,  affixBonus: 0 },
  nightmare:{ name: '噩梦',   hpMult: 1.8, dmgMult: 1.4, projMult: 1.2, dropMult: 1.25, affixBonus: 1 },
  hell:     { name: '地狱',   hpMult: 2.8, dmgMult: 1.5, projMult: 1.5, dropMult: 1.5,  affixBonus: 2 },
  inferno:  { name: '炼狱',   hpMult: 4.0, dmgMult: 1.8, projMult: 1.8, dropMult: 1.75, affixBonus: 3 },
  hardcore: { name: '硬核',   hpMult: 5.0, dmgMult: 2.0, projMult: 2.0, dropMult: 2.0,  affixBonus: 4 },
};

/** 硬核规则 (D-09): 禁用药水 */
export function isHardcore(d: Difficulty): boolean {
  return d === 'hardcore';
}

export function cycleDifficulty(d: Difficulty): Difficulty {
  const i = DIFFICULTIES.indexOf(d);
  return DIFFICULTIES[(i + 1) % DIFFICULTIES.length];
}