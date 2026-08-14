// app/screenMachine.ts — 屏路由集中器 (US-026 Ralph 13 完成)
//
// 职责: 把 main.ts 顶层 keydown 监听器中 9 段 if-else 屏路由分支 + 4 个 modal 拦截
//       (tutor / close / keybind edit / rune / hardcore) 集中到单一入口
//       handleScreenKey(state, e, ctx) → boolean。
//
// 模块级状态 (从 main.ts 搬出):
//   - titleFocus (标题屏焦点索引, TS-002 焦点导航)
//   - closeConfirmOpen (关窗确认遮罩, M5 W3 C-303)
//   - ngLaunchT (新局屏出发过场倒计时, US-025 deferred, 临时托管)
//   - ngNaming (新局屏命名输入是否激活)
//
// 公开 API:
//   - handleScreenKey(state, e, ctx) → boolean: 主入口, 返回 true 表示已消费
//   - getTitleFocus / isCloseConfirmOpen / getNgLaunchT / isNgNaming: 读 getter
//   - setCloseConfirmOpen / setNgLaunchT / setNgNaming: 写 setter
//   - syncTitleFocus / moveTitleFocus / titleAct: 主文件 (drawTitle/handleUiClick) 用的辅助函数
//   - triggerCloseConfirm: 关窗事件外部触发入口
//
// 依赖: game/* 领域模块 + util/log。**绝不 import main.ts** (避免循环)
//
// 职责: 把 main.ts 顶层 keydown 监听器中 9 段 if-else 屏路由分支 + 4 个 modal 拦截
//       (tutor / close / keybind edit / rune / hardcore) 集中到单一入口
//       handleScreenKey(state, e, ctx) → boolean。
//
// 设计 (本次最小切片):
// - 模块级状态从 main.ts 搬出: titleFocus, closeConfirmOpen, ngLaunchT, ngNaming
// - 纯函数 inline (syncTitleFocus, moveTitleFocus, titleAct, startNewgameFromTitle,
//   restoreMaterials, restorePassives, requestDifficulty, startCreateNewgame, startFromNewgame)
// - 19 个 main.ts-only 副作用函数走 ctx callback (见 ScreenKeyContext)
// - 不重写键位语义, 零行为变更
// - 后续 US-024-b / US-025 / US-027 可继续搬各屏 render/state-machine, 渐进式
//
// 依赖: game/* 领域模块 + util/log。**绝不 import main.ts** (避免循环)

import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { chooseRune, rejectRune } from '../game/skill';
import { DIFFICULTIES, DIFFICULTY_MODS, cycleDifficultyGated, unlockedDifficulty, type Difficulty } from '../game/difficulty';
import { setScreen, resumeScreen, type GameState, THEMES } from '../game/state';
import { pushToast } from '../game/toast';
import { MAP_MODES } from '../game/mapmode';
import { CLASS_IDS } from '../game/class';
import { themeUnlocked } from '../game/newgame';
import { loadKeybinds, saveKeybinds, resetKeybinds, keyMatch, normKey } from '../game/keybind';
import { playSfxClient, setVolumeClient } from '../ipc/sfx';
import { moveGridSel, flipPage, pageStart, pageOf } from '../game/uigrid';
import { listCharacters, deleteCharacter, type CharacterSummary } from '../ipc/save';
import { getOwned, equipItem, unequipSlot, RARITY_COLORS, EQUIP_NAMES } from '../game/equipment';
import { TOWN_DEFS, type TownId } from '../game/town';
import { setLogLevel, inf, wrn } from '../util/log';
import { usePotion, startDodge } from '../game/player';
import { deathGoldPenalty } from '../game/deathSettle';
import { leaveThroughPortal } from '../game/portal';

const invoke = tauriInvoke;

// ============================================================================
// 模块级状态 (从 main.ts 搬出)
// ============================================================================

let titleFocus: number | null = null;
let titleFocusCtx = '';
let closeConfirmOpen = false;
let ngLaunchT = 0;
let ngNaming = false;

