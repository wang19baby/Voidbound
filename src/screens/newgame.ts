// screens/newgame.ts — 新游戏 / 远征出发 / 角色新建 选择屏 (US-025 完整拆分)
//
// 设计选择:
// - drawNewgame 整块 (~284 行) 抽到本模块, 接受 NewgameCtx 注入所有 main.ts 闭包依赖
// - 跨函数共享的 ngLaunchT/ngNaming 通过 screenMachine 的 getter 暴露 (isNgNaming/getNgLaunchT)
// - drawUiPortrait 仍留 main.ts (用模块级 gl/quad/res, 整块搬出需引入 RenderResources 注入 — 超出本次范围)
// - handleUiClick 引用 NG_LAYOUT 是模块级常量 (本文件已导出), 零修改
// - 零行为变更: 函数体原样搬移, 仅闭包引用 → ctx 字段
//
// 依赖: game/* 领域模块 (数据) + main.ts 注入 ctx (渲染资源 + 状态)

import type { GameState, Theme } from '../game/state';
import type { MouseHandle } from '../input/mouse';
import { bindClass, CLASS_DEFS, CLASS_IDS, type ClassId } from '../game/class';
import { DIFFICULTIES, DIFFICULTY_MODS, DIFFICULTY_GATES, unlockedDifficulty, type Difficulty } from '../game/difficulty';
import { MAP_MODES, MAP_MODE_NAMES, MAP_MODE_DESC, type MapMode } from '../game/mapmode';
import { THEME_MONSTER_POOL, THEME_BOSS, MONSTER_DEFS } from '../game/monster';
import { SKILL_SPECS } from '../game/skill';
import { themeUnlocked, ngResolve, type NewgameSel } from '../game/newgame';
import { setScreen, THEMES } from '../game/state';
import { inRect } from '../game/uigrid';
import { pushToast } from '../game/toast';
import { playSfxClient } from '../ipc/sfx';
import { persistNowApp } from '../app/save';
import { setNgLaunchT, setNgNaming } from '../app/screenMachine';
import { inf } from '../util/log';

/** 主题中文名 (统一导出, main.ts 副本已删除) */
export const THEME_NAMES: Record<string, string> = { forest: '森林', desert: '沙漠', ruin: '废墟', void: '虚空' };

/** 主属性中文名 (统一导出, main.ts 副本已删除) */
export const ATTR_NAMES: Record<string, string> = { str: '力量', dex: '敏捷', vit: '体力', int: '智力', fai: '信仰', cha: '魅力' };

/** 新局屏布局 (绘制与鼠标命中共用): x 相对 w/2, y 相对 cy=h/2-110 */
export const NG_LAYOUT = {
  cy: -110,
  classX: -600, classW: 300, classH: 54,   // 左列职业卡 (多人行副标)
  diffX: -230, diffW: 280, diffH: 44,      // 中列难度卡 (解锁提示行)
  rightX: 200, rightW: 360,                // 右列: 主题卡 + 模式卡
  themeY: -6, themeW: 82, themeH: 72, themeGap: 8,
  modeY: 74, modeH: 46, modeGap: 6,        // 模式卡含副标行
  startX: -200, startY: -92, startW: 400, startH: 48,
};

export const NG_ROW_CLASS = 60;   // 职业行距
export const NG_ROW_DIFF = 48;    // 难度行距
export const NG_ROW_MODE = 52;    // 模式行距
export const NG_LAUNCH_MS = 700;  // 启动过场时长

/** 主题色块 (卡片缩略) */
export const THEME_COLORS: Record<string, string> = {
  forest: '#2d5a2d',
  desert: '#8b4513',
  ruin: '#6a5a4a',
  void: '#5a1a7a',
};

