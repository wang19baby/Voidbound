// game/inventory/affix.ts — 词条生成 + 描述 (PR #4 / T5-b, 2026-08-13)
// 从 game/equipment.ts 抽出: rollValue / genAffix / describeAffix / AFFIX_POOL / UNIQUE_ONLY_POOL。
// 依赖: ./types (Affix, AffixStat), ../combat (DAMAGE_TYPES)

import type { Affix, AffixStat } from './types';
import { DAMAGE_TYPES } from '../combat';
import { ELEM_NAMES } from './constants';

export const AFFIX_POOL: AffixStat[] = [
  'hp', 'mp', 'speed', 'physPct', 'elemPct', 'critRate', 'critBonus', 'shred', 'vuln', 'res',
];

/** unique 独占词条池 (OPT-020 补完): 暗金专属, 其他稀有度不产出 */
export const UNIQUE_ONLY_POOL: AffixStat[] = ['lifesteal'];

/** 按词条类型滚数值 (OPT-020: mult 按稀有度分层) */
export function rollValue(stat: AffixStat, mult = 1): number {
  const r = (lo: number, hi: number): number => Math.round((lo + Math.random() * (hi - lo)) * mult);
  switch (stat) {
    case 'hp':       return r(15, 40);
    case 'mp':       return r(10, 30);
    case 'speed':    return Math.round((0.05 + Math.random() * 0.10) * 100 * mult) / 100;
    case 'physPct':  return Math.round((0.10 + Math.random() * 0.20) * 100 * mult) / 100;
    case 'elemPct':  return Math.round((0.10 + Math.random() * 0.17) * 100 * mult) / 100;
    case 'critRate': return Math.round((0.02 + Math.random() * 0.04) * 100 * mult) / 100;
    case 'critBonus':return r(10, 40);
    case 'shred':    return r(5, 20);
    case 'vuln':     return r(5, 15);
    case 'res':      return r(5, 25);
    case 'lifesteal':return r(2, 6);
  }
}

/** 生成随机词条 (res 词条附带随机元素系); mult = 稀有度数值分层 */
export function genAffix(mult = 1): Affix {
  const stat = AFFIX_POOL[Math.floor(Math.random() * AFFIX_POOL.length)];
  const value = rollValue(stat, mult);
  const element = stat === 'res'
    ? DAMAGE_TYPES[1 + Math.floor(Math.random() * (DAMAGE_TYPES.length - 1))]  // 元素系 (非 physical)
    : undefined;
  return { stat, value, element };
}

export function describeAffix(a: Affix): string {
  switch (a.stat) {
    case 'hp':       return `生命 +${a.value}`;
    case 'mp':       return `法力 +${a.value}`;
    case 'speed':    return `移速 +${Math.round(a.value * 100)}%`;
    case 'physPct':  return `物理伤害 +${Math.round(a.value * 100)}%`;
    case 'elemPct':  return `元素伤害 +${Math.round(a.value * 100)}%`;
    case 'critRate': return `暴击率 +${Math.round(a.value * 100)}%`;
    case 'critBonus':return `暴击伤害 +${a.value}%`;
    case 'shred':    return `减抗 +${a.value}`;
    case 'vuln':     return `易伤 +${a.value}%`;
    case 'lifesteal':return `吸血 +${a.value}%`;
    case 'res':      return `${a.element ? ELEM_NAMES[a.element] : '元素'}抗 +${a.value}`;
  }
}