export function getTitleFocus(): number | null { return titleFocus; }
export function isCloseConfirmOpen(): boolean { return closeConfirmOpen; }
export function getNgLaunchT(): number { return ngLaunchT; }
export function isNgNaming(): boolean { return ngNaming; }
export function setNgLaunchT(v: number): void { ngLaunchT = v; }
export function setNgNaming(v: boolean): void { ngNaming = v; }
export function setCloseConfirmOpen(v: boolean): void { closeConfirmOpen = v; }

// ============================================================================
// Ctx: 19 个 main.ts-only 副作用函数 (其他全部从 game/* import)
// ============================================================================

export interface ScreenKeyContext {
  // 关窗确认
  confirmCloseSave(): void;
  confirmCloseCancel(): void;
  // 标题 [O] / 列表
  continueLastSave(): void;
  openCharactersList(): void;
  // 新局屏
  saveLastNg(): void;
  loadLastNg(): { classIdx: number; diffIdx: number; themeIdx: number; modeIdx: number } | null;
  createCharacterNow(): boolean;
  startNewgameFromTitle(): void;
  startFromNewgame(): void;
  doLaunchRun(): void;
  // 远征屏 (MM-UG1): bindClass + setNgLaunchT(NG_LAUNCH_MS) + 过场结束 doLaunchRun
  startExpeditionRun(): void;
  // 角色切换
  enterTargetCharacter(target: CharacterSummary): void;
  // 存档 / 音频
  persistNow(): Promise<void>;
  fadeBgm(name: string, vol: number): void;
  // 跑局生命周期
  startRun(state: GameState, theme: typeof THEMES[number], diff: Difficulty, mode?: typeof MAP_MODES[number]): void;
  ensureDungeonRun(state: GameState): void;
  enterTown(state: GameState, townId?: string): void;
  triggerBossIntro(state: GameState, title: string, text: string): void;
  formatTime(sec: number): string;
  // 城镇交互
  interactTown(state: GameState): void;
  handleTownPanelKey(state: GameState, e: KeyboardEvent, k: string): void;
  // 死亡/硬核
  revivePlayer(state: GameState): void;
  hardcoreWipe(state: GameState): void;
}

// ============================================================================
// 纯函数 (inline)
// ============================================================================

function _syncTitleFocus(hasSave: boolean): void {
  const ctx = hasSave ? 'save' : 'nosave';
  const n = (hasSave ? 1 : 0) + 3;
  if (titleFocusCtx !== ctx || (titleFocus !== null && titleFocus >= n)) {
    titleFocus = null;
  }
  titleFocusCtx = ctx;
}
export function syncTitleFocus(hasSave: boolean): void { _syncTitleFocus(hasSave); }

function _moveTitleFocus(dir: 1 | -1, state: GameState): void {
  const n = (state.charList.length > 0 ? 1 : 0) + 3;
  titleFocus = titleFocus === null ? (dir > 0 ? 0 : n - 1) : (titleFocus + dir + n) % n;
  inf('ui', `标题焦点 → ${titleFocus}`);
}
export function moveTitleFocus(dir: 1 | -1, state: GameState): void { _moveTitleFocus(dir, state); }

function _titleAct(idx: number, state: GameState, ctx: ScreenKeyContext): void {
  const hasSave = state.charList.length > 0;
  if (hasSave) {
    if (idx === 0) { ctx.continueLastSave(); return; }
    if (idx === 1) { ctx.startNewgameFromTitle(); return; }
    if (idx === 2) { state.ui.settingsOpen = true; return; }
    ctx.openCharactersList();
    return;
  }
  if (idx === 0) { ctx.startNewgameFromTitle(); return; }
  if (idx === 1) { state.ui.settingsOpen = true; return; }
  ctx.openCharactersList();
}
export function titleAct(idx: number, state: GameState, ctx: ScreenKeyContext): void { _titleAct(idx, state, ctx); }

