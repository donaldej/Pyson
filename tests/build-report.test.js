'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compile } = require('../src/compiler');
const { makeGraphicsReport, formatReport } = require('../src/build-report');
const root = path.resolve(__dirname, '..');

test('graphics reports distinguish repeated map cells, unique patterns, streaming slots and composite sprites', () => {
  const file = path.join(root, 'examples/star-squadron/main.pysn');
  const compiled = compile(fs.readFileSync(file, 'utf8'), file);
  const graphics = makeGraphicsReport(compiled.assets);
  const sky = graphics.assets.find(asset => asset.kind === 'world');
  assert.equal(sky.mapPositions, 1280);
  assert.equal(sky.uniqueTiles, 18);
  assert.equal(sky.tilePatternBytes, 288);
  assert.equal(sky.spriteComponentsPerFrame, 0);
  assert.equal(sky.streaming.allocatedSlots, 18);
  assert.equal(sky.streaming.allocatedTileBytes, 288);
  assert.equal(graphics.residentTiles + sky.streaming.availableSlots, 256);
  assert.deepEqual(graphics.assets.filter(asset => asset.kind === 'sprite').map(asset => asset.spriteComponentsPerFrame), [4,4,1,1]);
  assert.equal(graphics.importedBackgroundPalettes, 1);
  assert.equal(graphics.importedSpritePalettes, 4);
});

test('shared resident tile patterns are counted once, rather than summed across imports', () => {
  const file = path.join(root, 'examples/report-fixture.pysn');
  const one = compile('ship = sprite_sheet("star-squadron/assets/player.bmp", 16, 16)\nsprite(0, ship, 0, 0, 0)\n', file);
  const two = compile('ship = sprite_sheet("star-squadron/assets/player.bmp", 16, 16)\nother = tilemap("star-squadron/assets/player.bmp")\nsprite(0, ship, 0, 0, 0)\n', file);
  assert.equal(makeGraphicsReport(one.assets).residentTiles, makeGraphicsReport(two.assets).residentTiles);
  assert.equal(makeGraphicsReport(two.assets).assets.length, 2);
});

test('build CLI emits a readable report and retains linked source/variable metadata', () => {
  const result = spawnSync(process.execPath, ['src/cli.js', 'examples/star-squadron/main.pysn', 'report-check'],
    { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(fs.readFileSync(path.join(root, 'build/report-check.report.json'), 'utf8'));
  const readable = fs.readFileSync(path.join(root, 'build/report-check.report.txt'), 'utf8');
  assert.equal(readable, formatReport(report));
  assert.match(readable, /1280 tile positions -> 18 unique tile patterns/);
  assert.match(readable, /Streaming VRAM slots: 18\//);
  assert.match(readable, /Sprite components per frame drawn: 4/);
  assert.ok(report.sources.some(source => Number.isInteger(source.address)));
  assert.ok(report.variables.some(variable => Number.isInteger(variable.address)));
});
