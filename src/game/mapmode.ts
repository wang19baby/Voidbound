// A-W2/A-W5 四模式地图: 普通(线性+分支) / 高级(承诺制) / 挑战(提取制) / 肉鸽(局内临时练级)
// 设计文档 §2: 四模式共用 chunk 骨架, 新增地标雕刻 pass + 密度梯度 + 简版主轴
// 波2 落地范围: mode 选择/持久化 + 玩家出生点 + Boss 位置 + 营地(领主)放置 + 门数语义预留
// A-W5 肉鸽: 复用线性骨架 (主轴走廊+分支房间), 出生=线性左端, Boss=右端; 局内 Lv1 起练级, 回城还原

import type { Theme } from './state';

export type MapMode = 'linear' | 'gauntlet' | 'extract' | 'rogue';

export const MAP_MODES: readonly MapMode[] = ['linear', 'gauntlet', 'extract', 'rogue'];
export const MAP_MODE_NAMES: Record<MapMode, string> = {
  linear: '普通 (线性+分支)',
  gauntlet: '高级 (承诺制)',
  extract: '挑战 (提取制)',
  rogue: '肉鸽 (局内 Lv1 起)',
};
export const MAP_MODE_DESC: Record<MapMode, string> = {
  linear: '主走廊 + 分支密室, 1 门 (右端 Boss)',
  gauntlet: '外→内递进, 四角领主, 1 门 (中央 Boss)',
  extract: '中央出生向外, 4 元素 Boss, 5 门 (可随时撤退)',
  rogue: '局内从 Lv1 临时练级, 战利品带回, 1 门 (右端 Boss)',
};

/** 存档语义 (v10 mode 字段; 迁移默认 linear) */
export function validMapMode(s: string): MapMode {
  return (MAP_MODES as readonly string[]).includes(s) ? (s as MapMode) : 'linear';
}