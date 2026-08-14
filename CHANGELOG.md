# Changelog

## 2026-08-13 — 地图墙量修复 + 怪物卡墙修复

### 墙生成 v3 (开放场地 + 稀疏墙簇)

问题: v2 全图填墙再挖房间 → 平均 33/64 格为墙 (52%),战斗空区仅 48%,且 `density` 参数对墙量无效 (三模式同为 33 墙块)。

修复 (`src/game/world.ts`):
- 默认全开放 → 按 density 撒 1-2 块小墙簇作掩体 (内区 8 邻域互斥, 无长墙/死角)
- 外圈 1 块永不置墙 → chunk 间天然连通, 消除边门洞孤岛 (原 21/400 chunk 门洞不可达)
- density 梯度生效: extract 7.0 / linear 7.9 / gauntlet 8.4 块 (空区 87-89%)

### 怪物卡墙修复 (`src/game/monsters/ai.ts`)

问题: 领主 (1.4x 缩放) 滑移用 `def.size` 而非实际 `m.size` → 大怪嵌墙; Boss 召唤/分裂/死亡分裂直接把 `pos` 写进墙内 (无碰撞校验); 兜底出生点 (`center.y-800`) 与 wander 目标不校验墙。

修复:
- `updateMonsters` 位移/滑移碰撞盒改用 `m.size` (含缩放)
- 新增 `overlapsWalls` + `placeMonsterFree`: 召唤/分裂/兜底落点先滑移推出, 仍重叠则随机重掷
- `pickWanderTarget` 目标避开墙 (防贴墙磨)
- 验证: slideAxis 墙内深处脱出 448/448, spawnMonster 落点不撞墙 400/400, wanderTarget 不撞墙 400/400, 全量测试 1150 断言通过

## v0.1.0 (2026-08-13) — 架构重构周

11 commits 完成 Tier 1/2/3/4/5 全部任务,DDD 化架构落地。

### 架构成果

- **main.ts**: 2647 → 1955 行 (-692, -26.1%)
- **新增模块**: 50+ 个,共 +3000 行新模块代码
- **测试覆盖**: 25 个单元测试套件

### Tier 1: 基础重构 (7 commits)

| Commit | 范围 |
|---|---|
| e1975e3 | 事件总线扩容(3→13 事件) + FX facade + 4 个 app 模块 + System 注册表 |
| 5724d8f | 5 处 emit 关键事件接入 |
| dcbcbdd | screens/ 大块拆分 (T1c + T2a, 4 个 screens 文件) |
| 8b8e9c1 | app/actions + app/save 拆分 |
| 343fc27 | game/fx 聚合 + System 注册表接入 main.ts |
| 842c9f6 | drawTitle 整块抽出 (US-024-b) |
| 811afbf | render/hud.ts 拆分 (653 → 10 子模块) |

### Tier 4-5: DDD 化 (4 commits)

| Commit | 范围 |
|---|---|
| af2a2e4 | PR #1: GameState combat + ui 子对象 |
| 212bafc | PR #2: GameState fx + equip 子对象 |
| 56e83e3 | PR #3: game/character/ 聚合 (DDD 玩家聚合根) |
| 4843f8f | PR #4: game/inventory/ 聚合 (DDD 装备聚合根) |
| 72c089a | PR #5: render/hud/overlay 拆分 (hud polish) |

### GameState 物理拆分

62 顶层字段 → 27 顶层字段 + 4 个语义子对象:
- `combat` (10): combo / cameraShake / hitStop / lastKiller / bossIntro* / levelUpFlash / score / killsTotal
- `ui` (8): collectOpen / keybindEdit / settingsOpen / dying / deathUndo / explored / titleFocus / titleMsg
- `fx` (12): fireballs / monsters / vfx / pools / dmgNums / deathFx / swings / loot / owned / toasts / enemyProj / envFx
- `equip` (5): sel / page / runeChoice / rejectedRunes / materials

### DDD 聚合包

