// game/inventory/drop.ts — 装备生成 + 掉落 (PR #4 / T5-b, 2026-08-13)
// 从 game/equipment.ts 抽出: randomEquipment / dropLoot / dropBossReward / dropEliteLoot / cullLoot / clearGroundLoot / genName。
// 依赖: ./types, ./constants, ./set, ./affix, ./equipment, ../state, ../difficulty, ../../core/eventBus

import type { Equipment, Rarity, SetName } from './types';
import type { GameState, Theme } from '../state';
import {
  RARITY_AFFIX_COUNT, RARITY_VALUE_MULT, RARITY_DROP_RATE,
  THEME_ELEMENT, THEME_BOSS_SET, LOOT_LIFETIME_SEC,
  PREFIXES, SUFFIXES, SET_BONUSES,
} from './constants';
import { SET_KEYS } from './set';
import { rollValue, genAffix, UNIQUE_ONLY_POOL } from './affix';
import { rollEquipType, allocEquipmentId } from './equipment';
import { DIFFICULTY_MODS } from '../difficulty';
import { bus } from '../../core/eventBus';

/** 生成随机装备名 (内部) */
function genName(): string {
  const p = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  const s = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
  return `${p}${s}`;
}

/** 生成一件随机装备 (给定稀有度; 供掉落/商店共用, US-021); theme=主题词条倾向, forcedSet=Boss 专属套装 */
export function randomEquipment(chosen: Rarity, theme?: Theme, forcedSet?: SetName): Equipment {
  const [min, max] = RARITY_AFFIX_COUNT[chosen];
  const n = Math.min(max, min + Math.floor(Math.random() * (max - min + 1)));
  const mult = RARITY_VALUE_MULT[chosen];
  const affixes: import('./types').Affix[] = [];
  for (let i = 0; i < n; i++) affixes.push(genAffix(mult));
  // 主题词条倾向 (OPT-021): 固定追加 1 条 (上限 6)
  if (theme && affixes.length < 6) {
    if (THEME_ELEMENT[theme]) {
      affixes.push({ stat: 'res', value: rollValue('res', mult), element: THEME_ELEMENT[theme] });
    } else if (theme === 'forest') {
      affixes.push({ stat: 'hp', value: rollValue('hp', mult) });
    }
  }
  // unique 独占词条 (OPT-020): 50% 概率带 1 条吸血 (上限 6)
  if (chosen === 'unique' && affixes.length < 6 && Math.random() < 0.5) {
    const stat = UNIQUE_ONLY_POOL[Math.floor(Math.random() * UNIQUE_ONLY_POOL.length)];
    affixes.push({ stat, value: rollValue(stat, mult) });
  }
  const setName = chosen === 'set' ? (forcedSet ?? SET_KEYS[Math.floor(Math.random() * SET_KEYS.length)]) : undefined;
  return {
    id: allocEquipmentId(),
    name: setName ? `${SET_BONUSES[setName].name} ${genName()}` : genName(),
    rarity: chosen,
    type: rollEquipType(),
    pos: { x: 0, y: 0 },
    size: { w: 24, h: 24 },
    affixes,
    pickedUp: false,
    setName,
  };
}

/** 怪物死亡时按稀有度掉落率掉装备 */
export function dropLoot(state: GameState, x: number, y: number): Equipment | null {
  const mods = DIFFICULTY_MODS[state.difficulty];
  const baseTotal = Object.values(RARITY_DROP_RATE).reduce((a, b) => a + b, 0);
  const total = baseTotal * mods.dropMult;
  const r = Math.random();
  if (r >= total) return null;
  let cum = 0;
  let chosen: Rarity | null = null;
  for (const [rar, rate] of Object.entries(RARITY_DROP_RATE) as [Rarity, number][]) {
    cum += rate * mods.dropMult;
    if (r < cum) { chosen = rar; break; }
  }
  if (!chosen) return null;

  const eq = randomEquipment(chosen, state.theme);
  eq.pos = { x, y };
  eq.spawnT = performance.now() / 1000;
  // 难度词条加成 (D-03): 上限 6 条
  const extra = Math.min(mods.affixBonus, 6 - eq.affixes.length);
  for (let i = 0; i < extra; i++) eq.affixes.push(genAffix());
  state.fx.loot.push(eq);
  // T1a: emit 事件 (FX/sfx/统计服务订阅)
  bus.emit('item.dropped', { item: eq, rarity: eq.rarity });
  return eq;
}

/** Boss 专属掉落 (OPT-021): 指定套装 + 落点, 直接进 fx.loot */
export function dropBossReward(state: GameState, x: number, y: number, set: SetName): Equipment {
  const eq = randomEquipment('set', state.theme, set);
  eq.pos = { x, y };
  eq.spawnT = performance.now() / 1000;
  state.fx.loot.push(eq);
  return eq;
}

/** 精英保底掉落 (内容扩充): rare 45% / set 40% / unique 15% + 主题倾向
 *  测试友好: fx.loot 可选 (mock 简化), 内部 lazy-init; GameState 场景 fx.loot 必填 */
export function dropEliteLoot(state: { theme: Theme; fx?: { loot?: Equipment[] } }, x: number, y: number): Equipment {
  const r = Math.random();
  const rarity: Rarity = r < 0.15 ? 'unique' : r < 0.55 ? 'set' : 'rare';
  const eq = randomEquipment(rarity, state.theme);
  eq.pos = { x, y };
  eq.spawnT = performance.now() / 1000;
  state.fx = state.fx ?? { loot: [] } as { loot?: Equipment[] };
  state.fx.loot = state.fx.loot ?? [];
  state.fx.loot.push(eq);
  return eq;
}

/** 清理过期地面掉落 (OPT-032): 主循环每帧调用; spawnT 单位为秒 */
export function cullLoot(state: GameState, nowSec: number): void {
  const before = state.fx.loot.length;
  state.fx.loot = state.fx.loot.filter(eq => eq.pickedUp || nowSec - (eq.spawnT ?? nowSec) < LOOT_LIFETIME_SEC);
  if (state.fx.loot.length !== before) {
    void import('../../util/log').then(({ dbg }) => dbg('loot', `culled ${before - state.fx.loot.length} expired`));
  }
}

/** 清空地上物品 (M5 实测修复: 回城/新局按规则清理) */
export function clearGroundLoot(state: GameState): void {
  state.fx.loot.length = 0;
}
