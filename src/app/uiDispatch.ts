// app/uiDispatch.ts — 鼠标点击分发 (US-031 拆分)
//
// 设计:
// - handleUiClick 整块 ~315 行从 main.ts 抽到本模块
// - 保持原 switch-case 结构 (零行为变更); 副作用回调通过 UiCtx 注入
// - 未来 US-031-b 可进一步表驱动化 (按屏 Route[] 表); 本次先最小切片搬迁
//
// 依赖: game/* 领域模块 (只读 state) + main.ts 副作用函数 (注入)

import type { GameState } from '../game/state';
import type { Screen } from '../game/state';
import { inRect } from '../game/uigrid';
import { slotRects, pageCount, pageOf, cellRects, cellIndex, flipPage, pageStart, EQ_LAYOUT } from '../game/uigrid';
import { CLASS_IDS } from '../game/class';
import { DIFFICULTIES, DIFFICULTY_MODS, unlockedDifficulty } from '../game/difficulty';
import { MAP_MODES } from '../game/mapmode';
import { NG_LAYOUT } from '../screens/newgame';
import { EX_LAYOUT } from '../screens/expedition';
import { themeUnlocked } from '../game/newgame';
import { THEMES } from '../game/state';
import { EQUIP_SLOTS, EQUIP_NAMES, RARITY_COLORS, getOwned, equipItem, unequipSlot } from '../game/equipment';
import { townNpcs } from '../game/town';
import type { CharacterSummary } from '../ipc/save';
import { chooseRune } from '../game/skill';
import { pushToast } from '../game/toast';
import { playSfxClient } from '../ipc/sfx';
import { inf, wrn } from '../util/log';
import { isCloseConfirmOpen, isNgNaming, setNgNaming } from './screenMachine';
import { persistNowApp } from './save';
import { deleteCharacter } from '../ipc/save';

/** uiDispatch 依赖注入 — main.ts 拥有实现, 本模块拥有决策 */
export interface UiCtx {
  state: GameState;
  w: number;
  h: number;
  mx: number;
  my: number;
  // 副作用回调 (跨模块)
  confirmCloseSave: () => void;
  confirmCloseCancel: () => void;
  continueLastSave: () => void;
  enterTargetCharacter: (target: CharacterSummary) => void;
  titleAct: (idx: number) => void;
  handleSettingsClick: (mx: number, my: number) => boolean;
  handleTownPanelKey: (e: KeyboardEvent, k: string) => void;
  startFromNewgame: () => void;
  startExpeditionRun: () => void;
  enterTown: () => void;
  startRun: () => void;
  hardcoreWipe: (state: GameState) => void;
  revivePlayer: (state: GameState) => void;
  leaveThroughPortal: (state: GameState) => void;
  setScreen: (state: GameState, screen: Screen) => void;
  resumeScreen: (state: GameState) => Screen;
  deathGoldPenalty: (gold: number, mode: 'town' | 'revive', hardcore: boolean) => number;
  loadLastNg: () => { classIdx: number; diffIdx: number; themeIdx: number; modeIdx: number } | null;
}

