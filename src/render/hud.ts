// HUD 渲染 (GAME_FLOW §9.1 分区布局)
//   左上: HP/MP/EXP 条 + 等级
//   右上: 金币 / 积分 / 击杀 / 难度 (右对齐)
//   左下: 技能槽 Q/F/E/R (图标+等级+符文) + 药水/翻滚/技能点
//   右下: 日志面板 (半透明底)
//   顶部中央: 拾取 toast / COMBO
// 文本用 Canvas2D overlay 绘制, sprite 用 WebGL2

import type { GameState } from '../game/state';
import { MAX_HP, MAX_MP } from '../game/player';
import { drawSprite } from './draw';
import { getLogs, formatLine } from '../util/log';
import { RUNE_DEFS } from '../game/rune';
import { getDamageNums } from '../game/damageNum';
import { getToasts } from '../game/toast';
import { getOwned, getLoot, EQUIP_SLOTS, EQUIP_NAMES, itemPowerDelta, BACKPACK_CAP, RARITY_COLORS, describeAffix } from '../game/equipment';
import { getSkillCooldowns, skillLevel, skillRune, getSkill, SKILL_SLOTS, slotDisplay } from '../game/skill';
import { expNext } from '../game/player';
import { itemPower } from '../game/equipment';
import { DAMAGE_TYPES } from '../game/combat';
import { DIFFICULTY_MODS } from '../game/difficulty';
import { MONSTER_DEFS } from '../game/monster';
import { worldToScreen } from '../game/state';
import { pageCount, pageOf, cellIndex, cellRects, slotRects, inRect, EQ_LAYOUT } from '../game/uigrid';

// 鼠标 reticle 全局位置 (由 main loop 每帧设置)
let mouseX = 0;
let mouseY = 0;
export function setMouseReticle(x: number, y: number): void { mouseX = x; mouseY = y; }

const BAR_HEIGHT = 16;
const BAR_WIDTH = 240;
const HUD_PAD = 16;
const SLOT_SIZE = 44;
const SLOT_GAP = 10;
/** 技能槽行 Y (左下) */
function slotY(vh: number): number { return vh - 120; }
const SKILL_KEYS = ['Q', 'F', 'E', 'R'] as const;
const SKILL_ICONS = ['buttonA', 'buttonB', 'buttonX', 'buttonY'] as const;
const LOG_LINES = 6;

export function drawHud(
  gl: WebGL2RenderingContext,
  q: import('./gl/resources').QuadResources,
  state: GameState,
): void {
  const nowSec = performance.now() / 1000;
  const hpFrac = Math.max(0, state.player.hp) / MAX_HP;
  const mpFrac = Math.max(0, state.player.mp) / MAX_MP;
  drawSprite(gl, q, state.resources, { x: HUD_PAD, y: HUD_PAD }, { w: BAR_WIDTH * hpFrac, h: BAR_HEIGHT }, 'ui', 'slide_horizontal_color');
  drawSprite(gl, q, state.resources, { x: HUD_PAD, y: HUD_PAD + BAR_HEIGHT + 4 }, { w: BAR_WIDTH * mpFrac, h: BAR_HEIGHT }, 'ui', 'slide_horizontal_color_section_wide');

  // 技能槽 (左下)
  const sy = slotY(state.viewport.h);
  // 槽位→条索引 (SKILL_KEYS = Q/F/E/R, 对应 SkillSlot Q/W/E/R)
  const SLOT_FLASH_IDX: Record<string, number> = { Q: 0, W: 1, E: 2, R: 3 };
  for (let i = 0; i < SKILL_KEYS.length; i++) {
    const x = HUD_PAD + i * (SLOT_SIZE + SLOT_GAP);
    drawSprite(gl, q, state.resources, { x, y: sy }, { w: SLOT_SIZE, h: SLOT_SIZE }, 'icons', SKILL_ICONS[i]);
    // cd 遮罩 (cd > 0 时半透灰)
    const cds = getSkillCooldowns(nowSec);
    if ((cds[SKILL_KEYS[i]] ?? 0) > 0) {
      drawSprite(gl, q, state.resources, { x, y: sy }, { w: SLOT_SIZE, h: SLOT_SIZE }, 'ui', 'slide_horizontal_grey');
    }
    // 施法失败红闪 (OPT-007)
    const fl = state.castFailFlash;
    if (fl && SLOT_FLASH_IDX[fl.slot] === i) {
      drawSprite(gl, q, state.resources, { x, y: sy }, { w: SLOT_SIZE, h: SLOT_SIZE }, 'ui', 'slide_horizontal_color', { color: [1, 0.25, 0.25] });
    }
  }

  // 鼠标 reticle (瞄准环): 屏幕中心 → 鼠标位置的视觉提示
  drawSprite(gl, q, state.resources, { x: mouseX - 8, y: mouseY - 8 }, { w: 16, h: 16 }, 'particles', 'spark_05');
}

