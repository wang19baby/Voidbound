// 鼠标输入: 按钮状态 + 位置 + 单次点击检测
// LMB / RMB / MMB 各有 isDown + wasClicked (边沿)

export type MouseButton = 'LMB' | 'RMB' | 'MMB';

export interface MouseState {
  pos: { x: number; y: number };       // 视口坐标
  buttons: Record<MouseButton, boolean>;
}

export interface MouseHandle {
  state(): MouseState;
  /** 本帧有没有刚按下 (单次, true 仅 1 帧) */
  wasClicked(button: MouseButton): boolean;
}

export function attachMouse(target: HTMLElement, win: Window = window): MouseHandle {
  const state: MouseState = {
    pos: { x: 0, y: 0 },
    buttons: { LMB: false, RMB: false, MMB: false },
  };
  const clickedThisFrame: Record<MouseButton, boolean> = { LMB: false, RMB: false, MMB: false };
  let prevButtons: Record<MouseButton, boolean> = { LMB: false, RMB: false, MMB: false };

  function whichButton(e: MouseEvent): MouseButton {
    return e.button === 0 ? 'LMB' : e.button === 2 ? 'RMB' : 'MMB';
  }

  function onMove(e: MouseEvent) {
    state.pos.x = e.clientX;
    state.pos.y = e.clientY;
  }
  function onDown(e: MouseEvent) {
    if (e.button >= 0 && e.button <= 2) {
      state.buttons[whichButton(e)] = true;
    }
    // 阻止右键菜单
    if (e.button === 2) e.preventDefault();
  }
  function onUp(e: MouseEvent) {
    if (e.button >= 0 && e.button <= 2) {
      state.buttons[whichButton(e)] = false;
    }
  }
  function onContext(e: MouseEvent) {
    e.preventDefault();
  }

  target.addEventListener('mousemove', onMove);
  target.addEventListener('mousedown', onDown);
  target.addEventListener('mouseup', onUp);
  target.addEventListener('contextmenu', onContext);

  function syncClickedEdge() {
    for (const b of ['LMB', 'RMB', 'MMB'] as const) {
      clickedThisFrame[b] = state.buttons[b] && !prevButtons[b];
    }
    prevButtons = { ...state.buttons };
  }
  function resetClicked() {
    for (const b of ['LMB', 'RMB', 'MMB'] as const) clickedThisFrame[b] = false;
  }

  // 在每帧 rAF 中调用者负责: 先 syncClickedEdge 再 wasClicked; 一帧后 resetClicked
  // 简化: 主循环先读 clicked 再调 reset
  return {
    state: () => state,
    wasClicked(b: MouseButton): boolean {
      // 主循环应在每帧开头调 syncClickedEdge
      // 这里只返回当前帧状态
      return clickedThisFrame[b];
    },
    // 暴露给主循环同步
    ...{ sync: syncClickedEdge, reset: resetClicked },
  } as MouseHandle & { sync: () => void; reset: () => void };
}