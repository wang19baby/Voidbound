// 怪物系统数据/缩放单测 (OPT-018/021/022)
// 运行: npm test

import { levelMonsterScale, MONSTER_DEFS, THEME_MONSTER_POOL, THEME_BOSS, rollElite, ELITE_CHANCE, ELITE_HP_MULT } from '../src/game/monster';
import { THEME_BOSS_SET } from '../src/game/equipment';
import { THEMES, type Theme } from '../src/game/state';

let failures = 0;
function eq(name: string, got: number, want: number): void {
  if (Math.abs(got - want) > 0.0001) {
    console.error(`FAIL ${name}: got ${got}, want ${want}`);
    failures++;
  } else console.log(`ok  ${name}: ${want}`);
}
function check(name: string, cond: boolean): void {
  if (!cond) { console.error(`FAIL ${name}`); failures++; }
  else console.log(`ok  ${name}`);
}

// === OPT-018 等级缩放 ===
eq('Lv1 缩放 1.0', levelMonsterScale(1), 1.0);
eq('Lv21 缩放 2.0', levelMonsterScale(21), 2.0);
eq('Lv51 缩放 3.5', levelMonsterScale(51), 3.5);
eq('Lv0 兜底 1.0', levelMonsterScale(0), 1.0);

// === OPT-021 每主题 ≥2 独有行为怪 (dash/split) ===
for (const t of THEMES) {
  const pool = THEME_MONSTER_POOL[t];
  const withAi = pool.filter(m => MONSTER_DEFS[m].ai !== undefined);
  check(`主题 ${t} 池有 ≥2 只行为怪 (实际 ${withAi.length})`, withAi.length >= 2);
}
check('分裂怪存在', ['plague_slime', 'frost_worm', 'bloat_eye'].every(m => MONSTER_DEFS[m].ai === 'split'));
check('冲撞怪存在', ['direwolf', 'bee', 'queen_bee', 'wraith', 'ghost'].every(m => MONSTER_DEFS[m].ai === 'dash'));

// === OPT-022 Boss 机制互不相同 (代码分支断言) ===
const bossSkills = (THEMES as Theme[]).map(t => MONSTER_DEFS[THEME_BOSS[t]].bossSkill);
check('4 Boss 机制: summon/ring/charge 覆盖', bossSkills.includes('summon') && bossSkills.includes('ring') && bossSkills.includes('charge'));
check('pumpking summon', MONSTER_DEFS.pumpking.bossSkill === 'summon');
check('war_pharaoh ring', MONSTER_DEFS.war_pharaoh.bossSkill === 'ring');
check('void_overlord charge', MONSTER_DEFS.void_overlord.bossSkill === 'charge');

// === OPT-021 主题 Boss 专属套装 ===
import { THEME_BOSS_SET, SET_BONUSES } from '../src/game/equipment';
check('THEME_BOSS_SET 覆盖 4 主题', Object.keys(THEME_BOSS_SET).length === 4);
check('4 主题 4 套互不相同', new Set(Object.values(THEME_BOSS_SET)).size === 4);
check('Boss 套装均为既存套装', Object.values(THEME_BOSS_SET).every(s => Object.keys(SET_BONUSES).includes(s)));

// === 内容扩充: 精英怪 ===
check('精英概率 8%', ELITE_CHANCE === 0.08);
check('rollElite 0.01 → 精英', rollElite(() => 0.01));
check('rollElite 0.079 → 精英 (临界内)', rollElite(() => 0.079));
check('rollElite 0.08 → 普通 (开区间)', !rollElite(() => 0.08));
check('rollElite 0.2 → 普通', !rollElite(() => 0.2));
check('精英 HP ×2.2', ELITE_HP_MULT === 2.2);

