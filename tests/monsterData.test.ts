// 怪物系统数据/缩放单测 (OPT-018/021/022)
// 运行: npm test

import { levelMonsterScale, MONSTER_DEFS, THEME_MONSTER_POOL, THEME_BOSS, rollElite, ELITE_CHANCE, ELITE_HP_MULT } from '../src/game/monster';
import { THEME_BOSS_SET } from '../src/game/equipment';
import { THEMES, type Theme } from '../src/game/state';

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

// === OPT-018 等级缩放 ===
eq('Lv1 缩放 1.0', levelMonsterScale(1), 1.0);
eq('Lv21 缩放 2.0', levelMonsterScale(21), 2.0);
eq('Lv51 缩放 3.5', levelMonsterScale(51), 3.5);
eq('Lv0 兜底 1.0', levelMonsterScale(0), 1.0);

// === OPT-021 每主题 ≥2 独有行为怪 (dash/split) ===
for (const t of THEMES) {
  const pool = THEME_MONSTER_POOL[t];
  const withAi = pool.filter(m => MONSTER_DEFS[m].ai !== undefined);
  check(`主题 ${t} 池有 ≥2 只行为怪 (实际 ${withAi.length})`, withAi.length >= 2);
}
check('分裂怪存在', ['plague_slime', 'frost_worm', 'bloat_eye'].every(m => MONSTER_DEFS[m].ai === 'split'));
check('冲撞怪存在', ['direwolf', 'bee', 'queen_bee', 'wraith', 'ghost'].every(m => MONSTER_DEFS[m].ai === 'dash'));

// === OPT-022 Boss 机制互不相同 (代码分支断言) ===
const bossSkills = (THEMES as Theme[]).map(t => MONSTER_DEFS[THEME_BOSS[t]].bossSkill);
check('4 Boss 机制: summon/ring/charge 覆盖', bossSkills.includes('summon') && bossSkills.includes('ring') && bossSkills.includes('charge'));
check('pumpking summon', MONSTER_DEFS.pumpking.bossSkill === 'summon');
check('war_pharaoh ring', MONSTER_DEFS.war_pharaoh.bossSkill === 'ring');
check('void_overlord charge', MONSTER_DEFS.void_overlord.bossSkill === 'charge');

// === OPT-021 主题 Boss 专属套装 ===
import { THEME_BOSS_SET, SET_BONUSES } from '../src/game/equipment';
check('THEME_BOSS_SET 覆盖 4 主题', Object.keys(THEME_BOSS_SET).length === 4);
check('4 主题 4 套互不相同', new Set(Object.values(THEME_BOSS_SET)).size === 4);
check('Boss 套装均为既存套装', Object.values(THEME_BOSS_SET).every(s => Object.keys(SET_BONUSES).includes(s)));

// === 内容扩充: 精英怪 ===
check('精英概率 8%', ELITE_CHANCE === 0.08);
check('rollElite 0.01 → 精英', rollElite(() => 0.01));
check('rollElite 0.079 → 精英 (临界内)', rollElite(() => 0.079));
check('rollElite 0.08 → 普通 (开区间)', !rollElite(() => 0.08));
check('rollElite 0.2 → 普通', !rollElite(() => 0.2));
check('精英 HP ×2.2', ELITE_HP_MULT === 2.2);

// === M3 元素/领主系统 ===
import { ELEMENT_DEFS, ELEMENT_IDS } from '../src/game/element';
import { DAMAGE_TYPES } from '../src/game/combat';
import { LORD_CHANCE, LORD_SIZE_SCALE, LORD_HP_MULT, LORD_DMG_MULT } from '../src/game/monster';
check('5 元素定义', ELEMENT_IDS.length === 5);
for (const id of ELEMENT_IDS) {
  const def = ELEMENT_DEFS[id];
  check(`元素 ${id} 色相 0-360`, def.hue >= 0 && def.hue < 360);
  check(`元素 ${id} 伤害系合法`, (DAMAGE_TYPES as string[]).includes(def.dmgType));
}
check('领主概率 4%', LORD_CHANCE === 0.04);
check('领主体型 ×1.6', LORD_SIZE_SCALE === 1.6);
check('领主 HP ×5', LORD_HP_MULT === 5);
check('领主伤害 ×1.5', LORD_DMG_MULT === 1.5);
// HD 接线回归: 4 Boss 用自己的画 (M3 美术接入后)
check('pumpking 自画', MONSTER_DEFS.pumpking.sprite === 'pumpking');
check('war_pharaoh 自画', MONSTER_DEFS.war_pharaoh.sprite === 'war_pharaoh');
check('frost_lich 自画', MONSTER_DEFS.frost_lich.sprite === 'frost_lich');
check('void_overlord 自画', MONSTER_DEFS.void_overlord.sprite === 'void_overlord');

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);