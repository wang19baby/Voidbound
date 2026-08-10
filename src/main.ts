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
import { getActiveWalls, type Wall } from './game/world';
import { drawSprite } from './render/draw';
import { drawHud, drawHudOverlay, setMouseReticle } from './render/hud';
import { makeCooldown } from './game/cooldown';
import { tryCastSlot, updateSwings, getSwings, assignSkillPoint, chooseRune, rejectRune, skillRune, getSkill, SKILL_SLOTS, slotDisplay, type SkillSlot } from './game/skill';
import { RUNE_DEFS, type RuneId } from './game/rune';
import { spawnMonster, spawnRunPool, updateMonsters, resolveFireballHits, resolveMeleeHits, MONSTER_DEFS, THEME_BOSS, updateEnemyProj, getEnemyProj } from './game/monster';
import { saveGame, loadGame, saveAccount, loadAccount, listCharacters, deleteCharacter, type SaveData, type SaveAccount, type CharacterSummary } from './ipc/save';
import { pickupLoot, getLoot, getOwned, getEquippedValues, allocEquipmentId, recomputeCombat, equipItem, unequipSlot, itemPowerDelta, cullLoot, collectAllLoot, clearGroundLoot, RARITY_COLORS, describeAffix, getItemSellPrice, getItemBuyPrice, EQUIP_SLOTS, EQUIP_NAMES, type EquipType, type Equipment } from './game/equipment';
import { TOWN_NPCS, nearestNpc, genMerchantStock, buyItem, sellItem, rerollOwned, buyPotion, POTION_PRICES, warehouseStore, warehouseTake, WAREHOUSE_CAP, type TownPanel, type MerchantStock } from './game/town';
import { playBgmClient, setVolumeClient } from './ipc/sfx';
import { baseCombat } from './game/combat';
import { DIFFICULTIES, DIFFICULTY_MODS, cycleDifficulty, cycleDifficultyGated, unlockedDifficulty, type Difficulty } from './game/difficulty';
import { spawnDamageNum, getDamageNums, updateDamageNums } from './game/damageNum';
import { moveGridSel, flipPage, pageStart, pageOf, cellIndex, slotRects, inRect, EQ_LAYOUT } from './game/uigrid';
import { pushToast, getToasts, updateToasts } from './game/toast';
import { deathSummary, deathGoldPenalty, type DeathSummary } from './game/deathSettle';
import { moveSelection, ngResolve, ngDefault, themeUnlocked, type NewgameSel } from './game/newgame';
import { bindClass, CLASS_DEFS, CLASS_IDS, type ClassId } from './game/class';
import { DAMAGE_TYPE_COLORS } from './game/combat';
import { getSkillCooldowns } from './game/cooldown';
import { updateDeathFx, getDeathFx, spawnDeathFx } from './game/deathFx';
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
inf('gl', 'shader program + quad VAO ready');

inf('atlas', 'loading 6 atlases...');
  invoke('js_log', { msg: '[boot] loading atlases' }).catch(() => {});

const [characters, particles, ui, icons, world, monsters] = await Promise.all([
  loadAtlas('characters'),
  loadAtlas('particles'),
  loadAtlas('ui'),
  loadAtlas('icons'),
  loadAtlas('world'),
  loadAtlas('monsters'),
]);
inf('atlas', `loaded: ${[characters, particles, ui, icons, world, monsters].map(a => `${a.name}(${a.width}x${a.height},${a.sprites.length})`).join(' ')}`);
const res = await buildRenderResources(gl, [characters, particles, ui, icons, world, monsters]);
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
  },
  viewport: { w: VW, h: VH },
  world: {
    w: WORLD_W, h: WORLD_H,
    walls: [] as Wall[],
    floorPos: { x: 0, y: 0 },
    floorSize: { w: WORLD_W, h: WORLD_H },
  },
  camera: { x: 0, y: 0 },
  fireballs: [] as import('./game/state').Fireball[],
  fireballSize: 32,
  monsters: [] as import('./game/monster').Monster[],
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
  settingsOpen: false,
  screen: 'title' as Screen,
  pauseFrom: 'dungeon' as Screen,
  ngSel: ngDefault(),
  titleMsg: '',
  difficulty: 'normal' as Difficulty,
  run: emptyRun('forest'),
  killsTotal: 0,
  combo: { count: 0, timer: 0 },
  levelUpFlash: 0,
  volume: 0.8,
  equipSel: 0,
  equipPage: 0,
  cleared: [],
  legacy: [] as Array<{ slot: SkillSlot; rune: RuneId }>,
  confirmHardcore: false,
  pendingDifficulty: null,
  castFailFlash: null,
  cameraShake: 0,
  lastKiller: null,
  envFx: [],
  resources: res,
  // M5 W2 多角色 (C-201~203): 当前角色 / 角色列表 / 选中索引 / 新建流程
  currentChar: 'char_0',
  charList: [] as CharacterSummary[],
  charSel: 0,
  charCreating: false,
  charConfirmDel: false,
  // C-503 仓库: 账号层共享 (跨角色)
  warehouse: [] as Equipment[],
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


