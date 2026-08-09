//! 图集加载与缓存
//!
//! 职责:
//!   1. 读取 `assets/atlas/output/<name>.bin`
//!   2. 调 `voidbound_atlas_parser::parse` 解码
//!   3. 把 PNG 字节 + sprite 元数据交给前端

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

use base64::Engine;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use voidbound_atlas_parser::{parse, Atlas, SpriteMeta};

/// Atlas 根目录(由 `tauri.conf.json` 的资源映射指向 `assets/atlas/output`)
///
/// 默认指向编译期 `CARGO_MANIFEST_DIR/../assets/atlas/output`, 保证从 src-tauri/ 启动也能找到。
/// 也可通过 `VB_ATLAS_DIR` 环境变量覆盖。
fn default_atlas_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("VB_ATLAS_DIR") {
        return PathBuf::from(dir);
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("assets")
        .join("atlas")
        .join("output")
}

/// 单个已加载图集(发往前端的 payload)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadedAtlas {
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub sprites: Vec<SpriteMeta>,
    /// PNG 字节(base64 编码后由 serde 传给 Web 端)
    pub image_png_b64: String,
}

impl LoadedAtlas {
    pub fn from_atlas(name: String, atlas: &Atlas) -> Self {
        let image_png_b64 = base64::engine::general_purpose::STANDARD.encode(&atlas.image_png);
        Self {
            name,
            width: atlas.width,
            height: atlas.height,
            sprites: atlas.sprites.clone(),
            image_png_b64,
        }
    }
}

/// 加载错误
#[derive(Debug, Error)]
pub enum AtlasLoadError {
    #[error("图集目录不存在: {0}")]
    DirNotFound(PathBuf),
    #[error("图集文件不存在: {0}")]
    FileNotFound(PathBuf),
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),
    #[error("解析错误: {0}")]
    Parse(#[from] voidbound_atlas_parser::AtlasError),
}

/// 图集注册表:进程内缓存,避免重复 IO + 解析
/// Atlas 在 parser crate 中没有 derive Clone,我们缓存 sprite 元数据 + 解压 PNG bytes
#[derive(Debug, Default)]
pub struct AtlasRegistry {
    root: PathBuf,
    cache: RwLock<HashMap<String, CachedAtlas>>,
}

/// 缓存项:可克隆的最小视图
#[derive(Debug, Clone)]
pub(crate) struct CachedAtlas {
    width: u32,
    height: u32,
    sprites: Vec<SpriteMeta>,
    image_png: Vec<u8>,
}

impl CachedAtlas {
    fn from(atlas: &Atlas) -> Self {
        Self {
            width: atlas.width,
            height: atlas.height,
            sprites: atlas.sprites.clone(),
            image_png: atlas.image_png.clone(),
        }
    }

    fn to_loaded(&self, name: &str) -> LoadedAtlas {
        let image_png_b64 = base64::engine::general_purpose::STANDARD.encode(&self.image_png);
        LoadedAtlas {
            name: name.to_string(),
            width: self.width,
            height: self.height,
            sprites: self.sprites.clone(),
            image_png_b64,
        }
    }
}

impl AtlasRegistry {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            cache: RwLock::new(HashMap::new()),
        }
    }

    pub fn with_default_dir() -> Self {
        Self::new(default_atlas_dir())
    }

    /// 加载并解析图集(命中缓存直接返回底层视图)
    pub(crate) fn load_cached(&self, name: &str) -> Result<CachedAtlas, AtlasLoadError> {
        if let Some(cached) = self.cache.read().unwrap().get(name).cloned() {
            return Ok(cached);
        }
        let path = self.bin_path(name);
        if !path.exists() {
            return Err(AtlasLoadError::FileNotFound(path));
        }
        let data = fs::read(&path)?;
        let atlas = parse(&data)?;
        let cached = CachedAtlas::from(&atlas);
        self.cache
            .write()
            .unwrap()
            .insert(name.to_string(), cached.clone());
        Ok(cached)
    }

    /// 加载并转换为前端 payload(PNG → base64)
    pub fn load_for_frontend(&self, name: &str) -> Result<LoadedAtlas, AtlasLoadError> {
        let cached = self.load_cached(name)?;
        Ok(cached.to_loaded(name))
    }

    /// 列出目录下所有 .bin 图集
    pub fn list(&self) -> Result<Vec<String>, AtlasLoadError> {
        if !self.root.exists() {
            return Err(AtlasLoadError::DirNotFound(self.root.clone()));
        }
        let mut names: Vec<String> = fs::read_dir(&self.root)?
            .filter_map(|e| e.ok())
            .filter_map(|e| {
                let path = e.path();
                if path.extension().and_then(|s| s.to_str()) == Some("bin") {
                    path.file_stem()
                        .and_then(|s| s.to_str())
                        .map(|s| s.to_string())
                } else {
                    None
                }
            })
            .collect();
        names.sort();
        Ok(names)
    }

    fn bin_path(&self, name: &str) -> PathBuf {
        self.root.join(format!("{name}.bin"))
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project_root() -> PathBuf {
        // tests run with cwd = crate root (src-tauri/)
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("assets")
            .join("atlas")
            .join("output")
    }

    #[test]
    fn registry_loads_characters() {
        let reg = AtlasRegistry::new(project_root());
        let cached = reg.load_cached("characters").expect("characters.bin 应存在");
        assert!(cached.width >= 100);
        assert!(cached.height >= 16);
        assert!(cached.sprites.iter().any(|s| s.name == "barbarian_stand"));
    }

    #[test]
    fn registry_payload_serializes_png() {
        let reg = AtlasRegistry::new(project_root());
        let payload = reg
            .load_for_frontend("characters")
            .expect("characters 加载失败");
        assert_eq!(payload.name, "characters");
        assert!(!payload.image_png_b64.is_empty());
        // PNG magic after base64 decode
        let raw = base64::engine::general_purpose::STANDARD
            .decode(&payload.image_png_b64)
            .unwrap();
        assert_eq!(&raw[..8], &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]);
    }

    #[test]
    fn registry_lists_known_atlases() {
        let reg = AtlasRegistry::new(project_root());
        let names = reg.list().expect("应能列出图集");
        for expected in ["characters", "ui", "particles", "icons"] {
            assert!(
                names.iter().any(|n| n == expected),
                "missing atlas: {expected}, have {names:?}"
            );
        }
    }
}