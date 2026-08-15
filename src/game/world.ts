// 程序化世界: chunk-based 分块生成, 让玩家感觉地图"无边界"
// 每个 1024x1024 chunk 用独立种子生成 8x8 block 布局, 中间 2x2 走廊确保连通
// A-W6: 普通/肉鸽改为蛇形小房间链 (buildLinearLayout), 墙只在房间边界, 相邻房共享单墙, 门洞连通

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

/** Mulberry32 种子化 RNG (32-bit 状态); A-W5 肉鸽: spawnRunPool 布局种子化导出复用 */
export function mulberry32(seed: number): () => number {
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
  if (mode === 'survival') return { x: WORLD_W / 2, y: WORLD_H / 2 };
  return LINEAR_SPAWN;
}

/** 密度随模式: 线性/肉鸽/survival 18% / 高级 22% (承诺制压力) / 挑战 16% (空间大, 靠营地密度) */
export function densityForMode(mode: MapMode): number {
  return mode === 'gauntlet' ? 0.22 : mode === 'extract' ? 0.16 : 0.18;
}

/** chunk 距出生基准的距离 (设计 §2.4 密度梯度; A-W5: 肉鸽同线性 — 左开右密; survival: 距中央)
 *  linear/rogue/survival: 距左端 (主轴左→右) / extract: 距中央 / gauntlet: 距最近角落 */
export function chunkDist(mode: MapMode, cx: number, cy: number): number {
  const maxCx = Math.floor(WORLD_W / CHUNK_SIZE) - 1;
  const maxCy = Math.floor(WORLD_H / CHUNK_SIZE) - 1;
  if (mode === 'linear' || mode === 'rogue' || mode === 'survival') {
    const refY = Math.floor((WORLD_H / 2) / CHUNK_SIZE);
    return Math.max(cx, Math.abs(cy - refY));
  }
  if (mode === 'extract') {
    const refX = Math.floor((WORLD_W / 2) / CHUNK_SIZE);
    const refY = Math.floor((WORLD_H / 2) / CHUNK_SIZE);
    return Math.max(Math.abs(cx - refX), Math.abs(cy - refY));
  }
  // gauntlet: 距 4 个角落的最近 Chebyshev 距离
  return Math.min(
    Math.max(cx, cy),
    Math.max(maxCx - cx, cy),
    Math.max(cx, maxCy - cy),
    Math.max(maxCx - cx, maxCy - cy),
  );
}

// === A-W6 房间化地图 (普通/肉鸽): 多个大房间蛇形相连 ===
// 设计: 长方形开放场 → 大房间链。墙只在房间边界 (1 格厚), 门洞连通相邻房间;
// 地面与障碍物只在房间内生成; 每房必有一团怪物 (1-2 屏必遇敌)。
// 布局按局种子确定 (buildLinearLayout), 房间墙从布局推导 → chunk 缓存按局失效。

export interface RoomRect { x: number; y: number; w: number; h: number; }

/** 房间间门洞: x/y = 门洞中心 (墙上); ax/ay = 房 A 内侧守卫锚点, bx/by = 房 B 内侧; gap = 门洞矩形 (地板补画) */
export interface RoomDoor {
  x: number; y: number;
  ax: number; ay: number;
  bx: number; by: number;
  gap: { x: number; y: number; w: number; h: number };
}

export interface RoomLayout {
  rooms: RoomRect[];
  doors: RoomDoor[];
  doorBlocks: Set<string>;
  obstacleBlocks: Array<{ x: number; y: number }>;
}

/** 房间规格: 1280×1280 = 1×1 视口 (小房间, 2026-08-15 压缩 1/2; 相邻房共享 1 格单墙) */
export const ROOM_W = 1280;
export const ROOM_H = 1280;
const LAYOUT_MARGIN = 128;
const LAYOUT_COLS = 4; // 4 房一行 × 2 行 = 8 房蛇形链 (2026-08-15: 5→4, 地图收缩)
const LAYOUT_ROWS = 2;

let activeLayout: RoomLayout | null = null;

export function getActiveLayout(): RoomLayout | null { return activeLayout; }

/** 房间化模式 (linear/rogue): 点 (怪物中心) 是否在地板上 — 房间内部或门洞; 排除虚空与墙 */
export function isOnRoomFloor(layout: RoomLayout, x: number, y: number): boolean {
  for (const r of layout.rooms) {
    if (x >= r.x + BLOCK && x < r.x + r.w - BLOCK && y >= r.y + BLOCK && y < r.y + r.h - BLOCK) return true;
  }
  for (const d of layout.doors) {
    const g = d.gap;
    if (x >= g.x && x < g.x + g.w && y >= g.y && y < g.y + g.h) return true;
  }
  return false;
}

