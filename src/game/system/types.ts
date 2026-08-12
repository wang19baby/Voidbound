// game/system/types.ts — 游戏系统接口 (T3d, 2026-08-12)
//
// 设计动机:
// - 当前 update* / draw* 函数散在 main.ts loopImpl 和 7 个 presentation/worldDraw 文件
// - 每个系统 (FX/攻击/怪物/玩家/环境) 各自一套 spawn + update + render 拼装
// - GameSystem 接口抽象后, 主循环可以遍历注册表, 业务可插拔
//
// 模式:
// - update(state, dt) → 推进模拟
// - render?(ctx)     → 可选: 渲染 (图层系统走这个)
// - reset()          → 切场景/重开跑局时清状态 (FX 池重置等)
// - order            → 注册顺序控制执行顺序 (FX 在攻击之后清理)
//
// 不变量:
// - 系统是纯行为 (无内部状态跨帧持久化, 状态在 GameState)
// - reset() 不能 throw (切屏可靠性)
// - render 可选, 不渲染的系统可不实现

import type { GameState } from '../state';
import type { DrawCtx } from '../../presentation/worldDraw/types';

/** 游戏系统接口 */
export interface GameSystem {
  /** 唯一 id, 调试/日志用 */
  readonly id: string;
  /**
   * 每帧调用: 推进模拟
   * @param state 共享游戏状态 (各系统都读写此对象)
   * @param dt 上一帧到本帧的秒数
   */
  update(state: GameState, dt: number): void;
  /**
   * 每帧调用 (可选): 渲染到 ctx
   * 注意: 现有 presentation/worldDraw/* 是固定图层顺序, 这里仅供额外系统挂载
   */
  render?(ctx: DrawCtx): void;
  /** 切场景/重开跑局时清状态 (FX 池重置 / 内部计数器清零等) */
  reset(): void;
}