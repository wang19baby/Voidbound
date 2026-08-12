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
import { updateFireballs, spawnFireball, updateCamera, pickPlayerSprite, worldToScreen, resetPlayer, setScreen, resumeScreen, runPhase, emptyRun, THEMES, type Screen, type Theme, WORLD_W, WORLD_H } from './game/state';
import { portalActive, nearPortal, leaveThroughPortal } from './game/portal';
import { getActiveWalls, getActiveDecor, resetWorldForMode, type Wall } from './game/world';
import { drawSprite, setViewportUniform, setBlendTracked } from './render/draw';
import { buildRenderResources, resolveSprite, spriteUv } from './render/resources';
import { drawHud, drawHudOverlay, drawIcon, setMouseReticle, hudDungeonHit, setHudHover } from './render/hud';
import { makeCooldown } from './game/cooldown';
import { tryCastSlot, updateSwings, getSwings, assignSkillPoint, chooseRune, rejectRune, skillRune, skillLevel, getSkill, SKILL_SLOTS, SKILL_SPECS, slotDisplay, pickRuneOptions, type SkillSlot } from './game/skill';
import { RUNE_DEFS, type RuneId } from './game/rune';
import { ELEMENT_DEFS, EXTRACT_ELEMENT_ORDER, randomSubElement } from './game/element';
import { rollBossSkill3 } from './game/mech';
import { spawnMonster, spawnRunPool, updateMonsters, resolveFireballHits, resolveMeleeHits, MONSTER_DEFS, THEME_BOSS, THEME_MONSTER_POOL, updateEnemyProj, getEnemyProj, AURA_DEFS } from './game/monster';
import { validMapMode, MAP_MODE_NAMES, MAP_MODE_DESC, MAP_MODES, type MapMode } from './game/mapmode';
import { saveGame, loadGame, saveAccount, loadAccount, listCharacters, deleteCharacter, type SaveData, type SaveAccount, type CharacterSummary } from './ipc/save';
import { pickupLoot, getLoot, getOwned, getEquippedValues, allocEquipmentId, recomputeCombat, equipItem, unequipSlot, itemPowerDelta, cullLoot, collectAllLoot, clearGroundLoot, RARITY_COLORS, describeAffix, getItemSellPrice, getItemBuyPrice, EQUIP_SLOTS, EQUIP_NAMES, emptyMaterials, addMaterial, spendMaterial, materialCount, MATERIAL_NAMES, MATERIAL_IDS, REROLL_IRON_COST, RUNE_FORGE_COST, IRON_SHARD_PRICE, rerollCostOption, SET_BONUSES, type EquipType, type Equipment, type MaterialId } from './game/equipment';
import { TOWN_DEFS, townNpcs, nearestNpc, genMerchantStock, genMysteryStock, buyItem, sellItem, rerollOwned, buyPotion, POTION_PRICES, warehouseStore, warehouseTake, WAREHOUSE_CAP, unlockedTown, unlockedTowns, TOWN_IDS, runeForgePay, type TownPanel, type TownId, type MerchantStock, type MysteryStock, type NpcKind } from './game/town';
import { RUNE_FORGE_COST } from './game/equipment';
import { playBgmClient, playSfxClient, setVolumeClient } from './ipc/sfx';
import { baseCombat } from './game/combat';
import { DIFFICULTIES, DIFFICULTY_MODS, DIFFICULTY_GATES, cycleDifficulty, cycleDifficultyGated, unlockedDifficulty, type Difficulty } from './game/difficulty';
import { spawnDamageNum, getDamageNums, updateDamageNums } from './game/damageNum';
import { moveGridSel, flipPage, pageStart, pageOf, pageCount, cellIndex, slotRects, inRect, EQ_LAYOUT } from './game/uigrid';
import { rrect, hexToRgb01 } from './ui/primitives';
import { drawKeycap, drawGearIcon, drawSceneIcon } from './ui/keycap';
import { initTitleDust, drawTitleBackground, drawTitleWordmark, drawInfoBand, relTime } from './screens/title';
import { drawCloseConfirm as drawCloseConfirmScreen } from './screens/close';
import { drawTeleportTransition as drawTeleportTransitionScreen } from './screens/teleport';
import { NG_LAYOUT, NG_ROW_CLASS, NG_ROW_DIFF, NG_ROW_MODE, NG_LAUNCH_MS, THEME_COLORS, drawNewgame as drawNewgameScreen, type NewgameCtx } from './screens/newgame';
import { buildSavePayload as buildSavePayloadApp, restoreMaterialsApp, restorePassivesApp, persistNowApp } from './app/save';
import { handleUiClick as handleUiClickDispatch, buildUiCtx, type UiCtx } from './app/uiDispatch';
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
import { loadKeybinds, saveKeybinds, resetKeybinds, keyMatch, skillSlotByKey, keyLabel, normKey, keyHintMainText, keyHintSkillsText, type Keybinds } from './game/keybind';
// TS-008: 版本号来自 package.json (esbuild JSON loader 内联, 树摇后仅留 version)
import { version as GAME_VERSION } from '../package.json';
import { DAMAGE_TYPE_COLORS } from './game/combat';
import { PASSIVE_DEFS, PASSIVE_IDS, passiveLevel, assignPassivePoint, recomputePassives, type PassiveId } from './game/passive';
import { getSkillCooldowns } from './game/cooldown';
import { updateDeathFx, getDeathFx, spawnDeathFx } from './game/deathFx';
import { getVfx, updateVfx } from './game/vfx';
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
  fireballs: [] as import('./game/state').Fireball[],
  fireballSize: 32,
  monsters: [] as import('./game/monster').Monster[],
  vfx: [] as import('./game/vfx').Vfx[],
  score: 0,
  paused: false,
  dying: false,
  deathSummary: null as DeathSummary | null,
  reviveInvuln: 0,
  theme: 'forest' as 'forest' | 'desert' | 'ruin' | 'void',
  runeChoice: null,
  rejectedRunes: [],
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
  settingsOpen: false,
  screen: 'title' as Screen,
  pauseFrom: 'dungeon' as Screen,
  ngSel: ngDefault(),
  /** 新局屏来源: title=标题新游戏(可选职业) / town=城镇出发(职业锁定当前角色) */
  ngFrom: 'title' as 'title' | 'town',
  titleMsg: '',
  difficulty: 'normal' as Difficulty,
  run: emptyRun('forest'),
  killsTotal: 0,
  combo: { count: 0, timer: 0 },
  levelUpFlash: 0,
  bossIntroT: 0,
  bossIntroText: '',
  bossIntroTitle: '',
  volume: 0.8,
  equipSel: 0,
  equipPage: 0,
  cleared: [],
  legacy: [] as Array<{ slot: SkillSlot; rune: RuneId }>,
  confirmHardcore: false,
  pendingDifficulty: null,
  castFailFlash: null,
  cameraShake: 0,
  hitStop: 0,
  lastKiller: null,
  envFx: [],
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
  /** C: 探索度 (P2-8) 已探索 64px 块 (会话内, 不持久化) */
  explored: new Set<string>(),
  /** C: 死亡撤销窗口 (P0-2): 死亡后 N 秒内可免费撤销, 0 = 已过期 */
  deathUndo: 0,
  /** C: 收集总览覆盖层 (P1-4): characters 屏 */
  collectOpen: false,
  /** C: 键位自定义 (P3-10): 设置面板正在捕获的新键条目 (null=无) */
  keybindEdit: null as string | null,
  // C-503 仓库: 账号层共享 (跨角色)
  warehouse: [] as Equipment[],
  // M5 W4 C-401 材料: 独立计数
  materials: emptyMaterials(),
  // v3 鼠标化: 城镇 NPC 走向目标
  townWalk: null as { kind: NpcKind; x: number; y: number } | null,
};

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
const screenKeyCtx: ScreenKeyContext = {
  confirmCloseSave,
  confirmCloseCancel,
  continueLastSave,
  openCharactersList,
  saveLastNg,
  loadLastNg,
  createCharacterNow,
  startNewgameFromTitle,
  startFromNewgame,
  doLaunchRun,
  enterTargetCharacter,
  persistNow: () => persistNowApp(state),
  fadeBgm,
  startRun,
  ensureDungeonRun,
  enterTown,
  triggerBossIntro,
  formatTime,
  interactTown,
  handleTownPanelKey,
  revivePlayer,
  hardcoreWipe,
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
      state.score = d.score;
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
      resumeFromSave(state, d);  // v11: 场景分派 (上次在城镇 → 回城镇整理)
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

/** 鼠标位置 → 世界坐标方向 (Diablo 风格: 技能瞄准鼠标) */
function mouseAimDirection(state: GameState, m: ReturnType<NonNullable<typeof mouse>['state']>): { x: number; y: number } {
  const cx = state.viewport.w / 2;
  const cy = state.viewport.h / 2;
  return { x: m.pos.x - cx, y: m.pos.y - cy };
}

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
  state.equipSel = pageStart(flipPage(pageOf(state.equipSel), e.deltaY > 0 ? 1 : -1, total), total);
});

// 失焦自动暂停 (OPT-001): 战斗/城镇/装备面板中切走 → 暂停; 回焦点需手动继续
function autoPauseOnBlur(): void {
  if (state.screen !== 'dungeon' && state.screen !== 'town' && state.screen !== 'equipment') return;
  state.pauseFrom = state.screen === 'town' ? 'town' : 'dungeon';
  setScreen(state, 'pause');
  inf('gl', 'auto-paused (blur)');
}
window.addEventListener('blur', autoPauseOnBlur);
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPauseOnBlur(); });

// 关窗确认 (US-026): isCloseConfirmOpen() 移至 app/screenMachine.ts 模块状态
let closeConfirmSaving = false;
let closeEmit: ((event: string) => Promise<void>) | null = null;
void import('@tauri-apps/api/event').then(({ listen, emit }) => {
  closeEmit = emit;
  void listen('close-requested', () => {
    setCloseConfirmOpen(true);
    closeConfirmSaving = false;
    inf('ui', 'close-requested: 显示退出确认');
  });
});
function confirmCloseSave(): void {
  if (closeConfirmSaving) return;
  closeConfirmSaving = true;
  const done = () => {
    if (closeEmit) void closeEmit('close-confirmed');
    else {
      // 事件模块未就绪的兜底: JS 直接销毁
      void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().destroy());
    }
  };
  // 标题页无游戏进度, 直接退出; 其余屏先持久化再退出
  if (state.screen === 'title') { done(); return; }
  void persistNowApp(state).finally(done);
}
function confirmCloseCancel(): void {
  setCloseConfirmOpen(false);
}

inf('loop', 'main loop start');

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
    handleUiClick(state, mouse.state().pos.x, mouse.state().pos.y);
  }
  mouse.reset();
}
function loop(now: number) {
  // 心跳 (每帧可被 js_log 确认): 首帧 + 崩溃转发, 防止 rAF 内异常静默冻结
  if (!loopStartedLogged) {
    loopStartedLogged = true;
    invoke('js_log', { msg: '[boot] rAF loop started' }).catch(() => {});
  }
  try {
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
      drawTitle();
    } else if (state.screen === 'newgame') {
      // 出发过场倒计时: 期间冻结选择交互, 结束后开跑
      if (getNgLaunchT() > 0) {
        setNgLaunchT(getNgLaunchT() - 16.67);
        if (getNgLaunchT() <= 0) doLaunchRun();
      } else {
        handleScreenClick();
      }
      drawNewgame();
    } else if (state.screen === 'characters') {
      handleScreenClick();
      drawCharacters();
    } else {
      loopImpl(now);
    }
    if (isCloseConfirmOpen()) drawCloseConfirm();
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

  // 设置滑条拖动 (v3 鼠标化): LMB 按住且在滑条±容差带 → 音量即点即得 (title/pause 共用同一几何)
  if (state.settingsOpen && mouse.state().buttons.LMB) {
    const p = mouse.state().pos;
    const sx = state.viewport.w / 2 - 120, sy = state.viewport.h / 2 - 22, sw = 240, sh = 10;
    if (p.y >= sy - 14 && p.y <= sy + sh + 14 && p.x >= sx - 10 && p.x <= sx + sw + 10) {
      state.volume = Math.min(1, Math.max(0, (p.x - sx) / sw));
      setVolumeClient(state.volume);
    }
  }
  if (now - lastFpsT >= 1000) {
    inf('loop', `fps=${frameCount}`);
    frameCount = 0;
    lastFpsT = now;
  }

  // 鼠标边沿 (本帧按下的按键)
  mouse.sync();

  // 暂停/装备面板/结算屏: 跳过游戏逻辑, 只渲染 (遮罩/面板画在 drawFrameToScreen)
  if (state.screen === 'pause' || state.screen === 'equipment' || state.screen === 'death' || state.screen === 'victory') {
    drawFrame();
    mouse.reset();
    return; // 包装器统一 rAF
  }

  // 城镇场景: 只移动+绘制 (战斗全部冻结)
  if (state.mode === 'town') {
    // C-302 传送过场: 1s 倒计时 → 到达目标镇
    if (state.teleportTo) {
      state.teleportT -= dt;
      drawTeleportTransition();
      mouse.reset();
      if (state.teleportT <= 0) {
        const target = state.teleportTo;
        state.teleportTo = null;
        state.teleportT = 0;
        enterTown(state, target);
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
        interactTown(state);
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
    drawTownFrame();
    mouse.reset();
    return; // 包装器统一 rAF
  }

  // V0 命中停顿: 冻结世界模拟 (输入/怪物/弹幕/回血), 仍渲染 — 暴击时 ~0.1s 的打击感
  if (state.hitStop > 0) {
    state.hitStop = Math.max(0, state.hitStop - dt);
    drawFrame();
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
      for (let dx = -1; dx <= 1; dx++) state.explored.add(`${px + dx},${py + dy}`);
    }
  }
  updateCamera(state);
  state.world.walls = getActiveWalls(state, 2);
  state.world.decor = getActiveDecor(state, 2); // V1 画质: 装饰随相机刷新
  updateFireballs(state, dt);
  updateSwings(state, dt);
  updateMonsters(state, dt);
  updateEnemyProj(state, dt);
  updateDeathFx(state, dt);
  updateVfx(state, dt);
  updateDamageNums(state, dt);
  updateToasts(state, dt);
  spawnEnvFx(state, dt);
  updateEnvFx(state, dt);
  // CD 递减 (药水/翻滚)
  if (state.player.potionCd > 0) state.player.potionCd -= dt;
  if (state.player.dodgeT > 0) state.player.dodgeT -= dt;
  if (state.player.dodgeCd > 0) state.player.dodgeCd -= dt;
  // A-W3 诅咒系 (滚动/时间清除)
  if (state.player.curseT > 0) state.player.curseT -= dt;
  // A-W3 毒池 (death_trigger): 站内每秒伤害
  const pools = (state as GameState & { _pools?: Array<{ x: number; y: number; r: number; dps: number; t: number }> })._pools;
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
          state.lastKiller = '毒池';
        }
      }
    }
  }
  if (state.combo.timer > 0) {
    state.combo.timer -= dt;
    if (state.combo.timer <= 0) state.combo.count = 0;
  }
  if (state.levelUpFlash > 0) state.levelUpFlash -= dt;
  // B-V2 Boss 入场演出倒计时
  if (state.bossIntroT > 0) state.bossIntroT -= dt;
  resolveFireballHits(state);
  resolveMeleeHits(state);
  cullLoot(state, nowSec);  // OPT-032: 60s 后地面装备消失
  state.player.mp = Math.min(state.player.mpMax ?? 100, state.player.mp + (2 + (state.player.mpRegen ?? 0)) * dt);  // 回蓝 2/s + 被动 (OPT-016)
  state.player.hp = Math.min(state.player.hpMax ?? 100, state.player.hp + 2 * dt);  // 被动回血

  // 死亡检测 (OPT-011, B1): 进入死亡结算屏, 由玩家选择 (不再 2s 强制原地复活)
  if (state.player.hp <= 0 && !state.dying && state.screen === 'dungeon') {
    state.dying = true;
    state.deathSummary = deathSummary(state);
    state.deathUndo = 5;  // C (死亡撤销): 5s 免费撤销窗口 (仅软核)
    setScreen(state, 'death');
    inf('combat', 'YOU DIED (score=' + state.score + ')');
  }
  // 原地复活无敌 (OPT-011): 竖屏后倒计时
  if (state.reviveInvuln > 0) state.reviveInvuln -= dt;
  // C (死亡撤销): death 屏倒计时归零 (5s 窗口)
  if (state.screen === 'death' && state.deathUndo > 0) {
    state.deathUndo = Math.max(0, state.deathUndo - dt);
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
          state.monsters.push(ob);
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
        // 4 外层 Boss 全清 → 中央最终主题 Boss
        const bossType = THEME_BOSS[state.run.theme];
        const boss = spawnMonster(state, bossType);
        state.monsters.push(boss);
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
        const boss = spawnMonster(state, bossType);
        state.monsters.push(boss);
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
  if (state.cameraShake > 0.3) {
    state.camera.x += (Math.random() - 0.5) * state.cameraShake;
    state.camera.y += (Math.random() - 0.5) * state.cameraShake;
  }
  drawFrame();
  state.camera.x = camX0;
  state.camera.y = camY0;
  if (state.cameraShake > 0) state.cameraShake = Math.max(0, state.cameraShake - 30 * dt);
  mouse.reset();
}


