// HUD 渲染: 屏幕顶 HP 条 + MP 条 + 4 个技能槽 + 玩家坐标文本 + 日志面板
// 文本用 Canvas2D overlay 绘制, sprite 用 WebGL2

import type { GameState } from '../game/state';
import { MAX_HP, MAX_MP } from '../game/player';
import { drawSprite } from './draw';
import { getLogs, formatLine } from '../util/log';
import { RUNE_DEFS, getActiveRune } from '../game/rune';
import { getDamageNums } from '../game/damageNum';
import { getSkillCooldowns, skillLevel, skillRune } from '../game/skill';
import { worldToScreen } from '../game/state';

// 鼠标 reticle 全局位置 (由 main loop 每帧设置)
let mouseX = 0;
let mouseY = 0;
export function setMouseReticle(x: number, y: number): void { mouseX = x; mouseY = y; }

const BAR_HEIGHT = 16;
const BAR_WIDTH = 240;
const HUD_PAD = 16;
const SLOT_SIZE = 40;
const SLOT_GAP = 8;
const SKILL_KEYS = ['Q', 'W', 'E', 'R'] as const;
const SKILL_ICONS = ['buttonA', 'buttonB', 'buttonX', 'buttonY'] as const;
const LOG_LINES = 6;

export function drawHud(
  gl: WebGL2RenderingContext,
  q: import('./gl/resources').QuadResources,
  state: GameState,
): void {
  const hpFrac = Math.max(0, state.player.hp) / MAX_HP;
  const mpFrac = Math.max(0, state.player.mp) / MAX_MP;
  drawSprite(gl, q, state.resources, { x: HUD_PAD, y: HUD_PAD }, { w: BAR_WIDTH * hpFrac, h: BAR_HEIGHT }, 'ui', 'slide_horizontal_color');
  drawSprite(gl, q, state.resources, { x: HUD_PAD, y: HUD_PAD + BAR_HEIGHT + 4 }, { w: BAR_WIDTH * mpFrac, h: BAR_HEIGHT }, 'ui', 'slide_horizontal_color_section_wide');

  for (let i = 0; i < SKILL_KEYS.length; i++) {
    const x = HUD_PAD + i * (SLOT_SIZE + SLOT_GAP);
    const y = HUD_PAD + (BAR_HEIGHT + 4) * 2 + 8;
    drawSprite(gl, q, state.resources, { x, y }, { w: SLOT_SIZE, h: SLOT_SIZE }, 'icons', SKILL_ICONS[i]);
    // cd 遮罩 (cd > 0 时半透灰)
    const cds = getSkillCooldowns(nowSec);
    if ((cds[SKILL_KEYS[i]] ?? 0) > 0) {
      drawSprite(gl, q, state.resources, { x, y }, { w: SLOT_SIZE, h: SLOT_SIZE }, 'ui', 'slide_horizontal_grey');
    }
  }

  // 鼠标 reticle (瞄准环): 屏幕中心 (玩家身上) → 鼠标位置的视觉提示
  // 用 spark sprite 当准星, 16x16
  drawSprite(gl, q, state.resources, { x: mouseX - 8, y: mouseY - 8 }, { w: 16, h: 16 }, 'particles', 'spark_05');
}

