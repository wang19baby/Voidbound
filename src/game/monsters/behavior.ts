// game/monsters/behavior.ts — 怪物伤害/碰撞 (US-030-b)
//
// 本次拆分: damageMonster + resolveFireballHits + resolveMeleeHits
// 单向依赖: ./ai (slideAxis + killMonster), ./proj (spawnEnemyProjectile), types (Monster), defs (常量)

import type { GameState } from '../state';
import type { Monster } from './types';
import { MONSTER_DEFS, MELEE_DAMAGE } from './defs';
import { calcDamage, DAMAGE_TYPE_COLORS, CRIT_COLOR, type DamageType } from '../combat';
import { DIFFICULTY_MODS } from '../difficulty';
import { aabbOverlap } from '../world';
import { skillDamageScale } from '../skill';
import { spawnImpact, spawnPlayerHitFx, ELEMENT_FX } from '../vfx';
import { spawnDamageNum } from '../damageNum';
import { playSfxClient } from '../../ipc/sfx';
import { dbg } from '../../util/log';
import { slideAxis, killMonster } from './ai';
import { SHIELD_DAMAGE_REDUCE, SHIELD_BREAK_VULN, THORNS_REFLECT, THORNS_FLAT } from '../mech';

/** 对怪物结算一次 D-04 伤害; 支持击退 (F-CBT-005, US-016) */
export function damageMonster(
  state: GameState,
  m: Monster,
  spec: { base: number; type: DamageType; knockback?: number },
): { killed: boolean; damage: number; isCrit: boolean } {
  const def = MONSTER_DEFS[m.type];
  // A-W3 遁地: 地下移动无敌 (土痕可预判)
  if (m.burrowT > 0) return { killed: false, damage: 0, isCrit: false };
  const targetRes = def.res?.[spec.type] ?? 0;
  const { damage: rawDmg, isCrit } = calcDamage({
    base: spec.base,
    type: spec.type,
    attacker: state.player.combat,
    targetRes,
  });
  // A-W3 护盾: 开盾减伤 90%, 破盾虚弱 +30% 承伤 (输出窗口 = 决策点)
  let damage = rawDmg;
  if (m.mech === 'shield' && m.shieldT > 0) damage = Math.max(1, Math.round(damage * (1 - SHIELD_DAMAGE_REDUCE)));
  else if (m.mech === 'shield' && m.shieldT <= 0) damage = Math.round(damage * (1 + SHIELD_BREAK_VULN));
  m.hp -= damage;
  m.hitFlash = 0.15;
  // 吸血 (OPT-020 unique 独占): 命中回复 damage×lifesteal%
  const ls = state.player.combat?.lifesteal ?? 0;
  if (ls > 0 && damage > 0) {
    state.player.hp = Math.min(100, state.player.hp + Math.max(1, Math.round(damage * ls / 100)));
  }
  const cx = m.pos.x + m.size.w / 2;
  const cy = m.pos.y + m.size.h / 2;
  spawnDamageNum(state, cx, m.pos.y - 6, `-${damage}`, isCrit ? CRIT_COLOR : DAMAGE_TYPE_COLORS[spec.type]);
  playSfxClient(isCrit ? 'crit' : 'hit');  // OPT-025: 暴击专属音
  // V0 命中停顿: 暴击 0.1s / 普通命中 0.04s 冻结世界 (打击感)
  state.hitStop = Math.max(state.hitStop ?? 0, isCrit ? 0.1 : 0.04);
  dbg('combat', `${spec.type} hit ${m.type} for ${damage} (hp=${m.hp.toFixed(0)})${isCrit ? ' CRIT' : ''}`);
  // 击退: 从玩家推离 (US-016), 随后沿墙滑移防穿墙
  if (spec.knockback) {
    const dx = m.pos.x - state.player.pos.x;
    const dy = m.pos.y - state.player.pos.y;
    const len = Math.hypot(dx, dy) || 1;
    m.pos.x = Math.max(0, Math.min(state.world.w - m.size.w, m.pos.x + (dx / len) * spec.knockback));
    m.pos.y = Math.max(0, Math.min(state.world.h - m.size.h, m.pos.y + (dy / len) * spec.knockback));
    const slid = slideAxis({ x: m.pos.x, y: m.pos.y, w: m.size.w, h: m.size.h }, state.world.walls);
    m.pos.x = slid.x;
    m.pos.y = slid.y;
    m.hitFlash = 0.3;
  }
  if (m.hp <= 0) {
    killMonster(state, m);
    return { killed: true, damage, isCrit };
  }
  return { killed: false, damage, isCrit };
}

