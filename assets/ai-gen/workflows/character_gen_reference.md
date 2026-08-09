# ComfyUI 节点流参考(角色生成)

> 本文档描述与 `batch_generate.py` 等价的 ComfyUI 节点流。  
> ComfyUI 适合**复杂控制**(ControlNet / IP-Adapter / 分块生成),批量任务推荐用 SD WebUI API。

---

## 节点流总览

```
CheckpointLoaderSimple (SDXL)
    ↓ model
LoraLoader (PixelArtXL, weight=0.85)
    ↓ MODEL
CLIPTextEncode (positive)
    ↓ CONDITIONING
CLIPTextEncode (negative)
    ↓ CONDITIONING
EmptyLatentImage (512x512)
    ↓ LATENT
KSampler (steps=25, cfg=7.5, sampler=euler_ancestral)
    ↓ LATENT
VAEDecode
    ↓ IMAGE
ImageSave (output/comfyui/)
```

---

## 节点参数详解

### 1. CheckpointLoaderSimple
- **ckpt_name**: `sd_xl_base_1.0.safetensors`(或 fp16 版本)

### 2. LoraLoader
- **model**: 来自 CheckpointLoaderSimple
- **clip**: 来自 CheckpointLoaderSimple
- **lora_name**: `pixelartxl.safetensors`
- **strength_model**: 0.85
- **strength_clip**: 0.85

### 3. CLIPTextEncode (positive)
- **clip**: 来自 LoraLoader
- **text**:
```
pixel art, 32x32 sprite, top-down view, character sprite,
clean pixel art, low color count, no anti-aliasing,
fantasy RPG style, transparent background,
muscular male warrior, red color scheme, leather armor,
holding large battle axe, barbarian warrior, fantasy RPG,
standing idle pose, full body visible, looking at camera,
dark forest ambient lighting, green mossy atmosphere
```

### 4. CLIPTextEncode (negative)
- **clip**: 来自 LoraLoader
- **text**:
```
smooth gradient, photorealistic, 3d render, blurry,
deformed hands, extra limbs, watermark, signature,
high resolution, modern clothing, sci-fi
```

### 5. EmptyLatentImage
- **width**: 512
- **height**: 512
- **batch_size**: 4

### 6. KSampler
- **model**: 来自 LoraLoader
- **positive**: 来自 CLIPTextEncode (positive)
- **negative**: 来自 CLIPTextEncode (negative)
- **latent_image**: 来自 EmptyLatentImage
- **seed**: 随机(用 primitive 节点接 RandomNoise)
- **steps**: 25
- **cfg**: 7.5
- **sampler_name**: `euler_ancestral`
- **scheduler**: `normal`
- **denoise**: 1.0

### 7. VAEDecode
- **samples**: 来自 KSampler
- **vae**: 来自 CheckpointLoaderSimple(VAE 部分)

### 8. ImageSave
- **images**: 来自 VAEDecode
- **filename_prefix**: `voidbound/barbarian/standing_forest_`

---

## 进阶节点(可选)

### ControlNet(姿态控制)

如需严格控制角色动作,加:
```
ControlNetLoader (control_v11p_sd15_openpose)
    ↓ CONTROL_NET
OpenPosePreprocessor
    ↓ IMAGE
ControlNetApply
    ↓ CONDITIONING (注入到 KSampler positive)
```

### IP-Adapter(参考图)

保持风格一致:
```
IPAdapterUnifiedLoader (ip-adapter-plus)
    ↓
IPAdapterEncoder (输入参考图)
    ↓
IPAdapterApply (注入到 KSampler)
```

### UltimateSDUpscale(高清放大)

生成后放大到 1024x1024 再采样:
```
ImageUpscaleWithModel (RealESRGAN)
    ↓
KSampler (第二次采样, denoise=0.4)
```

---

## 4 主题调色板注入

ComfyUI 不能像 SD WebUI 那样方便注入"调色板约束"。需要:
1. **prompt 中显式列色 HEX**:`dark forest green palette (#1a3a1a, #2d5a2d, #5fa55f)`
2. **后处理用 post_process.py** 强制 quantize 到调色板

---

## 导出 workflow.json

在 ComfyUI UI 中:
1. 设置好所有节点 + 参数
2. 点击 "Save" → 导出 JSON
3. 命名为 `character_gen_sdxl_pixelart.json`
4. 可被 ComfyUI 直接 Load

---

## 推荐采样参数表

| 风格 | Steps | CFG | Sampler | Notes |
|------|-------|-----|---------|-------|
| 32×32 sprite | 20-25 | 7-8 | Euler a | 标准 |
| 64×64 detail | 30-40 | 8-9 | DPM++ 2M | 细节更丰富 |
| Q 版大头 | 15-20 | 6-7 | Euler a | 简笔更稳 |
| Boss 大体型 | 35-50 | 9-10 | DPM++ 2M Karras | 复杂 |

---

## 故障排查

| 问题 | 原因 | 解决 |
|------|------|------|
| 输出不像像素风 | LoRA 未加载或权重过低 | 检查 LoRA 节点 + weight ≥ 0.7 |
| 颜色溢出主题 | AI 不严格遵守 prompt | 用 post_process.py quantize |
| 多手指 / 变形 | 提示词冲突 | 加 `anatomically correct, single character` |
| 全身被裁切 | 分辨率不够 | 升到 768x768 或用 aspect_ratio |
| 透明背景失败 | 默认白底 | 加 `transparent background` + 用 alpha channel 输出 |

---

## 参考

- ComfyUI 官方文档:https://docs.comfy.org/
- SDXL 提示词指南:https://docs.comfy.org/tutorials/basic/prompts/
- PixelArtXL LoRA:https://civitai.com/models/120096/pixel-art-xl