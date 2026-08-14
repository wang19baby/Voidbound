// game/monsters/spawn.ts — 怪物 spawn 池与营地 (US-030-b)
//
// 本次拆分: spawnThemeMonster + spawnRunPool + CampType + CAMP_TYPES + spawnCamp
// 依赖: defs (THEME_MONSTER_POOL / RUN_POOL_SIZE), world (getActiveWalls), element (randomElement),
//   types (Monster / MonsterType), state (GameState)
// 跨模块依赖: ./../monster (spawnMonster) — 单向引用,无循环

import type { GameState } from '../state';
import type { Monster, MonsterType } from './types';
import { THEME_MONSTER_POOL, RUN_POOL_SIZE, AURA_TYPES } from './defs';
import { getActiveWalls, linearBranchRooms, chunkDist, mulberry32, WORLD_W, WORLD_H, CHUNK_SIZE, EXTRACT_SPAWN } from '../world';
import { randomElement } from '../element';
import { inf } from '../../util/log';
import { spawnMonster } from '../monster';
import { dropLoot } from '../inventory/drop';
import type { MapMode } from '../mapmode';

/** 按当前主题随机 spawn 一只 (main 初始与重生调用) */
export function spawnThemeMonster(state: GameState): Monster {
  const pool = THEME_MONSTER_POOL[state.theme];
  return spawnMonster(state, pool[Math.floor(Math.random() * pool.length)]);
}

/** 地标营地锚点 (A-W2/A-W5 设计 §4/§5): 营地一律按地图规则放置, 不绕玩家
 *  linear/rogue: 主轴分支房间全图散布; gauntlet: 世界四角; extract: 中央四方向区 */
function campAnchors(state: GameState, mode: MapMode, rand: () => number): Array<{ x: number; y: number; type: CampType | 'treasure' }> {
  if (mode === 'gauntlet') {
    const PAD = 600;
    return [
      { x: PAD, y: PAD, type: 'lord' },
      { x: state.world.w - PAD, y: PAD, type: 'lord' },
      { x: PAD, y: state.world.h - PAD, type: 'lord' },
      { x: state.world.w - PAD, y: state.world.h - PAD, type: 'lord' },
    ];
  }
  if (mode === 'extract') {
    // 中央出生 → 四方向区 (设计 §2.3: 外→内; 与 Boss 方向位一致)
    const R = 1400;
    return [
      { x: EXTRACT_SPAWN.x + R, y: EXTRACT_SPAWN.y, type: CAMP_TYPES[0] },
      { x: EXTRACT_SPAWN.x, y: EXTRACT_SPAWN.y + R, type: CAMP_TYPES[1] },
      { x: EXTRACT_SPAWN.x - R, y: EXTRACT_SPAWN.y, type: CAMP_TYPES[2] },
      { x: EXTRACT_SPAWN.x, y: EXTRACT_SPAWN.y - R, type: CAMP_TYPES[0] },
    ];
  }
  // linear / rogue: 主轴分支房间全图散布 (种子打乱取 3 营地 + 2 宝藏)
  const refY = Math.floor((WORLD_H / 2) / CHUNK_SIZE);
  const maxCx = Math.floor(WORLD_W / CHUNK_SIZE) - 1;
  const rooms: Array<{ x: number; y: number }> = [];
  for (let cx = 0; cx <= maxCx; cx++) {
    for (const room of linearBranchRooms(cx, refY)) rooms.push({ x: room.x, y: room.y });
  }
  // 种子打乱 (Fisher-Yates) → 取前 5: 前 3 营地 (光环/抱团/双核 轮转) + 2 宝藏
  for (let i = rooms.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rooms[i], rooms[j]] = [rooms[j], rooms[i]];
  }
  const anchors: Array<{ x: number; y: number; type: CampType | 'treasure' }> = [];
  for (let i = 0; i < 5 && i < rooms.length; i++) {
    anchors.push({ x: rooms[i].x, y: rooms[i].y, type: i < 3 ? CAMP_TYPES[i % CAMP_TYPES.length] : 'treasure' });
  }
  return anchors;
}

