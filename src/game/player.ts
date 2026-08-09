// 玩家 update: vel = direction * speed, clamp 到世界边界 + AABB 墙滑移

import type { GameState } from './state';
import { aabbOverlap, findPlayerWallHit } from './world';
import { dbg } from '../util/log';

export const MAX_HP = 100;
export const MAX_MP = 100;

export function updatePlayer(
  state: GameState,
  dir: { x: number; y: number },
  dt: number,
): void {
  const p = state.player;
  const nx = p.pos.x + dir.x * p.speed * dt;
  const ny = p.pos.y + dir.y * p.speed * dt;
  const maxX = Math.max(0, state.world.w - p.size.w);
  const maxY = Math.max(0, state.world.h - p.size.h);
  p.pos.x = Math.max(0, Math.min(maxX, nx));
  p.pos.y = Math.max(0, Math.min(maxY, ny));

  // 滑移 (用 state.world.walls 当前缓存)
  let hit = findPlayerWallHit(state, state.world.walls);
  let iter = 0;
  while (hit && iter++ < 4) {
    const px = p.pos.x, py = p.pos.y, pw = p.size.w, ph = p.size.h;
    const wx = hit.pos.x, wy = hit.pos.y, ww = hit.size.w, wh = hit.size.h;
    const overlapL = (px + pw) - wx;
    const overlapR = (wx + ww) - px;
    const overlapT = (py + ph) - wy;
    const overlapB = (wy + wh) - py;
    const minOverlap = Math.min(overlapL, overlapR, overlapT, overlapB);
    if (minOverlap === overlapL) p.pos.x = wx - pw;
    else if (minOverlap === overlapR) p.pos.x = wx + ww;
    else if (minOverlap === overlapT) p.pos.y = wy - ph;
    else p.pos.y = wy + wh;
    dbg('world', `wall hit @ (${wx.toFixed(0)},${wy.toFixed(0)}) axis=${minOverlap === overlapL || minOverlap === overlapR ? 'x' : 'y'}`);
    hit = findPlayerWallHit(state, state.world.walls);
  }
}

export function castFireball(state: GameState): boolean {
  if (state.player.mp < 10) return false;
  state.player.mp -= 10;
  return true;
}

export { aabbOverlap, findPlayerWallHit };