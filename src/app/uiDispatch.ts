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
  startCreateNewgame: () => void;
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
      // TS-009: 设置齿轮入口 (与 drawTitle 命中 28×28 一致)
      if (inRect(mx, my, w - 50, h - 50, 28, 28)) { state.ui.settingsOpen = !state.ui.settingsOpen; return true; }
      // TS-003: 右侧最近存档卡片 (与 drawTitle 一致: cardX=w-380, cardY0=400, cardW=300, cardH=42, gap=6)
      const cards = hasSave
        ? [...state.charList].sort((a, b) => (b.last_played ?? 0) - (a.last_played ?? 0)).slice(0, 5)
        : [];
      for (let i = 0; i < cards.length; i++) {
        if (inRect(mx, my, w - 380, 400 + i * 48, 300, 42)) { ctx.enterTargetCharacter(state, cards[i]); return true; }
      }
      const menuY0 = h / 2 - 30;
      // 继续游戏大按钮 (480×46, 与 drawTitle 一致: contY = menuY0 - 35)
      if (hasSave && inRect(mx, my, cx - 240, menuY0 - 35, 480, 46)) {
        ctx.continueLastSave();
        return true;
      }
      // 设置面板键位条目 (P3-10)
      if (state.ui.settingsOpen && ctx.handleSettingsClick(mx, my)) return true;
      // 设置面板打开时: [Esc] 文字区域也可点击关闭 (drawSettingsPanel 在 y0+372 绘制)
      if (state.ui.settingsOpen) {
        const y0s = h / 2 - 130;
        const escR: [number, number, number, number] = [w / 2 - 80, y0s + 358, 160, 28];
        if (inRect(mx, my, ...escR)) { state.ui.settingsOpen = false; return true; }
        // 点击设置面板外部空白 → 关闭面板 (面板区 y0..y0+440)
        const panelR: [number, number, number, number] = [0, y0s, w, 440];
        if (!inRect(mx, my, ...panelR)) { state.ui.settingsOpen = false; return true; }
        return true;  // 设置面板打开时其他点击不穿透
      }
      // 菜单项 (与 drawTitle 一致: menuY0 + 52 / 104 / 156)
      const itemYs: Array<{ y: number; idx: number }> = hasSave
        ? [{ y: menuY0 + 52, idx: 1 }, { y: menuY0 + 104, idx: 2 }, { y: menuY0 + 156, idx: 3 }]
        : [{ y: menuY0, idx: 0 }, { y: menuY0 + 52, idx: 1 }, { y: menuY0 + 104, idx: 2 }];
      for (const it of itemYs) {
        if (inRect(mx, my, cx - btnW / 2, it.y - btnH / 2, btnW, btnH)) { ctx.titleAct(it.idx); return true; }
      }
      return true;
    }
    case 'town': {
      // 修复: 城镇右上角"返回首页"按钮 (避免玩家困在城镇, 命名与其他屏统一)
      if (inRect(mx, my, w - 180, 16, 160, 32)) {
        ctx.setScreen(state, 'title');
        return true;
      }
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
      // 修复: 城镇右上"返回首页"按钮 (避免玩家困在城镇, 命名与其他屏统一)
      if (inRect(mx, my, w - 180, 16, 160, 32)) {
        ctx.setScreen(state, 'title');
        return true;
      }
      // v3 NPC 点击
      for (const npc of townNpcs(state.townId, { w: state.viewport.w, h: state.viewport.h })) {
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
      // 设置面板打开时: [Esc] 文字区域 + 外部点击关闭
      if (state.ui.settingsOpen) {
        const y0s = h / 2 - 130;
        const escR: [number, number, number, number] = [w / 2 - 80, y0s + 358, 160, 28];
        if (inRect(mx, my, ...escR)) { state.ui.settingsOpen = false; return true; }
        const panelR: [number, number, number, number] = [0, y0s, w, 440];
        if (!inRect(mx, my, ...panelR)) { state.ui.settingsOpen = false; return true; }
        return true;
      }
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
      // ===== 创建模式 步骤 2: 职业区点击 → 返回步骤 1 (重新选职业, 放在命名框之前, 避免被命名框拦截) =====
      if (state.ngFrom === 'create' && !state.ui.classStep1) {
        if (inRect(mx, my, w / 2 - 200, (h / 2 + NG_LAYOUT.cy) - 60, 400, 90)) {
          state.ui.classStep1 = true;
          return true;
        }
      }
      // ===== 创建模式 步骤 1: 6 职业卡片横排命中 (与 drawNewgame 同步) =====
      if (state.ngFrom === 'create' && state.ui.classStep1) {
        const cyNg2 = h / 2 + NG_LAYOUT.cy;
        const cardW = 160, cardH = 220, cardGap = 14;
        const cardTotalW = CLASS_IDS.length * cardW + (CLASS_IDS.length - 1) * cardGap;
        const cardX0 = (w - cardTotalW) / 2;
        const cardY = cyNg2 - 50;
        for (let i = 0; i < CLASS_IDS.length; i++) {
          const cx2 = cardX0 + i * (cardW + cardGap);
          if (inRect(mx, my, cx2, cardY, cardW, cardH)) {
            state.ngSel.classIdx = i;
            playSfxClient('ui_click');
            return true;
          }
        }
      }
      // ===== 方案 G: 难度/主题/模式 横排命中 (与 drawNewgame 同步) =====
      const cyNg = h / 2 + NG_LAYOUT.cy;  // = 250
      // 难度 (cy+100, 居中 120px 间距, 5 个, 30 高) — 与 drawNewgame 同步
      {
        const diffSpacing = 120, diffY = cyNg + 100, diffH = 30;
        const diffX0 = (w - DIFFICULTIES.length * diffSpacing) / 2;
        for (let i = 0; i < DIFFICULTIES.length; i++) {
          if (inRect(mx, my, diffX0 + i * diffSpacing, diffY, diffSpacing, diffH)) {
            const d = DIFFICULTIES[i];
            if (unlockedDifficulty(state.cleared, d)) { state.ngSel.diffIdx = i; playSfxClient('ui_click'); }
            else pushToast(state, `${DIFFICULTY_MODS[d].name} 未解锁 (通关前置)`, '#f66');
            return true;
          }
        }
      }
      // 主题 (cy+160, 居中 140px 间距, 4 个, 30 高)
      {
        const themeSpacing = 140, themeY = cyNg + 160, themeH = 30;
        const themeX0 = (w - THEMES.length * themeSpacing) / 2;
        for (let i = 0; i < THEMES.length; i++) {
          if (inRect(mx, my, themeX0 + i * themeSpacing, themeY, themeSpacing, themeH)) {
            if (themeUnlocked(state.cleared, THEMES[i])) { state.ngSel.themeIdx = i; playSfxClient('ui_click'); }
            else pushToast(state, `主题 ${THEMES[i]} 未解锁 (通关森林后开放)`, '#f66');
            return true;
          }
        }
      }
      // 模式 (cy+220, 居中 160px 间距, 3 个, 30 高)
      {
        const modeSpacing = 160, modeY = cyNg + 220, modeH = 30;
        const modeX0 = (w - MAP_MODES.length * modeSpacing) / 2;
        for (let i = 0; i < MAP_MODES.length; i++) {
          if (inRect(mx, my, modeX0 + i * modeSpacing, modeY, modeSpacing, modeH)) {
            state.ngSel.modeIdx = i;
            playSfxClient('ui_click');
            return true;
          }
        }
      }
      // 出发/开始按钮 (居中 360×56, h-130) — 与 drawNewgame 同步
      if (inRect(mx, my, w / 2 - 180, h - 130, 360, 56)) {
        ctx.startFromNewgame();
        return true;
      }
      // 返回主菜单 (左上角按钮, 与 characters/town/settings 一致)
      if (inRect(mx, my, 20, 20, 200, 40)) {
        ctx.setScreen(state, 'title');
        state.ui.titleMsg = '';
        setNgNaming(false);
        return true;
      }
      return true;
    }
    case 'characters': {
      const cx = w / 2;
      // 左上 "返回首页" 按钮 (与 drawCharacters 同步: 20, 20, 160, 40)
      if (inRect(mx, my, 20, 20, 160, 40)) {
        ctx.setScreen(state, 'title');
        return true;
      }
      // C (P1-4): 收集总览关闭
      if (state.ui.collectOpen) {
        if (inRect(mx, my, w / 2 - 90, h - 84, 180, 40)) { state.ui.collectOpen = false; return true; }
        return true;
      }
      if (inRect(mx, my, w - 180, 20, 160, 30)) { state.ui.collectOpen = !state.ui.collectOpen; return true; }
      if (state.charConfirmDel) {
        // 删除确认对话框: 确认 (dlgX+40, dlgY+130, 180, 44) / 取消 (dlgX+260, dlgY+130, 180, 44)
        // dlgW=480, dlgH=200, dlgX=cx-240, dlgY=h/2-100
        const dlgX = cx - 240, dlgY = h / 2 - 100;
        if (inRect(mx, my, dlgX + 40, dlgY + 130, 180, 44)) {
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
        if (inRect(mx, my, dlgX + 260, dlgY + 130, 180, 44)) { state.charConfirmDel = false; return true; }
        return true;
      }
      // 0 角色时中央"新建第一个角色"大按钮 (cx-200, h/2-30, 400, 60)
      if (state.charList.length === 0 && inRect(mx, my, cx - 200, h / 2 - 30, 400, 60)) {
        ctx.startCreateNewgame(); return true;
      }
      // 角色列表大卡片 (listX, listY0+i*(rowH+rowGap), listW, rowH) — 与 drawCharacters 同步
      const listX = cx - 300, listW = 600, listY0 = 110, rowH = 56, rowGap = 6;
      const rows = Math.min(state.charList.length, 9);
      for (let i = 0; i < rows; i++) {
        if (inRect(mx, my, listX, listY0 + i * (rowH + rowGap), listW, rowH)) { state.charSel = i; return true; }
      }
      // 底部 3 按钮 (与 drawCharacters 同步)
      // 进入(Enter)/切换(↑↓) (cx-320, h-60, 380, 40)
      if (state.charList.length > 0 && inRect(mx, my, cx - 320, h - 60, 380, 40)) {
        const target = state.charList[state.charSel];
        if (target) ctx.enterTargetCharacter(state, target);
        return true;
      }
      // 新建 (cx+80, h-60, 100, 40)
      if (inRect(mx, my, cx + 80, h - 60, 100, 40)) {
        ctx.startCreateNewgame(); return true;
      }
      // 删除 (cx+200, h-60, 100, 40), 0 角色禁用
      if (state.charList.length > 0 && inRect(mx, my, cx + 200, h - 60, 100, 40)) {
        state.charConfirmDel = true;
        return true;
      }
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