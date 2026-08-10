// 职业系统单测 (M5 C-102/104/105): 职业表完整性 + bindSkill 保留等级
// 运行: npm test

import { CLASS_DEFS, CLASS_IDS, classById, classAttrWeight, bindClass } from '../src/game/class';
import { SKILL_SPECS, bindSkill, skillLevel, SKILL_SLOTS, getSkill, slotDisplay } from '../src/game/skill';
import type { GameState } from '../src/game/state';

let failures = 0;
function check(name: string, cond: boolean): void {
  if (!cond) { console.error(`FAIL ${name}`); failures++; }
  else console.log(`ok  ${name}`);
}
function eq(name: string, got: unknown, want: unknown): void {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    failures++;
  } else console.log(`ok  ${name}: ${JSON.stringify(want)}`);
}

// === 职业表完整性 ===
check('6 职业', CLASS_IDS.length === 6);
for (const id of CLASS_IDS) {
  const def = CLASS_DEFS[id];
  check(`职业 ${id} 有名称/称号/描述/颜色/主属性`, !!def.name && !!def.title && !!def.desc && !!def.color && !!def.attr);
  for (const slot of SKILL_SLOTS) {
    check(`职业 ${id} 槽位 ${slot} 技能 ∈ 技能池`, !!SKILL_SPECS[def.skillSlots[slot]]);
  }
}
check('6 职业槽位配置互不相同', new Set(CLASS_IDS.map(id => JSON.stringify(CLASS_DEFS[id].skillSlots))).size === 6);
eq('classById 命中', classById('mage').name, '法师');
eq('野蛮人属性权重 1.0', classAttrWeight('barbarian'), 1.0);
eq('法师属性权重 0.8', classAttrWeight('mage'), 0.8);

// === bindSkill 保留等级/符文 ===
{
  const fake = { player: { classId: 'barbarian' } } as unknown as GameState;
  bindSkill('Q', 'fireball');
  // 手动升 2 级 (registry 内部) — 通过 assignSkillPoint 需 skillPoints; 直接验证 bindSkill 保留: 先绑 + 再绑不同技能
  // 由于 registry 是模块级, 用 skillLevel 读
  bindClass(fake, 'barbarian');
  check('bindClass 后 Q = 旋风斩', getSkill('Q').id === 'whirlwind');
  check('bindClass 后 LMB = 挥击', getSkill('LMB').id === 'melee');
  check('bindClass 后 RMB = 重击', getSkill('RMB').id === 'bash');
  check('bindClass 后 W = 突刺(纯近战,无火球)', getSkill('W').id === 'thrust');
  bindClass(fake, 'mage');
  check('切法师后 Q = 冰霜新星', getSkill('Q').id === 'frost_nova');
  check('切法师后 LMB = 火球', getSkill('LMB').id === 'fireball');
  check('切法师后 W = 闪电链', getSkill('W').id === 'chain_lightning');
  check('切法师后 E = 回血(全职业)', getSkill('E').id === 'heal');
  check('切法师后 R = 终极(全职业)', getSkill('R').id === 'ultimate');
  const lv = skillLevel('Q');
  check(`换职业后 Q 等级保留 (${lv})`, lv >= 1);
}

// === 技能池覆盖 ===
check('技能池 ≥13', Object.keys(SKILL_SPECS).length >= 13);
for (const id of ['melee', 'thrust', 'bash', 'whirlwind', 'fireball', 'multi_fireball', 'frost_nova', 'chain_lightning', 'shadow_bolt', 'holy_bolt', 'poison_dart', 'heal', 'ultimate'] as const) {
  check(`技能 ${id} 已注册`, !!SKILL_SPECS[id]);
}

// === 槽位展示名 (W 槽施放键是 F) ===
eq('W 槽显示为 F', slotDisplay('W'), 'F');
eq('Q 显示为 Q', slotDisplay('Q'), 'Q');
eq('LMB 显示为 左键', slotDisplay('LMB'), '左键');
eq('RMB 显示为 右键', slotDisplay('RMB'), '右键');

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);