// 客户端存档 wrapper (US-003 三层结构)
// IPC 边界类型 = 反序列化契约 (serde_json 对应结构)

import { invoke } from '@tauri-apps/api/core';
import type { DamageType } from '../game/combat';
import type { AffixStat, Rarity, SetName, EquipType } from '../game/equipment';
import type { SkillSlot } from '../game/skill';
import type { RuneId } from '../game/rune';
import type { Theme } from '../game/state';
import type { Difficulty } from '../game/difficulty';

export interface SaveAffix {
  stat: AffixStat;
  value: number;
  element?: DamageType;
}

export interface SaveItem {
  name: string;
  rarity: Rarity;
  eq_type: EquipType;
  affixes: SaveAffix[];
  setName?: SetName;
}

export interface SaveEquipped {
  slot: EquipType;
  item: SaveItem;
}

export interface SaveBest {
  difficulty: Difficulty;
  ms: number;
}

export interface SaveSkillLevel {
  slot: SkillSlot;
  level: number;
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
  equipped: SaveEquipped[];
  gold: number;
  runes: SaveRune[];
  theme: Theme;
  difficulty: Difficulty;
  class: string;
  skill_levels: SaveSkillLevel[];
  skill_points: number;
  exp: number;
  /** 当前城镇 (v7, C-302) */
  town: string;
  /** 材料计数 (v8, C-401): [id, count][] */
  materials: Array<[string, number]>;
  /** 被动技能等级 (v9): [id, level][] */
  passives: Array<[string, number]>;
  /** 布局模式 (v10, A-W2): linear/gauntlet/extract */
  mode: string;
}

/** 账号层 (OPT-029): 跨角色永久进度, 独立文件 account.json */
export interface SaveAccount {
  cleared: string[];
  best: SaveBest[];
  characters: string[];
  /** 最近游玩角色 (C-203): 标题 [O] 直接进入 */
  last_char: string;
  /** 传承符文 (D-01): 通关保存的槽位符文, 新局自动绑定 */
  legacy: SaveRune[];
  /** 仓库 (C-503): 账号层共享, 跨角色可见 */
  warehouse: SaveItem[];
}

/** 角色摘要 (C-202): 角色管理屏列表 */
export interface CharacterSummary {
  id: string;
  class: string;
  level: number;
  difficulty: Difficulty;
  theme: Theme;
}

export function saveGame(data: SaveData, charId?: string): Promise<string> {
  return invoke<string>('save_game', { data, charId });
}

export function loadGame(charId?: string): Promise<SaveData> {
  return invoke<SaveData>('load_game', { charId });
}

export function listCharacters(): Promise<CharacterSummary[]> {
  return invoke<CharacterSummary[]>('list_characters');
}

export function deleteCharacter(charId: string): Promise<string> {
  return invoke<string>('delete_character', { charId });
}

export function saveAccount(data: SaveAccount): Promise<string> {
  return invoke<string>('save_account', { data });
}

export function loadAccount(): Promise<SaveAccount> {
  return invoke<SaveAccount>('load_account');
}