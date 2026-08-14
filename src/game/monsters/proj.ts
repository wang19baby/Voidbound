// game/monsters/proj.ts — 怪物远程投射物 (US-030-b)
//
// 本次拆分: EnemyProjectile + spawnEnemyProjectile + getEnemyProj + updateEnemyProj
// 零循环依赖: 只依赖 types (Monster), world (aabbOverlap), vfx (spawnImpact / spawnPlayerHitFx),
//   difficulty (DIFFICULTY_MODS), defs (levelMonsterScale + 倍率)
//
// B.1.5: 池化 _enemyProj

import type { GameState } from '../state';
import type { Monster } from './types';
import { levelMonsterScale, ELITE_DMG_MULT, LORD_DMG_MULT, ENHANCED_DMG_MULT } from './defs';
import { DIFFICULTY_MODS } from '../difficulty';
import { aabbOverlap } from '../world';
import { spawnImpact, spawnPlayerHitFx } from '../fx/vfx';
import { Pool } from '../../core/pool';

/** 怪物远程投射物 (类似玩家火球) */
export interface EnemyProjectile {
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  size: { w: number; h: number };
  dmg: number;
  dmgType: 'physical' | 'fire' | 'ice' | 'poison' | 'shadow';
  life: number;
  fromId: number; // monster id
}

let nextProjId = 1;
const enemyProjPool = new Pool<EnemyProjectile>({
  factory: () => ({
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    size: { w: 0, h: 0 },
    dmg: 0,
    dmgType: 'physical' as const,
    life: 0,
    fromId: 0,
  }),
  reset: (p) => {
    p.pos.x = 0; p.pos.y = 0;
    p.vel.x = 0; p.vel.y = 0;
    p.size.w = 0; p.size.h = 0;
    p.dmg = 0; p.life = 0; p.fromId = 0;
    p.dmgType = 'physical';
  },
  initial: 32,
});

export function spawnEnemyProjectile(state: GameState, m: Monster, dmg: number, angle = 0, dmgType: EnemyProjectile['dmgType'] = 'physical'): void {
  const dx = state.player.pos.x - m.pos.x;
  const dy = state.player.pos.y - m.pos.y;
  const len = Math.hypot(dx, dy) || 1;
  // 基础方向 + 偏角 (二阶段双发错开)
  const base = Math.atan2(dy, dx) + angle;
  const speed = 180;
  const p = enemyProjPool.acquire();
  p.pos.x = m.pos.x + m.size.w / 2 - 6;
  p.pos.y = m.pos.y + m.size.h / 2 - 6;
  p.vel.x = Math.cos(base) * speed;
  p.vel.y = Math.sin(base) * speed;
  p.size.w = 12;
  p.size.h = 12;
  p.dmg = Math.round(dmg * DIFFICULTY_MODS[state.difficulty].projMult * levelMonsterScale(state.player.level) * (m.elite ? ELITE_DMG_MULT : 1) * (m.lord ? ELITE_DMG_MULT * LORD_DMG_MULT : 1) * (m.enhanced ? ENHANCED_DMG_MULT : 1));
  p.dmgType = dmgType;
  p.life = 2.0;
  p.fromId = m.id;
  state.fx.enemyProj.push(p);
  nextProjId++;
}

export function getEnemyProj(state: GameState): readonly EnemyProjectile[] {
  return state.fx.enemyProj;
}

export function updateEnemyProj(state: GameState, dt: number): void {
  // 两遍循环: 第一遍标记过期/命中, 第二遍批量 splice + release
  const toRelease: EnemyProjectile[] = [];
  const impactPos: Array<{ x: number; y: number; color: [number, number, number] }> = [];
  for (const p of state.fx.enemyProj) {
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.life -= dt;
    let release = false;
    let impactColor: [number, number, number] | null = null;
    if (p.life <= 0) release = true;
    else {
      // 撞墙 → 火花消失 (地图审查 P1: 与玩家火球同规则, 墙 = 掩体)
      let hitWall = false;
      for (const w of state.world.walls) {
        if (aabbOverlap(p.pos.x, p.pos.y, p.size.w, p.size.h, w.pos.x, w.pos.y, w.size.w, w.size.h)) {
          hitWall = true;
          impactColor = [1, 0.35, 0.35];
          break;
        }
      }
      if (hitWall) { release = true; }
      else if (state.player.dodgeT <= 0 && (state.player.reviveInvuln ?? 0) <= 0 &&
        aabbOverlap(p.pos.x, p.pos.y, p.size.w, p.size.h,
                    state.player.pos.x, state.player.pos.y,
                    state.player.size.w, state.player.size.h)) {
        // 撞玩家 → 扣血 + 消失
        state.player.hp -= p.dmg;
        state.combat.lastKiller = '弹幕';  // 死亡结算显示
        state.combat.cameraShake = Math.min(10, (state.combat.cameraShake ?? 0) + 3);  // OPT-026
        spawnPlayerHitFx(state);
        release = true;
      } else if (p.pos.x < 0 || p.pos.x > state.world.w || p.pos.y < 0 || p.pos.y > state.world.h) {
        release = true;  // 出界
      }
    }
    if (release) {
      toRelease.push(p);
      if (impactColor) impactPos.push({ x: p.pos.x + p.size.w / 2, y: p.pos.y + p.size.h / 2, color: impactColor });
    }
  }
  // 第二遍: 批量释放 (含撞墙粒子)
  for (const pos of impactPos) {
    spawnImpact(state, pos.x, pos.y, pos.color);
  }
  for (const p of toRelease) {
    const idx = state.fx.enemyProj.indexOf(p);
    if (idx >= 0) state.fx.enemyProj.splice(idx, 1);
    enemyProjPool.release(p);
  }
}

/** 测试用: 重置池 */
export function _resetEnemyProjPool(): void {
  enemyProjPool.clear();
}