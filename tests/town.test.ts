// 城镇经济单测 (OPT-028 药水购买 / 商店)
// 运行: npm test

import { buyPotion, genMerchantStock, POTION_PRICES, warehouseStore, warehouseTake, WAREHOUSE_CAP, type PotionBuySrc, type WarehouseSrc } from '../src/game/town';
import type { Equipment, EquipType } from '../src/game/equipment';

let failures = 0;
function check(name: string, cond: boolean): void {
  if (!cond) { console.error(`FAIL ${name}`); failures++; }
  else console.log(`ok  ${name}`);
}
function eq(name: string, got: number, want: number): void {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${got}, want ${want}`);
    failures++;
  } else console.log(`ok  ${name}: ${want}`);
}
function mk(gold: number, hp = 0, mp = 0): PotionBuySrc {
  return { player: { gold, potions: { hp, mp } } };
}

/** 造一件装备 */
function mkEq(name: string, type: EquipType = 'weapon'): Equipment {
  return {
    id: Math.floor(Math.random() * 1e6),
    name, rarity: 'magic', type,
    pos: { x: 0, y: 0 }, size: { w: 24, h: 24 },
    affixes: [], pickedUp: true,
  };
}

/** 造仓库最小状态: 背包 getOwned 需要 _owned 挂载; recomputeCombat 需 equipped/combat */
function mkWh(backpack: Equipment[], warehouse: Equipment[]): WarehouseSrc & { _owned: Equipment[] } & import('../src/game/equipment').EquipState {
  return {
    _owned: backpack,
    warehouse,
    player: {
      gold: 0, potions: { hp: 0, mp: 0 },
      equipped: {}, hp: 100, mp: 100,
      combat: { phys: 0, elem: 0, elemLv: 0, elemPct: 0, critRate: 0.05, critBonus: 1.5, dmgPct: 0, shred: 0, res: {}, lifesteal: 0 },
    },
  };
}

// === OPT-028 药水购买 ===
eq('HP 药水 40 金', POTION_PRICES.hp, 40);
eq('MP 药水 30 金', POTION_PRICES.mp, 30);
{
  const s = mk(100);
  check('买 HP 成功', buyPotion(s, 'hp'));
  eq('扣金 100-40=60', s.player.gold, 60);
  eq('HP 库存 1', s.player.potions.hp, 1);
}
{
  const s = mk(30);
  check('MP 买得起', buyPotion(s, 'mp'));
  check('HP 买不起 (30<40)', !buyPotion(s, 'hp'));
}
{
  const s = mk(500, 3, 3);
  check('药水满 3 拒买', !buyPotion(s, 'hp'));
  eq('满时金币不扣', s.player.gold, 500);
}
{
  const s = mk(0);
  check('0 金拒买', !buyPotion(s, 'mp'));
}

// === 商店库存 ===
{
  const st = genMerchantStock();
  check('商店 5 件', st.length === 5);
  check('均为装备且定价 >0', st.every(x => x.price > 0));
}

// === C-503 仓库存取 ===
{
  const s = mkWh([mkEq('背包剑'), mkEq('背包盾', 'armor')], []);
  check('存入 0 号成功', warehouseStore(s, 0));
  eq('背包剩 1', s._owned.length, 1);
  eq('仓库 1', s.warehouse.length, 1);
  eq('仓内为背包剑', s.warehouse[0].name, '背包剑');
  check('再存 0 号 (仍有效, 背包 1 项)', warehouseStore(s, 0));
  eq('仓库 2', s.warehouse.length, 2);
  eq('背包空', s._owned.length, 0);
  check('背包空后 0 号存入失败', !warehouseStore(s, 0));
}
{
  const s = mkWh([], [mkEq('仓内戒', 'ring')]);
  check('取回成功', warehouseTake(s, 0));
  eq('仓库空', s.warehouse.length, 0);
  eq('背包 1', s._owned.length, 1);
  check('空仓取回失败', !warehouseTake(s, 0));
}
{
  // 仓库满: 拒绝存入
  const full = Array.from({ length: WAREHOUSE_CAP }, (_, i) => mkEq(`w${i}`));
  const s = mkWh([mkEq('多余')], full);
  check('仓库满拒存', !warehouseStore(s, 0));
  eq('背包仍 1', s._owned.length, 1);
}
{
  // 背包满: 拒绝取回
  const full = Array.from({ length: 20 }, (_, i) => mkEq(`b${i}`));
  const s = mkWh(full, [mkEq('仓件')]);
  check('背包满拒取', !warehouseTake(s, 0));
  eq('仓库仍 1', s.warehouse.length, 1);
}
{
  // 无效索引
  const s = mkWh([], []);
  check('背包空 0 号存入失败', !warehouseStore(s, 0));
}

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);