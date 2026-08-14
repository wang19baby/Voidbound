// 程序化世界: chunk-based 分块生成, 让玩家感觉地图"无边界"
// 每个 1024x1024 chunk 用独立种子生成 8x8 block 布局, 中间 2x2 走廊确保连通

import type { GameState, Theme } from './state';

export interface Wall {
  pos: { x: number; y: number };
  size: { w: number; h: number };
}

export const BLOCK = 128; // 墙块尺寸恢复 (2026-08-13: 32px 1/4 看不清贴图 → 回 128px 1:1)
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

/** 地图1 普通: 出生在左, 主轴左→右推进 (Boss 清场后在玩家附近降临, 见 spawnRunPool) */
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

/** 生成单个 chunk 的 wall 列表 (开放场地 + 稀疏墙簇, 2026-08-13 重写 v3)
 *  设计:
 *   - 8x8 grid, 1 block = 128px (墙块 1:1, 贴图清晰)
 *   - 默认全开放 → 按 density 撒 1-2 块小墙簇作战斗掩体 (不围房间, 不封路)
 *   - 外圈 1 块永不置墙 → chunk 边界天然连通, 无门洞/孤岛问题
 *   - density 直接控制墙量: linear 0.18 / gauntlet 0.22 / extract 0.16
 *     (旧 v2 全图填墙再挖房间, 墙占比 52% 且 density 无效 → 战斗空区过小)
 *   - 墙簇互不相邻 (8 邻域留空) → 无长墙、无死角, 怪物可绕行不卡墙
 */
