// 技能系统 (US-004): 槽位 LMB/RMB/Q/W/E/R → SkillDef
// - 每槽带等级 (1-20), Ctrl+1..6 分配技能点, 每级 +10% 伤害 (skillDamageScale)
// - 技能达到 10 级触发符文三选一 (D-01), 绑定后本局永久 (MMB 切换已移除)
// - fireball 承载 dmg + rune, 物理解算/命中时生效 (monster.ts)

import type { GameState } from './state';
import { RUNE_DEFS, type RuneId } from './rune';
import { spawnFireball } from './state';
import { aabbOverlap } from './world';
import { dbg, inf } from '../util/log';
import { damageMonster, FIREBALL_DAMAGE, MELEE_DAMAGE, ULTIMATE_DAMAGE } from './monster';

export type SkillSlot = 'LMB' | 'RMB' | 'Q' | 'W' | 'E' | 'R';
export const SKILL_SLOTS: readonly SkillSlot[] = ['LMB', 'RMB', 'Q', 'W', 'E', 'R'];

export interface SkillDef {
  name: string;
  cooldown: number;
  mpCost: number;
  level: number;
  rune: RuneId | null;
  cast: (state: GameState, dir: { x: number; y: number }) => void;
}

export const MAX_SKILL_LEVEL = 20;
export const COMBO_WINDOW = 4.0;
export const COMBO_CAP = 20;
export const COMBO_STEP = 0.1;

/** 连击分数乘数 (US-017): 1 + min(count,20) * 0.1, 上限 3x */
export function comboScoreMult(count: number): number {
  return 1 + Math.min(COMBO_CAP, count) * COMBO_STEP;
}

/** 连击推进: 窗口内击杀 → count++, 超窗重置; 返回新连击数 */
export function advanceCombo(state: GameState): number {
  const c = state.combo;
  if (c.timer <= 0) c.count = 0;
  c.count++;
  c.timer = COMBO_WINDOW;
  return c.count;
}

/** 每级 +10% 伤害 (纯函数, US-004 单测) */
export function skillDamageScale(level: number): number {
  return 1 + (level - 1) * 0.1;
}

