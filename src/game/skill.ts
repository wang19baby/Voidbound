// 技能系统 (US-004 + M5 C-101): 槽位 LMB/RMB/Q/W/E/R → SkillDef
// - 技能池 SKILL_SPECS 按 id 注册; 槽位 registry 存 {id, level, rune}, bindSkill 换技能保留等级/符文
// - 每槽等级 1-20, Ctrl+1..6 分配技能点, 每级 +10% 伤害 (skillDamageScale)
// - 技能 10 级触发符文三选一 (D-01), 绑定后本局永久
// - 投射物承载 dmg + rune + dmgType, 命中结算在 monster.ts

import type { GameState } from './state';
import { RUNE_DEFS, RUNE_FAMILIES, slotFamily, type RuneId } from './rune';
import { spawnFireball } from './state';
import { aabbOverlap } from './world';
import { damageMonster, FIREBALL_DAMAGE, MELEE_DAMAGE, ULTIMATE_DAMAGE } from './monster';
import { aoeVisual, ELEMENT_FX, spawnRing, spawnBurst, spawnBolt, spawnGlow } from './fx/vfx';
import type { DamageType } from './combat';
import { bus } from '../core/eventBus';

export type SkillSlot = 'LMB' | 'RMB' | 'Q' | 'W' | 'E' | 'R';
export const SKILL_SLOTS: readonly SkillSlot[] = ['LMB', 'RMB', 'Q', 'W', 'E', 'R'];

/** 槽位展示名 (M5 实测修正): 内部 W 槽施放键是 F, 展示层必须显示 F 避免与移动键混淆 */
export function slotDisplay(slot: SkillSlot): string {
  return { LMB: '左键', RMB: '右键', Q: 'Q', W: 'F', E: 'E', R: 'R' }[slot];
}

/** 技能 id (M5 C-101): 技能池键; 职业槽位表引用 */
export type SkillId =
  | 'melee' | 'thrust' | 'bash' | 'whirlwind'
  | 'fireball' | 'multi_fireball' | 'frost_nova' | 'chain_lightning'
  | 'shadow_bolt' | 'holy_bolt' | 'poison_dart'
  | 'heal' | 'ultimate';

/** 技能规格 (池): cast 带 slot, 供 bindSkill 闭包捕获 */
export interface SkillSpec {
  name: string;
  cooldown: number;
  mpCost: number;
  cast: (state: GameState, dir: { x: number; y: number }, slot: SkillSlot) => void;
}

export interface SkillDef {
  id: SkillId;
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
  const c = state.combat.combo;
  if (c.timer <= 0) c.count = 0;
  c.count++;
  c.timer = COMBO_WINDOW;
  return c.count;
}

/** 每级 +10% 伤害 (纯函数, US-004 单测) */
export function skillDamageScale(level: number): number {
  return 1 + (level - 1) * 0.1;
}

