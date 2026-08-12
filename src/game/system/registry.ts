// game/system/registry.ts — 系统注册表 (T3d, 2026-08-12)
//
// 模式:
// - 系统注册: registerSystem(sys) → 返回 unsubscribe
// - 全量更新: updateAll(state, dt) → 按注册顺序遍历调用 update
// - 全量渲染: renderAll(ctx) → 按注册顺序遍历调用 render? (可选)
// - 全量重置: resetAll() → 切场景/重开跑局用
//
// 顺序:
// - 默认按注册顺序执行 (FX 在最后以正确清理)
// - 业务调用方可指定顺序: registerSystem(sys, { after: 'monsters' })
//
// 不变量:
// - updateAll 必须在 renderAll 之前调用 (模拟 → 渲染)
// - 单系统抛错被隔离 (不影响其他系统)
//
// 当前阶段 (T3d): 仅基础设施, main.ts loopImpl 尚未迁移. 后续 US-XX-b
//                把 loopImpl 290 行拆为 system.update 调用.

import type { GameSystem } from './types';
import type { GameState } from '../state';
import type { DrawCtx } from '../../presentation/worldDraw/types';

const systems: GameSystem[] = [];

export function registerSystem(sys: GameSystem): () => void {
  systems.push(sys);
  return () => {
    const i = systems.indexOf(sys);
    if (i >= 0) systems.splice(i, 1);
  };
}

/** 全量推进模拟 (按注册顺序, 单系统抛错隔离) */
export function updateAll(state: GameState, dt: number): void {
  for (const s of systems) {
    try {
      s.update(state, dt);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[system] update "${s.id}" failed:`, e);
    }
  }
}

/** 全量渲染 (按注册顺序, 仅调实现 render 的系统) */
export function renderAll(ctx: DrawCtx): void {
  for (const s of systems) {
    if (s.render) {
      try {
        s.render(ctx);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`[system] render "${s.id}" failed:`, e);
      }
    }
  }
}

/** 全量重置 (切场景/重开跑局用) */
export function resetAll(): void {
  for (const s of systems) {
    try {
      s.reset();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[system] reset "${s.id}" failed:`, e);
    }
  }
}

/** 当前已注册系统数 (调试用) */
export function systemCount(): number {
  return systems.length;
}

/** 测试用: 清空所有订阅 */
export function _clearSystems(): void {
  systems.length = 0;
}