function requestDifficulty(state: GameState, d: Difficulty): void {
  if (d === 'hardcore') {
    state.confirmHardcore = true;
    state.pendingDifficulty = 'hardcore';
    pushToast(state, '硬核将清档. Y 确认 / Esc 取消', '#f66');
    return;
  }
  state.difficulty = d;
  pushToast(state, `难度 → ${DIFFICULTY_MODS[d].name}`, '#f66');
  inf('game', `难度 → ${DIFFICULTY_MODS[d].name}`);
}

// ============================================================================
// 模态拦截
// ============================================================================

function handleTutorAdvance(state: GameState): boolean {
  if (state.tutorStep >= 0 && state.tutorStep < 3 && state.screen === 'dungeon') {
    state.tutorStep++;
    state.tutorT = 0;
    return true;
  }
  return false;
}

function handleCloseConfirm(e: KeyboardEvent, ctx: ScreenKeyContext): boolean {
  if (!closeConfirmOpen) return false;
  const k = e.key.toLowerCase();
  if (k === 'y') { ctx.confirmCloseSave(); return true; }
  if (k === 'n' || k === 'escape') {
    ctx.confirmCloseCancel();
    inf('ui', '取消关闭');
    return true;
  }
  return true;
}

function handleKeybindEdit(state: GameState, e: KeyboardEvent): boolean {
  if (!state.ui.settingsOpen || !state.ui.keybindEdit) return false;
  if (e.key === 'Escape') { state.ui.keybindEdit = null; return true; }
  const kb = loadKeybinds();
  const nk = normKey(e.key);
  if (state.ui.keybindEdit.startsWith('skills.')) {
    kb.skills[state.ui.keybindEdit.slice(7) as 'Q' | 'W' | 'E' | 'R'] = nk;
  } else {
    (kb as unknown as Record<string, string>)[state.ui.keybindEdit] = nk;
  }
  saveKeybinds(kb);
  state.ui.keybindEdit = null;
  pushToast(state, '键位已更新', '#9cf');
  return true;
}

function handleRuneChoice(state: GameState, e: KeyboardEvent): boolean {
  if (!state.equip.runeChoice) return false;
  if (e.key === '1' || e.key === '2' || e.key === '3') {
    chooseRune(state, Number(e.key) - 1);
    return true;
  }
  if (e.key === 'Escape' || e.key === '0') {
    rejectRune(state);
    return true;
  }
  return true;
}

function handleHardcoreConfirm(state: GameState, e: KeyboardEvent): boolean {
  if (!state.confirmHardcore) return false;
  const k = e.key.toLowerCase();
  if (k === 'y') {
    const pd = state.pendingDifficulty;
    if (pd) {
      state.difficulty = pd;
      pushToast(state, `难度 → ${DIFFICULTY_MODS[pd].name}`, '#f66');
      inf('game', `难度 → ${DIFFICULTY_MODS[pd].name}`);
    }
    state.confirmHardcore = false;
    state.pendingDifficulty = null;
    return true;
  }
  if (k === 'escape' || k === '1') {
    state.confirmHardcore = false;
    state.pendingDifficulty = null;
    inf('game', '硬核切换取消');
    return true;
  }
  return true;
}

// ============================================================================
// 各屏 keydown handler
// ============================================================================

