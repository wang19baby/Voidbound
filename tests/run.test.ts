// 跑局状态纯函数单测 (OPT-012): runPhase 阶段判定 + RUN_POOL_SIZE + emptyRun 默认
// 运行: npm test

import { runPhase, emptyRun } from '../src/game/state';
import { RUN_POOL_SIZE } from '../src/game/monster';

let failures = 0;
function eq(name: string, got: unknown, want: unknown): void {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    failures++;
  } else console.log(`ok  ${name}: ${JSON.stringify(want)}`);
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
}

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);