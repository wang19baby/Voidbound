// 怪物系统: AI (wander/chase) + 血量 + 死亡
// 数据驱动: monster_defs 表, spawn 时按 type 选择

import type { GameState, Theme } from './state';
import { aabbOverlap } from './world';
import { inf, dbg } from '../util/log';
import { spawnDeathFx } from './deathFx';
import { playSfxClient } from '../ipc/sfx';
import { dropLoot, dropBossReward, dropEliteLoot, THEME_BOSS_SET, addMaterial, materialDrop } from './equipment';
import { spawnDamageNum } from './damageNum';
import { gainExp } from './player';
import { calcDamage, DAMAGE_TYPE_COLORS, CRIT_COLOR, type DamageType } from './combat';
import { skillDamageScale, advanceCombo, comboScoreMult } from './skill';
import { DIFFICULTY_MODS } from './difficulty';
import { ELEMENT_DEFS, randomElement, type ElementId } from './element';
import { rollMech, rollBossSkill3, MECH_TYPES, SHIELD_UP_T, SHIELD_DOWN_T, SHIELD_DAMAGE_REDUCE, SHIELD_BREAK_VULN, EXPLODE_HP_THRESHOLD, EXPLODE_DMG_MULT, THORNS_REFLECT, THORNS_FLAT, CURSE_SLOW_MULT, CURSE_DURATION, DEATH_EXPLODE_RADIUS, DEATH_EXPLODE_DMG_MULT, DEATH_SPLIT_COUNT, DEATH_POOL_DPS, DEATH_POOL_RADIUS, DEATH_POOL_T, BOSS_SKILLS3, SPIRAL_BULLETS, SPIRAL_TURNS, SPIRAL_CD, LASER_WINDUP, LASER_CD, LASER_DMG_MULT, LASER_WIDTH, NOVA_BULLETS, NOVA_CD, SUMMON_ELITES_CD, SUMMON_ELITES_COUNT, ENRAGE_HP, ENRAGE_SPEED_MULT, type MechType, type BossSkill3 } from './mech';
import { rollMoveAI, MOVE_AIS, LEAP_CD, LEAP_WINDUP, LEAP_SPEED, LEAP_DMG_MULT, LEAP_RANGE, BURROW_CD, BURROW_TIME, BURROW_SPEED_MULT, BURROW_EXIT_DMG_MULT, FLEE_HP_THRESHOLD, FLEE_SPEED_MULT, STRAFE_RADIUS, STRAFE_SPEED_MULT, type MoveAI } from './moveai';

export type MonsterType =
  | 'bat' | 'slime' | 'worm' | 'ghost' | 'bee' | 'eyeball' | 'pumpking'
  | 'direwolf' | 'plague_slime' | 'frost_worm' | 'wraith' | 'bloat_eye' | 'queen_bee' | 'giant_worm'
  | 'sun_pharaoh' | 'frost_lich' | 'void_overlord'
  | 'spore' | 'scorpion' | 'ice_wisp' | 'void_crawler';

export interface MonsterDef {
  type: MonsterType;
  sprite: string;
  size: { w: number; h: number };
  hp: number;
  speed: number;
  aggroRange: number;
  attackRange: number;
  contactDmg: number;
  score: number;
  /** 远程攻击间隔 (秒); 0 = 不远程 */
  rangedCooldown?: number;
  /** boss 标记 (大血量, 慢速, 单独 spawn) */
  boss?: boolean;
  /** 各系抗性 (D-04, 缺省 = 0) */
  res?: Partial<Record<DamageType, number>>;
  /** 精灵染色变体 (复用图集同 sprite) */
  tint?: [number, number, number];
  /** 层级 (A-W1 五层): normal=白怪 / enhanced=增强(光环×1) / elite=精英 / lord=领主 / boss=Boss */
  tier?: 'normal' | 'enhanced' | 'elite' | 'lord' | 'boss';
  /** 元素 (元素变体): 绘制时色相旋转 + 攻击伤害系 */
  element?: ElementId;
  /** 小怪独有行为 (OPT-021): dash=冲撞 / split=死亡分裂 (每主题 ≥2 只) */
  ai?: 'dash' | 'split';
  /** Boss 独有机制 (OPT-022 + A-W3 包3): summon=召唤小怪 / ring=弹幕环 / charge=冲锋 / spiral=螺旋弹幕 / laser=激光 / nova=新星 / summon_elites=召精英 / enrage=狂暴 */
  bossSkill?: 'summon' | 'ring' | 'charge' | 'spiral' | 'laser' | 'nova' | 'summon_elites' | 'enrage';
}

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
  void_crawler:{ type: 'void_crawler', sprite: 'worm', size: { w: 40, h: 40 }, hp: 110, speed: 70, aggroRange: 220, attackRange: 34, contactDmg: 11, score: 32, ai: 'dash', res: { physical: 30, shadow: 25 }, tint: [0.5, 0.3, 0.9] },
  // === US-013 主题 Boss (通用二阶段机制) ===
  war_pharaoh:  { type: 'war_pharaoh',  sprite: 'war_pharaoh', size: { w: 56, h: 56 }, hp: 620, speed: 30,  aggroRange: 320, attackRange: 64, contactDmg: 12, score: 170, boss: true, rangedCooldown: 2.5, res: { fire: 30, physical: 20 }, bossSkill: 'ring' }, // HD 新画
  frost_lich:   { type: 'frost_lich',   sprite: 'frost_lich', size: { w: 56, h: 56 }, hp: 700, speed: 36,  aggroRange: 340, attackRange: 56, contactDmg: 15, score: 190, boss: true, rangedCooldown: 2.0, res: { fire: 30, physical: 40, ice: 45 }, bossSkill: 'summon' }, // HD 新画
  void_overlord:{ type: 'void_overlord', sprite: 'void_overlord', size: { w: 72, h: 72 }, hp: 1300, speed: 26, aggroRange: 360, attackRange: 88, contactDmg: 20, score: 270, boss: true, rangedCooldown: 2.4, res: { fire: 50, physical: 45, shadow: 30 }, bossSkill: 'charge' }, // HD 新画
};

/** 主题 Boss (US-013): 每 10 连杀召唤 */
export const THEME_BOSS: Record<Theme, MonsterType> = {
  forest: 'pumpking',
  desert: 'war_pharaoh',
  ruin:   'frost_lich',
  void:   'void_overlord',
};

/** 主题怪物池 (US-007: 4 主题不同怪, 初始 spawn 与重生共用) */
export const THEME_MONSTER_POOL: Record<Theme, MonsterType[]> = {
  forest: ['bat', 'slime', 'worm', 'ghost', 'plague_slime', 'spore'],
  desert: ['bee', 'eyeball', 'queen_bee', 'direwolf', 'giant_worm', 'scorpion'],
  ruin:   ['ghost', 'wraith', 'frost_worm', 'giant_worm', 'bloat_eye', 'ice_wisp'],
  void:   ['eyeball', 'wraith', 'bloat_eye', 'direwolf', 'queen_bee', 'void_crawler'],
};

/** 按当前主题随机 spawn 一只 (main 初始与重生调用) */
export function spawnThemeMonster(state: GameState): Monster {
  const pool = THEME_MONSTER_POOL[state.theme];
  return spawnMonster(state, pool[Math.floor(Math.random() * pool.length)]);
}

/** 单层地牢小怪池容量 (OPT-012): 清空后召主题 Boss */
export const RUN_POOL_SIZE = 24;

