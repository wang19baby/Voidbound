// 经验/升级曲线单测 (US-009, D-05)
// 运行: npm test

import { expNext } from '../src/game/player';

let failures = 0;
function eq(name: string, got: number, want: number): void {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${got}, want ${want}`);
    failures++;
  } else console.log(`ok  ${name}: ${got}`);
}

// D-05: EXP_to_next = 100 × Lv^1.5, 向下取整
eq('Lv1 → 100', expNext(1), 100);
eq('Lv2 → 282 (floor 282.8)', expNext(2), 282);
eq('Lv10 → 3162 (floor 3162.2)', expNext(10), 3162);
eq('Lv20 → 8944 (floor 8944.2)', expNext(20), 8944);
eq('Lv50 → 35355 (floor 35355.3)', expNext(50), 35355);

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);