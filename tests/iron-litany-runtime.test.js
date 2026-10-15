'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { emulatorPython } = require('../scripts/environment');
const { convertBMP } = require('../src/assets');
const root = path.resolve(__dirname, '..');

test('Iron Litany completes four audible scenes safely on Game Boy and Color', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const built = spawnSync(process.execPath, ['src/cli.js', 'examples/iron-litany/main.pysn', 'iron-litany'], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000
  });
  assert.equal(built.status, 0, built.error?.message || built.stdout + built.stderr);
  const report = JSON.parse(fs.readFileSync(path.join(root, 'build/iron-litany.report.json'), 'utf8'));
  assert.ok(report.wramFreeBytes >= 128);
  const assets = JSON.parse(fs.readFileSync(path.join(root, 'build/iron-litany.assets.json'), 'utf8'));
  assert.equal(assets.filter(a => a.kind === 'world').length, 4);
  const worlds = assets.filter(a => a.kind === 'world').map(a => ({
    width: a.columns, ids: a.maps[0], slots: a.streaming.slots,
    tiles: convertBMP(fs.readFileSync(a.file), 'world').tiles
  }));
  fs.writeFileSync(path.join(root, 'build/iron-litany-worlds.json'), JSON.stringify(worlds));
  const run = spawnSync(emulatorPython(), ['tests/iron-litany.py'], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 180000
  });
  assert.equal(run.status, 0, run.error?.message || run.stdout + run.stderr);
  console.log(run.stdout.trim());
});
