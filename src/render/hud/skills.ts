// HUD 技能槽 overlay 绘制 (Canvas2D): 键位/等级/符文标签 + 符文变异预览 + cd 倒计时

import type { GameState } from '../../game/state';
import { getSkillCooldowns, skillLevel, skillRune } from '../../game/skill';
import { RUNE_DEFS, RUNE_FAMILIES, slotFamily } from '../../game/rune';
import { loadKeybinds, keyLabel } from '../../game/keybind';
import { HUD_PAD, SLOT_SIZE, SLOT_GAP, getHudHover } from './types';
import { slotY } from './geometry';
import { SKILL_KEYS, KEY_TO_SLOT } from './icons';

// 左下技能簇: 键位/等级/符文 + hover 框 + 符文变异预览
export function drawSkillBarOverlay(ctx2d: CanvasRenderingContext2D, state: GameState, vh: number): void {
  const sy = slotY(vh);
  const kb = loadKeybinds();
  const hoverKey = getHudHover();
  ctx2d.font = 'bold 11px monospace';
  for (let i = 0; i < SKILL_KEYS.length; i++) {
    const key = SKILL_KEYS[i];
    const slot = KEY_TO_SLOT[key];
    const x = HUD_PAD + i * (SLOT_SIZE + SLOT_GAP);
    if (hoverKey === `skill${i}`) {
      ctx2d.strokeStyle = '#ffd64a';
      ctx2d.lineWidth = 2;
      ctx2d.strokeRect(x - 2, sy - 2, SLOT_SIZE + 4, SLOT_SIZE + 4);
    }
    ctx2d.fillStyle = '#fff';
    ctx2d.fillText(keyLabel(kb.skills[slot]), x + SLOT_SIZE / 2, sy - 16);
    ctx2d.fillStyle = '#aaa';
    ctx2d.font = '10px monospace';
    ctx2d.fillText(`Lv${skillLevel(slot)}`, x + 2, sy + SLOT_SIZE + 2);
    const r = skillRune(slot);
    if (r !== null && r !== 'none') {
      const col = RUNE_DEFS[r].color;
      ctx2d.fillStyle = `rgb(${col.map(c => Math.round(c * 255)).join(',')})`;
      ctx2d.fillText(RUNE_DEFS[r].name, x + 2, sy + SLOT_SIZE + 14);
    }
  }
  // C (P2-9): 技能槽 hover → 符文变异预览 (Lv10 三选一可选池)
  const hoverIdx = SKILL_KEYS.findIndex((_, i) => hoverKey === `skill${i}`);
  if (hoverIdx >= 0) {
    const hSlot = KEY_TO_SLOT[SKILL_KEYS[hoverIdx]];
    const fam = slotFamily(hSlot);
    const pool = RUNE_FAMILIES[fam];
    const lines = [`Lv10 变异可选 (${hSlot} 槽)`, ...pool.map(r => `${RUNE_DEFS[r].name}: ${RUNE_DEFS[r].desc}`)];
    const th = lines.length * 15 + 10;
    const tx = HUD_PAD + hoverIdx * (SLOT_SIZE + SLOT_GAP);
    const ty = sy - 18 - th;
    ctx2d.fillStyle = 'rgba(8,8,16,0.93)';
    ctx2d.fillRect(tx, ty, 400, th);
    ctx2d.strokeStyle = '#c9aaff';
    ctx2d.lineWidth = 1;
    ctx2d.strokeRect(tx, ty, 400, th);
    ctx2d.textAlign = 'left';
    ctx2d.textBaseline = 'top';
    lines.forEach((ln, i) => {
      if (i === 0) {
        ctx2d.fillStyle = '#c9aaff';
        ctx2d.font = 'bold 12px monospace';
      } else {
        ctx2d.fillStyle = '#ccc';
        ctx2d.font = '11px monospace';
      }
      ctx2d.fillText(ln, tx + 8, ty + 6 + i * 15);
    });
    ctx2d.textAlign = 'left';
    ctx2d.textBaseline = 'top';
  }
}

// 技能 cd 倒计时 (槽内)
export function drawSkillCooldownOverlay(ctx2d: CanvasRenderingContext2D, state: GameState, vh: number): void {
  const sy = slotY(vh);
  const nowSec = performance.now() / 1000;
  ctx2d.font = 'bold 14px monospace';
  ctx2d.fillStyle = '#fff';
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  const cds = getSkillCooldowns(nowSec);
  for (let i = 0; i < SKILL_KEYS.length; i++) {
    const cdLeft = cds[KEY_TO_SLOT[SKILL_KEYS[i]]] ?? 0;
    if (cdLeft > 0.05) {
      ctx2d.fillText(cdLeft.toFixed(1), HUD_PAD + i * (SLOT_SIZE + SLOT_GAP) + SLOT_SIZE / 2, sy + SLOT_SIZE / 2);
    }
  }
  ctx2d.textAlign = 'left';
  ctx2d.textBaseline = 'top';
}