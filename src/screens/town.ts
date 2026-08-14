// screens/town.ts — 城镇屏 (town 模式 + 子面板) 完整拆分 (US-026 伴随 T1c)
//
// 拆分动机: main.ts 953-1376 共 424 行城镇相关逻辑 (进入/交互/按键/绘制) 全部在本屏;
//   整体依赖 town game 模块 + 少许 app/main.ts 闭包 (requestDifficulty) —— 通过 ctx 注入
//
// 设计选择 (与 screens/teleport/close/newgame 一致):
// - 5 个函数原样搬移, 仅闭包引用 → ctx 字段 (零行为变更)
// - requestDifficulty 是 main.ts 私有 (line 2603), 由 ctx 注入
// - canvas.style.cursor 也在 main.ts (canvas 引用), 由 ctx 注入
// - drawTownPanel 调用 drawTownFrame 的子面板, 这里抽成参数回调 (避免自引用)
//
// 依赖: game/town + game/equipment + game/skill + game/passive + game/state (setScreen)
//       + game/equipment (clearGroundLoot/addMaterial) + util/log + ipc/sfx + render/*
//       + game/toast (pushToast)

import type { GameState } from '../game/state';
import { setScreen, THEMES, pickPlayerSprite } from '../game/state';
import {
  TOWN_DEFS, townNpcs, nearestNpc, genMerchantStock, genMysteryStock,
  buyItem, sellItem, rerollOwned, buyPotion, POTION_PRICES,
  warehouseStore, warehouseTake, WAREHOUSE_CAP, unlockedTowns,
  runeForgePay, type TownId,
} from '../game/town';
import {
  RARITY_COLORS, describeAffix, getItemSellPrice, getOwned,
  clearGroundLoot, addMaterial, materialCount, IRON_SHARD_PRICE, RUNE_FORGE_COST,
} from '../game/equipment';
import { DIFFICULTIES, DIFFICULTY_MODS, cycleDifficultyGated, type Difficulty } from '../game/difficulty';
import { MAP_MODES } from '../game/mapmode';
import { drawSprite } from '../render/draw';
import { drawIcon } from '../render/hud';
import { pushToast } from '../game/toast';
import { playSfxClient } from '../ipc/sfx';
import { inf, wrn } from '../util/log';
import { SKILL_SLOTS, skillRune, slotDisplay, pickRuneOptions } from '../game/skill';
import { RUNE_DEFS } from '../game/rune';
import { PASSIVE_DEFS, PASSIVE_IDS, passiveLevel, assignPassivePoint } from '../game/passive';
import { endRogue } from '../game/rogue';
import { inRect } from '../game/uigrid';
import { CLASS_IDS } from '../game/class';
import type { MouseHandle } from '../input/mouse';
import type { RenderResources } from '../render/resources';
import type { QuadResources } from '../render/gl/resources';

// ============================================================================
// Ctx: 注入 main.ts 闭包依赖
// ============================================================================

export interface TownCtx {
  state: GameState;
  hudCtx: CanvasRenderingContext2D;
  hudCanvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  quad: QuadResources;
  res: RenderResources;
  mouse: MouseHandle;
  canvas: HTMLCanvasElement;
  /** main.ts line 2603: 难度切换入口 (含未解锁拒绝 + 硬核二段确认) */
  requestDifficulty: (state: GameState, d: Difficulty) => void;
  /** drawTownPanel 回调 (C-403 符文锻造选完 → 触发三选一在外层) — 当前 main.ts 自身递归调用, 留接口 */
  drawTownPanel?: (ctx: TownCtx) => void;
}

// ============================================================================
// 行为函数 (无绘制)
// ============================================================================

