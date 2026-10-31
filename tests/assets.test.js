'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { decodeBMP, convertBMP } = require('../src/assets');
const { compile } = require('../src/compiler');
const root = path.resolve(__dirname, '..');

function bmp(width, height, pixel, topDown = false, depth = 24) {
  const stride = Math.ceil(width * depth / 32) * 4;
  const data = Buffer.alloc(54 + stride * height);
  data.write('BM'); data.writeUInt32LE(data.length, 2); data.writeUInt32LE(54, 10);
  data.writeUInt32LE(40, 14); data.writeInt32LE(width, 18); data.writeInt32LE(topDown ? -height : height, 22);
  data.writeUInt16LE(1, 26); data.writeUInt16LE(depth, 28);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const color = pixel(x, y); const offset = 54 + (topDown ? y : height - y - 1) * stride + x * (depth / 8);
    data[offset] = color[2]; data[offset + 1] = color[1]; data[offset + 2] = color[0];
    if (depth === 32) data[offset + 3] = color[3];
  }
  return data;
}

test('BMP decoder handles orientation, scanline padding and alpha', () => {
  for (const topDown of [false, true]) {
    const image = decodeBMP(bmp(3, 2, (x, y) => [x * 50, y * 90, 17], topDown));
    assert.deepEqual(image.pixels[4], [50, 90, 17, 255]);
  }
  assert.equal(decodeBMP(bmp(8, 8, () => [0, 0, 0, 255], false, 32)).alpha, true);
  assert.equal(decodeBMP(bmp(8, 8, () => [0, 0, 0, 0], false, 32)).alpha, false);
});

test('large clip sheets keep the frame and world-map limits', () => {
  const data = bmp(1600, 1280, () => [0, 0, 0]);
  const clip = convertBMP(data, 'clip', 160, 80);
  assert.equal(clip.frames, 160);
  assert.equal(clip.columns, 20);
  assert.equal(clip.rows, 10);
  assert.throws(() => convertBMP(data, 'world'), /1024/);
  assert.throws(() => convertBMP(data, 'clip', 80, 80), /255 frames/);
  assert.throws(() => decodeBMP(bmp(2056, 8, () => [0, 0, 0])), /2048/);
});

