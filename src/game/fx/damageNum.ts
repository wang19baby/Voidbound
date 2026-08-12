// 伤害数字: 漂浮文字 (player pos 或 monster pos) 上浮 0.5s + 淡出
// B.1.2: 用 Pool<DamageNum> 零 GC 容器替换直接数组
// 约定: state.fx.dmgNums 是渲染层消费的数组; pool 是回收站
// spawn: pool.acquire() → push 进 state.fx.dmgNums
// update: 标记过期 → splice 出 state.fx.dmgNums → pool.release()

import type { GameState } from '../state';
import { Pool } from '../../core/pool';

export interface DamageNum {
  pos: { x: number; y: number };  // 世界坐标
  vy: number;                      // 上浮速度 (px/s)
  life: number;                    // 剩余秒数
  maxLife: number;
  text: string;
  color: string;                   // CSS color
}

const dmgNumPool = new Pool<DamageNum>({
  factory: () => ({
    pos: { x: 0, y: 0 },
    vy: 0,
    life: 0,
    maxLife: 0,
    text: '',
    color: '',
  }),
  reset: (d) => {
    d.pos.x = 0; d.pos.y = 0;
    d.vy = 0; d.life = 0; d.maxLife = 0;
    d.text = ''; d.color = '';
  },
  initial: 32,
});

export function spawnDamageNum(state: GameState, x: number, y: number, text: string, color = '#ff4444'): void {
  const d = dmgNumPool.acquire();
  d.pos.x = x;
  d.pos.y = y;
  d.vy = -40;
  d.life = 0.7;
  d.maxLife = 0.7;
  d.text = text;
  d.color = color;
  state.fx.dmgNums.push(d);
}

export function getDamageNums(state: GameState): readonly DamageNum[] {
  return state.fx.dmgNums;
}

export function updateDamageNums(state: GameState, dt: number): void {
  // 收集 + 标记过期; 然后批量 splice + release
  // 两遍循环避免 for-of 迭代中 mutate 数组 (JS for-of 用 length 缓存会跳元素)
  const toRelease: DamageNum[] = [];
  for (const d of state.fx.dmgNums) {
    d.pos.y += d.vy * dt;
    d.life -= dt;
    if (d.life <= 0) toRelease.push(d);
  }
  for (const d of toRelease) {
    const idx = state.fx.dmgNums.indexOf(d);
    if (idx >= 0) state.fx.dmgNums.splice(idx, 1);
    dmgNumPool.release(d);
  }
}

/** 测试用: 重置池 (单测隔离) */
export function _resetDmgNumPool(): void {
  dmgNumPool.clear();
  // 同步 state 数组: 测试隔离 (避免上轮残留)
  // 实际生产代码不会调; 调用方应提供干净 state
}