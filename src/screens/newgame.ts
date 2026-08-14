// screens/newgame.ts — 新游戏 / 角色新建 选择屏 (US-025 完整拆分 + MM-UG1 拆分远征)
//
// 设计选择:
// - drawNewgame 整块 (~284 行) 抽到本模块, 接受 NewgameCtx 注入所有 main.ts 闭包依赖
// - 跨函数共享的 ngLaunchT/ngNaming 通过 screenMachine 的 getter 暴露 (isNgNaming/getNgLaunchT)
// - drawUiPortrait 仍留 main.ts (用模块级 gl/quad/res, 整块搬出需引入 RenderResources 注入 — 超出本次范围)
// - handleUiClick 引用 NG_LAYOUT 是模块级常量 (本文件已导出), 零修改
// - 零行为变更: 函数体原样搬移, 仅闭包引用 → ctx 字段
// - MM-UG1: 主题/模式选择搬到 src/screens/expedition.ts; 本屏只留 角色名 + 职业 + 难度
//
// 依赖: game/* 领域模块 (数据) + main.ts 注入 ctx (渲染资源 + 状态)

import type { GameState, Theme } from '../game/state';
import type { MouseHandle } from '../input/mouse';
import { bindClass, CLASS_DEFS, CLASS_IDS, type ClassId } from '../game/class';
import { DIFFICULTIES, DIFFICULTY_MODS, DIFFICULTY_GATES, unlockedDifficulty, type Difficulty } from '../game/difficulty';
import { MAP_MODES, MAP_MODE_NAMES, type MapMode } from '../game/mapmode';
import { SKILL_SPECS } from '../game/skill';
import { ngResolve, type NewgameSel } from '../game/newgame';
import { setScreen, THEMES } from '../game/state';
import { inRect } from '../game/uigrid';
import { pushToast } from '../game/toast';
import { playSfxClient } from '../ipc/sfx';
import { persistNowApp } from '../app/save';
import { setNgLaunchT, setNgNaming } from '../app/screenMachine';
import { inf } from '../util/log';

/** 主题中文名 (统一导出, main.ts 副本已删除) */
export const THEME_NAMES: Record<string, string> = { forest: '森林', desert: '沙漠', ruin: '废墟', void: '虚空', ice: '冰霜' };

/** 主属性中文名 (统一导出, main.ts 副本已删除) */
export const ATTR_NAMES: Record<string, string> = { str: '力量', dex: '敏捷', vit: '体力', int: '智力', fai: '信仰', cha: '魅力' };

/** 新局屏布局 (绘制与鼠标命中共用): x 相对 w/2, y 相对 cy=h/2-110
 *  MM-UG1: 主题/模式/start 相关字段移到 expedition.ts; 难度改为下半部横排 (常量在本函数内)
 *  UI: 职业改为横向卡片 (贴图+介绍), cardY 为卡片行绝对顶坐标 */
export const NG_LAYOUT = {
  cy: -110,
  cardW: 190, cardH: 210, gap: 14, cardY: 135,   // 职业横排卡片 (6 张, ←→/A D/点击切换)
  startX: -200, startY: -92, startW: 400, startH: 48,
};

export const NG_LAUNCH_MS = 700;  // 启动过场时长

/** 主题色块 (远征屏复用) */
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
  drawUiPortrait: (classId: ClassId, x: number, y: number, w: number, h: number, noClear?: boolean) => void;
  isNgNaming: () => boolean;
  getNgLaunchT: () => number;
  uiCursor: (rects: Array<[number, number, number, number]>) => void;
}

/** 新局屏 (MM-UG1): 角色名 + 职业 + 难度; 主题/模式移到远征屏
 *  创建模式 (ngFrom='create') 显示命名框; 否则复用当前角色名 */
