// game/character/ 桶单测 (PR #3 / T5-a, 2026-08-13)
// 验证 character/ 子模块聚合后纯函数行为不变: expNext 曲线 / gainExp 升级路径 /
// usePotion hp+mp 路径 / startDodge 无敌窗口 / deathGoldPenalty 软硬核分支 /
// passiveSnapshot 数值映射 + 防御空 levels。
//
// 运行: npm test

import {
  expNext,
  gainExp,
  usePotion,
  startDodge,
  MAX_HP,
  MAX_MP,
  POTION_HP_HEAL,
  POTION_MP_HEAL,
  DODGE_DURATION,
  DODGE_CD,
  EXP_PER_LEVEL_ATTR,
  baseCombat,
  emptyRes,
  DAMAGE_TYPES,
  passiveSnapshot,
  recomputePassives,
  passiveLevel,
  passivePointsSpent,
  PASSIVE_DEFS,
  PASSIVE_IDS,
  assignPassivePoint,
  deathSummary,
  deathGoldPenalty,
} from '../src/game/character';

let failures = 0;
function eq(name: string, got: unknown, want: unknown): void {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    failures++;
  } else console.log(`ok  ${name}: ${JSON.stringify(want)}`);
}

// 构造最小 GameState stub (满足 commands 函数只读字段)
function makeState(overrides: Partial<{
  hp: number; mp: number; level: number; exp: number;
  potionCd: number; potions: { hp: number; mp: number };
  dodgeCd: number; dodgeT: number; curseT: number;
  difficulty: 'normal' | 'hardcore' | 'nightmare' | 'hell';
  classId: 'barbarian' | 'paladin' | 'mage' | 'necromancer' | 'ranger' | 'assassin';
  skillPoints: number;
}> = {}) {
  return {
    player: {
      hp: overrides.hp ?? 50,
      mp: overrides.mp ?? 50,
      level: overrides.level ?? 1,
      exp: overrides.exp ?? 0,
      potionCd: overrides.potionCd ?? 0,
      potions: overrides.potions ?? { hp: 2, mp: 2 },
      dodgeCd: overrides.dodgeCd ?? 0,
      dodgeT: overrides.dodgeT ?? 0,
      curseT: overrides.curseT ?? 0,
      classId: overrides.classId ?? 'barbarian',
      skillPoints: overrides.skillPoints ?? 0,
      pos: { x: 0, y: 0 },
      size: { w: 0, h: 0 },
      combat: { attr: 0, physPct: 0, elemPct: 0, critRate: 0.05, critBonus: 0, shred: 0, vuln: 0, lifesteal: 0, res: emptyRes() },
      facing: { x: 0, y: 0 },
      idleT: 0,
      flipDir: 'N',
      equipped: {},
      gold: 0,
      speed: 0,
      passives: {},
      hpMax: MAX_HP,
      mpMax: MAX_MP,
      mpRegen: 0,
      speedMult: 1,
      reviveInvuln: 0,
    },
    difficulty: overrides.difficulty ?? 'normal',
    combat: { levelUpFlash: 0, killsTotal: 0, combo: { count: 0, timer: 0 }, lastKiller: null },
    fx: { fireballs: [], monsters: [], vfx: [], pools: [], dmgNums: [], deathFx: [], swings: [], loot: [], owned: [], toasts: [], enemyProj: [], envFx: [] },
    world: { walls: [], w: 1000, h: 1000 },
  } as any;
}

// === base.ts 常量 (从原 player.ts line 13-21) ===
eq('MAX_HP=100', MAX_HP, 100);
eq('MAX_MP=100', MAX_MP, 100);
eq('POTION_HP_HEAL=30', POTION_HP_HEAL, 30);
eq('POTION_MP_HEAL=80', POTION_MP_HEAL, 80);
eq('DODGE_DURATION=0.2', DODGE_DURATION, 0.2);
eq('DODGE_CD=1.2', DODGE_CD, 1.2);
eq('EXP_PER_LEVEL_ATTR=5', EXP_PER_LEVEL_ATTR, 5);

// === expNext 曲线 (D-05) ===
eq('expNext(1)=100', expNext(1), 100);
eq('expNext(2)=282', expNext(2), 282);
eq('expNext(10)=3162', expNext(10), 3162);
eq('expNext(50)=35355', expNext(50), 35355);

