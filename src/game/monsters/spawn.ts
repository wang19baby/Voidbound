// game/monsters/spawn.ts — 怪物 spawn 池与营地 (US-030-b)
//
// 本次拆分: spawnThemeMonster + spawnRunPool + CampType + CAMP_TYPES + spawnCamp
// 依赖: defs (THEME_MONSTER_POOL / RUN_POOL_SIZE), world (getActiveWalls), element (randomElement),
//   types (Monster / MonsterType), state (GameState)
// 跨模块依赖: ./../monster (spawnMonster) — 单向引用,无循环

import type { GameState } from '../state';
import type { Monster, MonsterType } from './types';
import { THEME_MONSTER_POOL, RUN_POOL_SIZE, AURA_TYPES } from './defs';
import { getActiveWalls } from '../world';
import { randomElement } from '../element';
import { inf } from '../../util/log';
import { spawnMonster } from '../monster';

/** 按当前主题随机 spawn 一只 (main 初始与重生调用) */
export function spawnThemeMonster(state: GameState): Monster {
  const pool = THEME_MONSTER_POOL[state.theme];
  return spawnMonster(state, pool[Math.floor(Math.random() * pool.length)]);
}

/** 按当前主题池刷满一局地牢 (OPT-012): 清场 → RUN_POOL_SIZE 只小怪, 重置跑局计数
 *  A-W1 营地三型: 玩家周围生成 4 个营地 (光环/精英抱团/双核随机), 每营地聚簇 */
export function spawnRunPool(state: GameState): void {
  state.monsters.length = 0;
  // Review (地图审查 P2): 营地/补散怪出生避墙需要当前局墙 — resetWorldForMode 刚清缓存, 先按出生点生成
  state.world.walls = getActiveWalls(state, 2);
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
  state.run.bossStage = 0;
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