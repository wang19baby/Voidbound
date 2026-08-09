# M1 WASD 红色方块 (Day 3-4) 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 1280×720 Tauri 窗口里渲染 `barbarian_stand`（16×16 → 64×64），按 WASD 八方向 200 px/s 移动，60 FPS。

**Architecture:**
- 渲染层 `src/render/` 用 WebGL2：单 program + 单 quad VBO/IBO + 单 atlas texture
- 输入层 `src/input/keyboard.ts` 监听 keydown/keyup/blur/visibilitychange 维护4-bit 位掩码 + 八方向归一化
- 主循环 `src/main.ts` 用 `requestAnimationFrame`，`dt = min(now - last, 33ms)`
- IPC `src/ipc/atlas.ts` 调 `invoke('load_atlas', 'characters')` 拿 base64 PNG + sprite 元数据
- 资源单独：`src/render/resources.ts` 持有 atlas；`src/game/state.ts` 只留 player

**Tech Stack:** Tauri 2.2 + WebGL2 + 原生 TypeScript (无 React/Three.js)

**Error Policy:** 无兜底。任何失败（shader 编译 / invoke reject / PNG 解码 / canvas 缺失）直接 `throw`，不进主循环。

---

## 架构评审结论（ecc:architect，7.4/10）

- **P0** 键盘失焦清零（已纳入 Task 2）
- **P1** 启动顺序硬约束 + 失败 throw、resize 同步、atlas 抽到 RenderResources
- **P2** gl.ts 预防性拆分（context / resources / textures，对外 barrel 重导出）

---

## Task 1: 资源加载 + 基础模块骨架

**Files:**
- Create: `src/render/gl/context.ts`
- Create: `src/render/gl/resources.ts`
- Create: `src/render/gl/textures.ts`
- Create: `src/render/gl/index.ts` (barrel)
- Create: `src/render/shaders.ts`
- Create: `src/render/resources.ts` (RenderResources: atlas + texture + sprite 表)
- Create: `src/render/draw.ts` (drawSprite)
- Create: `src/ipc/atlas.ts` (Tauri invoke wrapper, 无 Promise 缓存)
- Create: `src/input/keyboard.ts` (KeyState bitmask + resetKeys + direction)
- Create: `src/game/state.ts` (GameState: 只 player)
- Create: `src/game/player.ts` (update: vel = direction * 200, clamp 到 viewport)
- Modify: `src/index.html` (加 `<canvas id="gl">` + `<script type="module" src="main.ts">`)
- Create: `src/main.ts` (入口: 启动顺序硬约束 + resize)

**Step 1:** 写 `src/render/shaders.ts` — vertex/fragment GLSL 字符串常量。
**Step 2:** 写 `src/render/gl/context.ts` — `createContext(canvas)`: getContext('webgl2') 失败 throw。
**Step 3:** 写 `src/render/gl/resources.ts` — `createQuadBuffer(gl)`: 4 顶点(xy, uv) + 6 索引。
**Step 4:** 写 `src/render/gl/textures.ts` — `uploadPngTexture(gl, pngBytes)`。
**Step 5:** 写 `src/render/gl/index.ts` — barrel 重导出。
**Step 6:** 写 `src/input/keyboard.ts` — KeyState + direction + resetKeys。
**Step 7:** 写 `src/ipc/atlas.ts` — `loadCharactersAtlas()`。
**Step 8:** 写 `src/game/state.ts` + `src/game/player.ts`。
**Step 9:** 写 `src/render/resources.ts` — 持有 atlas + texture。
**Step 10:** 写 `src/render/draw.ts` — drawSprite。
**Step 11:** 写 `src/main.ts` — 入口装配 + 主循环 + resize。
**Step 12:** 改 `src/index.html` — `<canvas>` + module script。

## Task 2: 验证 (Rust 9 测试 + 视觉冒烟)

**Step 1:** `cd src-tauri && cargo test --lib` → 期望 3 passed
**Step 2:** `cd assets/atlas/tests/rust_parser && cargo test` → 期望 9 passed
**Step 3:** `cd src-tauri && cargo run` → 窗口出现 64×64 红色方块，按 WASD 八方向移动
**Step 4:** alt-tab 切走再切回，角色立即停止（验证 P0）
**Step 5:** 拖拽窗口，sprite 跟着重定位（验证 resize）

