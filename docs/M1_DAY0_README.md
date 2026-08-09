# M1 Day 0 启动 README

> 用途:M1 第 1 天开工前必读,所有事按顺序做完就能开写代码

---

## 0. 当前状态

本 session 已完成的所有准备工作:

```
[v1.1 文档]
  [x] CHANGELOG-v1.1.md     3 项架构决策 + 20 项默认提案
  [x] REQUIREMENTS.md       v1.1 补全(伤害公式 / 主循环 / 难度)
  [x] DESIGN.md             数据流改混合模式 + ringbuf 依赖
  [x] ROADMAP.md            M1-Day 8-9 加主循环决策点
  [x] CONTENT.md            难度词条 + 符文重铸模板
  [x] ASSETS.md             Kenney 系列 + AI 生成 + 染色 SOP
  [x] GAME_FLOW.md          启动到战斗完整流程
  [x] PLAYER_UX.md          5 类玩家画像 + 优化
  [x] M1_CHECKLIST.md       14 天逐项清单
  [x] CODE_REVIEW.md        Rust/TS 审查规范

[代码工具]
  [x] assets/ai-gen/scripts/batch_generate.py  v2(断点续传 + 重试)
  [x] assets/ai-gen/scripts/post_process.py     量化 + sheet
  [x] assets/atlas/scripts/stain_sprites.py    6 职业染色
  [x] assets/atlas/scripts/pack_atlas.py        PNG → 图集 + BIN + RUST
  [x] assets/atlas/scripts/verify_bin.py        BIN round-trip 验证

[已验证(端到端通过)]
  [x] cargo test 9/9(6 单元 + 3 集成)
  [x] pack_atlas + verify_bin PASS
  [x] 12 个 6 职业 stained sprite 已生成
  [x] characters.bin(1618 B)CRC 校验通过

[待启动 M1]
  [ ] src-tauri/ 项目初始化
  [ ] 真的 Kenney 资源替换 mock
  [ ] 真实 4 主题调色板应用到 Web 端
```

---

## 1. Day 0 必做清单(约 4 小时)

### 1.1 工具安装(30 分钟)

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup default stable

# Node.js 20 LTS
# 下载: https://nodejs.org/

# Tauri CLI
cargo install tauri-cli --version "^2.1"

# Python 依赖(已有,但确认)
pip install requests pyyaml pillow

# 可选:LibreSprite(像素画)
# https://libresprite.github.io/
```

验证:
```bash
cargo --version    # 应 1.96+
rustc --version
npm --version      # 应 20+
cargo tauri --version  # 应 2.1+
python --version   # 应 3.11+
```

### 1.2 下载 Kenney 资源(15 分钟)

打开浏览器下载以下 4 个 zip(全部 CC0):

- [Kenney Tiny Battle](https://kenney.nl/assets/tiny-battle) → `assets/ai-gen/downloads/tiny-battle.zip`
- [Kenney UI Pack](https://kenney.nl/assets/ui-pack) → `assets/ai-gen/downloads/ui-pack.zip`
- [Kenney RPG Icons](https://kenney.nl/assets/rpg-icons) → `assets/ai-gen/downloads/rpg-icons.zip`
- [Kenney Particle Pack](https://kenney.nl/assets/particle-pack) → `assets/ai-gen/downloads/particle-pack.zip`

```bash
# 解压到工作目录
cd assets/ai-gen/downloads
unzip tiny-battle.zip -d tiny-battle/
unzip ui-pack.zip -d ui-pack/
# ...
```

### 1.3 替换 mock sprite 为真 Kenney(30 分钟)

按 [`SPRITE_ASSEMBLY_SOP.md`](../assets/ai-gen/SPRITE_ASSEMBLY_SOP.md) 步骤:

1. 打开 `tiny-battle/Characters/` 看 4 个基础角色
2. 用 Aseprite 按 SOP 染色 + 加武器 + 加配饰
3. 导出 6 职业 12 张 PNG 到 `assets/atlas/input/characters/`

```bash
# 简化路径:先运行我们写好的染色脚本生成"接近版"
python assets/atlas/scripts/stain_sprites.py

# 然后用 Aseprite 手动画一遍替换
# (因为 Kenney 染色需要手绘细节,脚本只能做 80% 接近)
```

### 1.4 验证 pipeline(15 分钟)

跑一遍我们已有的端到端流水线:

```bash
# 1. 重打包
python assets/atlas/scripts/pack_atlas.py characters --rust-bin --rust-loader

# 2. 验证 .bin
python assets/atlas/scripts/verify_bin.py
# 期望: PASS: .bin 格式完全可解析

# 3. Rust 测试
cd assets/atlas/tests/rust_parser
cargo test
# 期望: 9 passed; 0 failed

# 4. 清理构建产物
cargo clean
```

### 1.5 M1 启动前决策拍板(30 分钟,2 人/独立思考)

把以下 5 个待确认项敲定:

| # | 决策 | v1.1 默认 | 状态 |
|---|------|----------|------|
| 1 | D-02 主循环架构 | 混合模式 | ✅ 已确认 |
| 2 | D-04 伤害公式(暴击倍率/抗性曲线/易伤上限) | **1.5x** / 75% / 50% | ✅ 已确认(调高暴击) |
| 3 | D-13 Tauri 版本 | **2.2**(先行版) | ✅ 已确认 |
| 4 | D-15 粒子策略 | **MVP GPU instanced** | ✅ 已确认 |
| 5 | D-25 角色命名 | **必填**(不可留空) | ✅ 已确认 |

`docs/CHANGELOG-v1.1.md` §5 列了完整最小决策集。

### 1.6 准备 demo 截图(20 分钟)

启动 M1 后第一件事是让"红色方块能 WASD 移动"。提前准备:

- 屏幕录像软件(OBS / Windows Game Bar)
- 截屏快捷键(Win+Shift+S)

---

## 2. M1 Day 1 开工(预计 6-8 小时)

### 2.1 上午:Tauri 项目初始化(3 小时)

按 [`M1_CHECKLIST.md`](M1_CHECKLIST.md) Day 1-2 节:

```bash
# 1. 在项目根初始化 Tauri
cd D:/work_space/personal_workspace/Voidbound
cargo tauri init --ci --app-name "Voidbound" --window-title "Voidbound"

