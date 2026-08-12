// game/inventory/index.ts — 装备/物品桶 barrel (PR #4 / T5-b, 2026-08-13)
// 聚合 inventory 域: types + 常量 + 套装 + 材料 + 词条 + 装备核心 + 掉落 + 定价 + 战力 + 拾取。
// 兼容层 ./equipment.ts 直接 re-export 本文件, 引用方无需改动。

export * from './types';
export * from './constants';
export * from './set';
export * from './materials';
export * from './affix';
export * from './equipment';
export * from './drop';
export * from './price';
export * from './power';
export * from './loot';
