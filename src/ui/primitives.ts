// ui/primitives.ts — Canvas2D 通用绘图原语
// 从 main.ts 抽出 (US-022): 纯函数 / 无业务依赖 / 仅依赖 Canvas API
// 注意: 所有函数首个参数为 ctx (显式依赖注入,避免闭包到 hudCtx 全局)

/** 圆角矩形 (roundRect 兜底) */
export function rrect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** #rrggbb → [r, g, b] 0-1 (投射物按伤害类型着色) */
export function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}