#!/usr/bin/env python3
"""
Voidbound 用户生成美术导入器
读取 import/<group>/ 下用户生成的 PNG → 品红抠图 / sheet 裁帧 / bbox 裁切 → 64x64 透明 PNG
→ 写入 assets/atlas/input/<group>/ (供 pack_atlas.py 重建图集)

规则:
  characters/<name>_stand.png   → 单帧 → input/characters/<name>_stand.png
  characters/<name>_walk.png    → 4 帧 sheet (宽≥1.8×高) → input/characters/<name>_walk_0..3.png
  monsters/<theme>/<type>.png   → 4 帧 sheet 或单帧 → input/monsters/<type>_0..3.png (与游戏 MonsterType 名一致)
  world/<name>.png              → tileable 瓦片 → input/world/<name>.png (整图, 不裁 bbox, 保无缝)

用法:
  python import_art.py --all
  python import_art.py characters
  python import_art.py --dry-run
"""

import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from gemini_generate import chroma_key_magenta  # noqa: E402

BASE = Path(__file__).parent.parent          # assets/ai-gen
IMPORT = BASE / "import"
ATLAS_IN = BASE.parent / "atlas" / "input"   # assets/atlas/input
SIZE = 64


def bbox_crop(img: Image.Image) -> Image.Image:
    """按 alpha 非零区域裁剪, 扩展为正方形 (居中)"""
    bbox = img.getchannel("A").getbbox()
    if bbox is None:
        return Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    x0, y0, x1, y1 = bbox
    w, h = x1 - x0, y1 - y0
    side = max(w, h)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    left = int(cx - side / 2)
    top = int(cy - side / 2)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    # 越界部分直接裁掉 (主体在画布中央)
    ox, oy = max(0, -left), max(0, -top)
    sx, sy = max(0, left), max(0, top)
    ex, ey = min(img.width, left + side), min(img.height, top + side)
    region = img.crop((sx, sy, ex, ey))
    canvas.paste(region, (ox + sx - left, oy + sy - top))
    return canvas.resize((SIZE, SIZE), Image.Resampling.NEAREST)


def save_frames(img: Image.Image, out_stem: Path, is_sheet: bool):
    out_stem.parent.mkdir(parents=True, exist_ok=True)
    rgba = chroma_key_magenta(img)
    if is_sheet:
        n = 4
        w = rgba.width // n
        for i in range(n):
            f = rgba.crop((i * w, 0, (i + 1) * w, rgba.height))
            f = bbox_crop(f)
            f.save(f"{out_stem}_{i}.png", format="PNG")
    else:
        rgba = bbox_crop(rgba)
        rgba.save(f"{out_stem}_0.png", format="PNG")


def process(path: Path, rel_dir: str) -> list[str]:
    """处理单个文件 → 输出文件列表"""
    name = path.stem
    img = Image.open(path).convert("RGBA")
    img.load()
    out_done: list[str] = []
    if rel_dir == "world":
        # 瓦片: 整图抠图缩放到 64 (不裁 bbox, 保 seamless)
        rgba = chroma_key_magenta(img).resize((SIZE, SIZE), Image.Resampling.NEAREST)
        out = ATLAS_IN / "world" / f"{name}.png"
        rgba.save(out, format="PNG")
        out_done.append(str(out.relative_to(BASE.parent)))
    elif rel_dir == "monsters":
        is_sheet = img.width >= img.height * 1.8
        # 清理旧帧残留 (防新旧混帧)
        for stale in ATLAS_IN.glob(f"monsters/{name}.png"):
            stale.unlink()
        for stale in ATLAS_IN.glob(f"monsters/{name}_*.png"):
            stale.unlink()
        out = ATLAS_IN / "monsters" / name
        save_frames(img, out, is_sheet)
        out_done.extend(str(p) for p in sorted(ATLAS_IN.glob(f"monsters/{name}_*.png")))
    elif rel_dir == "characters":
        # 站立单帧 → 以基础名保存 (游戏 pickPlayerSprite 用 sorceress_stand 无后缀)
        if name.endswith("_stand"):
            for stale in ATLAS_IN.glob(f"characters/{name}.png"):
                stale.unlink()
            rgba = bbox_crop(chroma_key_magenta(img))
            rgba.save(ATLAS_IN / "characters" / f"{name}.png", format="PNG")
            out_done.append(f"characters/{name}.png")
        else:
            # _walk sheet → _0..3
            for stale in ATLAS_IN.glob(f"characters/{name}_*.png"):
                stale.unlink()
            save_frames(img, ATLAS_IN / "characters" / name, True)
            out_done.extend(str(p) for p in sorted(ATLAS_IN.glob(f"characters/{name}_*.png")))
    return out_done


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Voidbound 美术导入")
    parser.add_argument("group", nargs="?", choices=["characters", "monsters", "world", "all"])
    parser.add_argument("--all", action="store_true", help="处理全部 (等价于省略参数)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    groups = ["characters", "monsters", "world"] if (args.all or args.group in (None, "all")) else [args.group]
    if not IMPORT.exists():
        sys.exit(f"import 目录不存在: {IMPORT} (请按 PROMPTS_USER.md 放置 PNG)")

    total = 0
    for g in groups:
        gdir = IMPORT / g
        if not gdir.exists():
            continue
        for p in sorted(gdir.rglob("*.png")):
            rel = p.relative_to(IMPORT).parts[0]
            if args.dry_run:
                print(f"[dry] {p.relative_to(IMPORT)} -> atlas/input/{rel}/")
                total += 1
                continue
            try:
                outs = process(p, rel)
                print(f"✓ {p.relative_to(IMPORT)} -> " + ", ".join(o.split('/')[-1] for o in outs))
                total += len(outs)
            except Exception as e:  # noqa: BLE001
                print(f"✗ {p.relative_to(IMPORT)}: {e}")
    print(f"共 {total} 个输出 {'(dry-run)' if args.dry_run else ''}")
    if not args.dry_run and total:
        print("下一步: python assets/atlas/scripts/pack_atlas.py all")


if __name__ == "__main__":
    main()