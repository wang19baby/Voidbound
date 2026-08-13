# Changelog

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