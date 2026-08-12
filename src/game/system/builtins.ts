// game/system/builtins.ts — 默认系统集合 (T3d, 2026-08-12)
//
// 当前阶段 (T3d):
// - 把现有 update* 函数包装为 GameSystem
// - 每个系统: id + update(state, dt) + reset() (无 render, 走原 worldDraw 图层)
//
// 设计:
// - fxSystem 聚合 Vfx/DamageNum/DeathFx 3 个更新器
// - attackSystem 聚合 Fireball/EnemyProj/Swings 3 个更新器
// - monsterSystem 包装 updateMonsters
// - 启动时 registerAllBuiltinSystems() 一次性注册; resetAll() 由 run 切换触发
//
// 集成方式: 在 main.ts 启动装配末尾调用 registerAllBuiltinSystems() (后续 US-XX-b
//           把 loopImpl 290 行拆为 system.update 调用)

import type { GameSystem } from './types';
import type { GameState } from '../state';
import { updateMonsters } from '../monsters/ai';
import { updateEnemyProj } from '../monsters/proj';
import { updateFireballs } from '../state';
import { updateVfx } from '../vfx';
import { updateDamageNums } from '../damageNum';
import { updateDeathFx } from '../deathFx';
import { updateSwings } from '../skill';
import { registerSystem } from './registry';

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

/** 默认系统集合 (按注册顺序: 攻击 → 怪物 → FX 清理) */
export const builtins: GameSystem[] = [attackSystem, monsterSystem, fxSystem];

/** 一次性注册全部默认系统; 返回总 unsubscribe */
export function registerAllBuiltinSystems(): () => void {
  const offs = builtins.map(s => registerSystem(s));
  return () => { offs.forEach(off => off()); };
}