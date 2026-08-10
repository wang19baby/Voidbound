# Voidbound M5 内容开发需求文档 — 6 职业 / 多角色 UI / 3 城镇 / 炼制系统

> 版本:v1.0
> 日期:2026-08-10
> 状态:评审中(§8 拍板项待确认)
> 来源:DESIGN.md §1/§3 · REQUIREMENTS.md F-RPG/F-TOWN/F-RUNE/F-SAVE · GAME_FLOW.md §2-6 · CHANGELOG-v1.1 D-01/D-08/D-25 · CONTENT.md 职业/变异模板
> 前置:34 条优化需求(OPT-001~034)已交付;存档 v5 + 账号层(account.json)就绪;Screen 状态机就绪

---

## 1. 背景与目标

四项内容均有完整设计文档,但实现为 0 或部分:

| 项 | 设计位置 | 当前实现 | 缺口 |
|---|---|---|---|
| 6 职业 | F-RPG-001/002/003、DESIGN §1、CONTENT.md | 单一默认角色(5 技能槽) | 职业结构/选择/差异化技能 |
| 多角色 UI | GAME_FLOW §3-5、F-SAVE-001、M4 Day47-48 | account.characters + saves/char_0.bin 基础设施 | 角色管理界面/多档读写 |
| 3 城镇 | F-TOWN-001/002、DESIGN §3、D-08 | 单城镇 4 NPC | 城镇表/解锁/传送/设施 |
| 炼制系统 | DESIGN §3、D-01、CONTENT.md | 重铸师=100 金重 roll,无材料 | 材料/重铸消耗/符文锻造 |

**目标**:按依赖链分批交付,每批独立可验证;深度选项见 §8 拍板。

---

## 2. 职业系统设计

### 2.1 数据结构(src/game/class.ts)

```ts
export type ClassId = 'barbarian' | 'paladin' | 'mage' | 'necromancer' | 'ranger' | 'assassin';
export type ClassAttr = 'str' | 'dex' | 'vit' | 'int' | 'fai' | 'cha';

export interface ClassDef {
  id: ClassId;
  name: string;        // 野蛮人
  title: string;       // 狂暴战士
  desc: string;        // 简介
  color: string;       // 选择屏高亮
  attr: ClassAttr;     // 主属性
  attrWeight: number;  // 升级自动加点倍率 (现有 +5 attr × 权重)
  skillSlots: Record<SkillSlot, SkillId>;  // 6 槽位 → 技能 id
}
export const CLASS_DEFS: Record<ClassId, ClassDef>;
export function classById(id: ClassId): ClassDef;
```

### 2.2 技能库(skill.ts 重构,SkillSpec by id)

现有 6 槽 registry 存闭包 cast → 改为 `SKILL_SPECS: Record<SkillId, SkillSpec>`,registry 存 `{ id, level, rune }`,运行时聚合。**等级/符文按槽保留**(角色级进度),换职业只换技能 id。

技能池(13 个,含 8 个新增):

| SkillId | 名称 | 类型 | 机制 | 数值(基准) |
|---|---|---|---|---|
| melee | 挥击 | 物理 | 前方 AABB(现有) | 50 |
| thrust | 突刺 | 物理 | 远距单发(现有 RMB) | 50×1.2 |
| bash | 重击 | 物理 | 单发高伤,cd 1.2s | 50×1.6 |
| whirlwind | 旋风斩 | 物理 | 周围 120px AOE,cd 2.5s | 50×0.9/怪 |
| fireball | 火球 | 火 | 直射(现有) | 25 |
| multi_fireball | 连发火球 | 火 | 5 发扇形(现有 W) | 25×5 |
| frost_nova | 冰霜新星 | 冰 | 周围 160px AOE,cd 3s | 25×1.3 |
| chain_lightning | 闪电链 | 雷 | 最近怪 → 链 2 跳(120px,×0.7/×0.5),cd 2.5s | 60 |
| shadow_bolt | 暗影箭 | 暗 | 直射单发 | 35 |
| holy_bolt | 圣光弹 | 圣 | 直射单发,命中回 3 HP | 30 |
| poison_dart | 毒镖 | 毒 | 直射 + 3s×3 毒 DOT(复用 burn) | 20 |
| heal | 回血 | — | 瞬回 40(现有 E) | 40 |
| ultimate | 终极 | 暗 | 周围 200px AOE(现有 R) | 70 |

