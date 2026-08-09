# Voidbound 代码 Review Checklist

> 版本：v1.1 配套  
> 日期：2026-08-08  
> 用途：代码审查的统一标准,适用于所有 Rust / TypeScript 改动

---

## 0. Review 流程

### 0.1 时机

| 改动类型 | Review 时机 |
|---------|-----------|
| 算法 / 数据结构 | **必须** reviewer 看 |
| API / 公共接口 | **必须** reviewer 看 |
| UI / 渲染 | reviewer 看,需附截图 / GIF |
| 配置 / 文档 | 自审即可 |
| 杂项 / 重构 | 抽样 review |

### 0.2 Reviewer 责任

- 不只是看风格,要**质疑设计决策**
- 提问 > 直接通过
- 24h 内反馈,P0 问题 4h

---

## 1. 架构 / 设计(最高优先级)

### 1.1 模块边界

- [ ] 模块职责**单一**,名字能 1 句话说清
- [ ] 模块**对外接口**最小化
- [ ] 模块**无循环依赖**
- [ ] 新功能没有破坏现有抽象

### 1.2 数据流

- [ ] 输入 → 处理 → 输出 路径清晰
- [ ] 没有"全局可变状态"绕过参数
- [ ] 没有"魔法字符串"(用 enum / 常量)

### 1.3 错误处理

- [ ] **不吞错**:`unwrap()` / `expect()` 在生产路径上不允许
- [ ] 错误信息**包含上下文**(哪个文件 / 哪一行)
- [ ] 用户面错误有**可执行的下一步**(不是"未知错误")

### 1.4 性能

- [ ] 热路径(60Hz)避免分配
- [ ] 大循环预分配 Vec / HashMap
- [ ] 没有意外的 O(n²) / 克隆

---

## 2. Rust 专项

### 2.1 借用 / 所有权

- [ ] 没有 `.clone()` 在热路径(只在边界用)
- [ ] 函数签名优先 `&[T]` 而非 `Vec<T>`(除非需要 push)
- [ ] 没有 `&mut Vec<T>` + 同时 `iter()`(iterator invalidation)
- [ ] 生命周期参数**显式**标注,除非 `'static`

### 2.2 错误处理

- [ ] 公共 API 用 `Result<T, E>` 返回
- [ ] `E` 是**自定义 enum**,不用 `String` / `&str`
- [ ] 不在 `Result` 上用 `.unwrap()`
- [ ] `panic!` 只在**不可恢复**情况(invariant violation)

### 2.3 类型

- [ ] 数字类型**不用 f64 默认**(除非真需要);优先 f32
- [ ] 用 `u32` 不用 `usize`(序列化时确定宽度)
- [ ] enum 优于 bool flag(`enum Mode { Auto, Manual }` 而非 `bool is_manual`)
- [ ] newtype 包装原始类型(`struct PlayerId(u32)` 而非 `u32`)

### 2.4 并发

- [ ] `Send + Sync` 边界**显式考虑**
- [ ] 共享状态用 `Arc<Mutex<T>>` 或 `Arc<RwLock<T>>`
- [ ] 锁的临界区**最小**(不持锁做 IO)
- [ ] 死锁可能 → 用 `parking_lot` 而非 `std::sync::Mutex`

### 2.5 序列化

- [ ] `serde` 字段名 = JSON key(用 `#[serde(rename = "...")]` 转换)
- [ ] 向后兼容:加字段用 `#[serde(default)]`
- [ ] 不在 `Serialize` 实现里 panic

### 2.6 测试

- [ ] 单元测试**就近**(同文件 `#[cfg(test)] mod tests`)
- [ ] 集成测试在 `tests/` 目录
- [ ] 测试名 = 行为:`test_damage_with_zero_resistance_is_base`
- [ ] 公共 API 100% 覆盖(核心数值公式)

### 2.7 clippy

- [ ] `cargo clippy --all-targets -- -D warnings` 零警告
- [ ] 没有 `#[allow(...)]` 除非注释解释

---

## 3. TypeScript 专项

### 3.1 类型

- [ ] `strict: true` 配置(`tsconfig.json`)
- [ ] **没有 `any`**(用 `unknown` + 收窄)
- [ ] 函数参数 / 返回值**显式类型**
- [ ] 公开接口有 JSDoc 注释

### 3.2 模块

- [ ] ES modules(`import/export`),不用 `require`
- [ ] 不修改导出对象(冻结 / readonly)
- [ ] 副作用函数显式命名(`setupXxx` / `teardownXxx`)

### 3.3 异步

- [ ] 不在 `forEach` 里 await(用 `for...of`)
- [ ] 错误处理:`try/catch` 包住每个 await
- [ ] 不混 `Promise.then()` 和 `async/await`

### 3.4 DOM / WebGL

- [ ] 不在主循环 `querySelector`(缓存在外层)
- [ ] WebGL 资源创建后**不重复**(单例)
- [ ] 离屏 canvas / Web Worker 用于重计算

### 3.5 测试

- [ ] 关键逻辑有 vitest 单测
- [ ] 渲染代码至少手动验证(截图)

