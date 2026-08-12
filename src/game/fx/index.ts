// game/fx/index.ts — FX 模块 barrel (T3a, 2026-08-12)
//
// 聚合 vfx/damageNum/deathFx/envFx/facade; 旧 import 路径 (e.g. `from '../vfx'`)
// 零修改兼容, 也可换 `from '../fx'` 一次性拿到全部.

export * from './vfx';
export * from './damageNum';
export * from './deathFx';
export * from './envFx';
export * from './facade';