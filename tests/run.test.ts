// 跑局状态纯函数单测 (OPT-012): runPhase 阶段判定 + RUN_POOL_SIZE + emptyRun 默认
// 运行: npm test

import { runPhase, emptyRun, WORLD_W, WORLD_H } from '../src/game/state';
import { RUN_POOL_SIZE } from '../src/game/monster';

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

// === runPhase: bossKilled → won; 清空且 Boss 未在场 → boss; 否则 clearing ===
eq('满池 → clearing', runPhase(24, false, false), 'clearing');
eq('剩 1 怪 → clearing', runPhase(1, false, false), 'clearing');
eq('清空且无 Boss → boss', runPhase(0, false, false), 'boss');
eq('Boss 在场(小怪 0) → clearing(战斗中)', runPhase(0, true, false), 'clearing');
eq('Boss 在场(小怪 5) → clearing', runPhase(5, true, false), 'clearing');
eq('Boss 击杀 → won', runPhase(0, true, true), 'won');
eq('Boss 击杀(还余怪) → won(优先级最高)', runPhase(7, true, true), 'won');
eq('清空未召 Boss 前 killed=false → boss', runPhase(0, false, false), 'boss');

// === RUN_POOL_SIZE ===
eq('RUN_POOL_SIZE = 24', RUN_POOL_SIZE, 24);

// === emptyRun 默认值 ===
{
  const r = emptyRun('desert');
  eq('theme', r.theme, 'desert');
  eq('total 0', r.total, 0);
  eq('alive 0', r.alive, 0);
  eq('bossAlive false', r.bossAlive, false);
  eq('bossKilled false', r.bossKilled, false);
  eq('victoryShown false', r.victoryShown, false);
  eq('timeSec 0', r.timeSec, 0);
  eq('kills 0', r.kills, 0);
  eq('best 空', JSON.stringify(r.best), '{}');
  eq('mode 默认 linear', r.mode, 'linear');
}

// === A-W2 三模式出生点 + 密度 (A-W5 含肉鸽=线性) ===
import { spawnPointForMode, densityForMode, chunkDist, LINEAR_SPAWN, EXTRACT_SPAWN } from '../src/game/world';
const sp = spawnPointForMode('linear');
eq('线性出生 = 左端 (x=320)', sp.x, 320);
eq('线性出生 y 居中', sp.y, WORLD_H / 2);
eq('挑战出生 = 世界中心', JSON.stringify(spawnPointForMode('extract')), JSON.stringify(EXTRACT_SPAWN));
const gsp = spawnPointForMode('gauntlet');
check('高级出生在角落 (320 边距)', [320, WORLD_W - 320].includes(gsp.x) && [320, WORLD_H - 320].includes(gsp.y));
check('线性密度 0.18', densityForMode('linear') === 0.18);
check('高级密度 0.22', densityForMode('gauntlet') === 0.22);
check('挑战密度 0.16', densityForMode('extract') === 0.16);
// A-W5 肉鸽 = 线性骨架
check('肉鸽出生 = 线性左端', JSON.stringify(spawnPointForMode('rogue')) === JSON.stringify(LINEAR_SPAWN));
check('肉鸽密度 0.18', densityForMode('rogue') === 0.18);
check('肉鸽梯度 = 线性 (同 chunk 同距)', chunkDist('rogue', 7, 5) === chunkDist('linear', 7, 5));

