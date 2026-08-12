// presentation/worldDraw/player.ts — 玩家 + 诅咒减速 (P1.8)

import type { DrawCtx } from './types';
import { worldToScreen, pickPlayerSprite } from '../../game/state';
import { drawSprite } from '../../render/draw';

/** 玩家立绘 + 诅咒减速紫雾 */
export function drawPlayer(ctx: DrawCtx, mouseScreenX: number): void {
  const { state, gl, quad, res } = ctx;
  const sprite = pickPlayerSprite(state, mouseScreenX);
  const bob = Math.sin(state.player.idleT * Math.PI * 1.2) * 1;
  const playerScreen = worldToScreen(state, state.player.pos);
  drawSprite(
    gl, quad, res,
    { x: playerScreen.x, y: playerScreen.y + bob },
    state.player.size,
    'characters', sprite.name,
    { flip: { x: sprite.flipX ? -1 : 1, y: 1 }, rot: sprite.rot },
  );
  // 诅咒减速标记 (UX_REVIEW P2): 玩家紫雾环绕 (curseT > 0)
  if ((state.player.curseT ?? 0) > 0) {
    const ct = performance.now() / 1000;
    const cR = 30 + Math.sin(ct * 6) * 4;
    drawSprite(gl, quad, res, { x: playerScreen.x + state.player.size.w / 2 - cR, y: playerScreen.y + state.player.size.h / 2 - cR }, { w: cR * 2, h: cR * 2 }, 'particles', 'circle_02', { color: [0.75, 0.45, 1], blend: 'add' });
  }
}