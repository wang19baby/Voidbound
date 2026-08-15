// presentation/worldDraw/loot.ts — 地面装备 + 拾取 (P1.7)

import type { DrawCtx } from './types';
import { worldToScreen } from '../../game/state';
import { getLoot, pickupLoot, RARITY_COLORS, describeAffix } from '../../game/equipment';
import { pushToast } from '../../game/toast';
import { playSfxClient } from '../../ipc/sfx';
import { inf } from '../../util/log';
import { drawSprite } from '../../render/draw';

/** 地面装备渲染 + 拾取触发 (toast + sfx + log) */
export function drawLoot(ctx: DrawCtx): void {
  const { state, gl, quad, res } = ctx;
  const vw = state.viewport.w;
  const vh = state.viewport.h;

  // 装备渲染: 4 阶稀有度上色 — 暗底背景框 + 稀有度边框 + 火花 (2026-08-15: 地面更醒目)
  for (const eq of getLoot(state)) {
    const sp = worldToScreen(state, eq.pos);
    if (sp.x + eq.size.w < 0 || sp.x > vw) continue;
    if (sp.y + eq.size.h < 0 || sp.y > vh) continue;
    const col = RARITY_COLORS[eq.rarity];
    const b = 5;
    const w = eq.size.w, h = eq.size.h;
    // 暗底
    drawSprite(gl, quad, res, { x: sp.x - b, y: sp.y - b }, { w: w + b * 2, h: h + b * 2 }, 'ui', 'slide_horizontal_color', { color: [0.06, 0.07, 0.11] });
    // 稀有度边框 (4 条细边)
    drawSprite(gl, quad, res, { x: sp.x - b, y: sp.y - b }, { w: w + b * 2, h: 2 }, 'ui', 'slide_horizontal_color', { color: col });
    drawSprite(gl, quad, res, { x: sp.x - b, y: sp.y + h + b - 2 }, { w: w + b * 2, h: 2 }, 'ui', 'slide_horizontal_color', { color: col });
    drawSprite(gl, quad, res, { x: sp.x - b, y: sp.y - b }, { w: 2, h: h + b * 2 }, 'ui', 'slide_horizontal_color', { color: col });
    drawSprite(gl, quad, res, { x: sp.x + w + b - 2, y: sp.y - b }, { w: 2, h: h + b * 2 }, 'ui', 'slide_horizontal_color', { color: col });
    drawSprite(gl, quad, res, sp, eq.size, 'particles', 'spark_03', { color: col, blend: 'add' });
  }

  // 拾取: 玩家走过即入背包
  const picked = pickupLoot(state);
  for (const eq of picked) {
    const affix = eq.affixes.map(describeAffix).join(' ');
    inf('loot', `picked ${eq.rarity} ${eq.name} (${affix})`);
    const col = RARITY_COLORS[eq.rarity].map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
    // 屏幕中央 toast 只显示物品名 (属性进右侧装备面板)
    pushToast(state, eq.name, `#${col}`);
    playSfxClient('pickup');  // OPT-025
  }
}