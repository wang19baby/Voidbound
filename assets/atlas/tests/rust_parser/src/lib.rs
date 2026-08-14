//! Voidbound sprite atlas .bin 格式解析器
//!
//! 格式说明(plain text, 非 doctest):
//!
//!   [magic 4B: b"VATL"]
//!   [version u32 little-endian]
//!   [atlas_width u32]
//!   [atlas_height u32]
//!   [sprite_count u32]
//!   For each sprite:
//!     [name_len u8]
//!     [name bytes UTF-8]
//!     [x u32] [y u32] [frame_w u32] [frame_h u32] [frames u32]
//!   [image_data_len u32]
//!   [zlib_compressed_png_bytes]
//!   [crc32 u32 little-endian]
//!
//! 由 `assets/atlas/scripts/pack_atlas.py` 生成。

#![cfg_attr(test, allow(dead_code))]

use std::fmt;

/// 自定义错误类型
#[derive(Debug)]
pub enum AtlasError {
    /// 文件 magic 不匹配
    BadMagic { expected: [u8; 4], actual: [u8; 4] },
    /// 版本不支持
    UnsupportedVersion(u32),
    /// 数据意外结束
    UnexpectedEof { needed: usize, got: usize },
    /// UTF-8 解码失败
    InvalidUtf8(std::string::FromUtf8Error),
    /// CRC32 校验失败
    CrcMismatch { stored: u32, calculated: u32 },
}

impl fmt::Display for AtlasError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::BadMagic { expected, actual } => write!(
                f,
                "Bad magic: expected {:?}, got {:?}",
                expected, actual
            ),
            Self::UnsupportedVersion(v) => write!(f, "Unsupported version: {}", v),
            Self::UnexpectedEof { needed, got } => write!(
                f,
                "Unexpected EOF: needed {} bytes, got {}",
                needed, got
            ),
            Self::InvalidUtf8(e) => write!(f, "Invalid UTF-8 in sprite name: {}", e),
            Self::CrcMismatch { stored, calculated } => write!(
                f,
                "CRC32 mismatch: stored {:#010x}, calculated {:#010x}",
                stored, calculated
            ),
        }
    }
}

impl std::error::Error for AtlasError {}

pub type Result<T> = std::result::Result<T, AtlasError>;

/// Magic 字节
pub const MAGIC: [u8; 4] = *b"VATL";
/// 当前支持的版本
pub const SUPPORTED_VERSION: u32 = 1;

/// 单个 sprite 的元数据
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpriteMeta {
    pub name: String,
    pub x: u32,
    pub y: u32,
    pub frame_width: u32,
    pub frame_height: u32,
    pub frames: u32,
}

impl SpriteMeta {
    pub fn is_animated(&self) -> bool {
        self.frames > 1
    }
}

/// 解析后的图集
#[derive(Debug)]
pub struct Atlas {
    pub version: u32,
    pub width: u32,
    pub height: u32,
    pub sprites: Vec<SpriteMeta>,
    /// 解压后的 PNG 字节(Rust 端可直接当 file:// 加载或用 image crate 解码)
    pub image_png: Vec<u8>,
}

impl Atlas {
    /// 按名字查找 sprite
    pub fn find(&self, name: &str) -> Option<&SpriteMeta> {
        self.sprites.iter().find(|s| s.name == name)
    }

    /// 按名字查找(忽略动画后缀)
    pub fn find_base(&self, name: &str) -> Option<&SpriteMeta> {
        // 支持 "barbarian_walk" 查 "barbarian_walk_0" 这种命名
        self.sprites.iter().find(|s| s.name.starts_with(name))
    }
}

