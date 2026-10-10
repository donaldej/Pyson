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
test('choices navigate, confirm, cancel and replace dialogue on DMG and CGB', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const directory = path.join(root, 'build/tests/choices');
  fs.mkdirSync(directory, { recursive: true });
  const cases = [];
  for (const cgb of [false, true]) {
    const name = `runtime-choices-${cgb}`;
    const result = compile(`header.target = "dual"
start_choices(["TALK", "LEAVE"], palette=1, selected_palette=2)
phase = 0
while True:
    wait_vblank()
    if phase == 1:
        start_choices(["ONE", "TWO", "THREE", "FOUR"], default=3, cancel=False)
        phase = 0
    elif phase == 2:
        close_dialogue()
        phase = 0
    elif phase == 3:
        start_dialogue("HELLO", speed=0)
        phase = 0
    elif phase == 4:
        start_choices(["ONLY"])
        phase = 0
    update_dialogue()
    active = choices_active()
    finished = choices_finished()
    cancelled = choices_cancelled()
    selected = choices_selected()
    result = choices_result()
    refresh_screen()`);
    const asm = path.join(directory, name + '.asm');
    fs.writeFileSync(asm, result.assembly);
    const row = (text, y) => ({ x: 1, y, tiles: [...text.padEnd(18)].map(c => font.ids.get(c)) });
    const attributes = palettes => cgb ? { window_attributes: palettes.map((palette, i) => ({ x: 1, y: i + 1, values: Array(18).fill(palette) })) } : {};
    cases.push({ name, cgb, rom: assemble(asm, name), frames: 120, symbols: path.join(root, 'build', name + '.sym'), symbolNames: Object.fromEntries(result.symbols.map(s => [s.name, s.label])),
      variables: { active: 1, finished: 0, cancelled: 0, selected: 0, result: -1 }, window_rows: [row('>TALK', 1), row(' LEAVE', 2)], ...attributes([2, 1]),
      steps: [
        { press: ['up'], frames: 12, variables: { selected: 1 }, window_rows: [row(' TALK', 1), row('>LEAVE', 2)], ...attributes([1, 2]) },
        { frames: 12, variables: { selected: 1 } },
        { release: ['up'], frames: 4 },
        { press: ['down'], frames: 12, variables: { selected: 0 } },
        { release: ['down'], press: ['a'], frames: 12, variables: { active: 0, finished: 1, result: 0 }, bytes: [{ symbol: 'wWindowOn', values: [0] }] },
        { set: { phase: 1 }, frames: 12, variables: { active: 1, selected: 3, result: -1, finished: 0 } },
        { release: ['a'], press: ['b'], frames: 12, variables: { active: 1, cancelled: 0 } },
        { set: { phase: 2 }, frames: 12, variables: { active: 0, cancelled: 1, result: -1 } },
        { set: { phase: 3 }, frames: 12, variables: { active: 0, cancelled: 0, selected: -1 } },
        { set: { phase: 4 }, frames: 12, variables: { active: 1, selected: 0 } },
        { release: ['b'], frames: 4 },
        { press: ['b'], frames: 12, variables: { active: 0, cancelled: 1, finished: 0, result: -1 } }
      ] });
  }
  const ordered = compile(`header.target = "dual"
counter = 0
def value():
    global counter
    counter += 1
    return counter
def menu():
    start_choices(["ONE", "TWO", "THREE", "FOUR"], default=value(), selected_palette=value(), palette=value())
menu()
bad = -1
start_choices(["BAD"], palette=bad)
update_dialogue()
selected = choices_selected()
refresh_screen()`);
  const orderedName = 'runtime-choices-order';
  const orderedAsm = path.join(directory, orderedName + '.asm');
  fs.writeFileSync(orderedAsm, ordered.assembly);
  cases.push({ name: orderedName, rom: assemble(orderedAsm, orderedName), frames: 120, symbols: path.join(root, 'build', orderedName + '.sym'),
    symbolNames: Object.fromEntries(ordered.symbols.map(s => [s.name, s.label])), variables: { counter: 3, selected: 1 },
    bytes: [{ symbol: 'wChoicesSelectedPalette', values: [2] }, { symbol: 'wDialoguePalette', values: [3] }],
    window_rows: [{ x: 1, y: 2, tiles: [...'>TWO'.padEnd(18)].map(c => font.ids.get(c)) }] });
  const demo = path.join(root, 'examples/dialogue-garden/main.pysn');
  const compiled = compile(fs.readFileSync(demo, 'utf8'), demo);
  const name = 'runtime-choices-garden';
  const asm = path.join(directory, name + '.asm');
  fs.writeFileSync(asm, compiled.assembly);
  cases.push({ name, cgb: true, rom: assemble(asm, name), frames: 120, symbols: path.join(root, 'build', name + '.sym'),
    symbolNames: Object.fromEntries(compiled.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label])),
    steps: [
      { set_bytes: [{ symbol: 'wDialogueSpeed', values: [0] }], frames: 12 },
      { press: ['a'], frames: 12 }, { release: ['a'], frames: 12 },
      { press: ['a'], frames: 12 }, { release: ['a'], frames: 12 },
      { press: ['a'], frames: 12, bytes: [{ symbol: 'wChoicesMode', values: [1] }], variables: { completed: 1 } },
      { release: ['a'], press: ['up'], frames: 12, bytes: [{ symbol: 'wChoicesSelected', values: [3] }] },
      { release: ['up'], press: ['a'], frames: 12, variables: { last_choice: 3 }, bytes: [{ symbol: 'wWindowOn', values: [0] }] }
    ], screenshot: path.join(root, 'build/choices-garden.png') });
  const gardenCase = cases[cases.length - 1];
  cases.push({ ...gardenCase, name: 'runtime-choices-garden-story', steps: [
    ...gardenCase.steps.slice(0, 6),
    { release: ['a'], frames: 12 },
    { press: ['a'], frames: 12, variables: { last_choice: 0 }, bytes: [{ symbol: 'wChoicesMode', values: [0] }, { symbol: 'wDialogueActive', values: [1] }] }
  ], screenshot: undefined });
  cases.push({ ...gardenCase, name: 'runtime-choices-garden-menu', steps: gardenCase.steps.slice(0, 7), screenshot: path.join(root, 'build/choices-menu.png') });
  const manifest = path.join(directory, 'cases.json');
  fs.writeFileSync(manifest, JSON.stringify(cases));
  const run = spawnSync(emulatorPython(), [path.join(__dirname, 'emulator.py'), manifest], { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
