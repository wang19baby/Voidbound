// screens/title.ts — 标题页纯渲染层 (US-024 拆分的最小可行切片)
//
// 设计选择 (架构笔记):
// - 只搬"读 state + 写 ctx" 的纯渲染函数, 不动 state 变更 (syncTitleFocus/moveTitleFocus/titleAct)
// - 完整 drawTitle 仍留在 main.ts (它涉及 GL 立绘 + 2D 挖孔 + 状态机 + 大量 state.charList 读取),
//   后续 US-024-b 可单独把整块 drawTitle 拆出
// - 所有函数首参 ctx (显式依赖注入, 与 ui/primitives/ui/keycap 保持一致)
//
// 依赖: ui/primitives (rrect), input/keyboard (keyLabel, Keybinds), game/toast, game/class, render/draw

import { rrect } from '../ui/primitives';
import { drawKeycap, drawGearIcon, drawSceneIcon } from '../ui/keycap';
import { inRect } from '../game/uigrid';
import type { MouseHandle } from '../input/mouse';
import type { GameState } from '../game/state';
import type { ClassId } from '../game/class';
import type { Keybinds } from '../game/keybind';
import { keyLabel, loadKeybinds, keyHintMainText, keyHintSkillsText } from '../game/keybind';
import { setScreen } from '../game/state';
import { CLASS_DEFS, CLASS_IDS, CLASS_SPRITES } from '../game/class';
import { DIFFICULTIES, DIFFICULTY_MODS } from '../game/difficulty';
import type { RenderResources } from '../render/resources';
import { drawSprite } from '../render/draw';
import { pushToast } from '../game/toast';
import { listCharacters } from '../ipc/save';
import { getTitleFocus, setNgLaunchT, setNgNaming, syncTitleFocus } from '../app/screenMachine';
import { MAP_MODES } from '../game/mapmode';
import { THEMES } from '../game/state';
import { THEME_NAMES } from './newgame';
import { SAVE_FMT_LABEL } from '../app/lifecycle';
import { version as GAME_VERSION } from '../../package.json';
import { inf, wrn } from '../util/log';

type GL = WebGL2RenderingContext;
type QuadBuffer = ReturnType<typeof import('../render/gl/resources').createQuadBuffer>;

/** 微尘粒子状态 (从 main.ts 模块级迁移; 仅本模块使用) */
interface TitleDust { x: number; y: number; vx: number; vy: number; t: number; life: number; }
let titleDust: TitleDust[] | null = null;
let titleDustLastT = 0;

/** 初始化微尘 (屏宽屏高变化时重生成) */
export function initTitleDust(canvas: HTMLCanvasElement): void {
  const w = canvas.width, h = canvas.height;
  titleDust = [];
  for (let i = 0; i < 60; i++) {
    titleDust.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      t: Math.random() * 4,
      life: 0.6 + Math.random() * 0.4,
    });
  }
  titleDustLastT = performance.now();
}

function updateTitleDust(dt: number, canvas: HTMLCanvasElement): void {
  if (!titleDust) { initTitleDust(canvas); return; }
  const w = canvas.width, h = canvas.height;
  for (const p of titleDust) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.t += dt;
    if (p.x < -4) p.x = w + 4; else if (p.x > w + 4) p.x = -4;
    if (p.y < -4) p.y = h + 4; else if (p.y > h + 4) p.y = -4;
  }
}

/** TS-002: 背景径向渐变 (中心微紫亮, 边缘回 #0b0b12) + 微尘 */
export function drawTitleBackground(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0b0b12';
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h / 2, 100, w / 2, h / 2, Math.max(w, h) * 0.7);
  g.addColorStop(0, 'rgba(80,40,120,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const now = performance.now();
  const dt = Math.min((now - titleDustLastT) / 1000, 0.05);
  titleDustLastT = now;
  updateTitleDust(dt, canvas);
  if (titleDust) {
    for (const p of titleDust) {
      // 微尘: 灰色微紫, 慢速闪烁
      const tw = 0.6 + 0.4 * Math.sin(p.t * 1.6 + p.x * 0.01);
      ctx.fillStyle = `rgba(150,130,190,${(0.08 + 0.14 * tw).toFixed(3)})`;
      const s = Math.max(1.5, 2.6 * p.life);
      ctx.fillRect(p.x, p.y, s, s);
    }
  }
}

