// app/save.ts — 存档业务层 (US-027 拆分)
//
// 本次拆分: buildSavePayload (纯函数) + persistNow/restoreMaterials/restorePassives (state 首参)
// 本次 US-027-b 追加: continueLastSave/resumeFromSave/enterTargetCharacter (跨异步链 + 读档回城镇)
//   - enterTargetCharacter 需要 main.ts-only 函数 (startRun), 通过 SaveCtx 注入
//
// 依赖: game/* 领域模块 (只读 state, 不引入循环依赖)

import type { GameState, Theme } from '../game/state';
import { setScreen } from '../game/state';
import { getOwned, getEquippedValues, MATERIAL_IDS, emptyMaterials, allocEquipmentId, recomputeCombat, type MaterialId } from '../game/equipment';
import { SKILL_SLOTS, skillLevel, skillRune, getSkill } from '../game/skill';
import { PASSIVE_IDS, recomputePassives, type PassiveId } from '../game/passive';
import { pushToast } from '../game/toast';
import type { SaveData, SaveAccount, CharacterSummary } from '../ipc/save';
import { saveGame, saveAccount, loadGame, loadAccount, listCharacters } from '../ipc/save';
import { inf, wrn } from '../util/log';
import type { Difficulty } from '../game/difficulty';
import { DIFFICULTIES } from '../game/difficulty';
import { bindClass, type ClassId, CLASS_DEFS } from '../game/class';
import { TOWN_DEFS, type TownId } from '../game/town';
import { validMapMode, type MapMode } from '../game/mapmode';

/** SaveCtx: main.ts-only 副作用函数 (注入而非闭包) */
export interface SaveCtx {
  startRun: (state: GameState, theme: Theme, difficulty: Difficulty, mode?: MapMode) => void;
}

