// screens/teleport.ts — 传送过场绘制 (US-026 附带抽取)
//
// 用途: 城镇间传送的 1s 过场动画 (黑屏 + 扩散光圈 + 目标镇文字)
// 抽取动机: 35 行独立函数, 仅读 state.teleportTo / state.teleportT 与 TOWN_DEFS

import type { TownId } from '../game/town';
import { TOWN_DEFS } from '../game/town';

/** C-302 传送过场绘制: 黑屏 + 扩散光圈 + 目标镇文字 (1s) */
export function drawTeleportTransition(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  teleportTo: TownId | null | undefined,
  teleportT: number,
): void {
  const remain = Math.max(0, teleportT);
  const progress = 1 - remain;  // 0→1
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // 深空背景 (渐入)
  const fade = Math.min(1, progress * 2);
  ctx.fillStyle = `rgba(4,6,12,${fade})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // 扩散光圈 (中心 → 全屏)
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const maxR = Math.hypot(cx, cy);
  const ringR = 30 + progress * maxR;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(160, 220, 255, ${0.7 * (1 - progress)})`;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(4, ringR * 0.6), 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(120, 180, 255, ${0.5 * (1 - progress)})`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(207, 232, 255, ${fade})`;
  ctx.font = 'bold 30px monospace';
  ctx.fillText(`传送中… ${teleportTo && TOWN_DEFS[teleportTo] ? TOWN_DEFS[teleportTo].name : ''}`, canvas.width / 2, canvas.height / 2 + 40);
  ctx.fillStyle = '#668';
  ctx.font = '14px monospace';
  ctx.fillText(`[${Math.ceil(remain)}s]`, canvas.width / 2, canvas.height / 2 + 74);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}
