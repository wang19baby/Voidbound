# Voidbound 美术生成提示词包 — 高清版(HD,非像素)

> 用法:你在 AI Studio / 你的图像工具里粘贴对应提示词 → 生成 png → 保存到 `assets/ai-gen/import/<分组>/` 指定文件名 → 告诉我"图好了",我跑 `import_art.py` 批量转换进游戏。
> ⚠️ **风格决策(2026-08-10):全部角色/怪物/瓦片 = 高清(HD)非像素风。不要像素!**

---

## 0. 全局规格

| 项 | 要求 |
|---|---|
| 画布 | 1024×1024,正方形 |
| 背景 | **纯品红 #FF00FF**(我抠透明底,主体绝不能带品红) |
| 站立单帧 | 主体 512×512 居中占画布(四周留品红边,我好裁) |
| 行走 sheet | 4 帧横向一行,每帧 **256×256**,等宽无空隙,共 1024×256;角色每帧居中、面朝下 |
| 风格 | 高清 2D 游戏美术:细节清晰、色彩饱和、柔和光影渐变、平滑抗锯齿边缘、高级奇幻 RPG 质感 |

## 强制高清块(所有提示词都追加)

```
high-resolution detailed game art, crisp sharp texture, rich saturated colors,
smooth surfaces with soft shading and gentle gradients, clean anti-aliased edges,
premium fantasy RPG art style. No pixel art, no pixelation, no chunky pixels,
no low resolution, no retro 8-bit, no dithering.
No text, no watermark. Solid pure magenta background (#FF00FF),
nothing else in the background, subject fully visible and centered.
```

> 模型偶尔还会带点像素味:导入时用 BOX 双线性降采样烘焙,边缘平滑自然。**不要用 --quantize**(那是像素流程保留的,HD 流程默认禁用)。

---

## 1. 全部 6 职业提示词(站立 + 行走 4 帧 sheet)

> 模板结构:`[职业描述]. [站立|4帧行走sheet]. 强制高清块`。文件名照抄。

### 1.1 野蛮人 Barbarian
**站立** → `import/characters/barbarian_stand.png`
```
Top-down view 2D game character sprite, single character centered, facing down,
full body visible. Character: muscular male barbarian warrior, wild unkempt hair,
dark red leather armor with fur trim, gripping a large battle axe,
strong build, battle-scarred. {高清块}
```
**行走** → `import/characters/barbarian_walk.png`
```
Top-down view 2D game character sprite sheet, 4-frame walk animation in one row,
each frame exactly 256x256 px, frames evenly spaced with no gaps,
character centered in every frame, facing down, subtle walk pose variation.
Character: muscular male barbarian warrior, wild unkempt hair,
dark red leather armor with fur trim, gripping a large battle axe,
strong build, battle-scarred. {高清块}
```

### 1.2 圣骑士 Paladin
**站立** → `import/characters/paladin_stand.png`
```
Top-down view 2D game character sprite, single character centered, facing down,
full body visible. Character: holy paladin knight in radiant golden armor,
white flowing cape, holding a war hammer and large shield,
golden winged helmet with plume, divine light aura. {高清块}
```
**行走** → `import/characters/paladin_walk.png`
```
Top-down view 2D game character sprite sheet, 4-frame walk animation in one row,
each frame exactly 256x256 px, frames evenly spaced with no gaps,
character centered in every frame, facing down, subtle walk pose variation.
Character: holy paladin knight in radiant golden armor,
white flowing cape, holding a war hammer and large shield,
golden winged helmet with plume, divine light aura. {高清块}
```

