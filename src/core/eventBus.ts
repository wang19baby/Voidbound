// core/eventBus.ts — 极简类型安全事件总线 (A.2 收口 + T1a 扩容)
//
// 设计目标:
// - 域层 emit 事件, 应用层 (combatService / progressService) on 订阅
// - 替代 killMonster 等函数直接动 9 个域字段的模式 (跨域副作用走事件)
// - 零外部依赖; 隔离单 handler 抛错 (不影响其他订阅者)
// - 单例 bus + 工厂 createBus 双导 (测试可独立实例)
//
// 使用:
//   import { bus } from './core/eventBus';
//   bus.on('monster.killed', payload => { ... });
//   bus.emit('monster.killed', { monster, killedBy, x, y });
//
// 类型安全: EventMap 是事件名 → payload 的映射; on/emit 共享泛型推断,
// 事件名拼错会编译期报错。

import type { Monster } from '../game/monsters/types';
import type { Player } from '../game/player';
import type { SkillSlot, SkillId } from '../game/skill';
import type { Equipment, EquipType, Rarity } from '../game/equipment';
import type { RuneId } from '../game/rune';
import type { Theme } from '../game/state';
import type { Difficulty } from '../game/difficulty';
import type { MapMode } from '../game/mapmode';

/** 域事件映射表 (新增事件只需在这里加一行) */
export interface EventMap {
  /** 怪物被击杀: 由 monsters/ai.killMonster 在最后 emit */
  'monster.killed': MonsterKilledEvent;
  /** 怪物出生 (留位, 后续 US-039 接 spawnMonster) */
  'monster.spawned': { monster: Monster };

  // --- T1a: 事件总线扩容 (从 3 → 13) ---
  /** 玩家受击 (T1a: 接 player.ts.takeDamage) */
  'player.hit': { amount: number; fromId: number; fromType: string };
  /** 玩家受伤 (含伤害源类型, 供 FX 服务按源分发特效) */
  'player.damaged': { dmg: number; src: 'monster' | 'projectile' | 'environment' | 'dot' };
  /** 玩家死亡 */
  'player.died': { killer: string | null };
  /** 技能施放成功 (tryCastSlot 成功路径 emit) */
  'skill.cast': { slot: SkillSlot; id: SkillId; pos: { x: number; y: number } };
  /** 物品掉落地面 (dropLoot/dropBossReward/dropEliteLoot 后 emit) */
  'item.dropped': { item: Equipment; rarity: Rarity };
  /** 物品装备到槽 (equipItem 成功路径 emit) */
  'item.equipped': { item: Equipment; slot: EquipType };
  /** 符文选择 (chooseRune 后 emit) */
  'rune.chosen': { rune: RuneId; slot: SkillSlot };
  /** 跑局开始 (startRun 后 emit) */
  'run.started': { theme: Theme; difficulty: Difficulty; mode: MapMode };
  /** 跑局结束 (boss 击杀/玩家死亡/撤离后 emit) */
  'run.ended': { reason: 'won' | 'died' | 'fled' };
  /** 屏幕切换 (setScreen 后 emit, 供 bgm/震动 服务订阅) */
  'screen.changed': { from: string; to: string };
}

/** MonsterKilledEvent: 跨域副作用的入口载荷 */
export interface MonsterKilledEvent {
  /** 刚被击杀的怪物 */
  monster: Monster;
  /** 击杀来源 (用于决定是否触发中毒/分裂/掉落策略) */
  killedBy: 'fireball' | 'melee' | 'dot' | 'death_trigger' | 'ai' | 'unknown';
  /** 击杀点 (世界坐标, 用于 spawn 粒子/掉落) */
  x: number;
  y: number;
}

export type EventName = keyof EventMap;
export type EventPayload<K extends EventName> = EventMap[K];
type AnyHandler = (payload: unknown) => void;
type Handler<K extends EventName> = (payload: EventPayload<K>) => void;

/**
 * EventBus 实例
 *  - on(event, fn) → 返回 unsubscribe 函数 (推荐模式)
 *  - emit(event, payload) → 同步分发, 单 handler 抛错被隔离
 *  - clear() → 测试/重启时清空
 */
export class EventBus {
  private handlers = new Map<EventName, Set<AnyHandler>>();

  on<K extends EventName>(event: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(fn as AnyHandler);
    return () => { set!.delete(fn as AnyHandler); };
  }

  emit<K extends EventName>(event: K, payload: EventPayload<K>): void {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return;
    // 拷贝一份: handler 内部可能 off 自己, 直接遍历会跳过后续元素
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (e) {
        // 隔离: 单个 handler 抛错不影响其他订阅者
        // eslint-disable-next-line no-console
        console.error(`[bus] handler for "${event}" failed:`, e);
      }
    }
  }

  /** 清空所有订阅 (测试用 / 重启) */
  clear(): void {
    this.handlers.clear();
  }

  /** 当前某事件的订阅数 (调试用) */
  listenerCount<K extends EventName>(event: K): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

/** 全局默认 bus (模块级单例, 与 screenMachine 的 module state 风格一致) */
export const bus = new EventBus();

/** 工厂: 用于测试隔离 (新建 bus 实例) */
export function createBus(): EventBus {
  return new EventBus();
}

// 类型保留引用避免被 tree-shake 误删
type _PlayerRef = Player;
type _SkillRef = SkillId;
type _EquipRef = EquipType;