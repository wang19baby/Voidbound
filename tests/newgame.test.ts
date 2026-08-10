// 新局选择屏纯函数单测 (OPT-013 + M5 C-103): 职业 1-6 / 难度 Z·X / 主题 ←→
// 运行: npm test

import { moveSelection, ngResolve, ngDefault, themeUnlocked } from '../src/game/newgame';
import { CLASS_IDS } from '../src/game/class';

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

// === 默认 ===
eq('默认: 野蛮人/普通/森林', JSON.stringify(ngDefault()), '{"classIdx":0,"diffIdx":0,"themeIdx":0}');

// === 职业 1-6 ===
eq('1 → 职业0', JSON.stringify(moveSelection(ngDefault(), '1')), '{"classIdx":0,"diffIdx":0,"themeIdx":0}');
eq('6 → 职业5', JSON.stringify(moveSelection(ngDefault(), '6')), '{"classIdx":5,"diffIdx":0,"themeIdx":0}');
eq('7 → null', moveSelection(ngDefault(), '7'), null);

// === 难度 Z/X ===
eq('z → 难度 -1 clamp 0', JSON.stringify(moveSelection(ngDefault(), 'z')), '{"classIdx":0,"diffIdx":0,"themeIdx":0}');
eq('x → 难度 1', JSON.stringify(moveSelection(ngDefault(), 'x')), '{"classIdx":0,"diffIdx":1,"themeIdx":0}');
eq('X 大小写 → 难度 1', JSON.stringify(moveSelection(ngDefault(), 'X')), '{"classIdx":0,"diffIdx":1,"themeIdx":0}');
eq('x×4 → 难度 4 (clamp 5 档)', JSON.stringify(moveSelection(moveSelection(moveSelection(moveSelection(ngDefault(), 'x')!, 'x')!, 'x')!, 'x')), '{"classIdx":0,"diffIdx":4,"themeIdx":0}');

// === 主题 ←→ / A·D ===
eq('d → 主题1', JSON.stringify(moveSelection(ngDefault(), 'd')), '{"classIdx":0,"diffIdx":0,"themeIdx":1}');
eq('arrowright → 主题1', JSON.stringify(moveSelection(ngDefault(), 'ArrowRight')), '{"classIdx":0,"diffIdx":0,"themeIdx":1}');
eq('a → 主题回绕末位', JSON.stringify(moveSelection(ngDefault(), 'a')), '{"classIdx":0,"diffIdx":0,"themeIdx":3}');
eq('arrowleft → 主题回绕', JSON.stringify(moveSelection(ngDefault(), 'ArrowLeft')), '{"classIdx":0,"diffIdx":0,"themeIdx":3}');
eq('enter → null(状态机)', moveSelection(ngDefault(), 'Enter'), null);
eq('组合: 3 职业 + x 难度 + d 主题', JSON.stringify(moveSelection(moveSelection(moveSelection(ngDefault(), '3')!, 'x')!, 'd')), '{"classIdx":2,"diffIdx":1,"themeIdx":1}');

// === ngResolve ===
const r0 = ngResolve(ngDefault());
eq('默认 → barbarian/normal/forest', `${r0.classId}/${r0.difficulty}/${r0.theme}`, 'barbarian/normal/forest');
eq('职业5 → assassin', ngResolve({ classIdx: 5, diffIdx: 0, themeIdx: 0 }).classId, 'assassin');
eq('难度4 → hardcore', ngResolve({ classIdx: 0, diffIdx: 4, themeIdx: 0 }).difficulty, 'hardcore');
eq('主题3 → void', ngResolve({ classIdx: 0, diffIdx: 0, themeIdx: 3 }).theme, 'void');
eq('越界 clamp', ngResolve({ classIdx: 99, diffIdx: 99, themeIdx: 99 }).classId, CLASS_IDS[CLASS_IDS.length - 1]);

// === OPT-015 主题解锁 ===
check('forest 恒解锁', themeUnlocked([], 'forest'));
check('desert 需通关', !themeUnlocked([], 'desert'));
check('通关 desert → 解锁', themeUnlocked(['forest', 'desert'], 'desert'));
check('void 需通关', !themeUnlocked(['forest', 'desert', 'ruin'], 'void'));
check('通关 void → 解锁', themeUnlocked(['forest', 'desert', 'ruin', 'void'], 'void'));

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);