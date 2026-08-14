// Voidbound 入口: 程序化分块世界 + 摄像机跟随 + 墙碰撞 + 火球 + 近战 + HUD + 日志 + 鼠标技能 + SFX

import { createContext } from './render/gl/context';
import { createQuadBuffer } from './render/gl/resources';
import { VERT, FRAG } from './render/shaders';
import { loadAtlas } from './ipc/atlas';
import { invoke as tauriInvoke } from '@tauri-apps/api/core';
const invoke = tauriInvoke;
import { buildRenderResources } from './render/resources';
import { attachKeyboard } from './input/keyboard';
import { attachMouse, type MouseHandle } from './input/mouse';
import { updatePlayer, castFireball, usePotion, startDodge } from './game/player';
import { updateCamera, pickPlayerSprite, resetPlayer, setScreen, resumeScreen, runPhase, emptyRun, THEMES, type Screen, type Theme, WORLD_W, WORLD_H } from './game/state';
import { createEmptyCombatState } from './game/state/combat';
import { createEmptyUiState } from './game/state/ui';
import { createEmptyFxState } from './game/state/fx';
import { createEmptyEquipState } from './game/state/equip';
import { portalActive, nearPortal, leaveThroughPortal } from './game/portal';
import { getActiveWalls, getActiveDecor, resetWorldForMode, EXTRACT_SPAWN, type Wall } from './game/world';
import { drawSprite, setViewportUniform, setBlendTracked } from './render/draw';
import { buildRenderResources, resolveSprite, spriteUv } from './render/resources';
import { drawHud, drawHudOverlay, drawIcon, setMouseReticle, hudDungeonHit, setHudHover } from './render/hud';
import { makeCooldown } from './game/cooldown';
import { tryCastSlot, getSwings, assignSkillPoint, chooseRune, rejectRune, skillRune, skillLevel, getSkill, SKILL_SLOTS, SKILL_SPECS, slotDisplay, pickRuneOptions, type SkillSlot } from './game/skill';
import { RUNE_DEFS, type RuneId } from './game/rune';
import { ELEMENT_DEFS, EXTRACT_ELEMENT_ORDER, randomSubElement } from './game/element';
import { rollBossSkill3 } from './game/mech';
import { spawnMonster, spawnRunPool, resolveFireballHits, resolveMeleeHits, MONSTER_DEFS, THEME_BOSS, THEME_MONSTER_POOL, AURA_DEFS } from './game/monster';
import { validMapMode, MAP_MODE_NAMES, MAP_MODE_DESC, MAP_MODES, type MapMode } from './game/mapmode';
import { saveGame, loadGame, saveAccount, loadAccount, listCharacters, deleteCharacter, type CharacterSummary } from './ipc/save';
import { pickupLoot, getLoot, getOwned, getEquippedValues, allocEquipmentId, recomputeCombat, equipItem, unequipSlot, itemPowerDelta, cullLoot, collectAllLoot, clearGroundLoot, RARITY_COLORS, describeAffix, getItemSellPrice, getItemBuyPrice, EQUIP_SLOTS, EQUIP_NAMES, emptyMaterials, addMaterial, spendMaterial, materialCount, MATERIAL_NAMES, MATERIAL_IDS, REROLL_IRON_COST, RUNE_FORGE_COST, IRON_SHARD_PRICE, rerollCostOption, SET_BONUSES, type EquipType, type Equipment, type MaterialId } from './game/equipment';
import { TOWN_DEFS, townNpcs, nearestNpc, genMerchantStock, genMysteryStock, buyItem, sellItem, rerollOwned, buyPotion, POTION_PRICES, warehouseStore, warehouseTake, WAREHOUSE_CAP, unlockedTown, unlockedTowns, TOWN_IDS, runeForgePay, type TownPanel, type TownId, type MerchantStock, type MysteryStock, type NpcKind } from './game/town';
import { RUNE_FORGE_COST } from './game/equipment';
import { playBgmClient, playSfxClient, setVolumeClient } from './ipc/sfx';
import { baseCombat } from './game/combat';
import { DIFFICULTIES, DIFFICULTY_MODS, DIFFICULTY_GATES, cycleDifficulty, cycleDifficultyGated, type Difficulty } from './game/difficulty';
import { moveGridSel, flipPage, pageStart, pageOf, pageCount, cellIndex, slotRects, inRect, EQ_LAYOUT } from './game/uigrid';
import { rrect, hexToRgb01 } from './ui/primitives';
import { drawKeycap, drawGearIcon, drawSceneIcon } from './ui/keycap';
import { initTitleDust, drawTitleBackground, drawTitleWordmark, drawInfoBand, relTime, keyHintMain, keyHintSkills, startNewgameFromTitle, openCharactersList, settingsKeyRects, handleSettingsClick, drawSettingsPanel, drawUiPortrait, uiCursor, drawTitleScreen, type TitleCtx } from './screens/title';
import { drawCloseConfirm as drawCloseConfirmScreen } from './screens/close';
import { drawTeleportTransition as drawTeleportTransitionScreen } from './screens/teleport';
import { NG_LAYOUT, NG_ROW_CLASS, NG_ROW_DIFF, NG_ROW_MODE, NG_LAUNCH_MS, THEME_COLORS, THEME_NAMES, drawNewgame as drawNewgameScreen, saveLastNg, loadLastNg, createCharacterNow, startCreateNewgame, startFromNewgame, doLaunchRun, type NewgameCtx } from './screens/newgame';
import { enterTown, interactTown, handleTownPanelKey, drawTownFrame, drawTownPanel, type TownCtx } from './screens/town';
import { drawCharacters, type CharactersCtx } from './screens/characters';
import { drawCollectionPanel, type CollectionCtx } from './screens/collection';
import { startRun, ensureDungeonRun, triggerBossIntro } from './app/run';
import {
  formatTime,
  confirmCloseSave,
  confirmCloseCancel,
  isCloseConfirmSaving,
  setLifecycleState,
  installAutoPauseListeners,
  installCloseConfirmListeners,
} from './app/lifecycle';
import { fadeBgm } from './app/audio';
import { drawFrame, type FrameCtx } from './app/frame';
import { mouseAimDirection } from './app/input';
import { buildSavePayload as buildSavePayloadApp, restoreMaterialsApp, restorePassivesApp, persistNowApp, continueLastSave, resumeFromSave, enterTargetCharacter, type SaveCtx } from './app/save';
import { handleUiClick as handleUiClickDispatch, buildUiCtx, type UiCtx } from './app/uiDispatch';
import { handleHudClick } from './app/actions/hud';
import { notifyCastFail, requestDifficulty as requestDifficultyApp, hardcoreWipe as hardcoreWipeApp, revivePlayer as revivePlayerApp } from './app/actions/player';
import {
  handleScreenKey,
  getTitleFocus, isCloseConfirmOpen, setCloseConfirmOpen,
  getNgLaunchT, setNgLaunchT, isNgNaming, setNgNaming,
  syncTitleFocus, moveTitleFocus, titleAct,
  triggerCloseConfirm,
  type ScreenKeyContext,
} from './app/screenMachine';
import { pushToast, getToasts, updateToasts } from './game/toast';
import { deathSummary, deathGoldPenalty, type DeathSummary } from './game/deathSettle';
import { moveSelection, ngResolve, ngDefault, themeUnlocked, type NewgameSel } from './game/newgame';
import { bindClass, CLASS_DEFS, CLASS_IDS, CLASS_SPRITES, type ClassId } from './game/class';
import { loadKeybinds, saveKeybinds, resetKeybinds, keyMatch, skillSlotByKey, normKey, type Keybinds } from './game/keybind';
// TS-008: 版本号来自 package.json (esbuild JSON loader 内联, 树摇后仅留 version)
import { version as GAME_VERSION } from '../package.json';
import { DAMAGE_TYPE_COLORS } from './game/combat';
import { PASSIVE_DEFS, PASSIVE_IDS, passiveLevel, assignPassivePoint, type PassiveId } from './game/passive';
import { getSkillCooldowns } from './game/cooldown';
import { registerAllBuiltinSystems } from './game/system/builtins';
import { updateAll } from './game/system/registry';
import { inf, wrn, dbg, err, setLogLevel, type LogLevel } from './util/log';