/** 从技能族池抽 n 个不重复选项 (OPT-023); 家庭池优先(先洗), 不足全局补齐 */
export function pickRuneOptions(slot: SkillSlot, n = 3): RuneId[] {
  const pool = RUNE_FAMILIES[slotFamily(slot)];
  const all = (Object.keys(RUNE_DEFS) as RuneId[]).filter(r => r !== 'none');
  const shuffle = (arr: RuneId[]): RuneId[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const family = shuffle(pool);
  const rest = shuffle(all.filter(r => !pool.includes(r)));
  return [...family, ...rest].slice(0, n);
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
  if (sk.level === 10 && !sk.rune && !state.equip.rejectedRunes.includes(slot)) {
    state.equip.runeChoice = { slot, options: pickRuneOptions(slot) };
    inf('rune', `${slot} 达 10 级 → 触发符文变异三选一`);
  }
  return null;
}

/** 三选一选择: 绑定符文; 返回成功与否 */
export function chooseRune(state: GameState, idx: number): boolean {
  const ch = state.equip.runeChoice;
  if (!ch) return false;
  const rune = ch.options[idx];
  if (!rune) return false;
  registry[ch.slot].rune = rune;
  state.equip.runeChoice = null;
  inf('rune', `${ch.slot} 绑定符文: ${RUNE_DEFS[rune].name}`);
  // T1a: emit 事件
  bus.emit('rune.chosen', { rune, slot: ch.slot });
  return true;
}

/** 拒绝三选一: 该槽本局不再触发 */
export function rejectRune(state: GameState): void {
  if (!state.equip.runeChoice) return;
  state.equip.rejectedRunes.push(state.equip.runeChoice.slot);
  const slot = state.equip.runeChoice.slot;
  state.equip.runeChoice = null;
  inf('rune', `${slot} 拒绝变异 (本局不再触发)`);
}

// === 技能池 (M5 C-101) ===

/** 直射投射物 (fire/shadow/holy/poison 共用) */
function castProjectile(state: GameState, dir: { x: number; y: number }, slot: SkillSlot, type: DamageType, base: number, spread = 0): void {
  const rune = registry[slot].rune;
  const dmg = Math.round(base * skillDamageScale(skillLevel(slot)));
  // VFX (UX_REVIEW P3): 出手 muzzle 爆点
  spawnBurst(state, state.player.pos.x + state.player.size.w / 2, state.player.pos.y + state.player.size.h / 2, 4, ELEMENT_FX[type] ?? [1, 1, 1], 'spark_03', 90, 5, 0.25);
  if (rune === 'split') {
    spawnFireball(state, dir, -0.15, rune, dmg, type);
    spawnFireball(state, dir, 0, rune, dmg, type);
    spawnFireball(state, dir, 0.15, rune, dmg, type);
  } else {
    spawnFireball(state, dir, spread, rune, dmg, type);
  }
}

/** 近战 AABB 挥击 (melee/thrust/bash 共用; mult=倍率, reach=距离) */
function castMelee(state: GameState, dir: { x: number; y: number }, slot: SkillSlot, mult = 1, reach = 96): void {
  let dx = dir.x || state.player.facing.x || 1;
  let dy = dir.y || state.player.facing.y || 0;
  const len = Math.hypot(dx, dy);
  if (len === 0) { dx = 1; dy = 0; }
  else { dx /= len; dy /= len; }

  const rune = skillRune(slot);
  let width = 96;
  if (rune === 'cleave') width = Math.round(width * 1.6);
  const cx = state.player.pos.x + state.player.size.w / 2;
  const cy = state.player.pos.y + state.player.size.h / 2;
  const scx = cx + dx * (state.player.size.w / 2 + reach / 2);
  const scy = cy + dy * (state.player.size.h / 2 + reach / 2);

  const swing: MeleeSwing = {
    pos: { x: scx - width / 2, y: scy - width / 2 },
    size: { w: width, h: width },
    life: 0.18,
    level: skillLevel(slot),
    rune,
    mult,
  };
  (state as GameState & { fx?: { swings?: MeleeSwing[] } }).fx = (state as GameState & { fx?: { swings?: MeleeSwing[] } }).fx ?? { swings: [] } as { swings?: MeleeSwing[] };
  state.fx.swings = state.fx.swings ?? [];
  state.fx.swings.push(swing);

  // 击中火球 (在 AABB 内销毁)
  const before = state.fx.fireballs.length;
  state.fx.fireballs = state.fx.fireballs.filter(f => !aabbOverlap(f.pos.x, f.pos.y, f.size.w, f.size.h, swing.pos.x, swing.pos.y, swing.size.w, swing.size.h));
  const after = state.fx.fireballs.length;
  if (before !== after) {
    inf('combat', `melee destroyed ${before - after} fireball(s)`);
  }
}

/** 周围 AOE (whirlwind/frost_nova 共用) */
function castAoe(state: GameState, _dir: { x: number; y: number }, slot: SkillSlot, type: DamageType, base: number, radius: number, knockback = 30): void {
  const px = state.player.pos.x + state.player.size.w / 2;
  const py = state.player.pos.y + state.player.size.h / 2;
  const dmg = Math.round(base * skillDamageScale(skillLevel(slot)));
  for (const m of state.fx.monsters) {
    const mx = m.pos.x + m.size.w / 2;
    const my = m.pos.y + m.size.h / 2;
    const dx = mx - px;
    const dy = my - py;
    if (dx * dx + dy * dy < radius * radius) {
      damageMonster(state, m, { base: dmg, type, knockback });
    }
  }
  state.fx.monsters = state.fx.monsters.filter(m => m.hp > 0);
  // VFX (UX_REVIEW §8.3): 扩散环 + 粒子爆裂 (物理=旋风灰蓝 / 冰=霜环)
  const vis = aoeVisual(type);
  spawnRing(state, px, py, radius, 0.45, vis.sprite, vis.color);
  spawnBurst(state, px, py, 10, vis.color);
}

/** 连锁闪电: 最近怪 → 链 2 跳 (130px, ×0.7/×0.5) */
function castChain(state: GameState, _dir: { x: number; y: number }, slot: SkillSlot): void {
  const px = state.player.pos.x + state.player.size.w / 2;
  const py = state.player.pos.y + state.player.size.h / 2;
  const base = Math.round(60 * skillDamageScale(skillLevel(slot)));
  const pick = (exclude: unknown, fromX: number, fromY: number, range: number) => {
    let best: { m: (typeof state.fx.monsters)[number]; d: number } | null = null;
    for (const m of state.fx.monsters) {
      if (m.hp <= 0 || m === exclude) continue;
      const mx = m.pos.x + m.size.w / 2;
      const my = m.pos.y + m.size.h / 2;
      const dx = mx - fromX;
      const dy = my - fromY;
      const d = dx * dx + dy * dy;
      if (d < range * range && (!best || d < best.d)) best = { m, d };
    }
    return best ? best.m : null;
  };
  const first = pick(null, px, py, 400);
  if (!first) return;
  let prev = first;
  const mults = [1, 0.7, 0.5];
  const pts: Array<{ x: number; y: number }> = [{ x: px, y: py }];
  for (let hop = 0; hop < 3; hop++) {
    const tgt = hop === 0 ? first : pick(prev, prev.pos.x + prev.size.w / 2, prev.pos.y + prev.size.h / 2, 130);
    if (!tgt) break;
    damageMonster(state, tgt, { base: Math.round(base * mults[hop]), type: 'lightning', knockback: 10 });
    pts.push({ x: tgt.pos.x + tgt.size.w / 2, y: tgt.pos.y + tgt.size.h / 2 });
    prev = tgt;
  }
  state.fx.monsters = state.fx.monsters.filter(m => m.hp > 0);
  // VFX (UX_REVIEW §8.3): 每段闪电连线 + 命中点火花
  const lc = ELEMENT_FX.lightning;
  for (let i = 1; i < pts.length; i++) {
    spawnBolt(state, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, lc);
    spawnBurst(state, pts[i].x, pts[i].y, 4, lc, 'spark_03', 90, 5, 0.3);
  }
}

export const SKILL_SPECS: Record<SkillId, SkillSpec> = {
  melee:      { name: '挥击', cooldown: 0.3, mpCost: 0, cast: (s, d, slot) => castMelee(s, d, slot, 1, 96) },
  thrust:     { name: '突刺', cooldown: 1.0, mpCost: 0, cast: (s, d, slot) => castMelee(s, d, slot, 1.2, 110) },
  bash:       { name: '重击', cooldown: 1.2, mpCost: 0, cast: (s, d, slot) => castMelee(s, d, slot, 1.6, 90) },
  whirlwind:  { name: '旋风斩', cooldown: 2.5, mpCost: 20, cast: (s, d, slot) => castAoe(s, d, slot, 'physical', MELEE_DAMAGE * 0.9, 120) },
  fireball:   { name: '火球', cooldown: 0.3, mpCost: 6, cast: (s, d, slot) => castProjectile(s, d, slot, 'fire', FIREBALL_DAMAGE) },
  multi_fireball: { name: '连发火球', cooldown: 0.8, mpCost: 18, cast: (s, d, slot) => { for (let i = -2; i <= 2; i++) castProjectile(s, d, slot, 'fire', FIREBALL_DAMAGE, i * 0.2); } },
  frost_nova: { name: '冰霜新星', cooldown: 3.0, mpCost: 28, cast: (s, d, slot) => castAoe(s, d, slot, 'ice', FIREBALL_DAMAGE * 1.3, 160) },
  chain_lightning: { name: '闪电链', cooldown: 2.5, mpCost: 30, cast: (s, d, slot) => castChain(s, d, slot) },
  shadow_bolt:{ name: '暗影箭', cooldown: 0.6, mpCost: 8, cast: (s, d, slot) => castProjectile(s, d, slot, 'shadow', 35) },
  holy_bolt:  { name: '圣光弹', cooldown: 0.6, mpCost: 8, cast: (s, d, slot) => castProjectile(s, d, slot, 'holy', 30) },
  poison_dart:{ name: '毒镖', cooldown: 0.7, mpCost: 6, cast: (s, d, slot) => castProjectile(s, d, slot, 'poison', 20) },
  heal:       { name: '回血', cooldown: 5.0, mpCost: 25, cast: (s) => {
    s.player.hp = Math.min(100, s.player.hp + 40);
    // VFX (UX_REVIEW §8.3): 治愈光辉 + 上升粒子
    const hx = s.player.pos.x + s.player.size.w / 2;
    const hy = s.player.pos.y + s.player.size.h / 2;
    spawnGlow(s, hx, hy, [0.45, 1, 0.6]);
    spawnBurst(s, hx, hy, 6, [0.45, 1, 0.6], 'spark_03', 55, 6, 0.8);
  } },
  ultimate:   { name: '终极', cooldown: 8.0, mpCost: 50, cast: (s, _d, slot) => {
    const focus = skillRune(slot) === 'focus' ? 1.5 : 1;
    const base = Math.round(ULTIMATE_DAMAGE * skillDamageScale(skillLevel(slot)) * focus);
    const px = s.player.pos.x + s.player.size.w / 2;
    const py = s.player.pos.y + s.player.size.h / 2;
    for (const m of s.fx.monsters) {
      const dx = m.pos.x + m.size.w / 2 - px;
      const dy = m.pos.y + m.size.h / 2 - py;
      if (dx * dx + dy * dy < 200 * 200) {
        damageMonster(s, m, { base, type: 'shadow' });
      }
    }
    s.fx.monsters = s.fx.monsters.filter(m => m.hp > 0);
    // VFX (UX_REVIEW §8.3): 爆炸波 + 星屑
    spawnRing(s, px, py, 200, 0.6, 'circle_03', [0.7, 0.42, 1]);
    spawnBurst(s, px, py, 16, [0.7, 0.42, 1], 'star_03', 240, 9, 0.7);
  } },
};

export interface MeleeSwing {
  pos: { x: number; y: number };
  size: { w: number; h: number };
  life: number;
  level: number;
  /** 施放时槽位符文 (OPT-023: steal/vampire) */
  rune: RuneId | null;
  /** 伤害倍率 (melee 1 / thrust 1.2 / bash 1.6) */
  mult: number;
}

export function updateSwings(state: GameState, dt: number): void {
  state.fx.swings = state.fx.swings.filter(s => { s.life -= dt; return s.life > 0; });
}

export function getSwings(state: GameState): readonly MeleeSwing[] {
  return state.fx.swings;
}

// === 注册表 ===

/** 槽位 → 技能 (level/rune 为角色级进度, bindSkill 换技能时保留) */
const registry: Record<SkillSlot, SkillDef> = {} as Record<SkillSlot, SkillDef>;
const DEFAULT_SKILLS: Record<SkillSlot, SkillId> = {
  LMB: 'melee', RMB: 'melee', Q: 'fireball', W: 'multi_fireball', E: 'heal', R: 'ultimate',
};
for (const slot of SKILL_SLOTS) bindSkill(slot, DEFAULT_SKILLS[slot]);

/** 绑定技能 id 到槽位 (保留 level/rune; M5 C-102 bindClass 调用) */
export function bindSkill(slot: SkillSlot, id: SkillId): void {
  const spec = SKILL_SPECS[id];
  const cur = registry[slot];
  registry[slot] = {
    id,
    name: spec.name,
    cooldown: spec.cooldown,
    mpCost: spec.mpCost,
    level: cur?.level ?? 1,
    rune: cur?.rune ?? null,
    cast: (state, dir) => spec.cast(state, dir, slot),
  };
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
  // T1a: emit 事件 (sfx/统计服务订阅)
  bus.emit('skill.cast', { slot, id: sk.id, pos: { x: state.player.pos.x, y: state.player.pos.y } });
  return true;
}

// 便捷日志
import { inf } from '../util/log';

export { aabbOverlap, type Wall };