/** 玩家等级缩放系数 (OPT-018): 1 + 0.05×(lv-1); Lv1=1, Lv21=2, Lv51=3.5 */
export function levelMonsterScale(level: number): number {
  return 1 + Math.max(0, level - 1) * 0.05;
}

/** 精英判定 (内容扩充): 8% 概率; Boss 不精英 */
export const ELITE_CHANCE = 0.08;
export function rollElite(r: () => number): boolean {
  return r() < ELITE_CHANCE;
}

/** 领主判定 (M3): 4% 概率, 元素变体 + 体型 ×1.6 + HP×5 — 精英之上 Boss 之下 */
export const LORD_CHANCE = 0.04;
export const LORD_SIZE_SCALE = 1.6;
export const LORD_HP_MULT = 5;
/** 领主伤害倍率 (M3): 接触/投射 ×1.5 */
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

/** 按当前主题池刷满一局地牢 (OPT-012): 清场 → RUN_POOL_SIZE 只小怪, 重置跑局计数
 *  A-W1 营地三型: 玩家周围生成 4 个营地 (光环/精英抱团/双核随机), 每营地聚簇 */
export function spawnRunPool(state: GameState): void {
  state.monsters.length = 0;
  const pool = THEME_MONSTER_POOL[state.theme];
  const pick = () => pool[Math.floor(Math.random() * pool.length)];

  // 4 个营地锚点: 玩家周围 500-900px, 互不重叠 (角度均匀分布)
  const campCount = 4;
  const centers: { x: number; y: number; type: CampType }[] = [];
  const baseA = Math.random() * Math.PI * 2;
  for (let i = 0; i < campCount; i++) {
    const a = baseA + (i * Math.PI * 2) / campCount;
    const r = 500 + Math.random() * 400;
    centers.push({
      x: state.player.pos.x + Math.cos(a) * r,
      y: state.player.pos.y + Math.sin(a) * r,
      type: CAMP_TYPES[i % CAMP_TYPES.length], // 光环/抱团/双核 轮转保证三型都出现
    });
  }

  for (const c of centers) {
    const members = spawnCamp(state, c, pick);
    for (const m of members) state.monsters.push(m);
  }
  // 兜底: 营地成员可能因撞墙失败不足额 → 补散怪到 RUN_POOL_SIZE
  while (state.monsters.length < RUN_POOL_SIZE) {
    state.monsters.push(spawnMonster(state, pick()));
  }

  state.run.total = RUN_POOL_SIZE;
  state.run.alive = RUN_POOL_SIZE;
  state.run.bossAlive = false;
  state.run.bossKilled = false;
  state.run.victoryShown = false;
  state.run.portal = undefined;
  state.run.kills = 0;
  state.run.collectedLoot = 0;
  state.run.theme = state.theme;
  state.run.mode = state.run.mode ?? 'linear';
  // M3 元素地图: 50% 概率本局整体元素染色 (地板/墙/装饰 + Boss 变体)
  state.run.element = Math.random() < 0.5 ? randomElement() : undefined;
  state.run.t0 = performance.now();
  inf('world', `run pool spawned: ${RUN_POOL_SIZE} (theme=${state.theme}, camps=${campCount})`);
}

// === A-W1 营地三型 (设计文档 §5) ===

export type CampType = 'aura' | 'swarm' | 'duo';
/** 营地类型轮转: 三型都出现 (随机起始, 环形) */
export const CAMP_TYPES: CampType[] = ['aura', 'swarm', 'duo'];

/** 生成一个营地成员列表
 *  aura: 1 精英(带光环) + 5 白怪 → 先杀精英, 小怪失光环节能
 *  swarm: 2 精英 + 4 白怪, 无光环, 数量压
 *  duo: 1 精英 + 1 专职光环者(不攻击) + 4 白怪 → 拆解优先级: 光环者 → 精英 → 白怪
 */
export function spawnCamp(state: GameState, center: { x: number; y: number; type: CampType }, pick: () => MonsterType): Monster[] {
  const out: Monster[] = [];
  const at = { x: center.x, y: center.y };
  const auraOf = () => AURA_TYPES[Math.floor(Math.random() * AURA_TYPES.length)];
  switch (center.type) {
    case 'aura': {
      out.push(spawnMonster(state, pick(), at, { eliteAura: auraOf(), forceElite: true }));
      for (let i = 0; i < 5; i++) out.push(spawnMonster(state, pick(), at, {})); // 白怪固定普通层
      break;
    }
    case 'swarm': {
      for (let i = 0; i < 2; i++) out.push(spawnMonster(state, pick(), at, { forceElite: true }));
      for (let i = 0; i < 4; i++) out.push(spawnMonster(state, pick(), at, {}));
      break;
    }
    case 'duo': {
      out.push(spawnMonster(state, pick(), at, { forceElite: true }));
      // 专职光环者: 不攻击, 只提供光环 (pureSupport)
      out.push(spawnMonster(state, pick(), at, { pureSupport: true }));
      for (let i = 0; i < 4; i++) out.push(spawnMonster(state, pick(), at, {}));
      break;
    }
  }
  return out;
}

export interface Monster {
  id: number;
  type: MonsterType;
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  hp: number;
  /** 满血 (Boss 阶段阈值计算用) */
  maxHp: number;
  /** Boss 阶段 (1/2, 50% 进入狂暴) */
  phase: 1 | 2;
  /** 燃烧 DOT (US-016): 剩余秒 / 每秒伤害 / 跳数积累 */
  burnT: number;
  burnDps: number;
  burnAccum: number;
  /** 直接抄自 def, 渲染/碰撞用 */
  size: { w: number; h: number };
  /** wander 状态的目标点 (世界坐标); 到达后重新选 */
  wanderTarget: { x: number; y: number };
  wanderTimer: number;       // 倒计时 (s), 到 0 重选 wanderTarget
  /** 攻击冷却 (避免每帧都扣血) */
  attackCd: number;
  hitFlash: number;          // 受击闪光剩余秒数
  /** walk 动画 (每 0.15s 前进一帧, 0~3 循环; 图集缺帧时绘制回退 _0) */
  walkFrame: number;
  walkT: number;             // 倒计时 (s)
  /** 行为计时 (OPT-021/022): >0 = 冲撞/冲锋窗口; <=0 = 待触发 */
  aiT: number;
  /** 行为冷却 (冲撞/召唤/弹幕环) */
  aiCd: number;
  /** 分裂/召唤计数 (防无限递归) */
  aiSpawned: number;
  /** 精英标记 (内容扩充): 金色变体, HP×2.2 伤×1.5, 保底 rare+ 掉落 */
  elite: boolean;
  /** 领主标记 (M3): 元素变体 + 体型 ×1.6 + HP×5, 精英之上 Boss 之下 */
  lord: boolean;
  /** 增强标记 (A-W1): 白怪 30% 概率, HP/伤 ×1.4 + 携带 1 光环 */
  enhanced: boolean;
  /** 携带光环 (A-W1): 增强怪 1 个; 光环覆盖半径内白怪 */
  aura?: AuraType;
  /** 回复光环累积计时 (A-W1) */
  regenAccum: number;
  /** 专职光环者 (A-W1 双核营地): 不攻击, 只提供光环; 死亡后光环消失 */
  pureSupport: boolean;
  /** 机制 (A-W3 包2): 精英/领主随机 1 个 */
  mech?: MechType;
  /** 移动 AI (A-W3 包1): 领主随机 1 个 */
  moveAI?: MoveAI;
  /** 扑击蓄力剩余 (s): >0 = 预警中 (落点圈可见) */
  leapT: number;
  /** 遁地剩余 (s): >0 = 地下移动 (无敌) */
  burrowT: number;
  /** 护盾状态机 (A-W3): >0 = 开盾, <=0 = 破盾虚弱窗口 */
  shieldT: number;
  /** Boss 技能包3 (A-W3): spawn 时随机 1 个, 与原 bossSkill 组合 */
  skill3?: BossSkill3;
  /** 激光蓄力剩余 (s, 预警条) */
  laserT: number;
  /** 狂暴剩余 (s) */
  enrageT: number;
  /** 元素色相旋转 (度): def.element 或领主随机元素 */
  hue: number;
  /** 元素 id (绘制/文案用) */
  elementId?: ElementId;
}

