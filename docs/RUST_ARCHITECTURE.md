# Voidbound Rust 端架构规划

> 版本：v1.1 配套  
> 日期：2026-08-08  
> 状态：M1 启动规范

---

## 1. 模块分层架构

### 1.1 完整模块树

```
src-tauri/src/
├── main.rs                    voidbound::run() 入口
├── lib.rs                     Tauri builder + 顶层协调
├── prelude.rs                 公共类型 re-export
│
├── game/                      游戏逻辑层(纯 Rust,无 IO)
│   ├── mod.rs                  re-export + 子模块
│   ├── world.rs                GameWorld(全部实体的真源)
│   ├── tick.rs                 fixed timestep 主循环
│   ├── entity/                 实体定义
│   │   ├── mod.rs
│   │   ├── id.rs               typed EntityId(u64)
│   │   ├── position.rs         Position { x, y }
│   │   ├── velocity.rs         Velocity { x, y }
│   │   ├── stats.rs            Stats { hp, mp, atk, def, ... }
│   │   ├── player.rs           Player
│   │   ├── monster.rs          Monster
│   │   ├── projectile.rs       Projectile(火球等)
│   │   └── component.rs        ECS 组件 trait + 简易 component store
│   ├── skill/                  技能系统
│   │   ├── mod.rs
│   │   ├── skill.rs            Skill 数据
│   │   ├── cooldown.rs         冷却管理
│   │   └── rune.rs             符文变异(v1.1 D-01)
│   ├── item/                   装备系统
│   │   ├── mod.rs
│   │   ├── affix.rs            词条
│   │   ├── rarity.rs           稀有度
│   │   └── set.rs              套装效果
│   ├── procgen/                地图生成
│   │   ├── mod.rs
│   │   └── wfc.rs              fast-wfc v3 wrapper(D-23)
│   └── save/                   存档(v1.1 D-03 难度字段)
│       ├── mod.rs
│       ├── character.rs        角色存档
│       ├── account.rs          账号数据
│       └── io.rs               bincode 文件读写
│
├── combat/                    战斗公式(D-04 伤害公式 1.5x 暴击)
│   ├── mod.rs
│   ├── damage.rs               calc_damage()
│   ├── resistance.rs           抗性后减成
│   ├── crit.rs                 暴击判定
│   └── status.rs               Buff / Debuff / DOT
│
├── physics/                   物理
│   ├── mod.rs
│   ├── aabb.rs                 自实现 AABB 碰撞(M1 不引入 rapier)
│   └── broadphase.rs           简单空间哈希
│
├── ipc/                       Tauri 通信层
│   ├── mod.rs
│   ├── command.rs              Tauri command 注册
│   ├── shared_memory.rs        ringbuf 共享环形缓冲
│   ├── frame.rs                FrameSnapshot 结构
│   └── input.rs                InputEvent 结构
│
├── render/                    渲染数据层(不动 WebGL,只发数据)
│   ├── mod.rs
│   ├── atlas.rs                图集加载(Rust 端 .bin 解析)
│   └── palette.rs              4 主题调色板
│
├── web/                       Web 端交互层(可选,如果走 IPC)
│   └── mod.rs
│
└── error.rs                   项目级 Error enum(thiserror)
```

### 1.2 分层原则

```
          ┌─────────────────────────┐
          │  ipc/(Tauri 边界)        │
          └────────────┬────────────┘
                       │ 输入/输出
          ┌────────────┴────────────┐
          │  tick(主循环 + 帧调度)   │
          └────────────┬────────────┘
                       │
       ┌───────────────┼───────────────┐
       ▼               ▼               ▼
   ┌────────┐   ┌──────────┐   ┌──────────┐
   │ game/  │   │ physics/ │   │ combat/  │
   │  逻辑  │   │  物理   │   │  公式   │
   └────┬───┘   └─────┬────┘   └─────┬────┘
        │             │              │
        └─────────────┴──────────────┘
                      │
            ┌─────────┴─────────┐
            ▼                   ▼
        ┌──────┐            ┌──────┐
        │save/ │            │render/│
        │ 存档 │            │ 数据 │
        └──────┘            └──────┘
```

