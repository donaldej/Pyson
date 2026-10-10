'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('../src/compiler');

test('records reserve inline fields and helpers reserve only references', () => {
  const result = compile(`player = record(x=3, health=5)
enemies = records(4, health=2, x=0)
def hit(enemy, amount):
    enemy.health -= amount
hit(enemies[-1], 1)
copy = player
copy.x += 2
for enemy in enemies:
    hit(enemy, 1)
count = len(enemies)`);
  const symbol = name => result.symbols.find(symbol => symbol.name === name);
  assert.equal(symbol('player').bytes, 4);
  assert.equal(symbol('enemies').bytes, 16);
  assert.deepEqual(symbol('player').fields.map(field => [field.name, field.offset]), [['health', 0], ['x', 2]]);
  assert.equal(result.symbols.find(symbol => symbol.scope === 'hit' && symbol.name === 'enemy').bytes, 2);
  assert.equal(symbol('copy').reference, undefined);
});

test('record schemas, references and fixed storage reject invalid programs', () => {
  for (const [source, pattern] of [
    ['p = record()', /named integer fields/],
    ['p = record(x=1, x=2)', /Duplicate record field/],
    ['p = record(x="bad")', /integer/],
    ['p = record(x=1)\nx = p.y', /Unknown record field/],
    ['p = 1\nx = p.y', /requires a record/],
    ['p = records(0, x=1)', /count/],
    ['n = 2\np = records(n, x=1)', /count/],
    ['p = records(1024, x=1, y=2, z=3)', /WRAM budget/],
    ['p = [record(x=1), record(y=1)]', /identical fields/],
    ['p = record(x=1)\np = record(y=2)', /cannot change/],
    ['p = records(2, x=1)\np = records(3, x=1)', /fixed length/],
    ['p = records(2, x=1)\nx = p[2].x', /index out of range/],
    ['p = record(x=1)\ndef f(p):\n    p = record(x=2)\nf(p)', /cannot be rebound/],
    ['p = record(x=1)\nitems = records(2, x=1)\nfor p in items:\n    p.x += 1', /owning record/],
    ['p = record(x=1)\ndef f(p):\n    p.x += 1\nf(p)\nf(1)', /same record fields/],
    ['p = record(x=p.x)', /before assignment/],
    ['def f():\n    p.x += 1\nf()\np = record(x=1)', /before assignment/],
    ['def f(p):\n    return p\np = record(x=1)\nx = f(p)', /integer/]
  ]) assert.throws(() => compile(source), pattern, source);
});

test('records infer references through nested helpers and conditional call sites', () => {
  compile(`def leaf(item):
    item.x += 1
    return item.x
def outer(item):
    return leaf(item)
items = [record(x=1), record(x=2)]
if outer(items[0]) == 2:
    outer(items[1])`);
});
