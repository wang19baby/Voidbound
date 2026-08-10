// 屏幕状态机单测 (OPT-010): nextScreenOnKey 迁移表 + setScreen/resumeScreen
// 运行: npm test

import { nextScreenOnKey, setScreen, resumeScreen, type Screen } from '../src/game/state';

type SM = { screen: Screen; mode: 'dungeon' | 'town'; pauseFrom: Screen };

let failures = 0;
function eq(name: string, got: unknown, want: unknown): void {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    failures++;
  } else console.log(`ok  ${name}: ${JSON.stringify(want)}`);
}
function mk(over: Partial<SM> = {}): SM {
  return { screen: 'dungeon', mode: 'dungeon', pauseFrom: 'dungeon', ...over };
}

// === nextScreenOnKey 迁移表 ===
eq('dungeon+Esc → pause', nextScreenOnKey('dungeon', 'Escape'), 'pause');
eq('dungeon+Tab → equipment', nextScreenOnKey('dungeon', 'Tab'), 'equipment');
eq('dungeon+W → null', nextScreenOnKey('dungeon', 'w'), null);
eq('town+Esc → pause', nextScreenOnKey('town', 'escape'), 'pause');
eq('town+Tab → null', nextScreenOnKey('town', 'Tab'), null);
eq('equipment+Esc → dungeon', nextScreenOnKey('equipment', 'Escape'), 'dungeon');
eq('equipment+Tab → dungeon', nextScreenOnKey('equipment', 'Tab'), 'dungeon');
eq('pause+3 → title', nextScreenOnKey('pause', '3'), 'title');
eq('pause+4 → town', nextScreenOnKey('pause', '4'), 'town');
eq('pause+Esc → dungeon(默认,handler 用 resumeScreen)', nextScreenOnKey('pause', 'Escape'), 'dungeon');
eq('pause+1 → dungeon(默认)', nextScreenOnKey('pause', '1'), 'dungeon');
eq('pause+Tab → null', nextScreenOnKey('pause', 'Tab'), null);
eq('title+1 → newgame', nextScreenOnKey('title', '1'), 'newgame');
eq('title+2 → null(settings 为子状态)', nextScreenOnKey('title', '2'), null);
eq('title+R → characters', nextScreenOnKey('title', 'r'), 'characters');
eq('characters+Esc → title', nextScreenOnKey('characters', 'Escape'), 'title');
eq('characters+Enter → null(handler 事件型)', nextScreenOnKey('characters', 'Enter'), null);
eq('newgame+Esc → title', nextScreenOnKey('newgame', 'Escape'), 'title');
eq('newgame+Enter → dungeon', nextScreenOnKey('newgame', 'Enter'), 'dungeon');
eq('death+1 → town', nextScreenOnKey('death', '1'), 'town');
eq('death+2 → dungeon', nextScreenOnKey('death', '2'), 'dungeon');
eq('death+3 → dungeon', nextScreenOnKey('death', '3'), 'dungeon');
eq('victory+1 → dungeon', nextScreenOnKey('victory', '1'), 'dungeon');
eq('victory+2 → town', nextScreenOnKey('victory', '2'), 'town');
eq('大小写不敏感', nextScreenOnKey('dungeon', 'ESCAPE'), 'pause');

// === setScreen / resumeScreen ===
{
  const s = mk({ screen: 'pause', pauseFrom: 'town' });
  setScreen(s, 'dungeon');
  eq('setScreen→dungeon 同步 mode', `${s.screen}/${s.mode}`, 'dungeon/dungeon');
  setScreen(s, 'town');
  eq('setScreen→town 同步 mode', `${s.screen}/${s.mode}`, 'town/town');
  setScreen(s, 'title');
  eq('setScreen→title 不动 mode', `${s.screen}/${s.mode}`, 'title/town');
  setScreen(s, 'equipment');
  eq('setScreen→equipment 不动 mode', `${s.screen}/${s.mode}`, 'equipment/town');
  setScreen(s, 'pause');
  eq('setScreen→pause 不动 mode', `${s.screen}/${s.mode}`, 'pause/town');
}
eq('resumeScreen pauseFrom=town → town', resumeScreen(mk({ pauseFrom: 'town' })), 'town');
eq('resumeScreen pauseFrom=dungeon → dungeon', resumeScreen(mk({ pauseFrom: 'dungeon' })), 'dungeon');
eq('resumeScreen 其他来源 → dungeon 兜底', resumeScreen(mk({ pauseFrom: 'victory' })), 'dungeon');

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);