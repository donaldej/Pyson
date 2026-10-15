'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { emulatorPython } = require('../scripts/environment');
const root = path.resolve(__dirname, '..');

test('Star Squadron animates all 40 components within scanline limits on DMG and CGB',
  { skip: !fs.existsSync(emulatorPython()) }, () => {
    const build = spawnSync(process.execPath, ['src/cli.js', 'examples/star-squadron/main.pysn', 'star-squadron'],
      { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000 });
    assert.equal(build.status, 0, build.error?.message || build.stdout + build.stderr);
    const report = JSON.parse(fs.readFileSync(path.join(root, 'build/star-squadron.report.json')));
    assert.ok(report.wramFreeBytes >= 128);
    const run = spawnSync(emulatorPython(), ['tests/star-squadron.py'],
      { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000 });
    assert.equal(run.status, 0, run.error?.message || run.stdout + run.stderr);
    console.log(run.stdout.trim());
  });
