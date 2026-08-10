// 难度系统单测 (US-011, F-DIFF/D-03)
// 运行: npm test

import { DIFFICULTIES, DIFFICULTY_MODS, cycleDifficulty, cycleDifficultyGated, unlockedDifficulty, isHardcore } from '../src/game/difficulty';

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

check('5 档难度', DIFFICULTIES.length === 5);
eq('normal hpMult 1.0', DIFFICULTY_MODS.normal.hpMult, 1.0);
check('难度递增: nightmare hp > normal', DIFFICULTY_MODS.nightmare.hpMult > DIFFICULTY_MODS.normal.hpMult);
check('难度递增: hell hp > nightmare', DIFFICULTY_MODS.hell.hpMult > DIFFICULTY_MODS.nightmare.hpMult);
check('掉落随难度提高', DIFFICULTY_MODS.hell.dropMult > DIFFICULTY_MODS.nightmare.dropMult);
// 循环方向
eq('cycle normal → nightmare', cycleDifficulty('normal'), 'nightmare');
eq('cycle hell → inferno', cycleDifficulty('hell'), 'inferno');
eq('cycle hardcore → normal (闭环)', cycleDifficulty('hardcore'), 'normal');
check('hardcore isHardcore', isHardcore('hardcore'));
check('普通非硬核', !isHardcore('normal'));

// === OPT-015 进度解锁 (C1) ===
check('普通恒解锁', unlockedDifficulty([], 'normal'));
check('噩梦需通关森林', !unlockedDifficulty([], 'nightmare'));
check('通关森林 → 噩梦解锁', unlockedDifficulty(['forest'], 'nightmare'));
check('地狱需通关沙漠', !unlockedDifficulty(['forest'], 'hell'));
check('通关沙漠 → 地狱解锁', unlockedDifficulty(['forest', 'desert'], 'hell'));
check('炼狱需通关废墟', !unlockedDifficulty(['forest', 'desert'], 'inferno'));
check('通关废墟 → 炼狱解锁', unlockedDifficulty(['forest', 'desert', 'ruin'], 'inferno'));
check('硬核未通关废墟时锁定', !unlockedDifficulty(['forest', 'desert'], 'hardcore'));
check('通关废墟 → 硬核解锁(仍须二段确认)', unlockedDifficulty(['forest', 'desert', 'ruin'], 'hardcore'));
// 硬核: 通关炼狱即解锁 (二次确认在调用方)
// cycleDifficultyGated: 只落到已解锁档
eq('无解锁: gated 从 normal 不动', cycleDifficultyGated('normal', []), 'normal');
eq('通关森林: normal → nightmare', cycleDifficultyGated('normal', ['forest']), 'nightmare');
eq('通关森林+沙漠: hell → normal(封顶回绕)', cycleDifficultyGated('hell', ['forest', 'desert']), 'normal');
eq('通关全主题: inferno → hardcore', cycleDifficultyGated('inferno', ['forest', 'desert', 'ruin']), 'hardcore');
eq('通关全主题: hardcore → normal 回绕', cycleDifficultyGated('hardcore', ['forest', 'desert', 'ruin']), 'normal');

// === OPT-017 高难度经验补偿 ===
eq('normal expMult 1.0', DIFFICULTY_MODS.normal.expMult, 1.0);
eq('nightmare expMult 1.4', DIFFICULTY_MODS.nightmare.expMult, 1.4);
eq('hell expMult 1.8', DIFFICULTY_MODS.hell.expMult, 1.8);
eq('inferno expMult 2.2', DIFFICULTY_MODS.inferno.expMult, 2.2);
eq('hardcore expMult 2.5', DIFFICULTY_MODS.hardcore.expMult, 2.5);
check('硬核经验效率 ≥ HP 膨胀的一半', DIFFICULTY_MODS.hardcore.expMult >= DIFFICULTY_MODS.hardcore.hpMult / 2);

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);