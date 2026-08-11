// A-W2 三模式地图: 普通(线性+分支) / 高级(承诺制) / 挑战(提取制)
// 设计文档 §2: 三模式共用 chunk 骨架, 新增地标雕刻 pass + 密度梯度 + 简版主轴
// 波2 落地范围: mode 选择/持久化 + 玩家出生点 + Boss 位置 + 营地(领主)放置 + 门数语义预留

import type { Theme } from './state';

export type MapMode = 'linear' | 'gauntlet' | 'extract';

export const MAP_MODES: readonly MapMode[] = ['linear', 'gauntlet', 'extract'];
export const MAP_MODE_NAMES: Record<MapMode, string> = {
  linear: '普通 (线性+分支)',
  gauntlet: '高级 (承诺制)',
  extract: '挑战 (提取制)',
};
export const MAP_MODE_DESC: Record<MapMode, string> = {
  linear: '主走廊 + 分支密室, 1 门 (右端 Boss)',
  gauntlet: '外→内递进, 四角领主, 1 门 (中央 Boss)',
  extract: '中央出生向外, 4 元素 Boss, 5 门 (可随时撤退)',
};

/** 存档语义 (v10 mode 字段; 迁移默认 linear) */
export function validMapMode(s: string): MapMode {
  return (MAP_MODES as readonly string[]).includes(s) ? (s as MapMode) : 'linear';
}

/** 各模式 Boss 召唤阈值 (波2: 复用现有 10 连杀机制, 门数/领主群随波3 补全) */
export const MODE_BOSS_KILLS: Record<MapMode, number> = {
  linear: 10,
  gauntlet: 14,
  extract: 8,
};