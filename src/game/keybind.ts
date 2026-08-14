// 操作自定义 (P3-10): 核心键位可改, localStorage 持久化 (webview 本地)
// 默认布局即原硬编码: 技能 Q/F/E/R (W 槽施放键 F) · 药水 1/2 · Space 翻滚 · E 交互 · Tab 装备
// WASD 移动固定 (改移动键会破坏 WASD 心智模型, 不做)

export interface Keybinds {
  dodge: string;        // 翻滚 (e.key 小写归一)
  potionHp: string;
  potionMp: string;
  interact: string;     // 城镇 NPC / 地牢传送门
  equip: string;        // 装备面板 (dungeon/town 内)
  info: string;         // 角色信息面板 (dungeon/town 内)
  skills: Record<'Q' | 'W' | 'E' | 'R', string>;  // 内部槽 → 施放键
}

export const DEFAULT_KEYBINDS: Keybinds = {
  dodge: ' ',
  potionHp: '1',
  potionMp: '2',
  interact: 'e',
  equip: 'tab',
  info: 'c',
  skills: { Q: 'q', W: 'f', E: 'e', R: 'r' },
};

const STORAGE_KEY = 'vb_keybinds_v1';

let cache: Keybinds | null = null;

/** 键位归一: e.key → 小写 (Space 为 ' ', Tab 为 'tab') */
export function normKey(key: string): string {
  return key.toLowerCase();
}

/** 事件键是否命中绑定 (忽略大小写; Shift 组合不影响字母键) */
export function keyMatch(e: { key: string; repeat?: boolean }, bind: string, opts?: { repeat?: boolean }): boolean {
  if (opts?.repeat === false && e.repeat) return false;
  return normKey(e.key) === normKey(bind);
}

export function loadKeybinds(): Keybinds {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Keybinds>;
      cache = {
        dodge: typeof p.dodge === 'string' ? p.dodge : DEFAULT_KEYBINDS.dodge,
        potionHp: typeof p.potionHp === 'string' ? p.potionHp : DEFAULT_KEYBINDS.potionHp,
        potionMp: typeof p.potionMp === 'string' ? p.potionMp : DEFAULT_KEYBINDS.potionMp,
        interact: typeof p.interact === 'string' ? p.interact : DEFAULT_KEYBINDS.interact,
        equip: typeof p.equip === 'string' ? p.equip : DEFAULT_KEYBINDS.equip,
        info: typeof p.info === 'string' ? p.info : DEFAULT_KEYBINDS.info,
        skills: {
          Q: typeof p.skills?.Q === 'string' ? p.skills.Q : DEFAULT_KEYBINDS.skills.Q,
          W: typeof p.skills?.W === 'string' ? p.skills.W : DEFAULT_KEYBINDS.skills.W,
          E: typeof p.skills?.E === 'string' ? p.skills.E : DEFAULT_KEYBINDS.skills.E,
          R: typeof p.skills?.R === 'string' ? p.skills.R : DEFAULT_KEYBINDS.skills.R,
        },
      };
      return cache;
    }
  } catch {
    /* localStorage 不可用时回落默认 */
  }
  cache = { ...DEFAULT_KEYBINDS, skills: { ...DEFAULT_KEYBINDS.skills } };
  return cache;
}

export function saveKeybinds(kb: Keybinds): void {
  cache = kb;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kb));
  } catch {
    /* 忽略持久化失败 */
  }
}

export function resetKeybinds(): Keybinds {
  saveKeybinds({ ...DEFAULT_KEYBINDS, skills: { ...DEFAULT_KEYBINDS.skills } });
  return cache as Keybinds;
}

/** 技能键: 输入事件键 → 命中的内部槽 (无命中返回 null) */
export function skillSlotByKey(e: { key: string }, kb: Keybinds): 'Q' | 'W' | 'E' | 'R' | null {
  const k = normKey(e.key);
  for (const slot of ['Q', 'W', 'E', 'R'] as const) {
    if (kb.skills[slot] === k) return slot;
  }
  return null;
}

/** 显示用键位标签 (Space/Tab 转可读名) */
export function keyLabel(bind: string): string {
  if (bind === ' ') return 'Space';
  if (bind === 'tab') return 'Tab';
  if (bind === 'escape') return 'Esc';
  return bind.toUpperCase();
}

/** 标题底部键位提示 (TS-010): 纯函数, 键位自定义后即时反映; main.ts keyHintMain 委托 */
export function keyHintMainText(kb: Keybinds): string {
  return `WASD 移动 · 左/右键 攻击 · ${keyLabel(kb.skills.Q)}/${keyLabel(kb.skills.W)}/${keyLabel(kb.skills.E)}/${keyLabel(kb.skills.R)} 技能 · ${keyLabel(kb.dodge)} 翻滚 · ${keyLabel(kb.potionHp)}/${keyLabel(kb.potionMp)} 药水 · ${keyLabel(kb.equip)} 装备 · ${keyLabel(kb.info)} 角色 · ${keyLabel(kb.interact)} 交互 · Esc 暂停`;
}

/** 设置面板技能名行 (TS-010): 键位动态, 与 keyHintMainText 同源 */
export function keyHintSkillsText(kb: Keybinds): string {
  return `${keyLabel(kb.skills.Q)} 火球 · ${keyLabel(kb.skills.W)} 连发 · ${keyLabel(kb.skills.E)} 回血 · ${keyLabel(kb.skills.R)} 大招`;
}
