// game/character/commands.ts — 玩家命令 (PR #3 / T5-a, 2026-08-13)
// 从 src/game/player.ts 整块抽出: usePotion / startDodge / gainExp / expNext / updatePlayer / castFireball
// 函数体零变更; 仅相对 import 路径从 './xxx' 修正为 '../xxx' (character/ 与 xxx/ 同级)。

import type { GameState } from '../state';
import { findPlayerWallHit } from '../world';
import { dbg } from '../../util/log';
import { isHardcore } from '../difficulty';
import { pushToast } from '../toast';
import { playSfxClient } from '../../ipc/sfx';
import { classAttrWeight } from '../class';
import { CURSE_SLOW_MULT, FREEZE_SLOW_MULT } from '../mech';
import { spawnGlow, spawnBurst } from '../fx/vfx';
import { MAX_HP, MAX_MP, POTION_HP_HEAL, POTION_MP_HEAL, DODGE_DURATION, DODGE_CD, DODGE_SPEED_MULT, EXP_PER_LEVEL_ATTR } from './base';

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
    p.combat.attr += Math.round(EXP_PER_LEVEL_ATTR * classAttrWeight(p.classId));  // C-105 按职业权重
    p.hp = MAX_HP;
    ups++;
  }
  if (ups > 0) {
    state.combat.levelUpFlash = 0.5;
    pushToast(state, `升级到 Lv ${p.level}`, '#ffd64a');
    playSfxClient('levelup');  // OPT-025
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
  // VFX (UX_REVIEW P3): 喝药闪光 (红/蓝按药水)
  const px = p.pos.x + (p.size?.w ?? 0) / 2;
  const py = p.pos.y + (p.size?.h ?? 0) / 2;
  const col: [number, number, number] = stat === 'hp' ? [1, 0.4, 0.35] : [0.4, 0.6, 1];
  spawnGlow(state, px, py, col, 0.6, 44);
  spawnBurst(state, px, py, 5, col, 'spark_03', 60, 6, 0.6);
  return true;
}

/** 翻滚 (Space): 进入无敌窗口 + 位移加速 */
export function startDodge(state: GameState): boolean {
  const p = state.player;
  if (p.dodgeCd > 0) return false;
  p.dodgeCd = DODGE_CD;
  p.dodgeT = DODGE_DURATION;
  // A-W3 诅咒: 翻滚清除 (反制点 = 用无敌帧解 debuff)
  p.curseT = 0;
  // VFX (UX_REVIEW P3): 翻滚起跳尘雾
  spawnBurst(state, p.pos.x + (p.size?.w ?? 0) / 2, p.pos.y + (p.size?.h ?? 0) / 2, 6, [0.85, 0.9, 1], 'spark_03', 80, 5, 0.3);
  return true;
}

export function updatePlayer(
  state: GameState,
  dir: { x: number; y: number },
  dt: number,
): void {
  const p = state.player;
  const spd = p.speed * (p.speedMult ?? 1) * (p.dodgeT > 0 ? DODGE_SPEED_MULT : 1) * (p.curseT > 0 ? CURSE_SLOW_MULT : 1) * (p.freezeT > 0 ? FREEZE_SLOW_MULT : 1);
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