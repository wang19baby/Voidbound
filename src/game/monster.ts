// 怪物系统: AI (wander/chase) + 血量 + 死亡
// 数据驱动: monster_defs 表, spawn 时按 type 选择

import type { GameState } from './state';
import { aabbOverlap } from './world';
import { inf, dbg } from '../util/log';
import { spawnDeathFx } from './deathFx';
import { playSfxClient } from '../ipc/sfx';
import { dropLoot } from './equipment';

export type MonsterType = 'bat' | 'slime' | 'worm';

export interface MonsterDef {
  type: MonsterType;
  sprite: string;            // atlas sprite name
  size: { w: number; h: number };
  hp: number;
  speed: number;             // px/s
  /** 检测玩家的距离 (触发追击) */
  aggroRange: number;
  /** 接触玩家造成伤害的距离 */
  attackRange: number;
  /** 接触伤害 */
  contactDmg: number;
  /** 击杀分数 */
  score: number;
}

export const MONSTER_DEFS: Record<MonsterType, MonsterDef> = {
  bat:   { type: 'bat',   sprite: 'bat',   size: { w: 32, h: 32 }, hp: 30,  speed: 80,  aggroRange: 200, attackRange: 28, contactDmg: 5,  score: 10 },
  slime: { type: 'slime', sprite: 'slime', size: { w: 32, h: 32 }, hp: 60,  speed: 40,  aggroRange: 160, attackRange: 30, contactDmg: 8,  score: 15 },
  worm:  { type: 'worm',  sprite: 'worm',  size: { w: 32, h: 32 }, hp: 45,  speed: 60,  aggroRange: 180, attackRange: 28, contactDmg: 6,  score: 12 },
};

export interface Monster {
  id: number;
  type: MonsterType;
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  hp: number;
  /** 直接抄自 def, 渲染/碰撞用 */
  size: { w: number; h: number };
  /** wander 状态的目标点 (世界坐标); 到达后重新选 */
  wanderTarget: { x: number; y: number };
  wanderTimer: number;       // 倒计时 (s), 到 0 重选 wanderTarget
  /** 攻击冷却 (避免每帧都扣血) */
  attackCd: number;
  hitFlash: number;          // 受击闪光剩余秒数
  /** walk 动画 (每 0.3s 切换 0/1) */
  walkFrame: 0 | 1;
  walkT: number;             // 倒计时 (s)
}

let nextMonsterId = 1;

/** 在玩家周围 (安全距离外) 随机 spawn 一只怪物; 避开墙 */
export function spawnMonster(state: GameState, type: MonsterType): Monster {
  const def = MONSTER_DEFS[type];
  // 半径 600-1200 px, 超出 aggroRange, 不立刻追杀
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 600 + Math.random() * 600;
    const x = state.player.pos.x + Math.cos(a) * r;
    const y = state.player.pos.y + Math.sin(a) * r;
    if (x < 64 || y < 64 || x > state.world.w - 64 || y > state.world.h - 64) continue;
    // 验证 spawn 点不撞墙
    let blocked = false;
    for (const w of state.world.walls) {
      if (aabbOverlap(x, y, def.size.w, def.size.h, w.pos.x, w.pos.y, w.size.w, w.size.h)) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    const m: Monster = {
      id: nextMonsterId++,
      type,
      pos: { x, y },
      vel: { x: 0, y: 0 },
      hp: def.hp,
      size: { ...def.size },
      wanderTarget: pickWanderTarget(state, x, y, def.aggroRange * 2),
      wanderTimer: 3 + Math.random() * 2,
      attackCd: 0,
      hitFlash: 0,
      walkFrame: 0,
      walkT: Math.random() * 0.3,
    };
    return m;
  }
  // 兜底: 玩家北 800
  return {
    id: nextMonsterId++,
    type,
    pos: { x: state.player.pos.x, y: state.player.pos.y - 800 },
    vel: { x: 0, y: 0 },
    hp: def.hp,
    size: { w: 32, h: 32 },
    wanderTarget: { x: state.player.pos.x, y: state.player.pos.y - 1000 },
    wanderTimer: 3,
    attackCd: 0,
    hitFlash: 0,
    walkFrame: 0,
    walkT: 0,
  };
}

