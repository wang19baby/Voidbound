// 符文系统: 技能变异 (D-01 核心创新)
// 每个 SkillDef 可挂多个 RuneDef, 符文改变技能的 cast 行为
// 例: fireball + [分裂] -> spawn 3 个; + [穿透] -> 不撞墙; + [嗜血] -> 命中回血

export type RuneId = 'split' | 'pierce' | 'vampire' | 'homing' | 'none';

export interface RuneDef {
  id: RuneId;
  name: string;
  desc: string;
  color: [number, number, number];
  /** 修改 cast 的 hook: 默认实现下, 符文按 chain 顺序叠加到 fireball 上 */
}

export const RUNE_DEFS: Record<RuneId, RuneDef> = {
  none:    { id: 'none',    name: '无符文',  desc: '', color: [1, 1, 1] },
  split:   { id: 'split',   name: '分裂',   desc: '火球分裂为 3 发',   color: [1, 0.5, 0.2] },
  pierce:  { id: 'pierce',  name: '穿透',   desc: '火球不撞墙, 飞行距离 x2', color: [0.8, 0.8, 1] },
  vampire: { id: 'vampire', name: '嗜血',   desc: '命中怪物回 5 HP',    color: [1, 0.2, 0.3] },
  homing:  { id: 'homing',  name: '追踪',   desc: '火球自动追踪最近怪物', color: [0.3, 1, 0.5] },
};

/** 当前激活的符文 (中键循环切换) */
let activeRune: RuneId = 'none';
export function getActiveRune(): RuneId { return activeRune; }
export function cycleActiveRune(): RuneId {
  const order: RuneId[] = ['none', 'split', 'pierce', 'vampire', 'homing'];
  const i = order.indexOf(activeRune);
  activeRune = order[(i + 1) % order.length];
  return activeRune;
}
export function setActiveRune(id: RuneId): void { activeRune = id; }