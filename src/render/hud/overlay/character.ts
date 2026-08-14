// HUD overlay: 角色信息面板 (C 键, dungeon/town 内) — 左属性 + 中主动技能 + 右被动技能(加点)

import type { GameState } from '../../../game/state';
import { CLASS_DEFS } from '../../../game/class';
import { DIFFICULTY_MODS } from '../../../game/difficulty';
import { expNext } from '../../../game/character/commands';
import { getSkill, SKILL_SLOTS, slotDisplay } from '../../../game/skill';
import { PASSIVE_IDS, PASSIVE_DEFS, passiveLevel } from '../../../game/passive';
import { RUNE_DEFS } from '../../../game/rune';
import { DAMAGE_TYPES } from '../../../game/combat';
import { CHAR_LAYOUT, charRightX, charSkillRects, charPassiveRects, inRect } from '../../../game/uigrid';
import { getMouseX, getMouseY } from '../types';

// 角色信息面板 (C 键, dungeon/town 内打开)
export function drawCharacterPanel(ctx2d: CanvasRenderingContext2D, state: GameState, vw: number): void {
  if (state.screen !== 'character') return;
  const mx = getMouseX();
  const my = getMouseY();
  const p = state.player;
  ctx2d.fillStyle = 'rgba(8, 8, 14, 0.94)';
  ctx2d.fillRect(0, 0, vw, state.viewport.h);
  ctx2d.font = 'bold 20px monospace';
  ctx2d.fillStyle = '#ffd';
  ctx2d.textAlign = 'left';
  ctx2d.fillText(`角色信息 — ${CLASS_DEFS[p.classId].name} Lv ${p.level} · 技能点 ${p.skillPoints ?? 0}  [C/Esc] 关闭`, CHAR_LAYOUT.titleX, CHAR_LAYOUT.titleY);

  // 关闭按钮 (与装备面板一致, 左上角)
  const bc = CHAR_LAYOUT.btnClose;
  const bcHv = inRect(mx, my, bc.x, bc.y, bc.w, bc.h);
  ctx2d.fillStyle = bcHv ? '#c9aaff' : '#5a2a2a';
  ctx2d.fillRect(bc.x, bc.y, bc.w, bc.h);
  ctx2d.fillStyle = '#fff';
  ctx2d.font = 'bold 13px monospace';
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  ctx2d.fillText('[Esc] 关闭', bc.x + bc.w / 2, bc.y + bc.h / 2 + 1);
  ctx2d.textAlign = 'left';
  ctx2d.textBaseline = 'top';

  // 左: 基础属性
  ctx2d.font = 'bold 14px monospace';
  ctx2d.fillStyle = '#ffd';
  ctx2d.fillText('基础属性', CHAR_LAYOUT.attrX, CHAR_LAYOUT.attrY - 50);
  const c = p.combat;
  const attrRows: [string, string][] = [
    ['职业', `${CLASS_DEFS[p.classId].name} (${CLASS_DEFS[p.classId].title})`],
    ['难度', `${DIFFICULTY_MODS[state.difficulty].name}`],
    ['等级', `${p.level}`],
    ['经验', `${p.exp} / ${expNext(p.level)}`],
    ['技能点', `${p.skillPoints ?? 0}`],
    ['金币', `${p.gold}`],
    ['生命', `${Math.round(p.hp)} / ${Math.round(p.hpMax)}`],
    ['法力', `${Math.round(p.mp)} / ${Math.round(p.mpMax)}`],
    ['移速', `+${Math.round(((p.speedMult ?? 1) - 1) * 100)}%`],
    ['物理加成', `+${Math.round(c.physPct * 100)}%`],
    ['元素加成', `+${Math.round(c.elemPct * 100)}%`],
    ['暴击率', `${Math.round(c.critRate * 100)}%`],
    ['暴伤', `+${c.critBonus}%`],
    ['减抗', `${c.shred}`],
    ['易伤', `+${Math.round(c.vuln)}%`],
  ];
  let ry = CHAR_LAYOUT.attrY;
  for (const [k, v] of attrRows) {
    ctx2d.fillStyle = '#aaa';
    ctx2d.font = '13px monospace';
    ctx2d.fillText(k, CHAR_LAYOUT.attrX, ry);
    ctx2d.fillStyle = '#eee';
    ctx2d.fillText(v, CHAR_LAYOUT.attrX + 90, ry);
    ry += CHAR_LAYOUT.attrRowH;
  }

  // 中: 主动技能 6 槽
  const skillRects = charSkillRects(vw);
  const skillW = skillRects[0].w;
  ctx2d.font = 'bold 14px monospace';
  ctx2d.fillStyle = '#ffd';
  ctx2d.fillText('主动技能 [点击] 加点', CHAR_LAYOUT.skillX, CHAR_LAYOUT.skillY - 50);
  for (let i = 0; i < SKILL_SLOTS.length; i++) {
    const slot = SKILL_SLOTS[i];
    const sk = getSkill(slot);
    const r = skillRects[i];
    const hv = inRect(mx, my, r.x, r.y, r.w, r.h);
    ctx2d.fillStyle = hv ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)';
    ctx2d.fillRect(r.x, r.y, r.w, r.h);
    ctx2d.strokeStyle = hv ? '#9cf' : '#3a3a48';
    ctx2d.lineWidth = hv ? 2 : 1;
    ctx2d.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    ctx2d.textBaseline = 'middle';
    ctx2d.fillStyle = '#aaa';
    ctx2d.font = '13px monospace';
    ctx2d.fillText(`${slotDisplay(slot)}`, r.x + 8, r.y + r.h / 2 + 1);
    ctx2d.fillStyle = '#eee';
    ctx2d.font = 'bold 13px monospace';
    ctx2d.fillText(sk.name, r.x + 118, r.y + r.h / 2 + 1);
    ctx2d.fillStyle = sk.rune && sk.rune !== 'none' ? `rgb(${RUNE_DEFS[sk.rune].color.map(v => Math.round(v * 255)).join(',')})` : '#889';
    ctx2d.fillText(`Lv${sk.level}${sk.rune && sk.rune !== 'none' ? ' ' + RUNE_DEFS[sk.rune].name : ''}`, r.x + skillW - 70, r.y + r.h / 2 + 1);
    ctx2d.textBaseline = 'top';
  }

  // 右: 被动技能 10 槽 (选中高亮, 双行)
  const pr = { x: charRightX(vw), y: CHAR_LAYOUT.passiveY };
  ctx2d.font = 'bold 14px monospace';
  ctx2d.fillStyle = '#ffd';
  ctx2d.fillText('被动技能 [1-9,0] 选 · [Enter] 升级', pr.x, pr.y - 50);
  const pRects = charPassiveRects(vw);
  for (let i = 0; i < PASSIVE_IDS.length; i++) {
    const id = PASSIVE_IDS[i];
    const def = PASSIVE_DEFS[id];
    const lv = passiveLevel(state, id);
    const r = pRects[i];
    const sel = i === state.characterSel;
    const hv = inRect(mx, my, r.x, r.y, r.w, r.h);
    ctx2d.fillStyle = sel ? 'rgba(255,214,74,0.14)' : hv ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)';
    ctx2d.fillRect(r.x, r.y, r.w, r.h);
    ctx2d.strokeStyle = sel ? '#ffd64a' : hv ? '#9cf' : '#3a3a48';
    ctx2d.lineWidth = sel ? 2 : hv ? 2 : 1;
    ctx2d.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    ctx2d.fillStyle = sel ? '#ffd64a' : '#ccc';
    ctx2d.font = 'bold 13px monospace';
    ctx2d.fillText(`${i + 1}. ${def.name}  Lv ${lv}${lv >= def.maxLevel ? ' (满)' : ''}${sel ? ' ◀' : ''}`, r.x + 8, r.y + 8);
    ctx2d.fillStyle = sel ? '#fda' : '#889';
    ctx2d.font = '11px monospace';
    ctx2d.fillText(`   ${def.desc} · ${def.perLv}`, r.x + 8, r.y + 26);
  }
  ctx2d.fillStyle = '#888';
  ctx2d.font = '12px monospace';
  ctx2d.fillText(`抗性: ${DAMAGE_TYPES.map(t => `${t}:${c.res[t]}`).join(', ')}`, CHAR_LAYOUT.attrX, ry + 8);
}