function handleTitleKey(state: GameState, e: KeyboardEvent, ctx: ScreenKeyContext): boolean {
  const k = e.key.toLowerCase();
  const hasSave = state.charList.length > 0;
  _syncTitleFocus(hasSave);

  if (state.ui.settingsOpen) {
    if (k === '2' || k === 'escape') { state.ui.settingsOpen = false; return true; }
    if (k === 'r') { resetKeybinds(); pushToast(state, '键位已恢复默认', '#9cf'); return true; }
    if (k === 'n') {
      const next = cycleDifficultyGated(state.difficulty, state.cleared);
      requestDifficulty(state, next);
      state.ui.titleMsg = `难度 → ${DIFFICULTY_MODS[state.difficulty].name}`;
      return true;
    }
    if (k === 'f') {
      void import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
        getCurrentWindow().isFullscreen().then(fs => getCurrentWindow().setFullscreen(!fs)));
      return true;
    }
    if (k === '+' || k === '=') { state.volume = Math.min(1, state.volume + 0.05); setVolumeClient(state.volume); return true; }
    if (k === '-' || k === '_') { state.volume = Math.max(0, state.volume - 0.05); setVolumeClient(state.volume); return true; }
    return true;
  }

  if (k === 'tab' || k === 'arrowdown') { e.preventDefault(); moveTitleFocus(1, state); return true; }
  if (k === 'arrowup') { e.preventDefault(); moveTitleFocus(-1, state); return true; }
  if (k === 'enter') { if (titleFocus !== null) titleAct(titleFocus, state, ctx); return true; }
  if (k === '1') { titleAct(0, state, ctx); return true; }
  if (k === '2') { titleAct(1, state, ctx); return true; }
  if (k === '3' && hasSave) { titleAct(2, state, ctx); return true; }
  if (k === 'r') { titleAct(hasSave ? 3 : 2, state, ctx); return true; }
  if (k === 'o') { ctx.continueLastSave(); return true; }
  return true;
}

function handleCharactersKey(state: GameState, e: KeyboardEvent, ctx: ScreenKeyContext): boolean {
  const k = e.key.toLowerCase();
  if (state.ui.collectOpen) {
    if (k === 'escape' || k === 'c') { state.ui.collectOpen = false; return true; }
    return true;
  }
  if (state.charConfirmDel) {
    if (k === 'y') {
      const target = state.charList[state.charSel];
      if (target) {
        state.charList = state.charList.filter(c => c.id !== target.id);
        if (state.charSel >= state.charList.length) state.charSel = Math.max(0, state.charList.length - 1);
        if (state.currentChar === target.id) state.currentChar = 'char_0';
        void deleteCharacter(target.id).then(() => pushToast(state, `已删除角色 ${target.id}`, '#f66'))
          .catch(e => wrn('save', `delete ${target.id}: ${e}`));
        inf('ui', `角色删除: ${target.id}`);
      }
      state.charConfirmDel = false;
      return true;
    }
    if (k === 'escape' || k === 'n') { state.charConfirmDel = false; return true; }
    return true;
  }
  if (k === 'arrowup' || k === 'w') { state.charSel = Math.max(0, state.charSel - 1); return true; }
  if (k === 'arrowdown' || k === 's') { state.charSel = Math.min(state.charList.length - 1, state.charSel + 1); return true; }
  if (k === 'enter') {
    const target = state.charList[state.charSel];
    if (!target) { state.ui.titleMsg = '没有可选角色 (按 N 新建)'; return true; }
    ctx.enterTargetCharacter(target);
    return true;
  }
  if (k === 'n') {
    state.ngFrom = 'create';
    state.charNameInput = '';
    ngNaming = true;
    setScreen(state, 'newgame');
    return true;
  }
  if (k === 'd') { if (state.charList.length > 0) state.charConfirmDel = true; return true; }
  if (k === 'escape') { setScreen(state, 'title'); return true; }
  return true;
}

function handleNewgameKey(state: GameState, e: KeyboardEvent, ctx: ScreenKeyContext): boolean {
  if (ngLaunchT > 0) return true;
  const k = e.key.toLowerCase();
  if (state.ngFrom === 'create' && ngNaming) {
    if (k === 'enter') { ngNaming = false; ctx.startFromNewgame(); return true; }
    if (k === 'escape') { ngNaming = false; state.charNameInput = ''; return true; }
    if (k === 'backspace') { state.charNameInput = state.charNameInput.slice(0, -1); return true; }
    if (/^[a-zA-Z0-9_]$/.test(e.key) && state.charNameInput.length < 24) state.charNameInput += e.key;
    return true;
  }
  const moveMap: Record<string, [number, number]> = {
    'arrowleft': [-1, 0], 'a': [-1, 0],
    'arrowright': [1, 0], 'd': [1, 0],
  };
  const mv = moveMap[k];
  if (mv) {
    state.ngSel.classIdx = (state.ngSel.classIdx + mv[0] + CLASS_IDS.length) % CLASS_IDS.length;
    playSfxClient('ui_click');
    return true;
  }
  // 创建模式 步骤 1 → 步骤 2 (←→ 已切职业, Enter 确认进步骤 2 命名+难度+主题+模式)
  if (state.ngFrom === 'create' && state.ui.classStep1 && k === 'enter') {
    state.ui.classStep1 = false;
    setNgNaming(true);
    inf('ui', `步骤 1 → 步骤 2: 已选 ${CLASS_IDS[state.ngSel.classIdx]}`);
    return true;
  }
  if (k === 'enter') { ctx.startFromNewgame(); return true; }
  if (k === 'escape') {
    setScreen(state, state.ngFrom === 'town' ? 'town' : 'title');
    state.ui.titleMsg = '';
    ngNaming = false;
    return true;
  }
  return true;
}

