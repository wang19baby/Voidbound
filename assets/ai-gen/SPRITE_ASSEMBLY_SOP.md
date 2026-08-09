# 6 职业 Sprite 拼装 SOP

> 版本：v1.1 配套  
> 日期：2026-08-08  
> 用途：把 Kenney Tiny Battle 资源快速拼成 6 职业 sprite(M1 阶段用)

---

## 0. 工具准备

```
必需:
  - Aseprite ($20 Steam,30 天试用免费)
  - Kenney Tiny Battle 资源包(CC0,免费)
  - 4 主题调色板文件 (assets/ai-gen/prompts/palettes.yaml)

可选:
  - LibreSprite (FOSS 替代)
  - GIMP (FOSS,用于批量处理)
```

---

## 1. 资源结构(Kenney Tiny Battle)

解压 Tiny Battle 后:

```
kenney_tiny-battle/
├── Characters/             # 4 套角色 (蓝/绿/红/黄)
│   ├── character_blue.png  (16×16)
│   ├── character_green.png
│   ├── character_red.png
│   └── character_yellow.png
├── Weapons/                # 武器 (剑/斧/弓/法杖/盾)
│   ├── axe.png
│   ├── sword.png
│   ├── bow.png
│   ├── staff.png
│   └── shield.png
├── Tiles/                  # 16×16 tile
└── ...
```

**关键限制**:Kenney Tiny Battle 只有 4 个基础角色色,**不够 6 职业**。需要染色。

---

## 2. 6 职业分配方案

| 职业 | 起始资源 | 染色 | 加武器 | 加配饰 |
|------|---------|------|--------|--------|
| 野蛮人 | 红色角色 | 强化红色 + 加棕色描边 | 双斧或大剑 | 红色头巾(2×2 像素) |
| 圣骑士 | 黄色角色 | 维持金色 | 锤 + 盾 | 头盔(替换头顶 4 像素) |
| 法师 | 蓝色角色 | 加紫色调 | 法杖 | 蓝色尖帽(8×4 像素) |
| 死灵法师 | 紫色角色(没有,用蓝色染) | 深紫 + 黑色描边 | 骷髅杖(法杖 + 骷髅头替换) | 骷髅肩饰(2 像素) |
| 游侠 | 绿色角色 | 强化绿色 | 弓 + 箭袋 | 绿色兜帽(覆盖头顶) |
| 刺客 | 黄色角色(用黑色染色) | 黑色 + 红色描边 | 双匕首(匕首 ×2) | 红色面罩(2 像素) |

**配色 HEX** (来自 ASSETS.md §14):

```
野蛮人: #8b3a1a + #5a2410
圣骑士: #d4af37 + #f5f5f5
法师:   #3a7bd5 + #5a3a8b
死灵:   #5a1a7a + #2d0a3d
游侠:   #3a8b3a + #8b5a3a
刺客:   #1a1a1a + #8b1a1a
```

---

## 3. 拼装 SOP(M1 用时 ~3 小时 / 6 职业)

### Step 1:建立 6 职业画布

```
Aseprite:
  File > New > 16x16 (单帧) 或 16x16 + 4 帧 (走动画)
  Color Mode: Indexed
  Transparency: 启用
```

### Step 2:导入基础角色

```
Layer 1: Base Character
  File > Import > 选择 Kenney Tiny Battle 角色
  缩放到 16x16 (NEAREST)
  居中放置
  锁定 layer
```

### Step 3:染色

```
1. Sprite > Color Mode > Indexed (锁定调色板)
2. Select > By Color > 点击要替换的颜色像素
3. Edit > Replace Color > 输入新职业主色 HEX
4. 重复,逐色替换(每个角色约 5-8 个颜色)
5. 保存为独立 .aseprite 文件
```

**批量染色技巧**:
- 法师:蓝 → 紫蓝(色相 -10°)
- 死灵:蓝 → 紫黑(色相 +60°,亮度 -30%)
- 刺客:黄 → 黑色(替换全部颜色为黑 + 红色描边)

### Step 4:加武器

```
Layer 2: Weapon
  - 导入 Kenney 武器 sprite (16×16 或 8×16)
  - 缩小到 8×8 或 6×10(根据角色尺寸)
  - 放置在角色右手侧(2-3 像素偏移)
  - 调整不透明度 / 颜色匹配
```

**武器对应表**:

| 职业 | 武器来源 | 调整 |
|------|---------|------|
| 野蛮人 | axe.png | 放大到 10×10,放在右侧 |
| 圣骑士 | hammer.png + shield.png | 锤放大,盾在左手 |
| 法师 | staff.png | 法杖,头部加大魔法球 |
| 死灵法师 | staff.png + 骷髅头 | 替换杖顶 |
| 游侠 | bow.png | 弓在左侧,小箭头 |
| 刺客 | dagger.png × 2 | 双匕首,左右各一 |

