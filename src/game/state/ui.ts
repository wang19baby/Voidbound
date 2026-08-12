// game/state/ui.ts — UI 相关 GameState 子对象 (PR #1 / T4-b)
//
// 单一数据源: 原 GameState 上的 UI 相关字段已迁入此子对象;
//             顶层字段已删除,所有引用走 state.ui.*。
// 0 行为变更 (纯物理迁移)。
//
// 注: state.titleFocus 已搬到 screenMachine 模块级状态 (见 screenMachine.ts);
//     state.closeConfirmOpen/saving 也已是模块级状态。两者不归入 UiState。

export interface UiState {
  /** C (P1-4): 收集总览覆盖层 (characters 屏) */
  collectOpen: boolean;
  /** C (P3-10): 键位编辑捕获目标 (设置面板点条目后按新键) */
  keybindEdit: string | null;
  /** 设置面板展开 (M3 OPT-014): 子状态在 pause 上 */
  settingsOpen: boolean;
  /** 死亡结算进入标志 (OPT-011) */
  dying: boolean;
  /** C (死亡撤销): 死亡后 N 秒内可免费撤销, 0 = 已过期 */
  deathUndo: number;
  /** C (P2-8): 已探索 64px 块 "cx,cy" (会话内) */
  explored: Set<string>;
  /** 标题屏提示消息 (跨屏通用, 多处显示) */
  titleMsg: string;
}

/** 空 UiState 工厂 (GameState 初始化用) */
export function createEmptyUiState(): UiState {
  return {
    collectOpen: false,
    keybindEdit: null,
    settingsOpen: false,
    dying: false,
    deathUndo: 0,
    explored: new Set<string>(),
    titleMsg: '',
  };
}