// === M3 元素/领主系统 ===
import { ELEMENT_DEFS, ELEMENT_IDS } from '../src/game/element';
import { DAMAGE_TYPES } from '../src/game/combat';
import { LORD_CHANCE, LORD_SIZE_SCALE, LORD_HP_MULT, LORD_DMG_MULT } from '../src/game/monster';
check('5 元素定义', ELEMENT_IDS.length === 5);
for (const id of ELEMENT_IDS) {
  const def = ELEMENT_DEFS[id];
  check(`元素 ${id} 色相 0-360`, def.hue >= 0 && def.hue < 360);
  check(`元素 ${id} 伤害系合法`, (DAMAGE_TYPES as string[]).includes(def.dmgType));
}
check('领主概率 4%', LORD_CHANCE === 0.04);
check('领主体型 ×1.6', LORD_SIZE_SCALE === 1.6);
check('领主 HP ×6 精英基准', LORD_HP_MULT === 6);
check('领主伤害 ×1.5 精英基准', LORD_DMG_MULT === 1.5);
// HD 接线回归: 4 Boss 用自己的画 (M3 美术接入后)
check('pumpking 自画', MONSTER_DEFS.pumpking.sprite === 'pumpking');
check('war_pharaoh 自画', MONSTER_DEFS.war_pharaoh.sprite === 'war_pharaoh');
check('frost_lich 自画', MONSTER_DEFS.frost_lich.sprite === 'frost_lich');
check('void_overlord 自画', MONSTER_DEFS.void_overlord.sprite === 'void_overlord');

// === A-W1 五层: 增强层 + 光环系统 ===
import { ENHANCED_HP_MULT, ENHANCED_DMG_MULT, ENHANCED_CHANCE, AURA_TYPES, AURA_DEFS, AURA_RADIUS, LORD_HP_MULT } from '../src/game/monster';
check('增强概率 30%', ENHANCED_CHANCE === 0.3);
check('增强 HP ×1.4', ENHANCED_HP_MULT === 1.4);
check('增强伤害 ×1.4', ENHANCED_DMG_MULT === 1.4);
check('光环 ×5 类型', AURA_TYPES.length === 5);
check('光环类型唯一', new Set(AURA_TYPES).size === 5);
for (const a of AURA_TYPES) {
  const def = AURA_DEFS[a];
  check(`光环 ${a} 有名字`, typeof def.name === 'string' && def.name.length > 0);
  check(`光环 ${a} 有色`, def.color.length === 3 && def.color.every(v => v >= 0 && v <= 1));
}
check('光环半径 140', AURA_RADIUS === 140);
// 层级严格递增: boss > lord > elite > enhanced > normal (HP 倍率链; lord 6×精英基准 > elite 2.2×)
check('层级 HP 链: lord 6×精英 > elite 2.2× > enhanced 1.4×', LORD_HP_MULT > ELITE_HP_MULT && ELITE_HP_MULT > ENHANCED_HP_MULT);

// === A-W1 营地三型 ===
import { CAMP_TYPES, spawnCamp, spawnMonster } from '../src/game/monster';
import { generateChunkWalls, aabbOverlap } from '../src/game/world';
check('营地三型', CAMP_TYPES.length === 3);
check('营地类型齐全', ['aura', 'swarm', 'duo'].every(t => CAMP_TYPES.includes(t as 'aura' | 'swarm' | 'duo')));

