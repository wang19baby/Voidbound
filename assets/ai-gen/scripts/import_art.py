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
SIZE = 64  # 默认输出贴图尺寸 (px); 可 --size 覆盖 (小怪/瓦片按显示尺寸烘焙)


def bbox_crop(img: Image.Image, size: int = SIZE) -> Image.Image:
    """按 alpha 非零区域裁剪, 扩展为正方形 (居中), 缩放到 size (降采样用 BOX 保质量)"""
    bbox = img.getchannel("A").getbbox()
    if bbox is None:
        return Image.new("RGBA", (size, size), (0, 0, 0, 0))
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
    if canvas.width == size:
        return canvas
    # 降采样用 BOX (像素平均), 升采样用 NEAREST (保持像素边)
    resample = Image.Resampling.BOX if canvas.width > size else Image.Resampling.NEAREST
    return canvas.resize((size, size), resample)


def save_frames(img: Image.Image, out_stem: Path, is_sheet: bool, size: int = SIZE, quantize_key: str | None = None):
    out_stem.parent.mkdir(parents=True, exist_ok=True)
    rgba = chroma_key_magenta(img)
    if quantize_key:
        rgba = apply_quantize(rgba, quantize_key)
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


PALETTE_ALIAS = {"ruin": "frozen"}  # 游戏主题 → palettes.yaml key


def apply_quantize(rgba: Image.Image, key: str) -> Image.Image:
    """量化到主题调色板 (post_process 已保 alpha; 抠图后调用)"""
    from post_process import load_palette, quantize_to_palette
    return quantize_to_palette(rgba, load_palette(key))


def process(path: Path, rel_dir: str, size: int, quantize_key: str | None) -> list[str]:
    """处理单个文件 → 输出文件列表"""
    name = path.stem
    img = Image.open(path).convert("RGBA")
    img.load()
    out_done: list[str] = []
    if rel_dir == "world":
        # 瓦片: 整图抠图缩放到 size (不裁 bbox, 保 seamless)
        rgba = chroma_key_magenta(img)
        if quantize_key:
            rgba = apply_quantize(rgba, quantize_key)
        resample = Image.Resampling.BOX if rgba.width > size else Image.Resampling.NEAREST
        rgba = rgba.resize((size, size), resample)
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
        save_frames(img, out, is_sheet, size, quantize_key)
        out_done.extend(str(p) for p in sorted(ATLAS_IN.glob(f"monsters/{name}_*.png")))
    elif rel_dir == "characters":
        # 站立单帧 → 以基础名保存 (游戏 pickPlayerSprite 用 sorceress_stand 无后缀)
        if name.endswith("_stand"):
            for stale in ATLAS_IN.glob(f"characters/{name}.png"):
                stale.unlink()
            rgba = bbox_crop(chroma_key_magenta(img), size)
            if quantize_key:
                rgba = apply_quantize(rgba, quantize_key)
            rgba.save(ATLAS_IN / "characters" / f"{name}.png", format="PNG")
            out_done.append(f"characters/{name}.png")
        else:
            # _walk sheet → _0..3
            for stale in ATLAS_IN.glob(f"characters/{name}_*.png"):
                stale.unlink()
            save_frames(img, ATLAS_IN / "characters" / name, True, size, quantize_key)
            out_done.extend(str(p) for p in sorted(ATLAS_IN.glob(f"characters/{name}_*.png")))
    return out_done


def is_magenta(r: int, g: int, b: int) -> bool:
    return r > 180 and b > 180 and g < 120


