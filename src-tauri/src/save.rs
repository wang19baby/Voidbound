// 存档系统: bincode 序列化核心字段到 save.bin
// 路径: dirs::data_local_dir()/voidbound/save.bin

use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SaveData {
    pub player_x: f32,
    pub player_y: f32,
    pub player_hp: f32,
    pub player_mp: f32,
    pub facing_x: f32,
    pub facing_y: f32,
    pub score: u32,
    pub world_w: f32,
    pub world_h: f32,
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
    log::info!("save_game: wrote {} bytes to {:?}", bytes.len(), p);
    Ok(format!("saved {} bytes", bytes.len()))
}

#[tauri::command]
pub fn load_game() -> Result<SaveData, String> {
    let p = save_path()?;
    if !p.exists() {
        return Err("no save file".into());
    }
    let bytes = fs::read(&p).map_err(|e| format!("read: {e}"))?;
    let data: SaveData = bincode::deserialize(&bytes).map_err(|e| format!("deserialize: {e}"))?;
    log::info!("load_game: {} bytes, pos=({},{})", bytes.len(), data.player_x, data.player_y);
    Ok(data)
}