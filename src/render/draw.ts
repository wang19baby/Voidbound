// drawSprite: 跨 atlas 通用
// flip: (1,1) 正常; (-1,1) 水平翻转; (1,-1) 垂直翻转
// rot: 绕 sprite 中心旋转弧度 (CW, Y 向下坐标系)
// color: tint (1,1,1) 不变色, (1,0.3,0.3) 红色 hit flash 等
// atlas 缺则不画 (M1 不兜底 → throw)

import type { RenderResources } from './resources';
import { spriteUv } from './resources';
import type { QuadResources } from './gl/resources';
import { setBlend, type BlendMode } from './gl/context';

export interface DrawOpts {
  flip?: { x: 1 | -1; y: 1 | -1 };
  rot?: number;
  color?: [number, number, number];
  /** 色相旋转 (度): 元素变体 (火/冰/毒/雷), 0 = 不变 */
  hue?: number;
  /** V0 画质: 'add' = additive 发光 (ONE, ONE), 默认 'alpha' 标准混合 */
  blend?: BlendMode;
}

/** 上次混合模式缓存: 避免同模式重复切换 blendFunc */
let lastBlend: BlendMode = 'alpha';

/** Review 修复: 外部 (instanced 渲染) 设置 blend 时同步缓存, 防 drawSprite 误跳 */
export function setBlendTracked(gl: WebGL2RenderingContext, mode: BlendMode): void {
  setBlend(gl, mode);
  lastBlend = mode;
}

/** V0 画质: 设置 u_viewport (视口尺寸, 替代 shader 硬编码 1280x720) */
export function setViewportUniform(gl: WebGL2RenderingContext, q: QuadResources, w: number, h: number): void {
  gl.useProgram(q.program);
  gl.uniform2f(q.uViewport, w, h);
}

export function drawSprite(
  gl: WebGL2RenderingContext,
  q: QuadResources,
  res: RenderResources,
  pos: { x: number; y: number },
  size: { w: number; h: number },
  atlasName: string,
  spriteName: string,
  opts: DrawOpts = {},
): void {
  const bundle = res.atlases.get(atlasName);
  if (!bundle) throw new Error(`atlas 缺失: ${atlasName}`);
  const sprite = bundle.sprites.get(spriteName);
  if (!sprite) throw new Error(`sprite 缺失: ${atlasName}/${spriteName}`);

  const flip = opts.flip ?? { x: 1, y: 1 };
  const rot = opts.rot ?? 0;
  const color = opts.color ?? [1, 1, 1];
  const hue = opts.hue ?? 0;
  const blend = opts.blend ?? 'alpha';
  // V0 画质: additive 发光按需切换混合状态 (缓存避免重复切换)
  if (blend !== lastBlend) {
    setBlend(gl, blend);
    lastBlend = blend;
  }

  gl.useProgram(q.program);
  gl.bindVertexArray(q.vao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, bundle.texture);
  gl.uniform1i(q.uTex, 0);
  gl.uniform2f(q.uPos, pos.x, pos.y);
  gl.uniform2f(q.uSize, size.w, size.h);
  gl.uniform2f(q.uFlip, flip.x, flip.y);
  gl.uniform1f(q.uRot, rot);
  gl.uniform3f(q.uColor, color[0], color[1], color[2]);
  gl.uniform1f(q.uHue, hue);
  const [u, v, du, dv] = spriteUv(sprite, bundle.atlas.width, bundle.atlas.height);
  gl.uniform4f(q.uUv, u, v, du, dv);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  gl.bindVertexArray(null);
}