test('large clip sheets can also supply a selected static atlas tile', () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'pyson-large-atlas-'));
  try {
    const file = path.join(dir, 'shared.bmp');
    fs.writeFileSync(file, bmp(1600, 1280, () => [0, 0, 0]));
    const literal = JSON.stringify(file.replaceAll('\\', '/'));
    const source = `clip = background_clip(${literal}, 160, 80)\na = tile(${literal}, x=3, y=2)\nmap = tilemap([[a]])`;
    compile(source);
    const { collectAssets } = require('../src/assets');
    const { parse } = require('../src/parser');
    const [clip, tile] = collectAssets(parse(source), '<source>').assets;
    assert.equal(tile.kind, 'tile');
    assert.equal(tile.paletteIndex, clip.paletteIndex);
    assert.deepEqual(tile.palette, clip.palette);
    assert.deepEqual(tile.tiles, [Array(16).fill(0)]);
    assert.equal(tile.width, 8);
    assert.equal(tile.height, 8);
    assert.throws(() => compile(`map = tilemap(${literal})`), /1024|32x32/);
    assert.throws(() => compile(`map = worldmap(${literal})`), /1024/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('one atlas tile can share a large clip source without creating a large background map', () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'pyson-atlas-'));
  try {
    const file = path.join(dir, 'large.bmp');
    const data = bmp(320, 320, (x, y) => ((x + y) % 3 ? [255, 255, 255] : [0, 0, 0]));
    fs.writeFileSync(file, data);
    const literal = JSON.stringify(file.replaceAll('\\', '/'));
    const source = `clip = background_clip(${literal}, 160, 80)\na = tile(${literal}, x=2, y=3)\nmap = tilemap([[a]])`;
    compile(source);
    const { collectAssets } = require('../src/assets');
    const { parse } = require('../src/parser');
    const [clip, tile, map] = collectAssets(parse(source), '<source>').assets;
    assert.equal(tile.paletteIndex, clip.paletteIndex);
    assert.deepEqual(tile.palette, clip.palette);
    assert.equal(tile.width, 8);
    assert.equal(tile.height, 8);
    assert.equal(map.columns, 1);
    const original = convertBMP(data, 'world');
    assert.deepEqual(tile.tiles[0], original.tiles[original.maps[0][3 * 40 + 2]]);
    assert.throws(() => compile(`map = tilemap(${literal})`), /32x32/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('converts exact bitplanes, deduplicates tiles, and orders sheet frames', () => {
  const black = [0, 0, 0]; const white = [255, 255, 255];
  const image = bmp(16, 8, (x, y) => x % 8 === y ? black : white);
  const result = convertBMP(image);
  assert.equal(result.frames, 2);
  assert.equal(result.tiles.length, 1);
  assert.deepEqual(result.maps, [[0], [0]]);
  assert.deepEqual(result.tiles[0].slice(0, 4), [127, 0, 191, 0]);
  // The top-left black color is transparent; white is opaque color 1.
  assert.equal(result.quantized, false);
  const alpha = convertBMP(bmp(8, 8, (x, y) => x === 0 && y === 0 ? [255, 0, 0, 0] : [255, 0, 0, 255], false, 32));
  assert.deepEqual(alpha.tiles[0].slice(0, 2), [127, 0]);
});

test('color reduction is deterministic and respects four-color hardware limits', () => {
  const source = bmp(16, 16, (x, y) => [x * 17, y * 17, (x + y) * 8]);
  const first = convertBMP(source, 'background');
  assert.equal(first.palette.length, 4);
  assert.equal(first.quantized, true);
  assert.deepEqual(convertBMP(source, 'background'), first);
  assert.ok(first.palette.every(color => color >= 0 && color <= 32767));
});

test('rejects corrupt, compressed and unsupported BMPs and invalid frames', () => {
  assert.throws(() => decodeBMP(Buffer.from('bad')), /Windows BMP/);
  const file = bmp(8, 8, () => [255, 255, 255]);
  assert.throws(() => decodeBMP(file.subarray(0, file.length - 1)), /Truncated/);
  const compressed = Buffer.from(file); compressed.writeUInt32LE(1, 30);
  assert.throws(() => decodeBMP(compressed), /uncompressed/);
  assert.throws(() => convertBMP(bmp(9, 8, () => [0, 0, 0])), /multiples of 8/);
  assert.throws(() => convertBMP(file, 'sprite', 16, 8), /divide/);
  assert.throws(() => convertBMP(bmp(8, 328, () => [0, 0, 0]), 'sprite', 8, 328), /40 hardware/);
});

test('compiler resolves relative asset paths and deduplicates repeated imports', () => {
  const filename = path.join(root, 'examples', 'virtual.pysn');
  const result = compile('hero = sprite_sheet("assets/hero.bmp", 16, 16)\nother = sprite_sheet("assets/hero.bmp", 16, 16)\nsprite(0, hero, 0, 20, 30)\nrefresh_screen()', filename);
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].frames, 2);
  assert.equal(result.assets[0].columns, 2);
  assert.equal(result.assets[0].file, path.join(root, 'examples', 'assets', 'hero.bmp'));
});

test('graphics built-ins validate declarations and palette arguments', () => {
  for (const [source, error] of [
    ['if True:\n    s = sprite_sheet("missing.bmp")', /top-level/],
    ['sprite_sheet("missing.bmp")', /top-level assignments/],
    ['s = sprite_sheet("missing.bmp")', /missing\.bmp/],
    ['bg_palette(8, 0, 0, 0, 0)', /0\.\.7/],
    ['bg_palette(0, "bad", 0, 0, 0)', /RGB15/],
    ['clear_screen(8)', /0\.\.7/],
    ['sprite(40, 0, 0, 0, 0)', /0\.\.39/],
    ['draw_map(0, 20, 0)', /0\.\.19/],
    ['print("hi", 0, 0, 8)', /palette/],
    ['x = refresh_screen()', /procedure/]
  ]) assert.throws(() => compile(source), error, source);
});

test('shared VRAM budget is enforced after deduplication against the font', () => {
  const directory = path.join(root, 'build', 'tests');
  fs.mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, 'budget.bmp');
  fs.writeFileSync(filename, bmp(136, 80, (x, y) => {
    const index = Math.floor(x / 8) + Math.floor(y / 8) * 17;
    const bit = (y % 8) * 8 + x % 8;
    return bit < 16 && (index >> bit) & 1 ? [0, 0, 0] : [255, 255, 255];
  }));
  assert.throws(() => compile(`background = tilemap(${JSON.stringify(filename)})`), /256-tile budget/);
});


test('collision maps pack static rows into ROM without tiles or palettes', () => {
  const result = compile('level = collision_map(["#........", "........#"])');
  const asset = result.assets[0];
  assert.equal(asset.kind, 'collision');
  assert.equal(asset.tileCount, 0);
  assert.deepEqual(asset.maps, [[1, 0, 2]]);
  assert.equal(result.symbols.find(s => s.name === 'level').bytes ?? 2, 2);
  for (const source of [
    'm = collision_map([])', 'm = collision_map(["##", "."])',
    'm = collision_map(["x"])', 'm = collision_map([1])',
    'm = collision_map(["' + '.'.repeat(33) + '"])',
    'def f():\n    m = collision_map(["."])',
    'rows = [1]\nm = collision_map(rows)',
    'm = collision_map(["."], 2)', 'tile_is_solid(0, 0)', 'map_width()',
    'tile_at(0, "x", 0)'
  ]) assert.throws(() => compile(source), /collision|asset|expects|integer/i, source);
});
