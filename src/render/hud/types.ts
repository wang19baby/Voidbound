// HUD 共享类型/常量/模块级状态
// 所有 HUD 子模块 (geometry/format/icons/buttons/bars/skills/overlay/log/index) 共用

import type { RenderResources } from '../resources';

export const BAR_HEIGHT = 16;
export const BAR_WIDTH = 240;
export const HUD_PAD = 16;
export const SLOT_SIZE = 44;
export const SLOT_GAP = 10;
export const LOG_LINES = 6;
/** 右下角小地图面板纵向占用 (HUD_PAD + 标题20 + 地图84 + 探索标签24 + 间距6) — 日志面板上移避让 */
export const HUD_MINIMAP_RESERVE_H = 150;

// === 战斗 HUD 可点击按钮布局 (hud 绘制与 main 命中共用) ===
export interface HudBtn { key: string; x: number; y: number; w: number; h: number; }

// 鼠标 reticle 全局位置 (由 main loop 每帧设置)
let _mouseX = 0;
let _mouseY = 0;
/** 鼠标 reticle 全局位置 (由 main loop 每帧设置) */
export function setMouseReticle(x: number, y: number): void { _mouseX = x; _mouseY = y; }
export function getMouseX(): number { return _mouseX; }
export function getMouseY(): number { return _mouseY; }

/** 当前悬停按钮 (main 每帧设置, overlay 绘制高亮) */
let _hudHoverKey: string | null = null;
export function getHudHover(): string | null { return _hudHoverKey; }
/** 内部写入通道 (供 buttons.ts 的 setHudHover 调用) */
export function setHudHoverKey(key: string | null): void { _hudHoverKey = key; }

/** 类型占位 (避免未用导入) */
export type _RenderResourcesRef = RenderResources;