// HUD 可点击按钮布局 + 命中测试 + hover 状态写入

import { HUD_PAD, SLOT_SIZE, SLOT_GAP, type HudBtn, getHudHover, setHudHoverKey } from './types';
import { slotY, slotX, potionRowY } from './geometry';
import { SKILL_KEYS } from './icons';

export function hudDungeonButtons(vw: number, vh: number): HudBtn[] {
  const sy = slotY(vh);
  const sx0 = slotX();
  const btns: HudBtn[] = [];
  for (let i = 0; i < SKILL_KEYS.length; i++) {
    btns.push({ key: `skill${i}`, x: sx0 + i * (SLOT_SIZE + SLOT_GAP) - 2, y: sy - 2, w: SLOT_SIZE + 4, h: SLOT_SIZE + 4 });
  }
  const py = potionRowY();
  const ph = 30;
  btns.push({ key: 'potionHp', x: HUD_PAD, y: py, w: 104, h: ph });
  btns.push({ key: 'potionMp', x: HUD_PAD + 108, y: py, w: 104, h: ph });
  btns.push({ key: 'dodge', x: HUD_PAD + 216, y: py, w: 132, h: ph });
  return btns;
}

/** 命中测试 (main.ts 每帧调用: LMB 点击分发 + hover 状态) */
export function hudDungeonHit(mx: number, my: number, vw: number, vh: number): string | null {
  for (const b of hudDungeonButtons(vw, vh)) {
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) return b.key;
  }
  return null;
}

/** 当前悬停按钮 (main 每帧设置, overlay 绘制高亮) */
export function setHudHover(key: string | null): void { setHudHoverKey(key); }

// re-export 方便上层一站式导入
export { getHudHover };