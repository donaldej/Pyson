'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('../src/compiler');

test('scrolling allocates full hardware-map buffers only for programs using the camera API', () => {
  assert.match(compile('print("hello", 0, 0)').assembly, /DEF BG_BUFFER_ROWS EQU 18/);
  for (const source of ['set_camera(3, -5)', 'camera_x()', 'camera_y()', 'draw_world(0)', 'world_sprite(0, 0, 0, -7, -7)']) {
    const result = compile(source);
    assert.match(result.assembly, /DEF BG_BUFFER_ROWS EQU 32/);
    assert.match(result.assembly, /wBGTiles: ds BG_BUFFER_BYTES/);
  }
});

test('camera and world drawing routines validate argument counts, types, and sprite slots', () => {
  for (const source of ['set_camera()', 'set_camera(1)', 'set_camera(1, 2, 3)', 'set_camera("x", 2)',
    'draw_world()', 'draw_world(0, 0)', 'draw_world("map")', 'camera_x(0)', 'camera_y(1)',
    'world_sprite(0, 0, 0, 0)', 'world_sprite(40, 0, 0, 0, 0)', 'world_sprite(-1, 0, 0, 0, 0)',
    'world_sprite(0, 0, 0, "x", 0)', 'set_camera(camera_x=0, y=0)']) {
    assert.throws(() => compile(source), /expects|integer|argument|keyword/i, source);
  }
});
