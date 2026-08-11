// 元素系统: 同一张怪物/地图画, 用色相旋转出火/冰/毒/雷/影变体 (u_hue)
// 等级: 精英(小,金tint) → 领主(中,元素色相+体型1.6x) → Boss(大,专属机制)

import type { DamageType } from './combat';

export type ElementId = 'fire' | 'ice' | 'poison' | 'lightning' | 'shadow';

export interface ElementDef {
  id: ElementId;
  name: string;
  /** 色相旋转 (度, 相对原画) */
  hue: number;
  /** 对应伤害系 */
  dmgType: DamageType;
  /** 元素色 (伤害数字/弹幕 tint) */
  color: [number, number, number];
}

export const ELEMENT_DEFS: Record<ElementId, ElementDef> = {
  fire:      { id: 'fire',      name: '火', hue: 0,   dmgType: 'fire',      color: [1.0, 0.45, 0.2] },
  ice:       { id: 'ice',       name: '冰', hue: 210, dmgType: 'ice',       color: [0.5, 0.8, 1.0] },
  poison:    { id: 'poison',    name: '毒', hue: 130, dmgType: 'poison',    color: [0.4, 1.0, 0.4] },
  lightning: { id: 'lightning', name: '雷', hue: 55,  dmgType: 'lightning', color: [1.0, 0.9, 0.3] },
  shadow:    { id: 'shadow',    name: '影', hue: 250, dmgType: 'shadow',    color: [0.6, 0.4, 1.0] },
};

export const ELEMENT_IDS = Object.keys(ELEMENT_DEFS) as ElementId[];

/** 挑战模式四方向位固定主元素 (未决项拍板: 火/冰/毒/影, 排除雷) */
export const EXTRACT_ELEMENT_ORDER: ElementId[] = ['fire', 'ice', 'poison', 'shadow'];

/** 领主元素随机 (不重复遍历用) */
export function randomElement(r: () => number = Math.random): ElementId {
  return ELEMENT_IDS[Math.floor(r() * ELEMENT_IDS.length)];
}

/** 随机副元素 (≠ 主元素; 双元素组合增强 Boss) */
export function randomSubElement(main: ElementId, r: () => number = Math.random): ElementId {
  const others = ELEMENT_IDS.filter(e => e !== main);
  return others[Math.floor(r() * others.length)];
}
