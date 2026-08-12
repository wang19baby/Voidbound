// HUD overlay: 世界坐标 → 屏幕 投影绘制 (地面标签 + 伤害数字)

import type { GameState } from '../../../game/state';
import { getDamageNums } from '../../../game/fx/damageNum';
import { getLoot, RARITY_COLORS } from '../../../game/equipment';
import { worldToScreen } from '../../../game/state';

// 地面装备标签 (US-018)
export function drawGroundLabels(ctx2d: CanvasRenderingContext2D, state: GameState, vw: number, vh: number): void {
  ctx2d.font = '12px monospace';
  for (const eq of getLoot(state)) {
    const dx = eq.pos.x - state.player.pos.x;
    const dy = eq.pos.y - state.player.pos.y;
    if (dx * dx + dy * dy > 700 * 700) continue;
    const sp = worldToScreen(state, eq.pos);
    if (sp.x < 0 || sp.x > vw || sp.y - 14 < 0 || sp.y > vh) continue;
    const col = RARITY_COLORS[eq.rarity];
    ctx2d.fillStyle = `rgb(${col.map(c => Math.round(c * 255)).join(',')})`;
    ctx2d.fillText(eq.name, sp.x + eq.size.w / 2, sp.y - 12);
  }
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
