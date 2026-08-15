// HUD 日志面板 (Canvas2D overlay, 右下 → 小地图上方避让)

import { getLogs, formatLine } from '../../util/log';
import { LOG_LINES, HUD_MINIMAP_RESERVE_H } from './types';

export function drawLogPanel(ctx2d: CanvasRenderingContext2D, vw: number, vh: number): void {
  // 玩家侧只显示 WRN/ERR (OPT-009): 调试 INF/DBG 不进玩家面板 (L 键切 console 级别保留)
  const logs = getLogs().filter(e => e.level === 'WRN' || e.level === 'ERR');
  const lines = logs.slice(-LOG_LINES);
  const x = vw - 380;
  const y = vh - HUD_MINIMAP_RESERVE_H - LOG_LINES * 15 - 8;
  const w = 364;
  const h = LOG_LINES * 15 + 8;
  if (lines.length > 0) {
    ctx2d.fillStyle = 'rgba(8,8,16,0.55)';
    ctx2d.fillRect(x, y, w, h);
  }
  ctx2d.font = '11px monospace';
  ctx2d.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    const e = lines[i];
    ctx2d.fillStyle =
      e.level === 'ERR' ? '#f88' :
      e.level === 'WRN' ? '#fc8' :
      e.level === 'INF' ? '#ddd' : '#999';
    ctx2d.fillText(formatLine(e).slice(0, 60), x + 6, y + 4 + i * 15);
  }
  ctx2d.fillStyle = '#fff';
}