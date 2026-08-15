// presentation/worldDraw/particles.ts — instanced 粒子批 (P1.4)
//
// 环境/挥砍/玩家火球/敌弹/死亡粒子全部走 instanced batch
// 同 atlas 单 draw call (性能护栏, 见 main.ts 注释 B-V3)

import type { DrawCtx } from './types';
import { worldToScreen } from '../../game/state';
import { getSwings } from '../../game/skill';
import { getEnemyProj } from '../../game/monsters/proj';
import { getDeathFx } from '../../game/fx/deathFx';
import { hexToRgb01 } from '../../ui/primitives';
import { DAMAGE_TYPE_COLORS } from '../../game/combat';
import { RUNE_DEFS } from '../../game/rune';
import { spriteUv } from '../../render/resources';
import { setBlendTracked } from '../../render/draw';

/** 主题环境粒子色 (OPT-027) */
const THEME_ENV_COLOR: Record<string, [number, number, number]> = {
  forest: [0.55, 1, 0.4],
  desert: [1, 0.85, 0.4],
  ruin: [0.55, 0.85, 1],
  void: [0.7, 0.4, 1],
};

/** 环境 + 挥砍 + 火球 + 敌弹 + 死亡粒子 — 单 batch 单 atlas */
export function drawParticles(ctx: DrawCtx): void {
  const { state, gl, res, particleBatch } = ctx;
  const vw = state.viewport.w;
  const vh = state.viewport.h;

  const instUv = (spriteName: string): [number, number, number, number] | null => {
    const bundle = res.atlases.get('particles');
    if (!bundle) return null;
    const sprite = bundle.sprites.get(spriteName);
    return sprite ? spriteUv(sprite, bundle.atlas.width, bundle.atlas.height) : null;
  };
  const addInst = (uv: [number, number, number, number] | null, sp: { x: number; y: number }, w: number, h: number, rot = 0): void => {
    if (!uv) return;
    particleBatch.add(sp.x, sp.y, w, h, uv, rot);
  };
  // 同 atlas 一次绑定纹理 + 程序
  gl.useProgram(particleBatch.program);
  gl.activeTexture(gl.TEXTURE0);
  const pbundle = res.atlases.get('particles');
  if (pbundle) gl.bindTexture(gl.TEXTURE_2D, pbundle.texture);
  // Review 修复: 显式 additive (粒子发光语义), 同步 draw.ts 的 lastBlend 缓存
  setBlendTracked(gl, 'add');
  const flushGroup = (color: [number, number, number]): void => {
    if (particleBatch.pending() > 0) {
      particleBatch.setColor(color[0], color[1], color[2]);
      particleBatch.flush({ w: vw, h: vh });
    }
  };

  // 环境粒子 (OPT-027)
  const envUv = instUv('spark_03');
  const envColor = THEME_ENV_COLOR[state.theme];
  for (const p of state.fx.envFx) {
    const sp = worldToScreen(state, p);
    addInst(envUv, sp, 6, 6);
  }
  flushGroup(envColor);

  // 近战挥击 (slash): 弧线缺口朝玩家侧, 随挥击方向旋转
  // slash_01 默认缺口朝上; 缺口应指向 (-dir) → rot = atan2(-dx, dy) (Y 向下 CW 旋转)
  const slashUv = instUv('slash_01');
  for (const s of getSwings(state)) {
    const sp = worldToScreen(state, s.pos);
    if (sp.x + s.size.w < 0 || sp.x > vw) continue;
    const rot = Math.atan2(-s.dir.x, s.dir.y);
    addInst(slashUv, sp, s.size.w, s.size.h, rot);
  }
  flushGroup([1, 1, 1]);

  // 玩家火球: 颜色各异 (符文色 > 元素色), 逐发 flush
  const magicUv = instUv('magic_01');
  for (const f of state.fx.fireballs) {
    const sp = worldToScreen(state, f.pos);
    const rc = f.rune && f.rune !== 'none' ? RUNE_DEFS[f.rune].color : hexToRgb01(DAMAGE_TYPE_COLORS[f.dmgType]);
    addInst(magicUv, sp, f.size.w, f.size.h);
    flushGroup(rc);
  }

  // 敌弹
  const projUv = instUv('magic_05');
  const projCol: [number, number, number] = [1, 0.3, 0.3];
  for (const p of getEnemyProj(state)) {
    const sp = worldToScreen(state, p.pos);
    if (sp.x + p.size.w < 0 || sp.x > vw) continue;
    if (sp.y + p.size.h < 0 || sp.y > vh) continue;
    addInst(projUv, sp, p.size.w, p.size.h);
  }
  flushGroup(projCol);

  // 死亡粒子 (在世界图层之后, 怪物之前)
  const dUv = instUv('slash_02');
  for (const fx of getDeathFx(state)) {
    const sp = worldToScreen(state, fx.pos);
    if (sp.x + fx.size.w < 0 || sp.x > vw) continue;
    if (sp.y + fx.size.h < 0 || sp.y > vh) continue;
    const lifeFrac = Math.max(0, fx.life / fx.maxLife);
    const sz = fx.size.w * (0.4 + 0.6 * lifeFrac);
    addInst(dUv, { x: sp.x, y: sp.y }, sz, sz, fx.rot);
  }
  flushGroup([0.9, 0.9, 0.95]);
  // 恢复标准混合 (后续怪物/UI 绘制)
  setBlendTracked(gl, 'alpha');
}