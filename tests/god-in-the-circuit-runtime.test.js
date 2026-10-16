'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { root, emulatorPython } = require('../scripts/environment');

test('God in the Circuit completes its full timeline safely on DMG and CGB',
  { skip: !fs.existsSync(emulatorPython()) }, () => {
    const build = spawnSync(process.execPath, ['src/cli.js', 'examples/god-in-the-circuit/main.pysn', 'god-in-the-circuit'],
      { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000 });
    assert.equal(build.status, 0, build.error?.message || build.stdout + build.stderr);
    const run = spawnSync(emulatorPython(), ['tests/god-in-the-circuit.py'],
      { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 240000 });
    assert.equal(run.status, 0, run.error?.message || run.stdout + run.stderr);
    console.log(run.stdout.trim());
  });
