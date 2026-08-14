// screens/close.ts — 关窗确认覆盖层 (US-026 拆分附带抽取)
//
// 用途: 关窗事件触发的全屏覆盖层 [Y] 退出(不保存) / [N] 取消; 返回主菜单模式 [Y] 返回主菜单(保存后回标题)
// 抽取动机: 30 行独立函数, 与 main.ts 其他屏渲染无共享状态 (除 state.screen 只读)
//
// 依赖: game/uigrid (inRect), input/mouse (MouseHandle)

import type { Screen } from '../game/state';
import { isInGameScreen } from '../game/state';
import { isCloseConfirmReturn } from '../app/screenMachine';
import type { MouseHandle } from '../input/mouse';
import { inRect } from '../game/uigrid';

/** 关窗确认覆盖层: 全屏遮罩 + [Y] 退出/返回主菜单 / [N] 取消 (键盘与鼠标均可) */
export function drawCloseConfirm(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  currentScreen: Screen,
  saving: boolean,
  mouse: MouseHandle,
): void {
  const returning = isCloseConfirmReturn();  // true=返回主菜单模式(保存后回标题), false=关窗(直接退出不保存)
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd';
  ctx.font = 'bold 26px monospace';
  ctx.fillText(returning ? '返回主菜单?' : '确认退出?', canvas.width / 2, canvas.height / 2 - 40);
  ctx.fillStyle = '#9aa';
  ctx.font = '15px monospace';
  const inGame = isInGameScreen(currentScreen);
  // 关窗模式: 不保存直接退出 (与暂停"返回城镇"放弃逻辑一致); 返回主菜单模式: 保存后回标题
  ctx.fillText(
    returning
      ? (saving ? '正在保存…' : '当前进度会自动保存')
      : (inGame ? '本次进度/物品不会保存' : '未进入游戏, 无需保存'),
    canvas.width / 2, canvas.height / 2,
  );
  if (!saving) {
    const mx = mouse.state().pos.x;
    const my = mouse.state().pos.y;
    // 150px 宽: "返回主菜单" 5 个 CJK + "[Y] " 在 bold 18px 下约 128px, 120px 会截字
    const yR: [number, number, number, number] = [canvas.width / 2 - 160, canvas.height / 2 + 40, 150, 40];
    const nR: [number, number, number, number] = [canvas.width / 2 + 10, canvas.height / 2 + 40, 150, 40];
    const yH = inRect(mx, my, ...yR);
    const nH = inRect(mx, my, ...nR);
    ctx.fillStyle = yH ? '#2a3a2a' : '#1c2a1c';
    ctx.fillRect(...yR);
    ctx.strokeStyle = yH ? '#fff' : '#5a5';
    ctx.lineWidth = yH ? 2 : 1;
    ctx.strokeRect(...yR);
    ctx.fillStyle = '#8f8';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(returning ? '[Y] 返回主菜单' : '[Y] 退出', canvas.width / 2 - 85, canvas.height / 2 + 60);
    ctx.fillStyle = nH ? '#3a2a2a' : '#221c1c';
    ctx.fillRect(...nR);
    ctx.strokeStyle = nH ? '#fff' : '#a55';
    ctx.lineWidth = nH ? 2 : 1;
    ctx.strokeRect(...nR);
    ctx.fillStyle = '#f88';
    ctx.fillText('[N] 取消', canvas.width / 2 + 85, canvas.height / 2 + 60);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}