/** 鼠标点击主入口 (替代 main.ts 内 handleUiClick 函数) */
export function handleUiClick(ctx: UiCtx): boolean {
  const { state, w, h, mx, my } = ctx;
  // 关窗确认 (OPT-002): Y 保存退出 / N 取消
  if (isCloseConfirmOpen()) {
    if (inRect(mx, my, w / 2 - 140, h / 2 + 40, 120, 40)) { ctx.confirmCloseSave(); return true; }
    if (inRect(mx, my, w / 2 + 20, h / 2 + 40, 120, 40)) { ctx.confirmCloseCancel(); return true; }
    return true;
  }
  // 符文三选一: 3 个符文盒 (覆盖于任何屏)
  if (state.equip.runeChoice) {
    const boxW = 260, boxGap = 20, totalW = boxW * 3 + boxGap * 2;
    const x0 = (w - totalW) / 2, y0 = h / 2 - 70;
    for (let i = 0; i < state.equip.runeChoice.options.length; i++) {
      if (inRect(mx, my, x0 + i * (boxW + boxGap), y0, boxW, 84)) { chooseRune(state, i); return true; }
    }
    return true;
  }
  switch (state.screen) {
    case 'title': {
      const cx = w / 2, btnW = 320, btnH = 38;
      const hasSave = state.charList.length > 0;
      // TS-009: 设置齿轮入口 (与 drawTitle 同步: 右下 36×36)
      if (inRect(mx, my, w - 50, h - 50, 36, 36)) { state.ui.settingsOpen = !state.ui.settingsOpen; return true; }
      // TS-003: 右侧最近存档卡片 (与 drawTitle 同步: w-380, 400, 300×42)
      const cards = hasSave
        ? [...state.charList].sort((a, b) => (b.last_played ?? 0) - (a.last_played ?? 0)).slice(0, 5)
        : [];
      for (let i = 0; i < cards.length; i++) {
        if (inRect(mx, my, w - 380, 400 + i * 48, 300, 42)) { ctx.enterTargetCharacter(state, cards[i]); return true; }
      }
      const menuY0 = h / 2 - 30;
      // 继续游戏大按钮 (480×56, 与 drawTitle 一致: contY = menuY0 - 45)
      if (hasSave && inRect(mx, my, cx - 240, menuY0 - 45, 480, 56)) {
        ctx.continueLastSave();
        return true;
      }
      // 设置面板键位条目 (P3-10)
      if (state.ui.settingsOpen && ctx.handleSettingsClick(mx, my)) return true;
      // 菜单项 (与 drawTitle 一致: +52/+104/+156)
      const itemYs: Array<{ y: number; idx: number }> = hasSave
        ? [{ y: menuY0 + 52, idx: 1 }, { y: menuY0 + 104, idx: 2 }, { y: menuY0 + 156, idx: 3 }]
        : [{ y: menuY0, idx: 0 }, { y: menuY0 + 52, idx: 1 }, { y: menuY0 + 104, idx: 2 }];
      for (const it of itemYs) {
        if (inRect(mx, my, cx - btnW / 2, it.y - btnH / 2, btnW, btnH)) { ctx.titleAct(it.idx); return true; }
      }
      return true;
    }
    case 'town': {
      // C-505 城镇面板行点击
      if (state.townPanel) {
        const y0 = 70 + 34;
        const rowH = 24;
        const clicked = (my - y0) >= 0 ? Math.floor((my - y0) / rowH) : -1;
        if (mx > 40 && clicked >= 0) {
          const k = `${clicked + 1}`;
          ctx.handleTownPanelKey({ key: k } as KeyboardEvent, k);
          return true;
        }
      }
      // 城镇左上角"返回主菜单"按钮 (与 drawTownFrame 同步: 16, 16, 160, 32)
      if (inRect(mx, my, 16, 16, 160, 32)) {
        ctx.setScreen(state, 'title');
        return true;
      }
      // v3 NPC 点击
      for (const npc of townNpcs(state.townId)) {
        if (inRect(mx, my, npc.pos.x - 30, npc.pos.y - 30, 60, 60)) {
          if (state.townWalk?.kind === npc.kind) state.townWalk = null;
          else {
            state.townWalk = { kind: npc.kind, x: npc.pos.x, y: npc.pos.y };
            inf('ui', `走向 ${npc.name}...`);
          }
          return true;
        }
      }
      return true;
    }
    case 'pause': {
      // 设置面板键位条目 (P3-10)
      if (state.ui.settingsOpen && ctx.handleSettingsClick(mx, my)) return true;
      const totalW = 460, segW = totalW / 4;
      const x0 = w / 2 - totalW / 2, y0 = h / 2 - 30, segH = 44;
      const segs: Array<() => void> = [
        () => ctx.setScreen(state, ctx.resumeScreen(state)),
        () => { state.ui.settingsOpen = !state.ui.settingsOpen; },
        () => { state.ui.settingsOpen = false; void persistNowApp(state).then(() => pushToast(state, '已保存, 返回主菜单', '#9cf')); ctx.setScreen(state, 'title'); },
        () => { state.ui.settingsOpen = false; ctx.enterTown(); },
      ];
      if (!state.ui.settingsOpen) {
        for (let i = 0; i < segs.length; i++) {
          if (inRect(mx, my, x0 + i * segW, y0, segW, segH)) { segs[i](); return true; }
        }
      }
      return true;
    }
    case 'death': {
      if (!state.deathSummary) return true;
      const totalW = 420, segW = totalW / 3;
      const x0 = w / 2 - totalW / 2, y0 = h / 2 + 60, segH = 40;
      const ds = state.deathSummary;
      const segs: Array<() => void> = ds.hardcore
        ? [
            () => { ctx.hardcoreWipe(state); ctx.startRun(); state.ui.dying = false; state.deathSummary = null; },
            () => { state.ui.dying = false; state.deathSummary = null; ctx.setScreen(state, 'title'); },
          ]
        : [
            () => { state.player.gold -= ctx.deathGoldPenalty(state.player.gold, 'town', false); state.player.potions = { hp: 3, mp: 3 }; ctx.enterTown(); state.ui.dying = false; state.deathSummary = null; },
            () => { state.player.gold -= ctx.deathGoldPenalty(state.player.gold, 'revive', false); ctx.revivePlayer(state); state.ui.dying = false; state.deathSummary = null; ctx.setScreen(state, 'dungeon'); },
            () => { ctx.startRun(); state.ui.dying = false; state.deathSummary = null; },
          ];
      for (let i = 0; i < segs.length; i++) {
        if (inRect(mx, my, x0 + i * segW, y0, segW, segH)) { segs[i](); return true; }
      }
      // C (死亡撤销): 撤销按钮 (5s 窗口)
      if (!ds.hardcore && state.ui.deathUndo > 0 && inRect(mx, my, w / 2 - 150, h / 2 + 120, 300, 36)) {
        ctx.revivePlayer(state);
        state.ui.dying = false;
        state.deathSummary = null;
        state.ui.deathUndo = 0;
        ctx.setScreen(state, 'dungeon');
        pushToast(state, '已撤销死亡 (免费)', '#8f8');
        return true;
      }
      return true;
    }
    case 'victory': {
      const totalW = 380, segW = totalW / 2;
      const x0 = w / 2 - totalW / 2, y0 = h / 2 + 52, segH = 40;
      const segs: Array<() => void> = [
        () => { ctx.startRun(); },
        () => { ctx.enterTown(); },
      ];
      for (let i = 0; i < segs.length; i++) {
        if (inRect(mx, my, x0 + i * segW, y0, segW, segH)) { segs[i](); return true; }
      }
      return true;
    }
    case 'newgame': {
      const cy = h / 2 + NG_LAYOUT.cy;
      // 创建模式命名框
      if (state.ngFrom === 'create' && inRect(mx, my, w / 2 - 180, 148, 360, 40)) {
        setNgNaming(true);
        return true;
      }
      if (state.ngFrom === 'create' && isNgNaming() && !inRect(mx, my, w / 2 - 180, 148, 360, 40)) setNgNaming(false);
      // 上次配置复用
      if (inRect(mx, my, w - 460, 20, 220, 40)) {
        const last = ctx.loadLastNg();
        if (last) { state.ngSel = last; setNgNaming(false); pushToast(state, '已复用上次配置', '#9cf'); }
        else pushToast(state, '暂无上次配置', '#886');
        return true;
      }
      // 职业列
      if (state.ngFrom !== 'town') {
        for (let i = 0; i < CLASS_IDS.length; i++) {
          if (inRect(mx, my, w / 2 + NG_LAYOUT.classX, cy + i * 60 - 27, NG_LAYOUT.classW, 54)) { state.ngSel.classIdx = i; playSfxClient('ui_click'); return true; }
        }
      }
      // 难度
      for (let i = 0; i < DIFFICULTIES.length; i++) {
        if (inRect(mx, my, w / 2 + NG_LAYOUT.diffX, cy + i * 48 - 22, NG_LAYOUT.diffW, 44)) {
          const d = DIFFICULTIES[i];
          if (unlockedDifficulty(state.cleared, d)) { state.ngSel.diffIdx = i; playSfxClient('ui_click'); }
          else pushToast(state, `${DIFFICULTY_MODS[d].name} 未解锁 (通关前置)`, '#f66');
          return true;
        }
      }
      // 出发/开始 (MM-UG1: 主题/模式移到 expedition 屏)
      if (inRect(mx, my, w / 2 + NG_LAYOUT.startX, h + NG_LAYOUT.startY, NG_LAYOUT.startW, NG_LAYOUT.startH)) {
        ctx.startFromNewgame();
        return true;
      }
      // 返回按钮 (右上角, 与 newgame 屏一致)
      if (inRect(mx, my, w - 220, 20, 200, 40)) {
        ctx.setScreen(state, state.ngFrom === 'town' ? 'town' : 'title');
        state.ui.titleMsg = '';
        setNgNaming(false);
        return true;
      }
      return true;
    }
    case 'expedition': {
      // MM-UG1: 主题 + 模式 + 难度 三横排 + 出发按钮 + 返回城镇
      const cy = h / 2 + EX_LAYOUT.cy;
      // 难度 (cy + EX_LAYOUT.diffY, 居中 120px 间距, 5 个)
      for (let i = 0; i < DIFFICULTIES.length; i++) {
        if (inRect(mx, my, (w - DIFFICULTIES.length * EX_LAYOUT.diffSpacing) / 2 + i * EX_LAYOUT.diffSpacing, cy + EX_LAYOUT.diffY, EX_LAYOUT.diffSpacing, EX_LAYOUT.cardH)) {
          const d = DIFFICULTIES[i];
          if (unlockedDifficulty(state.cleared, d)) { state.ngSel.diffIdx = i; playSfxClient('ui_click'); }
          else pushToast(state, `${DIFFICULTY_MODS[d].name} 未解锁 (通关前置)`, '#f66');
          return true;
        }
      }
      // 主题 (cy + EX_LAYOUT.themeY, 居中 140px 间距, 4 个)
      for (let i = 0; i < THEMES.length; i++) {
        if (inRect(mx, my, (w - THEMES.length * EX_LAYOUT.themeSpacing) / 2 + i * EX_LAYOUT.themeSpacing, cy + EX_LAYOUT.themeY, EX_LAYOUT.themeSpacing, EX_LAYOUT.cardH)) {
          if (themeUnlocked(state.cleared, THEMES[i])) { state.ngSel.themeIdx = i; playSfxClient('ui_click'); }
          else pushToast(state, `主题 ${THEMES[i]} 未解锁 (通关森林后开放)`, '#f66');
          return true;
        }
      }
      // 模式 (cy + EX_LAYOUT.modeY, 居中 160px 间距)
      for (let i = 0; i < MAP_MODES.length; i++) {
        if (inRect(mx, my, (w - MAP_MODES.length * EX_LAYOUT.modeSpacing) / 2 + i * EX_LAYOUT.modeSpacing, cy + EX_LAYOUT.modeY, EX_LAYOUT.modeSpacing, EX_LAYOUT.cardH)) {
          state.ngSel.modeIdx = i;
          playSfxClient('ui_click');
          return true;
        }
      }
      // 出发按钮 (h-130, 居中 360×56)
      if (inRect(mx, my, w / 2 - 180, h - 130, 360, EX_LAYOUT.startH)) {
        ctx.startExpeditionRun();
        return true;
      }
      // 返回城镇按钮 (左上 20,20,200,40)
      if (inRect(mx, my, ...EX_LAYOUT.backR)) {
        ctx.setScreen(state, 'town');
        return true;
      }
      return true;
    }
    case 'characters': {
      const cx = w / 2;
      // C (P1-4): 收集总览关闭
      if (state.ui.collectOpen) {
        if (inRect(mx, my, w / 2 - 90, h - 84, 180, 40)) { state.ui.collectOpen = false; return true; }
        return true;
      }
      if (inRect(mx, my, w - 150, 20, 130, 30)) { state.ui.collectOpen = !state.ui.collectOpen; return true; }
      if (state.charConfirmDel) {
        if (inRect(mx, my, cx - 200, h / 2 + 20 - 16, 400, 40)) {
          const target = state.charList[state.charSel];
          if (target) {
            state.charList = state.charList.filter(c => c.id !== target.id);
            if (state.charSel >= state.charList.length) state.charSel = Math.max(0, state.charList.length - 1);
            if (state.currentChar === target.id) state.currentChar = 'char_0';
            void deleteCharacter(target.id).then(() => pushToast(state, `已删除角色 ${target.id}`, '#f66'))
              .catch(e => wrn('save', `delete ${target.id}: ${e}`));
            inf('ui', `角色删除: ${target.id}`);
          }
          state.charConfirmDel = false;
          return true;
        }
        if (inRect(mx, my, 20, 20, 200, 40)) { state.charConfirmDel = false; return true; }
        return true;
      }
      // v4 最近 3 角色快捷横排
      const recent3 = state.charList.slice(0, 3);
      if (recent3.length > 0) {
        const cy0 = 128;
        for (let i = 0; i < recent3.length; i++) {
          const c = recent3[i];
          if (inRect(mx, my, cx - 320 + i * 240, cy0, 220, 86)) {
            state.charSel = state.charList.findIndex(c2 => c2.id === c.id);
            ctx.enterTargetCharacter(state, c);
            return true;
          }
        }
      }
      const rows = Math.min(state.charList.length, 8);
      const y0 = h / 2 - rows * 26;
      for (let i = 0; i < rows; i++) {
        if (inRect(mx, my, cx - 320, y0 + i * 52 - 14, 640, 40)) { state.charSel = i; return true; }
      }
      if (inRect(mx, my, cx - 300, h - 100, 600, 40)) {
        const target = state.charList[state.charSel];
        if (target) ctx.enterTargetCharacter(state, target);
        return true;
      }
      if (inRect(mx, my, cx + 100, h - 60, 200, 40)) {
        if (state.charList.length > 0) state.charConfirmDel = true;
        return true;
      }
      if (inRect(mx, my, 20, 20, 200, 40)) { ctx.setScreen(state, 'title'); return true; }
      return true;
    }
    case 'portal': {
      if (inRect(mx, my, w / 2 - 210, h / 2 + 58, 200, 44)) { ctx.leaveThroughPortal(state); return true; }
      if (inRect(mx, my, w / 2 + 10, h / 2 + 58, 200, 44)) { ctx.setScreen(state, 'dungeon'); return true; }
      return true;
    }
    case 'equipment': {
      const slots = slotRects();
      for (let i = 0; i < EQUIP_SLOTS.length; i++) {
        const s = slots[i];
        if (inRect(mx, my, s.x, s.y, EQ_LAYOUT.slotSize, EQ_LAYOUT.slotSize)) {
          if (unequipSlot(state, EQUIP_SLOTS[i])) { pushToast(state, `已卸下: ${EQUIP_NAMES[EQUIP_SLOTS[i]]}`, '#9cf'); playSfxClient('ui_click'); }
          return true;
        }
      }
      const total = getOwned(state).length;
      const pc = pageCount(total);
      const curPage = Math.min(pageOf(state.equip.sel), pc - 1);
      for (const c of cellRects()) {
        if (inRect(mx, my, c.x, c.y, EQ_LAYOUT.cellSize, EQ_LAYOUT.cellSize)) {
          const idx = cellIndex(c.col, c.row, curPage, total);
          if (idx !== null) state.equip.sel = idx;
          return true;
        }
      }
      if (inRect(mx, my, EQ_LAYOUT.btnEquip.x, EQ_LAYOUT.btnEquip.y, EQ_LAYOUT.btnEquip.w, EQ_LAYOUT.btnEquip.h)) {
        const eq = getOwned(state)[state.equip.sel];
        if (eq && equipItem(state, eq)) {
          const col = RARITY_COLORS[eq.rarity].map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
          pushToast(state, `已穿戴 ${eq.name}`, `#${col}`);
          playSfxClient('ui_click');
        }
        return true;
      }
      if (inRect(mx, my, EQ_LAYOUT.btnUnequip.x, EQ_LAYOUT.btnUnequip.y, EQ_LAYOUT.btnUnequip.w, EQ_LAYOUT.btnUnequip.h)) {
        const eq = getOwned(state)[state.equip.sel];
        const slot = eq ? eq.type : undefined;
        if (slot && unequipSlot(state, slot)) pushToast(state, `已卸下: ${EQUIP_NAMES[slot]}`, '#9cf');
        return true;
      }
      // 关闭
      if (inRect(mx, my, EQ_LAYOUT.btnClose.x, EQ_LAYOUT.btnClose.y, EQ_LAYOUT.btnClose.w, EQ_LAYOUT.btnClose.h)) {
        ctx.setScreen(state, 'dungeon');
        inf('ui', 'equipment panel closed (btn)');
        return true;
      }
      const eTotal = getOwned(state).length;
      if (inRect(mx, my, EQ_LAYOUT.btnPrev.x, EQ_LAYOUT.btnPrev.y, EQ_LAYOUT.btnPrev.w, EQ_LAYOUT.btnPrev.h)) {
        state.equip.sel = pageStart(flipPage(pageOf(state.equip.sel), -1, eTotal), eTotal);
        return true;
      }
      if (inRect(mx, my, EQ_LAYOUT.btnNext.x, EQ_LAYOUT.btnNext.y, EQ_LAYOUT.btnNext.w, EQ_LAYOUT.btnNext.h)) {
        state.equip.sel = pageStart(flipPage(pageOf(state.equip.sel), 1, eTotal), eTotal);
        return true;
      }
      return true;
    }
  }
  return false;
}

/** 构建 UiCtx (从 main.ts 调用) */
export function buildUiCtx(
  state: GameState,
  mx: number,
  my: number,
  callbacks: Omit<UiCtx, 'state' | 'w' | 'h' | 'mx' | 'my'>,
): UiCtx {
  return {
    ...callbacks,
    state,
    w: state.viewport.w,
    h: state.viewport.h,
    mx,
    my,
  };
}