// === baseCombat / emptyRes / DAMAGE_TYPES ===
{
  const c = baseCombat();
  eq('baseCombat.attr=0', c.attr, 0);
  eq('baseCombat.critRate=0.05', c.critRate, 0.05);
  eq('baseCombat res 7 系', Object.keys(c.res).length, 7);
  const empty = emptyRes();
  eq('emptyRes 7 系', Object.keys(empty).length, 7);
  eq('DAMAGE_TYPES 含物理', DAMAGE_TYPES.includes('physical'), true);
}

// === gainExp: 升级路径 ===
{
  // Lv1, exp=0 → 加 100 = 刚好升 1 级
  const st = makeState({ level: 1, exp: 0 });
  // gainExp 需要 pushToast / playSfxClient / classAttrWeight, 用 stub 替代 (下文第 1 个测试用最小 stub)
  // 这里需要更完整的 mock: 通过覆盖 stub, 我们让 pushToast / playSfx 不调用真实模块
  // 简化: 直接覆盖 player.level 为 1, exp 0, 升级阈值 = 100
  const ups = gainExp(st, 100);
  eq('gainExp 100xp = 1 级', ups, 1);
  eq('升后 level=2', st.player.level, 2);
  eq('升后 exp 归零 (100-100)', st.player.exp, 0);
  eq('升后 +5 skillPoints', st.player.skillPoints, 5);
  eq('升后 hp 满血', st.player.hp, MAX_HP);

  // 不够升级
  const st2 = makeState({ level: 1, exp: 0 });
  const ups2 = gainExp(st2, 50);
  eq('gainExp 50xp = 0 级', ups2, 0);
  eq('升后 level 仍 1', st2.player.level, 1);
  eq('升后 exp=50', st2.player.exp, 50);
}

// === usePotion ===
{
  // HP 不足时喝 HP 药
  const st = makeState({ hp: 50, mp: 50, potions: { hp: 2, mp: 2 } });
  const ok = usePotion(st, 'hp');
  eq('喝 HP 药成功', ok, true);
  eq('hp=min(100, 50+30)=80', st.player.hp, 80);
  eq('hp 药瓶 -1', st.player.potions.hp, 1);

  // HP 已满, 仍可喝但 hp 不变
  const st2 = makeState({ hp: MAX_HP, potions: { hp: 1, mp: 0 } });
  usePotion(st2, 'hp');
  eq('满血喝 HP = 仍 100', st2.player.hp, MAX_HP);

  // MP 路径
  const st3 = makeState({ mp: 20, potions: { hp: 0, mp: 1 } });
  usePotion(st3, 'mp');
  eq('mp=min(100, 20+80)=100', st3.player.mp, MAX_MP);

  // 药水耗尽拒绝
  const st4 = makeState({ potions: { hp: 0, mp: 0 } });
  const ok4 = usePotion(st4, 'hp');
  eq('hp 药=0 拒绝', ok4, false);

  // 冷却中拒绝
  const st5 = makeState({ potionCd: 1.5 });
  const ok5 = usePotion(st5, 'hp');
  eq('potionCd>0 拒绝', ok5, false);

  // 硬核拒绝 (D-09)
  const st6 = makeState({ difficulty: 'hardcore', potions: { hp: 5, mp: 5 } });
  const ok6 = usePotion(st6, 'hp');
  eq('硬核拒绝药水', ok6, false);
}

// === startDodge ===
{
  const st = makeState({ dodgeCd: 0, dodgeT: 0, curseT: 2.5 });
  const ok = startDodge(st);
  eq('startDodge 成功', ok, true);
  eq('dodgeT=DODGE_DURATION=0.2', st.player.dodgeT, DODGE_DURATION);
  eq('dodgeCd=DODGE_CD=1.2', st.player.dodgeCd, DODGE_CD);
  eq('curseT 被清零', st.player.curseT, 0);

  // 冷却中拒绝
  const st2 = makeState({ dodgeCd: 0.5 });
  const ok2 = startDodge(st2);
  eq('dodgeCd>0 拒绝', ok2, false);
}

