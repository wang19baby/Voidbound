// HUD overlay: 升级全屏金光 (US-019)

import type { GameState } from '../../../game/state';

// 升级全屏金光 (US-019)
export function drawLevelUpFlash(ctx2d: CanvasRenderingContext2D, state: GameState, vw: number, vh: number): void {
  if (state.combat.levelUpFlash <= 0) return;
  const a = Math.min(1, state.combat.levelUpFlash / 0.3);
  ctx2d.globalAlpha = a * 0.30;
  ctx2d.fillStyle = '#ffd700';
  ctx2d.fillRect(0, 0, vw, vh);
  ctx2d.globalAlpha = a;
  ctx2d.fillStyle = '#fff';
  ctx2d.font = 'bold 56px monospace';
  ctx2d.textAlign = 'center';
  ctx2d.fillText(`LEVEL UP → ${state.player.level}`, vw / 2, vh / 2 - 40);
  ctx2d.globalAlpha = 1;
  ctx2d.font = '12px monospace';
  ctx2d.textAlign = 'left';
}
