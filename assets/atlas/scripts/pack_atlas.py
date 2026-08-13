#!/usr/bin/env python3
"""
Voidbound 图集打包脚本
功能:
  1. 把 input/ 下的 PNG 拼成 sprite atlas (单图集 PNG)
  2. 生成 JSON 元数据(每个 sprite 的位置/尺寸/动画)
  3. 可选:生成 Rust 端能用的二进制 .bin (含 CRC + 压缩)

用法:
  python pack_atlas.py characters              # 拼角色图集
  python pack_atlas.py characters --rust-out characters.bin   # 输出 .bin
  python pack_atlas.py all                     # 拼所有图集
  python pack_atlas.py --dry-run characters    # 仅看布局,不写文件
"""

import argparse
import json
import struct
import sys
import zlib
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("缺少依赖: Pillow. 安装: pip install pillow")
    sys.exit(1)


# ============== 配置 ==============

SCRIPT_DIR = Path(__file__).parent
ATLAS_DIR = SCRIPT_DIR.parent
INPUT_DIR = ATLAS_DIR / "input"
OUTPUT_DIR = ATLAS_DIR / "output"

# 贴图最大尺寸(像素)
MAX_SHEET_SIZE = 4096

# Padding(防 bleed)
PADDING = 2


# ============== 核心 ==============


def collect_sprites(input_subdir: Path) -> list[dict]:
    """收集子目录下所有 PNG,推断 sprite 元数据

    Returns:
        list of dicts: [
          {"path": Path, "name": str, "width": int, "height": int,
           "frames": int, "is_animated": bool}
        ]
    """
    if not input_subdir.exists():
        return []

    sprites = []
    for png in sorted(input_subdir.glob("*.png")):
        img = Image.open(png)
        # 文件名约定: <name>_<state>[_<theme>].png
        # 例: barbarian_walk.png (4 帧横向) -> width = 64 (4*16)
        # 例: sorceress_stand.png (1 帧) -> width = 16
        stem = png.stem
        parts = stem.split("_")

        # 推断帧数: 如果宽度 > 高度,可能是横向多帧
        frames = 1
        if img.width > img.height and img.width % img.height == 0:
            frames = img.width // img.height

        sprites.append({
            "path": png,
            "name": stem,
            "file": png.name,
            "width": img.width,
            "height": img.height,
            "frame_width": img.width // frames if frames > 0 else img.width,
            "frame_height": img.height,
            "frames": frames,
            "is_animated": frames > 1,
        })

    return sprites


def pack_sprites(sprites: list[dict], strategy: str = "horizontal") -> dict:
    """把 sprites 排成图集

    strategy:
      - "horizontal": 每个 sprite 一行(适合动画)
      - "vertical":   每个 sprite 一列
      - "grid":       自动网格

    Returns:
        {"image": PIL.Image, "layout": [sprite_dict_with_pos], "size": (w, h)}
    """
    if not sprites:
        return None

    if strategy == "horizontal":
        # 每个 sprite 一行
        max_h = max(s["height"] for s in sprites)
        total_w = sum(s["width"] + PADDING * 2 for s in sprites) + PADDING
        total_h = max_h + PADDING * 2

    elif strategy == "grid":
        # 自动算列数,使其尽量接近正方形
        total_area = sum(s["width"] * s["height"] for s in sprites)
        cols = max(1, int((total_area ** 0.5) / 64))
        rows = (len(sprites) + cols - 1) // cols
        cell_w = max(s["width"] for s in sprites)
        cell_h = max(s["height"] for s in sprites)
        total_w = cell_w * cols + PADDING * (cols + 1)
        # 按实际换行模拟真实行数 (宽度参差时实际行数 ≥ 估算值, 防垂直溢出)
        sim_w = PADDING
        sim_rows = 1
        for s in sprites:
            if sim_w > PADDING and sim_w + s["width"] + PADDING * 2 > total_w:
                sim_rows += 1
                sim_w = PADDING
            sim_w += s["width"] + PADDING * 2
        total_h = PADDING + (sim_rows - 1) * (cell_h + PADDING * 2) + cell_h + PADDING

    else:
        raise ValueError(f"未知策略: {strategy}")

    if total_w > MAX_SHEET_SIZE:
        print(f"⚠ 警告: 图集宽度 {total_w} 超过 {MAX_SHEET_SIZE},自动切换为 grid")
        return pack_sprites(sprites, strategy="grid")

    atlas = Image.new("RGBA", (total_w, total_h), (0, 0, 0, 0))
    layout = []
    cursor_x = PADDING
    cursor_y = PADDING
    is_grid = strategy == "grid"

    for s in sprites:
        # grid 模式: 一行放满 cell_w*cols 后换行 (原实现从不换行 →
        # 超宽 sprite 被裁出图集, 但 meta 记录越界 x → 运行时 UV>1 采右边缘, 全部破图)
        if is_grid and cursor_x > PADDING and cursor_x + s["width"] + PADDING * 2 > total_w:
            cursor_x = PADDING
            cursor_y += cell_h + PADDING * 2
        img = Image.open(s["path"]).convert("RGBA")
        atlas.paste(img, (cursor_x, cursor_y))
        layout.append({
            **s,
            "x": cursor_x,
            "y": cursor_y,
        })
        cursor_x += s["width"] + PADDING * 2

    return {
        "image": atlas,
        "layout": layout,
        "size": (total_w, total_h),
    }


