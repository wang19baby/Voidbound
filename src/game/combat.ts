// 伤害公式引擎 (v1.1 D-04, D2R 风格, F-CBT-003/004)
// 纯函数 + 可注入 random, 便于单元测试 (tests/combat.test.ts)
//
// D-04 公式 (v1.1 已确认):
//   物理 = (基础 + 武器伤害) × (1 + Str/100 + 武器% + 技能%) × 暴击 × 抗性后减成 × 易伤
//   元素 = 元素基础 × (1 + 主属性/100) × (1 + 技能%) × 暴击 × 抗性后减成 × 易伤
//   暴击 = 1.5 × (1 + 暴击伤害%/100)
//   有效抗性 = clamp(装备抗性 + 技能抗性 + Buff - 减抗, -100, 75)
//   伤害减免 = 1 - 有效抗性/100 (负值放大)
//   易伤 = 1 + 受易伤加成% (上限 50%)

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

/** 玩家综合战斗属性 (基础 + 装备聚合, US-002 之后由 recomputeCombat 生成) */
export interface CombatStats {
  /** 主属性 (Str/智力等); 0 = 无加成 (1 + 0/100 = 1.0) */
  attr: number;
  /** 物理加成 (武器% + 技能% 加算): 0.5 = +50% */
  physPct: number;
  /** 元素加成 (元素技能% 乘区): 0.5 = ×1.5 */
  elemPct: number;
  /** 暴击率 0..1 */
  critRate: number;
  /** 暴击伤害附加%: 最终倍率 = 1.5 × (1 + critBonus/100) */
  critBonus: number;
  /** 减抗 (命中时先减目标抗性再结算) */
  shred: number;
  /** 易伤加成 (施加给目标, 上限 VULN_CAP) */
  vuln: number;
  /** 各系防御抗性 (玩家被击中时用) */
  res: Record<DamageType, number>;
}

export function emptyRes(): Record<DamageType, number> {
  const r = {} as Record<DamageType, number>;
  for (const t of DAMAGE_TYPES) r[t] = 0;
  return r;
}

export function baseCombat(): CombatStats {
  return {
    attr: 0,
    physPct: 0,
    elemPct: 0,
    critRate: 0.05,
    critBonus: 0,
    shred: 0,
    vuln: 0,
    res: emptyRes(),
  };
}

/** 有效抗性: clamp(抗性 - 减抗, -100, 75) — 减抗先于伤害减免 (D-04) */
export function effectiveResistance(res: number, shred: number): number {
  return Math.max(RESIST_FLOOR, Math.min(RESIST_CAP, res - shred));
}

/** 抗性后减成: 1 - effRes/100 (−100 → 2.0 放大; 75 → 0.25 减免) */
export function resistanceMultiplier(effRes: number): number {
  return 1 - effRes / 100;
}

/** 易伤乘区: 1 + min(vuln, 50)/100 */
export function vulnerabilityMultiplier(vuln: number): number {
  return 1 + Math.min(VULN_CAP, vuln) / 100;
}

/** 暴击乘区: isCrit ? 1.5 × (1 + critBonus/100) : 1 */
export function critMultiplier(isCrit: boolean, critBonus: number): number {
  return isCrit ? CRIT_BASE * (1 + critBonus / 100) : 1;
}

export interface DamageInput {
  base: number;
  type: DamageType;
  /** 攻击者属性 */
  attacker: CombatStats;
  /** 目标对该系抗性 (已含 Buff/Debuff; 减抗由 attacker.shred 叠加) */
  targetRes: number;
  /** 额外易伤 (叠加到 attacker.vuln, 上限 50) */
  extraVuln?: number;
}

export interface DamageResult {
  damage: number;
  isCrit: boolean;
  /** 结算后的有效抗性与减成 (调试/日志用) */
  effRes: number;
}

/**
 * D-04 完整伤害计算 (纯函数). random 可注入做确定性测试.
 */
export function calcDamage(input: DamageInput, random: () => number = Math.random): DamageResult {
  const { base, type, attacker, targetRes } = input;
  const vuln = vulnerabilityMultiplier(attacker.vuln + (input.extraVuln ?? 0));
  const effRes = effectiveResistance(targetRes, attacker.shred);
  const resMult = resistanceMultiplier(effRes);
  const isCrit = random() < attacker.critRate;
  const critMult = critMultiplier(isCrit, attacker.critBonus);

  const attrMult = 1 + attacker.attr / 100;
  let preMultiplier: number;
  if (type === 'physical') {
    // 物理: (1 + Str/100 + 武器% + 技能%) 与 attr 在同一加算区
    preMultiplier = 1 + attacker.attr / 100 + attacker.physPct;
  } else {
    // 元素: (1 + 主属性/100) × (1 + 技能%)
    preMultiplier = attrMult * (1 + attacker.elemPct);
  }

  const raw = base * preMultiplier * critMult * resMult * vuln;
  return {
    damage: Math.max(1, Math.round(raw)),
    isCrit,
    effRes,
  };
}