/** 城镇: 进入 (C-301: 指定镇; 省略时用最近城镇; townReturn 保留地下城还原坐标) */
function enterTown(state: GameState, townId?: TownId) {
  const tid = townId && TOWN_DEFS[townId] ? townId : (TOWN_DEFS[state.townId] ? state.townId : 'greenwing');
  state.townId = tid;
  state.townWalk = null;  // v3 鼠标化: 进/换城镇清走向目标
  if (!state.townReturn) state.townReturn = { x: state.player.pos.x, y: state.player.pos.y };
  clearGroundLoot(state);  // M5 实测修复: 回城清理地上物品
  state.mode = 'town';
  setScreen(state, 'town');
  state.townPanel = null;
  state.townStock = null;
  state.mysteryStock = null;
  state.teleportTo = null;
  state.teleportT = 0;
  state.player.pos = { x: 560, y: 500 };
}

/** 城镇: E 交互 */
function interactTown(state: GameState) {
  const npc = nearestNpc(state, state.townId);
  if (!npc) { wrn('ui', '没有可交互的 NPC (靠近一点)'); return; }
  switch (npc.kind) {
    case 'merchant':
      state.townStock = genMerchantStock();
      state.townPanel = 'merchant';
      inf('ui', '商人: 1-5 购买, 6 卖出, Esc 离开');
      break;
    case 'smith':
      state.townPanel = 'smith';
      inf('ui', '重铸师: 1-9 选择装备重铸 (100金), Esc 离开');
      break;
    case 'warehouse':
      state.townPanel = 'warehouse';
      inf('ui', `仓库 (${state.warehouse.length}/${WAREHOUSE_CAP}): 1-9 取回, S 存入, Esc 离开`);
      break;
    case 'difficulty':
      requestDifficulty(state, cycleDifficultyGated(state.difficulty, state.cleared));
      inf('ui', `难度 → ${DIFFICULTY_MODS[state.difficulty].name}`);
      break;
    case 'mystery':
      state.mysteryStock = genMysteryStock();
      state.townPanel = 'mystery';
      inf('ui', '神秘商人: 1-4 购买传奇 (500-2000金), Esc 离开');
      break;
    case 'trainer':
      state.townPanel = 'trainer';
      inf('ui', '训练师: 1-0 选择被动技能, Enter 升级 (1 技能点/级), Esc 离开');
      break;
    case 'teleport': {
      const targets = unlockedTowns(state.cleared).filter(t => t !== state.townId);
      if (targets.length === 0) { pushToast(state, '暂无可传送的城镇', '#f88'); break; }
      state.townPanel = 'teleport';
      inf('ui', '传送师: 1-9 选择目标城镇, Esc 离开');
      break;
    }
    case 'forge': {
      state.townPanel = 'forge';
      inf('ui', '符文锻造师: 1-6 选择已变异技能重铸符文 (5奥术+1虚空), Esc 离开');
      break;
    }
    case 'exit': {
      // 出发 = 新开一局: 打开远征选择屏 (主题/难度/地图模式), 不再续接旧局
      state.townPanel = null;
      state.ngFrom = 'town';
      setNgLaunchT(-1);
      setNgNaming(false);
      state.ngSel = {
        classIdx: CLASS_IDS.indexOf(state.player.classId),
        diffIdx: DIFFICULTIES.indexOf(state.difficulty),
        themeIdx: THEMES.indexOf(state.theme),
        modeIdx: MAP_MODES.indexOf(state.run.mode ?? 'linear'),
      };
      setScreen(state, 'newgame');
      inf('ui', '出发 → 远征选择 (新开一局)');
      break;
    }
  }
}

/** 城镇面板按键 (1-5 买 / 6 卖 / 1-9 卖选 / 1-9 重铸选 / B 返回 / Esc 关) */
function handleTownPanelKey(state: GameState, e: KeyboardEvent, k: string) {
  if (k === 'escape' || k === 'b') { state.townPanel = null; state.townStock = null; return; }
  const n = parseInt(k, 10);
  if (state.townPanel === 'merchant' && state.townStock) {
    if (n >= 1 && n <= 5) {
      const st = state.townStock[n - 1];
      if (buyItem(state, st)) { playSfxClient('ui_click'); inf('ui', `购入 ${st.item.name}`); }
      else wrn('ui', '金币不足或背包已满');
      return;
    }
    if (n === 6) { state.townPanel = 'sell'; inf('ui', '卖出: 1-9 选择装备 (半价)'); return; }
    if (k === '7' || k === '8') {
      const kind = k === '7' ? 'hp' : 'mp';
      if (buyPotion(state, kind)) { playSfxClient('ui_click'); inf('ui', `购入 ${kind === 'hp' ? 'HP' : 'MP'} 药水`); }
      else wrn('ui', '药水购买失败 (金币不足或已满 3)');
      return;
    }
    if (k === '9') {
      // C-401 灵铁可购 (材料独立计数不占背包)
      if (state.player.gold < IRON_SHARD_PRICE) { wrn('ui', `灵铁 ${IRON_SHARD_PRICE}金, 金币不足`); return; }
      state.player.gold -= IRON_SHARD_PRICE;
      addMaterial(state, 'iron_shard', 1);
      playSfxClient('ui_click');
      inf('ui', '购入 灵铁碎片 ×1');
      return;
    }
    return;
  }
  if (state.townPanel === 'sell') {
    const price = sellItem(state, n - 1);
    if (price > 0) inf('ui', `卖出 +${price}金`);
    return;
  }
  if (state.townPanel === 'smith') {
    const res = rerollOwned(state, n - 1);
    if (res === 'gold') inf('ui', '重铸完成 (100金)');
    else if (res === 'iron') inf('ui', '重铸完成 (灵铁)');
    else wrn('ui', '重铸失败 (金币/灵铁不足或选择无效)');
    return;
  }
  if (state.townPanel === 'warehouse' || state.townPanel === 'warehouseTake') {
    if (k === 's') { state.townPanel = 'warehouseTake'; inf('ui', '存入: 1-9 选择背包装备, Esc 返回'); return; }
    if (k === 'b') { state.townPanel = 'warehouse'; return; }
    if (state.townPanel === 'warehouse' && n >= 1 && n <= 9) {
      if (warehouseTake(state, n - 1)) { playSfxClient('ui_click'); state.whFlash = 0.3; inf('ui', '取回仓库装备'); }
      else wrn('ui', '取回失败 (背包满或选择无效)');
      return;
    }
    if (state.townPanel === 'warehouseTake' && n >= 1 && n <= 9) {
      if (warehouseStore(state, n - 1)) { playSfxClient('ui_click'); state.whFlash = 0.3; inf('ui', '存入仓库'); }
      else wrn('ui', '存入失败 (仓库满或选择无效)');
      return;
    }
    return;
  }
  if (state.townPanel === 'mystery' && state.mysteryStock) {
    if (n >= 1 && n <= 4) {
      const st = state.mysteryStock[n - 1];
      if (buyItem(state, st)) { playSfxClient('ui_click'); inf('ui', `购入传奇 ${st.item.name}`); }
      else wrn('ui', '金币不足或背包已满');
    }
    return;
  }
  if (state.townPanel === 'teleport') {
    const targets = unlockedTowns(state.cleared).filter(t => t !== state.townId);
    const t = targets[n - 1];
    if (t && n >= 1 && n <= targets.length) {
      // C-302: 1s 过场 (黑屏 + 文字) → 到达
      state.teleportTo = t;
      state.teleportT = 1.0;
      state.townPanel = null;
      inf('ui', `传送 → ${TOWN_DEFS[t].name} (1s 过场)`);
    }
    return;
  }
  if (state.townPanel === 'forge') {
    // C-403: 选已变异技能槽 → 扣材料 → 触发符文三选一 (复用 runeChoice)
    // C-403: 选已变异技能槽 → 扣材料 → 触发符文三选一 (复用 runeChoice)
    const mutated = SKILL_SLOTS.filter(slot => skillRune(slot));
    const slot = mutated[n - 1];
    if (slot && n >= 1 && n <= mutated.length) {
      if (materialCount(state, 'arcane_core') < RUNE_FORGE_COST.arcane_core) {
        pushToast(state, '奥术核心不足 (需要 5)', '#f66');
        return;
      }
      if (materialCount(state, 'void_fragment') < RUNE_FORGE_COST.void_fragment) {
        pushToast(state, '虚空碎片不足 (需要 1)', '#f66');
        return;
      }
      if (runeForgePay(state)) {
        state.townPanel = null;
        // 打开三选一 (Esc 拒绝 = 保留原符文; 材料已扣)
        state.runeChoice = { slot, options: pickRuneOptions(slot) };
        pushToast(state, `符文锻造: ${slotDisplay(slot)} 重新变异`, '#c9aaff');
        playSfxClient('ui_click');
        inf('ui', `符文锻造 ${slot} → 三选一`);
      } else {
        pushToast(state, '材料不足', '#f66');
      }
    }
    return;
  }
  if (state.townPanel === 'trainer') {
    // 被动技能树: 1-9,0 选 / ↑↓ 移动 / Enter·空格 升级 (1 技能点/级)
    if (k === 'arrowup' || k === 'w') { state.trainerSel = Math.max(0, state.trainerSel - 1); return; }
    if (k === 'arrowdown' || k === 's') { state.trainerSel = Math.min(PASSIVE_IDS.length - 1, state.trainerSel + 1); return; }
    if (n >= 1 && n <= 10) { state.trainerSel = n - 1; return; }
    if (k === 'enter' || k === ' ') {
      const id = PASSIVE_IDS[state.trainerSel];
      if (!id) return;
      const errMsg = assignPassivePoint(state, id);
      if (errMsg) { pushToast(state, errMsg, '#f66'); wrn('ui', `trainer ${id}: ${errMsg}`); }
      else { playSfxClient('ui_click'); inf('ui', `被动 ${PASSIVE_DEFS[id].name} → Lv ${passiveLevel(state, id)}`); }
      return;
    }
    return;
  }
}

/** C-302 传送过场绘制: 委托给 screens/teleport.ts (US-026 附带抽取) */
function drawTeleportTransition() {
  drawTeleportTransitionScreen(hudCtx, hudCanvas, state.teleportTo, state.teleportT);
}

/** 城镇绘制: 背景/NPC/玩家/提示/面板 */
function drawTownFrame() {
  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  const townColor = TOWN_DEFS[state.townId]?.color ?? TOWN_DEFS.greenwing.color;
  const [cr, cg, cb] = townColor.split(',').map(s => parseFloat(s.trim()));
  gl.clearColor(cr, cg, cb, 1);   // C-302 城镇底色按镇 (GL 层, 勿画进 canvas 否则盖住角色)
  gl.clear(gl.COLOR_BUFFER_BIT);
  // 先画角色 (GL 层; 城镇=屏幕坐标, 直接按 pos 绘制)
  const tSprite = pickPlayerSprite(state, mouse.state().pos.x);
  drawSprite(gl, quad, res, state.player.pos, state.player.size, 'characters', tSprite.name, { flip: { x: tSprite.flipX ? -1 : 1, y: 1 }, rot: tSprite.rot });
  hudCtx.textAlign = 'center';
  hudCtx.fillStyle = '#9aa';
  hudCtx.font = 'bold 26px monospace';
  hudCtx.fillText(TOWN_DEFS[state.townId]?.name ?? '城镇', hudCanvas.width / 2, 26);
  hudCtx.fillStyle = '#889';
  hudCtx.font = '12px monospace';
  hudCtx.fillText('WASD 移动 · 靠近 NPC 按 E 交互 · [1-5]买 [6]卖 [1-9]重铸/仓储 · Esc 暂停', hudCanvas.width / 2, 62);
  // NPC (C-301: 按当前镇布局) — npcs 图集 sprite; 祭坛结构物用 ui 光环; 传送阵铺脚下
  const npcs = townNpcs(state.townId);
  const nearKind = nearestNpc(state, state.townId)?.kind ?? null;
  for (const npc of npcs) {
    const near = nearKind === npc.kind;
    if (npc.kind === 'difficulty') {
      // 挑战祭坛 (结构物): 脉冲光环
      const pulse = 0.75 + 0.25 * Math.sin((performance.now() / 1000) * 3 + npc.pos.x * 0.01);
      drawSprite(gl, quad, res, { x: npc.pos.x - 26 * pulse, y: npc.pos.y - 26 * pulse }, { w: 52 * pulse, h: 52 * pulse }, 'ui', 'slide_horizontal_color', { color: near ? [1, 0.85, 0.35] : [0.85, 0.4, 1], blend: 'add' });
    } else if (npc.kind === 'exit') {
      // 出城传送阵: 地面贴图铺脚下
      drawSprite(gl, quad, res, { x: npc.pos.x - 44, y: npc.pos.y - 44 }, { w: 88, h: 88 }, 'npcs', 'portal_array');
    } else {
      // 角色 NPC: 脚下光环 (交互提示) + 站桩
      drawSprite(gl, quad, res, { x: npc.pos.x - 16, y: npc.pos.y + 18 }, { w: 32, h: 6 }, 'ui', 'slide_horizontal_color', { color: near ? [0.5, 1, 0.8] : [0.35, 0.55, 0.6] });
      drawSprite(gl, quad, res, { x: npc.pos.x - 28, y: npc.pos.y - 32 }, { w: 56, h: 56 }, 'npcs', npc.sprite);
    }
    hudCtx.fillStyle = '#fff';
    hudCtx.font = 'bold 14px monospace';
    hudCtx.fillText(npc.name, npc.pos.x, npc.pos.y - 40);
    hudCtx.fillStyle = '#8aa';
    hudCtx.font = '11px monospace';
    hudCtx.fillText(npc.hint, npc.pos.x, npc.pos.y + 48);
  }
  // 交互提示
  const npc = nearestNpc(state, state.townId);
  if (npc) {
    hudCtx.fillStyle = '#ffd64a';
    hudCtx.font = 'bold 14px monospace';
    hudCtx.fillText(`E — ${npc.name}`, npc.pos.x, npc.pos.y + 14);
  }
  // HUD (金/技能点)
  hudCtx.textAlign = 'left';
  hudCtx.fillStyle = '#ffd64a';
  hudCtx.font = 'bold 14px monospace';
  hudCtx.fillText(`金: ${state.player.gold}`, 16, 26);
  hudCtx.fillStyle = '#9cc';
  hudCtx.font = '12px monospace';
  hudCtx.fillText(`难度: ${DIFFICULTY_MODS[state.difficulty].name}`, 16, 44);
  // 面板
  if (state.townPanel) {
    drawTownPanel();
    // v3 鼠标化: 行 hover 高亮 (与点击命中同几何: y0=104, 行高 24)
    const pm = mouse.state().pos;
    if (pm.x > 40 && (pm.y - 104) >= 0) {
      const r = Math.floor((pm.y - 104) / 24);
      if (r < 12) {
        hudCtx.fillStyle = 'rgba(255,255,255,0.08)';
        hudCtx.fillRect(40, 104 + r * 24, hudCanvas.width - 80, 24);
      }
    }
  }
  if (state.whFlash > 0) state.whFlash = Math.max(0, state.whFlash - 1 / 60);
  // v3: NPC 圈 hover → pointer (走向/交互提示)
  const tmx = mouse.state().pos;
  const onNpc = townNpcs(state.townId).some(n => inRect(tmx.x, tmx.y, n.pos.x - 30, n.pos.y - 30, 60, 60));
  canvas.style.cursor = onNpc ? 'pointer' : 'default';
  mouse.reset();
}

