// HUD 图标: icons 图集绘制 + 技能键映射

import type { RenderResources } from '../resources';
import type { SkillId, SkillSlot } from '../../game/skill';

/** Canvas2D overlay 上画 icons 图集图标 (城镇面板底色不透明, GL 图标会被盖住 → 用 ImageBitmap) */
export function drawIcon(ctx: CanvasRenderingContext2D, res: RenderResources, name: string, dx: number, dy: number, size: number): void {
  if (!res.iconBitmap) return;
  const spr = res.atlases.get('icons')?.sprites.get(name);
  if (!spr) return;
  ctx.drawImage(res.iconBitmap, spr.x, spr.y, spr.frame_width, spr.frame_height, dx, dy, size, size);
}

export const SKILL_KEYS = ['Q', 'F', 'E', 'R'] as const;
/** 展示键 → 内部槽位 (F=W); 修 W 槽 Lv/符文/cd 查不到的历史 bug */
export const KEY_TO_SLOT: Record<string, SkillSlot> = { Q: 'Q', F: 'W', E: 'E', R: 'R' };
/** 技能 id → icons 图集图标 (review §8.1: 替代手柄键帽 buttonA/B/X/Y) */
export const SKILL_ICON_BY_ID: Record<SkillId, string> = {
  melee: 'skill_melee', thrust: 'skill_thrust', bash: 'skill_bash', whirlwind: 'skill_whirlwind',
  fireball: 'skill_fireball', multi_fireball: 'skill_multi_fireball', frost_nova: 'skill_frost_nova',
  chain_lightning: 'skill_chain_lightning', shadow_bolt: 'skill_shadow_bolt', holy_bolt: 'skill_holy_bolt',
  poison_dart: 'skill_poison_dart', heal: 'skill_heal', ultimate: 'skill_ultimate',
};