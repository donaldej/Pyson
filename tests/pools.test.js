'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('../src/compiler');

test('pools allocate fixed slots and value handles with conditional runtime', () => {
  const result = compile(`bullets = pool(16, x=0, y=0, dx=2)
shot = spawn(bullets, x=40)
saved = shot
def move(item):
    item.x += item.dx
if shot:
    move(shot)
for item in bullets:
    move(item)
count = pool_count(bullets)
capacity = len(bullets)
index = pool_index(shot)
removed = despawn(shot)
stale = not saved
reset_pool(bullets)`);
  const owner = result.symbols.find(symbol => symbol.name === 'bullets');
  assert.equal(owner.stride, 11);
  assert.equal(owner.bytes, 176);
  assert.deepEqual(owner.fields.map(field => field.offset), [5, 7, 9]);
  for (const symbol of result.symbols.filter(symbol => symbol.handle)) assert.equal(symbol.bytes, 6);
  assert.match(result.assembly, /PoolSpawn:/);
  assert.doesNotMatch(compile('x = 1').assembly, /PoolSpawn:|wPoolResult:/);
});

test('pool declarations and handle types reject invalid storage and access', () => {
  for (const [source, pattern] of [
    ['p = pool(0, x=0)', /capacity/],
    ['p = pool(129, x=0)', /capacity/],
    ['n = 2\np = pool(n, x=0)', /capacity/],
    ['p = pool(2)', /named fields/],
    ['p = pool(2, x="bad")', /literal integer/],
    ['p = pool(2, x=0, x=1)', /Duplicate/],
    ['p = pool(2, x=32768)', /16-bit/],
    ['def f():\n    p = pool(2, x=0)', /top level/],
    ['if True:\n    p = pool(2, x=0)', /top level/],
    ['p = pool(2, x=0)\np = pool(2, x=0)', /declared once/],
    ['p = pool(2, x=0)\nq = p', /copied or aliased/],
    ['p = pool(2, x=0)\nh = spawn(p, y=1)', /Unknown pool field/],
    ['p = pool(2, x=0)\nh = spawn(p, x=1, x=2)', /Duplicate/],
    ['p = pool(2, x=0)\nh = spawn(p, 1)', /named fields/],
    ['p = pool(2, x=0)\nh = spawn(p)\nx = h.y', /Unknown pool field/],
    ['p = pool(2, x=0)\nx = p[0]', /named integer array/],
    ['x = despawn(1)', /pool handle/],
    ['x = pool_count(1)', /named pool/],
    ['p = pool(2, x=0)\nh = spawn(p)\nh = 0', /cannot change/],
    ['p = pool(2, x=0)\nq = pool(2, x=0)\ndef f(h):\n    h.x += 1\nf(spawn(p))\nf(spawn(q))', /same record fields/],
    ['def f():\n    return pool_count(p)\nx = f()\np = pool(2, x=0)', /before assignment/],
    ['p = pool(2, x=0)\ndef f(h):\n    return h\nh = spawn(p)\nx = f(h)', /integer/]
  ]) assert.throws(() => compile(source), pattern, source);
});
