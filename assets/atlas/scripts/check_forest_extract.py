#!/usr/bin/env python3
"""按游戏侧 voidbound_atlas_parser 逻辑从 world.bin 提取森林三件套并与 input 对比"""
import struct, zlib, io, sys
from pathlib import Path
from PIL import Image

out_dir = Path(r"D:/work_space/personal_workspace/Voidbound/assets/atlas/output")
in_dir = Path(r"D:/work_space/personal_workspace/Voidbound/assets/atlas/input/world")
data = (out_dir / "world.bin").read_bytes()

# ---- 复刻 voidbound_atlas_parser::parse ----
cur = 0
assert data[0:4] == b"VATL", "magic"
cur += 4
version = struct.unpack_from("<I", data, cur)[0]; cur += 4
assert version == 1, "version"
width, height = struct.unpack_from("<II", data, cur); cur += 8
sprite_count = struct.unpack_from("<I", data, cur)[0]; cur += 4

sprites = []
for _ in range(sprite_count):
    nl = data[cur]; cur += 1
    name = data[cur:cur+nl].decode("utf-8"); cur += nl
    x, y, fw, fh, frames = struct.unpack_from("<IIIII", data, cur); cur += 20
    sprites.append({"name": name, "x": x, "y": y, "fw": fw, "fh": fh, "frames": frames})

img_len = struct.unpack_from("<I", data, cur)[0]; cur += 4
compressed = data[cur:cur+img_len]; cur += img_len
crc_stored = struct.unpack_from("<I", data, cur)[0]
crc_calc = zlib.crc32(data[:cur]) & 0xffffffff
print(f"parse: size={width}x{height} sprites={sprite_count} CRC match={crc_stored == crc_calc}")

png_bytes = zlib.decompress(compressed)
disk_png = (out_dir / "world.png").read_bytes()
print(f"embedded PNG == disk world.png: {png_bytes == disk_png}")

img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
assert img.size == (width, height)

targets = [
    ("地面", "floor_forest_full", "floor_forest_full.png"),
    ("墙壁", "wall_forest", "wall_forest.png"),
    ("障碍物", "decor_forest", "decor_forest.png"),
]

all_ok = True
for label, bin_name, src_file in targets:
    s = next(sp for sp in sprites if sp["name"] == bin_name)
    crop = img.crop((s["x"], s["y"], s["x"] + s["fw"], s["y"] + s["fh"]))
    src = Image.open(in_dir / src_file).convert("RGBA")

    size_ok = crop.size == src.size
    px_equal = size_ok and (crop.tobytes() == src.tobytes())
    all_ok &= px_equal
    print(f"{label} [{bin_name}]: rect=({s['x']},{s['y']},{s['fw']}x{s['fh']}) "
          f"bin->{crop.size} input->{src.size} size_match={size_ok} pixels_identical={px_equal}")

    if not px_equal and size_ok:
        a, b = crop.tobytes(), src.tobytes()
        diff = sum(1 for i in range(0, len(a), 4) if a[i:i+4] != b[i:i+4])
        print(f"    differing pixels: {diff}/{len(a)//4}")

print("\nRESULT:", "ALL 3 IDENTICAL" if all_ok else "MISMATCH FOUND")
sys.exit(0 if all_ok else 1)