export function generateChunkWalls(cx: number, cy: number, density: number = 0.18, mode: MapMode = 'linear'): Wall[] {
  const rand = mulberry32(cx * 73856093 ^ cy * 19349663 ^ 0xcafef00d);
  const G = CHUNK_BLOCKS; // 8
  const isWall: boolean[][] = [];
  for (let r = 0; r < G; r++) isWall.push(new Array<boolean>(G).fill(false));

  // === 密度梯度 (设计 §2.4): 距出生基准点越远墙越密 (近开远密) ===
  // 纯 (cx,cy,mode) 函数 → chunk 缓存确定性
  // linear: 距左端 (主轴左→右, 左开右密) / extract: 距中央 (中央出生向外, 中开外密)
  // gauntlet: 距最近角落 (出生角随机四选一, 角开中密 — 角落入口 → 中央 Boss, 外→内递进)
  {
    const maxCx = Math.floor(WORLD_W / CHUNK_SIZE) - 1;
    const maxCy = Math.floor(WORLD_H / CHUNK_SIZE) - 1;
    let d: number;
    if (mode === 'linear') {
      const refY = Math.floor((WORLD_H / 2) / CHUNK_SIZE);
      d = Math.max(cx, Math.abs(cy - refY));
    } else if (mode === 'extract') {
      const refX = Math.floor((WORLD_W / 2) / CHUNK_SIZE);
      const refY = Math.floor((WORLD_H / 2) / CHUNK_SIZE);
      d = Math.max(Math.abs(cx - refX), Math.abs(cy - refY));
    } else {
      // gauntlet: 距 4 个角落的最近 Chebyshev 距离
      d = Math.min(
        Math.max(cx, cy),
        Math.max(maxCx - cx, cy),
        Math.max(cx, maxCy - cy),
        Math.max(maxCx - cx, maxCy - cy),
      );
    }
    density = Math.min(0.5, density * (1 + d * 0.15)); // 每 chunk 距离 +15%, 封顶 0.5
  }

  // 墙簇数 = density × 格数 / 1.5 (簇含 30% 双格 → 实际墙格 ≈ density × 格数)
  // 4 直邻互斥 (对角允许): 上限 18 格, 密度梯度 (0.18→0.5) 可表达; 无长墙/死角
  const clusterTarget = Math.max(3, Math.round((density * G * G) / 1.5));
  // 上下左右直邻是否已有墙 (簇间留 1 格空隙; 对角相邻不算长墙)
  const touchingWall = (r: number, c: number): boolean => {
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= G || cc < 0 || cc >= G) continue;
      if (isWall[rr][cc]) return true;
    }
    return false;
  };

  let placed = 0;
  let guard = 0;
  while (placed < clusterTarget && guard++ < 200) {
    // 内区 1..6 撒点 (外圈保持开放, chunk 间可通行)
    const r = 1 + Math.floor(rand() * (G - 2));
    const c = 1 + Math.floor(rand() * (G - 2));
    if (isWall[r][c] || touchingWall(r, c)) continue;
    isWall[r][c] = true;
    placed++;
    // 30% 扩展成 2 块簇 (上下左右之一, 仍避开既有墙)
    if (placed < clusterTarget && rand() < 0.3) {
      const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      const [dr, dc] = dirs[Math.floor(rand() * dirs.length)];
      const r2 = r + dr, c2 = c + dc;
      if (r2 >= 1 && r2 < G - 1 && c2 >= 1 && c2 < G - 1 && !isWall[r2][c2] && !touchingWall(r2, c2)) {
        isWall[r2][c2] = true;
        placed++;
      }
    }
  }

  // === 地标雕刻 pass (A-W2 设计 §2.4): 普通模式 = 主轴走廊 + 分支房间 ===
  // 主轴: 全局固定行 (row 5 = 出生行 y=5760/128 mod 8) 全开 → 跨 chunk 对齐成左→右主走廊
  // 分支: 2-3 条垂直通道 (1 格宽, 喉点) + 末端 2×2 宝藏/营地房间; 分支列不重复且间隔 ≥2
  // 分支布局用独立种子 RNG (branchRand): 撒墙簇主 rand 消费次数随机, 不可重放 →
  // linearBranchRooms 用同一 branchRand 复算 → 房间坐标确定一致 (MM-FIX8)
  if (mode === 'linear') {
    const MAIN_ROW = 5;
    for (let c = 0; c < G; c++) isWall[MAIN_ROW][c] = false;

    const branchRand = mulberry32(cx * 73856093 ^ cy * 19349663 ^ 0x5eedf00d);
    const branchCount = 2 + Math.floor(branchRand() * 2); // 2-3 条
    const usedCols: number[] = [];
    for (let i = 0; i < branchCount; i++) {
      // 分支列: 避开边 (0/7) 与已用列 (间隔 ≥2)
      let bc = -1;
      for (let tries = 0; tries < 12 && bc < 0; tries++) {
        const cand = 1 + Math.floor(branchRand() * (G - 2));
        if (usedCols.some(u => Math.abs(u - cand) < 2)) continue;
        bc = cand;
      }
      if (bc < 0) break;
      usedCols.push(bc);
      // 通道方向: 上/下随机, 长度 2-3 格 (喉点)
      const dir = branchRand() < 0.5 ? -1 : 1;
      const len = 2 + Math.floor(branchRand() * 2);
      const r1 = MAIN_ROW + dir;
      const rEnd = Math.max(1, Math.min(G - 2, r1 + dir * (len - 1)));
      for (let r = Math.min(r1, rEnd); r <= Math.max(r1, rEnd); r++) isWall[r][bc] = false;
      // 末端 2×2 房间 (通道末端 + 横向 1 格)
      const rA = rEnd, rB = Math.max(1, Math.min(G - 2, rEnd + dir));
      const cB = Math.max(1, Math.min(G - 2, bc + 1));
      isWall[rB][bc] = false;
      isWall[rA][cB] = false;
      isWall[rB][cB] = false;
    }
  }

  // 转 walls
  const ox = cx * CHUNK_SIZE;
  const oy = cy * CHUNK_SIZE;
  const walls: Wall[] = [];
  for (let r = 0; r < G; r++) {
    for (let c = 0; c < G; c++) {
      if (isWall[r][c]) walls.push({ pos: { x: ox + c * BLOCK, y: oy + r * BLOCK }, size: { w: BLOCK, h: BLOCK } });
    }
  }
  return walls;
}

/** chunk 缓存 (同 chunk 同墙, 避免重复生成); A-W2 按 密度+模式 分键 (模式切换清缓存) */
const chunkCache = new Map<string, Wall[]>();
function chunkKey(cx: number, cy: number, density: number, mode: MapMode): string { return `${cx},${cy}:${density}:${mode}`; }

/** linear 模式分支房间中心坐标 (世界 px) — MM-FIX8
 *  与 generateChunkWalls 雕刻共用同一 branchRand 种子 → 房间位置确定一致
 *  用于 spawnRunPool: 分支尽头放营地/宝藏/强化点 (设计 §2.1) */
