// 程序化世界: chunk-based 分块生成, 让玩家感觉地图"无边界"
// 每个 1024x1024 chunk 用独立种子生成 8x8 block 布局, 中间 2x2 走廊确保连通

import type { GameState } from './state';

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
export function generateChunkWalls(cx: number, cy: number): Wall[] {
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
        // 内部 4x4 + 边角 12 块, 18% 概率墙
        row.push(rand() < 0.18);
      }
    }
    isWall.push(row);
  }
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

/** chunk 缓存 (同 chunk 同墙, 避免重复生成) */
const chunkCache = new Map<string, Wall[]>();
function chunkKey(cx: number, cy: number): string { return `${cx},${cy}`; }

export function getChunkWalls(cx: number, cy: number): Wall[] {
  const k = chunkKey(cx, cy);
  let w = chunkCache.get(k);
  if (!w) {
    w = generateChunkWalls(cx, cy);
    chunkCache.set(k, w);
  }
  return w;
}

/** 返回玩家附近 (radius chunks) 的所有墙 (含玩家当前 chunk) */
export function getActiveWalls(state: GameState, radius = 2): Wall[] {
  const center = worldToChunk(state.player.pos.x, state.player.pos.y);
  const out: Wall[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const cx = center.cx + dx;
      const cy = center.cy + dy;
      const maxCx = Math.floor(WORLD_W / CHUNK_SIZE) - 1;
      const maxCy = Math.floor(WORLD_H / CHUNK_SIZE) - 1;
      if (cx < 0 || cy < 0 || cx > maxCx || cy > maxCy) continue;
      out.push(...getChunkWalls(cx, cy));
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