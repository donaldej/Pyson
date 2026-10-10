'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile } = require('../src/compiler');
const { prepareWorlds } = require('../src/world-assets');
const filename = path.resolve(__dirname, '../examples/streaming-world/main.pysn');
test('streamed world has more than 256 unique tiles with bounded resident windows', () => {
  const result = compile(fs.readFileSync(filename, 'utf8'), filename);
  const world = result.assets.find(asset => asset.kind === 'world');
  assert.equal(world.columns, 128); assert.equal(world.rows, 128);
  assert.equal(world.streaming.uniqueTiles, 384);
  assert.ok(world.streaming.peakTiles <= world.streaming.capacity);
  assert.ok(new Set(result.banking.objects.map(object => object.bank)).size > 1);
  assert.match(result.assembly, /TryRefreshStream:/);
});
test('streamed regions reject excess local graphics before producing assembly', () => {
  const tiles = Array.from({ length: 170 }, (_, id) => [id, ...Array(15).fill(0)]);
  const world = { kind: 'world', label: 'BudgetWorld', columns: 32, rows: 32, paletteIndex: 1,
    tiles, maps: [Array.from({ length: 1024 }, (_, i) => i % 170)] };
  assert.throws(() => prepareWorlds([world], 95), /needs 170 tiles.*161 slots/);
});
test('world declarations validate shape, collision and ordinary map limits', () => {
  assert.throws(() => compile('w = worldmap("assets/world.bmp", collision=["#"])', filename), /collision/i);
  assert.throws(() => compile('w = tilemap("assets/world.bmp")', filename), /256|32/);
  assert.throws(() => compile('t = tile("assets/brick.bmp")\nw = worldmap([[t], [t, t]])', path.resolve(__dirname, '../examples/scrolling-world/main.pysn')), /width|rectangular|same|rows/);
});
test('neighboring windows reserve different slots even when each window fits separately', () => {
  const world = { kind: 'world', label: 'BoundaryBudget', columns: 78, rows: 1, paletteIndex: 1,
    tiles: [[0, ...Array(15).fill(0)], [1, ...Array(15).fill(0)], [2, ...Array(15).fill(0)]],
    maps: [Array.from({ length: 78 }, (_, x) => Math.floor(x / 26))] };
  assert.throws(() => prepareWorlds([world], 254), /neighboring streaming regions.*2 VRAM slots/);
});
