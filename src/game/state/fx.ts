// game/state/fx.ts — FX 子对象 (PR #2 / T4-c)
//
// 单一数据源: 原 GameState 上的运行时动态对象字段已迁入此子对象;
//             顶层字段已删除,所有引用走 state.fx.*。
// 0 行为变更 (纯物理迁移; 下划线字段同时去掉前缀)。
//
// 包含: 火球/怪物/技能特效/毒池/伤害数字/死亡粒子/挥击/掉落/背包/Toast/敌弹/环境粒子

import type { Fireball } from '../monster';
import type { Monster, PoisonPool } from '../monster';
import type { Vfx } from '../fx/vfx';
import type { DamageNum } from '../fx/damageNum';
import type { DeathFx } from '../fx/deathFx';
import type { MeleeSwing } from '../skill';
import type { Equipment } from '../equipment';
import type { Toast } from '../toast';
import type { EnemyProjectile } from '../monsters/proj';

/** 环境粒子: 主题氛围微尘 (PR #2 内嵌类型, 避免循环依赖 fx/envFx → state) */
export interface EnvFxRecord {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  color?: [number, number, number];
}

/** FX 子对象: 所有运行时动态对象 */
export interface FxState {
  /** 玩家火球 (投射物) */
  fireballs: Fireball[];
  /** 当前场上怪物 */
  monsters: Monster[];
  /** 通用 VFX (扩散环/爆裂/闪电/辉光) */
  vfx: Vfx[];
  /** 死亡触发毒池 (A-W3 death_trigger) */
  pools: PoisonPool[];
  /** 伤害数字 (漂浮文字) */
  dmgNums: DamageNum[];
  /** 死亡粒子爆裂 */
  deathFx: DeathFx[];
  /** 挥击命中盒 */
  swings: MeleeSwing[];
  /** 地面掉落 (未拾取) */
  loot: Equipment[];
  /** 已拾取(装备中)列表 */
  owned: Equipment[];
  /** 顶部 Toast 列表 */
  toasts: Toast[];
  /** 怪物远程投射物 */
  enemyProj: EnemyProjectile[];
  /** 环境粒子 (主题氛围微尘) */
  envFx: EnvFxRecord[];
}

/** 空 FxState 工厂 (GameState 初始化用) */
export function createEmptyFxState(): FxState {
  return {
    fireballs: [],
    monsters: [],
    vfx: [],
    pools: [],
    dmgNums: [],
    deathFx: [],
    swings: [],
    loot: [],
    owned: [],
    toasts: [],
    enemyProj: [],
    envFx: [],
  };
}
