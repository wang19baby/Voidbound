// game/combat/types.ts — 伤害类型 + 常量 + 颜色 (US-029 拆分)
// 从 game/combat.ts 抽出: 无依赖, 纯类型 + 常量

export type DamageType =
  | 'physical'
  | 'fire'
  | 'ice'
  | 'lightning'
  | 'poison'
  | 'shadow'
  | 'holy';

export const DAMAGE_TYPES: readonly DamageType[] = [
  'physical', 'fire', 'ice', 'lightning', 'poison', 'shadow', 'holy',
];

export const RESIST_CAP = 75;    // 抗性生效上限 (%)
export const RESIST_FLOOR = -100; // 抗性生效下限 (%)
export const CRIT_BASE = 1.5;    // 基础暴击倍率
export const VULN_CAP = 50;      // 易伤上限 (%)

/** 伤害数字配色 (按类型) */
export const DAMAGE_TYPE_COLORS: Record<DamageType, string> = {
  physical:  '#ffdd8a',
  fire:      '#ff6633',
  ice:       '#66ccff',
  lightning: '#ffee55',
  poison:    '#66ff66',
  shadow:    '#c9aaff',
  holy:      '#ffffff',
};

/** 暴击伤害数字颜色 */
export const CRIT_COLOR = '#ffaa00';