/** 从符文池随机取 n 个不重复选项 (排除 none) */
export function pickRuneOptions(n = 3): RuneId[] {
  const pool: RuneId[] = (Object.keys(RUNE_DEFS) as RuneId[]).filter(r => r !== 'none');
  const out: RuneId[] = [];
  while (out.length < n && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/** 当前各槽符文 (绑定后永久) */
export function skillRune(slot: SkillSlot): RuneId | null {
  return registry[slot]?.rune ?? null;
}

/** 技能等级 */
export function skillLevel(slot: SkillSlot): number {
  return registry[slot]?.level ?? 1;
}

/** 分配 1 技能点: 升到 10 级触发符文三选一; 返回 null=成功 */
export function assignSkillPoint(state: GameState, slot: SkillSlot): string | null {
  if (state.player.skillPoints <= 0) return 'no skill points';
  const sk = registry[slot];
  if (sk.level >= MAX_SKILL_LEVEL) return `already max (Lv ${MAX_SKILL_LEVEL})`;
  sk.level++;
  state.player.skillPoints--;
  inf('skill', `${slot} ${sk.name} → Lv ${sk.level} (pts left ${state.player.skillPoints})`);
  if (sk.level === 10 && !sk.rune && !state.rejectedRunes.includes(slot)) {
    state.runeChoice = { slot, options: pickRuneOptions(3) };
    inf('rune', `${slot} 达 10 级 → 触发符文变异三选一`);
  }
  return null;
}

/** 三选一选择: 绑定符文; 返回成功与否 */
export function chooseRune(state: GameState, idx: number): boolean {
  const ch = state.runeChoice;
  if (!ch) return false;
  const rune = ch.options[idx];
  if (!rune) return false;
  registry[ch.slot].rune = rune;
  state.runeChoice = null;
  inf('rune', `${ch.slot} 绑定符文: ${RUNE_DEFS[rune].name}`);
  return true;
}

/** 拒绝三选一: 该槽本局不再触发 */
export function rejectRune(state: GameState): void {
  if (!state.runeChoice) return;
  state.rejectedRunes.push(state.runeChoice.slot);
  const slot = state.runeChoice.slot;
  state.runeChoice = null;
  inf('rune', `${slot} 拒绝变异 (本局不再触发)`);
}

/** 默认技能 (等级 1, 无符文) */
export const defaultSkills: Record<SkillSlot, SkillDef> = {
  LMB: {
    name: 'melee', cooldown: 0.3, mpCost: 0, level: 1, rune: null,
    cast: (state, dir) => castMelee(state, dir),
  },
  RMB: {
    name: 'melee', cooldown: 0.3, mpCost: 0, level: 1, rune: null,
    cast: (state, dir) => castMelee(state, dir, true),
  },
  Q: {
    name: 'fireball', cooldown: 0.3, mpCost: 10, level: 1, rune: null,
    cast: (state, dir) => castFireball(state, dir, 'Q'),
  },
  W: {
    name: 'multi_fireball', cooldown: 0.8, mpCost: 25, level: 1, rune: null,
    cast: (state, dir) => {
      // 5 发扇形
      for (let i = -2; i <= 2; i++) castFireball(state, dir, 'W', i * 0.2);
    },
  },
  E: {
    name: 'heal', cooldown: 5.0, mpCost: 30, level: 1, rune: null,
    cast: (state) => {
      state.player.hp = Math.min(100, state.player.hp + 40);
    },
  },
  R: {
    name: 'ultimate', cooldown: 8.0, mpCost: 60, level: 1, rune: null,
    cast: (state) => {
      const base = Math.round(ULTIMATE_DAMAGE * skillDamageScale(skillLevel('R')));
      for (const m of state.monsters) {
        const dx = m.pos.x - state.player.pos.x;
        const dy = m.pos.y - state.player.pos.y;
        if (dx * dx + dy * dy < 200 * 200) {
          damageMonster(state, m, { base, type: 'shadow' });
        }
      }
      state.monsters = state.monsters.filter(m => m.hp > 0);
    },
  },
};

/** 技能注册表 (slot → SkillDef) */
const registry: Record<SkillSlot, SkillDef> = { ...defaultSkills };

export function bindSkill(slot: SkillSlot, skill: SkillDef): void {
  registry[slot] = skill;
}

export function getSkill(slot: SkillSlot): SkillDef {
  return registry[slot];
}

/** 各 slot 的 CD 上次触发时间 */
const lastTrigger: Record<SkillSlot, number> = { LMB: -Infinity, RMB: -Infinity, Q: -Infinity, W: -Infinity, E: -Infinity, R: -Infinity };

/** 当前各 slot 剩余 cd (秒), 0 表示就绪 */
export function getSkillCooldowns(nowSec: number): Record<SkillSlot, number> {
  const out = {} as Record<SkillSlot, number>;
  for (const slot of SKILL_SLOTS) {
    const sk = registry[slot];
    const left = sk.cooldown - (nowSec - lastTrigger[slot]);
    out[slot] = left > 0 ? left : 0;
  }
  return out;
}

export function tryCastSlot(slot: SkillSlot, state: GameState, dir: { x: number; y: number }, nowSec: number): boolean {
  const sk = registry[slot];
  if (nowSec - lastTrigger[slot] < sk.cooldown) return false;
  if (state.player.mp < sk.mpCost) return false;
  state.player.mp -= sk.mpCost;
  sk.cast(state, dir);
  lastTrigger[slot] = nowSec;
  return true;
}

// === 具体技能实现 ===

/** 火球 (含符文): rune=分裂→3 发 / 穿透→墙后不灭 (updateFireballs) / 追踪 (updateFireballs) / 嗜血 (命中回血) */
function castFireball(state: GameState, dir: { x: number; y: number }, slot: SkillSlot, spread = 0): void {
  const rune = registry[slot].rune;
  const dmg = Math.round(FIREBALL_DAMAGE * skillDamageScale(skillLevel(slot)));
  if (rune === 'split') {
    spawnFireball(state, dir, -0.15, rune, dmg);
    spawnFireball(state, dir, 0, rune, dmg);
    spawnFireball(state, dir, 0.15, rune, dmg);
  } else {
    spawnFireball(state, dir, spread, rune, dmg);
  }
}

/** 近战: 玩家前方 AABB 挥击; 伤害按槽位等级缩放 */
function castMelee(state: GameState, dir: { x: number; y: number }, thrust = false): void {
  let dx = dir.x || state.player.facing.x || 1;
  let dy = dir.y || state.player.facing.y || 0;
  const len = Math.hypot(dx, dy);
  if (len === 0) { dx = 1; dy = 0; }
  else { dx /= len; dy /= len; }

  const reach = thrust ? 80 : 96;
  const width = 96;
  const cx = state.player.pos.x + state.player.size.w / 2;
  const cy = state.player.pos.y + state.player.size.h / 2;
  const scx = cx + dx * (state.player.size.w / 2 + reach / 2);
  const scy = cy + dy * (state.player.size.h / 2 + reach / 2);

  const swing: MeleeSwing = {
    pos: { x: scx - width / 2, y: scy - width / 2 },
    size: { w: width, h: width },
    life: 0.18,
    level: skillLevel(thrust ? 'RMB' : 'LMB'),
  };
  (state as GameState & { _swing?: MeleeSwing[] })._swing = (state as GameState & { _swing?: MeleeSwing[] })._swing ?? [];
  (state as GameState & { _swing: MeleeSwing[] })._swing.push(swing);

  // 击中火球 (在 AABB 内销毁)
  const before = state.fireballs.length;
  state.fireballs = state.fireballs.filter(f => !aabbOverlap(f.pos.x, f.pos.y, f.size.w, f.size.h, swing.pos.x, swing.pos.y, swing.size.w, swing.size.h));
  const after = state.fireballs.length;
  if (before !== after) {
    inf('combat', `melee destroyed ${before - after} fireball(s)`);
  }
  dbg('skill', `melee ${thrust ? 'thrust' : 'slash'} at (${scx.toFixed(0)},${scy.toFixed(0)}) reach=${reach}`);
}

export interface MeleeSwing {
  pos: { x: number; y: number };
  size: { w: number; h: number };
  life: number;
  level: number;
}

export function updateSwings(state: GameState, dt: number): void {
  const ext = state as GameState & { _swing?: MeleeSwing[] };
  if (!ext._swing) return;
  ext._swing = ext._swing.filter(s => { s.life -= dt; return s.life > 0; });
}

export function getSwings(state: GameState): readonly MeleeSwing[] {
  const ext = state as GameState & { _swing?: MeleeSwing[] };
  return ext._swing ?? [];
}

export { aabbOverlap, type Wall };