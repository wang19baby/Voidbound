// 界面 toast (US-012): 拾取/事件反馈, HUD 顶部中央堆叠, 3.5s 淡出

import type { GameState } from './state';

export interface Toast {
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

const MAX_TOASTS = 4;
const TOAST_LIFE = 3.5;

export function pushToast(state: GameState, text: string, color: string): void {
  const ext = state as GameState & { _toasts?: Toast[] };
  ext._toasts = ext._toasts ?? [];
  ext._toasts.push({ text, color, life: TOAST_LIFE, maxLife: TOAST_LIFE });
  if (ext._toasts.length > MAX_TOASTS) ext._toasts.shift();
}

export function getToasts(state: GameState): readonly Toast[] {
  const ext = state as GameState & { _toasts?: Toast[] };
  return ext._toasts ?? [];
}

export function updateToasts(state: GameState, dt: number): void {
  const ext = state as GameState & { _toasts?: Toast[] };
  if (!ext._toasts) return;
  ext._toasts = ext._toasts.filter(t => { t.life -= dt; return t.life > 0; });
}