### Step 5:加配饰

```
Layer 3: Accessory
  头部 4×4 像素的覆盖物
  - 野蛮人:2×2 红色头巾
  - 圣骑士:4×4 头盔(覆盖头发像素)
  - 法师:4×4 蓝色尖帽(三角形)
  - 死灵:2×2 骷髅肩饰
  - 游侠:4×4 绿色兜帽
  - 刺客:2×2 红色面罩(在脸部中央)
```

### Step 6:导出 sprite sheet

```
File > Export As > Sprite Sheet
格式: PNG
排列: Horizontal strip(每行一个状态)
帧数: 2 (站立) 或 4 (走)

输出文件:
  barbarian_stand.png     16x16
  barbarian_walk.png      64x16 (4 帧 × 16)
  ...
```

### Step 7:放入项目

```
复制到:
  voidbound/assets/atlas/input/characters/

预期结构:
  input/characters/
  ├── barbarian_stand.png
  ├── barbarian_walk.png
  ├── paladin_stand.png
  ├── paladin_walk.png
  ├── sorceress_stand.png
  ├── sorceress_walk.png
  ├── necromancer_stand.png
  ├── necromancer_walk.png
  ├── ranger_stand.png
  ├── ranger_walk.png
  ├── assassin_stand.png
  └── assassin_walk.png

总计: 12 个 PNG 文件 (6 职业 × 2 状态)
```

---

## 4. 4 方向扩展(M2 才需要)

M1 用单方向(南)即可。M2 需扩展到 4 方向:

```
文件命名:
  barbarian_stand_south.png
  barbarian_stand_west.png
  barbarian_stand_east.png
  barbarian_stand_north.png

Kenney Tiny Battle 已包含 4 方向,直接复制即可。
需要做的:把每个方向单独染色 + 加武器 + 加配饰
```

---

## 5. 验证 checklist

每张 sprite 完成后,过一遍:

- [ ] **16×16 尺寸**:像素对齐,无锯齿
- [ ] **透明背景**:PNG alpha 通道启用
- [ ] **角色居中**:中心点在 8×8 ± 1 像素
- [ ] **武器位置**:不挡脸,握姿自然
- [ ] **颜色一致**:在调色板 16 色内
- [ ] **无杂色**:没有溢出 / 颜色交叉
- [ ] **轮廓清晰**:像素边界干净

---

## 6. 自动化(可选)

如果觉得手动染色繁琐,可以用脚本批量:

### Python 脚本(用 PIL)

```python
# scripts/batch_recolor.py
from PIL import Image
from pathlib import Path

# Kenney 蓝色角色 → 法师紫色
src = Image.open("input/character_blue.png").convert("RGBA")
pixels = src.load()

# 蓝色 (0x3a7bd5) → 紫色 (0x5a3a8b)
# 遍历替换
for y in range(src.height):
    for x in range(src.width):
        r, g, b, a = pixels[x, y]
        # 蓝色判定:R<150 and G>100 and B>150
        if r < 150 and 100 < g < 200 and b > 150:
            pixels[x, y] = (0x5a, 0x3a, 0x8b, a)

src.save("output/sorceress_base.png")
```

详见: [scripts/batch_recolor.py](scripts/batch_recolor.py)(待写)

---

## 7. 后期替换路径

当 AI 生成 / 商业资源到位后,如何平滑切换:

```
1. 保持输出文件名一致 (barbarian_stand.png 等)
2. 直接覆盖 PNG 文件
3. Rust 端无需改代码(加载逻辑不变)
4. atlas 图集重新生成(用 scripts/pack_atlas.py)
```

这是 **数据驱动** 的好处——sprite 是数据,代码与美术解耦。

---

## 8. M1 时间预算

| 步骤 | 预估时间 | 备注 |
|------|---------|------|
| 工具准备 | 10 min | 下载 Aseprite + Kenney |
| 法师 + 野蛮人(2 个示范) | 60 min | 摸清流程 |
| 剩余 4 职业 | 90 min | 套用流程,每个 ~20 min |
| 验证 + 修正 | 30 min | checklist |
| 导出 sprite sheet | 10 min | |
| **总计** | **3.5 小时** | |

---

## 9. 参考

- 完整素材清单:[docs/ASSETS.md](../../docs/ASSETS.md)
- 4 主题调色板:[docs/ASSETS.md §16.2](../../docs/ASSETS.md)
- 6 职业染色表:[docs/ASSETS.md §14.1](../../docs/ASSETS.md)
- Kenney Tiny Battle:https://kenney.nl/assets/tiny-battle