**机制扩展**(小改):
- `Fireball.dmgType: DamageType`(state.ts):投射物按技能类型结算,火球命中逻辑走 `f.dmgType`(现有硬编码 'fire')
- 毒 DOT 复用 burn 字段(burnDps),伤害数字绿色
- 连锁闪电:resolveFireballHits 内链式(命中后找最近存活怪再结算)

### 2.3 6 职业槽位配置

| 职业 | 主属性 | LMB | RMB | Q | W | E | R |
|---|---|---|---|---|---|---|---|
| 野蛮人 | str | melee | bash | whirlwind | fireball | heal | ultimate |
| 圣骑士 | fai | melee | holy_bolt | frost_nova | heal | fireball | ultimate |
| 法师 | int | fireball | multi_fireball | frost_nova | chain_lightning | heal | ultimate |
| 死灵法师 | cha | shadow_bolt | poison_dart | frost_nova | melee | heal | ultimate |
| 游侠 | dex | poison_dart | fireball | melee | multi_fireball | heal | ultimate |
| 刺客 | dex | melee | shadow_bolt | poison_dart | whirlwind | heal | ultimate |

### 2.4 职业选择与新局流程

- newgame 屏改为三列:**职业(1-6 数字键选) + 难度(Z/X 循环) + 主题(←/→)**;Enter 开始
- `ngSel` 加 `classIdx`;`ngResolve` → `{ classId, difficulty, theme }`
- `bindClass(state, classId)`:重绑 6 槽技能 id,设 player.classId;等级/符文保留
- startRun 前 bindClass(新局/读档)

### 2.5 存档(升 v6)

`SaveData.class: String`;v5→v6 迁移默认 'barbarian';TS `SaveData.class`;P 写 / O 读回 bindClass。

---

## 3. 多角色 UI 设计

### 3.1 数据模型

- `account.characters: Vec<String>`(已有)驱动角色列表
- 存档路径 `saves/<char_id>.bin`(已有 char_0 单档机制,扩展为任意 id)
- **角色 = 独立存档文件 + 职业 + 等级/装备/技能进度**;账号层(cleared/best/legacy)全角色共享(已有)

### 3.2 界面(GAME_FLOW §3-4)

- 标题新增 **角色管理 [R]**:列表(名/职业/等级/难度/最近游玩)+ 详情(装备/技能摘要)+ [新建]/[删除]
- **新建**:职业选择(6)→ 命名(自动"职业_序号",D-25 必填的手输待文本输入基建)→ 难度 → 进入
- **继续 [O]**:直接进最近角色;角色管理内切换任意角色
- 删除:二次确认(复用 hardcore 确认交互)

### 3.3 存档命令扩展

- `save_game(char_id, data)` / `load_game(char_id)`(现有无 id 参数,加默认 'char_0' 兼容)
- `list_characters()`:读 account.characters + 各档摘要(职业/等级)

---

## 4. 3 城镇设计

### 4.1 城镇表(town.ts 数据驱动,TOWN_DEFS)

| 城镇 | 解锁(D-08) | 设施 | 位置 |
|---|---|---|---|
| 新手镇(鲁特·格莱宁) | 默认 | 商人(装备/药水)、重铸师(金币)、挑战祭坛、地下城入口 | 现状 1 镇 |
| 商业城(卡斯特蓝港) | 通关森林 | +神秘商人(每局 4 件传奇,500-2000 金)、装备重铸师(消耗材料) | 新 |
| 圣城(圣所·阿卡拉) | 通关沙漠+废墟(D-08 并列) | +符文锻造师(重铸变异符文)、训练师(技能升级占位) | 新 |

### 4.2 传送

