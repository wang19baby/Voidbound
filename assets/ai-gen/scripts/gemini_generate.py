#!/usr/bin/env python3
"""
Voidbound Gemini (Nano Banana) 批量生成 v1
替代 SD WebUI 后端: 调 Google Gemini 图像模型 gemini-3-pro-image-preview

用法:
  python gemini_generate.py barbarian            # 单职业 (standing/walking/attacking)
  python gemini_generate.py --all                # 全部 6 职业
  python gemini_generate.py --monsters forest    # 某主题怪物
  python gemini_generate.py --dry-run barbarian  # 仅打印 prompt, 不调 API
  python gemini_generate.py --list               # 列出可生成目标

环境: GEMINI_API_KEY (或脚本同目录 .env 文件)
依赖: requests + pillow + pyyaml (均已有; 直接走 Gemini REST API, 无需 google-genai 包)
输出: output/<kind>/<id>/<pose>_<frame>.png (64x64 透明, 品红抠图) + raw .jpg

流程: prompts YAML → Gemini 生成 (walking 出 4 帧横向 sheet) → 抠图裁帧 → PNG
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("缺少依赖: pillow. 安装: pip install pillow")

try:
    import yaml
except ImportError:
    sys.exit("缺少依赖: pyyaml. 安装: pip install pyyaml")

BASE_DIR = Path(__file__).parent.parent
PROMPTS_DIR = BASE_DIR / "prompts"
OUT_DIR = BASE_DIR / "output"
STATE_FILE = BASE_DIR / "state_gemini.json"
MODEL = "gemini-3-pro-image-preview"
SIZE = 64  # 目标帧尺寸 (px)

# 高质量像素风前缀 (相比原 SDXL 版 32x32, 提升到 64x64/帧)
STYLE_PREFIX = (
    "pixel art, top-down 2D RPG game sprite, 64x64 pixels per frame, "
    "clean pixel art, bold dark outlines, limited color palette, "
    "no anti-aliasing, no gradients, no text, no watermark, no border, "
    "character fully visible and centered, "
    "solid pure magenta background (#FF00FF), nothing else in the background"
)

NEGATIVE_HINTS = "no extra limbs, no deformed hands, no blur, no photorealistic, no 3d render"


def load_env():
    """读 .env (脚本同目录) 补环境变量"""
    env_file = BASE_DIR / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def load_prompts(name: str) -> dict:
    p = PROMPTS_DIR / name
    with open(p, encoding="utf-8") as f:
        return yaml.safe_load(f)


def build_jobs(kind: str, target: str | None):
    """返回 [{id, prompt}]"""
    jobs = []
    if kind == "characters":
        data = load_prompts("characters.yaml")
        for cid, cls in data.get("classes", {}).items():
            if target and cid != target:
                continue
            base = cls["base"]
            for pose in cls.get("poses", [{"name": "standing", "suffix": ""}]):
                if pose["name"] == "walking":
                    prompt = (
                        f"{STYLE_PREFIX}. {base}. "
                        f"4-frame horizontal walk animation sprite sheet, "
                        f"character facing down, mid-stride poses, each frame 64x64, "
                        f"frames evenly spaced in one row. {NEGATIVE_HINTS}"
                    )
                else:
                    prompt = (
                        f"{STYLE_PREFIX}. {base}. {pose.get('suffix', '')}. "
                        f"single character sprite, facing down. {NEGATIVE_HINTS}"
                    )
                jobs.append({"id": f"{cid}/{pose['name']}", "prompt": prompt})
    elif kind == "monsters":
        data = load_prompts("monsters.yaml")
        themes = data.get("themes", {})
        for tid, theme in themes.items():
            if target and tid != target:
                continue
            for mid, mon in theme.get("monsters", {}).items():
                size_note = "large imposing monster" if mon.get("elite") else "monster"
                prompt = (
                    f"{STYLE_PREFIX}. {size_note}: {mon['base']}. "
                    f"single monster sprite, top-down view. {NEGATIVE_HINTS}"
                )
                jobs.append({"id": f"{tid}/{mid}", "prompt": prompt})
    return jobs


def chroma_key_magenta(img: Image.Image) -> Image.Image:
    """品红 (#FF00FF) 抠图 → RGBA 透明底; 近品红按距离半透明 (边缘柔和)"""
    img = img.convert("RGB")
    px = img.load()
    out = Image.new("RGBA", img.size)
    opx = out.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            # 品红距离: 高 r/b + 低 g
            magenta_dist = max(abs(r - 255), abs(b - 255)) + g
            if r > 180 and b > 180 and g < 120:
                alpha = 0
            elif r > 150 and b > 150 and g < 170:
                alpha = int(255 * (170 - g) / 50)  # 半透明过渡
            else:
                alpha = 255
            opx[x, y] = (r, g, b, min(255, alpha))
    return out


def slice_and_save(img: Image.Image, out_stem: Path, frames: int):
    """sheet → 裁帧 → 64x64 PNG; 非 sheet 单帧"""
    out_stem.parent.mkdir(parents=True, exist_ok=True)
    rgba = chroma_key_magenta(img)
    if frames > 1:
        w = rgba.width // frames
        for i in range(frames):
            f = rgba.crop((i * w, 0, (i + 1) * w, rgba.height))
            f = f.resize((SIZE, SIZE), Image.Resampling.NEAREST)
            f.save(f"{out_stem}_{i}.png", format="PNG")
    else:
        rgba = rgba.resize((SIZE, SIZE), Image.Resampling.NEAREST)
        rgba.save(f"{out_stem}_0.png", format="PNG")


def run(jobs: list, resume: bool = True):
    import base64

    import requests

    api_key = os.environ["GEMINI_API_KEY"]
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"

    state = {}
    if resume and STATE_FILE.exists():
        state = json.loads(STATE_FILE.read_text(encoding="utf-8"))

    for job in jobs:
        if state.get(job["id"]):
            print(f"skip (done): {job['id']}")
            continue
        print(f"gen: {job['id']}")
        ok = False
        for attempt in range(3):
            try:
                resp = requests.post(
                    url,
                    params={"key": api_key},
                    json={
                        "contents": [{"parts": [{"text": job["prompt"]}]}],
                        "generationConfig": {
                            "responseModalities": ["TEXT", "IMAGE"],
                            "imageConfig": {"aspectRatio": "1:1", "imageSize": "1K"},
                        },
                    },
                    timeout=120,
                )
                resp.raise_for_status()
                data = resp.json()
                parts = data["candidates"][0]["content"]["parts"]
                image_part = next(p for p in parts if p.get("inlineData"))
                b64 = image_part["inlineData"]["data"]
                img = Image.open(base64.b64decode(b64))  # JPEG
                img.load()
                # 判断是否 sheet (宽 >> 高 → 4 帧)
                frames = 4 if img.width >= img.height * 2 else 1
                # 原始 JPEG 保留便于 review
                raw = OUT_DIR / f"{job['id']}.jpg"
                raw.parent.mkdir(parents=True, exist_ok=True)
                img.save(raw, format="JPEG")
                slice_and_save(img, OUT_DIR / job["id"], frames)
                state[job["id"]] = {"raw": str(raw), "frames": frames, "prompt": job["prompt"][:120]}
                STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
                ok = True
                break
            except Exception as e:  # noqa: BLE001
                print(f"  attempt {attempt + 1} failed: {e}")
                time.sleep(2 * (attempt + 1))
        if not ok:
            print(f"  FAILED: {job['id']}")


def main():
    parser = argparse.ArgumentParser(description="Voidbound Gemini 批量生成")
    parser.add_argument("target", nargs="?", help="职业 id 或 主题 id")
    parser.add_argument("--all", action="store_true", help="全部职业")
    parser.add_argument("--monsters", metavar="THEME", help="生成指定主题怪物 (--monsters all = 全部)")
    parser.add_argument("--dry-run", action="store_true", help="仅打印 jobs")
    parser.add_argument("--list", action="store_true", help="列出可生成目标")
    args = parser.parse_args()

    load_env()

    if args.list:
        data = load_prompts("characters.yaml")
        print("职业:", ", ".join(data.get("classes", {}).keys()))
        mdata = load_prompts("monsters.yaml")
        for tid, theme in mdata.get("themes", {}).items():
            print(f"主题 {tid}:", ", ".join(theme.get("monsters", {}).keys()))
        return

    if args.monsters is not None:
        jobs = build_jobs("monsters", None if args.monsters == "all" else args.monsters)
    elif args.all:
        jobs = build_jobs("characters", None)
    elif args.target:
        jobs = build_jobs("characters", args.target)
    else:
        parser.print_help()
        return

    if not jobs:
        sys.exit("没有可生成的 job (检查 target id)")

    print(f"共 {len(jobs)} 个 job")
    if args.dry_run:
        for j in jobs:
            print(f"\n=== {j['id']} ===\n{j['prompt'][:400]}")
        return

    if not os.environ.get("GEMINI_API_KEY"):
        sys.exit("缺少 GEMINI_API_KEY: 设置环境变量或在 assets/ai-gen/.env 写入 GEMINI_API_KEY=xxx")
    run(jobs)


if __name__ == "__main__":
    main()
