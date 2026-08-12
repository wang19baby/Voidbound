// HUD overlay: 顶部中央 拾取 toast / COMBO / 符文三选一 (D-01)

import type { GameState } from '../../../game/state';
import { getToasts } from '../../../game/toast';
import { RUNE_DEFS } from '../../../game/rune';
import { slotDisplay } from '../../../game/skill';

// 顶部中央: 拾取 toast
export function drawPickupToasts(ctx2d: CanvasRenderingContext2D, state: GameState, vw: number): void {
  const toasts = getToasts(state);
  if (toasts.length === 0) return;
  ctx2d.textAlign = 'center';
  let ty = 64;
  for (const t of toasts) {
    ctx2d.globalAlpha = Math.min(1, t.life / 0.8);
    ctx2d.font = 'bold 14px monospace';
    const tw = ctx2d.measureText(t.text).width;
    ctx2d.fillStyle = 'rgba(8,8,16,0.6)';
    ctx2d.fillRect(vw / 2 - tw / 2 - 10, ty - 14, tw + 20, 20);
    ctx2d.fillStyle = t.color;
    ctx2d.fillText(t.text, vw / 2, ty - 12);
    ty += 26;
  }
  ctx2d.globalAlpha = 1;
  ctx2d.textAlign = 'left';
}

// COMBO (顶部中央, toast 下方)
export function drawCombo(ctx2d: CanvasRenderingContext2D, state: GameState, vw: number): void {
  if (!(state.combat.combo.count > 1 && state.combat.combo.timer > 0)) return;
  ctx2d.textAlign = 'center';
  ctx2d.fillStyle = '#ffd64a';
  ctx2d.font = 'bold 22px monospace';
  ctx2d.fillText(`COMBO x${state.combat.combo.count}`, vw / 2, 118);
  ctx2d.textAlign = 'left';
}

// 符文三选一 overlay (D-01)
export function drawRuneChoice(ctx2d: CanvasRenderingContext2D, state: GameState, vw: number, vh: number): void {
  const choice = state.equip.runeChoice;
  if (!choice) return;
  const boxW = 260;
  const boxGap = 20;
  const totalW = boxW * 3 + boxGap * 2;
  const x0 = (vw - totalW) / 2;
  const y0 = vh / 2 - 70;
  ctx2d.fillStyle = 'rgba(0,0,0,0.75)';
  ctx2d.fillRect(0, 0, vw, vh);
  ctx2d.textAlign = 'center';
  ctx2d.font = 'bold 18px monospace';
  ctx2d.fillStyle = '#ffd';
  ctx2d.fillText(`${slotDisplay(choice.slot)} 达到 Lv10 — 选择符文变异`, vw / 2, y0 - 34);
  ctx2d.font = '12px monospace';
  ctx2d.fillStyle = '#aaa';
  ctx2d.fillText('按 1/2/3 选择 · Esc 拒绝(本局不再触发)', vw / 2, y0 - 14);
  for (let i = 0; i < choice.options.length; i++) {
    const r = RUNE_DEFS[choice.options[i]];
    const bx = x0 + i * (boxW + boxGap);
    ctx2d.fillStyle = 'rgba(30,30,40,0.95)';
    ctx2d.strokeStyle = `rgb(${r.color.map(c => Math.round(c * 255)).join(',')})`;
    ctx2d.strokeRect(bx, y0, boxW, 84);
    ctx2d.fillRect(bx, y0, boxW, 84);
    ctx2d.font = 'bold 16px monospace';
    ctx2d.fillStyle = `rgb(${r.color.map(c => Math.round(c * 255)).join(',')})`;
    ctx2d.fillText(`${i + 1}. ${r.name}`, bx + boxW / 2, y0 + 22);
    ctx2d.font = '12px monospace';
    ctx2d.fillStyle = '#ddd';
    ctx2d.fillText(r.desc, bx + boxW / 2, y0 + 56);
  }
  ctx2d.textAlign = 'left';
}
