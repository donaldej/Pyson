'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile } = require('../src/compiler');
const { convertBMP } = require('../src/assets');
const directory = path.resolve(__dirname, '../build/tests/background-clips');
fs.mkdirSync(directory, { recursive: true });
const file = path.join(directory, 'three-frames.bmp');
const data = Buffer.alloc(54 + 24 * 8 * 3);
data.write('BM'); data.writeUInt32LE(data.length, 2); data.writeUInt32LE(54, 10);
data.writeUInt32LE(40, 14); data.writeInt32LE(24, 18); data.writeInt32LE(8, 22);
data.writeUInt16LE(1, 26); data.writeUInt16LE(24, 28);
for (let y = 0; y < 8; y++) for (let x = 0; x < 24; x++) {
  const color = [12, 82, 164, 248][((x >> 3) + ((x & 7) > y ? 1 : 0)) % 4];
  const i = 54 + ((7 - y) * 24 + x) * 3;
  data[i] = data[i + 1] = data[i + 2] = color;
}
fs.writeFileSync(file, data);
const filename = path.join(directory, 'main.pysn');
const declaration = 'clip = background_clip("three-frames.bmp", 8, 8)\n';

test('background clips bank exact per-frame patterns/layouts and reserve two shared buffers', () => {
  const converted = convertBMP(data, 'clip', 8, 8);
  assert.equal(converted.frames, 3);
  const result = compile(declaration + 'draw_background(frame=2, clip=clip, y=3, x=2)\nrefresh_screen()', filename);
  const asset = result.assets[0];
  assert.equal(asset.kind, 'clip');
  assert.equal(asset.clip.peakFramePatterns, 1);
  assert.equal(asset.clip.patternsPerBuffer, 1);
  assert.equal(result.banking.objects.filter(o => o.kind === 'background-frame').length, 3);
  assert.equal(result.banking.objects.find(o => o.kind === 'background-index').bytes, 12);
  for (let frame = 0; frame < 3; frame++) {
    const bytes = [1, ...converted.tiles[converted.maps[frame][0]], 0];
    assert.ok(result.assembly.includes(`AssetMap0Frame${frame}:\n    db ${bytes.join(', ')}`));
  }
  assert.match(result.assembly, /DEF FRAME_CLOCK_ENABLED EQU 1/);
  assert.match(result.assembly, /call DrawBackground/);
  const repeated = compile(declaration + 'other = background_clip("three-frames.bmp",8,8)\n', filename);
  assert.equal(repeated.assets.length, 1);
});

test('clip validation rejects invalid sheets, bounds, placement, mixed renderers and VRAM overcommit', () => {
  for (const source of [
    'a = background_clip("three-frames.bmp", 0, 8)',
    'a = background_clip("three-frames.bmp", 16, 8)',
    'a = background_clip("three-frames.bmp", 168, 8)',
    'a = background_clip("three-frames.bmp", True, 8)',
    'a = background_clip("three-frames.bmp")',
    'def f():\n    a = background_clip("three-frames.bmp", 8, 8)',
    declaration + 'draw_background(clip, 0, 20, 0)',
    declaration + 'show_window()',
    declaration + 'set_camera(0, 0)',
    declaration + 'world = worldmap("three-frames.bmp")'
  ]) assert.throws(() => compile(source, filename), /clip|frame|asset|literal|argument|window|camera|size|multiple|positive/i, source);
  const { prepareClips } = require('../src/background-clips');
  const tiles = Array.from({ length: 80 }, () => Array(16).fill(0));
  assert.throws(() => prepareClips([{ kind: 'clip', file: 'too-large.bmp', label: 'Clip', frames: 1,
    maps: [tiles.map((_, i) => i)], tiles }], 100), /two buffers.*80/);
});