/** 城镇: 进入 (C-301: 指定镇; 省略时用最近城镇; townReturn 保留地下城还原坐标) */
export function enterTown(ctx: TownCtx, townId?: TownId): void {
  const state = ctx.state;
  // A-W5 肉鸽: 回城统一还原局内临时练级 (持久等级/经验/技能点/技能等级), 战利品保留
  endRogue(state);
  const tid = townId && TOWN_DEFS[townId] ? townId : (TOWN_DEFS[state.townId] ? state.townId : 'greenwing');
  state.townId = tid;
  state.townWalk = null;  // v3 鼠标化: 进/换城镇清走向目标
  if (!state.townReturn) state.townReturn = { x: state.player.pos.x, y: state.player.pos.y };
  clearGroundLoot(state);  // M5 实测修复: 回城清理地上物品
  state.mode = 'town';
  setScreen(state, 'town');
  state.townPanel = null;
  state.townStock = null;
  state.mysteryStock = null;
  state.teleportTo = null;
  state.teleportT = 0;
  state.player.pos = {
    x: (state.viewport.w - state.player.size.w) / 2,
    y: state.viewport.h * 0.7 - state.player.size.h / 2,
  };
}

/** 城镇: E 交互 */
export function interactTown(ctx: TownCtx): void {
  const state = ctx.state;
  const npc = nearestNpc(state, state.townId);
  if (!npc) { wrn('ui', '没有可交互的 NPC (靠近一点)'); return; }
  switch (npc.kind) {
    case 'merchant':
      state.townStock = genMerchantStock();
      state.townPanel = 'merchant';
      inf('ui', '商人: 1-5 购买, 6 卖出, Esc 离开');
      break;
    case 'smith':
      state.townPanel = 'smith';
      inf('ui', '重铸师: 1-9 选择装备重铸 (100金), Esc 离开');
      break;
    case 'warehouse':
      state.townPanel = 'warehouse';
      inf('ui', `仓库 (${state.warehouse.length}/${WAREHOUSE_CAP}): 1-9 取回, S 存入, Esc 离开`);
      break;
    case 'difficulty':
      ctx.requestDifficulty(state, cycleDifficultyGated(state.difficulty, state.cleared));
      inf('ui', `难度 → ${DIFFICULTY_MODS[state.difficulty].name}`);
      break;
    case 'mystery':
      state.mysteryStock = genMysteryStock();
      state.townPanel = 'mystery';
      inf('ui', '神秘商人: 1-4 购买传奇 (500-2000金), Esc 离开');
      break;
    case 'trainer':
      state.townPanel = 'trainer';
      inf('ui', '训练师: 1-0 选择被动技能, Enter 升级 (1 技能点/级), Esc 离开');
      break;
    case 'teleport': {
      const targets = unlockedTowns(state.cleared).filter(t => t !== state.townId);
      if (targets.length === 0) { pushToast(state, '暂无可传送的城镇', '#f88'); break; }
      state.townPanel = 'teleport';
      inf('ui', '传送师: 1-9 选择目标城镇, Esc 离开');
      break;
    }
    case 'forge': {
      state.townPanel = 'forge';
      inf('ui', '符文锻造师: 1-6 选择已变异技能重铸符文 (5奥术+1虚空), Esc 离开');
      break;
    }
    case 'exit': {
      // MM-UG1: 城镇传送门 → 新独立 expedition 屏 (主题+模式+难度); 角色身份复用
      state.townPanel = null;
      state.ngFrom = 'town';
      state.ngSel = {
        classIdx: CLASS_IDS.indexOf(state.player.classId),
        diffIdx: DIFFICULTIES.indexOf(state.difficulty),
        themeIdx: THEMES.indexOf(state.theme),
        modeIdx: MAP_MODES.indexOf(state.run.mode ?? 'linear'),
      };
      setScreen(state, 'expedition');
      inf('ui', '出发 → 远征屏 (主题/模式/难度配置)');
      break;
    }
  }
}

