// HUD overlay 面板: toasts / COMBO / 符文三选一 / 地面标签 / 伤害数字 / 升级金光 / 药水翻滚按钮 / 装备面板

import type { GameState } from '../../game/state';
import { getToasts } from '../../game/toast';
import { getDamageNums } from '../../game/fx/damageNum';
import { getOwned, getLoot, EQUIP_SLOTS, EQUIP_NAMES, BACKPACK_CAP, RARITY_COLORS, itemPower, itemPowerDelta, describeAffix } from '../../game/equipment';
import { getSkill, SKILL_SLOTS, slotDisplay } from '../../game/skill';
import { RUNE_DEFS } from '../../game/rune';
import { DAMAGE_TYPES } from '../../game/combat';
import { worldToScreen } from '../../game/state';
import { pageCount, pageOf, cellIndex, cellRects, slotRects, inRect, EQ_LAYOUT } from '../../game/uigrid';
import { HUD_PAD, type HudBtn, getMouseX, getMouseY, getHudHover } from './types';
import { drawIcon } from './icons';
import { hudDungeonButtons } from './buttons';

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
  if (!(state.combo.count > 1 && state.combo.timer > 0)) return;
  ctx2d.textAlign = 'center';
  ctx2d.fillStyle = '#ffd64a';
  ctx2d.font = 'bold 22px monospace';
  ctx2d.fillText(`COMBO x${state.combo.count}`, vw / 2, 118);
  ctx2d.textAlign = 'left';
}

