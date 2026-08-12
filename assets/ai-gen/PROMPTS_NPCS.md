# Voidbound NPC 图片生成要求(直接复制)

> 风格:高清 2D(非像素)| 底色:纯品红 #FF00FF | 站立单帧(NPC 不动,不做行走帧)
> 生成后存:`assets/ai-gen/import/npcs/<文件名>`
> 结构物:挑战祭坛用现有 ui/粒子 表现;传送阵(出城入口)生成地面贴图(§8)

## 站立通用要求(已内嵌每条提示词)

```
Top-down view 2D game character sprite, single character centered, facing down, full body visible.
```

---

## 1. 商人 Merchant

### 站立 → `merchant_stand.png`
```
Top-down view 2D game character sprite, single character centered, facing down, full body visible. Weathered middle-aged male traveling merchant, heavy brown traveling cloak with deep hood, leather coin pouch on his belt, holding a small brass scale in one hand, warm friendly smile, slightly hunched shopkeeper posture. high-resolution detailed game art, crisp sharp texture, rich saturated colors, smooth surfaces with soft shading and gentle gradients, clean anti-aliased edges, premium fantasy RPG art style. No pixel art, no pixelation, no chunky pixels, no low resolution, no retro 8-bit, no dithering. No text, no watermark. Solid pure magenta background (#FF00FF), nothing else in the background.
```

---

## 2. 重铸师 Smith

### 站立 → `smith_stand.png`
```
Top-down view 2D game character sprite, single character centered, facing down, full body visible. Burly male blacksmith with thick muscular arms, leather forge apron over his chest, soot-smudged face and forearms, holding a large heavy hammer resting over one shoulder, patient craftsman stance. high-resolution detailed game art, crisp sharp texture, rich saturated colors, smooth surfaces with soft shading and gentle gradients, clean anti-aliased edges, premium fantasy RPG art style. No pixel art, no pixelation, no chunky pixels, no low resolution, no retro 8-bit, no dithering. No text, no watermark. Solid pure magenta background (#FF00FF), nothing else in the background.
```

---

## 3. 仓库管理员 Warehouse Keeper

### 站立 → `warehouse_stand.png`
```
Top-down view 2D game character sprite, single character centered, facing down, full body visible. Elderly female ledger keeper, tidy grey clerk robes with ink-stained sleeves, spectacles on her nose, holding a leather-bound ledger book with one hand and a quill pen in the other, patient scholarly demeanor. high-resolution detailed game art, crisp sharp texture, rich saturated colors, smooth surfaces with soft shading and gentle gradients, clean anti-aliased edges, premium fantasy RPG art style. No pixel art, no pixelation, no chunky pixels, no low resolution, no retro 8-bit, no dithering. No text, no watermark. Solid pure magenta background (#FF00FF), nothing else in the background.
```

---

## 4. 神秘商人 Mystery Merchant

### 站立 → `mystery_stand.png`
```
Top-down view 2D game character sprite, single character centered, facing down, full body visible. Mysterious hooded figure completely shrouded in a dark violet cloak, face hidden in deep shadow with only faint glowing purple eyes visible, hands clasped hidden inside the sleeves, faint arcane energy wisps drifting around the cloak, enigmatic otherworldly aura. high-resolution detailed game art, crisp sharp texture, rich saturated colors, smooth surfaces with soft shading and gentle gradients, clean anti-aliased edges, premium fantasy RPG art style. No pixel art, no pixelation, no chunky pixels, no low resolution, no retro 8-bit, no dithering. No text, no watermark. Solid pure magenta background (#FF00FF), nothing else in the background.
```

---

## 5. 符文锻造师 Rune Forger

### 站立 → `forge_stand.png`
```
Top-down view 2D game character sprite, single character centered, facing down, full body visible. Elderly runesmith mage with a long white beard, deep blue ritual robes embroidered with softly glowing golden rune patterns, holding a chisel and a rune-carved stone tablet in front of his chest, focused craftsman expression. high-resolution detailed game art, crisp sharp texture, rich saturated colors, smooth surfaces with soft shading and gentle gradients, clean anti-aliased edges, premium fantasy RPG art style. No pixel art, no pixelation, no chunky pixels, no low resolution, no retro 8-bit, no dithering. No text, no watermark. Solid pure magenta background (#FF00FF), nothing else in the background.
```

---

## 6. 训练师 Trainer

### 站立 → `trainer_stand.png`
```
Top-down view 2D game character sprite, single character centered, facing down, full body visible. Veteran female warrior instructor in worn steel armor, training sword raised in a teaching guard stance, confident commanding posture, short practical hair, battle-worn shield strapped to her back. high-resolution detailed game art, crisp sharp texture, rich saturated colors, smooth surfaces with soft shading and gentle gradients, clean anti-aliased edges, premium fantasy RPG art style. No pixel art, no pixelation, no chunky pixels, no low resolution, no retro 8-bit, no dithering. No text, no watermark. Solid pure magenta background (#FF00FF), nothing else in the background.
```

---

## 7. 传送师 Teleporter

### 站立 → `teleporter_stand.png`
```
Top-down view 2D game character sprite, single character centered, facing down, full body visible. Young male portal mage in a sky-blue robe with star patterns, holding a glowing blue magic orb in one raised hand, swirling portal energy around the orb, calm focused expression. high-resolution detailed game art, crisp sharp texture, rich saturated colors, smooth surfaces with soft shading and gentle gradients, clean anti-aliased edges, premium fantasy RPG art style. No pixel art, no pixelation, no chunky pixels, no low resolution, no retro 8-bit, no dithering. No text, no watermark. Solid pure magenta background (#FF00FF), nothing else in the background.
```

---

---

## 8. 传送阵 Portal Array(地面贴图,非角色)

> 顶视角正俯视的地面魔法阵,画在角色脚下(出城入口 = 地下城入口 NPC 处)。
> 同一张贴图可复用给地牢 Boss 击杀后的出口传送门(A-W1 现用 spark_03+光环,统一换这张)。

### 地面 → `portal_array.png`
```
Top-down view 2D game object sprite of a magic teleportation array lying flat on the ground, single centered object, viewed directly from above. A circular arcane portal circle: concentric rings of carved glowing runes, blue-violet energy lines radiating outward, four directional rune symbols at the compass points, inner swirl of condensed portal energy, etched into dark stone floor. high-resolution detailed game art, crisp sharp texture, rich saturated colors, smooth surfaces with soft shading and gentle gradients, clean anti-aliased edges, premium fantasy RPG art style. No pixel art, no pixelation, no chunky pixels, no low resolution, no retro 8-bit, no dithering. No text, no watermark. Solid pure magenta background (#FF00FF), nothing else in the background.
```

---

## 生成清单(8 张)

| # | 文件 | 说明 |
|---|---|---|
| 1 | `merchant_stand.png` | 商人(3 镇通用,跨镇用 tint) |
| 2 | `smith_stand.png` | 重铸师 |
| 3 | `warehouse_stand.png` | 仓库管理员 |
| 4 | `mystery_stand.png` | 神秘商人 |
| 5 | `forge_stand.png` | 符文锻造师 |
| 6 | `trainer_stand.png` | 训练师 |
| 7 | `teleporter_stand.png` | 传送师 |
| 8 | `portal_array.png` | 传送阵地面贴图(出城入口,顺带统一地牢出口门) |

存图前自检:单帧、人物居中、品红背景纯净无杂物;存进 `assets/ai-gen/import/npcs/` 后叫我质检导入。