# 2. 创建目录结构(参考 GAME_FLOW §1)
mkdir -p src-tauri/src/game src-tauri/src/save src-tauri/src/render
mkdir -p src/render src/game src/assets
mkdir -p assets/atlas/input/characters assets/atlas/output

# 3. 配置 Cargo.toml
# 见 M1_CHECKLIST.md §2.2
```

### 2.2 下午:基础渲染 + WASD 移动(3 小时)

按 M1_CHECKLIST.md Day 3-4 节,实现:
- WebGL2 初始化(红色方块)
- WASD 输入捕获
- 八方向移动(斜向归一化)
- 60 FPS 验证

**目标**:`M1_CHECKLIST.md` Day 3-4 验收 ✅

### 2.3 晚上:集成图集(2 小时)

把 `characters.bin` 集成进 Web 端:

```typescript
// src/render/atlas.ts
async function loadAtlas() {
  const binResp = await fetch('assets/atlas/output/characters.bin');
  const binData = await binResp.arrayBuffer();
  // 调用 Rust Tauri command parse_atlas(binData)
  // 返回 AtlasMeta
  // 加载 PNG 部分 → texture
}
```

---

## 3. 关键资源速查

### 3.1 文档

| 文档 | 何时读 |
|------|--------|
| `REQUIREMENTS.md` | 开工前 1 小时,理解需求 |
| `DESIGN.md` | 开工后随时查(系统设计参考) |
| `GAME_FLOW.md` | 写 UI 时查(界面流程) |
| `M1_CHECKLIST.md` | **每日开工必读** |
| `ASSETS.md` | 需要美术资源时查 |
| `CHANGELOG-v1.1.md` | 决策有疑问时查 |
| `CODE_REVIEW.md` | 写完一段代码后自审 |

### 3.2 脚本

| 脚本 | 何时跑 |
|------|--------|
| `stain_sprites.py` | 重做 sprite 时 |
| `pack_atlas.py` | sprite 改动后必跑 |
| `verify_bin.py` | `pack_atlas.py` 后必跑 |
| `cargo test` | 改 Rust parser 后必跑 |
| `batch_generate.py` | 真要做 AI 生成时(不是 Day 0) |

### 3.3 决策中枢

所有"为什么这样设计"的答案都在:

- `CHANGELOG-v1.1.md` §1(已确认决策)
- `CHANGELOG-v1.1.md` §2(默认提案,待 review)
- `CHANGELOG-v1.1.md` §4(24 项问题映射表)

---

## 4. 常见问题 Day 0 排查

### Q1: `cargo tauri init` 失败?

**A**: 大概率是 Tauri CLI 没装好。重跑:
```bash
cargo install tauri-cli --version "^2.1" --force
```

### Q2: WebGL2 创建失败?

**A**: 浏览器版本。Tauri 用系统 WebView:
- Windows: Edge WebView2(Win10 1809+ 自带)
- macOS: WKWebView(macOS 10.13+)
- Linux: WebKitGTK 4.1+

### Q3: `cargo test` 失败?

**A**: 99% 是依赖问题:
```bash
cd assets/atlas/tests/rust_parser
cargo update
cargo clean
cargo test
```

### Q4: stain_sprites.py 输出图片看不清楚?

**A**: 16x16 像素在 1080p 屏幕上很小,正常。
- 用 Aseprite 打开,放大 8x 看(`View > Zoom > 800%`)
- 或在游戏里渲染时缩放到 32x32 / 64x64

### Q5: `verify_bin.py` 报 CRC 不匹配?

**A**: 升级了 `pack_atlas.py` 但忘了重跑 → 重跑:
```bash
python assets/atlas/scripts/pack_atlas.py characters --rust-bin --rust-loader
python assets/atlas/scripts/verify_bin.py
```

---

## 5. Day 0 完成检查清单

```
下班前确认:
  [ ] Rust + Node + Tauri CLI + Python 全部安装 ✓
  [ ] Kenney 4 个资源包下载并解压 ✓
  [ ] assets/atlas/input/characters/ 有 6 职业 sprite ✓
  [ ] python pack_atlas.py + verify_bin.py 跑通 ✓
  [ ] cargo test 9/9 通过 ✓
  [x] 5 项 v1.1 决策拍板(D-02 / D-04 / D-13 / D-15 / D-25)✓(全部已确认)
  [ ] demo 录像软件准备好 ✓

全部完成后:
  → 进入 M1 Day 1,按 M1_CHECKLIST.md 开工
```

---

## 6. 参考

- M1 逐项清单:[`M1_CHECKLIST.md`](M1_CHECKLIST.md)
- 核心流程:[`GAME_FLOW.md`](GAME_FLOW.md)
- v1.1 决策:[`CHANGELOG-v1.1.md`](CHANGELOG-v1.1.md)
- 完整素材:[`ASSETS.md`](ASSETS.md)
- 代码规范:[`CODE_REVIEW.md`](CODE_REVIEW.md)