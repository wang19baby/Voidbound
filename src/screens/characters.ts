// screens/characters.ts — 角色管理屏 (US-026 伴随 T1c)
//
// 拆分动机: main.ts 1896-2001 + 2010-2087 角色屏 + 收集总览两屏, 拆分后暂留 ctx 注入
//
// 设计选择 (与 screens/town 一致):
// - drawCharacters 整块原样搬移, 闭包引用 → ctx 字段
// - drawCollectionPanel 按同样惯例拆 screens/collection.ts, 由 ctx.drawCollectionPanel 注入
// - uiCursor 是 main.ts 私有 (line 1587), 由 ctx 注入
// - CLASS_DEFS / DIFFICULTY_MODS / inRect 直接从 game/* import
//
// 依赖: game/class + game/difficulty + game/uigrid (inRect) + ctx 注入

import type { GameState } from '../game/state';
import { CLASS_DEFS, type ClassId } from '../game/class';
import { DIFFICULTY_MODS } from '../game/difficulty';
import { THEME_NAMES } from './newgame';
import { inRect } from '../game/uigrid';
import type { MouseHandle } from '../input/mouse';
import type { CollectionCtx } from './collection';

// ============================================================================
// 布局常量 (方案 A: 左列表 + 右详情; uiDispatch 命中区同步引用)
// ============================================================================

export const CH_LAYOUT = {
  panelX: 40, panelY: 120, panelW: 520,   // 左列表面板 (panelH = h + panelHOff)
  panelHOff: -230,
  rightXOff: -560, rightW: 520,           // 右详情面板: x = w + rightXOff
  rowX: 56, rowY0: 160, rowW: 488, rowH: 54,  // 列表行
  pSize: 200, pY: 144,                    // 详情立绘
};

/** 难度徽章色 */
function diffColor(d: string): string {
  switch (d) {
    case 'nightmare': return '#fa6';
    case 'hell': return '#f66';
    case 'inferno': return '#f3c';
    case 'hardcore': return '#ff4444';
    default: return '#6cf';
  }
}

