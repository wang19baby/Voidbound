// HUD 几何: 技能槽行 / 药水行 Y

import { HUD_PAD, BAR_WIDTH, BAR_HEIGHT } from './types';

/** 技能槽行 Y (HP/MP 区域右侧): 与两条血条纵向居中 */
export function slotY(vh: number): number { return HUD_PAD - 4; }

/** 技能槽行 X 起点 (HP/MP 条右侧) */
export function slotX(): number { return HUD_PAD + BAR_WIDTH + 12; }

/** 药水/翻滚按钮行 Y (左上 hub, EXP 标签下方) */
export function potionRowY(): number { return HUD_PAD + BAR_HEIGHT * 2 + 12 + 34; }