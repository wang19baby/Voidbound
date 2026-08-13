// presentation/worldDraw/monsters.ts — 怪物绘制 + 全部机制装饰 (P1.5)
//
// 含: 主题专属 sprite / 走帧挤压 / 蓄力条 / HP 条 / 领主标 / 光环标 / 双元素标 /
//      机制色条 / 护盾弧 / 燃烧火焰 / 荆棘环 / 扑击预警 / 遁地土痕 / 激光预警

import type { DrawCtx } from './types';
import { worldToScreen } from '../../game/state';
import { MONSTER_DEFS, AURA_DEFS } from '../../game/monsters/defs';
import { ELEMENT_DEFS } from '../../game/element';
import { LEAP_WINDUP } from '../../game/moveai';
import { resolveSprite } from '../../render/resources';
import { drawSprite } from '../../render/draw';

/** 怪物 + 全部机制可视化 (HP / 蓄力 / 领主 / 光环 / 元素 / 护盾 / 燃烧 / 荆棘 / 激光预警) */
export function drawMonsters(ctx: DrawCtx): void {
  const { state, gl, quad, res } = ctx;
  const vw = state.viewport.w;
  const vh = state.viewport.h;

  // 机制色条映射 (精英/领主头像下色条)
  const mechBar: Record<string, [number, number, number]> = {
    shield: [0.4, 0.9, 1],
    explode: [1, 0.6, 0.2],
    thorns: [0.5, 1, 0.5],
    curse: [0.8, 0.5, 1],
    death_trigger: [1, 0.4, 0.4],
  };

  for (const m of state.fx.monsters) {
    const sp = worldToScreen(state, m.pos);
    if (sp.x + m.size.w < 0 || sp.x > vw) continue;
    if (sp.y + m.size.h < 0 || sp.y > vh) continue;
    const def = MONSTER_DEFS[m.type];

    // 受击变红 / 精英金黄 / 增强橙
    const color: [number, number, number] | undefined =
      m.elite ? [1, 0.85, 0.25]
      : m.hitFlash > 0 ? [1, 0.3, 0.3]
      : m.enhanced ? [1, 0.65, 0.3]
      : undefined;
    // V1 动画: 2 帧 + 正弦挤压 (移动时 4 步行走感, 静止时轻微呼吸)
    const moving = Math.hypot(m.vel.x, m.vel.y) > 1;
    const bob = Math.sin(m.walkT * (Math.PI * 2) / 0.6) * (moving ? 1 : 0.25);
    // 攻击前摇: 远程怪开火尾窗 / Boss 二阶段技能尾窗 → 放大 + 亮色
    const dist = Math.hypot(state.player.pos.x - m.pos.x, state.player.pos.y - m.pos.y);
    const rangedWind = !!def.rangedCooldown && m.attackCd > 0 && m.attackCd <= 0.35 && dist <= def.aggroRange;
    const bossWind = !!def.boss && m.phase === 2 && m.aiCd > 0 && m.aiCd <= 0.6;
    const charging = rangedWind || bossWind;
    const bobW = m.size.w * (1 + bob * 0.06);
    const bobH = m.size.h * (1 - bob * 0.08);
    const sz = charging ? { w: bobW * 1.15, h: bobH * 1.15 } : { w: bobW, h: bobH };
    const drawColor: [number, number, number] | undefined = charging ? [1.5, 1.25, 1.0] : color;

    // HD 主题专属图: <type>_<theme>_<frame> (同名怪按主题分流, 不再互相覆盖)
    const runTheme = state.run?.theme ?? state.theme;
    const want = `${m.type}_${runTheme}_${m.walkFrame}`;
    const frameSprite = resolveSprite(res, 'monsters', want)
      ? want
      : resolveSprite(res, 'monsters', `${m.type}_${runTheme}_${m.walkFrame % 2}`)
        ? `${m.type}_${runTheme}_${m.walkFrame % 2}`
        : `${def.sprite}_${m.walkFrame % 2}`;
    drawSprite(gl, quad, res, sp, sz, 'monsters', frameSprite, { color: drawColor, hue: m.hue ?? 0 });

    // 领主标记: HP 条上方紫色横条
    if (m.lord) {
      drawSprite(gl, quad, res, { x: sp.x, y: sp.y - 9 }, { w: m.size.w, h: 2 }, 'ui', 'slide_horizontal_color', { color: [0.85, 0.4, 1] });
    }
    // 光环标记: 增强怪头顶光环色点 (先杀光环来源 = 反制点)
    if (m.aura) {
      const auraColor = AURA_DEFS[m.aura].color;
      drawSprite(gl, quad, res, { x: sp.x + m.size.w / 2 - 4, y: sp.y - 13 }, { w: 8, h: 8 }, 'ui', 'slide_horizontal_color', { color: auraColor });
    }
    // A-W4 双元素标记: 副元素色点 (主元素已由 hue 染色整图, 副元素在头顶右偏)
    if (m.subElement) {
      const subColor = ELEMENT_DEFS[m.subElement].color;
      drawSprite(gl, quad, res, { x: sp.x + m.size.w / 2 + 5, y: sp.y - 13 }, { w: 7, h: 7 }, 'ui', 'slide_horizontal_color', { color: subColor });
    }
    // 机制色条
    if (m.mech) {
      const mc = mechBar[m.mech];
      drawSprite(gl, quad, res, { x: sp.x, y: sp.y + m.size.h - 2 }, { w: m.size.w, h: 3 }, 'ui', 'slide_horizontal_color', { color: mc });
    }
    // 护盾弧 (shield): 开盾期间青色光环
    if (m.mech === 'shield' && m.shieldT > 0) {
      const shPulse = 0.85 + 0.15 * Math.sin((performance.now() / 1000) * 10 + m.pos.x);
      const shR = Math.max(m.size.w, m.size.h) * (0.75 + 0.1 * shPulse);
      drawSprite(gl, quad, res, { x: sp.x + m.size.w / 2 - shR, y: sp.y + m.size.h / 2 - shR }, { w: shR * 2, h: shR * 2 }, 'particles', 'circle_01', { color: [0.4, 0.9, 1], blend: 'add' });
    }
    // 燃烧 DOT 火焰附着
    if (m.burnT > 0) {
      const ft = performance.now() / 1000;
      const f1 = Math.sin(ft * 14 + m.pos.x) * 4;
      drawSprite(gl, quad, res, { x: sp.x + m.size.w / 2 - 7 + f1, y: sp.y + m.size.h / 2 - 10 }, { w: 14, h: 14 }, 'particles', 'flame_01', { color: [1, 0.55, 0.2], blend: 'add' });
      drawSprite(gl, quad, res, { x: sp.x + m.size.w / 2 + 3 - f1, y: sp.y + m.size.h / 2 - 5 }, { w: 10, h: 10 }, 'particles', 'flame_02', { color: [1, 0.7, 0.3], blend: 'add' });
    }
    // 荆棘环绕 (反伤怪标记)
    if (m.mech === 'thorns') {
      const thR = Math.max(m.size.w, m.size.h) * 0.72;
      drawSprite(gl, quad, res, { x: sp.x + m.size.w / 2 - thR, y: sp.y + m.size.h / 2 - thR }, { w: thR * 2, h: thR * 2 }, 'particles', 'circle_02', { color: [0.5, 1, 0.5], blend: 'add' });
    }
    // 扑击预警 (leap): 蓄力 0.4s 落点圈可见 → 翻滚躲避
    if (m.moveAI === 'leap' && m.leapT > 0) {
      const warn = m.leapT / LEAP_WINDUP;
      drawSprite(gl, quad, res, { x: sp.x - 8, y: sp.y + m.size.h - 6 }, { w: m.size.w + 16, h: 4 }, 'ui', 'slide_horizontal_color', { color: [1, 0.4, 0.2] });
      void warn;
    }
    // 遁地土痕 (burrow): 地下移动的可见痕迹 → 预判落点
    if (m.moveAI === 'burrow' && m.burrowT > 0) {
      drawSprite(gl, quad, res, { x: sp.x, y: sp.y }, { w: m.size.w, h: m.size.h }, 'ui', 'slide_horizontal_color', { color: [0.75, 0.65, 0.4] });
    }
    // 激光预警 (laser): 蓄力 0.8s 方向线可见 → 站开躲避
    if (m.laserT > 0) {
      const lx = state.player.pos.x - m.pos.x;
      const ly = state.player.pos.y - m.pos.y;
      const len = Math.hypot(lx, ly) || 1;
      const nx = lx / len, ny = ly / len;
      const x0 = sp.x + m.size.w / 2;
      const y0 = sp.y + m.size.h / 2;
      const x1 = x0 + nx * 300;
      const y1 = y0 + ny * 300;
      // 用细长条近似激光方向 (分段画)
      for (let seg = 0; seg < 10; seg++) {
        const t0 = seg / 10;
        const sx = x0 + (x1 - x0) * t0 - 2;
        const sy = y0 + (y1 - y0) * t0;
        drawSprite(gl, quad, res, { x: sx, y: sy }, { w: 4, h: 30 }, 'ui', 'slide_horizontal_color', { color: [1, 0.3, 0.3] });
      }
    }
    // 蓄力条: 前摇进度, 满条 = 即将出手
    if (charging) {
      const windFrac = rangedWind ? m.attackCd / 0.35 : m.aiCd / 0.6;
      drawSprite(gl, quad, res, { x: sp.x, y: sp.y - 8 }, { w: m.size.w * windFrac, h: 3 }, 'ui', 'slide_horizontal_color');
      drawSprite(gl, quad, res, { x: sp.x + m.size.w * windFrac, y: sp.y - 8 }, { w: m.size.w * (1 - windFrac), h: 3 }, 'ui', 'slide_horizontal_grey');
    }
    // HP 条
    const frac = Math.max(0, m.hp) / def.hp;
    const barW = m.size.w;
    const barH = 3;
    drawSprite(gl, quad, res, { x: sp.x, y: sp.y - 5 }, { w: barW * frac, h: barH }, 'ui', 'slide_horizontal_color');
    drawSprite(gl, quad, res, { x: sp.x + barW * frac, y: sp.y - 5 }, { w: barW * (1 - frac), h: barH }, 'ui', 'slide_horizontal_grey');
  }
}