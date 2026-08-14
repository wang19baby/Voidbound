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
import { inRect } from '../game/uigrid';
import type { MouseHandle } from '../input/mouse';
import type { CollectionCtx } from './collection';

// ============================================================================
// Ctx
// ============================================================================

export interface CharactersCtx {
  state: GameState;
  hudCtx: CanvasRenderingContext2D;
  hudCanvas: HTMLCanvasElement;
  mouse: MouseHandle;
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
  const { state, hudCtx, hudCanvas, mouse, drawCollectionPanel } = ctx;
  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.fillStyle = '#0b0b12';
  hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillStyle = '#c9aaff';
  hudCtx.font = 'bold 44px monospace';
  hudCtx.fillText('角色管理', hudCanvas.width / 2, 64);
  const cx = hudCanvas.width / 2;

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
    hudCtx.fillStyle = '#ff6a6a';
    hudCtx.font = 'bold 22px monospace';
    hudCtx.fillText(`删除角色 ${target ? target.id : ''}?`, cx, hudCanvas.height / 2 - 20);
    hudCtx.fillStyle = '#f88';
    hudCtx.font = '16px monospace';
    hudCtx.fillText('[Y] 确认删除 (存档不可恢复) · [Esc] 取消', cx, hudCanvas.height / 2 + 20);
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

  // 列表
  if (state.charList.length === 0) {
    hudCtx.fillStyle = '#888';
    hudCtx.font = '18px monospace';
    hudCtx.fillText('暂无角色 · 返回首页用 [新游戏] 创建', cx, hudCanvas.height / 2);
  } else {
    const rows = Math.min(state.charList.length, 8);
    const y0 = hudCanvas.height / 2 - rows * 26;
    state.charList.slice(0, rows).forEach((c, i) => {
      const sel = i === state.charSel;
      const def = CLASS_DEFS[c.class as ClassId] ?? CLASS_DEFS.barbarian;
      const isCur = c.id === state.currentChar;
      hudCtx.font = 'bold 18px monospace';
      hudCtx.fillStyle = sel ? '#ffd64a' : '#bbb';
      hudCtx.fillText(`${sel ? '▶ ' : '  '}${c.id}${isCur ? ' (当前)' : ''}`, cx - 200, y0 + i * 52);
      hudCtx.font = '14px monospace';
      hudCtx.fillStyle = sel ? '#fda' : '#889';
      hudCtx.fillText(`${def.name} · Lv${c.level} · ${DIFFICULTY_MODS[c.difficulty]?.name ?? c.difficulty} · ${c.theme}`, cx + 60, y0 + i * 52);
    });
  }
  // 底部操作按钮 (与 uiDispatch 'characters' 命中区同步: 进入 cx-228,h-64,300,36 / 删除 cx+88,h-64,140,36)
  const btnY = hudCanvas.height - 64;
  const enterR: [number, number, number, number] = [cx - 228, btnY, 300, 36];
  const delR: [number, number, number, number] = [cx + 88, btnY, 140, 36];
  const enterHit = inRect(mp.x, mp.y, ...enterR);
  const delHit = inRect(mp.x, mp.y, ...delR);
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
