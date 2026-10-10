'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('../src/compiler');
const { parse } = require('../src/parser');

test('Python operator precedence, short-circuiting and comparison chains', () => {
  const ast = parse('x = not 1 + 2 * 3 < 8 < 9 or False and True\n');
  const node = ast[0].expression;
  assert.equal(node.op, 'or');
  assert.equal(node.left.op, 'not');
  assert.equal(node.left.expression.type, 'compare');
  assert.equal(node.left.expression.rest.length, 2);
  assert.equal(node.left.expression.first.op, '+');
  assert.equal(node.left.expression.first.right.op, '*');
  assert.equal(node.right.op, 'and');
});

test('indentation handles blank lines, comments, nested blocks and continuation', () => {
  const result = compile('x = 0\nwhile x < 2:\n    # ignored\n\n    if x == 1:\n        print(\n            "Hi # literal",\n            x, 0\n        )\n    x += 1');
  assert.equal(result.ast[1].body.length, 2);
  assert.equal(result.ast[1].body[0].branches[0].body[0].expression.args[0].value, 'Hi # literal');
});

test('string variables, signed limits, functions and ranges compile', () => {
  compile('message = "Hello"\nx = -32768\nx = x + 1\nprint(message, 0, 0)\nprint(x, 0, 1)');
  compile('def add(a, b):\n    result = a + b\n    return result\nx = add(1, add(2, 3))\nfor i in range(4, -2, -1):\n    if i == 2:\n        continue\n    x += i\n    if x > 20:\n        break');
  compile('x = 0\nif True:\n    y = 1\nelse:\n    y = 2\nprint(y, x, 0)');
});

test('clear errors for undefined names, unsupported syntax and unsafe constructs', () => {
  const cases = [
    ['x = x + 1', /before assignment/],
    ['print(missing, 0, 0)', /Undefined variable/],
    ['if True:\n    x = 1\nprint(x, 0, 0)', /before assignment/],
    ['for i in range(0):\n    pass\nprint(i, 0, 0)', /before assignment/],
    ['x = 32768', /16-bit/],
    ['x = -32769', /16-bit/],
    ['x = 1\nx = "text"', /cannot change/],
    ['i = "text"\nfor i in range(3):\n    pass', /cannot change/],
    ['x = "text" + 1', /integer/],
    ['x = 1 / 2', /fractional division/],
    ['x = 2048.0', /Fixed-point value/],
    ['break', /inside a loop/], ['continue', /inside a loop/], ['return 1', /inside a function/],
    ['for i in range(5, 0, 0):\n    pass', /nonzero/],
    ['step = 1\nfor i in range(5, 0, step):\n    pass', /literal/],
    ['for i in items(5):\n    pass', /for supports range/],
    ['x = 1 // 0', /Division by zero/],
    ['print("hi", 0, 0)\nheader.title = "LATE"', /before executable/],
    ['if True:\n    header.title = "NESTED"', /top level/],
    ['def f():\n    return f()\nx = f()', /Recursive/],
    ['def f():\n    return g()\ndef g():\n    return f()', /Recursive/],
    ['def f(a):\n    return a\nx = f()', /expects 1/],
    ['def f(a):\n    return a\nx = f("hi")', /integer/],
    ['def f():\n    return value\nx = f()\nvalue = 3', /before assignment/],
    ['def f():\n    x = 1\n    return x\ny = x', /Undefined/],
    ['def f():\n    def g():\n        pass', /Nested/],
    ['x = print("hi", 0, 0)', /procedure/],
    ['if wait_vblank():\n    pass', /procedure/],
    ['x = not wait_vblank()', /procedure/],
    ['button("wrong")', /button name/],
    ['print = 1', /Reserved/],
    ['if True:\n\tpass', /spaces instead of tabs/],
    ['if True:\n    pass\n  pass', /indentation/],
    ['while True:\npass', /Parse error/],
    ['x = (1', /Unclosed/]
  ];
  for (const [source, expected] of cases) assert.throws(() => compile(source, 'invalid.pysn'), expected, source);
  assert.throws(() => compile('x = unknown', 'named.pysn'), /named\.pysn: Line 1:/);
});
