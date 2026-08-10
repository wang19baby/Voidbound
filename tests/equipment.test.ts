// 装备词条聚合 → D-04 CombatStats 单测 (US-002)
// 运行: npm test

import { aggregateCombat, describeAffix, randomEquipment, rerollAffixes, itemPower, getItemBuyPrice, getItemSellPrice, equipItem, unequipItem, unequipSlot, recomputeCombat, getEquippedValues, itemPowerDelta, dropEliteLoot, collectAllLoot, clearGroundLoot, BACKPACK_CAP, type EquipState, type Equipment, type EquipType, type Affix } from '../src/game/equipment';
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

function makeItem(affixes: Affix[], type: EquipType = 'weapon'): Equipment {
  return {
    id: 1, name: '测试', rarity: 'rare', type,
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
function makeSetItem(setName: string): Equipment {
  return { id: 1, name: setName, rarity: 'set', type: 'armor', pos: { x: 0, y: 0 }, size: { w: 24, h: 24 }, affixes: [], pickedUp: true, setName: setName as never };
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

// === US-021 定价/重铸 ===
check('买价: normal 无词条 ≥10', getItemBuyPrice('normal', 0) >= 10);
check('买价: unique > normal', getItemBuyPrice('unique', 5) > getItemBuyPrice('normal', 0));
check('卖价 = 买价×0.4 下取整', getItemSellPrice('rare', 2) === Math.floor(getItemBuyPrice('rare', 2) * 0.4));
// 重铸: 词条数不变, affixes 被重生成 (旧值不允许保留保证) — 用 set 验证生成器不会崩即可
const rz = randomEquipment('magic');
{
  const before = rz.affixes.length;
  rerollAffixes(rz);
  check('重铸保持词条数', rz.affixes.length === before);
  check('重铸后仍可聚合', aggregateCombat([rz]).critRate !== undefined);
}

// === OPT-014 穿戴模型 (A1) ===
function mkState(owned: Equipment[]): EquipState {
  const st: EquipState = { player: { equipped: {}, hp: 100, mp: 100, combat: baseCombat() }, _owned: owned };
  recomputeCombat(st);
  return st;
}
const w1 = makeItem([{ stat: 'physPct', value: 0.4 }], 'weapon');
const w2 = makeItem([{ stat: 'elemPct', value: 0.2 }], 'weapon');
const r1 = makeItem([{ stat: 'critBonus', value: 20 }], 'ring');
{
  const st = mkState([w1, w2, r1]);
  eq('未穿戴 physPct = 0 (仅背包不生效)', st.player.combat.physPct, 0);
  check('穿戴 w1 成功', equipItem(st, w1));
  eq('穿戴后 physPct 生效', st.player.combat.physPct, 0.4);
  eq('穿戴后背包剩 2 件', st._owned!.length, 2);
  check('同槽换装 w2 成功', equipItem(st, w2));
  check('换装后 w1 回背包', st._owned!.includes(w1));
  eq('换装后 w2 生效 (elemPct)', st.player.combat.elemPct, 0.2);
  eq('w1 不再生效 (physPct 归 0)', st.player.combat.physPct, 0);
  check('卸下 weapon 槽', unequipSlot(st, 'weapon'));
  check('卸下后 w2 回背包', st._owned!.includes(w2));
  eq('卸下后 elemPct 归 0', st.player.combat.elemPct, 0);
  eq('getEquippedValues 空 (weapon 已卸下)', getEquippedValues(st).length, 0);
  check('穿戴 ring 成功', equipItem(st, r1));
  eq('getEquippedValues = 1 (ring)', getEquippedValues(st).length, 1);
  check('未入背包的装备不能穿', !equipItem(st, makeItem([], 'ring')));
}
// 背包上限
{
  const st = mkState([]);
  for (let i = 0; i < BACKPACK_CAP; i++) st._owned!.push(makeItem([], 'charm'));
  const equippedRing = makeItem([], 'ring');
  st.player.equipped = { ring: equippedRing };
  recomputeCombat(st);
  check('背包满(20)时卸下被拒', !unequipItem(st, equippedRing));
  const swing = makeItem([], 'weapon');
  st._owned!.push(swing);
  check('超限件仍可读 (cap 由 pickup/buy 门控)', st._owned!.length === BACKPACK_CAP + 1);
  check('背包满时换装 weapon 槽成功(旧件回背包不占位)', st._owned!.length > 0 && equipItem(st, swing));
}
// 对比增量
{
  const st = mkState([w1]);
  st.player.equipped.weapon = w2;
  recomputeCombat(st);
  check('战力增量 w1 vs w2 = 差值', itemPowerDelta(w1, w2) === itemPower(w1) - itemPower(w2));
  check('无旧件增量 = 自身战力', itemPowerDelta(w1, undefined) === itemPower(w1));
}

// === OPT-020 稀有度数值分层 ===
{
  // 采样: unique 词条均值应明显高于 magic (倍率 1.0 vs 1.75)
  let magSum = 0, uniSum = 0, n = 0;
  for (let i = 0; i < 400; i++) {
    const m = randomEquipment('magic');
    const u = randomEquipment('unique');
    for (const a of m.affixes) if (a.stat === 'elemPct' || a.stat === 'physPct') magSum += a.value * 100;
    for (const a of u.affixes) if (a.stat === 'elemPct' || a.stat === 'physPct') uniSum += a.value * 100;
    n += 1;
  }
  check(`unique %词条均值 > magic (${(uniSum / n).toFixed(1)} vs ${(magSum / n).toFixed(1)})`, uniSum > magSum);
}

// === OPT-021 主题词条倾向 + Boss 专属套装 ===
{
  const desert = randomEquipment('rare', 'desert');
  check('沙漠掉落必含火抗词条', desert.affixes.some(a => a.stat === 'res' && a.element === 'fire'));
  const forest = randomEquipment('rare', 'forest');
  check('森林掉落必含生命词条', forest.affixes.some(a => a.stat === 'hp'));
  const bossSet = randomEquipment('set', 'void', 'flame_set');
  check('Boss 专属套装名生效', bossSet.setName === 'flame_set');
  check('Boss 套装词条数 ≥3', bossSet.affixes.length >= 3);
}

// === OPT-020 补完: unique 独占词条 lifesteal ===
{
  let magicHasLs = false;
  let uniqueHasLs = 0;
  for (let i = 0; i < 300; i++) {
    if (randomEquipment('magic').affixes.some(a => a.stat === 'lifesteal')) magicHasLs = true;
    if (randomEquipment('unique').affixes.some(a => a.stat === 'lifesteal')) uniqueHasLs++;
  }
  check('magic 永不产出 lifesteal', !magicHasLs);
  check('unique 可产出 lifesteal', uniqueHasLs > 0);
  const lsItem = makeItem([{ stat: 'lifesteal', value: 5 }]);
  eq('lifesteal 聚合', aggregateCombat([lsItem]).lifesteal, 5);
  check('lifesteal 描述', describeAffix({ stat: 'lifesteal', value: 5 }) === '吸血 +5%');
}

// === 套装扩充 (雷霆/寒霜) ===
{
  const th2 = aggregateCombat([makeSetItem('thunder_set'), makeSetItem('thunder_set')]);
  eq('雷霆套 2件 critBonus +30', th2.critBonus, 30);
  const th3 = aggregateCombat([makeSetItem('thunder_set'), makeSetItem('thunder_set'), makeSetItem('thunder_set')]);
  eq('雷霆套 3件 elemPct +18%', th3.elemPct, 0.18);
  const fr2 = aggregateCombat([makeSetItem('frost_set'), makeSetItem('frost_set')]);
  eq('寒霜套 2件 shred +15', fr2.shred, 15);
  const fr3 = aggregateCombat([makeSetItem('frost_set'), makeSetItem('frost_set'), makeSetItem('frost_set')]);
  eq('寒霜套 3件 critBonus +20', fr3.critBonus, 20);
}
{
  const v2 = aggregateCombat([makeSetItem('void_set'), makeSetItem('void_set')]);
  eq('虚空套 2件 elemPct +10%', v2.elemPct, 0.10);
  const v3 = aggregateCombat([makeSetItem('void_set'), makeSetItem('void_set'), makeSetItem('void_set')]);
  eq('虚空套 3件 shred +12', v3.shred, 12);
  const v4 = aggregateCombat([makeSetItem('void_set'), makeSetItem('void_set'), makeSetItem('void_set'), makeSetItem('void_set')]);
  eq('虚空套 4件 critBonus +35', v4.critBonus, 35);
}

// === 内容扩充: 精英保底掉落 ===
{
  const st: { theme: 'desert'; _loot: Equipment[] } = { theme: 'desert', _loot: [] };
  const eqElite = dropEliteLoot(st, 10, 10);
  check('精英掉落 rare+', eqElite.rarity === 'rare' || eqElite.rarity === 'set' || eqElite.rarity === 'unique');
  check('精英掉落入 _loot', st._loot.length === 1);
  check('精英掉落带主题倾向 (火抗)', eqElite.affixes.some(a => a.stat === 'res' && a.element === 'fire'));
}

// === M5 实测修复: 通关收集地上物品 + 回城清理 ===
{
  const st = mkState([]) as unknown as { player: { equipped: Partial<Record<EquipType, Equipment>>; hp: number; mp: number; combat: CombatStats }; _owned: Equipment[]; _loot?: Equipment[] };
  const fake = st as unknown as { theme: 'desert'; _loot?: Equipment[] };
  dropEliteLoot(fake, 10, 10);
  dropEliteLoot(fake, 20, 20);
  const picked = collectAllLoot(st as never);
  check('通关收集全部地上物品', picked.length === 2);
  check('收集后入背包', st._owned.length === 2);
  check('收集后地上清空', (fake._loot ?? []).length === 0);
}
{
  const st2 = mkState([]) as never;
  const fake2 = st2 as unknown as { theme: 'desert'; _loot?: Equipment[] };
  dropEliteLoot(fake2, 5, 5);
  clearGroundLoot(st2 as never);
  check('回城清理地上物品', (fake2._loot ?? []).length === 0);
}

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);