let nextMonsterId = 1;

/** 在玩家周围 (安全距离外) 随机 spawn 一只怪物; 避开墙
 *  at: 营地生成锚点 (该点附近 80px 聚簇); 缺省 = 玩家周围 600-1200px
 *  camp: 营地生成选项 (A-W1 三型营地) */
export function spawnMonster(state: GameState, type: MonsterType, at?: { x: number; y: number }, camp?: { eliteAura?: AuraType; pureSupport?: boolean; forceElite?: boolean }): Monster {
  const def = MONSTER_DEFS[type];
  const lvScale = levelMonsterScale(state.player.level);
  // 层级: camp 生成 = 组成确定 (forceElite→精英 / pureSupport→增强光环者 / 其余→白怪);
  // 无 camp = 全图散怪, 才滚随机 领主 4% / 精英 8% / 增强 30%
  const isLord = !camp && !def.boss && Math.random() < LORD_CHANCE;
  const elite = camp ? !!camp.forceElite : !def.boss && !isLord && rollElite(Math.random);
  const enhanced = camp ? !!camp.pureSupport : !def.boss && !isLord && !elite && Math.random() < ENHANCED_CHANCE;
  // 光环: camp 精英带 eliteAura; 专职光环者随机 1 光环; 散怪增强带随机光环
  const aura: AuraType | undefined = camp
    ? (camp.eliteAura ?? (camp.pureSupport ? AURA_TYPES[Math.floor(Math.random() * AURA_TYPES.length)] : undefined))
    : (enhanced ? AURA_TYPES[Math.floor(Math.random() * AURA_TYPES.length)] : undefined);
  // 机制 (A-W3 包2): 精英/领主随机 1 个 (Boss 走专用技能池)
  const mech: MechType | undefined = (elite || isLord) && !def.boss ? rollMech() : undefined;
  // 移动 AI (A-W3 包1): 领主专属
  const moveAI: MoveAI | undefined = isLord && !def.boss ? rollMoveAI() : undefined;
  // Boss 技能包3 (A-W3): Boss 额外随机 1 个, 与原 bossSkill 组合 (每 Boss 不同)
  const skill3: BossSkill3 | undefined = def.boss ? rollBossSkill3() : undefined;
  const element: ElementId | undefined = def.element ?? (isLord || def.boss ? randomElement() : undefined);
  const hue = element ? ELEMENT_DEFS[element].hue : 0;
  const sizeScale = isLord ? LORD_SIZE_SCALE : 1;
  const baseHp = Math.round(def.hp * DIFFICULTY_MODS[state.difficulty].hpMult * lvScale);
  const hp = Math.round(
    baseHp * (elite ? ELITE_HP_MULT : 1) * (isLord ? LORD_HP_MULT : 1) * (enhanced ? ENHANCED_HP_MULT : 1),
  );
  const center = at ?? { x: state.player.pos.x, y: state.player.pos.y };
  const ringR = at ? 80 : 600;
  // 半径 600-1200 px (或营地聚簇 80px), 超出 aggroRange, 不立刻追杀
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = ringR + Math.random() * (at ? 120 : 600);
    const x = center.x + Math.cos(a) * r;
    const y = center.y + Math.sin(a) * r;
    if (x < 64 || y < 64 || x > state.world.w - 64 || y > state.world.h - 64) continue;
    // 验证 spawn 点不撞墙
    let blocked = false;
    for (const w of state.world.walls) {
      if (aabbOverlap(x, y, def.size.w * sizeScale, def.size.h * sizeScale, w.pos.x, w.pos.y, w.size.w, w.size.h)) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    const m: Monster = {
      id: nextMonsterId++,
      type,
      pos: { x, y },
      vel: { x: 0, y: 0 },
      hp,
      maxHp: hp,
      phase: 1,
      burnT: 0, burnDps: 0, burnAccum: 0,
      size: { w: def.size.w * sizeScale, h: def.size.h * sizeScale },
      wanderTarget: pickWanderTarget(state, x, y, def.aggroRange * 2),
      wanderTimer: 3 + Math.random() * 2,
      attackCd: 0,
      hitFlash: 0,
      walkFrame: 0,
      walkT: Math.random() * 0.3,
      aiT: 0,
      aiCd: 0,
      aiSpawned: 0,
      elite,
      lord: isLord,
      enhanced,
      aura,
      regenAccum: 0,
      pureSupport: camp?.pureSupport ?? false,
      mech,
      moveAI,
      leapT: 0,
      burrowT: 0,
      shieldT: 0,
      skill3,
      laserT: 0,
      enrageT: 0,
      hue,
      elementId: element,
    };
    return m;
  }
  // 兜底: 中心北 800
  return {
    id: nextMonsterId++,
    type,
    pos: { x: center.x, y: center.y - 800 },
    vel: { x: 0, y: 0 },
    hp: Math.round(def.hp * DIFFICULTY_MODS[state.difficulty].hpMult),
    maxHp: Math.round(def.hp * DIFFICULTY_MODS[state.difficulty].hpMult),
    phase: 1,
    burnT: 0, burnDps: 0, burnAccum: 0,
    size: { w: 32, h: 32 },
    wanderTarget: { x: center.x, y: center.y - 1000 },
    wanderTimer: 3,
    attackCd: 0,
    hitFlash: 0,
    walkFrame: 0,
    walkT: 0,
    aiT: 0,
    aiCd: 0,
    aiSpawned: 0,
    elite: false,
    lord: false,
    enhanced: false,
    aura: undefined,
    regenAccum: 0,
    pureSupport: false,
    mech: undefined,
    moveAI: undefined,
    leapT: 0,
    burrowT: 0,
    shieldT: 0,
    skill3: undefined,
    laserT: 0,
    enrageT: 0,
    hue: 0,
  };
}

function pickWanderTarget(state: GameState, x: number, y: number, radius: number): { x: number; y: number } {
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * radius;
    const tx = x + Math.cos(a) * r;
    const ty = y + Math.sin(a) * r;
    if (tx >= 0 && ty >= 0 && tx < state.world.w && ty < state.world.h) return { x: tx, y: ty };
  }
  return { x, y };
}

