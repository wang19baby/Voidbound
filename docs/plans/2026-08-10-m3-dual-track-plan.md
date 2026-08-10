# M3 双轨实施计划 — 玩法扩展 + 画质提升

> 日期:2026-08-10
> 状态:画质轨定稿(V0 地基先行,内容层随用户指令全量推进);玩法轨设计已拍板(见设计文档)
> 需求/设计文档:[2026-08-10-map-monster-combat-design.md](2026-08-10-map-monster-combat-design.md)(三模式/五层/门结算/机制包)、[2026-08-10-ux-optimization-requirements.md](2026-08-10-ux-optimization-requirements.md)(OPT 波次已交付 Wave0/1 + C-101~503)
> 目标:双轨推进 — **Track A 玩法**(M3 地图/怪物/战斗扩展)+ **Track B 画质**(表现力提升:画质/角色/地图/障碍物)
> 建议顺序:**B-V0 地基 → A-W1 骨架 → (B-V1 内容 ∥ A-W2 地图) → A-W3 机制 → A-W4 Boss + B-V2/B-V3 收口**

---

## 一、Track B 画质轨设计(头脑风暴产物)

### 1.1 渲染栈现状(已核实)

- 单 shader 单 pass(`render/shaders.ts`):pos/size/uv/flip/rot/tint(`tex.rgb * u_color`);**无光照/发光/滤镜/后处理**。
- 视口 **1280×720 硬编码在 vertex shader**,无相机 uniform;标准 alpha 混合(`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`)。
- 已有表现:hitFlash 红闪 / 染色 / 伤害数字 / 2 帧行走 / 死亡粒子 / 城镇 clearColor 底色 / 传送光圈。
- 欠账(ux 文档 P-44/45):屏幕震动、命中停顿、环境粒子、BGM 交叉淡化、专属音效。

### 1.2 画质清单(按性价比分层)

**地基层(小改动,解锁全局)**
1. **additive 发光**:粒子/技能加 `gl.ONE, gl.ONE` 混合,火球/魔法光像素游戏质感。
2. **相机 uniform(`u_cam`)入 shader**:相机偏移 + 可选缩放,顺手移除硬编码分辨率;震动/缩放从此免费。
3. **主题滤镜色板**:森林绿影 / 沙漠暖 / 废墟冷蓝 / 虚空紫 全局 tint(clearColor + 全屏色板)。
4. **屏幕震动 + 命中停顿**:纯 JS,打击感翻倍。

**内容层(吃资产,视觉变化最大)**
5. **地板瓦片**:主题瓦片地板(替代纯 clearColor 底色),覆盖角色脚下/城镇/地牢。
6. **角色/怪物 4 帧动画 + 攻击前摇**:2 帧→4 帧行走;技能前摇帧(可读性=反制)。
7. **环境粒子**:沙漠尘 / 废墟雪 / 虚空余烬 / 森林落叶,复用现有粒子系统。

**手感层**
8. **Boss 入场演出 + BGM 交叉淡化**(rodio 已有,接音轨)。

**性能护栏(做特效前先做)**
9. **粒子 instancing**:5k 粒子 1 个 draw call(ux P-40 基准),给所有粒子特效兜底。

### 1.3 波次

| 波次 | 内容 | 依赖 |
|---|---|---|
| **B-V0 地基** | additive 发光 / u_cam / 主题色板 / 震动+命中停顿 | 无 |
| **B-V1 内容** | 地板瓦片 / 4 帧动画+前摇 / 环境粒子 | V0(色板) |
| **B-V2 手感** | Boss 入场演出 / BGM 交叉淡化 | V0(震动) |
| **B-V3 性能** | 粒子 instancing + 5k 基准 | 特效落定后 |

---

## 二、Track A 玩法轨波次(引用设计文档 §7)

