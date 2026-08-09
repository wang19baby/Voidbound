// 装备词条聚合 → D-04 CombatStats 单测 (US-002)
// 运行: npm test

import { aggregateCombat, describeAffix, randomEquipment, rerollAffixes, getItemBuyPrice, getItemSellPrice, type Equipment, type Affix } from '../src/game/equipment';
import { baseCombat } from '../src/game/combat';

let failures = 0;
function eq(name: string, got: number, want: number): void {
  if (Math.abs(got - want) > 0.0001) {
    console.error(`FAIL ${name}: got ${got}, want ${want}`);
    failures++;
  } else console.log(`ok  ${name}: ${got}`);
}
function check(name: string, cond: boolean): void {
  if (!cond) { console.error(`FAIL ${name}`); failures++; }
  else console.log(`ok  ${name}`);
}

function makeItem(affixes: Affix[]): Equipment {
  return {
    id: 1, name: '测试', rarity: 'rare',
    pos: { x: 0, y: 0 }, size: { w: 24, h: 24 },
    affixes, pickedUp: true,
  };
}

// 空装备 → 基础属性
const empty = aggregateCombat([]);
eq('空聚合 = baseCrit 0.05', empty.critRate, baseCombat().critRate);
eq('空聚合所有抗性 0', empty.res.fire, 0);

// 单件: 物理/暴击/减抗/易伤/抗性
const one = aggregateCombat([makeItem([
  { stat: 'physPct', value: 0.5 },
  { stat: 'critRate', value: 0.04 },   // 0.05 + 0.04 = 0.09
  { stat: 'critBonus', value: 25 },
  { stat: 'shred', value: 15 },
  { stat: 'vuln', value: 10 },
  { stat: 'res', value: 20, element: 'fire' },
])]);
eq('physPct 聚合', one.physPct, 0.5);
eq('critRate 聚合 (0.05+0.04)', one.critRate, 0.09);
eq('critBonus 聚合', one.critBonus, 25);
eq('shred 聚合', one.shred, 15);
eq('vuln 聚合', one.vuln, 10);
eq('火抗聚合', one.res.fire, 20);
eq('未指定元素抗不变', one.res.ice, 0);

// 多件叠加
const multi = aggregateCombat([
  makeItem([{ stat: 'elemPct', value: 0.2 }]),
  makeItem([{ stat: 'elemPct', value: 0.3 }]),
]);
eq('多件 elemPct 加法叠加', multi.elemPct, 0.5);

// critRate 上限 1
const capped = aggregateCombat([makeItem([{ stat: 'critRate', value: 0.99 }, { stat: 'critRate', value: 0.99 }])]);
check('critRate 上限 1', capped.critRate === 1);

// hp/mp/speed 不进入聚合 (即时效果)
const instant = aggregateCombat([makeItem([{ stat: 'hp', value: 40 }, { stat: 'mp', value: 30 }, { stat: 'speed', value: 0.2 }])]);
check('hp/mp/speed 不进聚合', instant.physPct === 0 && instant.critRate === baseCombat().critRate);

// describeAffix 文案
check('描述: 火抗', describeAffix({ stat: 'res', value: 15, element: 'fire' }) === '火抗 +15');
check('描述: 暴击率', describeAffix({ stat: 'critRate', value: 0.04 }) === '暴击率 +4%');
check('描述: 减抗', describeAffix({ stat: 'shred', value: 12 }) === '减抗 +12');

// === US-010 套装加成 ===
function makeSetItem(setName: 'shadow_set' | 'flame_set'): Equipment {
  return { id: 1, name: setName, rarity: 'set', pos: { x: 0, y: 0 }, size: { w: 24, h: 24 }, affixes: [], pickedUp: true, setName };
}

// 2 件暗影套 → +15% elemPct
const s2 = aggregateCombat([makeSetItem('shadow_set'), makeSetItem('shadow_set')]);
eq('暗影套 2件 elemPct +15%', s2.elemPct, 0.15);
// 3 件 → +elemPct 15% + critBonus 25
const s3 = aggregateCombat([makeSetItem('shadow_set'), makeSetItem('shadow_set'), makeSetItem('shadow_set')]);
eq('暗影套 3件 critBonus +25%', s3.critBonus, 25);
// 烈焰套 3件 → shred +20, elemPct +12%
const f3 = aggregateCombat([makeSetItem('flame_set'), makeSetItem('flame_set'), makeSetItem('flame_set')]);
eq('烈焰套 3件 shred +20', f3.shred, 20);
eq('烈焰套 3件 elemPct +12%', f3.elemPct, 0.12);
// 混合套装独立计数
const mix = aggregateCombat([makeSetItem('shadow_set'), makeSetItem('shadow_set'), makeSetItem('flame_set')]);
eq('混搭: 暗影 2件生效, 烈焰 1件不生效', mix.elemPct, 0.15);

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);
// === US-021 定价/重铸 ===
check('买价: normal 无词条 ≥10', getItemBuyPrice('normal', 0) >= 10);
check('买价: unique > normal', getItemBuyPrice('unique', 5) > getItemBuyPrice('normal', 0));
check('卖价 = 买价×0.4 下取整', getItemSellPrice('rare', 2) === Math.floor(getItemBuyPrice('rare', 2) * 0.4));
// 重铸: 词条数不变, affixes 被重生成 (旧值不允许保留保证) — 用 set 验证生成器不会崩即可
const rz = randomEquipment('magic');
structkeep: {
  const before = rz.affixes.length;
  rerollAffixes(rz);
  check('重铸保持词条数', rz.affixes.length === before);
  check('重铸后仍可聚合', aggregateCombat([rz]).critRate !== undefined);
}
