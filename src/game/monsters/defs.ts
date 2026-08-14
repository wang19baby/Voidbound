// game/monsters/defs.ts — 怪物数据表 + 常量 (US-030 拆分最小切片)
//
// 本次拆分内容:
// - MONSTER_DEFS / THEME_BOSS / THEME_MONSTER_POOL / AURA_DEFS 数据表
// - 技能伤害常量 (FIREBALL_DAMAGE / MELEE_DAMAGE / ULTIMATE_DAMAGE)
// - 缩放系数常量 (ELITE/LORD/ENHANCED 倍率 + 概率 + RUN_POOL_SIZE)
// - 光环常量 (AURA_TYPES / AURA_RADIUS)
// - 工具函数: levelMonsterScale / rollElite
//
// 留 monster.ts (US-030-b): spawnMonster / updateMonsters / killMonster / damageMonster /
//   resolveFireballHits / resolveMeleeHits / EnemyProjectile
//
// 依赖: ./types (MonsterType / MonsterDef / Theme re-export)

import type { Theme } from '../state';
import type { MonsterType, MonsterDef } from './types';

/** 技能基础伤害面板 (D-04; US-004 技能等级化后移入 SkillDef) */
export const FIREBALL_DAMAGE = 25;   // 火
export const MELEE_DAMAGE = 50;      // 物理
export const ULTIMATE_DAMAGE = 70;   // 暗影