| 波次 | 内容 | 依赖 |
|---|---|---|
| **A-W1 骨架** | 五层层级(领主层新档位)/ 营地三型 / 门结算(回城/继续)/ 存档 v10(mode) | — |
| **A-W2 地图** | 三模式布局(newgame 屏第三维)/ 地标雕刻 pass / 密度梯度 / 地图1 简化 WFC 主轴 / 地图2 随机角入口 / 地图3 中心出生 | A-W1(门挂 Boss) |
| **A-W3 机制包** | 包1 移动 AI(strafe/leap/burrow/flee)/ 包2 机制(光环×5 + shield/explode/thorns/curse/death_trigger)/ 包3 Boss 技能(spiral/laser/nova/spawn_elites/teleport/arena_mech/enrage) | A-W1(层级挂载点) |
| **A-W4 Boss** | 四元素 Boss(挑战模式)+ 中央最终 Boss | A-W2(布局)/ A-W3(技能池) |

---

## 三、架构契约(开工前锁定)

### C1:Shader 升级(render/shaders.ts + gl/context.ts)
- vertex shader 增 `uniform vec2 u_cam`(相机偏移,世界坐标减相机后 clip)+ `uniform vec2 u_viewport`(替代硬编码 1280×720);绘制前统一设置。
- 新增 `setBlend(gl, 'alpha' | 'add')`:`add` = `gl.ONE, gl.ONE`(发光粒子/技能);drawSprite 增 `blend?: 'alpha'|'add'` 选项。
- 全屏 tint 通道:`u_tint`(vec4,乘法 + alpha)或 clearColor 色板,主题滤镜走色板。

### C2:主题色板(新 game/theme.ts 或 state.ts)
```ts
export interface ThemePalette { clear: [number,number,number]; tint: [number,number,number]; ambient: 'dust'|'snow'|'ember'|'leaf'; }
export const THEME_PALETTES: Record<Theme, ThemePalette>;
```

### C3:震动/命中停顿(state.ts)
```ts
interface Juice { shakeT: number; shakeMag: number; hitStopT: number; }
// addShake(mag, t) / triggerHitStop(ms);update 在 loop 递减;u_cam += 随机偏移×mag
```

### C4:怪物层级字段(monster.ts, A-W1)
- `MonsterDef.tier?: 'normal'|'enhanced'|'elite'|'lord'|'boss'`;`enhanced` 1.4×;`lord` 5-8× 精英 + ai×1 + mech×1 + bossSkill 三选一;aura 系统(`auraType` + 半径,增强白怪状态)。

### C5:门结算(state.ts + main.ts, A-W1)
```ts
interface Portal { x: number; y: number; bossType: string; used: boolean; }
// Boss 死亡位置生成;交互 → 面板 [回城 / 继续];通关 = 最终 Boss
```

### C6:存档 v10(save.rs, A-W1/A-W2)
- v9→v10 迁移:加 `mode: 'linear'|'gauntlet'|'extract'`(默认 linear)+ portal 进度;cargo 迁移用例。

---

## 四、测试与验收汇总

| 门 | 命令/动作 | 期望 |
|---|---|---|
| 单测 | `npm test`(每波后) | 现有 16 套 597 例 + 新增全绿 |
| Rust | `cargo test`(v10 迁移) | 18 例 + v10 往返/迁移 |
| 构建 | `npm run build` | 通过 |
| 冒烟(画质) | 进任意主题 → 火球/近战 → 震动/发光/滤镜可见;暂停不崩 | 0 JS error,0 loop-crash |
| 冒烟(玩法) | A-W1 后:营地三型出现/领主可击杀/门交互回城可继续 | 全链路可达 |

## 五、风险

- V0 动 shader 与全部绘制路径:改动后必须全屏冒烟(标题/城镇/地牢/面板),防黑块回归(Ralph 6d 教训)。
- u_cam 引入需确认 main.ts 现有"世界→屏幕"换算(当前 shader 直映射,相机可能在 JS 侧),先读清绘制路径再改。
- 内容层吃资产管线(ai-gen 可用),地板瓦片需 atlas 尺寸预算,避免超 atlas 上限。