// spawnCamp 结构验证 (轻量 GameState stub)
function makeStubState() {
  const world = { w: 20480, h: 11520, walls: [] as { pos: { x: number; y: number }; size: { w: number; h: number } }[] };
  const player = { pos: { x: 10240, y: 5760 }, size: { w: 32, h: 32 }, level: 1 };
  return {
    player,
    world,
    // PR #2: 字段搬到 fx 子对象 (生产 GameState 必有)
    fx: {
      monsters: [] as unknown[],
      vfx: [] as unknown[],
      pools: [] as unknown[],
      dmgNums: [] as unknown[],
      deathFx: [] as unknown[],
      swings: [] as unknown[],
      loot: [] as unknown[],
      owned: [] as unknown[],
      toasts: [] as unknown[],
      enemyProj: [] as unknown[],
    },
    difficulty: 'normal',
    theme: 'forest',
    run: { theme: 'forest' },
  };
}
const pickForest = () => 'slime' as const;
const auraCamp = spawnCamp(makeStubState() as never, { x: 10240, y: 5760, type: 'aura' }, pickForest);
check('光环营地: 1 精英带光环 + 5 白怪', auraCamp.length === 6 && auraCamp.filter(m => m.elite).length === 1 && auraCamp.filter(m => m.elite && m.aura).length === 1);
const swarmCamp = spawnCamp(makeStubState() as never, { x: 10240, y: 5760, type: 'swarm' }, pickForest);
check('精英抱团: 2 精英 + 4 白怪', swarmCamp.length === 6 && swarmCamp.filter(m => m.elite).length === 2 && swarmCamp.filter(m => m.pureSupport).length === 0);
const duoCamp = spawnCamp(makeStubState() as never, { x: 10240, y: 5760, type: 'duo' }, pickForest);
check('双核营地: 1 精英 + 1 专职光环者 + 4 白怪', duoCamp.length === 6 && duoCamp.filter(m => m.elite).length === 1 && duoCamp.filter(m => m.pureSupport).length === 1 && duoCamp.filter(m => m.pureSupport && m.aura).length === 1);
const lordCamp = spawnCamp(makeStubState() as never, { x: 10240, y: 5760, type: 'lord' }, pickForest);
check('领主营地: 1 领主 + 3 精英护卫', lordCamp.length === 4 && lordCamp.filter(m => m.lord).length === 1 && lordCamp.filter(m => m.elite).length === 3);
check('领主带移动AI + 机制 + bossSkill', (() => {
  const lord = lordCamp.find(m => m.lord)!;
  return lord.moveAI !== undefined && lord.mech !== undefined && lord.bossSkill !== undefined;
})());
// gauntlet 模式: 四角领主 camp (spawnRunPool 分派)
import { spawnRunPool } from '../src/game/monster';
{
  const gs = makeStubState() as never;
  (gs as { run: { mode: string } }).run.mode = 'gauntlet';
  spawnRunPool(gs as never);
  const lords = (gs as { fx: { monsters: { lord: boolean }[] } }).fx.monsters.filter(m => m.lord);
  check('gauntlet 池含 ≥4 领主 (四角)', lords.length >= 4);
}
// A-W5 肉鸽模式: 地标营地 + 密度带散怪, 不绕玩家 (修复"怪物全围角色")
{
  const gs = makeStubState() as never;
  const r = gs as { run: { mode: string; seed?: number } };
  r.run.mode = 'rogue';
  r.run.seed = 1;
  spawnRunPool(gs as never);
  const monsters = (gs as { fx: { monsters: { pos: { x: number; y: number } }[] } }).fx.monsters;
  check('肉鸽池刷满 RUN_POOL_SIZE', monsters.length >= 24);
  // 玩家出生 (线性左端 ~320,5760); 营地/散怪全图散布 → 至少 1/3 距出生 >2000px
  const p = { x: 320, y: 5760 };
  const far = monsters.filter(m => Math.hypot(m.pos.x - p.x, m.pos.y - p.y) > 2000).length;
  check(`肉鸽散怪不绕玩家 (≥1/3 距出生>2000px, 实际 ${far}/${monsters.length})`, far >= monsters.length / 3);
}

// === A-W1/A-W4 门结算 (多门数组: 挑战模式 5 门 / 击杀 ≥1 可撤退) ===
import { portalActive, nearPortal, leaveThroughPortal, PORTAL_INTERACT_RANGE } from '../src/game/portal';
check('门交互距离 56', PORTAL_INTERACT_RANGE === 56);
function portalState(portals?: { x: number; y: number; bossType: string; used: boolean }[]) {
  return {
    run: { portals: portals ?? [] },
    player: { pos: { x: 0, y: 0 }, size: { w: 32, h: 32 } },
  };
}
check('无门 → 不可交互', portalActive(portalState() as never) === false);
const p0 = { x: 30, y: 0, bossType: 'pumpking', used: false };
check('Boss 已杀门在场 → 可交互', portalActive(portalState([p0]) as never) === true);
const pUsed = { x: 30, y: 0, bossType: 'pumpking', used: true };
check('全部门已使用 → 不可交互', portalActive(portalState([pUsed]) as never) === false);
check('玩家在任一门前 → near', nearPortal(portalState([p0, pUsed]) as never) === true);
const pFar = { x: 500, y: 0, bossType: 'pumpking', used: false };
check('玩家远离所有门 → 不 near', nearPortal(portalState([pFar]) as never) === false);
const s = portalState([p0, pUsed]) as never;
leaveThroughPortal(s as never);
check('回城 → 全部门标记已使用', (s as { run: { portals: { used: boolean }[] } }).run.portals.every(p => p.used));

