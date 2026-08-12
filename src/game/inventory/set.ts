// game/inventory/set.ts — 套装定义 (PR #4 / T5-b, 2026-08-13)
// 从 game/equipment.ts 抽出 SET_BONUSES + SET_KEYS。
// 依赖: ./types (SetBonusDef, SetName)

import type { SetBonusDef, SetName } from './types';

export const SET_BONUSES: Record<string, { name: string; bonuses: SetBonusDef[] }> = {
  shadow_set: { name: '暗影套', bonuses: [{ req: 2, stat: 'elemPct', value: 0.15 }, { req: 3, stat: 'critBonus', value: 25 }] },
  flame_set:  { name: '烈焰套', bonuses: [{ req: 2, stat: 'elemPct', value: 0.12 }, { req: 3, stat: 'shred', value: 20 }] },
  thunder_set:{ name: '雷霆套', bonuses: [{ req: 2, stat: 'critBonus', value: 30 }, { req: 3, stat: 'elemPct', value: 0.18 }] },
  frost_set:  { name: '寒霜套', bonuses: [{ req: 2, stat: 'shred', value: 15 }, { req: 3, stat: 'critBonus', value: 20 }] },
  void_set:   { name: '虚空套', bonuses: [{ req: 2, stat: 'elemPct', value: 0.10 }, { req: 3, stat: 'shred', value: 12 }, { req: 4, stat: 'critBonus', value: 35 }] },
};

export const SET_KEYS: SetName[] = Object.keys(SET_BONUSES) as SetName[];
