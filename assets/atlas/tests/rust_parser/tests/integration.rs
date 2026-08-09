//! Voidbound atlas .bin 集成测试
//! 实际读取 pack_atlas.py 生成的 characters.bin 并解析

use std::path::PathBuf;
use voidbound_atlas_parser::*;

fn find_bin() -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop(); // tests/rust_parser -> tests
    p.pop(); // tests -> atlas
    p.push("output");
    p.push("characters.bin");
    p
}

#[test]
fn test_parse_real_atlas_bin() {
    let path = find_bin();
    assert!(
        path.exists(),
        "characters.bin 不存在,请先运行: python pack_atlas.py characters --rust-bin"
    );

    let data = std::fs::read(&path).expect("读取 .bin 失败");
    let atlas = parse(&data).expect("解析 .bin 失败");

    // 基本字段
    assert_eq!(atlas.version, 1);
    assert!(atlas.width > 0, "宽度应为正");
    assert!(atlas.height > 0, "高度应为正");
    assert!(atlas.sprite_count_expected() > 0, "sprite 数应为正");

    // 至少 6 个 sprite(6 职业 × 至少 stand)
    assert!(
        atlas.sprite_count_expected() >= 6,
        "应至少有 6 个 sprite(6 职业),实际 {}",
        atlas.sprite_count_expected()
    );

    // 找到 barbarian_walk(Kenney 真资源是单帧,不是拼接动画)
    let walk = atlas.find("barbarian_walk").expect("应该找到 barbarian_walk");
    assert_eq!(walk.frame_width, 16);
    assert_eq!(walk.frame_height, 16);
    assert_eq!(walk.frames, 1, "Kenney walk tile 是单帧,不是拼接动画");
    assert!(!walk.is_animated(), "Kenney walk tile 非动画");

    // 找到 barbarian_stand
    let stand = atlas.find("barbarian_stand").expect("应该找到 barbarian_stand");
    assert_eq!(stand.frames, 1);
    assert!(!stand.is_animated());

    // 找到 6 职业(全部至少 stand)
    for class_name in ["barbarian", "paladin", "sorceress", "necromancer", "ranger", "assassin"] {
        atlas
            .find(&format!("{class_name}_stand"))
            .unwrap_or_else(|| panic!("缺少 {class_name}_stand"));
    }

    // PNG 字节有效(以 PNG magic 开头)
    assert!(atlas.image_png.len() > 8);
    assert_eq!(
        &atlas.image_png[..8],
        &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A],
        "PNG magic 字节不匹配"
    );

    println!(
        "OK: parsed atlas {}x{}, {} sprites, {} bytes PNG",
        atlas.width,
        atlas.height,
        atlas.sprite_count_expected(),
        atlas.image_png.len()
    );
}

#[test]
fn test_find_returns_none_for_missing() {
    let path = find_bin();
    let data = std::fs::read(&path).unwrap();
    let atlas = parse(&data).unwrap();

    assert!(atlas.find("nonexistent_sprite").is_none());
}

#[test]
fn test_all_sprites_have_valid_coords() {
    let path = find_bin();
    let data = std::fs::read(&path).unwrap();
    let atlas = parse(&data).unwrap();

    for s in &atlas.sprites {
        assert!(s.x < atlas.width, "{} x={} >= width={}", s.name, s.x, atlas.width);
        assert!(s.y < atlas.height, "{} y={} >= height={}", s.name, s.y, atlas.height);
        assert!(s.frame_width > 0, "{} frame_width=0", s.name);
        assert!(s.frame_height > 0, "{} frame_height=0", s.name);
        assert!(s.frames > 0, "{} frames=0", s.name);
    }
}

// --- 扩展方法(主 crate 没实现) ---
trait AtlasExt {
    fn sprite_count_expected(&self) -> usize;
}

impl AtlasExt for Atlas {
    fn sprite_count_expected(&self) -> usize {
        self.sprites.len()
    }
}