/** 城镇面板内容 */
function drawTownPanel() {
  hudCtx.fillStyle = 'rgba(6,6,12,0.92)';
  hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.textAlign = 'left';
  let y = 70;
  hudCtx.fillStyle = '#ffd';
  hudCtx.font = 'bold 20px monospace';
  if (state.townPanel === 'merchant') {
    hudCtx.fillText(`商人 (金:${state.player.gold})  [1-5] 购买  [6] 卖出  [7/8] 药水  [Esc] 离开`, 40, y); y += 34;
    const st = state.townStock ?? [];
    st.forEach((s, i) => {
      const col = RARITY_COLORS[s.item.rarity];
      hudCtx.fillStyle = `rgb(${col.map(c => Math.round(c * 255)).join(',')})`;
      hudCtx.font = '14px monospace';
      hudCtx.fillText(`${i + 1}. ${s.item.name} (${s.price}金)`, 60, y); y += 24;
      hudCtx.fillStyle = '#bbb';
      hudCtx.fillText(`    ${s.item.affixes.map(describeAffix).join(' · ')}`, 60, y); y += 24;
    });
    // 药水 (OPT-028): 7=HP 8=MP
    hudCtx.fillStyle = '#f88';
    drawIcon(hudCtx, res, 'potion_hp', 34, y - 18, 20);
    hudCtx.fillText(`7. HP 药水 (${POTION_PRICES.hp}金) ×${state.player.potions?.hp ?? 0}/3`, 60, y); y += 22;
    hudCtx.fillStyle = '#88f';
    drawIcon(hudCtx, res, 'potion_mp', 34, y - 18, 20);
    hudCtx.fillText(`8. MP 药水 (${POTION_PRICES.mp}金) ×${state.player.potions?.mp ?? 0}/3`, 60, y); y += 22;
    hudCtx.fillStyle = '#9cf';
    drawIcon(hudCtx, res, 'mat_iron_shard', 34, y - 18, 20);
    hudCtx.fillText(`9. 灵铁碎片 (${IRON_SHARD_PRICE}金) ×${materialCount(state, 'iron_shard')}`, 60, y); y += 22;
  } else if (state.townPanel === 'sell') {
    hudCtx.fillText(`卖出 (金:${state.player.gold})  [1-9] 选择  [Esc] 返回`, 40, y); y += 34;
    const owned = getOwned(state);
    owned.forEach((eq, i) => {
      if (i > 8) return;
      const col = RARITY_COLORS[eq.rarity];
      hudCtx.fillStyle = `rgb(${col.map(c => Math.round(c * 255)).join(',')})`;
      hudCtx.font = '14px monospace';
      hudCtx.fillText(`${i + 1}. ${eq.name} (+${getItemSellPrice(eq.rarity, eq.affixes.length)}金)`, 60, y); y += 24;
    });
  } else if (state.townPanel === 'smith') {
    drawIcon(hudCtx, res, 'mat_iron_shard', 14, y - 17, 20);
    hudCtx.fillText(`重铸师 (金:${state.player.gold} · 灵铁:${materialCount(state, 'iron_shard')})  [1-9] 选择  [Esc] 离开`, 40, y); y += 34;
    hudCtx.fillStyle = '#889';
    hudCtx.font = '12px monospace';
    hudCtx.fillText('消耗: 100金 或 灵铁 (rare 10 / set 20 / unique 40)', 40, y); y += 24;
    const owned = getOwned(state);
    owned.forEach((eq, i) => {
      if (i > 8) return;
      const col = RARITY_COLORS[eq.rarity];
      hudCtx.fillStyle = `rgb(${col.map(c => Math.round(c * 255)).join(',')})`;
      hudCtx.font = '14px monospace';
      hudCtx.fillText(`${i + 1}. ${eq.name} — ${eq.affixes.map(describeAffix).join(' · ')}`, 60, y); y += 24;
    });
  } else if (state.townPanel === 'warehouse' || state.townPanel === 'warehouseTake') {
    const taking = state.townPanel === 'warehouse';
    hudCtx.fillStyle = '#9cf';
    hudCtx.fillText(
      taking
        ? `仓库 (${state.warehouse.length}/${WAREHOUSE_CAP})  [1-9] 取回  [S] 存入  [Esc] 离开`
        : `存入 (背包 ${getOwned(state).length}/20)  [1-9] 选择  [B] 返回仓库`,
      40, y);
    // C-503 动画: 存取成功后边框闪光
    if (state.whFlash > 0) {
      hudCtx.strokeStyle = `rgba(120, 255, 180, ${Math.min(1, state.whFlash * 3)})`;
      hudCtx.lineWidth = 4;
      hudCtx.strokeRect(4, 4, hudCanvas.width - 8, hudCanvas.height - 8);
    }
    y += 34;
    const list = taking ? state.warehouse : getOwned(state);
    list.forEach((eq, i) => {
      if (i > 8) return;
      const col = RARITY_COLORS[eq.rarity];
      hudCtx.fillStyle = `rgb(${col.map(c => Math.round(c * 255)).join(',')})`;
      hudCtx.font = '14px monospace';
      hudCtx.fillText(`${i + 1}. ${eq.name} — ${eq.affixes.map(describeAffix).join(' · ')}`, 60, y); y += 24;
    });
  } else if (state.townPanel === 'mystery') {
    hudCtx.fillText(`神秘商人 (金:${state.player.gold})  [1-4] 购买  [Esc] 离开`, 40, y); y += 34;
    const st = state.mysteryStock ?? [];
    st.forEach((s, i) => {
      const col = RARITY_COLORS[s.item.rarity];
      hudCtx.fillStyle = `rgb(${col.map(c => Math.round(c * 255)).join(',')})`;
      hudCtx.font = '14px monospace';
      hudCtx.fillText(`${i + 1}. ${s.item.name} (${s.price}金)`, 60, y); y += 24;
      hudCtx.fillStyle = '#bbb';
      hudCtx.fillText(`    ${s.item.affixes.map(describeAffix).join(' · ')}`, 60, y); y += 24;
    });
  } else if (state.townPanel === 'teleport') {
    hudCtx.fillText('传送师 — 选择目标城镇 [1-9]  [Esc] 离开', 40, y); y += 34;
    const targets = unlockedTowns(state.cleared).filter(t => t !== state.townId);
    targets.forEach((t, i) => {
      hudCtx.fillStyle = '#cfe8ff';
      hudCtx.font = 'bold 16px monospace';
      hudCtx.fillText(`${i + 1}. ${TOWN_DEFS[t].name}`, 60, y); y += 26;
      hudCtx.fillStyle = '#889';
      hudCtx.font = '12px monospace';
      hudCtx.fillText(`   ${TOWN_DEFS[t].requires.length === 0 ? '初始城镇' : `解锁: 通关 ${TOWN_DEFS[t].requires.join(' + ')}`}`, 60, y); y += 26;
    });
  } else if (state.townPanel === 'forge') {
    hudCtx.fillText(`符文锻造师  消耗: 奥术核心×${RUNE_FORGE_COST.arcane_core} + 虚空碎片×${RUNE_FORGE_COST.void_fragment}`, 40, y); y += 34;
    hudCtx.fillStyle = '#889';
    hudCtx.font = '12px monospace';
    drawIcon(hudCtx, res, 'mat_arcane_core', 14, y - 17, 20);
    hudCtx.fillText(`持有: 奥术核心 ${materialCount(state, 'arcane_core')} · `, 40, y);
    const arcW = hudCtx.measureText(`持有: 奥术核心 ${materialCount(state, 'arcane_core')} · `).width;
    drawIcon(hudCtx, res, 'mat_void_fragment', 40 + arcW - 3, y - 17, 20);
    hudCtx.fillText(`虚空碎片 ${materialCount(state, 'void_fragment')}`, 40 + arcW + 19, y); y += 24;
    const mutated = SKILL_SLOTS.filter(slot => skillRune(slot));
    if (mutated.length === 0) {
      hudCtx.fillStyle = '#f88';
      hudCtx.font = 'bold 15px monospace';
      hudCtx.fillText('先升级技能到 10 级获取符文变异', 40, y); y += 26;
    } else {
      mutated.forEach((slot, i) => {
        const r = skillRune(slot);
        hudCtx.fillStyle = '#c9aaff';
        hudCtx.font = 'bold 15px monospace';
        hudCtx.fillText(`${i + 1}. ${slotDisplay(slot)} — ${r ? RUNE_DEFS[r].name : ''}`, 60, y); y += 26;
        hudCtx.fillStyle = '#8a8a96';
        hudCtx.font = '12px monospace';
        hudCtx.fillText(`   ${r ? RUNE_DEFS[r].desc : ''}`, 60, y); y += 26;
      });
    }
  } else if (state.townPanel === 'trainer') {
    hudCtx.fillText(`训练师 (技能点:${state.player.skillPoints})  [1-9,0] 选 · [Enter] 升级  [Esc] 离开`, 40, y); y += 34;
    hudCtx.fillStyle = '#889';
    hudCtx.font = '12px monospace';
    hudCtx.fillText('被动技能树 — 10 槽同时生效, 每级 1 技能点 (最多 20 级)', 40, y); y += 24;
    PASSIVE_IDS.forEach((id, i) => {
      const def = PASSIVE_DEFS[id];
      const lv = passiveLevel(state, id);
      const sel = i === state.trainerSel;
      hudCtx.fillStyle = sel ? '#ffd64a' : '#ccc';
      hudCtx.font = 'bold 14px monospace';
      hudCtx.fillText(`${i + 1}. ${def.name}  Lv ${lv}${lv >= def.maxLevel ? ' (满)' : ''}  ${sel ? '◀' : ''}`, 60, y); y += 22;
      hudCtx.fillStyle = sel ? '#fda' : '#889';
      hudCtx.font = '12px monospace';
      hudCtx.fillText(`   ${def.desc} · ${def.perLv}`, 60, y); y += 22;
    });
  }
  hudCtx.fillStyle = '#fff';
}

/** 开始一局地牢 (OPT-012 + A-W2): 设定主题/难度/模式 → 清场刷跑局池 → 进 dungeon */
function startRun(state: GameState, theme: Theme, difficulty: Difficulty, mode?: MapMode): void {
  state.theme = theme;
  state.difficulty = difficulty;
  state.run.mode = mode ?? state.run.mode ?? 'linear';
  state.score = 0;
  state.dying = false;
  state.fireballs.length = 0;
  state.combo = { count: 0, timer: 0 };
  state.player.dodgeT = 0;
  state.player.dodgeCd = 0;
  state.player.potionCd = 0;
  state.reviveInvuln = 0;
  state.player.potions = { hp: 3, mp: 3 };
  clearGroundLoot(state);  // M5 实测修复: 新局清理上一局地上物品
  state.townReturn = null;  // 新开一局: 不再还原旧地牢坐标
  // 传承符文 (D-01): 新局自动绑定已传承变异 (该槽无符文时)
  for (const l of state.legacy) {
    const sk = getSkill(l.slot);
    if (sk && !sk.rune) sk.rune = l.rune;
  }
  fadeBgm(`bgm_${theme}`, state.volume);  // OPT-027: 换主题交叉淡化 (顺带修旧 bug: startRun 从未切 BGM)
  resetWorldForMode(state.run.mode);
  resetPlayer(state);
  spawnRunPool(state);
  setScreen(state, 'dungeon');
  inf('world', `run started: ${theme}/${difficulty}`);
}

/** 读档/回城再进时: 场上无怪 → 补刷一池; 有怪 → 按现存怪重算跑局计数 (Boss 在场/击杀态) */
function ensureDungeonRun(state: GameState): void {
  state.run.theme = state.theme;
  resetWorldForMode(state.run.mode ?? 'linear');
  if (state.monsters.length === 0) {
    spawnRunPool(state);
  } else {
    state.run.total = state.monsters.length;
    state.run.alive = state.monsters.filter(m => !MONSTER_DEFS[m.type].boss).length;
    state.run.bossAlive = state.monsters.some(m => MONSTER_DEFS[m.type].boss);
    state.run.bossKilled = false;
    state.run.victoryShown = false;
    state.run.bossStage = 0;
    state.run.t0 = performance.now();
  }
}

/** B-V2 Boss 入场演出: 横幅倒计时 + 泛光种子; 全屏渲染层读取 */
function triggerBossIntro(state: GameState, title: string, text: string): void {
  state.bossIntroT = 2.8;
  state.bossIntroTitle = title;
  state.bossIntroText = text;
  state.cameraShake = Math.min(20, (state.cameraShake ?? 0) + 10);
}

/** 秒 → mm:ss */
function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 主属性显示名 (新建角色信息卡) */
const ATTR_NAMES: Record<string, string> = { str: '力量', dex: '敏捷', vit: '体力', int: '智力', fai: '信仰', cha: '魅力' };

/** 按键提示 (A 收敛): 单点生成, 键位自定义后即时反映 (纯函数在 keybind.ts) */
function keyHintMain(): string {
  return keyHintMainText(loadKeybinds());
}
/** 设置面板技能名行 (键位动态) */
function keyHintSkills(): string {
  return keyHintSkillsText(loadKeybinds());
}

// ===== 标题屏打磨 (TS-001~009, 2026-08-12) =====

/** TS-008: 存档格式标签 (与 src-tauri/src/save.rs SAVE_FORMAT_VERSION=11 同步维护) */
const SAVE_FMT_LABEL = 'v11';

/** US-026: getTitleFocus()/closeConfirmOpen/getNgLaunchT()/isNgNaming() 已移至 app/screenMachine.ts 模块状态
 *  本地不再保留副本, 所有读用 getter, 所有写用 setter。
 *  syncTitleFocus/moveTitleFocus/titleAct 三个函数由 screenMachine.ts 导出 (签名带 state+ctx)。
 *  startNewgameFromTitle/openCharactersList 仍在本文件 (ctx 引用, 也被 drawTitle 等使用)。
 */
/** 新游戏 → 新局选择屏 (职业/难度/主题预填当前) — ctx callback */
function startNewgameFromTitle(): void {
  state.ngSel = { classIdx: CLASS_IDS.indexOf(state.player.classId), diffIdx: DIFFICULTIES.indexOf(state.difficulty), themeIdx: THEMES.indexOf(state.theme), modeIdx: MAP_MODES.indexOf(state.run.mode ?? 'linear') };
  state.ngFrom = 'title';
  setNgLaunchT(-1);
  setNgNaming(false);
  setScreen(state, 'newgame');
  state.titleMsg = '';
  inf('ui', '新游戏 → 选择屏');
}

/** 角色管理列表 (拉取后进屏) — ctx callback */
function openCharactersList(): void {
  listCharacters().then(list => {
    state.charList = list;
    state.charSel = Math.max(0, list.findIndex(c => c.id === state.currentChar));
    state.charConfirmDel = false;
    setScreen(state, 'characters');
    state.titleMsg = '';
    inf('ui', `角色管理: ${list.length} 个角色`);
  }).catch((err: unknown) => { state.titleMsg = `角色列表读取失败: ${String(err)}`; wrn('save', String(err)); });
}


/** C (P3-10): 键位条目几何 (绘制与命中共用) */
function settingsKeyRects(): Array<{ key: string; label: string; value: string; x: number; y: number; w: number; h: number }> {
  const kb = loadKeybinds();
  const y0 = hudCanvas.height / 2 - 130;
  const rows: Array<Array<{ key: string; label: string; value: string }>> = [
    [{ key: 'dodge', label: '翻滚', value: keyLabel(kb.dodge) }, { key: 'interact', label: '交互', value: keyLabel(kb.interact) }, { key: 'equip', label: '装备', value: keyLabel(kb.equip) }],
    [{ key: 'potionHp', label: '药水HP', value: keyLabel(kb.potionHp) }, { key: 'potionMp', label: '药水MP', value: keyLabel(kb.potionMp) }],
    [{ key: 'skills.Q', label: '技能1', value: keyLabel(kb.skills.Q) }, { key: 'skills.W', label: '技能2', value: keyLabel(kb.skills.W) }, { key: 'skills.E', label: '技能3', value: keyLabel(kb.skills.E) }, { key: 'skills.R', label: '技能4', value: keyLabel(kb.skills.R) }],
  ];
  const out: Array<{ key: string; label: string; value: string; x: number; y: number; w: number; h: number }> = [];
  const itemW = 148, gap = 10;
  let ry = y0 + 216;
  for (const row of rows) {
    const x0 = hudCanvas.width / 2 - (row.length * (itemW + gap) - gap) / 2;
    row.forEach((it, i) => {
      out.push({ key: it.key, label: it.label, value: it.value, x: x0 + i * (itemW + gap), y: ry, w: itemW, h: 26 });
    });
    ry += 36;
  }
  return out;
}

