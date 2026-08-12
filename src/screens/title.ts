// screens/title.ts — 标题页纯渲染层 (US-024 拆分的最小可行切片)
//
// 设计选择 (架构笔记):
// - 只搬"读 state + 写 ctx" 的纯渲染函数, 不动 state 变更 (syncTitleFocus/moveTitleFocus/titleAct)
// - 完整 drawTitle 仍留在 main.ts (它涉及 GL 立绘 + 2D 挖孔 + 状态机 + 大量 state.charList 读取),
//   后续 US-024-b 可单独把整块 drawTitle 拆出
// - 所有函数首参 ctx (显式依赖注入, 与 ui/primitives/ui/keycap 保持一致)
//
// 依赖: ui/primitives (rrect), input/keyboard (keyLabel, Keybinds)

import { rrect } from '../ui/primitives';
import { inRect } from '../game/uigrid';
import type { Keybinds } from '../game/keybind';
import { keyLabel } from '../game/keybind';

/** 微尘粒子状态 (从 main.ts 模块级迁移; 仅本模块使用) */
interface TitleDust { x: number; y: number; vx: number; vy: number; t: number; life: number; }
let titleDust: TitleDust[] | null = null;
let titleDustLastT = 0;

/** 初始化微尘 (屏宽屏高变化时重生成) */
export function initTitleDust(canvas: HTMLCanvasElement): void {
  const w = canvas.width, h = canvas.height;
  titleDust = [];
  for (let i = 0; i < 60; i++) {
    titleDust.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      t: Math.random() * 4,
      life: 0.6 + Math.random() * 0.4,
    });
  }
  titleDustLastT = performance.now();
}

function updateTitleDust(dt: number, canvas: HTMLCanvasElement): void {
  if (!titleDust) { initTitleDust(canvas); return; }
  const w = canvas.width, h = canvas.height;
  for (const p of titleDust) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.t += dt;
    if (p.x < -4) p.x = w + 4; else if (p.x > w + 4) p.x = -4;
    if (p.y < -4) p.y = h + 4; else if (p.y > h + 4) p.y = -4;
  }
}

/** TS-002: 背景径向渐变 (中心微紫亮, 边缘回 #0b0b12) + 微尘 */
export function drawTitleBackground(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0b0b12';
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h / 2, 100, w / 2, h / 2, Math.max(w, h) * 0.7);
  g.addColorStop(0, 'rgba(80,40,120,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const now = performance.now();
  const dt = Math.min((now - titleDustLastT) / 1000, 0.05);
  titleDustLastT = now;
  updateTitleDust(dt, canvas);
  if (titleDust) {
    for (const p of titleDust) {
      // 微尘: 灰色微紫, 慢速闪烁
      const tw = 0.6 + 0.4 * Math.sin(p.t * 1.6 + p.x * 0.01);
      ctx.fillStyle = `rgba(150,130,190,${(0.08 + 0.14 * tw).toFixed(3)})`;
      const s = Math.max(1.5, 2.6 * p.life);
      ctx.fillRect(p.x, p.y, s, s);
    }
  }
}

/** TS-003: unix 秒 → 相对时间 ("刚刚"/"N 分钟前"/"N 小时前"/"N 天前") */
export function relTime(unixSec: number): string {
  if (!unixSec) return '—';
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 0) return '刚刚';
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

/** TS-005: 标题字效 (外发光 + 副标字距) */
export function drawTitleWordmark(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  const w = canvas.width, h = canvas.height;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(201,170,255,0.5)';
  ctx.shadowBlur = 24;
  ctx.fillStyle = '#c9aaff';
  ctx.font = 'bold 72px monospace';
  ctx.fillText('VOIDBOUND', w / 2, h / 2 - 140);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#888';
  ctx.font = '22px monospace';
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0.2em';
  ctx.fillText('虚空之缚 — WASD + 鼠标 · 30 分钟一局', w / 2, h / 2 - 88);
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
}

/** TS-006: 玩法说明带 (4 列, 键位项动态) */
export function drawInfoBand(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  mousePos: { x: number; y: number },
  kb: Keybinds,
  menuRects: Array<[number, number, number, number]>,
): void {
  const w = canvas.width, h = canvas.height;
  const mx = mousePos.x, my = mousePos.y;
  const cells: Array<{ icon: 'wasd' | 'cast' | 'skills' | 'clock'; text: string }> = [
    { icon: 'wasd', text: 'WASD 移动' },
    { icon: 'cast', text: '鼠标点击施法' },
    { icon: 'skills', text: `${keyLabel(kb.skills.Q)}/${keyLabel(kb.skills.W)}/${keyLabel(kb.skills.E)}/${keyLabel(kb.skills.R)} 技能` },
    { icon: 'clock', text: '30-60 分钟一局' },
  ];
  const cellW = 154, cellH = 26, gap = 16;
  const totalW = cells.length * cellW + (cells.length - 1) * gap;
  const x0 = (w - totalW) / 2, y0 = h - 84;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  cells.forEach((cell, i) => {
    const cx = x0 + i * (cellW + gap);
    const hit = inRect(mx, my, cx, y0, cellW, cellH);
    rrect(ctx, cx, y0, cellW, cellH, 6);
    ctx.fillStyle = hit ? 'rgba(156,204,255,0.10)' : 'rgba(18,18,28,0.75)';
    ctx.fill();
    ctx.strokeStyle = hit ? '#9cf' : '#2a2a3a';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 图标 (程序化 14×14)
    const icx = cx + 16, icy = y0 + cellH / 2;
    ctx.strokeStyle = '#9cf';
    ctx.fillStyle = '#9cf';
    ctx.lineWidth = 1.5;
    if (cell.icon === 'wasd') {
      ctx.fillRect(icx - 8, icy - 8, 4, 4);
      ctx.fillRect(icx - 12, icy - 2, 4, 4);
      ctx.fillRect(icx - 8, icy + 4, 4, 4);
      ctx.fillRect(icx - 4, icy - 2, 4, 4);
    } else if (cell.icon === 'cast') {
      ctx.beginPath();
      ctx.arc(icx, icy, 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(icx, icy - 7); ctx.lineTo(icx, icy - 4);
      ctx.moveTo(icx, icy + 4); ctx.lineTo(icx, icy + 7);
      ctx.moveTo(icx - 7, icy); ctx.lineTo(icx - 4, icy);
      ctx.moveTo(icx + 4, icy); ctx.lineTo(icx + 7, icy);
      ctx.stroke();
    } else if (cell.icon === 'skills') {
      for (let s = 0; s < 4; s++) ctx.fillRect(icx - 8 + s * 5, icy - 2, 3, 4);
    } else {
      ctx.beginPath();
      ctx.arc(icx, icy, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(icx, icy - 3); ctx.lineTo(icx, icy);
      ctx.moveTo(icx, icy); ctx.lineTo(icx + 3, icy + 2);
      ctx.stroke();
    }
    ctx.fillStyle = hit ? '#cde' : '#9aa';
    ctx.font = '12px monospace';
    ctx.fillText(cell.text, cx + 30, y0 + cellH / 2 + 1);
    menuRects.push([cx, y0, cellW, cellH]);
  });
  ctx.textAlign = 'center';
}
