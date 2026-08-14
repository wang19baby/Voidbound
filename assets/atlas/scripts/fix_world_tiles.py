#!/usr/bin/env python3
"""one-off: 修复已打包的 world 输入瓦片 (恢复后手术级修补, 不重新走 import 流程)
- repaint_magenta: 所有瓦片 (清理品红残留, 干净瓦片为 no-op)
- lift_black: 仅 floor_void / wall_void (黑色地图根因: 近黑像素质量过高)
"""
import sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ai-gen" / "scripts"))
from import_art import repaint_magenta, lift_black  # noqa: E402

WORLD = Path(__file__).resolve().parents[2] / "atlas" / "input" / "world"
LIFT = {"floor_void.png", "wall_void.png"}

for f in sorted(WORLD.glob("*.png")):
    orig = Image.open(f).convert("RGBA")
    img = repaint_magenta(orig)
    if f.name in LIFT:
        img = lift_black(img, px_min=55, dark_ratio=0.15)
    if img.tobytes() != orig.tobytes():
        img.save(f, format="PNG")
        print(f"fixed {f.name}")
    else:
        print(f"skip {f.name} (unchanged)")

print("done")
