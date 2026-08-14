// drawSprite: 跨 atlas 通用
// flip: (1,1) 正常; (-1,1) 水平翻转; (1,-1) 垂直翻转
// rot: 绕 sprite 中心旋转弧度 (CW, Y 向下坐标系)
// color: tint (1,1,1) 不变色, (1,0.3,0.3) 红色 hit flash 等
// atlas 缺则不画 (M1 不兜底 → throw)

import type { RenderResources } from './resources';
import { spriteUv } from './resources';
import type { QuadResources } from './gl/resources';
import { setBlend, type BlendMode } from './gl/context';
import { diag } from '../util/diag';

export interface DrawOpts {
  flip?: { x: 1 | -1; y: 1 | -1 };
  rot?: number;
  color?: [number, number, number];
  /** 色相旋转 (度): 元素变体 (火/冰/毒/雷), 0 = 不变 */
  hue?: number;
  /** V0 画质: 'add' = additive 发光 (ONE, ONE), 默认 'alpha' 标准混合 */
  blend?: BlendMode;
  /** 覆盖采样 UV [u, v, du, dv] — sprite 局部坐标 (0..1 相对内容区); drawSprite 内部转换到图集空间 (世界对齐无缝地板用; 缺省用 sprite 元数据) */
  uv?: [number, number, number, number];
}

/** 上次混合模式缓存: 避免同模式重复切换 blendFunc */
let lastBlend: BlendMode = 'alpha';

/** 已打日志的 sprite (只打首次, 防每帧刷屏) */
const diagLogged = new Set<string>();

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
  if (!bundle) {
    diag('sprite', `MISSING atlas ${atlasName} caller=${new Error().stack?.split('\n')[2]?.trim() ?? '?'}`);
    throw new Error(`atlas 缺失: ${atlasName}`);
  }
  const sprite = bundle.sprites.get(spriteName);
  if (!sprite) {
    diag('sprite', `MISSING sprite ${atlasName}/${spriteName} caller=${new Error().stack?.split('\n')[2]?.trim() ?? '?'}`);
    throw new Error(`sprite 缺失: ${atlasName}/${spriteName}`);
  }

  // 首次绘制事实日志: 哪个 sprite、图集 UV、绘制尺寸/位置 → 可核对"加载的瓦片"
  const dkey = `${atlasName}/${spriteName}`;
  // uv 覆盖是 sprite 局部坐标 [u,v,du,dv] (0..1 相对 sprite 内容区) → 转换到图集坐标
  // (uUv 直通 shader, 必须 atlas-space; 旧实现直传局部值 → NEAREST 采到图集错误区域)
  const fw = sprite.frame_width / bundle.atlas.width;
  const fh = sprite.frame_height / bundle.atlas.height;
  // UV 是 PNG 坐标 (顶部=0)。纹理上传 UNPACK_FLIP_Y_WEBGL=true (textures.ts: 画布顶部→v=1),
  // 采样区间需 v 镜像。spriteUv 已内置镜像; opts.uv 覆盖 (sprite 局部坐标) 在此镜像。
  const [du0, dv0, duw, duh] = opts.uv
    ? [sprite.x / bundle.atlas.width + opts.uv[0] * fw, 1 - (sprite.y / bundle.atlas.height + (opts.uv[1] + opts.uv[3]) * fh), opts.uv[2] * fw, opts.uv[3] * fh]
    : spriteUv(sprite, bundle.atlas.width, bundle.atlas.height);
  if (!diagLogged.has(dkey)) {
    diagLogged.add(dkey);
    diag('sprite', `draw ${dkey} uv=(${du0.toFixed(3)},${dv0.toFixed(3)},${duw.toFixed(3)},${duh.toFixed(3)}) ${size.w}x${size.h} pos=(${pos.x.toFixed(0)},${pos.y.toFixed(0)})${opts.uv ? ' uv-override' : ''}`);
  }

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
  const [u, v, du, dv] = [du0, dv0, duw, duh];
  gl.uniform4f(q.uUv, u, v, du, dv);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  gl.bindVertexArray(null);
}