# Voidbound M1 启动 Checklist

> 版本：v1.1 配套  
> 日期：2026-08-08  
> 用途：M1 (MVP) 第 1 周的执行清单,逐项打勾

---

## 0. M1 目标回顾

```
MVP 验收(M1 里程碑):
  [ ] Tauri + WebGL2 项目能成功编译运行
  [ ] 玩家 WASD 移动可响应
  [ ] 一个简单技能(Q 键)能发射火球
  [ ] 火球击中怪物造成伤害
  [ ] 60 FPS 稳定运行

第 1 周目标:
  [ ] 玩家在黑色背景上能流畅 WASD 移动
```

---

## 1. M1 启动前(Day 0)必做

### 1.1 资源准备(3.5 小时)

- [ ] 下载 [Kenney Tiny Battle](https://kenney.nl/assets/tiny-battle)  → `assets/ai-gen/downloads/`
- [ ] 下载 [Kenney UI Pack](https://kenney.nl/assets/ui-pack) → 同上
- [ ] 安装 Aseprite(LibreSprite 备用)
- [ ] 按 [`SPRITE_ASSEMBLY_SOP.md`](../assets/ai-gen/SPRITE_ASSEMBLY_SOP.md) 拼装 6 职业
- [ ] 导出到 `assets/atlas/input/characters/`
- [ ] 运行 `python pack_atlas.py characters --rust-bin --rust-loader`
- [ ] 验证图集输出

### 1.2 环境准备(1 小时)

- [ ] 安装 Rust(`rustup`)
- [ ] 安装 Node.js 20 LTS
- [ ] 安装 Tauri CLI:`cargo install tauri-cli --version "^2.1"`
- [ ] 安装 webgl2 调试工具(如 Spector.js)
- [ ] 安装 git + 配置

### 1.3 决策敲定(必读)

- [ ] 阅读 [`CHANGELOG-v1.1.md`](CHANGELOG-v1.1.md) §5 "M1 启动最小决策集"
- [x] 敲定以下 5 项(v1.1 全部已敲定,可开工):
  - [x] D-02 主循环架构 ✅(混合模式)
  - [x] D-04 伤害公式 ✅(暴击 1.5x / 抗性 75% / 易伤 50%)
  - [x] D-13 Tauri 版本 ✅(锁 2.2 先行版)
  - [x] D-23 WFC 库 ✅(fast-wfc v3 默认)
  - [x] D-15 粒子策略 ✅(MVP 直上 GPU instanced)

---

## 2. Day 1-2:基础设施

### 2.1 项目初始化

- [ ] 初始化 Tauri 项目:`cargo tauri init` 或 `npm create tauri-app`
- [ ] 创建目录结构(参考 [README § §](../../README.md) 项目结构):
  ```
  voidbound/
  ├── src-tauri/
  │   ├── src/
  │   │   ├── main.rs
  │   │   └── game/
  │   │       ├── mod.rs
  │   │       ├── entity.rs       # 实体定义
  │   │       ├── combat.rs       # 战斗逻辑
  │   │       └── procgen.rs      # WFC(留空)
  │   └── save/
  ├── src/
  │   ├── index.html
  │   ├── main.ts
  │   ├── render/
  │   │   ├── webgl.ts
  │   │   └── atlas.ts            # 图集加载
  │   └── game/
  │       ├── input.ts
  │       └── loop.ts
  └── assets/
      └── atlas/
          ├── input/characters/   ← 已放好 mock sprite
          └── output/             ← pack_atlas.py 输出
  ```

### 2.2 配置 `Cargo.toml`

```toml
[dependencies]
tauri = { version = "2.1", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
glam = "0.29"
ringbuf = "0.4"
parking_lot = "0.12"

# 开发期:
[dev-dependencies]
```

- [ ] 添加 `tauri = "2.2"` 依赖(v1.1 D-13 已确认)
- [ ] 添加 `serde / serde_json / glam / ringbuf / parking_lot`
- [ ] `cargo build` 通过(空 main.rs)

### 2.3 配置 `package.json`

- [ ] 初始化:`npm init -y`
- [ ] 安装 TypeScript:`npm install -D typescript vite`
- [ ] 配置 `tsconfig.json`(strict mode)
- [ ] `npm run dev` 启动

### 2.4 WebGL2 上下文

- [ ] 在 `src/render/webgl.ts` 创建 WebGL2 上下文
- [ ] 初始化画布
- [ ] 简单的 clear color(黑色)

### Day 1-2 验收

- [ ] `cargo build` 成功
- [ ] `npm run dev` 启动
- [ ] Tauri 窗口显示,WebGL2 上下文创建无错
- [ ] Console 无错误

---

## 3. Day 3-4:基础渲染 + 移动

### 3.1 渲染红色方块

- [ ] `src/render/webgl.ts` 写顶点/片段 shader(简单红色)
- [ ] 创建 VBO + VAO
- [ ] `src/game/loop.ts` 写游戏循环:
  ```
  requestAnimationFrame(() => {
    update();   // 更新逻辑
    render();   // 渲染
    requestAnimationFrame(...);
  });
  ```
- [ ] 在屏幕中央渲染 32×32 红色方块

### 3.2 WASD 移动

- [ ] `src/game/input.ts` 捕获 WASD keydown/keyup
- [ ] 状态:`keys = { w: false, a: false, s: false, d: false }`
- [ ] 八方向移动(斜向归一化):
  ```
  let dx = 0, dy = 0;
  if (keys.a) dx -= 1;
  if (keys.d) dx += 1;
  if (keys.w) dy -= 1;
  if (keys.s) dy += 1;
  const len = Math.sqrt(dx*dx + dy*dy);
  if (len > 0) { dx /= len; dy /= len; }
  player.x += dx * player.speed * dt;
  player.y += dy * player.speed * dt;
  ```

### 3.3 摄像机跟随

- [ ] 摄像机 = 玩家位置 + offset(屏幕中心)
- [ ] `gl.viewport()` + `gl.uniform2f(u_offset, ...)`
- [ ] 验证:玩家移动时屏幕跟随

### Day 3-4 验收

- [ ] 红色方块在屏幕中央
- [ ] WASD 移动流畅(感觉不到延迟)
- [ ] 60 FPS
- [ ] 斜向移动不会"超速"

---

## 4. Day 5-7:集成验证 + 第 1 周 commit

### 4.1 性能基线

- [ ] 在 HUD 显示 FPS(`requestAnimationFrame` 计数)
- [ ] 验证 ≥ 55 FPS(给 5 FPS 余量)
- [ ] 写 `docs/M1_PROGRESS.md`(周报)

### 4.2 图集加载验证

- [ ] `src/render/atlas.ts` 加载 `characters.png` + `.json`
- [ ] Web 端用图集渲染玩家(替代纯红色方块)
- [ ] 验证:看到 6 职业中的"野蛮人"(染色版)

### 4.3 Git 提交

- [ ] commit:`feat: M1 Day 1-7 基础架构`
- [ ] commit:`feat: M1 玩家 WASD 移动`
- [ ] commit:`chore: 图集打包 pipeline`
- [ ] 推送远程

### Day 5-7 验收

- [ ] 第 1 周里程碑 ✅
- [ ] 玩家在黑色背景上能流畅 WASD 移动
- [ ] 看到染色后的野蛮人 sprite
- [ ] 60 FPS 稳定

---

## 5. Day 8-9:技能系统 + 主循环架构决策

> ⚠️ 这是 v1.1 D-02 关键决策点!

### 5.1 主循环架构(混合模式 D-02)

- [ ] Rust 端写 60Hz fixed timestep 物理 tick
- [ ] Web 端写 60Hz rAF 渲染 tick
- [ ] 实现共享环形缓冲:
  ```
  Rust 端:
    use ringbuf::HeapRb;
    let input_q = HeapRb::<InputEvent>::new(256);
    let snapshot_q = HeapRb::<FrameSnapshot>::new(2);  // 双缓冲
  ```
- [ ] Web 端用 SharedArrayBuffer + Atomics(如果支持),或 Tauri IPC channel
- [ ] 验证:两端时钟同步

### 5.2 技能数据结构

```rust
// Rust 端
struct Skill {
    id: String,
    damage: f32,
    cooldown: f32,
    range: f32,
    cast_time: f32,
    projectile_speed: f32,
    projectile_lifetime: f32,
}
```

- [ ] 定义 Skill / Projectile / Entity 数据结构
- [ ] 序列化为 IPC 协议
- [ ] Web 端类型定义一致

### 5.3 火球技能

- [ ] Q 键触发 → 创建 Projectile
- [ ] 火球向鼠标方向飞行
- [ ] 生命周期 2 秒
- [ ] Rust 端计算位置 → 通过 snapshot 发到 Web
- [ ] Web 端渲染火球精灵

### Day 8-9 验收

- [ ] 共享环形缓冲双向通信
- [ ] Q 键释放火球
- [ ] 火球飞行 + 生命周期

---

## 6. Day 10-11:碰撞 + 伤害

### 6.1 AABB 碰撞

```rust
fn aabb_collide(a: &Entity, b: &Entity) -> bool {
    let dx = (a.x - b.x).abs();
    let dy = (a.y - b.y).abs();
    dx < (a.width + b.width) / 2.0 && dy < (a.height + b.height) / 2.0
}
```

- [ ] 火球与怪物碰撞检测
- [ ] 命中后:火球消失 + 怪物扣血
- [ ] 单元测试:`cargo test` 通过

### 6.2 伤害公式(D-04)

```rust
fn calc_damage(attacker: &Entity, defender: &Entity) -> f32 {
    let base_dmg = attacker.damage;
    let attr_mult = 1.0 + attacker.strength / 100.0;
    let crit_mult = if rand::random::<f32>() < attacker.crit_rate {
        2.0 * (1.0 + attacker.crit_dmg / 100.0)
    } else { 1.0 };
    let effective_res = (defender.resistance - attacker.pen_res).clamp(-100, 75);
    let dmg_reduct = 1.0 - effective_res / 100.0;
    
    base_dmg * attr_mult * crit_mult * dmg_reduct.max(0.0)
}
```

- [ ] 实现完整伤害公式
- [ ] 单元测试(暴击 / 抗性 / 减抗)

### Day 10-11 验收

- [ ] 火球命中怪物扣血
- [ ] 怪物 HP 归零死亡
- [ ] 伤害公式 100% 测试覆盖

---

## 7. Day 12-14:基础怪物 + M1 验收

### 7.1 怪物占位

- [ ] 一个"靶子怪物":站立不动,200 HP
- [ ] AI:不移动,被攻击时反击(可选)
- [ ] 死亡掉落 50 金币

### 7.2 粒子(火球命中,v1.1 D-15 GPU instanced)

- [ ] 命中时产生 5-10 个粒子
- [ ] 粒子向上飞溅 + 衰减
- [ ] **Web 端 WebGL2 GPU instanced**(v1.1 D-15 已确认,MVP 直上 GPU 路径)

### 7.3 M1 验收

- [ ] Tauri + WebGL2 项目编译运行
- [ ] 玩家 WASD 移动可响应
- [ ] Q 键释放火球
- [ ] 火球击中怪物造成伤害
- [ ] 60 FPS 稳定
- [ ] commit:`feat: M1 完成 - MVP demo`

---

## 8. 每周检查清单

周末完成时检查:

- [ ] 本周任务全部完成 ✅
- [ ] 代码已 commit + push
- [ ] 周报写完(`docs/M1_PROGRESS.md`)
- [ ] 下周任务已规划
- [ ] 没有未解决的 P0 bug
- [ ] 性能基线达标

---

## 9. M1 完成后可演示功能

```
演示给非技术观众的 30 秒脚本:

1. [打开应用] "这是 Voidbound,一款 2D 俯视 ARPG"
2. [主菜单] "新游戏"
3. [职业选择] "选野蛮人"  ← M1 只实现野蛮人有内容
4. [进入城镇] (空场景 + 一个出口)
5. [点击出口] "进入暗黑森林"
6. [WASD 移动] "玩家自由移动"
7. [按 Q] "释放火球技能"
8. [命中怪物] "造成伤害,怪物死亡"
9. [死亡 or 退出] "回主菜单"
```

---

## 10. 参考

- 核心流程:[GAME_FLOW.md](GAME_FLOW.md)
- 玩家需求:[PLAYER_UX.md](PLAYER_UX.md)
- 实施总路线:[ROADMAP.md](ROADMAP.md)
- v1.1 决策:[CHANGELOG-v1.1.md](CHANGELOG-v1.1.md)
- 素材资源:[ASSETS.md](ASSETS.md)
- Sprite 拼装:[SPRITE_ASSEMBLY_SOP.md](../assets/ai-gen/SPRITE_ASSEMBLY_SOP.md)