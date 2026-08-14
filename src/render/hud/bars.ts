// HUD 顶部/小地图/血条绘制 (Canvas2D overlay)

import type { GameState } from '../../game/state';
import { MAX_HP, MAX_MP, expNext } from '../../game/player';
import { DIFFICULTY_MODS } from '../../game/difficulty';
import { MONSTER_DEFS } from '../../game/monster';
import { worldToScreen, WORLD_W, WORLD_H } from '../../game/state';
import { formatHudTime } from './format';
import { HUD_PAD, BAR_WIDTH, BAR_HEIGHT } from './types';

// 左上 HP/MP 边框 + 数值
export function drawHpMpOutline(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  ctx2d.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx2d.strokeRect(HUD_PAD, HUD_PAD, BAR_WIDTH, BAR_HEIGHT);
  ctx2d.strokeRect(HUD_PAD, HUD_PAD + BAR_HEIGHT + 4, BAR_WIDTH, BAR_HEIGHT);
  ctx2d.fillStyle = '#fff';
  ctx2d.font = 'bold 11px monospace';
  ctx2d.fillText(`HP ${Math.round(state.player.hp)}/${MAX_HP}`, HUD_PAD + 6, HUD_PAD + 2);
  ctx2d.fillText(`MP ${Math.round(state.player.mp)}/${MAX_MP}`, HUD_PAD + 6, HUD_PAD + BAR_HEIGHT + 6);
}

// 经验条 + 等级
export function drawExpBar(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  const need = expNext(state.player.level);
  const frac = Math.min(1, (state.player.exp ?? 0) / need);
  const expY = HUD_PAD + BAR_HEIGHT * 2 + 12;
  ctx2d.fillStyle = 'rgba(0,0,0,0.5)';
  ctx2d.fillRect(HUD_PAD, expY, BAR_WIDTH, 6);
  ctx2d.fillStyle = '#b070ff';
  ctx2d.fillRect(HUD_PAD, expY, BAR_WIDTH * frac, 6);
  ctx2d.fillStyle = '#dfd6ff';
  ctx2d.font = '12px monospace';
  ctx2d.fillText(`Lv ${state.player.level}   EXP ${state.player.exp ?? 0}/${need}`, HUD_PAD, expY + 10);
}

// 右上: 金币/积分/击杀/难度 + 跑局进度 (右对齐)
export function drawTopRightStats(ctx2d: CanvasRenderingContext2D, state: GameState, vw: number): void {
  const rx = vw - HUD_PAD;
  ctx2d.textAlign = 'right';
  ctx2d.fillStyle = '#ffd64a';
  ctx2d.font = 'bold 15px monospace';
  ctx2d.fillText(`金 ${state.player.gold ?? 0}`, rx, HUD_PAD);
  ctx2d.fillStyle = '#fff';
  ctx2d.font = '13px monospace';
  ctx2d.fillText(`积分 ${state.combat.score}`, rx, HUD_PAD + 22);
  ctx2d.fillStyle = '#bbb';
  ctx2d.fillText(`击杀 ${state.combat.killsTotal ?? 0}`, rx, HUD_PAD + 40);
  ctx2d.fillStyle = '#9cc';
  ctx2d.fillText(`难度 ${DIFFICULTY_MODS[state.difficulty].name}`, rx, HUD_PAD + 58);
  if (state.screen === 'dungeon') {
    ctx2d.fillStyle = '#aaf';
    ctx2d.fillText(`剩余 ${state.run.alive} 怪 · ${formatHudTime(state.run.timeSec)}`, rx, HUD_PAD + 76);
  }
  ctx2d.textAlign = 'left';
}

