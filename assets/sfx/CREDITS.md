# Voidbound — Audio Credits & Licenses

> SPDX-License-Identifier: CC-BY-NC-ND-4.0
>
> **所有 `assets/sfx/` 下的音频文件均由 AI 模型直接生成,无第三方来源。**
> 本游戏使用的生成式 AI 服务 = **Google Gemini** (与美术同源)。
> 许可证与美术一致,详见仓库根 [`LICENSE-ASSETS`](../../LICENSE-ASSETS)。

----------------------------------------------------------------------
## 总览
----------------------------------------------------------------------

| 文件 | 时长 | 内容 | 生成方式 | 模型 | 用途 |
|------|------|------|---------|------|------|
| `bgm_forest.wav`  | TBD | 森林主题 BGM | AI 直生 | Gemini (TTS/audio) | 地牢/森林循环 |
| `bgm_desert.wav`  | TBD | 沙漠主题 BGM | AI 直生 | Gemini (TTS/audio) | 地牢/沙漠循环 |
| `bgm_ruin.wav`    | TBD | 废墟主题 BGM | AI 直生 | Gemini (TTS/audio) | 地牢/冰冻循环 |
| `bgm_void.wav`    | TBD | 虚空主题 BGM | AI 直生 | Gemini (TTS/audio) | 地牢/虚空循环 |
| `fireball.wav`    | TBD | 火球释放 | AI 直生 | Gemini (TTS/audio) | 技能 SFX |
| `hit.wav`         | TBD | 命中 | AI 直生 | Gemini (TTS/audio) | 战斗 SFX |
| `swing.wav`       | TBD | 挥砍 | AI 直生 | Gemini (TTS/audio) | 战斗 SFX |
| `die.wav`         | TBD | 死亡 | AI 直生 | Gemini (TTS/audio) | 死亡 SFX |
| `boss_roar.wav`   | TBD | Boss 吼叫 | AI 直生 | Gemini (TTS/audio) | Boss 战 SFX |
| `crit.wav`        | TBD | 暴击 | AI 直生 | Gemini (TTS/audio) | 暴击反馈 |
| `levelup.wav`     | TBD | 升级 | AI 直生 | Gemini (TTS/audio) | 升级反馈 |
| `pickup.wav`      | TBD | 拾取 | AI 直生 | Gemini (TTS/audio) | 拾取反馈 |
| `ui_click.wav`    | TBD | UI 点击 | AI 直生 | Gemini (TTS/audio) | UI 反馈 |

----------------------------------------------------------------------
## AI 生成音频的合规依据
----------------------------------------------------------------------

### 1. 权利归属

Google Gemini 的 [服务条款](https://ai.google.dev/terms) 明确:

> "Subject to the terms... you retain ownership of any outputs you
> generate using the Services."

即使用户用 Gemini 的文本/音频生成 API,生成内容的版权属于调用方
(本项目作者),与 Google 无关。

### 2. 合规审查

每条提示词与生成结果都按 Google 的
[Generative AI Prohibited Use Policy](https://policies.google.com/terms/generative-ai/)
做了审查:

- 不模仿可识别真实人物的声音
- 不生成仇恨/暴力/色情音频
- 不复制受版权保护的现有音频样本(无原曲 prompt-in)
- 所有 BGM/SFX 均为原创提示词产生的全新音频

### 3. 与美术的处理一致

本项目美术素材也是 Gemini 生成,处理方式一致:

| 维度 | 美术(sprite) | 音频(wav) |
|------|------------|----------|
| 生成方 | Google Gemini image | Google Gemini audio |
| 许可证 | CC-BY-NC-ND 4.0 (`LICENSE-ASSETS`) | CC-BY-NC-ND 4.0 (`LICENSE-ASSETS`) |
| 鸣谢文件 | `assets/ai-gen/README.md` | 本文件 |
| 反转卖 | 禁转卖提示词 / 禁上传付费素材站 | 禁转卖 BGM 包 / 禁用作付费游戏配乐 |

----------------------------------------------------------------------
## 许可细节(与 LICENSE-ASSETS 完全对齐)
----------------------------------------------------------------------

### 允许(免费,需署名 "Voidbound Contributors")

- 个人项目 / 教育用途 / 同人游戏(免费)
- 开源 / 免费游戏内嵌(免费版)
- 直播 / 视频 / 评论文章(含游戏音频片段)
- 学术分析 / 新闻报道

### 禁止(NC-ND 双重保护)

- **不许转售**——禁止把单个 wav 或整个 `assets/sfx/` 目录打包成付费
  "游戏音频包" / "AI 配乐包" 在任何素材站卖(Gumroad / Unity Asset
  Store / AudioJungle / Pond5 等)。
- **不许商用嵌入**——禁止在付费游戏 / 付费 Mod / 付费 Patreon 内容
  / 商业广告中使用本目录的音频。
- **不许衍生**——禁止重混 / 重新拼接 / 改音调 / 改 BPM 后再次分发。
  (内部使用,如剪辑 + 拼接到游戏内的事件,不算重新分发,允许。)

### 商用授权

如需用于付费游戏、商业广告、付费内容:

  联系项目作者 → 另行签订商用 license(价格独立协商)。

----------------------------------------------------------------------
## Steam 上架披露(必须填到 About 开头)
----------------------------------------------------------------------

复制以下文字到 Steamworks → Store Presence → About 的开头:

> "Some or all in-game art assets and audio (BGM tracks, combat SFX,
> UI sounds) were generated using Google Gemini multimodal models
> under the personal creative direction of the developer. Each asset
> has been hand-reviewed for compliance with Google's Generative AI
> Prohibited Use Policy and integrated into the game."

----------------------------------------------------------------------
## 如果将来音频不再用 AI 生成
----------------------------------------------------------------------

如果未来你下载了 OpenGameArt / Freesound / 自制 等第三方音频,
**必须**更新本文件,按以下格式添加条目:

```
- <filename>
    Source:   <OpenGameArt URL | freesound URL | 自制>
    Author:   <原作者>
    License:  <CC0 1.0 | CC-BY 4.0 | Public Domain>
    Required: <CC-BY 必填的署名文字,如 "Music by Kevin MacLeod">
    Notes:    <trimmed / pitch-shifted / looped>
```

判定标准详见 `CREDITS.md` 旧版本(被本次更新覆盖前的合规检查清单)。

----------------------------------------------------------------------

Voidbound Contributors, 2026
