// 界面 toast (US-012): 拾取/事件反馈, HUD 顶部中央堆叠, 3.5s 淡出
// B.1.3: 池化 _toasts, MAX_TOASTS 上限保留

import type { GameState } from './state';
import { Pool } from '../core/pool';

export interface Toast {
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

const MAX_TOASTS = 4;
const TOAST_LIFE = 3.5;

const toastPool = new Pool<Toast>({
  factory: () => ({ text: '', color: '', life: 0, maxLife: 0 }),
  reset: (t) => { t.text = ''; t.color = ''; t.life = 0; t.maxLife = 0; },
  initial: 8,
});

export function pushToast(state: GameState, text: string, color: string): void {
  // 上限保留: 满了就淘汰最旧的 (FIFO)
  while (state.fx.toasts.length >= MAX_TOASTS) {
    const oldest = state.fx.toasts.shift();
    if (oldest) toastPool.release(oldest);
  }
  const t = toastPool.acquire();
  t.text = text;
  t.color = color;
  t.life = TOAST_LIFE;
  t.maxLife = TOAST_LIFE;
  state.fx.toasts.push(t);
}

export function getToasts(state: GameState): readonly Toast[] {
  return state.fx.toasts;
}

export function updateToasts(state: GameState, dt: number): void {
  const toRelease: Toast[] = [];
  for (const t of state.fx.toasts) {
    t.life -= dt;
    if (t.life <= 0) toRelease.push(t);
  }
  for (const t of toRelease) {
    const idx = state.fx.toasts.indexOf(t);
    if (idx >= 0) state.fx.toasts.splice(idx, 1);
    toastPool.release(t);
  }
}

/** 测试用: 重置池 */
export function _resetToastPool(): void {
  toastPool.clear();
}