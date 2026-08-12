// GameState: 世界坐标 + 摄像机跟随 + 程序化墙
// 玩家 pos 为世界坐标; camera = player - viewportCenter; 渲染时 worldPos - camera

import type { RenderResources } from '../render/resources';
import { WORLD_W, WORLD_H, type Decor, spawnPointForMode } from './world';
import { FIREBALL_DAMAGE, type Monster, type PoisonPool } from './monster';
import type { CombatStats, DamageType } from './combat';
import type { RuneId } from './rune';
import type { SkillSlot, MeleeSwing } from './skill';
import type { Difficulty } from './difficulty';
import type { Equipment, EquipType } from './equipment';
import { CLASS_SPRITES, type ClassId } from './class';
import type { ElementId } from './element';
import type { MapMode } from './mapmode';
import { spawnBurst, type Vfx } from './fx/vfx';
import type { DamageNum } from './fx/damageNum';
import type { DeathFx } from './fx/deathFx';
import type { Toast } from './toast';
import type { EnemyProjectile } from './monsters/proj';
import type { CombatState } from './state/combat';
import type { UiState } from './state/ui';
import { createEmptyCombatState } from './state/combat';
import { createEmptyUiState } from './state/ui';

export interface Camera {
  x: number;
  y: number;
}

export interface Player {
  pos: { x: number; y: number };
  size: { w: number; h: number };
  speed: number;
  hp: number;
  mp: number;
  level: number;
  /** 旧字段保留 (M1 兼容性), 但 sprite 不再用它; 技能用鼠标方向 */
  facing: { x: number; y: number };
  idleT: number;
  /** 角色水平朝向: 'L' (含 A 键) / 'R' (含 D 键) / 'N' (无, 保持默认 south) */
  flipDir: 'L' | 'R' | 'N';
  /** D-04 战斗属性 (基础 + 装备聚合, US-002 后由 recomputeCombat 生成) */
  combat: CombatStats;
  /** 职业 (M5 C-102): 决定 6 槽技能配置 + 属性倾向 */
  classId: ClassId;
  /** 穿戴槽 (OPT-014, A1): 仅穿戴属性进战斗聚合 */
  equipped: Partial<Record<EquipType, Equipment>>;
  /** 可分配技能点 (击杀 +1, Ctrl+1..6 分配) */
  skillPoints: number;
  /** 金币 (D-06): 击杀掉落, 商人/重铸消耗 */
  gold: number;
  /** 药水瓶 (F-CBT-002: 1=回血 2=回蓝, 击杀 12% 掉落) */
  potions: { hp: number; mp: number };
  potionCd: number;
  /** 经验 (击杀 score×2) */
  exp: number;
  /** 翻滚无敌剩余秒 (Space) / 冷却 */
  dodgeT: number;
  dodgeCd: number;
  /** 原地复活无敌剩余秒 (OPT-011, B1 选项) */
  reviveInvuln: number;
  /** 被动技能等级 (M5 非目标收尾: 10 被动槽同时生效) */
  passives: Partial<Record<import('./passive').PassiveId, number>>;
  /** 被动生效后的上限/恢复/移速 (recomputePassives 写) */
  hpMax: number;
  mpMax: number;
  mpRegen: number;
  speedMult: number;
  /** A-W3 诅咒 (curse 机制): >0 = 减速 + 禁翻滚短窗 (翻滚/时间清除) */
  curseT: number;
}

export interface Fireball {
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  size: { w: number; h: number };
  life: number;
  /** D-04 命中伤害 (等级缩放后) */
  dmg: number;
  /** 发射时的符文 (pierce/vampire/homing 生效) */
  rune: RuneId;
  /** 伤害类型 (M5 C-101): 火球/暗影箭/圣光弹/毒镖等投射物共用) */
  dmgType: DamageType;
}

export interface RuneChoice {
  slot: SkillSlot;
  options: RuneId[];
}

/** 屏幕状态机 (OPT-010): 平铺旗标 → 单一 screen + 子状态 */
export type Screen =
  | 'title' | 'newgame'          // 外层
  | 'characters'                 // 角色管理 (C-202): 列表/新建/删除/切换
  | 'dungeon'                    // 战斗
  | 'town'                       // 城镇 (子面板: townPanel)
  | 'equipment'                  // Tab 装备面板 (覆盖在 dungeon 上)
  | 'pause'                      // Esc 菜单 (覆盖 dungeon/town 上; settingsOpen 为子状态)
  | 'portal'                     // A-W1 门结算: Boss 死亡位门前 [回城/继续] 面板
  | 'death' | 'victory';         // 结算 (OPT-011/012 接入)

