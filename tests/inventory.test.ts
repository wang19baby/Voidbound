// inventory 子模块聚合单测 (PR #4 / T5-b)
// 验证从 game/inventory/ barrel 入口可访问所有原 game/equipment.ts 公共 API,
//   + 关键行为 (randomEquipment 确定性 + equipItem 槽位替换 + 词条聚合 + 材料概率 + 价格)
// 运行: npm test → tests/inventory.test.ts

import {
  randomEquipment, equipItem, unequipItem, unequipSlot, recomputeCombat, getEquippedValues,
  aggregateCombat, getItemBuyPrice, getItemSellPrice, materialDrop,
  BACKPACK_CAP, type EquipState, type Equipment, type EquipType, type Affix, type Rarity,
} from '../src/game/inventory';

import { baseCombat, type CombatStats } from '../src/game/combat';

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

// === 1. randomEquipment 固定种子下不崩 + 必含稀有度 ===
{
  const eq = randomEquipment('magic');
  check('magic 产出', eq.rarity === 'magic');
  check('magic 必含 1-2 词条', eq.affixes.length >= 1 && eq.affixes.length <= 2);
  check('magic 无 setName', eq.setName === undefined);
  const eq2 = randomEquipment('set', 'desert', 'shadow_set');
  check('set + forcedSet 生效', eq2.setName === 'shadow_set');
  // 主题沙漠 +1 火抗词条, 因此 3-4 基底 + 1 主题 = 4-5
  check('set + 主题词条 4-5 条', eq2.affixes.length >= 4 && eq2.affixes.length <= 5);
}

// === 2. equipItem / unequipItem 槽位替换 (复用装备.test 关键路径) ===
{
  const w1 = makeItem([{ stat: 'physPct', value: 0.4 }], 'weapon');
  const w2 = makeItem([{ stat: 'elemPct', value: 0.2 }], 'weapon');
  const r1 = makeItem([{ stat: 'critBonus', value: 20 }], 'ring');
  const st: EquipState = { player: { equipped: {}, hp: 100, mp: 100, combat: baseCombat() }, fx: { owned: [w1, w2, r1] } };
  recomputeCombat(st);
  eq('初态 physPct=0', st.player.combat.physPct, 0);
  check('equipItem w1 成功', equipItem(st, w1));
  eq('穿戴后 physPct=0.4', st.player.combat.physPct, 0.4);
  eq('背包剩 2 件', st.fx!.owned!.length, 2);
  check('同槽换装 w2', equipItem(st, w2));
  check('w1 回背包', st.fx!.owned!.includes(w1));
  eq('w2 生效 elemPct=0.2', st.player.combat.elemPct, 0.2);
  eq('w1 失效 physPct=0', st.player.combat.physPct, 0);
  check('卸下 weapon 槽', unequipSlot(st, 'weapon'));
  check('w2 回背包', st.fx!.owned!.includes(w2));
  check('equip ring', equipItem(st, r1));
  eq('getEquippedValues=1', getEquippedValues(st).length, 1);
  check('未入背包的装备不能穿', !equipItem(st, makeItem([], 'ring')));
}

// === 3. aggregateCombat 词条聚合 (关键统计) ===
{
  const one = aggregateCombat([makeItem([
    { stat: 'physPct', value: 0.5 },
    { stat: 'critRate', value: 0.04 },
    { stat: 'critBonus', value: 25 },
    { stat: 'shred', value: 15 },
    { stat: 'vuln', value: 10 },
    { stat: 'res', value: 20, element: 'fire' },
  ])]);
  eq('physPct', one.physPct, 0.5);
  eq('critRate=0.05+0.04', one.critRate, 0.09);
  eq('critBonus', one.critBonus, 25);
  eq('shred', one.shred, 15);
  eq('vuln', one.vuln, 10);
  eq('火抗', one.res.fire, 20);
  eq('未指定元素抗=0', one.res.ice, 0);
  const capped = aggregateCombat([makeItem([{ stat: 'critRate', value: 0.99 }, { stat: 'critRate', value: 0.99 }])]);
  check('critRate 上限 1', capped.critRate === 1);
}

// === 4. materialDrop 概率表 ===
{
  const boss = materialDrop(0.3, true, false);
  check('Boss 必出 void_fragment', boss.length === 1 && boss[0][0] === 'void_fragment');
  check('Boss roll<0.5 出 1', boss[0][1] === 1);
  const boss2 = materialDrop(0.9, true, false);
  check('Boss roll≥0.5 出 2', boss2[0][1] === 2);
  const elite = materialDrop(0.5, false, true);
  check('精英出 1 arcane_core', elite.length === 1 && elite[0][0] === 'arcane_core' && elite[0][1] === 1);
  const small = materialDrop(0.05, false, false);
  check('小怪 roll<0.08 出 iron_shard', small.length === 1 && small[0][0] === 'iron_shard');
  const smallNone = materialDrop(0.5, false, false);
  check('小怪 roll≥0.08 不出', smallNone.length === 0);
}

// === 5. 价格函数 (US-021) ===
{
  eq('normal 买价≥10', getItemBuyPrice('normal', 0) >= 10 ? 1 : 0, 1);
  check('unique > normal', getItemBuyPrice('unique', 5) > getItemBuyPrice('normal', 0));
  check('卖价 = 买价×0.4 向下取整', getItemSellPrice('rare', 2) === Math.floor(getItemBuyPrice('rare', 2) * 0.4));
  const rarities: Rarity[] = ['normal', 'magic', 'rare', 'set', 'unique'];
  for (const r of rarities) {
    const buy = getItemBuyPrice(r, 3);
    const sell = getItemSellPrice(r, 3);
    check(`${r} 卖价 < 买价`, sell < buy);
  }
}

// === 6. BACKPACK_CAP 常量 ===
{
  eq('BACKPACK_CAP=20', BACKPACK_CAP, 20);
}

// === 7. 兼容层: 验证 barrel re-export 完整性 ===
{
  // 验证 aggregateCombat 在 const 调用时类型与原 behavior 一致
  const only = aggregateCombat([makeItem([{ stat: 'physPct', value: 0.1 }])]);
  check('aggregateCombat 返回 CombatStats', typeof (only as CombatStats).physPct === 'number');
}

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);