window.addEventListener('keydown', (e) => {
  // 符文三选一: 1/2/3 选择, Esc 拒绝 (优先于其他按键)
  if (state.runeChoice) {
    if (e.key === '1' || e.key === '2' || e.key === '3') {
      chooseRune(state, Number(e.key) - 1);
      return;
    }
    if (e.key === 'Escape' || e.key === '0') {
      rejectRune(state);
      return;
    }
    return;
  }
  // 硬核二段确认 (OPT-006/015): 全界面阻塞, Y 确认 / Esc·1 取消
  if (state.confirmHardcore) {
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
    } else if (k === 'escape' || k === '1') {
      state.confirmHardcore = false;
      state.pendingDifficulty = null;
      inf('game', '硬核切换取消');
    }
    return;
  }
  // 标题画面 (GAME_FLOW §1.2): 1 开始 / 2 设置 / R 读档 / Esc 关设置
  if (state.screen === 'title') {
    const k = e.key.toLowerCase();
    if (k === '2') { state.settingsOpen = !state.settingsOpen; return; }
    if (state.settingsOpen) {
      if (k === 'escape') { state.settingsOpen = false; return; }
      if (k === 'n') { requestDifficulty(state, cycleDifficultyGated(state.difficulty, state.cleared)); state.titleMsg = `难度 → ${DIFFICULTY_MODS[state.difficulty].name}`; return; }
      if (k === 'f') { void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().isFullscreen().then(fs => getCurrentWindow().setFullscreen(!fs))); return; }
      if (k === '+' || k === '=') { state.volume = Math.min(1, state.volume + 0.05); setVolumeClient(state.volume); return; }
      if (k === '-' || k === '_') { state.volume = Math.max(0, state.volume - 0.05); setVolumeClient(state.volume); return; }
      return;
    }
    if (k === '1') {
      state.ngSel = { classIdx: CLASS_IDS.indexOf(state.player.classId), diffIdx: DIFFICULTIES.indexOf(state.difficulty), themeIdx: THEMES.indexOf(state.theme) };
      setScreen(state, 'newgame');
      state.titleMsg = '';
      inf('ui', '新游戏 → 选择屏');
    }
    else if (k === 'r') {
      // C-202 角色管理: 拉列表进角色屏
      listCharacters().then(list => {
        state.charList = list;
        state.charSel = Math.max(0, list.findIndex(c => c.id === state.currentChar));
        state.charCreating = false;
        state.charConfirmDel = false;
        setScreen(state, 'characters');
        state.titleMsg = '';
        inf('ui', `角色管理: ${list.length} 个角色`);
      }).catch((err: unknown) => { state.titleMsg = `角色列表读取失败: ${String(err)}`; wrn('save', String(err)); });
    }
    else if (k === 'o') {
      // C-203 继续: 读账号层取最近角色, 再读该角色档
      loadAccount().then(a => {
        const last = (a.last_char && a.last_char.length > 0) ? a.last_char : 'char_0';
        state.currentChar = last;
        return loadGame(last);
      }).then(d => {
        bindClass(state, (d.class as ClassId) ?? 'barbarian');
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
        ensureDungeonRun(state);
        setScreen(state, 'dungeon');
        state.titleMsg = '';
        inf('save', `读档并继续 (角色 ${state.currentChar}, 含账号层)`);
      })
        .catch((err: unknown) => { state.titleMsg = `无存档或读档失败: ${String(err)}`; wrn('save', String(err)); });
    }
    return;
  }
  // 角色管理 (C-202): 列表 ↑/↓ · Enter 进入 · N 新建 · D 删除(二次确认) · Esc 返回标题
  if (state.screen === 'characters') {
    const k = e.key.toLowerCase();
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
      } else if (k === 'escape' || k === 'n') {
        state.charConfirmDel = false;
      }
      return;
    }
    if (state.charCreating) {
      // 新建流程: 1-6 选职业 → 自动命名 "职业_序号" → 直接开局 (职业/难度/主题走 newgame 屏)
      const ci = parseInt(k, 10);
      if (ci >= 1 && ci <= 6) {
        const cls = CLASS_IDS[ci - 1];
        const used = new Set(state.charList.map(c => c.id));
        let n = 0;
        let id = `${cls}_${n}`;
        while (used.has(id)) { n++; id = `${cls}_${n}`; }
        state.currentChar = id;
        state.charList = [...state.charList, {
          id, class: cls, level: 1, difficulty: 'normal', theme: 'forest',
        }];
        state.charCreating = false;
        state.ngSel = { classIdx: CLASS_IDS.indexOf(cls), diffIdx: 0, themeIdx: 0 };
        setScreen(state, 'newgame');
        state.titleMsg = '';
        pushToast(state, `新建角色: ${id} (${CLASS_DEFS[cls].name})`, '#9cf');
        inf('ui', `新建角色 ${id} → 新局选择屏`);
        return;
      }
      if (k === 'escape') { state.charCreating = false; return; }
      return;
    }
    if (k === 'arrowup' || k === 'w') { state.charSel = Math.max(0, state.charSel - 1); return; }
    if (k === 'arrowdown' || k === 's') { state.charSel = Math.min(state.charList.length - 1, state.charSel + 1); return; }
    if (k === 'enter') {
      const target = state.charList[state.charSel];
      if (!target) { state.titleMsg = '没有可选角色 (按 N 新建)'; return; }
      if (target.id === state.currentChar) {
        // 同一角色: 直接继续 (读档)
        setScreen(state, 'dungeon'); state.titleMsg = '';
        ensureDungeonRun(state);
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
        for (const sl of d.skill_levels ?? []) {
          const sk = getSkill(sl.slot);
          if (sk) sk.level = sl.level;
        }
        ensureDungeonRun(state);
        setScreen(state, 'dungeon');
        state.titleMsg = '';
        void persistNow();  // 更新 last_char
        inf('save', `切换到角色 ${target.id} (Lv${d.level ?? 1} ${d.class ?? 'barbarian'})`);
      }).catch((err: unknown) => {
        // 新建但未开局的角色无存档: 直接以该职业开新局 (normal/forest)
        const cls = (target.class as ClassId) ?? 'barbarian';
        bindClass(state, cls);
        startRun(state, 'forest', 'normal');
        setScreen(state, 'dungeon');
        state.titleMsg = '';
        void persistNow();
        inf('save', `角色 ${target.id} 无存档, 以 ${CLASS_DEFS[cls].name} 开新局 (${String(err)})`);
      });
      return;
    }
    if (k === 'n') { state.charCreating = true; state.charConfirmDel = false; return; }
    if (k === 'd') {
      if (state.charList.length > 0) state.charConfirmDel = true;
      return;
    }
    if (k === 'escape') { setScreen(state, 'title'); return; }
    return;
  }
  // 新局选择屏 (OPT-013): 1-5 难度 / ←→或A/D 主题 / Enter 开始 / Esc 返回
  if (state.screen === 'newgame') {
    const k = e.key.toLowerCase();
    const mv = moveSelection(state.ngSel, k);
    if (mv) { state.ngSel = mv; return; }
    if (k === 'enter') {
      const { classId, difficulty, theme } = ngResolve(state.ngSel);
      if (!unlockedDifficulty(state.cleared, difficulty)) {
        pushToast(state, `${DIFFICULTY_MODS[difficulty].name} 未解锁`, '#f66');
        return;
      }
      if (!themeUnlocked(state.cleared, theme)) {
        pushToast(state, `主题 ${theme} 未解锁 (通关森林后开放)`, '#f66');
        return;
      }
      bindClass(state, classId);  // M5 C-103: 新局绑定职业
      startRun(state, theme, difficulty);
      return;
    }
    if (k === 'escape') { setScreen(state, 'title'); return; }
    return;
  }
  // 装备面板 (US-014): Tab 切换 (仅 dungeon), 优先于暂停逻辑
  if (e.code === 'Tab' && state.screen === 'dungeon') {
    e.preventDefault();
    setScreen(state, 'equipment');
    inf('ui', 'equipment panel open');

    return;
  }
  // 装备面板 (C-502): 方向键选格 / PageUp·PageDown·滚轮翻页 / A·Enter 装备 / U 卸下 / Tab·Esc 关闭
  if (state.screen === 'equipment') {
    const k = e.key.toLowerCase();
    if (e.key === 'Escape' || e.code === 'Tab') {
      setScreen(state, 'dungeon');
      inf('ui', 'equipment panel closed');
      return;
    }
    const total = getOwned(state).length;
    if (k === 'arrowup') { state.equipSel = moveGridSel(state.equipSel, 'up', total); return; }
    if (k === 'arrowdown') { state.equipSel = moveGridSel(state.equipSel, 'down', total); return; }
    if (k === 'arrowleft') { state.equipSel = moveGridSel(state.equipSel, 'left', total); return; }
    if (k === 'arrowright') { state.equipSel = moveGridSel(state.equipSel, 'right', total); return; }
    if (k === 'pageup') { state.equipSel = pageStart(flipPage(pageOf(state.equipSel), -1, total), total); return; }
    if (k === 'pagedown') { state.equipSel = pageStart(flipPage(pageOf(state.equipSel), 1, total), total); return; }
    const selEq = getOwned(state)[state.equipSel];
    if (k === 'a' || k === 'enter') {
      if (selEq && equipItem(state, selEq)) {
        const col = RARITY_COLORS[selEq.rarity].map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
        pushToast(state, `已穿戴 ${selEq.name}`, `#${col}`);
        playSfxClient('ui_click');
      } else if (selEq) {
        pushToast(state, '穿戴失败', '#ff5555');
      }
      return;
    }
    if (k === 'u' || k === 'd') {
      const slot = selEq ? selEq.type : undefined;
      if (slot && unequipSlot(state, slot)) pushToast(state, `已卸下: ${EQUIP_NAMES[slot]}`, '#9cf');
      return;
    }
    return;
  }
  // 死亡结算 (OPT-011, B1): 软核 1 回城(金-25%补药) / 2 原地复活(金-10%+5s无敌) / 3 重开; 硬核 1 重开清档 / 2 主菜单
  if (state.screen === 'death') {
    const k = e.key.toLowerCase();
    const ds = state.deathSummary;
    if (!ds) return;
    if (k === '1') {
      if (ds.hardcore) {
        hardcoreWipe(state);
        startRun(state, state.theme, state.difficulty);
      } else {
        state.player.gold -= deathGoldPenalty(state.player.gold, 'town', false);
        state.player.potions = { hp: 3, mp: 3 };
        enterTown(state);
      }
      state.dying = false;
      state.deathSummary = null;
      inf('ui', 'death → town/rerun');
      return;
    }
    if (k === '2') {
      if (ds.hardcore) {
        state.dying = false;
        state.deathSummary = null;
        setScreen(state, 'title');
      } else {
        state.player.gold -= deathGoldPenalty(state.player.gold, 'revive', false);
        revivePlayer(state);
        state.dying = false;
        state.deathSummary = null;
        setScreen(state, 'dungeon');
      }
      inf('ui', 'death → revive/menu');
      return;
    }
    if (k === '3' && !ds.hardcore) {
      startRun(state, state.theme, state.difficulty);
      state.dying = false;
      state.deathSummary = null;
      inf('ui', 'death → rerun');
      return;
    }
    return;
  }
  // 通关结算 (OPT-012): 1 再来一局(同主题同难度) / 2 回城
  if (state.screen === 'victory') {
    const k = e.key.toLowerCase();
    if (k === '1') {
      startRun(state, state.run.theme, state.difficulty);
      inf('ui', 'victory → 再来一局');
    } else if (k === '2') {
      enterTown(state);
      inf('ui', 'victory → 回城');
    }
    return;
  }
  // Esc (战斗/城镇): 打开暂停菜单
  if (e.key === 'Escape' && (state.screen === 'dungeon' || state.screen === 'town')) {
    state.pauseFrom = state.screen;
    setScreen(state, 'pause');
    inf('gl', 'paused');
    return;
  }
  // 暂停/设置菜单: 阻断游戏按键
  if (state.screen === 'pause') {
    const k = e.key.toLowerCase();
    if (k === '1') { setScreen(state, resumeScreen(state)); inf('gl', 'resumed'); return; }
    if (k === '2') { state.settingsOpen = !state.settingsOpen; return; }
    if (k === '3') {
      state.settingsOpen = false;
      void persistNow().then(() => pushToast(state, '已保存, 返回主菜单', '#9cf'));
      setScreen(state, 'title');
      inf('ui', '返回主菜单 (已保存)');
      return;
    }
    if (k === '4') {
      state.settingsOpen = false;
      enterTown(state);
      inf('ui', '进入城镇');
      return;
    }
    if (state.settingsOpen) {
      if (k === '+' || k === '=') {
        state.volume = Math.min(1, state.volume + 0.05);
        setVolumeClient(state.volume);
        inf('audio', `volume → ${Math.round(state.volume * 100)}%`);
        return;
      }
      if (k === '-' || k === '_') {
        state.volume = Math.max(0, state.volume - 0.05);
        setVolumeClient(state.volume);
        inf('audio', `volume → ${Math.round(state.volume * 100)}%`);
        return;
      }
      if (k === 'f') {
        void import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
          getCurrentWindow().isFullscreen().then(fs => getCurrentWindow().setFullscreen(!fs)));
        return;
      }
    }
    if (k === 'n') {
      if (state.pauseFrom !== 'town') {
        pushToast(state, '战斗中无法调整难度 (回城后在祭坛)', '#ff5555');
        return;
      }
      requestDifficulty(state, cycleDifficultyGated(state.difficulty, state.cleared));
      inf('game', `难度 → ${DIFFICULTY_MODS[state.difficulty].name}`);
      return;
    }
    if (k === 'escape') {
      if (state.settingsOpen) state.settingsOpen = false;
      else setScreen(state, resumeScreen(state));
      inf('gl', state.screen === 'pause' ? 'paused' : 'resumed');
      return;
    }
    return; // 暂停时忽略游戏按键
  }
  // 城镇: E 交互 + 面板按键
  if (state.mode === 'town') {
    const k = e.key.toLowerCase();
    if (state.townPanel) {
      handleTownPanelKey(state, e, k);
      return;
    }
    if (k === 'e') { interactTown(state); return; }
    if (k === '1' || k === '2' || k === '3' || k === '4') return; // 面板关闭时忽略数字
    return; // 城镇阻断游戏键 (技能/药水等)
  }
  // Ctrl+1..6: 分配技能点 (LMB/RMB/Q/W/E/R)
  if (e.ctrlKey) {
    const idx = '123456'.indexOf(e.key);
    if (idx >= 0) {
      const errMsg = assignSkillPoint(state, SKILL_SLOTS[idx]);
      if (errMsg) wrn('skill', `${SKILL_SLOTS[idx]} assign failed: ${errMsg}`);
      return;
    }
  }
  // 药水 (F-CBT-002): 1 = HP, 2 = MP
  if (e.key === '1' || e.key === '2') {
    const ok = usePotion(state, e.key === '1' ? 'hp' : 'mp');
    if (ok) playSfxClient('hit');
    else wrn('skill', `potion ${e.key} failed (cd or empty)`);
    return;
  }
  // 翻滚 (F-CBT-001): Space 无敌位移
  if (e.code === 'Space' && !e.repeat) {
    if (startDodge(state)) {
      dbg('player', 'dodge roll (i-frame 0.2s)');
    }
    return;
  }
  // 技能键: Q=火球 F=多重火球(原W槽, 避免 WASD 冲突) E=回血 R=大招
  const skillByKey: Record<string, SkillSlot> = { q: 'Q', f: 'W', e: 'E', r: 'R' };
  const skillSlot = skillByKey[e.key.toLowerCase()];
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
    persistNow();
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
        inf('save', `loaded: pos=(${d.player_x.toFixed(0)},${d.player_y.toFixed(0)}) hp=${d.player_hp.toFixed(0)} owned=${owned.length} theme=${state.theme}`);
        ensureDungeonRun(state);
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

