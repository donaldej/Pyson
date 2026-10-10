'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile } = require('../src/compiler');

test('array references infer through forwarding and accept different fixed lengths', () => {
  const result = compile(`a = [1, 2]
b = [3, 4, 5]
empty = []
def outer(values):
    return inner(values=values)
def inner(values):
    total = 0
    for value in values:
        total += value
    for i in range(len(values)):
        values[i] += 1
    return total
x = outer(a)
y = outer(values=b)
z = outer(empty)`);
  const params = result.symbols.filter(symbol => symbol.name === 'values');
  assert.equal(params.length, 2);
  for (const param of params) { assert.equal(param.arrayReference, true); assert.equal(param.bytes, 4); assert.equal(param.length, undefined); }
  assert.doesNotMatch(result.assembly, /undefined/);
});

test('imported helpers accept local arrays and retain caller storage', () => {
  const dir = path.resolve(__dirname, '../build/tests/array-parameter-modules');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'util.pysn'), 'def first(values):\n    values[0] += 1\n    return values[0]\n');
  compile('import util\ndef local():\n    work = [1, 2]\n    return util.first(values=work)\nx = local()', path.join(dir, 'main.pysn'));
});

test('unused array helpers infer parameters from indexing, len and iteration', () => {
  const result = compile('def by_index(values):\n    return values[0]\ndef by_length(values):\n    return len(values)\ndef by_iteration(values):\n    for item in values:\n        print(item, 0, 0)\nx = 1');
  assert.equal(result.symbols.filter(symbol => symbol.arrayReference && symbol.bytes === 4).length, 3);
});

test('array parameters reject copying, rebinding, ROM writes and mixed types', () => {
  for (const source of [
    'a = [1]\ndef f(values):\n    return len(values)\nf(a)\nf(1)',
    'a = [1]\ndef f(values):\n    values = [0]\nf(a)',
    'a = [1]\ndef f(values):\n    alias = values\nf(a)',
    'def f(values):\n    return len(values)\nf([1, 2])',
    'a = constant_table([1])\ndef f(values):\n    values[0] = 2\nf(a)',
    'a = records(2, x=1)\ndef f(values):\n    return len(values)\nf(a)',
    'a = [1]\ndef f(values):\n    return values\nf(a)',
    'a = [1]\ndef f(values):\n    f(values)\nf(a)',
    'def f(values):\n    return len(values)\nf(a)\na = [1]'
  ]) assert.throws(() => compile(source), undefined, source);
});

test('ROM capability follows forwarding while RAM-only parameters keep four-byte slots', () => {
  const result = compile(`rom = constant_table([1, 2])
ram = [3]
def outer(values):
    return inner(values)
def inner(values):
    return values[-1] + len(values)
def write(values):
    values[0] += 1
a = outer(rom)
b = outer(ram)
write(ram)`);
  for (const scope of ['outer', 'inner']) {
    const param = result.symbols.find(s => s.scope === scope && s.name === 'values');
    assert.equal(param.romReference, true);
    assert.equal(param.bytes, 6);
  }
  assert.equal(result.symbols.find(s => s.scope === 'write' && s.name === 'values').bytes, 4);
  assert.match(result.assembly, /call ReadArrayParameterWord/);
  assert.doesNotMatch(result.assembly, /undefined/);
});

test('ROM write checks follow multiple helpers, argument names and conditional writes', () => {
  for (const assignment of ['values[0] = 3', 'values[-1] += 1']) {
    assert.throws(() => compile(`rom = constant_table([1])
def outer(values):
    middle(data=values)
def middle(data):
    write(values=data)
def write(values):
    if False:
        ${assignment}
outer(rom)`), /read-only.*modifies/);
  }
  assert.throws(() => compile('rom = constant_table([1])\nram = [1]\ndef f(values):\n    for values in ram:\n        pass\nf(rom)'), /rebound/);
  // The helper may write one parameter while reading ROM through another.
  compile('rom = constant_table([7])\nram = [0]\ndef copy(target, source):\n    target[0] = source[0]\ncopy(source=rom, target=ram)');
});