/** C (P3-10): 设置面板键位条目点击 → 进入编辑捕获 */
function handleSettingsClick(mx: number, my: number): boolean {
  for (const r of settingsKeyRects()) {
    if (inRect(mx, my, r.x, r.y, r.w, r.h)) {
      state.keybindEdit = r.key;
      pushToast(state, `按新键绑定「${r.label}」 (Esc 取消)`, '#9cf');
      return true;
    }
  }
  return false;
}

/** 设置面板 (C8 合并标题/暂停两处绘制 + 键位自定义区) */
function drawSettingsPanel() {
  const w = hudCanvas.width;
  const y0 = hudCanvas.height / 2 - 130;
  hudCtx.fillStyle = 'rgba(0,0,0,0.72)';
  hudCtx.fillRect(0, y0, w, 440);
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillStyle = '#ffd';
  hudCtx.font = 'bold 26px monospace';
  hudCtx.fillText('设置', w / 2, y0 + 40);
  hudCtx.font = '18px monospace';
  hudCtx.fillStyle = '#fff';
  hudCtx.fillText(`音量: ${Math.round(state.volume * 100)}%   [+]/[-] 或拖动滑条`, w / 2, y0 + 82);
  // 音量滑块 (拖动逻辑在 loopImpl)
  const sliderX = w / 2 - 120;
  const sliderY = y0 + 106;
  hudCtx.fillStyle = '#333';
  hudCtx.fillRect(sliderX, sliderY, 240, 10);
  hudCtx.fillStyle = '#c9aaff';
  hudCtx.fillRect(sliderX, sliderY, 240 * state.volume, 10);
  hudCtx.strokeStyle = '#888';
  hudCtx.strokeRect(sliderX, sliderY, 240, 10);
  hudCtx.fillStyle = '#fff';
  hudCtx.font = '16px monospace';
  hudCtx.fillText(`全屏: [F] 切换`, w / 2, y0 + 138);
  hudCtx.fillText(`难度: ${DIFFICULTY_MODS[state.difficulty].name}  [N] 循环`, w / 2, y0 + 164);

  // 键位区 (P3-10)
  hudCtx.fillStyle = '#9cf';
  hudCtx.font = 'bold 15px monospace';
  hudCtx.fillText('键位 — 点击条目后按新键 · [R] 恢复默认', w / 2, y0 + 194);
  for (const r of settingsKeyRects()) {
    const edit = state.keybindEdit === r.key;
    hudCtx.fillStyle = edit ? 'rgba(102,204,255,0.22)' : 'rgba(24,26,36,0.95)';
    hudCtx.fillRect(r.x, r.y, r.w, r.h);
    hudCtx.strokeStyle = edit ? '#66ccff' : '#3a3a4a';
    hudCtx.lineWidth = edit ? 2 : 1;
    hudCtx.strokeRect(r.x, r.y, r.w, r.h);
    hudCtx.fillStyle = '#ddd';
    hudCtx.font = edit ? 'bold 13px monospace' : '12px monospace';
    hudCtx.fillText(edit ? '按新键…' : `${r.label}: ${r.value}`, r.x + r.w / 2, r.y + r.h / 2);
  }

  hudCtx.fillStyle = '#999';
  hudCtx.font = '13px monospace';
  hudCtx.fillText('高级: Ctrl+1..6 技能点 · P 存档 · O 读档 · L 日志级别', w / 2, y0 + 326);
  hudCtx.fillStyle = '#b99';
  hudCtx.font = '13px monospace';
  hudCtx.fillText(`技能: ${keyHintSkills()} (键位可改)`, w / 2, y0 + 350);
  hudCtx.fillStyle = '#888';
  hudCtx.font = '14px monospace';
  hudCtx.fillText('[Esc] 返回', w / 2, y0 + 372);
  if (state.confirmHardcore) {
    hudCtx.fillStyle = '#ffd64a';
    hudCtx.font = 'bold 15px monospace';
    hudCtx.fillText('[Y] 确认切到硬核(永久死亡)  [Esc] 取消', w / 2, y0 + 396);
  }
  hudCtx.textAlign = 'left';
  hudCtx.textBaseline = 'top';
}

/** UI 屏职业立绘: 刷 WebGL 层 (2D 层对应区域须 clearRect 挖孔露出) */
function drawUiPortrait(classId: ClassId, x: number, y: number, w: number, h: number): void {
  gl.clearColor(0.043, 0.043, 0.071, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  drawSprite(gl, quad, res, { x, y }, { w, h }, 'characters', CLASS_SPRITES[classId] ?? CLASS_SPRITES.barbarian, {});
}

/** 悬停光标: 命中任一交互矩形 → pointer (每帧由绘制函数调用) */
function uiCursor(rects: Array<[number, number, number, number]>): void {
  const p = mouse.state().pos;
  canvas.style.cursor = rects.some(r => inRect(p.x, p.y, r[0], r[1], r[2], r[3])) ? 'pointer' : 'default';
}

/** 创建角色确认 (C-202): 校验命名 → 入列表 → 进新局选择屏 (职业/难度已预填) */
/** 创建角色 (newgame 出发前调用, ngFrom==='create'): 成功返回 true, 名字冲突等失败 false */
function createCharacterNow(): boolean {
  let name = state.charNameInput.trim();
  if (name.length === 0) name = `char_${state.charList.length}`;
  // 安全化: 只留字母数字下划线, 防存档路径穿越
  name = name.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 24);
  if (name.length === 0) name = `char_${state.charList.length}`;
  const used = new Set(state.charList.map(c => c.id));
  if (used.has(name)) { pushToast(state, `角色名 ${name} 已存在`, '#f66'); return false; }
  const { classId, difficulty } = ngResolve(state.ngSel);
  state.currentChar = name;
  state.charList = [...state.charList, {
    id: name, class: classId, level: 1, difficulty, theme: 'forest',
    last_played: Math.floor(Date.now() / 1000),
  }];
  state.charNameInput = '';
  pushToast(state, `新建角色: ${name} (${DIFFICULTY_MODS[difficulty].name})`, '#9cf');
  void persistNowApp(state);
  inf('ui', `新建角色 ${name} → 出发`);
  return true;
}

/** 新建角色 (角色管理 [N]): 直接进新局选择屏, 命名框融入 (ngFrom='create') */
function startCreateNewgame(): void {
  state.charNameInput = '';
  state.ngSel = { classIdx: 0, diffIdx: 0, themeIdx: 0, modeIdx: MAP_MODES.indexOf(state.run.mode ?? 'linear') };
  state.ngFrom = 'create';
  setNgLaunchT(-1);
  setNgNaming(true);
  setScreen(state, 'newgame');
  state.titleMsg = '';
  inf('ui', '新建角色 → 新局选择屏 (输入名字)');
}

// === 新局出发流程 (US-026: getNgLaunchT()/isNgNaming() 移至 app/screenMachine.ts) ===
const NG_LAST_KEY = 'voidbound.lastNg';  // 上次配置记忆 (localStorage)