const VW = 1280;
const VH = 720;

// 全局错误捕获: JS 异常同步到 console + log, 并转发到 Rust stdout (js_log 调试通道)
window.addEventListener('error', (e) => {
  const msg = `JS error: ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`;
  err('loop', msg);
  invoke('js_log', { msg }).catch(() => {});
});
window.addEventListener('unhandledrejection', (e) => {
  const msg = `unhandled rejection: ${String(e.reason)}`;
  err('loop', msg);
  invoke('js_log', { msg }).catch(() => {});
});

const canvas = document.getElementById('gl');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('canvas#gl 缺失');
canvas.width = VW;
canvas.height = VH;

const hudCanvas = document.createElement('canvas');
hudCanvas.width = VW;
hudCanvas.height = VH;
hudCanvas.style.position = 'absolute';
hudCanvas.style.left = '0';
hudCanvas.style.top = '0';
hudCanvas.style.pointerEvents = 'none';
document.body.appendChild(hudCanvas);
const hudCtx = hudCanvas.getContext('2d');
if (!hudCtx) throw new Error('Canvas2D 不可用 (HUD overlay)');

// 启动画面: 图集加载前先显示 VOIDBOUND + 进度 (GAME_FLOW §1)
hudCtx.fillStyle = '#0b0b12';
hudCtx.fillRect(0, 0, VW, VH);
hudCtx.textAlign = 'center';
hudCtx.textBaseline = 'middle';
hudCtx.fillStyle = '#c9aaff';
hudCtx.font = 'bold 64px monospace';
hudCtx.fillText('VOIDBOUND', VW / 2, VH / 2 - 40);
hudCtx.fillStyle = '#888';
hudCtx.font = '16px monospace';
hudCtx.fillText('加载图集中…', VW / 2, VH / 2 + 20);
hudCtx.textAlign = 'left';
  invoke('js_log', { msg: '[boot] splash drawn' }).catch(() => {});


inf('gl', `WebGL2 init ${canvas.width}x${canvas.height}`);
const gl = createContext(canvas);
// WebGL 上下文丢失探针 (通过 js_log 上报, 排查渲染冻结)
canvas.addEventListener('webglcontextlost', (ev) => {
  ev.preventDefault();
  invoke('js_log', { msg: '[gl] CONTEXT LOST' }).catch(() => {});
});
canvas.addEventListener('webglcontextrestored', () => {
  invoke('js_log', { msg: '[gl] CONTEXT RESTORED' }).catch(() => {});
});
const quad = createQuadBuffer(gl, VERT, FRAG);
setViewportUniform(gl, quad, VW, VH);
inf('gl', 'shader program + quad VAO ready');

// B-V3 粒子 instancing: 环境/死亡/挥砍粒子合并单 draw call (5k 基准护栏, 容量 2048)
import { InstancedBatch } from './render/instanced';
const particleBatch = new InstancedBatch(gl, 2048);
inf('gl', `instanced particle batch ready (cap 2048)`);

inf('atlas', 'loading 6 atlases...');
  invoke('js_log', { msg: '[boot] loading atlases' }).catch(() => {});

const [characters, particles, ui, icons, world, monsters, npcs] = await Promise.all([
  loadAtlas('characters'),
  loadAtlas('particles'),
  loadAtlas('ui'),
  loadAtlas('icons'),
  loadAtlas('world'),
  loadAtlas('monsters'),
  loadAtlas('npcs'),
]);
inf('atlas', `loaded: ${[characters, particles, ui, icons, world, monsters, npcs].map(a => `${a.name}(${a.width}x${a.height},${a.sprites.length})`).join(' ')}`);
const res = await buildRenderResources(gl, [characters, particles, ui, icons, world, monsters, npcs]);
inf('atlas', 'PNG decoded + textures uploaded');
  invoke('js_log', { msg: '[boot] atlases done' }).catch(() => {});
  // 诊断: 启动即打印 world 图集全部 sprite 名 (核对"加载的瓦片"清单, 防缺图集)
  const worldSprites = [...(res.atlases.get('world')?.sprites.keys() ?? [])];
  invoke('js_log', { msg: `[diag:atlas] world sprites(${worldSprites.length}): ${worldSprites.join(',')}` }).catch(() => {});


const keys = attachKeyboard(window);
  invoke('js_log', { msg: '[boot] keyboard attached' }).catch(() => {});
const mouse = attachMouse(canvas) as MouseHandle & { sync: () => void; reset: () => void };
inf('input', 'mouse attached (LMB/RMB/MMB + position)');