/** 城镇面板按键 (1-5 买 / 6 卖 / 1-9 卖选 / 1-9 重铸选 / B 返回 / Esc 关) */
export function handleTownPanelKey(ctx: TownCtx, e: KeyboardEvent, k: string): void {
  const state = ctx.state;
  if (k === 'escape' || k === 'b') { state.townPanel = null; state.townStock = null; return; }
  const n = parseInt(k, 10);
  if (state.townPanel === 'merchant' && state.townStock) {
    if (n >= 1 && n <= 5) {
      const st = state.townStock[n - 1];
      if (buyItem(state, st)) { playSfxClient('ui_click'); inf('ui', `购入 ${st.item.name}`); }
      else wrn('ui', '金币不足或背包已满');
      return;
    }
    if (n === 6) { state.townPanel = 'sell'; inf('ui', '卖出: 1-9 选择装备 (半价)'); return; }
    if (k === '7' || k === '8') {
      const kind = k === '7' ? 'hp' : 'mp';
      if (buyPotion(state, kind)) { playSfxClient('ui_click'); inf('ui', `购入 ${kind === 'hp' ? 'HP' : 'MP'} 药水`); }
      else wrn('ui', '药水购买失败 (金币不足或已满 3)');
      return;
    }
    if (k === '9') {
      // C-401 灵铁可购 (材料独立计数不占背包)
      if (state.player.gold < IRON_SHARD_PRICE) { wrn('ui', `灵铁 ${IRON_SHARD_PRICE}金, 金币不足`); return; }
      state.player.gold -= IRON_SHARD_PRICE;
      addMaterial(state.equip, 'iron_shard', 1);
      playSfxClient('ui_click');
      inf('ui', '购入 灵铁碎片 ×1');
      return;
    }
    return;
  }
  if (state.townPanel === 'sell') {
    const price = sellItem(state, n - 1);
    if (price > 0) inf('ui', `卖出 +${price}金`);
    return;
  }
  if (state.townPanel === 'smith') {
    const res = rerollOwned(state, n - 1);
    if (res === 'gold') inf('ui', '重铸完成 (100金)');
    else if (res === 'iron') inf('ui', '重铸完成 (灵铁)');
    else wrn('ui', '重铸失败 (金币/灵铁不足或选择无效)');
    return;
  }
  if (state.townPanel === 'warehouse' || state.townPanel === 'warehouseTake') {
    if (k === 's') { state.townPanel = 'warehouseTake'; inf('ui', '存入: 1-9 选择背包装备, Esc 返回'); return; }
    if (k === 'b') { state.townPanel = 'warehouse'; return; }
    if (state.townPanel === 'warehouse' && n >= 1 && n <= 9) {
      if (warehouseTake(state, n - 1)) { playSfxClient('ui_click'); state.whFlash = 0.3; inf('ui', '取回仓库装备'); }
      else wrn('ui', '取回失败 (背包满或选择无效)');
      return;
    }
    if (state.townPanel === 'warehouseTake' && n >= 1 && n <= 9) {
      if (warehouseStore(state, n - 1)) { playSfxClient('ui_click'); state.whFlash = 0.3; inf('ui', '存入仓库'); }
      else wrn('ui', '存入失败 (仓库满或选择无效)');
      return;
    }
    return;
  }
  if (state.townPanel === 'mystery' && state.mysteryStock) {
    if (n >= 1 && n <= 4) {
      const st = state.mysteryStock[n - 1];
      if (buyItem(state, st)) { playSfxClient('ui_click'); inf('ui', `购入传奇 ${st.item.name}`); }
      else wrn('ui', '金币不足或背包已满');
    }
    return;
  }
  if (state.townPanel === 'teleport') {
    const targets = unlockedTowns(state.cleared).filter(t => t !== state.townId);
    const t = targets[n - 1];
    if (t && n >= 1 && n <= targets.length) {
      // C-302: 1s 过场 (黑屏 + 文字) → 到达
      state.teleportTo = t;
      state.teleportT = 1.0;
      state.townPanel = null;
      inf('ui', `传送 → ${TOWN_DEFS[t].name} (1s 过场)`);
    }
    return;
  }
  if (state.townPanel === 'forge') {
    // C-403: 选已变异技能槽 → 扣材料 → 触发符文三选一 (复用 runeChoice)
    // C-403: 选已变异技能槽 → 扣材料 → 触发符文三选一 (复用 runeChoice)
    const mutated = SKILL_SLOTS.filter(slot => skillRune(slot));
    const slot = mutated[n - 1];
    if (slot && n >= 1 && n <= mutated.length) {
      if (materialCount(state.equip, 'arcane_core') < RUNE_FORGE_COST.arcane_core) {
        pushToast(state, '奥术核心不足 (需要 5)', '#f66');
        return;
      }
      if (materialCount(state.equip, 'void_fragment') < RUNE_FORGE_COST.void_fragment) {
        pushToast(state, '虚空碎片不足 (需要 1)', '#f66');
        return;
      }
      if (runeForgePay(state)) {
        state.townPanel = null;
        // 打开三选一 (Esc 拒绝 = 保留原符文; 材料已扣)
        state.equip.runeChoice = { slot, options: pickRuneOptions(slot) };
        pushToast(state, `符文锻造: ${slotDisplay(slot)} 重新变异`, '#c9aaff');
        playSfxClient('ui_click');
        inf('ui', `符文锻造 ${slot} → 三选一`);
      } else {
        pushToast(state, '材料不足', '#f66');
      }
    }
    return;
  }
  if (state.townPanel === 'trainer') {
    // 被动技能树: 1-9,0 选 / ↑↓ 移动 / Enter·空格 升级 (1 技能点/级)
    if (k === 'arrowup' || k === 'w') { state.trainerSel = Math.max(0, state.trainerSel - 1); return; }
    if (k === 'arrowdown' || k === 's') { state.trainerSel = Math.min(PASSIVE_IDS.length - 1, state.trainerSel + 1); return; }
    if (n >= 1 && n <= 10) { state.trainerSel = n - 1; return; }
    if (k === 'enter' || k === ' ') {
      const id = PASSIVE_IDS[state.trainerSel];
      if (!id) return;
      const errMsg = assignPassivePoint(state, id);
      if (errMsg) { pushToast(state, errMsg, '#f66'); wrn('ui', `trainer ${id}: ${errMsg}`); }
      else { playSfxClient('ui_click'); inf('ui', `被动 ${PASSIVE_DEFS[id].name} → Lv ${passiveLevel(state, id)}`); }
      return;
    }
    return;
  }
}

