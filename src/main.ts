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
import { updateFireballs, spawnFireball, updateCamera, pickPlayerSprite, worldToScreen, WORLD_W, WORLD_H } from './game/state';
import { getActiveWalls, type Wall } from './game/world';
import { drawSprite } from './render/draw';
import { drawHud, drawHudOverlay, setMouseReticle } from './render/hud';
import { makeCooldown } from './game/cooldown';
import { tryCastSlot, updateSwings, getSwings, assignSkillPoint, chooseRune, rejectRune, skillRune, getSkill, SKILL_SLOTS, type SkillSlot } from './game/skill';
import { spawnThemeMonster, updateMonsters, resolveFireballHits, resolveMeleeHits, MONSTER_DEFS, updateEnemyProj, getEnemyProj } from './game/monster';
import { saveGame, loadGame } from './ipc/save';
import { pickupLoot, getLoot, getOwned, allocEquipmentId, recomputeCombat, RARITY_COLORS, describeAffix } from './game/equipment';
import { playBgmClient } from './ipc/sfx';
import { baseCombat } from './game/combat';
import { spawnDamageNum, getDamageNums, updateDamageNums } from './game/damageNum';
import { getSkillCooldowns } from './game/cooldown';
import { updateDeathFx, getDeathFx, spawnDeathFx } from './game/deathFx';
import { inf, wrn, dbg, err, setLogLevel, type LogLevel } from './util/log';

const VW = 1280;
const VH = 720;

// 全局错误捕获: JS 异常同步到 console + log, 方便排查
window.addEventListener('error', (e) => {
  err('loop', `JS error: ${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`);
});
window.addEventListener('unhandledrejection', (e) => {
  err('loop', `unhandled rejection: ${String(e.reason)}`);
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

inf('gl', `WebGL2 init ${canvas.width}x${canvas.height}`);
const gl = createContext(canvas);
const quad = createQuadBuffer(gl, VERT, FRAG);
inf('gl', 'shader program + quad VAO ready');

inf('atlas', 'loading 6 atlases...');
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

inf('world', `world size ${WORLD_W}x${WORLD_H} (16x viewport), chunked procedural, theme=${state.theme}`);
playBgmClient(`bgm_${state.theme}`);

const keys = attachKeyboard(window);
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
    exp: 0,
    potions: { hp: 3, mp: 3 },
    potionCd: 0,
    dodgeT: 0,
    dodgeCd: 0,
    facing: { x: 0, y: 0 },
    idleT: 0,
    flipDir: 'N' as 'L' | 'R' | 'N',
    combat: baseCombat(),
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
  deathTimer: 0,
  theme: 'forest' as 'forest' | 'desert' | 'ruin' | 'void',
  runeChoice: null,
  rejectedRunes: [],
  settingsOpen: false,
  volume: 0.8,
  resources: res,
};

// 初始 spawn 5 只怪物: 2 bat + 2 slime + 1 worm
for (let i = 0; i < 5; i++) state.monsters.push(spawnThemeMonster(state));
inf('world', `spawned ${state.monsters.length} monsters (2 bat + 2 slime + 1 worm)`);

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
  // 暂停/设置菜单: 阻断游戏按键
  if (state.paused) {
    const k = e.key.toLowerCase();
    if (k === '1') { state.paused = false; inf('gl', 'resumed'); return; }
    if (k === '2') { state.settingsOpen = !state.settingsOpen; return; }
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
    if (k === 'escape') {
      if (state.settingsOpen) state.settingsOpen = false;
      else state.paused = false;
      inf('gl', state.paused ? 'paused' : 'resumed');
      return;
    }
    return; // 暂停时忽略游戏按键
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
  if (e.key === 'q' || e.key === 'Q') {
    const nowSec = performance.now() / 1000;
    // 技能方向 = 鼠标位置 - 玩家中心, 转换为世界方向
    const aimDir = mouseAimDirection(state, mouse.state());
    if (!tryCastSlot('Q', state, aimDir, nowSec)) {
      wrn('skill', 'cast Q failed (cd or mp)');
      return;
    }
    invoke('play_sfx', { name: 'fireball' }).catch(() => {});
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
    saveGame({
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
        affixes: eq.affixes.map(a => ({ stat: a.stat, value: a.value, element: a.element })),
        setName: eq.setName,
      })),
      runes: SKILL_SLOTS.flatMap(slot => {
        const r = skillRune(slot);
        return r ? [{ slot, rune: r }] : [];
      }),
      theme: state.theme,
    }).then(msg => inf('save', `saved: ${msg}`)).catch(e => wrn('save', `save failed: ${e}`));
  }
  if (e.key === 'r' || e.key === 'R') {
    // 避免和 L (log level) 冲突; 这里只触发 read 不切换 log level
    if (!(window as unknown as { __lvl?: LogLevel }).__lvl) {
      loadGame().then(d => {
        state.player.pos.x = d.player_x;
        state.player.pos.y = d.player_y;
        state.player.hp = d.player_hp;
        state.player.mp = d.player_mp;
        state.player.facing.x = d.facing_x;
        state.player.facing.y = d.facing_y;
        state.score = d.score;
        state.player.level = d.level ?? 1;
        // 装备层还原 (重建 id, 统一走拥有列表)
        const owned = getOwned(state);
        owned.length = 0;
        for (const it of d.owned) {
          owned.push({
            id: allocEquipmentId(),
            name: it.name,
            rarity: it.rarity,
            pos: { x: 0, y: 0 },
            size: { w: 24, h: 24 },
            affixes: it.affixes.map(a => ({ stat: a.stat, value: a.value, element: a.element })),
            pickedUp: true,
            setName: it.setName,
          });
        }
        recomputeCombat(state);
        // 永久层: 符文绑定 (按槽) + 主题
        for (const rr of d.runes ?? []) {
          const sk = SKILL_SLOTS.includes(rr.slot) ? getSkill(rr.slot) : null;
          if (sk) sk.rune = rr.rune;
        }
        if (d.theme && d.theme !== state.theme) {
          state.theme = d.theme;
          playBgmClient(`bgm_${state.theme}`);
        }
        inf('save', `loaded: pos=(${d.player_x.toFixed(0)},${d.player_y.toFixed(0)}) hp=${d.player_hp.toFixed(0)} owned=${owned.length} theme=${state.theme}`);
      }).catch(e => wrn('save', `load failed: ${e}`));
    }
  }
  // T 键循环切换主题
  if (e.key === 't' || e.key === 'T') {
    const themes = ['forest', 'desert', 'ruin', 'void'] as const;
    const i = themes.indexOf(state.theme);
    state.theme = themes[(i + 1) % themes.length];
    inf('world', `theme → ${state.theme}`);
    playBgmClient(`bgm_${state.theme}`);
  }
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
inf('loop', 'main loop start');

