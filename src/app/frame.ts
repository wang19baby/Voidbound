// app/frame.ts — 帧协调 + 帧绘制 (PR-008, 2026-08-13)
//
// 从 main.ts 拆出: 原 line 984-1255 (drawFrame 53 行 + drawFrameToScreen 213 行, 共 270 行)
//
// 设计:
// - FrameCtx 注入所有闭包依赖 (state/canvas/mouse/gl/quad/res/particleBatch + UI 回调 + 渲染层函数)
// - drawFrame: 主循环帧入口, 鼠标点击分发 + canvas clear + 调 drawFrameToScreen
// - drawFrameToScreen: 主画面绘制 (地板/墙/装饰 → 门/毒池 → 粒子 → 怪物 → VFX → 装备 → 玩家 → HUD + 暂停/死亡/通关/传送门/Boss 提示/首局引导)
// - 不直接依赖 main.ts 模块级变量

import type { GameState } from '../game/state';
import type { MouseHandle } from '../input/mouse';
import type { InstancedBatch } from '../render/instanced';
import type { RenderResources } from '../render/resources';
import type { QuadResources } from '../render/gl/resources';
import type { DrawCtx } from '../presentation/worldDraw/types';
import { drawFloor } from '../presentation/worldDraw/floor';
import { drawPortalAndPools } from '../presentation/worldDraw/portal';
import { drawParticles } from '../presentation/worldDraw/particles';
import { drawMonsters } from '../presentation/worldDraw/monsters';
import { MONSTER_DEFS } from '../game/monsters/defs';
import { drawVfx } from '../presentation/worldDraw/vfx';
import { drawLoot } from '../presentation/worldDraw/loot';
import { drawPlayer } from '../presentation/worldDraw/player';
import { inRect } from '../game/uigrid';
import { portalActive, nearPortal, nearestPortal } from '../game/portal';
import { diag } from '../util/diag';

export interface FrameCtx {
  // 渲染资源
  state: GameState;
  mouse: MouseHandle;
  canvas: HTMLCanvasElement;
  hudCanvas: HTMLCanvasElement;
  hudCtx: CanvasRenderingContext2D;
  gl: WebGL2RenderingContext;
  quad: QuadResources;
  res: RenderResources;
  particleBatch: InstancedBatch;
  // IPC (用于 play_sfx)
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  // HUD / UI 回调
  setHudHover: (key: string | null) => void;
  hudDungeonHit: (x: number, y: number, w: number, h: number) => string | null;
  isCloseConfirmOpen: () => boolean;
  confirmCloseSave: () => void;
  confirmCloseCancel: () => void;
  handleHudClick: (state: GameState, key: string, aim: { x: number; y: number }, nowSec: number) => void;
  tryCastSlot: (slot: 'LMB' | 'RMB', state: GameState, aim: { x: number; y: number }, nowSec: number) => boolean;
  notifyCastFail: (state: GameState, slot: 'LMB' | 'RMB') => void;
  handleUiClick: (ctx: { state: GameState; mx: number; my: number }) => boolean;
  // 渲染层函数
  setMouseReticle: (x: number, y: number) => void;
  drawHud: (gl: WebGL2RenderingContext, quad: QuadResources, state: GameState) => void;
  drawHudOverlay: (hudCtx: CanvasRenderingContext2D, state: GameState) => void;
  drawSettingsPanel: (state: GameState, hudCtx: CanvasRenderingContext2D, hudCanvas: HTMLCanvasElement) => void;
  // 输入辅助
  mouseAimDirection: (state: GameState, m: { pos: { x: number; y: number } }) => { x: number; y: number };
  // 格式化 + 常量
  formatTime: (sec: number) => string;
  DIFFICULTY_MODS: Record<string, { name: string }>;
}