function saveLastNg(): void {
  try {
    localStorage.setItem(NG_LAST_KEY, JSON.stringify(state.ngSel));
  } catch { /* 隐私/禁用时静默 */ }
}
function loadLastNg(): NewgameSel | null {
  try {
    const raw = localStorage.getItem(NG_LAST_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as NewgameSel;
    if (typeof p?.classIdx === 'number' && typeof p?.diffIdx === 'number' && typeof p?.themeIdx === 'number' && typeof p?.modeIdx === 'number') return p;
    return null;
  } catch { return null; }
}

/** 新局出发 (键盘 Enter / 鼠标开始 / 命名确认共用): 解锁校验 → 创建模式先建角色 → 0.7s 过场 */
function startFromNewgame(): void {
  const { classId, difficulty, theme, mode } = ngResolve(state.ngSel);
  if (!unlockedDifficulty(state.cleared, difficulty)) { pushToast(state, `${DIFFICULTY_MODS[difficulty].name} 未解锁`, '#f66'); return; }
  if (!themeUnlocked(state.cleared, theme)) { pushToast(state, `主题 ${theme} 未解锁 (通关森林后开放)`, '#f66'); return; }
  if (state.ngFrom === 'create' && !createCharacterNow()) return;  // 创建失败(重名等)留在选择屏
  saveLastNg();
  setNgLaunchT(NG_LAUNCH_MS);
  playSfxClient('ui_click');
  inf('ui', `出发: ${CLASS_DEFS[classId].name} · ${DIFFICULTY_MODS[difficulty].name} · ${THEME_NAMES[theme]} · ${MAP_MODE_NAMES[mode]}`);
}

/** 过场结束真正开跑 (loop newgame 分支倒计时触发) */
function doLaunchRun(): void {
  const { classId, difficulty, theme, mode } = ngResolve(state.ngSel);
  bindClass(state, classId);  // M5 C-103: 新局绑定职业
  startRun(state, theme, difficulty, mode);
}

/** 主题显示名 (卡片摘要用) */
const THEME_NAMES: Record<string, string> = { forest: '森林', desert: '沙漠', ruin: '废墟', void: '虚空' };

/** 标题画面 (GAME_FLOW §1.2): 主菜单 — TS-001~009 打磨版 (2026-08-12) */
function drawTitle() {
  const w = hudCanvas.width, h = hudCanvas.height;
  const mx = mouse.state().pos.x;
  const my = mouse.state().pos.y;
  const lmb = mouse.state().buttons.LMB;
  const kb = loadKeybinds();
  const menuRects: Array<[number, number, number, number]> = [];
  const hasSave = state.charList.length > 0;
  syncTitleFocus(hasSave);
  // 最近存档排序: 按 last_played 降序取前 5 (0/缺失排最后)
  const recentCards = hasSave
    ? [...state.charList].sort((a, b) => (b.last_played ?? 0) - (a.last_played ?? 0)).slice(0, 5)
    : [];
  // 立绘职业: 当前角色优先, 无存档用默认 (TS-001)
  const curChar = hasSave ? (state.charList.find(c => c.id === state.currentChar) ?? state.charList[0]) : null;
  const portraitClass: ClassId = (curChar?.class as ClassId) ?? (state.player.classId as ClassId) ?? 'barbarian';
  // 主菜单布局 (与 handleUiClick 同几何): 有存档 → 金色大按钮 + [2][3][R]; 无存档 → [1][2][R]
  const menuY0 = h / 2 - 30;
  const menuItems: Array<{ y: number; label: string; key: string; icon: 'sword' | 'gear' | 'portrait'; sub: string }> = hasSave
    ? [
        { y: menuY0 + 40, label: '新游戏', key: '2', icon: 'sword', sub: '选择职业 · 难度 · 主题' },
        { y: menuY0 + 80, label: '设置', key: '3', icon: 'gear', sub: '音量 · 全屏 · 键位 · 难度' },
        { y: menuY0 + 120, label: '角色管理', key: 'R', icon: 'portrait', sub: '切换 / 新建 / 删除角色' },
      ]
    : [
        { y: menuY0, label: '新游戏', key: '1', icon: 'sword', sub: '选择职业 · 难度 · 主题' },
        { y: menuY0 + 40, label: '设置', key: '2', icon: 'gear', sub: '音量 · 全屏 · 键位 · 难度' },
        { y: menuY0 + 80, label: '角色管理', key: 'R', icon: 'portrait', sub: '切换 / 新建 / 删除角色' },
      ];
  const itemW = 320, itemH = 38;

  // ---- GL 层 (TS-001 立绘 + 脚下光环; TS-004 菜单 GL 图标): 先清空, 2D 层对应区域挖孔 ----
  const px = 24, py = h - 206, pw = 180, ph = 180;  // 左下角 (右下被最近存档卡片占用)
  const iconSprites: Array<{ x: number; y: number; atlas: string; name: string }> = [];
  for (const it of menuItems) {
    if (it.icon === 'sword') iconSprites.push({ x: w / 2 - itemW / 2 + 14, y: it.y - itemH / 2 + 9, atlas: 'icons', name: 'skill_melee' });
    else if (it.icon === 'portrait') iconSprites.push({ x: w / 2 - itemW / 2 + 14, y: it.y - itemH / 2 + 9, atlas: 'characters', name: CLASS_SPRITES[portraitClass] ?? CLASS_SPRITES.barbarian });
  }
  gl.clearColor(0.043, 0.043, 0.071, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  // 脚下光环 (城镇 NPC 同类画法: ui/slide_horizontal_color additive)
  drawSprite(gl, quad, res, { x: px + 24, y: py + ph - 24 }, { w: 132, h: 22 }, 'ui', 'slide_horizontal_color', { color: [0.85, 0.4, 1], blend: 'add' });
  drawSprite(gl, quad, res, { x: px, y: py }, { w: pw, h: ph }, 'characters', CLASS_SPRITES[portraitClass] ?? CLASS_SPRITES.barbarian, {});
  for (const ip of iconSprites) {
    drawSprite(gl, quad, res, { x: ip.x, y: ip.y }, { w: 20, h: 20 }, ip.atlas, ip.name, {});
  }

  // ---- 2D 层 ----
  drawTitleBackground(hudCtx, hudCanvas);  // TS-002: 基色 + 径向渐变 + 微尘 (委托 screens/title.ts)
  // 挖孔露出 GL: 立绘+光环 / 菜单 GL 图标
  hudCtx.clearRect(px - 8, py - 8, pw + 16, ph + 36);
  for (const ip of iconSprites) hudCtx.clearRect(ip.x - 2, ip.y - 2, 24, 24);

  // TS-005: 标题外发光 + 副标字距 + 玩家向文案
  drawTitleWordmark(hudCtx, hudCanvas);

  // 右侧最近存档卡片区 — TS-003: 加场景图标 (当前角色用内存 scene, 其余用存档摘要)
  const cardX = w - 460, cardW = 360, cardY0 = 330, cardH = 42, cardGap = 6;
  recentCards.forEach((c, i) => {
    const cy = cardY0 + i * (cardH + cardGap);
    const hit = inRect(mx, my, cardX, cy, cardW, cardH);
    const down = hit && lmb;
    hudCtx.fillStyle = down ? 'rgba(102,204,255,0.30)' : hit ? 'rgba(102,204,255,0.13)' : '#14141f';
    hudCtx.fillRect(cardX, cy, cardW, cardH);
    hudCtx.strokeStyle = hit ? '#66ccff' : '#2a2a3a';
    hudCtx.lineWidth = hit ? 2 : 1;
    hudCtx.strokeRect(cardX, cy, cardW, cardH);
    const rep = CLASS_DEFS[(c.class as ClassId) ?? 'barbarian'];
    hudCtx.textAlign = 'left';
    hudCtx.textBaseline = 'middle';
    drawSceneIcon(hudCtx, cardX + 22, cy + 14, c.id === state.currentChar ? state.mode : (c.scene ?? 'dungeon'));
    hudCtx.fillStyle = rep?.color ?? '#eee';
    hudCtx.font = 'bold 16px monospace';
    hudCtx.fillText(`${rep?.name ?? c.class} ${c.id}`, cardX + 38, cy + 14);
    hudCtx.fillStyle = hit ? '#fff' : '#caa';
    hudCtx.font = '13px monospace';
    hudCtx.textAlign = 'right';
    hudCtx.fillText(`Lv${c.level} · ${THEME_NAMES[c.theme] ?? c.theme} · ${DIFFICULTY_MODS[c.difficulty]?.name ?? c.difficulty}`, cardX + cardW - 14, cy + 14);
    menuRects.push([cardX, cy, cardW, cardH]);
  });
  // 金色大按钮"继续游戏" — TS-003: + 相对时间 / 场景图标 / 跑局进度条 (剩余怪)
  if (hasSave) {
    const recent = recentCards[0];
    const contW = 480, contH = 46;
    const contX = w / 2 - contW / 2, contY = menuY0 - contH / 2;
    const hit = inRect(mx, my, contX, contY, contW, contH);
    const down = hit && lmb;
    const focused = getTitleFocus() === 0;
    const active = hit || focused;
    hudCtx.fillStyle = down ? 'rgba(255,214,74,0.35)' : active ? 'rgba(255,214,74,0.16)' : 'rgba(40,34,10,0.55)';
    hudCtx.fillRect(contX, contY, contW, contH);
    hudCtx.strokeStyle = down ? '#fff' : '#ffd64a';
    hudCtx.lineWidth = down ? 3 : active ? 2 : 1;
    hudCtx.strokeRect(contX, contY, contW, contH);
    if (focused) {
      hudCtx.strokeStyle = '#ffd64a';
      hudCtx.lineWidth = 2;
      hudCtx.strokeRect(contX - 3, contY - 3, contW + 6, contH + 6);
    }
    hudCtx.textAlign = 'center';
    hudCtx.textBaseline = 'middle';
    hudCtx.fillStyle = hit ? '#fff' : '#ffd64a';
    hudCtx.font = 'bold 20px monospace';
    hudCtx.fillText('[1] ▶ 继续游戏', w / 2, contY + contH / 2 - 9);
    if (recent) {
      // 行 1 右: 上次游玩距今
      hudCtx.fillStyle = '#bba';
      hudCtx.font = '12px monospace';
      hudCtx.textAlign = 'right';
      hudCtx.fillText(relTime(recent.last_played), contX + contW - 14, contY + contH / 2 - 9);
      // 行 2: 场景图标 + 摘要
      const rep = CLASS_DEFS[(recent.class as ClassId) ?? 'barbarian'];
      drawSceneIcon(hudCtx, contX + 16, contY + contH / 2 + 13, recent.id === state.currentChar ? state.mode : (recent.scene ?? 'dungeon'));
      hudCtx.fillStyle = '#caa';
      hudCtx.font = '13px monospace';
      hudCtx.textAlign = 'center';
      hudCtx.fillText(`${rep?.name ?? recent.class} ${recent.id} · Lv${recent.level} · ${THEME_NAMES[recent.theme] ?? recent.theme} · ${DIFFICULTY_MODS[recent.difficulty]?.name ?? recent.difficulty}`, w / 2 + 10, contY + contH / 2 + 13);
      // 跑局进度条 (仅当前角色 + 地牢 + 有跑局数据)
      if (recent.id === state.currentChar && state.mode === 'dungeon' && state.run.total > 0) {
        const alive = state.run.alive, total = state.run.total;
        const frac = state.run.bossAlive ? 1 : Math.min(1, Math.max(0, 1 - alive / total));
        const bx = contX + contW - 104, bw = 64, by = contY + contH / 2 + 9, bh = 5;
        hudCtx.fillStyle = '#333';
        hudCtx.fillRect(bx, by, bw, bh);
        if (frac > 0) {
          hudCtx.fillStyle = state.run.bossAlive ? '#ffd64a' : '#c9aaff';
          hudCtx.fillRect(bx, by, Math.max(2, bw * frac), bh);
        }
        hudCtx.strokeStyle = '#8a8a96';
        hudCtx.lineWidth = 1;
        hudCtx.strokeRect(bx, by, bw, bh);
        hudCtx.fillStyle = hit ? '#eed' : '#997';
        hudCtx.font = '9px monospace';
        hudCtx.textAlign = 'right';
        hudCtx.fillText(state.run.bossAlive ? 'Boss' : `${alive}/${total}`, contX + contW - 34, by + bh / 2 + 3);
      }
    }
    menuRects.push([contX, contY, contW, contH]);
  }
  // 菜单项 (TS-004: 图标/键帽/副标题; TS-007: 金边外扩 + 文字右移 + 焦点环)
  menuItems.forEach((it, i) => {
    const focusIdx = hasSave ? i + 1 : i;
    const ry = it.y - itemH / 2;
    const rx = w / 2 - itemW / 2;
    const hit = inRect(mx, my, rx, ry, itemW, itemH);
    const down = hit && lmb;  // 按下反馈: 松开瞬间已触发动作, 视觉加深
    const focused = getTitleFocus() === focusIdx;
    const active = hit || focused;
    if (active) {
      hudCtx.fillStyle = down ? 'rgba(102,204,255,0.32)' : 'rgba(102,204,255,0.13)';
      hudCtx.fillRect(rx, ry, itemW, itemH);
      hudCtx.strokeStyle = '#ffd64a';
      hudCtx.lineWidth = down ? 3 : 2;
      hudCtx.strokeRect(rx - 2, ry - 2, itemW + 4, itemH + 4);
    } else {
      hudCtx.strokeStyle = 'rgba(42,42,58,0.7)';
      hudCtx.lineWidth = 1;
      hudCtx.strokeRect(rx, ry, itemW, itemH);
    }
    if (it.icon === 'gear') drawGearIcon(hudCtx, rx + 26, it.y, 8, active, down);  // 设置图标 (图集无齿轮, 程序化)
    hudCtx.textAlign = 'center';
    hudCtx.textBaseline = 'middle';
    hudCtx.fillStyle = active ? (down ? '#fff' : '#66ccff') : '#eee';
    hudCtx.font = 'bold 22px monospace';
    hudCtx.fillText(it.label, w / 2 + 6 + (active ? 4 : 0), it.y);
    drawKeycap(hudCtx, w / 2 + itemW / 2 - 46, ry + 7, it.key, active);
    // hover/焦点副标题 (TS-004): 菜单项左侧, 右对齐
    if (active) {
      hudCtx.textAlign = 'right';
      hudCtx.fillStyle = '#9cf';
      hudCtx.font = '12px monospace';
      hudCtx.fillText(it.sub, rx - 16, it.y);
      hudCtx.textAlign = 'center';
    }
    menuRects.push([rx, ry, itemW, itemH]);
  });
  // hover 填充画在 GL 图标孔之上 → 菜单绘制完重新挖孔 (仅图标区, 不影响金边/文字)
  for (const ip of iconSprites) hudCtx.clearRect(ip.x - 2, ip.y - 2, 24, 24);

  // TS-006: 玩法说明带 (4 列, 键位随自定义)
  drawInfoBand(hudCtx, hudCanvas, mouse.state().pos, kb, menuRects);

  // TS-009: 设置齿轮入口 (右下角, 点击开设置面板)
  const gearX = w - 36, gearY = h - 36;
  const gearHit = inRect(mx, my, gearX - 14, gearY - 14, 28, 28);
  drawGearIcon(hudCtx, gearX, gearY, 9, gearHit, gearHit && lmb);
  menuRects.push([gearX - 14, gearY - 14, 28, 28]);

  // 底部: 键位提示 / 状态消息 / 版本信息 (TS-008)
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillStyle = '#888';
  hudCtx.font = '14px monospace';
  hudCtx.fillText(keyHintMain(), w / 2, h - 46);
  if (state.titleMsg) {
    hudCtx.fillStyle = '#ffd64a';
    hudCtx.font = '16px monospace';
    hudCtx.fillText(state.titleMsg, w / 2, h - 124);
  }
  hudCtx.fillStyle = '#4a4a58';
  hudCtx.font = '11px monospace';
  hudCtx.fillText(`v${GAME_VERSION} · 战斗原型 · 存档 ${SAVE_FMT_LABEL}`, w / 2, h - 22);
  hudCtx.textAlign = 'left';
  hudCtx.textBaseline = 'top';

  // 标题页设置面板 (C8: 与暂停共用 drawSettingsPanel, 含滑条/键位自定义)
  if (state.settingsOpen) {
    drawSettingsPanel();
  }
  uiCursor(menuRects);
}

/** 新局/远征/新建选择屏: 委托给 screens/newgame.ts (US-025) */
function drawNewgame() {
  const rects: Array<[number, number, number, number]> = [];
  const ngCtx: NewgameCtx = {
    state, hudCtx, hudCanvas, mouse, drawUiPortrait,
    isNgNaming, getNgLaunchT, loadLastNg, uiCursor,
  };
  drawNewgameScreen(ngCtx, rects);
}

/** 关窗确认覆盖层: 委托给 screens/close.ts (US-026 附带抽取) */
function drawCloseConfirm() {
  drawCloseConfirmScreen(hudCtx, hudCanvas, state.screen, closeConfirmSaving, mouse);
}

/** 角色管理屏 (C-202): 列表(职业/等级/难度) + 新建(N) + 删除(D 二次确认) + Enter 切换 */
function drawCharacters() {
  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.fillStyle = '#0b0b12';
  hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillStyle = '#c9aaff';
  hudCtx.font = 'bold 44px monospace';
  hudCtx.fillText('角色管理', hudCanvas.width / 2, 64);
  const cx = hudCanvas.width / 2;

  // C (P1-4): 右上"收集进度"按钮 (删除确认之外均可点)
  if (!state.charConfirmDel) {
    const cbR: [number, number, number, number] = [hudCanvas.width - 150, 20, 130, 30];
    const cbHit = inRect(mouse.state().pos.x, mouse.state().pos.y, ...cbR);
    hudCtx.fillStyle = cbHit ? 'rgba(201,170,255,0.18)' : 'rgba(30,30,42,0.9)';
    hudCtx.fillRect(...cbR);
    hudCtx.strokeStyle = cbHit ? '#c9aaff' : '#4a4a5a';
    hudCtx.lineWidth = cbHit ? 2 : 1;
    hudCtx.strokeRect(...cbR);
    hudCtx.fillStyle = '#c9aaff';
    hudCtx.font = 'bold 13px monospace';
    hudCtx.fillText('收集进度', hudCanvas.width - 85, 36);
  }
  // C (P1-4): 收集总览覆盖层
  if (state.collectOpen) {
    drawCollectionPanel();
    return;
  }

  if (state.charConfirmDel) {
    const target = state.charList[state.charSel];
    hudCtx.fillStyle = '#ff6a6a';
    hudCtx.font = 'bold 22px monospace';
    hudCtx.fillText(`删除角色 ${target ? target.id : ''}?`, cx, hudCanvas.height / 2 - 20);
    hudCtx.fillStyle = '#f88';
    hudCtx.font = '16px monospace';
    hudCtx.fillText('[Y] 确认删除 (存档不可恢复) · [Esc] 取消', cx, hudCanvas.height / 2 + 20);
    hudCtx.textAlign = 'left';
    hudCtx.textBaseline = 'top';
    return;
  }

  // v4 最近 3 角色快捷横排 (顶部卡片, 单击进入; 命中在 handleUiClick)
  const recent3 = state.charList.slice(0, 3);
  if (recent3.length > 0) {
    const cy0 = 128;
    hudCtx.textAlign = 'left';
    hudCtx.fillStyle = '#889';
    hudCtx.font = '12px monospace';
    hudCtx.fillText('最近角色 (单击进入)', cx - 640, cy0 - 20);
    hudCtx.textAlign = 'center';
    const rm = mouse.state().pos;
    recent3.forEach((c, i) => {
      const cx2 = cx - 320 + i * 240;
      const def = CLASS_DEFS[c.class as ClassId] ?? CLASS_DEFS.barbarian;
      const isCur = c.id === state.currentChar;
      const hit = inRect(rm.x, rm.y, cx2, cy0, 220, 86);
      hudCtx.fillStyle = hit ? 'rgba(102,204,255,0.14)' : 'rgba(20,20,28,0.92)';
      hudCtx.fillRect(cx2, cy0, 220, 86);
      hudCtx.strokeStyle = hit ? '#66ccff' : isCur ? '#ffd64a' : '#3a3a48';
      hudCtx.lineWidth = hit ? 2 : 1;
      hudCtx.strokeRect(cx2, cy0, 220, 86);
      hudCtx.fillStyle = def.color;
      hudCtx.font = 'bold 18px monospace';
      hudCtx.fillText(def.name, cx2 + 110, cy0 + 26);
      hudCtx.fillStyle = hit ? '#fff' : '#bbb';
      hudCtx.font = '14px monospace';
      hudCtx.fillText(`${c.id} · Lv${c.level}`, cx2 + 110, cy0 + 50);
      hudCtx.fillStyle = '#99a';
      hudCtx.font = '12px monospace';
      hudCtx.fillText(`${c.theme} · ${DIFFICULTY_MODS[c.difficulty]?.name ?? c.difficulty}${isCur ? ' · 当前' : ''}`, cx2 + 110, cy0 + 68);
    });
    uiCursor(recent3.map((_, i) => [cx - 320 + i * 240, cy0, 220, 86] as [number, number, number, number]));
  }

  // 列表
  if (state.charList.length === 0) {
    hudCtx.fillStyle = '#888';
    hudCtx.font = '18px monospace';
    hudCtx.fillText('暂无角色 · 按 [N] 新建', cx, hudCanvas.height / 2);
  } else {
    const rows = Math.min(state.charList.length, 8);
    const y0 = hudCanvas.height / 2 - rows * 26;
    state.charList.slice(0, rows).forEach((c, i) => {
      const sel = i === state.charSel;
      const def = CLASS_DEFS[c.class as ClassId] ?? CLASS_DEFS.barbarian;
      const isCur = c.id === state.currentChar;
      hudCtx.font = 'bold 18px monospace';
      hudCtx.fillStyle = sel ? '#ffd64a' : '#bbb';
      hudCtx.fillText(`${sel ? '▶ ' : '  '}${c.id}${isCur ? ' (当前)' : ''}`, cx - 200, y0 + i * 52);
      hudCtx.font = '14px monospace';
      hudCtx.fillStyle = sel ? '#fda' : '#889';
      hudCtx.fillText(`${def.name} · Lv${c.level} · ${DIFFICULTY_MODS[c.difficulty]?.name ?? c.difficulty} · ${c.theme}`, cx + 60, y0 + i * 52);
    });
  }
  hudCtx.fillStyle = '#fff';
  hudCtx.font = 'bold 15px monospace';
  hudCtx.fillText('[↑/↓] 选择 · [Enter] 进入/切换 · [N] 新建 · [D] 删除 · [Esc] 返回', cx, hudCanvas.height - 46);
  if (state.titleMsg) {
    hudCtx.fillStyle = '#ffd64a';
    hudCtx.font = '14px monospace';
    hudCtx.fillText(state.titleMsg, cx, hudCanvas.height - 80);
  }
  hudCtx.textAlign = 'left';
  hudCtx.textBaseline = 'top';
}

/** 新建角色入口在角色管理 [N] / 新建按钮 → 直接进新局选择屏 (命名框融入, drawNewgame) */


/** 角色管理列表行命中 (新增按钮等, 见 handleUiClick) */

/** C (P1-4): 收集总览覆盖层 (characters 屏, Esc/关闭按钮退出) */
function drawCollectionPanel() {
  const w = hudCanvas.width;
  const h = hudCanvas.height;
  hudCtx.fillStyle = 'rgba(4,4,10,0.93)';
  hudCtx.fillRect(0, 0, w, h);
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillStyle = '#ffd64a';
  hudCtx.font = 'bold 30px monospace';
  hudCtx.fillText('收 集 进 度', w / 2, 62);
  hudCtx.fillStyle = '#99a';
  hudCtx.font = '13px monospace';
  hudCtx.fillText(`角色 ${state.currentChar} · 账号共享 (仓库/传承/通关)`, w / 2, 92);

  // 套装: 3 张卡 (角色背包+穿戴 + 账号仓库)
  const allEq = [...getOwned(state), ...getEquippedValues(state), ...state.warehouse];
  const setKeys = Object.keys(SET_BONUSES);
  const setW = 200, setGap = 16;
  const setX0 = w / 2 - (setKeys.length * (setW + setGap) - setGap) / 2;
  setKeys.forEach((k, i) => {
    const n = allEq.filter(eq => eq.setName === k).length;
    const x = setX0 + i * (setW + setGap);
    const y = 128;
    hudCtx.fillStyle = n > 0 ? 'rgba(255,214,74,0.10)' : 'rgba(20,20,30,0.9)';
    hudCtx.fillRect(x, y, setW, 62);
    hudCtx.strokeStyle = n > 0 ? '#ffd64a' : '#3a3a48';
    hudCtx.lineWidth = n > 0 ? 2 : 1;
    hudCtx.strokeRect(x, y, setW, 62);
    hudCtx.fillStyle = n > 0 ? '#ffd64a' : '#8a8a96';
    hudCtx.font = 'bold 16px monospace';
    hudCtx.fillText(SET_BONUSES[k].name, x + setW / 2, y + 21);
    hudCtx.fillStyle = n > 0 ? '#eee' : '#8a8a96';
    hudCtx.font = '13px monospace';
    hudCtx.fillText(`拥有 ${n} 件`, x + setW / 2, y + 43);
  });

  let y = 240;
  const row = (label: string, val: string, col = '#ddd') => {
    hudCtx.textAlign = 'center';
    hudCtx.fillStyle = '#889';
    hudCtx.font = 'bold 15px monospace';
    hudCtx.fillText(label, w / 2 - 170, y);
    hudCtx.textAlign = 'left';
    hudCtx.fillStyle = col;
    hudCtx.font = '14px monospace';
    hudCtx.fillText(val, w / 2 + 40, y);
    y += 32;
  };
  const skillBound = SKILL_SLOTS.filter(slot => !!getSkill(slot)).length;
  row('技能池', `${skillBound}/${Object.keys(SKILL_SPECS).length} (当前职业绑定)`);
  const runes = new Set<string>();
  for (const slot of SKILL_SLOTS) {
    const r = skillRune(slot);
    if (r && r !== 'none') runes.add(r);
  }
  for (const l of state.legacy) runes.add(l.rune);
  const runeTotal = Object.keys(RUNE_DEFS).filter(id => id !== 'none').length;
  row('符文', `${runes.size}/${runeTotal} (已绑定 + 传承)`, runes.size > 0 ? '#c9aaff' : '#ddd');
  row('已通关', state.cleared.length > 0 ? state.cleared.join(' · ') : '尚无', state.cleared.length > 0 ? '#8f8' : '#999');
  const bestText = Object.entries(state.run.best)
    .map(([d, ms]) => `${DIFFICULTY_MODS[d as Difficulty]?.name ?? d} ${formatTime(ms / 1000)}`)
    .join(' · ');
  row('最佳记录', bestText || '—');

  // 关闭按钮
  const cr: [number, number, number, number] = [w / 2 - 90, h - 84, 180, 40];
  const hit = inRect(mouse.state().pos.x, mouse.state().pos.y, ...cr);
  hudCtx.fillStyle = hit ? 'rgba(255,255,255,0.12)' : 'rgba(30,30,42,0.9)';
  hudCtx.fillRect(...cr);
  hudCtx.strokeStyle = '#66ccff';
  hudCtx.lineWidth = hit ? 2 : 1;
  hudCtx.strokeRect(...cr);
  hudCtx.fillStyle = '#66ccff';
  hudCtx.font = 'bold 15px monospace';
  hudCtx.fillText('[Esc] 关闭', w / 2, h - 64);
  hudCtx.textAlign = 'left';
  hudCtx.textBaseline = 'top';
}

/** 单帧绘制: 清屏 + 地面 + 墙 + 粒子 + 火球 + 怪物 + 玩家 + HUD */
function drawFrame() {
  // 技能 CD 时间基准 (drawFrame 独立作用域, 不能引用 loopImpl 的 nowSec)
  const nowSec = performance.now() / 1000;

  // 鼠标技能: LMB/RMB 立即触发 (方向 = 鼠标位置)
  const aimDir = mouseAimDirection(state, mouse.state());
  // 仅 dungeon 接受鼠标技能点击; 其余屏 LMB = UI 点击 (C-501)
  if (state.screen === 'dungeon') {
    if (state.tutorStep >= 0 && state.tutorStep < 3) {
      // v4 引导期间: 点击仅跳过气泡, 不触发攻击/技能
      if (mouse.wasClicked('LMB')) { state.tutorStep++; state.tutorT = 0; }
      setHudHover(null);
      canvas.style.cursor = 'default';
    } else {
    // 关窗确认优先: Y/N 按钮命中 (防止被攻击分支吞掉)
    const cp = mouse.state().pos;
    const yH = isCloseConfirmOpen() && inRect(cp.x, cp.y, state.viewport.w / 2 - 140, state.viewport.h / 2 + 40, 120, 40);
    const nH = isCloseConfirmOpen() && inRect(cp.x, cp.y, state.viewport.w / 2 + 20, state.viewport.h / 2 + 40, 120, 40);
    if (isCloseConfirmOpen() && mouse.wasClicked('LMB')) {
      if (yH) confirmCloseSave();
      else if (nH) confirmCloseCancel();
    }
    // HUD 按钮优先: 技能栏 4 槽 / 药水 HP·MP / 翻滚 (悬停高亮 + pointer 光标)
    const hudKey = isCloseConfirmOpen() ? null : hudDungeonHit(mouse.state().pos.x, mouse.state().pos.y, state.viewport.w, state.viewport.h);
    setHudHover(hudKey);
    canvas.style.cursor = (yH || nH || hudKey) ? 'pointer' : 'default';
    if (mouse.wasClicked('LMB')) {
      if (hudKey) {
        handleHudClick(state, hudKey, aimDir, nowSec);
      } else if (tryCastSlot('LMB', state, aimDir, nowSec)) {
        invoke('play_sfx', { name: 'swing' }).catch(() => {});
      } else {
        notifyCastFail(state, 'LMB');
      }
    }
    if (mouse.wasClicked('RMB')) {
      if (tryCastSlot('RMB', state, aimDir, nowSec)) {
        invoke('play_sfx', { name: 'swing' }).catch(() => {});
      } else {
        notifyCastFail(state, 'RMB');
      }
    }
    }
  } else if (mouse.wasClicked('LMB')) {
    handleUiClick(state, mouse.state().pos.x, mouse.state().pos.y);
  }
  // MMB 预留: 符文切换已移除 (US-004: 10 级三选一绑定)

  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT);
  drawFrameToScreen();
  return;
}

/** 抽出单帧绘制逻辑 (含 pause 遮罩) */
function drawFrameToScreen() {

  // 设置 reticle 位置给 drawHud 用
  setMouseReticle(mouse.state().pos.x, mouse.state().pos.y);

    // V1 地板瓦片: HD 32px 格平铺 (旧桥接: tint/混铺已随 HD 落地移除)
  const FLOOR_TILE = 32;
  const t0x = Math.max(0, Math.floor(state.camera.x / FLOOR_TILE));
  const t0y = Math.max(0, Math.floor(state.camera.y / FLOOR_TILE));
  const t1x = Math.min(Math.floor(WORLD_W / FLOOR_TILE), Math.ceil((state.camera.x + state.viewport.w) / FLOOR_TILE));
  const t1y = Math.min(Math.floor(WORLD_H / FLOOR_TILE), Math.ceil((state.camera.y + state.viewport.h) / FLOOR_TILE));
  const floorBase = `floor_${state.theme}`;
  // M3 元素地图: 本局元素色相旋转整图 (地板/墙/装饰)
  const runHue = state.run.element ? ELEMENT_DEFS[state.run.element].hue : 0;
  for (let ty = t0y; ty < t1y; ty++) {
    for (let tx = t0x; tx < t1x; tx++) {
      // 位置哈希 → 10% 微暗增深度 (HD 纹理自带细节, 不需混铺)
      const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
      const r = (h % 1000) / 1000;
      const opt: { color?: [number, number, number]; hue?: number } = r > 0.9 ? { color: [0.9, 0.9, 0.96], hue: runHue } : { hue: runHue };
      drawSprite(gl, quad, res, { x: tx * FLOOR_TILE - state.camera.x, y: ty * FLOOR_TILE - state.camera.y }, { w: FLOOR_TILE, h: FLOOR_TILE }, 'world', floorBase, opt);
    }
  }

  // V1 墙: HD 主题墙 128px 1:1 (旧桥接: void tint / wall_alt 混搭已随 HD 落地移除)
  const wallName = `wall_${state.theme}`;
  for (const w of state.world.walls) {
    const sp = worldToScreen(state, w.pos);
    if (sp.x + w.size.w < 0 || sp.x > state.viewport.w) continue;
    if (sp.y + w.size.h < 0 || sp.y > state.viewport.h) continue;
    drawSprite(gl, quad, res, sp, w.size, 'world', wallName, runHue ? { hue: runHue } : undefined);
  }

  // V1 障碍物装饰: 主题散布草丛/石块 (纯视觉, 无碰撞), 墙与地板之间
  for (const d of state.world.decor) {
    const sp = worldToScreen(state, d.pos);
    if (sp.x + 64 < 0 || sp.x > state.viewport.w) continue;
    if (sp.y + 64 < 0 || sp.y > state.viewport.h) continue;
    const dopt: { color?: [number, number, number]; hue?: number } = d.tint ? { color: d.tint, hue: runHue } : { hue: runHue };
    drawSprite(gl, quad, res, sp, { w: 64, h: 64 }, 'world', d.sprite, dopt);
  }

  // A-W1 门结算: Boss 死亡位传送门 (脉冲光环, 玩家在交互范围内高亮)
  if (state.run.portal && !state.run.portal.used) {
    const pp = state.run.portal;
    const sp = worldToScreen(state, { x: pp.x, y: pp.y });
    if (sp.x > -80 && sp.x < state.viewport.w + 80 && sp.y > -80 && sp.y < state.viewport.h + 80) {
      const pulse = 0.5 + Math.sin(performance.now() / 250) * 0.15;
      const near = nearPortal(state);
      const ringCol: [number, number, number] = near ? [1, 0.75, 0.4] : [0.5, 0.9, 1];
      // 门体: 紫色旋涡
      drawSprite(gl, quad, res, { x: sp.x - 30, y: sp.y - 30 }, { w: 60, h: 60 }, 'particles', 'spark_03', { color: [0.75, 0.4, 1], blend: 'add' });
      // 交互光环
      drawSprite(gl, quad, res, { x: sp.x - 42 * pulse, y: sp.y - 42 * pulse }, { w: 84 * pulse, h: 84 * pulse }, 'ui', 'slide_horizontal_color', { color: ringCol });
      drawSprite(gl, quad, res, { x: sp.x - 3, y: sp.y - 46 }, { w: 6, h: 6 }, 'ui', 'slide_horizontal_color', { color: [1, 1, 1] });
      // (提示文案由 HUD 层的 portal 横幅承担, 此处纯视觉)
    }
  }

  // A-W3 毒池 (death_trigger): 半透明毒圈, 站内 DOT
  const pools = (state as GameState & { _pools?: Array<{ x: number; y: number; r: number; dps: number; t: number }> })._pools;
  if (pools) {
    for (const pk of pools) {
      const sp = worldToScreen(state, { x: pk.x, y: pk.y });
      if (sp.x > -pk.r && sp.x < state.viewport.w + pk.r && sp.y > -pk.r && sp.y < state.viewport.h + pk.r) {
        // 毒池脉冲 (UX_REVIEW P2): 呼吸缩放
        const pPulse = 0.85 + 0.15 * Math.sin((performance.now() / 1000) * 4 + pk.x);
        const pr = pk.r * pPulse;
        drawSprite(gl, quad, res, { x: sp.x + (pk.r - pr) / 2, y: sp.y + (pk.r - pr) / 2 }, { w: pr, h: pr }, 'particles', 'spark_03', { color: [0.2, 0.9, 0.3], blend: 'add' });
      }
    }
  }

  // B-V3: 环境/挥砍/弹幕/死亡粒子 → instanced batch (同 atlas 单 draw call)
  const instUv = (spriteName: string): [number, number, number, number] | null => {
    const bundle = res.atlases.get('particles');
    if (!bundle) return null;
    const sprite = bundle.sprites.get(spriteName);
    return sprite ? spriteUv(sprite, bundle.atlas.width, bundle.atlas.height) : null;
  };
  const addInst = (uv: [number, number, number, number] | null, sp: { x: number; y: number }, w: number, h: number, rot = 0): void => {
    if (!uv) return;
    particleBatch.add(sp.x, sp.y, w, h, uv, rot);
  };
  // 同 atlas 一次绑定纹理 + 程序; 颜色按组 flush
  gl.useProgram(particleBatch.program);
  gl.activeTexture(gl.TEXTURE0);
  const pbundle = res.atlases.get('particles');
  if (pbundle) gl.bindTexture(gl.TEXTURE_2D, pbundle.texture);
  // Review 修复: 显式 additive (粒子发光语义), 并同步 draw.ts 的 lastBlend 缓存
  setBlendTracked(gl, 'add');
  const flushGroup = (color: [number, number, number]) => {
    if (particleBatch.pending() > 0) {
      particleBatch.setColor(color[0], color[1], color[2]);
      particleBatch.flush({ w: state.viewport.w, h: state.viewport.h });
    }
  };
  const envUv = instUv('spark_03');
  const envColor = THEME_ENV_COLOR[state.theme];
  for (const p of state.envFx) {
    const sp = worldToScreen(state, p);
    addInst(envUv, sp, 6, 6);
  }
  flushGroup(envColor);

  // 近战挥击 (slash particle, 在玩家前)
  const slashUv = instUv('slash_01');
  for (const s of getSwings(state)) {
    const sp = worldToScreen(state, s.pos);
    if (sp.x + s.size.w < 0 || sp.x > state.viewport.w) continue;
    addInst(slashUv, sp, s.size.w, s.size.h);
  }
  flushGroup([1, 1, 1]);

  // 玩家火球 / 敌弹 / 死亡粒子: 颜色各异, 逐组 flush
  const magicUv = instUv('magic_01');
  for (const f of state.fireballs) {
    const sp = worldToScreen(state, f.pos);
    const rc = f.rune && f.rune !== 'none' ? RUNE_DEFS[f.rune].color : hexToRgb01(DAMAGE_TYPE_COLORS[f.dmgType]);
    addInst(magicUv, sp, f.size.w, f.size.h);
    flushGroup(rc);
  }
  const projUv = instUv('magic_05');
  const projCol: [number, number, number] = [1, 0.3, 0.3];
  for (const p of getEnemyProj(state)) {
    const sp = worldToScreen(state, p.pos);
    if (sp.x + p.size.w < 0 || sp.x > state.viewport.w) continue;
    if (sp.y + p.size.h < 0 || sp.y > state.viewport.h) continue;
    addInst(projUv, sp, p.size.w, p.size.h);
  }
  flushGroup(projCol);

  // 死亡粒子 (在世界图层之后, 怪物之前)
  const dUv = instUv('slash_02');
  for (const fx of getDeathFx(state)) {
    const sp = worldToScreen(state, fx.pos);
    if (sp.x + fx.size.w < 0 || sp.x > state.viewport.w) continue;
    if (sp.y + fx.size.h < 0 || sp.y > state.viewport.h) continue;
    const lifeFrac = Math.max(0, fx.life / fx.maxLife);
    const sz = fx.size.w * (0.4 + 0.6 * lifeFrac);
    addInst(dUv, { x: sp.x, y: sp.y }, sz, sz, fx.rot);
  }
  flushGroup([0.9, 0.9, 0.95]);
  // 恢复标准混合 (后续怪物/UI 绘制), 同步 draw.ts 缓存
  setBlendTracked(gl, 'alpha');

  // 怪物 (受击时变红闪烁, 复用 color tint)
  for (const m of state.monsters) {
    const sp = worldToScreen(state, m.pos);
    if (sp.x + m.size.w < 0 || sp.x > state.viewport.w) continue;
    if (sp.y + m.size.h < 0 || sp.y > state.viewport.h) continue;
    const def = MONSTER_DEFS[m.type];
    // HD 主题专属图: <type>_<theme>_<frame> (同名怪按主题分流, 不再互相覆盖)
    const color: [number, number, number] | undefined =
      m.elite ? [1, 0.85, 0.25]
      : m.hitFlash > 0 ? [1, 0.3, 0.3]
      : m.enhanced ? [1, 0.65, 0.3]
      : undefined; // 主题专属图自带配色, 不再套 def.tint 二次染色
    // V1 动画: 2 帧 + 正弦挤压 (移动时 4 步行走感, 静止时轻微呼吸)
    const moving = Math.hypot(m.vel.x, m.vel.y) > 1;
    const bob = Math.sin(m.walkT * (Math.PI * 2) / 0.6) * (moving ? 1 : 0.25);
    // V1 攻击前摇: 远程怪开火尾窗 / Boss 二阶段技能尾窗 → 放大 + 亮色 + 蓄力条 (可读性=反制)
    const dist = Math.hypot(state.player.pos.x - m.pos.x, state.player.pos.y - m.pos.y);
    const rangedWind = !!def.rangedCooldown && m.attackCd > 0 && m.attackCd <= 0.35 && dist <= def.aggroRange;
    const bossWind = !!def.boss && m.phase === 2 && m.aiCd > 0 && m.aiCd <= 0.6;
    const charging = rangedWind || bossWind;
    const bobW = m.size.w * (1 + bob * 0.06);
    const bobH = m.size.h * (1 - bob * 0.08);
    const sz = charging ? { w: bobW * 1.15, h: bobH * 1.15 } : { w: bobW, h: bobH };
    const drawColor: [number, number, number] | undefined = charging ? [1.5, 1.25, 1.0] : color;
    const runTheme = state.run?.theme ?? state.theme;
    const want = `${m.type}_${runTheme}_${m.walkFrame}`;
    // 缺帧回退 (旧 2 帧画: 2/3 → 0/1), 新 4 帧画到即用
    const frameSprite = resolveSprite(res, 'monsters', want)
      ? want
      : resolveSprite(res, 'monsters', `${m.type}_${runTheme}_${m.walkFrame % 2}`)
        ? `${m.type}_${runTheme}_${m.walkFrame % 2}`
        : `${def.sprite}_${m.walkFrame % 2}`;
    drawSprite(gl, quad, res, sp, sz, 'monsters', frameSprite, { color: drawColor, hue: m.hue ?? 0 });
    // 领主标记 (M3): HP 条上方紫色横条
    if (m.lord) {
      drawSprite(gl, quad, res, { x: sp.x, y: sp.y - 9 }, { w: m.size.w, h: 2 }, 'ui', 'slide_horizontal_color', { color: [0.85, 0.4, 1] });
    }
    // 光环标记 (A-W1): 增强怪头顶光环色点 (先杀光环来源 = 反制点)
    if (m.aura) {
      const auraColor = AURA_DEFS[m.aura].color;
      drawSprite(gl, quad, res, { x: sp.x + m.size.w / 2 - 4, y: sp.y - 13 }, { w: 8, h: 8 }, 'ui', 'slide_horizontal_color', { color: auraColor });
    }
    // A-W4 双元素标记: 副元素色点 (主元素已由 hue 染色整图, 副元素在头顶右偏)
    if (m.subElement) {
      const subColor = ELEMENT_DEFS[m.subElement].color;
      drawSprite(gl, quad, res, { x: sp.x + m.size.w / 2 + 5, y: sp.y - 13 }, { w: 7, h: 7 }, 'ui', 'slide_horizontal_color', { color: subColor });
    }
    // 机制标记 (A-W3 包2): 精英/领主头像下色条 (盾=青 爆炸=橙 荆棘=绿 诅咒=紫 死亡=红)
    if (m.mech) {
      const mechBar: Record<string, [number, number, number]> = {
        shield: [0.4, 0.9, 1],
        explode: [1, 0.6, 0.2],
        thorns: [0.5, 1, 0.5],
        curse: [0.8, 0.5, 1],
        death_trigger: [1, 0.4, 0.4],
      };
      const mc = mechBar[m.mech];
      drawSprite(gl, quad, res, { x: sp.x, y: sp.y + m.size.h - 2 }, { w: m.size.w, h: 3 }, 'ui', 'slide_horizontal_color', { color: mc });
    }
    // 护盾弧 (A-W3 shield): 开盾期间青色光环 (可读性=反制: 开盾别打/破盾集火)
    if (m.mech === 'shield' && m.shieldT > 0) {
      const shPulse = 0.85 + 0.15 * Math.sin((performance.now() / 1000) * 10 + m.pos.x);
      const shR = Math.max(m.size.w, m.size.h) * (0.75 + 0.1 * shPulse);
      drawSprite(gl, quad, res, { x: sp.x + m.size.w / 2 - shR, y: sp.y + m.size.h / 2 - shR }, { w: shR * 2, h: shR * 2 }, 'particles', 'circle_01', { color: [0.4, 0.9, 1], blend: 'add' });
    }
    // 燃烧 DOT 火焰附着 (UX_REVIEW P2): 着火怪冒火 (火焰微抖动)
    if (m.burnT > 0) {
      const ft = performance.now() / 1000;
      const f1 = Math.sin(ft * 14 + m.pos.x) * 4;
      drawSprite(gl, quad, res, { x: sp.x + m.size.w / 2 - 7 + f1, y: sp.y + m.size.h / 2 - 10 }, { w: 14, h: 14 }, 'particles', 'flame_01', { color: [1, 0.55, 0.2], blend: 'add' });
      drawSprite(gl, quad, res, { x: sp.x + m.size.w / 2 + 3 - f1, y: sp.y + m.size.h / 2 - 5 }, { w: 10, h: 10 }, 'particles', 'flame_02', { color: [1, 0.7, 0.3], blend: 'add' });
    }
    // 荆棘环绕 (UX_REVIEW P2): 绿刺环 (反伤怪标记)
    if (m.mech === 'thorns') {
      const thR = Math.max(m.size.w, m.size.h) * 0.72;
      drawSprite(gl, quad, res, { x: sp.x + m.size.w / 2 - thR, y: sp.y + m.size.h / 2 - thR }, { w: thR * 2, h: thR * 2 }, 'particles', 'circle_02', { color: [0.5, 1, 0.5], blend: 'add' });
    }

    // A-W3 扑击预警圈 (leap): 蓄力 0.4s 落点圈可见 → 翻滚躲避
    if (m.moveAI === 'leap' && m.leapT > 0) {
      const warn = m.leapT / LEAP_WINDUP;
      drawSprite(gl, quad, res, { x: sp.x - 8, y: sp.y + m.size.h - 6 }, { w: m.size.w + 16, h: 4 }, 'ui', 'slide_horizontal_color', { color: [1, 0.4, 0.2] });
      void warn;
    }
    // A-W3 遁地土痕 (burrow): 地下移动的可见痕迹 → 预判落点
    if (m.moveAI === 'burrow' && m.burrowT > 0) {
      drawSprite(gl, quad, res, { x: sp.x, y: sp.y }, { w: m.size.w, h: m.size.h }, 'ui', 'slide_horizontal_color', { color: [0.75, 0.65, 0.4] });
    }

    // A-W3 激光预警条 (laser): 蓄力 0.8s 方向线可见 → 站开躲避
    if (m.laserT > 0) {
      const lx = state.player.pos.x - m.pos.x;
      const ly = state.player.pos.y - m.pos.y;
      const len = Math.hypot(lx, ly) || 1;
      const nx = lx / len, ny = ly / len;
      const x0 = sp.x + m.size.w / 2;
      const y0 = sp.y + m.size.h / 2;
      const x1 = x0 + nx * 300;
      const y1 = y0 + ny * 300;
      // 用细长条近似激光方向 (分段画)
      for (let seg = 0; seg < 10; seg++) {
        const t0 = seg / 10, t1 = (seg + 1) / 10;
        const sx = x0 + (x1 - x0) * t0 - 2;
        const sy = y0 + (y1 - y0) * t0;
        drawSprite(gl, quad, res, { x: sx, y: sy }, { w: 4, h: 30 }, 'ui', 'slide_horizontal_color', { color: [1, 0.3, 0.3] });
        void t1;
      }
    }

    // 蓄力条 (V1): 前摇进度, 满条 = 即将出手
    if (charging) {
      const windFrac = rangedWind ? m.attackCd / 0.35 : m.aiCd / 0.6;
      drawSprite(gl, quad, res, { x: sp.x, y: sp.y - 8 }, { w: m.size.w * windFrac, h: 3 }, 'ui', 'slide_horizontal_color');
      drawSprite(gl, quad, res, { x: sp.x + m.size.w * windFrac, y: sp.y - 8 }, { w: m.size.w * (1 - windFrac), h: 3 }, 'ui', 'slide_horizontal_grey');
    }
    // HP 条
    const frac = Math.max(0, m.hp) / def.hp;
    const barW = m.size.w;
    const barH = 3;
    drawSprite(gl, quad, res, { x: sp.x, y: sp.y - 5 }, { w: barW * frac, h: barH }, 'ui', 'slide_horizontal_color');
    drawSprite(gl, quad, res, { x: sp.x + barW * frac, y: sp.y - 5 }, { w: barW * (1 - frac), h: barH }, 'ui', 'slide_horizontal_grey');
  }

  // === VFX (UX_REVIEW §8.3): 扩散环/爆裂/闪电链/辉光 (additive, tint×fade 淡出) ===
  const vfxs = getVfx(state);
  for (const v of vfxs) {
    const f = Math.min(1, v.t / v.dur);
    const fade = 1 - f;
    const col: [number, number, number] = [v.color[0] * fade, v.color[1] * fade, v.color[2] * fade];
    const sp = worldToScreen(state, { x: v.x, y: v.y });
    if (v.kind === 'ring') {
      const r = v.r0 + (v.r1 - v.r0) * (1 - (1 - f) * (1 - f));
      drawSprite(gl, quad, res, { x: sp.x - r, y: sp.y - r }, { w: r * 2, h: r * 2 }, 'particles', v.sprite, { color: col, blend: 'add', rot: v.rot0 + (v.rot1 - v.rot0) * f });
    } else if (v.kind === 'glow') {
      const r = v.r0 + (v.r1 - v.r0) * f;
      drawSprite(gl, quad, res, { x: sp.x - r, y: sp.y - r }, { w: r * 2, h: r * 2 }, 'particles', v.sprite, { color: col, blend: 'add' });
    } else if (v.kind === 'burst') {
      for (const d of v.dirs ?? []) {
        const px = sp.x + d.x * v.t;
        const py = sp.y + d.y * v.t;
        const s = (v.size ?? 7) * (1 - f * 0.7);
        drawSprite(gl, quad, res, { x: px - s / 2, y: py - s / 2 }, { w: s, h: s }, 'particles', v.sprite, { color: col, blend: 'add' });
      }
    } else if (v.kind === 'bolt') {
      const p0 = worldToScreen(state, { x: v.x, y: v.y });
      const p1 = worldToScreen(state, { x: v.tx ?? v.x, y: v.ty ?? v.y });
      const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      if (len < 2) continue;
      const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
      const mx = (p0.x + p1.x) / 2;
      const my = (p0.y + p1.y) / 2;
      drawSprite(gl, quad, res, { x: mx - len / 2, y: my - (v.thickness ?? 5) / 2 }, { w: len, h: v.thickness ?? 5 }, 'particles', 'light_01', { color: col, blend: 'add', rot: ang });
    }
  }

  // 装备 (Loot) - 4 阶稀有度上色, 玩家走过即拾
  for (const eq of getLoot(state)) {
    const sp = worldToScreen(state, eq.pos);
    if (sp.x + eq.size.w < 0 || sp.x > state.viewport.w) continue;
    if (sp.y + eq.size.h < 0 || sp.y > state.viewport.h) continue;
    drawSprite(gl, quad, res, sp, eq.size, 'particles', 'spark_03', { color: RARITY_COLORS[eq.rarity], blend: 'add' });
  }
  const picked = pickupLoot(state);
  for (const eq of picked) {
    const affix = eq.affixes.map(describeAffix).join(' ');
    inf('loot', `picked ${eq.rarity} ${eq.name} (${affix})`);
    const col = RARITY_COLORS[eq.rarity].map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
    pushToast(state, `${eq.name}${affix ? ' — ' + affix : ''}`, `#${col}`);
    playSfxClient('pickup');  // OPT-025
  }

  const sprite = pickPlayerSprite(state, mouse.state().pos.x);
  const bob = Math.sin(state.player.idleT * Math.PI * 1.2) * 1;
  const playerScreen = worldToScreen(state, state.player.pos);
  drawSprite(
    gl, quad, res,
    { x: playerScreen.x, y: playerScreen.y + bob },
    state.player.size,
    'characters', sprite.name,
    { flip: { x: sprite.flipX ? -1 : 1, y: 1 }, rot: sprite.rot },
  );

  // 诅咒减速标记 (UX_REVIEW P2): 玩家紫雾环绕 (curseT > 0)
  if ((state.player.curseT ?? 0) > 0) {
    const ct = performance.now() / 1000;
    const cR = 30 + Math.sin(ct * 6) * 4;
    drawSprite(gl, quad, res, { x: playerScreen.x + state.player.size.w / 2 - cR, y: playerScreen.y + state.player.size.h / 2 - cR }, { w: cR * 2, h: cR * 2 }, 'particles', 'circle_02', { color: [0.75, 0.45, 1], blend: 'add' });
  }

  drawHud(gl, quad, state);
  drawHudOverlay(hudCtx, state);

  // 暂停遮罩 (Canvas2D 文字层; 装备面板时全屏面板代替)
  if (state.screen === 'pause') {
    hudCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
    hudCtx.textAlign = 'center';
    if (!state.settingsOpen) {
      hudCtx.fillStyle = '#fff';
      hudCtx.font = 'bold 48px monospace';
      hudCtx.textBaseline = 'middle';
      hudCtx.fillText('PAUSED', hudCanvas.width / 2, hudCanvas.height / 2 - 60);
      hudCtx.font = '20px monospace';
      hudCtx.fillStyle = '#ddd';
      hudCtx.fillText('1 继续 · 2 设置 · 3 主菜单 · 4 城镇 · P 存档', hudCanvas.width / 2, hudCanvas.height / 2);
      hudCtx.fillStyle = '#777';
      hudCtx.font = '14px monospace';
      hudCtx.fillText('Ctrl+1..6 分配技能点 · P 存档', hudCanvas.width / 2, hudCanvas.height / 2 + 34);
    } else {
      // 设置面板 (C8: 与标题共用 drawSettingsPanel, 含滑条/键位自定义)
      drawSettingsPanel();
    }
    hudCtx.textAlign = 'left';
  }

  // 死亡结算屏 (OPT-011, B1): 结算信息 + 三选 (硬核二选)
  if (state.screen === 'death' && state.deathSummary) {
    const ds = state.deathSummary;
    hudCtx.fillStyle = 'rgba(120, 0, 0, 0.7)';
    hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
    hudCtx.textAlign = 'center';
    hudCtx.textBaseline = 'middle';
    hudCtx.fillStyle = '#fff';
    hudCtx.font = 'bold 56px monospace';
    hudCtx.fillText(ds.hardcore ? '永 久 死 亡' : 'YOU DIED', hudCanvas.width / 2, hudCanvas.height / 2 - 130);
    hudCtx.font = '20px monospace';
    hudCtx.fillStyle = '#ddd';
    hudCtx.fillText(`等级 ${ds.level} · 总击杀 ${ds.kills} · 最高连击 ${ds.maxCombo}`, hudCanvas.width / 2, hudCanvas.height / 2 - 70);
    hudCtx.fillText(`金币 ${ds.gold} · 击杀者: ${ds.killer ?? '未知'}`, hudCanvas.width / 2, hudCanvas.height / 2 - 40);
    hudCtx.fillStyle = '#bbb';
    hudCtx.font = '15px monospace';
    if (ds.hardcore) {
      hudCtx.fillText('硬核: 角色进度将清空 (装备/等级/技能/符文)', hudCanvas.width / 2, hudCanvas.height / 2);
    } else {
      hudCtx.fillText('回城: 损失 25% 金币 + 补满药水', hudCanvas.width / 2, hudCanvas.height / 2);
      hudCtx.fillText('原地复活: 损失 10% 金币, 药水不补, 5 秒无敌', hudCanvas.width / 2, hudCanvas.height / 2 + 28);
    }
    hudCtx.fillStyle = '#ffd64a';
    hudCtx.font = 'bold 18px monospace';
    if (ds.hardcore) {
      hudCtx.fillText('[1] 重开新局(清档)   [2] 主菜单', hudCanvas.width / 2, hudCanvas.height / 2 + 80);
    } else {
      hudCtx.fillText('[1] 回城   [2] 原地复活   [3] 重开', hudCanvas.width / 2, hudCanvas.height / 2 + 80);
      // C (死亡撤销): 第 4 按钮 + 倒计时 (5s 窗口)
      const ux = hudCanvas.width / 2, uy = hudCanvas.height / 2 + 120;
      const uR: [number, number, number, number] = [ux - 150, uy, 300, 36];
      const uHit = state.deathUndo > 0 && inRect(mouse.state().pos.x, mouse.state().pos.y, ...uR);
      hudCtx.fillStyle = state.deathUndo > 0 ? (uHit ? 'rgba(140,255,140,0.18)' : 'rgba(40,70,40,0.7)') : 'rgba(30,30,34,0.5)';
      hudCtx.fillRect(...uR);
      hudCtx.strokeStyle = state.deathUndo > 0 ? '#8f8' : '#444';
      hudCtx.lineWidth = uHit ? 2 : 1;
      hudCtx.strokeRect(...uR);
      hudCtx.fillStyle = state.deathUndo > 0 ? '#8f8' : '#8a8a96';
      hudCtx.font = 'bold 15px monospace';
      hudCtx.fillText(state.deathUndo > 0 ? `[4] 撤销死亡 (${state.deathUndo.toFixed(1)}s · 免费)` : '撤销窗口已过', ux, uy + 18);
    }
    hudCtx.textAlign = 'left';
  }

  // 通关结算屏 (OPT-012): 用时/击杀/得分 + 再来一局/回城
  if (state.screen === 'victory') {
    hudCtx.fillStyle = 'rgba(10, 20, 40, 0.82)';
    hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
    hudCtx.textAlign = 'center';
    hudCtx.textBaseline = 'middle';
    hudCtx.fillStyle = '#ffd64a';
    hudCtx.font = 'bold 52px monospace';
    hudCtx.fillText('★ 通 关 ★', hudCanvas.width / 2, hudCanvas.height / 2 - 130);
    hudCtx.fillStyle = '#fff';
    hudCtx.font = '20px monospace';
    hudCtx.fillText(`用时 ${formatTime(state.run.timeSec)} · 击杀 ${state.run.kills} · 难度 ${DIFFICULTY_MODS[state.difficulty].name}`, hudCanvas.width / 2, hudCanvas.height / 2 - 60);
    hudCtx.fillText(`得分 ${state.score} · 掉落入背包 ${state.run.collectedLoot} 件`, hudCanvas.width / 2, hudCanvas.height / 2 - 30);
    if (state.run.best[state.difficulty] !== undefined) {
      hudCtx.fillStyle = '#aaa';
      hudCtx.font = '15px monospace';
      hudCtx.fillText(`最佳记录 ${formatTime(state.run.best[state.difficulty]!)}`, hudCanvas.width / 2, hudCanvas.height / 2);
    }
    hudCtx.fillStyle = '#ffd64a';
    hudCtx.font = 'bold 18px monospace';
    hudCtx.fillText('[1] 再来一局(同难度)   [2] 回城', hudCanvas.width / 2, hudCanvas.height / 2 + 70);
    hudCtx.textAlign = 'left';
  }

  // A-W1 门结算面板 (portal): 回城/继续
  if (state.screen === 'portal') {
    hudCtx.fillStyle = 'rgba(8, 8, 24, 0.85)';
    hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
    hudCtx.textAlign = 'center';
    hudCtx.textBaseline = 'middle';
    hudCtx.fillStyle = '#c9aaff';
    hudCtx.font = 'bold 40px monospace';
    hudCtx.fillText('传 送 门', hudCanvas.width / 2, hudCanvas.height / 2 - 90);
    hudCtx.fillStyle = '#fff';
    hudCtx.font = '18px monospace';
    hudCtx.fillText('Boss 已击败 — 本局可结算', hudCanvas.width / 2, hudCanvas.height / 2 - 40);
    hudCtx.fillStyle = '#bbb';
    hudCtx.font = '14px monospace';
    hudCtx.fillText('回城: 战利品/经验/材料保留 (无通关加成)', hudCanvas.width / 2, hudCanvas.height / 2);
    hudCtx.fillText('继续: 留在本局, 门仍在 Boss 死亡位', hudCanvas.width / 2, hudCanvas.height / 2 + 26);
    hudCtx.fillStyle = '#ffd64a';
    hudCtx.font = 'bold 20px monospace';
    const pmx = mouse.state().pos.x;
    const pmy = mouse.state().pos.y;
    const pw = hudCanvas.width / 2, phh = hudCanvas.height / 2;
    if (inRect(pmx, pmy, pw - 210, phh + 58, 200, 44)) {
      hudCtx.fillStyle = 'rgba(255,214,74,0.15)';
      hudCtx.fillRect(pw - 210, phh + 58, 200, 44);
      hudCtx.fillStyle = '#ffd64a';
    }
    hudCtx.fillText('[1] 回城结算', pw - 110, phh + 80);
    if (inRect(pmx, pmy, pw + 10, phh + 58, 200, 44)) {
      hudCtx.fillStyle = 'rgba(255,214,74,0.15)';
      hudCtx.fillRect(pw + 10, phh + 58, 200, 44);
      hudCtx.fillStyle = '#ffd64a';
    }
    hudCtx.fillText('[2] 继续战斗', pw + 110, phh + 80);
    hudCtx.textAlign = 'left';
    hudCtx.textBaseline = 'top';
  }

  // dungeon HUD: 门前提示 (V 交互); Boss 死后未交互 → 持续引导到门
  if (state.screen === 'dungeon' && portalActive(state)) {
    hudCtx.textAlign = 'center';
    hudCtx.fillStyle = '#ffd64a';
    hudCtx.font = 'bold 15px monospace';
    if (nearPortal(state)) {
      hudCtx.fillText('[V] 打开传送门', hudCanvas.width / 2, hudCanvas.height - 60);
    } else if (state.run.portal) {
      const dx = state.run.portal.x - (state.player.pos.x + state.player.size.w / 2);
      const dy = state.run.portal.y - (state.player.pos.y + state.player.size.h / 2);
      const dist = Math.hypot(dx, dy);
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? '→' : '←') : (dy > 0 ? '↓' : '↑');
      hudCtx.fillStyle = '#ccaaff';
      hudCtx.fillText(`传送门 ${dir} (${Math.round(dist / 40)}格) — 前往回城结算`, hudCanvas.width / 2, hudCanvas.height - 60);
    }
    hudCtx.textAlign = 'left';
  }

  // v4 首局引导: 3 步气泡 (底部中央; 按键/点击/4s 自动跳)
  if (state.screen === 'dungeon' && state.tutorStep >= 0 && state.tutorStep < 3) {
    const TUTOR_MSGS = [
      'WASD 移动 — 向鼠标方向前进',
      '鼠标左键 攻击 · 右键 重击 · 躲避弹幕用 Space 翻滚',
      'Q / F / E / R 施放技能 — 直接点击下方技能栏、药水、翻滚也可以',
    ];
    const msg = TUTOR_MSGS[state.tutorStep];
    const bw = 640, bh = 54, bx = hudCanvas.width / 2 - bw / 2, by = hudCanvas.height - 168;
    hudCtx.fillStyle = 'rgba(10,10,20,0.9)';
    hudCtx.fillRect(bx, by, bw, bh);
    hudCtx.strokeStyle = '#66ccff';
    hudCtx.lineWidth = 2;
    hudCtx.strokeRect(bx, by, bw, bh);
    hudCtx.textAlign = 'center';
    hudCtx.textBaseline = 'middle';
    hudCtx.fillStyle = '#fff';
    hudCtx.font = 'bold 16px monospace';
    hudCtx.fillText(`[${state.tutorStep + 1}/3] ${msg}`, hudCanvas.width / 2, by + 20);
    hudCtx.fillStyle = '#9aa';
    hudCtx.font = '12px monospace';
    hudCtx.fillText('任意按键 / 点击跳过', hudCanvas.width / 2, by + 42);
    hudCtx.textAlign = 'left';
    hudCtx.textBaseline = 'top';
  }

  // B-V2 Boss 入场演出: 横幅 + 全屏泛光脉动 (2.8s 倒计时)
  if (state.bossIntroT > 0) {
    const t = state.bossIntroT;
    const fadeIn = Math.min(1, (2.8 - t) / 0.4);
    const pulse = 0.5 + 0.5 * Math.sin(t * 8);
    // 边缘泛红脉动
    hudCtx.fillStyle = `rgba(160, 20, 30, ${0.18 * pulse * fadeIn})`;
    hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
    hudCtx.fillStyle = `rgba(160, 20, 30, ${0.3 * pulse * fadeIn})`;
    hudCtx.fillRect(0, hudCanvas.height / 2 - 90, hudCanvas.width, 180);
    // 横幅文字
    hudCtx.textAlign = 'center';
    hudCtx.textBaseline = 'middle';
    hudCtx.fillStyle = `rgba(255, 90, 90, ${fadeIn})`;
    hudCtx.font = 'bold 64px monospace';
    hudCtx.fillText(state.bossIntroTitle, hudCanvas.width / 2, hudCanvas.height / 2 - 30);
    hudCtx.fillStyle = `rgba(255, 220, 150, ${fadeIn})`;
    hudCtx.font = 'bold 24px monospace';
    hudCtx.fillText(state.bossIntroText, hudCanvas.width / 2, hudCanvas.height / 2 + 26);
    hudCtx.textAlign = 'left';
    hudCtx.textBaseline = 'top';
  }

  mouse.reset();
}