/** 最近游玩相对时间 */
function lastPlayedText(sec: number): string {
  if (!sec) return '未知';
  const diff = Math.floor(Date.now() / 1000) - sec;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

/** 游玩时长 (秒 → 时/分/秒) */
function playTimeText(sec: number): string {
  if (!sec) return '0 分';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
}

// ============================================================================
// Ctx
// ============================================================================

export interface CharactersCtx {
  state: GameState;
  hudCtx: CanvasRenderingContext2D;
  hudCanvas: HTMLCanvasElement;
  mouse: MouseHandle;
  /** GL 职业立绘 (main.ts 注入 gl/quad/res 闭包; 同 newgame 屏) */
  drawUiPortrait: (classId: ClassId, x: number, y: number, w: number, h: number, noClear?: boolean) => void;
  /** drawCollectionPanel 回调 (从 screens/collection 注入; 避免 screens/characters → screens/collection 单向依赖) */
  drawCollectionPanel: (ctx: CollectionCtx) => void;
  /** main.ts line 1587: 悬停光标 (命中任一矩形 → pointer) */
  uiCursor: (rects: Array<[number, number, number, number]>) => void;
}

// ============================================================================
// 绘制
// ============================================================================

/** 角色管理屏 (C-202): 列表(职业/等级/难度) + 删除(D 二次确认) + Enter 切换
 *  (MM-UG1-b: 新建入口移除, 统一走首页"新游戏"菜单) */
export function drawCharacters(ctx: CharactersCtx): void {
  const { state, hudCtx, hudCanvas, mouse, drawUiPortrait, drawCollectionPanel } = ctx;
  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.fillStyle = '#0b0b12';
  hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillStyle = '#c9aaff';
  hudCtx.font = 'bold 44px monospace';
  hudCtx.fillText('角色管理', hudCanvas.width / 2, 64);
  const cx = hudCanvas.width / 2;
  const W = hudCanvas.width, H = hudCanvas.height;
  const ly = CH_LAYOUT;
  const panelH = H + ly.panelHOff;      // 720-230 = 490
  const rightX = W + ly.rightXOff;      // 720

  // C (P1-4): 右上"收集进度"按钮 (删除确认之外均可点)
  if (!state.charConfirmDel) {
    const cbR: [number, number, number, number] = [hudCanvas.width - 150, 20, 130, 30];
    const cbHit = inRect(mouse.state().pos.x, mouse.state().pos.y, ...cbR);
    hudCtx.fillStyle = cbHit ? 'rgba(201,170,255,0.18)' : 'rgba(30,30,42,0.9)';
    hudCtx.fillRect(...cbR);
    hudCtx.strokeStyle = cbHit ? '#c9aaff' : '#4a4a5a';
    hudCtx.lineWidth = cbHit ? 2 : 1;
    hudCtx.strokeRect(...cbR);
    hudCtx.fillStyle = '#c9aaff';
    hudCtx.font = 'bold 13px monospace';
    hudCtx.fillText('收集进度', hudCanvas.width - 85, 36);
  }
  // C (P1-4): 收集总览覆盖层
  if (state.ui.collectOpen) {
    drawCollectionPanel(ctx);
    return;
  }

  if (state.charConfirmDel) {
    const target = state.charList[state.charSel];
    const mpd = mouse.state().pos;
    hudCtx.fillStyle = '#ff6a6a';
    hudCtx.font = 'bold 22px monospace';
    hudCtx.fillText(`删除角色 ${target ? target.id : ''}?`, cx, hudCanvas.height / 2 - 30);
    hudCtx.fillStyle = '#f88';
    hudCtx.font = '13px monospace';
    hudCtx.fillText('存档不可恢复', cx, hudCanvas.height / 2 - 2);
    // 两个可见按钮 (与 uiDispatch 'characters' 命中区同步: 确认 cx-210 / 取消 cx+20, 均 h/2+28,190×44)
    const yR: [number, number, number, number] = [cx - 210, hudCanvas.height / 2 + 28, 190, 44];
    const nR: [number, number, number, number] = [cx + 20, hudCanvas.height / 2 + 28, 190, 44];
    const yHit = inRect(mpd.x, mpd.y, ...yR);
    const nHit = inRect(mpd.x, mpd.y, ...nR);
    hudCtx.fillStyle = yHit ? 'rgba(255,106,106,0.25)' : 'rgba(60,20,20,0.9)';
    hudCtx.fillRect(...yR);
    hudCtx.strokeStyle = yHit ? '#ff6a6a' : '#7a4a4a';
    hudCtx.lineWidth = yHit ? 2 : 1;
    hudCtx.strokeRect(...yR);
    hudCtx.fillStyle = '#fff';
    hudCtx.font = 'bold 16px monospace';
    hudCtx.fillText('确认删除 [Y]', cx - 115, hudCanvas.height / 2 + 50);
    hudCtx.fillStyle = nHit ? 'rgba(255,255,255,0.14)' : 'rgba(30,30,42,0.9)';
    hudCtx.fillRect(...nR);
    hudCtx.strokeStyle = nHit ? '#c9aaff' : '#4a4a5a';
    hudCtx.lineWidth = nHit ? 2 : 1;
    hudCtx.strokeRect(...nR);
    hudCtx.fillStyle = '#fff';
    hudCtx.fillText('取消 [Esc]', cx + 115, hudCanvas.height / 2 + 50);
    hudCtx.textAlign = 'left';
    hudCtx.textBaseline = 'top';
    return;
  }

  // 左上角"返回主菜单(Esc)"按钮 (与城镇/新局屏同款)
  const mp = mouse.state().pos;
  const backMenuR: [number, number, number, number] = [16, 16, 160, 32];
  const mHit = inRect(mp.x, mp.y, ...backMenuR);
  hudCtx.fillStyle = mHit ? 'rgba(255,214,74,0.18)' : 'rgba(20,20,28,0.85)';
  hudCtx.fillRect(...backMenuR);
  hudCtx.strokeStyle = mHit ? '#ffd64a' : '#3a3a48';
  hudCtx.lineWidth = mHit ? 2 : 1;
  hudCtx.strokeRect(...backMenuR);
  hudCtx.fillStyle = mHit ? '#fff' : '#9aa';
  hudCtx.font = 'bold 13px monospace';
  hudCtx.fillText('返回主菜单(Esc)', 96, 32);

  // 列表 (方案 A: 左列表 + 右详情)
  if (state.charList.length === 0) {
    hudCtx.fillStyle = '#888';
    hudCtx.font = '18px monospace';
    hudCtx.fillText('暂无角色 · 返回首页用 [新游戏] 创建', cx, hudCanvas.height / 2);
  } else {
    // ---- 左侧列表面板 ----
    hudCtx.fillStyle = 'rgba(20,20,28,0.92)';
    hudCtx.fillRect(ly.panelX, ly.panelY, ly.panelW, panelH);
    hudCtx.strokeStyle = '#3a3a48';
    hudCtx.lineWidth = 1;
    hudCtx.strokeRect(ly.panelX, ly.panelY, ly.panelW, panelH);
    hudCtx.textAlign = 'left';
    hudCtx.fillStyle = '#889';
    hudCtx.font = 'bold 13px monospace';
    hudCtx.fillText(`角色列表 (${state.charList.length})`, ly.panelX + 16, ly.panelY + 16);
    const rows = Math.min(state.charList.length, 8);
    state.charList.slice(0, rows).forEach((c, i) => {
      const sel = i === state.charSel;
      const y = ly.rowY0 + i * ly.rowH;
      const hit = inRect(mp.x, mp.y, ly.rowX, y, ly.rowW, ly.rowH);
      const def = CLASS_DEFS[c.class as ClassId] ?? CLASS_DEFS.barbarian;
      const isCur = c.id === state.currentChar;
      hudCtx.fillStyle = sel ? 'rgba(201,170,255,0.14)' : hit ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0)';
      hudCtx.fillRect(ly.rowX, y, ly.rowW, ly.rowH);
      hudCtx.strokeStyle = sel ? '#ffd64a' : hit ? '#66ccff' : 'rgba(255,255,255,0.06)';
      hudCtx.lineWidth = sel ? 2 : 1;
      hudCtx.strokeRect(ly.rowX, y, ly.rowW, ly.rowH);
      hudCtx.fillStyle = sel ? '#ffd64a' : '#ddd';
      hudCtx.font = 'bold 17px monospace';
      hudCtx.fillText(c.id, ly.rowX + 16, y + 20);
      if (isCur) {
        hudCtx.fillStyle = '#ffd64a';
        hudCtx.font = '11px monospace';
        hudCtx.fillText('当前', ly.rowX + ly.rowW - 46, y + 20);
      }
      hudCtx.fillStyle = sel ? '#fda' : '#889';
      hudCtx.font = '13px monospace';
      hudCtx.fillText(`${def.name} · Lv${c.level}`, ly.rowX + 16, y + 40);
      hudCtx.fillStyle = diffColor(c.difficulty);
      hudCtx.fillText(DIFFICULTY_MODS[c.difficulty]?.name ?? c.difficulty, ly.rowX + 170, y + 40);
    });

    // ---- 右侧详情卡 ----
    const selChar = state.charList[Math.min(state.charSel, state.charList.length - 1)];
    const selDef = CLASS_DEFS[selChar.class as ClassId] ?? CLASS_DEFS.barbarian;
    const isCur = selChar.id === state.currentChar;
    const px = rightX + (ly.rightW - ly.pSize) / 2;
    drawUiPortrait(selChar.class as ClassId, px, ly.pY, ly.pSize, ly.pSize);
    hudCtx.fillStyle = 'rgba(20,20,28,0.92)';
    hudCtx.fillRect(rightX, ly.panelY, ly.rightW, panelH);
    hudCtx.strokeStyle = isCur ? '#ffd64a' : '#3a3a48';
    hudCtx.lineWidth = isCur ? 2 : 1;
    hudCtx.strokeRect(rightX, ly.panelY, ly.rightW, panelH);
    hudCtx.clearRect(px, ly.pY, ly.pSize, ly.pSize);  // 挖孔露出 GL 立绘
    if (isCur) {
      hudCtx.fillStyle = 'rgba(255,214,74,0.15)';
      hudCtx.fillRect(rightX + ly.rightW - 92, ly.panelY + 16, 74, 26);
      hudCtx.strokeStyle = '#ffd64a';
      hudCtx.lineWidth = 1;
      hudCtx.strokeRect(rightX + ly.rightW - 92, ly.panelY + 16, 74, 26);
      hudCtx.fillStyle = '#ffd64a';
      hudCtx.font = 'bold 13px monospace';
      hudCtx.textAlign = 'center';
      hudCtx.fillText('当前', rightX + ly.rightW - 55, ly.panelY + 29);
    }
    hudCtx.textAlign = 'center';
    hudCtx.fillStyle = '#fff';
    hudCtx.font = 'bold 26px monospace';
    hudCtx.fillText(selChar.id, rightX + ly.rightW / 2, ly.pY + ly.pSize + 26);
    hudCtx.fillStyle = '#c9aaff';
    hudCtx.font = '16px monospace';
    hudCtx.fillText(selDef.name, rightX + ly.rightW / 2, ly.pY + ly.pSize + 54);
    hudCtx.strokeStyle = '#3a3a48';
    hudCtx.beginPath();
    hudCtx.moveTo(rightX + 40, ly.pY + ly.pSize + 76);
    hudCtx.lineTo(rightX + ly.rightW - 40, ly.pY + ly.pSize + 76);
    hudCtx.stroke();
    const info: Array<[string, string, string]> = [
      ['等级', `Lv${selChar.level}`, '#fff'],
      ['难度', DIFFICULTY_MODS[selChar.difficulty]?.name ?? selChar.difficulty, diffColor(selChar.difficulty)],
      ['主题', THEME_NAMES[selChar.theme] ?? selChar.theme, '#fff'],
      ['场景', selChar.scene === 'town' ? '城镇' : '地下城', '#fff'],
      ['最近游玩', lastPlayedText(selChar.last_played), '#fff'],
      ['游玩时长', playTimeText(selChar.play_time), '#9cf'],
    ];
    hudCtx.textAlign = 'left';
    hudCtx.font = '15px monospace';
    let iy = ly.pY + ly.pSize + 96;
    for (const [k, v, col] of info) {
      hudCtx.fillStyle = '#889';
      hudCtx.fillText(k, rightX + 40, iy);
      hudCtx.fillStyle = col;
      hudCtx.fillText(v, rightX + 140, iy);
      iy += 30;
    }
  }
  // 底部操作按钮 (与 uiDispatch 'characters' 命中区同步: 进入 cx-228,h-64,300,36 / 删除 cx+88,h-64,140,36)
  const btnY = hudCanvas.height - 64;
  const enterR: [number, number, number, number] = [cx - 228, btnY, 300, 36];
  const delR: [number, number, number, number] = [cx + 88, btnY, 140, 36];
  const enterHit = inRect(mp.x, mp.y, ...enterR);
  const delHit = inRect(mp.x, mp.y, ...delR);
  hudCtx.textAlign = 'center';  // 按钮文字居中 (详情卡信息行改过 textAlign)
  hudCtx.fillStyle = enterHit ? 'rgba(201,170,255,0.18)' : 'rgba(30,30,42,0.9)';
  hudCtx.fillRect(...enterR);
  hudCtx.strokeStyle = enterHit ? '#c9aaff' : '#4a4a5a';
  hudCtx.lineWidth = enterHit ? 2 : 1;
  hudCtx.strokeRect(...enterR);
  hudCtx.fillStyle = '#fff';
  hudCtx.font = 'bold 15px monospace';
  hudCtx.fillText('进入 [Enter]/切换 [↑/↓]', cx - 78, btnY + 18);
  hudCtx.fillStyle = delHit ? 'rgba(255,106,106,0.18)' : 'rgba(30,30,42,0.9)';
  hudCtx.strokeStyle = delHit ? '#ff6a6a' : '#4a4a5a';
  hudCtx.lineWidth = delHit ? 2 : 1;
  hudCtx.strokeRect(...delR);
  hudCtx.fillRect(...delR);
  hudCtx.fillStyle = '#fff';
  hudCtx.fillText('删除 [D]', cx + 158, btnY + 18);
  if (state.ui.titleMsg) {
    hudCtx.fillStyle = '#ffd64a';
    hudCtx.font = '14px monospace';
    hudCtx.fillText(state.ui.titleMsg, cx, hudCanvas.height - 80);
  }
  hudCtx.textAlign = 'left';
  hudCtx.textBaseline = 'top';
}
