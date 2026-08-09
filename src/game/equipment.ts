// 装备系统: 怪物掉 4 阶稀有度装备, 词条加成 HP/MP/dmg
// 拾取即生效, 不需穿脱 (M1 简化)

import type { GameState } from './state';

export type Rarity = 'white' | 'green' | 'blue' | 'purple';

export interface Affix {
  stat: 'hp' | 'mp' | 'dmg' | 'speed';
  value: number;
}

export interface Equipment {
  id: number;
  name: string;
  rarity: Rarity;
  pos: { x: number; y: number };
  size: { w: number; h: number };
  affixes: Affix[];
  pickedUp: boolean;
  /** 拾取后增加的 hp/mp (玩家基础) */
}

export const RARITY_COLORS: Record<Rarity, [number, number, number]> = {
  white:  [0.95, 0.95, 0.95],
  green:  [0.3,  1.0,  0.3],
  blue:   [0.3,  0.5,  1.0],
  purple: [0.7,  0.3,  1.0],
};

export const RARITY_DROP_RATE: Record<Rarity, number> = {
  white:  0.4,
  green:  0.25,
  blue:   0.1,
  purple: 0.03,
};

let nextEqId = 1;

const PREFIXES = ['暗影', '烈焰', '寒霜', '雷霆', '虚空', '圣光', '古龙', '深渊'];
const SUFFIXES = ['之牙', '之心', '之手', '之眼', '之魂', '之怒', '之誓', '之拥'];

/** 生成随机装备名 */
function genName(): string {
  const p = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  const s = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
  return `${p}${s}`;
}

const STAT_NAMES: Record<Affix['stat'], string> = {
  hp: '生命',
  mp: '法力',
  dmg: '伤害',
  speed: '速度',
};

/** 生成随机词条 */
function genAffix(rarity: Rarity): Affix {
  const stats: Affix['stat'][] = ['hp', 'mp', 'dmg', 'speed'];
  const stat = stats[Math.floor(Math.random() * stats.length)];
  const mul = rarity === 'white' ? 1 : rarity === 'green' ? 2 : rarity === 'blue' ? 4 : 8;
  const value = (stat === 'hp' || stat === 'mp' ? 10 : stat === 'dmg' ? 2 : 10) * mul;
  return { stat, value };
}

/** 怪物死亡时按概率掉装备 */
export function dropLoot(state: GameState, x: number, y: number): Equipment | null {
  const ext = state as GameState & { _loot?: Equipment[] };
  ext._loot = ext._loot ?? [];
  const r = Math.random();
  let cum = 0;
  let chosen: Rarity | null = null;
  for (const [rar, rate] of Object.entries(RARITY_DROP_RATE) as [Rarity, number][]) {
    cum += rate;
    if (r < cum) { chosen = rar; break; }
  }
  if (!chosen) return null;
  const eq: Equipment = {
    id: nextEqId++,
    name: genName(),
    rarity: chosen,
    pos: { x, y },
    size: { w: 24, h: 24 },
    affixes: [genAffix(chosen)],
    pickedUp: false,
  };
  ext._loot.push(eq);
  return eq;
}

/** 检查拾取 + 应用词条 (拾取: 一次性, 仅玩家碰触) */
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
      // 应用词条
      for (const a of eq.affixes) {
        if (a.stat === 'hp') state.player.hp = Math.min(100, state.player.hp + a.value);
        else if (a.stat === 'mp') state.player.mp = Math.min(100, state.player.mp + a.value);
        // dmg/speed 是 M2 的事, M1 简化只记
      }
      return false;
    }
    return true;
  });
  return picked;
}

export function getLoot(state: GameState): readonly Equipment[] {
  const ext = state as GameState & { _loot?: Equipment[] };
  return ext._loot ?? [];
}

export function describeAffix(a: Affix): string {
  const sign = a.value > 0 ? '+' : '';
  return `${STAT_NAMES[a.stat]} ${sign}${a.value}`;
}