def write_json(atlas_name: str, result: dict, output_path: Path) -> None:
    """写入 JSON 元数据"""
    meta = {
        "atlas": atlas_name,
        "size": {"width": result["size"][0], "height": result["size"][1]},
        "sprite_count": len(result["layout"]),
        "sprites": [
            {
                "name": s["name"],
                "file": s["file"],
                "x": s["x"],
                "y": s["y"],
                "frame_width": s["frame_width"],
                "frame_height": s["frame_height"],
                "frames": s["frames"],
                "is_animated": s["is_animated"],
            }
            for s in result["layout"]
        ],
    }
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    print(f"  JSON: {output_path}")


def write_rust_bin(result: dict, output_path: Path) -> None:
    """写入 Rust 端能用的二进制格式

    Format (little-endian):
      [magic 4B: b"VATL"]
      [version u32]
      [atlas_width u32]
      [atlas_height u32]
      [sprite_count u32]
      For each sprite:
        [name_len u8] [name bytes UTF-8]
        [x u32] [y u32] [frame_w u32] [frame_h u32] [frames u32]
      [image_data_len u32]
      [zlib_compressed_png_bytes]
      [crc32 u32]
    """
    image = result["image"]
    # PNG bytes
    from io import BytesIO
    buf = BytesIO()
    image.save(buf, "PNG", optimize=True)
    png_bytes = buf.getvalue()
    compressed = zlib.compress(png_bytes, level=9)

    out = bytearray()
    out.extend(b"VATL")  # magic
    out.extend(struct.pack("<I", 1))  # version
    out.extend(struct.pack("<II", result["size"][0], result["size"][1]))

    layout = result["layout"]
    out.extend(struct.pack("<I", len(layout)))

    for s in layout:
        name_bytes = s["name"].encode("utf-8")
        out.append(len(name_bytes))
        out.extend(name_bytes)
        out.extend(struct.pack("<IIIII",
            s["x"], s["y"],
            s["frame_width"], s["frame_height"],
            s["frames"]
        ))

    out.extend(struct.pack("<I", len(compressed)))
    out.extend(compressed)

    # CRC32
    crc = zlib.crc32(bytes(out)) & 0xffffffff
    out.extend(struct.pack("<I", crc))

    output_path.write_bytes(bytes(out))
    print(f"  BIN:  {output_path} ({len(out)} bytes, PNG {len(png_bytes)} -> zlib {len(compressed)})")


def write_rust_loader(atlas_name: str, result: dict, output_path: Path) -> None:
    """生成 Rust 端加载代码骨架"""
    layout = result["layout"]

    # 构造 sprite JSON 列表(必须在 f-string 外部)
    sprites_json = json.dumps([
        {
            "name": s["name"],
            "x": s["x"],
            "y": s["y"],
            "frame_width": s["frame_width"],
            "frame_height": s["frame_height"],
            "frames": s["frames"],
            "is_animated": s["is_animated"],
        }
        for s in layout
    ], indent=2)

    struct_name = atlas_name.capitalize()
    const_name = atlas_name.upper()

    code = f'''// Auto-generated by pack_atlas.py - DO NOT EDIT
// Atlas: {atlas_name}
// Size: {result["size"][0]}x{result["size"][1]}
// Sprite count: {len(layout)}

use serde::{{Deserialize, Serialize}};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpriteMeta {{
    pub name: String,
    pub x: u32,
    pub y: u32,
    pub frame_width: u32,
    pub frame_height: u32,
    pub frames: u32,
    pub is_animated: bool,
}}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct {struct_name}Atlas {{
    pub size: (u32, u32),
    pub sprites: Vec<SpriteMeta>,
}}

pub const {const_name}_SPRITES: &str = r#"{sprites_json}"#;

impl {struct_name}Atlas {{
    pub fn find(&self, name: &str) -> Option<&SpriteMeta> {{
        self.sprites.iter().find(|s| s.name == name)
    }}
}}
'''

    output_path.write_text(code, encoding="utf-8")
    print(f"  RUST: {output_path}")