/** BGM 交叉淡化 (OPT-027): 1s 淡出 → 切曲 → 1s 淡入; 复用 setVolumeClient */
let bgmFadeTimer: number | null = null;
function fadeBgm(name: string, vol: number): void {
  if (bgmFadeTimer !== null) { clearInterval(bgmFadeTimer); bgmFadeTimer = null; }
  const STEPS = 10;
  let i = 0;
  bgmFadeTimer = window.setInterval(() => {
    i++;
    if (i <= STEPS) {
      setVolumeClient(Math.max(0, vol * (1 - i / STEPS)));
    } else {
      clearInterval(bgmFadeTimer!);
      bgmFadeTimer = null;
      playBgmClient(name);
      let j = 0;
      const up = window.setInterval(() => {
        j++;
        setVolumeClient(Math.min(1, vol * (j / STEPS)));
        if (j >= STEPS) clearInterval(up);
      }, 100);
    }
  }, 100);
}


/** 主题环境粒子色 (OPT-027) */
const THEME_ENV_COLOR: Record<Theme, [number, number, number]> = {
  forest: [0.55, 1, 0.4], desert: [1, 0.85, 0.4], ruin: [0.55, 0.85, 1], void: [0.7, 0.4, 1],
};

/** 环境粒子生成 (OPT-027): 视口内随机飘落, 上限 40 */
function spawnEnvFx(state: GameState, dt: number): void {
  if (state.envFx.length >= 40) return;
  if (Math.random() > 0.35 * dt * 60) return;
  const cx = state.camera.x + state.viewport.w / 2;
  const cy = state.camera.y + state.viewport.h / 2;
  state.envFx.push({
    x: cx + (Math.random() - 0.5) * state.viewport.w,
    y: cy + (Math.random() - 0.5) * state.viewport.h,
    vx: (Math.random() - 0.5) * 12,
    vy: -8 - Math.random() * 16,
    t: 0,
    life: 3 + Math.random() * 2,
  });
}

