'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('../src/compiler');
const { parse } = require('../src/parser');

test('lists support multiline syntax, trailing commas and indexed operators', () => {
  const ast = parse('items = [\n    1, # first\n    -2,\n    3,\n]\nitems[1 + 1] += items[-1]\nfor value in items:\n    print(value, 0, 0)');
  assert.equal(ast[0].expression.items.length, 3);
  assert.equal(ast[1].type, 'index_assign');
  assert.equal(ast[1].op, '+');
  assert.equal(ast[1].target.index.op, '+');
  assert.equal(ast[2].iterable.name, 'items');
  assert.throws(() => parse('x = [(1]'), /unmatched closing bracket/);
  assert.throws(() => parse('x = [1'), /Unclosed bracket/);
});

test('fixed array storage, len and negative indexing compile', () => {
  const result = compile('items = [1, -32768, True]\nempty = []\nitems[-3] = 12\nitems[-1] += 3\nx = items[0]\nsize = len(items)\nis_empty = not empty\nif items:\n    x += 1');
  const items = result.symbols.find(symbol => symbol.name === 'items');
  assert.equal(items.type, 'array');
  assert.equal(items.length, 3);
  assert.equal(items.bytes, 6);
  assert.match(result.assembly, new RegExp(`${items.label}: ds 6`));
  assert.match(result.assembly, /call ArrayIndexAddress/);
});

test('arrays retain existing scope and definite initialization checks', () => {
  compile('items = [1, 2]\ndef update():\n    items[0] += 1\nupdate()\ndef local(v):\n    work = [v, v + 1]\n    return work[-1]\nx = local(4)');
  for (const source of [
    'items = [items[0]]',
    'if True:\n    items = [1]\nx = items[0]',
    'for i in range(0):\n    items = [1]\nx = len(items)',
    'def read():\n    return items[0]\nx = read()\nitems = [1]',
    'items = []\nfor value in items:\n    pass\nx = value'
  ]) assert.throws(() => compile(source), /before assignment/, source);
});

test('invalid indices, element types, aliases and length changes are rejected', () => {
  for (const [source, error] of [
    ['a = [1]\nx = a[1]', /index out of range/],
    ['a = [1]\na[-2] = 3', /index out of range/],
    ['a = []\nx = a[0]', /index out of range/],
    ['a = [1]\na["bad"] = 3', /integer/],
    ['a = [1]\na[0] = "bad"', /integer/],
    ['a = ["bad"]', /integer/],
    ['a = [[1]]', /integer/],
    ['a = [refresh_screen()]', /integer/],
    ['a = [1]\na = [1, 2]', /fixed length/],
    ['a = [1]\na = 3', /cannot change/],
    ['a = [1]\nb = a', /aliases and copies/],
    ['a = 1\nx = a[0]', /named integer array/],
    ['x = len("text")', /named integer array/],
    ['x = len()', /one named array/],
    ['a = [1]\nx = a or a', /aliases and copies/],
    ['def f(x):\n    return x\na = [1]\nx = f(a)', /integer/],
    ['def f():\n    a = [1]\n    return a', /integer/],
    ['for value in "text":\n    pass', /Parse error/],
    ['text = "hi"\nfor value in text:\n    pass', /named integer array/],
    ['a = [1]\na[0] //= 0', /Division by zero/]
  ]) assert.throws(() => compile(source, 'arrays.pysn'), error, source);
  assert.throws(() => compile(`a = [${Array(1025).fill('0').join(',')}]`), /at most 1024/);
});
