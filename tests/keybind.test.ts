// 键位模块单测 (P3-10): 默认布局 / 匹配 / 技能反查 / 持久化 (localStorage stub)
// 运行: npm test

import { DEFAULT_KEYBINDS, normKey, keyMatch, skillSlotByKey, keyLabel, loadKeybinds, saveKeybinds, resetKeybinds, keyHintMainText, keyHintSkillsText } from '../src/game/keybind';

// Node 无 localStorage: stub (loadKeybinds 内 try/catch 兜底, 此处验证读写路径)
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
};

let failures = 0;
function check(name: string, cond: boolean): void {
  if (!cond) { console.error(`FAIL ${name}`); failures++; }
  else console.log(`ok  ${name}`);
}
function eq(name: string, got: unknown, want: unknown): void {
  if (got !== want) {
    console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    failures++;
  } else console.log(`ok  ${name}`);
}

// === 归一与显示 ===
eq('Space 归一为空格', normKey(' '), ' ');
eq('Tab 归一小写', normKey('Tab'), 'tab');
eq('大写字母归一', normKey('Q'), 'q');
eq('Space 显示 Space', keyLabel(' '), 'Space');
eq('tab 显示 Tab', keyLabel('tab'), 'Tab');
eq('字母大写显示', keyLabel('f'), 'F');

// === 匹配 ===
check('keyMatch 忽略大小写', keyMatch({ key: 'Q' }, 'q'));
check('keyMatch 空格', keyMatch({ key: ' ' }, ' '));
check('keyMatch 不匹配', !keyMatch({ key: 'w' }, 'q'));
check('keyMatch repeat 拒绝', !keyMatch({ key: ' ', repeat: true }, ' ', { repeat: false }));
check('keyMatch repeat 允许', keyMatch({ key: ' ', repeat: true }, ' '));

// === 技能反查 ===
const kb = loadKeybinds();
eq('默认 Q 槽绑 q', kb.skills.Q, 'q');
eq('默认 W 槽绑 f (避 WASD)', kb.skills.W, 'f');
eq('默认 E 槽绑 e', kb.skills.E, 'e');
eq('默认 R 槽绑 r', kb.skills.R, 'r');
eq('按 q 命中 Q 槽', skillSlotByKey({ key: 'q' }, kb), 'Q');
eq('按 F 命中 W 槽', skillSlotByKey({ key: 'F' }, kb), 'W');
eq('按 e 命中 E 槽', skillSlotByKey({ key: 'e' }, kb), 'E');
eq('按 r 命中 R 槽', skillSlotByKey({ key: 'r' }, kb), 'R');
eq('按 1 无技能命中', skillSlotByKey({ key: '1' }, kb), null);
eq('默认翻滚 Space', kb.dodge, ' ');
eq('默认药水 1/2', kb.potionHp + kb.potionMp, '12');
eq('默认交互 e', kb.interact, 'e');
eq('默认装备 tab', kb.equip, 'tab');
eq('默认角色信息 c', kb.info, 'c');

// === 持久化: 改键 → 保存 → 重载 ===
{
  const k2 = loadKeybinds();
  k2.dodge = 'shift';
  k2.skills.Q = 'x';
  saveKeybinds(k2);
  const k3 = loadKeybinds();  // 缓存命中
  eq('改键后翻滚 shift', k3.dodge, 'shift');
  eq('改键后 Q=x', k3.skills.Q, 'x');
  eq('未改项保留', k3.skills.R, 'r');
  eq('按 shift 命中翻滚', keyMatch({ key: 'Shift' }, loadKeybinds().dodge), true);
  // 重置
  const k4 = resetKeybinds();
  eq('重置后翻滚 Space', k4.dodge, DEFAULT_KEYBINDS.dodge);
  eq('重置后 Q=q', k4.skills.Q, DEFAULT_KEYBINDS.skills.Q);
}

// === 提示文本 (TS-010): keyHintMainText/keyHintSkillsText 跟随键位自定义 ===
{
  resetKeybinds();
  const kb = loadKeybinds();
  const hint = keyHintMainText(kb);
  eq('默认提示含 Q/F/E/R', hint.split('技能')[0].includes('Q/F/E/R') ? 'yes' : 'no', 'yes');
  check('默认提示含 Space 翻滚', hint.includes('Space'));
  check('默认提示含 Tab 装备', hint.includes('Tab'));
  check('默认提示含 C 角色', hint.includes('C 角色'));
  eq('默认技能行', keyHintSkillsText(kb), 'Q 火球 · F 连发 · E 回血 · R 大招');
  // 改键后提示即时反映
  const k2: typeof kb = {
    ...kb,
    dodge: 'shift',
    equip: 'i',
    skills: { Q: 'x', W: 'y', E: 'z', R: 'v' },
  };
  const h2 = keyHintMainText(k2);
  check('改键后技能提示 X/Y/Z/V', h2.includes('X/Y/Z/V'));
  check('改键后 SHIFT 翻滚', h2.includes('SHIFT'));
  check('改键后装备 I', h2.includes('I'));
  eq('改键后技能行', keyHintSkillsText(k2), 'X 火球 · Y 连发 · Z 回血 · V 大招');
}

if (failures > 0) {
  console.error(`\n${failures} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
process.exit(0);
