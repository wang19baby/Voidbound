// game/monsters/ai.ts — 怪物 AI (spawn / update / 移动 / 光环 / 击杀) (US-030-b)
//
// 本次拆分: spawnMonster + updateMonsters + pickWanderTarget + slideAxis + auraActive + killMonster
// 零循环依赖: killMonster 在此模块 (与 spawnMonster 同生命周期)
//   behavior.ts 只依赖 slideAxis + killMonster, 单向引用
// 依赖: types (Monster / MonsterType / AuraType), defs (常量), world (aabbOverlap), skill (combo),
//   combat (DAMAGE_TYPE_COLORS), element (ELEMENT_DEFS / randomElement), mech (rollMech + 常量),
//   moveai (rollMoveAI), difficulty (DIFFICULTY_MODS), vfx (spawnRing/spawnBurst/spawnDamageNum/spawnPlayerHitFx),
//   equipment (dropLoot / dropBossReward / dropEliteLoot / THEME_BOSS_SET / addMaterial / materialDrop),
//   player (gainExp), deathFx, sfx, log

import type { GameState } from '../state';
import type { Monster, MonsterType } from './types';
import type { AuraType } from './defs';
import { AURA_RADIUS, MONSTER_DEFS, levelMonsterScale, rollElite, LORD_SIZE_SCALE, MONSTER_SIZE_SCALE, LORD_HP_MULT, ELITE_HP_MULT, ENHANCED_HP_MULT, LORD_DMG_MULT, ELITE_DMG_MULT, ENHANCED_DMG_MULT, LORD_CHANCE, ENHANCED_CHANCE } from './defs';
import { ELEMENT_DEFS, randomElement, type ElementId } from '../element';
import { rollMech, SHIELD_UP_T, SHIELD_DOWN_T, EXPLODE_HP_THRESHOLD, EXPLODE_DMG_MULT, CURSE_DURATION, FREEZE_DURATION, SPIRAL_BULLETS, SPIRAL_TURNS, SPIRAL_CD, LASER_WINDUP, LASER_CD, LASER_DMG_MULT, LASER_WIDTH, NOVA_BULLETS, NOVA_CD, SUMMON_ELITES_CD, SUMMON_ELITES_COUNT, ENRAGE_SPEED_MULT, DEATH_EXPLODE_RADIUS, DEATH_EXPLODE_DMG_MULT, DEATH_SPLIT_COUNT, DEATH_POOL_RADIUS, DEATH_POOL_DPS, DEATH_POOL_T, rollBossSkill3 } from '../mech';
import { rollMoveAI, MOVE_AIS, LEAP_CD, LEAP_WINDUP, LEAP_SPEED, LEAP_DMG_MULT, LEAP_RANGE, BURROW_CD, BURROW_TIME, BURROW_SPEED_MULT, BURROW_EXIT_DMG_MULT, FLEE_HP_THRESHOLD, FLEE_SPEED_MULT, STRAFE_RADIUS, STRAFE_SPEED_MULT } from '../moveai';
import { DIFFICULTY_MODS } from '../difficulty';
import { AURA_TYPES, THEME_MONSTER_POOL } from './defs';
import { aabbOverlap, worldToChunk, getChunkWalls, densityForMode } from '../world';
import { spawnRing, spawnBurst, spawnPlayerHitFx } from '../fx/vfx';
import { spawnDamageNum } from '../fx/damageNum';
import { spawnDeathFx } from '../fx/deathFx';
import { playSfxClient } from '../../ipc/sfx';
import { inf, dbg } from '../../util/log';
import { advanceCombo, comboScoreMult } from '../skill';
import { dropLoot, dropBossReward, dropEliteLoot, addMaterial, materialDrop, THEME_BOSS_SET } from '../equipment';
import { gainExp } from '../player';
import { spawnEnemyProjectile } from './proj';
import { DAMAGE_TYPE_COLORS as SUB_COLOR_LOOKUP } from '../combat';
import { bus } from '../../core/eventBus';

let nextMonsterId = 1;

/** A-W3 死亡触发毒池: monster 死亡时可能留下持续 DOT 区域 */
export interface PoisonPool {
  x: number;
  y: number;
  r: number;
  dps: number;
  t: number;
}

/** 在玩家周围 (安全距离外) 随机 spawn 一只怪物; 避开墙
 *  at: 营地生成锚点 (该点附近 80px 聚簇); 缺省 = 玩家周围 600-1200px
 *  camp: 营地生成选项 (A-W1 三型营地) */
