// 内容清单 (OPT-033): 数据表集中登记 + 一致性校验
// 目标: 新增内容 (怪/主题/Boss/符文/套装) 只改各自数据表, 校验函数保证引用不悬空

import { MONSTER_DEFS, THEME_MONSTER_POOL, THEME_BOSS, type MonsterType } from '../monster';
import { DIFFICULTIES } from '../difficulty';
import { SET_BONUSES, RARITY_VALUE_MULT } from '../equipment';
import { RUNE_DEFS, RUNE_FAMILIES } from '../rune';
import { THEMES } from '../state';

/** 全表一致性校验: 返回问题列表 (空 = 健康) */
export function validateContent(): string[] {
  const issues: string[] = [];
  // 主题池/Boss 引用必须存在
  for (const t of THEMES) {
    for (const m of THEME_MONSTER_POOL[t]) {
      if (!MONSTER_DEFS[m]) issues.push(`主题 ${t} 池引用不存在的怪物: ${m}`);
    }
    const boss = THEME_BOSS[t];
    if (!MONSTER_DEFS[boss]) issues.push(`主题 ${t} 缺少有效 Boss: ${boss}`);
  }
  // 难度档必须与表一致
  if (DIFFICULTIES.length !== 5) issues.push(`难度档数异常: ${DIFFICULTIES.length}`);
  // 套装/稀有度分层必须成对存在
  for (const s of Object.keys(SET_BONUSES)) {
    if (!s) issues.push('存在空套装名');
  }
  if (Object.keys(RARITY_VALUE_MULT).length !== 5) issues.push('稀有度倍率表非 5 档');
  // 符文族引用必须存在
  for (const [fam, pool] of Object.entries(RUNE_FAMILIES)) {
    for (const r of pool) {
      if (!RUNE_DEFS[r]) issues.push(`符文族 ${fam} 引用不存在符文: ${r}`);
    }
  }
  return issues;
}

/** 怪物类型全集 (供测试/工具使用) */
export function allMonsterTypes(): MonsterType[] {
  return Object.keys(MONSTER_DEFS) as MonsterType[];
}