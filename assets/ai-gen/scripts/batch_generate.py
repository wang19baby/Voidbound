#!/usr/bin/env python3
"""
Voidbound 角色 / 怪物 AI 批量生成 v2
依赖 SD WebUI API (A1111 / Forge)

v2 新增:
  - 断点续传(state.json 记录已完成项)
  - 进度条(tqdm 优雅降级)
  - 失败重试(3 次,指数退避)
  - 错误日志
  - 干跑模式(--dry-run)
  - 列出模式(--list)
  - 单职业 / 全部 / 怪物 / 单怪物 多种调用方式

用法:
  python batch_generate.py barbarian           # 单个职业
  python batch_generate.py --all               # 全部 6 职业
  python batch_generate.py --monsters forest   # 森林怪物
  python batch_generate.py --monster forest/zombie_infant  # 单个怪物
  python batch_generate.py --list              # 列出可生成目标
  python batch_generate.py --dry-run barbarian # 仅打印,不调用
  python batch_generate.py --reset barbarian   # 重置状态重新生成
"""

import argparse
import base64
import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

try:
    import requests
except ImportError:
    print("缺少依赖: requests. 安装: pip install requests pyyaml pillow")
    sys.exit(1)

try:
    import yaml
except ImportError:
    print("缺少依赖: pyyaml. 安装: pip install pyyaml")
    sys.exit(1)

# tqdm 优雅降级
try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False
    def tqdm(iterable, **kwargs):
        desc = kwargs.get("desc", "")
        total = kwargs.get("total", len(iterable) if hasattr(iterable, "__len__") else None)
        print(f"{desc} (共 {total} 项)" if total else desc)
        for i, item in enumerate(iterable):
            if total:
                print(f"  进度: {i + 1}/{total}")
            yield item


# ============== 配置 ==============

API_URL = "http://localhost:7860"
OUTPUT_DIR = Path(__file__).parent.parent / "output"
PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
STATE_FILE = OUTPUT_DIR / "_state.json"
ERROR_LOG = OUTPUT_DIR / "_errors.log"

DEFAULT_PARAMS = {
    "steps": 25,
    "cfg_scale": 7.5,
    "sampler_name": "Euler a",
    "width": 512,
    "height": 512,
    "batch_size": 1,
    "n_iter": 4,
}

MAX_RETRIES = 3
RETRY_BACKOFF = [2, 5, 10]  # 秒


# ============== 状态管理 ==============


def load_state() -> dict:
    """加载状态文件(已完成项)"""
    if STATE_FILE.exists():
        with open(STATE_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {"completed": [], "failed": []}


def save_state(state: dict) -> None:
    """保存状态"""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)


def mark_completed(state: dict, key: str) -> None:
    state["completed"].append({"key": key, "at": datetime.now().isoformat()})
    save_state(state)


def mark_failed(state: dict, key: str, error: str) -> None:
    state["failed"].append({"key": key, "error": error, "at": datetime.now().isoformat()})
    save_state(state)


def is_completed(state: dict, key: str) -> bool:
    return any(c["key"] == key for c in state.get("completed", []))


def log_error(key: str, error: str) -> None:
    """写入错误日志"""
    ERROR_LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(ERROR_LOG, "a", encoding="utf-8") as f:
        f.write(f"[{datetime.now().isoformat()}] {key}: {error}\n")


# ============== 工具函数 ==============


def load_yaml(filename: str) -> dict:
    """加载 YAML 提示词文件"""
    path = PROMPTS_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"提示词文件不存在: {path}")
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def build_prompt(
    base_prefix: str,
    base: str,
    suffix: str = "",
    tint: str = "",
    base_negative: str = "",
) -> tuple[str, str]:
    """组装完整 prompt"""
    parts = [base_prefix, base]
    if suffix:
        parts.append(suffix)
    if tint:
        parts.append(tint)
    positive = ", ".join(parts)
    return positive, base_negative


def call_txt2img_with_retry(
    prompt: str,
    negative: str,
    params: dict,
    timeout: int = 180,
) -> list[bytes]:
    """调用 SD WebUI API,带重试"""
    payload = {
        "prompt": prompt,
        "negative_prompt": negative,
        **params,
    }
    last_error: Optional[Exception] = None

    for attempt in range(MAX_RETRIES):
        if attempt > 0:
            wait = RETRY_BACKOFF[min(attempt - 1, len(RETRY_BACKOFF) - 1)]
            print(f"  ⟳ 重试 {attempt}/{MAX_RETRIES - 1},等待 {wait}s...")
            time.sleep(wait)
        try:
            t0 = time.time()
            resp = requests.post(
                f"{API_URL}/sdapi/v1/txt2img",
                json=payload,
                timeout=timeout,
            )
            resp.raise_for_status()
            elapsed = time.time() - t0
            images_b64 = resp.json().get("images", [])
            print(f"  ✓ 完成 ({elapsed:.1f}s),生成 {len(images_b64)} 张")
            return [base64.b64decode(img) for img in images_b64]
        except requests.exceptions.RequestException as e:
            last_error = e
            print(f"  ✗ 失败: {e}")

    raise RuntimeError(f"重试 {MAX_RETRIES} 次仍失败: {last_error}")


