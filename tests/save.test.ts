// 读档分派单测: 继续游戏 → 一律回城镇, 再经传送门/地下城入口出发 (GAME_FLOW §3)
// 运行: npm test

import { resumeFromSave } from '../src/app/save';
import type { GameState, Screen } from '../src/game/state';
import type { TownId } from '../src/game/town';

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) console.log(`ok  ${name}`);
  else { failures++; console.log(`FAIL ${name}`); }
}

/** 最小状态桩: resumeFromSave 只触碰 mode/townPanel/player.pos/screen/townId */
function mkState(): GameState {
  return {
    screen: 'title' as Screen,
    mode: 'dungeon',
    townPanel: { kind: 'merchant' },
    townId: 'greenwing' as TownId,
    player: { pos: { x: 0, y: 0 } },
    run: {},
  } as unknown as GameState; // 测试桩: 未覆盖字段不会被 resumeFromSave 访问
}

// 上次在地牢存档: 也必须回城镇 (本次修复的核心)
{
  const s = mkState();
  resumeFromSave(s, { scene: 'dungeon' });
  check('dungeon 存档 → mode=town', s.mode === 'town');
  check('dungeon 存档 → screen=town', s.screen === 'town');
  check('dungeon 存档 → 出生点 (560,500)', s.player.pos.x === 560 && s.player.pos.y === 500);
  check('dungeon 存档 → 城镇面板关闭', s.townPanel === null);
}

// 上次在城镇存档: 行为保持
{
  const s = mkState();
  resumeFromSave(s, { scene: 'town' });
  check('town 存档 → mode=town', s.mode === 'town');
  check('town 存档 → screen=town', s.screen === 'town');
}

// 旧档无 scene 字段 (v11 之前): 同样回城镇
{
  const s = mkState();
  resumeFromSave(s, {});
  check('无 scene 旧档 → mode=town', s.mode === 'town');
  check('无 scene 旧档 → screen=town', s.screen === 'town');
}

// A-W5: 读档 = 新会话, 肉鸽局内快照作废 (防残留污染下一个角色)
{
  const s = mkState();
  (s as unknown as { run: { rogueSnapshot: { level: number } } }).run.rogueSnapshot = { level: 40 };
  resumeFromSave(s, { scene: 'town' });
  check('读档 → 肉鸽快照已清空 (防残留)', (s as unknown as { run: { rogueSnapshot: unknown } }).run.rogueSnapshot === null);
}

if (failures > 0) {
  console.log(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);