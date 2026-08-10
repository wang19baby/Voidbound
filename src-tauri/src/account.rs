// 账号层存档 (OPT-029): 跨角色永久进度, 独立于角色存档
// 路径: dirs::data_local_dir()/voidbound/account.json (serde_json)
// 内容: cleared(已通关主题) / best(分难度最佳时间) / characters(角色列表, UI 接入前为单角色)

use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

use crate::save::{BestTime, RuneSlot};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Default)]
pub struct AccountData {
    pub cleared: Vec<String>,
    pub best: Vec<BestTime>,
    pub characters: Vec<String>,
    /// 最近游玩角色 (C-203): 标题 [O] 直接进入
    pub last_char: String,
    /// 传承符文 (D-01/OPT-021 补完): 通关时槽位符文存入, 新局自动绑定
    pub legacy: Vec<RuneSlot>,
    /// 仓库 (C-503, 拍板 J5=b): 账号层共享, 跨角色可见; 上限 20
    pub warehouse: Vec<crate::save::OwnedItem>,
}

fn account_path() -> Result<PathBuf, String> {
    let mut p = dirs::data_local_dir().ok_or("no data_local_dir")?;
    p.push("voidbound");
    fs::create_dir_all(&p).map_err(|e| format!("mkdir: {e}"))?;
    p.push("account.json");
    Ok(p)
}

#[tauri::command]
pub fn save_account(data: AccountData) -> Result<String, String> {
    let p = account_path()?;
    let bytes = serde_json::to_vec_pretty(&data).map_err(|e| format!("serialize: {e}"))?;
    fs::write(&p, &bytes).map_err(|e| format!("write: {e}"))?;
    log::info!(
        "save_account: {} bytes (cleared={}, best={}, chars={})",
        bytes.len(),
        data.cleared.len(),
        data.best.len(),
        data.characters.len()
    );
    Ok(format!("account {} bytes", bytes.len()))
}

#[tauri::command]
pub fn load_account() -> Result<AccountData, String> {
    let p = account_path()?;
    if !p.exists() {
        return Ok(AccountData::default());
    }
    let bytes = fs::read(&p).map_err(|e| format!("read: {e}"))?;
    let data: AccountData =
        serde_json::from_slice(&bytes).map_err(|e| format!("json parse: {e}"))?;
    log::info!(
        "load_account: cleared={}, best={}, chars={}",
        data.cleared.len(),
        data.best.len(),
        data.characters.len()
    );
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::save::BestTime;

    #[test]
    fn account_roundtrip_json() {
        let data = AccountData {
            cleared: vec!["forest".into(), "desert".into()],
            best: vec![BestTime { difficulty: "normal".into(), ms: 93000 }],
            characters: vec!["char_0".into(), "mage_1".into()],
            last_char: "mage_1".into(),
            legacy: vec![RuneSlot { slot: "Q".into(), rune: "split".into() }],
            warehouse: vec![crate::save::OwnedItem {
                name: "仓库长枪".into(),
                rarity: "rare".into(),
                affixes: vec![],
                set_name: None,
                eq_type: "weapon".into(),
            }],
        };
        let bytes = serde_json::to_vec(&data).unwrap();
        let back: AccountData = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(data, back);
        assert_eq!(back.cleared.len(), 2);
        assert_eq!(back.best[0].ms, 93000);
        assert_eq!(back.legacy[0].slot, "Q");
        assert_eq!(back.legacy[0].rune, "split");
        assert_eq!(back.last_char, "mage_1");
        assert_eq!(back.warehouse[0].name, "仓库长枪");
    }

    #[test]
    fn account_default_empty() {
        let d = AccountData::default();
        assert!(d.cleared.is_empty());
        assert!(d.best.is_empty());
        assert!(d.characters.is_empty());
        assert_eq!(d.last_char, "");
        assert!(d.warehouse.is_empty());
    }
}
