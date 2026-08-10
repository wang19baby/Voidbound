// 平衡快照 + TTK 基线 (OPT-031): 关键数值回归护栏
// 运行: npm test
// 用途: 改任何数值 (难度表/词条倍率/怪 HP) 时, 此文件不绿 = 平衡漂移

import { DIFFICULTY_MODS } from '../src/game/difficulty';
import { MONSTER_DEFS, levelMonsterScale } from '../src/game/monster';
import { getItemBuyPrice, RARITY_VALUE_MULT, materialDrop, REROLL_IRON_COST, RUNE_FORGE_COST, IRON_SHARD_PRICE } from '../src/game/equipment';
import { expNext } from '../src/game/player';

let failures = 0;
function eq(name: string, got: number, want: number): void {
  if (Math.abs(got - want) > 0.0001) {
    console.error(`FAIL ${name}: got ${got}, want ${want}`);
    failures++;
  } else console.log(`ok  ${name}: ${want}`);
}
function check(name: string, cond: boolean): void {
  if (!cond) { console.error(`FAIL ${name}`); failures++; }
  else console.log(`ok  ${name}`);
}

// === TTK 基线 (Lv1 普通难度, 无装备) ===
function ttkHits(hp: number, dmg: number, res: number): number {
  const eff = 1 - Math.max(-100, Math.min(75, res)) / 100;
  const per = Math.max(1, Math.round(dmg * eff));
  return Math.ceil(hp / per);
}
eq('蝙蝠 Lv1 火球 1 杀 (25×1.2=30 ≥30)', ttkHits(MONSTER_DEFS.bat.hp, 25, MONSTER_DEFS.bat.res?.fire ?? 0), 1);
eq('史莱姆 Lv1 近战 2 杀 (50×0.9=45)', ttkHits(MONSTER_DEFS.slime.hp, 50, MONSTER_DEFS.slime.res?.physical ?? 0), 2);
eq('眼球 Lv1 火球 4 杀 (80/(25×0.8=20))', ttkHits(MONSTER_DEFS.eyeball.hp, 25, MONSTER_DEFS.eyeball.res?.fire ?? 0), 4);
eq('Lv21 史莱姆需 3 杀 (120/45)', ttkHits(MONSTER_DEFS.slime.hp * levelMonsterScale(21), 50, MONSTER_DEFS.slime.res?.physical ?? 0), 3);

// === 数值快照 ===
eq('rare 数值倍率 1.25', RARITY_VALUE_MULT.rare, 1.25);
eq('unique 数值倍率 1.75', RARITY_VALUE_MULT.unique, 1.75);
check('买价梯度: rare > magic', getItemBuyPrice('rare', 2) > getItemBuyPrice('magic', 1));
check('买价梯度: unique > rare', getItemBuyPrice('unique', 5) > getItemBuyPrice('rare', 3));
check('expNext 曲线单调递增', expNext(10) > expNext(5) && expNext(20) > expNext(10));
check('难度表 5 档完整', Object.keys(DIFFICULTY_MODS).length === 5);
check('硬核 HP×5 有对应经验补偿', DIFFICULTY_MODS.hardcore.expMult === 2.5);
check('普通难度数值基准不变', DIFFICULTY_MODS.normal.hpMult === 1.0 && DIFFICULTY_MODS.normal.dropMult === 1.0);

// === C-404 材料经济基线 (M5 W4) ===
{
  const boss = materialDrop(0.9, true, false);
  eq('Boss 必掉虚空碎片', boss[0]?.[0] === 'void_fragment' ? 1 : 0, 1);
  eq('Boss roll<0.5 → 1 片', materialDrop(0.2, true, false)[0][1], 1);
  eq('Boss roll≥0.5 → 2 片', materialDrop(0.8, true, false)[0][1], 2);
}
{
  const elite = materialDrop(0.9, false, true);
  eq('精英必掉奥术核心', elite[0]?.[0] === 'arcane_core' ? 1 : 0, 1);
  eq('精英固定 1', elite[0][1], 1);
}
{
  eq('小怪 roll<0.08 掉灵铁', materialDrop(0.05, false, false)[0]?.[1] ?? 0, 1);
  eq('小怪 roll≥0.08 不掉', materialDrop(0.5, false, false).length, 0);
  // 8% 阈值边界: 0.0799 掉 / 0.0801 不掉
  eq('边界 0.0799 掉', materialDrop(0.0799, false, false).length, 1);
  eq('边界 0.0801 不掉', materialDrop(0.0801, false, false).length, 0);
}
{
  eq('重铸灵铁 rare 10', REROLL_IRON_COST.rare, 10);
  eq('重铸灵铁 set 20', REROLL_IRON_COST.set, 20);
  eq('重铸灵铁 unique 40', REROLL_IRON_COST.unique, 40);
  eq('普通/魔法无灵铁轨', REROLL_IRON_COST.normal + REROLL_IRON_COST.magic, 0);
  eq('符文锻造 5 奥术核心', RUNE_FORGE_COST.arcane_core, 5);
  eq('符文锻造 1 虚空碎片', RUNE_FORGE_COST.void_fragment, 1);
  eq('灵铁商店价 25 金', IRON_SHARD_PRICE, 25);
  // 经济链: 1 次 Boss 击杀 (2 虚空) ≥ 2 次符文锻造
  eq('Boss 材料 ≥ 2 次锻造需求', materialDrop(0.8, true, false)[0][1], 2);
}

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);