/** 单帧绘制: 鼠标点击分发 + canvas clear + 调 drawFrameToScreen */
export function drawFrame(ctx: FrameCtx): void {
  // 技能 CD 时间基准 (drawFrame 独立作用域, 不能引用 loopImpl 的 nowSec)
  const nowSec = performance.now() / 1000;

  // 鼠标技能: LMB/RMB 立即触发 (方向 = 鼠标位置)
  const aimDir = ctx.mouseAimDirection(ctx.state, ctx.mouse.state());
  // 仅 dungeon 接受鼠标技能点击; 其余屏 LMB = UI 点击 (C-501)
  if (ctx.state.screen === 'dungeon') {
    if (ctx.state.tutorStep >= 0 && ctx.state.tutorStep < 3) {
      // v4 引导期间: 点击仅跳过气泡, 不触发攻击/技能
      if (ctx.mouse.wasClicked('LMB')) { ctx.state.tutorStep++; ctx.state.tutorT = 0; }
      ctx.setHudHover(null);
      ctx.canvas.style.cursor = 'default';
    } else {
    // 关窗确认优先: Y/N 按钮命中 (防止被攻击分支吞掉)
    const cp = ctx.mouse.state().pos;
    const yH = ctx.isCloseConfirmOpen() && inRect(cp.x, cp.y, ctx.state.viewport.w / 2 - 160, ctx.state.viewport.h / 2 + 40, 150, 40);
    const nH = ctx.isCloseConfirmOpen() && inRect(cp.x, cp.y, ctx.state.viewport.w / 2 + 10, ctx.state.viewport.h / 2 + 40, 150, 40);
    if (ctx.isCloseConfirmOpen() && ctx.mouse.wasClicked('LMB')) {
      if (yH) ctx.confirmCloseSave();
      else if (nH) ctx.confirmCloseCancel();
    }
    // HUD 按钮优先: 技能栏 4 槽 / 药水 HP·MP / 翻滚 (悬停高亮 + pointer 光标)
    const hudKey = ctx.isCloseConfirmOpen() ? null : ctx.hudDungeonHit(ctx.mouse.state().pos.x, ctx.mouse.state().pos.y, ctx.state.viewport.w, ctx.state.viewport.h);
    ctx.setHudHover(hudKey);
    ctx.canvas.style.cursor = (yH || nH || hudKey) ? 'pointer' : 'default';
    if (ctx.mouse.wasClicked('LMB')) {
      if (hudKey) {
        ctx.handleHudClick(ctx.state, hudKey, aimDir, nowSec);
      } else if (ctx.tryCastSlot('LMB', ctx.state, aimDir, nowSec)) {
        ctx.invoke('play_sfx', { name: 'swing' }).catch(() => {});
      } else {
        ctx.notifyCastFail(ctx.state, 'LMB');
      }
    }
    if (ctx.mouse.wasClicked('RMB')) {
      if (ctx.tryCastSlot('RMB', ctx.state, aimDir, nowSec)) {
        ctx.invoke('play_sfx', { name: 'swing' }).catch(() => {});
      } else {
        ctx.notifyCastFail(ctx.state, 'RMB');
      }
    }
    }
  } else if (ctx.mouse.wasClicked('LMB')) {
    ctx.handleUiClick({ state: ctx.state, mx: ctx.mouse.state().pos.x, my: ctx.mouse.state().pos.y });
  }
  // MMB 预留: 符文切换已移除 (US-004: 10 级三选一绑定)

  ctx.hudCtx.clearRect(0, 0, ctx.hudCanvas.width, ctx.hudCanvas.height);
  ctx.gl.clear(ctx.gl.COLOR_BUFFER_BIT);
  drawFrameToScreen(ctx);
}

