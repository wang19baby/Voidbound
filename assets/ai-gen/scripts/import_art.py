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
FLOOR_FULL = 384  # 地板整幅纹理边长 (无缝化后统一 384; 游戏 32px 格 → 12x12 周期, 世界对齐无接缝)


def chroma_key_pink(img: Image.Image) -> Image.Image:
    """粉红底容错抠图 (模型给脏品红如 (185,42,134) 时用, b 通道不足 150 严格品红不认):
    紫红系判定 r > 150 且 r >= b 且 b > 90; g 越低越纯 → 全透明, 120~150 半透明过渡"""
    img = img.convert("RGB")
    px = img.load()
    out = Image.new("RGBA", img.size)
    opx = out.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if r > 150 and b > 90 and r >= b:
                if g < 120:
                    a = 0
                elif g < 150:
                    a = int(255 * (g - 120) / 30)
                else:
                    a = 255
            else:
                a = 255
            opx[x, y] = (r, g, b, a)
    return out


def first_sprite(rgba: Image.Image) -> Image.Image:
    """取第一个内容块 (透明列分隔); 无分隔或仅一个块时整图直用 (防宽画布误切)"""
    w, h = rgba.size
    alpha = rgba.getchannel("A")
    col = [sum(1 for y in range(h) if alpha.getpixel((x, y)) > 8) for x in range(w)]
    sep: list[tuple[int, int]] = []
    x = 0
    while x < w:
        if col[x] == 0:
            x0 = x
            while x < w and col[x] == 0:
                x += 1
            if x - x0 >= 4:
                sep.append((x0, x))
        else:
            x += 1
    if sep:
        bounds: list[tuple[int, int]] = []
        prev = 0
        for s0, s1 in sep:
            if s0 - prev >= 16:
                bounds.append((prev, s0))
            prev = s1
        if w - prev >= 16:
            bounds.append((prev, w))
        if len(bounds) >= 2:
            return rgba.crop((bounds[0][0], 0, bounds[0][1], h))
    return rgba


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
    # 越界部分直接裁掉 (主体在画布中央); crop 窗口即画布内容, 粘贴到原点
    sx, sy = max(0, left), max(0, top)
    ex, ey = min(img.width, left + side), min(img.height, top + side)
    region = img.crop((sx, sy, ex, ey))
    canvas.paste(region, (sx - left, sy - top))
    if canvas.width == size:
        return canvas
    # 降采样用 BOX (像素平均), 升采样用 NEAREST (保持像素边)
    resample = Image.Resampling.BOX if canvas.width > size else Image.Resampling.NEAREST
    return canvas.resize((size, size), resample)


def split_frames(rgba: Image.Image, expect: int = 4) -> list[Image.Image]:
    """按品红分隔列拆分 sheet:
    - 抠图后透明列 = 分隔符; 只认宽度 >=4px 的分隔 (忽略腿缝等窄孔)
    - 内容块数量合理时按真实边界切; 否则回退等分 expect 份 (模型贴死帧的兜底)
    """
    w, h = rgba.size
    alpha = rgba.getchannel("A")
    col = [sum(1 for y in range(h) if alpha.getpixel((x, y)) > 8) for x in range(w)]
    # 分隔符段 (全透明列)
    sep: list[tuple[int, int]] = []
    x = 0
    while x < w:
        if col[x] == 0:
            x0 = x
            while x < w and col[x] == 0:
                x += 1
            if x - x0 >= 4:
                sep.append((x0, x))
        else:
            x += 1
    if sep:
        # 内容块 = 分隔符之间; 过滤过窄块 (<16px)
        bounds = []
        prev = 0
        for s0, s1 in sep:
            if s0 - prev >= 16:
                bounds.append((prev, s0))
            prev = s1
        if w - prev >= 16:
            bounds.append((prev, w))
        if 2 <= len(bounds) <= expect + 2:
            return [rgba.crop((x0, 0, x1, h)) for x0, x1 in bounds]
    # 回退等分
    fw = w // expect
    return [rgba.crop((i * fw, 0, (i + 1) * fw, h)) for i in range(expect)]