/** 状态机最小接口 (setScreen 只依赖这些字段; GameState 结构满足) */
export interface ScreenMachine {
  screen: Screen;
  mode: 'dungeon' | 'town';
  pauseFrom: Screen;
}

/** 集中切换屏: 同步 mode; pauseFrom 只在进 pause 前由调用方设置 */
export function setScreen(s: ScreenMachine, next: Screen): void {
  const from = s.screen;
  s.screen = next;
  if (next === 'dungeon' || next === 'town') s.mode = next;
  // T1a: emit 事件 (bgm/震动服务订阅; 后续 US-XX-b 接入)
  void import('../core/eventBus').then(({ bus }) => bus.emit('screen.changed', { from, to: next }));
}

/** 暂停恢复目标 (pauseFrom='town' → town, 否则 dungeon) */
export function resumeScreen(s: ScreenMachine): Screen {
  return s.pauseFrom === 'town' ? 'town' : 'dungeon';
}

/**
 * 纯函数键位迁移表 (OPT-010 单测): 只覆盖无副作用导航键;
 * 带副作用的键 (title 1 新游戏、pause 1/2 继续/设置、runeChoice、攻击键) 由 main.ts handler 处理。
 * 注意: pause 的 '1'/'escape' 恢复目标依赖 pauseFrom, 表中返回默认 'dungeon', handler 用 resumeScreen。
 */
export function nextScreenOnKey(screen: Screen, key: string): Screen | null {
  const k = key.toLowerCase();
  switch (screen) {
    case 'dungeon':
      if (k === 'escape') return 'pause';
      if (k === 'tab') return 'equipment';
      return null;
    case 'town':
      if (k === 'escape') return 'pause';
      return null;
    case 'equipment':
      if (k === 'escape' || k === 'tab') return 'dungeon';
      return null;
    case 'pause':
      if (k === '3') return 'title';
      if (k === '4') return 'town';
      if (k === 'escape' || k === '1') return 'dungeon';
      return null;
    case 'portal':
      // 1 回城结算 / 2·Esc 继续 (留在本局, 门在场)
      if (k === '1') return 'town';
      if (k === '2' || k === 'escape') return 'dungeon';
      return null;
    case 'title':
      if (k === '1') return 'newgame';
      if (k === 'r') return 'characters';
      return null;
    case 'characters':
      if (k === 'escape') return 'title';
      return null;
    case 'newgame':
      if (k === 'escape') return 'title';
      if (k === 'enter') return 'dungeon';
      return null;
    case 'death':
      if (k === '1') return 'town';
      if (k === '2' || k === '3') return 'dungeon';
      return null;
    case 'victory':
      if (k === '1') return 'dungeon';
      if (k === '2') return 'town';
      return null;
  }
}

/** 单层地牢跑局状态 (OPT-012): 清图 → 召 Boss → 通关结算; Boss 不计入 alive */
export interface RunState {
  theme: Theme;
  /** A-W2 布局模式 (linear/gauntlet/extract); 存档 v10 持久化 */
  mode: MapMode;
  /** 本局小怪总数 / 存活 (非 Boss) */
  total: number;
  alive: number;
  /** 主题 Boss 是否在场 */
  bossAlive: boolean;
  /** 主题 Boss 是否已击败 (通关条件) */
  bossKilled: boolean;
  /** 通关结算是否已展示 (防重复触发) */
  victoryShown: boolean;
  /** 进入时刻 (performance.now, ms) */
  t0: number;
  /** 本次通关耗时秒 (胜利时记录) */
  timeSec: number;
  /** 本局击杀数 */
  kills: number;
  /** 本局元素染色 (M3): 地板/墙/装饰整图色相旋转; undefined = 原色主题 */
  element?: ElementId;
  /** 通关时收集的地上掉落数 (M5 实测修复: 胜利屏显示) */
  collectedLoot: number;
  /** 各难度最佳通关秒数 (账号层, OPT-015 持久化) */
  best: Partial<Record<Difficulty, number>>;
  /** A-W1 门结算: Boss 死亡位置生门; 交互 → 面板 [回城/继续]; 持续到本局结束 */
  portal?: { x: number; y: number; bossType: string; used: boolean };
  /** A-W4 挑战模式 Boss 阶段: 0=未召 / 1=四元素外向 Boss 在场 / 2=中央最终 Boss 在场 */
  bossStage: 0 | 1 | 2;
}