// === A-W3 怪物机制包 ===
import { MECH_TYPES, MECH_NAMES, rollMech, SHIELD_UP_T, SHIELD_DOWN_T, THORNS_REFLECT, CURSE_SLOW_MULT, EXPLODE_HP_THRESHOLD } from '../src/game/mech';
check('机制 ×5 类型', MECH_TYPES.length === 5);
check('机制类型唯一', new Set(MECH_TYPES).size === 5);
check('机制名齐全', ['shield', 'explode', 'thorns', 'curse', 'death_trigger'].every(m => MECH_TYPES.includes(m as 'shield')));
for (const m of MECH_TYPES) check(`机制 ${m} 有名`, typeof MECH_NAMES[m] === 'string' && MECH_NAMES[m].length > 0);
check('rollMech 在池内', MECH_TYPES.includes(rollMech(() => 0.9)));
check('护盾周期 2s 开盾', SHIELD_UP_T === 2.0 && SHIELD_DOWN_T === 2.0);
check('荆棘反伤 20%', THORNS_REFLECT === 0.2);
check('诅咒减速 40%', CURSE_SLOW_MULT === 0.6);
check('自爆阈值 25% 血', EXPLODE_HP_THRESHOLD === 0.25);
// 精英/领主挂载验证: spawnCamp 的精英带机制
const mechCamp = spawnCamp(makeStubState() as never, { x: 10240, y: 5760, type: 'aura' }, pickForest);
check('营地精英带机制', mechCamp.filter(m => m.elite)[0]?.mech !== undefined);
const lordMech = spawnMonster(makeStubState() as never, 'slime', undefined, { forceElite: true, eliteAura: 'haste' });
check('forceElite 怪物带机制', lordMech.mech !== undefined);
const plainM = spawnMonster(makeStubState() as never, 'slime', undefined, {});
check('白怪不带机制', plainM.mech === undefined);

// === MM-FIX7 Boss 按模式锚定 + 远处墙校验 ===
{
  // at 锚点远离玩家: 校验墙须合并锚点 chunk 墙 (否则 Boss 落进远处墙内)
  const farWalls = generateChunkWalls(19, 5, 0.18, 'linear');
  const st = makeStubState() as never;
  (st as { world: { walls: unknown[] } }).world.walls = generateChunkWalls(0, 5, 0.18, 'linear');
  (st as { run: { mode: string; theme: string } }).run.mode = 'linear';
  let hitWall = 0;
  for (let i = 0; i < 60; i++) {
    const b = spawnMonster(st, 'war_pharaoh', { x: 20160, y: 5760 });
    if (farWalls.some(w => aabbOverlap(b.pos.x, b.pos.y, b.size.w, b.size.h, w.pos.x, w.pos.y, w.size.w, w.size.h))) hitWall++;
  }
  check('Boss 锚点远处落点不撞锚点 chunk 墙 (0/60)', hitWall === 0);
  // linear 锚点 = 主轴右端 (world.ts 无导出锚点函数; 断言 spawnMonster 接受 at 且不崩)
  const centerBoss = spawnMonster(st, 'war_pharaoh', { x: 10240, y: 5760 });
  check('锚点中央 Boss 生成 ok', centerBoss.hp > 0);
}

// === Review 回归: 派生怪标记 / fleeT / bossLike 初始值 ===
check('spawn 默认非派生', plainM.spawned === false);
check('spawn 默认 fleeT 0', plainM.fleeT === 0);
check('spawn 默认 bossLike false', plainM.bossLike === false);
// 营地精英带 bossLike=false (只有 extract 外层 Boss 手动置 true)
check('营地精英非 bossLike', spawnCamp(makeStubState() as never, { x: 10240, y: 5760, type: 'aura' }, pickForest).filter(m => m.elite)[0].bossLike === false);

// === A-W3 诅咒清除: 翻滚解 debuff ===
import { startDodge } from '../src/game/player';
const cursedState = makeStubState() as never as { player: { curseT: number; dodgeCd: number; dodgeT: number } };
cursedState.player.curseT = 1.0;
cursedState.player.dodgeCd = 0;
cursedState.player.dodgeT = 0;
startDodge(cursedState as never);
check('翻滚清除诅咒', cursedState.player.curseT === 0);
check('翻滚进入无敌帧', cursedState.player.dodgeT > 0);