function pickWanderTarget(state: GameState, x: number, y: number, radius: number): { x: number; y: number } {
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * radius;
    const tx = x + Math.cos(a) * r;
    const ty = y + Math.sin(a) * r;
    if (tx >= 0 && ty >= 0 && tx < state.world.w && ty < state.world.h) return { x: tx, y: ty };
  }
  return { x, y };
}

/** AABB 滑移 (复用玩家逻辑), 沿未阻挡轴保留位移 */
function slideAxis(rect: { x: number; y: number; w: number; h: number }, walls: ReadonlyArray<{ pos: { x: number; y: number }; size: { w: number; h: number } }>): { x: number; y: number } {
  let nx = rect.x, ny = rect.y;
  for (let iter = 0; iter < 4; iter++) {
    let hit = false;
    let minO = Infinity;
    let axis: 'x' | 'y' = 'x';
    let side = 0;
    for (const w of walls) {
      if (nx < w.pos.x + w.size.w && nx + rect.w > w.pos.x &&
          ny < w.pos.y + w.size.h && ny + rect.h > w.pos.y) {
        const oL = (nx + rect.w) - w.pos.x;
        const oR = (w.pos.x + w.size.w) - nx;
        const oT = (ny + rect.h) - w.pos.y;
        const oB = (w.pos.y + w.size.h) - ny;
        const m = Math.min(oL, oR, oT, oB);
        if (m < minO) {
          minO = m;
          axis = (m === oL || m === oR) ? 'x' : 'y';
          side = (m === oL || m === oT) ? -1 : 1;
          hit = true;
        }
      }
    }
    if (!hit) break;
    if (axis === 'x') nx = side < 0 ? (hit as never) === undefined as never : nx;  // placeholder removed below
  }
  // 简化版: 沿最浅推出轴位移
  let fx = rect.x, fy = rect.y;
  for (let iter = 0; iter < 4; iter++) {
    let hit = false;
    let bestAxis: 'x' | 'y' = 'x';
    let bestO = Infinity;
    let bestWall: typeof walls[number] | null = null;
    for (const w of walls) {
      if (fx < w.pos.x + w.size.w && fx + rect.w > w.pos.x &&
          fy < w.pos.y + w.size.h && fy + rect.h > w.pos.y) {
        const oL = (fx + rect.w) - w.pos.x;
        const oR = (w.pos.x + w.size.w) - fx;
        const oT = (fy + rect.h) - w.pos.y;
        const oB = (w.pos.y + w.size.h) - fy;
        const m = Math.min(oL, oR, oT, oB);
        if (m < bestO) { bestO = m; bestAxis = (m === oL || m === oR) ? 'x' : 'y'; bestWall = w; hit = true; }
      }
    }
    if (!hit) break;
    if (bestAxis === 'x') {
      // 判断左右推出
      const oL = (fx + rect.w) - bestWall!.pos.x;
      const oR = (bestWall!.pos.x + bestWall!.size.w) - fx;
      if (oL < oR) fx = bestWall!.pos.x - rect.w;
      else fx = bestWall!.pos.x + bestWall!.size.w;
    } else {
      const oT = (fy + rect.h) - bestWall!.pos.y;
      const oB = (bestWall!.pos.y + bestWall!.size.h) - fy;
      if (oT < oB) fy = bestWall!.pos.y - rect.h;
      else fy = bestWall!.pos.y + bestWall!.size.h;
    }
  }
  return { x: fx, y: fy };
}

