// VFX 系统纯函数单测 (UX_REVIEW §8.3 ①): 发射器生命周期 / SkillFx 表
// 运行: npm test

import { spawnRing, spawnBurst, spawnBolt, spawnGlow, spawnImpact, spawnPlayerHitFx, updateVfx, getVfx, aoeVisual, ELEMENT_FX, type Vfx } from '../src/game/vfx';
import type { GameState } from '../src/game/state';

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

function fakeState(): GameState {
  return { vfx: [] as Vfx[] } as unknown as GameState;
}

// === 发射器生命周期 ===
const s1 = fakeState();
spawnRing(s1, 10, 20, 100, 0.5, 'circle_01', [1, 0, 0]);
spawnBurst(s1, 10, 20, 6, [0, 1, 0]);
check('spawn 2 个 VFX', getVfx(s1).length === 2);
updateVfx(s1, 0.3);
check('0.3s 后仍在 (dur 0.5)', getVfx(s1).length === 2);
updateVfx(s1, 0.3);
check('0.6s 后全部过期移除', getVfx(s1).length === 0);

// === burst 方向预生成 ===
const s2 = fakeState();
spawnBurst(s2, 0, 0, 8, [0.5, 0.5, 0.5], 'spark_03', 140);
const b = getVfx(s2)[0];
check('burst 粒子方向数 = 8', b.dirs?.length === 8);
check('burst 方向含速度 (非零)', (b.dirs?.[0]?.x ?? 0) !== 0 || (b.dirs?.[0]?.y ?? 0) !== 0);

// === bolt 端点存储 ===
const s3 = fakeState();
spawnBolt(s3, 0, 0, 130, 60, [1, 1, 1]);
const bl = getVfx(s3)[0];
check('bolt 记录终点', bl.kind === 'bolt' && bl.tx === 130 && bl.ty === 60);
check('bolt 起点 = x,y', bl.x === 0 && bl.y === 0);
check('bolt 有厚度', (bl.thickness ?? 0) > 0);

// === glow ===
const s4 = fakeState();
spawnGlow(s4, 5, 5, [0.4, 1, 0.6]);
check('glow kind + circle_01', getVfx(s4)[0].kind === 'glow' && getVfx(s4)[0].sprite === 'circle_01');

// === 命中爆点 (P1) ===
const s5 = fakeState();
spawnImpact(s5, 10, 10, [1, 0, 0]);
const imps = getVfx(s5);
check('impact = 环 + 爆裂 各 1', imps.length === 2 && imps.some(v => v.kind === 'ring') && imps.some(v => v.kind === 'burst'));
const s6 = { vfx: [] as Vfx[], player: { pos: { x: 50, y: 60 }, size: { w: 32, h: 32 } } } as unknown as GameState;
spawnPlayerHitFx(s6);
check('受击特效 = 2 (爆+环)', getVfx(s6).length === 2);

// === SkillFx 表 (aoeVisual) ===
const ice = aoeVisual('ice');
check('冰霜新星 → circle_01 + 冰色', ice.sprite === 'circle_01' && ice.color === ELEMENT_FX.ice);
const phys = aoeVisual('physical');
check('旋风斩 → circle_02 + 物理色', phys.sprite === 'circle_02' && phys.color === ELEMENT_FX.physical);

// === 元素色表覆盖 ===
for (const key of ['physical', 'fire', 'ice', 'lightning', 'shadow', 'holy', 'poison']) {
  check(`ELEMENT_FX.${key} 定义`, !!ELEMENT_FX[key] && ELEMENT_FX[key].length === 3);
}

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);