def save_frames(img: Image.Image, out_stem: Path, is_sheet: bool, size: int = SIZE, quantize_key: str | None = None):
    out_stem.parent.mkdir(parents=True, exist_ok=True)
    rgba = chroma_key_magenta(img)
    if quantize_key:
        rgba = apply_quantize(rgba, quantize_key)
    if is_sheet:
        frames = split_frames(rgba)
        for i, f in enumerate(frames[:4]):
            f = bbox_crop(f, size)
            f.save(f"{out_stem}_{i}.png", format="PNG")
    else:
        rgba = bbox_crop(rgba, size)
        rgba.save(f"{out_stem}_0.png", format="PNG")


PALETTE_ALIAS = {"ruin": "frozen"}  # 游戏主题 → palettes.yaml key


def apply_quantize(rgba: Image.Image, key: str) -> Image.Image:
    """量化到主题调色板 (post_process 已保 alpha; 抠图后调用)"""
    from post_process import load_palette, quantize_to_palette
    return quantize_to_palette(rgba, load_palette(key))


def make_seamless(img: Image.Image) -> Image.Image:
    """半幅偏移混合: 原图 + 自身平移 (w/2, h/2) 各象限拼接后 50% 混合
    → 结果以 (w/2, h/2) 为周期, 裁左上 w/2 x w/2 即为数学无缝瓦片 (分辨率减半, 纹理稍柔)"""
    w, h = img.size
    hw, hh = w // 2, h // 2
    quad = Image.new("RGB", (w, h))
    quad.paste(img.crop((hw, hh, w, h)), (0, 0))
    quad.paste(img.crop((0, hh, hw, h)), (hw, 0))
    quad.paste(img.crop((hw, 0, w, hh)), (0, hh))
    quad.paste(img.crop((0, 0, hw, hh)), (hw, hh))
    blended = Image.blend(img, quad, 0.5)
    return blended.crop((0, 0, hw, hh))


def square_crop_center(img: Image.Image) -> Image.Image:
    """原图中心方形截取 (非方形原图如 1408x768 → min 边 768x768 居中; 方形原图原样返回)。

    瓦片用: 整幅纹理没有品红 bbox 可依, 只能中心截方; 同时消除
    非等比压缩 (1408x768 → 384x384 的 x/y 缩放比不同 = 变形)。
    """
    w, h = img.size
    side = min(w, h)
    if w == h:
        return img
    x0, y0 = (w - side) // 2, (h - side) // 2
    return img.crop((x0, y0, x0 + side, y0 + side))


def brighten_if_dark(img: Image.Image, min_lum: float = 80, raw_lum: float | None = None) -> Image.Image:
    """平均亮度过低 (<min_lum) 的瓦片做曝光恢复 (gamma 抬升)。

    旧版线性 ×1.9 上限: 亮 19.6 的原图只能到 37, 依然全黑 — "黑色地图"根因。
    gamma 恢复按暗部/亮部等比例打开, 19.6 → ~80, 纹理保留。
    raw_lum: 调用方传入在 raw(或大尺寸) 上直读的稳定均值 — 本环境的无缝中间图
    getdata/resize 读数会在进程间飘 (19.6 ↔ 116), 任何小尺寸测量都不可信。
    """
    import statistics
    lum = raw_lum if raw_lum is not None else (
        statistics.mean(sum(c) / 3 for c in img.getdata()) if img.size[0] * img.size[1] else 0)
    if lum < min_lum:
        import math
        g = max(1.2, math.log(max(1.0, lum) / 255.0) / math.log(min_lum / 255.0))
        return img.point(lambda v: int(255.0 * (v / 255.0) ** (1.0 / g)))
    return img


