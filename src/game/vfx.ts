// 通用 VFX 发射器 (UX_REVIEW §8.3/§8.4 ①): 技能/机制视觉, 表驱动 + 生命周期
// 设计:
//   Vfx = { kind: ring|burst|bolt|glow, 位置/时间/尺寸曲线/粒子/颜色/旋转 }
//   渲染: 主循环按 t/dur 插值 (ring 扩散 easeOut / burst 粒子沿预生成方向飞散 / bolt 中点拉伸旋转 / glow 缓慢扩大)
//   淡出: additive 混合下把 tint 乘 fade (tint→黑 = 透明), 无需改 shader
//   表: ELEMENT_FX (元素→颜色) + aoeVisual (AOE 特效参数) — 纯函数, 可单测

import type { GameState } from './state';

export type VfxKind = 'ring' | 'burst' | 'bolt' | 'glow';

export interface Vfx {
  kind: VfxKind;
  x: number; y: number;
  t: number;              // 已过时间 (s)
  dur: number;
  r0: number; r1: number; // 尺寸起止 (ring/glow 半径)
  sprite: string;         // particles 图集 sprite
  color: [number, number, number];
  rot0: number; rot1: number;
  /** bolt: 终点 (x,y 为起点) */
  tx?: number; ty?: number;
  /** bolt 厚度 */
  thickness?: number;
  /** burst: 预生成粒子方向 (含速度) */
  dirs?: Array<{ x: number; y: number }>;
  /** burst/glow 粒子尺寸 */
  size?: number;
}

/** 元素 → VFX 发光色 (additive; 黑色 tint = 透明, 淡出直接乘系数) */
export const ELEMENT_FX: Record<string, [number, number, number]> = {
  physical: [0.65, 0.8, 1.0],
  fire: [1.0, 0.55, 0.25],
  ice: [0.45, 0.9, 1.0],
  lightning: [0.55, 0.75, 1.0],
  shadow: [0.7, 0.45, 1.0],
  holy: [1.0, 0.9, 0.45],
  poison: [0.5, 0.95, 0.35],
};

/** AOE 特效参数 (SkillFx 表): 物理=旋风灰蓝环 / 冰=霜环 */
export function aoeVisual(type: string): { sprite: string; color: [number, number, number] } {
  if (type === 'ice') return { sprite: 'circle_01', color: ELEMENT_FX.ice };
  return { sprite: 'circle_02', color: ELEMENT_FX.physical };
}

function push(state: GameState, v: Vfx): void {
  (state.vfx ??= []).push(v);
}

/** 扩散环 (AOE/终极/Boss 技能) */
export function spawnRing(state: GameState, x: number, y: number, r1: number, dur: number, sprite: string, color: [number, number, number], r0 = 8): void {
  push(state, { kind: 'ring', x, y, t: 0, dur, r0, r1, sprite, color, rot0: 0, rot1: Math.PI * 2 });
}

/** 粒子爆裂 (n 个沿预生成方向飞散) */
export function spawnBurst(state: GameState, x: number, y: number, n: number, color: [number, number, number], sprite = 'spark_03', speed = 140, size = 7, dur = 0.5): void {
  const dirs: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = speed * (0.6 + Math.random() * 0.8);
    dirs.push({ x: Math.cos(a) * sp, y: Math.sin(a) * sp });
  }
  push(state, { kind: 'burst', x, y, t: 0, dur, r0: 0, r1: 1, sprite, color, rot0: 0, rot1: 0, dirs, size });
}

/** 闪电链段 (起点→终点, 中点拉伸旋转的光束) */
export function spawnBolt(state: GameState, x0: number, y0: number, x1: number, y1: number, color: [number, number, number], dur = 0.22, thickness = 5): void {
  push(state, { kind: 'bolt', x: x0, y: y0, t: 0, dur, r0: 0, r1: 1, sprite: 'light_01', color, rot0: 0, rot1: 0, tx: x1, ty: y1, thickness });
}

/** 缓慢扩大的辉光 (回血等) */
export function spawnGlow(state: GameState, x: number, y: number, color: [number, number, number], dur = 0.9, r1 = 64): void {
  push(state, { kind: 'glow', x, y, t: 0, dur, r0: 6, r1, sprite: 'circle_01', color, rot0: 0, rot1: 0 });
}

/** 命中爆点 (P1): 小爆裂 + 微型扩散环 (投射物命中/爆炸共用) */
export function spawnImpact(state: GameState, x: number, y: number, color: [number, number, number], radius = 26): void {
  spawnBurst(state, x, y, 6, color, 'spark_03', 120, 6, 0.35);
  spawnRing(state, x, y, radius, 0.25, 'circle_02', color, 4);
}

/** 玩家受击 (P1): 红爆 + 红环 (接触/弹幕/激光/自爆/反伤共用) */
export function spawnPlayerHitFx(state: GameState): void {
  const px = state.player.pos.x + state.player.size.w / 2;
  const py = state.player.pos.y + state.player.size.h / 2;
  spawnImpact(state, px, py, [1, 0.35, 0.3], 34);
}

/** 推进生命周期: 过期即移除 */
export function updateVfx(state: GameState, dt: number): void {
  if (!state.vfx) return;
  state.vfx = state.vfx.filter(v => (v.t += dt) < v.dur);
}

export function getVfx(state: GameState): readonly Vfx[] {
  return state.vfx ?? [];
}