export const MONSTER_DEFS: Record<MonsterType, MonsterDef> = {
  bat:      { type: 'bat',      sprite: 'bat',      size: { w: 32, h: 32 }, hp: 30,  speed: 80,  aggroRange: 200, attackRange: 28, contactDmg: 5,  score: 10, res: { fire: -20 } },
  slime:    { type: 'slime',    sprite: 'slime',    size: { w: 32, h: 32 }, hp: 60,  speed: 40,  aggroRange: 160, attackRange: 30, contactDmg: 8,  score: 15, res: { physical: 10 } },
  worm:     { type: 'worm',     sprite: 'worm',     size: { w: 32, h: 32 }, hp: 45,  speed: 60,  aggroRange: 180, attackRange: 28, contactDmg: 6,  score: 12, res: { physical: 20, fire: -10 } },
  ghost:    { type: 'ghost',    sprite: 'ghost',    size: { w: 32, h: 32 }, hp: 35,  speed: 100, aggroRange: 220, attackRange: 24, contactDmg: 7,  score: 18, rangedCooldown: 2.0, res: { physical: 15 }, ai: 'dash' },
  bee:      { type: 'bee',      sprite: 'bee',      size: { w: 32, h: 32 }, hp: 25,  speed: 120, aggroRange: 250, attackRange: 22, contactDmg: 6,  score: 14, rangedCooldown: 1.5, res: { fire: -15 }, ai: 'dash' },
  eyeball:  { type: 'eyeball',  sprite: 'eyeball',  size: { w: 32, h: 32 }, hp: 80,  speed: 50,  aggroRange: 200, attackRange: 32, contactDmg: 10, score: 25, rangedCooldown: 2.5, res: { fire: 20 } },
  pumpking: { type: 'pumpking', sprite: 'pumpking', size: { w: 64, h: 64 }, hp: 400, speed: 25,  aggroRange: 280, attackRange: 48, contactDmg: 20, score: 100, boss: true, rangedCooldown: 3.0, res: { fire: 40, physical: 25 }, bossSkill: 'summon' },
  // === US-007 精英/变体 (复用 sprite + 染色, 主题池) ===
  direwolf:    { type: 'direwolf',    sprite: 'ghost',    size: { w: 40, h: 40 }, hp: 70,  speed: 125, aggroRange: 260, attackRange: 30, contactDmg: 9,  score: 24, rangedCooldown: 2.2, res: { fire: -25 }, tint: [1, 0.45, 0.35], ai: 'dash' },
  plague_slime:{ type: 'plague_slime', sprite: 'slime',    size: { w: 36, h: 36 }, hp: 90,  speed: 38,  aggroRange: 170, attackRange: 34, contactDmg: 10, score: 20, rangedCooldown: 2.8, res: { physical: 25 }, tint: [0.45, 0.9, 0.3], ai: 'split' },
  frost_worm:  { type: 'frost_worm',  sprite: 'worm',     size: { w: 38, h: 38 }, hp: 130, speed: 55,  aggroRange: 200, attackRange: 30, contactDmg: 12, score: 34, res: { physical: 35, fire: -15 }, tint: [0.45, 0.8, 1], ai: 'split' },
  wraith:      { type: 'wraith',      sprite: 'ghost',    size: { w: 32, h: 32 }, hp: 48,  speed: 115, aggroRange: 240, attackRange: 26, contactDmg: 8,  score: 26, rangedCooldown: 1.8, res: { physical: 45, fire: 30 }, tint: [0.75, 0.35, 1], ai: 'dash' },
  bloat_eye:   { type: 'bloat_eye',   sprite: 'eyeball',  size: { w: 40, h: 40 }, hp: 160, speed: 32,  aggroRange: 210, attackRange: 36, contactDmg: 12, score: 46, rangedCooldown: 2.0, res: { fire: 30 }, tint: [1, 0.5, 0.7], ai: 'split' },
  queen_bee:   { type: 'queen_bee',   sprite: 'bee',      size: { w: 32, h: 32 }, hp: 50,  speed: 140, aggroRange: 270, attackRange: 26, contactDmg: 7,  score: 20, rangedCooldown: 1.1, res: { fire: -20 }, tint: [1, 0.85, 0.3], ai: 'dash' },
  giant_worm:  { type: 'giant_worm',  sprite: 'worm',     size: { w: 48, h: 48 }, hp: 200, speed: 42,  aggroRange: 220, attackRange: 40, contactDmg: 16, score: 58, res: { physical: 35, fire: -10 }, tint: [0.75, 0.55, 0.25] },
  // === 内容扩充 (2026-08-10): 每主题 +1 独有变体 ===
  spore:      { type: 'spore',      sprite: 'slime', size: { w: 32, h: 32 }, hp: 55,  speed: 35,  aggroRange: 150, attackRange: 30, contactDmg: 7,  score: 16, ai: 'split', res: { poison: 40, fire: -20 }, tint: [0.9, 0.4, 0.9] },
  scorpion:   { type: 'scorpion',   sprite: 'bee',    size: { w: 32, h: 32 }, hp: 45,  speed: 115, aggroRange: 240, attackRange: 24, contactDmg: 8,  score: 18, ai: 'dash', res: { physical: 15 }, tint: [0.8, 0.3, 0.2] },
  ice_wisp:   { type: 'ice_wisp',   sprite: 'ghost',  size: { w: 32, h: 32 }, hp: 60,  speed: 90,  aggroRange: 230, attackRange: 26, contactDmg: 6,  score: 20, rangedCooldown: 1.6, res: { ice: 45, fire: -25 }, tint: [0.45, 0.95, 1] },
  void_crawler:{ type: 'void_crawler', sprite: 'worm', size: { w: 40, h: 40 }, hp: 110, speed: 70,  aggroRange: 220, attackRange: 34, contactDmg: 11, score: 32, ai: 'dash', res: { physical: 30, shadow: 25 }, tint: [0.5, 0.3, 0.9] },
  // === US-013 主题 Boss (通用二阶段机制) ===
  war_pharaoh:  { type: 'war_pharaoh',  sprite: 'war_pharaoh', size: { w: 56, h: 56 }, hp: 620, speed: 30,  aggroRange: 320, attackRange: 64, contactDmg: 12, score: 170, boss: true, rangedCooldown: 2.5, res: { fire: 30, physical: 20 }, bossSkill: 'ring' }, // HD 新画
  frost_lich:   { type: 'frost_lich',   sprite: 'frost_lich', size: { w: 56, h: 56 }, hp: 700, speed: 36,  aggroRange: 340, attackRange: 56, contactDmg: 15, score: 190, boss: true, rangedCooldown: 2.0, res: { fire: 30, physical: 40, ice: 45 }, bossSkill: 'summon' }, // HD 新画
  void_overlord:{ type: 'void_overlord', sprite: 'void_overlord', size: { w: 72, h: 72 }, hp: 1300, speed: 26, aggroRange: 360, attackRange: 88, contactDmg: 20, score: 270, boss: true, rangedCooldown: 2.4, res: { fire: 50, physical: 45, shadow: 30 }, bossSkill: 'charge' }, // HD 新画
  // === 冰霜主题 ===
  ice_overlord:{ type: 'ice_overlord', sprite: 'ice_overlord', size: { w: 64, h: 64 }, hp: 900, speed: 28, aggroRange: 340, attackRange: 72, contactDmg: 18, score: 220, boss: true, rangedCooldown: 2.2, res: { ice: 60, physical: 30, fire: -30 }, bossSkill: 'freeze_ring' },
  frost_shard:   { type: 'frost_shard',   sprite: 'ghost',    size: { w: 28, h: 28 }, hp: 35,  speed: 130, aggroRange: 220, attackRange: 26, contactDmg: 5,  score: 14, rangedCooldown: 1.8, res: { ice: 40, fire: -20 }, tint: [0.45, 0.85, 1], ai: 'dash' },
  frost_wisp:    { type: 'frost_wisp',    sprite: 'ghost',    size: { w: 30, h: 30 }, hp: 45,  speed: 85,  aggroRange: 200, attackRange: 24, contactDmg: 4,  score: 16, res: { ice: 55, fire: -25 }, tint: [0.5, 0.9, 1] },
  ice_golem:     { type: 'ice_golem',     sprite: 'slime',    size: { w: 48, h: 48 }, hp: 180, speed: 32,  aggroRange: 160, attackRange: 40, contactDmg: 14, score: 38, res: { ice: 65, physical: 20, fire: -35 } },
  winter_wraith: { type: 'winter_wraith', sprite: 'ghost',    size: { w: 32, h: 32 }, hp: 55,  speed: 110, aggroRange: 240, attackRange: 26, contactDmg: 7,  score: 22, rangedCooldown: 2.0, res: { ice: 50, physical: 20, fire: -20 }, tint: [0.6, 0.8, 1], ai: 'dash' },
  glacial_beetle: { type: 'glacial_beetle', sprite: 'worm',    size: { w: 38, h: 38 }, hp: 100, speed: 58,  aggroRange: 200, attackRange: 30, contactDmg: 10, score: 28, res: { ice: 45, physical: 30, fire: -30 }, tint: [0.4, 0.7, 0.95], ai: 'split' },
  polar_bear:    { type: 'polar_bear',    sprite: 'slime',    size: { w: 52, h: 52 }, hp: 250, speed: 38,  aggroRange: 180, attackRange: 44, contactDmg: 18, score: 50, res: { ice: 55, physical: 25, fire: -30 } },
};