/** AABB 滑移: 沿最浅重叠轴推出 (最多 4 次迭代) */
function slideAxis(rect: { x: number; y: number; w: number; h: number }, walls: ReadonlyArray<{ pos: { x: number; y: number }; size: { w: number; h: number } }>): { x: number; y: number } {
  let fx = rect.x, fy = rect.y;
  for (let iter = 0; iter < 4; iter++) {
    let hit = false;
    let bestAxis: 'x' | 'y' = 'x';
    let bestO = Infinity;
    let bestWall: typeof walls[number] | null = null;
    for (const w of walls) {
      if (fx < w.pos.x + w.size.w && fx + rect.w > w.pos.x &&
          fy < w.pos.y + w.size.h && fy + rect.h > w.pos.y) {
        const oL = (fx + rect.w) - w.pos.x;
        const oR = (w.pos.x + w.size.w) - fx;
        const oT = (fy + rect.h) - w.pos.y;
        const oB = (w.pos.y + w.size.h) - fy;
        const m = Math.min(oL, oR, oT, oB);
        if (m < bestO) { bestO = m; bestAxis = (m === oL || m === oR) ? 'x' : 'y'; bestWall = w; hit = true; }
      }
    }
    if (!hit) break;
    if (bestAxis === 'x') {
      // 判断左右推出
      const oL = (fx + rect.w) - bestWall!.pos.x;
      const oR = (bestWall!.pos.x + bestWall!.size.w) - fx;
      if (oL < oR) fx = bestWall!.pos.x - rect.w;
      else fx = bestWall!.pos.x + bestWall!.size.w;
    } else {
      const oT = (fy + rect.h) - bestWall!.pos.y;
      const oB = (bestWall!.pos.y + bestWall!.size.h) - fy;
      if (oT < oB) fy = bestWall!.pos.y - rect.h;
      else fy = bestWall!.pos.y + bestWall!.size.h;
    }
  }
  return { x: fx, y: fy };
}

/** 怪物是否处于任何增强光环覆盖下 (A-W1): 附近有增强怪携带同光环 → 生效; 自身为增强怪也受益 */
function auraActive(state: GameState, m: Monster, aura: AuraType): boolean {
  if (m.aura === aura) return true;
  for (const o of state.monsters) {
    if (o === m || o.hp <= 0 || o.aura !== aura) continue;
    const d = Math.hypot(o.pos.x - m.pos.x, o.pos.y - m.pos.y);
    if (d <= AURA_RADIUS + o.size.w / 2) return true;
  }
  return false;
}

