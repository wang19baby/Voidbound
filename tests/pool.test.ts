// tests/pool.test.ts — Pool 单元测试 (B.1.1)
// 运行: npm test 自动 bundle+执行

import { Pool } from '../src/core/pool';

let failures = 0;
const check = (name: string, cond: boolean): void => {
  if (!cond) { failures++; console.log(`FAIL  ${name}`); }
  else console.log(`ok   ${name}`);
};

interface Fake { id: number; alive: boolean; }

const mkFactory = (): (() => Fake) => {
  let nextId = 1;
  return () => ({ id: nextId++, alive: true });
};

const mkReset = (): ((f: Fake) => void) => (f) => { f.alive = false; };

// === 基础 acquire / release ===
{
  const pool = new Pool<Fake>({ factory: mkFactory(), reset: mkReset() });
  check('初始 size=0', pool.size === 0);
  const a = pool.acquire();
  check('acquire 后 size=1', pool.size === 1);
  check('acquire 触发 factory 产生 id>=1', a.id >= 1);
  pool.release(a);
  check('release 后 size=0', pool.size === 0);
  check('release 触发 reset: alive=false', a.alive === false);
  const b = pool.acquire();
  check('复用: 第二次 acquire 取到 reset 后的对象', b.id === a.id);
  check('复用 freeCount 减少', pool.freeCount === 0);
}

// === 超过 initial 容量时新建 ===
{
  const pool = new Pool<Fake>({ factory: mkFactory(), initial: 2 });
  check('initial=2 时 freeCount=2', pool.freeCount === 2);
  const a = pool.acquire();
  const b = pool.acquire();
  check('acquire 2 个: size=2, freeCount=0', pool.size === 2 && pool.freeCount === 0);
  const c = pool.acquire();
  check('超出 initial 时 factory 新建: size=3', pool.size === 3);
  void a; void b; void c;
}

// === 重复 release no-op ===
{
  const pool = new Pool<Fake>({ factory: mkFactory(), reset: mkReset() });
  const a = pool.acquire();
  pool.release(a);
  pool.release(a);  // 第二次应被防御掉
  check('重复 release size 仍 = 0', pool.size === 0);
  check('重复 release freeCount = 1 (不重复入栈)', pool.freeCount === 1);
}

// === release 触发 reset ===
{
  const pool = new Pool<Fake>({ factory: mkFactory(), reset: (f) => { f.id = -1; } });
  const a = pool.acquire();
  pool.release(a);
  const b = pool.acquire();
  check('reset 生效: id 被重置为 -1', b.id === -1);
}

// === forEach 不触发 GC (遍历 alive 全部) ===
{
  const pool = new Pool<Fake>({ factory: mkFactory() });
  const items: Fake[] = [];
  for (let i = 0; i < 5; i++) items.push(pool.acquire());
  let count = 0;
  pool.forEach(() => count++);
  check('forEach 遍历所有 alive', count === 5);
  pool.release(items[2]);
  count = 0;
  pool.forEach(() => count++);
  check('release 后 forEach 只剩 4', count === 4);
}

// === items() 只读快照 ===
{
  const pool = new Pool<Fake>({ factory: mkFactory() });
  for (let i = 0; i < 3; i++) pool.acquire();
  const snap = pool.items();
  check('items() 长度 == size', snap.length === pool.size);
  check('items() 是 readonly 数组', Array.isArray(snap));
}

// === clear ===
{
  const pool = new Pool<Fake>({ factory: mkFactory(), initial: 5 });
  pool.acquire();
  pool.clear();
  check('clear 后 size=0', pool.size === 0);
  check('clear 后 freeCount=0', pool.freeCount === 0);
  const a = pool.acquire();
  check('clear 后 acquire 走 factory 路径 (id 递增)', a.id > 5);
}

// === swap-remove 正确性: 中间元素被 release 后, 末尾元素补位 ===
{
  const pool = new Pool<Fake>({ factory: mkFactory() });
  const a = pool.acquire();
  const b = pool.acquire();
  const c = pool.acquire();
  pool.release(b);  // release 中间元素
  check('release 中间后 a 仍 alive', pool.items().includes(a));
  check('release 中间后 c 仍 alive', pool.items().includes(c));
  check('release 中间后 b 不在 alive', !pool.items().includes(b));
  void a; void c;
}

// === 容量护栏: 池无上限 (按需扩) ===
{
  const pool = new Pool<Fake>({ factory: mkFactory() });
  const items: Fake[] = [];
  for (let i = 0; i < 100; i++) items.push(pool.acquire());
  check('100 acquire 后 size=100', pool.size === 100);
  items.forEach(x => pool.release(x));
  check('100 release 后 size=0', pool.size === 0);
  check('100 release 后 freeCount=100', pool.freeCount === 100);
}

if (failures > 0) {
  console.log(`\n${failures} FAILURES`);
  process.exit(1);
}
console.log('\nALL PASS');