/** 远征屏 (MM-UG1): 城镇传送门交互后, 主题+模式+难度 配置 + 出发进地牢 */
function handleExpeditionKey(state: GameState, e: KeyboardEvent, ctx: ScreenKeyContext): boolean {
  if (ngLaunchT > 0) return true;
  const k = e.key.toLowerCase();
  // 主题 ←/→ / A/D (跳过锁定主题)
  if (k === 'arrowleft' || k === 'a') {
    let idx = state.ngSel.themeIdx;
    for (let step = 0; step < THEMES.length; step++) {
      idx = (idx - 1 + THEMES.length) % THEMES.length;
      if (themeUnlocked(state.cleared, THEMES[idx])) { state.ngSel.themeIdx = idx; playSfxClient('ui_click'); break; }
    }
    return true;
  }
  if (k === 'arrowright' || k === 'd') {
    let idx = state.ngSel.themeIdx;
    for (let step = 0; step < THEMES.length; step++) {
      idx = (idx + 1) % THEMES.length;
      if (themeUnlocked(state.cleared, THEMES[idx])) { state.ngSel.themeIdx = idx; playSfxClient('ui_click'); break; }
    }
    return true;
  }
  // 难度 Z/X (跳过锁定)
  if (k === 'z' || k === 'x') {
    const dir = k === 'z' ? -1 : 1;
    let idx = state.ngSel.diffIdx;
    for (let step = 0; step < DIFFICULTIES.length; step++) {
      idx = (idx + dir + DIFFICULTIES.length) % DIFFICULTIES.length;
      if (unlockedDifficulty(state.cleared, DIFFICULTIES[idx])) { state.ngSel.diffIdx = idx; playSfxClient('ui_click'); break; }
    }
    return true;
  }
  // 模式 M (线性循环)
  if (k === 'm') {
    state.ngSel.modeIdx = (state.ngSel.modeIdx + 1) % MAP_MODES.length;
    playSfxClient('ui_click');
    return true;
  }
  if (k === 'enter') { ctx.startExpeditionRun(); return true; }
  if (k === 'escape') { setScreen(state, 'town'); state.ui.titleMsg = ''; return true; }
  return true;
}

function handleEquipmentKey(state: GameState, e: KeyboardEvent): boolean {
  const k = e.key.toLowerCase();
  if (keyMatch(e, loadKeybinds().equip) || e.key === 'Escape') {
    setScreen(state, 'dungeon');
    inf('ui', 'equipment panel closed');
    return true;
  }
  const total = getOwned(state).length;
  if (k === 'arrowup') { state.equip.sel = moveGridSel(state.equip.sel, 'up', total); return true; }
  if (k === 'arrowdown') { state.equip.sel = moveGridSel(state.equip.sel, 'down', total); return true; }
  if (k === 'arrowleft') { state.equip.sel = moveGridSel(state.equip.sel, 'left', total); return true; }
  if (k === 'arrowright') { state.equip.sel = moveGridSel(state.equip.sel, 'right', total); return true; }
  if (k === 'pageup') { state.equip.sel = pageStart(flipPage(pageOf(state.equip.sel), -1, total), total); return true; }
  if (k === 'pagedown') { state.equip.sel = pageStart(flipPage(pageOf(state.equip.sel), 1, total), total); return true; }
  const selEq = getOwned(state)[state.equip.sel];
  if (k === 'a' || k === 'enter') {
    if (selEq && equipItem(state, selEq)) {
      const col = RARITY_COLORS[selEq.rarity].map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
      pushToast(state, `已穿戴 ${selEq.name}`, `#${col}`);
      playSfxClient('ui_click');
    } else if (selEq) {
      pushToast(state, '穿戴失败', '#ff5555');
    }
    return true;
  }
  if (k === 'u') {
    const slot = selEq ? selEq.type : undefined;
    if (slot && unequipSlot(state, slot)) pushToast(state, `已卸下: ${EQUIP_NAMES[slot]}`, '#9cf');
    return true;
  }
  return true;
}

