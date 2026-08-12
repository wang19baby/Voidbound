// game/combat/damage.ts — 伤害结算核心 (US-029 拆分)
// 依赖: ./types (DamageType, DAMAGE_TYPES), ./resistance, ./crit, ./status

import { DamageType, DAMAGE_TYPES } from './types';
import { effectiveResistance, resistanceMultiplier } from './resistance';
import { critMultiplier } from './crit';
import { vulnerabilityMultiplier } from './status';

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
  /** 吸血% (OPT-020 补完: unique 独占词条, 命中回复 damage×lifesteal/100) */
  lifesteal: number;
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
    lifesteal: 0,
    res: emptyRes(),
  };
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
