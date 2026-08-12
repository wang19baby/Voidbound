// game/combat/crit.ts — 暴击乘区 (US-029 拆分)
// 依赖: ./types (CRIT_BASE)

import { CRIT_BASE } from './types';

/** 暴击乘区: isCrit ? 1.5 × (1 + critBonus/100) : 1 */
export function critMultiplier(isCrit: boolean, critBonus: number): number {
  return isCrit ? CRIT_BASE * (1 + critBonus / 100) : 1;
}