export function spawnMonster(state: GameState, type: MonsterType, at?: { x: number; y: number }, camp?: { eliteAura?: AuraType; pureSupport?: boolean; forceElite?: boolean; forceLord?: boolean }): Monster {
  const def = MONSTER_DEFS[type];
  const lvScale = levelMonsterScale(state.player.level);
  // 层级: camp 生成 = 组成确定 (forceLord→领主 / forceElite→精英 / pureSupport→增强光环者 / 其余→白怪);
  // 无 camp = 全图散怪, 才滚随机 领主 4% / 精英 8% / 增强 30%
  const isLord = camp ? !!camp.forceLord : !def.boss && Math.random() < LORD_CHANCE;
  const elite = camp ? (camp.forceLord ? false : !!camp.forceElite) : !def.boss && !isLord && rollElite(Math.random);
  const enhanced = camp ? (camp.forceLord ? false : !!camp.pureSupport) : !def.boss && !isLord && !elite && Math.random() < ENHANCED_CHANCE;
  // 光环: camp 精英带 eliteAura; 专职光环者随机 1 光环; 散怪增强带随机光环
  const aura: AuraType | undefined = camp
    ? (camp.eliteAura ?? (camp.pureSupport ? AURA_TYPES[Math.floor(Math.random() * AURA_TYPES.length)] : undefined))
    : (enhanced ? AURA_TYPES[Math.floor(Math.random() * AURA_TYPES.length)] : undefined);
  // 机制 (A-W3 包2): 精英/领主随机 1 个 (Boss 走专用技能池)
  const mech: import('../mech').MechType | undefined = (elite || isLord) && !def.boss ? rollMech() : undefined;
  // 移动 AI (A-W3 包1): 领主专属
  const moveAI: import('../moveai').MoveAI | undefined = isLord && !def.boss ? rollMoveAI() : undefined;
  // 领主 bossSkill 三选一 (设计 §6.4: summon/ring/charge 复用; 实例级挂载, 独立于 def.bossSkill)
  const lordSkill: 'summon' | 'ring' | 'charge' | undefined = isLord && !def.boss
    ? (['summon', 'ring', 'charge'] as const)[Math.floor(Math.random() * 3)]
    : undefined;
  // Boss 技能包3 (A-W3): Boss 额外随机 1 个, 与原 bossSkill 组合 (每 Boss 不同)
  const skill3: import('../mech').BossSkill3 | undefined = def.boss ? rollBossSkill3() : undefined;
  const element: ElementId | undefined = def.element ?? (isLord || def.boss ? randomElement() : undefined);
  const hue = element ? ELEMENT_DEFS[element].hue : 0;
  const sizeScale = (isLord ? LORD_SIZE_SCALE : 1) * MONSTER_SIZE_SCALE;
  const baseHp = Math.round(def.hp * DIFFICULTY_MODS[state.difficulty].hpMult * lvScale);
  const hp = Math.round(
    baseHp * (elite && !isLord ? ELITE_HP_MULT : 1) * (isLord ? ELITE_HP_MULT * LORD_HP_MULT : 1) * (enhanced ? ENHANCED_HP_MULT : 1),
  );
  const center = at ?? { x: state.player.pos.x, y: state.player.pos.y };
  // 2026-08-15: 锚点环 80→150px — 玩家/怪物体型加倍后, 80px 环会与 128px 玩家出生/锚点重叠
  const ringR = at ? 150 : 600;
  // 校验墙列表: 玩家附近墙 + at 锚点周围 3×3 chunk 墙 (锚点可能远离玩家, 远处落点须验周围墙)
  const checkWalls = [...state.world.walls];
  if (at) {
    const cc = worldToChunk(center.x, center.y);
    const d = densityForMode(state.run.mode ?? 'linear');
    const mode = state.run.mode ?? 'linear';
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        checkWalls.push(...getChunkWalls(cc.cx + dx, cc.cy + dy, d, mode));
      }
    }
  }
  // 半径 600-1200 px (或营地聚簇 150px, 超出 aggroRange, 不立刻追杀)
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = ringR + Math.random() * (at ? 120 : 600);
    const x = center.x + Math.cos(a) * r;
    const y = center.y + Math.sin(a) * r;
    if (x < 64 || y < 64 || x > state.world.w - 64 || y > state.world.h - 64) continue;
    // 验证 spawn 点不撞墙 (含锚点 chunk 远处墙)
    let blocked = false;
    for (const w of checkWalls) {
      if (aabbOverlap(x, y, def.size.w * sizeScale, def.size.h * sizeScale, w.pos.x, w.pos.y, w.size.w, w.size.h)) {
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
      hp,
      maxHp: hp,
      phase: 1,
      burnT: 0, burnDps: 0, burnAccum: 0,
      size: { w: def.size.w * sizeScale, h: def.size.h * sizeScale },
      wanderTarget: pickWanderTarget(state, x, y, def.aggroRange * 2),
      wanderTimer: 3 + Math.random() * 2,
      attackCd: 0,
      hitFlash: 0,
      walkFrame: 0,
      walkT: Math.random() * 0.3,
      aiT: 0,
      aiCd: 0,
      aiSpawned: 0,
      elite,
      lord: isLord,
      enhanced,
      aura,
      regenAccum: 0,
      pureSupport: camp?.pureSupport ?? false,
      mech,
      moveAI,
      bossSkill: lordSkill,
      leapT: 0,
      burrowT: 0,
      shieldT: 0,
      skill3,
      laserT: 0,
      enrageT: 0,
      hue,
      elementId: element,
      subElement: undefined,
      spawned: false,
      bossLike: false,
      fleeT: 0,
    };
    // VFX (UX_REVIEW P4): 精英/领主/Boss 出生阵
    if (def.boss || isLord || elite) {
      spawnRing(state, m.pos.x + m.size.w / 2, m.pos.y + m.size.h / 2, 60, 0.6, 'circle_02', [0.6, 0.35, 1]);
    }
    return m;
  }
  // 兜底: 中心北 800 (落点校验, 防卡墙); 尊重层级挂载 (forceLord camp 兜底不丢领主)
  const fb: Monster = {
    id: nextMonsterId++,
    type,
    pos: { x: center.x, y: center.y - 800 },
    vel: { x: 0, y: 0 },
    hp: Math.round(def.hp * DIFFICULTY_MODS[state.difficulty].hpMult * (isLord ? ELITE_HP_MULT * LORD_HP_MULT : elite ? ELITE_HP_MULT : 1) * (enhanced ? ENHANCED_HP_MULT : 1)),
    maxHp: Math.round(def.hp * DIFFICULTY_MODS[state.difficulty].hpMult * (isLord ? ELITE_HP_MULT * LORD_HP_MULT : elite ? ELITE_HP_MULT : 1) * (enhanced ? ENHANCED_HP_MULT : 1)),
    phase: 1,
    burnT: 0, burnDps: 0, burnAccum: 0,
    size: { w: def.size.w * sizeScale, h: def.size.h * sizeScale },
    wanderTarget: { x: center.x, y: center.y - 1000 },
    wanderTimer: 3,
    attackCd: 0,
    hitFlash: 0,
    walkFrame: 0,
    walkT: 0,
    aiT: 0,
    aiCd: 0,
    aiSpawned: 0,
    elite,
    lord: isLord,
    enhanced,
    aura,
    regenAccum: 0,
    pureSupport: false,
    mech,
    moveAI,
    bossSkill: lordSkill,
    leapT: 0,
    burrowT: 0,
    shieldT: 0,
    skill3: undefined,
    laserT: 0,
    enrageT: 0,
    hue,
    elementId: element,
    subElement: undefined,
    spawned: false,
    bossLike: false,
    fleeT: 0,
  };
  placeMonsterFree(state, fb, fb.pos.x, fb.pos.y);
  return fb;
}

