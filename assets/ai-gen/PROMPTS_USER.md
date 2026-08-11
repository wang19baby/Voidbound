# Voidbound 美术生成提示词包(用户手动生成版)

> 用法:你在 AI Studio / 你的图像工具里粘贴对应提示词 → 生成 png → 保存到 `assets/ai-gen/import/<分组>/` 指定文件名 → 告诉我"图好了",我跑 `import_art.py` 批量转换进游戏。

---

## 0. 全局规格(每条提示词已内置,了解即可)

| 项 | 要求 |
|---|---|
| 画布 | 1024×1024,正方形 |
| 背景 | **纯品红 #FF00FF**(我用来抠透明底,角色身上绝不能出现品红) |
| 每帧 | 64×64 像素,主体居中占满帧 |
| 行走 sheet | 4 帧横向一行、等距、每帧等宽、间无空隙(我按 1/4 宽裁切) |
| 风格 | pixel art / top-down view / bold dark outlines / limited color palette / no anti-aliasing / no text / no watermark across all prompts |

> ⚠️ **强制像素块**(任何提示词都追加这段,否则模型会出"假像素"软图):
> `HARD pixel edges, chunky blocky pixels, 16-bit retro sprite style, indexed color palette, dithered shading only, no anti-aliasing, no gradients, no soft edges, no smooth color transitions, no 3d lighting`
> 就算输出仍偏软,导入管线 `--quantize` 会按主题 16 色调色板强制量化兜底。
| 朝向 | 面向屏幕下方(facing down) |

**瓦片**与角色不同:瓦片要求 **edge-to-edge seamless(tileable)图案、铺满整张画布、四边连续可无缝拼接**,单张 64×64 内容(提示词写明 tileable)。我按整图缩放到 64×64。

---

## 1. 最高优先级:虚空主题(现在墙是透明的、地板是沙色)

### 1.1 虚空地板 (保存: `import/world/floor_void.png`)
```
Seamless tileable floor texture, pixel art, top-down RPG dungeon floor,
dark void realm floor made of cracked obsidian with faint purple energy veins,
deep purple and near-black colors, subtle glowing magenta-purple cracks,
edge-to-edge repeating pattern filling the entire canvas, four edges connect seamlessly,
bold dark outlines, limited palette, no anti-aliasing, no text, no watermark, no objects
```

### 1.2 虚空墙 (保存: `import/world/wall_void.png`)
```
Seamless tileable wall texture, pixel art, top-down RPG dungeon wall,
solid dark purple obsidian block wall with glowing violet rune lines and black cracks,
deep purple and black colors, edge-to-edge pattern filling the entire canvas,
four edges connect seamlessly, bold dark outlines, limited palette,
no anti-aliasing, no text, no watermark, no objects
```

### 1.3 虚空怪物 ×2 张(4 帧行走 sheet,保存: `import/monsters/void_crawler.png` / `import/monsters/wraith.png`)

void_crawler:
```
Pixel art top-down RPG monster sprite sheet, 4-frame walk animation in one row,
each frame 64x64 px, frames equal width and evenly spaced with no gaps,
character facing down. Monster: a dark violet crawling abomination with four
tentacle limbs, glowing purple eyes, wisps of void corruption energy,
dark purple and black palette with magenta glow accents, bold dark outlines,
limited palette, no anti-aliasing, no text, no watermark,
solid pure magenta background (#FF00FF), nothing else in the background
```

wraith:
```
Pixel art top-down RPG monster sprite sheet, 4-frame walk animation in one row,
each frame 64x64 px, frames equal width and evenly spaced with no gaps,
character facing down. Monster: a ghostly spectral wraith, translucent pale
purple hooded figure with wispy tattered tail, glowing hollow eyes,
dark purple and violet palette, bold dark outlines, limited palette,
no anti-aliasing, no text, no watermark,
solid pure magenta background (#FF00FF), nothing else in the background
```

---

## 2. 角色 style anchor:法师(保存: `import/characters/sorceress_stand.png`)

先出一张确认风格,满意后我再让你批量出其余 5 职业。

```
Pixel art top-down RPG character sprite, single character centered,
each frame 64x64 px, character facing down, full body visible.
Character: a female mage in blue and purple robes, pointed wizard hat,
holding a glowing magic staff, arcane energy swirling around the staff head,
blue purple magic color scheme (#3a7bd5 / #5a3a8b), bold dark outlines,
limited color palette.
HARD pixel edges, chunky blocky pixels, 16-bit retro sprite style,
indexed color palette, dithered shading only,
no anti-aliasing, no gradients, no soft edges, no smooth color transitions, no 3d lighting,
no text, no watermark, solid pure magenta background (#FF00FF), nothing else in the background
```

(6 职业行走 4 帧 sheet 的提示词模板见 §5)

---

## 3. 怪物全量(4 主题 × 各 5-6 只,4 帧行走 sheet 模板)

> 模板:把 `{怪物描述}` 换掉即可。**同一主题 6 张都生成后**,告诉我处理。

```
Pixel art top-down RPG monster sprite sheet, 4-frame walk animation in one row,
each frame 64x64 px, frames equal width and evenly spaced with no gaps,
character facing down. Monster: {怪物描述 English}, {主题氛围},
bold dark outlines, limited palette, no anti-aliasing, no text, no watermark,
solid pure magenta background (#FF00FF), nothing else in the background
```

