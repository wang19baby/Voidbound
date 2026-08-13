// app/input.ts — 输入辅助 (PR-008, 2026-08-13)
//
// 从 main.ts 拆出: 原 line 526-531 (mouseAimDirection 函数体, 5 行)
//
// 设计:
// - mouseAimDirection 返回原始偏移 (不归一化) — 与原 main.ts 行为一致
// - 参数 m 接受 mouse.state() 的 pos 字段 (结构化形状, 与 main.ts 一致)
// - 不引入循环依赖: 只引用 game/state 类型

import type { GameState } from '../game/state';

/** 鼠标位置 → 世界坐标方向 (Diablo 风格: 技能瞄准鼠标)
 *  返回 { dx, dy } = 鼠标位置减去视口中心, 不归一化 (与原 main.ts 行为一致) */
export function mouseAimDirection(state: GameState, m: { pos: { x: number; y: number } }): { x: number; y: number } {
  const cx = state.viewport.w / 2;
  const cy = state.viewport.h / 2;
  return { x: m.pos.x - cx, y: m.pos.y - cy };
}