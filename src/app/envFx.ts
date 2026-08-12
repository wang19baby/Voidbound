// app/envFx.ts — 主题氛围粒子 (T1b, 2026-08-12)
//
// 从 main.ts 拆出: 原 line 2388-2418 (THEME_ENV_COLOR / spawnEnvFx / updateEnvFx)
//
// 设计:
// - 模块级 THEME_ENV_COLOR 表 (按主题定调色)
// - spawnEnvFx: 按 dt 累积到 spawn budget; 主题越深 spawn 越密
// - updateEnvFx: 推进位置 + 寿命; 过期即清
// - envFx 数据存在 state.envFx (GameState 内嵌数组, 现有结构)
//
// 迁移注意:
// - T3a 会把本文件搬到 game/fx/envFx.ts (与 vfx.ts / damageNum.ts 同列)
// - 当前阶段: 留在 app/ 目录, 保持 main.ts 直接 import 路径

import type { GameState, Theme } from '../game/state';

/** 主题环境色 (T3a 候选, 当前留 app/) */
export const THEME_ENV_COLOR: Record<Theme, [number, number, number]> = {
  forest: [0.45, 0.85, 0.5],
  desert: [1.0, 0.85, 0.4],
  ruin:   [0.65, 0.85, 1.0],
  void:   [0.7, 0.45, 1.0],
};

const SPAWN_BUDGET_PER_SEC: Record<Theme, number> = {
  forest: 1.5,
  desert: 2.0,
  ruin:   1.2,
  void:   2.5,
};

let budgetAccum = 0;

/** 按 dt 累积环境粒子 (主循环每帧调用) */
export function spawnEnvFx(state: GameState, dt: number): void {
  if (state.screen !== 'dungeon') return;
  const rate = SPAWN_BUDGET_PER_SEC[state.theme];
  budgetAccum += rate * dt;
  while (budgetAccum >= 1) {
    budgetAccum -= 1;
    const col = THEME_ENV_COLOR[state.theme];
    state.envFx.push({
      x: state.player.pos.x + (Math.random() - 0.5) * 800,
      y: state.player.pos.y + (Math.random() - 0.5) * 600,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 4 - 4,
      t: 0,
      life: 4 + Math.random() * 3,
      color: col,
    } as GameState['envFx'][number]);
  }
}

/** 推进环境粒子 (位置 + 寿命) */
export function updateEnvFx(state: GameState, dt: number): void {
  const arr = state.envFx;
  let write = 0;
  for (let read = 0; read < arr.length; read++) {
    const p = arr[read];
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life > 0) {
      arr[write++] = p;
    }
  }
  arr.length = write;
}

/** 测试/重启用: 重置累积器 */
export function _resetEnvFx(): void {
  budgetAccum = 0;
}