export type RunPhase = 'clearing' | 'boss' | 'won';

/** 跑局阶段纯判定: Boss 已杀 → won; 小怪清完且 Boss 未在场 → boss; 其余 → clearing */
export function runPhase(alive: number, bossAlive: boolean, bossKilled: boolean): RunPhase {
  if (bossKilled) return 'won';
  if (alive <= 0 && !bossAlive) return 'boss';
  return 'clearing';
}

/** 空跑局 (初始/读档前) */
export function emptyRun(theme: Theme): RunState {
  return {
    theme, mode: 'linear', total: 0, alive: 0,
    bossAlive: false, bossKilled: false, victoryShown: false,
    t0: performance.now(), timeSec: 0, kills: 0, best: {}, collectedLoot: 0,
    portal: undefined,
    bossStage: 0,
  };
}

export interface GameState {
  player: Player;
  viewport: { w: number; h: number };
  world: {
    w: number; h: number;
    /** 玩家附近 chunks 的所有墙 (由 world.ts.getActiveWalls 动态加载) */
    walls: WallLike[];
    /** V1 画质: 障碍物装饰 (纯视觉, 无碰撞), 每帧按相机半径刷新 */
    decor: Decor[];
  };
  camera: Camera;
  fireballs: Fireball[];
  fireballSize: number;
  monsters: Monster[];
  /** 技能/机制视觉特效 (UX_REVIEW §8.3): 扩散环/爆裂/闪电/辉光 */
  vfx: Vfx[];
  /** 屏幕状态机 (OPT-010) */
  screen: Screen;
  /** 暂停来源 (dungeon/town, 恢复用) */
  pauseFrom: Screen;
  theme: 'forest' | 'desert' | 'ruin' | 'void';
  resources: RenderResources;
  /** 难度 (US-011, F-DIFF) */
  difficulty: Difficulty;
  /** 跑局状态 (OPT-012) */
  run: RunState;
  /** 场景: 地下城 / 城镇 (US-021) */
  mode: 'dungeon' | 'town';
  /** 进入城镇前的地下城坐标 (出发时还原) */
  townReturn: { x: number; y: number } | null;
  /** 装备面板: 选中背包索引 / 当前页 (C-502 网格分页) */
  equipSel: number;
  equipPage: number;
  /** 活跃的符文三选一 (10 级触发) */
  runeChoice: RuneChoice | null;
  /** 已拒绝变异的槽 (本局不再触发) */
  rejectedRunes: SkillSlot[];
  /** 施法失败红闪 (OPT-007): 技能槽 + 倒计时秒 */
  castFailFlash: { slot: SkillSlot; t: number } | null;
  /** 环境粒子 (OPT-027): 主题氛围微尘 */
  envFx: Array<{ x: number; y: number; vx: number; vy: number; t: number; life: number }>;
  /** 死亡触发毒池 (A-W3 death_trigger): 站内每秒伤害 (本次 A.1 收口, 类型安全) */
  _pools: PoisonPool[];
  /** 伤害数字 (本次 A.1 收口, 类型安全; 之前用 _dmgNums 字段逃逸) */
  _dmgNums: DamageNum[];
  /** 死亡粒子 (本次 A.1 收口, 类型安全) */
  _deathFx: DeathFx[];
  /** 挥击 (近战命中盒): 由 skill.updateSwings 写入 (本次 A.1 收口, 类型安全) */
  _swing: MeleeSwing[];
  /** 地面掉落: equipment.ts (本次 A.1 收口) */
  _loot: import('./equipment').Equipment[];
  /** 已拾取(装备中)列表: equipment.ts (本次 A.1 收口) */
  _owned: import('./equipment').Equipment[];
  /** 顶部 toast 列表: toast.ts (本次 A.1 收口) */
  _toasts: Toast[];
  /** 怪物远程投射物: monsters/proj.ts (本次 A.1 收口) */
  _enemyProj: EnemyProjectile[];
  /** 已通关主题 (OPT-015, C1): 解锁难度与主题 */
  cleared: string[];
  /** 硬核二段确认 (OPT-006/015) */
  confirmHardcore: boolean;
  pendingDifficulty: Difficulty | null;
  /** 材料 (M5 W4 C-401): 独立计数不占背包 (J3=a); 第二货币 */
  materials: Partial<Record<import('./equipment').MaterialId, number>>;
  /** 城镇鼠标走向目标 (v3): 点击 NPC 自动走向, 到达后自动交互 (null=无) */
  townWalk: { kind: import('./town').NpcKind; x: number; y: number } | null;
  /** 战斗相关子状态 (PR #1 T4-a): 连击/震屏/停顿/击杀者/Boss 入场/升级闪光/积分/累计击杀 */
  combat: CombatState;
  /** UI 相关子状态 (PR #1 T4-b): 设置面板/收集覆盖层/键位编辑/死亡撤销/探索度/标题消息 */
  ui: UiState;
}

