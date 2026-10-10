'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { options, profile } = require('../scripts/profile');
const { emulatorPython } = require('../scripts/environment');
const root = path.resolve(__dirname, '..');

test('profiler rejects missing, incompatible and unbounded arguments', () => {
  for (const args of [[], ['main.pysn', '--frames', '0'], ['main.pysn', '--frames', '-1'], ['main.pysn', '--frames', '20001'],
    ['main.pysn', '--warmup', '1.5'], ['main.pysn', '--target', 'other'], ['main.pysn', '--frames'], ['main.pysn', '--other'], ['one.pysn', 'two.pysn']]) assert.throws(() => options(args));
  assert.equal(options(['main.pysn']).frames, 600);
  assert.equal(options(['main.pysn', '--warmup', '0', '--target', 'dmg']).warmup, 0);
});

test('profiles distinguish wait, heavy work and idle without changing guest timing or state', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const dir = path.join(root, 'build/tests/profiling');
  fs.mkdirSync(dir, { recursive: true });
  for (const kind of ['steady', 'heavy', 'idle', 'banked']) for (const target of ['dmg', 'cgb']) {
    const input = path.join(dir, `${kind}-${target}.pysn`);
    const setup = 'header.target = "dual"\nmarker = 0\n' + (kind === 'banked' ? `values = constant_table([${Array(8191).fill('1').join(',')}])\ndef step(value):\n    return (value + values[-1]) & 32767\n` : '');
    const source = kind === 'idle' ? setup + 'print("PROFILE", 0, 0)\nrefresh_screen()\n' : setup + `while True:
    ${kind === 'heavy' ? 'for i in range(600):\n        marker += 1' : kind === 'banked' ? 'marker = step(marker)' : 'marker += 1'}
    sprite_palette(0, 0, 1, 2, 3)
    refresh_screen()
`;
    fs.writeFileSync(input, source);
    const result = profile({ input, target, frames: 40, warmup: 20 });
    assert.equal(result.hardware_frames, 40);
    assert.ok(Math.abs(result.work_percent + result.wait_percent + result.idle_percent - 100) <= 0.02);
    if (kind === 'idle') {
      assert.equal(result.display_commits, 0);
      assert.ok(result.idle_percent > 99);
      assert.equal(result.refresh_interval_frames.median, null);
    } else if (kind === 'steady' || kind === 'banked') {
      assert.ok(result.display_commits >= 38);
      assert.ok(result.wait_percent > 50);
      assert.ok(result.refresh_interval_frames.median <= 1.02);
    } else {
      assert.ok(result.display_commits < 30);
      assert.ok(result.work_percent > 50);
      assert.ok(result.refresh_interval_frames.median > 1.5);
      assert.ok(result.source_visits.some(site => site.visits > 100));
    }
    const name = `profile-profiling-${kind}-${target}`;
    const manifest = path.join(root, 'build/profiles', name, 'input.json');
    const baseline = spawnSync(emulatorPython(), [path.join(__dirname, 'profile-baseline.py'), manifest], { encoding: 'utf8', timeout: 30000 });
    assert.equal(baseline.status, 0, baseline.error?.message || baseline.stdout + baseline.stderr);
    console.log(baseline.stdout.trim());
  }
});
