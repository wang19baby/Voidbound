// game/fx/facade.ts — 跨域 FX 策略集中点 (T1a, 2026-08-12)
//
// 设计动机:
// - monsters/ai.ts 散点调用 30+ 处 spawnRing/spawnBurst/spawnDamageNum 等
// - 后续调整 FX 策略 (粒子数/配色/生命周期) 要改 N 处
// - 测试时无法 "记录某次打击产生了哪些 FX"
//
// 模式:
// - fx facade 是单点 API, 业务侧只关心 "hit/monsterDeath/playerHit/bossIntro"
// - 内部决定具体调哪些 spawnXxx 函数, 把策略集中
// - 0 行为变更 (本次仅聚合, 不修改参数)

import type { GameState } from '../state';
import { spawnBurst, spawnRing, spawnPlayerHitFx } from '../vfx';
import { spawnDamageNum } from '../damageNum';
import { spawnDeathFx } from '../deathFx';

/** 伤害颜色策略: 按伤害类型返回 CSS 颜色 (与原 ai.ts 一致) */
function dmgColor(dmgType: string): string {
  if (dmgType === 'fire') return '#ff7043';
  if (dmgType === 'shadow') return '#c9aaff';
  if (dmgType === 'holy') return '#ffe89a';
  if (dmgType === 'ice') return '#9cf';
  if (dmgType === 'lightning') return '#ff9600';
  if (dmgType === 'poison') return '#80ff66';
  return '#ff4444';  // 默认物理/未知
}

/** 一次性命中爆点 (攻击命中怪物/玩家受击通用) */
export function fxHit(state: GameState, pos: { x: number; y: number }, dmg: number, dmgType: string): void {
  spawnDamageNum(state, pos.x, pos.y - 6, `-${dmg}`, dmgColor(dmgType));
  spawnRing(state, pos.x, pos.y, 36, 0.32, 'circle_02', [1, 0.7, 0.3]);
  spawnBurst(state, pos.x, pos.y, 4, [1, 0.7, 0.3], 'spark_03', 110, 6, 0.3);
}

/** 怪物死亡 */
export function fxMonsterDeath(state: GameState, pos: { x: number; y: number }): void {
  spawnDeathFx(state, pos.x, pos.y, 7);
  spawnBurst(state, pos.x, pos.y, 8, [0.7, 0.4, 0.9], 'spark_03', 180, 7, 0.5);
}

/** 玩家受击 (兼容 spawnPlayerHitFx 但允许传入精确位置) */
export function fxPlayerHit(state: GameState, pos?: { x: number; y: number }): void {
  if (pos) {
    spawnBurst(state, pos.x, pos.y, 6, [1, 0.35, 0.3], 'spark_03', 130, 7, 0.35);
    spawnRing(state, pos.x, pos.y, 34, 0.25, 'circle_02', [1, 0.35, 0.3], 4);
  } else {
    spawnPlayerHitFx(state);
  }
}

/** Boss 入场 (环形扩散 + 大量粒子) */
export function fxBossIntro(state: GameState, pos: { x: number; y: number }): void {
  spawnRing(state, pos.x, pos.y, 110, 0.55, 'circle_03', [1, 0.6, 0.2]);
  spawnBurst(state, pos.x, pos.y, 14, [1, 0.6, 0.2], 'spark_03', 220, 8, 0.6);
}

/** FX facade 集合对象 (业务调用风格) */
export const fx = {
  hit: fxHit,
  monsterDeath: fxMonsterDeath,
  playerHit: fxPlayerHit,
  bossIntro: fxBossIntro,
};