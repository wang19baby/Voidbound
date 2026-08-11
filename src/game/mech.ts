// A-W3 怪物机制包 (设计文档 §6.2): 配给精英/领主
// 原则: 每个机制有玩家可读、可接的反制点 (输出窗口 / 翻滚 / 换目标)
//
// 挂载规则 (§6.4): 精英 = 机制×1 随机; 领主 = 机制×1 + 移动AI×1 (波3 移动AI 另建文件)

export type MechType = 'shield' | 'explode' | 'thorns' | 'curse' | 'death_trigger';

export const MECH_TYPES: readonly MechType[] = ['shield', 'explode', 'thorns', 'curse', 'death_trigger'];

export const MECH_NAMES: Record<MechType, string> = {
  shield: '护盾',
  explode: '自爆',
  thorns: '荆棘',
  curse: '诅咒',
  death_trigger: '死亡触发',
};

/** 护盾: 周期开盾 (2s 吸收 90%) → 破盾虚弱 (2s 承伤 +30%) */
export const SHIELD_UP_T = 2.0;
export const SHIELD_DOWN_T = 2.0;
export const SHIELD_DAMAGE_REDUCE = 0.9;   // 开盾期间吸收 90%
export const SHIELD_BREAK_VULN = 0.3;      // 破盾后承伤 +30%

/** 自爆: 血量 <25% 时贴脸引爆 (3 次失败后进入攻击范围触发) */
export const EXPLODE_HP_THRESHOLD = 0.25;
export const EXPLODE_DMG_MULT = 3.0;       // 对玩家伤害 = 接触伤 ×3 (可翻滚躲)

/** 荆棘: 近战反伤 20% + 命中时固定 5 (远程免疫, 换技能/换目标 = 反制) */
export const THORNS_REFLECT = 0.20;
export const THORNS_FLAT = 5;

/** 诅咒: 命中玩家 → 减速 40% + 禁翻滚 1s (药水/翻滚清除 = 反制) */
export const CURSE_SLOW_MULT = 0.6;
export const CURSE_DURATION = 1.0;

/** 死亡触发: 死亡时 33%×3 炸裂 / 40%×2 分裂 / 27% 毒池 */
export const DEATH_EXPLODE_RADIUS = 90;
export const DEATH_EXPLODE_DMG_MULT = 2.0;
export const DEATH_SPLIT_COUNT = 2;
export const DEATH_POOL_DPS = 8;           // 毒池 3s, 站内每秒伤害
export const DEATH_POOL_RADIUS = 70;
export const DEATH_POOL_T = 3.0;

/** 随机机制 (精英/领主挂载) */
export function rollMech(r: () => number = Math.random): MechType {
  return MECH_TYPES[Math.floor(r() * MECH_TYPES.length)];
}

// === A-W3 包3 Boss 技能 (设计文档 §6.3) ===

export type BossSkill3 = 'spiral' | 'laser' | 'nova' | 'summon_elites' | 'enrage';

export const BOSS_SKILLS3: readonly BossSkill3[] = ['spiral', 'laser', 'nova', 'summon_elites', 'enrage'];

export const BOSS_SKILL3_NAMES: Record<BossSkill3, string> = {
  spiral: '螺旋弹幕',
  laser: '激光扫射',
  nova: '新星爆发',
  summon_elites: '召唤精英',
  enrage: '狂暴',
};

/** 螺旋弹幕: 越转越密 (内圈贴脸/外圈躲) */
export const SPIRAL_BULLETS = 8;
export const SPIRAL_TURNS = 3;
export const SPIRAL_CD = 6.0;

/** 激光: 方向预警条 0.8s → 直线扫射 */
export const LASER_WINDUP = 0.8;
export const LASER_CD = 7.0;
export const LASER_DMG_MULT = 2.5;
export const LASER_WIDTH = 26;

/** 新星: 全向爆发弹幕 (中距最优解) */
export const NOVA_BULLETS = 14;
export const NOVA_CD = 5.0;

/** 召唤精英: 非小怪 (精英 2 只) */
export const SUMMON_ELITES_CD = 9.0;
export const SUMMON_ELITES_COUNT = 1;

/** 狂暴: 低血攻速 1.8× 持续 */
export const ENRAGE_HP = 0.3;
export const ENRAGE_SPEED_MULT = 1.8;

/** 随机 Boss 技能包3 (波3: 每 Boss 配 1 个新增, 与原 bossSkill 组合) */
export function rollBossSkill3(r: () => number = Math.random): BossSkill3 {
  return BOSS_SKILLS3[Math.floor(r() * BOSS_SKILLS3.length)];
}