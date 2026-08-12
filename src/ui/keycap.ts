// ui/keycap.ts — 键帽 / 齿轮 / 场景图标 (程序化绘制, 图集无素材)
// 从 main.ts 抽出 (US-023): 纯 Canvas2D, 无业务依赖, 仅依赖 primitives.ts
// 依赖: ./primitives (rrect)

import { rrect } from './primitives';

/** TS-004: 键帽 pill (深底浅边, 圆角) */
export function drawKeycap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  active: boolean,
  w = 36,
  h = 24,
): void {
  rrect(ctx, x, y, w, h, 5);
  ctx.fillStyle = active ? '#23232f' : '#101018';
  ctx.fill();
  ctx.strokeStyle = active ? '#ffd64a' : '#556';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = active ? '#ffd64a' : '#99a';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
}

/** TS-009: 齿轮图标 (程序化 Canvas2D, 8 齿; 图集无齿轮素材) */
export function drawGearIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  hit: boolean,
  down: boolean,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  if (hit) {
    ctx.shadowColor = 'rgba(255,214,74,0.8)';
    ctx.shadowBlur = 8;
  }
  ctx.beginPath();
  const teeth = 8;
  const rOut = r, rIn = r * 0.72;
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = a0 + Math.PI / teeth;
    const aMid = a0 + Math.PI / teeth / 2;
    if (i === 0) ctx.moveTo(Math.cos(a0) * rOut, Math.sin(a0) * rOut);
    else ctx.lineTo(Math.cos(a0) * rOut, Math.sin(a0) * rOut);
    ctx.lineTo(Math.cos(aMid) * rIn, Math.sin(aMid) * rIn);
    ctx.lineTo(Math.cos(a1) * rOut, Math.sin(a1) * rOut);
  }
  ctx.closePath();
  ctx.fillStyle = hit ? (down ? '#fff' : '#ffd64a') : '#889';
  ctx.fill();
  // 轴孔
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = '#0b0b12';
  ctx.fill();
  ctx.restore();
}

/** TS-003/006: 场景小图标 16×16 (town=绿屋 #8f8 / dungeon=青闸门 #9cf) */
export function drawSceneIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scene: string,
): void {
  ctx.save();
  if (scene === 'town') {
    ctx.fillStyle = '#8f8';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 7);
    ctx.lineTo(cx + 7, cy - 1);
    ctx.lineTo(cx - 7, cy - 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx - 5, cy - 1, 10, 7);
  } else {
    ctx.fillStyle = '#9cf';
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy + 7);
    ctx.lineTo(cx - 6, cy - 2);
    ctx.arc(cx, cy - 2, 6, Math.PI, 0);
    ctx.lineTo(cx + 6, cy + 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0b0b12';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 2);
    ctx.lineTo(cx, cy + 7);
    ctx.stroke();
  }
  ctx.restore();
}