# Wave 1 实施计划 — 流程与结构(OPT-010 ~ 015)

> 日期:2026-08-10
> 前置:拍板 A1/B1/C1 已确认(见需求文档 §5);Wave 0(OPT-001~009)先行,其中 OPT-003/004 提供 SaveData 版本化机制,本波在其上加 v2 字段
> 目标:一局闭环 = 新局选择屏 → 单层地牢(清图 → Boss → 通关结算 → 再来一局)+ 死亡结算(回城/复活)+ 装备穿戴(A1)+ 进度解锁(C1)
> 需求文档:[2026-08-10-ux-optimization-requirements.md](2026-08-10-ux-optimization-requirements.md)

**依赖顺序**:D1 → D2 → D3 → D4 → D5/D6(可并行收口)。每个 Task 完成即跑 `npm test` + `cargo test`,不回退再进下一个。

---

## 架构决策(跨任务契约,开工前锁定)

### C1:Screen 状态机(state.ts)
```ts
export type Screen =
  | 'title' | 'newgame'          // 外层
  | 'dungeon'                    // 战斗
  | 'town'                       // 城镇(子面板: townPanel)
  | 'equipment'                  // Tab 装备面板(覆盖在 dungeon 上,保底语义: 从 dungeon 进入)
  | 'pause' | 'settings'         // Esc 菜单(覆盖在 dungeon/town 上)
  | 'death' | 'victory';         // 结算
export function setScreen(state: GameState, s: Screen): void;
```
- `state.screen` 取代 `titleOpen` / `paused` / `equipmentOpen` / `settingsOpen` 四处旗标;`townPanel` / `runeChoice` 保留为子状态。
- 覆盖语义:`equipment/pause/settings/death/victory` 由 `overlayOf(screen): Screen | null` 推导(dungeon 或 town),draw 统一先画底层再画覆盖。
- keydown 改为单个 `handleInput(state, e)`,内部 `switch (state.screen)`;通用迁移抽纯函数:
```ts
export function nextScreenOnKey(screen: Screen, key: string): Screen | null;
// Esc: dungeon/town → pause; equipment → dungeon; pause(非settings) → dungeon; settings → pause
// Tab: dungeon → equipment | equipment → dungeon
// title: '1' → newgame; '2' → settings; 'o' → (load, 事件型, 非纯函数)
```

### C2:Run 结构(单层地牢,state.ts)
```ts
export interface RunState {
  theme: Theme;
  total: number;              // 本局刷怪总数 (RUN_POOL_SIZE)
  alive: number;              // 存活(击杀时递减)
  bossSpawned: boolean;
  bossKilled: boolean;
  t0: number;                 // 进入时刻 (performance.now())
  best: Partial<Record<Difficulty, number>>; // 最佳通关 ms, 账号层
}
```
- 进入 dungeon(城镇出口 / 新局开始 / 再来一局)→ `spawnRunPool(state)`:按主题池刷 `RUN_POOL_SIZE = 24` 只。
- **删除** main.ts `monsters.length < 3` 保底重生块;战斗内不再自动补怪。
- `alive === 0 && !bossSpawned` → spawn `THEME_BOSS[theme]` + HUD 横幅。
- Boss 死亡 → `victory` 结算(时间/killsTotal/最高连击/掉落数),记 best、写 `cleared`(C3)。

### C3:解锁数据(进度解锁 C1,state.ts + difficulty.ts)
```ts
export interface Unlocks { cleared: Theme[]; best: Partial<Record<Difficulty, number>>; }
export function unlockedDifficulty(cleared: readonly Theme[], d: Difficulty): boolean;
// nightmare: cleared 含 forest; hell: desert; inferno: ruin; hardcore: inferno(即 cleared 含 ruin)+ 二次确认
```
- `T` 键主题循环**移除**(main.ts keydown 删分支)。
- 难度循环(N)一律走 `cycleDifficultyGated`:跳过未解锁档,到已解锁最高档后回普通;hardcore 命中时弹 OPT-006 确认屏(`confirmHardcore` 子状态)。

### C4:存档 v2(save.rs,基于 Wave 0 OPT-004 版本头)
```
v1(Wave0): + skill_levels / skill_points / exp
v2(Wave1): + equipped: Vec<(String slot, OwnedItem)>   // "weapon|armor|charm|ring"
           + cleared: Vec<String>                       // 主题名
           + best: Vec<(String diff, u32 ms)>
迁移: v1 → v2: equipped=[] / cleared=[] / best=[]; v0 → v1: 现有字段默认值
```

---

## Task D1:OPT-010 UI 状态机收敛

**Files**:`src/game/state.ts`(Screen/setScreen/nextScreenOnKey + 旗标替换)、`src/main.ts`(keydown 分发改 handleInput、loop 分支改 screen)、`src/render/hud.ts`(draw 按 overlayOf 组织)、新增 `tests/screen.test.ts`

