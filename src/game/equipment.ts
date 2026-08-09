// 装备系统: 5 阶稀有度 (F-ITEM-002) + 词条聚合到 D-04 CombatStats (US-002)
// 掉落: 怪物死亡概率掉装备; 拾取即"装备" (owned 列表), 实时重算 player.combat
// hp/mp 词条: 拾取时即时回血/回蓝 (M1 行为保留); 其余词条进 D-04 公式

import type { GameState } from './state';
import { baseCombat, type CombatStats, type DamageType, DAMAGE_TYPES } from './combat';
import { MAX_HP, MAX_MP } from './player';
import { DIFFICULTY_MODS } from './difficulty';

// === 5 阶稀有度 (F-ITEM-002: 普通/魔法/稀有/套装/传奇) ===

export type Rarity = 'normal' | 'magic' | 'rare' | 'set' | 'unique';

export const RARITY_COLORS: Record<Rarity, [number, number, number]> = {
  normal: [0.95, 0.95, 0.95],   // 白
  magic:  [0.30, 0.50, 1.00],   // 蓝
  rare:   [1.00, 0.85, 0.30],   // 黄
  set:    [0.30, 1.00, 0.30],   // 绿
  unique: [1.00, 0.70, 0.10],   // 金 (暗金)
};

export const RARITY_DROP_RATE: Record<Rarity, number> = {
  normal: 0.40,
  magic:  0.25,
  rare:   0.15,
  set:    0.06,
  unique: 0.02,
};

/** 每档词条数量范围 [min, max] */
export const RARITY_AFFIX_COUNT: Record<Rarity, [number, number]> = {
  normal: [0, 0],
  magic:  [1, 2],
  rare:   [2, 3],
  set:    [3, 4],
  unique: [4, 5],
};

// === 词条系统 ===

export type AffixStat =
  | 'hp' | 'mp' | 'speed'
  | 'physPct' | 'elemPct' | 'critRate' | 'critBonus'
  | 'shred' | 'vuln' | 'res';

export interface Affix {
  stat: AffixStat;
  value: number;
  /** 仅 'res' 词条使用: 目标元素系 */
  element?: DamageType;
}

/** 套装 (US-010, F-ITEM-004): 同套装 >=req 件触发加成 */
export interface SetBonusDef { req: number; stat: 'elemPct' | 'critBonus' | 'shred'; value: number; }
export const SET_BONUSES: Record<string, { name: string; bonuses: SetBonusDef[] }> = {
  shadow_set: { name: '暗影套', bonuses: [{ req: 2, stat: 'elemPct', value: 0.15 }, { req: 3, stat: 'critBonus', value: 25 }] },
  flame_set:  { name: '烈焰套', bonuses: [{ req: 2, stat: 'elemPct', value: 0.12 }, { req: 3, stat: 'shred', value: 20 }] },
};
export type SetName = keyof typeof SET_BONUSES;
const SET_KEYS = Object.keys(SET_BONUSES) as SetName[];

export interface Equipment {
  id: number;
  name: string;
  rarity: Rarity;
  pos: { x: number; y: number };
  size: { w: number; h: number };
  affixes: Affix[];
  pickedUp: boolean;
  /** 套装名 (仅 set 稀有度) */
  setName?: SetName;
}

const ELEM_NAMES: Record<DamageType, string> = {
  physical: '物理', fire: '火', ice: '冰', lightning: '雷', poison: '毒', shadow: '暗', holy: '圣',
};

let nextEqId = 1;

/** 分配新装备 id (读档重建使用) */
export function allocEquipmentId(): number {
  return nextEqId++;
}

const PREFIXES = ['暗影', '烈焰', '寒霜', '雷霆', '虚空', '圣光', '古龙', '深渊'];
const SUFFIXES = ['之牙', '之心', '之手', '之眼', '之魂', '之怒', '之誓', '之拥'];

function genName(): string {
  const p = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  const s = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
  return `${p}${s}`;
}

/** 按词条类型滚数值 */
function rollValue(stat: AffixStat): number {
  switch (stat) {
    case 'hp':       return Math.round(15 + Math.random() * 25);
    case 'mp':       return Math.round(10 + Math.random() * 20);
    case 'speed':    return Math.round((0.05 + Math.random() * 0.10) * 100) / 100;
    case 'physPct':  return Math.round((0.10 + Math.random() * 0.20) * 100) / 100;
    case 'elemPct':  return Math.round((0.10 + Math.random() * 0.17) * 100) / 100;
    case 'critRate': return Math.round((0.02 + Math.random() * 0.04) * 100) / 100;
    case 'critBonus':return Math.round(10 + Math.random() * 30);
    case 'shred':    return Math.round(5 + Math.random() * 15);
    case 'vuln':     return Math.round(5 + Math.random() * 10);
    case 'res':      return Math.round(5 + Math.random() * 20);
  }
}

const AFFIX_POOL: AffixStat[] = [
  'hp', 'mp', 'speed', 'physPct', 'elemPct', 'critRate', 'critBonus', 'shred', 'vuln', 'res',
];

/** 生成随机词条 (res 词条附带随机元素系) */
function genAffix(): Affix {
  const stat = AFFIX_POOL[Math.floor(Math.random() * AFFIX_POOL.length)];
  const value = rollValue(stat);
  const element = stat === 'res'
    ? DAMAGE_TYPES[1 + Math.floor(Math.random() * (DAMAGE_TYPES.length - 1))]  // 元素系 (非 physical)
    : undefined;
  return { stat, value, element };
}