export function drawHudOverlay(
  ctx2d: CanvasRenderingContext2D,
  state: GameState,
): void {
  const vw = state.viewport.w;
  const vh = state.viewport.h;
  ctx2d.font = '12px monospace';
  ctx2d.textBaseline = 'top';

  // === 左上: 属性条 + 等级 ===
  // HP/MP 条框 (WebGL 条之上描边 + 数值)
  ctx2d.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx2d.strokeRect(HUD_PAD, HUD_PAD, BAR_WIDTH, BAR_HEIGHT);
  ctx2d.strokeRect(HUD_PAD, HUD_PAD + BAR_HEIGHT + 4, BAR_WIDTH, BAR_HEIGHT);
  ctx2d.fillStyle = '#fff';
  ctx2d.font = 'bold 11px monospace';
  ctx2d.fillText(`HP ${Math.round(state.player.hp)}/${MAX_HP}`, HUD_PAD + 6, HUD_PAD + 2);
  ctx2d.fillText(`MP ${Math.round(state.player.mp)}/${MAX_MP}`, HUD_PAD + 6, HUD_PAD + BAR_HEIGHT + 6);
  // 经验条 + 等级
  const need = expNext(state.player.level);
  const frac = Math.min(1, (state.player.exp ?? 0) / need);
  const expY = HUD_PAD + BAR_HEIGHT * 2 + 12;
  ctx2d.fillStyle = 'rgba(0,0,0,0.5)';
  ctx2d.fillRect(HUD_PAD, expY, BAR_WIDTH, 6);
  ctx2d.fillStyle = '#b070ff';
  ctx2d.fillRect(HUD_PAD, expY, BAR_WIDTH * frac, 6);
  ctx2d.fillStyle = '#dfd6ff';
  ctx2d.font = '12px monospace';
  ctx2d.fillText(`Lv ${state.player.level}   EXP ${state.player.exp ?? 0}/${need}`, HUD_PAD, expY + 10);

  // === 右上: 金币/积分/击杀/难度 (右对齐) ===
  ctx2d.textAlign = 'right';
  const rx = vw - HUD_PAD;
  ctx2d.fillStyle = '#ffd64a';
  ctx2d.font = 'bold 15px monospace';
  ctx2d.fillText(`金 ${state.player.gold ?? 0}`, rx, HUD_PAD);
  ctx2d.fillStyle = '#fff';
  ctx2d.font = '13px monospace';
  ctx2d.fillText(`积分 ${state.score}`, rx, HUD_PAD + 22);
  ctx2d.fillStyle = '#bbb';
  ctx2d.fillText(`击杀 ${state.killsTotal ?? 0}`, rx, HUD_PAD + 40);
  ctx2d.fillStyle = '#9cc';
  ctx2d.fillText(`难度 ${DIFFICULTY_MODS[state.difficulty].name}`, rx, HUD_PAD + 58);
  // 跑局进度 (OPT-012): 剩余小怪数
  if (state.screen === 'dungeon') {
    ctx2d.fillStyle = '#aaf';
    ctx2d.fillText(`剩余 ${state.run.alive} 怪`, rx, HUD_PAD + 76);
  }
  // 小地图 (OPT-024): 战斗场景右上, 现有 walls/monsters 降采样
  if (state.screen === 'dungeon') {
    const mw = 140;
    const mh = Math.round((mw * state.world.h) / state.world.w);
    const mx = rx - mw;
    const my = HUD_PAD + 100;
    ctx2d.fillStyle = 'rgba(8, 8, 16, 0.6)';
    ctx2d.fillRect(mx, my, mw, mh);
    const sx = mw / state.world.w;
    const sy = mh / state.world.h;
    ctx2d.fillStyle = '#5a5a6a';
    for (const w of state.world.walls) {
      ctx2d.fillRect(mx + w.pos.x * sx, my + w.pos.y * sy, Math.max(1, w.size.w * sx), Math.max(1, w.size.h * sy));
    }
    for (const m of state.monsters) {
      ctx2d.fillStyle = MONSTER_DEFS[m.type].boss ? '#f80' : '#f55';
      ctx2d.fillRect(mx + m.pos.x * sx, my + m.pos.y * sy, 2, 2);
    }
    ctx2d.fillStyle = '#fff';
    ctx2d.fillRect(mx + state.player.pos.x * sx - 2, my + state.player.pos.y * sy - 2, 5, 5);
  }
  // 低血量红晕 (OPT-026): HP < 25% 时边缘渐红
  if (state.screen === 'dungeon' && state.player.hp / MAX_HP < 0.25) {
    const g = ctx2d.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.7);
    g.addColorStop(0, 'rgba(180, 0, 0, 0)');
    g.addColorStop(1, 'rgba(180, 0, 0, 0.35)');
    ctx2d.fillStyle = g;
    ctx2d.fillRect(0, 0, vw, vh);
  }
  // 精英名牌 (内容扩充)
  if (state.screen === 'dungeon') {
    for (const m of state.monsters) {
      if (!m.elite) continue;
      const sp = worldToScreen(state, m.pos);
      ctx2d.fillStyle = '#ffd64a';
      ctx2d.font = 'bold 11px monospace';
      ctx2d.textAlign = 'center';
      ctx2d.fillText(`精英·${MONSTER_DEFS[m.type].type}`, sp.x + m.size.w / 2, sp.y - 12);
      ctx2d.textAlign = 'left';
    }
  }
  // Boss 顶栏血条 (内容补): 顶部居中 + 二阶段狂暴预告
  if (state.screen === 'dungeon') {
    const boss = state.monsters.find(m => MONSTER_DEFS[m.type].boss);
    if (boss) {
      const bw = 360;
      const bh = 14;
      const bx = vw / 2 - bw / 2;
      const by = 12;
      ctx2d.fillStyle = 'rgba(0,0,0,0.55)';
      ctx2d.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      const frac = Math.max(0, boss.hp) / boss.maxHp;
      ctx2d.fillStyle = '#b03030';
      ctx2d.fillRect(bx, by, bw * frac, bh);
      ctx2d.fillStyle = '#333';
      ctx2d.fillRect(bx + bw * frac, by, bw * (1 - frac), bh);
      ctx2d.fillStyle = '#fff';
      ctx2d.font = 'bold 12px monospace';
      ctx2d.textAlign = 'center';
      ctx2d.fillText(`${MONSTER_DEFS[boss.type].type}  ${Math.ceil(boss.hp)}/${boss.maxHp}${boss.phase === 2 ? '  [狂暴]' : ''}`, vw / 2, by - 8);
      ctx2d.textAlign = 'left';
    }
  }
  ctx2d.textAlign = 'left';

  // === 左下: 技能簇 ===
  const sy = slotY(vh);
  ctx2d.font = 'bold 11px monospace';
  for (let i = 0; i < SKILL_KEYS.length; i++) {
    const key = SKILL_KEYS[i];
    const x = HUD_PAD + i * (SLOT_SIZE + SLOT_GAP);
    ctx2d.fillStyle = '#fff';
    ctx2d.fillText(key, x + SLOT_SIZE / 2, sy - 16);
    ctx2d.fillStyle = '#aaa';
    ctx2d.font = '10px monospace';
    ctx2d.fillText(`Lv${skillLevel(key)}`, x + 2, sy + SLOT_SIZE + 2);
    const r = skillRune(key);
    if (r !== null && r !== 'none') {
      const col = RUNE_DEFS[r].color;
      ctx2d.fillStyle = `rgb(${col.map(c => Math.round(c * 255)).join(',')})`;
      ctx2d.fillText(RUNE_DEFS[r].name, x + 2, sy + SLOT_SIZE + 14);
    }
  }
  ctx2d.font = '12px monospace';
  ctx2d.fillStyle = '#ffd';
  ctx2d.fillText(
    `药水 1:×${state.player.potions?.hp ?? 0}  2:×${state.player.potions?.mp ?? 0}   翻滚${state.player.dodgeCd > 0 ? ` ${state.player.dodgeCd.toFixed(1)}s` : ' ✓'}   技能点 ${state.player.skillPoints ?? 0}`,
    HUD_PAD, sy - 34,
  );

  // 技能 cd 倒计时 (槽内)
  const nowSec = performance.now() / 1000;
  ctx2d.font = 'bold 14px monospace';
  ctx2d.fillStyle = '#fff';
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  const cds = getSkillCooldowns(nowSec);
  for (let i = 0; i < SKILL_KEYS.length; i++) {
    const cdLeft = cds[SKILL_KEYS[i]] ?? 0;
    if (cdLeft > 0.05) {
      ctx2d.fillText(cdLeft.toFixed(1), HUD_PAD + i * (SLOT_SIZE + SLOT_GAP) + SLOT_SIZE / 2, sy + SLOT_SIZE / 2);
    }
  }
  ctx2d.textAlign = 'left';
  ctx2d.textBaseline = 'top';

  // === 右下: 日志面板 (半透明底) ===
  drawLogPanel(ctx2d, vw, vh);

  // === 顶部中央: 拾取 toast ===
  const toasts = getToasts(state);
  if (toasts.length > 0) {
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
  if (state.combo.count > 1 && state.combo.timer > 0) {
    ctx2d.textAlign = 'center';
    ctx2d.fillStyle = '#ffd64a';
    ctx2d.font = 'bold 22px monospace';
    ctx2d.fillText(`COMBO x${state.combo.count}`, vw / 2, 118);
    ctx2d.textAlign = 'left';
  }

  // 符文三选一 overlay (D-01)
  const choice = state.runeChoice;
  if (choice) {
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

  // 伤害数字 (世界坐标 → 屏幕)
  ctx2d.font = 'bold 14px monospace';
  ctx2d.textAlign = 'center';
  for (const d of getDamageNums(state)) {
    const sp = worldToScreen(state, d.pos);
    if (sp.x < 0 || sp.x > vw || sp.y < 0 || sp.y > vh) continue;
    ctx2d.fillStyle = d.color;
    ctx2d.fillText(d.text, sp.x, sp.y);
  }
  ctx2d.textAlign = 'left';

  // 升级全屏金光 (US-019)
  if (state.levelUpFlash > 0) {
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

  // 装备面板 (OPT-014, A1): 左穿戴槽 + 中背包(滚动/选择/对比) + 右聚合属性
  if (state.screen === 'equipment') {
    const owned = getOwned(state);
    ctx2d.fillStyle = 'rgba(8, 8, 14, 0.94)';
    ctx2d.fillRect(0, 0, vw, vh);
    ctx2d.font = 'bold 20px monospace';
    ctx2d.fillStyle = '#ffd';
    ctx2d.textAlign = 'left';
    ctx2d.fillText(`装备 — 背包 ${owned.length}/${BACKPACK_CAP}  [Tab/Esc] 关闭`, 32, 40);

    // 左: 穿戴 4 槽 (可视化, C-504)
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

    // 中: 背包 4×5 网格 + 分页 (C-502)
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
      const hv = inRect(mouseX, mouseY, c2.x, c2.y, EQ_LAYOUT.cellSize, EQ_LAYOUT.cellSize);
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
    // 分页指示
    ctx2d.fillStyle = '#889';
    ctx2d.font = '12px monospace';
    ctx2d.fillText(`第 ${curPage + 1}/${pc} 页 · 滚轮 / PageUp·PageDown 翻页 · 方向键选格 · 点击选格`, EQ_LAYOUT.gridX, EQ_LAYOUT.btnY - 18);
    // 按钮 (C-501 鼠标路径)
    const btns: Array<{ r: { x: number; y: number; w: number; h: number }; label: string; color: string }> = [
      { r: EQ_LAYOUT.btnEquip, label: '[A] 装备', color: '#2a6a3a' },
      { r: EQ_LAYOUT.btnUnequip, label: '[U] 卸下', color: '#7a2a2a' },
    ];
    for (const b of btns) {
      const hv2 = inRect(mouseX, mouseY, b.r.x, b.r.y, b.r.w, b.r.h);
      ctx2d.fillStyle = hv2 ? '#c9aaff' : b.color;
      ctx2d.fillRect(b.r.x, b.r.y, b.r.w, b.r.h);
      ctx2d.fillStyle = '#fff';
      ctx2d.font = 'bold 13px monospace';
      ctx2d.textAlign = 'center';
      ctx2d.fillText(b.label, b.r.x + b.r.w / 2, b.r.y + b.r.h / 2 + 4);
      ctx2d.textAlign = 'left';
    }
    // tooltip: 选中物品详情 (C-502)
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
}

function drawLogPanel(ctx2d: CanvasRenderingContext2D, vw: number, vh: number) {
  // 玩家侧只显示 WRN/ERR (OPT-009): 调试 INF/DBG 不进玩家面板 (L 键切 console 级别保留)
  const logs = getLogs().filter(e => e.level === 'WRN' || e.level === 'ERR');
  const lines = logs.slice(-LOG_LINES);
  const x = vw - 380;
  const y = vh - LOG_LINES * 15 - 14;
  const w = 364;
  const h = LOG_LINES * 15 + 8;
  if (lines.length > 0) {
    ctx2d.fillStyle = 'rgba(8,8,16,0.55)';
    ctx2d.fillRect(x, y, w, h);
  }
  ctx2d.font = '11px monospace';
  ctx2d.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    const e = lines[i];
    ctx2d.fillStyle =
      e.level === 'ERR' ? '#f88' :
      e.level === 'WRN' ? '#fc8' :
      e.level === 'INF' ? '#ddd' : '#999';
    ctx2d.fillText(formatLine(e).slice(0, 60), x + 6, y + 4 + i * 15);
  }
  ctx2d.fillStyle = '#fff';
}