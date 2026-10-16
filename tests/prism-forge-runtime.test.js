'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root, emulatorPython } = require('../scripts/environment');

test('Prism Forge completes all five animated acts with audio on DMG and CGB',
  { skip: !fs.existsSync(emulatorPython()) }, () => {
    const build = spawnSync(process.execPath, ['src/cli.js', 'examples/prism-forge/main.pysn', 'prism-forge'],
      { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000 });
    assert.equal(build.status, 0, build.error?.message || build.stdout + build.stderr);
    const report = JSON.parse(fs.readFileSync(path.join(root, 'build/prism-forge.report.json')));
    assert.ok(report.wramFreeBytes > 512);
    const run = spawnSync(emulatorPython(), ['tests/prism-forge.py'],
      { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 180000 });
    assert.equal(run.status, 0, run.error?.message || run.stdout + run.stderr);
    console.log(run.stdout.trim());
  });
