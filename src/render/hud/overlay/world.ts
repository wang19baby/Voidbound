// HUD overlay: 世界坐标 → 屏幕 投影绘制 (地面标签 + 伤害数字)

import type { GameState } from '../../../game/state';
import { getDamageNums } from '../../../game/fx/damageNum';
import { getLoot, RARITY_COLORS } from '../../../game/equipment';
import { worldToScreen } from '../../../game/state';

// 地面装备标签 (US-018; 2026-08-15: 加暗底背景框 + 稀有度描边, 文字更醒目)
export function drawGroundLabels(ctx2d: CanvasRenderingContext2D, state: GameState, vw: number, vh: number): void {
  ctx2d.font = 'bold 13px monospace';
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'top';
  for (const eq of getLoot(state)) {
    const dx = eq.pos.x - state.player.pos.x;
    const dy = eq.pos.y - state.player.pos.y;
    if (dx * dx + dy * dy > 700 * 700) continue;
    const sp = worldToScreen(state, eq.pos);
    if (sp.x < 0 || sp.x > vw || sp.y - 24 < 0 || sp.y > vh) continue;
    const col = RARITY_COLORS[eq.rarity];
    const rgb = col.map(c => Math.round(c * 255)).join(',');
    const x = sp.x + eq.size.w / 2;
    const y = sp.y - 14;
    const tw = ctx2d.measureText(eq.name).width;
    const bw = tw + 14, bh = 17;
    const bx = x - bw / 2, by = y - 4;
    ctx2d.fillStyle = 'rgba(8, 8, 14, 0.82)';
    ctx2d.fillRect(bx, by, bw, bh);
    ctx2d.strokeStyle = `rgba(${rgb}, 0.7)`;
    ctx2d.lineWidth = 1;
    ctx2d.strokeRect(bx, by, bw, bh);
    ctx2d.fillStyle = `rgb(${rgb})`;
    ctx2d.fillText(eq.name, x, y);
  }
  ctx2d.textAlign = 'left';
  ctx2d.textBaseline = 'top';
}

// 伤害数字 (世界坐标 → 屏幕)
export function drawDamageNumbers(ctx2d: CanvasRenderingContext2D, state: GameState, vw: number, vh: number): void {
  ctx2d.font = 'bold 14px monospace';
  ctx2d.textAlign = 'center';
  for (const d of getDamageNums(state)) {
    const sp = worldToScreen(state, d.pos);
    if (sp.x < 0 || sp.x > vw || sp.y < 0 || sp.y > vh) continue;
    ctx2d.fillStyle = d.color;
    ctx2d.fillText(d.text, sp.x, sp.y);
  }
  ctx2d.textAlign = 'left';
}
