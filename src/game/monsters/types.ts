// game/monsters/types.ts — 怪物类型与数据接口 (US-028 拆分的最小切片)
//
// 设计选择:
// - 只抽纯类型 (MonsterType + MonsterDef interface), 数据表 (MONSTER_DEFS, THEME_BOSS, THEME_MONSTER_POOL) 与行为/AI 暂留 monster.ts
// - 类型抽取零行为变更, 调用方 import 路径不变 (monster.ts barrel re-export 兼容)
// - 后续 US-028-b 可在此基础上继续拆数据表 (defs.ts) 与行为 (ai.ts)

import type { ElementId } from '../element';
import type { DamageType } from '../combat';

export type MonsterType =
  | 'bat' | 'slime' | 'worm' | 'ghost' | 'bee' | 'eyeball' | 'pumpking'
  | 'direwolf' | 'plague_slime' | 'frost_worm' | 'wraith' | 'bloat_eye' | 'queen_bee' | 'giant_worm'
  | 'war_pharaoh' | 'frost_lich' | 'void_overlord'
  | 'spore' | 'scorpion' | 'ice_wisp' | 'void_crawler'
  // 冰霜主题
  | 'frost_shard' | 'frost_wisp' | 'ice_golem' | 'winter_wraith' | 'glacial_beetle' | 'polar_bear' | 'ice_overlord';

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
  bossSkill?: 'summon' | 'ring' | 'charge' | 'spiral' | 'laser' | 'nova' | 'summon_elites' | 'enrage' | 'freeze_ring';
}