- **底层**:纯函数 / 数据结构,无 IO,无锁
- **中层**:组合多个底层,可能有状态机
- **高层**:tick 主循环调度一切
- **边界**:ipc 处理 Tauri 通信,save 处理文件 IO

---

## 2. 关键设计模式决策

| 问题 | 推荐方案 | 理由 |
|------|---------|------|
| **实体系统** | 自实现 typed ID + 集中 GameWorld | 比 ECS 简单,比继承灵活,M1 够用 |
| **状态共享** | `Arc<RwLock<GameWorld>>` + 共享 ringbuf | 读多写少用 RwLock,跨线程用 ringbuf |
| **资源管理** | `OnceCell<Resource>` + handle | Tauri command 通过 handle 访问单例 |
| **错误处理** | `Result<T, VoidboundError>` + thiserror | 全局 enum,From impl 包装 io/serde/bincode 错误 |
| **并发模型** | std::thread + crossbeam_channel(主循环) | 比 tokio 简单,M1 够用,不需要 async |
| **序列化** | bincode(默认)+ serde_json(导出) | bincode 紧凑,JSON 用于跨平台导入 |
| **模块通信** | Tauri command(异步事件)+ 共享 ringbuf(高频帧) | 混合 IPC(D-02) |
| **测试策略** | 单元测试就近(`#[cfg(test)] mod tests`)+ 集成测试 `tests/` | 符合 Rust 惯例 |
| **日志** | `tracing` crate(替代 env_logger) | span 友好,后期性能分析有用 |

---

## 3. 数据流图

### 3.1 整体数据流(D-02 混合模式)

```
                       Web 端 (TypeScript + WebGL2)
                       ────────────────────────────
   用户输入 WASD/QWER/鼠标
       │
       ▼
   input.ts 捕获
       │
       ▼
   写入 Web → Rust InputEvent queue(lock-free ringbuf, 容量256)
       │
       │  ┌─────────────────────────────────────────────┐
       │  │  Tauri 进程边界                               │
       │  └─────────────────────────────────────────────┘
       ▼
   ┌──────────────────────────────────────────────────────────┐
   │  Rust 端(60Hz fixed timestep)                            │
   │                                                          │
   │   ┌─────────────────────────────────────────────────────┐ │
   │   │  tick(主循环线程)                                  │ │
   │   │                                                     │ │
   │   │  读取 InputEvent queue                             │ │
   │   │       │                                            │ │
   │   │       ▼                                            │ │
   │   │  ┌─────────────────────────┐                       │ │
   │   │  │ Phase 1: INPUT          │ 处理输入               │ │
   │   │  └────────────┬────────────┘                       │ │
   │   │               ▼                                   │ │
   │   │  ┌─────────────────────────┐                       │ │
   │   │  │ Phase 2: PHYSICS       │ AABB 碰撞 / 移动        │ │
   │   │  └────────────┬────────────┘                       │ │
   │   │               ▼                                   │ │
   │   │  ┌─────────────────────────┐                       │ │
   │   │  │ Phase 3: COMBAT        │ 伤害公式 (D-04)        │ │
   │   │  └────────────┬────────────┘                       │ │
   │   │               ▼                                   │ │
   │   │  ┌─────────────────────────┐                       │ │
   │   │  │ Phase 4: AI            │ 怪物寻路 / Boss 阶段  │ │
   │   │  └────────────┬────────────┘                       │ │
   │   │               ▼                                   │ │
   │   │  ┌─────────────────────────┐                       │ │
   │   │  │ Phase 5: SKILL/STATUS  │ 技能冷却 / DOT       │ │
   │   │  └────────────┬────────────┘                       │ │
   │   │               ▼                                   │ │
   │   │  ┌─────────────────────────┐                       │ │
   │   │  │ Phase 6: WORLD STATE   │ 写回 GameWorld        │ │
   │   │  └────────────┬────────────┘                       │ │
   │   │               ▼                                   │ │
   │   │  生成 FrameSnapshot                                  │ │
   │   │       │                                            │ │
   │   │       ▼                                            │ │
   │   │  写入 Rust → Web FrameSnapshot queue(双缓冲)     │ │
   │   └─────────────────────────────────────────────────────┘ │
   │                                                          │
   └──────────────────────────────────────────────────────────┘
       │
       ▼
   Web 端 render 读取 FrameSnapshot queue
       │
       ▼
   WebGL2 绘制下一帧(60Hz)
       │
       ▼
   用户看到画面
```

