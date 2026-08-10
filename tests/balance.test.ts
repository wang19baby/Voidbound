// 平衡快照 + TTK 基线 (OPT-031): 关键数值回归护栏
// 运行: npm test
// 用途: 改任何数值 (难度表/词条倍率/怪 HP) 时, 此文件不绿 = 平衡漂移

import { DIFFICULTY_MODS } from '../src/game/difficulty';
import { MONSTER_DEFS, levelMonsterScale } from '../src/game/monster';
import { getItemBuyPrice, RARITY_VALUE_MULT } from '../src/game/equipment';
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

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);