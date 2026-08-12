// app/save.ts — 存档业务层 (US-027 拆分)
//
// 本次拆分: buildSavePayload (纯函数) + persistNow/restoreMaterials/restorePassives (state 首参)
// - continueLastSave/resumeFromSave/enterTargetCharacter 跨异步链 + 复杂字段迁移 → 留 main.ts (US-027-b)
//
// 依赖: game/* 领域模块 (只读 state, 不引入循环依赖)

import type { GameState } from '../game/state';
import { getOwned, getEquippedValues, MATERIAL_IDS, emptyMaterials, type MaterialId } from '../game/equipment';
import { SKILL_SLOTS, skillLevel, skillRune } from '../game/skill';
import { PASSIVE_IDS, recomputePassives, type PassiveId } from '../game/passive';
import { pushToast } from '../game/toast';
import type { SaveData, SaveAccount } from '../ipc/save';
import { saveGame, saveAccount } from '../ipc/save';
import { inf, wrn } from '../util/log';
import type { Difficulty } from '../game/difficulty';

/** 序列化当前 state 到 SaveData (纯函数; v11 scene + v10 mode + v9 passives + W4 materials) */
export function buildSavePayload(state: GameState): SaveData {
  return {
    player_x: state.player.pos.x,
    player_y: state.player.pos.y,
    player_hp: state.player.hp,
    player_mp: state.player.mp,
    facing_x: state.player.facing.x,
    facing_y: state.player.facing.y,
    score: state.score,
    world_w: state.world.w,
    world_h: state.world.h,
    level: state.player.level,
    owned: getOwned(state).map(eq => ({
      name: eq.name,
      rarity: eq.rarity,
      eq_type: eq.type,
      affixes: eq.affixes.map(a => ({ stat: a.stat, value: a.value, element: a.element })),
      setName: eq.setName,
    })),
    equipped: getEquippedValues(state).map(eq => ({
      slot: eq.type,
      item: {
        name: eq.name,
        rarity: eq.rarity,
        eq_type: eq.type,
        affixes: eq.affixes.map(a => ({ stat: a.stat, value: a.value, element: a.element })),
        setName: eq.setName,
      },
    })),
    runes: SKILL_SLOTS.flatMap(slot => {
      const r = skillRune(slot);
      return r ? [{ slot, rune: r }] : [];
    }),
    theme: state.theme,
    difficulty: state.difficulty,
    gold: state.player.gold,
    class: state.player.classId,
    town: state.townId,
    materials: MATERIAL_IDS.filter(id => (state.materials[id] ?? 0) > 0).map(id => [id, state.materials[id] ?? 0]),
    passives: PASSIVE_IDS.filter(id => (state.player.passives[id] ?? 0) > 0).map(id => [id, state.player.passives[id] ?? 0]),
    mode: state.run.mode ?? 'linear',
    scene: state.mode,
    skill_levels: SKILL_SLOTS.map(slot => ({ slot, level: skillLevel(slot) })),
    skill_points: state.player.skillPoints ?? 0,
    exp: state.player.exp ?? 0,
  };
}

/** 读档还原材料 (M5 W4 C-401) */
export function restoreMaterialsApp(state: GameState, d: { materials?: Array<[string, number]> }): void {
  state.materials = emptyMaterials();
  for (const [id, n] of d.materials ?? []) {
    if (MATERIAL_IDS.includes(id as MaterialId)) state.materials[id as MaterialId] = n;
  }
}

/** 读档还原被动技能树 (v9) */
export function restorePassivesApp(state: GameState, d: { passives?: Array<[string, number]> }): void {
  state.player.passives = {};
  for (const [id, n] of d.passives ?? []) {
    if (PASSIVE_IDS.includes(id as PassiveId)) state.player.passives[id as PassiveId] = n;
  }
  recomputePassives(state);
}

/** 异步保存 (OPT-002/029): 角色档 + 账号层双写; 失败 toast 提示, 不阻塞 */
export function persistNowApp(state: GameState): Promise<void> {
  const chars = state.charList.map(c => c.id);
  if (!chars.includes(state.currentChar)) chars.push(state.currentChar);
  const acc: SaveAccount = {
    cleared: state.cleared,
    best: (Object.entries(state.run.best) as [Difficulty, number][]).map(([d, ms]) => ({ difficulty: d, ms })),
    characters: chars,
    last_char: state.currentChar,
    legacy: state.legacy,
    warehouse: state.warehouse.map(eq => ({
      name: eq.name,
      rarity: eq.rarity,
      eq_type: eq.type,
      affixes: eq.affixes.map(a => ({ stat: a.stat, value: a.value, element: a.element })),
      setName: eq.setName,
    })),
  };
  return Promise.all([saveGame(buildSavePayload(state), state.currentChar), saveAccount(acc)])
    .then(([m]) => inf('save', `saved: ${m}`))
    .catch(e => {
      wrn('save', `save failed: ${e}`);
      pushToast(state, `保存失败: ${String(e)}`, '#f66');
    });
}
