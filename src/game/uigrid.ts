// UI 网格纯函数 (C-502/C-501 基建): 分页/选格/面板布局常量
// 纯数字模块, 供 draw(hud) 与 hit-test(main) 共用, 防几何漂移

export const GRID_COLS = 10;
export const GRID_ROWS = 10;
export const GRID_PAGE_SIZE = GRID_COLS * GRID_ROWS; // 100 (10×10)

/** 总数 → 页数 (空时 1 页) */
export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / GRID_PAGE_SIZE));
}

/** 全局索引 → 所在页 */
export function pageOf(index: number): number {
  return Math.max(0, Math.floor(index / GRID_PAGE_SIZE));
}

/** 页内 (col,row) → 全局索引; 越界(含负)或 >= total 返回 null */
export function cellIndex(col: number, row: number, page: number, total: number): number | null {
  if (col < 0 || row < 0 || page < 0 || col >= GRID_COLS || row >= GRID_ROWS) return null;
  const idx = page * GRID_PAGE_SIZE + row * GRID_COLS + col;
  return idx < total ? idx : null;
}

export type GridDir = 'up' | 'down' | 'left' | 'right';

/** 方向键移动选中: 页内移动, 边界 clamp (不跨页) */
export function moveGridSel(sel: number, dir: GridDir, total: number): number {
  if (total <= 0) return 0;
  const s = Math.max(0, sel); // 负数 (无选中) → 视作 0
  const col = s % GRID_COLS;
  const row = Math.floor(s / GRID_COLS);
  let nc = col;
  let nr = row;
  if (dir === 'left') nc = Math.max(0, col - 1);
  else if (dir === 'right') nc = Math.min(GRID_COLS - 1, col + 1);
  else if (dir === 'up') nr = Math.max(0, row - 1);
  else nr = Math.min(GRID_ROWS - 1, row + 1);
  return Math.min(total - 1, nr * GRID_COLS + nc);
}

/** 翻页: delta=+1 下一页; 返回 clamp 后所在页 */
export function flipPage(cur: number, delta: number, total: number): number {
  const pc = pageCount(total);
  return Math.max(0, Math.min(pc - 1, cur + delta));
}

/** 页 → 该页首个全局索引 (空时 0) */
export function pageStart(page: number, total: number): number {
  if (total <= 0) return 0;
  const pc = pageCount(total);
  const p = Math.max(0, Math.min(pc - 1, page));
  return p * GRID_PAGE_SIZE;
}

/** 矩形命中测试 */
export function inRect(mx: number, my: number, x: number, y: number, w: number, h: number): boolean {
  return mx >= x && mx <= x + w && my >= y && my <= y + h;
}

// === 装备面板几何 (draw 与 hit-test 共用) ===
export const EQ_LAYOUT = {
  titleY: 40,
  titleX: 130, // 避开左上关闭按钮 (btnClose 20..116)
  // 左: 穿戴 4 槽 (2×2 网格, 2026-08-15 重设计)
  slotX: 40,
  slotY: 99,
  slotSize: 60,
  slotGap: 18,
  // 选中装备信息面板 (穿戴区下方, 不碰中列背包网格)
  tipX: 28,
  tipY: 283,
  tipW: 220,
  // 中: 背包网格 (10×10, 500×500, 右下 ≈ (800, 599), 不碰右列统计)
  gridX: 300,
  gridY: 99,
  cellSize: 44,
  cellGap: 6,
  // 底部按钮
  btnY: 635,
  btnEquip: { x: 300, y: 635, w: 110, h: 32 },
  btnUnequip: { x: 430, y: 635, w: 110, h: 32 },
  btnPrev: { x: 570, y: 635, w: 96, h: 32 },
  btnNext: { x: 700, y: 635, w: 96, h: 32 },
  // 右上关闭 (鼠标路径)
  btnClose: { x: 20, y: 20, w: 96, h: 34 },
};