/** TS-003: unix 秒 → 相对时间 ("刚刚"/"N 分钟前"/"N 小时前"/"N 天前") */
export function relTime(unixSec: number): string {
  if (!unixSec) return '—';
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 0) return '刚刚';
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

/** TS-005: 标题字效 (外发光 + 副标字距) */
export function drawTitleWordmark(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  const w = canvas.width, h = canvas.height;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(201,170,255,0.5)';
  ctx.shadowBlur = 24;
  ctx.fillStyle = '#c9aaff';
  ctx.font = 'bold 72px monospace';
  ctx.fillText('VOIDBOUND', w / 2, h / 2 - 140);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#888';
  ctx.font = '22px monospace';
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0.2em';
  ctx.fillText('虚空之缚 — WASD + 鼠标 · 30 分钟一局', w / 2, h / 2 - 88);
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
}

/** TS-006: 玩法说明带 (4 列, 键位项动态) */
export function drawInfoBand(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  mousePos: { x: number; y: number },
  kb: Keybinds,
  menuRects: Array<[number, number, number, number]>,
): void {
  const w = canvas.width, h = canvas.height;
  const mx = mousePos.x, my = mousePos.y;
  const cells: Array<{ icon: 'wasd' | 'cast' | 'skills' | 'clock'; text: string }> = [
    { icon: 'wasd', text: 'WASD 移动' },
    { icon: 'cast', text: '鼠标点击施法' },
    { icon: 'skills', text: `${keyLabel(kb.skills.Q)}/${keyLabel(kb.skills.W)}/${keyLabel(kb.skills.E)}/${keyLabel(kb.skills.R)} 技能` },
    { icon: 'clock', text: '30-60 分钟一局' },
  ];
  const cellW = 154, cellH = 26, gap = 16;
  const totalW = cells.length * cellW + (cells.length - 1) * gap;
  const x0 = (w - totalW) / 2, y0 = h - 84;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  cells.forEach((cell, i) => {
    const cx = x0 + i * (cellW + gap);
    const hit = inRect(mx, my, cx, y0, cellW, cellH);
    rrect(ctx, cx, y0, cellW, cellH, 6);
    ctx.fillStyle = hit ? 'rgba(156,204,255,0.10)' : 'rgba(18,18,28,0.75)';
    ctx.fill();
    ctx.strokeStyle = hit ? '#9cf' : '#2a2a3a';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 图标 (程序化 14×14)
    const icx = cx + 16, icy = y0 + cellH / 2;
    ctx.strokeStyle = '#9cf';
    ctx.fillStyle = '#9cf';
    ctx.lineWidth = 1.5;
    if (cell.icon === 'wasd') {
      ctx.fillRect(icx - 8, icy - 8, 4, 4);
      ctx.fillRect(icx - 12, icy - 2, 4, 4);
      ctx.fillRect(icx - 8, icy + 4, 4, 4);
      ctx.fillRect(icx - 4, icy - 2, 4, 4);
    } else if (cell.icon === 'cast') {
      ctx.beginPath();
      ctx.arc(icx, icy, 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(icx, icy - 7); ctx.lineTo(icx, icy - 4);
      ctx.moveTo(icx, icy + 4); ctx.lineTo(icx, icy + 7);
      ctx.moveTo(icx - 7, icy); ctx.lineTo(icx - 4, icy);
      ctx.moveTo(icx + 4, icy); ctx.lineTo(icx + 7, icy);
      ctx.stroke();
    } else if (cell.icon === 'skills') {
      for (let s = 0; s < 4; s++) ctx.fillRect(icx - 8 + s * 5, icy - 2, 3, 4);
    } else {
      ctx.beginPath();
      ctx.arc(icx, icy, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(icx, icy - 3); ctx.lineTo(icx, icy);
      ctx.moveTo(icx, icy); ctx.lineTo(icx + 3, icy + 2);
      ctx.stroke();
    }
    ctx.fillStyle = hit ? '#cde' : '#9aa';
    ctx.font = '12px monospace';
    ctx.fillText(cell.text, cx + 30, y0 + cellH / 2 + 1);
    menuRects.push([cx, y0, cellW, cellH]);
  });
  ctx.textAlign = 'center';
}

// ===== 从 main.ts 搬出的标题/设置/立绘/光标函数 (US-024-b) =====

/** 键位提示 (A 收敛): 单点生成, 键位自定义后即时反映 (纯函数) */
export function keyHintMain(): string {
  return keyHintMainText(loadKeybinds());
}
/** 设置面板技能名行 (键位动态) */
export function keyHintSkills(): string {
  return keyHintSkillsText(loadKeybinds());
}

/** 新游戏 → 新建角色选择屏 (命名框可编辑, 职业/难度预填当前) — ctx callback */
export function startNewgameFromTitle(state: GameState): void {
  state.ngSel = { classIdx: 0, diffIdx: DIFFICULTIES.indexOf(state.difficulty), themeIdx: THEMES.indexOf(state.theme), modeIdx: MAP_MODES.indexOf(state.run.mode ?? 'linear') };
  state.ngFrom = 'create';
  state.charNameInput = '';
  setNgLaunchT(-1);
  setNgNaming(true);
  setScreen(state, 'newgame');
  state.ui.titleMsg = '';
  inf('ui', '新游戏 → 创建角色选择屏 (输入名字)');
}

/** 角色管理列表 (拉取后进屏) — ctx callback */
export function openCharactersList(state: GameState): void {
  listCharacters().then(list => {
    list.sort((a, b) => b.last_played - a.last_played);  // 最近游玩在前
    state.charList = list;
    state.charSel = Math.max(0, list.findIndex(c => c.id === state.currentChar));
    state.charConfirmDel = false;
    setScreen(state, 'characters');
    state.ui.titleMsg = '';
    inf('ui', `角色管理: ${list.length} 个角色`);
  }).catch((err: unknown) => { state.ui.titleMsg = `角色列表读取失败: ${String(err)}`; wrn('save', String(err)); });
}

/** C (P3-10): 键位条目几何 (绘制与命中共用) */
export function settingsKeyRects(hudCanvas: HTMLCanvasElement): Array<{ key: string; label: string; value: string; x: number; y: number; w: number; h: number }> {
  const kb = loadKeybinds();
  const y0 = hudCanvas.height / 2 - 130;
  const rows: Array<Array<{ key: string; label: string; value: string }>> = [
    [{ key: 'dodge', label: '翻滚', value: keyLabel(kb.dodge) }, { key: 'interact', label: '交互', value: keyLabel(kb.interact) }, { key: 'equip', label: '装备', value: keyLabel(kb.equip) }],
    [{ key: 'potionHp', label: '药水HP', value: keyLabel(kb.potionHp) }, { key: 'potionMp', label: '药水MP', value: keyLabel(kb.potionMp) }],
    [{ key: 'skills.Q', label: '技能1', value: keyLabel(kb.skills.Q) }, { key: 'skills.W', label: '技能2', value: keyLabel(kb.skills.W) }, { key: 'skills.E', label: '技能3', value: keyLabel(kb.skills.E) }, { key: 'skills.R', label: '技能4', value: keyLabel(kb.skills.R) }],
  ];
  const out: Array<{ key: string; label: string; value: string; x: number; y: number; w: number; h: number }> = [];
  const itemW = 148, gap = 10;
  let ry = y0 + 216;
  for (const row of rows) {
    const x0 = hudCanvas.width / 2 - (row.length * (itemW + gap) - gap) / 2;
    row.forEach((it, i) => {
      out.push({ key: it.key, label: it.label, value: it.value, x: x0 + i * (itemW + gap), y: ry, w: itemW, h: 26 });
    });
    ry += 36;
  }
  return out;
}

/** C (P3-10): 设置面板键位条目点击 → 进入编辑捕获 */
export function handleSettingsClick(state: GameState, hudCanvas: HTMLCanvasElement, mx: number, my: number): boolean {
  for (const r of settingsKeyRects(hudCanvas)) {
    if (inRect(mx, my, r.x, r.y, r.w, r.h)) {
      state.ui.keybindEdit = r.key;
      pushToast(state, `按新键绑定「${r.label}」 (Esc 取消)`, '#9cf');
      return true;
    }
  }
  return false;
}

/** 设置面板 (C8 合并标题/暂停两处绘制 + 键位自定义区) */
export function drawSettingsPanel(state: GameState, hudCtx: CanvasRenderingContext2D, hudCanvas: HTMLCanvasElement): void {
  const w = hudCanvas.width;
  const h = hudCanvas.height;
  const y0 = hudCanvas.height / 2 - 130;
  // 加强遮罩: 全屏 + alpha 0.85, 盖住首页菜单 (用户要求)
  hudCtx.fillStyle = 'rgba(0,0,0,0.85)';
  hudCtx.fillRect(0, 0, w, h);
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillStyle = '#ffd';
  hudCtx.font = 'bold 26px monospace';
  hudCtx.fillText('设置', w / 2, y0 + 40);
  hudCtx.font = '18px monospace';
  hudCtx.fillStyle = '#fff';
  hudCtx.fillText(`音量: ${Math.round(state.volume * 100)}%   [+]/[-] 或拖动滑条`, w / 2, y0 + 82);
  // 音量滑块 (拖动逻辑在 loopImpl)
  const sliderX = w / 2 - 120;
  const sliderY = y0 + 106;
  hudCtx.fillStyle = '#333';
  hudCtx.fillRect(sliderX, sliderY, 240, 10);
  hudCtx.fillStyle = '#c9aaff';
  hudCtx.fillRect(sliderX, sliderY, 240 * state.volume, 10);
  hudCtx.strokeStyle = '#888';
  hudCtx.strokeRect(sliderX, sliderY, 240, 10);
  hudCtx.fillStyle = '#fff';
  hudCtx.font = '16px monospace';
  hudCtx.fillText(`全屏: [F] 切换`, w / 2, y0 + 138);
  hudCtx.fillText(`难度: ${DIFFICULTY_MODS[state.difficulty].name}  [N] 循环`, w / 2, y0 + 164);

  // 键位区 (P3-10)
  hudCtx.fillStyle = '#9cf';
  hudCtx.font = 'bold 15px monospace';
  hudCtx.fillText('键位 — 点击条目后按新键 · [R] 恢复默认', w / 2, y0 + 194);
  for (const r of settingsKeyRects(hudCanvas)) {
    const edit = state.ui.keybindEdit === r.key;
    hudCtx.fillStyle = edit ? 'rgba(102,204,255,0.22)' : 'rgba(24,26,36,0.95)';
    hudCtx.fillRect(r.x, r.y, r.w, r.h);
    hudCtx.strokeStyle = edit ? '#66ccff' : '#3a3a4a';
    hudCtx.lineWidth = edit ? 2 : 1;
    hudCtx.strokeRect(r.x, r.y, r.w, r.h);
    hudCtx.fillStyle = '#ddd';
    hudCtx.font = edit ? 'bold 13px monospace' : '12px monospace';
    hudCtx.fillText(edit ? '按新键…' : `${r.label}: ${r.value}`, r.x + r.w / 2, r.y + r.h / 2);
  }

  hudCtx.fillStyle = '#999';
  hudCtx.font = '13px monospace';
  hudCtx.fillText('高级: Ctrl+1..6 技能点 · P 存档 · O 读档 · L 日志级别', w / 2, y0 + 326);
  hudCtx.fillStyle = '#b99';
  hudCtx.font = '13px monospace';
  hudCtx.fillText(`技能: ${keyHintSkills()} (键位可改)`, w / 2, y0 + 350);
  hudCtx.fillStyle = '#888';
  hudCtx.font = '14px monospace';
  // [Esc] 返回文字已删除 (左上角已加 "返回主菜单(Esc)" 按钮, 文字提示重复)
  if (state.confirmHardcore) {
    hudCtx.fillStyle = '#ffd64a';
    hudCtx.font = 'bold 15px monospace';
    hudCtx.fillText('[Y] 确认切到硬核(永久死亡)  [Esc] 取消', w / 2, y0 + 396);
  }
  hudCtx.textAlign = 'left';
  hudCtx.textBaseline = 'top';
}

/** UI 屏职业立绘: 刷 WebGL 层 (2D 层对应区域须 clearRect 挖孔露出)
 *  noClear=true 跳过 gl.clear (用于步骤 1 6 卡片连画, 避免互相清掉) */
export function drawUiPortrait(gl: GL, quad: QuadBuffer, res: RenderResources, classId: ClassId, x: number, y: number, w: number, h: number, noClear = false): void {
  if (!noClear) {
    gl.clearColor(0.043, 0.043, 0.071, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  drawSprite(gl, quad, res, { x, y }, { w, h }, 'characters', CLASS_SPRITES[classId] ?? CLASS_SPRITES.barbarian, {});
}

/** 悬停光标: 命中任一交互矩形 → pointer (每帧由绘制函数调用) */
export function uiCursor(canvas: HTMLCanvasElement, mouse: MouseHandle, rects: Array<[number, number, number, number]>): void {
  const p = mouse.state().pos;
  canvas.style.cursor = rects.some(r => inRect(p.x, p.y, r[0], r[1], r[2], r[3])) ? 'pointer' : 'default';
}

// ===== drawTitle 整块抽出 (US-024-c, 原 main.ts line 1463-1673, ~211 行) =====
/**
  // 依赖注入: state/canvas/gl/quad/res/mouse 主循环显式传入,
  // 闭包引用 (state/canvas/gl/quad/res/mouse) → ctx 字段;
  // 纯模块依赖 (CLASS_DEFS/CLASS_SPRITES/THEME_NAMES/DIFFICULTY_MODS/drawSprite/rrect/inRect/
  // drawKeycap/drawGearIcon/drawSceneIcon/loadKeybinds/GAME_VERSION/SAVE_FMT_LABEL) → 直接 import。
  // 0 行为变更 (函数体原样搬移, 仅闭包依赖 → ctx 字段)。
  */
export interface TitleCtx {
  state: GameState;
  hudCtx: CanvasRenderingContext2D;
  hudCanvas: HTMLCanvasElement;
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  quad: QuadBuffer;
  res: RenderResources;
  mouse: MouseHandle;
  drawUiPortrait: (classId: ClassId, x: number, y: number, w: number, h: number) => void;
  syncTitleFocus: (hasSave: boolean) => void;
  getTitleFocus: () => number | null;
  uiCursor: (canvas: HTMLCanvasElement, mouse: MouseHandle, rects: Array<[number, number, number, number]>) => void;
}

/** 标题画面 (GAME_FLOW §1.2): 主菜单 — TS-001~009 打磨版 (原 main.ts line 1463-1673) */
export function drawTitleScreen(ctx: TitleCtx): void {
  const { state, hudCtx, hudCanvas, canvas, gl, quad, res, mouse } = ctx;
  const w = hudCanvas.width, h = hudCanvas.height;
  const mx = mouse.state().pos.x;
  const my = mouse.state().pos.y;
  const lmb = mouse.state().buttons.LMB;
  const kb = loadKeybinds();
  const menuRects: Array<[number, number, number, number]> = [];
  const hasSave = state.charList.length > 0;
  ctx.syncTitleFocus(hasSave);
  // 立绘职业: 当前角色优先, 无存档用默认 (TS-001)
  const curChar = hasSave ? (state.charList.find(c => c.id === state.currentChar) ?? state.charList[0]) : null;
  const portraitClass: ClassId = (curChar?.class as ClassId) ?? (state.player.classId as ClassId) ?? 'barbarian';
  // 主菜单布局 (与 handleUiClick 同几何): 有存档 → 金色大按钮 + [2][3][R]; 无存档 → [1][2][R]
  const menuY0 = h / 2 - 30;
  const menuItems: Array<{ y: number; label: string; key: string; icon: 'sword' | 'gear' | 'portrait'; sub: string }> = hasSave
    ? [
        { y: menuY0 + 52, label: '新游戏', key: '2', icon: 'sword', sub: '选择职业 · 难度 · 主题' },
        { y: menuY0 + 104, label: '设置', key: '3', icon: 'gear', sub: '音量 · 全屏 · 键位 · 难度' },
        { y: menuY0 + 156, label: '角色管理', key: 'R', icon: 'portrait', sub: '切换 / 新建 / 删除角色' },
      ]
    : [
        { y: menuY0, label: '新游戏', key: '1', icon: 'sword', sub: '选择职业 · 难度 · 主题' },
        { y: menuY0 + 52, label: '设置', key: '2', icon: 'gear', sub: '音量 · 全屏 · 键位 · 难度' },
        { y: menuY0 + 104, label: '角色管理', key: 'R', icon: 'portrait', sub: '切换 / 新建 / 删除角色' },
      ];
  const itemW = 320, itemH = 38;

  // ---- GL 层 (TS-001 立绘 + 脚下光环; TS-004 菜单 GL 图标): 先清空, 2D 层对应区域挖孔 ----
  const px = 24, py = h - 206, pw = 180, ph = 180;  // 左下角
  const iconSprites: Array<{ x: number; y: number; atlas: string; name: string }> = [];
  for (const it of menuItems) {
    if (it.icon === 'sword') iconSprites.push({ x: w / 2 - itemW / 2 + 14, y: it.y - itemH / 2 + 9, atlas: 'icons', name: 'skill_melee' });
    else if (it.icon === 'portrait') iconSprites.push({ x: w / 2 - itemW / 2 + 14, y: it.y - itemH / 2 + 9, atlas: 'characters', name: CLASS_SPRITES[portraitClass] ?? CLASS_SPRITES.barbarian });
  }
  gl.clearColor(0.043, 0.043, 0.071, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  // 无存档时无当前角色: 不画左下角立绘/光环 (只画菜单图标)
  if (curChar) {
    // 脚下光环 (城镇 NPC 同类画法: ui/slide_horizontal_color additive)
    drawSprite(gl, quad, res, { x: px + 24, y: py + ph - 24 }, { w: 132, h: 22 }, 'ui', 'slide_horizontal_color', { color: [0.85, 0.4, 1], blend: 'add' });
    drawSprite(gl, quad, res, { x: px, y: py }, { w: pw, h: ph }, 'characters', CLASS_SPRITES[portraitClass] ?? CLASS_SPRITES.barbarian, {});
  }
  for (const ip of iconSprites) {
    drawSprite(gl, quad, res, { x: ip.x, y: ip.y }, { w: 20, h: 20 }, ip.atlas, ip.name, {});
  }

  // ---- 2D 层 ----
  drawTitleBackground(hudCtx, hudCanvas);  // TS-002: 基色 + 径向渐变 + 微尘 (委托 screens/title.ts)
  // 挖孔露出 GL: 立绘+光环 / 菜单 GL 图标
  if (curChar) hudCtx.clearRect(px - 8, py - 8, pw + 16, ph + 36);
  for (const ip of iconSprites) hudCtx.clearRect(ip.x - 2, ip.y - 2, 24, 24);

  // TS-005: 标题外发光 + 副标字距 + 玩家向文案
  drawTitleWordmark(hudCtx, hudCanvas);

  // 金色大按钮"继续游戏" — TS-003: + 相对时间 / 场景图标 / 跑局进度条 (剩余怪)
  if (hasSave) {
    // 继续游戏按钮显示的是当前角色 (state.currentChar), 不用 recentCards[0] (右侧列表已排除当前)
    const recent = state.charList.find(c => c.id === state.currentChar);
    const contW = 480, contH = 56;
    const contX = w / 2 - contW / 2, contY = menuY0 - 45;  // 上移 22 px, 高度增加 10 → 56, 整体保持居中
    const hit = inRect(mx, my, contX, contY, contW, contH);
    const down = hit && lmb;
    const focused = ctx.getTitleFocus() === 0;
    const active = hit || focused;
    hudCtx.fillStyle = down ? 'rgba(255,214,74,0.35)' : active ? 'rgba(255,214,74,0.16)' : 'rgba(40,34,10,0.55)';
    hudCtx.fillRect(contX, contY, contW, contH);
    hudCtx.strokeStyle = down ? '#fff' : '#ffd64a';
    hudCtx.lineWidth = down ? 3 : active ? 2 : 1;
    hudCtx.strokeRect(contX, contY, contW, contH);
    if (focused) {
      hudCtx.strokeStyle = '#ffd64a';
      hudCtx.lineWidth = 2;
      hudCtx.strokeRect(contX - 3, contY - 3, contW + 6, contH + 6);
    }
    hudCtx.textAlign = 'center';
    hudCtx.textBaseline = 'middle';
    hudCtx.fillStyle = hit ? '#fff' : '#ffd64a';
    hudCtx.font = 'bold 20px monospace';
    hudCtx.fillText('[1] ▶ 继续游戏', w / 2, contY + contH / 2 - 9);
    if (recent) {
      // 行 1 右: 上次游玩距今
      hudCtx.fillStyle = '#bba';
      hudCtx.font = '12px monospace';
      hudCtx.textAlign = 'right';
      hudCtx.fillText(relTime(recent.last_played), contX + contW - 14, contY + contH / 2 - 9);
      // 行 2: 场景图标 + 摘要
      const rep = CLASS_DEFS[(recent.class as ClassId) ?? 'barbarian'];
      drawSceneIcon(hudCtx, contX + 16, contY + contH / 2 + 13, recent.id === state.currentChar ? state.mode : (recent.scene ?? 'dungeon'));
      hudCtx.fillStyle = '#caa';
      hudCtx.font = '13px monospace';
      hudCtx.textAlign = 'center';
      hudCtx.fillText(`${rep?.name ?? recent.class} ${recent.id} · Lv${recent.level} · ${THEME_NAMES[recent.theme] ?? recent.theme} · ${DIFFICULTY_MODS[recent.difficulty]?.name ?? recent.difficulty}`, w / 2 + 10, contY + contH / 2 + 13);
      // 跑局进度条 (仅当前角色 + 地牢 + 有跑局数据)
      if (recent.id === state.currentChar && state.mode === 'dungeon' && state.run.total > 0) {
        const alive = state.run.alive, total = state.run.total;
        const frac = state.run.bossAlive ? 1 : Math.min(1, Math.max(0, 1 - alive / total));
        const bx = contX + contW - 104, bw = 64, by = contY + contH / 2 + 9, bh = 5;
        hudCtx.fillStyle = '#333';
        hudCtx.fillRect(bx, by, bw, bh);
        if (frac > 0) {
          hudCtx.fillStyle = state.run.bossAlive ? '#ffd64a' : '#c9aaff';
          hudCtx.fillRect(bx, by, Math.max(2, bw * frac), bh);
        }
        hudCtx.strokeStyle = '#8a8a96';
        hudCtx.lineWidth = 1;
        hudCtx.strokeRect(bx, by, bw, bh);
        hudCtx.fillStyle = hit ? '#eed' : '#997';
        hudCtx.font = '9px monospace';
        hudCtx.textAlign = 'right';
        hudCtx.fillText(state.run.bossAlive ? 'Boss' : `${alive}/${total}`, contX + contW - 34, by + bh / 2 + 3);
      }
    }
    menuRects.push([contX, contY, contW, contH]);
  }
  // 菜单项 (TS-004: 图标/键帽/副标题; TS-007: 金边外扩 + 文字右移 + 焦点环)
  menuItems.forEach((it, i) => {
    const focusIdx = hasSave ? i + 1 : i;
    const ry = it.y - itemH / 2;
    const rx = w / 2 - itemW / 2;
    const hit = inRect(mx, my, rx, ry, itemW, itemH);
    const down = hit && lmb;  // 按下反馈: 松开瞬间已触发动作, 视觉加深
    const focused = ctx.getTitleFocus() === focusIdx;
    const active = hit || focused;
    if (active) {
      hudCtx.fillStyle = down ? 'rgba(102,204,255,0.32)' : 'rgba(102,204,255,0.13)';
      hudCtx.fillRect(rx, ry, itemW, itemH);
      hudCtx.strokeStyle = '#ffd64a';
      hudCtx.lineWidth = down ? 3 : 2;
      hudCtx.strokeRect(rx - 2, ry - 2, itemW + 4, itemH + 4);
    } else {
      hudCtx.strokeStyle = 'rgba(42,42,58,0.7)';
      hudCtx.lineWidth = 1;
      hudCtx.strokeRect(rx, ry, itemW, itemH);
    }
    if (it.icon === 'gear') drawGearIcon(hudCtx, rx + 26, it.y, 8, active, down);  // 设置图标 (图集无齿轮, 程序化)
    hudCtx.textAlign = 'center';
    hudCtx.textBaseline = 'middle';
    hudCtx.fillStyle = active ? (down ? '#fff' : '#66ccff') : '#eee';
    hudCtx.font = 'bold 22px monospace';
    hudCtx.fillText(it.label, w / 2 + 6 + (active ? 4 : 0), it.y);
    drawKeycap(hudCtx, w / 2 + itemW / 2 - 46, ry + 7, it.key, active);
    // hover/焦点副标题 (TS-004): 菜单项左侧, 右对齐
    if (active) {
      hudCtx.textAlign = 'right';
      hudCtx.fillStyle = '#9cf';
      hudCtx.font = '12px monospace';
      hudCtx.fillText(it.sub, rx - 16, it.y);
      hudCtx.textAlign = 'center';
    }
    menuRects.push([rx, ry, itemW, itemH]);
  });
  // hover 填充画在 GL 图标孔之上 → 菜单绘制完重新挖孔 (仅图标区, 不影响金边/文字)
  for (const ip of iconSprites) hudCtx.clearRect(ip.x - 2, ip.y - 2, 24, 24);

  // TS-006: 玩法说明带 (4 列, 键位随自定义)
  drawInfoBand(hudCtx, hudCanvas, mouse.state().pos, kb, menuRects);

  // TS-009: 设置齿轮入口 (右下角, 点击开设置面板)
  const gearX = w - 36, gearY = h - 36;
  const gearHit = inRect(mx, my, gearX - 14, gearY - 14, 28, 28);
  drawGearIcon(hudCtx, gearX, gearY, 9, gearHit, gearHit && lmb);
  menuRects.push([gearX - 14, gearY - 14, 28, 28]);

  // 底部: 键位提示 / 状态消息 / 版本信息 (TS-008)
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillStyle = '#888';
  hudCtx.font = '14px monospace';
  hudCtx.fillText(keyHintMain(), w / 2, h - 46);
  if (state.ui.titleMsg) {
    hudCtx.fillStyle = '#ffd64a';
    hudCtx.font = '16px monospace';
    hudCtx.fillText(state.ui.titleMsg, w / 2, h - 124);
  }
  hudCtx.fillStyle = '#4a4a58';
  hudCtx.font = '11px monospace';
  hudCtx.fillText(`v${GAME_VERSION} · 战斗原型 · 存档 ${SAVE_FMT_LABEL}`, w / 2, h - 22);
  hudCtx.textAlign = 'left';
  hudCtx.textBaseline = 'top';

  // 标题页设置面板 (C8: 与暂停共用 drawSettingsPanel, 含滑条/键位自定义)
  if (state.ui.settingsOpen) {
    drawSettingsPanel(state, hudCtx, hudCanvas);
  }
  ctx.uiCursor(canvas, mouse, menuRects);
}

