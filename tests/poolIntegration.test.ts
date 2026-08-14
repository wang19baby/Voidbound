// tests/poolIntegration.test.ts — Pool 在 damageNum 上的集成测试 (B.1.2)
//
// 验证: spawnDamageNum 走 acquire → update 过期 → release 进 free → 复用同 id
// 这是一个最小集成用例, 其他 5 个 store 迁移后会各自补一个

import { spawnDamageNum, updateDamageNums, getDamageNums, _resetDmgNumPool } from '../src/game/fx/damageNum';
import { createEmptyFxState } from '../src/game/state/fx';
import { createEmptyEquipState } from '../src/game/state/equip';
import { createEmptyCombatState } from '../src/game/state/combat';
import { createEmptyUiState } from '../src/game/state/ui';
import type { GameState } from '../src/game/state';

let failures = 0;
const check = (name: string, cond: boolean): void => {
  if (!cond) { failures++; console.log(`FAIL  ${name}`); }
  else console.log(`ok   ${name}`);
};

// 测试用最小 GameState (A.1 后字段必填, 这里都给空数组)
// PR #2 适配: fx/equip/combat/ui 子对象用工厂创建
function mkState(): GameState {
  return {
    player: { pos: { x: 0, y: 0 }, size: { w: 0, h: 0 } } as never,
    world: { w: 1000, h: 1000, walls: [] } as never,
    viewport: { w: 1000, h: 1000 },
    camera: { x: 0, y: 0 },
    fireballSize: 32,
    paused: false,
    deathSummary: null,
    reviveInvuln: 0,
    theme: 'forest',
    mode: 'dungeon',
    townReturn: null,
    townPanel: null,
    townStock: null,
    mysteryStock: null,
    townId: 'greenwing',
    teleportTo: null,
    teleportT: 0,
    trainerSel: 0,
    whFlash: 0,
    screen: 'dungeon',
    pauseFrom: 'dungeon',
    ngSel: { classIdx: 0, diffIdx: 0, themeIdx: 0, modeIdx: 0 },
    ngFrom: 'title',
    difficulty: 'normal',
    run: { theme: 'forest', mode: 'linear', total: 0, alive: 0, bossAlive: false, bossKilled: false, victoryShown: false, t0: 0, timeSec: 0, kills: 0, best: {}, collectedLoot: 0, bossStage: 0 },
    cleared: [],
    legacy: [],
    confirmHardcore: false,
    pendingDifficulty: null,
    castFailFlash: null,
    resources: {} as never,
    currentChar: 'char_0',
    charList: [],
    charSel: 0,
    charConfirmDel: false,
    charNameInput: '',
    tutorShown: false,
    tutorStep: -1,
    tutorT: 0,
    warehouse: [],
    townWalk: null,
    // PR #1 子对象
    combat: createEmptyCombatState(),
    ui: createEmptyUiState(),
    // PR #2 子对象
    fx: createEmptyFxState(),
    equip: createEmptyEquipState(),
  } as GameState;
}

// === spawn / get 正常 ===
{
  _resetDmgNumPool();
  const s = mkState();
  spawnDamageNum(s, 100, 200, '-30', '#f00');
  check('spawn 后 state.fx.dmgNums 长度=1', s.fx.dmgNums.length === 1);
  check('getDamageNums 返回同一个', getDamageNums(s).length === 1);
  const d = s.fx.dmgNums[0];
  check('pos.x 正确', d.pos.x === 100);
  check('pos.y 正确', d.pos.y === 200);
  check('text 正确', d.text === '-30');
  check('color 正确', d.color === '#f00');
  check('life 初始 0.7', d.life === 0.7);
  check('vy 初始 -40 (上浮)', d.vy === -40);
}

// === update 模拟淡出 + release ===
{
  _resetDmgNumPool();
  const s = mkState();
  spawnDamageNum(s, 100, 200, '-50');
  spawnDamageNum(s, 110, 210, '-60');
  check('spawn 2 个', s.fx.dmgNums.length === 2);
  updateDamageNums(s, 0.5);  // life -= 0.5 → 0.2 → 还活着
  check('update 0.5s 后还有 2 个 (life > 0)', s.fx.dmgNums.length === 2);
  updateDamageNums(s, 0.3);  // life → -0.1 → 释放
  check('再 update 0.3s 后过期全释放', s.fx.dmgNums.length === 0);
}

// === 复用: 同一对象的 id 在第二轮 spawn 中再现 ===
{
  _resetDmgNumPool();
  const s = mkState();
  spawnDamageNum(s, 0, 0, '-1');
  const firstObj = s.fx.dmgNums[0];
  updateDamageNums(s, 1.0);  // 释放
  spawnDamageNum(s, 0, 0, '-2');
  const secondObj = s.fx.dmgNums[0];
  check('复用: 第二次 spawn 取到 reset 后的同一对象', firstObj === secondObj);
  check('reset 生效: text 被覆盖为 -2', secondObj.text === '-2');
}

// === 多对象并发 spawn, 全部 update 后清空 ===
{
  _resetDmgNumPool();
  const s = mkState();
  for (let i = 0; i < 20; i++) spawnDamageNum(s, i * 10, i * 10, `-${i}`);
  check('并发 spawn 20 个', s.fx.dmgNums.length === 20);
  updateDamageNums(s, 1.0);  // 全部过期
  check('update 后 20 个全释放', s.fx.dmgNums.length === 0);
}

if (failures > 0) {
  console.log(`\n${failures} FAILURES`);
  process.exit(1);
}
console.log('\nALL PASS');
