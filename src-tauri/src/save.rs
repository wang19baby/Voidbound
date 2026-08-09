// 存档系统: bincode 序列化核心字段到 save.bin (US-003 分层)
// 路径: dirs::data_local_dir()/voidbound/save.bin
// 角色层: level / owned(装备) / combat 可重建 (recomputeCombat)
// 永久层: runes (技能符文绑定), theme
// 本局层: pos / hp / mp / score

use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

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
    // 角色层 (US-003)
    pub level: u32,
    pub owned: Vec<OwnedItem>,
    // 永久层
    pub runes: Vec<(String, String)>,
    pub theme: String,
}

fn save_path() -> Result<PathBuf, String> {
    let mut p = dirs::data_local_dir().ok_or("no data_local_dir")?;
    p.push("voidbound");
    fs::create_dir_all(&p).map_err(|e| format!("mkdir: {e}"))?;
    p.push("save.bin");
    Ok(p)
}

#[tauri::command]
pub fn save_game(data: SaveData) -> Result<String, String> {
    let p = save_path()?;
    let bytes = bincode::serialize(&data).map_err(|e| format!("serialize: {e}"))?;
    fs::write(&p, &bytes).map_err(|e| format!("write: {e}"))?;
    log::info!("save_game: wrote {} bytes (owned={}, runes={}, theme={}) to {:?}", bytes.len(), data.owned.len(), data.runes.len(), data.theme, p);
    Ok(format!("saved {} bytes", bytes.len()))
}

#[tauri::command]
pub fn load_game() -> Result<SaveData, String> {
    let p = save_path()?;
    if !p.exists() {
        return Err("no save file (load_game)".into());
    }
    let bytes = fs::read(&p).map_err(|e| format!("read: {e}"))?;
    // bincode 无版本头: 旧版 M1 存档字段不同 → 反序列化失败, 报明确错误 (US-003 接受: 旧档重开)
    let data: SaveData = bincode::deserialize(&bytes)
        .map_err(|e| format!("deserialize failed (旧版存档需重新开始): {e}"))?;
    log::info!("load_game: {} bytes, pos=({},{}), owned={}, runes={}", bytes.len(), data.player_x, data.player_y, data.owned.len(), data.runes.len());
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> SaveData {
        SaveData {
            player_x: 123.0, player_y: 456.0,
            player_hp: 80.0, player_mp: 100.0,
            facing_x: 1.0, facing_y: 0.0,
            score: 42, world_w: 20480.0, world_h: 11520.0,
            level: 3,
            owned: vec![OwnedItem {
                name: "烈焰之牙".into(),
                rarity: "set".into(),
                set_name: Some("shadow_set".into()),
                affixes: vec![
                    OwnedAffix { stat: "physPct".into(), value: 0.25, element: None },
                    OwnedAffix { stat: "res".into(), value: 12.0, element: Some("fire".into()) },
                ],
            }],
            runes: vec![("Q".into(), "split".into())],
            theme: "forest".into(),
        }
    }

    #[test]
    fn save_roundtrip_preserves_all_fields() {
        let data = sample();
        let bytes = bincode::serialize(&data).expect("serialize");
        let back: SaveData = bincode::deserialize(&bytes).expect("deserialize");
        assert_eq!(data, back);
        assert_eq!(back.owned.len(), 1);
        assert_eq!(back.owned[0].affixes.len(), 2);
        assert_eq!(back.owned[0].set_name.as_deref(), Some("shadow_set"));
        assert_eq!(back.runes, vec![("Q".to_string(), "split".to_string())]);
        assert_eq!(back.theme, "forest");
    }

    #[test]
    fn save_roundtrip_volume_and_level_inside_f32_range() {
        let data = sample();
        let bytes = bincode::serialize(&data).unwrap();
        let back: SaveData = bincode::deserialize(&bytes).unwrap();
        assert_eq!(back.player_hp, 80.0);
        assert_eq!(back.level, 3);
        assert!(bytes.len() > 0 && bytes.len() < 8192, "bytes={}", bytes.len());
    }
}