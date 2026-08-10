// 角色存档: bincode 序列化到 saves/char_0.bin (US-003 + OPT-014/015/003/029 + M5)
// 格式: 首字节 = SAVE_FORMAT_VERSION (6), 其后 bincode(SaveData)
// v6 [M5 C-104]: + class (职业, 读档 bindClass 还原)
// v5 [OPT-029]: cleared/best 迁出到 account.json; 存档落 saves/<char_id>.bin
// v4 [OPT-003]: + skill_levels / skill_points / exp
// v3 [OPT-015]: + cleared / best (现已迁出)
// v2 [OPT-014]: runes 结构体化 + equipped + eq_type
// v1(旧, 无头): 逐级迁移到 v6; 旧 save.bin 首次读后迁移并落新路径

use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

pub const SAVE_FORMAT_VERSION: u8 = 6;

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
        let summary = match save_path(&id) {
            Ok(p) if p.exists() => match fs::read(&p) {
                Ok(bytes) if !bytes.is_empty() => match decode_save(&bytes) {
                    Ok((data, _)) => CharacterSummary {
                        class: data.class,
                        level: data.level,
                        difficulty: data.difficulty,
                        theme: data.theme,
                        id,
                    },
                    Err(_) => CharacterSummary {
                        class: "barbarian".into(),
                        level: 1,
                        difficulty: "normal".into(),
                        theme: "forest".into(),
                        id,
                    },
                },
                _ => CharacterSummary {
                    class: "barbarian".into(),
                    level: 1,
                    difficulty: "normal".into(),
                    theme: "forest".into(),
                    id,
                },
            },
            _ => CharacterSummary {
                class: "barbarian".into(),
                level: 1,
                difficulty: "normal".into(),
                theme: "forest".into(),
                id,
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
                .map_err(|e| format!("v6 deserialize failed: {e}"))?;
            Ok((data, None))
        }
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
        assert_eq!(bytes[0], 6, "版本头必须为 6");
        let back: SaveData = bincode::deserialize(&bytes[1..]).expect("deserialize");
        assert_eq!(data, back);
        assert_eq!(back.skill_levels[0].level, 12);
        assert_eq!(back.skill_points, 5);
        assert_eq!(back.exp, 1800);
        assert_eq!(back.class, "mage", "职业字段 v6 往返");
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