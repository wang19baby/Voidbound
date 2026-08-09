// GameState: 世界坐标 + 摄像机跟随 + 程序化墙
// 玩家 pos 为世界坐标; camera = player - viewportCenter; 渲染时 worldPos - camera

import type { RenderResources } from '../render/resources';
import { WORLD_W, WORLD_H } from './world';
import type { Monster } from './monster';
import type { CombatStats } from './combat';

export interface Camera {
  x: number;
  y: number;
}

export interface Player {
  pos: { x: number; y: number };
  size: { w: number; h: number };
  speed: number;
  hp: number;
  mp: number;
  level: number;
  /** 旧字段保留 (M1 兼容性), 但 sprite 不再用它; 技能用鼠标方向 */
  facing: { x: number; y: number };
  idleT: number;
  /** 角色水平朝向: 'L' (含 A 键) / 'R' (含 D 键) / 'N' (无, 保持默认 south) */
  flipDir: 'L' | 'R' | 'N';
  /** D-04 战斗属性 (基础 + 装备聚合, US-002 后由 recomputeCombat 生成) */
  combat: CombatStats;
}

export interface Fireball {
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  size: { w: number; h: number };
  life: number;
}

export interface GameState {
  player: Player;
  viewport: { w: number; h: number };
  world: {
    w: number; h: number;
    /** 玩家附近 chunks 的所有墙 (由 world.ts.getActiveWalls 动态加载) */
    walls: WallLike[];
    floorPos: { x: number; y: number };
    floorSize: { w: number; h: number };
  };
  camera: Camera;
  fireballs: Fireball[];
  fireballSize: number;
  monsters: Monster[];
  score: number;
  paused: boolean;
  dying: boolean;
  deathTimer: number;
  theme: 'forest' | 'desert' | 'ruin' | 'void';
  resources: RenderResources;
}

export const THEMES = ['forest', 'desert', 'ruin', 'void'] as const;
export type Theme = (typeof THEMES)[number];

/** 重置 player 状态到世界中心 */
export function resetPlayer(state: GameState): void {
  state.player.pos = { x: WORLD_W / 2 - 32, y: WORLD_H / 2 - 32 };
  state.player.hp = 100;
  state.player.mp = 100;
  state.player.idleT = 0;
  state.player.flipDir = 'N';
}

import type { Wall as WallLike } from './world';

export function updateCamera(state: GameState): void {
  state.camera.x = state.player.pos.x - state.viewport.w / 2;
  state.camera.y = state.player.pos.y - state.viewport.h / 2;
}

export function worldToScreen(state: GameState, worldPos: { x: number; y: number }): { x: number; y: number } {
  return { x: worldPos.x - state.camera.x, y: worldPos.y - state.camera.y };
}

export function updateFireballs(state: GameState, dt: number): void {
  const next: Fireball[] = [];
  let wallHits = 0;
  for (const f of state.fireballs) {
    f.pos.x += f.vel.x * dt;
    f.pos.y += f.vel.y * dt;
    f.life -= dt;
    if (f.life <= 0) continue;
    if (f.pos.x < 0 || f.pos.x + f.size.w > state.world.w) continue;
    if (f.pos.y < 0 || f.pos.y + f.size.h > state.world.h) continue;
    // 墙碰撞
    let blocked = false;
    for (const w of state.world.walls) {
      if (f.pos.x < w.pos.x + w.size.w && f.pos.x + f.size.w > w.pos.x &&
          f.pos.y < w.pos.y + w.size.h && f.pos.y + f.size.h > w.pos.y) {
        blocked = true;
        break;
      }
    }
    if (blocked) { wallHits++; continue; }
    next.push(f);
  }
  if (wallHits > 0) {
    void import('../util/log').then(({ inf }) => inf('combat', `fireball hit ${wallHits} wall(s)`));
  }
  if (state.fireballs.length !== next.length) {
    void import('../util/log').then(({ inf }) => inf('skill', `fireballs remaining: ${next.length}`));
  }
  state.fireballs = next;
}

export function spawnFireball(state: GameState, dir: { x: number; y: number }): void {
  let dx = dir.x;
  let dy = dir.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) { dx = 1; dy = 0; }
  else { dx /= len; dy /= len; }
  const speed = 320;
  const cx = state.player.pos.x + state.player.size.w / 2;
  const cy = state.player.pos.y + state.player.size.h / 2;
  state.fireballs.push({
    pos: {
      x: cx + dx * (state.player.size.w / 2) - state.fireballSize / 2,
      y: cy + dy * (state.player.size.h / 2) - state.fireballSize / 2,
    },
    vel: { x: dx * speed, y: dy * speed },
    size: { w: state.fireballSize, h: state.fireballSize },
    life: 1.5,
  });
  void import('../util/log').then(({ dbg }) => dbg('skill', `spawn fireball dir=(${dx.toFixed(2)},${dy.toFixed(2)})`));
}

export interface PlayerSprite {
  name: string;
  flipX: boolean;
  rot: number;
}

/** sprite 水平朝向决策:
 *  1. 鼠标水平位置 (主) → 右侧 = R, 左侧 = L, 中心 = 用 A/D 决定
 *  2. A/D 键 (兜底) → D 优先 → R, A → L, 都没有 → N (south)
 */
export function pickPlayerSprite(state: GameState, mouseScreenX: number): PlayerSprite {
  const vpCx = state.viewport.w / 2;
  const dx = mouseScreenX - vpCx;
  // 鼠标明显在右边 → R, 明显在左边 → L, 中心 ±8px → 用键盘
  if (dx > 8) return { name: 'sorceress_stand', flipX: false, rot: 0 };
  if (dx < -8) return { name: 'sorceress_stand', flipX: true, rot: 0 };
  const flip = state.player.flipDir;
  return { name: 'sorceress_stand', flipX: flip === 'L', rot: 0 };
}

// re-export
export { WORLD_W, WORLD_H };