- 城镇间 **传送师 NPC**(城镇解锁后开启,D-08):选目标镇 → 1s 过场(黑屏+文字)→ 到达
- 城镇场景 = 现有 town 模式扩展:每镇独立 NPC 布局 + 主题底色(商业城→海港蓝/圣城→圣光金)

### 4.3 与现有系统的接口

- `enterTown(state, townId)`:切换 TOWN_DEFS[townId];mode='town' 不变
- 解锁数据:`unlockedTown(cleared, townId)` 纯函数(复用 account.cleared)
- 新 NPC 面板:神秘商人(1-4 购买)、符文锻造师(见 §5)

---

## 5. 炼制系统设计

### 5.1 材料(item 新类)

- `Equipment.type` 扩展 `'material'`(不可穿戴、不进装备槽、不可卖出重铸?可卖)
- 材料 3 种:`iron_shard 灵铁碎片`(小怪/商店)/ `arcane_core 奥术核心`(精英)/ `void_fragment 虚空碎片`(Boss)
- 掉落:小怪 8%、精英必掉 1、Boss 必掉 1-2;商店可购(灵铁)
- 背包按 `type==='material'` 统计数量(不占 20 格装备上限?——**拍板项**:材料独立计数,不占背包格)

### 5.2 重铸师改造(D-01)

- 现有:100 金重 roll 词条 → **双轨**:100 金(现状保留) **或** 10 灵铁碎片(免费重 roll);按稀有度递增:rare 10 / set 20 / unique 40 灵铁

### 5.3 符文锻造师(圣城,D-01 重铸)

- 消耗 `5 奥术核心 + 1 虚空碎片`:重铸已变异技能 → 重新 3 选 1(复用三选一 overlay)
- 无已变异技能时提示"先升级技能到 10 级"

### 5.4 经济闭环

- 材料消耗渠道(重铸/锻造)+ 产出渠道(掉落/商店)→ 金币外第二货币;精英/Boss 掉落材料 = 刷取动机

---

## 6. 需求条目总表

### 职业(C-101~105)

#### C-101 技能库 id 化重构
- **需求**:skill.ts 重构为 `SKILL_SPECS: Record<SkillId, SkillSpec>`;registry 存 {id, level, rune};新增 8 技能(§2.2);`Fireball.dmgType` + 链式闪电/毒 DOT 机制
- **验收**:13 技能全部可施放;等级/符文按槽保留;现有 9 套测试不回退
- **文件**:skill.ts、state.ts、monster.ts、tests/skill.test.ts(+新技能用例)

#### C-102 职业表 + bindClass
- **需求**:class.ts 6 职业定义(§2.3);`bindClass(state, id)` 重绑槽位;player.classId
- **验收**:绑定后各槽技能/MP/冷却符合职业表;等级保留;class.ts 纯数据可单测
- **文件**:class.ts(新)、skill.ts、state.ts、tests/class.test.ts(新)

#### C-103 职业选择屏
- **需求**:newgame 三列布局(职业 1-6 / 难度 Z-X / 主题 ←→);ngSel.classIdx;Enter 开始前 bindClass
- **验收**:六职业可选且可开始;Esc 返回;选择状态迁移有单测
- **文件**:newgame.ts、main.ts(drawNewgame)、tests/newgame.test.ts

#### C-104 存档 v6 职业字段
- **需求**:save.rs SAVE_FORMAT_VERSION=6 + class;v5→v6 迁移默认 barbarian;TS/P/O 全链路
- **验收**:存→杀进程→读 职业正确还原;cargo 迁移用例
- **文件**:save.rs、ipc/save.ts、main.ts

#### C-105 职业属性倾向
- **需求**:升级自动加点按 attrWeight(默认 str 1.0 / 其余 0.8);面板显示主属性
- **验收**:升级后 attr 增量符合权重;纯函数单测
- **文件**:player.ts、class.ts、tests/player.test.ts

### 多角色(C-201~203)

#### C-201 多档读写
- **需求**:save_game/load_game 带 char_id(默认 'char_0' 兼容);list_characters 返回摘要
- **验收**:两角色互不覆盖;cargo 用例;旧单档可读
- **文件**:save.rs、account.rs、ipc/save.ts

