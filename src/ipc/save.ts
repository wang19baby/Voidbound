// 客户端存档 wrapper (US-003 三层结构)
// IPC 边界类型 = 反序列化契约 (serde_json 对应结构)

import { invoke } from '@tauri-apps/api/core';
import type { DamageType } from '../game/combat';
import type { AffixStat, Rarity, SetName } from '../game/equipment';
import type { SkillSlot } from '../game/skill';
import type { RuneId } from '../game/rune';
import type { Theme } from '../game/state';

export interface SaveAffix {
  stat: AffixStat;
  value: number;
  element?: DamageType;
}

export interface SaveItem {
  name: string;
  rarity: Rarity;
  affixes: SaveAffix[];
  setName?: SetName;
}

export interface SaveRune {
  slot: SkillSlot;
  rune: RuneId;
}

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
  level: number;
  owned: SaveItem[];
  runes: SaveRune[];
  theme: Theme;
}

export function saveGame(data: SaveData): Promise<string> {
  return invoke<string>('save_game', { data });
}

export function loadGame(): Promise<SaveData> {
  return invoke<SaveData>('load_game');
}