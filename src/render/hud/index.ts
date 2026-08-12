// HUD 渲染主入口 (GAME_FLOW §9.1 分区布局)
//   左上: HP/MP/EXP 条 + 等级
//   右上: 金币 / 积分 / 击杀 / 难度 (右对齐)
//   左下: 技能槽 Q/F/E/R (图标+等级+符文) + 药水/翻滚/技能点
//   右下: 日志面板 (半透明底)
//   顶部中央: 拾取 toast / COMBO
// 文本用 Canvas2D overlay 绘制, sprite 用 WebGL2

import type { GameState } from '../../game/state';
import { MAX_HP, MAX_MP } from '../../game/player';
import { drawSprite } from '../draw';
import type { QuadResources } from '../gl/resources';
import { getSkillCooldowns, getSkill } from '../../game/skill';
import { HUD_PAD, BAR_HEIGHT, BAR_WIDTH, SLOT_SIZE, SLOT_GAP, getMouseX, getMouseY } from './types';
import { slotY } from './geometry';
import { SKILL_KEYS, KEY_TO_SLOT, SKILL_ICON_BY_ID } from './icons';
import {
  drawHpMpOutline, drawExpBar, drawTopRightStats, drawMinimap,
  drawLowHpVignette, drawEliteNames, drawBossHpBar,
} from './bars';
import { drawSkillBarOverlay, drawSkillCooldownOverlay } from './skills';
import {
  drawPickupToasts, drawCombo, drawRuneChoice, drawGroundLabels,
  drawDamageNumbers, drawLevelUpFlash, drawPotionDodgeButtons, drawEquipmentPanel,
} from './overlay';
import { drawLogPanel } from './log';

// === 外部 API barrel (兼容 src/render/hud 旧 import 路径) ===
export type { HudBtn } from './types';
export { setMouseReticle } from './types';
export { drawIcon } from './icons';
export { formatHudTime } from './format';
export { hudDungeonButtons, hudDungeonHit, setHudHover } from './buttons';

// === drawHud 主入口 (WebGL 战斗 HUD: HP/MP 条 + 技能槽图标 + 鼠标 reticle) ===
export function drawHud(
  gl: WebGL2RenderingContext,
  q: QuadResources,
  state: GameState,
): void {
  const nowSec = performance.now() / 1000;
  const hpFrac = Math.max(0, state.player.hp) / MAX_HP;
  const mpFrac = Math.max(0, state.player.mp) / MAX_MP;
  drawSprite(gl, q, state.resources, { x: HUD_PAD, y: HUD_PAD }, { w: BAR_WIDTH * hpFrac, h: BAR_HEIGHT }, 'ui', 'slide_horizontal_color');
  drawSprite(gl, q, state.resources, { x: HUD_PAD, y: HUD_PAD + BAR_HEIGHT + 4 }, { w: BAR_WIDTH * mpFrac, h: BAR_HEIGHT }, 'ui', 'slide_horizontal_color_section_wide');

  // 技能槽 (左下)
  const sy = slotY(state.viewport.h);
  // 槽位→条索引 (SKILL_KEYS = Q/F/E/R, 对应 SkillSlot Q/W/E/R)
  const SLOT_FLASH_IDX: Record<string, number> = { Q: 0, W: 1, E: 2, R: 3 };
  for (let i = 0; i < SKILL_KEYS.length; i++) {
    const x = HUD_PAD + i * (SLOT_SIZE + SLOT_GAP);
    const slot = KEY_TO_SLOT[SKILL_KEYS[i]];
    const sk = getSkill(slot);
    drawSprite(gl, q, state.resources, { x, y: sy }, { w: SLOT_SIZE, h: SLOT_SIZE }, 'icons', SKILL_ICON_BY_ID[sk.id] ?? 'buttonA');
    // cd 遮罩 (cd > 0 时半透灰)
    const cds = getSkillCooldowns(nowSec);
    if ((cds[slot] ?? 0) > 0) {
      drawSprite(gl, q, state.resources, { x, y: sy }, { w: SLOT_SIZE, h: SLOT_SIZE }, 'ui', 'slide_horizontal_grey');
    }
    // 施法失败红闪 (OPT-007)
    const fl = state.castFailFlash;
    if (fl && SLOT_FLASH_IDX[fl.slot] === i) {
      drawSprite(gl, q, state.resources, { x, y: sy }, { w: SLOT_SIZE, h: SLOT_SIZE }, 'ui', 'slide_horizontal_color', { color: [1, 0.25, 0.25] });
    }
  }

  // 鼠标 reticle (瞄准环): 屏幕中心 → 鼠标位置的视觉提示
  const mx = getMouseX();
  const my = getMouseY();
  drawSprite(gl, q, state.resources, { x: mx - 8, y: my - 8 }, { w: 16, h: 16 }, 'particles', 'spark_05');
}

// === drawHudOverlay 主入口 (Canvas2D 文字/面板 overlay) ===
export function drawHudOverlay(
  ctx2d: CanvasRenderingContext2D,
  state: GameState,
): void {
  const vw = state.viewport.w;
  const vh = state.viewport.h;
  ctx2d.font = '12px monospace';
  ctx2d.textBaseline = 'top';

  // === 左上: HP/MP 边框 + 数值 + EXP 条 + 等级 ===
  drawHpMpOutline(ctx2d, state);
  drawExpBar(ctx2d, state);

  // === 右上: 金币/积分/击杀/难度 + 跑局进度 ===
  drawTopRightStats(ctx2d, state, vw);
  // 小地图 (OPT-024): 战斗场景右上, 现有 walls/monsters 降采样
  drawMinimap(ctx2d, state, vw);
  // 低血量红晕 (OPT-026): HP < 25% 时边缘渐红
  drawLowHpVignette(ctx2d, state, vw, vh);
  // 精英名牌 (内容扩充)
  drawEliteNames(ctx2d, state);
  // Boss 顶栏血条 (内容补): 顶部居中 + 二阶段狂暴预告
  drawBossHpBar(ctx2d, state, vw);

  // === 左下: 技能簇 ===
  drawSkillBarOverlay(ctx2d, state, vh);
  // 药水/翻滚按钮 (鼠标可点, 与键盘 1/2/Space 同行为; hover 高亮)
  drawPotionDodgeButtons(ctx2d, state, vw, vh);
  // 技能 cd 倒计时 (槽内)
  drawSkillCooldownOverlay(ctx2d, state, vh);

  // === 右下: 日志面板 (半透明底) ===
  drawLogPanel(ctx2d, vw, vh);

  // === 顶部中央: 拾取 toast ===
  drawPickupToasts(ctx2d, state, vw);
  // COMBO (顶部中央, toast 下方)
  drawCombo(ctx2d, state, vw);

  // 符文三选一 overlay (D-01)
  drawRuneChoice(ctx2d, state, vw, vh);

  // 地面装备标签 (US-018)
  drawGroundLabels(ctx2d, state, vw, vh);

  // 伤害数字 (世界坐标 → 屏幕)
  drawDamageNumbers(ctx2d, state, vw, vh);

  // 升级全屏金光 (US-019)
  drawLevelUpFlash(ctx2d, state, vw, vh);

  // 装备面板 (OPT-014, A1): 左穿戴槽 + 中背包(滚动/选择/对比) + 右聚合属性
  drawEquipmentPanel(ctx2d, state, vw);
}