const fireballCd = makeCooldown();
const state = {
  player: {
    pos: { x: WORLD_W / 2 - 32, y: WORLD_H / 2 - 32 },
    size: { w: 64, h: 64 },
    speed: 200,
    hp: 100,
    mp: 100,
    level: 1,
    skillPoints: 0,
    gold: 0,
    exp: 0,
    potions: { hp: 3, mp: 3 },
    potionCd: 0,
    dodgeT: 0,
    dodgeCd: 0,
    facing: { x: 0, y: 0 },
    idleT: 0,
    flipDir: 'N' as 'L' | 'R' | 'N',
    combat: baseCombat(),
    equipped: {},
    classId: 'barbarian',
    passives: {},
    hpMax: 100,
    mpMax: 100,
    mpRegen: 0,
    speedMult: 1,
    curseT: 0,
  },
  viewport: { w: VW, h: VH },
  world: {
    w: WORLD_W, h: WORLD_H,
    walls: [] as Wall[],
    decor: [],
  },
  camera: { x: 0, y: 0 },
  fireballSize: 32,
  paused: false,
  deathSummary: null as DeathSummary | null,
  reviveInvuln: 0,
  theme: 'forest' as 'forest' | 'desert' | 'ruin' | 'void',
  mode: 'dungeon' as 'dungeon' | 'town',
  townReturn: null as { x: number; y: number } | null,
  townPanel: null as TownPanel | null,
  townStock: null as MerchantStock[] | null,
  mysteryStock: null as MysteryStock[] | null,
  /** 当前城镇 (C-301) */
  townId: 'greenwing' as TownId,
  /** 传送过场 (C-302): 目标镇 + 倒计时秒 */
  teleportTo: null as TownId | null,
  teleportT: 0,
  /** 训练师被动面板选中索引 (M5 非目标收尾) */
  trainerSel: 0,
  /** 仓库操作闪光 (C-503 动画): 存取成功后 0.3s 高亮面板 */
  whFlash: 0,
  screen: 'title' as Screen,
  pauseFrom: 'dungeon' as Screen,
  ngSel: ngDefault(),
  /** 新局屏来源: title=标题新游戏(可选职业) / town=城镇出发(职业锁定当前角色) */
  ngFrom: 'title' as 'title' | 'town',
  difficulty: 'normal' as Difficulty,
  run: emptyRun('forest'),
  volume: 0.8,
  cleared: [],
  legacy: [] as Array<{ slot: SkillSlot; rune: RuneId }>,
  confirmHardcore: false,
  pendingDifficulty: null,
  castFailFlash: null,
  resources: res,
  // M5 W2 多角色 (C-201~203): 当前角色 / 角色列表 / 选中索引 / 新建流程
  currentChar: 'char_0',
  charList: [] as CharacterSummary[],
  charSel: 0,
  charConfirmDel: false,
  /** 文本输入: 新建角色命名 (newgame 屏内联) */
  charNameInput: '',
  /** v4 首局引导: 每次运行首次进 dungeon 激活; step 0..2 显示气泡, >=3 关闭 */
  tutorShown: false,
  tutorStep: -1,
  tutorT: 0,
  // C-503 仓库: 账号层共享 (跨角色)
  warehouse: [] as Equipment[],
  // v3 鼠标化: 城镇 NPC 走向目标
  townWalk: null as { kind: NpcKind; x: number; y: number } | null,
  // PR #1 T4-a: 战斗子状态 (连击/震屏/停顿/击杀者/Boss 入场/升级闪光/积分/累计击杀)
  combat: createEmptyCombatState(),
  // PR #1 T4-b: UI 子状态 (设置面板/收集覆盖层/键位编辑/死亡撤销/探索度/标题消息)
  ui: createEmptyUiState(),
  // PR #2 T4-c: FX 子对象 (火球/怪物/VFX/毒池/伤害数字/死亡粒子/挥击/掉落/背包/Toast/敌弹/环境粒子)
  fx: createEmptyFxState(),
  // PR #2 T4-d: 装备/符文子对象 (选中索引/分页/符文三选一/拒绝变异的槽/材料)
  equip: createEmptyEquipState(),
};

// US-024-c: drawTitle 已搬到 screens/title.ts, 启动时装配一次 TitleCtx, 主循环每帧复用
const titleCtx: TitleCtx = {
  state, hudCtx, hudCanvas, canvas, gl, quad, res, mouse,
  drawUiPortrait: (classId, x, y, w, h) => drawUiPortrait(gl, quad, res, classId, x, y, w, h),
  syncTitleFocus: (hasSave) => syncTitleFocus(hasSave),
  getTitleFocus: () => getTitleFocus(),
  uiCursor: (c, m, rects) => uiCursor(c, m, rects),
};

// US-026 / PR-007: 城镇/角色/收集 屏 ctx — 启动时一次性装配, 主循环每帧复用
const collectionCtx: CollectionCtx = {
  state, hudCtx, hudCanvas, mouse, formatTime,
};
const charactersCtx: CharactersCtx = {
  state, hudCtx, hudCanvas, mouse,
  drawCollectionPanel: (ctx) => drawCollectionPanel(ctx),
  uiCursor: (rects) => uiCursor(canvas, mouse, rects),
};
const townCtx: TownCtx = {
  state, hudCtx, hudCanvas, gl, quad, res, mouse, canvas,
  requestDifficulty: (s, d) => requestDifficultyApp(s, d),
};

// PR-008: 帧绘制 ctx — 启动时一次性装配, drawFrame 调用处复用
const frameCtx: FrameCtx = {
  state, mouse, canvas, hudCanvas, hudCtx, gl, quad, res, particleBatch,
  invoke: (cmd, args) => invoke(cmd, args as Record<string, unknown>),
  setHudHover, hudDungeonHit, isCloseConfirmOpen,
  confirmCloseSave, confirmCloseCancel,
  handleHudClick, tryCastSlot, notifyCastFail,
  handleUiClick: (ctx) => handleUiClickDispatch(buildUiCtx(ctx.state, ctx.mx, ctx.my, uiCallbacks)),
  setMouseReticle, drawHud, drawHudOverlay, drawSettingsPanel,
  mouseAimDirection, formatTime, DIFFICULTY_MODS,
};

/** 新局/远征/新建选择屏: 委托给 screens/newgame.ts (US-025) */
function drawNewgameInline(): void {
  const rects: Array<[number, number, number, number]> = [];
  const ngCtx: NewgameCtx = {
    state, hudCtx, hudCanvas, mouse,
    drawUiPortrait: (classId, x, y, w, h, noClear) => { drawUiPortrait(gl, quad, res, classId, x, y, w, h, noClear); },
    isNgNaming, getNgLaunchT, loadLastNg: () => loadLastNg(),
    uiCursor: (rects) => { uiCursor(canvas, mouse, rects); },
  };
  drawNewgameScreen(ngCtx, rects);
}

// 初始化跑局状态 (OPT-012): 怪物在进入地牢时由 startRun/ensureDungeonRun 生成
  inf('world', `world size ${WORLD_W}x${WORLD_H} (16x viewport), chunked procedural, theme=${state.theme}`);
fadeBgm(`bgm_${state.theme}`, state.volume);
  invoke('js_log', { msg: '[boot] bgm set' }).catch(() => {});

// 启动时加载账号层 (C-201/503): 解锁进度/传承/仓库/最近角色
loadAccount().then(a => {
  state.cleared = a.cleared ?? [];
  state.run.best = {};
  for (const b of a.best ?? []) state.run.best[b.difficulty] = b.ms;
  state.legacy = a.legacy ?? [];
  if (a.last_char) state.currentChar = a.last_char;
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
  inf('save', `account loaded at boot: cleared=${state.cleared.length} chars=${(a.characters ?? []).length} wh=${state.warehouse.length} last=${state.currentChar}`);
}).catch(e => wrn('save', `boot account load failed: ${e}`));