/** AI 更新 (wander/chase/attack); dt 秒 */
export function updateMonsters(state: GameState, dt: number): void {
  const p = state.player.pos;
  const walls = state.world.walls;
  for (const m of state.monsters) {
    const def = MONSTER_DEFS[m.type];
    const dx = p.x - m.pos.x;
    const dy = p.y - m.pos.y;
    const dist = Math.hypot(dx, dy);

    // A-W1 光环: 每 0.5s 回复 (光环覆盖内回血)
    if (m.hp > 0 && auraActive(state, m, 'regen')) {
      m.regenAccum = (m.regenAccum ?? 0) + dt;
      if (m.regenAccum >= 0.5) {
        m.regenAccum -= 0.5;
        m.hp = Math.min(m.maxHp, m.hp + Math.max(1, Math.round(m.maxHp * 0.012)));
      }
    }

    if (m.attackCd > 0) m.attackCd -= dt;
    if (m.hitFlash > 0) m.hitFlash -= dt;

    // walk 动画 (4 帧, 每帧 0.15s → 全周期 0.6s)
    m.walkT -= dt;
    if (m.walkT <= 0) {
      m.walkFrame = (m.walkFrame + 1) % 4;
      m.walkT = 0.15;
    }

    // 燃烧 DOT (US-016): 每 0.5s 跳一次
    if (m.burnT > 0 && m.hp > 0) {
      m.burnT -= dt;
      m.burnAccum += dt;
      if (m.burnAccum >= 0.5) {
        m.burnAccum -= 0.5;
        const dmg = Math.max(1, Math.round(m.burnDps * 0.5));
        m.hp -= dmg;
        m.hitFlash = 0.1;
        spawnDamageNum(state, m.pos.x + m.size.w / 2, m.pos.y - 6, `-${dmg}`, '#ff7043');
        if (m.hp <= 0) {
          killMonster(state, m);
          continue;
        }
      }
    }

    // Boss 二阶段: 50% 血 → 狂暴 (提速 1.6x + 双发投射物)
    if (def.boss && m.phase === 1 && m.hp <= m.maxHp * 0.5) {
      m.phase = 2;
      m.hitFlash = 0.4;
      state.cameraShake = Math.min(18, (state.cameraShake ?? 0) + 14);  // OPT-026 二阶段大震
      spawnDamageNum(state, m.pos.x + m.size.w / 2, m.pos.y, 'PHASE 2!', '#ff9530');
      inf('combat', `${m.type} enters PHASE 2 (狂暴)`);
    }

    // boss 狂暴计时 (A-W3: 护盾周期)
    if (m.mech === 'shield') {
      m.shieldT -= dt;
      if (m.shieldT <= -SHIELD_DOWN_T) {
        m.shieldT = SHIELD_UP_T;  // 重新开盾
      }
    }
    // 移动 AI (A-W3 包1): 领主专属
    if (m.moveAI === 'flee' && m.hp > 0 && m.hp <= m.maxHp * FLEE_HP_THRESHOLD) {
      // 残血逃窜: 反向移动 + 提速 (连锁仇恨: 不追击则放走, 不回血)
      if (dist > 4) {
        m.vel.x = (dx / dist) * -def.speed * FLEE_SPEED_MULT;
        m.vel.y = (dy / dist) * -def.speed * FLEE_SPEED_MULT;
      }
    } else if (m.moveAI === 'burrow') {
      m.aiCd -= dt;
      if (m.burrowT > 0) {
        // 遁地: 无敌 + 高速移动到玩家旁, 出地时如果贴脸 → 伤害
        m.burrowT -= dt;
        if (dist > def.attackRange) {
          m.vel.x = (dx / (dist || 1)) * def.speed * BURROW_SPEED_MULT;
          m.vel.y = (dy / (dist || 1)) * def.speed * BURROW_SPEED_MULT;
        }
        m.pos.x += m.vel.x * dt;
        m.pos.y += m.vel.y * dt;
        if (m.burrowT <= 0) {
          // 出地
          if (dist < def.attackRange * 2 && state.player.dodgeT <= 0 && (state.player.reviveInvuln ?? 0) <= 0) {
            const bdmg = Math.round(def.contactDmg * BURROW_EXIT_DMG_MULT * DIFFICULTY_MODS[state.difficulty].dmgMult * levelMonsterScale(state.player.level) * (m.lord ? LORD_DMG_MULT : 1));
            state.player.hp -= bdmg;
            state.lastKiller = m.type;
            spawnDamageNum(state, state.player.pos.x + state.player.size.w / 2, state.player.pos.y - 10, `-${bdmg}`, '#c9aaff');
            state.cameraShake = Math.min(12, (state.cameraShake ?? 0) + 6);
          }
          m.aiCd = BURROW_CD;
          spawnDamageNum(state, m.pos.x + m.size.w / 2, m.pos.y - 8, '钻地', '#9cf');
        }
      } else if (m.aiCd <= 0 && dist < def.aggroRange && dist > def.attackRange * 1.2) {
        m.burrowT = BURROW_TIME;
        m.hitFlash = 0.2;
      }
    } else if (m.moveAI === 'leap') {
      m.aiCd -= dt;
      if (m.leapT > 0) {
        // 蓄力预警中: 快速冲向玩家
        m.leapT -= dt;
        const sp2 = LEAP_SPEED;
        if (dist > def.attackRange) {
          m.vel.x = (dx / (dist || 1)) * sp2;
          m.vel.y = (dy / (dist || 1)) * sp2;
        }
        if (m.leapT <= 0 && dist < def.attackRange * 1.6 && state.player.dodgeT <= 0 && (state.player.reviveInvuln ?? 0) <= 0) {
          const ldmg = Math.round(def.contactDmg * LEAP_DMG_MULT * DIFFICULTY_MODS[state.difficulty].dmgMult * levelMonsterScale(state.player.level) * (m.lord ? LORD_DMG_MULT : 1));
          state.player.hp -= ldmg;
          state.lastKiller = m.type;
          spawnDamageNum(state, state.player.pos.x + state.player.size.w / 2, state.player.pos.y - 10, `-${ldmg}`, '#ff9600');
          state.cameraShake = Math.min(14, (state.cameraShake ?? 0) + 8);
        }
        m.aiCd = LEAP_CD;
      } else if (m.aiCd <= 0 && dist > def.attackRange * 1.2 && dist < LEAP_RANGE) {
        m.leapT = LEAP_WINDUP;  // 开始蓄力 (落点预警圈)
      }
    } else if (m.moveAI === 'strafe' && dist < def.aggroRange && dist > def.attackRange * 1.5) {
      // 侧移: 垂直于玩家方向绕圈 (放风筝)
      const fx = -(dy / (dist || 1));
      const fy = dx / (dist || 1);
      m.vel.x = fx * def.speed * STRAFE_SPEED_MULT;
      m.vel.y = fy * def.speed * STRAFE_SPEED_MULT;
    } else if (m.moveAI === 'strafe' && m.vel.x !== 0) {
      m.vel.x = 0;
      m.vel.y = 0;
    }
    // 自爆 (A-W3): 血 <25% + 玩家贴脸 (可翻滚躲) → 引爆
    if (m.mech === 'explode' && m.hp > 0 && m.hp <= m.maxHp * EXPLODE_HP_THRESHOLD && dist < def.attackRange * 2.5) {
      const dmg = Math.round(def.contactDmg * EXPLODE_DMG_MULT * DIFFICULTY_MODS[state.difficulty].dmgMult * levelMonsterScale(state.player.level) * (m.elite ? ELITE_DMG_MULT : 1) * (m.lord ? LORD_DMG_MULT : 1));
      if (state.player.dodgeT <= 0 && (state.player.reviveInvuln ?? 0) <= 0) {
        state.player.hp -= dmg;
        state.lastKiller = m.type;
        spawnDamageNum(state, state.player.pos.x + state.player.size.w / 2, state.player.pos.y - 10, `-${dmg}`, '#ff7043');
        state.cameraShake = Math.min(12, (state.cameraShake ?? 0) + 8);
      }
      spawnDamageNum(state, m.pos.x + m.size.w / 2, m.pos.y - 6, '💥', '#ff9600');
      playSfxClient('hit');
      m.hp = 0;  // 自爆 = 自身死亡 (掉落照常)
      inf('combat', `${m.type} 自爆`);
    }

    // 远程攻击: 朝玩家发射投射物 (二阶段双发); 专职光环者不攻击
    if (!m.pureSupport && def.rangedCooldown && dist < def.aggroRange && dist > def.attackRange * 2 && m.attackCd <= 0) {
      spawnEnemyProjectile(state, m, def.contactDmg);
      if (m.phase === 2) spawnEnemyProjectile(state, m, def.contactDmg, 0.22);
      m.attackCd = m.phase === 2 ? 1.6 : def.rangedCooldown;
    }

    // 行为 AI (OPT-021/022): dash=冲撞 / charge=冲锋 / Boss 二阶段 summon·ring
    if (def.ai === 'dash' || def.bossSkill === 'charge') {
      m.aiT -= dt;
      m.aiCd -= dt;
      if (m.aiT <= 0 && m.aiCd <= 0 && dist < def.aggroRange && dist > def.attackRange * 1.5) {
        m.aiT = def.bossSkill === 'charge' ? 0.5 : 0.35;
        m.aiCd = def.bossSkill === 'charge' ? 5.0 : 2.5;
      }
    }
    if (def.boss && m.phase === 2) {
      m.aiCd -= dt;
      if (m.aiCd <= 0) {
        const didBase = (() => {
          if (def.bossSkill === 'summon' && (m.aiSpawned ?? 0) < 3) {
            const pool = THEME_MONSTER_POOL[state.run.theme];
            const minion = spawnMonster(state, pool[Math.floor(Math.random() * pool.length)]);
            minion.pos = { x: m.pos.x + (Math.random() * 80 - 40), y: m.pos.y + (Math.random() * 80 - 40) };
            m.aiSpawned = (m.aiSpawned ?? 0) + 1;
            m.aiCd = 4.0;
            return true;
          } else if (def.bossSkill === 'ring') {
            for (let k = 0; k < 10; k++) spawnEnemyProjectile(state, m, def.contactDmg, (k * Math.PI * 2) / 10);
            m.aiCd = 6.0;
            return true;
          }
          return false;
        })();
        // A-W3 包3 技能 (与原技能交替: 基础技能先放, 包3 冷却略长)
        if (!didBase && m.skill3) {
          switch (m.skill3) {
            case 'spiral': {
              // 螺旋弹幕: 8 发 × 3 圈, 每圈偏角递增 → 越转越密
              for (let turn = 0; turn < SPIRAL_TURNS; turn++) {
                const base = turn * 0.35;
                for (let k = 0; k < SPIRAL_BULLETS; k++) {
                  spawnEnemyProjectile(state, m, Math.round(def.contactDmg * 0.6), base + (k * Math.PI * 2) / SPIRAL_BULLETS);
                }
              }
              m.aiCd = SPIRAL_CD;
              break;
            }
            case 'laser': {
              // 激光: 预警条 0.8s → 沿玩家方向直线扫射 (预警时站开)
              m.laserT = LASER_WINDUP;
              m.aiCd = LASER_CD;
              break;
            }
            case 'nova': {
              // 新星: 全向爆发
              for (let k = 0; k < NOVA_BULLETS; k++) {
                spawnEnemyProjectile(state, m, Math.round(def.contactDmg * 0.7), (k * Math.PI * 2) / NOVA_BULLETS);
              }
              m.aiCd = NOVA_CD;
              break;
            }
            case 'summon_elites': {
              // 召唤精英: 1-2 只精英 (优先处理召唤物)
              for (let k = 0; k < SUMMON_ELITES_COUNT + 1; k++) {
                const pool = THEME_MONSTER_POOL[state.run.theme];
                const e = spawnMonster(state, pool[Math.floor(Math.random() * pool.length)], undefined, { forceElite: true });
                e.pos = { x: m.pos.x + (Math.random() * 120 - 60), y: m.pos.y + (Math.random() * 120 - 60) };
                state.monsters.push(e);
              }
              m.aiCd = SUMMON_ELITES_CD;
              break;
            }
            case 'enrage': {
              // 狂暴: 低血攻速 1.8× 持续 (爆发窗口 / 风筝)
              m.enrageT = 6;
              m.aiCd = 12;
              spawnDamageNum(state, m.pos.x + m.size.w / 2, m.pos.y, 'ENRAGE!', '#ff4530');
              break;
            }
          }
        }
      }
      // 激光扫射: 预警结束 → 命中线伤害
      if (m.laserT > 0) {
        m.laserT -= dt;
        if (m.laserT <= 0) {
          // 沿玩家方向直线 260px 宽 LASER_WIDTH 判定
          const lx = state.player.pos.x - m.pos.x;
          const ly = state.player.pos.y - m.pos.y;
          const len = Math.hypot(lx, ly) || 1;
          const nx = lx / len, ny = ly / len;
          // 垂直距离判定 (点到直线)
          const px = state.player.pos.x - m.pos.x;
          const py = state.player.pos.y - m.pos.y;
          const proj = px * nx + py * ny;
          const perp = Math.abs(px * ny - py * nx);
          if (proj > 0 && proj < 300 && perp < LASER_WIDTH / 2 && state.player.dodgeT <= 0 && (state.player.reviveInvuln ?? 0) <= 0) {
            const ldmg = Math.round(def.contactDmg * LASER_DMG_MULT * DIFFICULTY_MODS[state.difficulty].dmgMult * levelMonsterScale(state.player.level));
            state.player.hp -= ldmg;
            state.lastKiller = m.type;
            spawnDamageNum(state, state.player.pos.x + state.player.size.w / 2, state.player.pos.y - 10, `-${ldmg}`, '#ff7043');
            state.cameraShake = Math.min(12, (state.cameraShake ?? 0) + 6);
          }
          spawnDamageNum(state, m.pos.x + m.size.w / 2, m.pos.y - 10, 'LASER!', '#ff7043');
        }
      }
      // 狂暴衰减
      if (m.enrageT > 0) m.enrageT -= dt;
    }

    const charging = m.aiT > 0;
    const auraHaste = auraActive(state, m, 'haste') ? 1.25 : 1;
    const spd = def.speed * (charging ? (def.bossSkill === 'charge' ? 3.5 : 3.2) : m.phase === 2 ? 1.6 : 1) * auraHaste * (m.enrageT > 0 ? ENRAGE_SPEED_MULT : 1);
    // A-W3 移动 AI 接管移动: flee (残血逃窜) / burrow (遁地中) / leap (蓄力扑击) 时跳过普通追击
    const moveAIActive =
      (m.moveAI === 'flee' && m.hp > 0 && m.hp <= m.maxHp * FLEE_HP_THRESHOLD) ||
      (m.moveAI === 'burrow' && m.burrowT > 0) ||
      (m.moveAI === 'leap' && m.leapT > 0);
    if (dist < def.aggroRange && !moveAIActive) {
      if (dist > 0.01) {
        m.vel.x = (dx / dist) * spd;
        m.vel.y = (dy / dist) * spd;
      }
      if (dist < def.attackRange && m.attackCd <= 0 && state.player.dodgeT <= 0 && (state.player.reviveInvuln ?? 0) <= 0 && !m.pureSupport) {
        const lvScale = levelMonsterScale(state.player.level);
        // A-W1 光环: frenzy 攻速+ (冷却-30%); stoneskin 减伤 30%; elemental 攻击附元素伤
        const frenzyMult = auraActive(state, m, 'frenzy') ? 0.7 : 1;
        const stoneskin = auraActive(state, m, 'stoneskin');
        const elemental = auraActive(state, m, 'elemental');
        let dmg = def.contactDmg * DIFFICULTY_MODS[state.difficulty].dmgMult * lvScale * (m.elite ? ELITE_DMG_MULT : 1) * (m.lord ? LORD_DMG_MULT : 1) * (m.enhanced ? ENHANCED_DMG_MULT : 1);
        if (stoneskin) dmg *= 0.7;
        state.player.hp -= dmg;
        m.attackCd = 1.0 * frenzyMult;
        state.lastKiller = m.type;  // 死亡结算显示
        state.cameraShake = Math.min(10, (state.cameraShake ?? 0) + 5);  // OPT-026
        // A-W3 诅咒: 命中玩家 → 减速 40% + 禁翻滚 1s (药水/翻滚清除)
        if (m.mech === 'curse') {
          state.player.curseT = Math.max(state.player.curseT ?? 0, CURSE_DURATION);
          spawnDamageNum(state, state.player.pos.x + state.player.size.w / 2, state.player.pos.y - 14, '☠', '#c9aaff');
        }
        if (elemental) {
          // 元素附伤: 额外一次小型伤害数字 (纯粹视觉标记, 数值已含在 dmg)
          spawnDamageNum(state, state.player.pos.x + state.player.size.w / 2, state.player.pos.y - 10, '⚡', '#ffb74d');
        }
        dbg('monster', `${m.type} hit player for ${Math.round(dmg)} (hp=${state.player.hp.toFixed(0)})`);
      }
    } else {
      m.wanderTimer -= dt;
      const tx = m.wanderTarget.x - m.pos.x;
      const ty = m.wanderTarget.y - m.pos.y;
      const tdist = Math.hypot(tx, ty);
      if (m.wanderTimer <= 0 || tdist < 16) {
        m.wanderTarget = pickWanderTarget(state, m.pos.x, m.pos.y, def.aggroRange * 2);
        m.wanderTimer = 3 + Math.random() * 3;
      } else {
        m.vel.x = (tx / tdist) * def.speed * 0.5;
        m.vel.y = (ty / tdist) * def.speed * 0.5;
      }
    }

    // 移动 + AABB 滑移 (墙)
    m.pos.x = Math.max(0, Math.min(state.world.w - def.size.w, m.pos.x + m.vel.x * dt));
    m.pos.y = Math.max(0, Math.min(state.world.h - def.size.h, m.pos.y + m.vel.y * dt));
    const slid = slideAxis({ x: m.pos.x, y: m.pos.y, w: def.size.w, h: def.size.h }, walls);
    m.pos.x = slid.x;
    m.pos.y = slid.y;
  }
}

