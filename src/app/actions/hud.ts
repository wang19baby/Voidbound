// app/actions/hud.ts — 战斗 HUD 动作 (US-029 后续拆分)
//
// 本次拆分: 从 main.ts 搬出 handleHudClick (战斗 HUD 按钮点击)
// - 与键盘 Q·F·E·R / 1·2 / Space 同行为
//
// 依赖: game/* 领域模块 + notifyCastFail (./player)
//
// 0 行为变更: 函数体原样搬移, 闭包依赖显式参数化 (state/aimDir/nowSec)

import { invoke as tauriInvoke } from '@tauri-apps/api/core';
const invoke = tauriInvoke;
import type { GameState } from '../../game/state';
import { tryCastSlot, SKILL_SLOTS } from '../../game/skill';
import { usePotion, startDodge } from '../../game/player';
import { playSfxClient } from '../../ipc/sfx';
import { wrn } from '../../util/log';
import { notifyCastFail } from './player';

/** 战斗 HUD 按钮点击 (技能栏 4 槽 / 药水 HP·MP / 翻滚): 与键盘 Q·F·E·R / 1·2 / Space 同行为 */
export function handleHudClick(state: GameState, key: string, aimDir: { x: number; y: number }, nowSec: number): void {
  if (key.startsWith('skill')) {
    const idx = Number(key.slice(5));
    const slot = SKILL_SLOTS[2 + idx];  // 显示 Q/F/E/R → 内部 Q/W/E/R
    if (slot && tryCastSlot(slot, state, aimDir, nowSec)) {
      invoke('play_sfx', { name: 'swing' }).catch(() => {});
    } else {
      notifyCastFail(state, slot ?? 'Q');
    }
    return;
  }
  if (key === 'potionHp') {
    if (usePotion(state, 'hp')) playSfxClient('hit');
    else wrn('skill', 'potion HP failed (cd or empty)');
    return;
  }
  if (key === 'potionMp') {
    if (usePotion(state, 'mp')) playSfxClient('hit');
    else wrn('skill', 'potion MP failed (cd or empty)');
    return;
  }
  if (key === 'dodge') {
    startDodge(state);
    return;
  }
}