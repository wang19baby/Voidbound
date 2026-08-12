// 装备系统: 5 阶稀有度 (F-ITEM-002) + 词条聚合到 D-04 CombatStats (US-002)
// 掉落: 怪物死亡概率掉装备; 拾取即"装备" (owned 列表), 实时重算 player.combat
// hp/mp 词条: 拾取时即时回血/回蓝 (M1 行为保留); 其余词条进 D-04 公式

import type { GameState, Theme } from './state';
import { baseCombat, type CombatStats, type DamageType, DAMAGE_TYPES } from './combat';
import { MAX_HP, MAX_MP } from './player';
import { DIFFICULTY_MODS } from './difficulty';
import { bus } from '../core/eventBus';

// === 5 阶稀有度 (F-ITEM-002: 普通/魔法/稀有/套装/传奇) ===

export type Rarity = 'normal' | 'magic' | 'rare' | 'set' | 'unique';

/** 装备类型 (OPT-014, A1): 4 槽穿戴 */
export type EquipType = 'weapon' | 'armor' | 'charm' | 'ring';
export const EQUIP_SLOTS: readonly EquipType[] = ['weapon', 'armor', 'charm', 'ring'];

/** 槽位显示名 */
export const EQUIP_NAMES: Record<EquipType, string> = {
  weapon: '武器', armor: '护甲', charm: '护符', ring: '戒指',
};

/** 背包容量 (OPT-014): 满则地上装备不拾取 */
export const BACKPACK_CAP = 20;

/** 装备类型掉落权重 (总数求和) */
const EQUIP_TYPE_WEIGHTS: Array<[EquipType, number]> = [
  ['weapon', 45], ['armor', 30], ['charm', 15], ['ring', 10],
];

function rollEquipType(): EquipType {
  const total = EQUIP_TYPE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [t, w] of EQUIP_TYPE_WEIGHTS) {
    r -= w;
    if (r < 0) return t;
  }
  return 'weapon';
}

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

/** 词条数值按稀有度分层 (OPT-020): 高稀有度每条更强, 不只条数更多 */
export const RARITY_VALUE_MULT: Record<Rarity, number> = {
  normal: 1.0,
  magic:  1.0,
  rare:   1.25,
  set:    1.5,
  unique: 1.75,
};

/** 主题词条倾向 (OPT-021): 沙漠→火系 / 废墟→冰系 / 虚空→暗影系 / 森林→生命 */
const THEME_ELEMENT: Partial<Record<Theme, DamageType>> = {
  desert: 'fire', ruin: 'ice', void: 'shadow',
};

/** 主题 Boss 专属套装 (OPT-021) */
export const THEME_BOSS_SET: Record<Theme, SetName> = {
  forest: 'flame_set',
  desert: 'shadow_set',
  ruin:   'frost_set',
  void:   'thunder_set',
};

// === 词条系统 ===

export type AffixStat =
  | 'hp' | 'mp' | 'speed'
  | 'physPct' | 'elemPct' | 'critRate' | 'critBonus'
  | 'shred' | 'vuln' | 'res'
  | 'lifesteal';

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
  thunder_set:{ name: '雷霆套', bonuses: [{ req: 2, stat: 'critBonus', value: 30 }, { req: 3, stat: 'elemPct', value: 0.18 }] },
  frost_set:  { name: '寒霜套', bonuses: [{ req: 2, stat: 'shred', value: 15 }, { req: 3, stat: 'critBonus', value: 20 }] },
  void_set:   { name: '虚空套', bonuses: [{ req: 2, stat: 'elemPct', value: 0.10 }, { req: 3, stat: 'shred', value: 12 }, { req: 4, stat: 'critBonus', value: 35 }] },
};
export type SetName = keyof typeof SET_BONUSES;
const SET_KEYS = Object.keys(SET_BONUSES) as SetName[];

// === 材料系统 (M5 W4 C-401): 金币外第二货币, 独立计数不占背包 (J3=a) ===

export type MaterialId = 'iron_shard' | 'arcane_core' | 'void_fragment';
export const MATERIAL_IDS: readonly MaterialId[] = ['iron_shard', 'arcane_core', 'void_fragment'];

export const MATERIAL_NAMES: Record<MaterialId, string> = {
  iron_shard: '灵铁碎片',
  arcane_core: '奥术核心',
  void_fragment: '虚空碎片',
};

/** 材料来源 (GameState 结构满足: materials 字段) */
export interface MaterialSrc {
  materials: Partial<Record<MaterialId, number>>;
}

export function emptyMaterials(): Record<MaterialId, number> {
  return { iron_shard: 0, arcane_core: 0, void_fragment: 0 };
}

export function materialCount(state: MaterialSrc, id: MaterialId): number {
  return state.materials?.[id] ?? 0;
}