/** 聚合所有已装备词条 → CombatStats (纯函数, 供单测) */
export function aggregateCombat(items: readonly Equipment[]): CombatStats {
  const c = baseCombat();
  for (const eq of items) {
    for (const a of eq.affixes) {
      switch (a.stat) {
        case 'hp':
        case 'mp':
        case 'speed':
          break; // 即时效果, 不进入战斗属性聚合
        case 'physPct':   c.physPct += a.value; break;
        case 'elemPct':   c.elemPct += a.value; break;
        case 'critRate':  c.critRate = Math.min(1, c.critRate + a.value); break;
        case 'critBonus': c.critBonus += a.value; break;
        case 'shred':     c.shred += a.value; break;
        case 'vuln':      c.vuln += a.value; break;
        case 'res':       if (a.element) c.res[a.element] += a.value; break;
      }
    }
  }
  // 套装加成 (US-010): 同套装 ≥req 件触发
  const setCount: Record<string, number> = {};
  for (const eq of items) if (eq.setName) setCount[eq.setName] = (setCount[eq.setName] ?? 0) + 1;
  for (const key of SET_KEYS) {
    const n = setCount[key] ?? 0;
    if (n <= 0) continue;
    for (const b of SET_BONUSES[key].bonuses) {
      if (n >= b.req) {
        if (b.stat === 'elemPct') c.elemPct += b.value;
        else if (b.stat === 'critBonus') c.critBonus += b.value;
        else c.shred += b.value;
      }
    }
  }
  return c;
}

/** 从当前已持有装备重算 player.combat (拾取/读档后调用) */
export function recomputeCombat(state: GameState): void {
  state.player.combat = aggregateCombat(getOwned(state));
}

// === 掉落 / 拾取 ===

/** 怪物死亡时按稀有度掉落率掉装备 */
export function dropLoot(state: GameState, x: number, y: number): Equipment | null {
  const ext = state as GameState & { _loot?: Equipment[] };
  ext._loot = ext._loot ?? [];
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

  const [min, max] = RARITY_AFFIX_COUNT[chosen];
  const n = Math.min(max, min + Math.floor(Math.random() * (max - min + 1)) + mods.affixBonus);
  const affixes: Affix[] = [];
  for (let i = 0; i < n; i++) affixes.push(genAffix());

  // set 稀有度: 必带套装名
  const setName = chosen === 'set' ? SET_KEYS[Math.floor(Math.random() * SET_KEYS.length)] : undefined;
  const eq: Equipment = {
    id: nextEqId++,
    name: setName ? `${SET_BONUSES[setName].name} ${genName()}` : genName(),
    rarity: chosen,
    pos: { x, y },
    size: { w: 24, h: 24 },
    affixes,
    pickedUp: false,
    setName,
  };
  ext._loot.push(eq);
  return eq;
}

/** 检查拾取: hp/mp 即时生效, 其余词条聚合进 combat */
export function pickupLoot(state: GameState): Equipment[] {
  const ext = state as GameState & { _loot?: Equipment[] };
  if (!ext._loot) return [];
  const picked: Equipment[] = [];
  ext._loot = ext._loot.filter(eq => {
    if (eq.pickedUp) return false;
    if (state.player.pos.x < eq.pos.x + eq.size.w &&
        state.player.pos.x + state.player.size.w > eq.pos.x &&
        state.player.pos.y < eq.pos.y + eq.size.h &&
        state.player.pos.y + state.player.size.h > eq.pos.y) {
      eq.pickedUp = true;
      picked.push(eq);
      getOwned(state).push(eq);
      for (const a of eq.affixes) {
        if (a.stat === 'hp') state.player.hp = Math.min(MAX_HP, state.player.hp + a.value);
        else if (a.stat === 'mp') state.player.mp = Math.min(MAX_MP, state.player.mp + a.value);
      }
      return false;
    }
    return true;
  });
  if (picked.length) recomputeCombat(state);
  return picked;
}

export function getLoot(state: GameState): readonly Equipment[] {
  const ext = state as GameState & { _loot?: Equipment[] };
  return ext._loot ?? [];
}

/** 已拾取(装备中)的列表 */
export function getOwned(state: GameState): Equipment[] {
  const ext = state as GameState & { _owned?: Equipment[] };
  ext._owned = ext._owned ?? [];
  return ext._owned;
}

export function describeAffix(a: Affix): string {
  switch (a.stat) {
    case 'hp':       return `生命 +${a.value}`;
    case 'mp':       return `法力 +${a.value}`;
    case 'speed':    return `移速 +${Math.round(a.value * 100)}%`;
    case 'physPct':  return `物理伤害 +${Math.round(a.value * 100)}%`;
    case 'elemPct':  return `元素伤害 +${Math.round(a.value * 100)}%`;
    case 'critRate': return `暴击率 +${Math.round(a.value * 100)}%`;
    case 'critBonus':return `暴击伤害 +${a.value}%`;
    case 'shred':    return `减抗 +${a.value}`;
    case 'vuln':     return `易伤 +${a.value}%`;
    case 'res':      return `${a.element ? ELEM_NAMES[a.element] : '元素'}抗 +${a.value}`;
  }
}