def save_images(images: list[bytes], output_dir: Path, prefix: str) -> list[Path]:
    """保存图片"""
    output_dir.mkdir(parents=True, exist_ok=True)
    saved = []
    for i, img_bytes in enumerate(images):
        path = output_dir / f"{prefix}_{i:02d}.png"
        path.write_bytes(img_bytes)
        saved.append(path)
    print(f"  → 保存到: {output_dir}/{prefix}_*.png ({len(saved)} 张)")
    return saved


# ============== 生成器 ==============


def generate_character(
    class_name: str,
    prompts_data: dict,
    state: dict,
    dry_run: bool = False,
    force: bool = False,
) -> tuple[int, int]:
    """生成单个职业的所有变体

    Returns:
        (success_count, skipped_count)
    """
    if class_name not in prompts_data["classes"]:
        print(f"X 未知职业: {class_name}")
        print(f"  可选: {list(prompts_data['classes'].keys())}")
        return 0, 0

    char = prompts_data["classes"][class_name]
    output_dir = OUTPUT_DIR / class_name
    base_prefix = prompts_data["base_prefix"]
    base_negative = prompts_data["base_negative"]
    lora_weight = prompts_data.get("lora_weight", 0.85)
    lora_suffix = f" <lora:pixelartxl:{lora_weight}>"

    total_jobs = len(char["poses"]) * len(char["theme_tints"])
    print(f"\n{'=' * 60}")
    print(f"生成职业: {char['name_cn']} ({class_name})")
    print(f"姿势: {len(char['poses'])}, 主题: {len(char['theme_tints'])}")
    print(f"共: {total_jobs} 组 x {DEFAULT_PARAMS['n_iter']} 张 = {total_jobs * DEFAULT_PARAMS['n_iter']} 张")
    print(f"{'=' * 60}")

    success = 0
    skipped = 0

    jobs = [(p, t) for p in char["poses"] for t in char["theme_tints"].items()]
    iterator = tqdm(jobs, desc=f"  {class_name}") if HAS_TQDM else jobs

    for pose, (theme_name, tint) in iterator:
        key = f"{class_name}/{pose['name']}/{theme_name}"
        if not force and is_completed(state, key):
            skipped += 1
            if not HAS_TQDM:
                print(f"  跳过(已完成): {key}")
            continue

        prompt, negative = build_prompt(
            base_prefix=base_prefix + lora_suffix,
            base=char["base"],
            suffix=pose["suffix"],
            tint=tint,
            base_negative=base_negative,
        )
        prefix = f"{pose['name']}_{theme_name}"

        if dry_run:
            print(f"\n[{key}]")
            print(f"  POS: {prompt[:120]}...")
            print(f"  NEG: {negative[:120]}...")
            continue

        try:
            images = call_txt2img_with_retry(prompt, negative, DEFAULT_PARAMS)
            if images:
                save_images(images, output_dir, prefix)
                mark_completed(state, key)
                success += 1
        except Exception as e:
            print(f"  X 永久失败 {key}: {e}")
            log_error(key, str(e))
            mark_failed(state, key, str(e))

    return success, skipped


def generate_monsters(
    theme: str,
    monster_id: Optional[str],
    prompts_data: dict,
    state: dict,
    dry_run: bool = False,
    force: bool = False,
) -> tuple[int, int]:
    """生成怪物"""
    if theme not in prompts_data["themes"]:
        print(f"X 未知主题: {theme}")
        print(f"  可选: {list(prompts_data['themes'].keys())}")
        return 0, 0

    theme_data = prompts_data["themes"][theme]
    output_dir = OUTPUT_DIR / "monsters" / theme
    base_prefix = prompts_data["base_prefix"]
    base_negative = prompts_data["base_negative"]
    lora_weight = prompts_data.get("lora_weight", 0.85)
    lora_suffix = f" <lora:pixelartxl:{lora_weight}>"

    monsters = theme_data["monsters"]
    if monster_id:
        if monster_id not in monsters:
            print(f"X 未知怪物: {theme}/{monster_id}")
            print(f"  可选: {list(monsters.keys())}")
            return 0, 0
        monsters = {monster_id: monsters[monster_id]}

    print(f"\n{'=' * 60}")
    print(f"生成主题: {theme_data['name_cn']} ({theme})")
    print(f"怪物数: {len(monsters)}")
    print(f"{'=' * 60}")

    success = 0
    skipped = 0

    iterator = tqdm(monsters.items(), desc=f"  {theme}") if HAS_TQDM else monsters.items()

    for mid, monster in iterator:
        key = f"monster/{theme}/{mid}"
        if not force and is_completed(state, key):
            skipped += 1
            if not HAS_TQDM:
                print(f"  跳过(已完成): {mid}")
            continue

        prompt, negative = build_prompt(
            base_prefix=base_prefix + lora_suffix,
            base=monster["base"],
            tint=theme_data["palette"],
            base_negative=base_negative,
        )

        if dry_run:
            print(f"\n[{key}] {monster['name_cn']}")
            print(f"  POS: {prompt[:120]}...")
            continue

        try:
            images = call_txt2img_with_retry(prompt, negative, DEFAULT_PARAMS)
            if images:
                save_images(images, output_dir, mid)
                mark_completed(state, key)
                success += 1
        except Exception as e:
            print(f"  X 永久失败 {key}: {e}")
            log_error(key, str(e))
            mark_failed(state, key, str(e))

    return success, skipped


