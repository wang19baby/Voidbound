// screens/expedition.ts — 远征屏 (城镇传送门交互后, MM-UG1)
//
// 设计选择:
// - 从 newgame.ts 拆出主题+模式+难度的远征配置 (角色名/职业/立绘留在 newgame 屏)
// - 与 newgame 共享主题横排/模式横排/难度横排的几何常量 (NG_ROW_DIFF/NG_ROW_THEME/NG_ROW_MODE)
// - 角色身份只读显示 (复用当前角色), 不修改 ngSel.classIdx
// - 出发 = 调 ctx.startExpeditionRun (main.ts 注入, 走 bindClass + setNgLaunchT 过场 + doLaunchRun)
// - 返回 = setScreen('town'), 留在城镇
//
// 依赖: game/* 领域模块 + app/screenMachine (getNgLaunchT) + screens/newgame (THEME_NAMES/THEME_COLORS/NG_LAYOUT)

import type { GameState } from '../game/state';
import type { MouseHandle } from '../input/mouse';
import { CLASS_DEFS, CLASS_IDS } from '../game/class';
import { DIFFICULTIES, DIFFICULTY_MODS, unlockedDifficulty } from '../game/difficulty';
import { MAP_MODES, MAP_MODE_NAMES, MAP_MODE_DESC } from '../game/mapmode';
import { THEMES } from '../game/state';
import { inRect } from '../game/uigrid';
import { themeUnlocked } from '../game/newgame';
import { THEME_NAMES, THEME_COLORS, NG_LAYOUT, NG_LAUNCH_MS, ATTR_NAMES } from './newgame';
import { SKILL_SPECS } from '../game/skill';

/** 远征屏布局常量 (复用 NG_LAYOUT.cy + 横排行高) */
export const EX_LAYOUT = {
  cy: NG_LAYOUT.cy,           // -110 (沿用 newgame 中心基准)
  diffY: 100,                  // cy+100
  themeY: 160,                 // cy+160
  modeY: 220,                  // cy+220
  diffSpacing: 120,            // 难度卡间距
  themeSpacing: 140,           // 主题卡间距
  modeSpacing: 160,            // 模式卡间距
  cardH: 30,                   // 三种卡通用高度
  startH: 56,                  // 出发按钮高
  backR: [20, 20, 200, 40] as [number, number, number, number],
} as const;

/** 远征屏依赖注入 (main.ts 拥有实现, 本模块拥有决策) */
export interface ExpeditionCtx {
  state: GameState;
  hudCtx: CanvasRenderingContext2D;
  hudCanvas: HTMLCanvasElement;
  mouse: MouseHandle;
  /** main.ts 注入: 调 bindClass + setNgLaunchT(NG_LAUNCH_MS), 过场结束自动 doLaunchRun */
  startExpeditionRun: () => void;
  /** cursor 处理 */
  uiCursor: (rects: Array<[number, number, number, number]>) => void;
  /** 读远征过场倒计时 (用于 0.7s "正在生成地牢…" 遮罩) */
  getNgLaunchT: () => number;
}