function handleDeathKey(state: GameState, e: KeyboardEvent, ctx: ScreenKeyContext): boolean {
  const k = e.key.toLowerCase();
  const ds = state.deathSummary;
  if (!ds) return true;
  if (k === '1') {
    if (ds.hardcore) {
      hardcoreWipe(state);
      ctx.startRun(state, state.theme, state.difficulty);
    } else {
      state.player.gold -= deathGoldPenalty(state.player.gold, 'town', false);
      state.player.potions = { hp: 3, mp: 3 };
      ctx.enterTown(state);
    }
    state.ui.dying = false;
    state.deathSummary = null;
    inf('ui', 'death → town/rerun');
    return true;
  }
  if (k === '2') {
    if (ds.hardcore) {
      state.ui.dying = false;
      state.deathSummary = null;
      setScreen(state, 'title');
    } else {
      state.player.gold -= deathGoldPenalty(state.player.gold, 'revive', false);
      revivePlayer(state);
      state.ui.dying = false;
      state.deathSummary = null;
      setScreen(state, 'dungeon');
    }
    inf('ui', 'death → revive/menu');
    return true;
  }
  if (k === '3' && !ds.hardcore) {
    ctx.startRun(state, state.theme, state.difficulty);
    state.ui.dying = false;
    state.deathSummary = null;
    state.ui.deathUndo = 0;
    inf('ui', 'death → rerun');
    return true;
  }
  if (k === '4' && !ds.hardcore && state.ui.deathUndo > 0) {
    revivePlayer(state);
    state.ui.dying = false;
    state.deathSummary = null;
    state.ui.deathUndo = 0;
    setScreen(state, 'dungeon');
    pushToast(state, '已撤销死亡 (免费)', '#8f8');
    inf('ui', 'death → undo (free revive)');
    return true;
  }
  return true;
}

function handleVictoryKey(state: GameState, e: KeyboardEvent, ctx: ScreenKeyContext): boolean {
  const k = e.key.toLowerCase();
  if (k === '1') {
    ctx.startRun(state, state.run.theme, state.difficulty);
    inf('ui', 'victory → 再来一局');
    return true;
  }
  if (k === '2') {
    ctx.enterTown(state);
    inf('ui', 'victory → 回城');
    return true;
  }
  return true;
}

