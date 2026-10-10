'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compile } = require('../src/compiler');
const { assemble } = require('../scripts/dev');
const { emulatorPython } = require('../scripts/environment');
const { profile } = require('../scripts/profile');
const { makeReport } = require('../src/build-report');
const { convertBMP } = require('../src/assets');
const root = path.resolve(__dirname, '..');

test('double speed preserves graphics, input and audio with monochrome fallback', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const dir = path.join(root, 'build/tests/double-speed');
  fs.mkdirSync(dir, { recursive: true });
  const filename = path.join(root, 'examples/color-sprites.pysn');
  const source = fs.readFileSync(filename, 'utf8').replace('header.target = "dual"', 'header.target = "dual"\nheader.cpu_speed = "double"');
  assert.ok(source.includes('header.cpu_speed'));
  const cases = [];
  for (const cgb of [false, true]) {
    const compiled = compile(source, filename);
    const name = `runtime-double-speed-${cgb}`;
    const asm = path.join(dir, name + '.asm');
    fs.writeFileSync(asm, compiled.assembly);
    cases.push({ name, rom: assemble(asm, name), cgb, frames: 150, symbols: path.join(root, 'build', name + '.sym'),
      symbolNames: Object.fromEntries(compiled.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label])),
      variables: { x: 72, y: 72, theme: 0 }, registers: cgb ? [{ address: 0xff4d, mask: 128, value: 128 }] : [],
      steps: [{ press: ['right'], frames: 8, ranges: { x: [73, 80] } }, { release: ['right'], press: ['a'], frames: 8, variables: { theme: 1 } }] });
  }
  for (const speed of ['normal', 'double']) {
    const compiled = compile(`header.target = "cgb"\nheader.cpu_speed = "${speed}"\nsong = music_track([[440, 255, 8], [660, 255, 8]])\nplay_music(song)\nsteps = 0\nwhile True:\n    wait_vblank()\n    steps += 1\n`);
    const name = 'runtime-double-speed-audio-' + speed;
    const asm = path.join(dir, name + '.asm');
    fs.writeFileSync(asm, compiled.assembly);
    cases.push({ name, rom: assemble(asm, name), cgb: true, audio: true, frames: 150,
      symbols: path.join(root, 'build', name + '.sym'),
      symbolNames: Object.fromEntries(compiled.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label])),
      ranges: { steps: [70, 120] }, audio_varies: true,
      bytes: [{ symbol: 'wMusicActive', values: [1] }],
      registers: [{ address: 0xff4d, mask: 128, value: speed === 'double' ? 128 : 0 }] });
  }
  const demo = path.join(root, 'examples/cpu-speed/main.pysn');
  const compiledDemo = compile(fs.readFileSync(demo, 'utf8'), demo);
  const demoAsm = path.join(dir, 'demo.asm');
  fs.writeFileSync(demoAsm, compiledDemo.assembly);
  const demoRom = assemble(demoAsm, 'cpu-speed');
  for (const cgb of [false, true]) cases.push({ name: 'cpu-speed-' + cgb, rom: demoRom, cgb, frames: 150,
    symbols: path.join(root, 'build/cpu-speed.sym'),
    symbolNames: Object.fromEntries(compiledDemo.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label])),
    ranges: { x: [1, 143] }, bytes: [{ address: 0xfe00, values: [80] }] });
  const manifest = path.join(dir, 'cases.json');
  fs.writeFileSync(manifest, JSON.stringify(cases));
  const run = spawnSync(emulatorPython(), [path.join(__dirname, 'emulator.py'), manifest], { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.error?.message || run.stdout + run.stderr);

  // Music advances on display waits, not raw CPU speed. Compare steady cadence
  // and full game state against an uninstrumented run in both speed settings.
  const results = {};
  for (const speed of ['normal', 'double']) {
    const input = path.join(dir, speed + '.pysn');
    fs.writeFileSync(input, `header.target = "dual"\nheader.cpu_speed = "${speed}"\nsong = music_track([[440, 255, 8], [660, 255, 8]])\nplay_music(song)\nx = 0\nwhile True:\n    for i in range(100):\n        x += 1\n    sprite_palette(0, 0, 1, 2, 3)\n    refresh_screen()\n`);
    results[speed] = profile({ input, target: 'cgb', frames: 60, warmup: 20 });
    assert.equal(results[speed].cpu_speed, speed);
    const baseline = spawnSync(emulatorPython(), [path.join(__dirname, 'profile-baseline.py'), path.join(root, 'build/profiles', 'profile-double-speed-' + speed, 'input.json')], { encoding: 'utf8', timeout: 30000 });
    assert.equal(baseline.status, 0, baseline.error?.message || baseline.stdout + baseline.stderr);
  }
  assert.ok(results.double.display_commits > results.normal.display_commits);
  assert.ok(results.double.refresh_interval_frames.median < results.normal.refresh_interval_frames.median);
  console.log(JSON.stringify({ normal: results.normal.refresh_interval_frames, double: results.double.refresh_interval_frames }));
});

test('double-speed streamed demo completes both targets without corrupting graphics or music', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const input = path.join(root, 'examples/void-engine/main.pysn');
  const compiled = compile('header.cpu_speed = "double"\n' + fs.readFileSync(input, 'utf8'), input);
  const dir = path.join(root, 'build/tests/double-speed-world');
  fs.mkdirSync(dir, { recursive: true });
  const asm = path.join(dir, 'demo.asm');
  fs.writeFileSync(asm, compiled.assembly);
  const rom = assemble(asm, 'runtime-double-speed-world');
  const symbols = path.join(root, 'build/runtime-double-speed-world.sym');
  const report = makeReport(compiled, fs.readFileSync(symbols, 'utf8'), fs.statSync(rom).size);
  const worlds = compiled.assets.filter(a => a.kind === 'world').map(a => ({ width: a.columns, ids: a.maps[0], slots: a.streaming.slots, tiles: convertBMP(fs.readFileSync(a.file), 'world').tiles }));
  const manifest = path.join(dir, 'input.json');
  fs.writeFileSync(manifest, JSON.stringify({ rom, symbols, variables: report.variables, worlds, output: dir }));
  const run = spawnSync(emulatorPython(), [path.join(__dirname, 'void-engine.py'), manifest], { encoding: 'utf8', timeout: 120000 });
  assert.equal(run.status, 0, run.error?.message || run.stdout + run.stderr);
  console.log(run.stdout.trim());
});
