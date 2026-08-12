// app/audio.ts — BGM 淡入淡出 (T1b, 2026-08-12)
//
// 从 main.ts 拆出: 原 line 2364-2385 (fadeBgm 函数 + 模块级 bgmFadeTimer 状态)
//
// 设计:
// - 模块级 bgmFadeTimer 状态: 当前渐变剩余秒数 (countdown to switch)
// - 调度策略: vol=0 时延迟 0.5s 切到新曲, 给当前曲 0.5s 淡出
// - 不直接持有 audio 句柄: 通过 ipc/sfx 调 Rust 后端
//
// 不变量:
// - fadeBgm 是异步启动 (调度器推进), 调用方无 await
// - 同一曲连发 fadeBgm 会重置 timer (避免叠加抖动)

import { setVolumeClient, playBgmClient } from '../ipc/sfx';

let bgmFadeTimer = 0;        // 当前淡出剩余秒数
let bgmPending: { name: string; vol: number } | null = null;
let bgmCurrent = '';

/** 主循环每帧调用: 推进 bgm 淡出状态 */
export function tickBgm(dt: number): void {
  if (bgmFadeTimer > 0) {
    bgmFadeTimer -= dt;
    const remain = Math.max(0, bgmFadeTimer);
    const startVol = bgmPending?.vol ?? 0.7;
    setVolumeClient(bgmCurrent, startVol * remain * 2);  // 线性淡出
    if (bgmFadeTimer <= 0 && bgmPending) {
      const p = bgmPending;
      bgmPending = null;
      bgmCurrent = p.name;
      playBgmClient(p.name);
      setVolumeClient(p.name, p.vol);
    }
  }
}

/** 切到新 BGM (淡出当前 → 淡入新); vol=0 直接切 */
export function fadeBgm(name: string, vol: number): void {
  if (name === bgmCurrent && bgmFadeTimer <= 0) {
    setVolumeClient(name, vol);
    return;
  }
  if (vol <= 0) {
    // 无淡出: 直接停当前
    bgmFadeTimer = 0;
    bgmPending = null;
    setVolumeClient(bgmCurrent, 0);
    bgmCurrent = name;
    playBgmClient(name);
    setVolumeClient(name, vol);
    return;
  }
  bgmPending = { name, vol };
  bgmFadeTimer = 0.5;  // 0.5s 淡出
}

/** 测试/重启用: 重置模块级状态 */
export function _resetAudio(): void {
  bgmFadeTimer = 0;
  bgmPending = null;
  bgmCurrent = '';
}