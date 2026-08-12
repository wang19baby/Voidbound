// 角色存档: bincode 序列化到 saves/char_0.bin (US-003 + OPT-014/015/003/029 + M5 + A-W1)
// 格式: 首字节 = SAVE_FORMAT_VERSION (11), 其后 bincode(SaveData)
// v10 [A-W1]: + mode (布局模式 linear/gauntlet/extract, 迁移默认 linear)
// v9 [M5 非目标收尾]: + passives (被动技能树等级: id, level)
// v8 [M5 W4 C-401]: + materials (材料计数: iron_shard/arcane_core/void_fragment)
// v7 [M5 W3 C-302]: + town (当前城镇, 读档 enterTown 还原)
// v6 [M5 C-104]: + class (职业, 读档 bindClass 还原)
// v5 [OPT-029]: cleared/best 迁出到 account.json; 存档落 saves/<char_id>.bin
// v4 [OPT-003]: + skill_levels / skill_points / exp
// v3 [OPT-015]: + cleared / best (现已迁出)
// v2 [OPT-014]: runes 结构体化 + equipped + eq_type
// v1(旧, 无头): 逐级迁移到 v6; 旧 save.bin 首次读后迁移并落新路径

use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

pub const SAVE_FORMAT_VERSION: u8 = 11;

