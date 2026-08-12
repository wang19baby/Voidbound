// game/character/stats.ts — 战斗属性工厂 re-export (PR #3 / T5-a, 2026-08-13)
// baseCombat 实现在 game/combat/damage.ts (US-029 拆分后); 此处仅 re-export,
// 避免在 character/ 中复制 CombatStats / baseCombat 实现, 保持单一来源。

export { baseCombat, emptyRes } from '../combat';
export type { CombatStats, DamageType, DamageInput, DamageResult } from '../combat';
export { DAMAGE_TYPES } from '../combat';