/** 槽位绘制/命中几何: 返回 4 个 {x,y} (2×2: 武左上/甲右上/符左下/戒右下, 与 EQUIP_SLOTS 顺序一致) */
export function slotRects(): Array<{ x: number; y: number }> {
  const g = EQ_LAYOUT.slotSize + EQ_LAYOUT.slotGap;
  return [
    { x: EQ_LAYOUT.slotX, y: EQ_LAYOUT.slotY },
    { x: EQ_LAYOUT.slotX + g, y: EQ_LAYOUT.slotY },
    { x: EQ_LAYOUT.slotX, y: EQ_LAYOUT.slotY + g },
    { x: EQ_LAYOUT.slotX + g, y: EQ_LAYOUT.slotY + g },
  ];
}

/** 背包格绘制/命中几何: 返回 { x, y, col, row }[] (10×10) */
export function cellRects(): Array<{ x: number; y: number; col: number; row: number }> {
  const out: Array<{ x: number; y: number; col: number; row: number }> = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      out.push({
        x: EQ_LAYOUT.gridX + col * (EQ_LAYOUT.cellSize + EQ_LAYOUT.cellGap),
        y: EQ_LAYOUT.gridY + row * (EQ_LAYOUT.cellSize + EQ_LAYOUT.cellGap),
        col,
        row,
      });
    }
  }
  return out;
}

/** 背包网格总宽/总高 (命中整片区域用) */
export function gridBounds(): { w: number; h: number } {
  return {
    w: GRID_COLS * (EQ_LAYOUT.cellSize + EQ_LAYOUT.cellGap) - EQ_LAYOUT.cellGap,
    h: GRID_ROWS * (EQ_LAYOUT.cellSize + EQ_LAYOUT.cellGap) - EQ_LAYOUT.cellGap,
  };
}

/** 装备详情面板高 (选中: 标题+战力+词条+提示行+余量; 未选中: 空态) */
export function tipPanelH(affixCount: number, selected: boolean): number {
  return selected ? 34 + affixCount * 16 + 35 : 30;
}

/** 丢弃按钮 (选中详情面板下方; tipH 与详情面板同公式) */
export function discardBtnRect(affixCount: number): { x: number; y: number; w: number; h: number } {
  const tipH = tipPanelH(affixCount, true);
  return { x: EQ_LAYOUT.tipX, y: EQ_LAYOUT.tipY + tipH + 12, w: 90, h: 28 };
}

// === 角色信息面板几何 (C 角色屏, draw 与 hit-test 共用) ===
// 列位与 EQ_LAYOUT 对齐: 左 40 / 中 300 / 右 vw-360
export const CHAR_LAYOUT = {
  titleY: 40,
  titleX: 130, // 避开左上关闭按钮 (btnClose 20..116)
  // 左: 基础属性 (职业/难度/等级/经验/技能点/金币/HP/MP)
  attrX: 40,
  attrY: 134,
  attrRowH: 22,
  // 中: 主动技能 6 槽 (槽名 + 等级/符文)
  skillX: 300,
  skillY: 134,
  skillRowH: 40,
  // 右: 被动技能 10 槽 (名称+Lv / 描述, 双行)
  passiveY: 134,
  passiveRowH: 48,
  btnClose: { x: 20, y: 20, w: 96, h: 34 },
};

/** 右列 x (与装备面板右列 rx = vw-360 对齐) */
export function charRightX(vw: number): number {
  return vw - 360;
}

/** 主动技能槽命中几何: 返回 6 个 {x,y,w,h} */
export function charSkillRects(vw: number): Array<{ x: number; y: number; w: number; h: number }> {
  const w = Math.max(180, Math.min(300, charRightX(vw) - CHAR_LAYOUT.skillX - 20));
  return Array.from({ length: 6 }, (_, i) => ({
    x: CHAR_LAYOUT.skillX,
    y: CHAR_LAYOUT.skillY + i * CHAR_LAYOUT.skillRowH,
    w,
    h: CHAR_LAYOUT.skillRowH - 6,
  }));
}

/** 被动槽命中几何: 返回 10 个 {x,y,w,h} (w = 右列到画布右缘) */
export function charPassiveRects(vw: number): Array<{ x: number; y: number; w: number; h: number }> {
  const x = charRightX(vw);
  const w = Math.max(200, vw - x - 24);
  return Array.from({ length: 10 }, (_, i) => ({
    x,
    y: CHAR_LAYOUT.passiveY + i * CHAR_LAYOUT.passiveRowH,
    w,
    h: CHAR_LAYOUT.passiveRowH - 6,
  }));
}
