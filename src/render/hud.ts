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
import { getOwned, getLoot, RARITY_COLORS, describeAffix } from '../game/equipment';
import { getSkillCooldowns, skillLevel, skillRune, getSkill, SKILL_SLOTS } from '../game/skill';
import { expNext } from '../game/player';
import { DAMAGE_TYPES } from '../game/combat';
import { DIFFICULTY_MODS } from '../game/difficulty';
import { worldToScreen } from '../game/state';

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
  for (let i = 0; i < SKILL_KEYS.length; i++) {
    const x = HUD_PAD + i * (SLOT_SIZE + SLOT_GAP);
    drawSprite(gl, q, state.resources, { x, y: sy }, { w: SLOT_SIZE, h: SLOT_SIZE }, 'icons', SKILL_ICONS[i]);
    // cd 遮罩 (cd > 0 时半透灰)
    const cds = getSkillCooldowns(nowSec);
    if ((cds[SKILL_KEYS[i]] ?? 0) > 0) {
      drawSprite(gl, q, state.resources, { x, y: sy }, { w: SLOT_SIZE, h: SLOT_SIZE }, 'ui', 'slide_horizontal_grey');
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
  ctx2d.fillText(`击杀 ${state.monsters.length}`, rx, HUD_PAD + 40);
  ctx2d.fillStyle = '#9cc';
  ctx2d.fillText(`难度 ${DIFFICULTY_MODS[state.difficulty].name}`, rx, HUD_PAD + 58);
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
    ctx2d.fillText(`${choice.slot} 达到 Lv10 — 选择符文变异`, vw / 2, y0 - 34);
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

  // 装备面板 (US-014)
  if (state.equipmentOpen) {
    const owned = getOwned(state);
    ctx2d.fillStyle = 'rgba(8, 8, 14, 0.93)';
    ctx2d.fillRect(0, 0, vw, vh);
    ctx2d.font = 'bold 20px monospace';
    ctx2d.fillStyle = '#ffd';
    ctx2d.textAlign = 'left';
    ctx2d.fillText(`装备 (${owned.length} 件)  —  [Tab/Esc] 关闭`, 32, 40);
    ctx2d.font = '13px monospace';
    let py = 68;
    const shown = Math.min(owned.length, 20);
    for (let i = 0; i < shown; i++) {
      const eq = owned[i];
      const col = RARITY_COLORS[eq.rarity];
      ctx2d.fillStyle = `rgb(${col.map(v => Math.round(v * 255)).join(',')})`;
      ctx2d.fillText(`${i + 1}. ${eq.name}`, 40, py);
      ctx2d.fillStyle = '#bbb';
      ctx2d.fillText(eq.affixes.map(describeAffix).join('  '), 320, py);
      py += 20;
    }
    if (owned.length > shown) {
      ctx2d.fillStyle = '#777';
      ctx2d.fillText(`…还有 ${owned.length - shown} 件`, 40, py);
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
      ctx2d.fillText(`${slot} ${sk.name}`, rx, ry);
      ctx2d.fillStyle = '#eee';
      ctx2d.fillText(`Lv${sk.level}${sk.rune && sk.rune !== 'none' ? '  ' + RUNE_DEFS[sk.rune].name : ''}`, rx + 160, ry);
      ry += 18;
    }
    ctx2d.fillStyle = '#888';
    ctx2d.fillText('被动槽: 10 (规划中, 未实现)', rx, ry + 2);
    ctx2d.fillText('反伤/移动速度 等: 见词条 UI (未展开)', rx, ry + 20);
  }
}

function drawLogPanel(ctx2d: CanvasRenderingContext2D, vw: number, vh: number) {
  const logs = getLogs();
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