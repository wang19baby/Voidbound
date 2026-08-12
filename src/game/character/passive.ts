// 被动技能树 (DESIGN §6 / F-RPG-003 / M5 非目标收尾): 10 被动槽同时生效
// - 每被动 1-20 级, 每级消耗 1 技能点 (训练师 NPC 面板分配)
// - 效果映射: hpMax/mpMax/mpRegen/speed + CombatStats 字段
// - recomputePassives 合并进 player (hpMax/mpMax 兜底 100, mpRegen 0, speed 乘区)
//
// 本文件: PR #3 / T5-a (2026-08-13) 从 src/game/passive.ts 整文件搬移;
// 相对 import 路径已从 './xxx' 修正为 '../xxx' (character/ 与 xxx/ 同级)。

import type { CombatStats } from '../combat';
import { DAMAGE_TYPES } from '../combat';

export type PassiveId =
  | 'vitality'   // 生命上限
  | 'mana'       // 法力上限 + 恢复
  | 'resist'     // 全系抗性
  | 'critRate'   // 暴击率
  | 'critBonus'  // 暴击伤害
  | 'lifesteal'  // 吸血
  | 'speed'      // 移速
  | 'physPct'    // 物理伤害
  | 'elemPct'    // 元素伤害
  | 'dodge';     // 闪避 (接触减伤)

export const PASSIVE_IDS: readonly PassiveId[] = [
  'vitality', 'mana', 'resist', 'critRate', 'critBonus',
  'lifesteal', 'speed', 'physPct', 'elemPct', 'dodge',
];

export interface PassiveDef {
  id: PassiveId;
  name: string;
  desc: string;
  /** 每级效果说明模板 */
  perLv: string;
  maxLevel: number;
}

export const PASSIVE_DEFS: Record<PassiveId, PassiveDef> = {
  vitality:  { id: 'vitality',  name: '生命强化', desc: '提升生命上限', perLv: '+5 最大生命/级', maxLevel: 20 },
  mana:      { id: 'mana',      name: '法力强化', desc: '提升法力上限与恢复', perLv: '+5 最大法力 +0.5 回蓝/级', maxLevel: 20 },
  resist:    { id: 'resist',    name: '全抗',     desc: '提升全系抗性', perLv: '+1 全抗/级', maxLevel: 20 },
  critRate:  { id: 'critRate',  name: '致命一击', desc: '提升暴击率', perLv: '+0.5% 暴击/级', maxLevel: 20 },
  critBonus: { id: 'critBonus', name: '暴击伤害', desc: '提升暴击伤害', perLv: '+3% 暴伤/级', maxLevel: 20 },
  lifesteal: { id: 'lifesteal', name: '嗜血',     desc: '命中回复生命', perLv: '+0.3% 吸血/级', maxLevel: 20 },
  speed:     { id: 'speed',     name: '疾行',     desc: '提升移动速度', perLv: '+1% 移速/级', maxLevel: 20 },
  physPct:   { id: 'physPct',   name: '武器大师', desc: '提升物理伤害', perLv: '+2% 物理/级', maxLevel: 20 },
  elemPct:   { id: 'elemPct',   name: '元素精通', desc: '提升元素伤害', perLv: '+2% 元素/级', maxLevel: 20 },
  dodge:     { id: 'dodge',     name: '闪避',     desc: '降低受到的接触伤害', perLv: '-1.5% 接触伤害/级', maxLevel: 20 },
};

/** 被动来源 (GameState 结构满足: player.passives / player.combat / player.hpMax 等) */
export interface PassiveHost {
  player: {
    passives: Partial<Record<PassiveId, number>>;
    combat: CombatStats;
    hpMax?: number;
    mpMax?: number;
    mpRegen?: number;
    speedMult?: number;
    /** 上次应用快照 (幂等: 重算先减旧再加新) */
    passiveSnap?: PassiveSnapshot;
  };
}