### 1.3 法师 Sorceress
**站立** → `import/characters/sorceress_stand.png`
```
Top-down view 2D game character sprite, single character centered, facing down,
full body visible. Character: elegant female sorceress in blue and purple robes,
pointed wizard hat, holding a glowing magic staff with arcane energy swirling
around the crystal head, mystical atmosphere. {高清块}
```
**行走** → `import/characters/sorceress_walk.png`
```
Top-down view 2D game character sprite sheet, 4-frame walk animation in one row,
each frame exactly 256x256 px, frames evenly spaced with no gaps,
character centered in every frame, facing down, subtle walk pose variation.
Character: elegant female sorceress in blue and purple robes,
pointed wizard hat, holding a glowing magic staff with arcane energy swirling
around the crystal head, mystical atmosphere. {高清块}
```

### 1.4 死灵法师 Necromancer
**站立** → `import/characters/necromancer_stand.png`
```
Top-down view 2D game character sprite, single character centered, facing down,
full body visible. Character: sinister necromancer in tattered dark purple robes,
skull shoulder pad, hooded, holding a bone staff topped with a glowing skull,
faint green ghost energy wisps. {高清块}
```
**行走** → `import/characters/necromancer_walk.png`
```
Top-down view 2D game character sprite sheet, 4-frame walk animation in one row,
each frame exactly 256x256 px, frames evenly spaced with no gaps,
character centered in every frame, facing down, subtle walk pose variation.
Character: sinister necromancer in tattered dark purple robes,
skull shoulder pad, hooded, holding a bone staff topped with a glowing skull,
faint green ghost energy wisps. {高清块}
```

### 1.5 游侠 Ranger
**站立** → `import/characters/ranger_stand.png`
```
Top-down view 2D game character sprite, single character centered, facing down,
full body visible. Character: agile female ranger archer in green leather armor,
hooded forest cloak, holding an elven longbow with a quiver of arrows on her back,
sharp-eyed scout. {高清块}
```
**行走** → `import/characters/ranger_walk.png`
```
Top-down view 2D game character sprite sheet, 4-frame walk animation in one row,
each frame exactly 256x256 px, frames evenly spaced with no gaps,
character centered in every frame, facing down, subtle walk pose variation.
Character: agile female ranger archer in green leather armor,
hooded forest cloak, holding an elven longbow with a quiver of arrows on her back,
sharp-eyed scout. {高清块}
```

### 1.6 刺客 Assassin
**站立** → `import/characters/assassin_stand.png`
```
Top-down view 2D game character sprite, single character centered, facing down,
full body visible. Character: shadowy assassin in black leather armor,
red face mask, hooded, crouched low ready stance, dual wielding daggers,
silent killer. {高清块}
```
**行走** → `import/characters/assassin_walk.png`
```
Top-down view 2D game character sprite sheet, 4-frame walk animation in one row,
each frame exactly 256x256 px, frames evenly spaced with no gaps,
character centered in every frame, facing down, subtle walk pose variation.
Character: shadowy assassin in black leather armor,
red face mask, hooded, crouched low ready stance, dual wielding daggers,
silent killer. {高清块}
```

---

## 2. 怪物(HD,同规格)— 下一步批量

> 模板: `Top-down view 2D game monster sprite, 单只居中, {怪物描述 English}, {主题氛围}, 行走用 4 帧 sheet 同 1.x 结构。{高清块}`
> 保存: `import/monsters/<theme>/<类型id>.png`(类型 id 见下方)

