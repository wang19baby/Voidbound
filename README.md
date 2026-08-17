# Voidbound（虚空之缚）

> 一款 2D 俯视肉鸽 ARPG，灵感来自《暗黑破坏神 2 重制版》，融合肉鸽随机机制。

> **当前版本：v0.1.0 (2026-08-13)** —— 架构重构周完成,详见 [`CHANGELOG.md`](CHANGELOG.md) 与 [`docs/architecture.md`](docs/architecture.md)。

> **⚠ 当前为战斗原型（2026-08-13）**：已实现——1 职业 / 17 怪（染色变体）/ 4 主题 / 单层地牢（清图→Boss→通关）/ 4 槽穿戴 / 符文三选一 / 5 档难度 / 存档 v4。**规划中未实现**：6 职业、30+ 独立模型、3 城镇、WFC 地图、账号级多角色 UI。

---

## 游戏简介

**Voidbound** 是一款单局 30-60 分钟的肉鸽 ARPG。玩家在随机生成的地下城中战斗、刷装、升级技能树，每次升级可能触发「虚空符文」变异，永久改变技能效果。死亡后回到城镇，保留永久进度，重新挑战更高难度。

### 核心玩法

- **混合驱动**：装备词条（5 级稀有度）+ 技能树变异双线成长
- **WASD 移动** + **鼠标点击** + **QWER 技能栏**
- **6 个职业**：野蛮人 / 圣骑士 / 法师 / 死灵法师 / 游侠 / 刺客
- **30+ 怪物** 分布于 4 个生态主题（暗黑森林 / 灼热沙漠 / 冰冻废墟 / 虚空深渊）
- **3 个永久城镇** 作为基地
- **WFC 算法** 生成每次都不同的随机地图
- **肉鸽符文变异** —— 核心创新点

---

## 操作

| 按键 | 动作 |
|------|------|
| **WASD** | 八方向移动 |
| **鼠标左键** | 主技能 / 拾取物品 |
| **鼠标右键** | 副技能 / 强制移动 |
| **Q / W / E / R** | 技能栏（4 个主动技能槽） |
| **空格** | 翻滚（短距位移 + 短暂无敌） |
| **1 / 2 / 3 / 4** | 使用药水 |

---

## 技术栈

| 层 | 技术 | 用途 |
|----|------|------|
| **外壳** | Tauri 2.x | 跨平台打包 |
| **游戏核心** | Rust | 物理 / 战斗 / 存档 / WFC |
| **渲染** | WebGL2 + 原生 TypeScript | 高性能粒子 + 像素图渲染 |
| **数学** | glam（Rust）/ gl-matrix（Web） | 向量 / 矩阵运算 |
| **随机生成** | fast-wfc（Rust） | 地图生成 |
| **存档** | JSON（开发）→ 二进制（生产） | 角色 / 进度 / 本次运行 |

**为什么不用 React / Three.js**：游戏的渲染是高频帧，虚拟 DOM 和重场景框架对性能是负优化。直接用原生 WebGL2 + TypeScript 既轻量又快。

---

## 项目结构

```
Voidbound/
├── docs/                     # 项目文档
│   ├── REQUIREMENTS.md      # 需求规格
│   ├── DESIGN.md            # 完整设计文档
│   ├── ROADMAP.md           # 实施路线
│   ├── architecture.md      # v0.1.0 架构文档
│   └── CONTENT.md           # 内容规格与提示词
├── design/                   # 设计草图 / 美术参考
├── src-tauri/                # Rust 端（待初始化）
│   ├── src/
│   │   ├── main.rs
│   │   ├── game/
│   │   │   ├── mod.rs
│   │   │   ├── entity.rs
│   │   │   ├── combat.rs
│   │   │   ├── procgen.rs
│   │   │   ├── items.rs
│   │   │   └── skills.rs
│   │   └── save/
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                      # Web 端
│   ├── index.html
│   ├── main.ts
│   ├── core/                # 基础设施 (eventBus, pool)
│   ├── application/         # 跨域服务
│   ├── game/                # 领域核心
│   │   ├── character/    # DDD 玩家聚合
│   │   ├── inventory/    # DDD 装备聚合
│   │   ├── fx/           # VFX + facade
│   │   └── system/       # GameSystem 注册表
│   ├── presentation/        # 渲染层
│   ├── render/              # WebGL/HUD
│   │   └── hud/          # HUD 子模块 + overlay
│   ├── app/                 # 应用层 (lifecycle/audio/save/screenMachine)
│   ├── screens/             # 屏幕渲染
│   └── ui/                  # UI primitives
├── assets/                   # 像素图集、shader
├── .github/
├── .gitignore
└── README.md
```

---

## 架构 (v0.1.0)

详见 [docs/architecture.md](docs/architecture.md)。

简要:
- main.ts 979 行 (≤1000)
- core/ 基础设施 + application/ 跨域服务
- game/ DDD 聚合 (character/inventory) + 子模块 (fx/monsters/combat/system)
- presentation/ 渲染层 + render/ WebGL/HUD (hud/overlay)
- app/ 应用层 + screens/ 屏幕
- 事件总线 (13 事件) + System 注册表 (4 内置) + FX facade

