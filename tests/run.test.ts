// 跑局状态纯函数单测 (OPT-012): runPhase 阶段判定 + RUN_POOL_SIZE + emptyRun 默认
// 运行: npm test

import { runPhase, emptyRun, WORLD_W, WORLD_H } from '../src/game/state';
import { RUN_POOL_SIZE } from '../src/game/monster';

let failures = 0;
function eq(name: string, got: unknown, want: unknown): void {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    failures++;
  } else console.log(`ok  ${name}: ${JSON.stringify(want)}`);
}
function check(name: string, cond: boolean): void {
  if (!cond) { console.error(`FAIL ${name}`); failures++; }
  else console.log(`ok  ${name}`);
}

// === runPhase: bossKilled → won; 清空且 Boss 未在场 → boss; 否则 clearing ===
eq('满池 → clearing', runPhase(24, false, false), 'clearing');
eq('剩 1 怪 → clearing', runPhase(1, false, false), 'clearing');
eq('清空且无 Boss → boss', runPhase(0, false, false), 'boss');
eq('Boss 在场(小怪 0) → clearing(战斗中)', runPhase(0, true, false), 'clearing');
eq('Boss 在场(小怪 5) → clearing', runPhase(5, true, false), 'clearing');
eq('Boss 击杀 → won', runPhase(0, true, true), 'won');
eq('Boss 击杀(还余怪) → won(优先级最高)', runPhase(7, true, true), 'won');
eq('清空未召 Boss 前 killed=false → boss', runPhase(0, false, false), 'boss');

// === RUN_POOL_SIZE ===
eq('RUN_POOL_SIZE = 24', RUN_POOL_SIZE, 24);

// === emptyRun 默认值 ===
{
  const r = emptyRun('desert');
  eq('theme', r.theme, 'desert');
  eq('total 0', r.total, 0);
  eq('alive 0', r.alive, 0);
  eq('bossAlive false', r.bossAlive, false);
  eq('bossKilled false', r.bossKilled, false);
  eq('victoryShown false', r.victoryShown, false);
  eq('timeSec 0', r.timeSec, 0);
  eq('kills 0', r.kills, 0);
  eq('best 空', JSON.stringify(r.best), '{}');
  eq('mode 默认 linear', r.mode, 'linear');
}

// === A-W2 三模式出生点 + 密度 ===
import { spawnPointForMode, densityForMode, LINEAR_SPAWN, EXTRACT_SPAWN } from '../src/game/world';
const sp = spawnPointForMode('linear');
eq('线性出生 = 左端 (x=320)', sp.x, 320);
eq('线性出生 y 居中', sp.y, WORLD_H / 2);
eq('挑战出生 = 世界中心', JSON.stringify(spawnPointForMode('extract')), JSON.stringify(EXTRACT_SPAWN));
const gsp = spawnPointForMode('gauntlet');
check('高级出生在角落 (320 边距)', [320, WORLD_W - 320].includes(gsp.x) && [320, WORLD_H - 320].includes(gsp.y));
check('线性密度 0.18', densityForMode('linear') === 0.18);
check('高级密度 0.22', densityForMode('gauntlet') === 0.22);
check('挑战密度 0.16', densityForMode('extract') === 0.16);

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);