| 保存名 | 主题氛围 + 怪物描述 |
|---|---|
| `forest/bat.png` | dark forest atmosphere. small leathery bat with red eyes, wings spread |
| `forest/slime.png` | dark forest atmosphere. toxic green slime blob with a menacing face |
| `forest/worm.png` | dark forest atmosphere. burrowing earth worm with razor teeth, mud-caked body |
| `forest/ghost.png` | dark forest atmosphere. pale forest ghost, translucent, drifting |
| `forest/spore.png` | dark forest atmosphere. purple spore puffball with tiny fungal legs |
| `forest/pumpking.png` | BOSS. giant grinning pumpkin king, hollow eyes, vine arms |
| `desert/bee.png` | burning desert, sandstorm. giant desert wasp with striped abdomen |
| `desert/eyeball.png` | burning desert, sandstorm. floating sand-colored eyeball with tendrils |
| `desert/queen_bee.png` | burning desert, sandstorm. huge golden queen hornet with glowing stinger |
| `desert/direwolf.png` | burning desert, sandstorm. red-furred savage dire wolf, fangs bared |
| `desert/scorpion.png` | burning desert, sandstorm. giant armored scorpion with raised stinger |
| `desert/war_pharaoh.png` | BOSS. mummified war pharaoh in golden armor, scarab aura |
| `ruin/ice_wisp.png` | frozen ruins, cold blue. small ice wisp, crystallized, glowing cold blue |
| `ruin/wraith.png` | frozen ruins, cold blue. frost-bound wraith, ice crystals on tattered robes |
| `ruin/bloat_eye.png` | frozen ruins, cold blue. bloated blue eye monster with icy pustules |
| `ruin/frost_worm.png` | frozen ruins, cold blue. ice-armored worm, frosted spikes |
| `ruin/giant_worm.png` | frozen ruins, cold blue. massive frost giant worm, ice plates |
| `ruin/frost_lich.png` | BOSS. skeletal frost lich in ice crown, frozen scepter |
| `void/void_crawler.png` | void realm, purple abyss. dark violet crawling abomination, four tentacle limbs, glowing purple eyes |
| `void/wraith.png` | void realm, purple abyss. spectral wraith, translucent pale purple hooded figure, glowing hollow eyes |
| `void/bloat_eye.png` | void realm, purple abyss. void-bloated eye monster, purple veins, cosmic pupils |
| `void/direwolf.png` | void realm, purple abyss. shadowy void wolf, star-glowing fur, purple flame eyes |
| `void/queen_bee.png` | void realm, purple abyss. void queen insect, translucent violet wings |
| `void/eyeball.png` | void realm, purple abyss. floating void eye with tendril legs, purple iris |
| `void/void_overlord.png` | BOSS. towering void overlord, dark purple armor, cosmic cracks, crown of starlight |

---

## 3. 地图瓦片(HD,seamless)— 之后批量

> 模板:`Seamless tileable {floor|wall} texture, top-down 2D game dungeon, {材质描述}, edge-to-edge pattern filling the entire canvas, four edges connect seamlessly. {高清块}` 保存 `import/world/<name>.png`

| 保存名 | 材质描述 |
|---|---|
| `world/floor_forest.png` | dark mossy forest ground, grass tufts and dirt, dark green and brown |
| `world/wall_forest.png` | dense dark forest hedge wall, tangled roots and thorns, deep green |
| `world/floor_desert.png` | sun-baked cracked desert sand, warm orange and tan |
| `world/wall_desert.png` | sandstone block wall, weathered, sandy orange and brown |
| `world/floor_ruin.png` | ancient ruined stone floor, cracked grey slabs with frost, cold blue-grey |
| `world/wall_ruin.png` | frozen ruin stone wall, ice-crusted bricks, cold grey and white-blue |
| `world/floor_void.png` | dark void realm floor, cracked obsidian with faint purple energy veins |
| `world/wall_void.png` | dark purple obsidian block wall with glowing violet rune lines |

---

## 4. 交付命名与目录(重要)

```
assets/ai-gen/import/
├── characters/   barbarian_stand.png, barbarian_walk.png, ... (12 张)
├── monsters/     forest/bat.png, void/void_crawler.png, ...   (25 张)
└── world/        floor_forest.png, wall_void.png, ...         (8 张)
```

生成完放好 → 跟我说 → 我跑 `python assets/ai-gen/scripts/import_art.py --all`:品红抠图 → sheet 裁 4 帧 → bbox 裁切 → **BOX 双线性降采样到显示尺寸** → `assets/atlas/input/` → `pack_atlas.py` 重建 → 游戏渲染升级。

**建议顺序**:6 职业 12 张一次生成 → 我导入 + 你进游戏看风格 → 满意后怪物 25 张 → 瓦片 8 张。