/** 对怪物结算一次 D-04 伤害; 返回是否击杀 (死亡/掉落/分数/特效统一在此) */
/** 击杀统一出口: 分数/技能点/经验/药水/Boss 触发/掉落/特效 */
export function killMonster(state: GameState, m: Monster): void {
  const def = MONSTER_DEFS[m.type];
  const cx = m.pos.x + m.size.w / 2;
  const cy = m.pos.y + m.size.h / 2;
  // 连击 (US-017): 5s 窗口累积, 分数乘 1+min(combo,20)*0.1
  const combo = advanceCombo(state);
  state.score += Math.round(def.score * comboScoreMult(combo));
  // 金币 (US-021, D-06): base = score*0.5 × 难度掉落倍率
  state.player.gold = (state.player.gold ?? 0) + Math.max(1, Math.round(def.score * 0.5 * DIFFICULTY_MODS[state.difficulty].dropMult));
  state.player.skillPoints = (state.player.skillPoints ?? 0) + 1;
  state.killsTotal = (state.killsTotal ?? 0) + 1;
  state.run.kills = (state.run.kills ?? 0) + 1;
  // 跑局推进 (OPT-012): Boss 被杀 → 通关条件; 小怪被杀 → alive--
  if (def.boss) {
    state.run.bossKilled = true;
    // A-W1 门结算: Boss 死亡位置生门 (玩家可交互回城/继续)
    state.run.portal = { x: cx, y: cy, bossType: m.type, used: false };
  } else if (state.run.alive > 0) state.run.alive--;
  const ups = gainExp(state, Math.round(def.score * 2 * DIFFICULTY_MODS[state.difficulty].expMult));
  if (ups > 0) inf('combat', `LEVEL UP → ${state.player.level} (+${ups})`);
  if (Math.random() < 0.12) {
    const kind: 'hp' | 'mp' = Math.random() < 0.6 ? 'hp' : 'mp';
    const alt: 'hp' | 'mp' = kind === 'hp' ? 'mp' : 'hp';
    if (state.player.potions[kind] < 3) state.player.potions[kind]++;
    else if (state.player.potions[alt] < 3) state.player.potions[alt]++;
  }
  spawnDeathFx(state, cx, cy);
  playSfxClient('die');
  // Boss 专属套装掉落 (OPT-021); 精英保底 rare+; 小怪普通掉落
  if (def.boss) dropBossReward(state, cx, cy, THEME_BOSS_SET[state.run.theme]);
  else if (m.elite || m.lord) dropEliteLoot(state, cx, cy); // 领主保底 rare+ (M3)
  else dropLoot(state, cx, cy);
  // 材料掉落 (M5 W4 C-401): 小怪 8% 灵铁 / 精英必掉 1 奥术核心 / Boss 必掉 1-2 虚空碎片
  for (const [mid, n] of materialDrop(Math.random(), !!def.boss, !!m.elite || !!m.lord)) {
    addMaterial(state, mid, n);
  }
  // A-W3 死亡触发 (death_trigger): 33% 爆裂 / 40% 分裂 / 27% 毒池
  if (m.mech === 'death_trigger') {
    const roll = Math.random();
    if (roll < 0.33) {
      // 爆裂: 范围内玩家受伤 (可翻滚躲)
      const pdx = state.player.pos.x - cx;
      const pdy = state.player.pos.y - cy;
      if (Math.hypot(pdx, pdy) <= DEATH_EXPLODE_RADIUS && state.player.dodgeT <= 0 && (state.player.reviveInvuln ?? 0) <= 0) {
        const boom = Math.round(def.contactDmg * DEATH_EXPLODE_DMG_MULT * DIFFICULTY_MODS[state.difficulty].dmgMult * levelMonsterScale(state.player.level));
        state.player.hp -= boom;
        state.lastKiller = m.type;
        spawnDamageNum(state, state.player.pos.x + state.player.size.w / 2, state.player.pos.y - 10, `-${boom}`, '#ff7043');
      }
      spawnDamageNum(state, cx, m.pos.y - 10, '💥', '#ff9600');
    } else if (roll < 0.73) {
      // 分裂: 2 只 25% 血小怪 (防递归)
      for (let i = 0; i < DEATH_SPLIT_COUNT; i++) {
        const c = spawnMonster(state, m.type);
        c.hp = Math.max(1, Math.round(c.maxHp * 0.25));
        c.maxHp = c.hp;
        c.aiSpawned = 1;
        c.mech = undefined;  // 分裂小怪不带机制
        c.pos = { x: cx + (i === 0 ? -28 : 28), y: cy };
        state.monsters.push(c);
      }
      inf('combat', `${def.type} 死亡触发: 分裂 ×${DEATH_SPLIT_COUNT}`);
    } else {
      // 毒池: 3s 站内每秒伤害 (走位反制)
      const pool = {
        x: cx - DEATH_POOL_RADIUS / 2, y: cy - DEATH_POOL_RADIUS / 2,
        r: DEATH_POOL_RADIUS, dps: DEATH_POOL_DPS, t: DEATH_POOL_T,
      };
      const ext = state as GameState & { _pools?: Array<{ x: number; y: number; r: number; dps: number; t: number }> };
      ext._pools = ext._pools ?? [];
      ext._pools.push(pool);
      inf('combat', `${def.type} 死亡触发: 毒池`);
    }
  }

  // 分裂 (OPT-021): 死亡生成 2 只 30% 血小怪, 防递归
  if (def.ai === 'split' && (m.aiSpawned ?? 0) === 0) {
    for (let i = 0; i < 2; i++) {
      const c = spawnMonster(state, m.type);
      c.hp = Math.max(1, Math.round(c.hp * 0.3));
      c.maxHp = c.hp;
      c.aiSpawned = 1;
      c.pos = { x: cx + (i === 0 ? -24 : 24), y: cy };
      state.monsters.push(c);
    }
    inf('combat', `${def.type} 分裂 ×2`);
  }
  spawnDamageNum(state, cx, m.pos.y, 'KILL!', '#ffaa00');
  inf('combat', `${m.type} killed (+${Math.round(def.score * comboScoreMult(combo))}${combo > 1 ? ` combo x${combo}` : ''})`);
}

