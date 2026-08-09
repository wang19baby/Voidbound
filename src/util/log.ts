// Voidbound 简易日志系统: 环形缓冲 + HUD overlay + console 双写
// 用途: M1 调试, M2+ 战斗/怪物/技能都需要

export type LogLevel = 'DBG' | 'INF' | 'WRN' | 'ERR';
export type LogModule = 'atlas' | 'gl' | 'world' | 'player' | 'input' | 'combat' | 'monster' | 'skill' | 'loop' | 'render';

export interface LogEntry {
  t: number;       // performance.now() 时间
  ms: number;      // 自启动毫秒数 (玩家可见)
  level: LogLevel;
  mod: LogModule;
  msg: string;
}

const MAX_ENTRIES = 200;
const buf: LogEntry[] = [];

let startTime = performance.now();

/** 当前是否对该 level 输出 (HUD+console) */
let minLevel: LogLevel = 'INF';
const LEVEL_ORDER: Record<LogLevel, number> = { DBG: 0, INF: 1, WRN: 2, ERR: 3 };

export function setLogLevel(level: LogLevel): void { minLevel = level; }

export function log(level: LogLevel, mod: LogModule, msg: string): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  const now = performance.now();
  const entry: LogEntry = { t: now, ms: now - startTime, level, mod, msg };
  buf.push(entry);
  if (buf.length > MAX_ENTRIES) buf.shift();

  // console 双写 (按浏览器开发者工具习惯: DBG→log, INF→info, WRN→warn, ERR→error)
  const line = formatLine(entry);
  if (level === 'ERR') console.error(line);
  else if (level === 'WRN') console.warn(line);
  else if (level === 'INF') console.info(line);
  else console.log(line);
}

export function clearLog(): void { buf.length = 0; }

export function getLogs(): readonly LogEntry[] { return buf; }

export function formatLine(e: LogEntry): string {
  const s = (e.ms / 1000).toFixed(2);
  return `[${s}s][${e.level}][${e.mod}] ${e.msg}`;
}

// 便捷封装
export const dbg = (mod: LogModule, msg: string) => log('DBG', mod, msg);
export const inf = (mod: LogModule, msg: string) => log('INF', mod, msg);
export const wrn = (mod: LogModule, msg: string) => log('WRN', mod, msg);
export const err = (mod: LogModule, msg: string) => log('ERR', mod, msg);