export function pickWanderTarget(state: GameState, x: number, y: number, radius: number): { x: number; y: number } {
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * radius;
    const tx = x + Math.cos(a) * r;
    const ty = y + Math.sin(a) * r;
    if (tx >= 0 && ty >= 0 && tx < state.world.w && ty < state.world.h) {
      // 目标不落在墙内 (防贴墙磨 / 卡墙角)
      if (!overlapsWalls(state, tx - 16, ty - 16, 32, 32)) return { x: tx, y: ty };
    }
  }
  return { x, y };
}

/** 矩形是否与任何墙重叠 */
function overlapsWalls(state: GameState, x: number, y: number, w: number, h: number): boolean {
  for (const wall of state.world.walls) {
    if (aabbOverlap(x, y, w, h, wall.pos.x, wall.pos.y, wall.size.w, wall.size.h)) return true;
  }
  return false;
}

/** 把怪物安置到 (x,y) 附近不卡墙的位置: 滑移推出 → 仍重叠则随机重掷 */
function placeMonsterFree(state: GameState, m: Monster, x: number, y: number): void {
  const w = m.size.w, h = m.size.h;
  const slid = slideAxis({ x, y, w, h }, state.world.walls);
  if (!overlapsWalls(state, slid.x, slid.y, w, h)) {
    m.pos.x = slid.x;
    m.pos.y = slid.y;
    return;
  }
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 48 + Math.random() * 160;
    const nx = x + Math.cos(a) * r;
    const ny = y + Math.sin(a) * r;
    if (nx < 0 || ny < 0 || nx + w > state.world.w || ny + h > state.world.h) continue;
    if (!overlapsWalls(state, nx, ny, w, h)) {
      m.pos.x = nx;
      m.pos.y = ny;
      return;
    }
  }
  // 兜底: 原滑移结果 (至少比墙内好)
  m.pos.x = slid.x;
  m.pos.y = slid.y;
}