/** 对怪物结算一次 D-04 伤害; 支持击退 (F-CBT-005, US-016) */
export function damageMonster(
  state: GameState,
  m: Monster,
  spec: { base: number; type: DamageType; knockback?: number },
): { killed: boolean; damage: number; isCrit: boolean } {
  const def = MONSTER_DEFS[m.type];
  // A-W3 遁地: 地下移动无敌 (土痕可预判)
  if (m.burrowT > 0) return { killed: false, damage: 0, isCrit: false };
  const targetRes = def.res?.[spec.type] ?? 0;
  const { damage: rawDmg, isCrit } = calcDamage({
    base: spec.base,
    type: spec.type,
    attacker: state.player.combat,
    targetRes,
  });
  // A-W3 护盾: 开盾减伤 90%, 破盾虚弱 +30% 承伤 (输出窗口 = 决策点)
  let damage = rawDmg;
  if (m.mech === 'shield' && m.shieldT > 0) damage = Math.max(1, Math.round(damage * (1 - SHIELD_DAMAGE_REDUCE)));
  else if (m.mech === 'shield' && m.shieldT <= 0) damage = Math.round(damage * (1 + SHIELD_BREAK_VULN));
  m.hp -= damage;
  m.hitFlash = 0.15;
  // 吸血 (OPT-020 unique 独占): 命中回复 damage×lifesteal%
  const ls = state.player.combat?.lifesteal ?? 0;
  if (ls > 0 && damage > 0) {
    state.player.hp = Math.min(100, state.player.hp + Math.max(1, Math.round(damage * ls / 100)));
  }
  const cx = m.pos.x + m.size.w / 2;
  const cy = m.pos.y + m.size.h / 2;
  spawnDamageNum(state, cx, m.pos.y - 6, `-${damage}`, isCrit ? CRIT_COLOR : DAMAGE_TYPE_COLORS[spec.type]);
  playSfxClient(isCrit ? 'crit' : 'hit');  // OPT-025: 暴击专属音
  // V0 命中停顿: 暴击 0.1s / 普通命中 0.04s 冻结世界 (打击感)
  state.hitStop = Math.max(state.hitStop ?? 0, isCrit ? 0.1 : 0.04);
  dbg('combat', `${spec.type} hit ${m.type} for ${damage} (hp=${m.hp.toFixed(0)})${isCrit ? ' CRIT' : ''}`);
  // 击退: 从玩家推离 (US-016), 随后沿墙滑移防穿墙
  if (spec.knockback) {
    const dx = m.pos.x - state.player.pos.x;
    const dy = m.pos.y - state.player.pos.y;
    const len = Math.hypot(dx, dy) || 1;
    m.pos.x = Math.max(0, Math.min(state.world.w - m.size.w, m.pos.x + (dx / len) * spec.knockback));
    m.pos.y = Math.max(0, Math.min(state.world.h - m.size.h, m.pos.y + (dy / len) * spec.knockback));
    const slid = slideAxis({ x: m.pos.x, y: m.pos.y, w: m.size.w, h: m.size.h }, state.world.walls);
    m.pos.x = slid.x;
    m.pos.y = slid.y;
    m.hitFlash = 0.3;
  }
  if (m.hp <= 0) {
    killMonster(state, m);
    return { killed: true, damage, isCrit };
  }
  return { killed: false, damage, isCrit };
}

