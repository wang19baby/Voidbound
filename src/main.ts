// Voidbound 入口: 程序化分块世界 + 摄像机跟随 + 墙碰撞 + 火球 + 近战 + HUD + 日志 + 鼠标技能

import { createContext } from './render/gl/context';
import { createQuadBuffer } from './render/gl/resources';
import { VERT, FRAG } from './render/shaders';
import { loadAtlas } from './ipc/atlas';
import { buildRenderResources } from './render/resources';
import { attachKeyboard } from './input/keyboard';
import { attachMouse, type MouseHandle } from './input/mouse';
import { updatePlayer, castFireball } from './game/player';
import { updateFireballs, spawnFireball, updateCamera, pickPlayerSprite, worldToScreen, WORLD_W, WORLD_H } from './game/state';
import { getActiveWalls, type Wall } from './game/world';
import { drawSprite } from './render/draw';
import { drawHud, drawHudOverlay, setMouseReticle } from './render/hud';
import { makeCooldown } from './game/cooldown';
import { tryCastSlot, updateSwings, getSwings, type SkillSlot } from './game/skill';
import { spawnMonster, updateMonsters, resolveFireballHits, resolveMeleeHits, type MonsterType, MONSTER_DEFS } from './game/monster';
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

inf('world', `world size ${WORLD_W}x${WORLD_H} (16x viewport), chunked procedural`);

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
    facing: { x: 0, y: 0 },
    idleT: 0,
    flipDir: 'N' as 'L' | 'R' | 'N',
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
  resources: res,
};

// 初始 spawn 5 只怪物: 2 bat + 2 slime + 1 worm
for (let i = 0; i < 2; i++) state.monsters.push(spawnMonster(state, 'bat'));
for (let i = 0; i < 2; i++) state.monsters.push(spawnMonster(state, 'slime'));
state.monsters.push(spawnMonster(state, 'worm'));
inf('world', `spawned ${state.monsters.length} monsters (2 bat + 2 slime + 1 worm)`);

window.addEventListener('keydown', (e) => {
  if (e.key === 'q' || e.key === 'Q') {
    const nowSec = performance.now() / 1000;
    // 技能方向 = 鼠标位置 - 玩家中心, 转换为世界方向
    const aimDir = mouseAimDirection(state, mouse.state());
    if (!tryCastSlot('Q', state, aimDir, nowSec)) {
      wrn('skill', 'cast Q failed (cd or mp)');
    }
  }
  if (e.key === 'l' || e.key === 'L') {
    const order: LogLevel[] = ['DBG', 'INF', 'WRN'];
    const cur = (window as unknown as { __lvl?: LogLevel }).__lvl ?? 'INF';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    (window as unknown as { __lvl?: LogLevel }).__lvl = next;
    setLogLevel(next);
    inf('gl', `log level → ${next}`);
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
  resolveFireballHits(state);
  resolveMeleeHits(state);
  state.player.mp = Math.min(100, state.player.mp + 10 * dt);
  state.player.hp = Math.min(100, state.player.hp + 2 * dt);  // 被动回血

  // 怪物被清空后重生 (保持地图始终有怪)
  if (state.monsters.length < 3) {
    const pool: MonsterType[] = ['bat', 'bat', 'slime', 'slime', 'worm'];
    const t = pool[Math.floor(Math.random() * pool.length)];
    state.monsters.push(spawnMonster(state, t));
    dbg('world', `respawn ${t}, total=${state.monsters.length}`);
  }

  // 鼠标技能: LMB/RMB 立即触发 (方向 = 鼠标位置)
  const aimDir = mouseAimDirection(state, mouse.state());
  if (mouse.wasClicked('LMB')) {
    if (!tryCastSlot('LMB', state, aimDir, nowSec)) {
      dbg('skill', 'LMB on cd');
    }
  }
  if (mouse.wasClicked('RMB')) {
    if (!tryCastSlot('RMB', state, aimDir, nowSec)) {
      dbg('skill', 'RMB on cd');
    }
  }

  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // 设置 reticle 位置给 drawHud 用
  setMouseReticle(mouse.state().pos.x, mouse.state().pos.y);

  drawSprite(
    gl, quad, res,
    { x: -state.camera.x + state.world.floorPos.x, y: -state.camera.y + state.world.floorPos.y },
    state.world.floorSize,
    'world', 'floor',
  );

  for (const w of state.world.walls) {
    const sp = worldToScreen(state, w.pos);
    if (sp.x + w.size.w < 0 || sp.x > state.viewport.w) continue;
    if (sp.y + w.size.h < 0 || sp.y > state.viewport.h) continue;
    drawSprite(gl, quad, res, sp, w.size, 'world', 'wall');
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

  // 怪物 (受击时变红通过叠加红色 sprite 简化: 闪烁时整体用纯色 tint; M1 先省略)
  for (const m of state.monsters) {
    const sp = worldToScreen(state, m.pos);
    if (sp.x + m.size.w < 0 || sp.x > state.viewport.w) continue;
    if (sp.y + m.size.h < 0 || sp.y > state.viewport.h) continue;
    drawSprite(gl, quad, res, sp, m.size, 'monsters', MONSTER_DEFS[m.type].sprite);
    // HP 条
    const def = MONSTER_DEFS[m.type];
    const frac = Math.max(0, m.hp) / def.hp;
    const barW = m.size.w;
    const barH = 3;
    drawSprite(gl, quad, res, { x: sp.x, y: sp.y - 5 }, { w: barW * frac, h: barH }, 'ui', 'slide_horizontal_color');
    drawSprite(gl, quad, res, { x: sp.x + barW * frac, y: sp.y - 5 }, { w: barW * (1 - frac), h: barH }, 'ui', 'slide_horizontal_grey');
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

  mouse.reset();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);