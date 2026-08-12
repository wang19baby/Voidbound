// 程序化世界: chunk-based 分块生成, 让玩家感觉地图"无边界"
// 每个 1024x1024 chunk 用独立种子生成 8x8 block 布局, 中间 2x2 走廊确保连通

import type { GameState, Theme } from './state';

export interface Wall {
  pos: { x: number; y: number };
  size: { w: number; h: number };
}

export const BLOCK = 128;
export const CHUNK_BLOCKS = 8;
export const CHUNK_SIZE = BLOCK * CHUNK_BLOCKS; // 1024
export const WORLD_W = 20480; // 16x 视口
export const WORLD_H = 11520; // 16x 视口

export function aabbOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** Mulberry32 种子化 RNG (32-bit 状态) */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// === A-W2 三模式出生点 + 密度梯度 (设计文档 §2) ===
import type { MapMode } from './mapmode';

/** 地图1 普通: 出生在左, 主轴左→右, Boss 在右端 */
export const LINEAR_SPAWN = { x: 320, y: WORLD_H / 2 };
/** 地图2 高级: 随机角落入口, 中央 Boss */
export const GAUNTLET_SPAWN = { x: 320, y: 320 };
/** 地图3 挑战: 中央出生, 四方向区, 最终回中央 */
export const EXTRACT_SPAWN = { x: WORLD_W / 2, y: WORLD_H / 2 };

/** 按模式取出生点 (波2: 线性定左 / 高级角落 / 挑战中央; 后续波补地标) */
export function spawnPointForMode(mode: MapMode): { x: number; y: number } {
  if (mode === 'gauntlet') {
    const corner = Math.floor(Math.random() * 4);
    const PAD = 320;
    return [
      { x: PAD, y: PAD },
      { x: WORLD_W - PAD, y: PAD },
      { x: PAD, y: WORLD_H - PAD },
      { x: WORLD_W - PAD, y: WORLD_H - PAD },
    ][corner];
  }
  if (mode === 'extract') return EXTRACT_SPAWN;
  return LINEAR_SPAWN;
}

/** 密度随模式: 线性 18% / 高级 22% (承诺制压力) / 挑战 16% (空间大, 靠营地密度) */
export function densityForMode(mode: MapMode): number {
  return mode === 'gauntlet' ? 0.22 : mode === 'extract' ? 0.16 : 0.18;
}

/** 把世界坐标 (x, y) 转 chunk 索引 */
export function worldToChunk(x: number, y: number): { cx: number; cy: number } {
  return {
    cx: Math.max(0, Math.min(Math.floor(x / CHUNK_SIZE), Math.floor(WORLD_W / CHUNK_SIZE) - 1)),
    cy: Math.max(0, Math.min(Math.floor(y / CHUNK_SIZE), Math.floor(WORLD_H / CHUNK_SIZE) - 1)),
  };
}

/** 生成单个 chunk 的 wall 列表
 *  设计:
 *   - 8x8 grid, 1 block = 128px
 *   - 中间 2x2 走廊 (row 3-4, col 3-4) 强制空
 *   - 外圈 (row 0/7, col 0/7) 强制空 → 保证相邻 chunk 跨边界连通
 *   - 内部 6x6 范围 18% 密度墙
 */
export function generateChunkWalls(cx: number, cy: number, density: number = 0.18, mode: MapMode = 'linear'): Wall[] {
  const rand = mulberry32(cx * 73856093 ^ cy * 19349663 ^ 0xcafef00d);
  const walls: Wall[] = [];
  // 默认全空, 然后随机填墙
  const isWall: boolean[][] = [];
  for (let r = 0; r < CHUNK_BLOCKS; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < CHUNK_BLOCKS; c++) {
      // 边界 + 走廊 强制空
      const isBorder = r === 0 || r === CHUNK_BLOCKS - 1 || c === 0 || c === CHUNK_BLOCKS - 1;
      const isCorridor = (r === 3 || r === 4) && (c >= 3 && c <= 4);
      // 走廊延伸: row 3,4 与 col 3,4 在 chunk 内做十字走廊, 边界全空保证跨 chunk 通行
      const isAxisCorridor = (r === 3 || r === 4) || (c === 3 || c === 4);
      if (isBorder || isCorridor) {
        row.push(false);
      } else if (isAxisCorridor) {
        // 十字走廊外延 (边界外不延伸) → 这里因为 isBorder 已 false, 轴向走廊自然延伸
        row.push(false);
      } else {
        // 内部 4x4 + 边角 12 块, 按模式密度 (A-W2: 线性18% / 高级22% / 挑战16%)
        row.push(rand() < density);
      }
    }
    isWall.push(row);
  }

  // === A-W2 地标雕刻 pass (设计文档 §2.4): 模式专属结构覆盖随机墙 ===
  applyLandmarkCarve(isWall, cx, cy, mode);

  // 转 walls
  const ox = cx * CHUNK_SIZE;
  const oy = cy * CHUNK_SIZE;
  for (let r = 0; r < CHUNK_BLOCKS; r++) {
    for (let c = 0; c < CHUNK_BLOCKS; c++) {
      if (isWall[r][c]) {
        walls.push({ pos: { x: ox + c * BLOCK, y: oy + r * BLOCK }, size: { w: BLOCK, h: BLOCK } });
      }
    }
  }
  return walls;
}

