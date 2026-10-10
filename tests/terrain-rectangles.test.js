'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('../src/compiler');
test('terrain rectangles require numeric bounds and include runtime only when used', () => {
  const asm = compile('map = collision_map(["..."])\nhit = rect_is_solid(map, 0, 0, 8, 8)').assembly;
  assert.match(asm, /RectIsSolid:/);
  assert.match(asm, /wTerrainRectColumn: ds 1/);
  assert.doesNotMatch(compile('x = 0').assembly, /RectIsSolid:|wTerrainRectColumn:/);
  for (const source of ['rect_is_solid()', 'rect_is_solid(0, 0, 0, 8)', 'rect_is_solid(0, "x", 0, 8, 8)', 'rect_is_solid(0, 0, 0, 8, size=8)']) assert.throws(() => compile(source));
});
