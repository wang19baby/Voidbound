// D-04 伤害公式引擎单测 (tests/combat.test.ts)
// 运行: npm test  (esbuild 打包后 node 执行, 无外部依赖)

import {
  calcDamage,
  baseCombat,
  effectiveResistance,
  vulnerabilityMultiplier,
  critMultiplier,
  RESIST_CAP,
  RESIST_FLOOR,
  VULN_CAP,
  type CombatStats,
} from '../src/game/combat';

let failures = 0;
function eq(name: string, got: number, want: number): void {
  if (Math.abs(got - want) > 0.0001) {
    console.error(`FAIL ${name}: got ${got}, want ${want}`);
    failures++;
  } else {
    console.log(`ok  ${name}: ${got}`);
  }
}
function check(name: string, cond: boolean): void {
  if (!cond) { console.error(`FAIL ${name}`); failures++; }
  else console.log(`ok  ${name}`);
}

// 攻击者: 默认无暴击 (critRate 0), 无加成
function atk(over: Partial<CombatStats> = {}): CombatStats {
  return { ...baseCombat(), critRate: 0, ...over };
}
const noCrit: () => number = () => 0;          // random()=0 < critRate? critRate 0 → false
const alwaysCrit: () => number = () => 0;      // critRate 1 → 0 < 1 true

// === 抗性/易伤/暴击 边界 ===
eq('有效抗性: 普通', effectiveResistance(25, 0), 25);
eq('有效抗性: clamp 上限 75', effectiveResistance(90, 0), RESIST_CAP);
eq('有效抗性: clamp 下限 -100', effectiveResistance(-200, 0), RESIST_FLOOR);
eq('有效抗性: 减抗先行', effectiveResistance(40, 50), -10);
eq('易伤乘区: 上限 50', vulnerabilityMultiplier(80), 1.5);
eq('易伤乘区: 50%', vulnerabilityMultiplier(50), 1.5);
eq('易伤乘区: 0', vulnerabilityMultiplier(0), 1.0);
eq('暴击乘区: 1.5×', critMultiplier(true, 0), 1.5);
eq('暴击乘区: +100% → 3×', critMultiplier(true, 100), 3.0);
eq('暴击乘区: 非暴击 = 1', critMultiplier(false, 100), 1.0);

// === 物理公式: base × (1 + attr/100 + physPct) × crit × res × vuln ===
eq('物理: 基础 50, 无加成 → 50', calcDamage({ base: 50, type: 'physical', attacker: atk(), targetRes: 0 }, noCrit).damage, 50);
eq('物理: attr 100 + physPct 0.5 加算', calcDamage({ base: 50, type: 'physical', attacker: atk({ attr: 100, physPct: 0.5 }), targetRes: 0 }, noCrit).damage, 125); // 50×2.5
eq('物理: 抗性 25 → ×0.75', calcDamage({ base: 50, type: 'physical', attacker: atk(), targetRes: 25 }, noCrit).damage, 38); // 37.5 → 38

// === 元素公式: base × (1 + attr/100) × (1 + elemPct) × crit × res × vuln ===
eq('元素: 基础 25 火 → 25', calcDamage({ base: 25, type: 'fire', attacker: atk(), targetRes: 0 }, noCrit).damage, 25);
eq('元素: attr 100 乘区 ×2', calcDamage({ base: 25, type: 'fire', attacker: atk({ attr: 100 }), targetRes: 0 }, noCrit).damage, 50);
eq('元素: elemPct 0.5 乘区 ×1.5', calcDamage({ base: 25, type: 'fire', attacker: atk({ elemPct: 0.5 }), targetRes: 0 }, noCrit).damage, 38);
eq('元素: attr+elemPct 组合', calcDamage({ base: 25, type: 'fire', attacker: atk({ attr: 100, elemPct: 0.5 }), targetRes: 0 }, noCrit).damage, 75); // 25×2×1.5

// === 抗性减成 ===
eq('抗性 25 → 25×(0.75)=18.75 → 19', calcDamage({ base: 25, type: 'fire', attacker: atk(), targetRes: 25 }, noCrit).damage, 19);
eq('抗性 90 封顶 75 → 6', calcDamage({ base: 25, type: 'fire', attacker: atk(), targetRes: 90 }, noCrit).damage, 6);
eq('负抗 -50 → ×1.5', calcDamage({ base: 25, type: 'fire', attacker: atk(), targetRes: -50 }, noCrit).damage, 38);
eq('减抗先行: res 40 - shred 50 = -10 → ×1.1', calcDamage({ base: 25, type: 'fire', attacker: atk({ shred: 50 }), targetRes: 40 }, noCrit).damage, 28);
eq('易伤 50 → ×1.5', calcDamage({ base: 25, type: 'physical', attacker: atk({ vuln: 50 }), targetRes: 0 }, noCrit).damage, 38);
eq('extraVuln 叠加 (25+50=75 封 50)', calcDamage({ base: 25, type: 'physical', attacker: atk(), targetRes: 0, extraVuln: 50 }, noCrit).damage, 38);

// === 暴击 ===
eq('暴击 1.5×: 25→37.5→38', calcDamage({ base: 25, type: 'physical', attacker: atk({ critRate: 1 }), targetRes: 0 }, alwaysCrit).damage, 38);
eq('暴击伤害 +100%: 25×3=75', calcDamage({ base: 25, type: 'physical', attacker: atk({ critRate: 1, critBonus: 100 }), targetRes: 0 }, alwaysCrit).damage, 75);
check('isCrit = true 标记', calcDamage({ base: 25, type: 'physical', attacker: atk({ critRate: 1 }), targetRes: 0 }, alwaysCrit).isCrit === true);
check('无暴击时 isCrit = false', calcDamage({ base: 25, type: 'physical', attacker: atk({ critRate: 0 }), targetRes: 0 }, noCrit).isCrit === false);

// === 最小值 ===
eq('伤害最小 1: base 1 ×75 抗 → 0.25 → 1', calcDamage({ base: 1, type: 'fire', attacker: atk(), targetRes: RESIST_CAP }, noCrit).damage, 1);
eq('伤害最小 1: base 1 × 3 抗上限秒', calcDamage({ base: 1, type: 'fire', attacker: atk(), targetRes: 75 }, noCrit).damage, 1);

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);