/** AABB 滑移: 沿最浅重叠轴推出 (最多 4 次迭代) */
export function slideAxis(rect: { x: number; y: number; w: number; h: number }, walls: ReadonlyArray<{ pos: { x: number; y: number }; size: { w: number; h: number } }>): { x: number; y: number } {
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

/** 怪物是否处于任何增强光环覆盖下 (A-W1): 附近有增强怪携带同光环 → 生效; 自身为增强怪也受益 */
function auraActive(state: GameState, m: Monster, aura: AuraType): boolean {
  if (m.aura === aura) return true;
  for (const o of state.fx.monsters) {
    if (o === m || o.hp <= 0 || o.aura !== aura) continue;
    const d = Math.hypot(o.pos.x - m.pos.x, o.pos.y - m.pos.y);
    if (d <= AURA_RADIUS + o.size.w / 2) return true;
  }
  return false;
}

/** AI 更新 (wander/chase/attack); dt 秒 */
export function updateMonsters(state: GameState, dt: number): void {
  const p = state.player.pos;
  const walls = state.world.walls;
  for (const m of state.fx.monsters) {
    if (m.hp <= 0) continue;
    const def = MONSTER_DEFS[m.type];
    const dx = p.x - m.pos.x;
    const dy = p.y - m.pos.y;
    const dist = Math.hypot(dx, dy);
    const fleeActive = m.moveAI === 'flee' && m.hp > 0 && m.hp <= m.maxHp * FLEE_HP_THRESHOLD && (m.fleeT ?? 0) <= 2.5;

    if (m.hp > 0 && auraActive(state, m, 'regen')) {
      m.regenAccum = (m.regenAccum ?? 0) + dt;
      if (m.regenAccum >= 0.5) {
        m.regenAccum -= 0.5;
        m.hp = Math.min(m.maxHp, m.hp + Math.max(1, Math.round(m.maxHp * 0.012)));
      }
    }

    if (m.attackCd > 0) m.attackCd -= dt;
    if (m.hitFlash > 0) m.hitFlash -= dt;

    m.walkT -= dt;
    if (m.walkT <= 0) {
      m.walkFrame = (m.walkFrame + 1) % 4;
      m.walkT = 0.15;
    }

    if (m.burnT > 0 && m.hp > 0) {
      m.burnT -= dt;
      m.burnAccum += dt;
      if (m.burnAccum >= 0.5) {
        m.burnAccum -= 0.5;
        const dmg = Math.max(1, Math.round(m.burnDps * 0.5));
        m.hp -= dmg;
        m.hitFlash = 0.1;
        spawnDamageNum(state, m.pos.x + m.size.w / 2, m.pos.y - 6, `-${dmg}`, '#ff7043');
        if (m.hp <= 0) {
          killMonster(state, m);
          continue;
        }
      }
    }

    if ((def.boss || m.bossLike) && m.phase === 1 && m.hp <= m.maxHp * 0.5) {
      m.phase = 2;
      m.hitFlash = 0.4;
      state.combat.cameraShake = Math.min(18, (state.combat.cameraShake ?? 0) + 14);
      spawnDamageNum(state, m.pos.x + m.size.w / 2, m.pos.y, 'PHASE 2!', '#ff9530');
      spawnRing(state, m.pos.x + m.size.w / 2, m.pos.y + m.size.h / 2, 110, 0.55, 'circle_03', [1, 0.6, 0.2]);
      spawnBurst(state, m.pos.x + m.size.w / 2, m.pos.y + m.size.h / 2, 14, [1, 0.6, 0.2], 'spark_03', 220, 8, 0.6);
      inf('combat', `${m.type} enters PHASE 2 (狂暴)`);
    }

    if (m.mech === 'shield') {
      m.shieldT -= dt;
      if (m.shieldT <= -SHIELD_DOWN_T) {
        m.shieldT = SHIELD_UP_T;
      }
    }
    if (m.moveAI === 'flee') {
      if (fleeActive) {
        m.fleeT = (m.fleeT ?? 0) + dt;
        if (m.fleeT <= 2.5 && dist > 4) {
          m.vel.x = (dx / dist) * -def.speed * FLEE_SPEED_MULT;
          m.vel.y = (dy / dist) * -def.speed * FLEE_SPEED_MULT;
        }
      } else {
        m.fleeT = 0;
      }
    } else if (m.moveAI === 'burrow') {
      m.aiCd -= dt;
      if (m.burrowT > 0) {
        m.burrowT -= dt;
        if (dist > def.attackRange) {
          m.vel.x = (dx / (dist || 1)) * def.speed * BURROW_SPEED_MULT;
          m.vel.y = (dy / (dist || 1)) * def.speed * BURROW_SPEED_MULT;
        }
        if (m.burrowT <= 0) {
          if (dist < def.attackRange * 2 && state.player.dodgeT <= 0 && (state.player.reviveInvuln ?? 0) <= 0) {
            const bdmg = Math.round(def.contactDmg * BURROW_EXIT_DMG_MULT * DIFFICULTY_MODS[state.difficulty].dmgMult * levelMonsterScale(state.player.level) * (m.lord ? ELITE_DMG_MULT * LORD_DMG_MULT : 1));
            state.player.hp -= bdmg;
            state.combat.lastKiller = m.type;
            spawnDamageNum(state, state.player.pos.x + state.player.size.w / 2, state.player.pos.y - 10, `-${bdmg}`, '#c9aaff');
            state.combat.cameraShake = Math.min(12, (state.combat.cameraShake ?? 0) + 6);
            spawnPlayerHitFx(state);
          }
          m.aiCd = BURROW_CD;
          spawnDamageNum(state, m.pos.x + m.size.w / 2, m.pos.y - 8, '钻地', '#9cf');
        }
      } else if (m.aiCd <= 0 && dist < def.aggroRange && dist > def.attackRange * 1.2) {
        m.burrowT = BURROW_TIME;
        m.hitFlash = 0.2;
      }
    } else if (m.moveAI === 'leap') {
      m.aiCd -= dt;
      if (m.leapT > 0) {
        m.leapT -= dt;
        const sp2 = LEAP_SPEED;
        if (dist > def.attackRange) {
          m.vel.x = (dx / (dist || 1)) * sp2;
          m.vel.y = (dy / (dist || 1)) * sp2;
        }
        if (m.leapT <= 0 && dist < def.attackRange * 1.6 && state.player.dodgeT <= 0 && (state.player.reviveInvuln ?? 0) <= 0) {
          const ldmg = Math.round(def.contactDmg * LEAP_DMG_MULT * DIFFICULTY_MODS[state.difficulty].dmgMult * levelMonsterScale(state.player.level) * (m.lord ? ELITE_DMG_MULT * LORD_DMG_MULT : 1));
          state.player.hp -= ldmg;
          state.combat.lastKiller = m.type;
          spawnDamageNum(state, state.player.pos.x + state.player.size.w / 2, state.player.pos.y - 10, `-${ldmg}`, '#ff9600');
          state.combat.cameraShake = Math.min(14, (state.combat.cameraShake ?? 0) + 8);
          spawnPlayerHitFx(state);
        }
        m.aiCd = LEAP_CD;
      } else if (m.aiCd <= 0 && dist > def.attackRange * 1.2 && dist < LEAP_RANGE) {
        m.leapT = LEAP_WINDUP;
      }
    } else if (m.moveAI === 'strafe' && dist < def.aggroRange && dist > def.attackRange * 1.5) {
      const fx = -(dy / (dist || 1));
      const fy = dx / (dist || 1);
      m.vel.x = fx * def.speed * STRAFE_SPEED_MULT;
      m.vel.y = fy * def.speed * STRAFE_SPEED_MULT;
    } else if (m.moveAI === 'strafe' && m.vel.x !== 0) {
      m.vel.x = 0;
      m.vel.y = 0;
    }
    if (m.mech === 'explode' && m.hp > 0 && m.hp <= m.maxHp * EXPLODE_HP_THRESHOLD && dist < def.attackRange * 2.5) {
      const dmg = Math.round(def.contactDmg * EXPLODE_DMG_MULT * DIFFICULTY_MODS[state.difficulty].dmgMult * levelMonsterScale(state.player.level) * (m.elite ? ELITE_DMG_MULT : 1) * (m.lord ? ELITE_DMG_MULT * LORD_DMG_MULT : 1));
      if (state.player.dodgeT <= 0 && (state.player.reviveInvuln ?? 0) <= 0) {
        state.player.hp -= dmg;
        state.combat.lastKiller = m.type;
        spawnDamageNum(state, state.player.pos.x + state.player.size.w / 2, state.player.pos.y - 10, `-${dmg}`, '#ff7043');
        state.combat.cameraShake = Math.min(12, (state.combat.cameraShake ?? 0) + 8);
        spawnPlayerHitFx(state);
      }
      spawnDamageNum(state, m.pos.x + m.size.w / 2, m.pos.y - 6, '💥', '#ff9600');
      playSfxClient('hit');
      spawnBurst(state, m.pos.x + m.size.w / 2, m.pos.y + m.size.h / 2, 10, [1, 0.6, 0.2], 'spark_03', 200, 8, 0.5);
      spawnRing(state, m.pos.x + m.size.w / 2, m.pos.y + m.size.h / 2, 70, 0.4, 'circle_01', [1, 0.6, 0.2], 20);
      m.hp = 0;
      killMonster(state, m);
      inf('combat', `${m.type} 自爆`);
      continue;
    }

    if (!m.pureSupport && !fleeActive && def.rangedCooldown && dist < def.aggroRange && dist > def.attackRange * 2 && m.attackCd <= 0) {
      spawnEnemyProjectile(state, m, def.contactDmg);
      if (m.phase === 2) spawnEnemyProjectile(state, m, def.contactDmg, 0.22);
      m.attackCd = m.phase === 2 ? 1.6 : def.rangedCooldown;
    }

    if (def.ai === 'dash' || def.bossSkill === 'charge' || m.bossSkill === 'charge') {
      m.aiT -= dt;
      m.aiCd -= dt;
      if (m.aiT <= 0 && m.aiCd <= 0 && dist < def.aggroRange && dist > def.attackRange * 1.5) {
        m.aiT = (def.bossSkill === 'charge' || m.bossSkill === 'charge') ? 0.5 : 0.35;
        m.aiCd = (def.bossSkill === 'charge' || m.bossSkill === 'charge') ? 5.0 : 2.5;
      }
    }
    // 领主 bossSkill (summon/ring/charge, 实例级) 常驻触发; Boss/外层 Boss 二阶段触发
    if (((def.boss || m.bossLike) && m.phase === 2) || m.bossSkill) {
      m.aiCd -= dt;
      if (m.aiCd <= 0) {
        const activeSkill = def.bossSkill ?? m.bossSkill;
        const didBase = (() => {
          if (activeSkill === 'summon' && (m.aiSpawned ?? 0) < 3) {
            const pool = THEME_MONSTER_POOL[state.run.theme];
            const minion = spawnMonster(state, pool[Math.floor(Math.random() * pool.length)]);
            placeMonsterFree(state, minion, m.pos.x + (Math.random() * 80 - 40), m.pos.y + (Math.random() * 80 - 40));
            minion.spawned = true;
            state.fx.monsters.push(minion);
            spawnRing(state, minion.pos.x + minion.size.w / 2, minion.pos.y + minion.size.h / 2, 44, 0.5, 'circle_02', [0.6, 0.35, 1]);
            m.aiSpawned = (m.aiSpawned ?? 0) + 1;
            m.aiCd = 4.0;
            return true;
          } else if (activeSkill === 'ring') {
            for (let k = 0; k < 10; k++) spawnEnemyProjectile(state, m, def.contactDmg, (k * Math.PI * 2) / 10);
            spawnRing(state, m.pos.x + m.size.w / 2, m.pos.y + m.size.h / 2, 80, 0.5, 'circle_02', [1, 0.55, 0.3]);
            m.aiCd = 6.0;
            return true;
          } else if (activeSkill === 'freeze_ring') {
            for (let k = 0; k < 8; k++) spawnEnemyProjectile(state, m, def.contactDmg, (k * Math.PI * 2) / 8, 'ice');
            spawnRing(state, m.pos.x + m.size.w / 2, m.pos.y + m.size.h / 2, 100, 0.5, 'circle_02', [0.45, 0.85, 1]);
            state.player.freezeT = Math.max(state.player.freezeT ?? 0, FREEZE_DURATION);
            m.aiCd = 7.0;
            return true;
          }
          return false;
        })();
        if (!didBase && m.skill3) {
          switch (m.skill3) {
            case 'spiral': {
              for (let turn = 0; turn < SPIRAL_TURNS; turn++) {
                const base = turn * 0.35;
                for (let k = 0; k < SPIRAL_BULLETS; k++) {
                  spawnEnemyProjectile(state, m, Math.round(def.contactDmg * 0.6), base + (k * Math.PI * 2) / SPIRAL_BULLETS);
                }
              }
              spawnRing(state, m.pos.x + m.size.w / 2, m.pos.y + m.size.h / 2, 90, 0.5, 'circle_02', [0.7, 0.45, 1]);
              m.aiCd = SPIRAL_CD;
              break;
            }
            case 'laser': {
              m.laserT = LASER_WINDUP;
              m.aiCd = LASER_CD;
              break;
            }
            case 'nova': {
              for (let k = 0; k < NOVA_BULLETS; k++) {
                spawnEnemyProjectile(state, m, Math.round(def.contactDmg * 0.7), (k * Math.PI * 2) / NOVA_BULLETS);
              }
              spawnRing(state, m.pos.x + m.size.w / 2, m.pos.y + m.size.h / 2, 130, 0.55, 'circle_01', [0.85, 0.4, 1]);
              spawnBurst(state, m.pos.x + m.size.w / 2, m.pos.y + m.size.h / 2, 12, [0.85, 0.4, 1], 'spark_03', 180, 7, 0.5);
              m.aiCd = NOVA_CD;
              break;
            }
            case 'summon_elites': {
              for (let k = 0; k < SUMMON_ELITES_COUNT + 1; k++) {
                const pool = THEME_MONSTER_POOL[state.run.theme];
                const e = spawnMonster(state, pool[Math.floor(Math.random() * pool.length)], undefined, { forceElite: true });
                placeMonsterFree(state, e, m.pos.x + (Math.random() * 120 - 60), m.pos.y + (Math.random() * 120 - 60));
                e.spawned = true;
                state.fx.monsters.push(e);
                spawnRing(state, e.pos.x + e.size.w / 2, e.pos.y + e.size.h / 2, 40, 0.5, 'circle_02', [0.6, 0.35, 1]);
              }
              m.aiCd = SUMMON_ELITES_CD;
              break;
            }
            case 'enrage': {
              m.enrageT = 6;
              m.aiCd = 12;
              spawnDamageNum(state, m.pos.x + m.size.w / 2, m.pos.y, 'ENRAGE!', '#ff4530');
              spawnRing(state, m.pos.x + m.size.w / 2, m.pos.y + m.size.h / 2, 90, 0.5, 'circle_01', [1, 0.3, 0.25]);
              spawnBurst(state, m.pos.x + m.size.w / 2, m.pos.y + m.size.h / 2, 12, [1, 0.3, 0.25], 'spark_03', 200, 8, 0.6);
              break;
            }
          }
        }
      }
      if (m.laserT > 0) {
        m.laserT -= dt;
        if (m.laserT <= 0) {
          const lx = state.player.pos.x - m.pos.x;
          const ly = state.player.pos.y - m.pos.y;
          const len = Math.hypot(lx, ly) || 1;
          const nx = lx / len, ny = ly / len;
          const px = state.player.pos.x - m.pos.x;
          const py = state.player.pos.y - m.pos.y;
          const proj = px * nx + py * ny;
          const perp = Math.abs(px * ny - py * nx);
          if (proj > 0 && proj < 300 && perp < LASER_WIDTH / 2 && state.player.dodgeT <= 0 && (state.player.reviveInvuln ?? 0) <= 0) {
            const ldmg = Math.round(def.contactDmg * LASER_DMG_MULT * DIFFICULTY_MODS[state.difficulty].dmgMult * levelMonsterScale(state.player.level));
            state.player.hp -= ldmg;
            state.combat.lastKiller = m.type;
            spawnDamageNum(state, state.player.pos.x + state.player.size.w / 2, state.player.pos.y - 10, `-${ldmg}`, '#ff7043');
            state.combat.cameraShake = Math.min(12, (state.combat.cameraShake ?? 0) + 6);
            spawnPlayerHitFx(state);
          }
          spawnDamageNum(state, m.pos.x + m.size.w / 2, m.pos.y - 10, 'LASER!', '#ff7043');
        }
      }
      if (m.enrageT > 0) m.enrageT -= dt;
    }

    const charging = m.aiT > 0;
    const auraHaste = auraActive(state, m, 'haste') ? 1.25 : 1;
    const spd = def.speed * (charging ? ((def.bossSkill === 'charge' || m.bossSkill === 'charge') ? 3.5 : 3.2) : m.phase === 2 ? 1.6 : 1) * auraHaste * (m.enrageT > 0 ? ENRAGE_SPEED_MULT : 1);
    const moveAIActive =
      fleeActive ||
      (m.moveAI === 'burrow' && m.burrowT > 0) ||
      (m.moveAI === 'leap' && m.leapT > 0);
    if (dist < def.aggroRange && !moveAIActive) {
      if (dist > 0.01) {
        m.vel.x = (dx / dist) * spd;
        m.vel.y = (dy / dist) * spd;
      }
      if (dist < def.attackRange && m.attackCd <= 0 && state.player.dodgeT <= 0 && (state.player.reviveInvuln ?? 0) <= 0 && !m.pureSupport) {
        const lvScale = levelMonsterScale(state.player.level);
        const frenzyMult = auraActive(state, m, 'frenzy') ? 0.7 : 1;
        const stoneskin = auraActive(state, m, 'stoneskin');
        const elemental = auraActive(state, m, 'elemental');
        let dmg = def.contactDmg * DIFFICULTY_MODS[state.difficulty].dmgMult * lvScale * (m.elite ? ELITE_DMG_MULT : 1) * (m.lord ? ELITE_DMG_MULT * LORD_DMG_MULT : 1) * (m.enhanced ? ENHANCED_DMG_MULT : 1);
        if (stoneskin) dmg *= 0.7;
        state.player.hp -= dmg;
        m.attackCd = 1.0 * frenzyMult;
        state.combat.lastKiller = m.type;
        state.combat.cameraShake = Math.min(10, (state.combat.cameraShake ?? 0) + 5);
        spawnPlayerHitFx(state);
        if (m.mech === 'curse') {
          state.player.curseT = Math.max(state.player.curseT ?? 0, CURSE_DURATION);
          spawnDamageNum(state, state.player.pos.x + state.player.size.w / 2, state.player.pos.y - 14, '☠', '#c9aaff');
        }
        if (elemental) {
          spawnDamageNum(state, state.player.pos.x + state.player.size.w / 2, state.player.pos.y - 10, '⚡', '#ffb74d');
        }
        if (m.subElement && state.player.dodgeT <= 0 && (state.player.reviveInvuln ?? 0) <= 0) {
          const subDef = ELEMENT_DEFS[m.subElement];
          const subDmg = Math.max(1, Math.round(dmg * 0.4));
          state.player.hp -= subDmg;
          state.combat.lastKiller = m.type;
          // DAMAGE_TYPE_COLORS 由 combat 提供 (延迟到 module 加载)
          const subColor = SUB_COLOR_LOOKUP[subDef.dmgType];
          spawnDamageNum(state, state.player.pos.x + state.player.size.w / 2, state.player.pos.y - 22, `-${subDmg}`, subColor);
          spawnPlayerHitFx(state);
          dbg('monster', `${m.type} sub(${subDef.name}) hit player for ${subDmg}`);
        }
        dbg('monster', `${m.type} hit player for ${Math.round(dmg)} (hp=${state.player.hp.toFixed(0)})`);
      }
    } else if (!moveAIActive) {
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

    m.pos.x = Math.max(0, Math.min(state.world.w - m.size.w, m.pos.x + m.vel.x * dt));
    m.pos.y = Math.max(0, Math.min(state.world.h - m.size.h, m.pos.y + m.vel.y * dt));
    const slid = slideAxis({ x: m.pos.x, y: m.pos.y, w: m.size.w, h: m.size.h }, walls);
    m.pos.x = slid.x;
    m.pos.y = slid.y;
  }
}

/** 击杀统一出口: 分数/技能点/经验/药水/Boss 触发/掉落/特效 */
export function killMonster(state: GameState, m: Monster): void {
  const def = MONSTER_DEFS[m.type];
  const cx = m.pos.x + m.size.w / 2;
  const cy = m.pos.y + m.size.h / 2;
  const combo = advanceCombo(state);
  state.combat.score += Math.round(def.score * comboScoreMult(combo));
  state.player.gold = (state.player.gold ?? 0) + Math.max(1, Math.round(def.score * 0.5 * DIFFICULTY_MODS[state.difficulty].dropMult));
  spawnBurst(state, cx, cy, 6, [1, 0.85, 0.3], 'spark_03', 120, 5, 0.4);
  const pcx = state.player.pos.x + state.player.size.w / 2;
  const pcy = state.player.pos.y + state.player.size.h / 2;
  if (combo >= 10 && combo % 5 === 0) {
    spawnRing(state, pcx, pcy, 70, 0.4, 'circle_02', [1, 0.85, 0.3]);
  } else if (combo >= 3) {
    spawnBurst(state, pcx, pcy, 3, [1, 0.85, 0.3], 'spark_03', 60, 4, 0.3);
  }
  state.player.skillPoints = (state.player.skillPoints ?? 0) + 1;
  state.combat.killsTotal = (state.combat.killsTotal ?? 0) + 1;
  state.run.kills = (state.run.kills ?? 0) + 1;
  if (def.boss) {
    state.run.bossKilled = true;
  }
  // A-W4: Boss 与外层 Boss (bossLike) 死亡位都生门 — 挑战模式 5 门, 击杀 ≥1 可撤退
  if (def.boss || m.bossLike) {
    state.run.portals.push({ x: cx, y: cy, bossType: m.type, used: false });
  } else if (state.run.alive > 0 && !m.spawned) state.run.alive--;
  const ups = gainExp(state, Math.round(def.score * 2 * DIFFICULTY_MODS[state.difficulty].expMult));
  if (ups > 0) inf('combat', `LEVEL UP → ${state.player.level} (+${ups})`);
  if (Math.random() < 0.12) {
    const kind: 'hp' | 'mp' = Math.random() < 0.6 ? 'hp' : 'mp';
    const alt: 'hp' | 'mp' = kind === 'hp' ? 'mp' : 'hp';
    if (state.player.potions[kind] < 3) state.player.potions[kind]++;
    else if (state.player.potions[alt] < 3) state.player.potions[alt]++;
  }
  spawnDeathFx(state, cx, cy);
  playSfxClient('die');
  if (def.boss) dropBossReward(state, cx, cy, THEME_BOSS_SET[state.run.theme]);
  else if (m.elite || m.lord) dropEliteLoot(state, cx, cy);
  else dropLoot(state, cx, cy);
  for (const [mid, n] of materialDrop(Math.random(), !!def.boss, !!m.elite || !!m.lord)) {
    addMaterial(state.equip, mid, n);
  }
  if (m.mech === 'death_trigger') {
    const roll = Math.random();
    if (roll < 0.33) {
      const pdx = state.player.pos.x - cx;
      const pdy = state.player.pos.y - cy;
      if (Math.hypot(pdx, pdy) <= DEATH_EXPLODE_RADIUS && state.player.dodgeT <= 0 && (state.player.reviveInvuln ?? 0) <= 0) {
        const boom = Math.round(def.contactDmg * DEATH_EXPLODE_DMG_MULT * DIFFICULTY_MODS[state.difficulty].dmgMult * levelMonsterScale(state.player.level));
        state.player.hp -= boom;
        state.combat.lastKiller = m.type;
        spawnDamageNum(state, state.player.pos.x + state.player.size.w / 2, state.player.pos.y - 10, `-${boom}`, '#ff7043');
        spawnPlayerHitFx(state);
      }
      spawnDamageNum(state, cx, m.pos.y - 10, '💥', '#ff9600');
      spawnRing(state, cx, cy, DEATH_EXPLODE_RADIUS, 0.45, 'circle_01', [1, 0.6, 0.2]);
      spawnBurst(state, cx, cy, 10, [1, 0.6, 0.2], 'spark_03', 240, 8, 0.5);
    } else if (roll < 0.73) {
      for (let i = 0; i < DEATH_SPLIT_COUNT; i++) {
        const c = spawnMonster(state, m.type);
        c.hp = Math.max(1, Math.round(c.maxHp * 0.25));
        c.maxHp = c.hp;
        c.aiSpawned = 1;
        c.spawned = true;
        c.mech = undefined;
        placeMonsterFree(state, c, cx + (i === 0 ? -28 : 28), cy);
        state.fx.monsters.push(c);
      }
      spawnBurst(state, cx, cy, 8, [0.8, 0.8, 0.4], 'spark_03', 160, 6, 0.4);
      inf('combat', `${def.type} 死亡触发: 分裂 ×${DEATH_SPLIT_COUNT}`);
    } else {
      const pool: PoisonPool = {
        x: cx - DEATH_POOL_RADIUS / 2, y: cy - DEATH_POOL_RADIUS / 2,
        r: DEATH_POOL_RADIUS, dps: DEATH_POOL_DPS, t: DEATH_POOL_T,
      };
      state.fx.pools.push(pool);
      inf('combat', `${def.type} 死亡触发: 毒池`);
    }
  }

  if (def.ai === 'split' && (m.aiSpawned ?? 0) === 0) {
    for (let i = 0; i < 2; i++) {
      const c = spawnMonster(state, m.type);
      c.hp = Math.max(1, Math.round(c.hp * 0.3));
      c.maxHp = c.hp;
      c.aiSpawned = 1;
      c.spawned = true;
      placeMonsterFree(state, c, cx + (i === 0 ? -24 : 24), cy);
      state.fx.monsters.push(c);
    }
    inf('combat', `${def.type} 分裂 ×2`);
  }
  spawnDamageNum(state, cx, m.pos.y, 'KILL!', '#ffaa00');
  // A.3: 击杀事件总线 — 跨域副作用(渲染/音频/日志)走订阅者; 数据副作用保留本域
  // killedBy 来源追踪留给未来 US-039 (damageMonster 反向调用); 当前 unknown
  bus.emit('monster.killed', { monster: m, killedBy: 'unknown', x: cx, y: cy });
  inf('combat', `${m.type} killed (+${Math.round(def.score * comboScoreMult(combo))}${combo > 1 ? ` combo x${combo}` : ''})`);
}