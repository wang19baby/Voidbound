// WebGL2 context 获取; 失败直接 throw, 不做降级

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