// === US-026 screenKeyCtx: 屏路由集中器的依赖注入 (19 个 main.ts 副作用函数) ===
// 函数声明被 JS hoisting, 此处引用安全
const saveCtx: SaveCtx = { ensureDungeonRun: (s) => ensureDungeonRun(s), startRun: (s, theme, difficulty, mode) => startRun(s, theme, difficulty, mode) };
// PR-007: 城镇相关 5 个函数原搬 main.ts, 现委托给 screens/town.ts; 通过 townCtx 注入
const enterTownWrap = (state: GameState, townId?: string): void => enterTown(townCtx, townId as TownId);
const interactTownWrap = (state: GameState): void => interactTown(townCtx);
const handleTownPanelKeyWrap = (state: GameState, e: KeyboardEvent, k: string): void => handleTownPanelKey(townCtx, e, k);
// uiCallbacks: 鼠标 UI 点击分发回调 (US-031 内联, handleUiClick 包装层已删除)
const uiCallbacks: Omit<UiCtx, 'state' | 'w' | 'h' | 'mx' | 'my'> = {
  confirmCloseSave, confirmCloseCancel,
  continueLastSave: () => continueLastSave(state),
  enterTargetCharacter: (target) => enterTargetCharacter(state, target, saveCtx),
  titleAct: (idx) => titleAct(idx, state, screenKeyCtx),
  handleSettingsClick: (mx: number, my: number) => handleSettingsClick(state, hudCanvas, mx, my),
  handleTownPanelKey: (e, k) => handleTownPanelKeyWrap(state, e, k),
  startFromNewgame: () => startFromNewgame(state, (s) => enterTownWrap(s)),
  startCreateNewgame: () => startCreateNewgame(state),
  enterTown: () => enterTownWrap(state),
  startRun: () => startRun(state, state.theme, state.difficulty, state.run.mode),
  hardcoreWipe: (s) => hardcoreWipeApp(s),
  revivePlayer: (s) => revivePlayerApp(s),
  leaveThroughPortal, setScreen, resumeScreen,
  deathGoldPenalty, loadLastNg: () => loadLastNg(),
};
const screenKeyCtx: ScreenKeyContext = {
  confirmCloseSave,
  confirmCloseCancel,
  continueLastSave: () => continueLastSave(state),
  openCharactersList: () => openCharactersList(state),
  saveLastNg: () => saveLastNg(state),
  loadLastNg: () => loadLastNg(),
  createCharacterNow: () => createCharacterNow(state),
  startNewgameFromTitle: () => startNewgameFromTitle(state),
  startFromNewgame: () => startFromNewgame(state),
  doLaunchRun: () => doLaunchRun(state, startRun),
  enterTargetCharacter: (target) => enterTargetCharacter(state, target, saveCtx),
  persistNow: () => persistNowApp(state),
  fadeBgm,
  startRun: (s, theme, difficulty, mode) => startRun(s, theme, difficulty, mode),
  ensureDungeonRun: (s) => ensureDungeonRun(s),
  enterTown: (s, townId) => enterTownWrap(s, townId),
  triggerBossIntro,
  formatTime,
  interactTown: (s) => interactTownWrap(s),
  handleTownPanelKey: (s, e, k) => handleTownPanelKeyWrap(s, e, k),
  revivePlayer: (s) => revivePlayerApp(s),
  hardcoreWipe: (s) => hardcoreWipeApp(s),
};

// v4: 标题"继续游戏"进度摘要用 — 预加载角色列表 (失败静默, 无角色时继续按钮隐藏)
listCharacters().then(list => {
  state.charList = list;
  state.charSel = Math.max(0, list.findIndex(c => c.id === state.currentChar));
}).catch(() => { /* 无存档时列表为空属正常 */ });


window.addEventListener('keydown', (e) => {
// US-026 屏路由集中器: 9 段 if-else + 4 个 modal 拦截 → 单点 dispatch
// 返回 true 表示 action 已消费, 调用方应 return; false 表示透传到 game actions
if (handleScreenKey(state, e, screenKeyCtx)) return;

// 保留 game-world actions (potions / dodge / skills / save/load / log level) —
// 屏路由之外的低层输入, screenMachine.ts 不涉及
// Ctrl+1..6: 分配技能点 (LMB/RMB/Q/W/E/R)
if (e.ctrlKey) {
  const idx = '123456'.indexOf(e.key);
  if (idx >= 0) {
    const errMsg = assignSkillPoint(state, SKILL_SLOTS[idx]);
    if (errMsg) wrn('skill', `${SKILL_SLOTS[idx]} assign failed: ${errMsg}`);
    return;
  }
}
// 药水 (F-CBT-002): 键位可改 (默认 1 = HP, 2 = MP)
const kb = loadKeybinds();
if (keyMatch(e, kb.potionHp)) {
  if (usePotion(state, 'hp')) playSfxClient('hit');
  else wrn('skill', `potion HP failed (cd or empty)`);
  return;
}
if (keyMatch(e, kb.potionMp)) {
  if (usePotion(state, 'mp')) playSfxClient('hit');
  else wrn('skill', `potion MP failed (cd or empty)`);
  return;
}
// 翻滚 (F-CBT-001): 无敌位移 (键位可改)
if (keyMatch(e, kb.dodge, { repeat: false })) {
  if (startDodge(state)) {
    dbg('player', 'dodge roll (i-frame 0.2s)');
  }
  return;
}
// 统一交互键 (A 收敛): 地牢门旁按交互键 → 面板 [回城/继续] (原 V 键退役)
if (keyMatch(e, kb.interact) && state.screen === 'dungeon' && portalActive(state) && nearPortal(state)) {
  setScreen(state, 'portal');
  inf('ui', 'portal 交互 → [回城/继续]');
  return;
}
// 技能键 (键位可改, 默认 Q=火球 F=多重火球(原W槽) E=回血 R=大招)
const skillSlot = skillSlotByKey(e, kb);
if (skillSlot) {
  const nowSec = performance.now() / 1000;
  const aimDir = mouseAimDirection(state, mouse.state());
  if (!tryCastSlot(skillSlot, state, aimDir, nowSec)) {
    notifyCastFail(state, skillSlot);
    return;
  }
  if (skillSlot === 'Q') invoke('play_sfx', { name: 'fireball' }).catch(() => {});
}
if (e.key === 'l' || e.key === 'L') {
  const order: LogLevel[] = ['DBG', 'INF', 'WRN'];
  const cur = (window as unknown as { __lvl?: LogLevel }).__lvl ?? 'INF';
  const next = order[(order.indexOf(cur) + 1) % order.length];
  (window as unknown as { __lvl?: LogLevel }).__lvl = next;
  setLogLevel(next);
  inf('gl', `log level → ${next}`);
}
if (e.key === 'p' || e.key === 'P') {
  persistNowApp(state);
}
if (e.key === 'o' || e.key === 'O') {
  // O=读档 (R 已让给大招)
  if (!(window as unknown as { __lvl?: LogLevel }).__lvl) {
    loadGame(state.currentChar).then(d => {
      state.player.pos.x = d.player_x;
      state.player.pos.y = d.player_y;
      state.player.hp = d.player_hp;
      state.player.mp = d.player_mp;
      state.player.facing.x = d.facing_x;
      state.player.facing.y = d.facing_y;
      state.combat.score = d.score;
      state.player.gold = d.gold ?? 0;
      state.player.level = d.level ?? 1;
      // 装备层还原 (重建 id, 统一走拥有列表)
      const owned = getOwned(state);
      owned.length = 0;
      for (const it of d.owned) {
        owned.push({
          id: allocEquipmentId(),
          name: it.name,
          rarity: it.rarity,
          type: it.eq_type,
          pos: { x: 0, y: 0 },
          size: { w: 24, h: 24 },
          affixes: it.affixes.map(a => ({ stat: a.stat, value: a.value, element: a.element })),
          pickedUp: true,
          setName: it.setName,
        });
      }
      // 穿戴层还原 (OPT-014): 按槽重建
      state.player.equipped = {};
      for (const e of d.equipped ?? []) {
        state.player.equipped[e.slot] = {
          id: allocEquipmentId(),
          name: e.item.name,
          rarity: e.item.rarity,
          type: e.slot,
          pos: { x: 0, y: 0 },
          size: { w: 24, h: 24 },
          affixes: e.item.affixes.map(a => ({ stat: a.stat, value: a.value, element: a.element })),
          pickedUp: true,
          setName: e.item.setName,
        };
      }
      recomputeCombat(state);
      // 永久层: 符文绑定 (按槽) + 主题
      for (const rr of d.runes ?? []) {
        const sk = SKILL_SLOTS.includes(rr.slot) ? getSkill(rr.slot) : null;
        if (sk) sk.rune = rr.rune;
      }
      if (d.theme && d.theme !== state.theme) {
        state.theme = d.theme;
        fadeBgm(`bgm_${state.theme}`, state.volume);
  invoke('js_log', { msg: '[boot] bgm set' }).catch(() => {});

      }
      if (DIFFICULTIES.includes(d.difficulty)) state.difficulty = d.difficulty;
      // 技能进度还原 (OPT-003): 等级按槽回填 registry + 技能点/经验
      for (const sl of d.skill_levels ?? []) {
        const sk = getSkill(sl.slot);
        if (sk) sk.level = sl.level;
      }
      state.player.skillPoints = d.skill_points ?? 0;
      state.player.exp = d.exp ?? 0;
      bindClass(state, (d.class as ClassId) ?? 'barbarian');  // M5 C-104: 读档还原职业
      if (d.town && TOWN_DEFS[d.town as TownId]) state.townId = d.town as TownId;  // M5 W3 C-302
      restoreMaterialsApp(state, d);  // M5 W4 C-401
      restorePassivesApp(state, d);  // v9 被动技能树
      inf('save', `loaded: pos=(${d.player_x.toFixed(0)},${d.player_y.toFixed(0)}) hp=${d.player_hp.toFixed(0)} owned=${owned.length} theme=${state.theme}`);
      resumeFromSave(state, d);  // 读档统一回城镇 (GAME_FLOW §3: 城镇 → 传送门出发)
      return loadAccount();  // OPT-029: 账号层 (cleared/best) 独立文件
    }).then(a => {
      state.cleared = a.cleared ?? [];
      state.run.best = {};
      for (const b of a.best ?? []) state.run.best[b.difficulty] = b.ms;
      state.legacy = a.legacy ?? [];
      state.warehouse = (a.warehouse ?? []).map(it => ({
        id: allocEquipmentId(), name: it.name, rarity: it.rarity, type: it.eq_type,
        pos: { x: 0, y: 0 }, size: { w: 24, h: 24 },
        affixes: it.affixes.map(a2 => ({ stat: a2.stat, value: a2.value, element: a2.element })),
        pickedUp: true, setName: it.setName,
      }));
      inf('save', `account loaded: cleared=${state.cleared.length} legacy=${state.legacy.length} wh=${state.warehouse.length}`);
    }).catch(e => wrn('save', `load failed: ${e}`));
  }
}
// [OPT-015] T 键主题循环已移除 (调试功能不再暴露给玩家)
});