/// 解析 .bin 字节
pub fn parse(data: &[u8]) -> Result<Atlas> {
    let mut cur = 0usize;

    // Helper: 检查剩余字节
    let need = |cur: usize, n: usize, total: usize| -> Result<()> {
        if cur + n > total {
            Err(AtlasError::UnexpectedEof {
                needed: n,
                got: total.saturating_sub(cur),
            })
        } else {
            Ok(())
        }
    };

    // Magic
    need(cur, 4, data.len())?;
    let mut magic = [0u8; 4];
    magic.copy_from_slice(&data[cur..cur + 4]);
    cur += 4;
    if magic != MAGIC {
        return Err(AtlasError::BadMagic {
            expected: MAGIC,
            actual: magic,
        });
    }

    // Version
    need(cur, 4, data.len())?;
    let version = u32::from_le_bytes(data[cur..cur + 4].try_into().unwrap());
    cur += 4;
    if version != SUPPORTED_VERSION {
        return Err(AtlasError::UnsupportedVersion(version));
    }

    // 尺寸
    need(cur, 8, data.len())?;
    let width = u32::from_le_bytes(data[cur..cur + 4].try_into().unwrap());
    let height = u32::from_le_bytes(data[cur + 4..cur + 8].try_into().unwrap());
    cur += 8;

    // Sprite 数量
    need(cur, 4, data.len())?;
    let sprite_count = u32::from_le_bytes(data[cur..cur + 4].try_into().unwrap());
    cur += 4;

    let mut sprites = Vec::with_capacity(sprite_count as usize);

    for _ in 0..sprite_count {
        // name_len
        need(cur, 1, data.len())?;
        let name_len = data[cur] as usize;
        cur += 1;

        // name
        need(cur, name_len, data.len())?;
        let name_bytes = data[cur..cur + name_len].to_vec();
        cur += name_len;
        let name = String::from_utf8(name_bytes).map_err(AtlasError::InvalidUtf8)?;

        // x, y, frame_w, frame_h, frames (5 个 u32 = 20 字节)
        need(cur, 20, data.len())?;
        let x = u32::from_le_bytes(data[cur..cur + 4].try_into().unwrap());
        let y = u32::from_le_bytes(data[cur + 4..cur + 8].try_into().unwrap());
        let frame_width = u32::from_le_bytes(data[cur + 8..cur + 12].try_into().unwrap());
        let frame_height = u32::from_le_bytes(data[cur + 12..cur + 16].try_into().unwrap());
        let frames = u32::from_le_bytes(data[cur + 16..cur + 20].try_into().unwrap());
        cur += 20;

        sprites.push(SpriteMeta {
            name,
            x,
            y,
            frame_width,
            frame_height,
            frames,
        });
    }

    // image_data_len
    need(cur, 4, data.len())?;
    let img_len = u32::from_le_bytes(data[cur..cur + 4].try_into().unwrap()) as usize;
    cur += 4;

    // image data
    need(cur, img_len, data.len())?;
    let compressed = &data[cur..cur + img_len];
    cur += img_len;

    // 解压 PNG(zlib)
    let mut decoder = flate2::read::ZlibDecoder::new(compressed);
    let mut image_png = Vec::new();
    use std::io::Read;
    decoder
        .read_to_end(&mut image_png)
        .map_err(|_| AtlasError::UnexpectedEof { needed: 0, got: 0 })?;

    // CRC32 - 注意:CRC 校验应覆盖到 CRC 字段之前的所有字节
    need(cur, 4, data.len())?;
    let crc_stored = u32::from_le_bytes(data[cur..cur + 4].try_into().unwrap());
    let crc_calc = crc32_fast(&data[..cur]);
    if crc_stored != crc_calc {
        return Err(AtlasError::CrcMismatch {
            stored: crc_stored,
            calculated: crc_calc,
        });
    }

    Ok(Atlas {
        version,
        width,
        height,
        sprites,
        image_png,
    })
}

/// 简单 CRC32 实现(table-based, IEEE polynomial)
pub fn crc32_fast(data: &[u8]) -> u32 {
    let mut table = [0u32; 256];
    for n in 0..256u32 {
        let mut c = n;
        for _ in 0..8 {
            c = if c & 1 != 0 {
                0xedb88320 ^ (c >> 1)
            } else {
                c >> 1
            };
        }
        table[n as usize] = c;
    }

    let mut crc = 0xffffffffu32;
    for &b in data {
        crc = table[((crc ^ b as u32) & 0xff) as usize] ^ (crc >> 8);
    }
    crc ^ 0xffffffff
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crc32_known_value() {
        // "123456789" 的 CRC32 = 0xCBF43926
        assert_eq!(crc32_fast(b"123456789"), 0xCBF43926);
    }

    #[test]
    fn test_crc32_empty() {
        assert_eq!(crc32_fast(b""), 0);
    }

    #[test]
    fn test_magic_constant() {
        assert_eq!(&MAGIC, b"VATL");
    }

    #[test]
    fn test_sprite_meta_is_animated() {
        let single = SpriteMeta {
            name: "a".into(),
            x: 0, y: 0,
            frame_width: 16, frame_height: 16,
            frames: 1,
        };
        assert!(!single.is_animated());

        let multi = SpriteMeta {
            name: "b".into(),
            x: 0, y: 0,
            frame_width: 16, frame_height: 16,
            frames: 4,
        };
        assert!(multi.is_animated());
    }

    #[test]
    fn test_parse_rejects_bad_magic() {
        let bad = b"XXXX\x01\x00\x00\x00";
        match parse(bad) {
            Err(AtlasError::BadMagic { .. }) => (),
            other => panic!("expected BadMagic, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_rejects_bad_version() {
        let mut bad = Vec::new();
        bad.extend(b"VATL");                   // magic
        bad.extend(99u32.to_le_bytes());      // version
        match parse(&bad) {
            Err(AtlasError::UnsupportedVersion(99)) => (),
            other => panic!("expected UnsupportedVersion, got {:?}", other),
        }
    }
}