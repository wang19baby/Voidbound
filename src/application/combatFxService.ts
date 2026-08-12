// application/combatFxService.ts — 战斗 FX 订阅者 (A.3)
//
// 职责: 订阅 monster.killed 事件, 处理纯渲染/音频/日志副作用;
//       不改任何业务状态 (玩家经验/掉落/材料等已由 ai.killMonster 同步完成)
//
// 模式 (DDD lite):
//   - killMonster 只 emit 事件 + 处理本域数据 (score/gold/run 推进)
//   - 跨域渲染/音效副作用通过 bus.on 接入, 便于:
//     1. 测试时单独验证渲染副作用
//     2. 多平台/多语言切换时不触碰游戏域
//     3. 未来 B 添加新订阅者 (成就系统/统计/录像) 无需改 killMonster

import { bus, type MonsterKilledEvent } from '../core/eventBus';
import { inf } from '../util/log';
import { MONSTER_DEFS } from '../game/monsters/defs';

/** 处理击杀的渲染/日志副作用 — 当前阶段仅日志, 未来可挂粒子/震屏等 */
function handleKillFx(payload: MonsterKilledEvent): void {
  const def = MONSTER_DEFS[payload.monster.type];
  inf('combat.fx', `${payload.monster.type} killed @(${payload.x.toFixed(0)},${payload.y.toFixed(0)}) from=${payload.killedBy} boss=${!!def.boss}`);
}

/** 注册所有 combatFx 订阅者; 返回 unsubscribe 用于测试或重启 */
export function installCombatFxService(): () => void {
  const off = bus.on('monster.killed', handleKillFx);
  return off;
}