def repaint_magenta(img: Image.Image) -> Image.Image:
    """瓦片用: 把严格品红残留重涂为邻域色 (保留 alpha 不透明度)。

    与 chroma_key_magenta 不同 — 瓦片必须铺满不透明, 抠成 alpha 空洞会让
    游戏清屏色透出成黑斑 (floor_void 15% 品红 → 黑色地图的根因之一)。
    仅对严格品红 (r>180, b>180, g<120) 重涂, 紫晶等主题内容色不受影响。
    """
    import statistics
    rgba = img.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    # 兜底色: 64x64 降采样上的非品红中位色
    small = rgba.resize((64, 64))
    spx = small.load()
    samples = [
        spx[x, y] for x in range(64) for y in range(64)
        if not (spx[x, y][0] > 180 and spx[x, y][2] > 180 and spx[x, y][1] < 120)
    ]
    if samples:
        def med(idx: int) -> int:
            return int(statistics.median(sorted(s[idx] for s in samples)))
        fallback = (med(0), med(1), med(2))
    else:
        fallback = (80, 80, 90)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r > 180 and b > 180 and g < 120:
                nb: list[tuple[int, int, int]] = []
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        nr, ng, nbb, na = px[nx, ny]
                        if na > 0 and not (nr > 180 and nbb > 180 and ng < 120):
                            nb.append((nr, ng, nbb))
                if nb:
                    px[x, y] = (
                        sum(c[0] for c in nb) // len(nb),
                        sum(c[1] for c in nb) // len(nb),
                        sum(c[2] for c in nb) // len(nb),
                        a,
                    )
                else:
                    px[x, y] = (fallback[0], fallback[1], fallback[2], a)
    return rgba


def lift_black(img: Image.Image, px_min: int = 30, dark_ratio: float = 0.15) -> Image.Image:
    """近黑像素占比过高 (>dark_ratio) 的瓦片, 逐通道抬到 px_min。

    均值提亮 (brighten_if_dark) 救不了黑块: 提亮均值后仍可能有 1/4 像素
    近黑 (floor_void 25% 黑像素 → 黑色地图)。此步保证瓦片不再有纯黑洞。
    """
    rgba = img.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    total = w * h
    dark = sum(1 for y in range(h) for x in range(w) if sum(px[x, y][:3]) / 3 < px_min)
    if dark / total <= dark_ratio:
        return rgba
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if (r + g + b) / 3 < px_min:
                px[x, y] = (max(r, px_min), max(g, px_min), max(b, px_min), a)
    return rgba