# ============== CLI ==============


def main():
    parser = argparse.ArgumentParser(
        description="Voidbound AI 批量生成 v2 (SD WebUI API)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "target",
        nargs="?",
        help="职业名(barbarian/paladin/sorceress/necromancer/ranger/assassin)",
    )
    parser.add_argument("--all", action="store_true", help="生成全部 6 职业")
    parser.add_argument("--monsters", metavar="THEME", help="生成指定主题怪物 (forest/desert/frozen/void)")
    parser.add_argument("--monster", metavar="THEME/ID", help="生成单个怪物 (如 forest/zombie_infant)")
    parser.add_argument("--dry-run", action="store_true", help="仅打印,不发请求")
    parser.add_argument("--list", action="store_true", help="列出可生成目标")
    parser.add_argument("--reset", action="store_true", help="重置状态重新生成")
    parser.add_argument("--api", default=API_URL, help=f"SD WebUI API 地址 (默认 {API_URL})")
    parser.add_argument("--steps", type=int, help="覆盖默认采样步数")
    args = parser.parse_args()

    global API_URL
    API_URL = args.api

    if args.steps:
        DEFAULT_PARAMS["steps"] = args.steps

    print("Voidbound AI 批量生成 v2")
    print(f"  API: {API_URL}")
    print(f"  输出: {OUTPUT_DIR}")
    print(f"  状态: {STATE_FILE}")
    print(f"  错误日志: {ERROR_LOG}")
    print()

    # 列表模式
    if args.list:
        char_data = load_yaml("characters.yaml")
        monster_data = load_yaml("monsters.yaml")
        print("[职业]:")
        for cn, data in char_data["classes"].items():
            poses = len(data["poses"])
            themes = len(data["theme_tints"])
            print(f"  - {cn:15s} {data['name_cn']:8s} {poses} 姿势 x {themes} 主题 = {poses * themes} 组")
        print("\n[怪物主题]:")
        for tn, data in monster_data["themes"].items():
            print(f"  - {tn:10s} {data['name_cn']:8s} {len(data['monsters'])} 怪物")
        return

    state = load_state()

    # 重置
    if args.reset:
        if args.target:
            target_prefix = args.target
            state["completed"] = [c for c in state["completed"] if not c["key"].startswith(target_prefix)]
            state["failed"] = [c for c in state["failed"] if not c["key"].startswith(target_prefix)]
            save_state(state)
            print(f"重置状态: {target_prefix}*")
        else:
            state = {"completed": [], "failed": []}
            save_state(state)
            print("重置全部状态")

    total_success = 0
    total_skipped = 0

    # 单怪物
    if args.monster:
        theme, mid = args.monster.split("/", 1)
        monster_data = load_yaml("monsters.yaml")
        s, sk = generate_monsters(theme, mid, monster_data, state, args.dry_run, force=args.reset)
        total_success += s
        total_skipped += sk

    # 主题怪物
    elif args.monsters:
        monster_data = load_yaml("monsters.yaml")
        s, sk = generate_monsters(args.monsters, None, monster_data, state, args.dry_run, force=args.reset)
        total_success += s
        total_skipped += sk

    # 全部职业
    elif args.all:
        char_data = load_yaml("characters.yaml")
        for class_name in char_data["classes"].keys():
            s, sk = generate_character(class_name, char_data, state, args.dry_run, force=args.reset)
            total_success += s
            total_skipped += sk

    # 单职业
    elif args.target:
        char_data = load_yaml("characters.yaml")
        s, sk = generate_character(args.target, char_data, state, args.dry_run, force=args.reset)
        total_success += s
        total_skipped += sk

    else:
        parser.print_help()
        return

    # 总结
    if not args.dry_run:
        print(f"\n{'=' * 60}")
        print(f"完成! 成功: {total_success}, 跳过(已完成): {total_skipped}")
        print(f"总计已完成: {len(state['completed'])}, 失败: {len(state['failed'])}")
        if state["failed"]:
            print(f"失败列表见: {ERROR_LOG}")
            for f in state["failed"][-5:]:
                print(f"  - {f['key']}: {f['error'][:60]}")
        print(f"{'=' * 60}")


if __name__ == "__main__":
    main()