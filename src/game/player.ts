// 玩家 update: vel = direction * speed, clamp 到世界边界 + AABB 墙滑移

import type { GameState } from './state';
import { aabbOverlap, findPlayerWallHit } from './world';
import { dbg } from '../util/log';
import { isHardcore } from './difficulty';

export const MAX_HP = 100;
export const MAX_MP = 100;
export const POTION_HP_HEAL = 30;
export const POTION_MP_HEAL = 80;
export const POTION_CD = 2.0;
export const DODGE_DURATION = 0.2;
export const DODGE_CD = 1.2;
export const DODGE_SPEED_MULT = 1.6;
export const EXP_PER_LEVEL_ATTR = 5;

/** 经验曲线 (D-05): EXP_to_next = 100 × Lv^1.5 向下取整 */
export function expNext(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5));
}

/** 击杀加经验; 升级 → +5 技能点 +5 attr +满血; 返回升了几级 */
export function gainExp(state: GameState, amount: number): number {
  const p = state.player;
  p.exp = (p.exp ?? 0) + amount;
  let ups = 0;
  while (p.exp >= expNext(p.level)) {
    p.exp -= expNext(p.level);
    p.level++;
    p.skillPoints += 5;
    p.combat.attr += EXP_PER_LEVEL_ATTR;
    p.hp = MAX_HP;
    ups++;
  }
  return ups;
}

/** 喝药 (F-CBT-002): stat='hp'|'mp'; 返回成功. 硬核 (D-09) 禁用药水 */
export function usePotion(state: GameState, stat: 'hp' | 'mp'): boolean {
  const p = state.player;
  if (isHardcore(state.difficulty)) return false;
  if (p.potionCd > 0) return false;
  if (p.potions[stat] <= 0) return false;
  p.potions[stat]--;
  if (stat === 'hp') p.hp = Math.min(MAX_HP, p.hp + POTION_HP_HEAL);
  else p.mp = Math.min(MAX_MP, p.mp + POTION_MP_HEAL);
  return true;
}

/** 翻滚 (Space): 进入无敌窗口 + 位移加速 */
export function startDodge(state: GameState): boolean {
  const p = state.player;
  if (p.dodgeCd > 0) return false;
  p.dodgeCd = DODGE_CD;
  p.dodgeT = DODGE_DURATION;
  return true;
}

export function updatePlayer(
  state: GameState,
  dir: { x: number; y: number },
  dt: number,
): void {
  const p = state.player;
  const spd = p.speed * (p.dodgeT > 0 ? DODGE_SPEED_MULT : 1);
  const nx = p.pos.x + dir.x * spd * dt;
  const ny = p.pos.y + dir.y * spd * dt;
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