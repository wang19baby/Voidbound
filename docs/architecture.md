# Voidbound 架构文档 (v0.1.0, 2026-08-13)

## 总览

Voidbound 是 2D 俯视 ARPG (Tauri + WebGL2 + 原生 TypeScript)。
本架构经历了 v0.1.0 重构周,达到清晰的 DDD-lite 分层 + 事件驱动 + System 注册表。

## 目录结构

```
src/
├─ core/               # 基础设施 (eventBus, pool)
├─ application/        # 跨域服务 (combatFxService, screenFxService)
├─ game/               # 领域核心
│   ├─ character/    # DDD 玩家聚合
│   ├─ inventory/    # DDD 装备聚合
│   ├─ fx/           # VFX + facade
│   ├─ monsters/     # 已有 barrel
│   ├─ combat/       # 已有 barrel
│   ├─ system/       # GameSystem 接口 + 注册表
│   └─ state/        # GameState + 4 个子对象
├─ presentation/       # 渲染层 (worldDraw)
├─ render/             # WebGL/HUD
│   └─ hud/          # 10 个子模块
│       └─ overlay/  # 5 个覆盖层子模块
├─ app/                # 应用层
│   ├─ actions/ audio/ envFx/ frame/ input/ run/ save/ lifecycle/ uiDispatch/ screenMachine/
├─ screens/            # 屏幕渲染
└─ main.ts             # 979 行 (≤1000), 启动装配 + 主循环
```

## main.ts 减重里程碑

main.ts 从 v0.1.0 初的 **2647 行** → 当前 **979 行** (-1668 行, **-63.0%**),达成 ≤1000 行目标。

| PR | 任务 | main.ts 行数变化 |
|---|---|---|
| - | 起点 (Tier 1-5 完成) | 2647 |
| - | Tier 1-5 累计 (事件总线 + System + DDD) | 1955 |
| PR #7 | main.ts 删 dead code (5 段 + 3 个委派 wrapper) | 1955 → 1289 (-666, -34.0%) |
| PR #8 | main.ts 搬 app/ 模块 (frame + input + lifecycle/audio 增强) | 1289 → **979** (-310, -24.0%) |

### PR #7 — 删除死代码

从 main.ts 删除已搬到 screens/ 和 app/ 的死代码:
- enterTown / interactTown / handleTownPanelKey (~200 行)
- drawTownFrame / drawTownPanel (~225 行)
- startRun / ensureDungeonRun / triggerBossIntro (~55 行)
- drawCharacters / drawCollectionPanel (~195 行)
- drawNewgame / drawCloseConfirm / drawTeleportTransition 委派 wrapper (~30 行)
- formatTime (~6 行)

### PR #8 — 搬 app/ 模块

新增模块:
- **app/frame.ts** (330 行): drawFrame + drawFrameToScreen —— 边框绘制 + 屏幕输出
- **app/input.ts** (17 行): mouseAimDirection —— 鼠标朝向计算

增强现有模块:
- **app/lifecycle.ts** (107 → 131 行): 新增 confirmCloseSave / Cancel / autoPauseOnBlur
- **app/audio.ts** (30 → 41 行): 新增 fadeBgm

## 核心设计

### 1. 事件总线 (core/eventBus.ts)

```ts
import { bus } from '../core/eventBus';
bus.emit('player.damaged', { player, dmg, src });
bus.on('player.damaged', payload => { /* ... */ });
```

13 个事件流通 (monster.killed / player.damaged / player.died / skill.cast / item.dropped / item.equipped / rune.chosen / run.started / run.ended / screen.changed 等)。

### 2. GameSystem 注册表 (game/system/)

```ts
import { registerAllBuiltinSystems } from './game/system/builtins';
registerAllBuiltinSystems();
// 主循环: updateAll(state, dt)
```

4 内置系统:
- attackSystem: 火球 + 怪物投射物 + 挥击盒
- monsterSystem: AI 更新
- envFxSystem: 主题氛围粒子
- fxSystem: VFX + DamageNum + DeathFx

### 3. FX Facade (game/fx/facade.ts)

```ts
import { fx } from './game/fx';
fx.hit(state, pos, dmg, dmgType);
fx.monsterDeath(state, pos);
fx.playerHit(state);
fx.bossIntro(state, pos);
```

集中视觉策略,避免 spawn* 散点调用。

### 4. GameState 子对象

```ts
interface GameState {
  player: Player;
  world: WorldState;
  run: RunState;
  screen: ScreenMachine;
  combat: CombatState;  // 10 字段
  ui: UiState;          // 8 字段
  fx: FxState;          // 12 字段
  equip: EquipState;    // 5 字段
  // 账号级字段 (charList / currentChar / legacy)
}
```

### 5. DI 模式

- `ScreenKeyContext`: 21 个回调注入屏路由总线
- `UiCtx`: 19 个回调注入鼠标分发
- `TitleCtx` / `TownCtx`: 屏级局部 ctx

## app/ 应用层模块

### app/frame.ts (PR #8 新增)

`drawFrame + drawFrameToScreen` —— 边框绘制与屏幕输出工具:
- 提供统一的边框渲染接口,被 town/title/inventory 等多个屏幕复用
- `drawFrame`: 绘制到内部缓冲区
- `drawFrameToScreen`: 直接输出到屏幕(包含背景遮罩与重绘)

### app/input.ts (PR #8 新增)

`mouseAimDirection` —— 鼠标朝向计算:
- 给定玩家位置 + 鼠标坐标,返回 8 方向 (上/下/左/右 + 4 对角) 单位向量
- 被 fireball / attack / swing 等战斗系统共用,消除 main.ts 中的内联计算

### app/lifecycle.ts (PR #8 增强)

107 → 131 行:
- 新增 `confirmCloseSave`: 退出前确认存档
- 新增 `Cancel`: 关闭确认对话框
- 新增 `autoPauseOnBlur`: 窗口失焦自动暂停

### app/audio.ts (PR #8 增强)

30 → 41 行:
- 新增 `fadeBgm`: BGM 平滑淡入淡出

## DDD 聚合

### character 聚合 (game/character/)

- types: Player interface (~27 字段)
- base: MAX_HP / MAX_MP / MAX_POTION
- stats: 基础 + 装备聚合
- passive: 被动技能系统
- commands: usePotion / startDodge / gainExp / castFireball
- death: revivePlayer / deathSettle

### inventory 聚合 (game/inventory/)

- types: Equipment / Affix / Rarity
- constants: 所有常量 (RARITY_* / EQUIP_SLOTS / MATERIAL_* / SET_BONUSES)
- equipment: equipItem / unequipSlot / recomputeCombat
- affix: rollAffix / genAffix / describeAffix
- set: 套装聚合
- materials: addMaterial / spendMaterial / materialDrop
- drop: randomEquipment / dropLoot / dropBossReward
- price: getItemBuyPrice / getItemSellPrice / reroll
- power: itemPower / itemPowerDelta
- loot: pickupLoot / collectAllLoot

## 测试

- 25 个单元测试套件
- 覆盖 combat / equipment / skill / player / difficulty / screen / town / newgame / run / monsterData / instanced / balance / content / uigrid / passive / class / vfx / eventBus / pool / poolIntegration / keybind / character / inventory
- ALL PASS