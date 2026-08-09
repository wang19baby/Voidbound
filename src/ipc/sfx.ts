// 客户端 SFX 包装: invoke + 失败静默 (音频不可用时游戏不卡)

import { invoke } from '@tauri-apps/api/core';

export function playSfxClient(name: string): void {
  invoke('play_sfx', { name }).catch(() => { /* 静默 */ });
}

export function setVolumeClient(vol: number): void {
  invoke('set_volume', { vol }).catch(() => {});
}

export function playBgmClient(name: string): void {
  invoke('play_bgm', { name }).catch(() => {});
}

export function stopBgmClient(): void {
  invoke('stop_bgm').catch(() => {});
}