// === 开放场地+稀疏墙簇生成 (2026-08-13 v3: 密度驱动小墙簇, 外圈全开) ===
import { generateChunkWalls, CHUNK_SIZE, BLOCK, aabbOverlap, type Wall } from '../src/game/world';
const G = CHUNK_SIZE / BLOCK; // 8
function wallsGrid(ws: Wall[]): boolean[][] {
  const g: boolean[][] = [];
  for (let r = 0; r < G; r++) g.push(new Array<boolean>(G).fill(false));
  for (const w of ws) {
    g[Math.floor((w.pos.y % CHUNK_SIZE) / BLOCK)][Math.floor((w.pos.x % CHUNK_SIZE) / BLOCK)] = true;
  }
  return g;
}
interface Area { size: number; members: Set<string> }
function areasOfGrid(g: boolean[][]): Area[] {
  const seen = new Set<string>();
  const areas: Area[] = [];
  for (let r = 0; r < G; r++) {
    for (let c = 0; c < G; c++) {
      if (g[r][c] || seen.has(`${r},${c}`)) continue;
      const members = new Set<string>();
      const q: Array<[number, number]> = [[r, c]];
      seen.add(`${r},${c}`);
      while (q.length) {
        const [rr, cc] = q.pop()!;
        members.add(`${rr},${cc}`);
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>) {
          const nr = rr + dr, nc = cc + dc;
          if (nr >= 0 && nr < G && nc >= 0 && nc < G && !g[nr][nc] && !seen.has(`${nr},${nc}`)) {
            seen.add(`${nr},${nc}`);
            q.push([nr, nc]);
          }
        }
      }
      areas.push({ size: members.size, members });
    }
  }
  areas.sort((a, b) => b.size - a.size);
  return areas;
}
const genWalls = generateChunkWalls(5, 7, 0.18, 'linear');
check('墙块 128×128 (1:1 贴图)', genWalls.every(w => w.size.w === 128 && w.size.h === 128));
check('linear 墙量稀疏 0-10 (主轴雕刻后)', genWalls.length <= 10);
const genGrid = wallsGrid(genWalls);
const areas = areasOfGrid(genGrid);
check('最大连通空区 ≥ 52 格 (≥80% 战斗区)', areas[0].size >= 52);
{
  const rw = generateChunkWalls(5, 7, 0.18, 'rogue');
  const rg = wallsGrid(rw);
  check('肉鸽主轴 row5 全开 (复用线性走廊)', rg[5].every(v => !v));
  check('肉鸽墙量稀疏 ≤10 (同线性)', rw.length <= 10);
}
// 普通模式: 主轴走廊 (row 5 全开) + 分支房间 (设计 §2.1)
check('linear 主轴 row5 全开 (跨 chunk 左→右走廊)', genGrid[5].every(v => !v));
check('linear 分支: 非主轴行开放格 ≥ 10 (通道+房间)', (() => {
  let open = 0;
  for (let r = 0; r < G; r++) if (r !== 5) for (let c = 0; c < G; c++) if (!genGrid[r][c]) open++;
  return open >= 10;
})());
check('外圈全开放 (chunk 间天然连通, 无孤岛)', genGrid[0].every(v => !v) && genGrid[G - 1].every(v => !v) && genGrid.every(row => !row[0] && !row[G - 1]));
check('墙簇不相邻 (4 直邻留空, 无长墙死角)', (() => {
  for (let r = 0; r < G; r++) {
    for (let c = 0; c < G; c++) {
      if (!genGrid[r][c]) continue;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= G || cc < 0 || cc >= G) continue;
        if (genGrid[rr][cc]) return false;
      }
    }
  }
  return true;
})());
// density 梯度生效: gauntlet(0.22) > extract(0.16) 远端 > linear(0.18) 全图平均
{
  const sums: Record<string, number> = { gauntlet: 0, linear: 0, extract: 0 };
  const counts: Record<string, number> = { gauntlet: 0, linear: 0, extract: 0 };
  for (let cx = 0; cx < 10; cx++) {
    for (let cy = 0; cy < 10; cy++) {
      for (const [mode, d] of [['gauntlet', 0.22], ['linear', 0.18], ['extract', 0.16]] as Array<[string, number]>) {
        sums[mode] += generateChunkWalls(cx, cy, d, mode as never).length;
        counts[mode]++;
      }
    }
  }
  check('密度梯度: gauntlet > extract > linear (平均墙量; linear 主轴雕刻墙最少)',
    sums.gauntlet / counts.gauntlet > sums.extract / counts.extract &&
    sums.extract / counts.extract > sums.linear / counts.linear);
}
// 近开远密: linear 远端 (cx=19) 墙量 > 近端 (cx=0) 同 cy 平均
{
  const near = [0, 1, 2, 3].map(cy => generateChunkWalls(0, cy, 0.18, 'linear').length);
  const far = [0, 1, 2, 3].map(cy => generateChunkWalls(19, cy, 0.18, 'linear').length);
  check('近开远密: linear 远端墙量 > 近端',
    far.reduce((a, b) => a + b, 0) / far.length > near.reduce((a, b) => a + b, 0) / near.length);
}
// 近开远密: gauntlet 角 (出生入口) 开 < 中央 (Boss 区) 密; extract 中央 (出生) 开 < 角落 密
{
  const gCorner = [ [0, 0], [19, 0], [0, 10], [19, 10] ].map(([cx, cy]) => generateChunkWalls(cx, cy, 0.22, 'gauntlet').length);
  const gCenter = generateChunkWalls(10, 5, 0.22, 'gauntlet').length;
  check('近开远密: gauntlet 四角 (入口) 墙量 < 中央 (Boss)',
    gCorner.every(n => n < gCenter));
  const eCenter = generateChunkWalls(10, 5, 0.16, 'extract').length;
  const eCorner = generateChunkWalls(0, 0, 0.16, 'extract').length;
  check('近开远密: extract 中央 (出生) 墙量 < 角落', eCorner > eCenter);
}
// 同 chunk 同种子 → 确定结果 (缓存/稳定性)
check('同 chunk 生成确定', JSON.stringify(generateChunkWalls(3, 4, 0.18, 'linear')) === JSON.stringify(generateChunkWalls(3, 4, 0.18, 'linear')));
// 多 chunk 布局各异 (随机性生效)
check('不同 chunk 布局不同', JSON.stringify(generateChunkWalls(3, 4, 0.18, 'linear')) !== JSON.stringify(generateChunkWalls(9, 11, 0.18, 'linear')));
// MM-FIX8: 分支房间坐标与雕刻一致 (MM-FIX8: 坐标落空区, 每 chunk 2-3 个, 确定性)
import { linearBranchRooms } from '../src/game/world';
{
  let roomsTotal = 0, inWall = 0;
  for (let cx = 0; cx < 10; cx++) {
    for (let cy = 0; cy < 10; cy++) {
      const rooms = linearBranchRooms(cx, cy);
      roomsTotal += rooms.length;
      const ws = generateChunkWalls(cx, cy, 0.18, 'linear');
      for (const r of rooms) {
        if (ws.some(w => aabbOverlap(r.x - 48, r.y - 48, 96, 96, w.pos.x, w.pos.y, w.size.w, w.size.h))) inWall++;
      }
    }
  }
  check('分支房间坐标全部落在空区 (MM-FIX8)', inWall === 0 && roomsTotal >= 20);
  check('每 chunk 分支房间 2-3 个 (100 chunk 200-300)', roomsTotal >= 200 && roomsTotal <= 300);
  check('分支房间确定 (同 chunk 同坐标)', JSON.stringify(linearBranchRooms(5, 7)) === JSON.stringify(linearBranchRooms(5, 7)));
}

