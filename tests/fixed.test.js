'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('../src/compiler');

test('fixed numbers infer variables, forwarded parameters, returns and defaults', () => {
  const result = compile(`def advance(position, speed=0.5):
    return position + speed
def forward(position):
    return advance(speed=0.125, position=position)
x = fixed(40)
x = forward(x)
pixels = int(value=x)
y = advance(10)
z = -2048.0
top = 2047.9375
flag = -1 < x < 100`);
  assert.equal(result.symbols.find(s => s.name === 'x').type, 'fixed');
  assert.equal(result.symbols.find(s => s.name === 'y').type, 'fixed');
  assert.equal(result.symbols.find(s => s.name === 'pixels').type, 'number');
  assert.match(result.assembly, /call FixedToInt/);
  assert.doesNotMatch(result.assembly, /undefined/);
});

test('fixed operations reject unsafe uses and integer division stays explicit', () => {
  for (const source of ['x = 2048.0', 'x = fixed(2048)', 'x = -2048.0625',
    'x = fixed("x")', 'x = int("x")', 'x = 1 / 2', 'x = 0.5 & 1',
    'x = ~0.5', 'a = [0.5]', 'a = [1]\na[0] = 0.5',
    'x = 0.5\nprint(x, 0, 0)', 'for x in range(0.5):\n    pass',
    'def f(x=2048.0):\n    return x', 'x = fixed()', 'x = int(1, 2)',
    'x = 0.5\nfor x in range(3):\n    pass']) {
    assert.throws(() => compile(source), undefined, source);
  }
  const integer = compile('x = 8 // 3\ny = x * 4');
  assert.doesNotMatch(integer.assembly, /wFixedLeft|FixedMul:/);
  compile('x = 0.5\nx /= 2\ny = x // 0.125\nz = x % 0.125');
});
