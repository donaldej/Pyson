'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile } = require('../src/compiler');
const { parse } = require('../src/parser');
const { convertBMP, collectAssets } = require('../src/assets');
const root = path.resolve(__dirname, '..');
const brick = path.join(root, 'examples/star-chase/assets/brick.bmp').replaceAll('\\', '/');
const floor = path.join(root, 'examples/star-chase/assets/floor.bmp').replaceAll('\\', '/');
const board = path.join(root, 'examples/star-chase/assets/board.bmp').replaceAll('\\', '/');
const declarations = `wall = tile("${brick}", solid=True, terrain=255)\nopen_tile = tile("${floor}")\n`;

test('atlas tile selection preserves whole-image palette, exact patterns, sharing and terrain', () => {
  const atlas = path.join(root, 'examples/prism-forge/assets/patterns.bmp').replaceAll('\\', '/');
  const original = convertBMP(fs.readFileSync(atlas), 'background');
  const source = `a = tile("${atlas}", x=2, y=3, solid=True, terrain=7)\nb = tile("${atlas}", y=3, x=2)\nc = tile("${atlas}", x=13, y=7)\nboard = tilemap([[a,b,c]])`;
  compile(source);
  const [a, b, c] = collectAssets(parse(source), '<source>').assets;
  assert.deepEqual(a.tiles[0], original.tiles[original.maps[0][3 * original.columns + 2]]);
  assert.deepEqual(c.tiles[0], original.tiles[original.maps[0].at(-1)]);
  assert.deepEqual(a.palette, original.palette);
  assert.equal(a.paletteIndex, b.paletteIndex);
  assert.equal(a.paletteIndex, c.paletteIndex);
  assert.deepEqual(a.maps, b.maps);
  assert.equal(a.solid, true);
  assert.equal(a.terrain, 7);
  for (const options of ['x=-1', 'y=32', 'x=True', 'x=14', 'y=8', 'x=1.5']) {
    assert.throws(() => compile(`a = tile("${atlas}", ${options})`), /atlas|literal|integer/);
  }
});

test('tile options and nested maps parse with Python keyword syntax and trailing commas', () => {
  const ast = parse('wall = tile("wall.bmp", terrain=2, solid=True,)\nboard = tilemap([[wall, wall], [wall, wall],])');
  assert.equal(ast[0].expression.args[1].type, 'keyword');
  assert.equal(ast[0].expression.args[1].name, 'terrain');
  assert.equal(ast[1].expression.args[0].items[0].type, 'list');
});

test('nested map cells share graphics, palettes and property definitions', () => {
  const result = compile(declarations + `other = tile("${brick}", terrain=7, solid=False)\nboard = tilemap([[wall, open_tile, other], [other, wall, wall]])`);
  const [wall, open, other, map] = result.assets;
  assert.equal(wall.paletteIndex, other.paletteIndex);
  assert.deepEqual(wall.maps, other.maps);
  assert.equal(open.solid, false);
  assert.equal(open.terrain, 0);
  assert.equal(map.kind, 'manual');
  assert.equal(map.columns, 3);
  assert.equal(map.rows, 2);
  assert.deepEqual(map.cellMap, [0, 1, 2, 2, 0, 0]);
  assert.deepEqual(map.definitions, [[wall.maps[0][0], wall.paletteIndex | 128, 255], [open.maps[0][0], open.paletteIndex, 0], [other.maps[0][0], other.paletteIndex, 7]]);
  assert.deepEqual(map.maps[0], [wall.maps[0][0], open.maps[0][0], other.maps[0][0], other.maps[0][0], wall.maps[0][0], wall.maps[0][0]]);
  const max = compile(declarations + 'board = tilemap([' + Array(32).fill('[' + Array(32).fill('wall').join(',') + ']').join(',') + '])').assets.at(-1);
  assert.equal(max.cellMap.length, 1024);
  assert.equal(max.definitions.length, 1);
});

test('tile declarations and nested maps reject ambiguous or unsupported inputs', () => {
  for (const source of [
    `x = tile("${board}")`, `x = tile("${brick}", solid=1)`,
    `x = tile("${brick}", terrain=-1)`, `x = tile("${brick}", terrain=256)`,
    `x = tile("${brick}", terrain=True)`, `x = tile("${brick}", solid=True, solid=False)`,
    `x = tile("${brick}", unknown=1)`, `x = tile("${brick}", True)`,
    'board = tilemap([])', 'board = tilemap([[]])', 'board = tilemap([[wall], [wall, wall]])',
    'board = tilemap([[missing]])', 'board = tilemap([[1]])', 'board = tilemap([wall])',
    'board = tilemap([[tile("x.bmp")]])', 'board = tilemap([[wall]], 2)',
    'def f():\n    board = tilemap([[wall]])', 'def f():\n    x = tile("x.bmp")',
    'board = tilemap([' + Array(33).fill('[wall]').join(',') + '])',
    'board = tilemap([[' + Array(33).fill('wall').join(',') + ']])',
    'print("hi", tile_x=0, y=0)', 'def f(a):\n    return a\nx = f(unknown=1)'
  ]) assert.throws(() => compile(declarations + source), /tile|solid|terrain|keyword|asset/i, source);
});

test('module tile declarations can build maps in another module without duplicating imports', () => {
  const directory = path.join(root, 'build/tests/tilemap-modules');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'tiles.pysn'), declarations);
  fs.writeFileSync(path.join(directory, 'screen.pysn'), 'import tiles as art\nboard = tilemap([[art.wall, art.open_tile]])\ndef check(x):\n    return tile_terrain(board, x, 0)');
  const result = compile('import tiles as art\nimport screen as game\nvalue = game.check(0)', path.join(directory, 'main.pysn'));
  assert.equal(result.assets.length, 3);
  assert.equal(result.assets[2].definitions[0][2], 255);
});
