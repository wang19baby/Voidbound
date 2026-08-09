// drawSprite: 跨 atlas 通用
// flip: (1,1) 正常; (-1,1) 水平翻转; (1,-1) 垂直翻转
// rot: 绕 sprite 中心旋转弧度 (CW, Y 向下坐标系)
// atlas 缺则不画 (M1 不兜底 → throw)

import type { RenderResources } from './resources';
import { spriteUv } from './resources';
import type { QuadResources } from './gl/resources';

export interface DrawOpts {
  flip?: { x: 1 | -1; y: 1 | -1 };
  rot?: number;  // 弧度
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

  gl.useProgram(q.program);
  gl.bindVertexArray(q.vao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, bundle.texture);
  gl.uniform1i(q.uTex, 0);
  gl.uniform2f(q.uPos, pos.x, pos.y);
  gl.uniform2f(q.uSize, size.w, size.h);
  gl.uniform2f(q.uFlip, flip.x, flip.y);
  gl.uniform1f(q.uRot, rot);
  const [u, v, du, dv] = spriteUv(sprite, bundle.atlas.width, bundle.atlas.height);
  gl.uniform4f(q.uUv, u, v, du, dv);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  gl.bindVertexArray(null);
}