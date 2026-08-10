// 符文系统 (US-004): 变异按技能槽绑定 (D-01); 10 级三选一后永久绑定
// OPT-023: 符文按技能族分池 (fireball/melee/ult/heal), 三选一从对应池抽
// 效果接线: split·pierce·homing·vampire → 火球 (monster/state); cleave·steal·vampire → 近战 (skill/monster); focus → 大招 (skill)

export type RuneId =
  | 'split' | 'pierce' | 'vampire' | 'homing' | 'nova'
  | 'cleave' | 'steal' | 'focus'
  | 'none';

export interface RuneDef {
  id: RuneId;
  name: string;
  desc: string;
  color: [number, number, number];
}

export const RUNE_DEFS: Record<RuneId, RuneDef> = {
  none:    { id: 'none',    name: '无符文',  desc: '', color: [1, 1, 1] },
  split:   { id: 'split',   name: '分裂',   desc: '火球分裂为 3 发',   color: [1, 0.5, 0.2] },
  pierce:  { id: 'pierce',  name: '穿透',   desc: '火球不撞墙, 飞行距离 x2', color: [0.8, 0.8, 1] },
  vampire: { id: 'vampire', name: '嗜血',   desc: '命中回 5 HP',        color: [1, 0.2, 0.3] },
  homing:  { id: 'homing',  name: '追踪',   desc: '火球自动追踪最近怪物', color: [0.3, 1, 0.5] },
  nova:    { id: 'nova',    name: '爆炸',   desc: '火球命中爆炸, 溅射 60% 范围伤害', color: [1, 0.6, 0.1] },
  cleave:  { id: 'cleave',  name: '横扫',   desc: '近战范围 +60%',      color: [1, 0.7, 0.1] },
  steal:   { id: 'steal',   name: '汲魔',   desc: '近战命中回 4 MP',    color: [0.4, 0.6, 1] },
  focus:   { id: 'focus',   name: '专注',   desc: '大招伤害 +50%',      color: [0.9, 0.4, 1] },
};

export type RuneFamily = 'fireball' | 'melee' | 'ult' | 'heal';

/** 技能族符文池 (OPT-023): 家庭池优先, 不足由全局补齐 */
export const RUNE_FAMILIES: Record<RuneFamily, RuneId[]> = {
  fireball: ['split', 'pierce', 'homing', 'vampire', 'nova'],
  melee:    ['cleave', 'steal', 'vampire'],
  ult:      ['focus', 'vampire'],
  heal:     ['vampire'],
};

/** 槽位 → 技能族 */
export function slotFamily(slot: string): RuneFamily {
  if (slot === 'LMB' || slot === 'RMB') return 'melee';
  if (slot === 'Q' || slot === 'W') return 'fireball';
  if (slot === 'R') return 'ult';
  return 'heal';
}