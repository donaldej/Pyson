'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { emulatorPython } = require('../scripts/environment');
const { convertBMP } = require('../src/assets');
const root = path.resolve(__dirname, '..');

test('The Last Light completes six audible scenes safely on Game Boy and Color', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const foreground = convertBMP(fs.readFileSync(path.join(root, 'examples/last-light/assets/foreground.bmp')), 'sprite', 24, 48);
  // The corner defines transparency; a blank corner on the tree frame must
  // also encode as color zero, rather than an opaque rectangle.
  const firstCorner = foreground.tiles[foreground.maps[0][0]];
  const treeCorner = foreground.tiles[foreground.maps[1][15]];
  assert.equal((firstCorner[0] | firstCorner[1]) & 128, 0);
  assert.equal((treeCorner[14] | treeCorner[15]) & 128, 0);
  const built = spawnSync(process.execPath, ['src/cli.js', 'examples/last-light/main.pysn', 'last-light'], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000
  });
  assert.equal(built.status, 0, built.error?.message || built.stdout + built.stderr);
  const report = JSON.parse(fs.readFileSync(path.join(root, 'build/last-light.report.json'), 'utf8'));
  assert.ok(report.wramFreeBytes >= 512);
  const assets = JSON.parse(fs.readFileSync(path.join(root, 'build/last-light.assets.json'), 'utf8'));
  assert.equal(assets.filter(a => a.kind === 'world').length, 6);
  const worlds = assets.filter(a => a.kind === 'world').map(a => ({
    width: a.columns, ids: a.maps[0], slots: a.streaming.slots,
    tiles: convertBMP(fs.readFileSync(a.file), 'world').tiles
  }));
  fs.writeFileSync(path.join(root, 'build/last-light-worlds.json'), JSON.stringify(worlds));
  const run = spawnSync(emulatorPython(), ['tests/last-light.py'], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 180000
  });
  assert.equal(run.status, 0, run.error?.message || run.stdout + run.stderr);
  console.log(run.stdout.trim());
});