/** 抽出单帧绘制逻辑 (含 pause 遮罩 / 死亡 / 通关 / 传送门 / Boss 入场 / 首局引导) */
export function drawFrameToScreen(ctx: FrameCtx): void {
  const { state, mouse, gl, quad, res, particleBatch, hudCtx, hudCanvas } = ctx;

  // 设置 reticle 位置给 drawHud 用
  ctx.setMouseReticle(mouse.state().pos.x, mouse.state().pos.y);

  const drawCtx: DrawCtx = { state, gl, quad, res, particleBatch };
  // 阶段包裹: 抛错时定位到具体绘制阶段 (diag 后原样重抛, loop 层继续兜底)
  const phases: Array<[string, () => void]> = [
    ['floor', () => drawFloor(drawCtx)],
    ['portal', () => drawPortalAndPools(drawCtx)],
    ['particles', () => drawParticles(drawCtx)],
    ['monsters', () => drawMonsters(drawCtx)],
    ['vfx', () => drawVfx(drawCtx)],
    ['loot', () => drawLoot(drawCtx)],
    ['player', () => drawPlayer(drawCtx, mouse.state().pos.x)],
    ['hud', () => ctx.drawHud(gl, quad, state)],
    ['hudOverlay', () => ctx.drawHudOverlay(hudCtx, state)],
  ];
  for (const [name, fn] of phases) {
    try {
      fn();
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      diag('render', `phase ${name} threw: ${msg}`);
      throw e;
    }
  }

  // 暂停遮罩 (Canvas2D 文字层; 装备面板时全屏面板代替)
  if (state.screen === 'pause') {
    hudCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
    hudCtx.textAlign = 'center';
    hudCtx.textBaseline = 'middle';
    if (state.ui.townConfirm) {
      // 放弃游戏确认框全屏覆盖: 不绘制下层暂停菜单按钮/设置面板, 避免 hover 高亮透传
    } else if (!state.ui.settingsOpen) {
      // 垂直按钮菜单: [1]继续 [2]设置 [3]城镇 (无主菜单/存档; 几何与 uiDispatch 'pause' 一致)
      hudCtx.fillStyle = '#fff';
      hudCtx.font = 'bold 40px monospace';
      hudCtx.fillText('PAUSED', hudCanvas.width / 2, hudCanvas.height / 2 - 130);
      const mp = ctx.mouse.state().pos;
      const bw = 220, bh = 40, gap = 12;
      const bx = hudCanvas.width / 2 - bw / 2;
      const y0 = hudCanvas.height / 2 - 46;
      const labels = ['1 继续', '2 设置', '3 城镇'];
      for (let i = 0; i < labels.length; i++) {
        const by = y0 + i * (bh + gap);
        const hit = inRect(mp.x, mp.y, bx, by, bw, bh);
        hudCtx.fillStyle = hit ? 'rgba(102,204,255,0.16)' : 'rgba(30,30,42,0.85)';
        hudCtx.fillRect(bx, by, bw, bh);
        hudCtx.strokeStyle = hit ? '#ffd64a' : '#4a4a5a';
        hudCtx.lineWidth = hit ? 2 : 1;
        hudCtx.strokeRect(bx, by, bw, bh);
        hudCtx.fillStyle = '#fff';
        hudCtx.font = 'bold 18px monospace';
        hudCtx.fillText(labels[i], hudCanvas.width / 2, by + bh / 2);
      }
    } else {
      // 设置面板 (C8: 与标题共用 drawSettingsPanel, 含滑条/键位自定义)
      ctx.drawSettingsPanel(state, hudCtx, hudCanvas);
    }
    // 城镇按钮确认: 放弃本次进度 (不保存) — 画在最上层
    if (state.ui.townConfirm) {
      const mp = ctx.mouse.state().pos;
      hudCtx.fillStyle = 'rgba(0,0,0,0.6)';
      hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
      hudCtx.textAlign = 'center';
      hudCtx.fillStyle = '#ffd';
      hudCtx.font = 'bold 22px monospace';
      hudCtx.fillText('放弃游戏?', hudCanvas.width / 2, hudCanvas.height / 2 - 40);
      hudCtx.fillStyle = '#f88';
      hudCtx.font = '14px monospace';
      hudCtx.fillText('本次获得的进度/物品不会保存', hudCanvas.width / 2, hudCanvas.height / 2 - 8);
      const bw = 200, bh = 40;
      const yR: [number, number, number, number] = [hudCanvas.width / 2 - 210, hudCanvas.height / 2 + 20, bw, bh];
      const nR: [number, number, number, number] = [hudCanvas.width / 2 + 10, hudCanvas.height / 2 + 20, bw, bh];
      const yH = inRect(mp.x, mp.y, ...yR);
      const nH = inRect(mp.x, mp.y, ...nR);
      hudCtx.fillStyle = yH ? 'rgba(255,106,106,0.25)' : 'rgba(60,20,20,0.9)';
      hudCtx.fillRect(...yR);
      hudCtx.strokeStyle = yH ? '#ff6a6a' : '#7a4a4a';
      hudCtx.lineWidth = yH ? 2 : 1;
      hudCtx.strokeRect(...yR);
      hudCtx.fillStyle = '#fff';
      hudCtx.font = 'bold 16px monospace';
      hudCtx.fillText('放弃游戏 [Y]', hudCanvas.width / 2 - 110, hudCanvas.height / 2 + 40);
      hudCtx.fillStyle = nH ? 'rgba(255,255,255,0.14)' : 'rgba(30,30,42,0.9)';
      hudCtx.fillRect(...nR);
      hudCtx.strokeStyle = nH ? '#c9aaff' : '#4a4a5a';
      hudCtx.lineWidth = nH ? 2 : 1;
      hudCtx.strokeRect(...nR);
      hudCtx.fillStyle = '#fff';
      hudCtx.fillText('取消 [N]', hudCanvas.width / 2 + 110, hudCanvas.height / 2 + 40);
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
      const uHit = state.ui.deathUndo > 0 && inRect(mouse.state().pos.x, mouse.state().pos.y, ...uR);
      hudCtx.fillStyle = state.ui.deathUndo > 0 ? (uHit ? 'rgba(140,255,140,0.18)' : 'rgba(40,70,40,0.7)') : 'rgba(30,30,34,0.5)';
      hudCtx.fillRect(...uR);
      hudCtx.strokeStyle = state.ui.deathUndo > 0 ? '#8f8' : '#444';
      hudCtx.lineWidth = uHit ? 2 : 1;
      hudCtx.strokeRect(...uR);
      hudCtx.fillStyle = state.ui.deathUndo > 0 ? '#8f8' : '#8a8a96';
      hudCtx.font = 'bold 15px monospace';
      hudCtx.fillText(state.ui.deathUndo > 0 ? `[4] 撤销死亡 (${state.ui.deathUndo.toFixed(1)}s · 免费)` : '撤销窗口已过', ux, uy + 18);
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
    hudCtx.fillText(`用时 ${ctx.formatTime(state.run.timeSec)} · 击杀 ${state.run.kills} · 难度 ${ctx.DIFFICULTY_MODS[state.difficulty].name}`, hudCanvas.width / 2, hudCanvas.height / 2 - 60);
    hudCtx.fillText(`得分 ${state.combat.score} · 掉落入背包 ${state.run.collectedLoot} 件`, hudCanvas.width / 2, hudCanvas.height / 2 - 30);
    if (state.run.best[state.difficulty] !== undefined) {
      hudCtx.fillStyle = '#aaa';
      hudCtx.font = '15px monospace';
      hudCtx.fillText(`最佳记录 ${ctx.formatTime(state.run.best[state.difficulty]!)}`, hudCanvas.width / 2, hudCanvas.height / 2);
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

  // dungeon HUD: Boss 方向指引 (设计 §2: 按模式锚定远处 — linear 右端/gauntlet 中央/extract 中央);
  // Boss 在场且未击杀 → 常驻方向箭头 (复用传送门指引式样, 橙色)
  if (state.screen === 'dungeon' && state.run.bossAlive && !state.run.bossKilled) {
    let bx = -1, by = -1;
    for (const m of state.fx.monsters) {
      if (m.hp > 0 && (MONSTER_DEFS[m.type].boss || m.bossLike)) { bx = m.pos.x + m.size.w / 2; by = m.pos.y + m.size.h / 2; break; }
    }
    if (bx >= 0) {
      const dx = bx - (state.player.pos.x + state.player.size.w / 2);
      const dy = by - (state.player.pos.y + state.player.size.h / 2);
      const dist = Math.hypot(dx, dy);
      if (dist > 320) {
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? '→' : '←') : (dy > 0 ? '↓' : '↑');
        hudCtx.textAlign = 'center';
        hudCtx.fillStyle = '#ff9530';
        hudCtx.font = 'bold 15px monospace';
        hudCtx.fillText(`BOSS ${dir} (${Math.round(dist / 40)}格)`, hudCanvas.width / 2, hudCanvas.height - 84);
        hudCtx.textAlign = 'left';
      }
    }
  }

  // dungeon HUD: 门前提示 (V 交互); Boss 死后未交互 → 持续引导到门
  if (state.screen === 'dungeon' && portalActive(state)) {
    hudCtx.textAlign = 'center';
    hudCtx.fillStyle = '#ffd64a';
    hudCtx.font = 'bold 15px monospace';
    if (nearPortal(state)) {
      hudCtx.fillText('[V] 打开传送门', hudCanvas.width / 2, hudCanvas.height - 60);
    } else {
      const np = nearestPortal(state);
      if (np) {
        const dx = np.x - (state.player.pos.x + state.player.size.w / 2);
        const dy = np.y - (state.player.pos.y + state.player.size.h / 2);
        const dist = Math.hypot(dx, dy);
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? '→' : '←') : (dy > 0 ? '↓' : '↑');
        hudCtx.fillStyle = '#ccaaff';
        hudCtx.fillText(`传送门 ${dir} (${Math.round(dist / 40)}格) — 前往回城结算`, hudCanvas.width / 2, hudCanvas.height - 60);
      }
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
  if (state.combat.bossIntroT > 0) {
    const t = state.combat.bossIntroT;
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
    hudCtx.fillText(state.combat.bossIntroTitle, hudCanvas.width / 2, hudCanvas.height / 2 - 30);
    hudCtx.fillStyle = `rgba(255, 220, 150, ${fadeIn})`;
    hudCtx.font = 'bold 24px monospace';
    hudCtx.fillText(state.combat.bossIntroText, hudCanvas.width / 2, hudCanvas.height / 2 + 26);
    hudCtx.textAlign = 'left';
    hudCtx.textBaseline = 'top';
  }

  mouse.reset();
}