def check(path: Path, rel_dir: str) -> list[str]:
    """质检: 品红底纯度 / 主体占比 / 色数 / sheet 比例 / 瓦片边缘连续性
    返回问题列表 (空 = 通过)"""
    issues: list[str] = []
    img = Image.open(path).convert("RGB")
    w, h = img.size
    px = img.load()

    # 1. 品红占比 + 内容 bbox
    magenta = 0
    min_x, min_y, max_x, max_y = w, h, -1, -1
    colors: set[tuple[int, int, int]] = set()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if is_magenta(r, g, b):
                magenta += 1
            else:
                colors.add((r, g, b))
                if x < min_x: min_x = x
                if x > max_x: max_x = x
                if y < min_y: min_y = y
                if y > max_y: max_y = y
    bg_ratio = magenta / (w * h)
    cov = 0.0 if max_x < 0 else ((max_x - min_x + 1) * (max_y - min_y + 1)) / (w * h)

    if rel_dir != "world":
        if bg_ratio < 0.4:
            issues.append(f"品红底占比仅 {bg_ratio:.0%} (<40%, 抠图会脏; 背景必须纯品红)")
        if cov < 0.04 or cov > 0.9:
            issues.append(f"主体占比 {cov:.0%} (建议 5%~80%; 太小或占满都难用)")
    if len(colors) > 96:
        issues.append(f"颜色数 {len(colors)} (>96, 不像像素风限色)")

    # 2. sheet 判断 (怪物/角色行走)
    if rel_dir in ("monsters", "characters"):
        is_sheet = w >= h * 1.8
        if is_sheet and (w % 4 != 0 or w / h < 2.5):
            issues.append(f"sheet 宽高比 {w/h:.2f} 不是规整 4 帧 (建议 4:1 左右, 每帧方形)")
        if not is_sheet and rel_dir == "characters" and "walk" in path.stem:
            issues.append("行走图宽高比 <1.8, 未识别为 4 帧 sheet")

    # 3. 瓦片边缘连续性 (四边 8px 平均色差, 越小越无缝)
    if rel_dir == "world":
        def edge_diff(y0, y1, x0, x1, dy, dx):
            total = n = 0
            for k in range(8):
                c1 = px[x0 + k * dx, y0 + k * dy]
                c2 = px[x1 + k * dx, y1 + k * dy]
                total += sum(abs(a - b) for a, b in zip(c1, c2))
                n += 3
            return total / n
        d_lr = edge_diff(0, 0, 0, w - 1, 1, 0)  # 左列 vs 右列 (行递增)
        d_tb = edge_diff(0, h - 1, 0, 0, 0, 1)  # 顶行 vs 底行 (列递增)
        if d_lr > 90 or d_tb > 90:
            issues.append(f"瓦片边缘不连续 (左右差 {d_lr:.0f}/上下差 {d_tb:.0f}, >90 会露接缝)")

    return issues


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Voidbound 美术导入")
    parser.add_argument("group", nargs="?", choices=["characters", "monsters", "world", "all"])
    parser.add_argument("--all", action="store_true", help="处理全部 (等价于省略参数)")
    parser.add_argument("--size", type=int, default=SIZE, help=f"输出贴图尺寸, 默认 {SIZE} (小怪/瓦片按显示尺寸烘焙, 如 --size 32)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--check", action="store_true", help="只质检不导入 (品红底/主体/色数/无缝)")
    parser.add_argument("--quantize", metavar="KEY", help="量化到调色板 (forest/desert/frozen/void; 怪物目录自动按主题, 如 --quantize void)")
    args = parser.parse_args()

    # 质检模式: 遍历 import/ 全部 PNG, 只报告问题
    if args.check:
        if not IMPORT.exists():
            sys.exit("import 目录不存在")
        bad = 0
        for p in sorted(IMPORT.rglob("*.png")):
            rel_dir = p.relative_to(IMPORT).parts[0]
            issues = check(p, rel_dir)
            status = "✓" if not issues else "✗"
            print(f"{status} {p.relative_to(IMPORT)}")
            for msg in issues:
                print(f"    - {msg}")
                bad += 1
        print(f"检查完成: {bad} 个问题" if bad else "检查完成: 全部通过")
        sys.exit(1 if bad else 0)

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
                # 量化 key: 显式 --quantize 优先; 怪物目录按主题自动 (ruin→frozen)
                qkey = args.quantize
                if qkey is None and rel == "monsters" and len(p.relative_to(IMPORT).parts) > 1:
                    theme = p.relative_to(IMPORT).parts[1]
                    qkey = PALETTE_ALIAS.get(theme, theme)
                outs = process(p, rel, args.size, qkey)
                print(f"✓ {p.relative_to(IMPORT)} -> " + ", ".join(o.split('/')[-1] for o in outs))
                total += len(outs)
            except Exception as e:  # noqa: BLE001
                print(f"✗ {p.relative_to(IMPORT)}: {e}")
    print(f"共 {total} 个输出 {'(dry-run)' if args.dry_run else ''}")
    if not args.dry_run and total:
        print("下一步: python assets/atlas/scripts/pack_atlas.py all")


if __name__ == "__main__":
    main()