function updateEnvFx(state: GameState, dt: number): void {
  const nxt = [];
  for (const p of state.envFx) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.t += dt;
    if (p.t < p.life) nxt.push(p);
  }
  state.envFx = nxt;
}

/** 当前局完整快照 → 存档负载 (OPT-002: P 键 / 回菜单 / 关窗共用) */
function buildSavePayload(state: GameState): SaveData {
  return buildSavePayloadApp(state);
}

/** 继续最近角色 (标题 [O], 键盘/点击共用): 读最近角色档 → 按场景分派 */
function continueLastSave(): void {
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
    state.titleMsg = '';
    inf('save', `读档并继续 (角色 ${state.currentChar}, 含账号层)`);
  }).catch((err: unknown) => { state.titleMsg = `无存档或读档失败: ${String(err)}`; wrn('save', String(err)); });
}

/** 读档场景分派 (v11): 上次在城镇 → 进城镇整理; 否则进地牢继续 */
function resumeFromSave(state: GameState, d: { scene?: string }): void {
  if (d.scene === 'town') {
    state.mode = 'town';
    state.townPanel = null;
    state.player.pos = { x: 560, y: 500 };
    setScreen(state, 'town');
    inf('ui', `读档 → 城镇 (${TOWN_DEFS[state.townId]?.name ?? state.townId})`);
  } else {
    ensureDungeonRun(state);
    setScreen(state, 'dungeon');
    inf('ui', '读档 → 地牢继续');
  }
}

