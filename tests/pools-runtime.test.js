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

test('pool exhaustion, generations, reset, defaults, helpers and mutation execute safely', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const source = `header.target = "dual"
p = pool(2, x=7, dx=2)
first = spawn(p, x=10)
old = first
second = spawn(p, x=20)
full = spawn(p, x=99)
def move(item):
    item.x += item.dx
move(first)
first_x = first.x
first_index = pool_index(first)
before = pool_count(p)
failed = not full
removed = despawn(first)
invalid = not old
replacement = spawn(p)
fresh_x = replacement.x
old_still_invalid = not old
stale_remove = despawn(old)
live = pool_count(p)
total = 0
for item in p:
    total += item.x
    despawn(item)
empty = pool_count(p)
again = spawn(p, x=30)
reset_pool(p)
after_reset = not again
next = spawn(p)
after_reuse = not again
next_index = pool_index(next)
next_x = next.x
capacity = len(p)
refresh_screen()
`;
  const directory = path.join(root, 'build/tests/pools');
  fs.mkdirSync(directory, { recursive: true });
  const cases = [];
  function add(source, name, expected, cgb = false) {
    const result = compile(source);
    const asm = path.join(directory, name + '.asm');
    fs.writeFileSync(asm, result.assembly);
    cases.push({ name, rom: assemble(asm, name), cgb, frames: 120, symbols: path.join(root, 'build', name + '.sym'),
      symbolNames: Object.fromEntries(result.symbols.filter(symbol => symbol.scope === '$module').map(symbol => [symbol.name, symbol.label])), ...expected });
    return result;
  }
  for (const cgb of [false, true]) add(source, `runtime-pools-${cgb}`, { variables: {
    first_x: 12, first_index: 0, before: 2, failed: 1, removed: 1, invalid: 1, fresh_x: 7,
    old_still_invalid: 1, stale_remove: 0, live: 2, total: 27, empty: 0, after_reset: 1,
    after_reuse: 1, next_index: 0, next_x: 7, capacity: 2
  } }, cgb);
  add('p = pool(1, x=0)\nh = spawn(p)\ndespawn(h)\nfresh = spawn(p)\nh.x = 99\nreached = 1', 'runtime-pool-stale-write', { variables: { reached: 0 } });
  add('p = pool(1, x=0)\nh = spawn(p)\ndespawn(h)\nx = h.x\nreached = 1', 'runtime-pool-stale-read', { variables: { reached: 0 } });
  add(`p = pool(1, x=0)
h = spawn(p)
def reuse(item):
    despawn(item)
    fresh = spawn(p, x=7)
    return 1
h.x += reuse(h)
reached = 1`, 'runtime-pool-augmented-reuse', { variables: { reached: 0 } });
  const retirement = add(`p = pool(2, x=0)
last = spawn(p)
despawn(last)
saved = last
replacement = last
slot = -1
stale = 0
phase = 0
while True:
    wait_vblank()
    if phase == 1:
        last = spawn(p)
        slot = pool_index(last)
        stale = not saved
        phase = 2
    elif phase == 3:
        saved = last
        despawn(last)
        replacement = spawn(p)
        slot = pool_index(replacement)
        stale = not saved
        phase = 4
    elif phase == 5:
        reset_pool(p)
        replacement = spawn(p)
        slot = pool_index(replacement)
        stale = not saved
        phase = 6`, 'runtime-pool-retirement', {});
  const poolStorage = retirement.symbols.find(symbol => symbol.name === 'p');
  cases[cases.length - 1].steps = [
    { set_bytes: [{ symbol: poolStorage.label, offset: 1, values: [254, 255, 255, 255] }], set: { phase: 1 }, frames: 8,
      variables: { phase: 2, slot: 0 }, bytes: [{ symbol: poolStorage.label, values: [1, 255, 255, 255, 255] }] },
    { set: { phase: 3 }, frames: 8, variables: { phase: 4, slot: 1, stale: 1 }, bytes: [{ symbol: poolStorage.label, values: [0, 255, 255, 255, 255] }] },
    { set: { phase: 5 }, frames: 8, variables: { phase: 6, slot: 1, stale: 1 } }
  ];
  const generationCase = cases[cases.length - 1];
  for (const [name, generation, expected] of [
    ['carry', [255, 255, 0, 0], [1, 0, 0, 1, 0]],
    ['high-bits', [0, 0, 1, 0], [1, 1, 0, 1, 0]]
  ]) cases.push({ ...generationCase, name: `runtime-pool-generation-${name}`, steps: [
    { set_bytes: [{ symbol: poolStorage.label, offset: 1, values: generation }], set: { phase: 1 }, frames: 8,
      variables: { phase: 2, slot: 0, stale: 1 }, bytes: [{ symbol: poolStorage.label, values: expected }] }
  ] });
  add(`p = pool(128, x=5)
missed = 0
h = spawn(p)
for i in range(127):
    h = spawn(p)
    if not h:
        missed += 1
count = pool_count(p)
capacity = len(p)
last_index = pool_index(h)
failed = not spawn(p)
total = 0
for item in p:
    total += item.x
    despawn(item)
empty = pool_count(p)`, 'runtime-pool-capacity-128', { variables: { missed: 0, count: 128, capacity: 128, last_index: 127, failed: 1, total: 640, empty: 0 } });
  add(`p = pool(3, x=0)
a = spawn(p, x=1)
b = spawn(p, x=2)
visits = 0
total = 0
for item in p:
    visits += 1
    total += item.x
    if item.x == 1:
        despawn(item)
        lower = spawn(p, x=10)
        later = spawn(p, x=3)
count = pool_count(p)`, 'runtime-pool-live-iteration', { variables: { visits: 3, total: 6, count: 3 } });
  const demo = path.join(root, 'examples/pool-shooter/main.pysn');
  for (const cgb of [false, true]) {
    const result = compile(fs.readFileSync(demo, 'utf8'), demo);
    const name = `runtime-pool-shooter-${cgb}`;
    const asm = path.join(directory, name + '.asm');
    fs.writeFileSync(asm, result.assembly);
    const player = result.symbols.find(symbol => symbol.name === 'includes.state.player');
    const enemies = result.symbols.find(symbol => symbol.name === 'includes.state.enemies');
    const setEnemyField = (name, value) => ({ symbol: enemies.label, offset: enemies.fields.find(field => field.name === name).offset, values: [value, 0] });
    cases.push({ name, rom: assemble(asm, name), cgb, frames: 120, symbols: path.join(root, 'build', name + '.sym'),
      symbolNames: { ...Object.fromEntries(result.symbols.filter(symbol => symbol.scope === '$module').map(symbol => [symbol.name, symbol.label])), player_x: player.label },
      variables: { lives: 3, score: 0 },
      steps: [
        { press: ['right'], frames: 30, ranges: { player_x: [78, 136] } },
        { release: ['right'], press: ['a'], frames: 90, ranges: { frame: [1, 300] } },
        { release: ['a'], press: ['b'], frames: 12, variables: { lives: 3, score: 0 }, bytes: [{ symbol: player.label, values: [76, 0] }] },
        { release: ['b'], frames: 20 },
        { set_bytes: [setEnemyField('x', 76), setEnemyField('y', 76), setEnemyField('health', 2)], press: ['a'], frames: 100, ranges: { score: [1, 10] } }
      ], screenshot: path.join(root, 'build', `pool-shooter-${cgb ? 'cgb' : 'dmg'}.png`) });
  }
  const manifest = path.join(directory, 'cases.json');
  fs.writeFileSync(manifest, JSON.stringify(cases));
  const run = spawnSync(emulatorPython(), [path.join(__dirname, 'emulator.py'), manifest], { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
