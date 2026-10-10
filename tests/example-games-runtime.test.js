'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compile } = require('../src/compiler');
const { assemble } = require('../scripts/dev');
const { emulatorPython } = require('../scripts/environment');
const root = path.resolve(__dirname, '..');

test('showcase games run, restart, and persist progress on DMG and Color', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const dir = path.join(root, 'build/tests/example-games');
  fs.mkdirSync(dir, { recursive: true });
  const cases = [];
  for (const name of ['vault-run', 'meteor-guard']) {
    const source = path.join(root, 'examples', name, 'main.pysn');
    const compiled = compile(fs.readFileSync(source, 'utf8'), source);
    const asm = path.join(dir, name + '.asm');
    fs.writeFileSync(asm, compiled.assembly);
    const rom = assemble(asm, name);
    const symbols = path.join(root, 'build', name + '.sym');
    const symbolNames = Object.fromEntries(compiled.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label]));
    for (const cgb of [false, true]) {
      const base = { rom, symbols, symbolNames, cgb, frames: 120, audio: true, audio_varies: true };
      const ram = path.join(dir, `${name}-${cgb}.ram`);
      if (name === 'vault-run') {
        // Fixture placement happens during dialogue, outside movement's read/write cycle.
        const place = (x, y) => [
          { press: ['select'], frames: 90 },
          { release: ['select'], set: { x, y }, frames: 8, variables: { x, y } },
          { press: ['b'], frames: 30 },
          { release: ['b'], frames: 8 }
        ];
        cases.push({ ...base, name: name + cgb, variables: { keys: 0, won: 0, door_open: 0 }, ram_out: ram, steps: [
          { press: ['right'], frames: 8, variables: { keys: 1 }, arrays: { collected: [1, 0, 0] } },
          { release: ['right'], frames: 8 },
          ...place(56, 56),
          ...place(72, 40),
          { frames: 8, variables: { x: 72, y: 40, keys: 2 }, bytes: [{ symbol: 'wDialogueActive', values: [0] }] },
          { press: ['a'], frames: 30, variables: { door_open: 1 } },
          { release: ['a'], press: ['right'], frames: 12, ranges: { x: [80, 100] } },
          { release: ['right'], frames: 8 },
          ...place(128, 24),
          ...place(136, 56),
          { frames: 20, variables: { won: 1, keys: 3, 'includes.progress.wins': 1 }, window_enabled: true },
          { press: ['a'], frames: 12, variables: { won: 0, keys: 0, door_open: 0 }, arrays: { collected: [0, 0, 0] } },
          { release: ['a'], press: ['select'], frames: 90, bytes: [{ symbol: 'wPortraitEnabled', values: [1] }], window_enabled: true }
        ], screenshot: path.join(dir, `vault-${cgb}.png`) });
        cases.push({ ...base, name: `vault-save-${cgb}`, ram_in: ram, variables: { 'includes.progress.wins': 1, keys: 0 } });
      } else {
        cases.push({ ...base, name: name + cgb, variables: { lives: 5, paused: 0 }, ram_out: ram, steps: [
          { press: ['start'], frames: 12, variables: { paused: 1 } },
          { release: ['start'], frames: 12 },
          { press: ['right', 'a'], frames: 20, variables: { paused: 1 } },
          { release: ['right', 'a'], press: ['start'], frames: 12, variables: { paused: 0 } },
          { release: ['start'], press: ['a'], frames: 20, ranges: { cooldown: [1, 8] } },
          { release: ['a'], press: ['b'], frames: 12, variables: { score: 0, lives: 5, level: 0 } },
          { release: ['b'], set: { score: 7, lives: 1 }, frames: 1600, variables: { lives: 0, best: 7 }, window_enabled: true }
        ], screenshot: path.join(dir, `meteor-${cgb}.png`) });
        cases.push({ ...base, name: `meteor-save-${cgb}`, ram_in: ram, variables: { best: 7, score: 0, lives: 5 } });
      }
    }
  }
  const manifest = path.join(dir, 'cases.json');
  fs.writeFileSync(manifest, JSON.stringify(cases));
  const run = spawnSync(emulatorPython(), [path.join(__dirname, 'emulator.py'), manifest], { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
