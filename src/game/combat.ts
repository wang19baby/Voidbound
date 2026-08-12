// game/combat.ts — barrel re-export (US-029 拆分后兼容旧 import 路径)
// 所有战斗逻辑已拆分到 ./combat/{types,resistance,crit,status,damage}.ts
// 本文件仅 re-export, 无业务代码

export * from './combat/types';
export * from './combat/resistance';
export * from './combat/crit';
export * from './combat/status';
export * from './combat/damage';
