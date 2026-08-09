// 伤害数字: 漂浮文字 (player pos 或 monster pos) 上浮 0.5s + 淡出

import type { GameState } from './state';

export interface DamageNum {
  pos: { x: number; y: number };  // 世界坐标
  vy: number;                      // 上浮速度 (px/s)
  life: number;                    // 剩余秒数
  maxLife: number;
  text: string;
  color: string;                   // CSS color
}

let nextDmgId = 1;

export function spawnDamageNum(state: GameState, x: number, y: number, text: string, color = '#ff4444'): void {
  const ext = state as GameState & { _dmgNums?: DamageNum[] };
  ext._dmgNums = ext._dmgNums ?? [];
  ext._dmgNums.push({
    pos: { x, y },
    vy: -40,  // 上浮
    life: 0.7,
    maxLife: 0.7,
    text,
    color,
  });
  nextDmgId++;
}

export function getDamageNums(state: GameState): readonly DamageNum[] {
  const ext = state as GameState & { _dmgNums?: DamageNum[] };
  return ext._dmgNums ?? [];
}

export function updateDamageNums(state: GameState, dt: number): void {
  const ext = state as GameState & { _dmgNums?: DamageNum[] };
  if (!ext._dmgNums) return;
  ext._dmgNums = ext._dmgNums.filter(d => {
    d.pos.y += d.vy * dt;
    d.life -= dt;
    return d.life > 0;
  });
}