// app/run.ts — 跑局生命周期 (T1b, 2026-08-12)
//
// 从 main.ts 拆出: 原 line 1377-1428 (startRun / ensureDungeonRun / triggerBossIntro)
//
// 设计:
// - startRun: 进入新跑局, 重置怪物/经验/buff/Boss 触发器 + emit run.started
// - ensureDungeonRun: 已是 dungeon 状态则跳过 (US-021 城镇退出)
// - triggerBossIntro: Boss 入场演出 (横幅 + 全屏泛光脉动)
//
// 事件总线:
// - startRun 后 emit run.started (FX 服务可订阅做 bgm 切换/难度提示)
// - Boss 触发器 (state.combat.bossIntroT) 由 triggerBossIntro 设置

import type { GameState, Theme } from '../game/state';
import type { Difficulty } from '../game/difficulty';
import type { MapMode } from '../game/mapmode';
import { bus } from '../core/eventBus';
import { bindClass } from '../game/class';
import { bindSkill } from '../game/skill';
import { setScreen, THEMES } from '../game/state';
import { resetWorldForMode } from '../game/world';
import { spawnRunPool } from '../game/monsters/spawn';
import { MONSTER_DEFS } from '../game/monsters/defs';
import { bindKeybindAction } from '../game/keybind';

/** 进入新跑局: 重置所有跑局状态 + emit run.started */
export function startRun(state: GameState, theme: Theme, difficulty: Difficulty, mode: MapMode = 'linear'): void {
  state.theme = theme;
  state.difficulty = difficulty;
  state.mode = 'dungeon';
  state.run.theme = theme;
  state.run.difficulty = difficulty;
  state.run.mode = mode;
  state.run.alive = 0;
  state.run.bossKilled = false;
  state.run.kills = 0;
  state.run.timeSec = 0;
  state.run.startedAt = performance.now();
  state.run.bossType = MONSTER_DEFS[Object.keys(MONSTER_DEFS)[0] as keyof typeof MONSTER_DEFS]?.boss
    ? (Object.keys(MONSTER_DEFS).find(k => MONSTER_DEFS[k as keyof typeof MONSTER_DEFS].boss) as keyof typeof MONSTER_DEFS) ?? null
    : null;
  // 角色绑定 (重置技能点 / 技能选择)
  bindClass(state, state.player.classId);
  // 重置世界 (chunked 墙 + 装饰)
  resetWorldForMode(mode);
  // 生成怪物池
  spawnRunPool(state);
  // 重置摄像机 + 设置屏
  state.camera.x = state.player.pos.x;
  state.camera.y = state.player.pos.y;
  setScreen(state, 'dungeon');
  state.pauseFrom = 'dungeon';
  // T1a: emit 事件 (FX 服务订阅做 bgm 切换 / 难度提示)
  bus.emit('run.started', { theme, difficulty, mode });
}

/** 确保 dungeon 模式已就绪 (城镇退出时调): 若已是 dungeon 则跳过 */
export function ensureDungeonRun(state: GameState): void {
  if (state.mode === 'dungeon' && state.run.alive >= 0) return;
  startRun(state, state.run.theme, state.run.difficulty, state.run.mode);
}

/** Boss 入场演出: 全屏泛光脉动 + 横幅文案 */
export function triggerBossIntro(state: GameState, title: string, text: string): void {
  state.combat.bossIntroT = 2.5;
  state.combat.bossIntroTitle = title;
  state.combat.bossIntroText = text;
}

// 类型引用防止 tree-shake
type _Theme = typeof THEMES[number];