/** 序列化当前 state 到 SaveData (纯函数; v11 scene + v10 mode + v9 passives + W4 materials) */
export function buildSavePayload(state: GameState): SaveData {
  return {
    player_x: state.player.pos.x,
    player_y: state.player.pos.y,
    player_hp: state.player.hp,
    player_mp: state.player.mp,
    facing_x: state.player.facing.x,
    facing_y: state.player.facing.y,
    score: state.combat.score,
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
    materials: MATERIAL_IDS.filter(id => (state.equip.materials[id] ?? 0) > 0).map(id => [id, state.equip.materials[id] ?? 0]),
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
  state.equip.materials = emptyMaterials();
  for (const [id, n] of d.materials ?? []) {
    if (MATERIAL_IDS.includes(id as MaterialId)) state.equip.materials[id as MaterialId] = n;
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

/** 继续最近角色 (标题 [O], 键盘/点击共用): 读最近角色档 → 回城镇 */
export function continueLastSave(state: GameState): void {
  let loadedD: SaveData | null = null;
  loadAccount().then(a => {
    const last = (a.last_char && a.last_char.length > 0) ? a.last_char : 'char_0';
    state.currentChar = last;
    return loadGame(last);
  }).then(d => {
    loadedD = d;
    bindClass(state, (d.class as ClassId) ?? 'barbarian');
    if (d.town && TOWN_DEFS[d.town as TownId]) state.townId = d.town as TownId;  // M5 W3 C-302
    restoreMaterialsApp(state, d);  // M5 W4 C-401
    restorePassivesApp(state, d);  // v9 被动技能树
    return loadAccount();
  }).then(a => {
    state.cleared = a.cleared ?? [];
    state.run.best = {};
    for (const b of a.best ?? []) state.run.best[b.difficulty] = b.ms;
    state.legacy = a.legacy ?? [];
    state.warehouse = (a.warehouse ?? []).map(it => ({
      id: allocEquipmentId(),
      name: it.name,
      rarity: it.rarity,
      type: it.eq_type,
      pos: { x: 0, y: 0 },
      size: { w: 24, h: 24 },
      affixes: it.affixes.map(a2 => ({ stat: a2.stat, value: a2.value, element: a2.element })),
      pickedUp: true,
      setName: it.setName,
    }));
    if (loadedD) resumeFromSave(state, loadedD);
    state.ui.titleMsg = '';
    inf('save', `读档并继续 (角色 ${state.currentChar}, 含账号层)`);
  }).catch((err: unknown) => { state.ui.titleMsg = `无存档或读档失败: ${String(err)}`; wrn('save', String(err)); });
}

/** 读档统一进城镇 (GAME_FLOW §3: 继续 → 城镇 → 传送门/地下城入口出发) */
export function resumeFromSave(state: GameState, d: { scene?: string }): void {
  state.mode = 'town';
  state.townPanel = null;
  state.player.pos = { x: 560, y: 500 };
  setScreen(state, 'town');
  inf('ui', `读档 → 城镇 (${TOWN_DEFS[state.townId]?.name ?? state.townId})`);
  void import('../util/diag').then(({ diag }) =>
    diag('save', `load scene=${d.scene ?? 'dungeon'} theme=${state.theme} mode=${state.mode} run.theme=${state.run.theme} run.mode=${String(state.run.mode ?? '?')} element=${String(state.run.element ?? 'none')} pos=(${state.player.pos.x.toFixed(0)},${state.player.pos.y.toFixed(0)})`),
  );
}

/** 进入/切换角色 (v4 复用: 列表 Enter / 大按钮 / 最近 3 快捷卡) */
export function enterTargetCharacter(state: GameState, target: CharacterSummary, ctx: SaveCtx): void {
  if (target.id === state.currentChar) {
    // 进入/切换一律回城镇 (GAME_FLOW §3: 继续 → 城镇 → 传送门/地牢入口出发)
    resumeFromSave(state, { scene: 'town' });
    state.ui.titleMsg = '';
    inf('ui', `继续角色 ${target.id} → 城镇`);
    return;
  }
  // 切换角色: 先存当前, 再读目标
  state.currentChar = target.id;
  loadGame(target.id).then(d => {
    bindClass(state, (d.class as ClassId) ?? 'barbarian');
    state.player.pos.x = d.player_x; state.player.pos.y = d.player_y;
    state.player.hp = d.player_hp; state.player.mp = d.player_mp;
    state.player.facing.x = d.facing_x; state.player.facing.y = d.facing_y;
    state.combat.score = d.score; state.player.gold = d.gold ?? 0;
    state.player.level = d.level ?? 1;
    state.player.skillPoints = d.skill_points ?? 0;
    state.player.exp = d.exp ?? 0;
    const owned = getOwned(state);
    owned.length = 0;
    for (const it of d.owned) {
      owned.push({
        id: allocEquipmentId(), name: it.name, rarity: it.rarity, type: it.eq_type,
        pos: { x: 0, y: 0 }, size: { w: 24, h: 24 },
        affixes: it.affixes.map(a => ({ stat: a.stat, value: a.value, element: a.element })),
        pickedUp: true, setName: it.setName,
      });
    }
    state.player.equipped = {};
    for (const eq of d.equipped ?? []) {
      state.player.equipped[eq.slot] = {
        id: allocEquipmentId(), name: eq.item.name, rarity: eq.item.rarity, type: eq.slot,
        pos: { x: 0, y: 0 }, size: { w: 24, h: 24 },
        affixes: eq.item.affixes.map(a => ({ stat: a.stat, value: a.value, element: a.element })),
        pickedUp: true, setName: eq.item.setName,
      };
    }
    recomputeCombat(state);
    for (const rr of d.runes ?? []) {
      const sk = SKILL_SLOTS.includes(rr.slot) ? getSkill(rr.slot) : null;
      if (sk) sk.rune = rr.rune;
    }
    if (d.theme) state.theme = d.theme;
    if (DIFFICULTIES.includes(d.difficulty)) state.difficulty = d.difficulty;
    state.run.mode = validMapMode(d.mode ?? 'linear');  // A-W2 v10 模式还原
    if (d.town && TOWN_DEFS[d.town as TownId]) state.townId = d.town as TownId;  // M5 W3 C-302
    restoreMaterialsApp(state, d);  // M5 W4 C-401
    restorePassivesApp(state, d);  // v9 被动技能树
    for (const sl of d.skill_levels ?? []) {
      const sk = getSkill(sl.slot);
      if (sk) sk.level = sl.level;
    }
    resumeFromSave(state, d);
    state.ui.titleMsg = '';
    void persistNowApp(state);  // 更新 last_char
    inf('save', `切换到角色 ${target.id} (Lv${d.level ?? 1} ${d.class ?? 'barbarian'})`);
  }).catch((err: unknown) => {
    // 新建但未开局的角色无存档: 以该职业开新局后回城镇 (GAME_FLOW §3: 不直接进地牢)
    const cls = (target.class as ClassId) ?? 'barbarian';
    bindClass(state, cls);
    ctx.startRun(state, 'forest', 'normal');
    state.mode = 'town';
    state.townPanel = null;
    state.player.pos = { x: 560, y: 500 };
    setScreen(state, 'town');
    state.ui.titleMsg = '';
    void persistNowApp(state);
    inf('save', `角色 ${target.id} 无存档, 以 ${CLASS_DEFS[cls].name} 开新局, 已回城镇 (${String(err)})`);
  });
}