/** 新局屏依赖注入 (main.ts 拥有实现, 本模块拥有决策) */
export interface NewgameCtx {
  state: GameState;
  hudCtx: CanvasRenderingContext2D;
  hudCanvas: HTMLCanvasElement;
  mouse: MouseHandle;
  drawUiPortrait: (classId: ClassId, x: number, y: number, w: number, h: number) => void;
  isNgNaming: () => boolean;
  getNgLaunchT: () => number;
  loadLastNg: () => { classIdx: number; diffIdx: number; themeIdx: number; modeIdx: number } | null;
  uiCursor: (rects: Array<[number, number, number, number]>) => void;
}

/** 新局/远征/新建选择屏: 职业/难度/主题/模式 全维选择; 创建模式含命名框 */
export function drawNewgame(ctx: NewgameCtx, rects: Array<[number, number, number, number]>): void {
  const { state, hudCtx, hudCanvas, mouse, drawUiPortrait, isNgNaming, getNgLaunchT, loadLastNg, uiCursor } = ctx;
  const w = hudCanvas.width;
  const h = hudCanvas.height;
  const fromTown = state.ngFrom === 'town';
  const creating = state.ngFrom === 'create';
  const cy = h / 2 + NG_LAYOUT.cy;
  const selClass = CLASS_DEFS[CLASS_IDS[state.ngSel.classIdx]];
  const selDiff = DIFFICULTY_MODS[DIFFICULTIES[state.ngSel.diffIdx]].name;
  const selTheme = THEMES[state.ngSel.themeIdx];
  const selMode = MAP_MODES[state.ngSel.modeIdx];
  const mx = mouse.state().pos.x;
  const my = mouse.state().pos.y;
  const hover = (x: number, y: number, ww: number, hh: number) => inRect(mx, my, x, y, ww, hh);

  // GL 立绘 (左上, 2D 层挖孔)
  const px = w / 2 - 620, py = 56, pw = 150, ph = 150;
  drawUiPortrait(selClass.id, px, py, pw, ph);
  hudCtx.clearRect(0, 0, w, h);
  hudCtx.fillStyle = '#0b0b12';
  hudCtx.fillRect(0, 0, w, h);
  hudCtx.clearRect(px, py, pw, ph);
  hudCtx.strokeStyle = '#8a8a96';
  hudCtx.lineWidth = 2;
  hudCtx.strokeRect(px - 4, py - 4, pw + 8, ph + 8);

  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillStyle = '#c9aaff';
  hudCtx.font = 'bold 44px monospace';
  hudCtx.fillText(fromTown ? '远征出发' : creating ? '新建角色' : '新游戏', w / 2, 76);
  hudCtx.fillStyle = '#889';
  hudCtx.font = '14px monospace';
  hudCtx.fillText(fromTown ? '从城镇出发 = 新开一局 (选择目的地与挑战)'
    : creating ? '输入角色名, 选择职业与挑战, Enter 出发'
    : '选择职业与挑战, 出发进入地牢', w / 2, 110);

  // 创建模式: 命名框 (点击聚焦, Enter 出发)
  if (creating) {
    const nx = w / 2 - 180, ny = 148, nw = 360, nh = 40;
    const nHit = hover(nx, ny, nw, nh);
    hudCtx.fillStyle = isNgNaming() ? 'rgba(255,214,74,0.10)' : nHit ? 'rgba(255,255,255,0.07)' : 'rgba(20,20,28,0.92)';
    hudCtx.fillRect(nx, ny, nw, nh);
    hudCtx.strokeStyle = isNgNaming() ? '#ffd64a' : nHit ? '#66ccff' : '#3a3a48';
    hudCtx.lineWidth = isNgNaming() ? 2 : 1;
    hudCtx.strokeRect(nx, ny, nw, nh);
    hudCtx.textAlign = 'left';
    hudCtx.fillStyle = '#889';
    hudCtx.font = '13px monospace';
    hudCtx.fillText('角色名', nx + 12, ny + nh / 2);
    hudCtx.fillStyle = '#fff';
    hudCtx.font = 'bold 18px monospace';
    const shown = (state.charNameInput + (isNgNaming() ? '▏' : '')).slice(0, 25);
    hudCtx.fillText(shown || 'char_N (自动)', nx + 74, ny + nh / 2);
    hudCtx.textAlign = 'center';
    if (isNgNaming()) {
      hudCtx.fillStyle = '#997';
      hudCtx.font = '11px monospace';
      hudCtx.fillText('字母/数字/下划线 · Enter 确认出发 · Esc 取消命名', nx + nw / 2, ny + nh + 14);
    }
    rects.push([nx, ny, nw, nh]);
  }

  // 上次配置复用 (右上)
  const last = loadLastNg();
  const lx = w - 460, ly = 20, lw = 220, lh = 40;
  const lHit = hover(lx, ly, lw, lh);
  hudCtx.fillStyle = lHit ? 'rgba(102,204,255,0.14)' : 'rgba(20,20,28,0.9)';
  hudCtx.fillRect(lx, ly, lw, lh);
  hudCtx.strokeStyle = lHit ? '#66ccff' : '#3a3a48';
  hudCtx.lineWidth = lHit ? 2 : 1;
  hudCtx.strokeRect(lx, ly, lw, lh);
  hudCtx.fillStyle = lHit ? '#fff' : '#9aa';
  hudCtx.font = 'bold 13px monospace';
  if (last) {
    const lc = CLASS_DEFS[CLASS_IDS[Math.min(Math.max(0, last.classIdx), CLASS_IDS.length - 1)]];
    hudCtx.fillText(`上次: ${lc.name} · ${DIFFICULTY_MODS[DIFFICULTIES[Math.min(Math.max(0, last.diffIdx), DIFFICULTIES.length - 1)]].name}`, lx + lw / 2, ly + 15);
    hudCtx.fillStyle = '#889';
    hudCtx.font = '11px monospace';
    hudCtx.fillText(`[↺ 复用] ${THEME_NAMES[THEMES[Math.min(Math.max(0, last.themeIdx), THEMES.length - 1)]]} · ${MAP_MODE_NAMES[MAP_MODES[Math.min(Math.max(0, last.modeIdx), MAP_MODES.length - 1)]]}`, lx + lw / 2, ly + 31);
  } else {
    hudCtx.fillText('上次配置: 暂无', lx + lw / 2, ly + lh / 2);
  }
  rects.push([lx, ly, lw, lh]);

  // 左列: 职业 (town 模式锁定当前角色)
  const cx = w / 2 + NG_LAYOUT.classX;
  hudCtx.font = 'bold 15px monospace';
  hudCtx.fillStyle = '#9cf';
  hudCtx.fillText(fromTown ? `当前: ${selClass.name}` : '职业 [1-6]', cx + 140, cy - 40);
  if (fromTown) {
    hudCtx.font = 'bold 20px monospace';
    hudCtx.fillStyle = selClass.color;
    hudCtx.fillText(selClass.name, cx + 140, cy - 8);
    hudCtx.font = '13px monospace';
    hudCtx.fillStyle = '#bbb';
    hudCtx.fillText(selClass.title, cx + 140, cy + 20);
    hudCtx.fillStyle = '#889';
    hudCtx.font = '12px monospace';
    hudCtx.fillText(`${selClass.desc}`, cx + 140, cy + 44);
  } else {
    CLASS_IDS.forEach((id, i) => {
      const def = CLASS_DEFS[id];
      const sel = state.ngSel.classIdx === i;
      const ry = cy + i * NG_ROW_CLASS - NG_LAYOUT.classH / 2;
      if (hover(cx, ry, NG_LAYOUT.classW, NG_LAYOUT.classH)) {
        hudCtx.fillStyle = 'rgba(255,255,255,0.06)';
        hudCtx.fillRect(cx, ry, NG_LAYOUT.classW, NG_LAYOUT.classH);
      }
      hudCtx.font = 'bold 18px monospace';
      hudCtx.fillStyle = sel ? def.color : '#8a8a96';
      hudCtx.fillText(`${i + 1} ${sel ? '▶ ' : '  '}${def.name}${sel ? ' ◀' : ''}`, cx + 150, cy + i * NG_ROW_CLASS);
      hudCtx.font = '12px monospace';
      hudCtx.fillStyle = sel ? '#bbb' : '#8a8a96';
      hudCtx.fillText(def.title, cx + 150, cy + i * NG_ROW_CLASS + 18);
      // 副行: 起始技能 + 主属性
      const slots = def.skillSlots;
      const skillLine = ['Q', 'W', 'E', 'R'].map(s => SKILL_SPECS[slots[s as keyof typeof slots]]?.name ?? '').filter(Boolean).join('/');
      hudCtx.fillStyle = sel ? '#9aa' : '#8a8a96';
      hudCtx.font = '11px monospace';
      hudCtx.fillText(`${skillLine} · ${ATTR_NAMES[def.attr] ?? def.attr}`, cx + 150, cy + i * NG_ROW_CLASS + 36);
      rects.push([cx, ry, NG_LAYOUT.classW, NG_LAYOUT.classH]);
    });
  }

  // 中列: 难度 (Z/X)
  const dx = w / 2 + NG_LAYOUT.diffX;
  hudCtx.font = 'bold 15px monospace';
  hudCtx.fillStyle = '#ffb0a0';
  hudCtx.fillText('难度 [Z/X]', dx + 140, cy - 40);
  DIFFICULTIES.forEach((d, i) => {
    const sel = state.ngSel.diffIdx === i;
    const locked = !unlockedDifficulty(state.cleared, d);
    const mod = DIFFICULTY_MODS[d];
    const ry = cy + i * NG_ROW_DIFF - NG_LAYOUT.diffH / 2;
    if (sel) {
      hudCtx.fillStyle = 'rgba(255,214,74,0.15)';
      hudCtx.fillRect(dx, ry, NG_LAYOUT.diffW, NG_LAYOUT.diffH);
    } else if (hover(dx, ry, NG_LAYOUT.diffW, NG_LAYOUT.diffH)) {
      hudCtx.fillStyle = 'rgba(255,255,255,0.06)';
      hudCtx.fillRect(dx, ry, NG_LAYOUT.diffW, NG_LAYOUT.diffH);
    }
    hudCtx.font = 'bold 18px monospace';
    hudCtx.fillStyle = sel ? '#ffd64a' : locked ? '#4a4a55' : '#99a';
    hudCtx.fillText(`${sel ? '▶ ' : '  '}${mod.name}${sel ? ' ◀' : ''}`, dx + 140, cy + i * NG_ROW_DIFF);
    hudCtx.font = '12px monospace';
    if (locked) {
      // 解锁条件提示 (DIFFICULTY_GATES: 通关对应主题)
      const gate = DIFFICULTY_GATES[d];
      hudCtx.fillStyle = '#887';
      hudCtx.fillText(gate ? `未解锁 · 通关 ${THEME_NAMES[gate] ?? gate} 后开放` : '未解锁', dx + 140, cy + i * NG_ROW_DIFF + 18);
    } else {
      hudCtx.fillStyle = sel ? '#caa' : '#8a8a96';
      hudCtx.fillText(`HP×${mod.hpMult} 掉落×${mod.dropMult}${d === 'hardcore' ? ' 永久死亡' : ''}`, dx + 140, cy + i * NG_ROW_DIFF + 18);
    }
    rects.push([dx, ry, NG_LAYOUT.diffW, NG_LAYOUT.diffH]);
  });

  // 右列: 主题卡 (←/→) + 模式卡 (M)
  const rx = w / 2 + NG_LAYOUT.rightX;
  hudCtx.font = 'bold 15px monospace';
  hudCtx.fillStyle = '#8f8';
  hudCtx.fillText('主题 [←/→]', rx + 180, cy - 40);
  let hoverTheme: Theme | null = null;
  THEMES.forEach((t, i) => {
    const locked = !themeUnlocked(state.cleared, t);
    const sel = state.ngSel.themeIdx === i;
    const tx = rx + i * (NG_LAYOUT.themeW + NG_LAYOUT.themeGap);
    const ty = cy + NG_LAYOUT.themeY;
    if (hover(tx, ty, NG_LAYOUT.themeW, NG_LAYOUT.themeH)) hoverTheme = t;
    // 色块缩略 (上半) + 中文名 (下半)
    hudCtx.fillStyle = locked ? '#1a1a24' : '#16161e';
    hudCtx.fillRect(tx, ty, NG_LAYOUT.themeW, NG_LAYOUT.themeH);
    hudCtx.strokeStyle = sel ? '#ffd64a' : hover(tx, ty, NG_LAYOUT.themeW, NG_LAYOUT.themeH) ? '#8a8a96' : '#3a3a48';
    hudCtx.lineWidth = sel ? 2 : 1;
    hudCtx.strokeRect(tx, ty, NG_LAYOUT.themeW, NG_LAYOUT.themeH);
    hudCtx.fillStyle = locked ? 'rgba(90,90,102,0.35)' : (THEME_COLORS[t] ?? '#334');
    hudCtx.fillRect(tx + 4, ty + 4, NG_LAYOUT.themeW - 8, 42);
    hudCtx.fillStyle = sel ? '#ffd64a' : locked ? '#8a8a96' : '#ccc';
    hudCtx.font = 'bold 13px monospace';
    hudCtx.fillText(locked ? '未解锁' : (THEME_NAMES[t] ?? t), tx + NG_LAYOUT.themeW / 2, ty + NG_LAYOUT.themeH - 10);
    rects.push([tx, ty, NG_LAYOUT.themeW, NG_LAYOUT.themeH]);
  });
  hudCtx.font = 'bold 15px monospace';
  hudCtx.fillStyle = '#7fe0e0';
  hudCtx.fillText('模式 [M]', rx + 180, cy + NG_LAYOUT.modeY - 22);
  MAP_MODES.forEach((md, i) => {
    const sel = state.ngSel.modeIdx === i;
    const myy = cy + NG_LAYOUT.modeY + i * NG_ROW_MODE;
    hudCtx.fillStyle = sel ? 'rgba(255,204,153,0.18)' : hover(rx, myy, NG_LAYOUT.rightW, NG_LAYOUT.modeH) ? 'rgba(255,255,255,0.06)' : 'rgba(20,20,28,0.9)';
    hudCtx.fillRect(rx, myy, NG_LAYOUT.rightW, NG_LAYOUT.modeH);
    hudCtx.strokeStyle = sel ? '#fc9' : '#3a3a48';
    hudCtx.lineWidth = sel ? 2 : 1;
    hudCtx.strokeRect(rx, myy, NG_LAYOUT.rightW, NG_LAYOUT.modeH);
    hudCtx.fillStyle = sel ? '#ffd64a' : '#99a';
    hudCtx.font = 'bold 14px monospace';
    hudCtx.fillText(MAP_MODE_NAMES[md], rx + 12, myy + 15);
    hudCtx.fillStyle = sel ? '#caa' : '#8a8a96';
    hudCtx.font = '11px monospace';
    hudCtx.fillText(MAP_MODE_DESC[md], rx + 12, myy + 33);
    rects.push([rx, myy, NG_LAYOUT.rightW, NG_LAYOUT.modeH]);
  });
  // 描述行: 主题 hover 优先 (怪物/Boss 预告), 否则当前模式描述
  const descY = cy + NG_LAYOUT.modeY + 3 * NG_ROW_MODE + 6;
  hudCtx.fillStyle = '#889';
  hudCtx.font = '12px monospace';
  if (hoverTheme) {
    const pool = THEME_MONSTER_POOL[hoverTheme].map(m => MONSTER_DEFS[m]?.name ?? m).join(' / ');
    const b = THEME_BOSS[hoverTheme];
    hudCtx.fillText(`${THEME_NAMES[hoverTheme]}: ${pool} · Boss ${MONSTER_DEFS[b]?.name ?? b}`, rx + 180, descY);
  } else {
    hudCtx.fillText(MAP_MODE_DESC[selMode], rx + 180, descY);
  }

  // 组合摘要条 (start 上方): 最终确认组合
  const bx = w / 2 + NG_LAYOUT.startX;
  const by = h + NG_LAYOUT.startY;
  const sumY = by - 46;
  hudCtx.fillStyle = 'rgba(20,20,28,0.92)';
  hudCtx.fillRect(w / 2 - 220, sumY, 440, 40);
  hudCtx.strokeStyle = '#3a3a48';
  hudCtx.lineWidth = 1;
  hudCtx.strokeRect(w / 2 - 220, sumY, 440, 40);
  hudCtx.fillStyle = '#ffd64a';
  hudCtx.font = 'bold 14px monospace';
  hudCtx.fillText(`▶ ${selClass.name} · ${selDiff} · ${THEME_NAMES[selTheme] ?? selTheme} · ${MAP_MODE_NAMES[selMode]}`, w / 2, sumY + 14);
  hudCtx.fillStyle = '#889';
  hudCtx.font = '12px monospace';
  hudCtx.fillText(`${selClass.desc} · 主属性 ${ATTR_NAMES[selClass.attr] ?? selClass.attr}${creating ? ` · 名字 ${state.charNameInput || '(自动)'}` : ''}`, w / 2, sumY + 31);

  // 出发/开始
  const startHit = hover(bx, by, NG_LAYOUT.startW, NG_LAYOUT.startH);
  const startDown = startHit && mouse.state().buttons.LMB;
  if (startHit) {
    hudCtx.fillStyle = startDown ? 'rgba(201,170,255,0.35)' : 'rgba(201,170,255,0.18)';
    hudCtx.fillRect(bx, by, NG_LAYOUT.startW, NG_LAYOUT.startH);
  }
  hudCtx.strokeStyle = startDown ? '#fff' : '#c9aaff';
  hudCtx.lineWidth = startDown ? 3 : 2;
  hudCtx.strokeRect(bx, by, NG_LAYOUT.startW, NG_LAYOUT.startH);
  hudCtx.fillStyle = startHit ? '#fff' : '#bbb';
  hudCtx.font = 'bold 18px monospace';
  hudCtx.fillText(`[Enter] ${fromTown ? '出发 (新开一局)' : creating ? '创建并出发' : '开始'}`, w / 2, by + NG_LAYOUT.startH / 2);
  rects.push([bx, by, NG_LAYOUT.startW, NG_LAYOUT.startH]);

  // 底部: 键盘帮助条 (替代单行返回提示) + 右上可见返回按钮
  hudCtx.fillStyle = '#889';
  hudCtx.font = '13px monospace';
  hudCtx.fillText('[1-6] 职业 · [Z/X] 难度 · [←/→] 主题 · [M] 模式 · [Enter] 出发 · [Esc] 返回', w / 2, h - 36);
  const backR: [number, number, number, number] = [w - 220, 20, 200, 40];
  const bHit = hover(...backR);
  hudCtx.fillStyle = bHit ? 'rgba(102,204,255,0.14)' : 'rgba(20,20,28,0.9)';
  hudCtx.fillRect(...backR);
  hudCtx.strokeStyle = bHit ? '#66ccff' : '#3a3a48';
  hudCtx.lineWidth = bHit ? 2 : 1;
  hudCtx.strokeRect(...backR);
  hudCtx.fillStyle = bHit ? '#fff' : '#9aa';
  hudCtx.font = 'bold 14px monospace';
  hudCtx.fillText(`← 返回${fromTown ? '城镇' : creating ? '角色管理' : '标题'}`, w - 120, 40);
  rects.push(backR);

  // 出发过场遮罩 (0.7s: 正在生成地牢…)
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

// ===== 从 main.ts 搬出的新局/角色创建/出发流程 (US-025-b) =====

/** 上次配置记忆 (localStorage) */
export const NG_LAST_KEY = 'voidbound.lastNg';

/** 保存上次配置 (新局出发后调用) */
export function saveLastNg(state: GameState): void {
  try {
    localStorage.setItem(NG_LAST_KEY, JSON.stringify(state.ngSel));
  } catch { /* 隐私/禁用时静默 */ }
}

/** 读上次配置 (启动/新局屏右上"复用"按钮) */
export function loadLastNg(): NewgameSel | null {
  try {
    const raw = localStorage.getItem(NG_LAST_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as NewgameSel;
    if (typeof p?.classIdx === 'number' && typeof p?.diffIdx === 'number' && typeof p?.themeIdx === 'number' && typeof p?.modeIdx === 'number') return p;
    return null;
  } catch { return null; }
}

/** 创建角色确认 (C-202): 校验命名 → 入列表 → 进新局选择屏 (职业/难度已预填) */
/** 创建角色 (newgame 出发前调用, ngFrom==='create'): 成功返回 true, 名字冲突等失败 false */
export function createCharacterNow(state: GameState): boolean {
  let name = state.charNameInput.trim();
  if (name.length === 0) name = `char_${state.charList.length}`;
  // 安全化: 只留字母数字下划线, 防存档路径穿越
  name = name.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 24);
  if (name.length === 0) name = `char_${state.charList.length}`;
  const used = new Set(state.charList.map(c => c.id));
  if (used.has(name)) { pushToast(state, `角色名 ${name} 已存在`, '#f66'); return false; }
  const { classId, difficulty } = ngResolve(state.ngSel);
  state.currentChar = name;
  state.charList = [...state.charList, {
    id: name, class: classId, level: 1, difficulty, theme: 'forest',
    last_played: Math.floor(Date.now() / 1000),
  }];
  state.charNameInput = '';
  pushToast(state, `新建角色: ${name} (${DIFFICULTY_MODS[difficulty].name})`, '#9cf');
  void persistNowApp(state);
  inf('ui', `新建角色 ${name} → 出发`);
  return true;
}

/** 新建角色 (角色管理 [N]): 直接进新局选择屏, 命名框融入 (ngFrom='create') */
export function startCreateNewgame(state: GameState): void {
  state.charNameInput = '';
  state.ngSel = { classIdx: 0, diffIdx: 0, themeIdx: 0, modeIdx: MAP_MODES.indexOf(state.run.mode ?? 'linear') };
  state.ngFrom = 'create';
  setNgLaunchT(-1);
  setNgNaming(true);
  setScreen(state, 'newgame');
  state.titleMsg = '';
  inf('ui', '新建角色 → 新局选择屏 (输入名字)');
}

/** 新局出发 (键盘 Enter / 鼠标开始 / 命名确认共用): 解锁校验 → 创建模式先建角色 → 0.7s 过场 */
export function startFromNewgame(state: GameState): void {
  const { classId, difficulty, theme, mode } = ngResolve(state.ngSel);
  if (!unlockedDifficulty(state.cleared, difficulty)) { pushToast(state, `${DIFFICULTY_MODS[difficulty].name} 未解锁`, '#f66'); return; }
  if (!themeUnlocked(state.cleared, theme)) { pushToast(state, `主题 ${theme} 未解锁 (通关森林后开放)`, '#f66'); return; }
  if (state.ngFrom === 'create' && !createCharacterNow(state)) return;  // 创建失败(重名等)留在选择屏
  saveLastNg(state);
  setNgLaunchT(NG_LAUNCH_MS);
  playSfxClient('ui_click');
  inf('ui', `出发: ${CLASS_DEFS[classId].name} · ${DIFFICULTY_MODS[difficulty].name} · ${THEME_NAMES[theme]} · ${MAP_MODE_NAMES[mode]}`);
}

/** 过场结束真正开跑 (loop newgame 分支倒计时触发)。startRun 由 main.ts 注入 */
export function doLaunchRun(state: GameState, startRun: (state: GameState, theme: Theme, difficulty: Difficulty, mode?: MapMode) => void): void {
  const { classId, difficulty, theme, mode } = ngResolve(state.ngSel);
  bindClass(state, classId);  // M5 C-103: 新局绑定职业
  startRun(state, theme, difficulty, mode);
}