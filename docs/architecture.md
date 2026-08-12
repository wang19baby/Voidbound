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
│   ├─ actions/ audio/ envFx/ run/ save/ lifecycle/ uiDispatch/ screenMachine/
├─ screens/            # 屏幕渲染
└─ main.ts             # 1955 行, 启动装配 + 主循环
```

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