// UI 网格纯函数单测 (C-501/502): 分页/选格/几何
// 运行: npm test

import {
  pageCount, pageOf, cellIndex, moveGridSel, flipPage, pageStart, inRect,
  cellRects, slotRects, EQ_LAYOUT, GRID_COLS, GRID_ROWS, GRID_PAGE_SIZE,
} from '../src/game/uigrid';

let failures = 0;
function eq(name: string, got: unknown, want: unknown): void {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    failures++;
  } else console.log(`ok  ${name}: ${JSON.stringify(want)}`);
}
function check(name: string, cond: boolean): void {
  if (!cond) { console.error(`FAIL ${name}`); failures++; }
  else console.log(`ok  ${name}`);
}

// === 分页 ===
eq('GRID_PAGE_SIZE = 20', GRID_PAGE_SIZE, 20);
eq('空背包 1 页', pageCount(0), 1);
eq('20 件 1 页', pageCount(20), 1);
eq('21 件 2 页', pageCount(21), 2);
eq('40 件 2 页', pageCount(40), 2);
eq('41 件 3 页', pageCount(41), 3);
eq('索引 19 → 页 0', pageOf(19), 0);
eq('索引 20 → 页 1', pageOf(20), 1);
eq('pageStart 页 1 = 20', pageStart(1, 35), 20);
eq('pageStart 越界 clamp', pageStart(9, 35), 20);
eq('pageStart 空 = 0', pageStart(0, 0), 0);

// === 格映射 ===
eq('cell(0,0,0) = 0', cellIndex(0, 0, 0, 30), 0);
eq('cell(3,0,0) = 3', cellIndex(3, 0, 0, 30), 3);
eq('cell(0,1,0) = 4', cellIndex(0, 1, 0, 30), 4);
eq('cell(0,0,1) = 20', cellIndex(0, 0, 1, 30), 20);
eq('超出 total → null', cellIndex(2, 2, 1, 21), null);
eq('负数 col → null', cellIndex(-1, 0, 0, 30), null);

// === 方向键选格 ===
eq('0 左 clamp', moveGridSel(0, 'left', 20), 0);
eq('0 上 clamp', moveGridSel(0, 'up', 20), 0);
eq('0 右 → 1', moveGridSel(0, 'right', 20), 1);
eq('0 下 → 4', moveGridSel(0, 'down', 20), 4);
eq('19 右 clamp (col3)', moveGridSel(19, 'right', 20), 19);
eq('19 下 clamp (row4)', moveGridSel(19, 'down', 20), 19);
eq('3 左 → 2', moveGridSel(3, 'left', 20), 2);
eq('15 下 → 19', moveGridSel(15, 'down', 20), 19);
eq('尾部 clamp (total=5, 4 下)', moveGridSel(4, 'down', 5), 4);
eq('空 total → 0', moveGridSel(7, 'down', 0), 0);

// === 翻页 ===
eq('flipPage 0→1', flipPage(0, 1, 35), 1);
eq('flipPage 1→0', flipPage(1, -1, 35), 0);
eq('flipPage 末页上溢 clamp', flipPage(1, 1, 35), 1);
eq('flipPage 首页下溢 clamp', flipPage(0, -1, 35), 0);

// === 命中测试 ===
check('inRect 内', inRect(10, 10, 0, 0, 20, 20));
check('inRect 外', !inRect(21, 10, 0, 0, 20, 20));
check('inRect 边界含', inRect(20, 20, 0, 0, 20, 20));

// === 几何一致性 ===
check('4 槽位几何', slotRects().length === 4);
check('20 格几何', cellRects().length === GRID_COLS * GRID_ROWS);
const firstCell = cellRects()[0];
eq('首格 = gridX,gridY', `${firstCell.x},${firstCell.y}`, `${EQ_LAYOUT.gridX},${EQ_LAYOUT.gridY}`);
const lastCell = cellRects()[19];
check('末格在网格右下', lastCell.x > firstCell.x && lastCell.y > firstCell.y);

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);