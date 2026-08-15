// game/monsters/spawn.ts — 怪物 spawn 池与营地 (US-030-b)
//
// 本次拆分: spawnThemeMonster + spawnRunPool + CampType + CAMP_TYPES + spawnCamp
// 依赖: defs (THEME_MONSTER_POOL / RUN_POOL_SIZE), world (getActiveWalls), element (randomElement),
//   types (Monster / MonsterType), state (GameState)
// 跨模块依赖: ./../monster (spawnMonster) — 单向引用,无循环

import type { GameState } from '../state';
import type { Monster, MonsterType } from './types';
import { THEME_MONSTER_POOL, RUN_POOL_SIZE, AURA_TYPES } from './defs';
import { getActiveWalls, buildLinearLayout, linearBranchRooms, linearBranchRoomsAll, chunkDist, mulberry32, WORLD_W, WORLD_H, CHUNK_SIZE, EXTRACT_SPAWN, BLOCK } from '../world';
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
  // linear / rogue: 分区域强制锚点 (前/中/后三段，每段至少1个营地，宝藏强制放最远段)
  const ZONE_COUNT = 3;
  const zones: Array<Array<{ x: number; y: number }>> = Array.from({ length: ZONE_COUNT }, () => []);
  const rooms = linearBranchRoomsAll();
  for (const room of rooms) {
    const zone = Math.min(ZONE_COUNT - 1, Math.floor(room.x / (WORLD_W / ZONE_COUNT)));
    zones[zone].push(room);
  }
  // 每 zone 取 1 个营地锚点（轮转类型），最远 zone 取 2 个宝藏
  const anchors: Array<{ x: number; y: number; type: CampType | 'treasure' }> = [];
  for (let z = 0; z < ZONE_COUNT; z++) {
    if (zones[z].length === 0) continue;
    const pick = zones[z][Math.floor(rand() * zones[z].length)];
    anchors.push({ x: pick.x, y: pick.y, type: z === ZONE_COUNT - 1 ? 'treasure' : CAMP_TYPES[z % CAMP_TYPES.length] });
  }
  // 确保最远段有宝藏（若前两步未选中）
  if (!anchors.some(a => a.type === 'treasure') && zones[ZONE_COUNT - 1].length > 0) {
    const furthest = zones[ZONE_COUNT - 1][Math.floor(rand() * zones[ZONE_COUNT - 1].length)];
    anchors.push({ x: furthest.x, y: furthest.y, type: 'treasure' });
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

/** 按当前主题池刷满一局地牢 (OPT-012): 清场 → 召主题 Boss, 重置跑局计数
 *  A-W2/A-W5 地图规则: 营地按地标放置 + 密度带散怪补满; 全流程种子化 (state.run.seed)
 *  A-W6 房间化 (普通/肉鸽): 蛇形大房间链, 每房 1 营地 + 出口守卫 + 游荡者 →
 *    1-2 屏必遇敌; 数量由房间生成 (≈76), 清场后 Boss 在玩家附近降临 (main.ts) */
export function spawnRunPool(state: GameState): void {
  state.fx.monsters.length = 0;
  const pool = THEME_MONSTER_POOL[state.theme];
  const mode = state.run.mode ?? 'linear';
  const rand = mulberry32(state.run.seed ?? 1);
  const pick = () => pool[Math.floor(rand() * pool.length)];

  if (mode === 'linear' || mode === 'rogue') {
    // A-W6: 房间化池 — 布局种子化, 玩家出生首房中心
    const layout = buildLinearLayout(state.run.seed ?? 1);
    // 2026-08-15: 地图收缩 — 世界尺寸 = 房间布局外廓, 消除房间外的无用空区 (小地图即房间区)
    state.world.w = Math.max(...layout.rooms.map(r => r.x + r.w));
    state.world.h = Math.max(...layout.rooms.map(r => r.y + r.h));
    const r0 = layout.rooms[0];
    state.player.pos = {
      x: r0.x + r0.w / 2 - state.player.size.w / 2,
      y: r0.y + r0.h / 2 - state.player.size.h / 2,
    };
    // Review (地图审查 P2): 营地/补散怪出生避墙需要当前局墙 — 先按出生点生成
    state.world.walls = getActiveWalls(state, 2);
    const last = layout.rooms.length - 1;
    for (let i = 0; i < layout.rooms.length; i++) {
      const room = layout.rooms[i];
      const cx = room.x + room.w / 2;
      const cy = room.y + room.h / 2;
      const isLast = i === last;
      // 宝藏室 (每 3 房一间; 末房 = 决战/藏宝室): 无营地, 守卫 + 掉落
      if ((i % 3 === 2 && !isLast) || isLast) {
        for (let k = 0; k < 3; k++) dropLoot(state, cx, cy);
        if (!isLast) {
          const ex = layout.doors[i];
          for (let g = 0; g < 3; g++) state.fx.monsters.push(spawnMonster(state, pick(), { x: ex.ax, y: ex.ay }));
        }
      } else {
        // 营地 (聚簇 6 只) + 出口守卫 (门口内侧 3 只) — 进房 1-2 屏必遇敌
        const members = spawnCamp(state, { x: cx, y: cy, type: CAMP_TYPES[i % CAMP_TYPES.length] }, pick);
        for (const m of members) state.fx.monsters.push(m);
        const ex = layout.doors[i];
        for (let g = 0; g < 3; g++) state.fx.monsters.push(spawnMonster(state, pick(), { x: ex.ax, y: ex.ay }));
      }
      // 游荡者 (随机房内一点)
      state.fx.monsters.push(spawnMonster(state, pick(), {
        x: room.x + 4 * BLOCK + rand() * (room.w - 8 * BLOCK),
        y: room.y + 4 * BLOCK + rand() * (room.h - 8 * BLOCK),
      }));
    }
  } else {
    // gauntlet / extract: 地标营地 + 密度带散怪补足 RUN_POOL_SIZE
    state.world.walls = getActiveWalls(state, 2);
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
  }

  state.run.total = state.fx.monsters.length;
  state.run.alive = state.fx.monsters.length;
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
  inf('world', `run pool spawned: ${state.fx.monsters.length} (theme=${state.theme}, mode=${mode}, seed=${state.run.seed ?? 'default'})`);
  void import('../../util/jslog').then(({ jsLog }) =>
    jsLog(`[map] run spawn theme=${state.theme} mode=${mode} pool=${state.fx.monsters.length} seed=${state.run.seed ?? 'default'} element=${state.run.element ?? 'none'} walls=${state.world.walls.length}`),
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

// === Survival 波次模式 ===

/** Survival 波次状态 (模块内持久, 用对象包装以便 main.ts 间接修改) */
export const survivalState = { wave: 0, onBreak: false, breakT: 0 };

/** 刷一波 Survival 怪物
 * 每5波为 Boss 波 (Boss + 4精英护卫)，其余为普通波
 * 怪物数量 = 8 + wave*3，HP倍率 = 1 + wave*0.08 */
export function spawnSurvivalWave(state: GameState): void {
  const wave = ++survivalState.wave;
  state.run.wave = wave;

  const pool = THEME_MONSTER_POOL[state.theme];
  const pick = () => pool[Math.floor(Math.random() * pool.length)];
  const hpMult = 1 + wave * 0.08;
  const eliteChance = Math.min(0.40, 0.08 + wave * 0.02);
  const lordChance = Math.min(0.15, 0.04 + wave * 0.01);

  // 出生点: 中央
  const spawn = { x: WORLD_W / 2, y: WORLD_H / 2 };

  // Boss 波 (每5波)
  if (wave % 5 === 0) {
    state.fx.monsters.push(spawnMonster(state, pick(), spawn, { forceLord: true, hpMult }));
    for (let i = 0; i < 4; i++) state.fx.monsters.push(spawnMonster(state, pick(), spawn, { forceElite: true, hpMult }));
    void import('../../util/jslog').then(({ jsLog }) => jsLog(`[survival] wave=${wave} BOSS`));
  } else {
    const monsterCount = 8 + wave * 3;
    for (let i = 0; i < monsterCount; i++) {
      const angle = (i / monsterCount) * Math.PI * 2;
      const r = 300 + Math.random() * 400;
      const at = { x: spawn.x + Math.cos(angle) * r, y: spawn.y + Math.sin(angle) * r };
      const opt: Parameters<typeof spawnMonster>[3] = { hpMult };
      if (Math.random() < eliteChance) opt.forceElite = true;
      if (Math.random() < lordChance) opt.forceLord = true;
      state.fx.monsters.push(spawnMonster(state, pick(), at, opt));
    }
    void import('../../util/jslog').then(({ jsLog }) => jsLog(`[survival] wave=${wave} n=${state.fx.monsters.length}`));
  }

  state.run.alive = state.fx.monsters.length;
  state.run.bossAlive = state.fx.monsters.some(m => m.lord);
  survivalState.onBreak = false;
  survivalState.breakT = 0;
}

/** 检测 Survival 波次是否完成 → 触发休息 + 下一波 */
export function checkSurvivalWaveComplete(state: GameState): void {
  if (survivalState.onBreak) return;
  if (state.fx.monsters.length > 0) return;
  survivalState.onBreak = true;
  survivalState.breakT = 1.5; // 1.5s 休息间隔
}

/** 重置 Survival 波次状态 (新游戏/重新开始时调用) */
export function resetSurvivalWave(): void {
  survivalState.wave = 0;
  survivalState.onBreak = false;
  survivalState.breakT = 0;
}