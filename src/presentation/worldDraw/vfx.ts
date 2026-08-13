// presentation/worldDraw/vfx.ts — VFX 绘制 (P1.6)
//
// UX_REVIEW §8.3: 扩散环/爆裂/闪电链/辉光 — additive, tint×fade 淡出

import type { DrawCtx } from './types';
import { worldToScreen } from '../../game/state';
import { getVfx } from '../../game/fx/vfx';
import { drawSprite } from '../../render/draw';

/** VFX 4 种 kind (ring/glow/burst/bolt) 渲染 */
export function drawVfx(ctx: DrawCtx): void {
  const { state, gl, quad, res } = ctx;
  for (const v of getVfx(state)) {
    const f = Math.min(1, v.t / v.dur);
    const fade = 1 - f;
    const col: [number, number, number] = [v.color[0] * fade, v.color[1] * fade, v.color[2] * fade];
    const sp = worldToScreen(state, { x: v.x, y: v.y });
    if (v.kind === 'ring') {
      const r = v.r0 + (v.r1 - v.r0) * (1 - (1 - f) * (1 - f));
      drawSprite(gl, quad, res, { x: sp.x - r, y: sp.y - r }, { w: r * 2, h: r * 2 }, 'particles', v.sprite, { color: col, blend: 'add', rot: v.rot0 + (v.rot1 - v.rot0) * f });
    } else if (v.kind === 'glow') {
      const r = v.r0 + (v.r1 - v.r0) * f;
      drawSprite(gl, quad, res, { x: sp.x - r, y: sp.y - r }, { w: r * 2, h: r * 2 }, 'particles', v.sprite, { color: col, blend: 'add' });
    } else if (v.kind === 'burst') {
      for (const d of v.dirs ?? []) {
        const px = sp.x + d.x * v.t;
        const py = sp.y + d.y * v.t;
        const s = (v.size ?? 7) * (1 - f * 0.7);
        drawSprite(gl, quad, res, { x: px - s / 2, y: py - s / 2 }, { w: s, h: s }, 'particles', v.sprite, { color: col, blend: 'add' });
      }
    } else if (v.kind === 'bolt') {
      const p0 = worldToScreen(state, { x: v.x, y: v.y });
      const p1 = worldToScreen(state, { x: v.tx ?? v.x, y: v.ty ?? v.y });
      const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      if (len < 2) continue;
      const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
      const mx = (p0.x + p1.x) / 2;
      const my = (p0.y + p1.y) / 2;
      drawSprite(gl, quad, res, { x: mx - len / 2, y: my - (v.thickness ?? 5) / 2 }, { w: len, h: v.thickness ?? 5 }, 'particles', 'light_01', { color: col, blend: 'add', rot: ang });
    }
  }
}