export function drawNewgame(ctx: NewgameCtx, rects: Array<[number, number, number, number]>): void {
  const { state, hudCtx, hudCanvas, mouse, drawUiPortrait, isNgNaming, getNgLaunchT, uiCursor } = ctx;
  const w = hudCanvas.width;
  const h = hudCanvas.height;
  const creating = state.ngFrom === 'create';
  const selClass = CLASS_DEFS[CLASS_IDS[state.ngSel.classIdx]];
  const selDiff = DIFFICULTY_MODS[DIFFICULTIES[state.ngSel.diffIdx]].name;
  const mx = mouse.state().pos.x;
  const my = mouse.state().pos.y;
  const hover = (x: number, y: number, ww: number, hh: number) => inRect(mx, my, x, y, ww, hh);

  // GL 立绘: 6 张职业卡贴图 (首张清 GL, 其余 noClear 连画)
  const pSize = 112, pOffY = 12;
  const cardW = NG_LAYOUT.cardW, cardH = NG_LAYOUT.cardH, gap = NG_LAYOUT.gap;
  const rowW = CLASS_IDS.length * cardW + (CLASS_IDS.length - 1) * gap;
  const cardX0 = w / 2 - rowW / 2;
  const cardY = NG_LAYOUT.cardY;
  const holeX = (i: number): number => cardX0 + i * (cardW + gap) + (cardW - pSize) / 2;
  CLASS_IDS.forEach((id, i) => drawUiPortrait(id, holeX(i), cardY + pOffY, pSize, pSize, i > 0));
  hudCtx.clearRect(0, 0, w, h);
  hudCtx.fillStyle = '#0b0b12';
  hudCtx.fillRect(0, 0, w, h);

  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillStyle = '#c9aaff';
  hudCtx.font = 'bold 44px monospace';
  hudCtx.fillText(creating ? '新建角色' : '新游戏', w / 2, 76);
  hudCtx.fillStyle = '#889';
  hudCtx.font = '14px monospace';
  hudCtx.fillText(creating ? '输入角色名, 选择职业与难度, 然后出发去城镇'
    : '确认角色名 · 选择职业 · 选择难度 (主题与模式在城镇传送门)', w / 2, 110);

  // 命名框 (职业卡片与难度之间; 创建模式可编辑, 否则只读显示当前角色)
  {
    const nx = w / 2 - 180, ny = 360, nw = 360, nh = 36;
    const focused = creating && isNgNaming();
    const nHit = hover(nx, ny, nw, nh);
    hudCtx.fillStyle = focused ? 'rgba(255,214,74,0.10)' : nHit ? 'rgba(255,255,255,0.07)' : 'rgba(20,20,28,0.92)';
    hudCtx.fillRect(nx, ny, nw, nh);
    hudCtx.strokeStyle = focused ? '#ffd64a' : nHit ? '#66ccff' : '#3a3a48';
    hudCtx.lineWidth = focused ? 2 : 1;
    hudCtx.strokeRect(nx, ny, nw, nh);
    hudCtx.textAlign = 'left';
    hudCtx.fillStyle = '#889';
    hudCtx.font = '13px monospace';
    hudCtx.fillText(creating ? '角色名' : '当前角色', nx + 12, ny + nh / 2);
    hudCtx.fillStyle = '#fff';
    hudCtx.font = 'bold 18px monospace';
    const shown = creating
      ? (state.charNameInput + (focused ? '▏' : '')).slice(0, 25) || 'char_N (自动)'
      : state.currentChar;
    hudCtx.fillText(shown, nx + 74, ny + nh / 2);
    hudCtx.textAlign = 'center';
    if (focused) {
      hudCtx.fillStyle = '#997';
      hudCtx.font = '11px monospace';
      hudCtx.fillText('字母/数字/下划线 · Enter 确认出发 · Esc 取消命名', nx + nw / 2, ny + nh + 14);
    }
    rects.push([nx, ny, nw, nh]);
  }

  // 职业横向卡片: 贴图 + 名称 + 副标 + 介绍 + 技能 (←→/A D/点击切换)
  CLASS_IDS.forEach((id, i) => {
    const cxx = cardX0 + i * (cardW + gap);
    const def = CLASS_DEFS[id];
    const sel = state.ngSel.classIdx === i;
    const hov = hover(cxx, cardY, cardW, cardH);
    hudCtx.fillStyle = sel ? 'rgba(201,170,255,0.14)' : hov ? 'rgba(255,255,255,0.06)' : 'rgba(20,20,28,0.9)';
    hudCtx.fillRect(cxx, cardY, cardW, cardH);
    hudCtx.strokeStyle = sel ? '#c9aaff' : hov ? '#6a6a7a' : '#3a3a48';
    hudCtx.lineWidth = sel ? 2 : 1;
    hudCtx.strokeRect(cxx, cardY, cardW, cardH);
    hudCtx.clearRect(holeX(i), cardY + pOffY, pSize, pSize);
    hudCtx.font = 'bold 15px monospace';
    hudCtx.fillStyle = sel ? def.color : '#8a8a96';
    hudCtx.fillText(`${sel ? '▶ ' : '  '}${def.name}`, cxx + cardW / 2, cardY + 136);
    hudCtx.font = '11px monospace';
    hudCtx.fillStyle = sel ? '#bbb' : '#8a8a96';
    hudCtx.fillText(def.title, cxx + cardW / 2, cardY + 158);
    hudCtx.fillStyle = sel ? '#ddd' : '#889';
    hudCtx.fillText(def.desc, cxx + cardW / 2, cardY + 176);
    const slots = def.skillSlots;
    const skillLine = ['Q', 'W', 'E', 'R'].map(s => SKILL_SPECS[slots[s as keyof typeof slots]]?.name ?? '').filter(Boolean).join('/');
    hudCtx.fillStyle = sel ? '#9cf' : '#6a6a7a';
    hudCtx.font = '10px monospace';
    hudCtx.fillText(`${ATTR_NAMES[def.attr] ?? def.attr} · ${skillLine}`, cxx + cardW / 2, cardY + 194);
    rects.push([cxx, cardY, cardW, cardH]);
  });

  // 难度横排 (下半部): 与远征屏同款 120px 卡间距, 居中跨 w/2±300
  const diffSpacing = 120, diffCardH = 44;
  const diffY = h / 2 + 88;
  const diffX0 = (w - DIFFICULTIES.length * diffSpacing) / 2;
  hudCtx.fillStyle = '#ffb0a0';
  hudCtx.font = 'bold 15px monospace';
  hudCtx.fillText('难度 [Z/X]', w / 2, diffY - 18);
  DIFFICULTIES.forEach((d, i) => {
    const sel = state.ngSel.diffIdx === i;
    const locked = !unlockedDifficulty(state.cleared, d);
    const mod = DIFFICULTY_MODS[d];
    const dx2 = diffX0 + i * diffSpacing;
    if (sel) {
      hudCtx.fillStyle = 'rgba(255,214,74,0.15)';
      hudCtx.fillRect(dx2, diffY, diffSpacing, diffCardH);
    } else if (hover(dx2, diffY, diffSpacing, diffCardH) && !locked) {
      hudCtx.fillStyle = 'rgba(255,255,255,0.06)';
      hudCtx.fillRect(dx2, diffY, diffSpacing, diffCardH);
    }
    hudCtx.font = 'bold 16px monospace';
    hudCtx.fillStyle = sel ? '#ffd64a' : locked ? '#4a4a55' : '#99a';
    hudCtx.fillText(mod.name, dx2 + diffSpacing / 2, diffY + diffCardH / 2);
    if (!locked) rects.push([dx2, diffY, diffSpacing, diffCardH]);
  });
  // 当前难度详情 (行下方)
  const curD = DIFFICULTIES[state.ngSel.diffIdx];
  const curLocked = !unlockedDifficulty(state.cleared, curD);
  const curMod = DIFFICULTY_MODS[curD];
  hudCtx.fillStyle = '#889';
  hudCtx.font = '12px monospace';
  hudCtx.fillText(curLocked
    ? (DIFFICULTY_GATES[curD] ? `未解锁 · 通关 ${THEME_NAMES[DIFFICULTY_GATES[curD]] ?? DIFFICULTY_GATES[curD]} 后开放` : '未解锁')
    : `HP×${curMod.hpMult} 掉落×${curMod.dropMult}${curD === 'hardcore' ? ' 永久死亡' : ''}`, w / 2, diffY + diffCardH + 18);

  // 组合摘要条 (start 上方): 职业 + 难度
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
  hudCtx.fillText(`▶ ${selClass.name} · ${selDiff}`, w / 2, sumY + 14);
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
  hudCtx.fillText(` ${creating ? '创建并出发[Enter]' : '出发[Enter]'}`, w / 2, by + NG_LAYOUT.startH / 2);
  rects.push([bx, by, NG_LAYOUT.startW, NG_LAYOUT.startH]);

  // 底部: 键盘帮助条 (主题/模式移到远征屏)
  hudCtx.fillStyle = '#889';
  hudCtx.font = '13px monospace';
  hudCtx.fillText('[←/→] 职业 · [Z/X] 难度 · [Enter] 出发 · [Esc] 返回', w / 2, h - 36);
  // 左上角"返回主菜单(Esc)"按钮 (与城镇屏同款)
  const backMenuR: [number, number, number, number] = [16, 16, 160, 32];
  const mHit = hover(...backMenuR);
  hudCtx.fillStyle = mHit ? 'rgba(255,214,74,0.18)' : 'rgba(20,20,28,0.85)';
  hudCtx.fillRect(...backMenuR);
  hudCtx.strokeStyle = mHit ? '#ffd64a' : '#3a3a48';
  hudCtx.lineWidth = mHit ? 2 : 1;
  hudCtx.strokeRect(...backMenuR);
  hudCtx.fillStyle = mHit ? '#fff' : '#9aa';
  hudCtx.font = 'bold 13px monospace';
  hudCtx.fillText('返回主菜单(Esc)', 96, 32);
  rects.push(backMenuR);

  // 出发过场遮罩 (0.7s: 正在生成地牢…)
  if (getNgLaunchT() > 0) {
    hudCtx.fillStyle = 'rgba(0,0,0,0.85)';
    hudCtx.fillRect(0, 0, w, h);
    hudCtx.fillStyle = '#ffd64a';
    hudCtx.font = 'bold 30px monospace';
    hudCtx.fillText('正在进入城镇…', w / 2, h / 2 - 20);
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
    hudCtx.fillText(`${selClass.name} · ${selDiff}`, w / 2, h / 2 + 48);
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

/** 创建角色 (newgame 出发前调用, ngFrom==='create'): 成功返回 true, 名字冲突等失败 false */
export function createCharacterNow(state: GameState): boolean {
  let name = state.charNameInput.trim();
  if (name.length === 0) name = `char_${state.charList.length}`;
  name = name.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 24);
  if (name.length === 0) name = `char_${state.charList.length}`;
  const used = new Set(state.charList.map(c => c.id));
  if (used.has(name)) { pushToast(state, `角色名 ${name} 已存在`, '#f66'); return false; }
  const { classId, difficulty } = ngResolve(state.ngSel);
  state.currentChar = name;
  state.charList = [...state.charList, {
    id: name, class: classId, level: 1, difficulty, theme: 'forest',
    last_played: Math.floor(Date.now() / 1000), scene: 'dungeon', play_time: 0,
  }];
  state.charNameInput = '';
  pushToast(state, `新建角色: ${name} (${DIFFICULTY_MODS[difficulty].name})`, '#9cf');
  void persistNowApp(state);
  inf('ui', `新建角色 ${name} → 城镇`);
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
  state.ui.titleMsg = '';
  inf('ui', '新建角色 → 新局选择屏 (输入名字)');
}

/** 新局出发 (MM-UG1): 创建模式先建角色 → 解锁校验 → 统一进城镇 (主题/模式在传送门后选) */
export function startFromNewgame(state: GameState, enterTownFn?: (s: GameState) => void): void {
  const { classId, difficulty } = ngResolve(state.ngSel);
  if (!unlockedDifficulty(state.cleared, difficulty)) { pushToast(state, `${DIFFICULTY_MODS[difficulty].name} 未解锁`, '#f66'); return; }
  bindClass(state, classId);  // 先绑定职业: createCharacterNow 内 persistNowApp 存档职业才正确
  if (state.ngFrom === 'create' && !createCharacterNow(state)) return;
  saveLastNg(state);
  setNgLaunchT(-1);   // 不进地牢过场; 进城镇直接显示
  setNgNaming(false);
  if (enterTownFn) enterTownFn(state);
  else setScreen(state, 'town');
  inf('ui', `出发 → 城镇 (${CLASS_DEFS[classId].name} · ${DIFFICULTY_MODS[difficulty].name})`);
}

/** 过场结束真正开跑 (loop newgame 分支倒计时触发)。startRun 由 main.ts 注入 */
export function doLaunchRun(state: GameState, startRun: (state: GameState, theme: Theme, difficulty: Difficulty, mode?: MapMode) => void): void {
  const { classId, difficulty, theme, mode } = ngResolve(state.ngSel);
  bindClass(state, classId);  // M5 C-103: 新局绑定职业
  startRun(state, theme, difficulty, mode);
}
