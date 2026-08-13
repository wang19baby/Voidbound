// app/audio.ts — BGM 交叉淡化 (T1b + PR-008, 2026-08-13)
//
// PR-008: 把 main.ts 内 fadeBgm (原 line 1257-1279) 整体搬到本模块, 0 行为变更
//
// 设计:
// - 模块级 bgmFadeTimer: 当前 setInterval 句柄 (null 表示空闲)
// - 调度策略: 1s 10 步线性淡出 → 切曲 → 1s 10 步线性淡入
// - 同曲重复触发会清除上一轮 interval, 避免叠加抖动
// - 不直接持有 audio 句柄: 通过 ipc/sfx 调 Rust 后端

import { setVolumeClient, playBgmClient } from '../ipc/sfx';

/** BGM 交叉淡化 (OPT-027): 1s 淡出 → 切曲 → 1s 淡入; 复用 setVolumeClient */
let bgmFadeTimer: number | null = null;

/** 切到新 BGM (交叉淡化); 同曲重复触发会重置 timer */
export function fadeBgm(name: string, vol: number): void {
  if (bgmFadeTimer !== null) { clearInterval(bgmFadeTimer); bgmFadeTimer = null; }
  const STEPS = 10;
  let i = 0;
  bgmFadeTimer = window.setInterval(() => {
    i++;
    if (i <= STEPS) {
      setVolumeClient(Math.max(0, vol * (1 - i / STEPS)));
    } else {
      clearInterval(bgmFadeTimer!);
      bgmFadeTimer = null;
      playBgmClient(name);
      let j = 0;
      const up = window.setInterval(() => {
        j++;
        setVolumeClient(Math.min(1, vol * (j / STEPS)));
        if (j >= STEPS) clearInterval(up);
      }, 100);
    }
  }, 100);
}

/** 测试/重启用: 重置模块级状态 */
export function _resetAudio(): void {
  if (bgmFadeTimer !== null) { clearInterval(bgmFadeTimer); bgmFadeTimer = null; }
}