/** 进入/切换角色 (v4 复用: 列表 Enter / 大按钮 / 最近 3 快捷卡) */
function enterTargetCharacter(state: GameState, target: CharacterSummary): void {
  if (target.id === state.currentChar) {
    // 同一角色: 按内存场景直接回位 (城镇整理 / 地牢继续)
    if (state.mode === 'town') {
      state.townPanel = null;
      setScreen(state, 'town');
    } else {
      ensureDungeonRun(state);
      setScreen(state, 'dungeon');
    }
    state.titleMsg = '';
    inf('ui', `继续角色 ${target.id}`);
    return;
  }
  // 切换角色: 先存当前, 再读目标
  state.currentChar = target.id;
  loadGame(target.id).then(d => {
    bindClass(state, (d.class as ClassId) ?? 'barbarian');
    state.player.pos.x = d.player_x; state.player.pos.y = d.player_y;
    state.player.hp = d.player_hp; state.player.mp = d.player_mp;
    state.player.facing.x = d.facing_x; state.player.facing.y = d.facing_y;
    state.score = d.score; state.player.gold = d.gold ?? 0;
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
    state.titleMsg = '';
    void persistNowApp(state);  // 更新 last_char
    inf('save', `切换到角色 ${target.id} (Lv${d.level ?? 1} ${d.class ?? 'barbarian'})`);
  }).catch((err: unknown) => {
    // 新建但未开局的角色无存档: 直接以该职业开新局 (normal/forest)
    const cls = (target.class as ClassId) ?? 'barbarian';
    bindClass(state, cls);
    startRun(state, 'forest', 'normal');
    setScreen(state, 'dungeon');
    state.titleMsg = '';
    void persistNowApp(state);
    inf('save', `角色 ${target.id} 无存档, 以 ${CLASS_DEFS[cls].name} 开新局 (${String(err)})`);
  });
}

/** 施法失败反馈 (OPT-007): toast 区分 MP/CD; 主技能槽 0.4s 红闪 */
function notifyCastFail(state: GameState, slot: SkillSlot): void {
  const sk = getSkill(slot);
  const msg = state.player.mp < sk.mpCost ? 'MP 不足' : '冷却中';
  pushToast(state, `${sk.name}: ${msg}`, '#ff5555');
  if (slot === 'Q' || slot === 'W' || slot === 'E' || slot === 'R') {
    state.castFailFlash = { slot, t: 0.4 };
  }
}

/** 战斗 HUD 按钮点击 (技能栏 4 槽 / 药水 HP·MP / 翻滚): 与键盘 Q·F·E·R / 1·2 / Space 同行为 */
function handleHudClick(state: GameState, key: string, aimDir: { x: number; y: number }, nowSec: number): void {
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

/** 鼠标 UI 点击 (C-501): 命中测试各屏关键 UI, 返回是否消费 */
/** 鼠标点击主入口: 委托给 app/uiDispatch.ts (US-031) */
function handleUiClick(state: GameState, mx: number, my: number): boolean {
  const uiCtx = buildUiCtx(state, mx, my, {
    confirmCloseSave, confirmCloseCancel, continueLastSave,
    enterTargetCharacter, titleAct, handleSettingsClick, handleTownPanelKey,
    startFromNewgame, startCreateNewgame, enterTown, startRun,
    hardcoreWipe, revivePlayer, leaveThroughPortal, setScreen, resumeScreen,
    deathGoldPenalty, loadLastNg,
  });
  return handleUiClickDispatch(uiCtx);
}

/** 难度切换入口 (OPT-015): 未解锁拒绝 + toast; 硬核走二段确认 (OPT-006) */
function requestDifficulty(state: GameState, d: Difficulty): void {
  if (d === state.difficulty) return;
  if (!unlockedDifficulty(state.cleared, d)) {
    pushToast(state, `${DIFFICULTY_MODS[d].name} 未解锁 (通关前置)`, '#f66');
    return;
  }
  if (d === 'hardcore') {
    state.pendingDifficulty = d;
    state.confirmHardcore = true;
    return;
  }
  state.difficulty = d;
  inf('game', `难度 → ${DIFFICULTY_MODS[d].name}`);
}

/** 硬核永久死亡 (D-09): 清空装备/等级/技能/符文 (OPT-011 死亡结算"重开"路径调用) */
function hardcoreWipe(state: GameState): void {
  getOwned(state).length = 0;
  recomputeCombat(state);
  state.player.level = 1;
  state.player.exp = 0;
  state.player.skillPoints = 0;
  state.materials = emptyMaterials();  // M5 W4 C-401: 硬核清档含材料
  state.player.passives = {};
  recomputePassives(state);  // v9: 硬核清档含被动
  for (const slot of SKILL_SLOTS) {
    const sk = getSkill(slot);
    sk.level = 1;
    sk.rune = null;
  }
  state.rejectedRunes.length = 0;
  inf('game', 'HARDCORE: 永久死亡, 进度已清空');
}

/** 原地复活 (OPT-011): 满血蓝 + 5s 无敌, 药水不补 (死亡不再自动补满) */
function revivePlayer(state: GameState): void {
  state.player.hp = 100;
  state.player.mp = 100;
  state.reviveInvuln = 5;
  state.player.dodgeT = 0;
  state.player.dodgeCd = 0;
  state.fireballs.length = 0;
  inf('gl', 'revived in place (5s invuln)');
}

requestAnimationFrame(loop);