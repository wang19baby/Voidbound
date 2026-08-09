#!/usr/bin/env python3
"""
Voidbound Sprite 染色脚本
模拟 Kenney Tiny Battle 资源染色流程,生成 6 职业占位 sprite。

输入:无(脚本自带"基础角色模板"逻辑)
输出:assets/atlas/input/characters/<class>_<state>.png

每个职业:
  - 用其主色调染色(RGB 替换)
  - 加配饰(头巾 / 帽 / 面罩)
  - 加武器(简化为颜色块)

用法:
  python stain_sprites.py              # 默认生成 6 职业
  python stain_sprites.py --output /path/to/other  # 自定义输出
"""

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("缺少依赖: Pillow. 安装: pip install pillow")
    sys.exit(1)


# ============== 配置 ==============

OUTPUT_DIR = Path(__file__).parent.parent / "input" / "characters"

# 6 职业主色调(R,G,B)
# 来源: docs/ASSETS.md §14 + SPRITE_ASSEMBLY_SOP.md
CLASS_COLORS = {
    "barbarian":    {"body": (139, 58, 26),   "accent": (90, 36, 16),   "trousers": (74, 45, 26)},
    "paladin":      {"body": (212, 175, 55),  "accent": (245, 245, 245),"trousers": (180, 150, 50)},
    "sorceress":    {"body": (58, 123, 213),  "accent": (90, 58, 139),  "trousers": (40, 80, 140)},
    "necromancer":  {"body": (90, 26, 122),   "accent": (45, 10, 61),   "trousers": (60, 20, 80)},
    "ranger":       {"body": (58, 139, 58),   "accent": (139, 90, 58),  "trousers": (40, 100, 40)},
    "assassin":     {"body": (26, 26, 26),    "accent": (139, 26, 26),  "trousers": (45, 10, 10)},
}

# 皮肤色(通用)
SKIN_COLOR = (255, 220, 177)


# ============== 绘制函数 ==============


def make_base_character(body: tuple, accent: tuple, trousers: tuple) -> Image.Image:
    """绘制 16x16 基础角色(简化版 Kenney Tiny Battle 风格)

    像素布局:
      行 0-3:  头部
      行 4-9:  躯干(身体色 + 装饰)
      行 10-13:腿
      行 14-15:脚
    """
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = img.load()

    # 头部 (2-13 横坐标,2-6 纵坐标)
    for y in range(2, 6):
        for x in range(5, 11):
            px[x, y] = SKIN_COLOR

    # 躯干 (5-10 横坐标,7-12 纵坐标)
    for y in range(7, 12):
        for x in range(5, 11):
            px[x, y] = body

    # 装饰条(腰带,行 11,横坐标 5-10)
    for x in range(5, 11):
        px[x, 11] = accent

    # 腿 (5-10 横坐标,12-14 纵坐标)
    for y in range(12, 15):
        for x in range(5, 11):
            px[x, y] = trousers

    # 脚 (5-6 和 9-10,行 15)
    px[5, 15] = (40, 30, 20)
    px[6, 15] = (40, 30, 20)
    px[9, 15] = (40, 30, 20)
    px[10, 15] = (40, 30, 20)

    # 眼睛 (行 4)
    px[6, 4] = (0, 0, 0)
    px[9, 4] = (0, 0, 0)

    return img


def add_accessory(img: Image.Image, class_name: str, accent: tuple) -> Image.Image:
    """加职业配饰(头巾 / 帽 / 面罩)"""
    px = img.load()
    if class_name == "barbarian":
        # 红色头巾(行 1-2,横坐标 5-10)
        for x in range(5, 11):
            for y in range(1, 3):
                px[x, y] = accent
    elif class_name == "paladin":
        # 头盔(行 1-3,横坐标 4-11)
        for y in range(1, 4):
            for x in range(4, 12):
                px[x, y] = accent
    elif class_name == "sorceress":
        # 蓝色尖帽(行 0-2,三角形)
        for y in range(0, 3):
            for x in range(6 - y, 11 + y):
                if 0 <= x < 16:
                    px[x, y] = accent
    elif class_name == "necromancer":
        # 骷髅肩饰(行 7,横坐标 4 和 11)
        px[4, 7] = accent
        px[11, 7] = accent
    elif class_name == "ranger":
        # 绿色兜帽(行 1-3,横坐标 4-11)
        for y in range(1, 4):
            for x in range(4, 12):
                px[x, y] = accent
    elif class_name == "assassin":
        # 红色面罩(行 4-5,横坐标 6-9)
        for y in range(4, 6):
            for x in range(6, 10):
                px[x, y] = accent
    return img