// ============================================================================
// 绘制
// ============================================================================

/** 城镇绘制: 背景/NPC/玩家/提示/面板 */
export function drawTownFrame(ctx: TownCtx): void {
  const { state, hudCtx, hudCanvas, gl, quad, res, mouse, canvas } = ctx;
  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
  const townColor = TOWN_DEFS[state.townId]?.color ?? TOWN_DEFS.greenwing.color;
  const [cr, cg, cb] = townColor.split(',').map(s => parseFloat(s.trim()));
  gl.clearColor(cr, cg, cb, 1);   // C-302 城镇底色按镇 (GL 层, 勿画进 canvas 否则盖住角色)
  gl.clear(gl.COLOR_BUFFER_BIT);
  // 玩家 sprite 预计算 (含朝向)
  const tSprite = pickPlayerSprite(state, mouse.state().pos.x);
  // 渲染层: 玩家 + NPC 混合按 painter's 算法 (脚底 y 升序) — 玩家走到 NPC 脚下时
  // 玩家正确显示在 NPC 前面, 走到 NPC 头顶时正确被 NPC 遮挡 (修: 角色在 NPC 下方时被遮挡)
  type TownSprite = { depth: number; draw: () => void };
  const townSprites: TownSprite[] = [
    {
      // 玩家脚底 = pos.y + size.h (top-left 坐标)
      depth: state.player.pos.y + state.player.size.h,
      draw: () => drawSprite(gl, quad, res, state.player.pos, state.player.size, 'characters', tSprite.name, { flip: { x: tSprite.flipX ? -1 : 1, y: 1 }, rot: tSprite.rot }),
    },
  ];
  // NPC (C-301: 按当前镇布局 + viewport 缩放) — npcs 图集 sprite; 祭坛结构物用 ui 光环; 传送阵铺脚下
  const npcs = townNpcs(state.townId, { w: hudCanvas.width, h: hudCanvas.height });
  const nearKind = nearestNpc(state, state.townId)?.kind ?? null;
  for (const npc of npcs) {
    const near = nearKind === npc.kind;
    if (npc.kind === 'difficulty') {
      // 挑战祭坛 (结构物): 脉冲光环 — 脚底近似 npc.pos.y + 26
      townSprites.push({
        depth: npc.pos.y + 26,
        draw: () => {
          const pulse = 0.75 + 0.25 * Math.sin((performance.now() / 1000) * 3 + npc.pos.x * 0.01);
          drawSprite(gl, quad, res, { x: npc.pos.x - 26 * pulse, y: npc.pos.y - 26 * pulse }, { w: 52 * pulse, h: 52 * pulse }, 'ui', 'slide_horizontal_color', { color: near ? [1, 0.85, 0.35] : [0.85, 0.4, 1], blend: 'add' });
        },
      });
    } else if (npc.kind === 'exit') {
      // 出城传送阵: 地面贴图铺脚下 — 脚底 npc.pos.y + 44
      townSprites.push({
        depth: npc.pos.y + 44,
        draw: () => drawSprite(gl, quad, res, { x: npc.pos.x - 44, y: npc.pos.y - 44 }, { w: 88, h: 88 }, 'npcs', 'portal_array'),
      });
    } else {
      // 角色 NPC: 脚下光环 (交互提示) + 站桩 — 脚底 = npc.pos.y - 32 + 56 = npc.pos.y + 24
      townSprites.push({
        depth: npc.pos.y + 24,
        draw: () => {
          drawSprite(gl, quad, res, { x: npc.pos.x - 16, y: npc.pos.y + 18 }, { w: 32, h: 6 }, 'ui', 'slide_horizontal_color', { color: near ? [0.5, 1, 0.8] : [0.35, 0.55, 0.6] });
          drawSprite(gl, quad, res, { x: npc.pos.x - 28, y: npc.pos.y - 32 }, { w: 56, h: 56 }, 'npcs', npc.sprite);
        },
      });
    }
  }
  // 脚底 y 升序: 在前的画早 (画家算法)
  townSprites.sort((a, b) => a.depth - b.depth);
  for (const s of townSprites) s.draw();
  // 城镇标题 (HUD 层, 永远在 sprite 之上)
  hudCtx.textAlign = 'center';
  hudCtx.fillStyle = '#9aa';
  hudCtx.font = 'bold 26px monospace';
  hudCtx.fillText(TOWN_DEFS[state.townId]?.name ?? '城镇', hudCanvas.width / 2, 26);
  hudCtx.fillStyle = '#889';
  hudCtx.font = '12px monospace';
  hudCtx.fillText('WASD 移动 · 靠近 NPC 按 E 交互 · [1-5]买 [6]卖 [1-9]重铸/仓储 · Esc 暂停', hudCanvas.width / 2, 62);
  // NPC 名字/提示 (HUD 层, 永远在 sprite 之上)
  for (const npc of npcs) {
    hudCtx.fillStyle = '#fff';
    hudCtx.font = 'bold 14px monospace';
    hudCtx.fillText(npc.name, npc.pos.x, npc.pos.y - 40);
    hudCtx.fillStyle = '#8aa';
    hudCtx.font = '11px monospace';
    hudCtx.fillText(npc.hint, npc.pos.x, npc.pos.y + 48);
  }
  // 交互提示 (UI-FIX3: 从 npc.pos.y+14 改为 npc.pos.y-55, 避开脚底光环)
  const npc = nearestNpc(state, state.townId);
  if (npc) {
    hudCtx.fillStyle = '#ffd64a';
    hudCtx.font = 'bold 14px monospace';
    hudCtx.fillText(`E — ${npc.name}`, npc.pos.x, npc.pos.y - 55);
  }
  // HUD (金/技能点) — 右上角
  hudCtx.textAlign = 'right';
  hudCtx.fillStyle = '#ffd64a';
  hudCtx.font = 'bold 14px monospace';
  hudCtx.fillText(`金: ${state.player.gold}`, hudCanvas.width - 16, 26);
  hudCtx.fillStyle = '#9cc';
  hudCtx.font = '12px monospace';
  hudCtx.fillText(`难度: ${DIFFICULTY_MODS[state.difficulty].name}`, hudCanvas.width - 16, 44);
  // 面板
  if (state.townPanel) {
    const drawPanel = ctx.drawTownPanel ?? drawTownPanel;
    drawPanel(ctx);
    // v3 鼠标化: 行 hover 高亮 (与点击命中同几何: y0=104, 行高 24)
    const pm = mouse.state().pos;
    if (pm.x > 40 && (pm.y - 104) >= 0) {
      const r = Math.floor((pm.y - 104) / 24);
      if (r < 12) {
        hudCtx.fillStyle = 'rgba(255,255,255,0.08)';
        hudCtx.fillRect(40, 104 + r * 24, hudCanvas.width - 80, 24);
      }
    }
  }
  if (state.whFlash > 0) state.whFlash = Math.max(0, state.whFlash - 1 / 60);
  // v3: NPC 圈 hover → pointer (走向/交互提示)
  const tmx = mouse.state().pos;
  const onNpc = npcs.some(n => inRect(tmx.x, tmx.y, n.pos.x - 30, n.pos.y - 30, 60, 60));
  // 修复: 城镇左上角"返回主菜单"按钮 (玩家无法 Esc 跨过 town → title)
  const backR: [number, number, number, number] = [16, 16, 160, 32];
  const backHit = inRect(tmx.x, tmx.y, ...backR);
  hudCtx.fillStyle = backHit ? 'rgba(255,214,74,0.18)' : 'rgba(20,20,28,0.85)';
  hudCtx.fillRect(...backR);
  hudCtx.strokeStyle = backHit ? '#ffd64a' : '#3a3a48';
  hudCtx.lineWidth = backHit ? 2 : 1;
  hudCtx.strokeRect(...backR);
  hudCtx.fillStyle = backHit ? '#fff' : '#9aa';
  hudCtx.textAlign = 'center';
  hudCtx.textBaseline = 'middle';
  hudCtx.font = 'bold 13px monospace';
  hudCtx.fillText('返回主菜单(Esc)', 96, 32);
  hudCtx.textAlign = 'left';
  hudCtx.textBaseline = 'top';
  canvas.style.cursor = (onNpc || backHit) ? 'pointer' : 'default';
  mouse.reset();
}

