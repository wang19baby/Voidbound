// core/pool.ts — 通用对象池 (B.1.1)
//
// 设计:
// - Pool<T> 内部维护 alive (密集数组, 迭代快) + free (回收站)
// - acquire() 从 free 取或 factory() 新建, push 到 alive
// - release(item) 从 alive swap-remove (O(1)), push 到 free
// - factory: 每次新建调用; reset: 每次回收调用 (清字段, 避免下一次复用残留)
// - forEach/items 仅读, 不会触发 GC; 用户如需 release 多个, 先收集再批量
//
// 使用:
//   const dmgPool = new Pool<DamageNum>({
//     factory: () => ({ pos: { x: 0, y: 0 }, vy: 0, life: 0, maxLife: 0, text: '', color: '' }),
//     reset: d => { d.life = 0; d.text = ''; },
//   });
//   const d = dmgPool.acquire();
//   d.text = '-30';
//   // ... 渲染 ...
//   dmgPool.release(d);
//
// 收益: GC 压力降 1 数量级 (每帧创建 ~几十个对象 → 0 个)

export interface PoolOptions<T> {
  factory: () => T;
  reset?: (item: T) => void;
  /** 启动时预分配 (减少早期 acquire 的工厂调用) */
  initial?: number;
}

/**
 * 通用对象池 — 短命对象 (粒子/弹幕/数字) 的零 GC 容器
 * 非线程安全 (单线程主循环 OK)
 */
export class Pool<T> {
  private free: T[] = [];
  /** 活跃对象密集数组, for-of + 渲染层首选; 不要直接 mutate */
  private alive: T[] = [];

  constructor(private readonly opts: PoolOptions<T>) {
    if (opts.initial && opts.initial > 0) {
      for (let i = 0; i < opts.initial; i++) this.free.push(opts.factory());
    }
  }

  /** 从池中取出 (或新建), push 到 alive */
  acquire(): T {
    const item = this.free.length > 0 ? this.free.pop()! : this.opts.factory();
    this.alive.push(item);
    return item;
  }

  /** 归还到 free 列表; 已 release 的项目重复 release 是 no-op */
  release(item: T): void {
    const idx = this.alive.indexOf(item);
    if (idx < 0) return;  // 防御: 已归还/未 acquire
    // swap-remove: O(1), 保持密集数组 (迭代友好)
    const last = this.alive.length - 1;
    if (idx !== last) this.alive[idx] = this.alive[last];
    this.alive.pop();
    if (this.opts.reset) this.opts.reset(item);
    this.free.push(item);
  }

  /** 当前活跃对象数 */
  get size(): number {
    return this.alive.length;
  }

  /** 回收站中的空闲对象数 */
  get freeCount(): number {
    return this.free.length;
  }

  /** 总容量 (alive + free) */
  get capacity(): number {
    return this.alive.length + this.free.length;
  }

  /** 渲染迭代: 传入访问器, 不暴露内部数组 (避免外部 mutate) */
  forEach(fn: (item: T, index: number) => void): void {
    for (let i = 0; i < this.alive.length; i++) fn(this.alive[i], i);
  }

  /** 只读快照 (渲染层只读遍历) */
  items(): readonly T[] {
    return this.alive;
  }

  /** 清空所有 (测试/重置用): 不调 reset, 不回收 free */
  clear(): void {
    this.alive.length = 0;
    this.free.length = 0;
  }
}