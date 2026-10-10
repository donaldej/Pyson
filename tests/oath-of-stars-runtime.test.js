'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { emulatorPython } = require('../scripts/environment');
const { convertBMP } = require('../src/assets');
const root = path.resolve(__dirname, '..');

test('Oath of Stars runs seven original live-effects acts, controls and save persistence on both models', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const built = spawnSync(process.execPath, ['src/cli.js','examples/oath-of-stars/main.pysn','oath-of-stars'], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000
  });
  assert.equal(built.status, 0, built.error?.message || built.stdout + built.stderr);
  const report = JSON.parse(fs.readFileSync(path.join(root,'build/oath-of-stars.report.json'),'utf8'));
  assert.ok(report.wramFreeBytes >= 128);
  const music = JSON.parse(fs.readFileSync(path.join(root,'build/oath-of-stars.music.json'),'utf8'));
  assert.equal(music.length, 14);
  for (const part of music) assert.equal(part.steps.reduce((sum,note)=>sum+note[1],0),1024);
  const assets = JSON.parse(fs.readFileSync(path.join(root,'build/oath-of-stars.assets.json'),'utf8'));
  const worlds = assets.filter(a=>a.kind==='world').map(a=>({width:a.columns,ids:a.maps[0],slots:a.streaming.slots,tiles:convertBMP(fs.readFileSync(a.file),'world').tiles}));
  assert.equal(worlds.length,6);
  fs.writeFileSync(path.join(root,'build/oath-of-stars-worlds.json'),JSON.stringify(worlds));
  const oldAssets = fs.readdirSync(path.join(root,'examples/last-light/assets'))
    .filter(name=>/\.(bmp|json)$/.test(name)).map(name=>fs.readFileSync(path.join(root,'examples/last-light/assets',name)));
  for (const name of fs.readdirSync(path.join(root,'examples/oath-of-stars/assets')).filter(name=>/\.(bmp|json)$/.test(name))) {
    const bytes = fs.readFileSync(path.join(root,'examples/oath-of-stars/assets',name));
    assert.ok(!oldAssets.some(old=>old.equals(bytes)), `Reused old asset ${name}`);
  }
  const run = spawnSync(emulatorPython(), ['tests/oath-of-stars.py'], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 180000
  });
  assert.equal(run.status,0,run.error?.message || run.stdout+run.stderr);
  console.log(run.stdout.trim());
});