def validate_layout(atlas_name: str, result: dict) -> None:
    """构建期自校验: sprite 坐标必须在图集内, uv≤1, 无重名 — 防坏数据进游戏

    历史事故: grid 分支从不换行, 坐标越界但照写 .bin → 运行时 uv.x>1 → CLAMP 采右边缘
    (ui/icons/monsters/particles 全炸)。任何越界直接报错退出, 不产出 .bin。
    """
    w, h = result["size"]
    layout = result["layout"]
    names = [s["name"] for s in layout]
    dups = {n for n in names if names.count(n) > 1}
    bad: list[str] = []
    if dups:
        bad.append(f"重复 sprite 名: {sorted(dups)}")
    for s in layout:
        if s["x"] < 0 or s["y"] < 0:
            bad.append(f"{s['name']} 负坐标 ({s['x']},{s['y']})")
        elif s["x"] + s["frame_width"] > w:
            bad.append(f"{s['name']} x 超界 {s['x']}+{s['frame_width']}>{w}")
        elif s["y"] + s["frame_height"] > h:
            bad.append(f"{s['name']} y 超界 {s['y']}+{s['frame_height']}>{h}")
        elif w > 0 and (s["x"] + s["frame_width"]) / w > 1.0001:
            bad.append(f"{s['name']} uv.x 超界 {(s['x'] + s['frame_width']) / w:.4f}")
    if bad:
        print(f"✗ {atlas_name}: 布局校验失败 ({len(bad)} 项):")
        for b in bad[:10]:
            print(f"    - {b}")
        raise SystemExit(f"布局校验失败: {atlas_name} — 未产出 .bin/.png/.json")
    print(f"  ✓ 校验: {len(layout)} sprites 全部在界内, uv≤1, 无重名")


def process_atlas(atlas_name: str, dry_run: bool = False, rust_bin: bool = False, rust_loader: bool = False) -> None:
    """处理一个图集"""
    input_subdir = INPUT_DIR / atlas_name
    if not input_subdir.exists():
        print(f"⚠ 输入目录不存在: {input_subdir}")
        return

    sprites = collect_sprites(input_subdir)
    if not sprites:
        print(f"⚠ {atlas_name}: 无 PNG 文件")
        return

    print(f"\n{'=' * 60}")
    print(f"图集: {atlas_name}")
    print(f"  sprite 数: {len(sprites)}")
    print(f"  动画 sprite: {sum(1 for s in sprites if s['is_animated'])}")
    total_area = sum(s["width"] * s["height"] for s in sprites)
    print(f"  原始总面积: {total_area:,} px^2")
    print(f"{'=' * 60}")

    result = pack_sprites(sprites, strategy="horizontal")
    print(f"  图集尺寸: {result['size'][0]}x{result['size'][1]}")

    # 构建期自校验 (越界/重名 → 直接退出, 不产出坏 .bin)
    validate_layout(atlas_name, result)

    if dry_run:
        print("  (干跑,不写文件)")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    atlas_path = OUTPUT_DIR / f"{atlas_name}.png"
    result["image"].save(atlas_path, "PNG", optimize=True)
    print(f"  PNG:  {atlas_path}")

    json_path = OUTPUT_DIR / f"{atlas_name}.json"
    write_json(atlas_name, result, json_path)

    if rust_bin:
        bin_path = OUTPUT_DIR / f"{atlas_name}.bin"
        write_rust_bin(result, bin_path)

    if rust_loader:
        loader_path = OUTPUT_DIR / f"{atlas_name}_loader.rs"
        write_rust_loader(atlas_name, result, loader_path)


def main():
    parser = argparse.ArgumentParser(description="Voidbound 图集打包工具")
    parser.add_argument(
        "target",
        nargs="?",
        default="all",
        help="图集名(对应 input/<name>/) 或 'all'",
    )
    parser.add_argument("--dry-run", action="store_true", help="仅显示布局,不写文件")
    parser.add_argument("--rust-bin", action="store_true", help="额外输出 .bin (Rust 端二进制)")
    parser.add_argument("--rust-loader", action="store_true", help="额外输出 Rust loader 代码")
    args = parser.parse_args()

    print("Voidbound 图集打包器")
    print(f"  输入: {INPUT_DIR}")
    print(f"  输出: {OUTPUT_DIR}")
    print()

    if args.target == "all":
        # 处理所有子目录
        if not INPUT_DIR.exists():
            print(f"X 输入目录不存在: {INPUT_DIR}")
            print(f"  请创建子目录: {INPUT_DIR}/<atlas_name>/")
            print(f"  并放入 PNG 文件")
            sys.exit(1)
        subdirs = [d.name for d in INPUT_DIR.iterdir() if d.is_dir()]
        if not subdirs:
            print(f"X {INPUT_DIR} 下无子目录")
            print(f"  请创建 {INPUT_DIR}/characters/, monsters/, tiles/ 等")
            sys.exit(1)
        for name in sorted(subdirs):
            process_atlas(name, args.dry_run, args.rust_bin, args.rust_loader)
    else:
        process_atlas(args.target, args.dry_run, args.rust_bin, args.rust_loader)

    print()


if __name__ == "__main__":
    main()