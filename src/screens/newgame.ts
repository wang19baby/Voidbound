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

  // 背景清空 (单色 0,0,12) — 替代之前 line 88-99 的 GL 立绘 100×100 (已删, 步骤 2 自带 80×80 立绘)
  hudCtx.clearRect(0, 0, w, h);
  hudCtx.fillStyle = '#0b0b12';
  hudCtx.fillRect(0, 0, w, h);

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

  // 创建模式: 命名框 (仅步骤 2 显示, 步骤 1 只选职业)
  if (creating && !state.ui.classStep1) {
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

  // ===== 方案 G: 中央大字 + 横排小字 (集中布局) =====

  // 中央: 职业大字 (固定, 不能切换, 不显示候选)
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  // 副标 (职业说明)
  hudCtx.fillStyle = '#889';
  hudCtx.font = '13px monospace';
  hudCtx.fillText(fromTown ? '当前已确认 (城镇出发)' : creating ? '新建角色 (请确认职业)' : '当前已确认 (复用角色)', w / 2, cy - 120);
  if (creating) {
    if (state.ui.classStep1) {
      // ===== 创建模式 步骤 1: 选职业 (modal: 全屏遮罩 + 6 卡片 + 早 return) =====
      // 全屏半透明黑色遮罩, 防止下面屏 hover/绘制透传
      hudCtx.fillStyle = 'rgba(0, 0, 0, 0.92)';
      hudCtx.fillRect(0, 0, w, h);
      // 标题 + 步骤提示
      hudCtx.fillStyle = '#c9aaff';
      hudCtx.font = 'bold 36px monospace';
      hudCtx.fillText('选择职业', w / 2, 80);
      hudCtx.fillStyle = '#9aa';
      hudCtx.font = '14px monospace';
      hudCtx.fillText('步骤 1/2  ·  ←→ / 鼠标 切换  ·  Enter 确定', w / 2, 120);
      const cardW = 160, cardH = 220, cardGap = 14;
      const cardTotalW = CLASS_IDS.length * cardW + (CLASS_IDS.length - 1) * cardGap;
      const cardX0 = (w - cardTotalW) / 2;
      const cardY = cy - 50;
      CLASS_IDS.forEach((id, i) => {
        const def = CLASS_DEFS[id];
        const sel = state.ngSel.classIdx === i;
        const cx2 = cardX0 + i * (cardW + cardGap);
        // 卡片立绘 (60×60, 顶部居中) — 第一张 clear, 后续不清 (叠加保留 6 张)
        const px2 = cx2 + cardW / 2 - 30, py2 = cardY + 12;
        const pSize = 60;
        drawUiPortrait(id, px2, py2, pSize, pSize, i > 0);
        hudCtx.clearRect(px2, py2, pSize, pSize);
        hudCtx.strokeStyle = sel ? '#ffd64a' : '#3a3a48';
        hudCtx.lineWidth = sel ? 3 : 1;
        hudCtx.strokeRect(px2 - 3, py2 - 3, pSize + 6, pSize + 6);
        if (sel) {
          hudCtx.fillStyle = 'rgba(255,214,74,0.15)';
          hudCtx.fillRect(cx2, cardY, cardW, cardH);
        }
        hudCtx.strokeStyle = sel ? '#ffd64a' : '#3a3a48';
        hudCtx.lineWidth = sel ? 3 : 1;
        hudCtx.strokeRect(cx2, cardY, cardW, cardH);
        hudCtx.fillStyle = sel ? def.color : '#eee';
        hudCtx.font = 'bold 16px monospace';
        hudCtx.textAlign = 'center';
        hudCtx.textBaseline = 'middle';
        hudCtx.fillText(def.name, cx2 + cardW / 2, cardY + 100);
        hudCtx.fillStyle = sel ? '#fda' : '#888';
        hudCtx.font = '12px monospace';
        hudCtx.fillText(def.title, cx2 + cardW / 2, cardY + 122);
        hudCtx.fillStyle = '#666';
        hudCtx.font = '10px monospace';
        const descShort = def.desc.length > 12 ? def.desc.slice(0, 12) + '…' : def.desc;
        hudCtx.fillText(descShort, cx2 + cardW / 2, cardY + 148);
        hudCtx.fillStyle = '#555';
        hudCtx.font = '10px monospace';
        const sk = ['Q', 'W', 'E', 'R'].map(s => SKILL_SPECS[def.skillSlots[s as keyof typeof def.skillSlots]]?.name ?? '').filter(Boolean).join('/');
        hudCtx.fillText(sk, cx2 + cardW / 2, cardY + 170);
        // 属性
        hudCtx.fillStyle = '#777';
        hudCtx.font = '10px monospace';
        hudCtx.fillText(ATTR_NAMES[def.attr] ?? def.attr, cx2 + cardW / 2, cardY + 195);
        rects.push([cx2, cardY, cardW, cardH]);
      });
      // 步骤 1 是 modal: 早 return, 跳过下面难度/主题/模式/出发 (避免透传)
      return;
    } else {
      // ===== 创建模式 步骤 2: 立绘 + 职业名 (可点回步骤 1) + 角色名 + 命名 =====
      // 职业立绘 100×100 居中 (原 100×100 位置: 中心 cx-300, cy-60, 范围 cx-340..cx-260, cy-100..cy-20)
      const pSize = 100;
      const px2 = w / 2 - 60 - pSize, py2 = cy - 40;
      drawUiPortrait(selClass.id, px2, py2, pSize, pSize, true);
      hudCtx.clearRect(px2, py2, pSize, pSize);
      hudCtx.strokeStyle = '#66ccff';
      hudCtx.lineWidth = 2;
      hudCtx.strokeRect(px2 - 2, py2 - 2, pSize + 4, pSize + 4);
      // 职业名 (40px, 在立绘右侧, 居中)
      hudCtx.fillStyle = selClass.color;
      hudCtx.font = 'bold 40px monospace';
      hudCtx.textAlign = 'center';
      hudCtx.textBaseline = 'middle';
      hudCtx.fillText(selClass.name, w / 2 + 30, cy - 20);
      // 副标 (点击提示)
      hudCtx.fillStyle = '#888';
      hudCtx.font = '11px monospace';
      hudCtx.fillText('▼ 点击职业区切换职业 ▼', w / 2 + 30, cy + 18);
      // 职业区点击命中 (立绘 + 职业名 + 角色名 区域, 命名框下方避开)
      rects.push([w / 2 - 200, cy - 60, 400, 100]);
    }
  } else {
    // ===== 非创建模式: 单职业, 中央大字, 不可切换 (复用当前角色) =====
    hudCtx.fillStyle = selClass.color;
    hudCtx.font = 'bold 40px monospace';
    hudCtx.fillText(selClass.name, w / 2, cy - 50);
    // 职业副标
    hudCtx.fillStyle = '#9aa';
    hudCtx.font = '14px monospace';
    const skillLine = ['Q', 'W', 'E', 'R'].map(s => SKILL_SPECS[selClass.skillSlots[s as keyof typeof selClass.skillSlots]]?.name ?? '').filter(Boolean).join('/');
    hudCtx.fillText(`${selClass.title}  ·  ${skillLine}  ·  ${ATTR_NAMES[selClass.attr] ?? selClass.attr}`, w / 2, cy - 10);
    // 职业描述
    hudCtx.fillStyle = '#666';
    hudCtx.font = '12px monospace';
    hudCtx.fillText(selClass.desc, w / 2, cy + 12);
    // 角色名
    hudCtx.fillStyle = '#9cf';
    hudCtx.font = 'bold 14px monospace';
    hudCtx.fillText(state.charNameInput || 'char_0', w / 2, cy + 34);
  }

  // 横排 难度 (居中, 选中金)
  const diffY = cy + 100;
  const diffSpacing = 120;
  const diffTotalW = DIFFICULTIES.length * diffSpacing;
  const diffX0 = (w - diffTotalW) / 2;
  DIFFICULTIES.forEach((d, i) => {
    const sel = state.ngSel.diffIdx === i;
    const locked = !unlockedDifficulty(state.cleared, d);
    const mod = DIFFICULTY_MODS[d];
    const dx2 = diffX0 + i * diffSpacing;
    const dHit = inRect(mx, my, dx2, diffY, diffSpacing, 30);
    // 背景
    if (sel) {
      hudCtx.fillStyle = 'rgba(255,214,74,0.18)';
      hudCtx.fillRect(dx2, diffY, diffSpacing, 30);
    } else if (dHit && !locked) {
      hudCtx.fillStyle = 'rgba(102,204,255,0.10)';
      hudCtx.fillRect(dx2, diffY, diffSpacing, 30);
    }
    hudCtx.fillStyle = sel ? '#ffd64a' : (locked ? '#4a4a55' : (dHit ? '#fff' : '#9aa'));
    hudCtx.font = 'bold 16px monospace';
    hudCtx.fillText(mod.name, dx2 + diffSpacing / 2, diffY + 15);
    if (locked) {
      // 解锁条件
      const gate = DIFFICULTY_GATES[d];
      hudCtx.fillStyle = '#887';
      hudCtx.font = '10px monospace';
      hudCtx.fillText(gate ? `通关 ${THEME_NAMES[gate] ?? gate} 解锁` : '未解锁', dx2 + diffSpacing / 2, diffY + 28);
    }
    if (!locked) rects.push([dx2, diffY, diffSpacing, 30]);
  });
  // 难度提示
  hudCtx.fillStyle = '#666';
  hudCtx.font = '11px monospace';
  hudCtx.fillText('难度 [Z/X]', w / 2, diffY - 16);

  // 横排 主题 (居中)
  const themeY = cy + 160;
  const themeSpacing = 140;
  const themeTotalW = THEMES.length * themeSpacing;
  const themeX0 = (w - themeTotalW) / 2;
  THEMES.forEach((t, i) => {
    const sel = state.ngSel.themeIdx === i;
    const locked = !themeUnlocked(state.cleared, t);
    const tx2 = themeX0 + i * themeSpacing;
    const ty2 = themeY;
    const tHit = inRect(mx, my, tx2, ty2, themeSpacing, 30);
    if (sel) {
      hudCtx.fillStyle = 'rgba(255,214,74,0.18)';
      hudCtx.fillRect(tx2, ty2, themeSpacing, 30);
    } else if (tHit && !locked) {
      hudCtx.fillStyle = 'rgba(102,204,255,0.10)';
      hudCtx.fillRect(tx2, ty2, themeSpacing, 30);
    }
    // 主题色块 (左侧 4px)
    hudCtx.fillStyle = THEME_COLORS[t] ?? '#334';
    hudCtx.fillRect(tx2, ty2, 4, 30);
    hudCtx.fillStyle = sel ? '#ffd64a' : (locked ? '#4a4a55' : (tHit ? '#fff' : '#9aa'));
    hudCtx.font = 'bold 16px monospace';
    hudCtx.fillText(THEME_NAMES[t] ?? t, tx2 + themeSpacing / 2, ty2 + 15);
    if (locked) {
      hudCtx.fillStyle = '#887';
      hudCtx.font = '10px monospace';
      hudCtx.fillText('未解锁', tx2 + themeSpacing / 2, ty2 + 28);
    }
    if (!locked) rects.push([tx2, ty2, themeSpacing, 30]);
  });
  hudCtx.fillStyle = '#666';
  hudCtx.font = '11px monospace';
  hudCtx.fillText('主题 [←/→]', w / 2, themeY - 16);

  // 横排 模式 (居中)
  const modeY = cy + 220;
  const modeSpacing = 160;
  const modeTotalW = MAP_MODES.length * modeSpacing;
  const modeX0 = (w - modeTotalW) / 2;
  MAP_MODES.forEach((md, i) => {
    const sel = state.ngSel.modeIdx === i;
    const mx2 = modeX0 + i * modeSpacing;
    const myy = modeY;
    const mHit = inRect(mx, my, mx2, myy, modeSpacing, 30);
    if (sel) {
      hudCtx.fillStyle = 'rgba(255,214,74,0.18)';
      hudCtx.fillRect(mx2, myy, modeSpacing, 30);
    } else if (mHit) {
      hudCtx.fillStyle = 'rgba(102,204,255,0.10)';
      hudCtx.fillRect(mx2, myy, modeSpacing, 30);
    }
    hudCtx.fillStyle = sel ? '#ffd64a' : (mHit ? '#fff' : '#9aa');
    hudCtx.font = 'bold 16px monospace';
    hudCtx.fillText(MAP_MODE_NAMES[md], mx2 + modeSpacing / 2, myy + 15);
    rects.push([mx2, myy, modeSpacing, 30]);
  });
  hudCtx.fillStyle = '#666';
  hudCtx.font = '11px monospace';
  hudCtx.fillText('模式 [M]', w / 2, modeY - 16);

  // 摘要 (居中, 模式描述)
  hudCtx.fillStyle = '#889';
  hudCtx.font = '12px monospace';
  hudCtx.fillText(MAP_MODE_DESC[selMode], w / 2, modeY + 50);

  // 出发/开始按钮 (居中, 大)
  const startW2 = 360, startH2 = 56;
  const startX2 = w / 2 - startW2 / 2;
  const startY2 = h - 130;
  const startHit = inRect(mx, my, startX2, startY2, startW2, startH2);
  hudCtx.fillStyle = startHit ? 'rgba(255,214,74,0.25)' : 'rgba(40,34,10,0.85)';
  hudCtx.fillRect(startX2, startY2, startW2, startH2);
  hudCtx.strokeStyle = startHit ? '#fff' : '#ffd64a';
  hudCtx.lineWidth = startHit ? 3 : 2;
  hudCtx.strokeRect(startX2, startY2, startW2, startH2);
  hudCtx.fillStyle = startHit ? '#fff' : '#ffd64a';
  hudCtx.font = 'bold 20px monospace';
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillText(`创建并出发(Enter)`, w / 2, startY2 + startH2 / 2);
  rects.push([startX2, startY2, startW2, startH2]);

  // 底部: 键盘帮助条 (去掉 [Esc] 返回文字, 左上角已加"返回主菜单(Esc)"按钮)
  hudCtx.fillStyle = '#889';
  hudCtx.font = '13px monospace';
  hudCtx.fillText('[1-6] 职业 · [Z/X] 难度 · [←/→] 主题 · [M] 模式 · [Enter] 出发', w / 2, h - 36);
  // 左上角 "返回主菜单(Esc)" 按钮 (统一命名, 与 characters/town/settings 一致)
  const backR: [number, number, number, number] = [20, 20, 200, 40];
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
  hudCtx.fillText('返回主菜单(Esc)', 120, 40);
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
  // 直接展示新建角色界面 (命名 + 难度 + 主题 + 模式), 跳过步骤 1 选职业
  state.ui.classStep1 = false;
  setNgNaming(true);
  setScreen(state, 'newgame');
  state.ui.titleMsg = '';
  inf('ui', '新建角色 → 命名 + 难度 + 主题 + 模式');
}