### 3.2 Tauri Command 边界

```
Web (TS)                          Rust
────────                          ────
invoke('new_game', args)   →     ipc::command::new_game()
                                     ↓
                                  game::save::character::create()
                                     ↓
                                  返回 CharacterId (UUID)
                                     ↓
                                  web 拿到 ID 后进入游戏

invoke('save_game', state)  →     ipc::command::save_game()
                                     ↓
                                  game::save::io::write_to_disk()
                                     ↓
                                  bincode 序列化到文件
```

异步事件用 command,高频帧数据用共享 ringbuf。

---

## 4. 核心数据结构(伪代码)

```rust
// === game/world.rs ===
pub struct GameWorld {
    pub tick: u64,                     // 当前 tick 数
    pub time: f32,                      // 真实经过秒数
    pub entities: HashMap<EntityId, Entity>,
    pub players: HashMap<EntityId, Player>,
    pub monsters: HashMap<EntityId, Monster>,
    pub projectiles: HashMap<EntityId, Projectile>,
    pub rng: SmallRng,                 // 确定性 RNG(seed 可记录)
}

impl GameWorld {
    pub fn new() -> Self;
    pub fn tick(&mut self, dt: f32);   // 主循环调用
    pub fn spawn_player(&mut self, class: Class) -> EntityId;
    pub fn spawn_monster(&mut self, id: MonsterType, pos: Position) -> EntityId;
}

// === game/entity/id.rs ===
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct EntityId(pub u64);  // newtype wrapper

// === game/entity/position.rs ===
#[derive(Debug, Clone, Copy, Default)]
pub struct Position { pub x: f32, pub y: f32 }

#[derive(Debug, Clone, Copy, Default)]
pub struct Velocity { pub x: f32, pub y: f32 }

// === game/entity/stats.rs ===
#[derive(Debug, Clone, Copy)]
pub struct Stats {
    pub hp: i32,
    pub mp: i32,
    pub attack: i32,
    pub defense: i32,
    pub strength: i32,
    pub dexterity: i32,
    pub vitality: i32,
    pub intelligence: i32,
    pub faith: i32,
    pub charisma: i32,
}

// === game/entity/player.rs ===
#[derive(Debug, Clone)]
pub struct Player {
    pub id: EntityId,
    pub position: Position,
    pub velocity: Velocity,
    pub stats: Stats,
    pub class: Class,
    pub level: u32,
    pub exp: u32,
    pub skills: [Option<SkillInstance>; 4],  // Q W E R
    pub passives: Vec<SkillInstance>,
    pub gold: u32,
    pub inventory: Vec<Item>,
}

// === game/entity/projectile.rs ===
#[derive(Debug, Clone)]
pub struct Projectile {
    pub id: EntityId,
    pub position: Position,
    pub velocity: Velocity,
    pub damage: DamageFormula,
    pub owner: EntityId,
    pub lifetime: f32,  // 剩余生存时间
    pub pierce: u8,     // 穿透次数
    pub element: Element,
}

// === game/entity/monster.rs ===
#[derive(Debug, Clone)]
pub struct Monster {
    pub id: EntityId,
    pub position: Position,
    pub velocity: Velocity,
    pub stats: Stats,
    pub monster_type: MonsterType,  // 引用 data/monsters/*.yaml
    pub affixes: Vec<MonsterAffix>, // 难度系统(D-03)词条
    pub ai_state: AiState,           // 追击 / 攻击 / 逃跑
    pub aggro_target: Option<EntityId>,
}

// === combat/damage.rs ===
#[derive(Debug, Clone, Copy)]
pub struct DamageFormula {
    pub base: i32,
    pub attr_bonus: f32,    // 1.0 + Str/100 + ...
    pub crit_rate: f32,
    pub crit_damage: f32,
    pub pen_res: i32,       // 减抗
}

pub fn calc_damage(
    attacker: &Stats,
    defender: &Stats,
    formula: &DamageFormula,
    rng: &mut SmallRng,
) -> DamageResult {
    // D-04: 暴击 1.5x, 抗性 75% 上限, 易伤 50% 上限
    let crit = if rng.gen::<f32>() < formula.crit_rate {
        1.5 * (1.0 + formula.crit_damage / 100.0)
    } else { 1.0 };

    let eff_res = (defender.resistance - formula.pen_res).clamp(-100, 75);
    let dmg_reduct = 1.0 - eff_res as f32 / 100.0;

    let final_damage = formula.base as f32
        * formula.attr_bonus
        * crit
        * dmg_reduct.max(0.0);

    DamageResult { raw: formula.base, final: final_damage as i32, is_crit: crit > 1.0 }
}

// === ipc/frame.rs ===
#[derive(Debug, Clone)]
pub struct FrameSnapshot {
    pub tick: u64,
    pub timestamp_ms: u32,
    pub entities: Vec<EntitySnapshot>,
    pub events: Vec<GameEvent>,  // 粒子事件 / 命中事件 / SFX 触发
}

#[derive(Debug, Clone)]
pub struct EntitySnapshot {
    pub id: EntityId,
    pub kind: EntityKind,
    pub position: Position,
    pub hp_ratio: f32,       // 0.0-1.0 用于血条
    pub animation: AnimationState,
}

// === ipc/input.rs ===
#[derive(Debug, Clone)]
pub enum InputEvent {
    Move { dx: f32, dy: f32 },
    SkillCast { slot: u8 },  // 0=Q, 1=W, 2=E, 3=R
    Dodge,
    UsePotion { slot: u8 },  // 0-3
    Pickup { item_id: EntityId },
}

// === game/skill/skill.rs ===
#[derive(Debug, Clone)]
pub struct Skill {
    pub id: SkillId,
    pub base_damage: i32,
    pub cooldown: f32,
    pub range: f32,
    pub cast_time: f32,
    pub projectile_speed: f32,
    pub element: Element,
    pub skill_tree: SkillTreeBranch,  // 火 / 冰 / 电 / ...
}

#[derive(Debug, Clone)]
pub struct SkillInstance {
    pub skill: Skill,
    pub level: u32,           // 1-20
    pub rune: Option<Rune>,    // v1.1 D-01 双轨符文
}

#[derive(Debug, Clone)]
pub enum Rune {
    Ice,       // 火球 → 寒冰之球
    Lightning, // 火球 → 闪电之球
    Shadow,    // 火球 → 暗影之球
    Lava,      // 火球 → 熔岩之球
}

// === error.rs ===
#[derive(Debug, thiserror::Error)]
pub enum VoidboundError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Bincode: {0}")]
    Bincode(#[from] bincode::Error),
    #[error("Serde JSON: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("Atlas parse: {0}")]
    Atlas(#[from] crate::render::atlas::AtlasError),
    #[error("Tauri: {0}")]
    Tauri(#[from] tauri::Error),
    #[error("Invalid save: {0}")]
    InvalidSave(String),
    #[error("Game logic: {0}")]
    Game(String),
}

pub type Result<T> = std::result::Result<T, VoidboundError>;
```

