#!/usr/bin/env python3
"""
Voidbound 图集 .bin 格式验证脚本
模拟 Rust 端的解析逻辑,确认 pack_atlas.py 生成的 .bin 能被 round-trip 读取。

如果这个脚本通过,意味着 Rust 端用相同逻辑解析也能成功。
"""

import struct
import sys
import zlib
from pathlib import Path

# 与 pack_atlas.py write_rust_bin() 完全一致的格式
MAGIC = b"VATL"
VERSION = 1


def parse_atlas_bin(path: Path) -> dict:
    """解析 .bin,模拟 Rust 端读取"""
    data = path.read_bytes()

    cursor = 0

    # Magic
    magic = data[cursor:cursor + 4]
    cursor += 4
    assert magic == MAGIC, f"Magic 不匹配: {magic!r} != {MAGIC!r}"

    # Version
    version, = struct.unpack_from("<I", data, cursor)
    cursor += 4
    assert version == VERSION, f"版本不匹配: {version} != {VERSION}"

    # 尺寸
    width, height = struct.unpack_from("<II", data, cursor)
    cursor += 8

    # Sprite 数量
    sprite_count, = struct.unpack_from("<I", data, cursor)
    cursor += 4

    # 每个 sprite
    sprites = []
    for _ in range(sprite_count):
        name_len = data[cursor]
        cursor += 1
        name = data[cursor:cursor + name_len].decode("utf-8")
        cursor += name_len
        x, y, fw, fh, frames = struct.unpack_from("<IIIII", data, cursor)
        cursor += 20
        sprites.append({
            "name": name,
            "x": x, "y": y,
            "frame_width": fw, "frame_height": fh,
            "frames": frames,
        })

    # 图像数据长度
    img_len, = struct.unpack_from("<I", data, cursor)
    cursor += 4
    compressed = data[cursor:cursor + img_len]
    cursor += img_len

    # 解压
    png_bytes = zlib.decompress(compressed)

    # CRC
    crc_stored, = struct.unpack_from("<I", data, cursor)
    cursor += 4
    crc_calc = zlib.crc32(data[:cursor - 4]) & 0xffffffff

    # 验证 cursor 走到末尾
    end_ok = cursor == len(data)

    return {
        "version": version,
        "size": (width, height),
        "sprite_count": sprite_count,
        "sprites": sprites,
        "image_bytes": len(png_bytes),
        "compressed_bytes": len(compressed),
        "crc_stored": crc_stored,
        "crc_calc": crc_calc,
        "crc_ok": crc_stored == crc_calc,
        "end_ok": end_ok,
        "cursor_final": cursor,
        "file_size": len(data),
    }


def main():
    if len(sys.argv) > 1:
        bin_path = Path(sys.argv[1])
    else:
        bin_path = Path(__file__).parent.parent / "output" / "characters.bin"

    if not bin_path.exists():
        print(f"X 文件不存在: {bin_path}")
        print(f"  请先运行: python pack_atlas.py characters --rust-bin")
        sys.exit(1)

    print(f"解析: {bin_path}")
    print(f"文件大小: {bin_path.stat().st_size} bytes")
    print()

    try:
        info = parse_atlas_bin(bin_path)
    except Exception as e:
        print(f"X 解析失败: {type(e).__name__}: {e}")
        sys.exit(1)

    print("=== 解析结果 ===")
    print(f"  Magic + Version: V{info['version']} (期望 V{VERSION})")
    print(f"  图集尺寸: {info['size'][0]}x{info['size'][1]}")
    print(f"  Sprite 数: {info['sprite_count']}")
    print()

    print("=== Sprite 列表 ===")
    for s in info["sprites"]:
        anim = " (动画)" if s["frames"] > 1 else ""
        print(f"  - {s['name']:30s} pos=({s['x']:3d},{s['y']:3d}) "
              f"frame={s['frame_width']}x{s['frame_height']}x{s['frames']}{anim}")
    print()

    print("=== 数据完整性 ===")
    print(f"  PNG 解压: {info['compressed_bytes']} -> {info['image_bytes']} bytes (压缩率 {(1 - info['compressed_bytes']/info['image_bytes'])*100:.1f}%)")
    print(f"  CRC32 stored: {info['crc_stored']:#010x}")
    print(f"  CRC32 calc:   {info['crc_calc']:#010x}")
    print(f"  CRC 匹配: {'YES' if info['crc_ok'] else 'NO'}")
    print(f"  Cursor 走到末尾: {'YES' if info['end_ok'] else 'NO'} (offset {info['cursor_final']}/{info['file_size']})")
    print()

    # 验证通过条件
    all_ok = (
        info['crc_ok']
        and info['end_ok']
        and info['sprite_count'] == len(info['sprites'])
        and info['image_bytes'] > 0
    )

    if all_ok:
        print("PASS: .bin 格式完全可解析,Rust 端用相同逻辑能读")
        # 返回 0 = 成功
        sys.exit(0)
    else:
        print("FAIL: .bin 格式存在问题")
        sys.exit(1)


if __name__ == "__main__":
    main()