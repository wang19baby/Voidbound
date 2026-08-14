// tests/eventBus.test.ts — EventBus 单元测试 (A.2)
// 运行: 由 npm test 自动 bundle+执行 (见 package.json)

import { EventBus, createBus } from '../src/core/eventBus';

let failures = 0;
const check = (name: string, cond: boolean): void => {
  if (!cond) { failures++; console.log(`FAIL  ${name}`); }
  else console.log(`ok   ${name}`);
};

// === 基础 on / emit ===
{
  const bus = createBus();
  let received = 0;
  bus.on('monster.killed', () => { received++; });
  bus.emit('monster.killed', { monster: {} as never, killedBy: 'fireball', x: 0, y: 0 });
  bus.emit('monster.killed', { monster: {} as never, killedBy: 'melee', x: 1, y: 1 });
  check('emit 触发 on handler ×2', received === 2);
}

// === 多订阅者 ===
{
  const bus = createBus();
  let a = 0, b = 0;
  bus.on('monster.killed', () => { a++; });
  bus.on('monster.killed', () => { b++; });
  bus.emit('monster.killed', { monster: {} as never, killedBy: 'dot', x: 0, y: 0 });
  check('多订阅者都触发', a === 1 && b === 1);
}

// === unsubscribe ===
{
  const bus = createBus();
  let count = 0;
  const off = bus.on('monster.killed', () => { count++; });
  bus.emit('monster.killed', { monster: {} as never, killedBy: 'fireball', x: 0, y: 0 });
  off();
  bus.emit('monster.killed', { monster: {} as never, killedBy: 'fireball', x: 0, y: 0 });
  check('off 后不再触发', count === 1);
}

// === handler 抛错被隔离 ===
{
  const bus = createBus();
  let after = 0;
  // 静默 console.error (抛错路径)
  const origErr = console.error;
  console.error = () => {};
  bus.on('monster.killed', () => { throw new Error('boom'); });
  bus.on('monster.killed', () => { after++; });
  bus.emit('monster.killed', { monster: {} as never, killedBy: 'fireball', x: 0, y: 0 });
  console.error = origErr;
  check('抛错的 handler 不影响后续订阅者', after === 1);
}

// === handler 内 off 自己 ===
{
  const bus = createBus();
  let count = 0;
  const fn = () => { count++; off(); };
  const off = bus.on('monster.killed', fn);
  bus.emit('monster.killed', { monster: {} as never, killedBy: 'fireball', x: 0, y: 0 });
  bus.emit('monster.killed', { monster: {} as never, killedBy: 'fireball', x: 0, y: 0 });
  void off;  // ts unused
  check('handler 内 self-off 不会重复触发', count === 1);
}

// === listenerCount ===
{
  const bus = createBus();
  check('初始 0 订阅', bus.listenerCount('monster.killed') === 0);
  const off1 = bus.on('monster.killed', () => {});
  const off2 = bus.on('monster.killed', () => {});
  check('2 个订阅', bus.listenerCount('monster.killed') === 2);
  off1();
  check('off 1 个后剩 1', bus.listenerCount('monster.killed') === 1);
  off2();
  check('off 全清后剩 0', bus.listenerCount('monster.killed') === 0);
}

// === clear ===
{
  const bus = createBus();
  bus.on('monster.killed', () => {});
  bus.on('monster.spawned', () => {});
  bus.clear();
  check('clear 清空所有订阅', bus.listenerCount('monster.killed') === 0 && bus.listenerCount('monster.spawned') === 0);
}

if (failures > 0) {
  console.log(`\n${failures} FAILURES`);
  process.exit(1);
}
console.log('\nALL PASS');