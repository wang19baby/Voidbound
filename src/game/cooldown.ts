// 火球冷却管理 (per-key, simple timestamp)

export const FIREBALL_COOLDOWN = 0.3;

export function makeCooldown(): { ready: (now: number) => boolean; trigger: (now: number) => void } {
  let last = -Infinity;
  return {
    ready(now: number) { return now - last >= FIREBALL_COOLDOWN; },
    trigger(now: number) { last = now; },
  };
}