let last = performance.now();
let frameCount = 0;
let lastFpsT = performance.now();
function loop(now: number) {
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

  // 暂停时: 跳过游戏逻辑更新, 但仍渲染当前帧 (让 PAUSED 文字画在最新画面上)
  if (state.paused) {
    drawFrame();
    mouse.reset();
    requestAnimationFrame(loop);
    return;
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
  // CD 递减 (药水/翻滚)
  if (state.player.potionCd > 0) state.player.potionCd -= dt;
  if (state.player.dodgeT > 0) state.player.dodgeT -= dt;
  if (state.player.dodgeCd > 0) state.player.dodgeCd -= dt;
  resolveFireballHits(state);
  resolveMeleeHits(state);
  state.player.mp = Math.min(100, state.player.mp + 10 * dt);
  state.player.hp = Math.min(100, state.player.hp + 2 * dt);  // 被动回血

  // 死亡检测
  if (state.player.hp <= 0 && !state.dying) {
    state.dying = true;
    state.deathTimer = 2.0;  // 2s 后重开
    inf('combat', 'YOU DIED (score=' + state.score + ')');
  }
  if (state.dying) {
    state.deathTimer -= dt;
    if (state.deathTimer <= 0) {
      // 重开
      state.dying = false;
      state.fireballs.length = 0;
      state.score = 0;
      state.player.potions = { hp: 3, mp: 3 };
      state.player.potionCd = 0;
      state.player.dodgeT = 0;
      state.player.dodgeCd = 0;
      state.monsters.length = 0;
      for (let i = 0; i < 5; i++) state.monsters.push(spawnThemeMonster(state));
      import('./game/state').then(({ resetPlayer }) => resetPlayer(state));
      inf('gl', 'respawned');
    }
  }

  // 怪物被清空后重生 (保持地图始终有怪)
  if (state.monsters.length < 3) {
    state.monsters.push(spawnThemeMonster(state));
    dbg('world', `respawn ${t}, total=${state.monsters.length}`);
  }

  drawFrame();
  mouse.reset();
  requestAnimationFrame(loop);
}

/** 单帧绘制: 清屏 + 地面 + 墙 + 粒子 + 火球 + 怪物 + 玩家 + HUD */
function drawFrame() {

  // 鼠标技能: LMB/RMB 立即触发 (方向 = 鼠标位置)
  const aimDir = mouseAimDirection(state, mouse.state());
  if (mouse.wasClicked('LMB')) {
    if (tryCastSlot('LMB', state, aimDir, nowSec)) {
      invoke('play_sfx', { name: 'swing' }).catch(() => {});
    } else {
      dbg('skill', 'LMB on cd');
    }
  }
  if (mouse.wasClicked('RMB')) {
    if (tryCastSlot('RMB', state, aimDir, nowSec)) {
      invoke('play_sfx', { name: 'swing' }).catch(() => {});
    } else {
      dbg('skill', 'RMB on cd');
    }
  }
  // MMB 预留: 符文切换已移除 (US-004: 10 级三选一绑定)

  // 暂停时: 跳过游戏逻辑 (但仍画当前帧 + pause 遮罩)
  if (state.paused) {
    mouse.reset();
    requestAnimationFrame(loop);
    return;
  }

  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT);
  // ↑ 上面 2 行保留但被 drawFrameToScreen 重复执行; 这块临时兼容旧引用
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

  // 近战挥击 (slash particle, 在玩家前)
  for (const s of getSwings(state)) {
    const sp = worldToScreen(state, s.pos);
    if (sp.x + s.size.w < 0 || sp.x > state.viewport.w) continue;
    drawSprite(gl, quad, res, sp, s.size, 'particles', 'slash_01');
  }

  for (const f of state.fireballs) {
    const sp = worldToScreen(state, f.pos);
    drawSprite(gl, quad, res, sp, f.size, 'particles', 'magic_01');
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
      m.hitFlash > 0 ? [1, 0.3, 0.3] : MONSTER_DEFS[m.type].tint;
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

  // 暂停遮罩 (Canvas2D 文字层)
  if (state.paused) {
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
      hudCtx.fillText('1 继续 · 2 设置 · P 存档', hudCanvas.width / 2, hudCanvas.height / 2);
      hudCtx.fillStyle = '#777';
      hudCtx.font = '14px monospace';
      hudCtx.fillText('Ctrl+1..6 分配技能点 · Ctrl+Q 退出(未实现)', hudCanvas.width / 2, hudCanvas.height / 2 + 34);
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
      hudCtx.fillStyle = '#999';
      hudCtx.font = '14px monospace';
      hudCtx.fillText('WASD 移动 · 鼠标左/右键 近战 · Q 火球  W 连发  E 回血  R 大招', hudCanvas.width / 2, hudCanvas.height / 2 + 46);
      hudCtx.fillText('Ctrl+1..6 技能点 · P 存档 · R 读档 · T 主题 · L 日志级别', hudCanvas.width / 2, hudCanvas.height / 2 + 70);
      hudCtx.fillText('[Esc] 返回暂停菜单', hudCanvas.width / 2, hudCanvas.height / 2 + 100);
    }
    hudCtx.textAlign = 'left';
  }

  // 死亡屏
  if (state.dying) {
    hudCtx.fillStyle = 'rgba(120, 0, 0, 0.7)';
    hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
    hudCtx.fillStyle = '#fff';
    hudCtx.font = 'bold 56px monospace';
    hudCtx.textAlign = 'center';
    hudCtx.textBaseline = 'middle';
    hudCtx.fillText('YOU DIED', hudCanvas.width / 2, hudCanvas.height / 2 - 20);
    hudCtx.font = '24px monospace';
    hudCtx.fillText(`score: ${state.score}`, hudCanvas.width / 2, hudCanvas.height / 2 + 30);
    hudCtx.font = '16px monospace';
    hudCtx.fillText(`respawn in ${state.deathTimer.toFixed(1)}s`, hudCanvas.width / 2, hudCanvas.height / 2 + 70);
    hudCtx.textAlign = 'left';
  }

  mouse.reset();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);