'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { compile } = require('../src/compiler');
const filename = path.resolve(__dirname, '../examples/scrolling-world/main.pysn');
test('mutable maps allocate independent cell storage and reject non-row declarations', () => {
  const result = compile('wall = tile("assets/brick.bmp", solid=True)\nfloor = tile("assets/floor.bmp")\nboard = mutable_map([[wall, floor]])\nok = set_map_tile(board, 0, 0, floor)\nreset_map(board)\ndraw_map(board, 0, 0)', filename);
  assert.match(result.assembly, /AssetMap2RAM: ds 6/);
  assert.equal(result.assets[2].romBytes, 6);
  assert.throws(() => compile('m = mutable_map("x.bmp")'), /nested/);
  const mixed = compile('wall = tile("assets/brick.bmp", solid=True)\nfloor = tile("assets/floor.bmp")\nworld = worldmap([[wall]])\nboard = mutable_map([[floor]])\nset_map_tile(board, 0, 0, wall)', filename);
  assert.ok(mixed.assets[0].maps[0][0] >= require('../src/font').ids.size);
});
test('wave instruments and imported compositions retain pulse compatibility', () => {
  const dir = path.resolve(__dirname, '../build/tests/next-music'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'song.json'), JSON.stringify({ parts: [{ notes: [[440, 24, 8]] }, { voice: 1, instrument: 'sine', notes: [[220, 24, 8]] }] }));
  const result = compile('lead = music_file("song.json")\nbass = music_file("song.json", part=1)\nplay_music(lead)\nplay_music(bass)', path.join(dir, 'main.pysn'));
  assert.equal(result.music.length, 2);
  assert.equal(result.music[1].waveform.length, 16);
  assert.match(result.assembly, /WaveMusicTick:/);
  assert.throws(() => compile('x = music_track([[440, 1, 8]], voice=1, instrument="bad")'), /instrument/);
});
test('formatted dialogue validates placeholders and keeps optional runtime conditional', () => {
  assert.doesNotMatch(compile('start_dialogue("plain")').assembly, /wFormatBuffer:|wPortraitTiles:/);
  compile('start_dialogue(format_text("{{}} {}", -32768))\ndialogue_speaker("NAME")');
  for (const source of ['format_text("{}")', 'format_text("{name}", 1)', 'format_text("{}", "text")', 'dialogue_speaker("123456789012345")', 'print = constant(1)', 'X = constant(32768)', 'def f(a=unknown):\n    return a']) assert.throws(() => compile(source));
});
test('constants, numeric defaults, keywords and math helpers compile', () => {
  const result = compile('SIZE = constant(4 * 2)\ndef add(a, b=SIZE):\n    return a + b\nx = add(b=3, a=2)\ny = add(1)\nz = clamp(max(abs(-4), min(5, 6)), 0, SIZE)');
  assert.equal(result.constants.SIZE, 8);
  assert.ok(!result.symbols.some(s => s.name === 'SIZE'));
  for (const source of ['X = constant(1)\nX = 2', 'def f(a=1, b):\n    return b', 'def f(a):\n    return a\nf(a=1, a=2)', 'def f(a):\n    return a\nf(unknown=1)']) assert.throws(() => compile(source));
  const dir = path.resolve(__dirname, '../build/tests/next-defaults'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'library.pysn'), 'LIMIT = constant(3)\ndef add(value, amount=LIMIT):\n    return value + amount');
  const imported = compile('import library\nx = library.add(value=5)', path.join(dir, 'main.pysn'));
  assert.equal(imported.constants['library.LIMIT'], 3);
  assert.ok(!imported.symbols.some(s => s.name === 'library.LIMIT'));
});