---

## 5. 实施优先级(M1 14 天)

### Day 1-2:基础设施
```
最低文件清单:
  src-tauri/Cargo.toml          ✅ 已写
  src-tauri/src/main.rs         ✅ 已写
  src-tauri/src/lib.rs          ✅ 已写
  src-tauri/src/prelude.rs      [新增] re-export 公共类型
  src-tauri/src/error.rs        [新增] VoidboundError

  src-tauri/build.rs            [新增] tauri-build 标准
  src-tauri/tauri.conf.json     [新增] Tauri 配置
  src-tauri/icons/              [新增] 应用图标

  src-tauri/tauri.conf.json {
    "build": {
      "frontendDist": "../src",
      "devUrl": "http://localhost:1420"
    }
  }

验收:cargo build 成功(首次 5-10 分钟装依赖)
```

### Day 3-4:基础渲染 + 移动
```
新增:
  src-tauri/src/game/entity/id.rs
  src-tauri/src/game/entity/position.rs
  src-tauri/src/game/entity/velocity.rs
  src-tauri/src/game/entity/mod.rs
  src-tauri/src/game/world.rs            #[cfg(test)] 加基础测试
  src-tauri/src/game/tick.rs             #[cfg(test)] 加 fixed timestep 测试

Web 端:
  src/index.html
  src/main.ts                            # 创建 WebGL2 上下文
  src/render/webgl.ts
  src/render/camera.ts
  src/game/input.ts                      # WASD 输入
  src/game/loop.ts                       # rAF 循环
```