/** 远征屏: 主题 + 模式 + 难度 配置, 出发进地牢 */
export function drawExpedition(ctx: ExpeditionCtx, rects: Array<[number, number, number, number]>): void {
  const { state, hudCtx, hudCanvas, mouse, uiCursor, getNgLaunchT } = ctx;
  const w = hudCanvas.width;
  const h = hudCanvas.height;
  const cy = h / 2 + EX_LAYOUT.cy;
  const selClass = CLASS_DEFS[CLASS_IDS[state.ngSel.classIdx]] ?? CLASS_DEFS.barbarian;
  const selDiff = DIFFICULTY_MODS[DIFFICULTIES[state.ngSel.diffIdx]].name;
  const selTheme = THEMES[state.ngSel.themeIdx];
  const selMode = MAP_MODES[state.ngSel.modeIdx];
  const mx = mouse.state().pos.x;
  const my = mouse.state().pos.y;
  const hover = (x: number, y: number, ww: number, hh: number) => inRect(mx, my, x, y, ww, hh);

  // 背景
  hudCtx.clearRect(0, 0, w, h);
  hudCtx.fillStyle = '#0b0b12';
  hudCtx.fillRect(0, 0, w, h);

  // 标题 + 副标
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillStyle = '#c9aaff';
  hudCtx.font = 'bold 44px monospace';
  hudCtx.fillText('远征出发', w / 2, 76);
  hudCtx.fillStyle = '#889';
  hudCtx.font = '14px monospace';
  hudCtx.fillText('配置目的地与挑战, 然后踏入地牢', w / 2, 110);

  // ===== 角色身份只读区 (中央) =====
  const skillLine = ['Q', 'W', 'E', 'R']
    .map(s => SKILL_SPECS[selClass.skillSlots[s as keyof typeof selClass.skillSlots]]?.name ?? '')
    .filter(Boolean)
    .join('/');
  hudCtx.fillStyle = '#889';
  hudCtx.font = '13px monospace';
  hudCtx.fillText('当前角色', w / 2, cy - 110);
  hudCtx.fillStyle = selClass.color;
  hudCtx.font = 'bold 32px monospace';
  hudCtx.fillText(selClass.name, w / 2, cy - 70);
  hudCtx.fillStyle = '#9aa';
  hudCtx.font = '13px monospace';
  hudCtx.fillText(`${selClass.title}  ·  ${skillLine}  ·  ${ATTR_NAMES[selClass.attr] ?? selClass.attr}`, w / 2, cy - 38);
  hudCtx.fillStyle = '#9cf';
  hudCtx.font = 'bold 13px monospace';
  hudCtx.fillText(state.currentChar || state.charNameInput || 'char_0', w / 2, cy - 14);

  // ===== 难度横排 (cy+100) =====
  const diffY = cy + EX_LAYOUT.diffY;
  const diffX0 = (w - DIFFICULTIES.length * EX_LAYOUT.diffSpacing) / 2;
  DIFFICULTIES.forEach((d, i) => {
    const sel = state.ngSel.diffIdx === i;
    const locked = !unlockedDifficulty(state.cleared, d);
    const mod = DIFFICULTY_MODS[d];
    const dx2 = diffX0 + i * EX_LAYOUT.diffSpacing;
    if (sel) {
      hudCtx.fillStyle = 'rgba(255,214,74,0.18)';
      hudCtx.fillRect(dx2, diffY, EX_LAYOUT.diffSpacing, EX_LAYOUT.cardH);
    } else if (hover(dx2, diffY, EX_LAYOUT.diffSpacing, EX_LAYOUT.cardH) && !locked) {
      hudCtx.fillStyle = 'rgba(102,204,255,0.10)';
      hudCtx.fillRect(dx2, diffY, EX_LAYOUT.diffSpacing, EX_LAYOUT.cardH);
    }
    hudCtx.fillStyle = sel ? '#ffd64a' : (locked ? '#4a4a55' : (hover(dx2, diffY, EX_LAYOUT.diffSpacing, EX_LAYOUT.cardH) ? '#fff' : '#9aa'));
    hudCtx.font = 'bold 16px monospace';
    hudCtx.textAlign = 'center';
    hudCtx.textBaseline = 'middle';
    hudCtx.fillText(mod.name, dx2 + EX_LAYOUT.diffSpacing / 2, diffY + EX_LAYOUT.cardH / 2);
    if (!locked) rects.push([dx2, diffY, EX_LAYOUT.diffSpacing, EX_LAYOUT.cardH]);
  });
  hudCtx.fillStyle = '#666';
  hudCtx.font = '11px monospace';
  hudCtx.textAlign = 'center';
  hudCtx.fillText('难度 [Z/X]', w / 2, diffY - 16);

  // ===== 主题横排 (cy+160) =====
  const themeY = cy + EX_LAYOUT.themeY;
  const themeX0 = (w - THEMES.length * EX_LAYOUT.themeSpacing) / 2;
  THEMES.forEach((t, i) => {
    const sel = state.ngSel.themeIdx === i;
    const locked = !themeUnlocked(state.cleared, t);
    const tx2 = themeX0 + i * EX_LAYOUT.themeSpacing;
    if (sel) {
      hudCtx.fillStyle = 'rgba(255,214,74,0.18)';
      hudCtx.fillRect(tx2, themeY, EX_LAYOUT.themeSpacing, EX_LAYOUT.cardH);
    } else if (hover(tx2, themeY, EX_LAYOUT.themeSpacing, EX_LAYOUT.cardH) && !locked) {
      hudCtx.fillStyle = 'rgba(102,204,255,0.10)';
      hudCtx.fillRect(tx2, themeY, EX_LAYOUT.themeSpacing, EX_LAYOUT.cardH);
    }
    // 主题色块 (左侧 4px)
    hudCtx.fillStyle = THEME_COLORS[t] ?? '#334';
    hudCtx.fillRect(tx2, themeY, 4, EX_LAYOUT.cardH);
    hudCtx.fillStyle = sel ? '#ffd64a' : (locked ? '#4a4a55' : (hover(tx2, themeY, EX_LAYOUT.themeSpacing, EX_LAYOUT.cardH) ? '#fff' : '#9aa'));
    hudCtx.font = 'bold 16px monospace';
    hudCtx.textAlign = 'center';
    hudCtx.textBaseline = 'middle';
    hudCtx.fillText(THEME_NAMES[t] ?? t, tx2 + EX_LAYOUT.themeSpacing / 2, themeY + EX_LAYOUT.cardH / 2);
    if (!locked) rects.push([tx2, themeY, EX_LAYOUT.themeSpacing, EX_LAYOUT.cardH]);
  });
  hudCtx.fillStyle = '#666';
  hudCtx.font = '11px monospace';
  hudCtx.textAlign = 'center';
  hudCtx.fillText('主题 [←/→]', w / 2, themeY - 16);

  // ===== 模式横排 (cy+220) =====
  const modeY = cy + EX_LAYOUT.modeY;
  const modeX0 = (w - MAP_MODES.length * EX_LAYOUT.modeSpacing) / 2;
  MAP_MODES.forEach((md, i) => {
    const sel = state.ngSel.modeIdx === i;
    const mx2 = modeX0 + i * EX_LAYOUT.modeSpacing;
    if (sel) {
      hudCtx.fillStyle = 'rgba(255,214,74,0.18)';
      hudCtx.fillRect(mx2, modeY, EX_LAYOUT.modeSpacing, EX_LAYOUT.cardH);
    } else if (hover(mx2, modeY, EX_LAYOUT.modeSpacing, EX_LAYOUT.cardH)) {
      hudCtx.fillStyle = 'rgba(102,204,255,0.10)';
      hudCtx.fillRect(mx2, modeY, EX_LAYOUT.modeSpacing, EX_LAYOUT.cardH);
    }
    hudCtx.fillStyle = sel ? '#ffd64a' : (hover(mx2, modeY, EX_LAYOUT.modeSpacing, EX_LAYOUT.cardH) ? '#fff' : '#9aa');
    hudCtx.font = 'bold 16px monospace';
    hudCtx.textAlign = 'center';
    hudCtx.textBaseline = 'middle';
    hudCtx.fillText(MAP_MODE_NAMES[md], mx2 + EX_LAYOUT.modeSpacing / 2, modeY + EX_LAYOUT.cardH / 2);
    rects.push([mx2, modeY, EX_LAYOUT.modeSpacing, EX_LAYOUT.cardH]);
  });
  hudCtx.fillStyle = '#666';
  hudCtx.font = '11px monospace';
  hudCtx.textAlign = 'center';
  hudCtx.fillText('模式 [M]', w / 2, modeY - 16);

  // 模式描述
  hudCtx.fillStyle = '#889';
  hudCtx.font = '12px monospace';
  hudCtx.fillText(MAP_MODE_DESC[selMode], w / 2, modeY + 50);

  // ===== 出发按钮 (h-130) =====
  const startW = 360, startH = EX_LAYOUT.startH;
  const startX = w / 2 - startW / 2;
  const startY = h - 130;
  const sHit = hover(startX, startY, startW, startH);
  hudCtx.fillStyle = sHit ? 'rgba(255,214,74,0.25)' : 'rgba(40,34,10,0.85)';
  hudCtx.fillRect(startX, startY, startW, startH);
  hudCtx.strokeStyle = sHit ? '#fff' : '#ffd64a';
  hudCtx.lineWidth = sHit ? 3 : 2;
  hudCtx.strokeRect(startX, startY, startW, startH);
  hudCtx.fillStyle = sHit ? '#fff' : '#ffd64a';
  hudCtx.font = 'bold 20px monospace';
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillText('出发(Enter)', w / 2, startY + startH / 2);
  rects.push([startX, startY, startW, startH]);

  // ===== 底部键位提示 =====
  hudCtx.fillStyle = '#889';
  hudCtx.font = '13px monospace';
  hudCtx.fillText('[←/→] 主题 · [Z/X] 难度 · [M] 模式 · [Enter] 出发 · [Esc] 回城', w / 2, h - 36);

  // ===== 左上角返回按钮 =====
  const backR = EX_LAYOUT.backR;
  const bHit = hover(...backR);
  hudCtx.fillStyle = bHit ? 'rgba(102,204,255,0.18)' : 'rgba(20,20,28,0.85)';
  hudCtx.fillRect(...backR);
  hudCtx.strokeStyle = bHit ? '#66ccff' : '#3a3a48';
  hudCtx.lineWidth = bHit ? 2 : 1;
  hudCtx.strokeRect(...backR);
  hudCtx.fillStyle = bHit ? '#fff' : '#9cf';
  hudCtx.font = 'bold 14px monospace';
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillText('返回城镇(Esc)', 120, 40);
  rects.push(backR);

  // ===== 出发过场遮罩 (0.7s "正在生成地牢…") =====
  if (getNgLaunchT() > 0) {
    hudCtx.fillStyle = 'rgba(0,0,0,0.85)';
    hudCtx.fillRect(0, 0, w, h);
    hudCtx.fillStyle = '#ffd64a';
    hudCtx.font = 'bold 30px monospace';
    hudCtx.fillText('正在生成地牢…', w / 2, h / 2 - 20);
    const prog = Math.max(0, Math.min(1, 1 - getNgLaunchT() / NG_LAUNCH_MS));
    hudCtx.fillStyle = '#333';
    hudCtx.fillRect(w / 2 - 200, h / 2 + 16, 400, 12);
    hudCtx.fillStyle = '#c9aaff';
    hudCtx.fillRect(w / 2 - 200, h / 2 + 16, Math.round(400 * prog), 12);
    hudCtx.strokeStyle = '#8a8a96';
    hudCtx.lineWidth = 1;
    hudCtx.strokeRect(w / 2 - 200, h / 2 + 16, 400, 12);
    hudCtx.fillStyle = '#9aa';
    hudCtx.font = '12px monospace';
    hudCtx.fillText(`${selClass.name} · ${selDiff} · ${THEME_NAMES[selTheme] ?? selTheme} · ${MAP_MODE_NAMES[selMode]}`, w / 2, h / 2 + 48);
  }

  hudCtx.textAlign = 'left';
  hudCtx.textBaseline = 'top';
  uiCursor(rects);
}
