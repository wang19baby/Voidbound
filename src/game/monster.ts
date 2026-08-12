// game/monster.ts — 怪物系统 barrel (US-028/030/030-b 拆分完成)
//
// 拆分历史:
// - US-028: 类型 (MonsterType + MonsterDef) → ./monsters/types.ts
// - US-030: 数据表 + 常量 (MONSTER_DEFS, THEME_BOSS, ...) → ./monsters/defs.ts
// - US-030-b: spawn 池/营地 → ./monsters/spawn.ts
// - US-030-b: AI (spawnMonster/updateMonsters/killMonster) → ./monsters/ai.ts
// - US-030-b: 行为 (damageMonster/resolve*) → ./monsters/behavior.ts
// - US-030-b: 投射物 (EnemyProjectile) → ./monsters/proj.ts
//
// 本文件仅 re-export, 旧 import 路径 (e.g. `import { MONSTER_DEFS } from './game/monster'`) 零修改兼容
//
// 依赖: ./monsters/* 子模块

// === 类型 ===
export type { MonsterType, MonsterDef } from './monsters/types';
export type { AuraType } from './monsters/defs';
export type { CampType } from './monsters/spawn';

// === 数据表 + 常量 ===
export {
  FIREBALL_DAMAGE, MELEE_DAMAGE, ULTIMATE_DAMAGE,
  MONSTER_DEFS, THEME_BOSS, THEME_MONSTER_POOL, RUN_POOL_SIZE,
  levelMonsterScale, ELITE_CHANCE, rollElite,
  LORD_CHANCE, LORD_SIZE_SCALE, LORD_HP_MULT, LORD_DMG_MULT,
  ELITE_HP_MULT, ELITE_DMG_MULT,
  ENHANCED_HP_MULT, ENHANCED_DMG_MULT, ENHANCED_CHANCE,
  AURA_DEFS, AURA_TYPES, AURA_RADIUS,
} from './monsters/defs';

// === spawn 池 / 营地 / 主题 spawn ===
export { spawnThemeMonster, spawnRunPool, spawnCamp, CAMP_TYPES } from './monsters/spawn';

// === AI: spawn / update / 击杀 / 移动 / 光环 ===
export {
  spawnMonster, updateMonsters, killMonster,
  pickWanderTarget, slideAxis,
} from './monsters/ai';

// === 行为: 伤害 / 火球碰撞 / 近战碰撞 ===
export { damageMonster, resolveFireballHits, resolveMeleeHits } from './monsters/behavior';

// === 怪物远程投射物 ===
export { EnemyProjectile, spawnEnemyProjectile, getEnemyProj, updateEnemyProj } from './monsters/proj';

// === 共享 aabbOverlap (旧 barrel 兼容) ===
export { aabbOverlap } from './world';