// 内容清单一致性校验 (OPT-033)
// 运行: npm test

import { validateContent, allMonsterTypes } from '../src/game/content/manifest';
import { MONSTER_DEFS } from '../src/game/monster';

let failures = 0;
function check(name: string, cond: boolean): void {
  if (!cond) { console.error(`FAIL ${name}`); failures++; }
  else console.log(`ok  ${name}`);
}

const issues = validateContent();
check('内容清单健康 (0 问题)', issues.length === 0);
if (issues.length > 0) console.error(`  issues: ${issues.join('; ')}`);

const types = allMonsterTypes();
check('怪物定义 ≥21 种 (内容扩充后)', types.length >= 21);
check('所有怪物类型都有 def', types.every(t => !!MONSTER_DEFS[t]));

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);