export const THEMES = ['forest', 'desert', 'ruin', 'void'] as const;
export type Theme = (typeof THEMES)[number];

/** 重置 player 状态到本局模式出生点 (A-W2: 线性左 / 高级角落 / 挑战中央) */
export function resetPlayer(state: GameState): void {
  const sp = spawnPointForMode(state.run.mode ?? 'linear');
  state.player.pos = { x: sp.x - 32, y: sp.y - 32 };
  state.player.hp = 100;
  state.player.mp = 100;
  state.player.idleT = 0;
  state.player.flipDir = 'N';
}

import type { Wall as WallLike } from './world';

export function updateCamera(state: GameState): void {
  const vw = state.viewport.w;
  const vh = state.viewport.h;
  // 钳制到世界边界: 不 clamp 会在出生点(左缘 320)露出无贴图黑带 (camera.x = 288-640 = -352)
  state.camera.x = Math.max(0, Math.min(WORLD_W - vw, state.player.pos.x - vw / 2));
  state.camera.y = Math.max(0, Math.min(WORLD_H - vh, state.player.pos.y - vh / 2));
}

export function worldToScreen(state: GameState, worldPos: { x: number; y: number }): { x: number; y: number } {
  return { x: worldPos.x - state.camera.x, y: worldPos.y - state.camera.y };
}

export function updateFireballs(state: GameState, dt: number): void {
  const toRelease: Fireball[] = [];
  let wallHits = 0;
  for (const f of state.fireballs) {
    // 追踪符文: 每帧朝最近怪物转向
    if (f.rune === 'homing') {
      let best: Monster | null = null;
      let bd = 520;
      for (const m of state.monsters) {
        const d = Math.hypot(m.pos.x - f.pos.x, m.pos.y - f.pos.y);
        if (d < bd) { bd = d; best = m; }
      }
      if (best) {
        const dx = best.pos.x - f.pos.x;
        const dy = best.pos.y - f.pos.y;
        const len = Math.hypot(dx, dy) || 1;
        const speed = Math.hypot(f.vel.x, f.vel.y) || 320;
        f.vel.x = (dx / len) * speed;
        f.vel.y = (dy / len) * speed;
      }
    }
    f.pos.x += f.vel.x * dt;
    f.pos.y += f.vel.y * dt;
    f.life -= dt;
    let release = false;
    if (f.life <= 0) release = true;
    else if (f.pos.x < 0 || f.pos.x + f.size.w > state.world.w) release = true;
    else if (f.pos.y < 0 || f.pos.y + f.size.h > state.world.h) release = true;
    else {
      // 墙碰撞 (穿透符文免疫)
      let blocked = false;
      if (f.rune !== 'pierce') {
        for (const w of state.world.walls) {
          if (f.pos.x < w.pos.x + w.size.w && f.pos.x + f.size.w > w.pos.x &&
              f.pos.y < w.pos.y + w.size.h && f.pos.y + f.size.h > w.pos.y) {
            blocked = true;
            break;
          }
        }
      }
      if (blocked) {
        wallHits++;
        // VFX (UX_REVIEW P1): 撞墙火花
        spawnBurst(state, f.pos.x + f.size.w / 2, f.pos.y + f.size.h / 2, 4, [0.9, 0.9, 1], 'spark_03', 70, 5, 0.3);
        release = true;
      }
    }
    if (release) toRelease.push(f);
  }
  if (wallHits > 0) {
    void import('../util/log').then(({ inf }) => inf('combat', `fireball hit ${wallHits} wall(s)`));
  }
  const beforeCount = state.fireballs.length;
  for (const f of toRelease) {
    const idx = state.fireballs.indexOf(f);
    if (idx >= 0) state.fireballs.splice(idx, 1);
    fireballPool.release(f);
  }
  if (state.fireballs.length !== beforeCount) {
    void import('../util/log').then(({ inf }) => inf('skill', `fireballs remaining: ${state.fireballs.length}`));
  }
}