/** 检查所有火球与怪物的碰撞, 命中扣血 (火球 = 25 火伤) */
export function resolveFireballHits(state: GameState): number {
  const fireballs = state.fireballs;
  let kills = 0;
  state.monsters = state.monsters.filter(m => {
    if (m.hp <= 0) return false;
    for (const f of fireballs) {
      if (aabbOverlap(f.pos.x, f.pos.y, f.size.w, f.size.h, m.pos.x, m.pos.y, m.size.w, m.size.h)) {
        // 移除火球 (穿透/嗜血符文不消耗)
        if (f.rune !== 'pierce') {
          const idx = fireballs.indexOf(f);
          if (idx >= 0) fireballs.splice(idx, 1);
        }
        const r = damageMonster(state, m, { base: f.dmg, type: f.dmgType, knockback: 60 });
        // 燃烧/中毒 DOT (US-016/M5): 火 3s×3dps, 毒同机制
        if (r.damage > 0 && (f.dmgType === 'fire' || f.dmgType === 'poison')) { m.burnT = 3; m.burnDps = 3; }
        // 嗜血: 命中回 5 HP
        if (f.rune === 'vampire' && r.damage > 0) {
          state.player.hp = Math.min(100, state.player.hp + 5);
        }
        // 圣光 (M5): 命中回 3 HP
        if (f.dmgType === 'holy' && r.damage > 0) {
          state.player.hp = Math.min(100, state.player.hp + 3);
        }
        // nova (内容扩充): 命中爆炸, 溅射周围 80px 内其他怪 60% 伤害
        if (f.rune === 'nova' && r.damage > 0) {
          for (const other of state.monsters) {
            if (other === m || other.hp <= 0) continue;
            const dx = other.pos.x - f.pos.x;
            const dy = other.pos.y - f.pos.y;
            if (dx * dx + dy * dy < 80 * 80) {
              damageMonster(state, other, { base: Math.round(f.dmg * 0.6), type: 'fire', knockback: 30 });
            }
          }
        }
        if (r.killed) { kills++; return false; }
        // 同一目标可被多发命中 (W 扇形)
      }
    }
    return true;
  });
  return kills;
}

/** 检查所有挥击与怪物的碰撞 (近战 = 50 物理) */
export function resolveMeleeHits(state: GameState): number {
  // melees 存 state._swings
  const ext = state as GameState & { _swing?: import('./skill').MeleeSwing[] };
  const swings = ext._swing ?? [];
  let kills = 0;
  state.monsters = state.monsters.filter(m => {
    if (m.hp <= 0) return false;
    for (const s of swings) {
      if (aabbOverlap(s.pos.x, s.pos.y, s.size.w, s.size.h, m.pos.x, m.pos.y, m.size.w, m.size.h)) {
        const base = Math.round(MELEE_DAMAGE * skillDamageScale(s.level) * (s.mult ?? 1));
        const r = damageMonster(state, m, { base, type: 'physical', knockback: 40 });
        // 近战符文 (OPT-023): steal 回魔 / vampire 回血 (火球系 vamp 在 resolveFireballHits)
        if (r.damage > 0) {
          if (s.rune === 'steal') state.player.mp = Math.min(100, state.player.mp + 4);
          else if (s.rune === 'vampire') state.player.hp = Math.min(100, state.player.hp + 5);
          // A-W3 荆棘: 近战反伤 20% 伤害 + 固定 5 (远程免疫 → 换技能/换目标反制)
          if (m.mech === 'thorns') {
            const reflect = Math.max(1, Math.round(r.damage * THORNS_REFLECT) + THORNS_FLAT);
            state.player.hp -= reflect;
            state.lastKiller = m.type;
            spawnDamageNum(state, state.player.pos.x + state.player.size.w / 2, state.player.pos.y - 10, `-${reflect}`, '#9f9');
            state.cameraShake = Math.min(8, (state.cameraShake ?? 0) + 4);
          }
        }
        if (r.killed) { kills++; return false; }
        // 一次挥击只结算一次
      }
    }
    return true;
  });
  return kills;
}

// 共享 aabbOverlap re-export
export { aabbOverlap };

/** 怪物远程投射物 (类似玩家火球) */
export interface EnemyProjectile {
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  size: { w: number; h: number };
  dmg: number;
  life: number;
  fromId: number; // monster id
}

let nextProjId = 1;
function spawnEnemyProjectile(state: GameState, m: Monster, dmg: number, angle = 0): void {
  const ext = state as GameState & { _enemyProj?: EnemyProjectile[] };
  ext._enemyProj = ext._enemyProj ?? [];
  const dx = state.player.pos.x - m.pos.x;
  const dy = state.player.pos.y - m.pos.y;
  const len = Math.hypot(dx, dy) || 1;
  // 基础方向 + 偏角 (二阶段双发错开)
  const base = Math.atan2(dy, dx) + angle;
  const speed = 180;
  ext._enemyProj.push({
    pos: { x: m.pos.x + m.size.w / 2 - 6, y: m.pos.y + m.size.h / 2 - 6 },
    vel: { x: Math.cos(base) * speed, y: Math.sin(base) * speed },
    size: { w: 12, h: 12 },
    dmg: Math.round(dmg * DIFFICULTY_MODS[state.difficulty].projMult * levelMonsterScale(state.player.level) * (m.elite ? ELITE_DMG_MULT : 1) * (m.lord ? LORD_DMG_MULT : 1) * (m.enhanced ? ENHANCED_DMG_MULT : 1)),
    life: 2.0,
    fromId: m.id,
  });
  nextProjId++;
}

export function getEnemyProj(state: GameState): readonly EnemyProjectile[] {
  const ext = state as GameState & { _enemyProj?: EnemyProjectile[] };
  return ext._enemyProj ?? [];
}

export function updateEnemyProj(state: GameState, dt: number): void {
  const ext = state as GameState & { _enemyProj?: EnemyProjectile[] };
  if (!ext._enemyProj) return;
  ext._enemyProj = ext._enemyProj.filter(p => {
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.life -= dt;
    if (p.life <= 0) return false;
    // 撞玩家 → 扣血 + 消失 (翻滚无敌免疫)
    if (state.player.dodgeT <= 0 && (state.player.reviveInvuln ?? 0) <= 0 &&
        aabbOverlap(p.pos.x, p.pos.y, p.size.w, p.size.h,
                    state.player.pos.x, state.player.pos.y,
                    state.player.size.w, state.player.size.h)) {
      state.player.hp -= p.dmg;
      state.lastKiller = '弹幕';  // 死亡结算显示
      state.cameraShake = Math.min(10, (state.cameraShake ?? 0) + 3);  // OPT-026
      return false;
    }
    // 出界
    if (p.pos.x < 0 || p.pos.x > state.world.w || p.pos.y < 0 || p.pos.y > state.world.h) return false;
    return true;
  });
}