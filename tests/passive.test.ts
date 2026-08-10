// 被动技能树单测 (M5 非目标收尾): 数值快照 / 升级分配 / 满级 / 技能点不足
// 运行: npm test

import { PASSIVE_DEFS, PASSIVE_IDS, passiveSnapshot, assignPassivePoint, passiveLevel, recomputePassives, type PassiveHost } from '../src/game/passive';
import { baseCombat } from '../src/game/combat';

let failures = 0;
function eq(name: string, got: number, want: number): void {
  if (Math.abs(got - want) > 0.0001) {
    console.error(`FAIL ${name}: got ${got}, want ${want}`);
    failures++;
  } else console.log(`ok  ${name}: ${got}`);
}
function check(name: string, cond: boolean): void {
  if (!cond) { console.error(`FAIL ${name}`); failures++; }
  else console.log(`ok  ${name}`);
}

function mkHost(skillPoints: number): PassiveHost & { player: { skillPoints: number } } {
  return {
    player: {
      passives: {},
      skillPoints,
      combat: baseCombat(),
      hpMax: 100, mpMax: 100, mpRegen: 0, speedMult: 1,
    },
  };
}

// === 定义完整性 ===
eq('10 个被动槽', PASSIVE_IDS.length, 10);
check('全部被动有定义', PASSIVE_IDS.every(id => PASSIVE_DEFS[id] && PASSIVE_DEFS[id].maxLevel === 20));

// === 数值快照 ===
{
  const snap = passiveSnapshot({});
  eq('空快照 hpMax 0', snap.hpMax, 0);
  eq('空快照 speedMult 1', snap.speedMult, 1);
}
{
  const snap = passiveSnapshot({ vitality: 4, mana: 2, speed: 5 });
  eq('生命 4 级 +20', snap.hpMax, 20);
  eq('法力 2 级 +10', snap.mpMax, 10);
  eq('回蓝 2 级 +1', snap.mpRegen, 1);
  eq('移速 5 级 ×1.05', snap.speedMult, 1.05);
}
{
  const snap = passiveSnapshot({ critRate: 10, critBonus: 10, lifesteal: 10, physPct: 10, elemPct: 10, dodge: 10, resist: 10 });
  eq('暴击 10 级 +5%', snap.critRate, 0.05);
  eq('暴伤 10 级 +30', snap.critBonus, 30);
  eq('吸血 10 级 +3%', snap.lifesteal, 3);
  eq('物理 10 级 +20%', snap.physPct, 0.2);
  eq('元素 10 级 +20%', snap.elemPct, 0.2);
  eq('闪避 10 级 -15%', snap.dodgeReduction, 0.15);
  eq('全抗 10 级 +10', snap.res, 10);
}

// === 升级分配 ===
{
  const h = mkHost(5);
  eq('初始无点', assignPassivePoint(h, 'vitality') === null ? 0 : 1, 0);
  eq('生命 Lv1', passiveLevel(h, 'vitality'), 1);
  eq('技能点 5-1=4', h.player.skillPoints, 4);
  eq('hpMax 100+5', h.player.hpMax, 105);
}
{
  const h = mkHost(0);
  check('无技能点拒绝', assignPassivePoint(h, 'speed') !== null);
  eq('移速仍 0 级', passiveLevel(h, 'speed'), 0);
}
{
  const h = mkHost(50);
  let err = null;
  for (let i = 0; i < 21; i++) err = assignPassivePoint(h, 'resist');
  check('20 级后满级拒绝', err !== null);
  eq('resist Lv20', passiveLevel(h, 'resist'), 20);
}

// === recomputePassives 合并进 combat (幂等) ===
{
  const h = mkHost(10);
  assignPassivePoint(h, 'critRate');
  assignPassivePoint(h, 'physPct');
  assignPassivePoint(h, 'resist');
  const c = h.player.combat;
  eq('combat critRate 0.05+0.005', c.critRate, 0.055);
  eq('combat physPct +2%', c.physPct, 0.02);
  eq('combat res.fire +1', c.res['fire'], 1);
  // 幂等: 再调一次不重复累加
  recomputePassives(h);
  eq('幂等 critRate 仍 0.055', h.player.combat.critRate, 0.055);
  eq('幂等 physPct 仍 0.02', h.player.combat.physPct, 0.02);
}

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);