### Day 5-7:整合
```
新增:
  src-tauri/src/ipc/shared_memory.rs    # ringbuf 创建/管理
  src-tauri/src/ipc/input.rs
  src-tauri/src/ipc/frame.rs

Web 端:
  src/ipc/rust_bridge.ts                # 与 Rust 通信

验收:玩家在黑色背景上 WASD 流畅移动,60 FPS
```

### Day 8-9:主循环 + IPC(D-02 关键决策点)
```
新增:
  src-tauri/src/ipc/command.rs          # Tauri command 注册
  src-tauri/src/ipc/mod.rs

  src-tauri/src/game/tick.rs            # 完整 6 phase tick

验收:共享环形缓冲双向通信工作,Rust 60Hz / Web 60Hz 同步
```

### Day 10-11:伤害公式 + 战斗
```
新增:
  src-tauri/src/combat/damage.rs        # D-04 完整公式
  src-tauri/src/combat/resistance.rs
  src-tauri/src/combat/crit.rs
  src-tauri/src/combat/status.rs
  src-tauri/src/combat/mod.rs

测试:
  src-tauri/src/combat/damage.rs 内:
    - test_crit_with_default_1_5x
    - test_resistance_capped_at_75
    - test_pen_res_then_dmg_reduct
    - test_vulnerable_max_50

验收:cargo test 伤害公式 100% 覆盖
```

### Day 12-14:基础怪物 + M1 验收
```
新增:
  src-tauri/src/game/entity/monster.rs
  src-tauri/src/game/entity/projectile.rs
  src-tauri/src/game/entity/stats.rs
  src-tauri/src/game/ai/mod.rs            # 简单追击 AI
  src-tauri/src/physics/aabb.rs           # AABB 碰撞
  src-tauri/src/physics/broadphase.rs
  src-tauri/src/physics/mod.rs

  src-tauri/src/game/skill/skill.rs      # 火球技能定义
  src-tauri/src/game/skill/mod.rs

数据:
  src-tauri/data/monsters/zombie_infant.yaml  # 怪物原型

验收:Q 键发射火球,击中怪物扣血,60 FPS 稳定
```

---

## 6. 关键 Trade-off 列表

| 决策 | 选项 A | 选项 B | 推荐 |
|------|--------|--------|------|
| **实体系统** | ECS (hecs / bevy_ecs) | 自实现 typed ID + HashMap | B(M1 简单可控,M3 再评估) |
| **物理引擎** | rapier(Rust 移植) | 自实现 AABB | B(M1 简单,后期可换) |
| **RNG** | rand::rngs::SmallRng | rand::rngs::StdRng | A(确定性,可重放) |
| **存档版本** | bincode + magic + version + CRC | bincode 裸 | A(防损坏,v1.1 D-25 必备) |
| **异步运行时** | tokio | std::thread | B(M1 不需要 async) |
| **日志** | tracing | env_logger | A(span 友好) |
| **共享状态** | Arc<RwLock<GameWorld>> | 全局静态 | A(显式所有权) |
| **Tauri command** | 自动注册(宏) | 手写注册 | A(`tauri::generate_handler!`) |
| **错误转换** | thiserror(派生) | 手写 Display | A(代码最少) |

