// 客户端存档 wrapper

import { invoke } from '@tauri-apps/api/core';

export interface SaveData {
  player_x: number;
  player_y: number;
  player_hp: number;
  player_mp: number;
  facing_x: number;
  facing_y: number;
  score: number;
  world_w: number;
  world_h: number;
}

export function saveGame(data: SaveData): Promise<string> {
  return invoke<string>('save_game', { data });
}

export function loadGame(): Promise<SaveData> {
  return invoke<SaveData>('load_game');
}