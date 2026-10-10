'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compile } = require('../src/compiler');
const { convertBMP } = require('../src/assets');
const { assemble } = require('../scripts/dev');
const { makeReport } = require('../src/build-report');
const { emulatorPython } = require('../scripts/environment');
const root = path.resolve(__dirname, '..');

test('Neon Requiem completes all four scenes with motion and original audio', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const input = path.join(root, 'examples/neon-requiem/main.pysn');
  const compiled = compile(fs.readFileSync(input, 'utf8'), input);
  assert.equal(compiled.music.length, 8);
  for (const track of compiled.music) assert.equal(track.steps.reduce((sum, step) => sum + step[1], 0), 512);
  const dir = path.join(root, 'build/tests/neon-requiem');
  fs.mkdirSync(dir, { recursive: true });
  const asm = path.join(dir, 'demo.asm');
  fs.writeFileSync(asm, compiled.assembly);
  const rom = assemble(asm, 'neon-requiem');
  const symbols = path.join(root, 'build/neon-requiem.sym');
  const report = makeReport(compiled, fs.readFileSync(symbols, 'utf8'), fs.statSync(rom).size);
  assert.ok(report.wramFreeBytes >= 256);
  const manifest = path.join(dir, 'demo.json');
  const world = compiled.assets.find(asset => asset.kind === 'world');
  assert.equal(world.width, 1024);
  fs.writeFileSync(manifest, JSON.stringify({ rom, symbols, variables: report.variables, output: dir,
    world: { width: world.columns, ids: world.maps[0], slots: world.streaming.slots, tiles: convertBMP(fs.readFileSync(world.file), 'world').tiles }
  }));
  const run = spawnSync(emulatorPython(), [path.join(__dirname, 'neon-requiem.py'), manifest], { encoding: 'utf8', timeout: 120000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  console.log(run.stdout.trim());
});
