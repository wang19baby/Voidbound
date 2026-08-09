#!/usr/bin/env python3
"""
Voidbound AI 生成素材后处理
功能:
  1. 缩放到 32x32 (或自定义)
  2. PIL 量化到主题调色板
  3. 透明背景处理
  4. 拼成 sprite sheet

用法:
  python post_process.py output/barbarian/ --palette forest --size 32
  python post_process.py output/barbarian/standing_forest_00.png --palette forest
  python post_process.py output/barbarian/ --sheet --cols 4
"""

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("缺少依赖: Pillow. 安装: pip install pillow")
    sys.exit(1)

try:
    import yaml
except ImportError:
    print("缺少依赖: pyyaml. 安装: pip install pyyaml")
    sys.exit(1)


# ============== 配置 ==============

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
SCRIPT_DIR = Path(__file__).parent.parent
DEFAULT_SIZE = 32


def load_palette(theme: str) -> list[tuple[int, int, int]]:
    """加载主题调色板 → RGB 列表"""
    palettes_file = PROMPTS_DIR / "palettes.yaml"
    if not palettes_file.exists():
        raise FileNotFoundError(f"调色板文件不存在: {palettes_file}")

    with open(palettes_file, encoding="utf-8") as f:
        data = yaml.safe_load(f)

    if theme not in data["palettes"]:
        raise ValueError(f"未知主题: {theme},可选: {list(data['palettes'].keys())}")

    hex_colors = data["palettes"][theme]["colors"]
    return [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in hex_colors]


def quantize_to_palette(img: Image.Image, palette_rgb: list[tuple]) -> Image.Image:
    """量化到指定调色板"""
    # 1. 创建调色板图像
    palette_img = Image.new("P", (1, 1))
    pal_data = []
    for r, g, b in palette_rgb:
        pal_data.extend([r, g, b])
    # 补齐 256 色
    while len(pal_data) < 768:
        pal_data.extend([0, 0, 0])
    palette_img.putpalette(pal_data)

    # 2. 转 RGBA → 量化
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    # 先量化到 16 色,再 palettize
    quantized = img.quantize(palette=palette_img, dither=Image.Dither.FLOYDSTEINBERG)
    return quantized


def resize_sprite(img: Image.Image, size: int) -> Image.Image:
    """缩放到目标尺寸,保持锐利(无插值)"""
    return img.resize((size, size), Image.Resampling.NEAREST)


def process_single(
    input_path: Path,
    output_path: Path,
    palette: list[tuple],
    size: int,
) -> None:
    """处理单张图"""
    img = Image.open(input_path)
    print(f"  读取: {input_path.name} ({img.size}, {img.mode})")

    img = resize_sprite(img, size)
    img = quantize_to_palette(img, palette)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, "PNG")
    print(f"  → {output_path} ({img.size})")


def make_sheet(images: list[Image.Image], cols: int, output_path: Path) -> None:
    """拼成 sprite sheet"""
    if not images:
        return
    w, h = images[0].size
    rows = (len(images) + cols - 1) // cols
    sheet = Image.new("RGBA", (w * cols, h * rows), (0, 0, 0, 0))
    for i, img in enumerate(images):
        r, c = divmod(i, cols)
        sheet.paste(img, (c * w, r * h))
    sheet.save(output_path, "PNG")
    print(f"  → sprite sheet: {output_path} ({sheet.size}, {rows} 行 × {cols} 列)")


def main():
    parser = argparse.ArgumentParser(description="Voidbound AI 素材后处理")
    parser.add_argument("input", help="输入图片或目录")
    parser.add_argument("--palette", default="forest", help="主题调色板 (forest/desert/frozen/void)")
    parser.add_argument("--size", type=int, default=DEFAULT_SIZE, help=f"目标尺寸 (默认 {DEFAULT_SIZE})")
    parser.add_argument("--output", help="输出目录(默认: input/_processed)")
    parser.add_argument("--sheet", action="store_true", help="拼成 sprite sheet")
    parser.add_argument("--cols", type=int, default=4, help="sheet 列数 (默认 4)")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"✗ 输入不存在: {input_path}")
        sys.exit(1)

    output_dir = Path(args.output) if args.output else input_path / "_processed"
    palette = load_palette(args.palette)
    print(f"调色板: {args.palette} ({len(palette)} 色)")
    print(f"目标尺寸: {args.size}x{args.size}")
    print(f"输出目录: {output_dir}")
    print()

    # 收集所有 PNG
    if input_path.is_dir():
        pngs = sorted(input_path.glob("*.png"))
        if not pngs:
            print(f"✗ 目录内无 PNG: {input_path}")
            sys.exit(1)
    else:
        pngs = [input_path]

    # 处理每张
    processed = []
    for png in pngs:
        if "_processed" in png.parts:
            continue
        out = output_dir / png.name
        try:
            process_single(png, out, palette, args.size)
            processed.append(Image.open(out))
        except Exception as e:
            print(f"  ✗ 失败 {png.name}: {e}")

    # 拼 sprite sheet
    if args.sheet and processed:
        sheet_path = output_dir / f"sheet_{input_path.name}.png"
        make_sheet(processed, args.cols, sheet_path)
        print()
        print(f"✓ 处理完成: {len(processed)} 张图,sheet: {sheet_path}")


if __name__ == "__main__":
    main()