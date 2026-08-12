// game/system/builtins.ts — 默认系统集合 (T3d, 2026-08-12)
//
// 当前阶段 (T3d):
// - 把现有 update* 函数包装为 GameSystem
// - 每个系统: id + update(state, dt) + reset() (无 render, 走原 worldDraw 图层)
//
// 设计:
// - attackSystem 聚合 Fireball/EnemyProj/Swings 3 个更新器
// - monsterSystem 包装 updateMonsters
// - envFxSystem 包装 spawnEnvFx/updateEnvFx (替代原 main.ts 散点调用)
// - fxSystem 聚合 Vfx/DamageNum/DeathFx 3 个更新器
// - 启动时 registerAllBuiltinSystems() 一次性注册; resetAll() 由 run 切换触发
//
// 集成方式: 在 main.ts 启动装配末尾调用 registerAllBuiltinSystems() + 主循环
//           用 updateAll(state, dt) 替代原散点 update* 调用.

import type { GameSystem } from './types';
import type { GameState } from '../state';
import { updateMonsters } from '../monsters/ai';
import { updateEnemyProj } from '../monsters/proj';
import { updateFireballs } from '../state';
import { updateVfx } from '../fx/vfx';
import { updateDamageNums } from '../fx/damageNum';
import { updateDeathFx } from '../fx/deathFx';
import { updateSwings } from '../skill';
import { spawnEnvFx, updateEnvFx } from '../fx/envFx';
import { registerSystem } from './registry';

/** 环境氛围系统: 按 dt 累积 spawn + 推进位置/寿命 */
export const envFxSystem: GameSystem = {
  id: 'envfx',
  update(state: GameState, dt: number) {
    spawnEnvFx(state, dt);
    updateEnvFx(state, dt);
  },
  reset() {
    // envFx 数据清空由 leaveThroughPortal/ensureDungeonRun 处理
  },
};

/** 攻击系统: 玩家火球 + 怪物投射物 + 挥击盒 */
export const attackSystem: GameSystem = {
  id: 'attack',
  update(state: GameState, dt: number) {
    updateFireballs(state, dt);
    updateEnemyProj(state, dt);
    updateSwings(state, dt);
  },
  reset() {
    // 攻击池 reset 由现有 startRun/ensureDungeonRun 显式调用
  },
};

/** 怪物系统: AI 更新 + 行为 */
export const monsterSystem: GameSystem = {
  id: 'monsters',
  update(state: GameState, dt: number) {
    updateMonsters(state, dt);
  },
  reset() {
    // 怪物列表清空由 startRun/leaveThroughPortal 处理
  },
};

/** FX 系统: 聚合 3 个粒子/数字更新器 */
export const fxSystem: GameSystem = {
  id: 'fx',
  update(state: GameState, dt: number) {
    updateVfx(state, dt);
    updateDamageNums(state, dt);
    updateDeathFx(state, dt);
  },
  reset() {
    // 当前阶段: FX 池 reset 由现有 _reset*Pool 显式调用, 系统 reset 留空
    // 后续 US-XX-b 把 FX 池管理迁入本系统
  },
};

/** 默认系统集合 (按注册顺序: 攻击 → 怪物 → 环境 → FX 清理) */
export const builtins: GameSystem[] = [attackSystem, monsterSystem, envFxSystem, fxSystem];

/** 一次性注册全部默认系统; 返回总 unsubscribe */
export function registerAllBuiltinSystems(): () => void {
  const offs = builtins.map(s => registerSystem(s));
  return () => { offs.forEach(off => off()); };
}