/** 鼠标位置 → 世界坐标方向 (Diablo 风格: 技能瞄准鼠标) — 已搬到 app/input.ts */
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w;
  canvas.height = h;
  hudCanvas.width = w;
  hudCanvas.height = h;
  state.viewport.w = w;
  state.viewport.h = h;
  gl.viewport(0, 0, w, h);
  setViewportUniform(gl, quad, w, h); // V0: shader clip 用实际视口
});

gl.viewport(0, 0, VW, VH);
gl.clearColor(0.1, 0.1, 0.12, 1);

// 滚轮翻页 (C-502): 装备面板每页 20 格
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (state.screen !== 'equipment') return;
  const total = getOwned(state).length;
  state.equip.sel = pageStart(flipPage(pageOf(state.equip.sel), e.deltaY > 0 ? 1 : -1, total), total);
});

// 失焦自动暂停 (OPT-001): 委托给 app/lifecycle.ts installAutoPauseListeners
// 关窗确认 (US-026): 委托给 app/lifecycle.ts installCloseConfirmListeners (含 confirmCloseSave/Cancel)
// PR-008: 这些函数原在 main.ts 内 (原 line 558-597), 已搬到 app/lifecycle.ts

// PR-008: 把 state 注入到 lifecycle 模块 (confirmCloseSave 等需要 state.screen + persistNowApp)
setLifecycleState(state);
installAutoPauseListeners();
installCloseConfirmListeners();

inf('loop', 'main loop start');
// A.3: 安装战斗 FX 订阅者 (跨域渲染/日志副作用走事件)
import { installCombatFxService } from './application/combatFxService';
installCombatFxService();

// T3d: 注册内置游戏系统 (攻击/怪物/环境/FX), 替代原 loopImpl 内散点 update* 调用
const unregisterBuiltinSystems = registerAllBuiltinSystems();

let last = performance.now();
let frameCount = 0;
let lastFpsT = performance.now();
let loopStartedLogged = false;
let loopCrashCooldown = 0;
let titleListAt = 0;  // title 屏角色列表节流刷新 (最近游玩 mtime 变化)