/** 房间化模式: 拉回最近地板点 (最近房间内部, 包围盒夹取) */
export function nearestRoomFloorPoint(layout: RoomLayout, x: number, y: number): { x: number; y: number } {
  let bx = x, by = y, bd = Infinity;
  for (const r of layout.rooms) {
    const cx = Math.max(r.x + BLOCK, Math.min(x, r.x + r.w - BLOCK));
    const cy = Math.max(r.y + BLOCK, Math.min(y, r.y + r.h - BLOCK));
    const d = (cx - x) ** 2 + (cy - y) ** 2;
    if (d < bd) { bd = d; bx = cx; by = cy; }
  }
  return { x: bx, y: by };
}

/** 蛇形房间链: 首行左→右, 换行右→左; 相邻房共享 1 格单墙 (128px), 墙上凿门洞连通。
 *  2026-08-15: 去规整 — 每房宽度随机 (1280..1664 块对齐), 高度固定 → 共享墙/门洞机制不变;
 *  摆放: 行0 x 累加左→右, 弯折房 (第 COLS-1→COLS 房) 共享列, 行1 从弯折房向左递减。
 *  返回并缓存为全局 activeLayout (resetWorldForMode 清空, 每局重建) */
export function buildLinearLayout(seed: number): RoomLayout {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const rooms: RoomRect[] = [];
  const total = LAYOUT_COLS * LAYOUT_ROWS;
  // 每房宽度随机 (10-13 格, 1280..1664px), 高度固定 ROOM_H
  const wOf: number[] = [];
  for (let i = 0; i < total; i++) wOf.push(BLOCK * (10 + Math.floor(rand() * 4)));
  // 相邻房共享 1 格单墙: 下一房左缘 = 上一房右缘 - BLOCK (重叠 1 块)
  const xr: number[] = [LAYOUT_MARGIN];
  for (let i = 1; i < LAYOUT_COLS; i++) xr.push(xr[i - 1] + wOf[i - 1] - BLOCK); // 行0 左→右
  xr.push(xr[LAYOUT_COLS - 1]); // 弯折房共享列 (行1 最右)
  for (let i = LAYOUT_COLS + 1; i < total; i++) xr.push(xr[i - 1] - wOf[i] + BLOCK); // 行1 右→左
  const y0 = LAYOUT_MARGIN;
  const y1 = LAYOUT_MARGIN + (ROOM_H - BLOCK); // 共享横墙行
  for (let i = 0; i < total; i++) {
    rooms.push({ x: xr[i], y: i < LAYOUT_COLS ? y0 : y1, w: wOf[i], h: ROOM_H });
  }

  const doorBlocks = new Set<string>();
  const doors: RoomDoor[] = [];
  const DOOR_HALF = BLOCK; // 门洞半宽 1 格 → 门高 ~3 格 (384px, 玩家/怪物通行)
  for (let i = 0; i < rooms.length - 1; i++) {
    const a = rooms[i], b = rooms[i + 1];
    const sameRow = a.y === b.y;
    const gapBlocks: Array<[number, number]> = [];
    let door: RoomDoor;
    if (sameRow) {
      // 共享单竖墙: 房A右边界列 = 房B左边界列 (同一列), 只凿这 1 列成门洞
      const aLeft = a.x < b.x;
      const ex = aLeft ? a.x + a.w : b.x + b.w;
      const yc = a.y + 2 * BLOCK + rand() * (a.h - 4 * BLOCK);
      const bx = Math.floor((ex - BLOCK) / BLOCK);
      const rBy0 = Math.floor(a.y / BLOCK), rBh = Math.floor(a.h / BLOCK);
      const by0 = Math.max(rBy0 + 1, Math.floor((yc - DOOR_HALF) / BLOCK));
      const by1 = Math.min(by0 + 2, rBy0 + rBh - 2); // 门洞不出本房内部 (不凿共享横墙)
      for (let by = by0; by <= by1; by++) gapBlocks.push([bx, by]);
      door = {
        x: ex, y: yc,
        ax: aLeft ? ex - 2 * BLOCK : ex + 2 * BLOCK, ay: yc,
        bx: aLeft ? ex + 2 * BLOCK : ex - 2 * BLOCK, by: yc,
        gap: { x: bx * BLOCK, y: by0 * BLOCK, w: BLOCK, h: (by1 - by0 + 1) * BLOCK },
      };
    } else {
      // 共享单横墙: 上房底边界行 = 下房顶边界行 (同一行), 只凿这 1 行成门洞
      const aTop = a.y < b.y;
      const ey = aTop ? a.y + a.h : b.y + b.h;
      // 弯折房宽可不同 → 门洞钳制到两房 x 交集, 确保两房内都通
      const shareW = Math.min(a.w, b.w);
      const xc = a.x + 2 * BLOCK + rand() * (shareW - 4 * BLOCK);
      const by = Math.floor((ey - BLOCK) / BLOCK);
      const rBx0 = Math.floor(a.x / BLOCK), rBw = Math.floor(shareW / BLOCK);
      const bx0 = Math.max(rBx0 + 1, Math.floor((xc - DOOR_HALF) / BLOCK));
      const bx1 = Math.min(bx0 + 2, rBx0 + rBw - 2); // 门洞不出本房内部 (不凿共享竖墙)
      for (let bx = bx0; bx <= bx1; bx++) gapBlocks.push([bx, by]);
      door = {
        x: xc, y: ey,
        ax: xc, ay: aTop ? ey - 2 * BLOCK : ey + 2 * BLOCK,
        bx: xc, by: aTop ? ey + 2 * BLOCK : ey - 2 * BLOCK,
        gap: { x: bx0 * BLOCK, y: by * BLOCK, w: (bx1 - bx0 + 1) * BLOCK, h: BLOCK },
      };
    }
    for (const [bx, by] of gapBlocks) doorBlocks.add(`${bx},${by}`);
    // 门锚点格也入 doorBlocks → 障碍物避开门内/门外落点, 保证怪物守门位与玩家过门路径不被堵
    doorBlocks.add(`${Math.floor(door.ax / BLOCK)},${Math.floor(door.ay / BLOCK)}`);
    doorBlocks.add(`${Math.floor(door.bx / BLOCK)},${Math.floor(door.by / BLOCK)}`);
    doors.push(door);
  }

  // 房间内障碍 (战斗掩体): 每房 2-4 块, 避开门洞块与房心 (营地/出生区)
  const obstacleBlocks: Array<{ x: number; y: number }> = [];
  for (const r of rooms) {
    const bx0 = Math.floor(r.x / BLOCK), by0 = Math.floor(r.y / BLOCK);
    const bw = Math.floor(r.w / BLOCK), bh = Math.floor(r.h / BLOCK);
    const cpx = r.x + r.w / 2, cpy = r.y + r.h / 2;
    const n = 2 + Math.floor(rand() * 3);
    const placed: Array<[number, number]> = [];
    for (let k = 0; k < n; k++) {
      for (let t = 0; t < 10; t++) {
        const bx = bx0 + 2 + Math.floor(rand() * (bw - 4));
        const by = by0 + 2 + Math.floor(rand() * (bh - 4));
        if (doorBlocks.has(`${bx},${by}`)) continue;
        if (Math.abs(bx * BLOCK + 64 - cpx) < 2 * BLOCK && Math.abs(by * BLOCK + 64 - cpy) < 2 * BLOCK) continue;
        if (placed.some(p => Math.abs(p[0] - bx) <= 1 && Math.abs(p[1] - by) <= 1)) continue;
        placed.push([bx, by]);
        obstacleBlocks.push({ x: bx, y: by });
        break;
      }
    }
  }

  activeLayout = { rooms, doors, doorBlocks, obstacleBlocks };
  return activeLayout;
}

