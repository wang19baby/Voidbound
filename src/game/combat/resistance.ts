// game/combat/resistance.ts — 抗性计算 (US-029 拆分)
// 依赖: ./types (RESIST_CAP, RESIST_FLOOR)

import { RESIST_CAP, RESIST_FLOOR } from './types';

/** 有效抗性: clamp(抗性 - 减抗, -100, 75) — 减抗先于伤害减免 (D-04) */
export function effectiveResistance(res: number, shred: number): number {
  return Math.max(RESIST_FLOOR, Math.min(RESIST_CAP, res - shred));
}

/** 抗性后减成: 1 - effRes/100 (−100 → 2.0 放大; 75 → 0.25 减免) */
export function resistanceMultiplier(effRes: number): number {
  return 1 - effRes / 100;
}