#### C-202 角色管理屏
- **需求**:标题 [R] 角色管理(列表/详情/新建/删除/切换,§3.2);删除二次确认
- **验收**:新建→进入→存档→返回→切换可见;删除后档清
- **文件**:main.ts(新 screen 'characters')、hud.ts、state.ts

#### C-203 继续入口
- **需求**:标题 [O] 直接进最近角色;[R] 内切换任意角色
- **验收**:最近角色记忆(account.last_char)正确
- **文件**:account.rs、main.ts

### 城镇(C-301~303)

#### C-301 城镇表 + 解锁
- **需求**:TOWN_DEFS 3 镇(§4.1);unlockedTown 纯函数;挑战祭坛/入口按镇配置
- **验收**:通关森林→商业城解锁;通关沙漠+废墟→圣城;未解锁置灰
- **文件**:town.ts、difficulty.ts?、tests/town.test.ts

#### C-302 传送师
- **需求**:传送 NPC + 1s 过场;解锁镇可传送
- **验收**:传送后 NPC 布局/底色正确;存档 town 字段(v6 同批或 v7)
- **文件**:town.ts、main.ts、hud.ts

#### C-303 新设施面板
- **需求**:神秘商人(1-4 传奇,价格 500-2000);训练师占位(提示"技能树开发中")
- **验收**:购买扣金入库;背包满拒买
- **文件**:town.ts、main.ts、tests/town.test.ts

### 炼制(C-401~404)

#### C-401 材料物品
- **需求**:type 'material' + 3 材料;掉落(小怪 8%/精英 1/Boss 1-2)+ 商店灵铁;材料独立计数(拍板)
- **验收**:材料掉落/购买正确;不进穿戴槽;计数显示
- **文件**:equipment.ts、monster.ts、town.ts、hud.ts、tests/equipment.test.ts

#### C-402 重铸双轨
- **需求**:100 金 或 灵铁(rare 10/set 20/unique 40)重 roll
- **验收**:材料消耗与金互斥;不足提示
- **文件**:town.ts、main.ts、tests/town.test.ts

#### C-403 符文锻造师
- **需求**:圣城设施;消耗 5 奥术核心+1 虚空碎片 → 已变异技能重新 3 选 1
- **验收**:有变异可重铸;无变异提示;材料扣除正确
- **文件**:town.ts、skill.ts、main.ts

#### C-404 材料经济平衡
- **需求**:TTK/掉落基线外扩:材料-per-10min 基线
- **验收**:balance.test 材料掉落断言
- **文件**:tests/balance.test.ts

---

## 7. 波次规划与开发计划

| 波次 | 内容 | 需求 | 预估 | 出口标准 |
|---|---|---|---|---|
| **W1 职业地基** | 技能库 id 化 + 13 技能 + 职业表 + 选择屏 + 存档 v6 + 属性倾向 | C-101~105 | 3~4 天 | 6 职业可选可玩;npm/cargo 全绿 |
| **W2 多角色 UI** | 多档读写 + 角色管理屏 + 继续入口 | C-201~203 | 2~3 天 | 多角色互不覆盖;创建/删除/切换闭环 |
| **W3 城镇** | 城镇表 + 解锁 + 传送 + 神秘商人/训练师 | C-301~303 | 2 天 | 3 镇解锁链完整;传送可用 |
| **W4 炼制** | 材料 + 重铸双轨 + 符文锻造 + 经济基线 | C-401~404 | 2~3 天 | 双消耗渠道闭环;材料掉落/使用正确 |

**依赖链**:W1(职业)是全部地基(角色=职业+存档、城镇解锁=通关记录、炼制=装备/符文现有系统)→ W2 → W3/W4 可并行收口。
**实施顺序建议**:W1 → W2 → W3 → W4,每波收口跑 13+ TS 套 + cargo + build + 启动冒烟。

### W1 任务分解(D1~D6)