/** AI 更新 (wander/chase/attack); dt 秒 */
export function updateMonsters(state: GameState, dt: number): void {
  const p = state.player.pos;
  const walls = state.world.walls;
  for (const m of state.monsters) {
    const def = MONSTER_DEFS[m.type];
    const dx = p.x - m.pos.x;
    const dy = p.y - m.pos.y;
    const dist = Math.hypot(dx, dy);

    if (m.attackCd > 0) m.attackCd -= dt;
    if (m.hitFlash > 0) m.hitFlash -= dt;

    // walk 动画
    m.walkT -= dt;
    if (m.walkT <= 0) {
      m.walkFrame = m.walkFrame === 0 ? 1 : 0;
      m.walkT = 0.3;
    }

    if (dist < def.aggroRange) {
      if (dist > 0.01) {
        m.vel.x = (dx / dist) * def.speed;
        m.vel.y = (dy / dist) * def.speed;
      }
      if (dist < def.attackRange && m.attackCd <= 0) {
        state.player.hp -= def.contactDmg;
        m.attackCd = 1.0;
        dbg('monster', `${m.type} hit player for ${def.contactDmg} (hp=${state.player.hp.toFixed(0)})`);
      }
    } else {
      m.wanderTimer -= dt;
      const tx = m.wanderTarget.x - m.pos.x;
      const ty = m.wanderTarget.y - m.pos.y;
      const tdist = Math.hypot(tx, ty);
      if (m.wanderTimer <= 0 || tdist < 16) {
        m.wanderTarget = pickWanderTarget(state, m.pos.x, m.pos.y, def.aggroRange * 2);
        m.wanderTimer = 3 + Math.random() * 3;
      } else {
        m.vel.x = (tx / tdist) * def.speed * 0.5;
        m.vel.y = (ty / tdist) * def.speed * 0.5;
      }
    }

    // 移动 + AABB 滑移 (墙)
    m.pos.x = Math.max(0, Math.min(state.world.w - def.size.w, m.pos.x + m.vel.x * dt));
    m.pos.y = Math.max(0, Math.min(state.world.h - def.size.h, m.pos.y + m.vel.y * dt));
    const slid = slideAxis({ x: m.pos.x, y: m.pos.y, w: def.size.w, h: def.size.h }, walls);
    m.pos.x = slid.x;
    m.pos.y = slid.y;
  }
}

/** 检查所有火球与怪物的碰撞, 命中扣血 */
export function resolveFireballHits(state: GameState): number {
  const fireballs = state.fireballs;
  const monsters = state.monsters;
  let kills = 0;
  const before = monsters.length;
  state.monsters = monsters.filter(m => {
    let alive = true;
    for (const f of fireballs) {
      if (aabbOverlap(f.pos.x, f.pos.y, f.size.w, f.size.h, m.pos.x, m.pos.y, m.size.w, m.size.h)) {
        const def = MONSTER_DEFS[m.type];
        m.hp -= 25;
        m.hitFlash = 0.15;
        dbg('combat', `fireball hit ${m.type} (hp=${m.hp.toFixed(0)})`);
        // 移除火球
        const idx = fireballs.indexOf(f);
        if (idx >= 0) fireballs.splice(idx, 1);
        if (m.hp <= 0) {
          alive = false;
          kills++;
          state.score += def.score;
          spawnDeathFx(state, m.pos.x + m.size.w / 2, m.pos.y + m.size.h / 2);
          playSfxClient('die');
          dropLoot(state, m.pos.x + m.size.w / 2, m.pos.y + m.size.h / 2);
          inf('combat', `${m.type} killed by fireball (+${def.score})`);
          break;
        } else {
          playSfxClient('hit');
        }
      }
    }
    return alive;
  });
  return kills;
}

/** 检查所有挥击与怪物的碰撞 */
export function resolveMeleeHits(state: GameState): number {
  // melees 存 state._swings
  const ext = state as GameState & { _swing?: import('./skill').MeleeSwing[] };
  const swings = ext._swing ?? [];
  let kills = 0;
  state.monsters = state.monsters.filter(m => {
    let alive = true;
    for (const s of swings) {
      if (aabbOverlap(s.pos.x, s.pos.y, s.size.w, s.size.h, m.pos.x, m.pos.y, m.size.w, m.size.h)) {
        const def = MONSTER_DEFS[m.type];
        m.hp -= 50;
        m.hitFlash = 0.15;
        dbg('combat', `melee hit ${m.type} (hp=${m.hp.toFixed(0)})`);
        if (m.hp <= 0) {
          alive = false;
          kills++;
          state.score += def.score;
          spawnDeathFx(state, m.pos.x + m.size.w / 2, m.pos.y + m.size.h / 2);
          playSfxClient('die');
          dropLoot(state, m.pos.x + m.size.w / 2, m.pos.y + m.size.h / 2);
          inf('combat', `${m.type} killed by melee (+${def.score})`);
          break;
        } else {
          playSfxClient('hit');
        }
      }
    }
    return alive;
  });
  return kills;
}

// 共享 aabbOverlap re-export
export { aabbOverlap };