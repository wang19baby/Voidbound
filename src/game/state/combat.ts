// game/state/combat.ts — 战斗相关 GameState 子对象 (PR #1 / T4-a)
//
// 单一数据源: 原 GameState 上的 combat 相关字段已迁入此子对象;
//             顶层字段已删除,所有引用走 state.combat.*。
// 0 行为变更 (纯物理迁移)。

export interface ComboState {
  count: number;
  timer: number;
}

export interface CombatState {
  /** 连击 (US-017): count = 当前连击数, timer = 剩余窗口秒 (0 = 无) */
  combo: ComboState;
  /** 屏幕震动幅度 (OPT-026): 受击/Boss 二阶段触发, 每帧衰减 */
  cameraShake: number;
  /** 命中停顿 (V0 画质): >0 时冻结世界模拟, 仅渲染; 暴击触发 ~0.1s */
  hitStop: number;
  /** 最近一次伤害来源 (内容扩充): 死亡结算显示击杀者 */
  lastKiller: string | null;
  /** B-V2 Boss 入场演出: >0 = 横幅+全屏泛光脉动剩余秒; 文案在 introText */
  bossIntroT: number;
  bossIntroText: string;
  bossIntroTitle: string;
  /** 升级全屏闪光剩余秒 (US-019) */
  levelUpFlash: number;
  /** 本局积分 (HUD 显示 + 通关结算) */
  score: number;
  /** 累计击杀 (HUD 显示) */
  killsTotal: number;
}

/** 空 CombatState 工厂 (GameState 初始化用) */
export function createEmptyCombatState(): CombatState {
  return {
    combo: { count: 0, timer: 0 },
    cameraShake: 0,
    hitStop: 0,
    lastKiller: null,
    bossIntroT: 0,
    bossIntroText: '',
    bossIntroTitle: '',
    levelUpFlash: 0,
    score: 0,
    killsTotal: 0,
  };
}