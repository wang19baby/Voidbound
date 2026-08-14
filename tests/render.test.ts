// spriteUv v 轴镜像单测 (2026-08-13 修复: UNPACK_FLIP_Y_WEBGL 纹理下矮 sprite 透明不可见)
// 运行: npm test

import { spriteUv } from '../src/render/resources';
import type { SpriteMeta } from '../src/ipc/atlas';

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) console.log(`ok  ${name}`);
  else { failures++; console.log(`FAIL ${name}`); }
}
function near(a: number, b: number, eps = 1e-4): boolean {
  return Math.abs(a - b) < eps;
}

const ATLAS_W = 2610, ATLAS_H = 388;
function meta(name: string, x: number, y: number, w: number, h: number): SpriteMeta {
  return { name, x, y, frame_width: w, frame_height: h, frames: 1 };
}

// wall_forest (2214,2) 128×128: 矮 sprite 必须镜像到 v=[0.665, 0.995] 才采样到自身 (而非空白区)
{
  const uv = spriteUv(meta('wall_forest', 2214, 2, 128, 128), ATLAS_W, ATLAS_H);
  check('wall_forest v0 = 1-(y+h)/H = 0.665', near(uv[1], 1 - 130 / 388));
  check('wall_forest v0+dv = 1-y/H = 0.995', near(uv[1] + uv[3], 1 - 2 / 388));
  check('wall_forest u 不镜像', near(uv[0], 2214 / 2610) && near(uv[2], 128 / 2610));
}

// floor_forest_full (918,2) 384×384: 顶满图集, 镜像前后区间都覆盖自身
{
  const uv = spriteUv(meta('floor_forest_full', 918, 2, 384, 384), ATLAS_W, ATLAS_H);
  check('floor v0 = 1-386/388', near(uv[1], 1 - 386 / 388));
  check('floor v0+dv = 1-2/388', near(uv[1] + uv[3], 1 - 2 / 388));
}

// decor_forest (134,2) 128×128
{
  const uv = spriteUv(meta('decor_forest', 134, 2, 128, 128), ATLAS_W, ATLAS_H);
  check('decor_forest v 区间正确', near(uv[1], 1 - 130 / 388) && near(uv[1] + uv[3], 1 - 2 / 388));
}

// 多行图集 (y 非顶行): 镜像公式通用
{
  const uv = spriteUv(meta('mid_row', 100, 500, 64, 64), 1024, 1024);
  check('多行 y=500 h=64 → v=[1-564/1024, 1-500/1024]', near(uv[1], 1 - 564 / 1024) && near(uv[1] + uv[3], 1 - 500 / 1024));
}

if (failures > 0) {
  console.log(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);
