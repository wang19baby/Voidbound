// game/character/index.ts — 玩家角色桶 barrel (PR #3 / T5-a, 2026-08-13)
// 聚合 player 域: types + 常量 + 战斗属性 + 被动 + 命令 + 死亡结算。
// Player interface 由 types re-export (实际定义在 ../state)。

export * from './types';
export * from './base';
export * from './stats';
export * from './passive';
export * from './commands';
export * from './death';