/** 密度带散怪锚点 (A-W5 设计 §2.4): 全图按密度梯度抽样 — 近出生稀, 远密; 拒绝采样 */
function scatterAnchor(state: GameState, mode: MapMode, rand: () => number): { x: number; y: number } {
  const maxCx = Math.floor(WORLD_W / CHUNK_SIZE) - 1;
  const maxCy = Math.floor(WORLD_H / CHUNK_SIZE) - 1;
  const dmax = Math.max(maxCx, maxCy);
  for (let i = 0; i < 60; i++) {
    const cx = Math.floor(rand() * (maxCx + 1));
    const cy = Math.floor(rand() * (maxCy + 1));
    const d = chunkDist(mode, cx, cy);
    // 接受概率随距离线性提升: 近出生 20% → 最远 100%
    const accept = 0.2 + 0.8 * (d / dmax);
    if (rand() > accept) continue;
    return {
      x: cx * CHUNK_SIZE + 128 + rand() * (CHUNK_SIZE - 256),
      y: cy * CHUNK_SIZE + 128 + rand() * (CHUNK_SIZE - 256),
    };
  }
  // 兜底: 距离出生最远的确定性点
  if (mode === 'gauntlet') return { x: WORLD_W / 2, y: WORLD_H / 2 };
  return { x: WORLD_W - 1024, y: WORLD_H / 2 };
}

/** 按当前主题池刷满一局地牢 (OPT-012): 清场 → RUN_POOL_SIZE 只小怪, 重置跑局计数
 *  A-W2/A-W5 地图规则: 营地按地标放置 + 密度带散怪补满; 全流程种子化 (state.run.seed) */
export function spawnRunPool(state: GameState): void {
  state.fx.monsters.length = 0;
  // Review (地图审查 P2): 营地/补散怪出生避墙需要当前局墙 — resetWorldForMode 刚清缓存, 先按出生点生成
  state.world.walls = getActiveWalls(state, 2);
  const pool = THEME_MONSTER_POOL[state.theme];
  const mode = state.run.mode ?? 'linear';
  const rand = mulberry32(state.run.seed ?? 1);
  const pick = () => pool[Math.floor(rand() * pool.length)];

  // 地标营地 (按地图规则, 非玩家锚点)
  for (const a of campAnchors(state, mode, rand)) {
    if (a.type === 'treasure') {
      // 宝藏密室: 2 件掉落 (dropLoot 概率掉落, 多调几次保证 ≥1)
      for (let k = 0; k < 3; k++) dropLoot(state, a.x, a.y);
    } else {
      const members = spawnCamp(state, { x: a.x, y: a.y, type: a.type }, pick);
      for (const m of members) state.fx.monsters.push(m);
    }
  }

  // 密度带散怪补足 RUN_POOL_SIZE (全图抽样, 非玩家周围)
  while (state.fx.monsters.length < RUN_POOL_SIZE) {
    const at = scatterAnchor(state, mode, rand);
    state.fx.monsters.push(spawnMonster(state, pick(), at));
  }

  state.run.total = RUN_POOL_SIZE;
  state.run.alive = RUN_POOL_SIZE;
  state.run.bossAlive = false;
  state.run.bossKilled = false;
  state.run.victoryShown = false;
  state.run.portals = [];
  state.run.bossStage = 0;
  state.run.kills = 0;
  state.run.collectedLoot = 0;
  state.run.theme = state.theme;
  state.run.mode = state.run.mode ?? 'linear';
  // M3 元素地图: 50% 概率本局整体元素染色 (地板/墙/装饰 + Boss 变体)
  state.run.element = rand() < 0.5 ? randomElement() : undefined;
  state.run.t0 = performance.now();
  inf('world', `run pool spawned: ${RUN_POOL_SIZE} (theme=${state.theme}, mode=${mode}, seed=${state.run.seed ?? 'default'})`);
  void import('../../util/jslog').then(({ jsLog }) =>
    jsLog(`[map] run spawn theme=${state.theme} mode=${mode} pool=${RUN_POOL_SIZE} seed=${state.run.seed ?? 'default'} element=${state.run.element ?? 'none'} walls=${state.world.walls.length}`),
  );
}

// === A-W1 营地三型 (设计文档 §5) ===

export type CampType = 'aura' | 'swarm' | 'duo' | 'lord';
/** 营地类型轮转 (非 gauntlet): 三型都出现 (随机起始, 环形) */
export const CAMP_TYPES: CampType[] = ['aura', 'swarm', 'duo'];

/** 生成一个营地成员列表
 *  aura: 1 精英(带光环) + 5 白怪 → 先杀精英, 小怪失光环节能
 *  swarm: 2 精英 + 4 白怪, 无光环, 数量压
 *  duo: 1 精英 + 1 专职光环者(不攻击) + 4 白怪 → 拆解优先级: 光环者 → 精英 → 白怪
 *  lord (设计 §4 高级模式): 1 领主 + 3 精英护卫 → 守卫型小 Boss 群, 不给门
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
    case 'lord': {
      // 1 领主 (forceLord: 移动AI×1 + 机制×1 + bossSkill 三选一) + 3 精英护卫
      out.push(spawnMonster(state, pick(), at, { forceLord: true }));
      for (let i = 0; i < 3; i++) out.push(spawnMonster(state, pick(), at, { forceElite: true }));
      break;
    }
  }
  return out;
}