// game/system/index.ts — barrel (T3d, 2026-08-12)

export type { GameSystem } from './types';
export { registerSystem, updateAll, renderAll, resetAll, systemCount } from './registry';
export { fxSystem, attackSystem, monsterSystem, envFxSystem, builtins, registerAllBuiltinSystems } from './builtins';