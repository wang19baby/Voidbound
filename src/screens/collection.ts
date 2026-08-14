// screens/collection.ts — 角色管理屏收集总览覆盖层 (US-026 伴随 T1c)
//
// 拆分动机: main.ts 2010-2087 收集总览覆盖层, 拆出独立模块
//
// 设计选择 (与 screens/town/characters 一致):
// - drawCollectionPanel 整块原样搬移, 闭包引用 → ctx 字段
// - formatTime 是 main.ts 私有 (line 1431), 由 ctx 注入
// - getOwned/getEquippedValues/SET_BONUSES/SKILL_SLOTS/SKILL_SPECS/RUNE_DEFS/DIFFICULTY_MODS
//   直接从 game/* import
//
// 依赖: game/equipment + game/skill + game/rune + game/difficulty + game/uigrid (inRect) + ctx 注入

import type { GameState } from '../game/state';
import {
  getOwned, getEquippedValues, SET_BONUSES,
} from '../game/equipment';
import { SKILL_SLOTS, SKILL_SPECS, skillRune, getSkill } from '../game/skill';
import { RUNE_DEFS } from '../game/rune';
import { DIFFICULTY_MODS, type Difficulty } from '../game/difficulty';
import { inRect } from '../game/uigrid';
import type { MouseHandle } from '../input/mouse';

// ============================================================================
// Ctx
// ============================================================================

export interface CollectionCtx {
  state: GameState;
  hudCtx: CanvasRenderingContext2D;
  hudCanvas: HTMLCanvasElement;
  mouse: MouseHandle;
  /** main.ts line 1431: 秒 → "m:ss" 格式化 */
  formatTime: (sec: number) => string;
}

// ============================================================================
// 绘制
// ============================================================================

/** C (P1-4): 收集总览覆盖层 (characters 屏, Esc/关闭按钮退出) */
export function drawCollectionPanel(ctx: CollectionCtx): void {
  const { state, hudCtx, hudCanvas, mouse, formatTime } = ctx;
  const w = hudCanvas.width;
  const h = hudCanvas.height;
  hudCtx.fillStyle = 'rgba(4,4,10,0.93)';
  hudCtx.fillRect(0, 0, w, h);
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.fillStyle = '#ffd64a';
  hudCtx.font = 'bold 30px monospace';
  hudCtx.fillText('收 集 进 度', w / 2, 62);
  hudCtx.fillStyle = '#99a';
  hudCtx.font = '13px monospace';
  hudCtx.fillText(`角色 ${state.currentChar} · 账号共享 (仓库/传承/通关)`, w / 2, 92);

  // 套装: 3 张卡 (角色背包+穿戴 + 账号仓库)
  const allEq = [...getOwned(state), ...getEquippedValues(state), ...state.warehouse];
  const setKeys = Object.keys(SET_BONUSES);
  const setW = 200, setGap = 16;
  const setX0 = w / 2 - (setKeys.length * (setW + setGap) - setGap) / 2;
  setKeys.forEach((k, i) => {
    const n = allEq.filter(eq => eq.setName === k).length;
    const x = setX0 + i * (setW + setGap);
    const y = 128;
    hudCtx.fillStyle = n > 0 ? 'rgba(255,214,74,0.10)' : 'rgba(20,20,30,0.9)';
    hudCtx.fillRect(x, y, setW, 62);
    hudCtx.strokeStyle = n > 0 ? '#ffd64a' : '#3a3a48';
    hudCtx.lineWidth = n > 0 ? 2 : 1;
    hudCtx.strokeRect(x, y, setW, 62);
    hudCtx.fillStyle = n > 0 ? '#ffd64a' : '#8a8a96';
    hudCtx.font = 'bold 16px monospace';
    hudCtx.fillText(SET_BONUSES[k].name, x + setW / 2, y + 21);
    hudCtx.fillStyle = n > 0 ? '#eee' : '#8a8a96';
    hudCtx.font = '13px monospace';
    hudCtx.fillText(`拥有 ${n} 件`, x + setW / 2, y + 43);
  });

  let y = 240;
  const row = (label: string, val: string, col = '#ddd') => {
    hudCtx.textAlign = 'center';
    hudCtx.fillStyle = '#889';
    hudCtx.font = 'bold 15px monospace';
    hudCtx.fillText(label, w / 2 - 170, y);
    hudCtx.textAlign = 'left';
    hudCtx.fillStyle = col;
    hudCtx.font = '14px monospace';
    hudCtx.fillText(val, w / 2 + 40, y);
    // UI-FIX5: 紧凑布局 (32→24), 关闭按钮从 h-84 上移到 y=460, 整体收尾到 y≤500
    y += 24;
  };
  const skillBound = SKILL_SLOTS.filter(slot => !!getSkill(slot)).length;
  row('技能池', `${skillBound}/${Object.keys(SKILL_SPECS).length} (当前职业绑定)`);
  const runes = new Set<string>();
  for (const slot of SKILL_SLOTS) {
    const r = skillRune(slot);
    if (r && r !== 'none') runes.add(r);
  }
  for (const l of state.legacy) runes.add(l.rune);
  const runeTotal = Object.keys(RUNE_DEFS).filter(id => id !== 'none').length;
  row('符文', `${runes.size}/${runeTotal} (已绑定 + 传承)`, runes.size > 0 ? '#c9aaff' : '#ddd');
  row('已通关', state.cleared.length > 0 ? state.cleared.join(' · ') : '尚无', state.cleared.length > 0 ? '#8f8' : '#999');
  const bestText = Object.entries(state.run.best)
    .map(([d, ms]) => `${DIFFICULTY_MODS[d as Difficulty]?.name ?? d} ${formatTime(ms / 1000)}`)
    .join(' · ');
  row('最佳记录', bestText || '—');

  // 关闭按钮 (UI-FIX5: 从 h-84 上移到 y=460, 减少底部空白)
  const cr: [number, number, number, number] = [w / 2 - 90, 460, 180, 40];
  const hit = inRect(mouse.state().pos.x, mouse.state().pos.y, ...cr);
  hudCtx.fillStyle = hit ? 'rgba(255,255,255,0.12)' : 'rgba(30,30,42,0.9)';
  hudCtx.fillRect(...cr);
  hudCtx.strokeStyle = '#66ccff';
  hudCtx.lineWidth = hit ? 2 : 1;
  hudCtx.strokeRect(...cr);
  hudCtx.fillStyle = '#66ccff';
  hudCtx.font = 'bold 15px monospace';
  hudCtx.fillText('[Esc] 关闭', w / 2, h - 64);
  hudCtx.textAlign = 'left';
  hudCtx.textBaseline = 'top';
}
