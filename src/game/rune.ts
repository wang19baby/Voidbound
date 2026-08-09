// 符文系统 (US-004): 变异改为"按技能槽绑定" (D-01)
// 每个 SkillDef 可挂一个 RuneId, 10 级三选一后永久绑定 (chooseRune)
// 全局切换符文 (MMB) 已移除

export type RuneId = 'split' | 'pierce' | 'vampire' | 'homing' | 'none';

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
  vampire: { id: 'vampire', name: '嗜血',   desc: '命中怪物回 5 HP',    color: [1, 0.2, 0.3] },
  homing:  { id: 'homing',  name: '追踪',   desc: '火球自动追踪最近怪物', color: [0.3, 1, 0.5] },
};