export function spawnFireball(state: GameState, dir: { x: number; y: number }, spread = 0, rune: RuneId = 'none', dmg = FIREBALL_DAMAGE, dmgType: DamageType = 'fire'): void {
  // 按 spread 弧度旋转方向
  const cos = Math.cos(spread);
  const sin = Math.sin(spread);
  let dx = dir.x * cos - dir.y * sin;
  let dy = dir.x * sin + dir.y * cos;
  const len = Math.hypot(dx, dy);
  if (len === 0) { dx = 1; dy = 0; }
  else { dx /= len; dy /= len; }
  const speed = 320;
  const cx = state.player.pos.x + state.player.size.w / 2;
  const cy = state.player.pos.y + state.player.size.h / 2;
  // B.1.7: 池化 acquire → 复用, 避免每帧 new
  const f = fireballPool.acquire();
  f.pos.x = cx + dx * (state.player.size.w / 2) - state.fireballSize / 2;
  f.pos.y = cy + dy * (state.player.size.h / 2) - state.fireballSize / 2;
  f.vel.x = dx * speed;
  f.vel.y = dy * speed;
  f.size.w = state.fireballSize;
  f.size.h = state.fireballSize;
  f.life = rune === 'pierce' ? 3.0 : 1.5;
  f.dmg = dmg;
  f.rune = rune;
  f.dmgType = dmgType;
  state.fireballs.push(f);
  void import('../util/log').then(({ dbg }) => dbg('skill', `spawn fireball dir=(${dx.toFixed(2)},${dy.toFixed(2)}) rune=${rune} dmg=${dmg} type=${dmgType}`));
}

export interface PlayerSprite {
  name: string;
  flipX: boolean;
  rot: number;
}

/** sprite 水平朝向决策:
 *  1. 鼠标水平位置 (主) → 右侧 = R, 左侧 = L, 中心 = 用 A/D 决定
 *  2. A/D 键 (兜底) → D 优先 → R, A → L, 都没有 → N (south)
 */
export function pickPlayerSprite(state: GameState, mouseScreenX: number): PlayerSprite {
  const vpCx = state.viewport.w / 2;
  const dx = mouseScreenX - vpCx;
  // 职业 → 站立 sprite (mage 图集名 sorceress, 由 CLASS_SPRITES 统一映射; 缺省 barbarian 防 throw)
  const name = CLASS_SPRITES[state.player.classId as ClassId] ?? CLASS_SPRITES.barbarian;
  // 鼠标明显在右边 → R, 明显在左边 → L, 中心 ±8px → 用键盘
  if (dx > 8) return { name, flipX: false, rot: 0 };
  if (dx < -8) return { name, flipX: true, rot: 0 };
  const flip = state.player.flipDir;
  return { name, flipX: flip === 'L', rot: 0 };
}

// re-export
export { WORLD_W, WORLD_H };

// === B.1.7 玩家火球池 (零 GC, 满屏弹幕护栏) ===
import { Pool } from '../core/pool';
const fireballPool = new Pool<Fireball>({
  factory: () => ({
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    size: { w: 0, h: 0 },
    life: 0,
    dmg: 0,
    rune: 'none' as RuneId,
    dmgType: 'fire' as DamageType,
  }),
  reset: (f) => {
    f.pos.x = 0; f.pos.y = 0;
    f.vel.x = 0; f.vel.y = 0;
    f.size.w = 0; f.size.h = 0;
    f.life = 0; f.dmg = 0;
    f.rune = 'none';
    f.dmgType = 'fire';
  },
  initial: 64,
});

/** 测试用: 重置玩家火球池 */
export function _resetFireballPool(): void {
  fireballPool.clear();
}

/** B.1.7 helper: 跨模块释放单个火球 (splice 在调用方做, 这里只回池)
 *  - monsters/behavior.resolveFireballHits 在 splice 后调用此函数
 *  - 幂等: 重复 release 无害 (Pool.release 内部防御) */
export function releaseFireball(f: Fireball): void {
  fireballPool.release(f);
}