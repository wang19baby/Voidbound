# Voidbound AI 素材生成模块

> 用途：使用 **Google Gemini** 图像模型批量生成角色 / 怪物 / 瓦片 sprite  
> 配套文档：[`../../docs/ASSETS.md` §17](../../docs/ASSETS.md)

> ⚠️ **许可证:[CC-BY-NC-ND 4.0](../../LICENSE-ASSETS)**  
> 本目录下的**提示词 YAML、PROMPTS_*.md、生成的素材**均禁止转售、禁止衍生。  
> 禁止把提示词当 "AI 提示词包" 卖钱;禁止把生成的 sprite 上传到 Unity Asset Store / Unreal Marketplace / itch.io 付费区。  
> 个人/教育/同人/直播/评测免费可用,**必须**署名 "Voidbound Contributors"。  
> 商用需联系作者另行签约。

---

## 快速开始(15 分钟)

### 前置条件

1. **Stable Diffusion WebUI**(任选一个)
   - **A1111**: https://github.com/AUTAPI1/stable-diffusion-webui
   - **Forge**: https://github.com/lllyasviel/stable-diffusion-webui-forge
   - **ComfyUI**(进阶): https://github.com/comfyanonymous/ComfyUI

2. **SDXL base 模型**(必须)
   - 下载 `sd_xl_base_1.0.safetensors`(或 fp16 版本)
   - 放到 `<webui>/models/Stable-diffusion/`

3. **PixelArt LoRA**(推荐)
   - 搜索 CivitAI:`PixelArtXL`
   - 放到 `<webui>/models/Lora/`

4. **Python 依赖**(只需 requests + pyyaml)
   ```bash
   pip install requests pyyaml pillow
   ```

### 启动

```bash
# Terminal 1: 启动 SD WebUI
cd /path/to/stable-diffusion-webui
./webui.sh --api   # Linux/macOS
webui.bat --api    # Windows
# API 默认监听 http://localhost:7860

# Terminal 2: 批量生成
cd voidbound/assets/ai-gen
python scripts/batch_generate.py barbarian      # 单个职业
python scripts/batch_generate.py --all         # 全部 6 职业
python scripts/batch_generate.py --monsters forest   # 森林怪物
```

---

## 目录结构

```
ai-gen/
├── README.md                         ← 你在这里
├── prompts/
│   ├── characters.yaml               ← 6 职业提示词
│   ├── monsters.yaml                 ← 30+ 怪物提示词
│   ├── palettes.yaml                 ← 4 主题调色板(给 AI 提示用)
│   └── negative.yaml                 ← 通用反向提示词
├── workflows/
│   └── character_gen_reference.md    ← ComfyUI 节点流说明
├── scripts/
│   ├── batch_generate.py             ← 主脚本(SD WebUI API)
│   └── post_process.py               ← 后处理(缩放 + 量化调色板)
└── output/                           ← 生成结果(自动创建)
    ├── barbarian/
    ├── sorceress/
    └── ...
```

---

## 工作流

### 1. 生成

```
YAML 提示词
    ↓
batch_generate.py
    ↓
SD WebUI API (txt2img)
    ↓
PNG 512x512(原始输出)
```

### 2. 后处理

```
原始 512x512 PNG
    ↓
post_process.py
    ↓
1. 缩放到 32x32
2. PIL.Image.quantize() 量化到 16 色主题调色板
3. 可选:边缘检测 + 手绘修正
    ↓
最终 32x32 sprite(图集用)
```

### 3. 集成

```
最终 sprite
    ↓
放入 voidbound/assets/atlas/
    ↓
Rust game/sprite 模块加载
    ↓
游戏渲染
```

---

## 配置

### 修改默认 API 地址

`scripts/batch_generate.py` 顶部:
```python
API_URL = "http://localhost:7860"  # 默认
```

### 修改采样参数

`scripts/batch_generate.py` 顶部:
```python
DEFAULT_PARAMS = {
    "steps": 25,
    "cfg_scale": 7.5,
    "sampler_name": "Euler a",
    "width": 512,
    "height": 512,
}
```

---

## 4 主题调色板

详见 `prompts/palettes.yaml`。每个主题 16 色 HEX 值。

AI 生成时通过 prompt 提示主题色,后处理再用 PIL 强制量化到该调色板。

---

## 质量控制 checklist

生成每张图后,人工 review:

- [ ] **风格一致**:与已有的 sprite 是否风格统一?
- [ ] **轮廓清晰**:像素边界是否干净?
- [ ] **颜色正确**:是否落在主题调色板范围内?
- [ ] **方向正确**:俯视角,4 方向之一
- [ ] **体型合理**:32x32 内主体不能太小/太大
- [ ] **无 AI 伪影**:多手指 / 模糊 / 渐变杂色

**只有通过 checklist 的图才能进入 sprite sheet**。

---

## 常见问题

### Q1: AI 生成的图不像像素风?

**原因**:采样步数过多 / 分辨率太高  
**解决**:`--steps 15-20`、`--width 256 --height 256`,加载 PixelArt LoRA 后 LoRA weight 设 0.8-0.9

### Q2: 颜色溢出主题调色板?

**解决**:跑 `post_process.py`,强制 quantize 到调色板 16 色

### Q3: 角色朝向错乱?

**解决**:prompt 加 `top-down view, character facing south` 等明确词

### Q4: 单张耗时太长?

**优化**:
- 用 SDXL Turbo / LCM LoRA(4 步即可)
- 启用 batched generation(`--batch-size 4`)
- 用 fp16 模型

---

## 进阶:ComfyUI 节点流

`workflows/character_gen_reference.md` 描述了 ComfyUI 等价节点流。  
ComfyUI 更适合复杂控制(IP-Adapter / ControlNet / 分块生成),  
但 SD WebUI API 更适合纯批量任务。

---

## 许可证

AI 生成素材**必须**手工 review + 调整后才能进游戏。  
商用前确认使用的 SD 模型 / LoRA 许可证(详见 `docs/ASSETS.md` §17.4)。

---

## 参考

- 完整素材清单:[`docs/ASSETS.md`](../../docs/ASSETS.md)
- 染色方案:[`docs/ASSETS.md` §14](../../docs/ASSETS.md)
- 4 主题调色板:[`docs/ASSETS.md` §16.2](../../docs/ASSETS.md)