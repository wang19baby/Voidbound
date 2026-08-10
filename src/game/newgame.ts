// 新局选择屏 (OPT-013 + M5 C-103): 职业 1-6 / 难度 Z·X / 主题 ←→, Enter 开始
// 纯函数 (便于单测, main.ts 调用)

import { CLASS_IDS, type ClassId } from './class';
import { DIFFICULTIES, type Difficulty } from './difficulty';
import { THEMES, type Theme } from './state';

export interface NewgameSel {
  classIdx: number;
  diffIdx: number;
  themeIdx: number;
}

export function ngDefault(): NewgameSel {
  return { classIdx: 0, diffIdx: 0, themeIdx: 0 };
}

/** 键盘选择迁移: 返回新选择状态; 未命中返回 null (Enter/Esc 由状态机处理) */
export function moveSelection(sel: NewgameSel, key: string): NewgameSel | null {
  const k = key.toLowerCase();
  if (k >= '1' && k <= String(CLASS_IDS.length)) {
    return { ...sel, classIdx: Number(k) - 1 };
  }
  if (k === 'z') {
    return { ...sel, diffIdx: Math.max(0, sel.diffIdx - 1) };
  }
  if (k === 'x') {
    return { ...sel, diffIdx: Math.min(DIFFICULTIES.length - 1, sel.diffIdx + 1) };
  }
  if (k === 'arrowleft' || k === 'a') {
    return { ...sel, themeIdx: (sel.themeIdx + THEMES.length - 1) % THEMES.length };
  }
  if (k === 'arrowright' || k === 'd') {
    return { ...sel, themeIdx: (sel.themeIdx + 1) % THEMES.length };
  }
  return null;
}

/** 解析选择 → 职业/难度/主题 (index 越界安全) */
export function ngResolve(sel: NewgameSel): { classId: ClassId; difficulty: Difficulty; theme: Theme } {
  const c = Math.min(Math.max(0, sel.classIdx), CLASS_IDS.length - 1);
  const d = Math.min(Math.max(0, sel.diffIdx), DIFFICULTIES.length - 1);
  const t = Math.min(Math.max(0, sel.themeIdx), THEMES.length - 1);
  return { classId: CLASS_IDS[c], difficulty: DIFFICULTIES[d], theme: THEMES[t] };
}

/** 主题解锁 (OPT-015): forest 恒解锁, 其余需已通关 */
export function themeUnlocked(cleared: readonly string[], theme: Theme): boolean {
  return theme === 'forest' || cleared.includes(theme);
}