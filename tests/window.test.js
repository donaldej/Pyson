'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('../src/compiler');

test('window routines enable independent text buffers without enabling scrolling', () => {
  assert.match(compile('print("bg", 0, 0)').assembly, /DEF WINDOW_ENABLED EQU 0/);
  const result = compile('window_position(0, 136)\nclear_window(2)\nprint_window(-42, 0, 0, 2)\nshow_window()\nhide_window()');
  assert.match(result.assembly, /DEF WINDOW_ENABLED EQU 1/);
  assert.match(result.assembly, /DEF BG_BUFFER_ROWS EQU 18/);
  assert.match(result.assembly, /wWindowTiles: ds WINDOW_BUFFER_BYTES/);
  assert.match(result.assembly, /call PrintNumber/);
  assert.match(result.assembly, /ld \[wWindowText\], a/);
});

test('window routines validate coordinates, palettes, counts and expression types', () => {
  for (const source of ['window_position(-1, 0)', 'window_position(160, 0)', 'window_position(0, 144)',
    'window_position(0)', 'window_position("x", 0)', 'show_window(1)', 'hide_window(1)',
    'clear_window(8)', 'clear_window(-1)', 'clear_window(0, 1)', 'print_window("x", 20, 0)',
    'print_window("x", 0, 18)', 'print_window("x", 0, 0, 8)', 'print_window("x", 0)',
    'print_window(clear_window(), 0, 0)', 'print_window("x", column=0, y=0)']) assert.throws(() => compile(source), /must|expects|integer|argument|keyword/i, source);
});
