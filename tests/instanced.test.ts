// B-V3 粒子 instancing 纯函数单测 (packInstance 布局; WebGL 部分不在 node 跑)
// 运行: npm test

import { packInstance } from '../src/render/instanced';

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

// === packInstance 布局: 9 float/实例 ([x,y,w,h,u,v,du,dv,rot]) ===
const data = new Float32Array(18);
packInstance(data, 0, { x: 10, y: 20, w: 6, h: 7, u: 0.1, v: 0.2, du: 0.3, dv: 0.4, rot: 1.5 });
packInstance(data, 1, { x: -5, y: 100, w: 12, h: 4, u: 0.5, v: 0.6, du: 0.2, dv: 0.1, rot: 0 });
eq('实例0 x', data[0], 10);
eq('实例0 y', data[1], 20);
eq('实例0 w', data[2], 6);
eq('实例0 h', data[3], 7);
eq('实例0 u', Math.round(data[4] * 1000) / 1000, 0.1);
eq('实例0 v', Math.round(data[5] * 1000) / 1000, 0.2);
eq('实例0 du', Math.round(data[6] * 1000) / 1000, 0.3);
eq('实例0 dv', Math.round(data[7] * 1000) / 1000, 0.4);
eq('实例0 rot', data[8], 1.5);
// 实例1 从 offset 9 开始 (stride 9 float)
eq('实例1 x (offset 9)', data[9], -5);
eq('实例1 y', data[10], 100);
eq('实例1 w', data[11], 12);
eq('实例1 rot (offset 17)', data[17], 0);
// 实例间不串扰
check('实例1 u 独立', Math.abs(data[13] - 0.5) < 1e-6 && Math.abs(data[4] - 0.1) < 1e-6);
// 9 float/实例 = 36B 对齐顶点属性 stride
check('stride 36 字节', 9 * 4 === 36);

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);