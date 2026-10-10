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
test('seeded random ranges match reference arithmetic on DMG and Color', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const directory = path.join(root, 'build/tests/random');
  fs.mkdirSync(directory, { recursive: true });
  let state = 1;
  function next() { state = (state * 25173 + 13849) & 65535; return ((state & 255) << 8) | (state >>> 8); }
  function sample(low, high, inclusive) {
    const span = high - low + Number(inclusive);
    const threshold = 65536 % span;
    let value;
    do { value = next(); } while (value < threshold);
    return low + value % span;
  }
  const ranges = [[0, 6, false], [-32768, 32767, true], [-32768, 32767, false], [-30000, 30000, true], [-5, -1, false], [32767, 32767, true], [0, 32767, false], [0, 3, false]];
  const expected = Array.from({ length: 64 }, (_, i) => sample(...ranges[i % ranges.length]));
  const source = `header.target = "dual"
values = [${expected.map(() => 0).join(', ')}]
def samples():
    global values
${expected.map((_, i) => { const [low, high, inclusive] = ranges[i % ranges.length]; return `    values[${i}] = ${inclusive ? 'randint' : 'randrange'}(${low}, ${high})`; }).join('\n')}
samples()
random_seed(123)
first = randrange(100)
random_seed(123)
same = randrange(100)
random_seed(0)
zero = randrange(100)
bad_low = 10
bad_high = 3
random_seed(123)
invalid = randrange(bad_low, bad_high)
after_invalid = randrange(100)
random_seed(-7)
negative_seed = randrange(17)
random_seed(22)
one_argument = randrange(9)
counter = 0
order = [0, 0]
def bound(tag):
    global counter, order
    order[counter] = tag
    counter += 1
    if tag == 1:
        return -4
    return 4
random_seed(42)
ordered = randrange(bound(1), bound(2))
random_seed(42)
nested = randrange(randint(-4, -4), 4)
refresh_screen()`;
  state = 123; const first = sample(0, 100, false);
  state = 0; const zero = sample(0, 100, false);
  state = 65529; const negative_seed = sample(0, 17, false);
  state = 22; const one_argument = sample(0, 9, false);
  state = 42; const ordered = sample(-4, 4, false);
  state = 42; sample(-4, -4, true); const nested = sample(-4, 4, false);
  const result = compile(source);
  const name = 'runtime-random';
  const asm = path.join(directory, name + '.asm');
  fs.writeFileSync(asm, result.assembly);
  const rom = assemble(asm, name);
  const cases = [false, true].map(cgb => ({ name: `${name}-${cgb}`, rom, cgb, frames: 120, symbols: path.join(root, 'build', name + '.sym'), symbolNames: Object.fromEntries(result.symbols.map(s => [s.name, s.label])), arrays: { values: expected, order: [1, 2] }, variables: { first, same: first, zero, invalid: 0, after_invalid: first, negative_seed, one_argument, ordered, nested, counter: 2 } }));
  const demo = path.join(root, 'examples/random-gallery/main.pysn');
  const demoResult = compile(fs.readFileSync(demo, 'utf8'), demo);
  const demoName = 'runtime-random-gallery';
  const demoAsm = path.join(directory, demoName + '.asm');
  fs.writeFileSync(demoAsm, demoResult.assembly);
  const demoRom = assemble(demoAsm, demoName);
  state = 1;
  const rollOne = { die_one: sample(1, 6, true), die_two: sample(1, 6, true), bonus: Number(sample(0, 10, false) === 0) };
  const rollTwo = { die_one: sample(1, 6, true), die_two: sample(1, 6, true), bonus: Number(sample(0, 10, false) === 0) };
  for (const cgb of [false, true]) cases.push({ name: `${demoName}-${cgb}`, rom: demoRom, cgb, frames: 120, symbols: path.join(root, 'build', demoName + '.sym'), symbolNames: Object.fromEntries(demoResult.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label])), variables: { ...rollOne, rolls: 1, seed: 1 }, steps: [
    { press: ['a'], frames: 12, variables: { ...rollTwo, rolls: 2 } },
    { frames: 12, variables: { rolls: 2 } },
    { release: ['a'], press: ['b'], frames: 12, variables: { ...rollOne, rolls: 1, seed: 1 } },
    { release: ['b'], press: ['a'], frames: 12, variables: { ...rollTwo, rolls: 2 } },
    { release: ['a'], press: ['select'], frames: 12, variables: { rolls: 1 }, ranges: { seed: [2, 1000], die_one: [1, 6], die_two: [1, 6] } }
  ], screenshot: path.join(root, 'build', `random-gallery-${cgb}.png`) });
  const manifest = path.join(directory, 'cases.json');
  fs.writeFileSync(manifest, JSON.stringify(cases));
  const run = spawnSync(emulatorPython(), [path.join(__dirname, 'emulator.py'), manifest], { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
