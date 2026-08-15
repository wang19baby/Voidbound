// HUD overlay: 装备面板 (OPT-014, A1) — 左穿戴槽 + 中背包(滚动/选择/对比) + 右聚合属性

import type { GameState } from '../../../game/state';
import { getOwned, EQUIP_SLOTS, EQUIP_NAMES, BACKPACK_CAP, RARITY_COLORS, itemPower, itemPowerDelta, describeAffix } from '../../../game/equipment';
import { getSkill, SKILL_SLOTS, slotDisplay } from '../../../game/skill';
import { RUNE_DEFS } from '../../../game/rune';
import { DAMAGE_TYPES } from '../../../game/combat';
import { pageCount, pageOf, cellIndex, cellRects, slotRects, inRect, EQ_LAYOUT } from '../../../game/uigrid';
import { getMouseX, getMouseY } from '../types';

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
  ctx2d.fillText(`装备 — 背包 ${owned.length}/${BACKPACK_CAP}  [Tab/Esc] 关闭`, EQ_LAYOUT.titleX, EQ_LAYOUT.titleY);

  // 左: 穿戴 4 槽 (2×2, 2026-08-15 重设计 — 信息面板移到下方)
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
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(eq ? eq.name.slice(0, 1) : EQUIP_NAMES[t][0], s.x + EQ_LAYOUT.slotSize / 2, s.y + EQ_LAYOUT.slotSize / 2 + 1);
  }
  ctx2d.textAlign = 'left';
  ctx2d.textBaseline = 'top';

  // 选中装备详情 (穿戴区下方, 2026-08-15: 原底部 tooltip 移此, 词条逐行)
  const selEq = owned[state.equip.sel];
  const tipX = EQ_LAYOUT.tipX, tipY = EQ_LAYOUT.tipY, tipW = EQ_LAYOUT.tipW;
  const tipH = selEq ? 34 + selEq.affixes.length * 16 + 20 : 30;
  ctx2d.fillStyle = '#10141c';
  ctx2d.fillRect(tipX, tipY, tipW, tipH);
  ctx2d.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx2d.lineWidth = 1;
  ctx2d.strokeRect(tipX, tipY, tipW, tipH);
  if (selEq) {
    const col = `rgb(${RARITY_COLORS[selEq.rarity].map(v => Math.round(v * 255)).join(',')})`;
    ctx2d.fillStyle = col;
    ctx2d.font = 'bold 13px monospace';
    ctx2d.fillText(selEq.name, tipX + 8, tipY + 16);
    const old = state.player.equipped[selEq.type];
    const delta = old ? itemPowerDelta(selEq, old) : 0;
    ctx2d.fillStyle = old ? (delta > 0 ? '#4f4' : delta < 0 ? '#f66' : '#aaa') : '#89a';
    ctx2d.font = '12px monospace';
    ctx2d.fillText(
      old ? `战力+${itemPower(selEq)} vs ${old.name} ${delta > 0 ? '+' : ''}${delta}` : `战力+${itemPower(selEq)}`,
      tipX + 8, tipY + 32,
    );
    ctx2d.fillStyle = '#bbb';
    ctx2d.font = '12px monospace';
    let ay = tipY + 50;
    for (const af of selEq.affixes) {
      ctx2d.fillText(describeAffix(af), tipX + 8, ay);
      ay += 16;
    }
    ctx2d.fillStyle = '#678';
    ctx2d.font = '11px monospace';
    ctx2d.fillText('[A] 装备  [U] 卸下', tipX + 8, tipY + tipH - 12);
  } else {
    ctx2d.fillStyle = '#556';
    ctx2d.font = '12px monospace';
    ctx2d.fillText('选择背包物品查看详情', tipX + 8, tipY + 20);
  }

  // 中: 背包 10×10 网格 + 分页
  ctx2d.font = 'bold 14px monospace';
  ctx2d.fillStyle = '#ffd';
  ctx2d.fillText('背包', EQ_LAYOUT.gridX, EQ_LAYOUT.gridY - 12);
  const pc = pageCount(owned.length);
  const curPage = Math.min(pageOf(state.equip.sel), pc - 1);
  const cells = cellRects();
  for (let i = 0; i < cells.length; i++) {
    const c2 = cells[i];
    const idx = cellIndex(c2.col, c2.row, curPage, owned.length);
    const eq = idx !== null ? owned[idx] : undefined;
    const sel = idx === state.equip.sel;
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
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(b.label, b.r.x + b.r.w / 2, b.r.y + b.r.h / 2 + 1);
    ctx2d.textAlign = 'left';
    ctx2d.textBaseline = 'top';
  }
  // 聚合战斗属性 (右列, 与左/中列标题对齐)
  const c = state.player.combat;
  const rx = vw - 360;
  ctx2d.fillStyle = '#ffd';
  ctx2d.font = 'bold 14px monospace';
  ctx2d.fillText('战斗属性 (D-04 聚合)', rx, EQ_LAYOUT.gridY - 12);
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
  let ry = EQ_LAYOUT.gridY;
  for (const [k, v] of rows) {
    ctx2d.fillStyle = '#aaa';
    ctx2d.fillText(k, rx, ry);
    ctx2d.fillStyle = '#eee';
    if (k === '抗性') {
      // UI-FIX4: 抗性行用 11px 字号 + 逗号分隔, 防止 350 px 文字溢出右边界 120 px
      ctx2d.save();
      ctx2d.font = '11px monospace';
      ctx2d.fillText(DAMAGE_TYPES.map(t => `${t}:${c.res[t]}`).join(', '), rx + 130, ry);
      ctx2d.restore();
    } else {
      ctx2d.fillText(v, rx + 130, ry);
    }
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
