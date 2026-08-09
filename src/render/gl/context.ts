// WebGL2 context 获取; 失败直接 throw, 不做降级

export function createContext(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) throw new Error('WebGL2 不可用 (浏览器/驱动不支持)');
  return gl;
}