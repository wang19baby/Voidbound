# Voidbound 美术升级研究报告(2026-08-10)

> 用途:回答"如何生成更好的角色/地图/怪物美术",固化调研结论与可行路径
> 状态:调研完成,路径待拍板

---

## 1. 现状根因(为什么画质低)

| 项 | 现状 | 根因 |
|---|---|---|
| 角色 | 16×16 Kenney Tiny Battle 染色(仅 sorceress 4 向、barbarian 3 向) | 占位素材,未走 AI 管线 |
| 怪物 | 32×32 Kenney 系 + 染色变体 ×17 | 占位素材 + 染色撑数 |
| 地图 | 16×16 瓦片放大到 64px 世界格 | 瓦片源 16×16,放大 4 倍颗粒感重 |
| AI 管线 | `assets/ai-gen/output/` **为空** | 管线写好了但 SD WebUI 从未跑通(本地无安装) |

**结论**:所有美术 = Kenney 占位像素集;`batch_generate.py`(SD WebUI 版)从未产出过一张图。画质低不是生成质量问题,是**素材源没升级**。

---

## 2. 三条升级路径(调研结论)

### 路径 A · 云端 AI 生成(Nano Banana / Gemini 图像模型)⭐ 推荐

- **能力**:文本 → 完整 sprite sheet(多帧动画/透明底/指定分辨率),可生成 64×64~128×128 高清角色/怪物;输出后处理(裁切帧、透明化、调色板量化)已有 `post_process.py` 雏形。
- **现状**:项目技能 `gemini-imagegen` 存在;web 调研确认这是 2026 主流工作流(rosebud.ai / spritecook.ai 等工具链均基于它)。
- **阻塞**:需要 `GEMINI_API_KEY`(环境变量当前 unset);按量付费(每张约 $0.02-0.08)。
- **改造**:`batch_generate.py` 的 API 目标从 `localhost:7860`(SD WebUI)改为 Gemini API,其余(断点续传/重试/prompts YAML)可复用。
- **收益**:角色/怪物全部换高清新画;prompts/characters.yaml + monsters.yaml 已备好提示词。

### 路径 B · LPC 本地资产(已下载,零成本)

- **能力**:`downloads/Universal-LPC-Spritesheet-Character-Generator`(完整仓库:分层 spritesheets + chargen.js 渲染器)+ `lpc-base-assets`(32×32 瓦片 grass/dirt/dungeon/castle + monsters/people sprites)。64×64 完整角色(4 方向 × 走/挥砍/施法多帧),质量远超 16×16 Kenney。
- **阻塞**:⚠️ **许可证冲突**——LPC 是 **GPL-3.0 / CC-BY-SA 3.0**,项目 README 决定"只用 CC0"。CC-BY-SA 需署名 + 衍生品同许可发布,与闭源/作品集分发冲突。
- **收益**:离线、免费、全套(角色/怪物/瓦片一站式),立即可用。

### 路径 C · Kenney 更高清 CC0 包(最合规)

- **能力**:Kenney 站更高清包(如 Tiny Town 32×32 城镇/室内、Nature Kit 地形、Top-Down 系列 32×32+),CC0 零风险。
- **阻塞**:需新下载(可写脚本抓取 zip);质量提升有限——仍是像素风,只是分辨率高一档;怪物/角色无成套高清替代。

---

## 3. 建议

**路径 A**(云端 AI)画质收益最大且可控(提示词→调色板→后处理全链路已有雏形),角色/怪物/地图瓦片都能出 64×64+ 新画;需要用户提供一个 Gemini API key。

**路径 B** 作为零成本备选,若用户愿意接受 CC-BY-SA 许可证(个人作品集 + 署名 + 同许可声明,实操常见)。

**路径 C** 兜底:不引入任何外部依赖,只能小幅改善。

---

## 4. 待拍板

- [ ] 走哪条路径(A 需 API key / B 需许可确认 / C 需下载)
- [ ] 目标分辨率(64×64 像素精修 vs 128×128 高清)
- [ ] 首批生成范围(角色 6 职业 × 4 帧 or 怪物 17 只 or 地图瓦片 4 主题)
