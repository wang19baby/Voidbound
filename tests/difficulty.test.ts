// 难度系统单测 (US-011, F-DIFF/D-03)
// 运行: npm test

import { DIFFICULTIES, DIFFICULTY_MODS, cycleDifficulty } from '../src/game/difficulty';

let failures = 0;
function check(name: string, cond: boolean): void {
  if (!cond) { console.error(`FAIL ${name}`); failures++; }
  else console.log(`ok  ${name}`);
}
function eq(name: string, got: number, want: number): void {
  if (Math.abs(got - want) > 0.0001) {
    console.error(`FAIL ${name}: got ${got}, want ${want}`);
    failures++;
  } else console.log(`ok  ${name}: ${got}`);
}

check('3 档难度', DIFFICULTIES.length === 3);
eq('normal hpMult 1.0', DIFFICULTY_MODS.normal.hpMult, 1.0);
check('难度递增: nightmare hp > normal', DIFFICULTY_MODS.nightmare.hpMult > DIFFICULTY_MODS.normal.hpMult);
check('难度递增: hell hp > nightmare', DIFFICULTY_MODS.hell.hpMult > DIFFICULTY_MODS.nightmare.hpMult);
check('掉落随难度提高', DIFFICULTY_MODS.hell.dropMult > DIFFICULTY_MODS.nightmare.dropMult);
// 循环方向
eq('cycle normal → nightmare', cycleDifficulty('normal'), 'nightmare');
eq('cycle hell → normal', cycleDifficulty('hell'), 'normal');

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);