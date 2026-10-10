'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('../src/compiler');
test('rectangle queries accept expressions and reserve runtime only when used', () => {
  const asm = compile('x = 4\nhit = rect_overlap(x, -2, 8, 8, 10, 0, 8, 8)').assembly;
  assert.match(asm, /RectOverlap:/);
  assert.match(asm, /wRectArgs: ds 16/);
  assert.doesNotMatch(compile('x = 4').assembly, /RectOverlap:|wRectArgs:/);
});
test('rectangle queries require eight positional numeric arguments', () => {
  for (const source of ['rect_overlap()', 'rect_overlap(0, 0, 8, 8)', 'rect_overlap(0, 0, 8, 8, 0, 0, 8, 8, 8)', 'rect_overlap("x", 0, 8, 8, 0, 0, 8, 8)', 'rect_overlap(0, 0, 8, 8, 0, 0, 8, height=8)', 'rect_overlap = 1']) assert.throws(() => compile(source), undefined, source);
});