| 保存名 | 主题氛围 | 怪物描述 (English) |
|---|---|---|
| `forest/bat.png` | dark forest, moss and shadow | small leathery bat with red eyes, wings spread |
| `forest/slime.png` | dark forest, moss and shadow | green toxic slime blob with a menacing face |
| `forest/worm.png` | dark forest, moss and shadow | burrowing earth worm with razor teeth, mud-caked body |
| `forest/ghost.png` | dark forest, moss and shadow | pale forest ghost, translucent, drifting |
| `forest/spore.png` | dark forest, moss and shadow | purple spore puffball with tiny fungal legs |
| `forest/pumpking.png` | BOSS: dark forest harvest fiend | giant grinning pumpkin king, hollow eyes, vine arms |
| `desert/bee.png` | burning desert, sandstorm | giant desert wasp with striped abdomen |
| `desert/eyeball.png` | burning desert, sandstorm | floating sand-colored eyeball with tendrils |
| `desert/queen_bee.png` | burning desert, sandstorm | huge golden queen hornet with glowing stinger |
| `desert/direwolf.png` | burning desert, sandstorm | red-furred savage dire wolf, fangs bared |
| `desert/scorpion.png` | burning desert, sandstorm | giant armored scorpion with raised stinger |
| `desert/war_pharaoh.png` | BOSS: cursed desert ruler | mummified war pharaoh in golden armor, scarab aura |
| `ruin/ice_wisp.png` | frozen ruins, cold blue | small ice wisp, crystallized, glowing cold blue |
| `ruin/wraith.png` | frozen ruins, cold blue | frost-bound wraith, ice crystals on tattered robes |
| `ruin/bloat_eye.png` | frozen ruins, cold blue | bloated blue eye monster with icy pustules |
| `ruin/frost_worm.png` | frozen ruins, cold blue | ice-armored worm, frosted spikes |
| `ruin/giant_worm.png` | frozen ruins, cold blue | massive frost giant worm, ice plates |
| `ruin/frost_lich.png` | BOSS: frozen lich necromancer | skeletal frost lich in ice crown, frozen scepter |
| `void/void_crawler.png` | §1.3 已给 | — |
| `void/wraith.png` | §1.3 已给 | — |
| `void/bloat_eye.png` | void realm, purple abyss | void-bloated eye monster, purple veins, cosmic pupils |
| `void/direwolf.png` | void realm, purple abyss | shadowy void wolf, star-glowing fur, purple flame eyes |
| `void/queen_bee.png` | void realm, purple abyss | void queen insect, translucent violet wings |
| `void/eyeball.png` | void realm, purple abyss | floating void eye with tendril legs, purple iris |
| `void/void_overlord.png` | BOSS: void realm ruler | towering void overlord, dark purple armor, cosmic cracks, crown of starlight |

---

## 4. 地图瓦片全套(每主题 floor + wall,共 8 张,tileable 模板)

> 模板改 `{材质描述}`;floor 铺地、wall 砌墙。**8 张齐了告诉我**,替换时会连旧瓦片一起换(游戏按 64px 世界格画新瓦片)。

```
Seamless tileable {floor|wall} texture, pixel art, top-down RPG dungeon,
{材质描述}, edge-to-edge repeating pattern filling the entire canvas,
four edges connect seamlessly, bold dark outlines, limited palette,
no anti-aliasing, no text, no watermark, no objects
```

| 保存名 | 材质描述 |
|---|---|
| `world/floor_forest.png` | dark mossy forest ground, grass tufts and dirt, dark green and brown |
| `world/wall_forest.png` | dense dark forest hedge wall, tangled roots and thorns, deep green |
| `world/floor_desert.png` | sun-baked cracked desert sand, warm orange and tan |
| `world/wall_desert.png` | sandstone block wall, weathered, sandy orange and brown |
| `world/floor_ruin.png` | ancient ruined stone floor, cracked grey slabs with frost, cold blue-grey |
| `world/wall_ruin.png` | frozen ruin stone wall, ice-crusted bricks, cold grey and white-blue |
| `world/floor_void.png` | §1.1 已给 | — |
| `world/wall_void.png` | §1.2 已给 | — |

---

## 5. 角色行走 4 帧 sheet 模板(风格确认后批量)

```
Pixel art top-down RPG character sprite sheet, 4-frame walk animation in one row,
each frame 64x64 px, frames equal width and evenly spaced with no gaps,
character facing down, mid-stride. Character: {职业描述 English},
bold dark outlines, limited palette, no anti-aliasing, no text, no watermark,
solid pure magenta background (#FF00FF), nothing else in the background
```

| 保存名 | 职业描述 |
|---|---|
| `characters/barbarian_walk.png` | muscular barbarian warrior, red leather armor, wild hair, holding large battle axe |
| `characters/paladin_walk.png` | holy paladin knight, golden armor and white cape, war hammer and shield |
| `characters/sorceress_walk.png` | female sorceress, blue purple robes, pointed wizard hat, glowing magic staff |
| `characters/necromancer_walk.png` | dark necromancer, tattered purple robes, skull shoulder pad, bone staff |
| `characters/ranger_walk.png` | female ranger archer, green leather hooded cloak, elven bow |
| `characters/assassin_walk.png` | shadowy assassin, black leather armor, red face mask, dual daggers |

---

## 6. 交付命名与目录(重要)

```
assets/ai-gen/import/
├── characters/   sorceress_stand.png, barbarian_walk.png, ...
├── monsters/     forest/bat.png, void/void_crawler.png, desert/war_pharaoh.png (Boss 同目录)
└── world/        floor_forest.png, wall_void.png, ...
```

生成完放好 → 跟我说 → 我跑 `python assets/ai-gen/scripts/import_art.py --all`:
品红抠图 → (sheet 按 1/4 宽裁 4 帧 / 瓦片整图)→ 64×64 透明 PNG → `assets/atlas/input/{characters,monsters,world}/` → `pack_atlas.py` 重建 → 游戏渲染升级。

**建议顺序**:虚空瓦片 ×2 → 虚空怪 ×2 → 法师 anchor → 确认风格 → 批量。