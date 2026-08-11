// A-W3 移动 AI (设计文档 §6.1): 配给领主 (挂载规则: 移动AI×1 + 机制×1 + bossSkill 三选一)
// 每个行为有可读反制点: 预警圈 / 土痕 / 追击决策

export type MoveAI = 'strafe' | 'leap' | 'burrow' | 'flee';

export const MOVE_AIS: readonly MoveAI[] = ['strafe', 'leap', 'burrow', 'flee'];

export const MOVE_AI_NAMES: Record<MoveAI, string> = {
  strafe: '侧移',
  leap: '扑击',
  burrow: '遁地',
  flee: '逃窜',
};

/** 侧移: 绕玩家弧形移动放风筝; 反制 = 预判走位/冲刺切入 */
export const STRAFE_RADIUS = 150;
export const STRAFE_SPEED_MULT = 0.85;

/** 扑击: 蓄力后跳向玩家落点, 落点预警圈 0.4s; 反制 = 翻滚躲避 */
export const LEAP_CD = 4.0;
export const LEAP_WINDUP = 0.4;       // 预警时间 (s)
export const LEAP_SPEED = 420;
export const LEAP_DMG_MULT = 2.2;
export const LEAP_RANGE = 260;

/** 遁地: 潜入地下移动 (无敌), 出地扑袭; 可看土痕预判; 反制 = 看土痕/远离落点 */
export const BURROW_CD = 5.0;
export const BURROW_TIME = 1.6;       // 遁地持续
export const BURROW_SPEED_MULT = 1.4;
export const BURROW_EXIT_DMG_MULT = 2.0;

/** 逃窜: 残血 (<30%) 逃跑, 可拉连锁仇恨; 反制 = 追击决策/放走 (不再回血) */
export const FLEE_HP_THRESHOLD = 0.3;
export const FLEE_SPEED_MULT = 1.35;

/** 随机移动 AI (领主挂载) */
export function rollMoveAI(r: () => number = Math.random): MoveAI {
  return MOVE_AIS[Math.floor(r() * MOVE_AIS.length)];
}