---

## 7. 关键文件清单(M1 完成后)

```
src-tauri/src/
├── main.rs                         入口
├── lib.rs                          Tauri setup + 模块组装
├── prelude.rs                      pub use game::*, combat::*, ...
├── error.rs                        VoidboundError + Result
│
├── game/                           ~1500 行
│   ├── world.rs                    GameWorld(主数据结构)
│   ├── tick.rs                     主循环
│   ├── entity/{id, position, velocity, stats, player, monster, projectile}.rs
│   ├── skill/{skill, cooldown, rune}.rs
│   ├── item/{affix, rarity, set}.rs
│   ├── procgen/wfc.rs
│   └── save/{character, account, io}.rs
│
├── combat/                         ~400 行
│   ├── damage.rs                   D-04 公式
│   ├── resistance.rs
│   ├── crit.rs
│   └── status.rs
│
├── physics/                        ~200 行
│   ├── aabb.rs
│   └── broadphase.rs
│
├── ipc/                            ~300 行
│   ├── command.rs
│   ├── shared_memory.rs
│   ├── frame.rs
│   └── input.rs
│
├── render/                         ~200 行
│   ├── atlas.rs
│   └── palette.rs
│
└── data/                           YAML 数据
    ├── classes/{barbarian, paladin, sorceress, necromancer, ranger, assassin}.yaml
    ├── monsters/{forest, desert, frozen, void}/*.yaml
    ├── skills/*.yaml
    └── items/*.yaml

总计:~2600 行 Rust 代码(M1 完成时预估)
测试覆盖:核心数值公式 100% / 状态机 100% / 其他 80%
```

---

## 8. 命名约定

| 类型 | 风格 | 示例 |
|------|------|------|
| 模块 | snake_case | `game::entity` |
| 类型 | PascalCase | `Player`, `EntityId` |
| 函数 | snake_case | `calc_damage` |
| 常量 | SCREAMING_SNAKE | `MAX_LEVEL` |
| 变量 | snake_case | `player_hp` |
| 枚举值 | PascalCase | `Element::Fire` |
| 类型参数 | 单大写字母 | `T`, `E`, `K`, `V` |

---

## 9. 测试策略

### 单元测试(就近)

```rust
// 在 combat/damage.rs 末尾
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crit_default_is_1_5x() {
        let formula = DamageFormula { crit_rate: 1.0, ..default() };
        let rng = ...;
        let result = calc_damage(&atk, &def, &formula, rng);
        assert!(result.is_crit);
        assert_eq!(result.final, formula.base * 1.5) as i32);
    }

    #[test]
    fn resistance_capped_at_75() {
        let def = Stats { resistance: 200, ... };
        let formula = DamageFormula { pen_res: 0, ..default() };
        let result = calc_damage(&atk, &def, &formula, rng);
        // 抗性被 clamp 到 75,伤害减免 0.25
        assert_eq!(result.raw * 0.25, result.final);
    }

    // ...
}
```

### 集成测试(顶层 tests/)

```
src-tauri/tests/
├── combat_integration.rs   # 完整战斗循环
├── save_roundtrip.rs       # 存档读写
└── ipc_bridge.rs           # IPC mock
```

---

## 10. 下一步

1. 把 `RUST_ARCHITECTURE.md` 加进 README 文档导航
2. Day 1-2 启动:cd src-tauri && cargo build(装依赖)
3. 按"实施优先级"逐步填充文件
4. 每完成一个 phase 跑一次 `cargo test`

---

## 11. 参考

- v1.1 决策:[CHANGELOG-v1.1.md](CHANGELOG-v1.1.md)
- 完整设计:[DESIGN.md](DESIGN.md)
- M1 任务:[M1_CHECKLIST.md](M1_CHECKLIST.md)
- Day 0 准备:[M1_DAY0_README.md](M1_DAY0_README.md)
- 代码规范:[CODE_REVIEW.md](CODE_REVIEW.md)