**Steps**:
1. state.ts 定义 Screen 联合 + `setScreen` + `nextScreenOnKey`(纯函数,表驱动测试)。
2. main.ts:`titleOpen → screen==='title'`、`paused → screen==='pause'||'settings'`、`equipmentOpen → screen==='equipment'`、`settingsOpen → screen==='settings'` 全部迁移;keydown 拆为 `handleInput`。
3. hud.ts:`paused` 遮罩/面板绘制改由 `overlayOf` 驱动;`drawTitle` 归入 dispatch。

**Tests**(tests/screen.test.ts,新):`nextScreenOnKey` 全表(Esc/Tab/1/2/3/4 各屏迁移);`setScreen` 清子状态(townPanel/runeChoice 按屏清)。

**验收**:标题/暂停/设置/Tab 面板/城镇面板/符文三选一全部行为与迁移前一致(手测一遍);`npm test` 全绿。

---

## Task D2:OPT-011 死亡结算(B1)

**Files**:新建 `src/game/deathSettle.ts`(纯函数)、`src/main.ts`(dying 分支改)、`src/render/hud.ts`(death 屏)、`src/game/player.ts`(药水/惩罚)

**Steps**:
1. `deathSettle.ts`:
```ts
export type DeathChoice = 'town' | 'revive' | 'rerun';
export interface DeathSummary { level: number; kills: number; maxCombo: number; goldPenalty: number; }
export function deathSummary(state: GameState): DeathSummary;
export function deathGoldPenalty(gold: number, choice: DeathChoice, hardcore: boolean): number;
// soft: town → -25%, revive → -10%; hardcore: 恒 0 (清档语义), 显示"永久死亡"
```
2. main.ts:死亡不再 2s 强制 respawn → `setScreen('death')`;死亡**不再重置药水**(删 `potions={3,3}`);`revive`:药水不补 + 5s 复活无敌(新字段 `reviveInvuln`);`town`:药水补满 + 金扣 25% + `enterTown`;`rerun`:满状态重开当前主题(走 D3 spawnRunPool)。
3. 硬核:death 屏仅 [重开新局(清档)] [主菜单],原清档逻辑(gold/owned/level/skill/rune)保留在"重开"路径。

**Tests**:`deathGoldPenalty` 边界(0 金/负金/各 choice);`deathSummary` 字段正确。

**验收**:三种选择路径可达;硬核死亡 = 清档重开或主菜单;药水不再自动补满。

---

## Task D3:OPT-012 单层地牢 + 通关结算 + 再来一局

**Files**:`src/game/state.ts`(RunState)、`src/game/monster.ts`(`spawnRunPool`/`RUN_POOL_SIZE`)、`src/main.ts`(重生块删除、boss 触发改 run 状态、victory 分支)、`src/render/hud.ts`(剩余怪计数 + boss 横幅 + victory 屏)、`src-tauri/src/save.rs`(best/cleared v2)

**Steps**:
1. monster.ts:`RUN_POOL_SIZE = 24`、`spawnRunPool(state)`:按 `THEME_MONSTER_POOL[theme]` 刷 N 只(复用现有 600-1200 半径 spawn),初始化 `run.alive=N`。
2. main.ts:删除 `if (state.monsters.length < 3)` 重生块;`killMonster` 后 `run.alive--`;`alive<=0 && !bossSpawned` → 刷 `THEME_BOSS` + 横幅;`bossKilled` → `setScreen('victory')` + 记 best/cleared(写档,失败提示)。
3. victory 屏:`[1] 再来一局(同主题同难度,直接 spawnRunPool;best 更新提示)'[2] 回城`;统计:用时(ms→mm:ss)/击杀/最高连击/掉落数。
4. killMonster 移除"10 连杀召 Boss"逻辑(`bossKillTrigger` 字段删除或仅留计分)。

**Tests**:`runState 判定` 纯函数(alive 归零 → 应刷 boss;boss 死 → 应胜利);`spawnRunPool` 数量/主题正确。

**验收**:新局清 24 怪 → Boss 出现 → 击杀 → 通关结算 → 再来一局直接新一局;Boss 不再由连杀触发。

---

## Task D4:OPT-013 新局选择屏

**Files**:`src/main.ts`(标题 1 键改 setScreen('newgame')、Enter 开工)、`src/render/hud.ts`(newgame 屏)、`src/game/difficulty.ts`(gating 版循环,先于 D6 落地最小版)

**Steps**:
1. `newgame` 屏布局:左列难度(1-5 键,未解锁灰显 + 需求文案)、右列主题(←/→ 切换,未解锁灰显)、Enter 开始、Esc 回标题。
2. `startRun(state, theme, difficulty)`:设难度/主题 → `spawnRunPool` → `setScreen('dungeon')`;替代旧 `startFreshRun`。
3. 标题 `[1] 新游戏` 从此进选择屏(不再直接开打)。