function handlePauseKey(state: GameState, e: KeyboardEvent, ctx: ScreenKeyContext): boolean {
  const k = e.key.toLowerCase();
  if (k === '1') { setScreen(state, resumeScreen(state)); inf('gl', 'resumed'); return true; }
  if (k === '2') { state.ui.settingsOpen = !state.ui.settingsOpen; return true; }
  if (k === '3') {
    state.ui.settingsOpen = false;
    void ctx.persistNow().then(() => pushToast(state, '已保存, 返回主菜单', '#9cf'));
    setScreen(state, 'title');
    inf('ui', '返回主菜单 (已保存)');
    return true;
  }
  if (k === '4') {
    state.ui.settingsOpen = false;
    ctx.enterTown(state);
    inf('ui', '进入城镇');
    return true;
  }
  if (state.ui.settingsOpen) {
    if (k === 'r') { resetKeybinds(); pushToast(state, '键位已恢复默认', '#9cf'); return true; }
    if (k === '+' || k === '=') {
      state.volume = Math.min(1, state.volume + 0.05);
      setVolumeClient(state.volume);
      inf('audio', `volume → ${Math.round(state.volume * 100)}%`);
      return true;
    }
    if (k === '-' || k === '_') {
      state.volume = Math.max(0, state.volume - 0.05);
      setVolumeClient(state.volume);
      inf('audio', `volume → ${Math.round(state.volume * 100)}%`);
      return true;
    }
    if (k === 'f') {
      void import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
        getCurrentWindow().isFullscreen().then(fs => getCurrentWindow().setFullscreen(!fs)));
      return true;
    }
  }
  if (k === 'n') {
    if (state.pauseFrom !== 'town') {
      pushToast(state, '战斗中无法调整难度 (回城后在祭坛)', '#ff5555');
      return true;
    }
    requestDifficulty(state, cycleDifficultyGated(state.difficulty, state.cleared));
    inf('game', `难度 → ${DIFFICULTY_MODS[state.difficulty].name}`);
    return true;
  }
  if (k === 'escape') {
    if (state.ui.settingsOpen) state.ui.settingsOpen = false;
    else setScreen(state, resumeScreen(state));
    inf('gl', state.screen === 'pause' ? 'paused' : 'resumed');
    return true;
  }
  return true;
}

function handlePortalKey(state: GameState, e: KeyboardEvent): boolean {
  const k = e.key.toLowerCase();
  if (k === '1') {
    leaveThroughPortal(state);
    setScreen(state, 'victory');
    inf('ui', 'portal → 回城结算 (victory)');
    return true;
  }
  if (k === '2' || k === 'escape') {
    setScreen(state, 'dungeon');
    inf('ui', 'portal → 继续战斗');
    return true;
  }
  return true;
}

function handleTownKey(state: GameState, e: KeyboardEvent, ctx: ScreenKeyContext): boolean {
  const k = e.key.toLowerCase();
  if (state.townPanel) {
    ctx.handleTownPanelKey(state, e, k);
    return true;
  }
  // 修复: Backspace / B 键 → 返回主菜单 (玩家困在城镇的出口)
  if (k === 'backspace' || k === 'b') { setScreen(state, 'title'); return true; }
  if (keyMatch(e, loadKeybinds().interact)) { ctx.interactTown(state); return true; }
  if (k === '1' || k === '2' || k === '3' || k === '4') return true;
  return true;
}

// ============================================================================
// 主入口
// ============================================================================

export function handleScreenKey(state: GameState, e: KeyboardEvent, ctx: ScreenKeyContext): boolean {
  if (handleTutorAdvance(state)) return true;
  if (handleCloseConfirm(e, ctx)) return true;
  if (handleKeybindEdit(state, e)) return true;
  if (handleRuneChoice(state, e)) return true;
  if (handleHardcoreConfirm(state, e)) return true;

  switch (state.screen) {
    case 'title': return handleTitleKey(state, e, ctx);
    case 'characters': return handleCharactersKey(state, e, ctx);
    case 'newgame': return handleNewgameKey(state, e, ctx);
    case 'expedition': return handleExpeditionKey(state, e, ctx);
    case 'equipment': return handleEquipmentKey(state, e);
    case 'death': return handleDeathKey(state, e, ctx);
    case 'victory': return handleVictoryKey(state, e, ctx);
    case 'pause': return handlePauseKey(state, e, ctx);
    case 'portal': return handlePortalKey(state, e);
    case 'town': return handleTownKey(state, e, ctx);
    case 'dungeon':
      if (e.key === 'Escape') {
        state.pauseFrom = 'dungeon';
        setScreen(state, 'pause');
        inf('gl', 'paused');
        return true;
      }
      return false;
  }
  return false;
}

export function triggerCloseConfirm(): void {
  closeConfirmOpen = true;
  inf('ui', '关闭确认开启');
}
