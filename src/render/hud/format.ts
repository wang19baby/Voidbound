// HUD 文本格式化

/** 秒 → mm:ss (HUD 计时器) */
export function formatHudTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}