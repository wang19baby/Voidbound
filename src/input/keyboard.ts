// WASD 键盘状态 + 失焦清零 (P0 阻塞项)
// 暴露 get / direction / reset, 用 attachKeyboard(window) 即可启用

export interface KeyState {
  w: 0 | 1;
  a: 0 | 1;
  s: 0 | 1;
  d: 0 | 1;
}

export interface KeyboardHandle {
  get(): KeyState;
  direction(): { x: number; y: number };
  reset(): void;
  isDown(key: keyof KeyState): boolean;
}

const KEY_MAP: Record<string, keyof KeyState> = {
  w: 'w', W: 'w',
  a: 'a', A: 'a',
  s: 's', S: 's',
  d: 'd', D: 'd',
};

export function attachKeyboard(win: Window = window): KeyboardHandle {
  const state: KeyState = { w: 0, a: 0, s: 0, d: 0 };

  function onKeyDown(e: KeyboardEvent) {
    const k = KEY_MAP[e.key];
    if (k) state[k] = 1;
  }
  function onKeyUp(e: KeyboardEvent) {
    const k = KEY_MAP[e.key];
    if (k) state[k] = 0;
  }
  function reset() {
    state.w = 0; state.a = 0; state.s = 0; state.d = 0;
  }
  function onBlur() { reset(); }
  function onVisibility() { if (document.hidden) reset(); }

  win.addEventListener('keydown', onKeyDown);
  win.addEventListener('keyup', onKeyUp);
  win.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);

  function get(): KeyState { return { w: state.w, a: state.a, s: state.s, d: state.d }; }

  function direction(): { x: number; y: number } {
    let x = (state.d ? 1 : 0) - (state.a ? 1 : 0);
    let y = (state.s ? 1 : 0) - (state.w ? 1 : 0);
    if (x !== 0 || y !== 0) {
      const m = Math.hypot(x, y);
      x /= m; y /= m;
    }
    return { x, y };
  }

  function isDown(key: keyof KeyState): boolean { return state[key] === 1; }

  return { get, direction, reset, isDown };
}