/** 从房间布局提取 chunk 内墙块 (房间边界 + 障碍 − 门洞), 128px 块 */
function wallsForRoomChunk(cx: number, cy: number, layout: RoomLayout): Wall[] {
  const c0x = cx * CHUNK_SIZE;
  const c0y = cy * CHUNK_SIZE;
  const seen = new Set<string>();
  const blocks: Array<[number, number]> = [];
  const add = (bx: number, by: number): void => {
    if (bx < 0 || by < 0) return;
    const k = `${bx},${by}`;
    if (seen.has(k)) return;
    seen.add(k);
    blocks.push([bx, by]);
  };
  for (const r of layout.rooms) {
    const bx0 = Math.floor(r.x / BLOCK), by0 = Math.floor(r.y / BLOCK);
    const bw = Math.floor(r.w / BLOCK), bh = Math.floor(r.h / BLOCK);
    for (let bx = bx0; bx < bx0 + bw; bx++) { add(bx, by0); add(bx, by0 + bh - 1); }
    for (let by = by0 + 1; by < by0 + bh - 1; by++) { add(bx0, by); add(bx0 + bw - 1, by); }
  }
  const out: Wall[] = [];
  for (const [bx, by] of blocks) {
    if (layout.doorBlocks.has(`${bx},${by}`)) continue;
    const x = bx * BLOCK, y = by * BLOCK;
    if (x >= c0x && x < c0x + CHUNK_SIZE && y >= c0y && y < c0y + CHUNK_SIZE) {
      out.push({ pos: { x, y }, size: { w: BLOCK, h: BLOCK } });
    }
  }
  // 两种墙 (2026-08-15): 房间边界墙 128×128 不变; 房间内随机障碍墙缩小到 1/3 格 (~43px),
  // 中心对齐块内 → 只当小掩体, 不占整格
  const OBS_SIZE = BLOCK / 3;
  for (const ob of layout.obstacleBlocks) {
    if (layout.doorBlocks.has(`${ob.x},${ob.y}`)) continue;
    const x = ob.x * BLOCK, y = ob.y * BLOCK;
    if (x + BLOCK <= c0x || x >= c0x + CHUNK_SIZE || y + BLOCK <= c0y || y >= c0y + CHUNK_SIZE) continue;
    const pad = (BLOCK - OBS_SIZE) / 2;
    out.push({ pos: { x: x + pad, y: y + pad }, size: { w: OBS_SIZE, h: OBS_SIZE } });
  }
  return out;
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
  // A-W6 房间化: 普通/肉鸽有活动布局 → 墙来自房间布局 (房间边界 + 障碍 − 门洞)
  if (mode === 'linear' || mode === 'rogue') {
    const layout = activeLayout;
    if (layout) return wallsForRoomChunk(cx, cy, layout);
  }
  const rand = mulberry32(cx * 73856093 ^ cy * 19349663 ^ 0xcafef00d);
  const G = CHUNK_BLOCKS; // 8
  const isWall: boolean[][] = [];
  for (let r = 0; r < G; r++) isWall.push(new Array<boolean>(G).fill(false));

  // === 密度梯度 (设计 §2.4): 距出生基准点越远墙越密 (近开远密) ===
  // 纯 (cx,cy,mode) 函数 → chunk 缓存确定性
  // A-W5: 肉鸽复用线性梯度 (左开右密, 主轴走廊 + 分支房间)
  {
    const d = chunkDist(mode, cx, cy);
    density = Math.min(0.3, density * (1 + d * 0.05)); // 每 chunk 距离 +5%, 封顶 0.3
  }

  // 墙格数 = density × 格数 / 5 (进一步降低墙量; 允许墙相邻形成连续墙块)
  const clusterTarget = Math.max(1, Math.round((density * G * G) / 5));

  let placed = 0;
  let guard = 0;
  while (placed < clusterTarget && guard++ < 200) {
    // 内区 1..6 撒点 (外圈保持开放, chunk 间可通行)
    const r = 1 + Math.floor(rand() * (G - 2));
    const c = 1 + Math.floor(rand() * (G - 2));
    if (isWall[r][c]) continue;
    isWall[r][c] = true;
    placed++;
    // 50% 扩展成连续墙块 (上下左右随机, 形成条状墙)
    if (placed < clusterTarget && rand() < 0.5) {
      const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      const [dr, dc] = dirs[Math.floor(rand() * dirs.length)];
      const r2 = r + dr, c2 = c + dc;
      if (r2 >= 1 && r2 < G - 1 && c2 >= 1 && c2 < G - 1 && !isWall[r2][c2]) {
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
  if (mode === 'linear' || mode === 'rogue') {
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

  // === A-W2 高级(gauntlet): 四角向中央辐射走廊 + 中央开放锚点 ===
  // 世界 20×12 chunks: 四角 chunk = (0,0)/(19,0)/(0,11)/(19,11)
  // 走廊从四角向中央延伸，沿途 chunk 保持通道开放
  if (mode === 'gauntlet') {
    const MAIN_ROW = 5;
    const MAIN_COL = 5;
    const maxCx = Math.floor(WORLD_W / CHUNK_SIZE) - 1; // 19
    const maxCy = Math.floor(WORLD_H / CHUNK_SIZE) - 1; // 11

    // 判断当前 chunk 是否在四条边走廊上
    const onLeftEdge   = cx === 0;
    const onRightEdge  = cx === maxCx;
    const onTopEdge    = cy === 0;
    const onBottomEdge = cy === maxCy;
    const onCorner     = (onLeftEdge || onRightEdge) && (onTopEdge || onBottomEdge);
    const onCenterChunk = cx === Math.floor(maxCx / 2) && cy === Math.floor(maxCy / 2);

    // 四角 chunk: 开放 × 形交叉作为锚点 (主通行行+列全开)
    if (onCorner) {
      for (let r = 0; r < G; r++) isWall[r][MAIN_COL] = false;
      for (let c = 0; c < G; c++) isWall[MAIN_ROW][c] = false;
    }
    // 沿边走廊 chunk (非四角): 开放主通行列或行
    else if (onLeftEdge || onRightEdge) {
      // 左侧/右侧走廊: 主通行列全开
      for (let r = 0; r < G; r++) isWall[r][MAIN_COL] = false;
    } else if (onTopEdge || onBottomEdge) {
      // 上下边走廊: 主通行行全开
      for (let c = 0; c < G; c++) isWall[MAIN_ROW][c] = false;
    }
    // 中央 chunk: 开放 3×3 中心区作为 Boss 场地
    if (onCenterChunk) {
      for (let r = 2; r <= 5; r++) for (let c = 2; c <= 5; c++) isWall[r][c] = false;
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

/** 遍历全图所有 chunk 的分支房间中心 (世界 px)
 *  用于营地分区域均匀锚点: 全图房间收集后再分区分配 */
export function linearBranchRoomsAll(): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  const maxCx = Math.floor(WORLD_W / CHUNK_SIZE) - 1;
  const maxCy = Math.floor(WORLD_H / CHUNK_SIZE) - 1;
  for (let cy = 0; cy <= maxCy; cy++) {
    for (let cx = 0; cx <= maxCx; cx++) {
      for (const room of linearBranchRooms(cx, cy)) {
        out.push({ x: room.x, y: room.y });
      }
    }
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

/** 按模式刷墙 (A-W2): 每局重置缓存 + 密度 + 房间布局; 由 startRun 调用 */
export function resetWorldForMode(mode: MapMode): void {
  const prevW = chunkCache.size;
  const prevD = decorCache.size;
  activeLayout = null; // A-W6: 房间布局随局重建
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
  ice:    { sprite: 'decor_ruin', count: 10, tint: [0.65, 0.85, 1.0] }, // HD 冰霜石 (青蓝 tint)
};

const decorCache = new Map<string, Decor[]>();
function decorKey(cx: number, cy: number, theme: Theme): string { return `${cx},${cy}:${theme}`; }

/** 生成单个 chunk 的装饰 (种子化, 与墙布局共享 RNG 种子系, 避开墙块)
 *  A-W6 房间化: 普通/肉鸽 → 只在与 chunk 相交的房间内部撒布, 房间外 (虚空) 无装饰 */
export function generateChunkDecor(cx: number, cy: number, theme: Theme, density: number = 0.18, mode: MapMode = 'linear'): Decor[] {
  const rand = mulberry32(cx * 73856093 ^ cy * 19349663 ^ 0xdec0de5);
  const cfg = THEME_DECOR[theme];
  const walls = getChunkWalls(cx, cy, density, mode);
  const out: Decor[] = [];
  const ox = cx * CHUNK_SIZE;
  const oy = cy * CHUNK_SIZE;
  // 装饰显示尺寸 (HD: 128px 1:1, 与墙块同规格; 旧 64px 是 Kenney 小图时代)
  const size = 128;
  const layout = (mode === 'linear' || mode === 'rogue') ? activeLayout : null;
  let guard = 0;
  if (layout) {
    const cx0 = ox, cy0 = oy, cx1 = ox + CHUNK_SIZE, cy1 = oy + CHUNK_SIZE;
    const rooms = layout.rooms.filter(r => r.x < cx1 && r.x + r.w > cx0 && r.y < cy1 && r.y + r.h > cy0);
    if (rooms.length === 0) return out;
    while (out.length < cfg.count && guard++ < 96) {
      const rr = rooms[Math.floor(rand() * rooms.length)];
      const x = rr.x + size / 2 + rand() * (rr.w - size);
      const y = rr.y + size / 2 + rand() * (rr.h - size);
      // 仅房间内部 (边界 1 格留给墙)
      if (x < rr.x + size || x > rr.x + rr.w - size || y < rr.y + size || y > rr.y + rr.h - size) continue;
      let blocked = false;
      for (const w of walls) {
        if (aabbOverlap(x, y, size, size, w.pos.x, w.pos.y, w.size.w, w.size.h)) { blocked = true; break; }
      }
      if (blocked) continue;
      if (out.some(d => aabbOverlap(x, y, size, size, d.pos.x, d.pos.y, size, size))) continue;
      out.push({ pos: { x, y }, sprite: cfg.sprite, tint: cfg.tint });
    }
    return out;
  }
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