/** 非战斗屏 (title/newgame/characters) 鼠标点击: 完整边沿生命周期 (修复: 原分支无 sync, wasClicked 恒 false) */
function handleScreenClick(): void {
  mouse.sync();
  if (isCloseConfirmOpen()) {
    // 关窗确认优先 (与 drawFrame 同规则): Y 保存退出 / N 取消
    const cp = mouse.state().pos;
    const yH = inRect(cp.x, cp.y, state.viewport.w / 2 - 140, state.viewport.h / 2 + 40, 120, 40);
    const nH = inRect(cp.x, cp.y, state.viewport.w / 2 + 20, state.viewport.h / 2 + 40, 120, 40);
    if (mouse.wasClicked('LMB')) {
      if (yH) confirmCloseSave();
      else if (nH) confirmCloseCancel();
    }
    canvas.style.cursor = (yH || nH) ? 'pointer' : 'default';
  } else if (mouse.wasClicked('LMB')) {
    handleUiClickDispatch(buildUiCtx(state, mouse.state().pos.x, mouse.state().pos.y, uiCallbacks));
  }
  mouse.reset();
}
function loop(now: number) {
  // 全屏通用: 设置面板音量滑条拖动 (任何屏打开设置面板都能拖, 包括 title/newgame/characters)
  // 几何与 drawSettingsPanel 一致: sliderY = h/2 - 130 + 106 = h/2 - 24 (修复: 原 loopImpl 内只走 dungeon 分支, title/pause 打不开滑条)
  if (state.ui.settingsOpen && mouse.state().buttons.LMB) {
    const p = mouse.state().pos;
    const sx = state.viewport.w / 2 - 120, sy = state.viewport.h / 2 - 24, sw = 240, sh = 10;
    if (p.y >= sy - 14 && p.y <= sy + sh + 14 && p.x >= sx - 10 && p.x <= sx + sw + 10) {
      state.volume = Math.min(1, Math.max(0, (p.x - sx) / sw));
      setVolumeClient(state.volume);
    }
  }
  // 心跳 (每帧可被 js_log 确认): 首帧 + 崩溃转发, 防止 rAF 内异常静默冻结
  if (!loopStartedLogged) {
    loopStartedLogged = true;
    invoke('js_log', { msg: '[boot] rAF loop started' }).catch(() => {});
  }
  try {
    // 关窗确认面板优先: 打开时跳过所有屏绘制 + 屏内 mouse click, 避免 hover 视觉穿透 (NPC/玩家/菜单 hover 在确认对话框下仍显示)
    if (isCloseConfirmOpen()) {
      mouse.sync();
      const cp = mouse.state().pos;
      const yH = inRect(cp.x, cp.y, state.viewport.w / 2 - 140, state.viewport.h / 2 + 40, 120, 40);
      const nH = inRect(cp.x, cp.y, state.viewport.w / 2 + 20, state.viewport.h / 2 + 40, 120, 40);
      if (mouse.wasClicked('LMB')) {
        if (yH) confirmCloseSave();
        else if (nH) confirmCloseCancel();
      }
      canvas.style.cursor = (yH || nH) ? 'pointer' : 'default';
      mouse.reset();
      // 清空 hudCanvas + gl canvas 防止 NPC/玩家/图标透过确认对话框 (GL 双缓冲不会自动清除, 需显式 gl.clear)
      hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      // 完全不透明黑色背景 (替代 close.ts 内 alpha 0.7 半透明遮罩, 防止图标/玩家/NPC 透过)
      hudCtx.fillStyle = 'rgba(0,0,0,0.96)';
      hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
      drawCloseConfirmScreen(hudCtx, hudCanvas, state.screen, isCloseConfirmSaving(), mouse);
      requestAnimationFrame(loop);
      return;
    }
    // 设置面板: 打开时跳过所有屏绘制, 屏蔽 hover 透传 (同 closeConfirm 处理方式)
    if (state.ui.settingsOpen) {
      mouse.sync();
      // 清空 hudCanvas + gl canvas, 防止屏 UI (NPC/玩家/菜单/立绘) 透过设置面板
      hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      drawSettingsPanel(state, hudCtx, hudCanvas);  // 内含 0.85 alpha 全屏遮罩 + 面板内容
      // 鼠标处理: 替代 uiDispatch 'title'/'pause' 中的 settingsOpen 处理 (因为屏分支被早 return 跳过)
      // 注: 设置面板非 modal, 面板外点击不关闭 (与 closeConfirm 不同); 只有左上角"返回主菜单"按钮/键位条目/键盘 Esc 关闭
      if (mouse.wasClicked('LMB')) {
        const mx2 = mouse.state().pos.x, my2 = mouse.state().pos.y;
        // 左上角 "返回主菜单(Esc)" 按钮 (20, 20, 200, 40)
        if (inRect(mx2, my2, 20, 20, 200, 40)) {
          state.ui.settingsOpen = false;
        } else {
          handleSettingsClick(state, hudCanvas, mx2, my2);  // 键位条目点击
        }
      }
      // 左上角 "返回主菜单(Esc)" 按钮 (画在设置面板之上)
      {
        const backR: [number, number, number, number] = [20, 20, 200, 40];
        const backHit = inRect(mouse.state().pos.x, mouse.state().pos.y, ...backR);
        hudCtx.fillStyle = backHit ? 'rgba(102,204,255,0.18)' : 'rgba(20,20,28,0.85)';
        hudCtx.fillRect(...backR);
        hudCtx.strokeStyle = backHit ? '#66ccff' : '#3a3a48';
        hudCtx.lineWidth = backHit ? 2 : 1;
        hudCtx.strokeRect(...backR);
        hudCtx.fillStyle = backHit ? '#fff' : '#9cf';
        hudCtx.font = 'bold 14px monospace';
        hudCtx.textAlign = 'center';
        hudCtx.textBaseline = 'middle';
        hudCtx.fillText('返回主菜单(Esc)', 120, 40);
      }
      mouse.reset();
      requestAnimationFrame(loop);
      return;
    }
    if (state.screen === 'title') {
      // 每 5s 最多一次: 刷新最近游玩排序 (玩完回首页时卡片次序最新)
      if (now - titleListAt > 5000) {
        titleListAt = now;
        listCharacters().then(list => {
          state.charList = list;
          state.charSel = Math.max(0, list.findIndex(c => c.id === state.currentChar));
        }).catch(() => { /* 列表刷新失败忽略: 沿用旧列表 */ });
      }
      handleScreenClick();
      drawTitleScreen(titleCtx);
    } else if (state.screen === 'newgame') {
      // 出发过场倒计时: 期间冻结选择交互, 结束后开跑
      if (getNgLaunchT() > 0) {
        setNgLaunchT(getNgLaunchT() - 16.67);
        if (getNgLaunchT() <= 0) doLaunchRun(state, startRun);
      } else {
        handleScreenClick();
      }
      drawNewgameInline();
    } else if (state.screen === 'characters') {
      handleScreenClick();
      drawCharacters(charactersCtx);
    } else {
      loopImpl(now);
    }
  } catch (e) {
    if (now - loopCrashCooldown > 500) {
      loopCrashCooldown = now;
      const msg = `[loop-crash] ${(e as Error)?.message ?? String(e)}\n${(e as Error)?.stack ?? ''}`;
      err('loop', msg.split('\n')[0]);
      invoke('js_log', { msg }).catch(() => {});
    }
  }
  requestAnimationFrame(loop);
}


/** 首帧分段探针 (诊断: 定位第 1 帧卡死点) */
function f1(now: number, tag: string): void {
  if (frameCount === 1) {
    const info = f1InfoLogged ? '' : ` vis=${document.visibilityState} hasFocus=${document.hasFocus()} size=${window.innerWidth}x${window.innerHeight}`;
    f1InfoLogged = true;
    invoke('js_log', { msg: `[f1] ${tag} @+${Math.round(now - lastFpsT)}ms${info}` }).catch(() => {});
  }
}

