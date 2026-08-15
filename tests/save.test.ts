// 读档分派单测: 继续游戏 → 一律回城镇, 再经传送门/地下城入口出发 (GAME_FLOW §3)
// 运行: npm test

import { resumeFromSave, restoreCharacter } from '../src/app/save';
import { getOwned } from '../src/game/inventory';
import { getSkill } from '../src/game/skill';
import { baseCombat } from '../src/game/combat';
import { pageOf, pageCount, cellIndex } from '../src/game/uigrid';
import type { GameState, Screen } from '../src/game/state';
import type { TownId } from '../src/game/town';
import type { SaveData } from '../src/ipc/save';

let failures = 0;
function check(name: string, cond: boolean): void {
  if (cond) console.log(`ok  ${name}`);
  else { failures++; console.log(`FAIL ${name}`); }
}

/** 最小状态桩: resumeFromSave 只触碰 mode/townPanel/player.pos/screen/townId */
function mkState(): GameState {
  return {
    screen: 'title' as Screen,
    mode: 'dungeon',
    townPanel: { kind: 'merchant' },
    townId: 'greenwing' as TownId,
    player: { pos: { x: 0, y: 0 } },
    run: {},
  } as unknown as GameState; // 测试桩: 未覆盖字段不会被 resumeFromSave 访问
}

// 上次在地牢存档: 也必须回城镇 (本次修复的核心)
{
  const s = mkState();
  resumeFromSave(s, { scene: 'dungeon' });
  check('dungeon 存档 → mode=town', s.mode === 'town');
  check('dungeon 存档 → screen=town', s.screen === 'town');
  check('dungeon 存档 → 出生点 (560,500)', s.player.pos.x === 560 && s.player.pos.y === 500);
  check('dungeon 存档 → 城镇面板关闭', s.townPanel === null);
}

// 上次在城镇存档: 行为保持
{
  const s = mkState();
  resumeFromSave(s, { scene: 'town' });
  check('town 存档 → mode=town', s.mode === 'town');
  check('town 存档 → screen=town', s.screen === 'town');
}

// 旧档无 scene 字段 (v11 之前): 同样回城镇
{
  const s = mkState();
  resumeFromSave(s, {});
  check('无 scene 旧档 → mode=town', s.mode === 'town');
  check('无 scene 旧档 → screen=town', s.screen === 'town');
}

// A-W5: 读档 = 新会话, 肉鸽局内快照作废 (防残留污染下一个角色)
{
  const s = mkState();
  (s as unknown as { run: { rogueSnapshot: { level: number } } }).run.rogueSnapshot = { level: 40 };
  resumeFromSave(s, { scene: 'town' });
  check('读档 → 肉鸽快照已清空 (防残留)', (s as unknown as { run: { rogueSnapshot: unknown } }).run.rogueSnapshot === null);
}

// 完整还原: 装备栏/背包/技能点/被动点/属性点/药水瓶 一次读档全部回来 (2026-08-16)
function mkCharState(): GameState {
  return {
    player: {
      classId: 'barbarian', playTime: 0,
      pos: { x: 0, y: 0 }, hp: 100, mp: 100,
      facing: { x: 0, y: 0 }, gold: 0, level: 1, skillPoints: 0, exp: 0,
      potions: { hp: 3, mp: 3 }, equipped: {}, combat: baseCombat(), passives: {},
      hpMax: 100, mpMax: 100, mpRegen: 0, speedMult: 1,
    },
    fx: { owned: [] },
    equip: { materials: {}, sel: 0, selEquipped: null },
    combat: { score: 0 },
    theme: 'forest', difficulty: 'normal', run: { mode: 'linear' }, townId: 'greenwing',
  } as unknown as GameState;
}

const sampleSave: SaveData = {
  player_x: 560, player_y: 500, player_hp: 75, player_mp: 40,
  facing_x: 1, facing_y: 0, score: 42, world_w: 20480, world_h: 11520,
  level: 7, gold: 123, class: 'mage', town: 'harbor',
  theme: 'desert', difficulty: 'nightmare', mode: 'gauntlet', scene: 'dungeon', play_time: 8888,
  attr: 15, potions_hp: 1, potions_mp: 2,
  skill_points: 6, exp: 1800,
  owned: [
    { name: '烈焰之牙', rarity: 'set', eq_type: 'weapon', setName: 'flame_set', affixes: [{ stat: 'physPct', value: 0.4 }, { stat: 'res', value: 12, element: 'fire' }] },
    { name: '钢甲', rarity: 'rare', eq_type: 'armor', affixes: [{ stat: 'hp', value: 30 }] },
  ],
  equipped: [{ slot: 'ring', item: { name: '暗影之戒', rarity: 'rare', eq_type: 'ring', affixes: [{ stat: 'critBonus', value: 20 }] } }],
  runes: [{ slot: 'Q', rune: 'split' }],
  skill_levels: [{ slot: 'Q', level: 5 }],
  materials: [['iron_shard', 2]],
  passives: [['critRate', 3]],
};

{
  const s = mkCharState();
  restoreCharacter(s, sampleSave);
  check('背包还原 2 件', getOwned(s).length === 2);
  check('背包第 1 件名称', getOwned(s)[0].name === '烈焰之牙');
  check('背包第 1 件类型 weapon', getOwned(s)[0].type === 'weapon');
  check('背包词条 physPct=0.4', Math.abs(getOwned(s)[0].affixes[0].value - 0.4) < 0.0001);
  check('背包套装名', getOwned(s)[0].setName === 'flame_set');
  check('装备栏 ring 还原', s.player.equipped.ring?.name === '暗影之戒');
  check('装备栏 ring 词条 critBonus=20', Math.abs((s.player.equipped.ring?.affixes ?? [])[0]?.value - 20) < 0.0001);
  check('技能点还原 6', s.player.skillPoints === 6);
  check('技能等级 Q=5', getSkill('Q').level === 5);
  check('符文 Q=split', getSkill('Q').rune === 'split');
  check('被动点还原 critRate=3', s.player.passives.critRate === 3);
  check('被动效果生效 critRate≈0.065 (基础 0.05 + 被动 0.015)', Math.abs(s.player.combat.critRate - 0.065) < 0.0001);
  check('穿戴聚合 critBonus=20', Math.abs(s.player.combat.critBonus - 20) < 0.0001);
  check('属性点还原 attr=15 (聚合后回写)', s.player.combat.attr === 15);
  check('药水瓶还原 hp=1/mp=2', s.player.potions.hp === 1 && s.player.potions.mp === 2);
  check('材料还原 iron_shard=2', s.equip.materials.iron_shard === 2);
  check('金币/等级还原', s.player.gold === 123 && s.player.level === 7);
  check('职业/主题/难度/模式还原', s.player.classId === 'mage' && s.theme === 'desert' && s.difficulty === 'nightmare' && s.run.mode === 'gauntlet');
  check('装备面板选中已重置', s.equip.sel === -1 && s.equip.selEquipped === null);
  // 回归 (2026-08-16): sel=-1 时背包网格仍须渲染 owned 物品 (pageOf 负数 clamp 到页 0)
  const pc = Math.min(pageOf(s.equip.sel), pageCount(getOwned(s).length) - 1);
  const idx0 = cellIndex(0, 0, pc, getOwned(s).length);
  const idx1 = cellIndex(1, 0, pc, getOwned(s).length);
  check('sel=-1 仍渲染背包首格 (idx=0)', idx0 === 0);
  check('sel=-1 仍渲染背包第 2 格 (idx=1)', idx1 === 1);
}

if (failures > 0) {
  console.log(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);