/** 被动等级 (缺失=0) */
export function passiveLevel(state: PassiveHost, id: PassiveId): number {
  return state.player.passives[id] ?? 0;
}

/** 已分配技能点总数 (校验用) */
export function passivePointsSpent(state: PassiveHost): number {
  let n = 0;
  for (const id of PASSIVE_IDS) n += state.player.passives[id] ?? 0;
  return n;
}

/** 被动数值快照 (纯函数, 单测): 由等级表计算增量 */
export interface PassiveSnapshot {
  hpMax: number;
  mpMax: number;
  mpRegen: number;
  speedMult: number;
  res: number;
  critRate: number;
  critBonus: number;
  lifesteal: number;
  physPct: number;
  elemPct: number;
  dodgeReduction: number;
}

export function passiveSnapshot(levels: Partial<Record<PassiveId, number>>): PassiveSnapshot {
  const L = (id: PassiveId) => levels[id] ?? 0;
  return {
    hpMax: L('vitality') * 5,
    mpMax: L('mana') * 5,
    mpRegen: L('mana') * 0.5,
    speedMult: 1 + L('speed') * 0.01,
    res: L('resist'),
    critRate: L('critRate') * 0.005,
    critBonus: L('critBonus') * 3,
    lifesteal: L('lifesteal') * 0.3,
    physPct: L('physPct') * 0.02,
    elemPct: L('elemPct') * 0.02,
    dodgeReduction: L('dodge') * 0.015,
  };
}

/** 把被动快照合并进 player (hpMax/mpMax/mpRegen/speedMult + combat 增量); 幂等 (先减旧快照再加新) */
export function recomputePassives(state: PassiveHost): void {
  const prev = state.player.passiveSnap;
  const snap = passiveSnapshot(state.player.passives);
  // 回滚旧快照
  if (prev) {
    const c0 = state.player.combat;
    for (const t of DAMAGE_TYPES) {
      c0.res[t] = (c0.res[t] ?? 0) - prev.res;
    }
    c0.critRate = (c0.critRate ?? 0) - prev.critRate;
    c0.critBonus = (c0.critBonus ?? 0) - prev.critBonus;
    c0.lifesteal = (c0.lifesteal ?? 0) - prev.lifesteal;
    c0.physPct = (c0.physPct ?? 0) - prev.physPct;
    c0.elemPct = (c0.elemPct ?? 0) - prev.elemPct;
  }
  // 应用新快照
  state.player.hpMax = 100 + snap.hpMax;
  state.player.mpMax = 100 + snap.mpMax;
  state.player.mpRegen = snap.mpRegen;
  state.player.speedMult = snap.speedMult;
  const c = state.player.combat;
  c.res = c.res ?? {};
  for (const t of DAMAGE_TYPES) {
    c.res[t] = (c.res[t] ?? 0) + snap.res;
  }
  c.critRate = (c.critRate ?? 0) + snap.critRate;
  c.critBonus = (c.critBonus ?? 0) + snap.critBonus;
  c.lifesteal = (c.lifesteal ?? 0) + snap.lifesteal;
  c.physPct = (c.physPct ?? 0) + snap.physPct;
  c.elemPct = (c.elemPct ?? 0) + snap.elemPct;
  c.attr = c.attr ?? 0;
  state.player.passiveSnap = snap;
}

/** 分配 1 技能点给被动; 返回 null=成功, 否则错误信息 */
export function assignPassivePoint(state: PassiveHost & { player: PassiveHost['player'] & { skillPoints: number } }, id: PassiveId): string | null {
  const def = PASSIVE_DEFS[id];
  if (!def) return 'unknown passive';
  const cur = state.player.passives[id] ?? 0;
  if (cur >= def.maxLevel) return `${def.name} 已满级`;
  if ((state.player.skillPoints ?? 0) <= 0) return 'no skill points';
  state.player.passives[id] = cur + 1;
  state.player.skillPoints--;
  recomputePassives(state);
  return null;
}