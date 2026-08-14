// presentation/worldDraw/floor.ts — 地板 / 墙 / 装饰 (P1.2)

import type { DrawCtx } from './types';
import { WORLD_W, WORLD_H, worldToScreen } from '../../game/state';
import { ELEMENT_DEFS } from '../../game/element';
import { drawSprite } from '../../render/draw';

/** 地板 + 墙 + 装饰 静态背景层 */
export function drawFloor(ctx: DrawCtx): void {
  const { state, gl, quad, res } = ctx;
  const vw = state.viewport.w;
  const vh = state.viewport.h;

  // 地面: floor_<theme>_full 整幅纹理, 64px 格世界对齐平铺 (UV 世界对齐采样, 零接缝)
  // 2026-08-13 用户指令: 恢复地面 (三件套验证完毕)
  const floorSprite = `floor_${state.theme}_full`;
  const runHue = state.run.element ? ELEMENT_DEFS[state.run.element].hue : 0;
  const FLOOR_TILE = 64;
  const FLOOR_FULL = 384;
  const t0x = Math.max(0, Math.floor(state.camera.x / FLOOR_TILE));
  const t0y = Math.max(0, Math.floor(state.camera.y / FLOOR_TILE));
  const t1x = Math.min(Math.floor(WORLD_W / FLOOR_TILE), Math.ceil((state.camera.x + vw) / FLOOR_TILE));
  const t1y = Math.min(Math.floor(WORLD_H / FLOOR_TILE), Math.ceil((state.camera.y + vh) / FLOOR_TILE));
  const uvCells = FLOOR_FULL / FLOOR_TILE;
  const uvStep = 1 / uvCells;
  for (let ty = t0y; ty < t1y; ty++) {
    for (let tx = t0x; tx < t1x; tx++) {
      const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
      const r = (h % 1000) / 1000;
      const u = (tx % uvCells) / uvCells;
      const v = (ty % uvCells) / uvCells;
      const opt: { color?: [number, number, number]; hue?: number; uv?: [number, number, number, number] } =
        r > 0.9 ? { color: [0.9, 0.9, 0.96], hue: runHue, uv: [u, v, uvStep, uvStep] } : { hue: runHue, uv: [u, v, uvStep, uvStep] };
      drawSprite(gl, quad, res, { x: tx * FLOOR_TILE - state.camera.x, y: ty * FLOOR_TILE - state.camera.y }, { w: FLOOR_TILE, h: FLOOR_TILE }, 'world', floorSprite, opt);
    }
  }

  // V1 墙: 32px 墙块 (旧 128px 的 1/4), 贴图 128px 缩放显示
  const wallName = `wall_${state.theme}`;
  for (const w of state.world.walls) {
    const sp = worldToScreen(state, w.pos);
    if (sp.x + w.size.w < 0 || sp.x > vw) continue;
    if (sp.y + w.size.h < 0 || sp.y > vh) continue;
    drawSprite(gl, quad, res, sp, w.size, 'world', wallName, runHue ? { hue: runHue } : undefined);
  }
  // V1 障碍物装饰: 主题散布草丛/石块 (纯视觉, 无碰撞) — 128px 1:1 (HD 烘焙同规格)
  for (const d of state.world.decor) {
    const sp = worldToScreen(state, d.pos);
    if (sp.x + 128 < 0 || sp.x > vw) continue;
    if (sp.y + 128 < 0 || sp.y > vh) continue;
    const dopt: { color?: [number, number, number]; hue?: number } = d.tint ? { color: d.tint, hue: runHue } : { hue: runHue };
    drawSprite(gl, quad, res, sp, { w: 128, h: 128 }, 'world', d.sprite, dopt);
  }
}