/** 地标雕刻: 覆盖随机墙, 建立模式结构
 *  linear  : 主轴带 (y 中部 2 块高) 全空 → 左→右主走廊; 主带两侧随机留墙 (分支感)
 *  gauntlet: 中央 2x2 清空成竞技场 + 周边环墙 (外→内递进终点); 四角领主区清空小块
 *  extract : 中央 2x2 清空成出生竞技场; 四方向区保留随机 (密度梯度由 density 承担)
 */
function applyLandmarkCarve(isWall: boolean[][], cx: number, cy: number, mode: MapMode): void {
  const midC = Math.floor((WORLD_W / CHUNK_SIZE) / 2);
  const midR = Math.floor((WORLD_H / CHUNK_SIZE) / 2);
  const clearBlock = (r0: number, c0: number, rows: number, cols: number) => {
    for (let r = Math.max(1, r0); r < Math.min(CHUNK_BLOCKS - 1, r0 + rows); r++) {
      for (let c = Math.max(1, c0); c < Math.min(CHUNK_BLOCKS - 1, c0 + cols); c++) isWall[r][c] = false;
    }
  };
  if (mode === 'linear') {
    // 主轴带: y 中部 2 块高, 全图水平贯通 (出生左 → Boss 右)
    if (cy === midR || cy === midR - 1) {
      for (let r = 3; r <= 4; r++) for (let c = 0; c < CHUNK_BLOCKS; c++) isWall[r][c] = false;
    }
    // 分支密室: 主带两侧偶发死路 pocket (1 块宽 2 块深, 藏宝)
    const pocketRng = mulberry32(cx * 99371 ^ cy * 1913 ^ 0xabcd);
    if (pocketRng() < 0.25 && cy !== midR && cy !== midR - 1) {
      const side = cy < midR - 1 ? 0 : 1;  // 主带上/下侧
      const c0 = 2 + Math.floor(pocketRng() * 4);  // Review: 种子化 + c0≥2 (不写边界/走廊列)
      if (side === 0) { for (let c = c0; c < c0 + 2; c++) isWall[2][c] = false; }
      else { for (let c = c0; c < c0 + 2; c++) isWall[5][c] = false; }
    }
  } else if (mode === 'gauntlet') {
    // 中央竞技场: 2x2 清空 + 环墙 (外圈是墙)
    if (Math.abs(cx - midC) <= 1 && Math.abs(cy - midR) <= 1) {
      clearBlock(2, 2, 4, 4);  // 内部 4x4 清空
      for (let r = 1; r < CHUNK_BLOCKS - 1; r++) {
        for (let c = 1; c < CHUNK_BLOCKS - 1; c++) {
          if (r === 1 || r === CHUNK_BLOCKS - 2 || c === 1 || c === CHUNK_BLOCKS - 2) isWall[r][c] = true;  // 环墙
        }
      }
    }
    // 四角领主区: 角 chunk 清空小块 (守卫群位置)
    const corner = (cx === 0 || cx === Math.floor(WORLD_W / CHUNK_SIZE) - 1) && (cy === 0 || cy === Math.floor(WORLD_H / CHUNK_SIZE) - 1);
    if (corner) {
      clearBlock(2, 2, 2, 2);
      for (let r = 1; r < 4; r++) for (let c = 1; c < 4; c++) {
        if (r === 1 || c === 1) isWall[r][c] = true;
      }
    }
  } else if (mode === 'extract') {
    // 中央出生竞技场: 2x2 清空 (回中央决战)
    if (Math.abs(cx - midC) <= 1 && Math.abs(cy - midR) <= 1) {
      clearBlock(2, 2, 4, 4);
    }
  }
}

/** chunk 缓存 (同 chunk 同墙, 避免重复生成); A-W2 按 密度+模式 分键 (模式切换清缓存) */
const chunkCache = new Map<string, Wall[]>();
function chunkKey(cx: number, cy: number, density: number, mode: MapMode): string { return `${cx},${cy}:${density}:${mode}`; }

export function getChunkWalls(cx: number, cy: number, density: number = 0.18, mode: MapMode = 'linear'): Wall[] {
  const k = chunkKey(cx, cy, density, mode);
  let w = chunkCache.get(k);
  if (!w) {
    w = generateChunkWalls(cx, cy, density, mode);
    chunkCache.set(k, w);
  }
  return w;
}

/** 按模式刷墙 (A-W2): 每局重置缓存 + 密度; 由 startRun 调用 */
export function resetWorldForMode(mode: MapMode): void {
  chunkCache.clear();
  decorCache.clear();
}

