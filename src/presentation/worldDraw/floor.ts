// presentation/worldDraw/floor.ts — 地板 / 墙 / 装饰 (P1.2)

import type { DrawCtx } from './types';
import { WORLD_W, WORLD_H, worldToScreen } from '../../game/state';
import { ELEMENT_DEFS } from '../../game/element';
import { drawSprite } from '../../render/draw';

const FLOOR_TILE = 32;
/** 地板整幅纹理边长 (import_art.py FLOOR_FULL=384); 32px 格 → 12x12 世界对齐周期, 无缝无接缝 */
const FLOOR_FULL = 384;
/** 每主题首次绘制标记 (只打一次: 确认加载的瓦片组) */
const loggedThemes = new Set<string>();

/** 地板 + 墙 + 装饰 静态背景层 */
export function drawFloor(ctx: DrawCtx): void {
  const { state, gl, quad, res } = ctx;
  const vw = state.viewport.w;
  const vh = state.viewport.h;

  // V1 地板瓦片: HD 32px 格平铺
  const t0x = Math.max(0, Math.floor(state.camera.x / FLOOR_TILE));
  const t0y = Math.max(0, Math.floor(state.camera.y / FLOOR_TILE));
  const t1x = Math.min(Math.floor(WORLD_W / FLOOR_TILE), Math.ceil((state.camera.x + vw) / FLOOR_TILE));
  const t1y = Math.min(Math.floor(WORLD_H / FLOOR_TILE), Math.ceil((state.camera.y + vh) / FLOOR_TILE));
  const floorBase = `floor_${state.theme}`;
  const floorSprite = `${floorBase}_full`;
  // 首次绘制每主题: 日志确认加载的是哪组瓦片 (终端可见)
  if (!loggedThemes.has(floorSprite)) {
    loggedThemes.add(floorSprite);
    void import('../../util/jslog').then(({ jsLog }) =>
      jsLog(`[map] floor first-draw ${floorSprite} tile=${FLOOR_TILE}px full=${FLOOR_FULL}px uv-cells=${FLOOR_FULL / FLOOR_TILE}`),
    );
  }
  // 世界对齐采样: 每格取整幅纹理的 (tx,ty)%12 区域 → 周期天然对齐, 相邻格贴边同源列, 零接缝
  const uvCells = FLOOR_FULL / FLOOR_TILE;
  const uvStep = 1 / uvCells;
  // M3 元素地图: 本局元素色相旋转整图
  const runHue = state.run.element ? ELEMENT_DEFS[state.run.element].hue : 0;
  for (let ty = t0y; ty < t1y; ty++) {
    for (let tx = t0x; tx < t1x; tx++) {
      const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
      const r = (h % 1000) / 1000;
      const u = (tx % uvCells) / uvCells; // 世界对齐: 格子 ← 源纹理同列切片
      const v = (ty % uvCells) / uvCells;
      const opt: { color?: [number, number, number]; hue?: number; uv?: [number, number, number, number] } =
        r > 0.9 ? { color: [0.9, 0.9, 0.96], hue: runHue, uv: [u, v, uvStep, uvStep] } : { hue: runHue, uv: [u, v, uvStep, uvStep] };
      drawSprite(gl, quad, res, { x: tx * FLOOR_TILE - state.camera.x, y: ty * FLOOR_TILE - state.camera.y }, { w: FLOOR_TILE, h: FLOOR_TILE }, 'world', floorSprite, opt);
    }
  }

  // V1 墙: HD 主题墙 128px 1:1
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