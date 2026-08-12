// 死亡粒子爆裂: monster 死亡时 spawn 6-8 个粒子, 1s 飞散消失
// B.1.4: 池化 _deathFx

import type { GameState } from '../state';
import { Pool } from '../../core/pool';

export interface DeathFx {
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  size: { w: number; h: number };
  life: number;     // 剩余秒数
  maxLife: number;  // 用于 fade out
  rot: number;      // 旋转 (弧度)
  rotV: number;     // 角速度
}

const deathFxPool = new Pool<DeathFx>({
  factory: () => ({
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    size: { w: 0, h: 0 },
    life: 0,
    maxLife: 0,
    rot: 0,
    rotV: 0,
  }),
  reset: (p) => {
    p.pos.x = 0; p.pos.y = 0;
    p.vel.x = 0; p.vel.y = 0;
    p.size.w = 0; p.size.h = 0;
    p.life = 0; p.maxLife = 0;
    p.rot = 0; p.rotV = 0;
  },
  initial: 64,
});

export function spawnDeathFx(state: GameState, x: number, y: number, count = 7): void {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 80;
    const p = deathFxPool.acquire();
    p.pos.x = x;
    p.pos.y = y;
    p.vel.x = Math.cos(a) * speed;
    p.vel.y = Math.sin(a) * speed;
    p.size.w = 8; p.size.h = 8;
    p.life = 0.8 + Math.random() * 0.3;
    p.maxLife = 1.0;
    p.rot = Math.random() * Math.PI * 2;
    p.rotV = (Math.random() - 0.5) * 8;
    state._deathFx.push(p);
  }
}

export function updateDeathFx(state: GameState, dt: number): void {
  const toRelease: DeathFx[] = [];
  for (const p of state._deathFx) {
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.vel.x *= 0.92;  // 阻力
    p.vel.y *= 0.92;
    p.rot += p.rotV * dt;
    p.life -= dt;
    if (p.life <= 0) toRelease.push(p);
  }
  for (const p of toRelease) {
    const idx = state._deathFx.indexOf(p);
    if (idx >= 0) state._deathFx.splice(idx, 1);
    deathFxPool.release(p);
  }
}

export function getDeathFx(state: GameState): readonly DeathFx[] {
  return state._deathFx;
}

/** 测试用: 重置池 */
export function _resetDeathFxPool(): void {
  deathFxPool.clear();
}