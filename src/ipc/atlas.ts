// Tauri IPC: invoke('load_atlas', { name })
// 直接 await, 无 Promise 缓存 (YAGNI)

import { invoke } from '@tauri-apps/api/core';

export interface SpriteMeta {
  name: string;
  x: number;
  y: number;
  frame_width: number;
  frame_height: number;
  frames: number;
  is_animated?: boolean;
}

export interface LoadedAtlas {
  name: string;
  width: number;
  height: number;
  sprites: SpriteMeta[];
  image_png_b64: string;
}

export async function loadAtlas(name: string): Promise<LoadedAtlas> {
  return invoke<LoadedAtlas>('load_atlas', { name });
}