> 累计减重 2647 → 979 行 (-63.0%),通过 PR-007/PR-008 拆 dead code + 搬 app/ 模块

测试: `npm test` (25 个套件 ALL PASS)
构建: `npm run build` (esbuild ~400.7kb)

---

## 文档导航

- 📋 [需求规格](docs/REQUIREMENTS.md) —— 功能 / 非功能 / 约束
- 🎨 [完整设计文档](docs/DESIGN.md) —— 11 大系统 + 技术架构
- 🛣️ [实施路线](docs/ROADMAP.md) —— 4 阶段 7 周时间线
- 📝 [内容规格](docs/CONTENT.md) —— 怪物 / 技能 / 装备 / 地图提示词模板
- 📜 [v1.1 变更单](docs/CHANGELOG-v1.1.md) —— 3 项架构决策 + 20 项默认提案
- 🎨 [素材资源清单](docs/ASSETS.md) —— CC0 素材 / Kenney 系列 / SFX / BGM 来源
- 🎮 [核心游戏流程](docs/GAME_FLOW.md) —— 启动到战斗的完整 UI / 数据流
- 👥 [玩家需求与优化](docs/PLAYER_UX.md) —— 5 类玩家画像 + 12 项痛点 + 优化矩阵
- ✅ [M1 启动 Checklist](docs/M1_CHECKLIST.md) —— 第 1 周逐项执行清单
- 🚀 [M1 Day 0 README](docs/M1_DAY0_README.md) —— 开工前 4 小时准备指南
- 🦀 [Rust 架构规划](docs/RUST_ARCHITECTURE.md) —— 模块分层 / 数据结构 / 设计模式 / 14 天实施

---

## 开发状态

🚧 **Phase 0：设计阶段** —— 文档已完成，等待开发启动

- [x] 需求规格
- [x] 设计文档
- [x] 实施路线
- [x] 内容规格模板
- [ ] Phase 1：MVP（搭框架 + WASD 移动 + 一个火球技能）
- [ ] Phase 2：战斗系统（6 职业 / 30+ 怪物 / 装备系统）
- [ ] Phase 3：地图与随机性（WFC / 4 主题 / 3 城镇 / 符文变异）
- [ ] Phase 4：打磨与发布

---

## 灵感来源（v1.1 调整）

- 《暗黑破坏神 2 重制版》—— 装备系统 / 技能树 / 视觉风格
- 《Hades》—— 肉鸽循环 / 双轨符文变异
- 《死亡细胞》—— 随机地图 / 高密度战斗
- 《Path of Exile》—— 全套难度系统 / 词条密度

---

## License & 鸣谢

本项目采用**拆分许可证**——不同部分不同许可,清晰无歧义。

| 内容类型 | 许可证 | 适用文件 |
|---|---|---|
| **源代码** | [MIT](LICENSE) | `src/`、`src-tauri/src/`、`tests/`、构建脚本、Steam 工具脚本 |
| **AI 生成美术素材** | [CC-BY-NC-ND 4.0](LICENSE-ASSETS) | `assets/atlas/`、`assets/ai-gen/output/`、`assets/ai-gen/prompts/*.yaml`、`PROMPTS_*.md` |
| **文档** | [CC-BY 4.0](LICENSE-DOCS) | `docs/`、`README.md`、`CHANGELOG.md`、`steam/README.md` |
| **游戏二进制 (Steam)** | [EULA](EULA.md) | 发布在 Steam 上的安装包 |
| **第三方鸣谢** | [NOTICE](NOTICE) | Google Gemini / Tauri / esbuild / Kenney 等 |

### 为什么素材用 CC-BY-NC-ND 而代码用 MIT

- **代码 MIT**:鼓励 fork、二开、学习、商用——这是开源的意义。
- **素材 NC-ND(禁止转卖 / 禁止衍生)**:
  - 防有人把我们的提示词或生成图打包成"AI 提示词包 / 像素素材包"卖钱
  - 防有人把生成图直接上传到 Unity Asset Store / Unreal Marketplace / itch.io 付费区转售
  - 防有人把美术改改色就拿去商用
- **游戏二进制 EULA**:Steam 上跑的安装包禁止转卖(G2A / CDKeys 等)、禁止拆包提取美术。
- 个人/教育/同人/直播/评测**免费可用,需署名**。

### AI 生成内容声明

本游戏的多数美术素材由 **Google Gemini** 图像模型生成(Nano Banana / 2.5-flash-image 等),在项目作者本人创意指导下完成,经过逐张人工审核与调整后才进入游戏。详见 [NOTICE](NOTICE) 与 [`assets/ai-gen/README.md`](assets/ai-gen/README.md)。

🙏 **特别鸣谢 Google Gemini 团队**——没有这个工具,独立开发者不可能在零美术预算下产出 4 主题 × 17 怪 × 6 职业的美术。

如需商用授权(付费游戏 / 资产包等),请联系项目作者,另行签订付费授权。

### 第三方资源

- 早期占位素材:Kenney 系列(CC0)
- 桌面外壳:Tauri(MIT / Apache-2.0)
- 打包:esbuild(MIT)
- 字体:Press Start 2P(SIL OFL)

详见 [`docs/ASSETS.md`](docs/ASSETS.md)。