/** 城镇面板内容 */
export function drawTownPanel(ctx: TownCtx): void {
  const { state, hudCtx, hudCanvas, res } = ctx;
  hudCtx.fillStyle = 'rgba(6,6,12,0.92)';
  hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
  hudCtx.textAlign = 'left';
  let y = 70;
  hudCtx.fillStyle = '#ffd';
  hudCtx.font = 'bold 20px monospace';
  if (state.townPanel === 'merchant') {
    hudCtx.fillText(`商人 (金:${state.player.gold})  [1-5] 购买  [6] 卖出  [7/8] 药水  [Esc] 离开`, 40, y); y += 34;
    const st = state.townStock ?? [];
    st.forEach((s, i) => {
      const col = RARITY_COLORS[s.item.rarity];
      hudCtx.fillStyle = `rgb(${col.map(c => Math.round(c * 255)).join(',')})`;
      hudCtx.font = '14px monospace';
      hudCtx.fillText(`${i + 1}. ${s.item.name} (${s.price}金)`, 60, y); y += 24;
      hudCtx.fillStyle = '#bbb';
      hudCtx.fillText(`    ${s.item.affixes.map(describeAffix).join(' · ')}`, 60, y); y += 24;
    });
    // 药水 (OPT-028): 7=HP 8=MP
    hudCtx.fillStyle = '#f88';
    drawIcon(hudCtx, res, 'potion_hp', 34, y - 18, 20);
    hudCtx.fillText(`7. HP 药水 (${POTION_PRICES.hp}金) ×${state.player.potions?.hp ?? 0}/3`, 60, y); y += 22;
    hudCtx.fillStyle = '#88f';
    drawIcon(hudCtx, res, 'potion_mp', 34, y - 18, 20);
    hudCtx.fillText(`8. MP 药水 (${POTION_PRICES.mp}金) ×${state.player.potions?.mp ?? 0}/3`, 60, y); y += 22;
    hudCtx.fillStyle = '#9cf';
    drawIcon(hudCtx, res, 'mat_iron_shard', 34, y - 18, 20);
    hudCtx.fillText(`9. 灵铁碎片 (${IRON_SHARD_PRICE}金) ×${materialCount(state.equip, 'iron_shard')}`, 60, y); y += 22;
  } else if (state.townPanel === 'sell') {
    hudCtx.fillText(`卖出 (金:${state.player.gold})  [1-9] 选择  [Esc] 返回`, 40, y); y += 34;
    const owned = getOwned(state);
    owned.forEach((eq, i) => {
      if (i > 8) return;
      const col = RARITY_COLORS[eq.rarity];
      hudCtx.fillStyle = `rgb(${col.map(c => Math.round(c * 255)).join(',')})`;
      hudCtx.font = '14px monospace';
      hudCtx.fillText(`${i + 1}. ${eq.name} (+${getItemSellPrice(eq.rarity, eq.affixes.length)}金)`, 60, y); y += 24;
    });
  } else if (state.townPanel === 'smith') {
    drawIcon(hudCtx, res, 'mat_iron_shard', 14, y - 17, 20);
    hudCtx.fillText(`重铸师 (金:${state.player.gold} · 灵铁:${materialCount(state.equip, 'iron_shard')})  [1-9] 选择  [Esc] 离开`, 40, y); y += 34;
    hudCtx.fillStyle = '#889';
    hudCtx.font = '12px monospace';
    hudCtx.fillText('消耗: 100金 或 灵铁 (rare 10 / set 20 / unique 40)', 40, y); y += 24;
    const owned = getOwned(state);
    owned.forEach((eq, i) => {
      if (i > 8) return;
      const col = RARITY_COLORS[eq.rarity];
      hudCtx.fillStyle = `rgb(${col.map(c => Math.round(c * 255)).join(',')})`;
      hudCtx.font = '14px monospace';
      hudCtx.fillText(`${i + 1}. ${eq.name} — ${eq.affixes.map(describeAffix).join(' · ')}`, 60, y); y += 24;
    });
  } else if (state.townPanel === 'warehouse' || state.townPanel === 'warehouseTake') {
    const taking = state.townPanel === 'warehouse';
    hudCtx.fillStyle = '#9cf';
    hudCtx.fillText(
      taking
        ? `仓库 (${state.warehouse.length}/${WAREHOUSE_CAP})  [1-9] 取回  [S] 存入  [Esc] 离开`
        : `存入 (背包 ${getOwned(state).length}/20)  [1-9] 选择  [B] 返回仓库`,
      40, y);
    // C-503 动画: 存取成功后边框闪光
    if (state.whFlash > 0) {
      hudCtx.strokeStyle = `rgba(120, 255, 180, ${Math.min(1, state.whFlash * 3)})`;
      hudCtx.lineWidth = 4;
      hudCtx.strokeRect(4, 4, hudCanvas.width - 8, hudCanvas.height - 8);
    }
    y += 34;
    const list = taking ? state.warehouse : getOwned(state);
    list.forEach((eq, i) => {
      if (i > 8) return;
      const col = RARITY_COLORS[eq.rarity];
      hudCtx.fillStyle = `rgb(${col.map(c => Math.round(c * 255)).join(',')})`;
      hudCtx.font = '14px monospace';
      hudCtx.fillText(`${i + 1}. ${eq.name} — ${eq.affixes.map(describeAffix).join(' · ')}`, 60, y); y += 24;
    });
  } else if (state.townPanel === 'mystery') {
    hudCtx.fillText(`神秘商人 (金:${state.player.gold})  [1-4] 购买  [Esc] 离开`, 40, y); y += 34;
    const st = state.mysteryStock ?? [];
    st.forEach((s, i) => {
      const col = RARITY_COLORS[s.item.rarity];
      hudCtx.fillStyle = `rgb(${col.map(c => Math.round(c * 255)).join(',')})`;
      hudCtx.font = '14px monospace';
      hudCtx.fillText(`${i + 1}. ${s.item.name} (${s.price}金)`, 60, y); y += 24;
      hudCtx.fillStyle = '#bbb';
      hudCtx.fillText(`    ${s.item.affixes.map(describeAffix).join(' · ')}`, 60, y); y += 24;
    });
  } else if (state.townPanel === 'teleport') {
    hudCtx.fillText('传送师 — 选择目标城镇 [1-9]  [Esc] 离开', 40, y); y += 34;
    const targets = unlockedTowns(state.cleared).filter(t => t !== state.townId);
    targets.forEach((t, i) => {
      hudCtx.fillStyle = '#cfe8ff';
      hudCtx.font = 'bold 16px monospace';
      hudCtx.fillText(`${i + 1}. ${TOWN_DEFS[t].name}`, 60, y); y += 26;
      hudCtx.fillStyle = '#889';
      hudCtx.font = '12px monospace';
      hudCtx.fillText(`   ${TOWN_DEFS[t].requires.length === 0 ? '初始城镇' : `解锁: 通关 ${TOWN_DEFS[t].requires.join(' + ')}`}`, 60, y); y += 26;
    });
  } else if (state.townPanel === 'forge') {
    hudCtx.fillText(`符文锻造师  消耗: 奥术核心×${RUNE_FORGE_COST.arcane_core} + 虚空碎片×${RUNE_FORGE_COST.void_fragment}`, 40, y); y += 34;
    hudCtx.fillStyle = '#889';
    hudCtx.font = '12px monospace';
    drawIcon(hudCtx, res, 'mat_arcane_core', 14, y - 17, 20);
    hudCtx.fillText(`持有: 奥术核心 ${materialCount(state.equip, 'arcane_core')} · `, 40, y);
    const arcW = hudCtx.measureText(`持有: 奥术核心 ${materialCount(state.equip, 'arcane_core')} · `).width;
    drawIcon(hudCtx, res, 'mat_void_fragment', 40 + arcW - 3, y - 17, 20);
    hudCtx.fillText(`虚空碎片 ${materialCount(state.equip, 'void_fragment')}`, 40 + arcW + 19, y); y += 24;
    const mutated = SKILL_SLOTS.filter(slot => skillRune(slot));
    if (mutated.length === 0) {
      hudCtx.fillStyle = '#f88';
      hudCtx.font = 'bold 15px monospace';
      hudCtx.fillText('先升级技能到 10 级获取符文变异', 40, y); y += 26;
    } else {
      mutated.forEach((slot, i) => {
        const r = skillRune(slot);
        hudCtx.fillStyle = '#c9aaff';
        hudCtx.font = 'bold 15px monospace';
        hudCtx.fillText(`${i + 1}. ${slotDisplay(slot)} — ${r ? RUNE_DEFS[r].name : ''}`, 60, y); y += 26;
        hudCtx.fillStyle = '#8a8a96';
        hudCtx.font = '12px monospace';
        hudCtx.fillText(`   ${r ? RUNE_DEFS[r].desc : ''}`, 60, y); y += 26;
      });
    }
  } else if (state.townPanel === 'trainer') {
    hudCtx.fillText(`训练师 (技能点:${state.player.skillPoints})  [1-9,0] 选 · [Enter] 升级  [Esc] 离开`, 40, y); y += 34;
    hudCtx.fillStyle = '#889';
    hudCtx.font = '12px monospace';
    hudCtx.fillText('被动技能树 — 10 槽同时生效, 每级 1 技能点 (最多 20 级)', 40, y); y += 24;
    PASSIVE_IDS.forEach((id, i) => {
      const def = PASSIVE_DEFS[id];
      const lv = passiveLevel(state, id);
      const sel = i === state.trainerSel;
      hudCtx.fillStyle = sel ? '#ffd64a' : '#ccc';
      hudCtx.font = 'bold 14px monospace';
      hudCtx.fillText(`${i + 1}. ${def.name}  Lv ${lv}${lv >= def.maxLevel ? ' (满)' : ''}  ${sel ? '◀' : ''}`, 60, y); y += 22;
      hudCtx.fillStyle = sel ? '#fda' : '#889';
      hudCtx.font = '12px monospace';
      hudCtx.fillText(`   ${def.desc} · ${def.perLv}`, 60, y); y += 22;
    });
  }
  hudCtx.fillStyle = '#fff';
}