// === A-W3 移动 AI (领主专属) ===
import { MOVE_AIS, MOVE_AI_NAMES, rollMoveAI, LEAP_WINDUP, LEAP_CD, BURROW_CD, BURROW_TIME, FLEE_HP_THRESHOLD, STRAFE_RADIUS } from '../src/game/moveai';
check('移动 AI ×4', MOVE_AIS.length === 4);
check('移动 AI 唯一', new Set(MOVE_AIS).size === 4);
check('移动 AI 名齐全', ['strafe', 'leap', 'burrow', 'flee'].every(m => MOVE_AIS.includes(m as 'strafe')));
for (const m of MOVE_AIS) check(`移动 AI ${m} 有名`, typeof MOVE_AI_NAMES[m] === 'string' && MOVE_AI_NAMES[m].length > 0);
check('rollMoveAI 在池内', MOVE_AIS.includes(rollMoveAI(() => 0.5)));
check('扑击预警 0.4s', LEAP_WINDUP === 0.4);
check('扑击 CD 4s', LEAP_CD === 4.0);
check('遁地 CD 5s / 持续 1.6s', BURROW_CD === 5.0 && BURROW_TIME === 1.6);
check('逃窜阈值 30%', FLEE_HP_THRESHOLD === 0.3);
check('侧移半径 150', STRAFE_RADIUS === 150);

// === A-W3 包3 Boss 技能 ===
import { BOSS_SKILLS3, BOSS_SKILL3_NAMES, rollBossSkill3, SPIRAL_BULLETS, NOVA_BULLETS, LASER_WINDUP, ENRAGE_HP } from '../src/game/mech';
check('Boss 技能包3 ×5', BOSS_SKILLS3.length === 5);
check('Boss 技能唯一', new Set(BOSS_SKILLS3).size === 5);
check('Boss 技能名齐全', ['spiral', 'laser', 'nova', 'summon_elites', 'enrage'].every(s => BOSS_SKILLS3.includes(s as 'spiral')));
for (const s of BOSS_SKILLS3) check(`Boss 技能 ${s} 有名`, typeof BOSS_SKILL3_NAMES[s] === 'string' && BOSS_SKILL3_NAMES[s].length > 0);
check('rollBossSkill3 在池内', BOSS_SKILLS3.includes(rollBossSkill3(() => 0.25)));
check('螺旋 8 发/圈', SPIRAL_BULLETS === 8);
check('新星 14 发', NOVA_BULLETS === 14);
check('激光预警 0.8s', LASER_WINDUP === 0.8);
check('狂暴阈值 30%', ENRAGE_HP === 0.3);
// Boss spawn 时带 skill3 (非 Boss 不带)
const bossM = spawnMonster(makeStubState() as never, 'pumpking');
check('Boss 带 skill3', bossM.skill3 !== undefined);
check('Boss 带原 bossSkill', MONSTER_DEFS.pumpking.bossSkill === 'summon');
check('小怪不带 skill3', spawnMonster(makeStubState() as never, 'slime', undefined, {}).skill3 === undefined);

// === 地图审查 P1: 敌弹撞墙 (墙 = 掩体) ===
import { updateEnemyProj, getEnemyProj, type EnemyProjectile } from '../src/game/monster';
function projState() {
  const s = makeStubState();
  return {
    ...s,
    player: { ...s.player, size: { w: 32, h: 32 }, dodgeT: 0, reviveInvuln: 0 },
    world: {
      w: s.world.w, h: s.world.h,
      walls: [{ pos: { x: 500, y: 0 }, size: { w: 128, h: 128 } }],
    },
    cameraShake: 0,
    lastKiller: null,
    fx: { ...s.fx, enemyProj: [] as EnemyProjectile[] },
  } as never;
}
const sA = projState();
(sA as { fx: { enemyProj: EnemyProjectile[] } }).fx.enemyProj.push({ pos: { x: 430, y: 64 }, vel: { x: 200, y: 0 }, size: { w: 12, h: 12 }, dmg: 5, life: 2, fromId: 1 });
updateEnemyProj(sA, 0.5); // 移动 100px → x=530 ∈ 墙 [500,628] → 销毁 + 火花
check('敌弹撞墙消失', getEnemyProj(sA).length === 0);
const sB = projState();
(sB as { fx: { enemyProj: EnemyProjectile[] } }).fx.enemyProj.push({ pos: { x: 300, y: 64 }, vel: { x: 100, y: 0 }, size: { w: 12, h: 12 }, dmg: 5, life: 2, fromId: 1 });
updateEnemyProj(sB, 0.5); // x=350, 墙外 → 存活
check('无阻挡弹幕存活', getEnemyProj(sB).length === 1);

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);