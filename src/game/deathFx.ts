// 死亡粒子爆裂: monster 死亡时 spawn 6-8 个粒子, 1s 飞散消失

import type { GameState } from './state';

export interface DeathFx {
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  size: { w: number; h: number };
  life: number;     // 剩余秒数
  maxLife: number;  // 用于 fade out
  rot: number;      // 旋转 (弧度)
  rotV: number;     // 角速度
}

export function spawnDeathFx(state: GameState, x: number, y: number, count = 7): void {
  const ext = state as GameState & { _deathFx?: DeathFx[] };
  ext._deathFx = ext._deathFx ?? [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 80;
    ext._deathFx.push({
      pos: { x, y },
      vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed },
      size: { w: 8, h: 8 },
      life: 0.8 + Math.random() * 0.3,
      maxLife: 1.0,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 8,
    });
  }
}

export function updateDeathFx(state: GameState, dt: number): void {
  const ext = state as GameState & { _deathFx?: DeathFx[] };
  if (!ext._deathFx) return;
  ext._deathFx = ext._deathFx.filter(p => {
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.vel.x *= 0.92;  // 阻力
    p.vel.y *= 0.92;
    p.rot += p.rotV * dt;
    p.life -= dt;
    return p.life > 0;
  });
}

export function getDeathFx(state: GameState): readonly DeathFx[] {
  const ext = state as GameState & { _deathFx?: DeathFx[] };
  return ext._deathFx ?? [];
}