// rAF 心跳统计: 每 5s 汇报给 Rust (区分: 主线程冻结 vs rAF 节流 vs 60fps 正常)
let hbRaf = 0;
let hbLast = performance.now();
setInterval(() => {
  const now2 = performance.now();
  const dur = now2 - hbLast;
  invoke('js_log', { msg: `[hb] t=${Math.round(now2)} raf=${hbRaf} dur=${Math.round(dur)} vis=${document.visibilityState}` }).catch(() => {});
  hbRaf = 0;
  hbLast = now2;
}, 5000);
function loopImpl(now: number) {

  const dt = Math.min((now - last) / 1000, 0.033);
  last = now;
  const nowSec = now / 1000;
  frameCount++;

  // v4 首局引导: 本次运行首次进入 dungeon 激活 3 气泡; 计时自动推进
  if (state.screen === 'dungeon' && !state.tutorShown) {
    state.tutorShown = true;
    state.tutorStep = 0;
    state.tutorT = 0;
  }
  if (state.screen === 'dungeon' && state.tutorStep >= 0 && state.tutorStep < 3) {
    state.tutorT += dt;
    if (state.tutorT > 4) {
      state.tutorStep++;
      state.tutorT = 0;
    }
  }

  // 设置滑条拖动逻辑已搬到 loop 函数开头 (v3 鼠标化, 跨屏通用)
  if (now - lastFpsT >= 1000) {
    inf('loop', `fps=${frameCount}`);
    frameCount = 0;
    lastFpsT = now;
  }

  // 鼠标边沿 (本帧按下的按键)
  mouse.sync();

  // 暂停/装备面板/结算屏: 跳过游戏逻辑, 只渲染 (遮罩/面板画在 drawFrameToScreen)
  if (state.screen === 'pause' || state.screen === 'equipment' || state.screen === 'death' || state.screen === 'victory') {
    drawFrame(frameCtx);
    mouse.reset();
    return; // 包装器统一 rAF
  }

  // 城镇场景: 只移动+绘制 (战斗全部冻结)
  if (state.mode === 'town') {
    // 修复: 城镇屏鼠标点击分发 (line 723 mouse.sync 已生效; closeConfirm 拦截统一在 main.ts loop 顶部 early return 处理)
    if (mouse.wasClicked('LMB')) {
      handleUiClickDispatch(buildUiCtx(state, mouse.state().pos.x, mouse.state().pos.y, uiCallbacks));
    }
    // C-302 传送过场: 1s 倒计时 → 到达目标镇
    if (state.teleportTo) {
      state.teleportT -= dt;
      drawTeleportTransitionScreen(hudCtx, hudCanvas, state.teleportTo, state.teleportT);
      mouse.reset();
      if (state.teleportT <= 0) {
        const target = state.teleportTo;
        state.teleportTo = null;
        state.teleportT = 0;
        enterTown(townCtx, target);
        pushToast(state, `到达 ${TOWN_DEFS[target].name}`, '#9cf');
        inf('ui', `传送完成 → ${TOWN_DEFS[target].name}`);
      }
      return;
    }
    const kdir = keys.direction();
    // v3 鼠标化: 点击 NPC 自动走向, 到达自动交互; WASD 输入取消走向
    if (state.townWalk && (kdir.x !== 0 || kdir.y !== 0)) state.townWalk = null;
    if (state.townWalk) {
      const t = state.townWalk;
      const pcx = state.player.pos.x + state.player.size.w / 2;
      const pcy = state.player.pos.y + state.player.size.h / 2;
      const dx = t.x - pcx, dy = t.y - pcy;
      const dist = Math.hypot(dx, dy);
      if (dist <= 80) {
        state.townWalk = null;
        interactTown(townCtx);
      } else {
        const spd = state.player.speed * 1.1 * dt;
        state.player.pos.x = Math.max(0, Math.min(state.viewport.w - state.player.size.w, state.player.pos.x + (dx / dist) * spd));
        state.player.pos.y = Math.max(0, Math.min(state.viewport.h - state.player.size.h, state.player.pos.y + (dy / dist) * spd));
        state.player.facing = { x: dx / dist, y: dy / dist };
        state.player.flipDir = dx > 0 ? 'R' : 'L';
      }
    }
    const dir = state.townWalk ? { x: 0, y: 0 } : kdir;
    if (dir.x !== 0 || dir.y !== 0) state.player.facing = dir;
    if (keys.isDown('d')) state.player.flipDir = 'R';
    else if (keys.isDown('a')) state.player.flipDir = 'L';
    else if (!state.townWalk) state.player.flipDir = 'N';
    updatePlayer(state, dir, dt);
    state.player.idleT += dt;
    // 城镇=屏幕坐标: clamp 到视口内
    state.player.pos.x = Math.max(0, Math.min(state.viewport.w - state.player.size.w, state.player.pos.x));
    state.player.pos.y = Math.max(0, Math.min(state.viewport.h - state.player.size.h, state.player.pos.y));
    drawTownFrame(townCtx);
    mouse.reset();
    return; // 包装器统一 rAF
  }

  // V0 命中停顿: 冻结世界模拟 (输入/怪物/弹幕/回血), 仍渲染 — 暴击时 ~0.1s 的打击感
  if (state.combat.hitStop > 0) {
    state.combat.hitStop = Math.max(0, state.combat.hitStop - dt);
    drawFrame(frameCtx);
    mouse.reset();
    return; // 包装器统一 rAF
  }

  const dir = keys.direction();
  // 仅在有方向输入时更新 facing; 松开按键保持最后一次方向 (解决默认朝右问题)
  if (dir.x !== 0 || dir.y !== 0) {
    state.player.facing = dir;
  }
  // 水平朝向: D 优先 (含 D → R), 否则 A → L, 都没有 → N
  if (keys.isDown('d')) state.player.flipDir = 'R';
  else if (keys.isDown('a')) state.player.flipDir = 'L';
  else state.player.flipDir = 'N';
  updatePlayer(state, dir, dt);
  state.player.idleT += dt;
  // C (P2-8): 探索度 — 标记玩家所在 3x3 的 64px 块
  {
    const BX = 64;
    const px = Math.floor((state.player.pos.x + state.player.size.w / 2) / BX);
    const py = Math.floor((state.player.pos.y + state.player.size.h / 2) / BX);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) state.ui.explored.add(`${px + dx},${py + dy}`);
    }
  }
  updateCamera(state);
  state.world.walls = getActiveWalls(state, 2);
  state.world.decor = getActiveDecor(state, 2); // V1 画质: 装饰随相机刷新
  // T3d: 替代原散点 update* 调用 (注册到 game/system/builtins)
  updateAll(state, dt);
  updateToasts(state, dt);
  // CD 递减 (药水/翻滚)
  if (state.player.potionCd > 0) state.player.potionCd -= dt;
  if (state.player.dodgeT > 0) state.player.dodgeT -= dt;
  if (state.player.dodgeCd > 0) state.player.dodgeCd -= dt;
  // A-W3 诅咒系 (滚动/时间清除)
  if (state.player.curseT > 0) state.player.curseT -= dt;
  // A-W3 毒池 (death_trigger): 站内每秒伤害
  const pools = state.fx.pools;
  if (pools && pools.length > 0) {
    for (let pi = pools.length - 1; pi >= 0; pi--) {
      const pk = pools[pi];
      pk.t -= dt;
      if (pk.t <= 0) { pools.splice(pi, 1); continue; }
      if (state.player.dodgeT <= 0 && (state.player.reviveInvuln ?? 0) <= 0) {
        const px = state.player.pos.x;
        const py = state.player.pos.y;
        if (px >= pk.x && px <= pk.x + pk.r && py >= pk.y && py <= pk.y + pk.r) {
          state.player.hp -= pk.dps * dt;
          state.combat.lastKiller = '毒池';
        }
      }
    }
  }
  if (state.combat.combo.timer > 0) {
    state.combat.combo.timer -= dt;
    if (state.combat.combo.timer <= 0) state.combat.combo.count = 0;
  }
  if (state.combat.levelUpFlash > 0) state.combat.levelUpFlash -= dt;
  // B-V2 Boss 入场演出倒计时
  if (state.combat.bossIntroT > 0) state.combat.bossIntroT -= dt;
  resolveFireballHits(state);
  resolveMeleeHits(state);
  cullLoot(state, nowSec);  // OPT-032: 60s 后地面装备消失
  state.player.mp = Math.min(state.player.mpMax ?? 100, state.player.mp + (2 + (state.player.mpRegen ?? 0)) * dt);  // 回蓝 2/s + 被动 (OPT-016)
  state.player.hp = Math.min(state.player.hpMax ?? 100, state.player.hp + 2 * dt);  // 被动回血

  // 死亡检测 (OPT-011, B1): 进入死亡结算屏, 由玩家选择 (不再 2s 强制原地复活)
  if (state.player.hp <= 0 && !state.ui.dying && state.screen === 'dungeon') {
    state.ui.dying = true;
    state.deathSummary = deathSummary(state);
    state.ui.deathUndo = 5;  // C (死亡撤销): 5s 免费撤销窗口 (仅软核)
    setScreen(state, 'death');
    inf('combat', 'YOU DIED (score=' + state.combat.score + ')');
  }
  // 原地复活无敌 (OPT-011): 竖屏后倒计时
  if (state.reviveInvuln > 0) state.reviveInvuln -= dt;
  // C (死亡撤销): death 屏倒计时归零 (5s 窗口)
  if (state.screen === 'death' && state.ui.deathUndo > 0) {
    state.ui.deathUndo = Math.max(0, state.ui.deathUndo - dt);
  }
  // 施法失败红闪 (OPT-007): 倒计时
  if (state.castFailFlash) {
    state.castFailFlash.t -= dt;
    if (state.castFailFlash.t <= 0) state.castFailFlash = null;
  }

  // 跑局推进 (OPT-012): 小怪清空 → 召主题 Boss; Boss 击杀 → 通关结算
  if (state.screen === 'dungeon') {
    const ph = runPhase(state.run.alive, state.run.bossAlive, state.run.bossKilled);
    if (ph === 'boss') {
      const isExtract = state.run.mode === 'extract';
      if (isExtract && state.run.bossStage === 0) {
        // A-W4 挑战模式: 四方向区各 1 元素 Boss (未决项拍板: 火/冰/毒/影 固定方向位)
        // 双元素增强: 每只随机副元素 ≠ 主元素 (附伤 + 可读组合)
        const pool = THEME_MONSTER_POOL[state.run.theme];
        for (let i = 0; i < 4; i++) {
          const t = pool[Math.floor(Math.random() * pool.length)];
          // Review 修复: forceElite 在 spawn 时生效 (hp×2.2 + mech 挂载), 之前事后置 elite 无效
          const ob = spawnMonster(state, t, undefined, { forceElite: true });
          const mainElem = EXTRACT_ELEMENT_ORDER[i];  // 方向位固定主元素
          const subElem = randomSubElement(mainElem);
          ob.elementId = mainElem;
          ob.subElement = subElem;
          ob.hue = ELEMENT_DEFS[mainElem].hue;
          ob.bossLike = true;  // 外层 Boss: 享受二阶段狂暴 + skill3 技能池
          ob.size = { w: ob.size.w * 1.5, h: ob.size.h * 1.5 };
          ob.hp = Math.round(ob.hp * 3);
          ob.maxHp = ob.hp;
          ob.skill3 = rollBossSkill3();  // A-W3 技能池 (bossLike 触发)
          // 分置四方向 (外→内)
          const a = (Math.PI / 2) * i;
          ob.pos = {
            x: state.player.pos.x + Math.cos(a) * 1400 + (Math.random() * 300 - 150),
            y: state.player.pos.y + Math.sin(a) * 1400 + (Math.random() * 300 - 150),
          };
          state.fx.monsters.push(ob);
          const elemTag = `[${ELEMENT_DEFS[mainElem].name}+${ELEMENT_DEFS[subElem].name}]`;
          pushToast(state, `${elemTag} 元素 Boss: ${t} (${i + 1}/4)`, '#ff9530');
        }
        state.run.bossStage = 1;
        state.run.bossAlive = false;  // 4 只外层 Boss 走 alive-- (死后触发下一阶段)
        state.run.alive = 4;          // 4 只外层 Boss 计入 alive (killMonster 递减)
        playSfxClient('boss_roar');
        triggerBossIntro(state, '元素 Boss ×4', '火/冰/毒/影 四方位迫近 — 双元素组合');
        inf('world', `extract: 4 outer boss summoned (${state.run.theme})`);
      } else if (isExtract && state.run.bossStage === 1) {
        // 4 外层 Boss 全清 → 中央最终主题 Boss (设计 §2.3: 出生区变竞技场)
        const bossType = THEME_BOSS[state.run.theme];
        const boss = spawnMonster(state, bossType, EXTRACT_SPAWN);
        state.fx.monsters.push(boss);
        state.run.bossStage = 2;
        state.run.bossAlive = true;
        const bossName = MONSTER_DEFS[bossType].type;
        const elemTag = boss.elementId ? `[${ELEMENT_DEFS[boss.elementId].name}] ` : '';
        pushToast(state, `${elemTag}最终 BOSS: ${bossName}`, '#ffd64a');
        playSfxClient('boss_roar');
        triggerBossIntro(state, '最终 BOSS', `${bossName} 降临!`);
        inf('world', `extract: FINAL boss ${bossName} (${state.run.theme})`);
      } else if (!isExtract) {
        const bossType = THEME_BOSS[state.run.theme];
        // A-W2 设计 §2: linear 主轴右端 (终点) / gauntlet 世界中央 (Boss 区)
        const anchor = state.run.mode === 'linear'
          ? { x: WORLD_W - 320, y: WORLD_H / 2 }
          : { x: WORLD_W / 2, y: WORLD_H / 2 };
        const boss = spawnMonster(state, bossType, anchor);
        state.fx.monsters.push(boss);
        state.run.bossAlive = true;
        const bossName = MONSTER_DEFS[bossType].type;
        const elemTag = boss.elementId ? `[${ELEMENT_DEFS[boss.elementId].name}] ` : '';
        pushToast(state, `${elemTag}BOSS 出现: ${bossName}`, '#ff9530');
        playSfxClient('boss_roar');  // OPT-025
        triggerBossIntro(state, 'BOSS', `${bossName} 出现!`);
        inf('world', `BOSS 出现: ${bossName} (${state.run.theme})`);
      }
    } else if (ph === 'won' && !state.run.victoryShown) {
      state.run.victoryShown = true;
      // A-W1 门结算: 不再自动进 victory 屏 — 玩家走到 Boss 死亡位传送门前按 V 交互结算
      state.run.timeSec = Math.max(0, (performance.now() - state.run.t0) / 1000);
      // 进度解锁 (OPT-015): 首次通关记录主题 (结算时持久化)
      if (!state.cleared.includes(state.run.theme)) {
        state.cleared.push(state.run.theme);
        pushToast(state, `已解锁: ${state.run.theme}`, '#9cf');
      }
      // 传承 (D-01 补完): 本局已绑定符文存入账号层, 新局自动绑定 (结算时持久化)
      for (const slot of SKILL_SLOTS) {
        const r = skillRune(slot);
        if (r && !state.legacy.some(l => l.slot === slot)) {
          state.legacy.push({ slot, rune: r });
          pushToast(state, `传承: ${slotDisplay(slot)} → ${RUNE_DEFS[r].name}`, '#c9aaff');
        }
      }
      pushToast(state, 'Boss 已击败 — 传送门已开启 (V 回城结算)', '#ffd64a');
      inf('ui', `VICTORY(待结算): ${state.run.timeSec.toFixed(1)}s (${state.difficulty}) — 等待门交互`);
    }
  }

  // OPT-026 屏幕震动: 渲染期间偏移相机, 之后还原 + 衰减
  const camX0 = state.camera.x;
  const camY0 = state.camera.y;
  if (state.combat.cameraShake > 0.3) {
    state.camera.x += (Math.random() - 0.5) * state.combat.cameraShake;
    state.camera.y += (Math.random() - 0.5) * state.combat.cameraShake;
  }
  drawFrame(frameCtx);
  state.camera.x = camX0;
  state.camera.y = camY0;
  if (state.combat.cameraShake > 0) state.combat.cameraShake = Math.max(0, state.combat.cameraShake - 30 * dt);
  mouse.reset();
}

// drawFrame / drawFrameToScreen 已搬到 app/frame.ts (PR-008)


/** 主题环境粒子色 (OPT-027) — 已搬到 game/fx/envFx.ts (T3a), 由 envFxSystem 调度 */

// 已搬到 app/actions/* + app/save.ts (US-027-b):
// - notifyCastFail, handleHudClick → app/actions/{hud,player}.ts
// - requestDifficulty, hardcoreWipe, revivePlayer → app/actions/player.ts
// - buildSavePayload 包装层, continueLastSave, resumeFromSave, enterTargetCharacter → app/save.ts
// - handleUiClick 包装层 → 内联到 drawFrame 调用点

requestAnimationFrame(loop);