---

## 4. 性能专项

### 4.1 热路径分析(每帧 16ms)

| 操作 | 目标耗时 | 不允许 |
|------|---------|--------|
| 物理 tick | < 4 ms | > 6 ms |
| 渲染帧 | < 8 ms | > 12 ms |
| 粒子更新 | < 2 ms | > 4 ms |
| 输入响应 | < 1 ms | > 2 ms |

### 4.2 内存

- [ ] 对象池复用粒子 / 子弹
- [ ] Vec / HashMap `with_capacity` 预分配
- [ ] 没有意外的 Box<Vec<T>>(Vec 已经在堆上)
- [ ] 大纹理**异步加载**,不阻塞首帧

### 4.3 渲染

- [ ] Instanced rendering(N = 1000+ 粒子)
- [ ] 不每帧重新编译 shader
- [ ] 纹理集(atlas)最小化 draw call

---

## 5. 安全专项

### 5.1 输入验证

- [ ] 用户输入(skill name / character name)有长度限制
- [ ] 文件路径**不信任用户输入**(防止 path traversal)
- [ ] 反序列化前**验证 magic + version + CRC**

### 5.2 存档

- [ ] 存档格式有 magic + version + CRC32
- [ ] 损坏存档**不 panic**,回到主菜单报错
- [ ] 敏感字段(如账号 ID)**加密或混淆**

### 5.3 Tauri Command

- [ ] 权限声明在 `tauri.conf.json`
- [ ] 用户输入 command 前**验证类型**
- [ ] 不暴露内部路径给 web 端

---

## 6. 测试覆盖目标(REQUIREMENTS §3.3)

| 模块 | 目标覆盖率 |
|------|----------|
| 战斗公式 | 100% |
| 状态机转换 | 100% |
| 存档读写 | 90% |
| UI / 渲染 | 80% |
| WFC 算法 | 集成测试(生成 1000 次验证连通性) |

---

## 7. 命名规范

### 7.1 Rust

```
模块: snake_case (game::entity)
类型: PascalCase (Player, SkillId)
函数: snake_case (calc_damage, take_damage)
常量: SCREAMING_SNAKE (MAX_LEVEL)
变量: snake_case (player_hp, monster_count)
枚举值: PascalCase (Status::Active)
```

### 7.2 TypeScript

```
模块: kebab-case (game-loop.ts)
类型: PascalCase (Player, SkillId)
函数: camelCase (calcDamage, takeDamage)
常量: SCREAMING_SNAKE (MAX_LEVEL)
变量: camelCase (playerHp, monsterCount)
枚举值: PascalCase (Status.Active)
```

---

## 8. Commit 信息规范

```
格式: <type>(<scope>): <subject>

type:
  feat:     新功能
  fix:      bug 修复
  refactor: 重构(无功能变化)
  docs:     文档
  test:     测试
  perf:     性能优化
  chore:    构建/工具变更

示例:
  feat(combat): add fireball skill with damage formula
  fix(save): prevent crash on corrupted save CRC
  perf(render): use instanced rendering for particles
  docs(changelog): v1.1 release notes
```

---

## 9. PR Review 检查清单(reviewer 视角)

收到 PR 后,逐项检查:

```
第一遍(5 分钟):
  [ ] PR 描述清晰?链接了 issue?
  [ ] 改动范围合理?(不应改无关文件)
  [ ] commit 信息符合规范?
  [ ] CI 通过?

第二遍(15 分钟):
  [ ] 数据流通顺?
  [ ] 错误处理正确?
  [ ] 命名规范?
  [ ] 测试覆盖?

第三遍(15 分钟):
  [ ] 性能影响?
  [ ] 安全影响?
  [ ] 文档 / 注释更新?
  [ ] 向后兼容?(存档 schema / API)
```

---

## 10. Reviewer 反馈分级

| 级别 | 含义 | 处理 |
|------|------|------|
| 🔴 Blocker | 必须修,合并前 | 作者必须响应 |
| 🟡 Important | 应该修 | 作者可解释后推迟 |
| 🟢 Nit | 可选 | 作者自决 |

---

## 11. 反模式(避免)

### 11.1 代码

- ❌ "魔法数字":`if x > 42` 应该有常量
- ❌ 巨大函数(> 100 行)
- ❌ 嵌套深度 > 4 层
- ❌ `TODO` 注释不带 issue 链接
- ❌ `// 这段代码很烂但能跑`
- ❌ 复制粘贴 > 3 次(应该抽函数)

### 11.2 流程

- ❌ 直接 commit 到 main
- ❌ 没有 PR 描述
- ❌ 一个 PR 改 50 个文件
- ❌ 没有测试的"完成"声明

---

## 12. 参考

- 完整设计:[DESIGN.md](DESIGN.md)
- v1.1 决策:[CHANGELOG-v1.1.md](CHANGELOG-v1.1.md)
- 实施路线:[ROADMAP.md](ROADMAP.md)
- M1 任务:[M1_CHECKLIST.md](M1_CHECKLIST.md)