def add_weapon(img: Image.Image, class_name: str, accent: tuple) -> Image.Image:
    """加武器(简化为颜色块)"""
    px = img.load()
    if class_name == "barbarian":
        # 双斧(右侧行 6-10,横坐标 12-13)
        for y in range(6, 11):
            for x in range(12, 14):
                px[x, y] = (60, 30, 10)
        # 斧刃(行 6,横坐标 12)
        px[11, 6] = (180, 180, 180)
    elif class_name == "paladin":
        # 盾(左侧行 7-10,横坐标 2-4)
        for y in range(7, 11):
            for x in range(2, 5):
                px[x, y] = accent
        # 锤(右侧行 6-10,横坐标 12-13)
        for y in range(6, 11):
            px[12, y] = (100, 80, 60)
            px[13, y] = (180, 180, 180)
    elif class_name == "sorceress":
        # 法杖(行 5-13,横坐标 13)
        for y in range(5, 14):
            px[13, y] = (60, 30, 10)
        # 魔法球(行 4,横坐标 13)
        px[13, 4] = (255, 255, 100)
    elif class_name == "necromancer":
        # 骷髅杖(行 5-13,横坐标 13)
        for y in range(5, 14):
            px[13, y] = (80, 70, 60)
        # 骷髅头(行 4,横坐标 12-13)
        px[12, 4] = (240, 240, 230)
        px[13, 4] = (240, 240, 230)
    elif class_name == "ranger":
        # 弓(左侧行 6-10,横坐标 2-3)
        for y in range(6, 11):
            px[3, y] = (60, 30, 10)
        # 弓弦
        px[2, 6] = (200, 200, 200)
        px[2, 10] = (200, 200, 200)
    elif class_name == "assassin":
        # 双匕首(左右各一)
        for y in range(9, 12):
            px[2, y] = (180, 180, 180)
            px[13, y] = (180, 180, 180)
    return img


def make_walk_frame(class_name: str, frame: int) -> Image.Image:
    """生成走路动画帧(4 帧,左右脚交替)"""
    colors = CLASS_COLORS[class_name]
    img = make_base_character(colors["body"], colors["accent"], colors["trousers"])
    img = add_accessory(img, class_name, colors["accent"])
    img = add_weapon(img, class_name, colors["accent"])

    px = img.load()

    # 走路动画:左右腿交替前进
    # frame 0: 左脚前
    # frame 1: 中间
    # frame 2: 右脚前
    # frame 3: 中间
    if frame == 0:
        # 左脚前(行 14-15,左半 5-7)
        px[7, 14] = (40, 30, 20)
        px[7, 15] = (40, 30, 20)
    elif frame == 1:
        # 中间
        pass  # 用 base
    elif frame == 2:
        # 右脚前
        px[8, 14] = (40, 30, 20)
        px[8, 15] = (40, 30, 20)
    elif frame == 3:
        pass

    # 整体上下轻微浮动(行偏移 ±1)
    if frame in (1, 3):
        # 向上偏移 1 行
        new_img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        new_px = new_img.load()
        for y in range(15):
            for x in range(16):
                p = px[x, y + 1]
                if p[3] > 0:  # 不透明
                    new_px[x, y] = p
        img = new_img

    return img


def make_class_sprites(class_name: str) -> list[tuple[str, Image.Image]]:
    """生成一个职业的所有 sprite(stand + walk 4 帧)"""
    sprites = []
    colors = CLASS_COLORS[class_name]

    # stand (单帧)
    stand = make_base_character(colors["body"], colors["accent"], colors["trousers"])
    stand = add_accessory(stand, class_name, colors["accent"])
    stand = add_weapon(stand, class_name, colors["accent"])
    sprites.append((f"{class_name}_stand", stand))

    # walk (4 帧,横向拼接成 64x16)
    walk_frames = [make_walk_frame(class_name, f) for f in range(4)]
    walk = Image.new("RGBA", (64, 16), (0, 0, 0, 0))
    for i, frame in enumerate(walk_frames):
        walk.paste(frame, (i * 16, 0))
    sprites.append((f"{class_name}_walk", walk))

    return sprites


def main():
    parser = argparse.ArgumentParser(description="生成 6 职业 stained sprite")
    parser.add_argument("--output", default=str(OUTPUT_DIR), help="输出目录")
    parser.add_argument("--classes", nargs="+", default=list(CLASS_COLORS.keys()), help="要生成的职业")
    args = parser.parse_args()

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Voidbound Sprite 染色器")
    print(f"  输出: {output_dir}")
    print(f"  职业: {args.classes}")
    print()

    total = 0
    for class_name in args.classes:
        if class_name not in CLASS_COLORS:
            print(f"  X 未知职业: {class_name}")
            continue
        sprites = make_class_sprites(class_name)
        for name, img in sprites:
            path = output_dir / f"{name}.png"
            img.save(path, "PNG")
            print(f"  生成: {path.name} ({img.size})")
            total += 1

    print()
    print(f"OK: 生成 {total} 张 sprite")


if __name__ == "__main__":
    main()