---

## 文件级规范

### `src/render/shaders.ts`
```ts
export const VERT = `#version 300 es
in vec2 a_pos; in vec2 a_uv; uniform vec2 u_pos; uniform vec2 u_size; uniform vec4 u_uv;
out vec2 v_uv;
void main() {
  vec2 p = a_pos * u_size + u_pos;
  gl_Position = vec4(p / vec2(1280.0, 720.0) * 2.0 - 1.0, 0.0, 1.0);
  v_uv = a_uv * u_uv.zw + u_uv.xy;
}`;
export const FRAG = `#version 300 es
precision mediump float; in vec2 v_uv; uniform sampler2D u_tex; out vec4 o;
void main() { o = texture(u_tex, v_uv); }`;
```

### `src/render/gl/context.ts`
```ts
export function createContext(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('WebGL2 不可用');
  return gl;
}
```

### `src/render/gl/resources.ts`
```ts
export interface QuadResources {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  uPos: WebGLUniformLocation;
  uSize: WebGLUniformLocation;
  uUv: WebGLUniformLocation;
  uTex: WebGLUniformLocation;
}
export function createQuadBuffer(gl: WebGL2RenderingContext, vs: string, fs: string): QuadResources {
  // 编译 vs/fs，失败 throw gl.getShaderInfoLog
  // 4 顶点 (xy, uv) + 6 索引 (0,1,2, 0,2,3)
  // 链接 program, 缓存 uniform locations
  // 创建 VAO + VBO + IBO
  return { program, vao, uPos, uSize, uUv, uTex };
}
```

### `src/render/gl/textures.ts`
```ts
export function uploadPngTexture(gl: WebGL2RenderingContext, pngBytes: Uint8Array): WebGLTexture {
  // 用 ImageBitmap → ImageData → RGBA bytes (Rust 返回 PNG, 客户端解码)
  // texImage2D(RGBA, RGBA, UNSIGNED_BYTE)
  // 设置 LINEAR 过滤 + CLAMP_TO_EDGE
  return tex;
}
```

### `src/input/keyboard.ts`
```ts
export type KeyState = { w: 0|1; a: 0|1; s: 0|1; d: 0|1 };
export function attachKeyboard(win: Window = window): { get: () => KeyState; direction: () => {x:number;y:number}; reset: () => void } {
  const state: KeyState = { w:0, a:0, s:0, d:0 };
  // keydown/keyup → 维护 state (key.toLowerCase() in 'wasd')
  // win.addEventListener('blur', reset) ← P0
  // document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); })
  function reset() { state.w = state.a = state.s = state.d = 0; }
  function get() { return { ...state }; }
  function direction() {
    let x = (state.d?1:0) - (state.a?1:0);
    let y = (state.s?1:0) - (state.w?1:0);
    if (x !== 0 || y !== 0) { const m = Math.hypot(x, y); x /= m; y /= m; }
    return { x, y };
  }
  return { get, direction, reset };
}
```

### `src/ipc/atlas.ts`
```ts
import type { LoadedAtlas } from '../../src-tauri/src/render/atlas';
export async function loadCharactersAtlas(): Promise<LoadedAtlas> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<LoadedAtlas>('load_atlas', { name: 'characters' });
}
```

### `src/render/resources.ts`
```ts
import type { LoadedAtlas } from '../src-tauri/src/render/atlas';
export interface SpriteMeta { name: string; x: number; y: number; frame_width: number; frame_height: number; frames: number; }
export interface RenderResources {
  atlas: LoadedAtlas;
  texture: WebGLTexture;
  sprites: Map<string, SpriteMeta>;
}
export function buildRenderResources(gl: WebGL2RenderingContext, atlas: LoadedAtlas): RenderResources {
  // base64 → Uint8Array → uploadPngTexture
  // sprites: Map.fromEntries(atlas.sprites.map(s => [s.name, s]))
  return { atlas, texture: tex, sprites };
}
export function spriteUv(s: SpriteMeta, atlasW: number, atlasH: number): [number,number,number,number] {
  return [s.x/atlasW, s.y/atlasH, s.frame_width/atlasW, s.frame_height/atlasH];
}
```