**Tests**:选择屏迁移键(`newgame` 下 1-5/←→/Enter/Esc → 预期 screen/状态)。

**验收**:新游戏必经选择屏;未解锁难度/主题不可开始;Esc 回标题不丢状态。

---

## Task D5:OPT-014 装备穿戴模型(A1,最大任务)

**Files**:`src/game/equipment.ts`(核心重构)、`src/game/state.ts`(player.equipped)、`src/render/hud.ts`(面板双栏/滚动/对比)、`src/game/town.ts`(卖/重铸仅背包)、`src-tauri/src/save.rs`(equipped v2)、`tests/equipment.test.ts`(扩)

**Steps**:
1. `type EquipType = 'weapon' | 'armor' | 'charm' | 'ring';` `Equipment.type: EquipType`;`randomEquipment` 滚类型;`EQUIP_SLOTS: readonly EquipType[]`。
2. state:`player.equipped: Partial<Record<EquipType, Equipment>>`;`aggregateCombat(equippedValues)`;`recomputeCombat` 只聚合穿戴。
3. `equipItem(state, eq)`:从背包移到槽(旧槽件回背包);`unequipItem(state, eq)`:槽 → 背包;`BACKPACK_CAP = 20`:`pickupLoot` 满 → toast"背包已满" + 装备留地(不消失)。
4. Tab 面板:左 4 槽(名字/词条/战力),右背包列表(可滚动:滚轮 / PageUp/PageDown),选中背包件 → 同类型槽对比行(正绿/负红,复用 `describeAffix`);`Enter/双击` 装备。
5. 城镇卖/重铸列表只列背包(装备中的不可直接卖/重铸,先卸下)。
6. save v2:`equipped: Vec<(slot, OwnedItem)>`;迁移:`owned 全入背包,equipped 空`。

**Tests**(equipment.test.ts 扩):equip 生效(combat 变)/unequip 恢复;同槽换装旧件回背包;cap 满拒绝拾取;compareDelta 正负;aggregate 忽略背包;v2 迁移往返(cargo)。

**验收**:拾取不再直接加战斗属性;穿槽生效;背包满提示;对比行正确;卖/重铸不影响穿戴。

---

## Task D6:OPT-015 进度解锁(C1)

**Files**:`src/game/difficulty.ts`(`unlockedDifficulty`/`cycleDifficultyGated`)、`src/game/state.ts`(Unlocks)、`src/main.ts`(T 键移除、硬核确认挂接)、`src-tauri/src/save.rs`(cleared/best v2)

**Steps**:
1. `unlockedDifficulty(cleared, d)`:nightmare←forest、hell←desert、inferno←ruin、hardcore←(ruin cleared)+ 确认。
2. `cycleDifficultyGated`:跳过未解锁;更换难度时若经过 hardcore 弹 OPT-006 确认(复用 Wave 0 的二段确认)。
3. 标题设置与城镇祭坛的 N 均改走 gated 循环;战斗内 N(OPT-008 Wave0 已移除)保持移除。
4. `T` 键分支从 keydown 删除。
5. victory( D3)写 `cleared.push(theme)` + best;新档默认 cleared=[],普通+森林可用。

**Tests**(difficulty.test.ts 扩):门槛表驱动(空 cleared / 逐主题通关 / hardcore 未通关炼狱禁用);gated 循环跳过顺序;确认弹窗状态迁移。

**验收**:新档仅普通+森林;通关森林 → 噩梦+沙漠解锁;hardcore 通关炼狱前置灰;T 键无效果。

---

## 测试与验收汇总

| 门 | 命令/动作 | 期望 |
|---|---|---|
| 单测 | `npm test`(每 Task 后) | 现有 79 例 + screen/death/run/equipment/difficulty 新增全绿 |
| Rust | `cargo test`(D3/D5 后) | 5 例 + v2 往返/迁移用例 |
| 冒烟 1 | 新游戏 → 选择屏 → 森林普通 → 清图 → Boss → 通关 → 再来一局 | 全链路可达,无崩溃(hb 心跳正常) |
| 冒烟 2 | 战斗中死亡 → 回城/复活/重开 三路径 | 金扣 25%/10%/0,药水语义正确 |
| 冒烟 3 | 拾取装备 → Tab 对比 → 装备/卸下;背包 20 满时拾取 | 对比行绿红;满提示;战斗属性随穿戴变 |
| 冒烟 4 | 存盘 → 杀进程 → 读档 | 技能/装备/穿戴/解锁/最佳时间完整还原 |

## 风险

- D5(装备模型)触碰存档与面板最大,若 1.5 天内未收口:先落"穿戴生效 + cap",面板双栏/滚动拆到 D5b 补交。
- D3 清图判定依赖 `killMonster` 统一出口(已有),燃烧/击退击杀均走该出口,无重复击杀风险。
- 状态机迁移期间避免同时改玩法逻辑(只搬旗标,不动分支内行为),防止行为漂移难定位。