/** 材料入库 (掉落/购买) */
export function addMaterial(state: MaterialSrc, id: MaterialId, n: number): void {
  if (!state.materials) state.materials = {};
  state.materials[id] = (state.materials[id] ?? 0) + n;
}

/** 材料扣除 (消耗渠道); 不足返回 false 不扣 */
export function spendMaterial(state: MaterialSrc, id: MaterialId, n: number): boolean {
  const have = state.materials?.[id] ?? 0;
  if (have < n) return false;
  state.materials = state.materials ?? {};
  state.materials[id] = have - n;
  return true;
}

/** 材料掉落判定 (C-401, 纯函数便于单测): roll∈[0,1)
 *  - Boss: 必掉 1-2 虚空碎片
 *  - 精英: 必掉 1 奥术核心
 *  - 小怪: 8% 掉 1 灵铁碎片
 */
export function materialDrop(roll: number, isBoss: boolean, isElite: boolean): Array<[MaterialId, number]> {
  if (isBoss) return [['void_fragment', roll < 0.5 ? 1 : 2]];
  if (isElite) return [['arcane_core', 1]];
  if (roll < 0.08) return [['iron_shard', 1]];
  return [];
}

/** 符文锻造材料需求 (C-403): 5 奥术核心 + 1 虚空碎片 */
export const RUNE_FORGE_COST = { arcane_core: 5, void_fragment: 1 } as const;

/** 灵铁碎片价格 (C-401 商店可购) */
export const IRON_SHARD_PRICE = 25;

/** 重铸双轨 (C-402): 灵铁消耗按稀有度 (rare 10 / set 20 / unique 40); 普通/魔法无此轨 */
export const REROLL_IRON_COST: Record<Rarity, number> = {
  normal: 0, magic: 0, rare: 10, set: 20, unique: 40,
};

/** 重铸双轨: 100 金 或 灵铁 (C-402); 返回 'gold' | 'iron' | null */
export function rerollCostOption(state: MaterialSrc & { player: { gold: number } }, eq: Equipment): 'gold' | 'iron' | null {
  if (!eq) return null;
  const ironNeed = REROLL_IRON_COST[eq.rarity];
  if (ironNeed > 0 && materialCount(state, 'iron_shard') >= ironNeed) return 'iron';
  if (state.player.gold >= 100) return 'gold';
  return null;
}

export interface Equipment {
  id: number;
  name: string;
  rarity: Rarity;
  /** 装备类型 (OPT-014): 对应穿戴槽 */
  type: EquipType;
  pos: { x: number; y: number };
  size: { w: number; h: number };
  affixes: Affix[];
  pickedUp: boolean;
  /** 套装名 (仅 set 稀有度) */
  setName?: SetName;
  /** 落地时间戳 ms (OPT-032: 60s 后自动消失) */
  spawnT?: number;
}

/** 地面掉落寿命秒 (OPT-032) */
export const LOOT_LIFETIME_SEC = 60;