/** 检查所有火球与怪物的碰撞, 命中扣血 (火球 = 25 火伤) */
export function resolveFireballHits(state: GameState): number {
  const fireballs = state.fireballs;
  let kills = 0;
  state.monsters = state.monsters.filter(m => {
    if (m.hp <= 0) return false;
    for (const f of fireballs) {
      if (aabbOverlap(f.pos.x, f.pos.y, f.size.w, f.size.h, m.pos.x, m.pos.y, m.size.w, m.size.h)) {
        // 移除火球 (穿透/嗜血符文不消耗)
        if (f.rune !== 'pierce') {
          const idx = fireballs.indexOf(f);
          if (idx >= 0) fireballs.splice(idx, 1);
        }
        const r = damageMonster(state, m, { base: f.dmg, type: f.dmgType, knockback: 60 });
        // VFX (UX_REVIEW P1): 元素色命中爆点
        if (r.damage > 0) {
          spawnImpact(state, f.pos.x + f.size.w / 2, f.pos.y + f.size.h / 2, ELEMENT_FX[f.dmgType] ?? [1, 1, 1]);
        }
        // 燃烧/中毒 DOT (US-016/M5): 火 3s×3dps, 毒同机制
        if (r.damage > 0 && (f.dmgType === 'fire' || f.dmgType === 'poison')) { m.burnT = 3; m.burnDps = 3; }
        // 嗜血: 命中回 5 HP
        if (f.rune === 'vampire' && r.damage > 0) {
          state.player.hp = Math.min(100, state.player.hp + 5);
        }
        // 圣光 (M5): 命中回 3 HP
        if (f.dmgType === 'holy' && r.damage > 0) {
          state.player.hp = Math.min(100, state.player.hp + 3);
        }
        // nova (内容扩充): 命中爆炸, 溅射周围 80px 内其他怪 60% 伤害
        if (f.rune === 'nova' && r.damage > 0) {
          for (const other of state.monsters) {
            if (other === m || other.hp <= 0) continue;
            const dx = other.pos.x - f.pos.x;
            const dy = other.pos.y - f.pos.y;
            if (dx * dx + dy * dy < 80 * 80) {
              damageMonster(state, other, { base: Math.round(f.dmg * 0.6), type: 'fire', knockback: 30 });
            }
          }
        }
        if (r.killed) { kills++; return false; }
        // 同一目标可被多发命中 (W 扇形)
      }
    }
    return true;
  });
  return kills;
}

/** 检查所有挥击与怪物的碰撞 (近战 = 50 物理) */
export function resolveMeleeHits(state: GameState): number {
  // melees 存 state._swings
  const ext = state as GameState & { _swing?: import('../skill').MeleeSwing[] };
  const swings = ext._swing ?? [];
  let kills = 0;
  state.monsters = state.monsters.filter(m => {
    if (m.hp <= 0) return false;
    for (const s of swings) {
      if (aabbOverlap(s.pos.x, s.pos.y, s.size.w, s.size.h, m.pos.x, m.pos.y, m.size.w, m.size.h)) {
        const base = Math.round(MELEE_DAMAGE * skillDamageScale(s.level) * (s.mult ?? 1));
        const r = damageMonster(state, m, { base, type: 'physical', knockback: 40 });
        // 近战符文 (OPT-023): steal 回魔 / vampire 回血 (火球系 vamp 在 resolveFireballHits)
        if (r.damage > 0) {
          if (s.rune === 'steal') state.player.mp = Math.min(100, state.player.mp + 4);
          else if (s.rune === 'vampire') state.player.hp = Math.min(100, state.player.hp + 5);
          // A-W3 荆棘: 近战反伤 20% 伤害 + 固定 5 (远程免疫 → 换技能/换目标反制)
          if (m.mech === 'thorns') {
            const reflect = Math.max(1, Math.round(r.damage * THORNS_REFLECT) + THORNS_FLAT);
            state.player.hp -= reflect;
            state.lastKiller = m.type;
            spawnDamageNum(state, state.player.pos.x + state.player.size.w / 2, state.player.pos.y - 10, `-${reflect}`, '#9f9');
            spawnPlayerHitFx(state);
            state.cameraShake = Math.min(8, (state.cameraShake ?? 0) + 4);
          }
        }
        if (r.killed) { kills++; return false; }
        // 一次挥击只结算一次
      }
    }
    return true;
  });
  return kills;
}