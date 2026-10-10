'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compile } = require('../src/compiler');
const { assemble } = require('../scripts/dev');
const { emulatorPython } = require('../scripts/environment');
const font = require('../src/font');
const root = path.resolve(__dirname, '..');
const row = (text, y) => ({ x: 1, y, tiles: [...text.trimEnd().padEnd(18)].map(character => font.ids.get(character)) });

test('dialogue wraps, paginates, types and responds to button edges on DMG and CGB', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const directory = path.join(root, 'build/tests/dialogue');
  fs.mkdirSync(directory, { recursive: true });
  const cases = [];
  function add(source, name, expected, cgb = false) {
    const result = compile('header.target = "dual"\n' + source);
    const asm = path.join(directory, name + '.asm');
    fs.writeFileSync(asm, result.assembly);
    cases.push({ name, rom: assemble(asm, name), cgb, frames: 120, symbols: path.join(root, 'build', name + '.sym'),
      symbolNames: Object.fromEntries(result.symbols.map(symbol => [symbol.name, symbol.label])), ...expected });
  }
  const source = `start_dialogue("ALPHA BETA GAMMA DELTA EPSILON ZETA ETA THETA IOTA KAPPA LAMBDA MU NU XI OMICRON PI RHO SIGMA TAU", speed=0)
ticks = 0
while True:
    wait_vblank()
    ticks += 1
    update_dialogue()
    active = dialogue_active()
    waiting = dialogue_waiting()
    finished = dialogue_finished()
    refresh_screen()`;
  for (const cgb of [false, true]) add(source, `runtime-dialogue-pages-${cgb}`, {
    variables: { active: 1, waiting: 1, finished: 0 },
    window_rows: [row('ALPHA BETA GAMMA ', 1), row('DELTA EPSILON ZETA ', 2), row('ETA THETA IOTA ', 3), row('KAPPA LAMBDA MU NU ', 4)],
    steps: [
      { press: ['a'], frames: 12, variables: { active: 1, waiting: 1, finished: 0 }, window_rows: [row('XI OMICRON PI RHO ', 1), row('SIGMA TAU', 2)] },
      { frames: 12, variables: { active: 1, waiting: 1, finished: 0 } },
      { release: ['a'], frames: 4 },
      { press: ['start'], frames: 8, variables: { active: 0, waiting: 0, finished: 1 }, bytes: [{ symbol: 'wWindowOn', values: [0] }] }
    ]
  }, cgb);
  add(`start_dialogue("ONE\\nTWO\\nTHREE\\nFOUR\\nFIVE", speed=0)
while True:
    wait_vblank()
    update_dialogue()
    refresh_screen()`, 'runtime-dialogue-newlines', {
    window_rows: [row('ONE', 1), row('TWO', 2), row('THREE', 3), row('FOUR', 4)],
    steps: [{ press: ['a'], frames: 12, window_rows: [row('FIVE', 1), row('', 2), row('', 3), row('', 4)] }]
  });
  add(`start_dialogue("ABCDEFGHIJKLMNOPQRSTUV", speed=0)
update_dialogue()
refresh_screen()`, 'runtime-dialogue-long-word', { window_rows: [row('ABCDEFGHIJKLMNOPQR', 1), row('STUV', 2)] });
  add(`counter = 0
def value():
    global counter
    counter += 1
    return counter
start_dialogue("TEXT", palette=value(), speed=value())
update_dialogue()
refresh_screen()`, 'runtime-dialogue-argument-order', { variables: { counter: 2 }, bytes: [
    { symbol: 'wDialoguePalette', values: [1] }, { symbol: 'wDialogueSpeed', values: [2] }
  ] });
  add(`start_dialogue("ABCDEFGHIJKLMNOPQR\\nSTUVWXYZABCDEFGHIJ\\nKLMNOPQRSTUVWXYZAB\\nCDEFGHIJKLMNOPQRST   ", speed=0)
while True:
    wait_vblank()
    update_dialogue()
    finished = dialogue_finished()
    refresh_screen()`, 'runtime-dialogue-full-final-line', { steps: [
    { press: ['a'], frames: 8, variables: { finished: 1 }, bytes: [{ symbol: 'wWindowOn', values: [0] }] }
  ] });
  add(`start_dialogue("ABCD", speed=4)
phase = 0
while True:
    wait_vblank()
    if phase == 1:
        update_dialogue()
        phase = 0
    elif phase == 2:
        close_dialogue()
        phase = 0
    active = dialogue_active()
    waiting = dialogue_waiting()
    finished = dialogue_finished()
    refresh_screen()`, 'runtime-dialogue-timing', { steps: [
      { set: { phase: 1 }, frames: 4, window_rows: [row('A', 1)] },
      { set: { phase: 1 }, frames: 4, window_rows: [row('A', 1)] },
      { set: { phase: 1 }, frames: 4, window_rows: [row('A', 1)] },
      { set: { phase: 1 }, frames: 4, window_rows: [row('A', 1)] },
      { set: { phase: 1 }, frames: 4, window_rows: [row('AB', 1)] },
      { press: ['a'], set: { phase: 1 }, frames: 4, window_rows: [row('ABCD', 1)], variables: { waiting: 1, finished: 0 } },
      { release: ['a'], set: { phase: 2 }, frames: 4, variables: { active: 0, waiting: 0, finished: 0 } }
    ]
  });
  add(`phase = 0
text = "FIRST"
bad_speed = 0
while True:
    wait_vblank()
    if phase == 1:
        start_dialogue(text, speed=0)
        phase = 0
    elif phase == 2:
        text = "SECOND"
        start_dialogue(text, speed=0)
        phase = 0
    elif phase == 3:
        start_dialogue("INVALID", speed=bad_speed)
        phase = 0
    update_dialogue()
    active = dialogue_active()
    waiting = dialogue_waiting()
    finished = dialogue_finished()
    refresh_screen()`, 'runtime-dialogue-replace', { steps: [
      { press: ['a'], set: { phase: 1 }, frames: 8, variables: { active: 1, waiting: 1, finished: 0 }, window_rows: [row('FIRST', 1)] },
      { frames: 8, variables: { active: 1, waiting: 1, finished: 0 } },
      { release: ['a'], set: { phase: 2 }, frames: 8, window_rows: [row('SECOND', 1)] },
      { set: { phase: 3, bad_speed: -1 }, frames: 8, window_rows: [row('SECOND', 1)] },
      { set: { phase: 3, bad_speed: 256 }, frames: 8, window_rows: [row('SECOND', 1)] }
    ]
  });
  const demo = path.join(root, 'examples/dialogue-garden/main.pysn');
  for (const cgb of [false, true]) {
    const result = compile(fs.readFileSync(demo, 'utf8'), demo);
    const name = `runtime-dialogue-garden-${cgb}`;
    const asm = path.join(directory, name + '.asm');
    fs.writeFileSync(asm, result.assembly);
    cases.push({ name, rom: assemble(asm, name), cgb, frames: 120, audio: true, audio_varies: true, symbols: path.join(root, 'build', name + '.sym'),
      symbolNames: Object.fromEntries(result.symbols.filter(symbol => symbol.scope === '$module').map(symbol => [symbol.name, symbol.label])),
      variables: { completed: 0 }, steps: [
        { press: ['right'], frames: 24, ranges: { x: [77, 100] } },
        { release: ['right'], press: ['a'], frames: 8, bytes: [{ symbol: 'wDialogueWaiting', values: [1] }] },
        { frames: 8, bytes: [{ symbol: 'wDialogueActive', values: [1] }] },
        { release: ['a'], frames: 4 },
        { press: ['b'], frames: 8, variables: { completed: 0 }, bytes: [{ symbol: 'wDialogueActive', values: [0] }, { symbol: 'wWindowOn', values: [0] }] },
        { release: ['b'], press: ['select'], frames: 8, variables: { speed: 4 } },
        { release: ['select'], press: ['a'], frames: 8, variables: { conversation: 1 }, bytes: [{ symbol: 'wDialogueActive', values: [1] }] },
        { release: ['a'], frames: 80, bytes: [{ symbol: 'wDialogueActive', values: [1] }, { symbol: 'wWindowOn', values: [1] }] }
      ], screenshot: path.join(root, 'build', `dialogue-garden-${cgb ? 'cgb' : 'dmg'}.png`) });
  }
  const manifest = path.join(directory, 'cases.json');
  fs.writeFileSync(manifest, JSON.stringify(cases));
  const run = spawnSync(emulatorPython(), [path.join(__dirname, 'emulator.py'), manifest], { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
