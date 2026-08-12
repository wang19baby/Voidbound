// game/monsters/proj.ts — 怪物远程投射物 (US-030-b)
//
// 本次拆分: EnemyProjectile + spawnEnemyProjectile + getEnemyProj + updateEnemyProj
// 零循环依赖: 只依赖 types (Monster), world (aabbOverlap), vfx (spawnImpact / spawnPlayerHitFx),
//   difficulty (DIFFICULTY_MODS), defs (levelMonsterScale + 倍率)

import type { GameState } from '../state';
import type { Monster } from './types';
import { levelMonsterScale, ELITE_DMG_MULT, LORD_DMG_MULT, ENHANCED_DMG_MULT } from './defs';
import { DIFFICULTY_MODS } from '../difficulty';
import { aabbOverlap } from '../world';
import { spawnImpact, spawnPlayerHitFx } from '../vfx';

/** 怪物远程投射物 (类似玩家火球) */
export interface EnemyProjectile {
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  size: { w: number; h: number };
  dmg: number;
  life: number;
  fromId: number; // monster id
}

let nextProjId = 1;
export function spawnEnemyProjectile(state: GameState, m: Monster, dmg: number, angle = 0): void {
  const ext = state as GameState & { _enemyProj?: EnemyProjectile[] };
  ext._enemyProj = ext._enemyProj ?? [];
  const dx = state.player.pos.x - m.pos.x;
  const dy = state.player.pos.y - m.pos.y;
  const len = Math.hypot(dx, dy) || 1;
  // 基础方向 + 偏角 (二阶段双发错开)
  const base = Math.atan2(dy, dx) + angle;
  const speed = 180;
  ext._enemyProj.push({
    pos: { x: m.pos.x + m.size.w / 2 - 6, y: m.pos.y + m.size.h / 2 - 6 },
    vel: { x: Math.cos(base) * speed, y: Math.sin(base) * speed },
    size: { w: 12, h: 12 },
    dmg: Math.round(dmg * DIFFICULTY_MODS[state.difficulty].projMult * levelMonsterScale(state.player.level) * (m.elite ? ELITE_DMG_MULT : 1) * (m.lord ? LORD_DMG_MULT : 1) * (m.enhanced ? ENHANCED_DMG_MULT : 1)),
    life: 2.0,
    fromId: m.id,
  });
  nextProjId++;
}

export function getEnemyProj(state: GameState): readonly EnemyProjectile[] {
  const ext = state as GameState & { _enemyProj?: EnemyProjectile[] };
  return ext._enemyProj ?? [];
}

export function updateEnemyProj(state: GameState, dt: number): void {
  const ext = state as GameState & { _enemyProj?: EnemyProjectile[] };
  if (!ext._enemyProj) return;
  ext._enemyProj = ext._enemyProj.filter(p => {
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.life -= dt;
    if (p.life <= 0) return false;
    // 撞墙 → 火花消失 (地图审查 P1: 与玩家火球同规则, 墙 = 掩体)
    for (const w of state.world.walls) {
      if (aabbOverlap(p.pos.x, p.pos.y, p.size.w, p.size.h, w.pos.x, w.pos.y, w.size.w, w.size.h)) {
        spawnImpact(state, p.pos.x + p.size.w / 2, p.pos.y + p.size.h / 2, [1, 0.35, 0.35]);
        return false;
      }
    }
    // 撞玩家 → 扣血 + 消失 (翻滚无敌免疫)
    if (state.player.dodgeT <= 0 && (state.player.reviveInvuln ?? 0) <= 0 &&
        aabbOverlap(p.pos.x, p.pos.y, p.size.w, p.size.h,
                    state.player.pos.x, state.player.pos.y,
                    state.player.size.w, state.player.size.h)) {
      state.player.hp -= p.dmg;
      state.lastKiller = '弹幕';  // 死亡结算显示
      state.cameraShake = Math.min(10, (state.cameraShake ?? 0) + 3);  // OPT-026
      spawnPlayerHitFx(state);
      return false;
    }
    // 出界
    if (p.pos.x < 0 || p.pos.x > state.world.w || p.pos.y < 0 || p.pos.y > state.world.h) return false;
    return true;
  });
}