/// 当前角色 ID (OPT-029: 多角色 UI 前固定单角色)
const CURRENT_CHAR: &str = "char_0";

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct OwnedAffix {
    pub stat: String,
    pub value: f32,
    pub element: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct OwnedItem {
    pub name: String,
    pub rarity: String,
    pub affixes: Vec<OwnedAffix>,
    pub set_name: Option<String>,
    pub eq_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct RuneSlot {
    pub slot: String,
    pub rune: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct EquippedItem {
    pub slot: String,
    pub item: OwnedItem,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct BestTime {
    pub difficulty: String,
    pub ms: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct SkillLevel {
    pub slot: String,
    pub level: u32,
}

/// v1 兼容结构 (旧档解码用): 无 eq_type, runes 元组
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
struct OwnedItemV1 {
    pub name: String,
    pub rarity: String,
    pub affixes: Vec<OwnedAffix>,
    pub set_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
struct SaveDataV1 {
    pub player_x: f32,
    pub player_y: f32,
    pub player_hp: f32,
    pub player_mp: f32,
    pub facing_x: f32,
    pub facing_y: f32,
    pub score: u32,
    pub world_w: f32,
    pub world_h: f32,
    pub level: u32,
    pub owned: Vec<OwnedItemV1>,
    pub gold: u32,
    pub runes: Vec<(String, String)>,
    pub theme: String,
    pub difficulty: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
struct SaveDataV2 {
    pub player_x: f32,
    pub player_y: f32,
    pub player_hp: f32,
    pub player_mp: f32,
    pub facing_x: f32,
    pub facing_y: f32,
    pub score: u32,
    pub world_w: f32,
    pub world_h: f32,
    pub level: u32,
    pub owned: Vec<OwnedItem>,
    pub gold: u32,
    pub runes: Vec<RuneSlot>,
    pub theme: String,
    pub difficulty: String,
    pub equipped: Vec<EquippedItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
struct SaveDataV3 {
    pub player_x: f32,
    pub player_y: f32,
    pub player_hp: f32,
    pub player_mp: f32,
    pub facing_x: f32,
    pub facing_y: f32,
    pub score: u32,
    pub world_w: f32,
    pub world_h: f32,
    pub level: u32,
    pub owned: Vec<OwnedItem>,
    pub gold: u32,
    pub runes: Vec<RuneSlot>,
    pub theme: String,
    pub difficulty: String,
    pub equipped: Vec<EquippedItem>,
    pub cleared: Vec<String>,
    pub best: Vec<BestTime>,
}

/// v4 兼容结构: + skill 进度 (仍含 cleared/best, v5 迁出到 account)
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
struct SaveDataV4 {
    pub player_x: f32,
    pub player_y: f32,
    pub player_hp: f32,
    pub player_mp: f32,
    pub facing_x: f32,
    pub facing_y: f32,
    pub score: u32,
    pub world_w: f32,
    pub world_h: f32,
    pub level: u32,
    pub owned: Vec<OwnedItem>,
    pub gold: u32,
    pub runes: Vec<RuneSlot>,
    pub theme: String,
    pub difficulty: String,
    pub equipped: Vec<EquippedItem>,
    pub cleared: Vec<String>,
    pub best: Vec<BestTime>,
    pub skill_levels: Vec<SkillLevel>,
    pub skill_points: u32,
    pub exp: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct SaveData {
    // 本局层
    pub player_x: f32,
    pub player_y: f32,
    pub player_hp: f32,
    pub player_mp: f32,
    pub facing_x: f32,
    pub facing_y: f32,
    pub score: u32,
    pub world_w: f32,
    pub world_h: f32,
    // 角色层
    pub level: u32,
    pub owned: Vec<OwnedItem>,
    pub gold: u32,
    // 永久层
    pub runes: Vec<RuneSlot>,
    pub theme: String,
    pub difficulty: String,
    // v2
    pub equipped: Vec<EquippedItem>,
    // v4
    pub skill_levels: Vec<SkillLevel>,
    pub skill_points: u32,
    pub exp: u32,
    // v6 (M5 C-104): 职业
    pub class: String,
    // v7 (M5 W3 C-302): 当前城镇
    pub town: String,
    // v8 (M5 W4 C-401): 材料计数 (id, count)
    pub materials: Vec<(String, u32)>,
    // v9 (M5 非目标收尾): 被动技能树等级 (id, level)
    pub passives: Vec<(String, u32)>,
    // v10 (A-W1): 布局模式 linear/gauntlet/extract (迁移默认 linear)
    pub mode: String,
    // v11 (界面优化): 上次场景 dungeon/town (读档分派, 迁移默认 dungeon)
    pub scene: String,
}

/// v10 兼容结构 (无 scene 字段)
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
struct SaveDataV10 {
    pub player_x: f32,
    pub player_y: f32,
    pub player_hp: f32,
    pub player_mp: f32,
    pub facing_x: f32,
    pub facing_y: f32,
    pub score: u32,
    pub world_w: f32,
    pub world_h: f32,
    pub level: u32,
    pub owned: Vec<OwnedItem>,
    pub gold: u32,
    pub runes: Vec<RuneSlot>,
    pub theme: String,
    pub difficulty: String,
    pub equipped: Vec<EquippedItem>,
    pub skill_levels: Vec<SkillLevel>,
    pub skill_points: u32,
    pub exp: u32,
    pub class: String,
    pub town: String,
    pub materials: Vec<(String, u32)>,
    pub passives: Vec<(String, u32)>,
    pub mode: String,
}

/// v10 → v11: 补 scene 默认 dungeon (旧行为: 读档一律进地下城)
fn migrate_v10(v10: SaveDataV10) -> SaveData {
    SaveData {
        player_x: v10.player_x,
        player_y: v10.player_y,
        player_hp: v10.player_hp,
        player_mp: v10.player_mp,
        facing_x: v10.facing_x,
        facing_y: v10.facing_y,
        score: v10.score,
        world_w: v10.world_w,
        world_h: v10.world_h,
        level: v10.level,
        owned: v10.owned,
        gold: v10.gold,
        runes: v10.runes,
        theme: v10.theme,
        difficulty: v10.difficulty,
        equipped: v10.equipped,
        skill_levels: v10.skill_levels,
        skill_points: v10.skill_points,
        exp: v10.exp,
        class: v10.class,
        town: v10.town,
        materials: v10.materials,
        passives: v10.passives,
        mode: v10.mode,
        scene: "dungeon".into(),
    }
}

/// v9 兼容结构 (无 mode 字段)
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
struct SaveDataV9 {
    pub player_x: f32,
    pub player_y: f32,
    pub player_hp: f32,
    pub player_mp: f32,
    pub facing_x: f32,
    pub facing_y: f32,
    pub score: u32,
    pub world_w: f32,
    pub world_h: f32,
    pub level: u32,
    pub owned: Vec<OwnedItem>,
    pub gold: u32,
    pub runes: Vec<RuneSlot>,
    pub theme: String,
    pub difficulty: String,
    pub equipped: Vec<EquippedItem>,
    pub skill_levels: Vec<SkillLevel>,
    pub skill_points: u32,
    pub exp: u32,
    pub class: String,
    pub town: String,
    pub materials: Vec<(String, u32)>,
    pub passives: Vec<(String, u32)>,
}

/// v8 兼容结构 (无 passives 字段)
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
struct SaveDataV8 {
    pub player_x: f32,
    pub player_y: f32,
    pub player_hp: f32,
    pub player_mp: f32,
    pub facing_x: f32,
    pub facing_y: f32,
    pub score: u32,
    pub world_w: f32,
    pub world_h: f32,
    pub level: u32,
    pub owned: Vec<OwnedItem>,
    pub gold: u32,
    pub runes: Vec<RuneSlot>,
    pub theme: String,
    pub difficulty: String,
    pub equipped: Vec<EquippedItem>,
    pub skill_levels: Vec<SkillLevel>,
    pub skill_points: u32,
    pub exp: u32,
    pub class: String,
    pub town: String,
    pub materials: Vec<(String, u32)>,
}

/// v7 兼容结构 (无 materials 字段)
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
struct SaveDataV7 {
    pub player_x: f32,
    pub player_y: f32,
    pub player_hp: f32,
    pub player_mp: f32,
    pub facing_x: f32,
    pub facing_y: f32,
    pub score: u32,
    pub world_w: f32,
    pub world_h: f32,
    pub level: u32,
    pub owned: Vec<OwnedItem>,
    pub gold: u32,
    pub runes: Vec<RuneSlot>,
    pub theme: String,
    pub difficulty: String,
    pub equipped: Vec<EquippedItem>,
    pub skill_levels: Vec<SkillLevel>,
    pub skill_points: u32,
    pub exp: u32,
    pub class: String,
    pub town: String,
}

/// v6 兼容结构 (无 town 字段)
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
struct SaveDataV6 {
    pub player_x: f32,
    pub player_y: f32,
    pub player_hp: f32,
    pub player_mp: f32,
    pub facing_x: f32,
    pub facing_y: f32,
    pub score: u32,
    pub world_w: f32,
    pub world_h: f32,
    pub level: u32,
    pub owned: Vec<OwnedItem>,
    pub gold: u32,
    pub runes: Vec<RuneSlot>,
    pub theme: String,
    pub difficulty: String,
    pub equipped: Vec<EquippedItem>,
    pub skill_levels: Vec<SkillLevel>,
    pub skill_points: u32,
    pub exp: u32,
    pub class: String,
}

/// v5 兼容结构 (无 class 字段)
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
struct SaveDataV5 {
    pub player_x: f32,
    pub player_y: f32,
    pub player_hp: f32,
    pub player_mp: f32,
    pub facing_x: f32,
    pub facing_y: f32,
    pub score: u32,
    pub world_w: f32,
    pub world_h: f32,
    pub level: u32,
    pub owned: Vec<OwnedItem>,
    pub gold: u32,
    pub runes: Vec<RuneSlot>,
    pub theme: String,
    pub difficulty: String,
    pub equipped: Vec<EquippedItem>,
    pub skill_levels: Vec<SkillLevel>,
    pub skill_points: u32,
    pub exp: u32,
}

/// 角色 id 白名单: 仅字母数字下划线, 防路径穿越
pub fn sanitize_char_id(id: &str) -> String {
    let cleaned: String = id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
        .take(32)
        .collect();
    if cleaned.is_empty() {
        CURRENT_CHAR.to_string()
    } else {
        cleaned
    }
}

fn save_path(char_id: &str) -> Result<PathBuf, String> {
    let id = sanitize_char_id(char_id);
    let mut p = dirs::data_local_dir().ok_or("no data_local_dir")?;
    p.push("voidbound");
    p.push("saves");
    fs::create_dir_all(&p).map_err(|e| format!("mkdir saves: {e}"))?;
    p.push(format!("{id}.bin"));
    Ok(p)
}

/// 旧版单档路径 (v1-v4): 首次读后迁移到 saves/char_0.bin
fn legacy_path() -> Result<PathBuf, String> {
    let mut p = dirs::data_local_dir().ok_or("no data_local_dir")?;
    p.push("voidbound");
    fs::create_dir_all(&p).map_err(|e| format!("mkdir: {e}"))?;
    p.push("save.bin");
    Ok(p)
}

fn migrate_v1(v1: SaveDataV1) -> SaveData {
    SaveData {
        player_x: v1.player_x,
        player_y: v1.player_y,
        player_hp: v1.player_hp,
        player_mp: v1.player_mp,
        facing_x: v1.facing_x,
        facing_y: v1.facing_y,
        score: v1.score,
        world_w: v1.world_w,
        world_h: v1.world_h,
        level: v1.level,
        owned: v1
            .owned
            .into_iter()
            .map(|o| OwnedItem {
                name: o.name,
                rarity: o.rarity,
                affixes: o.affixes,
                set_name: o.set_name,
                eq_type: "weapon".into(),
            })
            .collect(),
        gold: v1.gold,
        runes: v1
            .runes
            .into_iter()
            .map(|(slot, rune)| RuneSlot { slot, rune })
            .collect(),
        theme: v1.theme,
        difficulty: v1.difficulty,
        equipped: Vec::new(),
        skill_levels: Vec::new(),
        skill_points: 0,
        exp: 0,
        class: "barbarian".into(),
        town: "greenwing".into(),
        materials: Vec::new(),
        passives: Vec::new(),
        mode: "linear".into(),
        scene: "dungeon".into(),
    }
}

fn migrate_v2(v2: SaveDataV2) -> SaveData {
    SaveData {
        player_x: v2.player_x,
        player_y: v2.player_y,
        player_hp: v2.player_hp,
        player_mp: v2.player_mp,
        facing_x: v2.facing_x,
        facing_y: v2.facing_y,
        score: v2.score,
        world_w: v2.world_w,
        world_h: v2.world_h,
        level: v2.level,
        owned: v2.owned,
        gold: v2.gold,
        runes: v2.runes,
        theme: v2.theme,
        difficulty: v2.difficulty,
        equipped: v2.equipped,
        skill_levels: Vec::new(),
        skill_points: 0,
        exp: 0,
        class: "barbarian".into(),
        town: "greenwing".into(),
        materials: Vec::new(),
        passives: Vec::new(),
        mode: "linear".into(),
        scene: "dungeon".into(),
    }
}

fn migrate_v3(v3: SaveDataV3) -> SaveData {
    SaveData {
        player_x: v3.player_x,
        player_y: v3.player_y,
        player_hp: v3.player_hp,
        player_mp: v3.player_mp,
        facing_x: v3.facing_x,
        facing_y: v3.facing_y,
        score: v3.score,
        world_w: v3.world_w,
        world_h: v3.world_h,
        level: v3.level,
        owned: v3.owned,
        gold: v3.gold,
        runes: v3.runes,
        theme: v3.theme,
        difficulty: v3.difficulty,
        equipped: v3.equipped,
        skill_levels: Vec::new(),
        skill_points: 0,
        exp: 0,
        class: "barbarian".into(),
        town: "greenwing".into(),
        materials: Vec::new(),
        passives: Vec::new(),
        mode: "linear".into(),
        scene: "dungeon".into(),
    }
}

/// v4 → v5: 丢弃 cleared/best (调用方负责写入 account.json)

/// v5 → v6: 补 class 默认 barbarian
fn migrate_v5(v5: SaveDataV5) -> SaveData {
    SaveData {
        player_x: v5.player_x,
        player_y: v5.player_y,
        player_hp: v5.player_hp,
        player_mp: v5.player_mp,
        facing_x: v5.facing_x,
        facing_y: v5.facing_y,
        score: v5.score,
        world_w: v5.world_w,
        world_h: v5.world_h,
        level: v5.level,
        owned: v5.owned,
        gold: v5.gold,
        runes: v5.runes,
        theme: v5.theme,
        difficulty: v5.difficulty,
        equipped: v5.equipped,
        skill_levels: v5.skill_levels,
        skill_points: v5.skill_points,
        exp: v5.exp,
        class: "barbarian".into(),
        town: "greenwing".into(),
        materials: Vec::new(),
        passives: Vec::new(),
        mode: "linear".into(),
        scene: "dungeon".into(),
    }
}

fn migrate_v4(v4: SaveDataV4) -> SaveData {
    SaveData {
        player_x: v4.player_x,
        player_y: v4.player_y,
        player_hp: v4.player_hp,
        player_mp: v4.player_mp,
        facing_x: v4.facing_x,
        facing_y: v4.facing_y,
        score: v4.score,
        world_w: v4.world_w,
        world_h: v4.world_h,
        level: v4.level,
        owned: v4.owned,
        gold: v4.gold,
        runes: v4.runes,
        theme: v4.theme,
        difficulty: v4.difficulty,
        equipped: v4.equipped,
        skill_levels: v4.skill_levels,
        skill_points: v4.skill_points,
        exp: v4.exp,
        class: "barbarian".into(),
        town: "greenwing".into(),
        materials: Vec::new(),
        passives: Vec::new(),
        mode: "linear".into(),
        scene: "dungeon".into(),
    }
}

/// v6 → v7: 补 town 默认 greenwing
fn migrate_v6(v6: SaveDataV6) -> SaveData {
    SaveData {
        player_x: v6.player_x,
        player_y: v6.player_y,
        player_hp: v6.player_hp,
        player_mp: v6.player_mp,
        facing_x: v6.facing_x,
        facing_y: v6.facing_y,
        score: v6.score,
        world_w: v6.world_w,
        world_h: v6.world_h,
        level: v6.level,
        owned: v6.owned,
        gold: v6.gold,
        runes: v6.runes,
        theme: v6.theme,
        difficulty: v6.difficulty,
        equipped: v6.equipped,
        skill_levels: v6.skill_levels,
        skill_points: v6.skill_points,
        exp: v6.exp,
        class: v6.class,
        town: "greenwing".into(),
        materials: Vec::new(),
        passives: Vec::new(),
        mode: "linear".into(),
        scene: "dungeon".into(),
    }
}

/// v7 → v8: 补 materials 空
fn migrate_v7(v7: SaveDataV7) -> SaveData {
    SaveData {
        player_x: v7.player_x,
        player_y: v7.player_y,
        player_hp: v7.player_hp,
        player_mp: v7.player_mp,
        facing_x: v7.facing_x,
        facing_y: v7.facing_y,
        score: v7.score,
        world_w: v7.world_w,
        world_h: v7.world_h,
        level: v7.level,
        owned: v7.owned,
        gold: v7.gold,
        runes: v7.runes,
        theme: v7.theme,
        difficulty: v7.difficulty,
        equipped: v7.equipped,
        skill_levels: v7.skill_levels,
        skill_points: v7.skill_points,
        exp: v7.exp,
        class: v7.class,
        town: v7.town,
        materials: Vec::new(),
        passives: Vec::new(),
        mode: "linear".into(),
        scene: "dungeon".into(),
    }
}

/// v8 → v9: 补 passives 空
fn migrate_v8(v8: SaveDataV8) -> SaveData {
    SaveData {
        player_x: v8.player_x,
        player_y: v8.player_y,
        player_hp: v8.player_hp,
        player_mp: v8.player_mp,
        facing_x: v8.facing_x,
        facing_y: v8.facing_y,
        score: v8.score,
        world_w: v8.world_w,
        world_h: v8.world_h,
        level: v8.level,
        owned: v8.owned,
        gold: v8.gold,
        runes: v8.runes,
        theme: v8.theme,
        difficulty: v8.difficulty,
        equipped: v8.equipped,
        skill_levels: v8.skill_levels,
        skill_points: v8.skill_points,
        exp: v8.exp,
        class: v8.class,
        town: v8.town,
        materials: v8.materials,
        passives: Vec::new(),
        mode: "linear".into(),
        scene: "dungeon".into(),
    }
}

/// v9 → v10: 补 mode 空 (默认 linear)
fn migrate_v9(v9: SaveDataV9) -> SaveData {
    SaveData {
        player_x: v9.player_x,
        player_y: v9.player_y,
        player_hp: v9.player_hp,
        player_mp: v9.player_mp,
        facing_x: v9.facing_x,
        facing_y: v9.facing_y,
        score: v9.score,
        world_w: v9.world_w,
        world_h: v9.world_h,
        level: v9.level,
        owned: v9.owned,
        gold: v9.gold,
        runes: v9.runes,
        theme: v9.theme,
        difficulty: v9.difficulty,
        equipped: v9.equipped,
        skill_levels: v9.skill_levels,
        skill_points: v9.skill_points,
        exp: v9.exp,
        class: v9.class,
        town: v9.town,
        materials: v9.materials,
        passives: v9.passives,
        mode: "linear".into(),
        scene: "dungeon".into(),
    }
}

/// 原子写 + 备份 (OPT-030): tmp → 旧档备份 .bak → rename
fn write_atomic(p: &PathBuf, bytes: &[u8]) -> Result<(), String> {
    let tmp = p.with_extension("bin.tmp");
    fs::write(&tmp, bytes).map_err(|e| format!("write tmp: {e}"))?;
    if p.exists() {
        fs::copy(p, p.with_extension("bin.bak")).map_err(|e| format!("backup: {e}"))?;
    }
    fs::rename(&tmp, p).map_err(|e| format!("rename: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn save_game(data: SaveData, char_id: Option<String>) -> Result<String, String> {
    let id = char_id.as_deref().unwrap_or(CURRENT_CHAR);
    let id = sanitize_char_id(id);
    let p = save_path(&id)?;
    let mut bytes = vec![SAVE_FORMAT_VERSION];
    bytes.extend(bincode::serialize(&data).map_err(|e| format!("serialize: {e}"))?);
    write_atomic(&p, &bytes)?;
    log::info!(
        "save_game({id}): wrote {} bytes (owned={}, equipped={}, skill_levels={}) to {:?}",
        bytes.len(),
        data.owned.len(),
        data.equipped.len(),
        data.skill_levels.len(),
        p
    );
    Ok(format!("saved {} bytes", bytes.len()))
}

#[tauri::command]
pub fn load_game(char_id: Option<String>) -> Result<SaveData, String> {
    let id = char_id.as_deref().unwrap_or(CURRENT_CHAR);
    let id = sanitize_char_id(id);
    let p = save_path(&id)?;
    let (bytes, from_legacy) = if p.exists() {
        (fs::read(&p).map_err(|e| format!("read: {e}"))?, false)
    } else if id == CURRENT_CHAR {
        // 旧版单档路径兜底: 迁移后落新路径 (仅默认角色)
        let legacy = legacy_path()?;
        if !legacy.exists() {
            return Err("no save file (load_game)".into());
        }
        (fs::read(&legacy).map_err(|e| format!("read legacy: {e}"))?, true)
    } else {
        return Err(format!("no save file for {id}"));
    };
    if bytes.is_empty() {
        return Err("save file empty".into());
    }
    let (data, account) = decode_save(&bytes)?;
    // 旧档迁移: 落新路径 + 写账号层
    if from_legacy {
        let mut nb = vec![SAVE_FORMAT_VERSION];
        nb.extend(bincode::serialize(&data).map_err(|e| format!("serialize: {e}"))?);
        let _ = write_atomic(&p, &nb);
    }
    if let Some(acc) = account {
        let ap = dirs::data_local_dir().ok_or("no data_local_dir")?.join("voidbound");
        let _ = fs::create_dir_all(&ap);
        let jp = ap.join("account.json");
        if let Ok(json) = serde_json::to_vec_pretty(&acc) {
            let _ = fs::write(&jp, json);
        }
        log::info!("load_game: 迁移 v4 → v5, 账号层已写入 account.json");
    }
    log::info!(
        "load_game: v{}, {} bytes, owned={}, equipped={}, skill_levels={}",
        bytes[0],
        bytes.len(),
        data.owned.len(),
        data.equipped.len(),
        data.skill_levels.len()
    );
    Ok(data)
}

/// 删除角色 (C-202): 移除存档文件 + 从账号层角色列表剔除
#[tauri::command]
pub fn delete_character(char_id: String) -> Result<String, String> {
    let id = sanitize_char_id(&char_id);
    let p = save_path(&id)?;
    if p.exists() {
        fs::remove_file(&p).map_err(|e| format!("remove {id}: {e}"))?;
    }
    let mut acc = crate::account::load_account().unwrap_or_default();
    acc.characters.retain(|c| sanitize_char_id(c) != id);
    if acc.last_char == id {
        acc.last_char = acc
            .characters
            .first()
            .map(|c| c.clone())
            .unwrap_or_else(|| CURRENT_CHAR.to_string());
    }
    crate::account::save_account(acc)?;
    log::info!("delete_character({id}): save removed, account updated");
    Ok(format!("deleted {id}"))
}

/// 角色摘要 (C-202 角色管理屏): id + 职业/等级/难度/主题 (从各档首部解码)
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct CharacterSummary {
    pub id: String,
    pub class: String,
    pub level: u32,
    pub difficulty: String,
    pub theme: String,
    /// 最近游玩时间 (unix 秒, 存档文件 mtime; 0 = 未知)
    #[serde(default)]
    pub last_played: u64,
    /// 上次场景 (存档 v11): dungeon/town; 无档/旧档默认 dungeon (TS-003 标题卡片)
    #[serde(default)]
    pub scene: String,
}

/// 角色列表 (C-201): 读 account.characters + 各档摘要; 无存档的角色跳过摘要字段用默认
#[tauri::command]
pub fn list_characters() -> Result<Vec<CharacterSummary>, String> {
    let acc = crate::account::load_account().unwrap_or_default();
    let mut ids = acc.characters.clone();
    if ids.is_empty() {
        ids.push(CURRENT_CHAR.to_string());
    }
    let mut out = Vec::new();
    for id in ids {
        let id = sanitize_char_id(&id);
        // 最近游玩时间 = 存档文件 mtime (每次保存自动更新, 零 schema 迁移)
        let last_played = match save_path(&id) {
            Ok(p) if p.exists() => fs::metadata(&p)
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0),
            _ => 0,
        };
        let summary = match save_path(&id) {
            Ok(p) if p.exists() => match fs::read(&p) {
                Ok(bytes) if !bytes.is_empty() => match decode_save(&bytes) {
                    Ok((data, _)) => CharacterSummary {
                        class: data.class,
                        level: data.level,
                        difficulty: data.difficulty,
                        theme: data.theme,
                        scene: data.scene,
                        id,
                        last_played,
                    },
                    Err(_) => CharacterSummary {
                        class: "barbarian".into(),
                        level: 1,
                        difficulty: "normal".into(),
                        theme: "forest".into(),
                        scene: "dungeon".into(),
                        id,
                        last_played,
                    },
                },
                _ => CharacterSummary {
                    class: "barbarian".into(),
                    level: 1,
                    difficulty: "normal".into(),
                    theme: "forest".into(),
                    scene: "dungeon".into(),
                    id,
                    last_played,
                },
            },
            _ => CharacterSummary {
                class: "barbarian".into(),
                level: 1,
                difficulty: "normal".into(),
                theme: "forest".into(),
                scene: "dungeon".into(),
                id,
                last_played,
            },
        };
        out.push(summary);
    }
    log::info!("list_characters: {} chars", out.len());
    Ok(out)
}

/// 版本分发解码: 返回 (SaveData, Option<账号层迁移数据>)
fn decode_save(bytes: &[u8]) -> Result<(SaveData, Option<crate::account::AccountData>), String> {
    match bytes[0] {
        SAVE_FORMAT_VERSION => {
            let data: SaveData = bincode::deserialize(&bytes[1..])
                .map_err(|e| format!("v11 deserialize failed: {e}"))?;
            Ok((data, None))
        }
        10 => match bincode::deserialize::<SaveDataV10>(&bytes[1..]) {
            Ok(v10) => Ok((migrate_v10(v10), None)),
            Err(e) => Err(format!("v10 deserialize failed: {e}")),
        },
        9 => match bincode::deserialize::<SaveDataV9>(&bytes[1..]) {
            Ok(v9) => Ok((migrate_v9(v9), None)),
            Err(e) => Err(format!("v9 deserialize failed: {e}")),
        },
        8 => match bincode::deserialize::<SaveDataV8>(&bytes[1..]) {
            Ok(v8) => Ok((migrate_v8(v8), None)),
            Err(e) => Err(format!("v8 deserialize failed: {e}")),
        },
        7 => match bincode::deserialize::<SaveDataV7>(&bytes[1..]) {
            Ok(v7) => Ok((migrate_v7(v7), None)),
            Err(e) => Err(format!("v7 deserialize failed: {e}")),
        },
        6 => match bincode::deserialize::<SaveDataV6>(&bytes[1..]) {
            Ok(v6) => Ok((migrate_v6(v6), None)),
            Err(e) => Err(format!("v6 deserialize failed: {e}")),
        },
        5 => match bincode::deserialize::<SaveDataV5>(&bytes[1..]) {
            Ok(v5) => Ok((migrate_v5(v5), None)),
            Err(e) => Err(format!("v5 deserialize failed: {e}")),
        },
        4 => match bincode::deserialize::<SaveDataV4>(&bytes[1..]) {
            Ok(v4) => {
                let acc = crate::account::AccountData {
                    cleared: v4.cleared.clone(),
                    best: v4.best.clone(),
                    characters: vec![CURRENT_CHAR.to_string()],
                    last_char: CURRENT_CHAR.to_string(),
                    legacy: Vec::new(),
                    warehouse: Vec::new(),
                };
                Ok((migrate_v4(v4), Some(acc)))
            }
            Err(e) => Err(format!("v4 deserialize failed: {e}")),
        },
        3 => match bincode::deserialize::<SaveDataV3>(&bytes[1..]) {
            Ok(v3) => Ok((migrate_v3(v3), None)),
            Err(e) => Err(format!("v3 deserialize failed: {e}")),
        },
        2 => match bincode::deserialize::<SaveDataV2>(&bytes[1..]) {
            Ok(v2) => Ok((migrate_v2(v2), None)),
            Err(e) => Err(format!("v2 deserialize failed: {e}")),
        },
        1 | 0 => Err(format!("未知存档版本 ({}), 请删除后重开", bytes[0])),
        _ => match bincode::deserialize::<SaveDataV1>(&bytes[..]) {
            Ok(v1) => Ok((migrate_v1(v1), None)),
            Err(_) => Err(format!("未知存档格式 (version byte = {}), 旧档无法识别", bytes[0])),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_v5() -> SaveData {
        SaveData {
            player_x: 123.0,
            player_y: 456.0,
            player_hp: 80.0,
            player_mp: 100.0,
            facing_x: 1.0,
            facing_y: 0.0,
            score: 42,
            world_w: 20480.0,
            world_h: 11520.0,
            level: 3,
            gold: 250,
            owned: vec![OwnedItem {
                name: "烈焰之牙".into(),
                rarity: "set".into(),
                set_name: Some("shadow_set".into()),
                affixes: vec![
                    OwnedAffix { stat: "physPct".into(), value: 0.25, element: None },
                    OwnedAffix { stat: "res".into(), value: 12.0, element: Some("fire".into()) },
                ],
                eq_type: "weapon".into(),
            }],
            runes: vec![RuneSlot { slot: "Q".into(), rune: "split".into() }],
            theme: "forest".into(),
            difficulty: "nightmare".into(),
            equipped: vec![EquippedItem {
                slot: "ring".into(),
                item: OwnedItem {
                    name: "暗影之戒".into(),
                    rarity: "rare".into(),
                    set_name: None,
                    affixes: vec![OwnedAffix { stat: "critBonus".into(), value: 15.0, element: None }],
                    eq_type: "ring".into(),
                },
            }],
            skill_levels: vec![
                SkillLevel { slot: "Q".into(), level: 12 },
                SkillLevel { slot: "R".into(), level: 7 },
            ],
            skill_points: 5,
            exp: 1800,
            class: "mage".into(),
            town: "harbor".into(),
            materials: vec![("iron_shard".into(), 3), ("arcane_core".into(), 1)],
            passives: vec![("critRate".into(), 4), ("speed".into(), 2)],
            mode: "linear".into(),
            scene: "dungeon".into(),
        }
    }

    fn sample_v4() -> SaveDataV4 {
        let v5 = sample_v5();
        SaveDataV4 {
            player_x: v5.player_x,
            player_y: v5.player_y,
            player_hp: v5.player_hp,
            player_mp: v5.player_mp,
            facing_x: v5.facing_x,
            facing_y: v5.facing_y,
            score: v5.score,
            world_w: v5.world_w,
            world_h: v5.world_h,
            level: v5.level,
            owned: v5.owned,
            gold: v5.gold,
            runes: v5.runes,
            theme: v5.theme,
            difficulty: v5.difficulty,
            equipped: v5.equipped,
            cleared: vec!["forest".into(), "desert".into()],
            best: vec![BestTime { difficulty: "normal".into(), ms: 93000 }],
            skill_levels: v5.skill_levels,
            skill_points: v5.skill_points,
            exp: v5.exp,
        }
    }

    #[test]
    fn save_roundtrip_preserves_all_fields_v6() {
        let data = sample_v5();
        let mut bytes = vec![SAVE_FORMAT_VERSION];
        bytes.extend(bincode::serialize(&data).expect("serialize"));
        assert_eq!(bytes[0], SAVE_FORMAT_VERSION, "版本头必须为 11");
        let back: SaveData = bincode::deserialize(&bytes[1..]).expect("deserialize");
        assert_eq!(data, back);
        assert_eq!(back.skill_levels[0].level, 12);
        assert_eq!(back.skill_points, 5);
        assert_eq!(back.exp, 1800);
        assert_eq!(back.class, "mage", "职业字段 v6 往返");
        assert_eq!(back.town, "harbor", "城镇字段 v7 往返");
        assert_eq!(back.materials[0], ("iron_shard".into(), 3), "材料字段 v8 往返");
        assert_eq!(back.passives[0], ("critRate".into(), 4), "被动字段 v9 往返");
        assert_eq!(back.mode, "linear", "模式字段 v10 往返");
    }

    #[test]
    fn migrate_v5_to_v6_defaults_class() {
        let v6 = sample_v5();
        let v5 = SaveDataV5 {
            player_x: v6.player_x,
            player_y: v6.player_y,
            player_hp: v6.player_hp,
            player_mp: v6.player_mp,
            facing_x: v6.facing_x,
            facing_y: v6.facing_y,
            score: v6.score,
            world_w: v6.world_w,
            world_h: v6.world_h,
            level: v6.level,
            owned: v6.owned,
            gold: v6.gold,
            runes: v6.runes,
            theme: v6.theme,
            difficulty: v6.difficulty,
            equipped: v6.equipped,
            skill_levels: v6.skill_levels,
            skill_points: v6.skill_points,
            exp: v6.exp,
        };
        let mut v5_bytes = vec![5u8];
        v5_bytes.extend(bincode::serialize(&v5).unwrap());
        let (out, account) = decode_save(&v5_bytes).unwrap();
        assert_eq!(out.class, "barbarian", "v5 → v6 默认野蛮人");
        assert!(account.is_none());
    }

    #[test]
    fn migrate_v6_to_v7_defaults_town() {
        let v7 = sample_v5();
        let v6 = SaveDataV6 {
            player_x: v7.player_x,
            player_y: v7.player_y,
            player_hp: v7.player_hp,
            player_mp: v7.player_mp,
            facing_x: v7.facing_x,
            facing_y: v7.facing_y,
            score: v7.score,
            world_w: v7.world_w,
            world_h: v7.world_h,
            level: v7.level,
            owned: v7.owned,
            gold: v7.gold,
            runes: v7.runes,
            theme: v7.theme,
            difficulty: v7.difficulty,
            equipped: v7.equipped,
            skill_levels: v7.skill_levels,
            skill_points: v7.skill_points,
            exp: v7.exp,
            class: v7.class,
        };
        let mut v6_bytes = vec![6u8];
        v6_bytes.extend(bincode::serialize(&v6).unwrap());
        let (out, account) = decode_save(&v6_bytes).unwrap();
        assert_eq!(out.class, "mage", "v6 → v7 保留职业");
        assert_eq!(out.town, "greenwing", "v6 → v7 默认新手镇");
        assert!(account.is_none());
    }

    #[test]
    fn migrate_v7_to_v8_defaults_materials() {
        let v8 = sample_v5();
        let v7 = SaveDataV7 {
            player_x: v8.player_x,
            player_y: v8.player_y,
            player_hp: v8.player_hp,
            player_mp: v8.player_mp,
            facing_x: v8.facing_x,
            facing_y: v8.facing_y,
            score: v8.score,
            world_w: v8.world_w,
            world_h: v8.world_h,
            level: v8.level,
            owned: v8.owned,
            gold: v8.gold,
            runes: v8.runes,
            theme: v8.theme,
            difficulty: v8.difficulty,
            equipped: v8.equipped,
            skill_levels: v8.skill_levels,
            skill_points: v8.skill_points,
            exp: v8.exp,
            class: v8.class,
            town: v8.town,
        };
        let mut v7_bytes = vec![7u8];
        v7_bytes.extend(bincode::serialize(&v7).unwrap());
        let (out, account) = decode_save(&v7_bytes).unwrap();
        assert_eq!(out.town, "harbor", "v7 → v8 保留城镇");
        assert_eq!(out.class, "mage", "v7 → v8 保留职业");
        assert!(out.materials.is_empty(), "v7 → v8 材料默认空");
        assert!(account.is_none());
    }

    #[test]
    fn migrate_v8_to_v9_defaults_passives() {
        let v9 = sample_v5();
        let v8 = SaveDataV8 {
            player_x: v9.player_x,
            player_y: v9.player_y,
            player_hp: v9.player_hp,
            player_mp: v9.player_mp,
            facing_x: v9.facing_x,
            facing_y: v9.facing_y,
            score: v9.score,
            world_w: v9.world_w,
            world_h: v9.world_h,
            level: v9.level,
            owned: v9.owned,
            gold: v9.gold,
            runes: v9.runes,
            theme: v9.theme,
            difficulty: v9.difficulty,
            equipped: v9.equipped,
            skill_levels: v9.skill_levels,
            skill_points: v9.skill_points,
            exp: v9.exp,
            class: v9.class,
            town: v9.town,
            materials: v9.materials,
        };
        let mut v8_bytes = vec![8u8];
        v8_bytes.extend(bincode::serialize(&v8).unwrap());
        let (out, account) = decode_save(&v8_bytes).unwrap();
        assert_eq!(out.town, "harbor", "v8 → v9 保留城镇");
        assert_eq!(out.materials[0], ("iron_shard".into(), 3), "v8 → v9 保留材料");
        assert!(out.passives.is_empty(), "v8 → v9 被动默认空");
        assert!(account.is_none());
    }

    #[test]
    fn migrate_v9_to_v10_defaults_mode() {
        let v10 = sample_v5();
        let v9 = SaveDataV9 {
            player_x: v10.player_x,
            player_y: v10.player_y,
            player_hp: v10.player_hp,
            player_mp: v10.player_mp,
            facing_x: v10.facing_x,
            facing_y: v10.facing_y,
            score: v10.score,
            world_w: v10.world_w,
            world_h: v10.world_h,
            level: v10.level,
            owned: v10.owned,
            gold: v10.gold,
            runes: v10.runes,
            theme: v10.theme,
            difficulty: v10.difficulty,
            equipped: v10.equipped,
            skill_levels: v10.skill_levels,
            skill_points: v10.skill_points,
            exp: v10.exp,
            class: v10.class,
            town: v10.town,
            materials: v10.materials,
            passives: v10.passives.clone(),
        };
        let mut v9_bytes = vec![9u8];
        v9_bytes.extend(bincode::serialize(&v9).unwrap());
        let (out, account) = decode_save(&v9_bytes).unwrap();
        assert_eq!(out.town, "harbor", "v9 → v10 保留城镇");
        assert_eq!(out.mode, "linear", "v9 → v10 模式默认 linear");
        assert_eq!(out.passives, v10.passives, "v9 → v10 保留被动");
        assert!(account.is_none());
    }

    #[test]
    fn migrate_v4_to_v5_extracts_account() {
        let v4 = sample_v4();
        let mut v4_bytes = vec![4u8];
        v4_bytes.extend(bincode::serialize(&v4).unwrap());
        let (v5, account) = decode_save(&v4_bytes).unwrap();
        assert_eq!(v5.level, 3);
        assert_eq!(v5.skill_points, 5);
        assert_eq!(v5.exp, 1800);
        assert_eq!(v5.equipped[0].slot, "ring");
        assert_eq!(v5.class, "barbarian", "v4 → v6 默认野蛮人");
        let acc = account.expect("v4 迁移必须产出账号层");
        assert_eq!(acc.cleared, vec!["forest".to_string(), "desert".to_string()]);
        assert_eq!(acc.best[0].ms, 93000);
        assert_eq!(acc.characters, vec!["char_0".to_string()]);
    }

    #[test]
    fn migrate_v1_to_v5_keeps_progression() {
        let v1 = SaveDataV1 {
            player_x: 123.456, // LE 首字节 0x79, 避开版本号 1-5 区间 (headerless 检测)
            player_y: 2.0,
            player_hp: 50.0,
            player_mp: 60.0,
            facing_x: 0.0,
            facing_y: 1.0,
            score: 7,
            world_w: 20480.0,
            world_h: 11520.0,
            level: 5,
            owned: vec![OwnedItemV1 {
                name: "古龙之牙".into(),
                rarity: "magic".into(),
                affixes: vec![],
                set_name: None,
            }],
            gold: 99,
            runes: vec![("R".into(), "homing".into())],
            theme: "ruin".into(),
            difficulty: "hell".into(),
        };
        let v1_bytes = bincode::serialize(&v1).unwrap();
        let (v5, account) = decode_save(&v1_bytes).unwrap();
        assert_eq!(v5.level, 5);
        assert_eq!(v5.owned[0].eq_type, "weapon");
        assert_eq!(v5.runes[0].rune, "homing");
        assert!(account.is_none());
    }

    #[test]
    fn unknown_version_reports_error() {
        let data = sample_v5();
        let mut bytes = vec![99u8];
        bytes.extend(bincode::serialize(&data).unwrap());
        let v = bytes[0];
        let is_v5 = bytes[0] == SAVE_FORMAT_VERSION;
        let is_v1 = bincode::deserialize::<SaveDataV1>(&bytes[..]).is_ok();
        assert!(!is_v5, "version byte {v} 不应按 v5 解码");
        assert!(!is_v1, "v5 载荷带 99 头不应被误判为 v1 旧档");
    }

    #[test]
    fn save_roundtrip_volume_and_level() {
        let data = sample_v5();
        let bytes = bincode::serialize(&data).unwrap();
        assert!(bytes.len() > 0 && bytes.len() < 16384, "bytes={}", bytes.len());
        assert_eq!(data.level, 3);
        assert_eq!(data.player_hp, 80.0);
    }

    #[test]
    fn sanitize_char_id_filters_unsafe() {
        assert_eq!(sanitize_char_id("char_0"), "char_0");
        assert_eq!(sanitize_char_id("mage_1"), "mage_1");
        assert_eq!(sanitize_char_id("../evil"), "evil");
        assert_eq!(sanitize_char_id(""), CURRENT_CHAR);
        assert_eq!(sanitize_char_id("a/b\\c:d"), "abcd");
        assert_eq!(sanitize_char_id("x".repeat(64).as_str()).len(), 32, "id 截断到 32");
    }

    #[test]
    fn multi_char_save_load_roundtrip() {
        // 不同角色写不同档: 互不覆盖
        let a = sample_v5();
        let mut b = a.clone();
        b.class = "assassin".into();
        b.level = 9;

        let pa = save_path("char_0").unwrap();
        let pb = save_path("ranger_2").unwrap();
        // 用内存往返验证 (写真实路径需要 data_local_dir, 测试环境可能无)
        let enc = |d: &SaveData| {
            let mut bytes = vec![SAVE_FORMAT_VERSION];
            bytes.extend(bincode::serialize(d).unwrap());
            bytes
        };
        let da = enc(&a);
        let db = enc(&b);
        assert_ne!(pa, pb, "不同角色档路径不同");
        let back_a: SaveData = bincode::deserialize(&da[1..]).unwrap();
        let back_b: SaveData = bincode::deserialize(&db[1..]).unwrap();
        assert_eq!(back_a.class, "mage");
        assert_eq!(back_b.class, "assassin");
        assert_eq!(back_b.level, 9);
        assert_ne!(back_a, back_b);
    }

    #[test]
    fn decode_save_rejects_unknown_version() {
        let mut bytes = vec![42u8];
        bytes.extend(bincode::serialize(&sample_v5()).unwrap());
        let r = decode_save(&bytes);
        assert!(r.is_err(), "未知版本必须报错不 panic");
    }

    #[test]
    fn delete_character_sanitizes_and_targets_path() {
        // 路径隔离: 恶意 id 经 sanitize 后不逃逸 saves/ 目录
        let p = save_path("../evil").unwrap();
        let pn = p.to_string_lossy().to_string();
        assert!(pn.contains("evil.bin"), "sanitize 后仍指向 saves/evil.bin: {pn}");
        assert!(!pn.contains(".."), "不允许路径穿越: {pn}");
        // 删除不存在的角色: 不 panic, 返回成功 (文件不存在跳过)
        let r = delete_character("no_such_char_xyz".into());
        assert!(r.is_ok(), "删除不存在角色应成功(幂等): {r:?}");
    }
}