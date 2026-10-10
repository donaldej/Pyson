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

test('record references, snapshot copies and checked indexing execute on DMG and CGB', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const source = `header.target = "dual"
p = record(x=4, health=9)
items = records(3, x=p.x, health=3)
def hit(enemy, n):
    enemy.health -= n
def update(enemy):
    hit(enemy, 1)
    enemy.x += 5
for enemy in items:
    update(enemy)
hit(items[-1], 1)
copy = p
copy.x = 99
p = record(x=p.health, health=p.x)
items[0] = copy
items = [items[2], items[1], items[0]]
counter = 0
def pick():
    global counter
    counter += 1
    return 0
items[pick()].x += 1
snapshot = items[pick()]
result = [p.x, p.health, copy.x, len(items), items[0].x, items[0].health, items[1].x, items[1].health, items[2].x, items[2].health]
refresh_screen()
`;
  const result = compile(source);
  const directory = path.join(root, 'build/tests/records');
  fs.mkdirSync(directory, { recursive: true });
  const cases = [];
  for (const cgb of [false, true]) {
    const name = `runtime-records-${cgb}`;
    const asm = path.join(directory, name + '.asm');
    fs.writeFileSync(asm, result.assembly);
    cases.push({ name, rom: assemble(asm, name), cgb, frames: 120, symbols: path.join(root, 'build', name + '.sym'),
      symbolNames: Object.fromEntries(result.symbols.filter(symbol => symbol.scope === '$module').map(symbol => [symbol.name, symbol.label])),
      variables: { counter: 2 }, arrays: { result: [9, 4, 99, 3, 10, 1, 9, 2, 99, 9] } });
  }
  for (const index of [2, -3, -32768]) {
    const result = compile(`items = records(2, x=0)\nindex = ${index}\nitems[index].x = 9\nreached = 123`);
    const name = `runtime-record-bounds-${Math.abs(index)}-${index < 0}`;
    const asm = path.join(directory, name + '.asm');
    fs.writeFileSync(asm, result.assembly);
    cases.push({ name, rom: assemble(asm, name), frames: 120, symbols: path.join(root, 'build', name + '.sym'),
      symbolNames: Object.fromEntries(result.symbols.map(symbol => [symbol.name, symbol.label])), variables: { reached: 0 } });
  }
  const demo = path.join(root, 'examples/record-fleet/main.pysn');
  for (const cgb of [false, true]) {
    const result = compile(fs.readFileSync(demo, 'utf8'), demo);
    const name = `runtime-record-fleet-${cgb}`;
    const asm = path.join(directory, name + '.asm');
    fs.writeFileSync(asm, result.assembly);
    const enemies = result.symbols.find(symbol => symbol.name === 'includes.state.enemies');
    const health = (index, value) => ({ symbol: enemies.label, offset: index * enemies.stride + enemies.fields.find(field => field.name === 'health').offset, values: [value, 0] });
    cases.push({ name, rom: assemble(asm, name), cgb, frames: 120, symbols: path.join(root, 'build', name + '.sym'),
      symbolNames: Object.fromEntries(result.symbols.filter(symbol => symbol.scope === '$module').map(symbol => [symbol.name, symbol.label])),
      bytes: [health(0, 3), health(1, 3)], variables: { selected: 0 },
      steps: [
        { press: ['a'], frames: 16, bytes: [health(0, 2), health(1, 3)] },
        { release: ['a'], frames: 8 },
        { press: ['a'], frames: 16, bytes: [health(0, 1)] },
        { release: ['a'], frames: 8 },
        { press: ['a'], frames: 16, bytes: [health(0, 0), { symbol: 'wShadowOAM', offset: 4, values: [0] }] },
        { release: ['a'], frames: 8 },
        { press: ['select'], frames: 16, variables: { selected: 1 } },
        { release: ['select'], press: ['a'], frames: 16, bytes: [health(1, 2)] },
        { release: ['a'], press: ['b'], frames: 16, bytes: [health(0, 3), health(1, 3)] },
        { release: ['b'], press: ['right'], frames: 16, ranges: { 'player_x': [78, 108] } }
      ], screenshot: path.join(root, 'build', `record-fleet-${cgb ? 'cgb' : 'dmg'}.png`) });
    cases[cases.length - 1].symbolNames.player_x = result.symbols.find(symbol => symbol.name === 'includes.state.player').label;
  }
  const manifest = path.join(directory, 'cases.json');
  fs.writeFileSync(manifest, JSON.stringify(cases));
  const run = spawnSync(emulatorPython(), [path.join(__dirname, 'emulator.py'), manifest], { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