export function drawHudOverlay(
  ctx2d: CanvasRenderingContext2D,
  state: GameState,
): void {
  ctx2d.font = '12px monospace';
  ctx2d.fillStyle = '#fff';
  ctx2d.textBaseline = 'top';
  ctx2d.fillText(`HP ${Math.round(state.player.hp)}/${MAX_HP}`, HUD_PAD, HUD_PAD + BAR_HEIGHT + 20);
  ctx2d.fillText(`MP ${Math.round(state.player.mp)}/${MAX_MP}`, HUD_PAD, HUD_PAD + (BAR_HEIGHT + 4) * 2 + 4);
  ctx2d.fillText(`SCORE ${state.score}`, HUD_PAD, HUD_PAD + (BAR_HEIGHT + 4) * 2 + 8 + SLOT_SIZE + 16);
  ctx2d.fillText(`KILLS ${state.monsters.length}`, HUD_PAD, HUD_PAD + (BAR_HEIGHT + 4) * 2 + 8 + SLOT_SIZE + 30);
  // 技能等级 + 可用技能点
  ctx2d.font = '11px monospace';
  for (let i = 0; i < SKILL_KEYS.length; i++) {
    const slot = SKILL_KEYS[i];
    ctx2d.fillText(`${slot} Lv${skillLevel(slot)}`, HUD_PAD + i * (SLOT_SIZE + SLOT_GAP), HUD_PAD + (BAR_HEIGHT + 4) * 2 + 8 + SLOT_SIZE + 46);
    const r = skillRune(slot);
    if (r !== 'none' && r !== null) {
      const col = RUNE_DEFS[r].color;
      ctx2d.fillStyle = `rgb(${col.map(c => Math.round(c * 255)).join(',')})`;
      ctx2d.fillText(RUNE_DEFS[r].name, HUD_PAD + i * (SLOT_SIZE + SLOT_GAP), HUD_PAD + (BAR_HEIGHT + 4) * 2 + 8 + SLOT_SIZE + 58);
      ctx2d.fillStyle = '#fff';
    }
  }
  ctx2d.fillStyle = '#ffd';
  ctx2d.fillText(`技能点: ${state.player.skillPoints ?? 0} (Ctrl+1..6 分配)`, HUD_PAD, HUD_PAD + (BAR_HEIGHT + 4) * 2 + 8 + SLOT_SIZE + 74);
  ctx2d.fillStyle = '#fff';
  const nowSec = performance.now() / 1000;
  ctx2d.fillText(
    `pos ${state.player.pos.x.toFixed(0)},${state.player.pos.y.toFixed(0)}  fireballs:${state.fireballs.length}  facing:${state.player.facing.x.toFixed(1)},${state.player.facing.y.toFixed(1)}`,
    state.viewport.w - 380, HUD_PAD,
  );

  // 日志面板: 右下, 6 行
  drawLogPanel(ctx2d, state.viewport.h);

  // 技能 cd 倒计时数字 (画在槽内)
  ctx2d.font = 'bold 12px monospace';
  ctx2d.fillStyle = '#fff';
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  const cds = getSkillCooldowns(nowSec);
  for (let i = 0; i < SKILL_KEYS.length; i++) {
    const cdLeft = cds[SKILL_KEYS[i]] ?? 0;
    if (cdLeft > 0.05) {
      const x = HUD_PAD + i * (SLOT_SIZE + SLOT_GAP) + SLOT_SIZE / 2;
      const y = HUD_PAD + (BAR_HEIGHT + 4) * 2 + 8 + SLOT_SIZE / 2;
      ctx2d.fillText(cdLeft.toFixed(1), x, y);
    }
  }
  ctx2d.textAlign = 'left';
  ctx2d.textBaseline = 'top';

  // 伤害数字 (世界坐标 → 屏幕坐标, 上浮 + 淡出)
  ctx2d.font = 'bold 14px monospace';
  ctx2d.textAlign = 'center';
  for (const d of getDamageNums(state)) {
    const sp = worldToScreen(state, d.pos);
    if (sp.x < 0 || sp.x > state.viewport.w || sp.y < 0 || sp.y > state.viewport.h) continue;
    ctx2d.fillStyle = d.color;
    ctx2d.fillText(d.text, sp.x, sp.y);
  }
  ctx2d.textAlign = 'left';

  // 符文三选一 overlay (D-01, 技能 10 级触发)
  const choice = state.runeChoice;
  if (choice) {
    const cw = state.viewport.w;
    const ch = state.viewport.h;
    const boxW = 260;
    const boxGap = 20;
    const totalW = boxW * 3 + boxGap * 2;
    const x0 = (cw - totalW) / 2;
    const y0 = ch / 2 - 70;
    ctx2d.fillStyle = 'rgba(0,0,0,0.75)';
    ctx2d.fillRect(0, 0, cw, ch);
    ctx2d.textAlign = 'center';
    ctx2d.font = 'bold 18px monospace';
    ctx2d.fillStyle = '#ffd';
    ctx2d.fillText(`${choice.slot} 达到 Lv10 — 选择符文变异`, cw / 2, y0 - 34);
    ctx2d.font = '12px monospace';
    ctx2d.fillStyle = '#aaa';
    ctx2d.fillText('按 1/2/3 选择 · Esc 拒绝(本局不再触发)', cw / 2, y0 - 14);
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
}

function drawLogPanel(ctx2d: CanvasRenderingContext2D, viewportH: number) {
  const logs = getLogs();
  const lines = logs.slice(-LOG_LINES);
  const x = 16;
  const y = viewportH - LOG_LINES * 14 - 8;
  ctx2d.font = '11px monospace';
  ctx2d.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    const e = lines[i];
    // 颜色按 level
    ctx2d.fillStyle =
      e.level === 'ERR' ? '#f88' :
      e.level === 'WRN' ? '#fc8' :
      e.level === 'INF' ? '#fff' : '#aaa';
    ctx2d.fillText(formatLine(e), x, y + i * 14);
  }
  ctx2d.fillStyle = '#fff';
}