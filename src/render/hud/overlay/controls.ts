// HUD overlay: 药水/翻滚按钮 + 技能点 (鼠标点击/hover 反馈; 与键盘 1/2/Space 同行为)

import type { GameState } from '../../../game/state';
import { HUD_PAD, type HudBtn, getHudHover } from '../types';
import { drawIcon } from '../icons';
import { hudDungeonButtons } from '../buttons';

// 药水/翻滚按钮 + 技能点
export function drawPotionDodgeButtons(ctx2d: CanvasRenderingContext2D, state: GameState, vw: number, vh: number): void {
  const hoverKey = getHudHover();
  const sy = vh - 120;
  const btn = (b: HudBtn, label: string, col: string) => {
    ctx2d.fillStyle = hoverKey === b.key ? 'rgba(255,255,255,0.14)' : 'rgba(10,10,18,0.78)';
    ctx2d.fillRect(b.x, b.y, b.w, b.h);
    const icon = b.key === 'potionHp' ? 'potion_hp' : b.key === 'potionMp' ? 'potion_mp' : null;
    let textShift = 0;
    if (icon) {
      drawIcon(ctx2d, state.resources, icon, b.x + 4, b.y + 3, 24);
      textShift = 10;
    }
    ctx2d.strokeStyle = hoverKey === b.key ? col : '#445';
    ctx2d.lineWidth = hoverKey === b.key ? 2 : 1;
    ctx2d.strokeRect(b.x, b.y, b.w, b.h);
    ctx2d.fillStyle = col;
    ctx2d.font = 'bold 12px monospace';
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(label, b.x + b.w / 2 + textShift, b.y + b.h / 2);
    ctx2d.textAlign = 'left';
    ctx2d.textBaseline = 'top';
  };
  const hudBtns = hudDungeonButtons(vw, vh);
  const hpN = state.player.potions?.hp ?? 0;
  const mpN = state.player.potions?.mp ?? 0;
  btn(hudBtns[4], `HP 药水 ×${hpN}`, hpN > 0 ? '#f88' : '#766');
  btn(hudBtns[5], `MP 药水 ×${mpN}`, mpN > 0 ? '#88f' : '#766');
  const dodgeCd = state.player.dodgeCd;
  btn(hudBtns[6], `翻滚${dodgeCd > 0 ? ` ${dodgeCd.toFixed(1)}s` : ' ✓'}`, dodgeCd > 0 ? '#887' : '#8f8');
  ctx2d.fillStyle = '#ffd';
  ctx2d.font = '12px monospace';
  ctx2d.fillText(`技能点 ${state.player.skillPoints ?? 0}`, HUD_PAD + 356, sy - 46 + 9);
}