// 小地图 (OPT-024): 战斗场景右上
// 设计: 已探索灰底持久显示 + 墙 (仅已探索区) + 怪物红点 (仅已探索区, 反透视) + 玩家三角 + 传送门标记
export function drawMinimap(ctx2d: CanvasRenderingContext2D, state: GameState, vw: number): void {
  if (state.screen !== 'dungeon') return;
  const mw = 140;
  const mh = Math.round((mw * state.world.h) / state.world.w);
  const rx = vw - HUD_PAD;
  const mx = rx - mw;
  const my = HUD_PAD + 116;
  ctx2d.fillStyle = 'rgba(8, 8, 16, 0.6)';
  ctx2d.fillRect(mx, my, mw, mh);
  const sx = mw / state.world.w;
  const sy = mh / state.world.h;
  // 已探索底: 遍历 explored (持久, 非视野内) — 64px 块降采样为 8px 方格 (320x180 → 40x23 格)
  const GRP = 8;
  const groups = new Set<string>();
  for (const key of state.ui.explored) {
    const [bx, by] = key.split(',').map(Number);
    groups.add(`${bx >> 3},${by >> 3}`);
  }
  ctx2d.fillStyle = 'rgba(180,200,255,0.14)';
  for (const g of groups) {
    const [gx, gy] = g.split(',').map(Number);
    ctx2d.fillRect(mx + gx * GRP * 64 * sx, my + gy * GRP * 64 * sy, GRP * 64 * sx + 0.5, GRP * 64 * sy + 0.5);
  }
  // 墙: 仅已探索块 (与旧逻辑一致)
  for (const w of state.world.walls) {
    const bl = Math.floor(w.pos.x / 64) + ',' + Math.floor(w.pos.y / 64);
    if (!state.ui.explored.has(bl)) continue;
    ctx2d.fillStyle = '#5a5a6a';
    ctx2d.fillRect(mx + w.pos.x * sx, my + w.pos.y * sy, Math.max(1, w.size.w * sx), Math.max(1, w.size.h * sy));
  }
  // 怪物: 3×3 红点 (Boss 4×4 橙), 仅已探索区 (战争迷雾反透视)
  for (const m of state.fx.monsters) {
    const bl = Math.floor(m.pos.x / 64) + ',' + Math.floor(m.pos.y / 64);
    if (!state.ui.explored.has(bl)) continue;
    const boss = MONSTER_DEFS[m.type].boss;
    ctx2d.fillStyle = boss ? '#f80' : '#f55';
    ctx2d.fillRect(mx + m.pos.x * sx - 1, my + m.pos.y * sy - 1, boss ? 4 : 3, boss ? 4 : 3);
  }
  // 传送门 (Boss 死亡位, A-W1): 紫色标记 — 出口/终点标记 (OPT-024)
  for (const p of state.run.portals) {
    if (p.used) continue;
    ctx2d.fillStyle = '#c9aaff';
    ctx2d.fillRect(mx + p.x * sx - 1, my + p.y * sy - 1, 4, 4);
  }
  // 玩家: 白三角 (canvas 无旋转: 用方块 + 朝向小点)
  ctx2d.fillStyle = '#fff';
  ctx2d.fillRect(mx + state.player.pos.x * sx - 2, my + state.player.pos.y * sy - 2, 5, 5);
  const explFrac = Math.min(1, state.ui.explored.size / ((WORLD_W / 64) * (WORLD_H / 64)));
  ctx2d.fillStyle = '#8f8';
  ctx2d.font = '11px monospace';
  ctx2d.fillText(`探索 ${Math.round(explFrac * 100)}%`, rx, my + mh + 4);
}

// 低血量红晕 (OPT-026)
export function drawLowHpVignette(ctx2d: CanvasRenderingContext2D, state: GameState, vw: number, vh: number): void {
  if (state.screen !== 'dungeon') return;
  if (state.player.hp / MAX_HP >= 0.25) return;
  const g = ctx2d.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.7);
  g.addColorStop(0, 'rgba(180, 0, 0, 0)');
  g.addColorStop(1, 'rgba(180, 0, 0, 0.35)');
  ctx2d.fillStyle = g;
  ctx2d.fillRect(0, 0, vw, vh);
}

// 精英名牌
export function drawEliteNames(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  if (state.screen !== 'dungeon') return;
  for (const m of state.fx.monsters) {
    if (!m.elite) continue;
    const sp = worldToScreen(state, m.pos);
    ctx2d.fillStyle = '#ffd64a';
    ctx2d.font = 'bold 11px monospace';
    ctx2d.textAlign = 'center';
    ctx2d.fillText(`精英·${MONSTER_DEFS[m.type].type}`, sp.x + m.size.w / 2, sp.y - 12);
    ctx2d.textAlign = 'left';
  }
}

// Boss 顶栏血条
export function drawBossHpBar(ctx2d: CanvasRenderingContext2D, state: GameState, vw: number): void {
  if (state.screen !== 'dungeon') return;
  const boss = state.fx.monsters.find(m => MONSTER_DEFS[m.type].boss);
  if (!boss) return;
  const bw = 360;
  const bh = 14;
  const bx = vw / 2 - bw / 2;
  const by = 12;
  ctx2d.fillStyle = 'rgba(0,0,0,0.55)';
  ctx2d.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
  const frac = Math.max(0, boss.hp) / boss.maxHp;
  ctx2d.fillStyle = '#b03030';
  ctx2d.fillRect(bx, by, bw * frac, bh);
  ctx2d.fillStyle = '#333';
  ctx2d.fillRect(bx + bw * frac, by, bw * (1 - frac), bh);
  ctx2d.fillStyle = '#fff';
  ctx2d.font = 'bold 12px monospace';
  ctx2d.textAlign = 'center';
  ctx2d.fillText(`${MONSTER_DEFS[boss.type].type}  ${Math.ceil(boss.hp)}/${boss.maxHp}${boss.phase === 2 ? '  [狂暴]' : ''}`, vw / 2, by - 8);
  ctx2d.textAlign = 'left';
}