// 符文三选一 overlay (D-01)
export function drawRuneChoice(ctx2d: CanvasRenderingContext2D, state: GameState, vw: number, vh: number): void {
  const choice = state.runeChoice;
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

// 升级全屏金光 (US-019)
export function drawLevelUpFlash(ctx2d: CanvasRenderingContext2D, state: GameState, vw: number, vh: number): void {
  if (state.levelUpFlash <= 0) return;
  const a = Math.min(1, state.levelUpFlash / 0.3);
  ctx2d.globalAlpha = a * 0.30;
  ctx2d.fillStyle = '#ffd700';
  ctx2d.fillRect(0, 0, vw, vh);
  ctx2d.globalAlpha = a;
  ctx2d.fillStyle = '#fff';
  ctx2d.font = 'bold 56px monospace';
  ctx2d.textAlign = 'center';
  ctx2d.fillText(`LEVEL UP → ${state.player.level}`, vw / 2, vh / 2 - 40);
  ctx2d.globalAlpha = 1;
  ctx2d.font = '12px monospace';
  ctx2d.textAlign = 'left';
}

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

// 装备面板 (OPT-014, A1)
export function drawEquipmentPanel(ctx2d: CanvasRenderingContext2D, state: GameState, vw: number): void {
  if (state.screen !== 'equipment') return;
  const owned = getOwned(state);
  const mx = getMouseX();
  const my = getMouseY();
  ctx2d.fillStyle = 'rgba(8, 8, 14, 0.94)';
  ctx2d.fillRect(0, 0, vw, state.viewport.h);
  ctx2d.font = 'bold 20px monospace';
  ctx2d.fillStyle = '#ffd';
  ctx2d.textAlign = 'left';
  ctx2d.fillText(`装备 — 背包 ${owned.length}/${BACKPACK_CAP}  [Tab/Esc] 关闭`, 32, 40);

  // 左: 穿戴 4 槽
  ctx2d.font = 'bold 14px monospace';
  ctx2d.fillStyle = '#ffd';
  ctx2d.fillText('穿戴', EQ_LAYOUT.slotX, EQ_LAYOUT.slotY - 12);
  const slotR = slotRects();
  for (let i = 0; i < EQUIP_SLOTS.length; i++) {
    const t = EQUIP_SLOTS[i];
    const s = slotR[i];
    const eq = state.player.equipped[t];
    const col = eq ? RARITY_COLORS[eq.rarity] : null;
    ctx2d.setLineDash(col ? [] : [4, 3]);
    ctx2d.strokeStyle = col ? `rgb(${col.map(v => Math.round(v * 255)).join(',')})` : '#556';
    ctx2d.lineWidth = col ? 3 : 1.5;
    ctx2d.strokeRect(s.x, s.y, EQ_LAYOUT.slotSize, EQ_LAYOUT.slotSize);
    ctx2d.setLineDash([]);
    ctx2d.fillStyle = col ? `rgb(${col.map(v => Math.round(v * 255 * 0.35)).join(',')})` : '#232330';
    ctx2d.fillRect(s.x + 2, s.y + 2, EQ_LAYOUT.slotSize - 4, EQ_LAYOUT.slotSize - 4);
    ctx2d.fillStyle = '#fff';
    ctx2d.font = 'bold 24px monospace';
    ctx2d.textAlign = 'center';
    ctx2d.fillText(EQUIP_NAMES[t][0], s.x + EQ_LAYOUT.slotSize / 2, s.y + EQ_LAYOUT.slotSize / 2 + 8);
    ctx2d.font = '11px monospace';
    ctx2d.fillStyle = col ? `rgb(${col.map(v => Math.round(v * 255)).join(',')})` : '#556';
    ctx2d.fillText(eq ? `战力+${itemPower(eq)}` : '(空)', s.x + EQ_LAYOUT.slotSize / 2, s.y + EQ_LAYOUT.slotSize + 14);
    ctx2d.textAlign = 'left';
  }

  // 中: 背包 4×5 网格 + 分页
  ctx2d.font = 'bold 14px monospace';
  ctx2d.fillStyle = '#ffd';
  ctx2d.fillText('背包', EQ_LAYOUT.gridX, EQ_LAYOUT.gridY - 12);
  const pc = pageCount(owned.length);
  const curPage = Math.min(pageOf(state.equipSel), pc - 1);
  const cells = cellRects();
  for (let i = 0; i < cells.length; i++) {
    const c2 = cells[i];
    const idx = cellIndex(c2.col, c2.row, curPage, owned.length);
    const eq = idx !== null ? owned[idx] : undefined;
    const sel = idx === state.equipSel;
    const hv = inRect(mx, my, c2.x, c2.y, EQ_LAYOUT.cellSize, EQ_LAYOUT.cellSize);
    ctx2d.fillStyle = eq ? `rgb(${RARITY_COLORS[eq.rarity].map(v => Math.round(v * 255 * 0.45)).join(',')})` : 'rgba(18,18,28,0.85)';
    ctx2d.fillRect(c2.x, c2.y, EQ_LAYOUT.cellSize, EQ_LAYOUT.cellSize);
    ctx2d.strokeStyle = sel ? '#ffd64a' : hv ? '#9cf' : '#3a3a48';
    ctx2d.lineWidth = sel ? 3 : hv ? 2 : 1;
    ctx2d.strokeRect(c2.x, c2.y, EQ_LAYOUT.cellSize, EQ_LAYOUT.cellSize);
    if (eq) {
      ctx2d.fillStyle = '#fff';
      ctx2d.font = 'bold 14px monospace';
      ctx2d.textAlign = 'center';
      ctx2d.fillText(eq.name.slice(0, 2), c2.x + EQ_LAYOUT.cellSize / 2, c2.y + EQ_LAYOUT.cellSize / 2 + 5);
      ctx2d.textAlign = 'left';
    }
  }
  ctx2d.fillStyle = '#889';
  ctx2d.font = '12px monospace';
  ctx2d.fillText(`第 ${curPage + 1}/${pc} 页 · 滚轮 / PageUp·PageDown 翻页 · 方向键选格 · 点击选格`, EQ_LAYOUT.gridX, EQ_LAYOUT.btnY - 18);
  const btns: Array<{ r: { x: number; y: number; w: number; h: number }; label: string; color: string }> = [
    { r: EQ_LAYOUT.btnEquip, label: '[A] 装备', color: '#2a6a3a' },
    { r: EQ_LAYOUT.btnUnequip, label: '[U] 卸下', color: '#7a2a2a' },
    { r: EQ_LAYOUT.btnPrev, label: '← 上一页', color: '#2a3a5a' },
    { r: EQ_LAYOUT.btnNext, label: '下一页 →', color: '#2a3a5a' },
    { r: EQ_LAYOUT.btnClose, label: '[Esc] 关闭', color: '#5a2a2a' },
  ];
  for (const b of btns) {
    const hv2 = inRect(mx, my, b.r.x, b.r.y, b.r.w, b.r.h);
    ctx2d.fillStyle = hv2 ? '#c9aaff' : b.color;
    ctx2d.fillRect(b.r.x, b.r.y, b.r.w, b.r.h);
    ctx2d.fillStyle = '#fff';
    ctx2d.font = 'bold 13px monospace';
    ctx2d.textAlign = 'center';
    ctx2d.fillText(b.label, b.r.x + b.r.w / 2, b.r.y + b.r.h / 2 + 4);
    ctx2d.textAlign = 'left';
  }
  // tooltip: 选中物品详情
  const selEq = owned[state.equipSel];
  if (selEq) {
    ctx2d.fillStyle = '#10141c';
    ctx2d.fillRect(EQ_LAYOUT.gridX, EQ_LAYOUT.tipY, 460, 46);
    ctx2d.fillStyle = `rgb(${RARITY_COLORS[selEq.rarity].map(v => Math.round(v * 255)).join(',')})`;
    ctx2d.font = 'bold 13px monospace';
    ctx2d.fillText(selEq.name, EQ_LAYOUT.gridX + 8, EQ_LAYOUT.tipY + 16);
    ctx2d.fillStyle = '#bbb';
    ctx2d.font = '12px monospace';
    ctx2d.fillText(selEq.affixes.map(describeAffix).join('  ').slice(0, 64), EQ_LAYOUT.gridX + 8, EQ_LAYOUT.tipY + 32);
    const old = state.player.equipped[selEq.type];
    if (old) {
      const delta = itemPowerDelta(selEq, old);
      ctx2d.fillStyle = delta > 0 ? '#4f4' : delta < 0 ? '#f66' : '#aaa';
      ctx2d.fillText(`战力+${itemPower(selEq)} vs ${old.name} ${delta > 0 ? '+' : ''}${delta}`, EQ_LAYOUT.gridX + 300, EQ_LAYOUT.tipY + 16);
    } else {
      ctx2d.fillStyle = '#89a';
      ctx2d.fillText(`战力+${itemPower(selEq)}`, EQ_LAYOUT.gridX + 300, EQ_LAYOUT.tipY + 16);
    }
  }
  // 聚合战斗属性 (右列)
  const c = state.player.combat;
  const rx = vw - 360;
  ctx2d.fillStyle = '#ffd';
  ctx2d.font = 'bold 15px monospace';
  ctx2d.fillText('战斗属性 (D-04 聚合)', rx, 40);
  ctx2d.font = '13px monospace';
  const rows: [string, string][] = [
    ['等级', `${state.player.level}`],
    ['技能点', `${state.player.skillPoints ?? 0}`],
    ['物理加成', `+${Math.round(c.physPct * 100)}%`],
    ['元素加成', `+${Math.round(c.elemPct * 100)}%`],
    ['暴击率', `${Math.round(c.critRate * 100)}%`],
    ['暴击伤害', `+${c.critBonus}%`],
    ['减抗', `${c.shred}`],
    ['易伤', `+${Math.round(c.vuln)}%`],
    ['抗性', DAMAGE_TYPES.map(t => `${t}:${c.res[t]}`).join(' ')],
  ];
  let ry = 66;
  for (const [k, v] of rows) {
    ctx2d.fillStyle = '#aaa';
    ctx2d.fillText(k, rx, ry);
    ctx2d.fillStyle = '#eee';
    ctx2d.fillText(v, rx + 130, ry);
    ry += 20;
  }
  ctx2d.fillStyle = '#888';
  ctx2d.font = '12px monospace';
  ry += 8;
  ctx2d.fillStyle = '#ffd';
  ctx2d.font = 'bold 14px monospace';
  ctx2d.fillText('技能', rx, ry); ry += 18;
  ctx2d.font = '13px monospace';
  for (const slot of SKILL_SLOTS) {
    const sk = getSkill(slot);
    ctx2d.fillStyle = '#aaa';
    ctx2d.fillText(`${slotDisplay(slot)} ${sk.name}`, rx, ry);
    ctx2d.fillStyle = '#eee';
    ctx2d.fillText(`Lv${sk.level}${sk.rune && sk.rune !== 'none' ? '  ' + RUNE_DEFS[sk.rune].name : ''}`, rx + 160, ry);
    ry += 18;
  }
  ctx2d.fillStyle = '#888';
  ctx2d.fillText('被动槽: 10 (规划中, 未实现)', rx, ry + 2);
  ctx2d.fillText('词条拾取即自动生效 (聚合进左侧属性)', rx, ry + 20);
  ctx2d.fillText('多余装备去城镇商人处卖出换金 (6键)', rx, ry + 38);
}