- D1:skill.ts 重构(SKILL_SPECS + registry {id,level,rune})——先迁移后新增,防行为漂移
- D2:8 个新技能 + Fireball.dmgType + 链式/毒 DOT
- D3:class.ts + bindClass + player.classId
- D4:newgame 三列屏 + ngSel.classIdx
- D5:存档 v6(rs+TS)+ 迁移 + 属性倾向
- D6:测试(新技能/职业表/选择屏/迁移/attr)+ 冒烟

---

## 8. 拍板项(开工前确认)

| 决策 | 选项 | 推荐 |
|---|---|---|
| **J1 职业深度** | (a) 最小可行:6 槽差异化技能配置(本计划) / (b) 全量:5 主动+10 被动技能树 | **(a)**:技能树量大且与符文系统叠加复杂,先交付可玩差异 |
| **J2 角色命名** | (a) 自动"职业_序号"(本计划) / (b) 文本输入(需新建输入框基建,D-25 必填) | **(a)**:文本输入是独立基建,自动名先跑通多角色 |
| **J3 材料计数** | (a) 材料独立计数不占背包 20 格 / (b) 占背包格 | **(a)**:否则 3 种材料挤压装备空间 |
| **J4 城镇解锁** | (a) D-08 原案:商业城←森林,圣城←沙漠+废墟 / (b) 简化:圣城←通关全部 4 主题 | **(a)**:与 OPT-015 解锁表一致 |
| **J5 仓库** | (a) 本波不做 / (b) 最小化:账号层共享 20 格 | **(b)**:用户要求仓库格子,最小化交付 |

---

## 9. 非目标(本计划不做)

- 完整技能树(5 主动+10 被动/职业)
- 文本输入基建(角色命名手输)
- 仓库/跨局共享存储
- 城镇间传送动画(黑屏文字过场即可)
- 装备图标按职业类型化(沿用现有 spark 占位)
- 训练师完整技能学习/升级面板

---

## 10. 测试与验收要求

- **每波**:npm test(13 套现有 + 新套)全绿、cargo test 全绿、build 绿、cargo run 冒烟(启动冒烟为可自动化上限;交互流程待实机)
- **新测试**:class.test(职业表完整性/槽位引用)、skill.test 扩(新技能数值/类型)、newgame.test 扩(三列迁移)、town.test 扩(城镇解锁/传送/材料购买)、equipment.test 扩(材料类型)、balance.test 扩(材料掉落基线)、cargo(存档 v6 往返/迁移/多角色档)
- **内容护栏**:manifest.validateContent 扩到职业表(每职业槽位技能 ∈ SKILL_SPECS、职业 id 完整)

---

## 11. 参考

- 职业/技能:[REQUIREMENTS.md](../REQUIREMENTS.md) F-RPG · [DESIGN.md](../DESIGN.md) §1 · [CONTENT.md](../CONTENT.md) 职业模板
- 多角色:[GAME_FLOW.md](../GAME_FLOW.md) §3-5 · F-SAVE-001 · D-25
- 城镇:[DESIGN.md](../DESIGN.md) §3 · F-TOWN-001/002 · D-08
- 炼制:[DESIGN.md](../DESIGN.md) §3 设施 · D-01 重铸/传承 · CONTENT.md 变异重铸模板
- 前置:[2026-08-10-ux-optimization-requirements.md](2026-08-10-ux-optimization-requirements.md)

---

## 12. 实测反馈修正与 UI 升级(2026-08-10 用户实机反馈)

### 12.1 已修复的两个实测 bug(本轮已落地)

| 问题 | 根因 | 修复 |
|---|---|---|
| **打完 Boss 掉落捡不到** | victory 结算直接切屏,地上 Boss 套装/材料无拾取机会 | `collectAllLoot(state)` 在胜利结算前全部入背包(满则留地+提示);胜利屏显示"掉落入背包 X 件";RunState.collectedLoot |
| **回城/新局地上物品残留** | enterTown/startRun 不清 `_loot`,跨局残留 | `clearGroundLoot(state)` 接入 enterTown + startRun |

### 12.2 UI 升级需求(参考 D2 网格背包 / POE 分页 / Hades 鼠标全交互)

