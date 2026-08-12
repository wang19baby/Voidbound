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
  /** 经验倍率 (OPT-017): 抵消高难度 HP 膨胀, 高难度练级不反向变慢 */
  expMult: number;
}

export const DIFFICULTY_MODS: Record<Difficulty, DifficultyMods> = {
  normal:   { name: '普通',   hpMult: 1.0, dmgMult: 1.0, projMult: 1.0, dropMult: 1.0,  affixBonus: 0, expMult: 1.0 },
  nightmare:{ name: '噩梦',   hpMult: 1.8, dmgMult: 1.4, projMult: 1.2, dropMult: 1.25, affixBonus: 1, expMult: 1.4 },
  hell:     { name: '地狱',   hpMult: 2.8, dmgMult: 1.5, projMult: 1.5, dropMult: 1.5,  affixBonus: 2, expMult: 1.8 },
  inferno:  { name: '炼狱',   hpMult: 4.0, dmgMult: 1.8, projMult: 1.8, dropMult: 1.75, affixBonus: 3, expMult: 2.2 },
  hardcore: { name: '硬核',   hpMult: 5.0, dmgMult: 2.0, projMult: 2.0, dropMult: 2.0,  affixBonus: 4, expMult: 2.5 },
};

/** 硬核规则 (D-09): 禁用药水 */
export function isHardcore(d: Difficulty): boolean {
  return d === 'hardcore';
}

export function cycleDifficulty(d: Difficulty): Difficulty {
  const i = DIFFICULTIES.indexOf(d);
  return DIFFICULTIES[(i + 1) % DIFFICULTIES.length];
}

/**
 * 进度解锁 (OPT-015, C1): 难度 → 需要通关的主题门槛
 * nightmare←forest / hell←desert / inferno←ruin / hardcore←ruin(通关炼狱) + 二次确认(调用方)
 */
export const DIFFICULTY_GATES: Partial<Record<Difficulty, string>> = {
  nightmare: 'forest',
  hell: 'desert',
  inferno: 'ruin',
  hardcore: 'ruin',
};

/** 难度是否已解锁 (cleared = 已通关主题列表) */
export function unlockedDifficulty(cleared: readonly string[], d: Difficulty): boolean {
  const gate = DIFFICULTY_GATES[d];
  if (!gate) return true; // 普通无门槛
  return cleared.includes(gate);
}

/** 门控循环: 从当前难度跳到下一个已解锁难度 (全锁时停在原地) */
export function cycleDifficultyGated(cur: Difficulty, cleared: readonly string[]): Difficulty {
  const i = DIFFICULTIES.indexOf(cur);
  for (let step = 1; step <= DIFFICULTIES.length; step++) {
    const next = DIFFICULTIES[(i + step) % DIFFICULTIES.length];
    if (unlockedDifficulty(cleared, next)) return next;
  }
  return cur;
}