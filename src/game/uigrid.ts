// UI 网格纯函数 (C-502/C-501 基建): 分页/选格/面板布局常量
// 纯数字模块, 供 draw(hud) 与 hit-test(main) 共用, 防几何漂移

export const GRID_COLS = 4;
export const GRID_ROWS = 5;
export const GRID_PAGE_SIZE = GRID_COLS * GRID_ROWS; // 20

/** 总数 → 页数 (空时 1 页) */
export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / GRID_PAGE_SIZE));
}

/** 全局索引 → 所在页 */
export function pageOf(index: number): number {
  return Math.floor(index / GRID_PAGE_SIZE);
}

/** 页内 (col,row) → 全局索引; 越界(含负)或 >= total 返回 null */
export function cellIndex(col: number, row: number, page: number, total: number): number | null {
  if (col < 0 || row < 0 || col >= GRID_COLS || row >= GRID_ROWS) return null;
  const idx = page * GRID_PAGE_SIZE + row * GRID_COLS + col;
  return idx < total ? idx : null;
}

export type GridDir = 'up' | 'down' | 'left' | 'right';

/** 方向键移动选中: 页内移动, 边界 clamp (不跨页) */
export function moveGridSel(sel: number, dir: GridDir, total: number): number {
  if (total <= 0) return 0;
  const col = sel % GRID_COLS;
  const row = Math.floor(sel / GRID_COLS);
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
  // 左: 4 槽位
  slotX: 40,
  slotY: 84,
  slotSize: 54,
  slotGap: 14,
  // 中: 背包网格
  gridX: 300,
  gridY: 84,
  cellSize: 46,
  cellGap: 8,
  // 底部按钮
  btnY: 620,
  btnEquip: { x: 300, y: 620, w: 110, h: 32 },
  btnUnequip: { x: 430, y: 620, w: 110, h: 32 },
  // tooltip 区
  tipY: 660,
};

/** 槽位绘制几何: 返回 4 个 {x,y} */
export function slotRects(): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 4; i++) {
    out.push({ x: EQ_LAYOUT.slotX, y: EQ_LAYOUT.slotY + i * (EQ_LAYOUT.slotSize + EQ_LAYOUT.slotGap) });
  }
  return out;
}

/** 背包格绘制/命中几何: 返回 { x, y, col, row }[] (4×5) */
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