// 关窗保存 (OPT-002): Rust 拦截 CloseRequested → JS 先存 → 再销毁窗口
void import('@tauri-apps/api/event').then(({ listen }) => {
  void listen('close-requested', () => {
    void persistNow().finally(() => {
      void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().destroy());
    });
  });
});

inf('loop', 'main loop start');

let last = performance.now();
let frameCount = 0;
let lastFpsT = performance.now();
let loopStartedLogged = false;
let loopCrashCooldown = 0;
function loop(now: number) {
  // 心跳 (每帧可被 js_log 确认): 首帧 + 崩溃转发, 防止 rAF 内异常静默冻结
  if (!loopStartedLogged) {
    loopStartedLogged = true;
    invoke('js_log', { msg: '[boot] rAF loop started' }).catch(() => {});
  }
  try {
    if (state.screen === 'title') {
      drawTitle();
    } else if (state.screen === 'newgame') {
      drawNewgame();
    } else if (state.screen === 'characters') {
      drawCharacters();
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
    const dir = keys.direction();
    if (dir.x !== 0 || dir.y !== 0) state.player.facing = dir;
    if (keys.isDown('d')) state.player.flipDir = 'R';
    else if (keys.isDown('a')) state.player.flipDir = 'L';
    else state.player.flipDir = 'N';
    updatePlayer(state, dir, dt);
    state.player.idleT += dt;
    // 城镇=屏幕坐标: clamp 到视口内
    state.player.pos.x = Math.max(0, Math.min(state.viewport.w - state.player.size.w, state.player.pos.x));
    state.player.pos.y = Math.max(0, Math.min(state.viewport.h - state.player.size.h, state.player.pos.y));
    drawTownFrame();
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
  updateCamera(state);
  state.world.walls = getActiveWalls(state, 2);
  updateFireballs(state, dt);
  updateSwings(state, dt);
  updateMonsters(state, dt);
  updateEnemyProj(state, dt);
  updateDeathFx(state, dt);
  updateDamageNums(state, dt);
  updateToasts(state, dt);
  spawnEnvFx(state, dt);
  updateEnvFx(state, dt);
  // CD 递减 (药水/翻滚)
  if (state.player.potionCd > 0) state.player.potionCd -= dt;
  if (state.player.dodgeT > 0) state.player.dodgeT -= dt;
  if (state.player.dodgeCd > 0) state.player.dodgeCd -= dt;
  if (state.combo.timer > 0) {
    state.combo.timer -= dt;
    if (state.combo.timer <= 0) state.combo.count = 0;
  }
  if (state.levelUpFlash > 0) state.levelUpFlash -= dt;
  resolveFireballHits(state);
  resolveMeleeHits(state);
  cullLoot(state, nowSec);  // OPT-032: 60s 后地面装备消失
  state.player.mp = Math.min(100, state.player.mp + 2 * dt);  // 回蓝 2/s (OPT-016: MP 成为资源, 药水有价值)
  state.player.hp = Math.min(100, state.player.hp + 2 * dt);  // 被动回血

  // 死亡检测 (OPT-011, B1): 进入死亡结算屏, 由玩家选择 (不再 2s 强制原地复活)
  if (state.player.hp <= 0 && !state.dying && state.screen === 'dungeon') {
    state.dying = true;
    state.deathSummary = deathSummary(state);
    setScreen(state, 'death');
    inf('combat', 'YOU DIED (score=' + state.score + ')');
  }
  // 原地复活无敌 (OPT-011): 竖屏后倒计时
  if (state.reviveInvuln > 0) state.reviveInvuln -= dt;
  // 施法失败红闪 (OPT-007): 倒计时
  if (state.castFailFlash) {
    state.castFailFlash.t -= dt;
    if (state.castFailFlash.t <= 0) state.castFailFlash = null;
  }

  // 跑局推进 (OPT-012): 小怪清空 → 召主题 Boss; Boss 击杀 → 通关结算
  if (state.screen === 'dungeon') {
    const ph = runPhase(state.run.alive, state.run.bossAlive, state.run.bossKilled);
    if (ph === 'boss') {
      const bossType = THEME_BOSS[state.run.theme];
      state.monsters.push(spawnMonster(state, bossType));
      state.run.bossAlive = true;
      const bossName = MONSTER_DEFS[bossType].type;
      pushToast(state, `BOSS 出现: ${bossName}`, '#ff9530');
      playSfxClient('boss_roar');  // OPT-025
      state.cameraShake = Math.min(16, (state.cameraShake ?? 0) + 8);  // OPT-026
      inf('world', `BOSS 出现: ${bossName} (${state.run.theme})`);
    } else if (ph === 'won' && !state.run.victoryShown) {
      state.run.victoryShown = true;
      state.run.timeSec = Math.max(0, (performance.now() - state.run.t0) / 1000);
      const prev = state.run.best[state.difficulty];
      if (prev === undefined || state.run.timeSec < prev) {
        state.run.best[state.difficulty] = state.run.timeSec;
        pushToast(state, `新纪录! ${formatTime(state.run.timeSec)}`, '#ffd64a');
      }
      // 进度解锁 (OPT-015): 首次通关记录主题
      if (!state.cleared.includes(state.run.theme)) {
        state.cleared.push(state.run.theme);
        pushToast(state, `已解锁: ${state.run.theme}`, '#9cf');
      }
      // 传承 (D-01 补完): 本局已绑定符文存入账号层, 新局自动绑定
      for (const slot of SKILL_SLOTS) {
        const r = skillRune(slot);
        if (r && !state.legacy.some(l => l.slot === slot)) {
          state.legacy.push({ slot, rune: r });
          pushToast(state, `传承: ${slotDisplay(slot)} → ${RUNE_DEFS[r].name}`, '#c9aaff');
        }
      }
      // M5 实测修复: Boss 掉落全部入背包 (胜利屏前收集, 不再捡不到)
      const collected = collectAllLoot(state);
      state.run.collectedLoot = collected.length;
      if (collected.length > 0) {
        pushToast(state, `Boss 掉落已入背包 ×${collected.length}`, '#ffd64a');
      }
      setScreen(state, 'victory');
      // C-201: 通关后持久化 (cleared/best/last_char) + 刷新角色摘要等级
      const cIdx = state.charList.findIndex(c => c.id === state.currentChar);
      if (cIdx >= 0) {
        state.charList[cIdx] = { ...state.charList[cIdx], level: state.player.level, difficulty: state.difficulty, theme: state.run.theme };
      }
      void persistNow();
      inf('ui', `VICTORY: ${state.run.timeSec.toFixed(1)}s (${state.difficulty}) collected=${collected.length}`);
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


/** 城镇: 进入 (商人库存刷新) */
function enterTown(state: GameState) {
  if (!state.townReturn) state.townReturn = { x: state.player.pos.x, y: state.player.pos.y };
  clearGroundLoot(state);  // M5 实测修复: 回城清理地上物品
  state.mode = 'town';
  setScreen(state, 'town');
  state.townPanel = null;
  state.townStock = null;
  state.player.pos = { x: 560, y: 500 };
}

/** 城镇: E 交互 */
function interactTown(state: GameState) {
  const npc = nearestNpc(state);
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
    case 'exit': {
      state.mode = 'dungeon';
      setScreen(state, 'dungeon');
      state.townPanel = null;
      if (state.townReturn) { state.player.pos = state.townReturn; state.townReturn = null; }
      ensureDungeonRun(state);
      inf('ui', '出发 → 地下城');
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
    return;
  }
  if (state.townPanel === 'sell') {
    const price = sellItem(state, n - 1);
    if (price > 0) inf('ui', `卖出 +${price}金`);
    return;
  }
  if (state.townPanel === 'smith') {
    if (rerollOwned(state, n - 1)) inf('ui', '重铸完成');
    else wrn('ui', '重铸失败 (金币不足或选择无效)');
    return;
  }
  if (state.townPanel === 'warehouse' || state.townPanel === 'warehouseTake') {
    if (k === 's') { state.townPanel = 'warehouseTake'; inf('ui', '存入: 1-9 选择背包装备, Esc 返回'); return; }
    if (k === 'b') { state.townPanel = 'warehouse'; return; }
    if (state.townPanel === 'warehouse' && n >= 1 && n <= 9) {
      if (warehouseTake(state, n - 1)) { playSfxClient('ui_click'); inf('ui', '取回仓库装备'); }
      else wrn('ui', '取回失败 (背包满或选择无效)');
      return;
    }
    if (state.townPanel === 'warehouseTake' && n >= 1 && n <= 9) {
      if (warehouseStore(state, n - 1)) { playSfxClient('ui_click'); inf('ui', '存入仓库'); }
      else wrn('ui', '存入失败 (仓库满或选择无效)');
      return;
    }
    return;
  }
}

/** 城镇绘制: 背景/NPC/玩家/提示/面板 */
function drawTownFrame() {
  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  gl.clearColor(0.10, 0.11, 0.16, 1);   // 城镇底色 (GL 层, 勿画进 canvas 否则盖住角色)
  gl.clear(gl.COLOR_BUFFER_BIT);
  // 先画角色 (GL 层; 城镇=屏幕坐标, 直接按 pos 绘制)
  const tSprite = pickPlayerSprite(state, mouse.state().pos.x);
  drawSprite(gl, quad, res, state.player.pos, state.player.size, 'characters', tSprite.name, { flip: { x: tSprite.flipX ? -1 : 1, y: 1 }, rot: tSprite.rot });
  hudCtx.textAlign = 'center';
  hudCtx.fillStyle = '#9aa';
  hudCtx.font = 'bold 26px monospace';
  hudCtx.fillText('城镇', hudCanvas.width / 2, 26);
  hudCtx.fillStyle = '#889';
  hudCtx.font = '12px monospace';
  hudCtx.fillText('WASD 移动 · 靠近 NPC 按 E 交互 · [1-5]买 [6]卖 [1-9]重铸/仓储 · Esc 暂停', hudCanvas.width / 2, 62);
  // NPC
  for (const npc of TOWN_NPCS) {
    const near = nearestNpc(state)?.kind === npc.kind;
    hudCtx.fillStyle = near ? '#4a9' : '#334';
    hudCtx.beginPath();
    hudCtx.arc(npc.pos.x, npc.pos.y, 26, 0, Math.PI * 2);
    hudCtx.fill();
    hudCtx.fillStyle = '#fff';
    hudCtx.font = 'bold 14px monospace';
    hudCtx.fillText(npc.name, npc.pos.x, npc.pos.y - 30);
    hudCtx.fillStyle = '#8aa';
    hudCtx.font = '11px monospace';
    hudCtx.fillText(npc.hint, npc.pos.x, npc.pos.y + 40);
  }
  // 交互提示
  const npc = nearestNpc(state);
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
  if (state.townPanel) drawTownPanel();
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
    hudCtx.fillText(`7. HP 药水 (${POTION_PRICES.hp}金) ×${state.player.potions?.hp ?? 0}/3`, 60, y); y += 22;
    hudCtx.fillStyle = '#88f';
    hudCtx.fillText(`8. MP 药水 (${POTION_PRICES.mp}金) ×${state.player.potions?.mp ?? 0}/3`, 60, y); y += 22;
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
    hudCtx.fillText(`重铸师 (金:${state.player.gold}, 100金/次)  [1-9] 选择  [Esc] 离开`, 40, y); y += 34;
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
    y += 34;
    const list = taking ? state.warehouse : getOwned(state);
    list.forEach((eq, i) => {
      if (i > 8) return;
      const col = RARITY_COLORS[eq.rarity];
      hudCtx.fillStyle = `rgb(${col.map(c => Math.round(c * 255)).join(',')})`;
      hudCtx.font = '14px monospace';
      hudCtx.fillText(`${i + 1}. ${eq.name} — ${eq.affixes.map(describeAffix).join(' · ')}`, 60, y); y += 24;
    });
  }
  hudCtx.fillStyle = '#fff';
}

/** 开始一局地牢 (OPT-012): 设定主题/难度 → 清场刷跑局池 → 进 dungeon */
function startRun(state: GameState, theme: Theme, difficulty: Difficulty): void {
  state.theme = theme;
  state.difficulty = difficulty;
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
  // 传承符文 (D-01): 新局自动绑定已传承变异 (该槽无符文时)
  for (const l of state.legacy) {
    const sk = getSkill(l.slot);
    if (sk && !sk.rune) sk.rune = l.rune;
  }
  fadeBgm(`bgm_${theme}`, state.volume);  // OPT-027: 换主题交叉淡化 (顺带修旧 bug: startRun 从未切 BGM)
  resetPlayer(state);
  spawnRunPool(state);
  setScreen(state, 'dungeon');
  inf('world', `run started: ${theme}/${difficulty}`);
}

/** 读档/回城再进时: 场上无怪 → 补刷一池; 有怪 → 按现存怪重算跑局计数 (Boss 在场/击杀态) */
function ensureDungeonRun(state: GameState): void {
  state.run.theme = state.theme;
  if (state.monsters.length === 0) {
    spawnRunPool(state);
  } else {
    state.run.total = state.monsters.length;
    state.run.alive = state.monsters.filter(m => !MONSTER_DEFS[m.type].boss).length;
    state.run.bossAlive = state.monsters.some(m => MONSTER_DEFS[m.type].boss);
    state.run.bossKilled = false;
    state.run.victoryShown = false;
    state.run.t0 = performance.now();
  }
}

/** 秒 → mm:ss */
function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 标题画面 (GAME_FLOW §1.2): 主菜单 */
function drawTitle() {
  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.fillStyle = '#0b0b12';
  hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillStyle = '#c9aaff';
  hudCtx.font = 'bold 72px monospace';
  hudCtx.fillText('VOIDBOUND', hudCanvas.width / 2, hudCanvas.height / 2 - 140);
  hudCtx.fillStyle = '#888';
  hudCtx.font = '18px monospace';
  hudCtx.fillText('虚空之缚 — 2D 随机地下城 ARPG (战斗原型)', hudCanvas.width / 2, hudCanvas.height / 2 - 90);
  hudCtx.fillStyle = '#eee';
  hudCtx.font = 'bold 22px monospace';
  hudCtx.fillText('[1] 新游戏', hudCanvas.width / 2, hudCanvas.height / 2 - 10);
  hudCtx.fillText('[2] 设置', hudCanvas.width / 2, hudCanvas.height / 2 + 30);
  hudCtx.fillText('[O] 读取存档', hudCanvas.width / 2, hudCanvas.height / 2 + 70);
  hudCtx.fillText('[R] 角色管理', hudCanvas.width / 2, hudCanvas.height / 2 + 110);
  hudCtx.fillStyle = '#666';
  hudCtx.font = '14px monospace';
  hudCtx.fillText('WASD 移动 · 左/右键 近战 · Q/F/E/R 技能 · Space 翻滚 · 1/2 药水 · P 存档 O 读档 · Tab 装备 · Esc 暂停', hudCanvas.width / 2, hudCanvas.height / 2 + 140);
  hudCtx.textAlign = 'left';
  hudCtx.textBaseline = 'top';

  // 标题页状态消息 (读档反馈等)
  if (state.titleMsg) {
    hudCtx.fillStyle = '#ffd64a';
    hudCtx.font = '16px monospace';
    hudCtx.textAlign = 'center';
    hudCtx.fillText(state.titleMsg, hudCanvas.width / 2, hudCanvas.height / 2 + 190);
    hudCtx.textAlign = 'left';
  }

  // 标题页设置面板 (复用暂停版内容)
  if (state.settingsOpen) {
    hudCtx.fillStyle = 'rgba(0,0,0,0.55)';
    hudCtx.fillRect(0, hudCanvas.height / 2 - 130, hudCanvas.width, 300);
    hudCtx.textAlign = 'center';
    hudCtx.fillStyle = '#ffd';
    hudCtx.font = 'bold 26px monospace';
    hudCtx.fillText('设置', hudCanvas.width / 2, hudCanvas.height / 2 - 90);
    hudCtx.font = '18px monospace';
    hudCtx.fillStyle = '#fff';
    hudCtx.fillText(`音量: ${Math.round(state.volume * 100)}%   [+]/[-]`, hudCanvas.width / 2, hudCanvas.height / 2 - 40);
    hudCtx.fillText('全屏: [F] 切换', hudCanvas.width / 2, hudCanvas.height / 2);
    hudCtx.fillText(`难度: ${DIFFICULTY_MODS[state.difficulty].name}  [N] 循环`, hudCanvas.width / 2, hudCanvas.height / 2 + 40);
    hudCtx.fillStyle = '#888';
    hudCtx.font = '14px monospace';
    hudCtx.fillText('[Esc] 返回标题', hudCanvas.width / 2, hudCanvas.height / 2 + 90);
    if (state.confirmHardcore) {
      hudCtx.fillStyle = '#ffd64a';
      hudCtx.font = 'bold 15px monospace';
      hudCtx.fillText('[Y] 确认切到硬核(永久死亡)  [Esc] 取消', hudCanvas.width / 2, hudCanvas.height / 2 + 120);
    }
    hudCtx.textAlign = 'left';
  }
}

/** 新局选择屏 (M5 C-103): 职业 1-6 / 难度 Z·X / 主题 ←→, Enter 开始 */
function drawNewgame() {
  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.fillStyle = '#0b0b12';
  hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillStyle = '#c9aaff';
  hudCtx.font = 'bold 44px monospace';
  hudCtx.fillText('新游戏', hudCanvas.width / 2, 90);
  const cy = hudCanvas.height / 2 - 120;

  // 职业 (左列, 1-6)
  const cx = hudCanvas.width / 2 - 520;
  hudCtx.font = 'bold 15px monospace';
  hudCtx.fillStyle = '#9cf';
  hudCtx.fillText('职业 [1-6]', cx, cy - 26);
  CLASS_IDS.forEach((id, i) => {
    const def = CLASS_DEFS[id];
    const sel = state.ngSel.classIdx === i;
    hudCtx.font = 'bold 18px monospace';
    hudCtx.fillStyle = sel ? def.color : '#667';
    hudCtx.fillText(`${i + 1} ${sel ? '▶ ' : '  '}${def.name}${sel ? ' ◀' : ''}`, cx, cy + i * 46);
    hudCtx.font = '12px monospace';
    hudCtx.fillStyle = sel ? '#bbb' : '#445';
    hudCtx.fillText(def.title, cx, cy + i * 46 + 18);
  });
  const selClass = CLASS_DEFS[CLASS_IDS[state.ngSel.classIdx]];
  hudCtx.fillStyle = selClass.color;
  hudCtx.font = '12px monospace';
  hudCtx.fillText(selClass.desc, cx, cy + 6 * 46 + 6);

  // 难度 (中列, Z/X)
  const dx = hudCanvas.width / 2 - 140;
  hudCtx.font = 'bold 15px monospace';
  hudCtx.fillStyle = '#ffd';
  hudCtx.fillText('难度 [Z/X]', dx, cy - 26);
  DIFFICULTIES.forEach((d, i) => {
    const sel = state.ngSel.diffIdx === i;
    const locked = !unlockedDifficulty(state.cleared, d);
    const mod = DIFFICULTY_MODS[d];
    hudCtx.font = 'bold 18px monospace';
    hudCtx.fillStyle = sel ? '#ffd64a' : locked ? '#4a4a55' : '#99a';
    hudCtx.fillText(`${sel ? '▶ ' : '  '}${mod.name}${sel ? ' ◀' : ''}${locked ? ' (未解锁)' : ''}`, dx, cy + i * 44);
    hudCtx.font = '12px monospace';
    hudCtx.fillStyle = sel ? '#caa' : '#667';
    hudCtx.fillText(`HP×${mod.hpMult} 掉落×${mod.dropMult}${d === 'hardcore' ? ' 永久死亡' : ''}`, dx, cy + i * 44 + 18);
  });

  // 主题 (右列, ←→)
  const tx = hudCanvas.width / 2 + 300;
  hudCtx.font = 'bold 15px monospace';
  hudCtx.fillStyle = '#8f8';
  hudCtx.fillText('主题 [←/→]', tx, cy - 26);
  const selTheme = THEMES[state.ngSel.themeIdx];
  const themeLocked = !themeUnlocked(state.cleared, selTheme);
  hudCtx.font = 'bold 24px monospace';
  hudCtx.fillStyle = themeLocked ? '#7a6a6a' : '#ffd64a';
  hudCtx.fillText(`${selTheme}${themeLocked ? ' (未解锁)' : ''}`, tx, cy + 20);
  hudCtx.font = '14px monospace';
  hudCtx.fillStyle = '#889';
  hudCtx.fillText('← / → 或 A / D 切换', tx, cy + 50);
  hudCtx.font = '13px monospace';
  hudCtx.fillStyle = '#667';
  hudCtx.fillText('清空小怪后挑战主题 Boss, 通关解锁下一主题', tx, cy + 76);

  // 底部操作行
  hudCtx.fillStyle = '#fff';
  hudCtx.font = 'bold 16px monospace';
  hudCtx.fillText('[Enter] 开始 · [Esc] 返回标题 · 鼠标点击亦可', hudCanvas.width / 2, hudCanvas.height - 60);
  hudCtx.textAlign = 'left';
  hudCtx.textBaseline = 'top';
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
  hudCtx.fillText('角色管理', hudCanvas.width / 2, 80);
  const cx = hudCanvas.width / 2;

  if (state.charCreating) {
    // 新建: 1-6 选职业 (自动命名 职业_序号)
    hudCtx.fillStyle = '#9cf';
    hudCtx.font = 'bold 20px monospace';
    hudCtx.fillText('选择职业 [1-6] · [Esc] 取消', cx, 150);
    CLASS_IDS.forEach((id, i) => {
      const def = CLASS_DEFS[id];
      hudCtx.fillStyle = '#ddd';
      hudCtx.font = 'bold 18px monospace';
      hudCtx.fillText(`${i + 1}  ${def.name} — ${def.title}`, cx, 210 + i * 40);
      hudCtx.fillStyle = def.color;
      hudCtx.font = '13px monospace';
      hudCtx.fillText(def.desc, cx, 210 + i * 40 + 18);
    });
    hudCtx.textAlign = 'left';
    hudCtx.textBaseline = 'top';
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

/** 单帧绘制: 清屏 + 地面 + 墙 + 粒子 + 火球 + 怪物 + 玩家 + HUD */
function drawFrame() {
  // 技能 CD 时间基准 (drawFrame 独立作用域, 不能引用 loopImpl 的 nowSec)
  const nowSec = performance.now() / 1000;

  // 鼠标技能: LMB/RMB 立即触发 (方向 = 鼠标位置)
  const aimDir = mouseAimDirection(state, mouse.state());
  // 仅 dungeon 接受鼠标技能点击; 其余屏 LMB = UI 点击 (C-501)
  if (state.screen === 'dungeon') {
    if (mouse.wasClicked('LMB')) {
      if (tryCastSlot('LMB', state, aimDir, nowSec)) {
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

  drawSprite(
    gl, quad, res,
    { x: -state.camera.x + state.world.floorPos.x, y: -state.camera.y + state.world.floorPos.y },
    state.world.floorSize,
    'world', `floor_${state.theme}`,
  );

  for (const w of state.world.walls) {
    const sp = worldToScreen(state, w.pos);
    if (sp.x + w.size.w < 0 || sp.x > state.viewport.w) continue;
    if (sp.y + w.size.h < 0 || sp.y > state.viewport.h) continue;
    drawSprite(gl, quad, res, sp, w.size, 'world', `wall_${state.theme}`);
  }

  // 环境粒子 (OPT-027): 主题色微尘, 世界图层之上
  const envColor = THEME_ENV_COLOR[state.theme];
  for (const p of state.envFx) {
    const sp = worldToScreen(state, p);
    drawSprite(gl, quad, res, sp, { w: 6, h: 6 }, 'particles', 'spark_03', { color: envColor });
  }

  // 近战挥击 (slash particle, 在玩家前)
  for (const s of getSwings(state)) {
    const sp = worldToScreen(state, s.pos);
    if (sp.x + s.size.w < 0 || sp.x > state.viewport.w) continue;
    drawSprite(gl, quad, res, sp, s.size, 'particles', 'slash_01');
  }

  for (const f of state.fireballs) {
    const sp = worldToScreen(state, f.pos);
    const rc = f.rune && f.rune !== 'none' ? RUNE_DEFS[f.rune].color : hexToRgb01(DAMAGE_TYPE_COLORS[f.dmgType]);
    drawSprite(gl, quad, res, sp, f.size, 'particles', 'magic_01', { color: rc });
  }

  // 怪物远程投射物 (红色小点)
  for (const p of getEnemyProj(state)) {
    const sp = worldToScreen(state, p.pos);
    if (sp.x + p.size.w < 0 || sp.x > state.viewport.w) continue;
    if (sp.y + p.size.h < 0 || sp.y > state.viewport.h) continue;
    drawSprite(gl, quad, res, sp, p.size, 'particles', 'magic_05', { color: [1, 0.3, 0.3] });
  }

  // 死亡粒子 (在世界图层之后, 怪物之前)
  for (const fx of getDeathFx(state)) {
    const sp = worldToScreen(state, fx.pos);
    if (sp.x + fx.size.w < 0 || sp.x > state.viewport.w) continue;
    if (sp.y + fx.size.h < 0 || sp.y > state.viewport.h) continue;
    const lifeFrac = Math.max(0, fx.life / fx.maxLife);
    // 后期变小
    const sz = fx.size.w * (0.4 + 0.6 * lifeFrac);
    drawSprite(gl, quad, res, { x: sp.x, y: sp.y }, { w: sz, h: sz }, 'particles', 'slash_02', { rot: fx.rot });
  }

  // 怪物 (受击时变红闪烁, 复用 color tint)
  for (const m of state.monsters) {
    const sp = worldToScreen(state, m.pos);
    if (sp.x + m.size.w < 0 || sp.x > state.viewport.w) continue;
    if (sp.y + m.size.h < 0 || sp.y > state.viewport.h) continue;
    const color: [number, number, number] | undefined =
      m.elite ? [1, 0.85, 0.25]
      : m.hitFlash > 0 ? [1, 0.3, 0.3]
      : MONSTER_DEFS[m.type].tint;
    const monsterSprite = `${MONSTER_DEFS[m.type].sprite}_${m.walkFrame}`;
    drawSprite(gl, quad, res, sp, m.size, 'monsters', monsterSprite, { color });
    // HP 条
    const def = MONSTER_DEFS[m.type];
    const frac = Math.max(0, m.hp) / def.hp;
    const barW = m.size.w;
    const barH = 3;
    drawSprite(gl, quad, res, { x: sp.x, y: sp.y - 5 }, { w: barW * frac, h: barH }, 'ui', 'slide_horizontal_color');
    drawSprite(gl, quad, res, { x: sp.x + barW * frac, y: sp.y - 5 }, { w: barW * (1 - frac), h: barH }, 'ui', 'slide_horizontal_grey');
  }

  // 装备 (Loot) - 4 阶稀有度上色, 玩家走过即拾
  for (const eq of getLoot(state)) {
    const sp = worldToScreen(state, eq.pos);
    if (sp.x + eq.size.w < 0 || sp.x > state.viewport.w) continue;
    if (sp.y + eq.size.h < 0 || sp.y > state.viewport.h) continue;
    drawSprite(gl, quad, res, sp, eq.size, 'particles', 'spark_03', { color: RARITY_COLORS[eq.rarity] });
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
      // 设置面板 (GAME_FLOW §12)
      hudCtx.fillStyle = '#ffd';
      hudCtx.font = 'bold 28px monospace';
      hudCtx.textBaseline = 'middle';
      hudCtx.fillText('设置', hudCanvas.width / 2, hudCanvas.height / 2 - 90);
      hudCtx.font = '18px monospace';
      hudCtx.fillStyle = '#fff';
      hudCtx.fillText(`音量: ${Math.round(state.volume * 100)}%   [+]/[-]`, hudCanvas.width / 2, hudCanvas.height / 2 - 40);
      // 音量滑块
      const sliderX = hudCanvas.width / 2 - 120;
      const sliderY = hudCanvas.height / 2 - 22;
      hudCtx.fillStyle = '#333';
      hudCtx.fillRect(sliderX, sliderY, 240, 10);
      hudCtx.fillStyle = '#c9aaff';
      hudCtx.fillRect(sliderX, sliderY, 240 * state.volume, 10);
      hudCtx.strokeStyle = '#666';
      hudCtx.strokeRect(sliderX, sliderY, 240, 10);
      hudCtx.fillText('全屏: [F] 切换', hudCanvas.width / 2, hudCanvas.height / 2 + 6);
      hudCtx.fillText(`难度: ${DIFFICULTY_MODS[state.difficulty].name}  [N] 循环`, hudCanvas.width / 2, hudCanvas.height / 2 + 32);
      hudCtx.fillStyle = '#999';
      hudCtx.font = '14px monospace';
      hudCtx.fillText('WASD 移动 · 左/右键 近战 · Q 火球  F 连发  E 回血  R 大招 · P 存档  O 读档', hudCanvas.width / 2, hudCanvas.height / 2 + 46);
      hudCtx.fillText('Ctrl+1..6 技能点 · P 存档 · O 读档 · L 日志级别', hudCanvas.width / 2, hudCanvas.height / 2 + 70);
      hudCtx.fillText('[Esc] 返回暂停菜单', hudCanvas.width / 2, hudCanvas.height / 2 + 100);
      if (state.confirmHardcore) {
        hudCtx.fillStyle = '#ffd64a';
        hudCtx.font = 'bold 15px monospace';
        hudCtx.fillText('[Y] 确认切到硬核(永久死亡)  [Esc] 取消', hudCanvas.width / 2, hudCanvas.height / 2 + 130);
      }
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
    if (ds.hardcore) hudCtx.fillText('[1] 重开新局(清档)   [2] 主菜单', hudCanvas.width / 2, hudCanvas.height / 2 + 80);
    else hudCtx.fillText('[1] 回城   [2] 原地复活   [3] 重开', hudCanvas.width / 2, hudCanvas.height / 2 + 80);
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

/** #rrggbb → [r,g,b] 0-1 (投射物按伤害类型着色) */
function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
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
    class: state.player.classId,  // M5 C-104
    skill_levels: SKILL_SLOTS.map(slot => ({ slot, level: skillLevel(slot) })),
    skill_points: state.player.skillPoints ?? 0,
    exp: state.player.exp ?? 0,
  };
}

/** 异步保存 (OPT-002/029): 角色档 + 账号层双写; 失败 toast 提示, 不阻塞 */
function persistNow(): Promise<void> {
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

/** 施法失败反馈 (OPT-007): toast 区分 MP/CD; 主技能槽 0.4s 红闪 */
function notifyCastFail(state: GameState, slot: SkillSlot): void {
  const sk = getSkill(slot);
  const msg = state.player.mp < sk.mpCost ? 'MP 不足' : '冷却中';
  pushToast(state, `${sk.name}: ${msg}`, '#ff5555');
  if (slot === 'Q' || slot === 'W' || slot === 'E' || slot === 'R') {
    state.castFailFlash = { slot, t: 0.4 };
  }
}

/** 鼠标 UI 点击 (C-501): 命中测试各屏关键 UI, 返回是否消费 */
function handleUiClick(state: GameState, mx: number, my: number): boolean {
  const w = state.viewport.w;
  const h = state.viewport.h;
  // 符文三选一: 3 个符文盒 (覆盖于任何屏)
  if (state.runeChoice) {
    const boxW = 260, boxGap = 20, totalW = boxW * 3 + boxGap * 2;
    const x0 = (w - totalW) / 2, y0 = h / 2 - 70;
    for (let i = 0; i < state.runeChoice.options.length; i++) {
      if (inRect(mx, my, x0 + i * (boxW + boxGap), y0, boxW, 84)) { chooseRune(state, i); return true; }
    }
    return true;
  }
  switch (state.screen) {
    case 'title': {
      const cx = w / 2, btnW = 320, btnH = 38;
      const items: Array<{ y: number; action: () => void }> = [
        { y: h / 2 - 10 - btnH / 2, action: () => {
          state.ngSel = { classIdx: CLASS_IDS.indexOf(state.player.classId), diffIdx: DIFFICULTIES.indexOf(state.difficulty), themeIdx: THEMES.indexOf(state.theme) };
          setScreen(state, 'newgame'); state.titleMsg = ''; inf('ui', '新游戏 → 选择屏'); } },
        { y: h / 2 + 30 - btnH / 2, action: () => { state.settingsOpen = !state.settingsOpen; } },
        { y: h / 2 + 70 - btnH / 2, action: () => {
          loadAccount().then(a => {
            const last = (a.last_char && a.last_char.length > 0) ? a.last_char : 'char_0';
            state.currentChar = last;
            return loadGame(last);
          }).then(d => {
            bindClass(state, (d.class as ClassId) ?? 'barbarian');
            return loadAccount();
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
            ensureDungeonRun(state);
            setScreen(state, 'dungeon');
            state.titleMsg = '';
            inf('save', `读档并继续 (角色 ${state.currentChar}, 含账号层)`);
          }).catch((err: unknown) => { state.titleMsg = `无存档或读档失败: ${String(err)}`; wrn('save', String(err)); });
        } },
        { y: h / 2 + 110 - btnH / 2, action: () => {
          listCharacters().then(list => {
            state.charList = list;
            state.charSel = Math.max(0, list.findIndex(c => c.id === state.currentChar));
            state.charCreating = false;
            state.charConfirmDel = false;
            setScreen(state, 'characters');
            state.titleMsg = '';
            inf('ui', `角色管理: ${list.length} 个角色`);
          }).catch((err: unknown) => { state.titleMsg = `角色列表读取失败: ${String(err)}`; wrn('save', String(err)); });
        } },
      ];
      for (const it of items) {
        if (inRect(mx, my, cx - btnW / 2, it.y, btnW, btnH)) { it.action(); return true; }
      }
      return true;
    }
    case 'pause': {
      const totalW = 460, segW = totalW / 4;
      const x0 = w / 2 - totalW / 2, y0 = h / 2 - 30, segH = 44;
      const segs: Array<() => void> = [
        () => setScreen(state, resumeScreen(state)),
        () => { state.settingsOpen = !state.settingsOpen; },
        () => { state.settingsOpen = false; void persistNow().then(() => pushToast(state, '已保存, 返回主菜单', '#9cf')); setScreen(state, 'title'); },
        () => { state.settingsOpen = false; enterTown(state); },
      ];
      for (let i = 0; i < segs.length; i++) {
        if (inRect(mx, my, x0 + i * segW, y0, segW, segH)) { segs[i](); return true; }
      }
      return true;
    }
    case 'death': {
      if (!state.deathSummary) return true;
      const totalW = 420, segW = totalW / 3;
      const x0 = w / 2 - totalW / 2, y0 = h / 2 + 60, segH = 40;
      const hard = state.deathSummary.hardcore;
      const segs: Array<() => void> = hard
        ? [
            () => { hardcoreWipe(state); startRun(state, state.theme, state.difficulty); state.dying = false; state.deathSummary = null; },
            () => { state.dying = false; state.deathSummary = null; setScreen(state, 'title'); },
          ]
        : [
            () => { state.player.gold -= deathGoldPenalty(state.player.gold, 'town', false); state.player.potions = { hp: 3, mp: 3 }; enterTown(state); state.dying = false; state.deathSummary = null; },
            () => { state.player.gold -= deathGoldPenalty(state.player.gold, 'revive', false); revivePlayer(state); state.dying = false; state.deathSummary = null; setScreen(state, 'dungeon'); },
            () => { startRun(state, state.theme, state.difficulty); state.dying = false; state.deathSummary = null; },
          ];
      for (let i = 0; i < segs.length; i++) {
        if (inRect(mx, my, x0 + i * segW, y0, segW, segH)) { segs[i](); return true; }
      }
      return true;
    }
    case 'victory': {
      const totalW = 380, segW = totalW / 2;
      const x0 = w / 2 - totalW / 2, y0 = h / 2 + 52, segH = 40;
      const segs: Array<() => void> = [
        () => { startRun(state, state.run.theme, state.difficulty); },
        () => { enterTown(state); },
      ];
      for (let i = 0; i < segs.length; i++) {
        if (inRect(mx, my, x0 + i * segW, y0, segW, segH)) { segs[i](); return true; }
      }
      return true;
    }
    case 'newgame': {
      const cy = h / 2 - 120;
      for (let i = 0; i < CLASS_IDS.length; i++) {
        if (inRect(mx, my, w / 2 - 520 - 80, cy + i * 46 - 14, 300, 40)) { state.ngSel.classIdx = i; return true; }
      }
      for (let i = 0; i < DIFFICULTIES.length; i++) {
        if (inRect(mx, my, w / 2 - 140 - 90, cy + i * 44 - 14, 280, 36)) { state.ngSel.diffIdx = i; return true; }
      }
      if (inRect(mx, my, w / 2 + 200, cy - 30, 360, 90)) { state.ngSel.themeIdx = (state.ngSel.themeIdx + 1) % THEMES.length; return true; }
      if (inRect(mx, my, w / 2 - 200, h - 90, 400, 48)) {
        const { classId, difficulty, theme } = ngResolve(state.ngSel);
        if (!unlockedDifficulty(state.cleared, difficulty)) { pushToast(state, `${DIFFICULTY_MODS[difficulty].name} 未解锁`, '#f66'); return true; }
        if (!themeUnlocked(state.cleared, theme)) { pushToast(state, `主题 ${theme} 未解锁 (通关森林后开放)`, '#f66'); return true; }
        bindClass(state, classId);
        startRun(state, theme, difficulty);
        return true;
      }
      if (inRect(mx, my, 20, 20, 200, 40)) { setScreen(state, 'title'); return true; }
      return true;
    }
    case 'characters': {
      const cx = w / 2;
      if (state.charCreating) {
        for (let i = 0; i < CLASS_IDS.length; i++) {
          if (inRect(mx, my, cx - 200, 210 + i * 40 - 16, 400, 38)) {
            const cls = CLASS_IDS[i];
            const used = new Set(state.charList.map(c => c.id));
            let n = 0;
            let id = `${cls}_${n}`;
            while (used.has(id)) { n++; id = `${cls}_${n}`; }
            state.currentChar = id;
            state.charList = [...state.charList, { id, class: cls, level: 1, difficulty: 'normal', theme: 'forest' }];
            state.charCreating = false;
            state.ngSel = { classIdx: i, diffIdx: 0, themeIdx: 0 };
            setScreen(state, 'newgame');
            state.titleMsg = '';
            pushToast(state, `新建角色: ${id} (${CLASS_DEFS[cls].name})`, '#9cf');
            inf('ui', `新建角色 ${id} → 新局选择屏`);
            return true;
          }
        }
        if (inRect(mx, my, 20, 20, 200, 40)) { state.charCreating = false; return true; }
        return true;
      }
      if (state.charConfirmDel) {
        if (inRect(mx, my, cx - 200, h / 2 + 20 - 16, 400, 40)) {
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
        if (inRect(mx, my, 20, 20, 200, 40)) { state.charConfirmDel = false; return true; }
        return true;
      }
      // 列表行: 点击选中 + 双击行为简化为单击选中, 底栏按钮进入
      const rows = Math.min(state.charList.length, 8);
      const y0 = h / 2 - rows * 26;
      for (let i = 0; i < rows; i++) {
        if (inRect(mx, my, cx - 320, y0 + i * 52 - 14, 640, 40)) { state.charSel = i; return true; }
      }
      if (inRect(mx, my, cx - 300, h - 100, 600, 40)) {
        // 进入选中角色 (同 Enter)
        const target = state.charList[state.charSel];
        if (target) {
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
              owned.push({ id: allocEquipmentId(), name: it.name, rarity: it.rarity, type: it.eq_type, pos: { x: 0, y: 0 }, size: { w: 24, h: 24 }, affixes: it.affixes.map(a => ({ stat: a.stat, value: a.value, element: a.element })), pickedUp: true, setName: it.setName });
            }
            state.player.equipped = {};
            for (const eq of d.equipped ?? []) {
              state.player.equipped[eq.slot] = { id: allocEquipmentId(), name: eq.item.name, rarity: eq.item.rarity, type: eq.slot, pos: { x: 0, y: 0 }, size: { w: 24, h: 24 }, affixes: eq.item.affixes.map(a => ({ stat: a.stat, value: a.value, element: a.element })), pickedUp: true, setName: eq.item.setName };
            }
            recomputeCombat(state);
            for (const rr of d.runes ?? []) { const sk = SKILL_SLOTS.includes(rr.slot) ? getSkill(rr.slot) : null; if (sk) sk.rune = rr.rune; }
            if (d.theme) state.theme = d.theme;
            if (DIFFICULTIES.includes(d.difficulty)) state.difficulty = d.difficulty;
            for (const sl of d.skill_levels ?? []) { const sk = getSkill(sl.slot); if (sk) sk.level = sl.level; }
            ensureDungeonRun(state);
            setScreen(state, 'dungeon');
            state.titleMsg = '';
            void persistNow();
            inf('save', `切换到角色 ${target.id} (Lv${d.level ?? 1} ${d.class ?? 'barbarian'})`);
          }).catch((err: unknown) => {
            const cls = (target.class as ClassId) ?? 'barbarian';
            bindClass(state, cls);
            startRun(state, 'forest', 'normal');
            setScreen(state, 'dungeon');
            state.titleMsg = '';
            void persistNow();
            inf('save', `角色 ${target.id} 无存档, 以 ${CLASS_DEFS[cls].name} 开新局 (${String(err)})`);
          });
        }
        return true;
      }
      if (inRect(mx, my, cx - 300, h - 60, 200, 40)) {
        state.charCreating = true; state.charConfirmDel = false; return true;
      }
      if (inRect(mx, my, cx + 100, h - 60, 200, 40)) {
        if (state.charList.length > 0) state.charConfirmDel = true;
        return true;
      }
      if (inRect(mx, my, 20, 20, 200, 40)) { setScreen(state, 'title'); return true; }
      return true;
    }
    case 'equipment': {
      const slots = slotRects();
      for (let i = 0; i < EQUIP_SLOTS.length; i++) {
        const s = slots[i];
        if (inRect(mx, my, s.x, s.y, EQ_LAYOUT.slotSize, EQ_LAYOUT.slotSize)) {
          if (unequipSlot(state, EQUIP_SLOTS[i])) { pushToast(state, `已卸下: ${EQUIP_NAMES[EQUIP_SLOTS[i]]}`, '#9cf'); playSfxClient('ui_click'); }
          return true;
        }
      }
      const total = getOwned(state).length;
      const pc = pageCount(total);
      const curPage = Math.min(pageOf(state.equipSel), pc - 1);
      for (const c of cellRects()) {
        if (inRect(mx, my, c.x, c.y, EQ_LAYOUT.cellSize, EQ_LAYOUT.cellSize)) {
          const idx = cellIndex(c.col, c.row, curPage, total);
          if (idx !== null) state.equipSel = idx;
          return true;
        }
      }
      if (inRect(mx, my, EQ_LAYOUT.btnEquip.x, EQ_LAYOUT.btnEquip.y, EQ_LAYOUT.btnEquip.w, EQ_LAYOUT.btnEquip.h)) {
        const eq = getOwned(state)[state.equipSel];
        if (eq && equipItem(state, eq)) {
          const col = RARITY_COLORS[eq.rarity].map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
          pushToast(state, `已穿戴 ${eq.name}`, `#${col}`);
          playSfxClient('ui_click');
        }
        return true;
      }
      if (inRect(mx, my, EQ_LAYOUT.btnUnequip.x, EQ_LAYOUT.btnUnequip.y, EQ_LAYOUT.btnUnequip.w, EQ_LAYOUT.btnUnequip.h)) {
        const eq = getOwned(state)[state.equipSel];
        const slot = eq ? eq.type : undefined;
        if (slot && unequipSlot(state, slot)) pushToast(state, `已卸下: ${EQUIP_NAMES[slot]}`, '#9cf');
        return true;
      }
      return true;
    }
  }
  return false;
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