/** 返回玩家附近 (radius chunks) 的所有墙 (含玩家当前 chunk) */
export function getActiveWalls(state: GameState, radius = 2): Wall[] {
  const center = worldToChunk(state.player.pos.x, state.player.pos.y);
  const out: Wall[] = [];
  const density = densityForMode(state.run.mode ?? 'linear');
  const mode = state.run.mode ?? 'linear';
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const cx = center.cx + dx;
      const cy = center.cy + dy;
      const maxCx = Math.floor(WORLD_W / CHUNK_SIZE) - 1;
      const maxCy = Math.floor(WORLD_H / CHUNK_SIZE) - 1;
      if (cx < 0 || cy < 0 || cx > maxCx || cy > maxCy) continue;
      out.push(...getChunkWalls(cx, cy, density, mode));
    }
  }
  return out;
}

/** 检测玩家矩形与墙列表中任意墙是否碰撞; 返回首个碰撞墙 */
export function findPlayerWallHit(state: GameState, walls: Wall[]): Wall | null {
  const p = state.player;
  for (const w of walls) {
    if (aabbOverlap(p.pos.x, p.pos.y, p.size.w, p.size.h, w.pos.x, w.pos.y, w.size.w, w.size.h)) {
      return w;
    }
  }
  return null;
}

// 老接口兼容 (保留 buildDungeonWalls 给 main.ts 默认初始化)
export function buildDungeonWalls(): Wall[] {
  return generateChunkWalls(10, 7); // 占位, 实际用 getActiveWalls
}

// === V1 画质: 障碍物装饰 (纯视觉, 无碰撞) ===

export interface Decor {
  pos: { x: number; y: number };
  sprite: string;
  tint?: [number, number, number];
}

/** 主题 → 装饰配置 (复用 world 图集: grass / wall_alt) */
export const THEME_DECOR: Record<Theme, { sprite: string; count: number; tint?: [number, number, number] }> = {
  forest: { sprite: 'decor_forest', count: 6 }, // HD 草丛
  desert: { sprite: 'decor_desert', count: 6 }, // HD 石块
  ruin:   { sprite: 'decor_ruin', count: 5 }, // HD 冰石
  void:   { sprite: 'decor_void', count: 4 }, // HD 虚空水晶
};

const decorCache = new Map<string, Decor[]>();
function decorKey(cx: number, cy: number, theme: Theme): string { return `${cx},${cy}:${theme}`; }

/** 生成单个 chunk 的装饰 (种子化, 与墙布局共享 RNG 种子系, 避开墙块) */
export function generateChunkDecor(cx: number, cy: number, theme: Theme, density: number = 0.18, mode: MapMode = 'linear'): Decor[] {
  const rand = mulberry32(cx * 73856093 ^ cy * 19349663 ^ 0xdec0de5);
  const cfg = THEME_DECOR[theme];
  const walls = getChunkWalls(cx, cy, density, mode);
  const out: Decor[] = [];
  const ox = cx * CHUNK_SIZE;
  const oy = cy * CHUNK_SIZE;
  const size = 32;
  let guard = 0;
  while (out.length < cfg.count && guard++ < 64) {
    const x = ox + 16 + rand() * (CHUNK_SIZE - 32);
    const y = oy + 16 + rand() * (CHUNK_SIZE - 32);
    let blocked = false;
    for (const w of walls) {
      if (aabbOverlap(x, y, size, size, w.pos.x, w.pos.y, w.size.w, w.size.h)) { blocked = true; break; }
    }
    if (blocked) continue;
    out.push({ pos: { x, y }, sprite: cfg.sprite, tint: cfg.tint });
  }
  return out;
}

export function getChunkDecor(cx: number, cy: number, theme: Theme, density: number = 0.18, mode: MapMode = 'linear'): Decor[] {
  const k = `${decorKey(cx, cy, theme)}:${density}:${mode}`;
  let d = decorCache.get(k);
  if (!d) {
    d = generateChunkDecor(cx, cy, theme, density, mode);
    decorCache.set(k, d);
  }
  return d;
}

/** 返回玩家附近 (radius chunks) 的所有装饰 (含当前 chunk) */
export function getActiveDecor(state: GameState, radius = 2): Decor[] {
  const center = worldToChunk(state.player.pos.x, state.player.pos.y);
  const out: Decor[] = [];
  const density = densityForMode(state.run.mode ?? 'linear');
  const mode = state.run.mode ?? 'linear';
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const cx = center.cx + dx;
      const cy = center.cy + dy;
      const maxCx = Math.floor(WORLD_W / CHUNK_SIZE) - 1;
      const maxCy = Math.floor(WORLD_H / CHUNK_SIZE) - 1;
      if (cx < 0 || cy < 0 || cx > maxCx || cy > maxCy) continue;
      out.push(...getChunkDecor(cx, cy, state.theme, density, mode));
    }
  }
  return out;
}