export function linearBranchRooms(cx: number, cy: number): Array<{ x: number; y: number }> {
  const G = CHUNK_BLOCKS;
  const MAIN_ROW = 5;
  const branchRand = mulberry32(cx * 73856093 ^ cy * 19349663 ^ 0x5eedf00d);
  const out: Array<{ x: number; y: number }> = [];
  const branchCount = 2 + Math.floor(branchRand() * 2);
  const usedCols: number[] = [];
  for (let i = 0; i < branchCount; i++) {
    let bc = -1;
    for (let tries = 0; tries < 12 && bc < 0; tries++) {
      const cand = 1 + Math.floor(branchRand() * (G - 2));
      if (usedCols.some(u => Math.abs(u - cand) < 2)) continue;
      bc = cand;
    }
    if (bc < 0) break;
    usedCols.push(bc);
    const dir = branchRand() < 0.5 ? -1 : 1;
    const len = 2 + Math.floor(branchRand() * 2);
    const r1 = MAIN_ROW + dir;
    const rEnd = Math.max(1, Math.min(G - 2, r1 + dir * (len - 1)));
    const rB = Math.max(1, Math.min(G - 2, rEnd + dir));
    const cB = Math.max(1, Math.min(G - 2, bc + 1));
    // 房间中心 = 2×2 房间对角中点
    out.push({
      x: cx * CHUNK_SIZE + ((bc + cB) / 2 + 0.5) * BLOCK,
      y: cy * CHUNK_SIZE + ((rEnd + rB) / 2 + 0.5) * BLOCK,
    });
  }
  return out;
}

export function getChunkWalls(cx: number, cy: number, density: number = 0.18, mode: MapMode = 'linear'): Wall[] {
  const k = chunkKey(cx, cy, density, mode);
  let w = chunkCache.get(k);
  if (!w) {
    w = generateChunkWalls(cx, cy, density, mode);
    chunkCache.set(k, w);
    // 地图生成日志: 新 chunk 首次生成 (缓存未命中时) → 终端可见
    void import('../util/jslog').then(({ jsLog }) =>
      jsLog(`[map] gen walls chunk(${cx},${cy}) n=${w.length} mode=${mode} density=${density} cache=${chunkCache.size}`),
    );
  }
  return w;
}

/** 按模式刷墙 (A-W2): 每局重置缓存 + 密度; 由 startRun 调用 */
export function resetWorldForMode(mode: MapMode): void {
  const prevW = chunkCache.size;
  const prevD = decorCache.size;
  chunkCache.clear();
  decorCache.clear();
  void import('../util/jslog').then(({ jsLog }) =>
    jsLog(`[map] reset mode=${mode} cache ${prevW}walls/${prevD}decor cleared`),
  );
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
  // 防出生卡墙 (房间+通道生成后出生点可能落在墙区): 剔除玩家矩形占据的所有墙 cell
  const p = state.player;
  const pcx0 = Math.floor(p.pos.x / BLOCK), pcy0 = Math.floor(p.pos.y / BLOCK);
  const pcx1 = Math.floor((p.pos.x + p.size.w - 1) / BLOCK), pcy1 = Math.floor((p.pos.y + p.size.h - 1) / BLOCK);
  return out.filter(w => {
    const wx = Math.floor(w.pos.x / BLOCK), wy = Math.floor(w.pos.y / BLOCK);
    return wx < pcx0 || wx > pcx1 || wy < pcy0 || wy > pcy1;
  });
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

/** V1 画质: 障碍物装饰 (纯视觉, 无碰撞) */

export interface Decor {
  pos: { x: number; y: number };
  sprite: string;
  tint?: [number, number, number];
}

/** 主题 → 装饰配置 (world 图集 decor_* HD; 旧 grass/wall_alt 已移除) */
export const THEME_DECOR: Record<Theme, { sprite: string; count: number; tint?: [number, number, number] }> = {
  forest: { sprite: 'decor_forest', count: 12 }, // HD 草丛 (6→12: 出生视野内须可见, 否则"空地图")
  desert: { sprite: 'decor_desert', count: 12 }, // HD 石块
  ruin:   { sprite: 'decor_ruin', count: 10 }, // HD 冰石
  void:   { sprite: 'decor_void', count: 8 }, // HD 虚空水晶
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
  // 装饰显示尺寸 (HD: 128px 1:1, 与墙块同规格; 旧 64px 是 Kenney 小图时代)
  const size = 128;
  let guard = 0;
  while (out.length < cfg.count && guard++ < 64) {
    const x = ox + size / 2 + rand() * (CHUNK_SIZE - size);
    const y = oy + size / 2 + rand() * (CHUNK_SIZE - size);
    let blocked = false;
    for (const w of walls) {
      if (aabbOverlap(x, y, size, size, w.pos.x, w.pos.y, w.size.w, w.size.h)) { blocked = true; break; }
    }
    if (blocked) continue;
    // 装饰间不重叠 (防堆叠穿帮)
    if (out.some(d => aabbOverlap(x, y, size, size, d.pos.x, d.pos.y, size, size))) continue;
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
    void import('../util/jslog').then(({ jsLog }) =>
      jsLog(`[map] gen decor chunk(${cx},${cy}) n=${d.length} theme=${theme} sprite=${THEME_DECOR[theme].sprite}`),
    );
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