// HUD 技能槽 overlay 绘制 (Canvas2D): 键位/等级/符文标签 + 符文变异预览 + cd 倒计时

import type { GameState } from '../../game/state';
import { getSkillCooldowns, getSkill, skillLevel, skillRune, slotDisplay } from '../../game/skill';
import { RUNE_DEFS, RUNE_FAMILIES, slotFamily } from '../../game/rune';
import { loadKeybinds, keyLabel } from '../../game/keybind';
import { SLOT_SIZE, SLOT_GAP, getHudHover } from './types';
import { slotY, slotX } from './geometry';
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
    const x = slotX() + i * (SLOT_SIZE + SLOT_GAP);
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
  // C (P2-9): 技能槽 hover → 技能信息 + 符文变异预览 (仅 Lv10 未绑定且未拒绝时)
  // 位置: 槽右侧 (槽移入 HP/MP 右侧后, 下方是药水行, 改为槽右侧展示)
  const hoverIdx = SKILL_KEYS.findIndex((_, i) => hoverKey === `skill${i}`);
  if (hoverIdx >= 0) {
    const hSlot = KEY_TO_SLOT[SKILL_KEYS[hoverIdx]];
    const sk = getSkill(hSlot);
    const rune = sk.rune;
    const fam = slotFamily(hSlot);
    const pool = RUNE_FAMILIES[fam];
    const eligible = sk.level >= 10 && (rune === null || rune === 'none') && !state.equip.rejectedRunes.includes(hSlot);
    const lines: string[] = [
      `${sk.name} (${slotDisplay(hSlot)}槽) Lv${sk.level}`,
      `CD ${sk.cooldown}s · 耗蓝 ${sk.mpCost}${sk.mpCost > 0 ? '' : ' (不耗蓝)'}`,
    ];
    let mutLine = -1;
    if (rune && rune !== 'none') {
      lines.push(`符文 ${RUNE_DEFS[rune].name}: ${RUNE_DEFS[rune].desc}`);
    }
    if (eligible) {
      mutLine = lines.length;
      lines.push('Lv10 变异可选 (三选一):');
      for (const r of pool) lines.push(` · ${RUNE_DEFS[r].name}: ${RUNE_DEFS[r].desc}`);
    }
    const th = lines.length * 14 + 10;
    // 槽行右侧; 过宽/过高时左/上收确保不出屏
    const tx = Math.min(slotX() + SKILL_KEYS.length * (SLOT_SIZE + SLOT_GAP) + 8, state.viewport.w - 400 - 8);
    const ty = Math.min(sy, vh - th - 6);
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
      } else if (i === mutLine) {
        ctx2d.fillStyle = '#ffd64a';
        ctx2d.font = 'bold 11px monospace';
      } else {
        ctx2d.fillStyle = '#ccc';
        ctx2d.font = '11px monospace';
      }
      ctx2d.fillText(ln, tx + 8, ty + 6 + i * 14);
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
      ctx2d.fillText(cdLeft.toFixed(1), slotX() + i * (SLOT_SIZE + SLOT_GAP) + SLOT_SIZE / 2, sy + SLOT_SIZE / 2);
    }
  }
  ctx2d.textAlign = 'left';
  ctx2d.textBaseline = 'top';
}