// 死亡结算纯函数单测 (OPT-011, B1)
// 运行: npm test

import { deathSummary, deathGoldPenalty } from '../src/game/deathSettle';

let failures = 0;
function eq(name: string, got: unknown, want: unknown): void {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    failures++;
  } else console.log(`ok  ${name}: ${JSON.stringify(want)}`);
}

// === deathGoldPenalty: 软核按选择扣, 硬核恒 0 ===
eq('town 25%', deathGoldPenalty(1000, 'town', false), 250);
eq('revive 10%', deathGoldPenalty(1000, 'revive', false), 100);
eq('rerun 0%', deathGoldPenalty(1000, 'rerun', false), 0);
eq('0 金回城 → 0', deathGoldPenalty(0, 'town', false), 0);
eq('小数向下取整 (37×25%=9.25→9)', deathGoldPenalty(37, 'town', false), 9);
eq('13×10%=1.3→1', deathGoldPenalty(13, 'revive', false), 1);
eq('硬核回城 → 0', deathGoldPenalty(5000, 'town', true), 0);
eq('硬核复活 → 0', deathGoldPenalty(5000, 'revive', true), 0);
eq('负金保护', deathGoldPenalty(-10, 'town', false), 0);

// === deathSummary: 死亡瞬间快照 ===
{
  const s = {
    player: { level: 12, gold: 345 },
    combat: {
      killsTotal: 88,
      combo: { count: 7, timer: 0 },
      lastKiller: 'void_overlord',
    },
    difficulty: 'hardcore',
  } as const;
  const ds = deathSummary(s);
  eq('level', ds.level, 12);
  eq('kills', ds.kills, 88);
  eq('maxCombo', ds.maxCombo, 7);
  eq('gold', ds.gold, 345);
  eq('hardcore 标记', ds.hardcore, true);
  eq('killer 记录', ds.killer, 'void_overlord');
  eq('普通难度 hardcore=false', deathSummary({ ...s, difficulty: 'normal' }).hardcore, false);
  eq('无 killer → null', deathSummary({ ...s, combat: { ...s.combat, lastKiller: undefined } }).killer, null);
}

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);