/** 清理过期地面掉落 (OPT-032): 主循环每帧调用; spawnT 单位为秒 */
export function cullLoot(state: GameState, nowSec: number): void {
  const before = state._loot.length;
  state._loot = state._loot.filter(eq => eq.pickedUp || nowSec - (eq.spawnT ?? nowSec) < LOOT_LIFETIME_SEC);
  if (state._loot.length !== before) {
    void import('../util/log').then(({ dbg }) => dbg('loot', `culled ${before - state._loot.length} expired`));
  }
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

/** 按词条类型滚数值 (OPT-020: mult 按稀有度分层) */
function rollValue(stat: AffixStat, mult = 1): number {
  const r = (lo: number, hi: number): number => Math.round((lo + Math.random() * (hi - lo)) * mult);
  switch (stat) {
    case 'hp':       return r(15, 40);
    case 'mp':       return r(10, 30);
    case 'speed':    return Math.round((0.05 + Math.random() * 0.10) * 100 * mult) / 100;
    case 'physPct':  return Math.round((0.10 + Math.random() * 0.20) * 100 * mult) / 100;
    case 'elemPct':  return Math.round((0.10 + Math.random() * 0.17) * 100 * mult) / 100;
    case 'critRate': return Math.round((0.02 + Math.random() * 0.04) * 100 * mult) / 100;
    case 'critBonus':return r(10, 40);
    case 'shred':    return r(5, 20);
    case 'vuln':     return r(5, 15);
    case 'res':      return r(5, 25);
    case 'lifesteal':return r(2, 6);
  }
}

const AFFIX_POOL: AffixStat[] = [
  'hp', 'mp', 'speed', 'physPct', 'elemPct', 'critRate', 'critBonus', 'shred', 'vuln', 'res',
];

/** unique 独占词条池 (OPT-020 补完): 暗金专属, 其他稀有度不产出 */
const UNIQUE_ONLY_POOL: AffixStat[] = ['lifesteal'];

/** 生成随机词条 (res 词条附带随机元素系); mult = 稀有度数值分层 */
function genAffix(mult = 1): Affix {
  const stat = AFFIX_POOL[Math.floor(Math.random() * AFFIX_POOL.length)];
  const value = rollValue(stat, mult);
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
        case 'lifesteal': c.lifesteal += a.value; break;
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

/** 穿戴槽最小输入 (equipItem/unequipItem/recomputeCombat 依赖; GameState 结构满足, 便于单测) */
export interface EquipState {
  player: { equipped: Partial<Record<EquipType, Equipment>>; hp: number; mp: number; combat: CombatStats };
  _owned?: Equipment[];
}

/** 当前穿戴 (聚合用) */
export function getEquippedValues(state: EquipState): Equipment[] {
  return EQUIP_SLOTS
    .map(t => state.player.equipped[t])
    .filter((x): x is Equipment => !!x);
}

/** 从当前穿戴装备重算 player.combat (拾取/穿戴/卸下/读档后调用) */
export function recomputeCombat(state: EquipState): void {
  state.player.combat = aggregateCombat(getEquippedValues(state));
}

/** hp/mp 词条即时生效 (拾取/穿戴时) */
function applyInstant(state: EquipState, eq: Equipment): void {
  for (const a of eq.affixes) {
    if (a.stat === 'hp') state.player.hp = Math.min(100, state.player.hp + a.value);
    else if (a.stat === 'mp') state.player.mp = Math.min(100, state.player.mp + a.value);
  }
}

/** 穿戴: 背包 → 槽 (同槽旧件回背包); 返回成功 */
export function equipItem(state: EquipState, eq: Equipment): boolean {
  const slot = eq.type;
  const inv = getOwned(state);
  const idx = inv.indexOf(eq);
  if (idx < 0) return false;
  const old = state.player.equipped[slot];
  if (old) {
    inv[idx] = old;          // 旧件占据 eq 的背包位
    state.player.equipped[slot] = eq;
  } else {
    inv.splice(idx, 1);
    state.player.equipped[slot] = eq;
  }
  applyInstant(state, eq);
  recomputeCombat(state);
  // T1a: emit 事件
  bus.emit('item.equipped', { item: eq, slot: eq.type });
  return true;
}

/** 卸下: 槽 → 背包 (背包满时拒绝); 返回成功 */
export function unequipItem(state: EquipState, eq: Equipment): boolean {
  const slot = eq.type;
  if (state.player.equipped[slot] !== eq) return false;
  const inv = getOwned(state);
  if (inv.length >= BACKPACK_CAP) return false;
  state.player.equipped[slot] = undefined;
  inv.push(eq);
  recomputeCombat(state);
  return true;
}

/** 卸下指定槽位 (面板 D 键); 返回成功 */
export function unequipSlot(state: EquipState, slot: EquipType): boolean {
  const eq = state.player.equipped[slot];
  if (!eq) return false;
  return unequipItem(state, eq);
}

/** 战力增量: 该件 vs 当前同槽穿戴 (正=更强, 负=更弱) */
export function itemPowerDelta(eq: Equipment, old: Equipment | undefined): number {
  return itemPower(eq) - (old ? itemPower(old) : 0);
}

// === 掉落 / 拾取 ===

/** 生成一件随机装备 (给定稀有度; 供掉落/商店共用, US-021); theme=主题词条倾向, forcedSet=Boss 专属套装 */
export function randomEquipment(chosen: Rarity, theme?: Theme, forcedSet?: SetName): Equipment {
  const [min, max] = RARITY_AFFIX_COUNT[chosen];
  const n = Math.min(max, min + Math.floor(Math.random() * (max - min + 1)));
  const mult = RARITY_VALUE_MULT[chosen];
  const affixes: Affix[] = [];
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
    id: nextEqId++,
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

/** 通关收集地上掉落 (M5 实测修复): 全部入背包, 满则留地并提示; 返回收集数 */
export function collectAllLoot(state: GameState): Equipment[] {
  const picked: Equipment[] = [];
  let rejected = 0;
  state._loot = state._loot.filter(eq => {
    if (eq.pickedUp) return false;
    if (getOwned(state).length >= BACKPACK_CAP) { rejected++; return true; }
    eq.pickedUp = true;
    picked.push(eq);
    getOwned(state).push(eq);
    applyInstant(state, eq);
    return false;
  });
  if (rejected > 0) {
    void import('./toast').then(({ pushToast }) => pushToast(state, `背包已满, ${rejected} 件未拾取`, '#ff5555'));
  }
  if (picked.length) recomputeCombat(state);
  return picked;
}

/** 清空地上物品 (M5 实测修复: 回城/新局按规则清理) */
export function clearGroundLoot(state: GameState): void {
  state._loot.length = 0;
}

/** Boss 专属掉落 (OPT-021): 指定套装 + 落点, 直接进 _loot */
export function dropBossReward(state: GameState, x: number, y: number, set: SetName): Equipment {
  const eq = randomEquipment('set', state.theme, set);
  eq.pos = { x, y };
  eq.spawnT = performance.now() / 1000;
  state._loot.push(eq);
  return eq;
}

/** 精英保底掉落 (内容扩充): rare 45% / set 40% / unique 15% + 主题倾向
 *  测试友好: _loot 可选 (mock 简化), 内部 lazy-init; GameState 场景 _loot 必填 */
export function dropEliteLoot(state: { theme: Theme; _loot?: Equipment[] }, x: number, y: number): Equipment {
  const r = Math.random();
  const rarity: Rarity = r < 0.15 ? 'unique' : r < 0.55 ? 'set' : 'rare';
  const eq = randomEquipment(rarity, state.theme);
  eq.pos = { x, y };
  eq.spawnT = performance.now() / 1000;
  state._loot = state._loot ?? [];
  state._loot.push(eq);
  return eq;
}

/** 买价 (US-021): 稀有度基价 × 词条加成 */
export function getItemBuyPrice(rarity: Rarity, affixCount: number): number {
  const base: Record<Rarity, number> = { normal: 10, magic: 40, rare: 120, set: 250, unique: 500 };
  return Math.round(base[rarity] * (1 + affixCount * 0.35));
}

/** 卖价 (半价) */
export function getItemSellPrice(rarity: Rarity, affixCount: number): number {
  return Math.floor(getItemBuyPrice(rarity, affixCount) * 0.4);
}

/** 重铸词条 (US-021): 同稀有度同词条数, 全部重roll (数值分层随稀有度, OPT-020) */
export function rerollAffixes(eq: Equipment): void {
  const n = eq.affixes.length;
  eq.affixes.length = 0;
  const mult = RARITY_VALUE_MULT[eq.rarity];
  for (let i = 0; i < n; i++) eq.affixes.push(genAffix(mult));
}

/** 简化战力评分 (展示用): 词条数值加权和 */
export function itemPower(eq: Equipment): number {
  let p = 5; // 基础
  for (const a of eq.affixes) {
    if (a.stat === 'physPct' || a.stat === 'elemPct') p += Math.round(a.value * 100);
    else if (a.stat === 'critRate') p += Math.round(a.value * 100);
    else if (a.stat === 'critBonus') p += Math.round(a.value);
    else if (a.stat === 'shred' || a.stat === 'vuln') p += Math.round(a.value);
    else if (a.stat === 'res') p += Math.round(a.value * 0.5);
    else if (a.stat === 'hp' || a.stat === 'mp') p += Math.round(a.value * 0.3);
  }
  return p;
}

/** 入库 (商店购买/读档重建共用): push owned + 重算 combat; 背包满返回 false */
export function addOwned(state: EquipState, eq: Equipment): boolean {
  const inv = getOwned(state);
  if (inv.length >= BACKPACK_CAP) return false;
  eq.pickedUp = true;
  eq.pos = { x: 0, y: 0 };
  inv.push(eq);
  recomputeCombat(state);
  return true;
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
  ext._loot.push(eq);
  // T1a: emit 事件 (FX/sfx/统计服务订阅)
  bus.emit('item.dropped', { item: eq, rarity: eq.rarity });
  return eq;
}

/** 检查拾取: hp/mp 即时生效; 背包满不拾取 (留地 + 提示), 其余词条聚合进 combat */
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
      // 背包满: 留在地上不拾取, 1s 节流提示一次
      if (getOwned(state).length >= BACKPACK_CAP) {
        void import('./toast').then(({ pushToast }) => {
          pushToast(state, '背包已满, 未拾取', '#ff5555');
        });
        return true;
      }
      eq.pickedUp = true;
      picked.push(eq);
      getOwned(state).push(eq);
      applyInstant(state, eq);
      return false;
    }
    return true;
  });
  if (picked.length) recomputeCombat(state);
  return picked;
}

export function getLoot(state: GameState): readonly Equipment[] {
  return state._loot;
}

/** 已拾取(装备中)的列表 */
export function getOwned(state: GameState): Equipment[] {
  return state._owned;
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
    case 'lifesteal':return `吸血 +${a.value}%`;
    case 'res':      return `${a.element ? ELEM_NAMES[a.element] : '元素'}抗 +${a.value}`;
  }
}