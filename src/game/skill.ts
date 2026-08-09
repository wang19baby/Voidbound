// 技能系统: 槽位 (LMB/RMB/Q/W/E/R) → SkillDef
// 默认: LMB/RMB = melee, Q = fireball

import type { GameState } from './state';

export type SkillSlot = 'LMB' | 'RMB' | 'Q' | 'W' | 'E' | 'R';

export interface SkillDef {
  name: string;
  cooldown: number;        // 秒
  mpCost: number;
  /** 状态变更: 火球/挥击/buff 都在这里 */
  cast: (state: GameState, dir: { x: number; y: number }) => void;
}

/** 默认技能 */
export const defaultSkills: Record<SkillSlot, SkillDef> = {
  LMB: {
    name: 'melee',
    cooldown: 0.3,
    mpCost: 0,
    cast: (state, dir) => castMelee(state, dir),
  },
  RMB: {
    name: 'melee',
    cooldown: 0.3,
    mpCost: 0,
    cast: (state, dir) => castMelee(state, dir, true), // RMB = thrust 变体 (M1 同效果, 留扩展位)
  },
  Q: {
    name: 'fireball',
    cooldown: 0.3,
    mpCost: 10,
    cast: (state, dir) => castFireballSkill(state, dir),
  },
  W: { name: 'empty', cooldown: 0, mpCost: 0, cast: () => {} },
  E: { name: 'empty', cooldown: 0, mpCost: 0, cast: () => {} },
  R: { name: 'empty', cooldown: 0, mpCost: 0, cast: () => {} },
};

/** 技能注册表 (slot → SkillDef) - 可被用户改键 */
const registry: Record<SkillSlot, SkillDef> = { ...defaultSkills };

/** 切换某 slot 的技能 (未来支持改键 UI) */
export function bindSkill(slot: SkillSlot, skill: SkillDef): void {
  registry[slot] = skill;
}

export function getSkill(slot: SkillSlot): SkillDef {
  return registry[slot];
}

/** 各 slot 的 CD 上次触发时间 */
const lastTrigger: Record<SkillSlot, number> = { LMB: -Infinity, RMB: -Infinity, Q: -Infinity, W: -Infinity, E: -Infinity, R: -Infinity };

/** 主循环每帧开头调用, 检测按键 + cd + mp, 通过则 cast 并记录触发时间 */
export function tryCastSlot(slot: SkillSlot, state: GameState, dir: { x: number; y: number }, nowSec: number): boolean {
  const sk = registry[slot];
  if (sk.name === 'empty') return false;
  if (nowSec - lastTrigger[slot] < sk.cooldown) return false;
  if (state.player.mp < sk.mpCost) return false;
  state.player.mp -= sk.mpCost;
  sk.cast(state, dir);
  lastTrigger[slot] = nowSec;
  return true;
}

// === 具体技能实现 ===

import { spawnFireball } from './state';
import type { Fireball } from './state';
import type { Wall } from './world';
import { aabbOverlap } from './world';
import { dbg, inf } from '../util/log';

export interface MeleeSwing {
  pos: { x: number; y: number };
  size: { w: number; h: number };
  life: number;
}

function castFireballSkill(state: GameState, dir: { x: number; y: number }): void {
  spawnFireball(state, dir);
  dbg('skill', `Q fireball dir=(${dir.x.toFixed(2)},${dir.y.toFixed(2)})`);
}

/** 近战: 玩家前方 96px 长, 96px 宽 的扇形近似 (M1 用 AABB) */
function castMelee(state: GameState, dir: { x: number; y: number }, thrust = false): void {
  let dx = dir.x || state.player.facing.x || 1;
  let dy = dir.y || state.player.facing.y || 0;
  const len = Math.hypot(dx, dy);
  if (len === 0) { dx = 1; dy = 0; }
  else { dx /= len; dy /= len; }

  const reach = thrust ? 80 : 96;
  const width = 96;
  const cx = state.player.pos.x + state.player.size.w / 2;
  const cy = state.player.pos.y + state.player.size.h / 2;

  // 扇形中心 = 玩家中心 + dir * (玩家半边长 + reach/2)
  const scx = cx + dx * (state.player.size.w / 2 + reach / 2);
  const scy = cy + dy * (state.player.size.h / 2 + reach / 2);

  // 简化: 用 AABB 描述 (M1 精度够, 真扇形用 M2)
  const swing: MeleeSwing = {
    pos: { x: scx - width / 2, y: scy - width / 2 },
    size: { w: width, h: width },
    life: 0.18,
  };
  (state as GameState & { _swing?: MeleeSwing[] })._swing = (state as GameState & { _swing?: MeleeSwing[] })._swing ?? [];
  (state as GameState & { _swing: MeleeSwing[] })._swing.push(swing);

  // 击中火球 (在 AABB 内销毁)
  const before = state.fireballs.length;
  state.fireballs = state.fireballs.filter(f => !aabbOverlap(f.pos.x, f.pos.y, f.size.w, f.size.h, swing.pos.x, swing.pos.y, swing.size.w, swing.size.h));
  const after = state.fireballs.length;
  if (before !== after) {
    inf('combat', `melee destroyed ${before - after} fireball(s)`);
  }
  dbg('skill', `melee ${thrust ? 'thrust' : 'slash'} at (${scx.toFixed(0)},${scy.toFixed(0)}) reach=${reach}`);
}

// === Swing 管理 ===

export function updateSwings(state: GameState, dt: number): void {
  const ext = state as GameState & { _swing?: MeleeSwing[] };
  if (!ext._swing) return;
  ext._swing = ext._swing.filter(s => { s.life -= dt; return s.life > 0; });
}

export function getSwings(state: GameState): readonly MeleeSwing[] {
  const ext = state as GameState & { _swing?: MeleeSwing[] };
  return ext._swing ?? [];
}

export { aabbOverlap, type Wall };