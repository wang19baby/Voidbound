// WebGL2 context 获取; 失败直接 throw, 不做降级

export type BlendMode = 'alpha' | 'add';

/** 切换混合模式 (V0 画质): 'add' = additive (ONE, ONE) 用于发光粒子/技能光效 */
export function setBlend(gl: WebGL2RenderingContext, mode: BlendMode): void {
  if (mode === 'add') gl.blendFunc(gl.ONE, gl.ONE);
  else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

export function createContext(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) throw new Error('WebGL2 不可用 (浏览器/驱动不支持)');
  // 混合: 缺省关闭 → 贴图 alpha 会渲染成不透明黑盒 (黑方块 bug)
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  // 2D 渲染不需要深度/背面剔除
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  return gl;
}