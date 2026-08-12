// game/character/types.ts — Player interface re-export (PR #3 / T5-a, 2026-08-13)
// Player interface 实际定义在 game/state.ts (与 GameState 紧耦合); 此处仅 re-export,
// 保持 character/ 桶对外提供 Player 类型, 不引入循环依赖。

export type { Player } from '../state';