/** 主题 Boss (US-013): 每 10 连杀召唤 */
export const THEME_BOSS: Record<Theme, MonsterType> = {
  forest: 'pumpking',
  desert: 'war_pharaoh',
  ruin:   'frost_lich',
  void:   'void_overlord',
  ice:    'ice_overlord',
};

/** 主题怪物池 (US-007: 4 主题不同怪, 初始 spawn 与重生共用) */
export const THEME_MONSTER_POOL: Record<Theme, MonsterType[]> = {
  forest: ['bat', 'slime', 'worm', 'ghost', 'plague_slime', 'spore'],
  desert: ['bee', 'eyeball', 'queen_bee', 'direwolf', 'giant_worm', 'scorpion'],
  ruin:   ['ghost', 'wraith', 'frost_worm', 'giant_worm', 'bloat_eye', 'ice_wisp'],
  void:   ['eyeball', 'wraith', 'bloat_eye', 'direwolf', 'queen_bee', 'void_crawler'],
  ice:    ['frost_shard', 'frost_wisp', 'ice_golem', 'winter_wraith', 'glacial_beetle', 'polar_bear'],
};

/** 单层地牢小怪池容量 (OPT-012): 清空后召主题 Boss */
export const RUN_POOL_SIZE = 40;

/** 玩家等级缩放系数 (OPT-018): 1 + 0.05×(lv-1); Lv1=1, Lv21=2, Lv51=3.5 */
export function levelMonsterScale(level: number): number {
  return 1 + Math.max(0, level - 1) * 0.05;
}

/** 精英判定 (内容扩充): 8% 概率; Boss 不精英 */
export const ELITE_CHANCE = 0.08;
export function rollElite(r: () => number): boolean {
  return r() < ELITE_CHANCE;
}

/** 领主判定 (M3): 4% 概率, 元素变体 + 体型 ×1.6 + HP×6 — 精英之上 Boss 之下 */
export const LORD_CHANCE = 0.04;
export const LORD_SIZE_SCALE = 1.6;
/** 领主 HP 倍率 (×精英基准, 设计 §4 "5-8× 精英" 取 6; 实际 = 2.2×6 = 13.2× 白怪) */
export const LORD_HP_MULT = 6;
/** 领主伤害倍率 (×精英基准, 设计 §4; 实际 = 1.5×1.5 = 2.25× 白怪) */
export const LORD_DMG_MULT = 1.5;

/** 精英属性倍率 */
export const ELITE_HP_MULT = 2.2;
export const ELITE_DMG_MULT = 1.5;

// === A-W1 五层: 增强层 + 光环系统 ===
/** 增强层属性倍率 (设计文档 §4: ~1.4× 白怪) */
export const ENHANCED_HP_MULT = 1.4;
export const ENHANCED_DMG_MULT = 1.4;
/** 增强怪出现概率 (白怪池中) */
export const ENHANCED_CHANCE = 0.3;
/** 光环类型 ×5 (设计文档 §6.2): 狂暴/加速/石肤/回复/元素 */
export type AuraType = 'frenzy' | 'haste' | 'stoneskin' | 'regen' | 'elemental';
/** 光环效果数值 */
export const AURA_DEFS: Record<AuraType, { name: string; color: [number, number, number] }> = {
  frenzy:    { name: '狂暴', color: [1, 0.35, 0.2] },   // 攻速+
  haste:     { name: '加速', color: [0.3, 0.9, 1] },    // 移速+
  stoneskin: { name: '石肤', color: [0.8, 0.8, 0.65] }, // 减伤
  regen:     { name: '回复', color: [0.4, 1, 0.5] },    // 回血
  elemental: { name: '元素', color: [1, 0.7, 0.2] },    // 攻击附伤
};
export const AURA_TYPES: AuraType[] = ['frenzy', 'haste', 'stoneskin', 'regen', 'elemental'];
/** 光环半径 (px): 增强怪光环覆盖周围白怪 */
export const AURA_RADIUS = 140;