- **game/character/** (7 文件): Player / Stats / Base / Passive / Commands / Death
- **game/inventory/** (11 文件): Equipment / Affix / Set / Materials / Drop / Price / Power / Loot
- **game/fx/** (6 文件): Vfx / DamageNum / DeathFx / EnvFx / Facade
- **game/system/** (4 文件): GameSystem 接口 + 注册表 + 4 内置系统

### 核心架构

1. **事件总线**: 13 个事件 (player.damaged/died, skill.cast, item.dropped/equipped, rune.chosen, run.started/ended, screen.changed, monster.killed/spawned/hit)
2. **System 注册表**: 4 内置系统 (attackSystem/monsterSystem/envFxSystem/fxSystem),主循环 `updateAll(state, dt)` 一行调用
3. **FX facade**: 集中 hit/monsterDeath/playerHit/bossIntro 视觉策略
4. **DI 模式**: ScreenKeyContext / UiCtx / TitleCtx / TownCtx 多 ctx 注入
5. **re-export 兼容层**: player.ts / passive.ts / equipment.ts / deathSettle.ts 保持 100+ 引用方代码 0 变更

### 测试

- 25 个单元测试套件,ALL PASS
- 新增 character.test.ts + inventory.test.ts
- esbuild build ~400.7kb (无回归)

### PR #7: main.ts 删 dead code (2026-08-13)

从 main.ts 删除已搬到 screens/ 和 app/ 的死代码 (5 段 + 3 个委派 wrapper):
- enterTown / interactTown / handleTownPanelKey (~200 行)
- drawTownFrame / drawTownPanel (~225 行)
- startRun / ensureDungeonRun / triggerBossIntro (~55 行)
- drawCharacters / drawCollectionPanel (~195 行)
- drawNewgame / drawCloseConfirm / drawTeleportTransition 委派 (~30 行)
- formatTime (~6 行)

main.ts: 1955 → 1289 (-666 行, -34.0%)

### PR #8: main.ts 搬 app/ 模块 (2026-08-13)

新建 src/app/frame.ts (330 行, drawFrame + drawFrameToScreen) +
src/app/input.ts (17 行, mouseAimDirection).
增强 app/lifecycle.ts (107 → 131 行, 加 confirmCloseSave/Cancel/autoPauseOnBlur) +
app/audio.ts (30 → 41 行, 加 fadeBgm).

main.ts: 1289 → **979 行** (**达成 ≤1000 行目标**, -24.0%)
累计 main.ts 减重: 2647 → 979 行 (-1668 行, -63.0%)

### PR #10: 继续游戏流程 (2026-08-13)

标题"继续游戏"读档不再按存档 `scene` 分派直进地牢,统一先进城镇,再经城镇"地下城入口"传送阵出发 — 对齐 `docs/GAME_FLOW.md §3` (C0 → T1 城镇)。
- `src/app/save.ts`: `resumeFromSave` 去掉 `ctx` 参数与 dungeon 分支; `continueLastSave` 去掉未用 `ctx`
- `src/main.ts`: 2 处 `continueLastSave` 包装 + O 键读档调用点同步
- `tests/save.test.ts` 新增: dungeon/town/无 scene 存档一律回城镇 (断言 mode/screen/出生点/面板)

### PR #9: main.ts 减重完成 + 文档 polish (2026-08-13)

- `docs/architecture.md` (119 → 177 行): 反映 PR-007/PR-008 main.ts 减重;
  新增 app/frame.ts (330 行) + app/input.ts (17 行) 模块说明
- `CHANGELOG.md` (61 → 83 行): 追加 PR-007/PR-008 commit 记录
- `README.md`: 架构一节更新为 main.ts 979 行 (≤1000)

累计 main.ts 减重: 2647 → 979 行 (-1668 行, -63.0%)
## 2026-08-13 — 小地图修复 (迷雾/怪物点)

### 问题
- 已探索底只画**相机视野内** (camBx0..camBx1 循环) → 玩家离开后走过的区域变黑, 迷雾跟随相机而非探索记录
- 怪物红点 2×2px 过小且**无迷雾门控** (未探索区也亮 = 透视红点), 与战争迷雾语义冲突

### 修复 (`src/render/hud/bars.ts` drawMinimap)
- 已探索底: 遍历 `explored` 全集合 (持久), 8×8 块降采样为方格 → 探索过的区域永久可见
- 怪物点: 3×3 (Boss 4×4 橙), **仅已探索区显示** (反透视)
- 新增传送门紫点 (Boss 死亡位, 出口/终点标记, OPT-024)
- 玩家白点/探索度百分比保持