// === passiveSnapshot (纯函数, 等价表) ===
{
  const z = passiveSnapshot({});
  eq('空 levels → hpMax=0', z.hpMax, 0);
  eq('空 levels → speedMult=1', z.speedMult, 1);
  eq('空 levels → critRate=0', z.critRate, 0);

  const snap = passiveSnapshot({ vitality: 4, mana: 2, speed: 10, critRate: 6 });
  eq('vit4 → hpMax=20', snap.hpMax, 20);
  eq('mana2 → mpMax=10', snap.mpMax, 10);
  eq('mana2 → mpRegen=1', snap.mpRegen, 1);
  eq('speed10 → speedMult=1.1', snap.speedMult, 1.1);
  eq('critRate6 → critRate=0.03', snap.critRate, 0.03);
  eq('critRate6 → lifesteal=0 (默认)', snap.lifesteal, 0);
}

// === recomputePassives 幂等性 + 数值映射 ===
{
  const host: any = {
    player: {
      passives: { vitality: 2, mana: 4 },
      combat: baseCombat(),
      skillPoints: 10,
    },
  };
  recomputePassives(host);
  eq('recompute hpMax=100+10=110', host.player.hpMax, 110);
  eq('recompute mpMax=100+20=120', host.player.mpMax, 120);
  eq('recompute mpRegen=4*0.5=2', host.player.mpRegen, 2);
  eq('recompute speedMult=1', host.player.speedMult, 1);
  // 再次调用: 应是幂等 (同输入产生同输出)
  recomputePassives(host);
  eq('幂等 hpMax=110', host.player.hpMax, 110);
  eq('幂等 mpMax=120', host.player.mpMax, 120);
}

// === passiveLevel / passivePointsSpent ===
{
  const host: any = { player: { passives: { vitality: 3, mana: 5, speed: 0 } } };
  eq('passiveLevel vitality', passiveLevel(host, 'vitality'), 3);
  eq('passiveLevel 未分配=0', passiveLevel(host, 'speed'), 0);
  eq('passivePointsSpent=8', passivePointsSpent(host), 8);
}

// === PASSIVE_DEFS / PASSIVE_IDS 完整性 ===
eq('PASSIVE_IDS 长度=10', PASSIVE_IDS.length, 10);
eq('vitality maxLevel=20', PASSIVE_DEFS.vitality.maxLevel, 20);
eq('resist perLv 含 全抗', PASSIVE_DEFS.resist.perLv.includes('全抗'), true);

// === assignPassivePoint: 分配 + 满级拒绝 + 无点拒绝 ===
{
  const host: any = {
    player: {
      passives: { vitality: 0 },
      combat: baseCombat(),
      hpMax: 100,
      mpMax: 100,
      mpRegen: 0,
      speedMult: 1,
      skillPoints: 3,
    },
  };
  const err1 = assignPassivePoint(host, 'vitality');
  eq('分配成功 err=null', err1, null);
  eq('分配后 level=1', host.player.passives.vitality, 1);
  eq('分配后 skillPoints=2', host.player.skillPoints, 2);

  // 满级拒绝
  host.player.passives.vitality = 20;
  const err2 = assignPassivePoint(host, 'vitality');
  eq('满级拒绝 (非 null)', err2 !== null, true);

  // 无技能点
  host.player.passives.vitality = 5;
  host.player.skillPoints = 0;
  const err3 = assignPassivePoint(host, 'vitality');
  eq('无技能点拒绝 (非 null)', err3 !== null, true);
}

// === deathGoldPenalty (从原 deathSettle.ts) ===
eq('town 25%', deathGoldPenalty(1000, 'town', false), 250);
eq('revive 10%', deathGoldPenalty(1000, 'revive', false), 100);
eq('rerun 0%', deathGoldPenalty(1000, 'rerun', false), 0);
eq('硬核回城=0', deathGoldPenalty(5000, 'town', true), 0);
eq('负金保护', deathGoldPenalty(-10, 'town', false), 0);

// === deathSummary ===
{
  const s = {
    player: { level: 12, gold: 345 },
    combat: {
      killsTotal: 88,
      combo: { count: 7 },
      lastKiller: 'void_overlord',
    },
    difficulty: 'hardcore',
  };
  const ds = deathSummary(s);
  eq('deathSummary.level', ds.level, 12);
  eq('deathSummary.kills', ds.kills, 88);
  eq('deathSummary.maxCombo', ds.maxCombo, 7);
  eq('deathSummary.gold', ds.gold, 345);
  eq('deathSummary.hardcore=true', ds.hardcore, true);
  eq('deathSummary.killer', ds.killer, 'void_overlord');
}

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);