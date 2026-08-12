// game/combat/status.ts — 易伤 / 状态效果乘区 (US-029 拆分)
// 依赖: ./types (VULN_CAP)

import { VULN_CAP } from './types';

/** 易伤乘区: 1 + min(vuln, 50)/100 */
export function vulnerabilityMultiplier(vuln: number): number {
  return 1 + Math.min(VULN_CAP, vuln) / 100;
}