// === A-W4 挑战多 Boss 阶段驱动 (alive 计数驱动阶段迁移) ===
// 外层 Boss spawn 后 alive=4; 依次击杀 → ph='boss' 于 0; bossStage 1→2 由 main 处理
eq('4 外层→alive4 clearing', runPhase(4, false, false), 'clearing');
eq('3 外层→clearing', runPhase(3, false, false), 'clearing');
eq('0 外层→boss(段1触发)', runPhase(0, false, false), 'boss');
eq('中央 Boss 在场→clearing', runPhase(0, true, false), 'clearing');
eq('中央已杀→won', runPhase(0, true, true), 'won');

// === 双元素 Boss (未决项拍板: 火/冰/毒/影 固定方向位 + 随机副元素) ===
import { ELEMENT_IDS, EXTRACT_ELEMENT_ORDER, randomSubElement } from '../src/game/element';
check('四方向位元素 = 火/冰/毒/影', JSON.stringify(EXTRACT_ELEMENT_ORDER) === JSON.stringify(['fire', 'ice', 'poison', 'shadow']));
check('方向位元素唯一', new Set(EXTRACT_ELEMENT_ORDER).size === 4);
check('方向位元素都是合法系', EXTRACT_ELEMENT_ORDER.every(e => ELEMENT_IDS.includes(e)));
for (const main of EXTRACT_ELEMENT_ORDER) {
  for (let i = 0; i < 20; i++) {
    const sub = randomSubElement(main);
    check(`副元素≠主 (${main} → ${sub})`, sub !== main);
    check(`副元素合法 (${sub})`, ELEMENT_IDS.includes(sub));
  }
}

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);