/** 新局出发 (键盘 Enter / 鼠标开始 / 命名确认共用): 解锁校验 → 创建模式先建角色 → 0.7s 过场 */
export function startFromNewgame(state: GameState, enterTownFn?: (s: GameState) => void): void {
  const { classId, difficulty, theme, mode } = ngResolve(state.ngSel);
  if (!unlockedDifficulty(state.cleared, difficulty)) { pushToast(state, `${DIFFICULTY_MODS[difficulty].name} 未解锁`, '#f66'); return; }
  if (!themeUnlocked(state.cleared, theme)) { pushToast(state, `主题 ${theme} 未解锁 (通关森林后开放)`, '#f66'); return; }
  // 创建模式: 创建角色后, 默认到城镇 (而非直接开地牢, 让玩家从城镇出发)
  if (state.ngFrom === 'create') {
    if (!createCharacterNow(state)) return;  // 创建失败(重名等)留在选择屏
    saveLastNg(state);
    setNgLaunchT(-1);
    setNgNaming(false);
    if (enterTownFn) enterTownFn(state);
    else setScreen(state, 'town');
    inf('ui', `新建角色 → 城镇 (${CLASS_DEFS[classId].name} · ${DIFFICULTY_MODS[difficulty].name})`);
    return;
  }
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
