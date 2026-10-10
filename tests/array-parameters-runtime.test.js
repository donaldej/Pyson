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

test('mutable references keep length, bounds, aliasing and nested call state on DMG and Color', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const source = `header.target = "dual"
a = [1, 2]
b = [3, 4, 5]
empty = []
def fill(values, amount=0):
    for i in range(len(values)):
        values[i] = amount
    return len(values)
def forward(values, amount):
    return fill(amount=amount, values=values)
def sum_values(values):
    total = 0
    for value in values:
        total += value
    return total
def last(values):
    values[-1] += 1
    return values[-len(values)]
def nonempty(values):
    if values:
        return 1
    return 0
def alias_test(left, right):
    left[0] = 42
    return right[0]
def local():
    work = [2, 4, 6, 8]
    forward(work, 3)
    return sum_values(work)
len_a = forward(a, 7)
len_b = fill(values=b, amount=9)
len_empty = fill(empty)
sum_a = sum_values(a)
sum_b = sum_values(b)
sum_empty = sum_values(empty)
first = last(b)
last_value = b[-1]
yes = nonempty(a)
no = nonempty(empty)
shared = alias_test(left=a, right=a)
local_sum = local()
nested = fill(values=a, amount=fill(b, 5))
refresh_screen()`;
  const dir = path.join(root, 'build/tests/array-parameters');
  fs.mkdirSync(dir, { recursive: true });
  const cases = [];
  function build(source, name, expected) {
    const result = compile(source, path.join(dir, 'arrays.pysn'));
    const asm = path.join(dir, name + '.asm');
    fs.writeFileSync(asm, result.assembly);
    const rom = assemble(asm, name);
    for (const cgb of [false, true]) cases.push({ name: name + '-' + cgb, rom, cgb, frames: 120,
      symbols: path.join(root, 'build', name + '.sym'),
      symbolNames: Object.fromEntries(result.symbols.filter(symbol => symbol.scope === '$module').map(symbol => [symbol.name, symbol.label])), ...expected });
  }
  build(source, 'runtime-array-parameters', { arrays: { a: [3, 3], b: [5, 5, 5] },
    variables: { len_a: 2, len_b: 3, len_empty: 0, sum_a: 14, sum_b: 27, sum_empty: 0, first: 9, last_value: 10, yes: 1, no: 0, shared: 42, local_sum: 12, nested: 2 } });
  build('header.target = "dual"\na = [1, 2]\ndef bad(values):\n    values[2] = 99\nfinished = 0\nbad(a)\nfinished = 1',
    'runtime-array-parameter-bounds', { arrays: { a: [1, 2] }, variables: { finished: 0 },
      rows: [{ x: 0, y: 16, tiles: [...'Index out of range'].map(char => font.ids.get(char)) }] });
  const manifest = path.join(dir, 'cases.json');
  fs.writeFileSync(manifest, JSON.stringify(cases));
  const run = spawnSync(emulatorPython(), [path.join(__dirname, 'emulator.py'), manifest], { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