def process(path: Path, rel_dir: str, size: int, quantize_key: str | None) -> list[str]:
    """处理单个文件 → 输出文件列表"""
    name = path.stem
    img = Image.open(path).convert("RGBA")
    img.load()
    out_done: list[str] = []
    if rel_dir == "world":
        # 瓦片尺寸: 墙 128 (128px 块) / 地板 32 (32px 格, 烘焙 384 整幅) / 障碍物 128 (128px 块 1:1)
        size = 128 if name.startswith(("wall", "decor")) else 32
        if name.startswith("decor"):
            # 障碍物 (用户要求: 原图整幅直接用, 不再切片/取部分):
            # 抠品红 → 弱 alpha 归零 → 内容方形化 (bbox_crop) → 烘焙 size
            # (旧实现走瓦片管线 repaint+无缝化 → 品红背景被填充成紫糊方块)
            rgba = chroma_key_magenta(img)
            a_hist = rgba.getchannel("A").histogram()
            opaque = sum(a_hist[128:])
            if opaque / (rgba.width * rgba.height) > 0.9:
                rgba = chroma_key_pink(img)
            a = rgba.getchannel("A").point(lambda v: 0 if v < 40 else v)
            rgba.putalpha(a)
            rgba = bbox_crop(rgba, size)
            out = ATLAS_IN / "world" / f"{name}.png"
            rgba.save(out, format="PNG")
            out_done.append(str(out.relative_to(BASE.parent)))
        else:
            # 瓦片管线 (地板/墙): 原图整幅必要时中心方截 (防非等比压缩变形)
            rgba = square_crop_center(img.convert("RGBA"))
            # 瓦片必须不透明: 品红残留重涂为邻域色 (抠 alpha 会让清屏色透出成黑斑)
            rgba = repaint_magenta(rgba)
            # 曝光判断: 从磁盘原图直读 (内存派生图 getdata 读数进程间会飘 19.6↔116, 不可信;
            # 磁盘 open 的读数 5+ 进程全部稳定)
            import statistics as _st
            with Image.open(path) as _rawf:
                raw_lum = _st.mean(sum(c[:3]) / 3 for c in _rawf.convert("RGB").getdata())
            rgba = brighten_if_dark(rgba, raw_lum=raw_lum)
            rgba = lift_black(rgba)
            # 无缝化 (半幅混合, 均值不变)
            rgba = make_seamless(rgba.convert("RGB")).convert("RGBA")
            # 质控: 恢复后仍过暗 → 原图近黑, 提示重新生成 (否则游戏里就是黑色地图)
            fin_lum = max(raw_lum, 80.0) if raw_lum < 80 else raw_lum
            if fin_lum < 60:
                print(f"  ⚠ {name}: 瓦片仍过暗 (raw_lum={raw_lum:.0f}<60) — AI 原图近黑, 曝光恢复后仍不可用, 需重新生成亮色版")
            if quantize_key:
                rgba = apply_quantize(rgba, quantize_key)
            if name.startswith("floor"):
                # 地板: 单一整幅纹理 {name}_full (FLOOR_FULL=384), 游戏用世界对齐 uv 采样
                # (旧 4x4 切片随机选 → 相邻格贴边来自不相邻源列 → 接缝; 周期 384 与 4 切片网格不对齐)
                for stale in (ATLAS_IN / "world").glob(f"{name}_*.png"):
                    stale.unlink()
                full = rgba.resize((FLOOR_FULL, FLOOR_FULL), Image.Resampling.BOX)
                out = ATLAS_IN / "world" / f"{name}_full.png"
                full.save(out, format="PNG")
                out_done.append(str(out.relative_to(BASE.parent)))
            else:
                resample = Image.Resampling.BOX if rgba.width > size else Image.Resampling.NEAREST
                rgba = rgba.resize((size, size), resample)
                out = ATLAS_IN / "world" / f"{name}.png"
                rgba.save(out, format="PNG")
                out_done.append(str(out.relative_to(BASE.parent)))
    elif rel_dir == "monsters":
        is_sheet = img.width >= img.height * 2.5  # 单图(≤2:1)不再误判为 4 帧 sheet
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
    elif rel_dir == "npcs":
        # 站立单帧 → npcs/{name}.png (游戏按 kind→sprite 引用, 如 merchant_stand)
        # sheet (一张多个人物) 默认取第一个切图; 仅一个内容块时整图直用 (防宽画布误切)
        # 非品红底: 先试严格品红键, 几乎无透明 → 粉红容错键; 仍无 → 整图直用 (深色石板等)
        for stale in ATLAS_IN.glob(f"npcs/{name}.png"):
            stale.unlink()
        rgba = chroma_key_magenta(img)
        a_hist = rgba.getchannel("A").histogram()
        opaque = sum(a_hist[128:])
        if opaque / (rgba.width * rgba.height) > 0.9:
            rgba = chroma_key_pink(img)
        rgba = first_sprite(rgba)
        # 弱 alpha 残渣归零 (第一格边缘半透明撑偏 bbox → 主体不居中)
        a = rgba.getchannel("A").point(lambda v: 0 if v < 40 else v)
        rgba.putalpha(a)
        rgba = bbox_crop(rgba, size)
        if quantize_key:
            rgba = apply_quantize(rgba, quantize_key)
        (ATLAS_IN / "npcs").mkdir(parents=True, exist_ok=True)
        rgba.save(ATLAS_IN / "npcs" / f"{name}.png", format="PNG")
        out_done.append(f"npcs/{name}.png")
    elif rel_dir == "icons":
        # UI 图标 (技能/药水/材料): 单对象, 品红键 + 第一格 + 居中; 存 icons/{name}.png
        for stale in ATLAS_IN.glob(f"icons/{name}.png"):
            stale.unlink()
        rgba = chroma_key_magenta(img)
        a_hist = rgba.getchannel("A").histogram()
        if sum(a_hist[128:]) / (rgba.width * rgba.height) > 0.9:
            rgba = chroma_key_pink(img)
        rgba = first_sprite(rgba)
        a = rgba.getchannel("A").point(lambda v: 0 if v < 40 else v)
        rgba.putalpha(a)
        rgba = bbox_crop(rgba, size)
        if quantize_key:
            rgba = apply_quantize(rgba, quantize_key)
        (ATLAS_IN / "icons").mkdir(parents=True, exist_ok=True)
        rgba.save(ATLAS_IN / "icons" / f"{name}.png", format="PNG")
        out_done.append(f"icons/{name}.png")
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
        if is_sheet:
            # 相邻帧雷同检测: 各帧平均通道差 <5 → 警告 (模型常复制帧)
            frames = [f.convert("RGB") for f in split_frames(img.convert("RGBA"))]
            for i in range(3):
                a, b = frames[i], frames[i + 1]
                da = list(a.getdata()); db = list(b.getdata())
                diff = sum(sum(abs(x - y) for x, y in zip(pa, pb)) for pa, pb in zip(da, db)) / (len(da) * 3)
                if diff < 5:
                    issues.append(f"帧 {i+1} 与帧 {i+2} 几乎相同 (平均差 {diff:.1f}/255, 请改提示词逐帧点名姿势)")

    # 3. 瓦片无缝检测: 边界跳跃 vs 内部跳跃 (ratio<2.2 无接缝; 旧指标比较 col0/colW 是错的)
    if rel_dir == "world":
        def jump(xa, xb):
            return sum(sum(abs(px[xa, y][c] - px[xb, y][c]) for c in range(3)) for y in range(0, h, 4)) / ((h // 4 + 1) * 3)
        interior = jump(0, 1)
        boundary = jump(w - 1, 0)
        tb = sum(sum(abs(px[x, h - 1][c] - px[x, 0][c]) for c in range(3)) for x in range(0, w, 4)) / ((w // 4 + 1) * 3)
        if boundary > max(4.0, interior * 2.2) or tb > max(4.0, interior * 2.2):
            issues.append(f"瓦片边界有接缝 (内部{interior:.1f} vs 左右包边{boundary:.1f}/上下{tb:.1f}); 导入时会自动无缝化兜底")

    return issues


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Voidbound 美术导入")
    parser.add_argument("group", nargs="?", choices=["characters", "monsters", "world", "npcs", "icons", "all"])
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

    groups = ["characters", "monsters", "world", "npcs", "icons"] if (args.all or args.group in (None, "all")) else [args.group]
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
                # 量化仅 --quantize 显式启用 (HD 流程默认不量化)
                outs = process(p, rel, args.size, args.quantize)
                print(f"✓ {p.relative_to(IMPORT)} -> " + ", ".join(o.split('/')[-1] for o in outs))
                total += len(outs)
            except Exception as e:  # noqa: BLE001
                print(f"✗ {p.relative_to(IMPORT)}: {e}")
    print(f"共 {total} 个输出 {'(dry-run)' if args.dry_run else ''}")
    if not args.dry_run and total:
        print("下一步: python assets/atlas/scripts/pack_atlas.py all")


if __name__ == "__main__":
    main()