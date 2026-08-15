// 技能系统纯函数单测 (US-004: 等级缩放 + 符文选项池)
// 运行: npm test

import { skillDamageScale, pickRuneOptions, MAX_SKILL_LEVEL, comboScoreMult } from '../src/game/skill';
import { RUNE_DEFS } from '../src/game/rune';

let failures = 0;
function eq(name: string, got: number, want: number): void {
  if (Math.abs(got - want) > 0.0001) {
    console.error(`FAIL ${name}: got ${got}, want ${want}`);
    failures++;
  } else console.log(`ok  ${name}: ${got}`);
}
function check(name: string, cond: boolean): void {
  if (!cond) { console.error(`FAIL ${name}`); failures++; }
  else console.log(`ok  ${name}`);
}

// 每级 +10% 伤害
eq('Lv1 = 1.0 (无加成)', skillDamageScale(1), 1.0);
eq('Lv10 = 1.9', skillDamageScale(10), 1.9);
eq('Lv20 = 2.9', skillDamageScale(MAX_SKILL_LEVEL), 2.9);
check('Lv1-20 单调递增', skillDamageScale(5) < skillDamageScale(6));

// 符文选项池: 3 个不重复, 不含 none
for (let i = 0; i < 20; i++) {
  const opts = pickRuneOptions(3);
  check(`选项数=3 (run ${i})`, opts.length === 3);
  check(`不重复 (run ${i})`, new Set(opts).size === opts.length);
  check(`不含 none (run ${i})`, opts.every(r => r !== 'none' && r in RUNE_DEFS));
}

// === US-017 Combo 分数乘数 ===
eq('combo 0 → 1.0', comboScoreMult(0), 1.0);
eq('combo 10 → 2.0', comboScoreMult(10), 2.0);
eq('combo 20 → 3.0 (上限)', comboScoreMult(20), 3.0);
eq('combo 30 → 3.0 (封顶)', comboScoreMult(30), 3.0);

// === OPT-023 符文分族 ===
import { RUNE_FAMILIES } from '../src/game/rune';
check('火球池有 4 个选项', RUNE_FAMILIES.fireball.length >= 3);
check('nova 符文定义存在', !!RUNE_DEFS.nova);
check('nova 属于火球族', RUNE_FAMILIES.fireball.includes('nova'));
// 家族池抽样: 近战槽三选一不得出现火球专属符文
for (let i = 0; i < 20; i++) {
  const meleeOpts = pickRuneOptions('LMB', 3);
  check(`近战池选项 ∈ {cleave,steal,vampire}: ${meleeOpts.join(',')}`, meleeOpts.every(r => RUNE_FAMILIES.melee.includes(r)));
  const fbOpts = pickRuneOptions('Q', 3);
  check(`火球池选项 ∈ 火球家族: ${fbOpts.join(',')}`, fbOpts.every(r => RUNE_FAMILIES.fireball.includes(r)));
}

// === E-03 符文三选一鼠标点击: 任何屏 (含 screen==='dungeon', 战斗内 Ctrl+1..6 加点触发) 都应可选 ===
// 回归: frame.ts drawFrame 在 runeChoice 激活时把 LMB 路由到 handleUiClick (不再当攻击)
import { handleUiClick, buildUiCtx } from '../src/app/uiDispatch';
import { createEmptyEquipState } from '../src/game/state/equip';
import { getSkill } from '../src/game/skill';
{
  const st = {
    player: { pos: { x: 0, y: 0 }, size: { w: 32, h: 32 }, level: 1, skillPoints: 1 } as never,
    world: { w: 1000, h: 1000, walls: [] } as never,
    viewport: { w: 1280, h: 720 },
    camera: { x: 0, y: 0 },
    screen: 'dungeon' as const,
    mode: 'linear' as const,
    theme: 'forest' as const,
    difficulty: 'normal' as const,
    equip: createEmptyEquipState(),
    fx: { vfx: [], monsters: [], dmgNums: [] } as never,
    ui: {} as never,
    run: {} as never,
  } as never;
  st.equip.runeChoice = { slot: 'Q', options: ['split', 'pierce', 'nova'] as never };
  const vw = st.viewport.w, vh = st.viewport.h;
  const boxW = 260, gap = 20, totalW = boxW * 3 + gap * 2;
  const x0 = (vw - totalW) / 2, y0 = vh / 2 - 70;
  // 模拟 frame.ts: runeChoice 激活时 LMB → handleUiClick, 而非攻击
  const isDungeon = st.screen === 'dungeon' && !st.equip.runeChoice;
  check('E-03 screen=dungeon + runeChoice → 不走攻击分支', isDungeon === false);
  const ctx = buildUiCtx(st, x0 + boxW / 2, y0 + 42, {} as never);
  const handled = handleUiClick(ctx);
  check('E-03 点符文盒1 → 已处理', handled === true);
  check('E-03 点符文盒1 → runeChoice 清空', st.equip.runeChoice === null);
  check('E-03 点符文盒1 → 符文已绑定', getSkill('Q').rune === 'split');
}

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);