"""合成图验证 gemini_generate 的抠图/裁帧逻辑 (无需 API)"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

src = Path(__file__).parent.parent / "scripts" / "gemini_generate.py"
ns = {"__file__": str(src)}
exec(compile(src.read_text(encoding="utf-8").split("def main():")[0], "gg", "exec"), ns)

img = Image.new("RGB", (256, 64), (255, 0, 255))
d = ImageDraw.Draw(img)
for i in range(4):
    d.rectangle([i * 64 + 16, 8, i * 64 + 48, 40], fill=(30, 200, 90))

ns["slice_and_save"](img, Path("/tmp/gg_test/sheet"), 4)
f0 = Image.open("/tmp/gg_test/sheet_0.png")
a0 = f0.getchannel("A")
print("saved:", sorted(p.name for p in Path("/tmp/gg_test").iterdir()))
print("size/mode:", f0.size, f0.mode)
print("corner alpha (want 0):", a0.getpixel((0, 0)), "| center alpha (want 255):", a0.getpixel((32, 24)))
print("OK" if a0.getpixel((0, 0)) == 0 and a0.getpixel((32, 24)) == 255 else "FAIL")