> 方向确认:键盘为主,但**所有界面必须鼠标可用**;背包/仓库/商店**格子化 + 分页 + 滚轮**;装备槽**可视化**。

#### C-501 鼠标兼容输入层(UI 基建,先做)
- 全屏(标题/选择屏/暂停/装备/背包/仓库/商店/结算)增加鼠标路径:点击按钮/物品、悬停高亮、滚轮翻页
- 规范:每个键盘动作都有等价鼠标动作,互不阻塞;物品 hover 显示词条 tooltip
- **文件**:input/mouse.ts(点击命中检测)、hud.ts、main.ts 事件分发
- **验收**:逐屏核对键盘↔鼠标等价;悬停高亮可见

#### C-502 格子化背包 + 分页
- 背包 = **4×5 网格(20 格)**,1 物品/格;格子边框 + 稀有度底色 + 类型占位图标
- **分页**:每页 20 格;`滚轮` / PageUp·PageDown 翻页;方向键移动选中格,Enter 装备 / U 卸下;点击格选中,双击/点击装备按钮穿戴
- 选中格高亮 + tooltip(名称/词条/战力/同槽对比)
- **文件**:render/hud.ts(网格绘制)、main.ts(方向键选格/点击分发)
- **验收**:20+ 物品分页显示;滚轮+键盘+鼠标三路翻页/选择

#### C-503 仓库格子(账号层共享 20 格)
- 城镇新增**仓库 NPC**;账号层 `warehouse: Vec<OwnedItem>`(跨角色共享,拍板 J5=b)
- 存取:背包格选中 + G 存入 / 仓库格选中 + T 取出;鼠标点击对等
- 存档:`AccountData.warehouse`;TS `SaveAccount.warehouse`;v6 同批迁移
- **文件**:account.rs、save.ts、town.ts、hud.ts
- **验收**:两角色共享仓库;存取正确;存档往返 + 迁移

#### C-504 装备槽可视化
- Tab 面板 4 槽**图标化**:武器/护甲/护符/戒指(空槽虚线框 + 穿戴项稀有度色框 + 类型占位图标)
- 槽位点击 = 卸下;背包格点击 = 装备(同类型)
- **文件**:render/hud.ts、assets 占位
- **验收**:槽位形态可见;点击可穿/卸

#### C-505 商店/仓库双输入 + 分页
- 商店网格列表(每页 6 件)+ 滚轮翻页;鼠标点击购买/卖出;键盘 1-6 + 滚轮保留
- 卖出:背包页模式(选中格 → 点击"卖出")
- **文件**:hud.ts(drawTownPanel)、main.ts
- **验收**:鼠标全程可操作;键盘路径不回退

#### C-506 选择屏鼠标
- newgame/角色管理/结算屏:点击职业卡/难度/主题/按钮 + 悬停高亮
- **文件**:hud.ts、main.ts
- **验收**:三列选择可鼠标完成

### 12.3 波次调整(UI 基建前置)

| 波次 | 内容 | 需求 | 预估 | 出口标准 |
|---|---|---|---|---|
| **W0.5 UI 基建** | 鼠标输入层 + 网格/分页组件 + 槽位绘制骨架 | C-501、C-502 骨架 | 2 天 | 背包格子化 + 鼠标/滚轮/键盘三路可用 |
| W1 职业地基 | 技能库 + 职业表 + 选择屏 + 存档 v6 | C-101~105(+C-506) | 3~4 天 | 6 职业鼠标+键盘可选可玩 |
| W2 多角色+仓库 | 多档读写 + 角色管理屏 + 仓库 | C-201~203、C-503 | 2~3 天 | 多角色/仓库闭环 |
| W3 城镇 | 城镇表 + 解锁 + 传送 + 神秘商人/训练师 | C-301~303、C-504/505 | 2~3 天 | 3 镇解锁链 + 商店双输入 |
| W4 炼制 | 材料 + 重铸双轨 + 符文锻造 | C-401~404 | 2~3 天 | 双消耗渠道闭环 |

**依赖**:W0.5(UI 基建)是 W1~W4 全部界面的地基,必须先做。
