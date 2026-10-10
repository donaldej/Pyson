'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('../src/compiler');

test('constant tables retain array reads and occupy ROM instead of WRAM', () => {
  const result = compile('BASE = constant(4)\nvalues = constant_table([BASE, -32768, True, 2 * 3])\nempty = constant_table([])\nsize = len(values)\nlast = values[-1]\nflag = not empty\ntotal = 0\nfor value in values:\n    total += value\ndef read(i):\n    return values[i]\nanswer = read(-2)');
  const values = result.symbols.find(symbol => symbol.name === 'values');
  assert.equal(values.bytes, 0);
  assert.equal(values.length, 4);
  assert.equal(values.storage, 'rom');
  assert.equal(values.romBytes, 8);
  assert.match(result.assembly, /call ReadConstantTableWord/);
  assert.doesNotMatch(result.assembly, new RegExp(`${values.label}: ds`));
  assert.match(result.assembly, /db 4, 0, 0, 128, 1, 0, 6, 0/);
  assert.equal(result.banking.objects.filter(object => object.kind === 'constant_table').length, 2);
});

test('large constant tables are banked automatically with explicit capacity checks', () => {
  const source = `values = constant_table([${Array(8191).fill('1').join(',')}])\nx = values[-1]`;
  const result = compile(source);
  assert.equal(result.header.controller, 'mbc5');
  assert.equal(result.banking.objects.find(object => object.kind === 'constant_table').bank, 2);
  assert.throws(() => compile('header.controller = "rom_only"\n' + source), /capacity/);
  assert.throws(() => compile(`values = constant_table([${Array(8192).fill('1').join(',')}])`), /8191/);
});

test('constant tables reject writes, rebinding and runtime initializers with source context', () => {
  for (const [source, error] of [
    ['a = constant_table([1])\na[0] = 2', /read-only/],
    ['a = constant_table([1])\na[0] += 2', /read-only/],
    ['a = constant_table([1])\ndef f():\n    a[-1] = 2', /read-only/],
    ['a = constant_table([1])\na = [2]', /read-only/],
    ['a = constant_table([1])\na = constant_table([2])', /Duplicate constant/],
    ['a = constant_table([1])\nfor a in range(2):\n    pass', /read-only/],
    ['a = constant_table([1])\ndef f(a):\n    return a', /shadow/],
    ['a = constant_table([1])\nb = a', /aliases/],
    ['a = constant_table([1])\nx = a[1]', /index out of range/],
    ['a = constant_table([])\nx = a[0]', /index out of range/],
    ['a = constant_table([32768])', /signed 16-bit/],
    ['n = 2\na = constant_table([n])', /compile-time/],
    ['a = constant_table([1 // 0])', /division by zero/],
    ['a = constant_table(["text"])', /compile-time/],
    ['a = constant_table([[1]])', /compile-time/],
    ['a = constant_table(1)', /one list/],
    ['if True:\n    a = constant_table([1])', /top-level/],
    ['def f():\n    a = constant_table([1])', /top-level/]
  ]) assert.throws(() => compile(source, 'tables.pysn'), error, source);
});
