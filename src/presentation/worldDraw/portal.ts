// presentation/worldDraw/portal.ts — 传送门 + 毒池 (P1.3)

import type { DrawCtx } from './types';
import { worldToScreen } from '../../game/state';
import { nearPortal } from '../../game/portal';
import { drawSprite } from '../../render/draw';

/** A-W1 门结算 + A-W3 毒池: Boss 死亡位传送门 + death_trigger 毒圈 */
export function drawPortalAndPools(ctx: DrawCtx): void {
  const { state, gl, quad, res } = ctx;
  const vw = state.viewport.w;
  const vh = state.viewport.h;

  // A-W1/A-W4 门结算: 所有 Boss 死亡位传送门 (挑战模式多门并存)
  for (const pp of state.run.portals) {
    if (pp.used) continue;
    const sp = worldToScreen(state, { x: pp.x, y: pp.y });
    if (sp.x > -80 && sp.x < vw + 80 && sp.y > -80 && sp.y < vh + 80) {
      const pulse = 0.5 + Math.sin(performance.now() / 250) * 0.15;
      const near = nearPortal(state);
      const ringCol: [number, number, number] = near ? [1, 0.75, 0.4] : [0.5, 0.9, 1];
      // 门体: 紫色旋涡
      drawSprite(gl, quad, res, { x: sp.x - 30, y: sp.y - 30 }, { w: 60, h: 60 }, 'particles', 'spark_03', { color: [0.75, 0.4, 1], blend: 'add' });
      // 交互光环
      drawSprite(gl, quad, res, { x: sp.x - 42 * pulse, y: sp.y - 42 * pulse }, { w: 84 * pulse, h: 84 * pulse }, 'ui', 'slide_horizontal_color', { color: ringCol });
      drawSprite(gl, quad, res, { x: sp.x - 3, y: sp.y - 46 }, { w: 6, h: 6 }, 'ui', 'slide_horizontal_color', { color: [1, 1, 1] });
    }
  }

  // A-W3 毒池 (death_trigger): 半透明毒圈, 站内 DOT
  const pools = state.fx.pools;
  for (const pk of pools) {
    const sp = worldToScreen(state, { x: pk.x, y: pk.y });
    if (sp.x > -pk.r && sp.x < vw + pk.r && sp.y > -pk.r && sp.y < vh + pk.r) {
      // 毒池脉冲 (UX_REVIEW P2): 呼吸缩放
      const pPulse = 0.85 + 0.15 * Math.sin((performance.now() / 1000) * 4 + pk.x);
      const pr = pk.r * pPulse;
      drawSprite(gl, quad, res, { x: sp.x + (pk.r - pr) / 2, y: sp.y + (pk.r - pr) / 2 }, { w: pr, h: pr }, 'particles', 'spark_03', { color: [0.2, 0.9, 0.3], blend: 'add' });
    }
  }
}