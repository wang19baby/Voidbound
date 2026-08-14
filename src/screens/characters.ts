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

/** 角色管理屏 (C-202): 列表(职业/等级/难度) + 新建(N) + 删除(D 二次确认) + Enter 切换 */
export function drawCharacters(ctx: CharactersCtx): void {
  const { state, hudCtx, hudCanvas, mouse, drawCollectionPanel } = ctx;
  const w = hudCanvas.width;
  const h = hudCanvas.height;
  const cx = w / 2;
  const mx = mouse.state().pos.x, my = mouse.state().pos.y;

  hudCtx.clearRect(0, 0, w, h);
  hudCtx.fillStyle = '#0b0b12';
  hudCtx.fillRect(0, 0, w, h);

  // 顶栏: 左 返回首页 / 中 标题 / 右 收集进度
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillStyle = '#c9aaff';
  hudCtx.font = 'bold 36px monospace';
  hudCtx.fillText('角色管理', cx, 56);

  // 左上 "← 返回首页" 按钮 (160×40, 统一命名与其他屏的"返回首页"一致)
  const backR: [number, number, number, number] = [20, 20, 160, 40];
  const backHit = inRect(mx, my, ...backR);
  hudCtx.fillStyle = backHit ? 'rgba(102,204,255,0.18)' : 'rgba(20,20,28,0.85)';
  hudCtx.fillRect(...backR);
  hudCtx.strokeStyle = backHit ? '#66ccff' : '#3a3a48';
  hudCtx.lineWidth = backHit ? 2 : 1;
  hudCtx.strokeRect(...backR);
  hudCtx.fillStyle = backHit ? '#fff' : '#9cf';
  hudCtx.font = 'bold 14px monospace';
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillText('返回主菜单(Esc)', 100, 40);

  // 右上 "收集进度" 按钮 (160×30, 与返回按钮对称)
  const colR: [number, number, number, number] = [w - 180, 20, 160, 30];
  const colHit = inRect(mx, my, ...colR);
  hudCtx.fillStyle = colHit ? 'rgba(201,170,255,0.22)' : 'rgba(30,30,42,0.9)';
  hudCtx.fillRect(...colR);
  hudCtx.strokeStyle = colHit ? '#c9aaff' : '#4a4a5a';
  hudCtx.lineWidth = colHit ? 2 : 1;
  hudCtx.strokeRect(...colR);
  hudCtx.fillStyle = '#c9aaff';
  hudCtx.font = 'bold 13px monospace';
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillText('收集进度', w - 100, 36);

  // 收集总览覆盖层 (覆盖整个角色管理)
  if (state.ui.collectOpen) {
    drawCollectionPanel(ctx);
    return;
  }

  // ===== 主体: 角色大列表 =====
  const listX = cx - 300, listW = 600, listY0 = 110, rowH = 56, rowGap = 6;
  const rows = Math.min(state.charList.length, 9);

  if (rows === 0) {
    // 0 角色: 中央"新建第一个角色"大按钮 (替代原"暂无角色"文字)
    const newFirstR: [number, number, number, number] = [cx - 200, h / 2 - 30, 400, 60];
    const nfHit = inRect(mx, my, ...newFirstR);
    hudCtx.fillStyle = nfHit ? 'rgba(102,255,153,0.25)' : 'rgba(20,28,20,0.9)';
    hudCtx.fillRect(...newFirstR);
    hudCtx.strokeStyle = nfHit ? '#6f6' : '#3a4a3a';
    hudCtx.lineWidth = nfHit ? 2 : 1;
    hudCtx.strokeRect(...newFirstR);
    hudCtx.fillStyle = nfHit ? '#fff' : '#9c9';
    hudCtx.font = 'bold 20px monospace';
    hudCtx.textAlign = 'center';
    hudCtx.textBaseline = 'middle';
    hudCtx.fillText('新建第一个角色 (N)', cx, h / 2);
  } else {
    // 列表大卡片 (重新设计: 职业色条 + 角色名 + Lv 大字 + 难度·主题 + 当前角色角标)
    state.charList.slice(0, rows).forEach((c, i) => {
      const sel = i === state.charSel;
      const isCur = c.id === state.currentChar;
      const def = CLASS_DEFS[c.class as ClassId] ?? CLASS_DEFS.barbarian;
      const ry = listY0 + i * (rowH + rowGap);
      const hit = inRect(mx, my, listX, ry, listW, rowH);
      // 背景: 选中用渐变金, hover 蓝, 默认深色
      if (sel) {
        const grad = hudCtx.createLinearGradient(listX, ry, listX, ry + rowH);
        grad.addColorStop(0, 'rgba(255,214,74,0.22)');
        grad.addColorStop(1, 'rgba(255,214,74,0.08)');
        hudCtx.fillStyle = grad;
      } else {
        hudCtx.fillStyle = hit ? 'rgba(102,204,255,0.10)' : 'rgba(20,20,28,0.88)';
      }
      hudCtx.fillRect(listX, ry, listW, rowH);
      // 左侧职业色条 (6px)
      hudCtx.fillStyle = def.color;
      hudCtx.fillRect(listX, ry, 6, rowH);
      // 边框
      hudCtx.strokeStyle = sel ? '#ffd64a' : (hit ? '#66ccff' : '#3a3a48');
      hudCtx.lineWidth = sel ? 3 : (hit ? 2 : 1);
      hudCtx.strokeRect(listX + 0.5, ry + 0.5, listW - 1, rowH - 1);
      // 当前角色: 副标后追加金色 "· 当前" (避免与右侧 Lv 大字撞)
      // 角色名 (左上)
      hudCtx.fillStyle = sel ? '#ffd64a' : '#eee';
      hudCtx.font = 'bold 17px monospace';
      hudCtx.textAlign = 'left';
      hudCtx.textBaseline = 'middle';
      hudCtx.fillText(`${sel ? '▶ ' : '  '}${c.id}`, listX + 20, ry + 22);
      // 副标: 职业 (当前) (左下)
      hudCtx.fillStyle = isCur ? '#ffd64a' : '#888';
      hudCtx.font = '12px monospace';
      hudCtx.fillText(isCur ? `${def.name}  · 当前` : def.name, listX + 20, ry + 42);
      // Lv 大字 (右上, 缩小到 17px 避免超框)
      hudCtx.fillStyle = sel ? '#ffd64a' : '#9cf';
      hudCtx.font = 'bold 17px monospace';
      hudCtx.textAlign = 'right';
      hudCtx.textBaseline = 'middle';
      hudCtx.fillText(`Lv${c.level}`, listX + listW - 16, ry + 24);
      // 难度 · 主题 (右下)
      hudCtx.fillStyle = sel ? '#fda' : '#999';
      hudCtx.font = '12px monospace';
      hudCtx.fillText(`${DIFFICULTY_MODS[c.difficulty]?.name ?? c.difficulty} · ${c.theme}`, listX + listW - 16, ry + 44);
    });
  }

  // ===== 底部 3 按钮 (键位说明文案已去掉, 按钮文字内自带提示) =====
  const enterR: [number, number, number, number] = [cx - 320, h - 60, 380, 40];
  const newR: [number, number, number, number] = [cx + 80, h - 60, 100, 40];
  const delR: [number, number, number, number] = [cx + 200, h - 60, 100, 40];
  const enterHit = inRect(mx, my, ...enterR);
  const newHit = inRect(mx, my, ...newR);
  const delHit = inRect(mx, my, ...delR);
  // 禁用态: 0 角色时所有按钮禁用
  const disabled = state.charList.length === 0;
  // 进入按钮
  hudCtx.fillStyle = disabled ? 'rgba(40,40,50,0.6)' : (enterHit ? 'rgba(102,204,255,0.22)' : 'rgba(20,28,40,0.9)');
  hudCtx.fillRect(...enterR);
  hudCtx.strokeStyle = disabled ? '#444' : (enterHit ? '#66ccff' : '#3a4a5a');
  hudCtx.lineWidth = enterHit ? 2 : 1;
  hudCtx.strokeRect(...enterR);
  hudCtx.fillStyle = disabled ? '#666' : (enterHit ? '#fff' : '#9cf');
  hudCtx.font = 'bold 16px monospace';
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillText('进入(Enter)/切换(↑↓)', enterR[0] + enterR[2] / 2, h - 40);
  // 新建按钮
  hudCtx.fillStyle = newHit ? 'rgba(102,255,153,0.22)' : 'rgba(20,28,20,0.9)';
  hudCtx.fillRect(...newR);
  hudCtx.strokeStyle = newHit ? '#6f6' : '#3a4a3a';
  hudCtx.lineWidth = newHit ? 2 : 1;
  hudCtx.strokeRect(...newR);
  hudCtx.fillStyle = newHit ? '#fff' : '#9c9';
  hudCtx.fillText('新建 (N)', newR[0] + newR[2] / 2, h - 40);
  // 删除按钮 (0 角色禁用)
  hudCtx.fillStyle = disabled ? 'rgba(40,40,50,0.6)' : (delHit ? 'rgba(255,102,102,0.22)' : 'rgba(28,20,20,0.9)');
  hudCtx.fillRect(...delR);
  hudCtx.strokeStyle = disabled ? '#444' : (delHit ? '#f66' : '#4a3a3a');
  hudCtx.lineWidth = delHit ? 2 : 1;
  hudCtx.strokeRect(...delR);
  hudCtx.fillStyle = disabled ? '#666' : (delHit ? '#fff' : '#f99');
  hudCtx.fillText('删除 (D)', delR[0] + delR[2] / 2, h - 40);

  // titleMsg (h-180, 列表下方)
  if (state.ui.titleMsg) {
    hudCtx.fillStyle = '#ffd64a';
    hudCtx.font = '14px monospace';
    hudCtx.textAlign = 'center';
    hudCtx.textBaseline = 'middle';
    hudCtx.fillText(state.ui.titleMsg, cx, h - 180);
  }

  // ===== 删除确认对话框 (半透明遮罩 + 中央) — 替代原 return =====
  if (state.charConfirmDel) {
    const target = state.charList[state.charSel];
    // 全屏遮罩
    hudCtx.fillStyle = 'rgba(0,0,0,0.78)';
    hudCtx.fillRect(0, 0, w, h);
    // 中央对话框
    const dlgW = 480, dlgH = 200, dlgX = cx - dlgW / 2, dlgY = h / 2 - dlgH / 2;
    hudCtx.fillStyle = '#1a1a28';
    hudCtx.fillRect(dlgX, dlgY, dlgW, dlgH);
    hudCtx.strokeStyle = '#f66';
    hudCtx.lineWidth = 2;
    hudCtx.strokeRect(dlgX, dlgY, dlgW, dlgH);
    // 标题
    hudCtx.fillStyle = '#ff6a6a';
    hudCtx.font = 'bold 24px monospace';
    hudCtx.textAlign = 'center';
    hudCtx.textBaseline = 'middle';
    hudCtx.fillText(`删除角色 ${target ? target.id : ''}?`, cx, dlgY + 50);
    hudCtx.fillStyle = '#f88';
    hudCtx.font = '14px monospace';
    hudCtx.fillText('存档不可恢复', cx, dlgY + 80);
    // 确认 + 取消按钮
    const okR: [number, number, number, number] = [dlgX + 40, dlgY + 130, 180, 44];
    const cancelR: [number, number, number, number] = [dlgX + 260, dlgY + 130, 180, 44];
    const okHit = inRect(mx, my, ...okR);
    const cancelHit = inRect(mx, my, ...cancelR);
    hudCtx.fillStyle = okHit ? 'rgba(255,80,80,0.4)' : 'rgba(120,30,30,0.9)';
    hudCtx.fillRect(...okR);
    hudCtx.strokeStyle = '#f66';
    hudCtx.lineWidth = okHit ? 2 : 1;
    hudCtx.strokeRect(...okR);
    hudCtx.fillStyle = '#fff';
    hudCtx.font = 'bold 16px monospace';
    hudCtx.fillText('确认删除', okR[0] + okR[2] / 2, okR[1] + okR[3] / 2);
    hudCtx.fillStyle = cancelHit ? 'rgba(160,160,180,0.3)' : 'rgba(50,50,60,0.9)';
    hudCtx.fillRect(...cancelR);
    hudCtx.strokeStyle = cancelHit ? '#fff' : '#888';
    hudCtx.lineWidth = cancelHit ? 2 : 1;
    hudCtx.strokeRect(...cancelR);
    hudCtx.fillStyle = cancelHit ? '#fff' : '#ccc';
    hudCtx.fillText('取消 (Esc)', cancelR[0] + cancelR[2] / 2, cancelR[1] + cancelR[3] / 2);
  }

  hudCtx.textAlign = 'left';
  hudCtx.textBaseline = 'top';
}