### `src/game/state.ts`
```ts
import type { RenderResources } from '../render/resources';
export interface Player { pos: { x: number; y: number }; size: { w: number; h: number }; speed: number }
export interface GameState {
  player: Player;
  bounds: { w: number; h: number };
}
```

### `src/game/player.ts`
```ts
import type { GameState } from './state';
export function updatePlayer(state: GameState, dir: { x: number; y: number }, dt: number): void {
  state.player.pos.x += dir.x * state.player.speed * dt;
  state.player.pos.y += dir.y * state.player.speed * dt;
  // clamp 到 viewport (含 sprite 自身大小)
  state.player.pos.x = Math.max(0, Math.min(state.bounds.w - state.player.size.w, state.player.pos.x));
  state.player.pos.y = Math.max(0, Math.min(state.bounds.h - state.player.size.h, state.player.pos.y));
}
```

### `src/render/draw.ts`
```ts
import type { GameState } from '../game/state';
import type { RenderResources, SpriteMeta } from './resources';
import type { QuadResources } from './gl/resources';
export function drawSprite(gl: WebGL2RenderingContext, q: QuadResources, res: RenderResources, state: GameState, spriteName: string): void {
  const sprite = res.sprites.get(spriteName);
  if (!sprite) return;
  gl.useProgram(q.program);
  gl.bindVertexArray(q.vao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, res.texture);
  gl.uniform1i(q.uTex, 0);
  gl.uniform2f(q.uPos, state.player.pos.x, state.player.pos.y);
  gl.uniform2f(q.uSize, state.player.size.w, state.player.size.h);
  const [u, v, du, dv] = spriteUv(sprite, res.atlas.width, res.atlas.height);
  gl.uniform4f(q.uUv, u, v, du, dv);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
}
```

### `src/main.ts`
```ts
import { createContext } from './render/gl/context';
import { createQuadBuffer } from './render/gl/resources';
import { VERT, FRAG } from './render/shaders';
import { loadCharactersAtlas } from './ipc/atlas';
import { buildRenderResources } from './render/resources';
import { attachKeyboard } from './input/keyboard';
import { updatePlayer } from './game/player';
import { drawSprite } from './render/draw';

const canvas = document.getElementById('gl') as HTMLCanvasElement;
canvas.width = 1280; canvas.height = 720;
const gl = createContext(canvas);
const quad = createQuadBuffer(gl, VERT, FRAG);

const atlas = await loadCharactersAtlas();          // 启动顺序硬约束, 失败 throw
const res = buildRenderResources(gl, atlas);

const keys = attachKeyboard(window);
const state = {
  player: { pos: { x: 100, y: 100 }, size: { w: 64, h: 64 }, speed: 200 },
  bounds: { w: 1280, h: 720 },
};

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
});

gl.viewport(0, 0, canvas.width, canvas.height);
gl.clearColor(0.1, 0.1, 0.1, 1);

let last = performance.now();
function loop(now: number) {
  const dt = Math.min((now - last) / 1000, 0.033);
  last = now;
  updatePlayer(state, keys.direction(), dt);
  gl.clear(gl.COLOR_BUFFER_BIT);
  drawSprite(gl, quad, res, state, 'barbarian_stand');
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
```

### `src/index.html`
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Voidbound</title>
  <style>html,body{margin:0;background:#111;overflow:hidden}canvas{display:block}</style>
</head>
<body>
  <canvas id="gl"></canvas>
  <script type="module" src="main.ts"></script>
</body>
</html>
```

---

## 验收（手测 5 步）

1. `cd src-tauri && cargo run` → 1280×720 紫黑底窗口，左上 64×64 红色方块
2. 按 D 1秒 → 方块右移 ~200 px；按 A 左移；按 W 上移；按 S 下移
3. 同时按 W+D → 斜向右上，位移距离与单方向相同（归一化验证）
4. alt-tab 切走 → 角色立即停（验证 P0 resetKeys）
5. 拖拽窗口改大小 → sprite 跟着新尺寸定位，无撕裂