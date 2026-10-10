'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compile } = require('../src/compiler');
const { assemble } = require('../scripts/dev');
const font = require('../src/font');
const root = path.resolve(__dirname, '..');
const { emulatorPython } = require('../scripts/environment');
const python = emulatorPython();
const row = (text, x, y) => ({ x, y, tiles: [...text].map(c => font.ids.get(c)) });

test('generated ROMs execute arithmetic, loops, functions, text and input in PyBoy',
  { skip: !fs.existsSync(python) && 'Install tests/emulator-requirements.txt in tools/emulator-env to enable runtime tests' }, () => {
    const directory = path.join(root, 'build', 'tests');
    fs.mkdirSync(directory, { recursive: true });
    const cases = [];
    function build(name, source, expected, filename = '<source>') {
      const result = compile(source, filename);
      const assemblyFile = path.join(directory, `${name}.asm`);
      fs.writeFileSync(assemblyFile, result.assembly);
      const rom = assemble(assemblyFile, name);
      cases.push({ name, rom, symbols: path.join(root, 'build', `${name}.sym`),
        symbolNames: Object.fromEntries(result.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label])), ...expected });
      return result;
    }
    const arithmetic = [
      ['1 + 2 * 3', 7], ['(1 + 2) * 3', 9], ['-7 // 3', -3], ['-7 % 3', 2],
      ['7 // -3', -3], ['7 % -3', -2], ['-7 // -3', 2], ['-7 % -3', -1],
      ['-6 // 3', -2], ['-6 % 3', 0], ['-32768 // 1', -32768], ['-32768 % 3', 1],
      ['-32768 // -1', -32768], ['32767 + 1', -32768], ['-32768 - 1', 32767],
      ['32767 * 2', -2], ['-20 * 3', -60], ['~0', -1], ['13 & 7', 5], ['8 | 3', 11], ['7 ^ 3', 4],
      ['not 1 + 2 < 4', 0], ['-5 < -2', 1], ['-2 > -5', 1], ['-32768 < 32767', 1],
      ['1 <= 1', 1], ['2 >= 3', 0], ['1 != 2', 1], ['2 == 2', 1],
      ['0 and (1 // zero)', 0], ['7 or (1 // zero)', 7], ['1 < 2 < 3', 1], ['3 < 2 < (1 // zero)', 0]
    ];
    build('runtime-arithmetic', 'zero = 0\n' + arithmetic.map(([expr], i) => `v${i} = ${expr}`).join('\n') + '\ndone = 1',
      { variables: { ...Object.fromEntries(arithmetic.map(([, value], i) => [`v${i}`, value])), done: 1 } });
    build('runtime-flow', `
def add(a, b):
    local = a + b
    return local

def with_global(a):
    return a + offset

offset = 10
total = 0
for i in range(1, 6):
    if i == 3:
        continue
    total += i
    if total > 7:
        break
descending = 0
for j in range(5, -2, -2):
    descending += j
limit = 32767
for edge in range(32766, limit, 2):
    total += 1
negative = -32768
for back in range(-32767, negative, -2):
    total += 1
empty = 99
for empty in range(0):
    total = 999
x = 0
while x < 10:
    x += 1
    if x == 2:
        continue
    if x == 4:
        break
if x == 0:
    decision = 1
elif x == 4:
    decision = 2
else:
    decision = 3
nested = add(1, add(2, 3))
scoped = with_global(add(1, 2))
index = 0
acc = 0
while index < 40:
    acc = add(acc, 1)
    index += 1
done = 1
`, { variables: { total: 14, i: 5, descending: 8, j: -1, edge: 32766, back: -32767,
      empty: 99, x: 4, decision: 2, nested: 6, scoped: 13, acc: 40, done: 1 } });
    const textSource = `message = "Hello World!"\nx = 4\ny = 8\nprint(message, x, y)\nprint(-32768, 0, 0)\nprint(32767, 8, 0)\nprint(0, 19, 0)\nprint("ABCD\\nEF", 18, 16)\nprint("Z", 19, 17)\nprint("A\\nB", 0, 17)\nprint("ABCDE", 0, 2)\nprint("HI", 0, 2)\nprint("", 0, 3)\nx = -1\nprint("BAD", x, 0)\ndone = 1`;
    const rows = [row('-32768', 0, 0), row('32767', 8, 0), row('0', 19, 0), row('Hello World!', 4, 8),
      row('AB', 18, 16), row('EZ', 18, 17), row('A', 0, 17), row('HICDE', 0, 2), row('   ', 0, 3)];
    for (const [target, cgb] of [['dmg', false], ['dual', true], ['cgb', true], ['dual', false]]) build(`runtime-text-${target}-${cgb}`,
      `header.target = "${target}"\n${textSource}`, { cgb, variables: { done: 1 }, rows });
    build('runtime-zero-error', 'divisor = 0\nx = 10 // divisor\ndone = 1', {
      variables: { done: 0 }, rows: [row('Division by zero', 0, 16)] });
    build('runtime-buttons', 'samples = 0\nheld = 0\npressed = 0\nwhile True:\n    wait_vblank()\n    if button("a"):\n        held += 1\n    if button_pressed("a"):\n        pressed += 1\n    samples = read_buttons()', {
      variables: { held: 0, pressed: 0, samples: 0 }, steps: [
        { press: ['a'], variables: { pressed: 1, samples: 16 } },
        { frames: 8, variables: { pressed: 1 } },
        { release: ['a'], variables: { pressed: 1, samples: 0 } },
        { press: ['a'], variables: { pressed: 2 } },
        { release: ['a'], press: ['right', 'left', 'up', 'down', 'b', 'select', 'start'], variables: { samples: 239 } },
        { release: ['right', 'left', 'up', 'down', 'b', 'select', 'start'], variables: { samples: 0 } }
      ] });
    build('runtime-counter', fs.readFileSync(path.join(root, 'examples/button-counter.pysn'), 'utf8'), {
      cgb: true, variables: { count: 0 }, rows: [row('0', 7, 8)], steps: [
        { press: ['a'], variables: { count: 1 }, rows: [row('1', 7, 8)] },
        { frames: 12, variables: { count: 1 } },
        { release: ['a'] },
        { press: ['b'], variables: { count: 0 } },
        { release: ['b'] },
        { press: ['b'], variables: { count: -1 }, rows: [row('-1', 7, 8)] },
        { release: ['b'] },
        { press: ['start'], variables: { count: 0 }, rows: [row('0 ', 7, 8)] }
      ], screenshot: path.join(root, 'build', 'button-counter.png') });
    const gameSource = fs.readFileSync(path.join(root, 'examples/star-chase/classic.pysn'), 'utf8');
    for (const cgb of [false, true]) build(`runtime-star-chase-${cgb}`, gameSource, {
      cgb, variables: { state: 0, score: 0 }, rows: [row('Press Start', 4, 10)], steps: [
        { press: ['start'], frames: 50, variables: { state: 1, score: 0, player_x: 3, player_y: 12 }, rows: [row('@', 3, 12)] },
        { release: ['start'], frames: 4 },
        { press: ['right'], frames: 5, variables: { player_x: 4, score: 0 } },
        { release: ['right'], frames: 6 },
        { press: ['right'], frames: 8, variables: { player_x: 5, score: 1 } },
        { release: ['right'], frames: 10 },
        { set: { player_x: 1, player_y: 12, enemy_x: 18, enemy_y: 4, enemy_ticks: 0, move_ticks: 0 },
          press: ['left'], frames: 4, variables: { player_x: 1, state: 1 } },
        { release: ['left'], frames: 4 },
        // Seed a collision and near-win to exercise end screens without a long playthrough.
        { set: { player_x: 4, player_y: 8, enemy_x: 4, enemy_y: 8, enemy_ticks: 0 },
          frames: 8, variables: { state: 2 }, rows: [row('GAME OVER', 5, 8)] },
        { press: ['start'], frames: 50, variables: { state: 1, score: 0 } },
        { release: ['start'], frames: 4 },
        { set: { score: 9, player_x: 4, player_y: 12, star_x: 5, star_y: 12,
          enemy_x: 18, enemy_y: 4, enemy_ticks: 0, move_ticks: 0 },
          press: ['right'], frames: 30, variables: { state: 3, score: 10 }, rows: [row('YOU WIN!', 6, 8)] },
        { frames: 20, variables: { state: 3, score: 10 } },
        { release: ['right'], frames: 4 },
        { press: ['start'], frames: 50, variables: { state: 1, score: 0, player_x: 3, player_y: 12 } }
      ], screenshot: path.join(root, 'build', `star-chase-${cgb ? 'cgb' : 'dmg'}.png`) });
    build('runtime-buffering', 'print("OLD", 0, 0)\nrefresh_screen()\nprint("NEW", 0, 0)\nqueued = 1\nshown = 0\nwhile not button("a"):\n    wait_vblank()\nrefresh_screen()\nshown = 1\nwhile True:\n    wait_vblank()', {
      variables: { queued: 1, shown: 0 }, rows: [row('OLD', 0, 0)],
      bytes: [{ symbol: 'wBGTiles', values: row('NEW', 0, 0).tiles }],
      steps: [{ press: ['a'], frames: 12, variables: { shown: 1 }, rows: [row('NEW', 0, 0)] }] });
    const spriteSource = `header.target = "dual"
sheet = sprite_sheet("examples/assets/hero.bmp", 16, 16)
background = tilemap("examples/assets/garden.bmp")
bg_palette(2, "#ffffff", "#ff0000", "#00ff00", "#0000ff")
draw_map(background, 2, 5)
print("C", 0, 0, 2)
sprite(0, sheet, 0, 40, 50)
sprite(4, sheet, 1, -4, -4, True, True)
refresh_screen()
phase = 0
while True:
    wait_vblank()
    if button_pressed("a"):
        sprite(0, sheet, 1, 44, 54, True, False)
        sprite_palette(0, "#ffffff", "#ff0000", "#00ff00", "#0000ff")
        refresh_screen()
        phase = 1
    if button_pressed("b"):
        hide_sprite(0)
        refresh_screen()
        phase = 2
`;
    for (const cgb of [false, true]) {
      const result = build(`runtime-sprites-${cgb}`, spriteSource, { cgb });
      const current = cases.at(-1);
      const sheet = result.assets[0];
      const background = result.assets[1];
      const oam = (tiles, x, y, flags) => tiles.flatMap((tile, index) => [y + Math.floor(index / 2) * 8, x + index % 2 * 8, tile, flags]);
      current.variables = { phase: 0 };
      current.rows = [{ x: 2, y: 5, tiles: background.maps[0].slice(0, 16) }, row('C', 0, 0)];
      current.bytes = [{ address: 0xfe00, values: oam(sheet.maps[0], 48, 66, 0) },
        { address: 0xfe10, values: oam([...sheet.maps[1]].reverse(), 4, 12, 0x60) }];
      if (cgb) {
        current.attributes = [{ x: 0, y: 0, values: [2] }, { x: 2, y: 5, values: Array(16).fill(1) }];
        current.palettes = [{ kind: 'background', index: 2, colors: [32767, 31, 992, 31744] }];
      }
      current.steps = [
        { press: ['a'], frames: 12, variables: { phase: 1 }, bytes: [{ address: 0xfe00,
          values: oam([sheet.maps[1][1], sheet.maps[1][0], sheet.maps[1][3], sheet.maps[1][2]], 52, 70, 0x20) }],
          ...(cgb ? { palettes: [{ kind: 'sprite', index: 0, colors: [32767, 31, 992, 31744] }] } : {}) },
        { release: ['a'], frames: 4 },
        { press: ['b'], frames: 12, variables: { phase: 2 }, bytes: [0, 4, 8, 12].map(offset => ({ address: 0xfe00 + offset, values: [0] })) }
      ];
    }
    const bulkPalettes = [];
    let bulkSource = 'header.target = "cgb"\n';
    for (let i = 0; i < 8; i++) for (const [routine, kind] of [['bg_palette', 'background'], ['sprite_palette', 'sprite']]) {
      const colors = [i + 1, i + 11, i + 21, i + 31];
      bulkSource += `${routine}(${i}, ${colors.join(', ')})\n`;
      bulkPalettes.push({ kind, index: i, colors });
    }
    build('runtime-all-palettes', bulkSource + 'print("COLOR", 0, 0, 7)\nrefresh_screen()', { cgb: true, palettes: bulkPalettes, rows: [row('COLOR', 0, 0)] });
    for (const cgb of [false, true]) build(`runtime-color-demo-${cgb}`, fs.readFileSync(path.join(root, 'examples/color-sprites.pysn'), 'utf8'), {
      cgb, variables: { x: 72, y: 72, theme: 0 }, steps: [
        { press: ['right'], frames: 8, ranges: { x: [73, 80] } },
        { release: ['right'], press: ['a'], frames: 8, variables: { theme: 1 } },
        { release: ['a'], frames: 4 }
      ], screenshot: path.join(root, 'build', `color-sprites-${cgb ? 'cgb' : 'dmg'}.png`)
    }, path.join(root, 'examples/color-sprites.pysn'));
    const moduleDirectory = path.join(directory, 'modules');
    fs.mkdirSync(moduleDirectory, { recursive: true });
    fs.writeFileSync(path.join(moduleDirectory, 'state.pysn'), 'value = 4\ndef bump(x):\n    global value\n    value += x\n    return value');
    fs.writeFileSync(path.join(moduleDirectory, 'one.pysn'), 'import state\ndef update():\n    return state.bump(3)');
    fs.writeFileSync(path.join(moduleDirectory, 'two.pysn'), 'from state import bump\ndef update():\n    return bump(5)');
    build('runtime-modules', `import state
import one
from two import update as second
counter = 1
def bump_main():
    global counter
    counter += state.value
    return counter
a = one.update()
b = second()
state.value += 1
c = bump_main()
done = 1`, { variables: { 'state.value': 13, a: 7, b: 12, c: 14, counter: 14, done: 1 } }, path.join(moduleDirectory, 'main.pysn'));

    const modularGameFile = path.join(root, 'examples/star-chase/main.pysn');
    const gameFloorPalette = compile(fs.readFileSync(modularGameFile, 'utf8'), modularGameFile).assets.find(asset => asset.file?.endsWith('floor.bmp')).palette;
    const shared = values => Object.fromEntries(Object.entries(values).map(([name, value]) => [`includes.state.${name}`, value]));
    for (const cgb of [false, true]) build(`runtime-modular-star-chase-${cgb}`, fs.readFileSync(modularGameFile, 'utf8'), {
      cgb, variables: shared({ screen: 0, score: 0 }), rows: [row('STAR CHASE', 5, 3)], steps: [
        { press: ['a'], frames: 30, variables: shared({ screen: 1, score: 0, player_x: 3, player_y: 12 }),
          ...(cgb ? { attributes: [{ x: 0, y: 4, values: [1, ...Array(18).fill(2), 1] }, { x: 8, y: 1, values: [5] }],
            palettes: [{ kind: 'background', index: 2, colors: gameFloorPalette }] } : {}) },
        { release: ['a'], frames: 4 },
        { press: ['right'], frames: 4, variables: shared({ player_x: 4, score: 0 }) },
        { release: ['right'], frames: 4 },
        { press: ['right'], frames: 4, variables: shared({ player_x: 5, score: 1 }) },
        { release: ['right'], frames: 4 },
        { set: shared({ player_x: 1, player_y: 12, enemy_x: 18, enemy_y: 4, enemy_ticks: 0, move_ticks: 0 }),
          press: ['left'], frames: 4, variables: shared({ player_x: 1, screen: 1 }) },
        { release: ['left'], frames: 4 },
        { set: shared({ enemy_x: 1, enemy_y: 12, enemy_ticks: 0 }), frames: 30,
          variables: shared({ screen: 2, selection: 0 }), rows: [row('GAME OVER', 5, 3), row(' > REPLAY         ', 1, 11)] },
        { press: ['down'], frames: 8, variables: shared({ selection: 1 }), rows: [row(' > TITLE SCREEN   ', 1, 13)],
          ...(cgb ? { attributes: [{ x: 1, y: 13, values: Array(18).fill(3) }, { x: 1, y: 11, values: Array(18).fill(0) }] } : {}) },
        { release: ['down'], frames: 4 },
        { press: ['a'], frames: 30, variables: shared({ screen: 0 }), rows: [row('STAR CHASE', 5, 3)] },
        { release: ['a'], frames: 4 },
        { press: ['start'], frames: 30, variables: shared({ screen: 1, score: 0, player_x: 3, player_y: 12 }) },
        { release: ['start'], frames: 4 },
        { set: shared({ score: 9, player_x: 4, player_y: 12, star_x: 5, star_y: 12,
          enemy_x: 18, enemy_y: 4, enemy_ticks: 0, move_ticks: 0 }), press: ['right'], frames: 30,
          variables: shared({ screen: 3, score: 10, selection: 0 }), rows: [row('YOU WIN!', 6, 3)] },
        { release: ['right'], press: ['down'], frames: 8, variables: shared({ selection: 1 }) },
        { release: ['down'], frames: 4 },
        { press: ['up'], frames: 8, variables: shared({ selection: 0 }), rows: [row(' > REPLAY         ', 1, 11)] },
        { release: ['up'], frames: 4 },
        { press: ['a'], frames: 30, variables: shared({ screen: 1, score: 0, selection: 0, player_x: 3, player_y: 12 }) },
        { release: ['a'], frames: 4 }
      ], screenshot: path.join(root, 'build', `star-chase-color-${cgb ? 'cgb' : 'dmg'}.png`)
    }, modularGameFile);
    const manifest = path.join(directory, 'emulator-cases.json');
    build('runtime-arrays', `
items = [1, -32768, 32767, True]
items[0] += 9
items[-1] *= 4
items[2] += 1
first = items[-4]
last = items[-1]
size = len(items)
total = 0
for i in range(len(items)):
    total += items[i]
sum_values = 0
for value in items:
    if value == -32768:
        continue
    sum_values += value
    value = 999
empty = []
empty_flag = not empty
for nothing in empty:
    total = 999
present_flag = 0
if items:
    present_flag = 1
def local(v):
    work = [v, v + 1]
    work[0] += 3
    return work[0] + work[1]
local_first = local(5)
local_again = local(1)
items = [items[3], items[2], items[1], items[0]]
print(items[0], 0, 0)
done = 1`, { arrays: { items: [4, -32768, -32768, 10] }, variables: { first: 10, last: 4, size: 4, total: 14,
      sum_values: 14, empty_flag: 1, present_flag: 1, local_first: 14, local_again: 6, done: 1 }, rows: [row('4', 0, 0)] });
    build('runtime-array-order', `
items = [1, 2]
order = 0
calls = 0
def index():
    global order, calls
    order = order * 10 + 1
    calls += 1
    return 0
def value():
    global order
    order = order * 10 + 2
    items[0] = 100
    return 5
items[index()] = value()
plain_order = order
plain_value = items[0]
items[0] = 1
order = 0
items[index()] += value()
aug_order = order
aug_value = items[0]
def mutate():
    items[1] += 10
    return items[1]
changed = mutate()
done = 1`, { arrays: { items: [6, 12] }, variables: { plain_order: 21, plain_value: 5, aug_order: 12, aug_value: 6, calls: 2, changed: 12, done: 1 } });
    for (const [name, index] of [['upper', 2], ['lower', -3], ['extreme', -32768]]) build(`runtime-array-bounds-${name}`,
      `items = [7, 8]\nguard = 123\ni = ${index}\nitems[i] = 999\ndone = 1`, {
        arrays: { items: [7, 8] }, variables: { guard: 123, done: 0 }, rows: [row('Index out of range', 0, 16)]
      });
    fs.writeFileSync(path.join(moduleDirectory, 'array_state.pysn'), 'values = [3, 4]\ndef reset():\n    global values\n    values = [8, 9]');
    fs.writeFileSync(path.join(moduleDirectory, 'array_screen.pysn'), 'import array_state as state\ndef update():\n    state.values[-1] += 2\n    return state.values[1]');
    build('runtime-module-arrays', `import array_state as state
from array_screen import update
state.reset()
result = update()
count = len(state.values)
total = 0
for value in state.values:
    total += value
done = 1`, { arrays: { 'array_state.values': [8, 11] }, variables: { result: 11, count: 2, total: 19, done: 1 } }, path.join(moduleDirectory, 'main.pysn'));
    build('runtime-array-operators', `ops = [20, -7, 7, 13, 8, 7, 3]
ops[0] -= 3
ops[1] //= 3
ops[2] %= -3
ops[3] &= 7
ops[4] |= 3
ops[5] ^= 3
ops[6] *= -2
indices = [1, 0]
nested = ops[indices[-1]]
visited = 0
for value in ops:
    visited += 1
    if visited == 3:
        break
done = 1`, { arrays: { ops: [17, -3, -2, 5, 11, 4, -6] }, variables: { nested: 17, visited: 3, done: 1 } });
    build('runtime-array-empty-read', 'items = []\nguard = 321\ni = -1\nx = items[i]\ndone = 1', {
      variables: { guard: 321, x: 0, done: 0 }, rows: [row('Index out of range', 0, 16)]
    });
    for (const cgb of [false, true]) build(`runtime-array-inventory-${cgb}`, fs.readFileSync(path.join(root, 'examples/array-inventory.pysn'), 'utf8'), {
      cgb, arrays: { inventory: [2, 0, 5, 1] }, variables: { selected: 0 }, steps: [
        { press: ['a'], frames: 12, arrays: { inventory: [3, 0, 5, 1] } },
        { frames: 12, arrays: { inventory: [3, 0, 5, 1] } },
        { release: ['a'], press: ['down'], frames: 12, variables: { selected: 1 } },
        { release: ['down'], press: ['b'], frames: 12, arrays: { inventory: [3, 0, 5, 1] } },
        { release: ['b'], press: ['a'], frames: 12, arrays: { inventory: [3, 1, 5, 1] } },
        { release: ['a'], press: ['start'], frames: 12, arrays: { inventory: [2, 0, 5, 1] }, variables: { selected: 0 } },
        { release: ['start'], press: ['up'], frames: 12, variables: { selected: 3 }, rows: [row('Slot', 3, 7)],
          ...(cgb ? { attributes: [{ x: 3, y: 7, values: Array(13).fill(2) }] } : {}) },
        { release: ['up'], frames: 4 }
      ], screenshot: path.join(root, 'build', `array-inventory-${cgb ? 'cgb' : 'dmg'}.png`)
    });
    const collisionRows = Array.from({ length: 32 }, (_, y) => [...Array(32)].map((_, x) => (x + y) % 3 === 0 ? '#' : '.').join(''));
    for (const cgb of [false, true]) build(`runtime-collision-${cgb}`, `
level = collision_map(${JSON.stringify(collisionRows)})
width = map_width(level)
height = map_height(level)
errors = 0
for y in range(height):
    for x in range(width):
        if tile_is_solid(level, x, y) != ((x + y) % 3 == 0):
            errors += 1
negative = tile_is_solid(level, -1, 0)
outside = tile_is_solid(level, 32, 31)
bottom = tile_is_solid(level, 0, 32)
extreme = tile_is_solid(level, -32768, 32767)
invalid = tile_is_solid(32767, 0, 0)
invalid_width = map_width(-1)
invalid_height = map_height(1)
wrong_kind = tile_at(level, 0, 0)
nested = tile_is_solid(level, map_width(level) - 1, map_height(level) - 1)
done = 1`, { cgb, frames: 240, variables: { width: 32, height: 32, errors: 0, negative: 1, outside: 1, bottom: 1, extreme: 1, invalid: 1, invalid_width: -1, invalid_height: -1, wrong_kind: -1, nested: 0, done: 1 } });
    const boardFile = path.join(root, 'examples/star-chase/assets/board.bmp').replaceAll('\\', '/');
    const boardAsset = compile(`board = tilemap("${boardFile}")`).assets[0];
    build('runtime-map-queries', `board = tilemap("${boardFile}")
width = map_width(board)
height = map_height(board)
wall = tile_at(board, 0, 0)
floor = tile_at(board, 1, 1)
last = tile_at(board, 19, 12)
negative = tile_at(board, -1, 0)
outside = tile_at(board, 20, 0)
invalid = tile_at(255, 0, 0)
wrong_kind = tile_is_solid(board, 1, 1)
done = 1`, { variables: { width: 20, height: 13, wall: boardAsset.maps[0][0], floor: boardAsset.maps[0][21], last: boardAsset.maps[0][259], negative: -1, outside: -1, invalid: -1, wrong_kind: 1, done: 1 } });
    const tileDirectory = path.join(root, 'examples/star-chase/assets').replaceAll('\\', '/');
    const nestedSource = `header.target = "dual"
wall = tile("${tileDirectory}/brick.bmp", solid=True, terrain=255)
open_tile = tile("${tileDirectory}/floor.bmp")
water = tile("${tileDirectory}/brick.bmp", terrain=2)
board = tilemap([[wall, open_tile, water], [open_tile, water, wall]])
width = map_width(board)
height = map_height(board)
wall_id = tile_at(board, 0, 0)
water_id = tile_at(board, 2, 0)
wall_solid = tile_is_solid(board, 0, 0)
water_solid = tile_is_solid(board, 2, 0)
wall_terrain = tile_terrain(board, 0, 0)
water_terrain = tile_terrain(board, 1, 1)
default_terrain = tile_terrain(board, 0, 1)
negative = tile_terrain(board, -1, 0)
outside = tile_at(board, 3, 0)
blocked = tile_is_solid(board, 0, 2)
invalid = tile_terrain(32767, 0, 0)
wrong_kind = tile_terrain(wall, 0, 0)
nested = tile_terrain(board, map_width(board) - 1, map_height(board) - 1)
clear_screen()
draw_map(board, 2, 3)
draw_map(board, 19, 17)
refresh_screen()
done = 1`;
    const nestedAssets = compile(nestedSource).assets;
    const [wallTile, floorTile] = nestedAssets;
    const tileRows = [wallTile.maps[0][0], floorTile.maps[0][0], wallTile.maps[0][0]];
    for (const cgb of [false, true]) build(`runtime-nested-map-${cgb}`, nestedSource, {
      cgb, variables: { width: 3, height: 2, wall_id: tileRows[0], water_id: tileRows[0], wall_solid: 1, water_solid: 0,
        wall_terrain: 255, water_terrain: 2, default_terrain: 0, negative: -1, outside: -1, blocked: 1,
        invalid: -1, wrong_kind: -1, nested: 255, done: 1 },
      rows: [{ x: 2, y: 3, tiles: tileRows }, { x: 2, y: 4, tiles: [tileRows[1], tileRows[0], tileRows[0]] }, { x: 19, y: 17, tiles: [tileRows[0]] }],
      ...(cgb ? { attributes: [{ x: 2, y: 3, values: [wallTile.paletteIndex, floorTile.paletteIndex, wallTile.paletteIndex] },
        { x: 2, y: 4, values: [floorTile.paletteIndex, wallTile.paletteIndex, wallTile.paletteIndex] }, { x: 19, y: 17, values: [wallTile.paletteIndex] }] } : {})
    });
    const largeRows = Array.from({ length: 32 }, (_, y) => '[' + Array.from({ length: 32 }, (_, x) => (x + y) % 3 === 0 ? 'wall' : 'open_tile').join(',') + ']');
    build('runtime-nested-map-large', `wall = tile("${tileDirectory}/brick.bmp", solid=True, terrain=255)
open_tile = tile("${tileDirectory}/floor.bmp")
board = tilemap([${largeRows.join(',')}])
errors = 0
for y in range(32):
    for x in range(32):
        expected = (x + y) % 3 == 0
        if tile_is_solid(board, x, y) != expected or tile_terrain(board, x, y) != expected * 255:
            errors += 1
last = tile_terrain(board, 31, 31)
draw_map(board, 0, 0)
refresh_screen()
done = 1`, { frames: 300, variables: { errors: 0, last: 0, done: 1 }, rows: [{ x: 0, y: 0, tiles: Array.from({ length: 20 }, (_, x) => x % 3 === 0 ? tileRows[0] : tileRows[1]) },
      { x: 0, y: 17, tiles: Array.from({ length: 20 }, (_, x) => (x + 17) % 3 === 0 ? tileRows[0] : tileRows[1]) }] });
    const scrollRows = Array.from({ length: 32 }, (_, y) => '[' + Array.from({ length: 32 }, (_, x) => (x + y) % 3 === 0 ? 'wall' : 'open_tile').join(',') + ']');
    const scrollDeclarations = `header.target = "dual"
wall = tile("${tileDirectory}/brick.bmp", solid=True, terrain=1)
open_tile = tile("${tileDirectory}/floor.bmp")
hero = sprite_sheet("${tileDirectory}/player.bmp", 8, 8)
board = tilemap([${scrollRows.join(',')}])
small = tilemap([[open_tile]])
bmp_board = tilemap("${tileDirectory}/board.bmp")
`;
    const scrollSource = scrollDeclarations + `
draw_world(board)
set_camera(3, 5)
world_sprite(0, hero, 0, 1, 4)
sprite(1, hero, 0, 30, 40)
phase = 0
while True:
    wait_vblank()
    draw_world(board)
    if button_pressed("a"):
        phase = 1
        set_camera(11, 13)
        world_sprite(0, hero, 1, 8, 10, True)
    if button_pressed("b"):
        phase = 2
        set_camera(32767, -32768)
        world_sprite(0, hero, 0, 94, -7)
    if button_pressed("start"):
        phase = 3
        set_camera(-1, 32767)
    if button_pressed("select"):
        phase = 4
        clear_screen()
        hide_sprite(0)
        hide_sprite(1)
        print("SCREEN", 0, 4)
    if button_pressed("up"):
        phase = 5
        draw_world(small)
        set_camera(1000, 1000)
    if button_pressed("right"):
        phase = 6
        draw_world(bmp_board)
        set_camera(11, 13)
    if button_pressed("down"):
        phase = 7
        draw_world(board)
        set_camera(8, 8)
    cx = camera_x()
    cy = camera_y()
    solid = tile_is_solid(board, 0, 0)
    terrain = tile_terrain(board, 1, 0)
    refresh_screen()`;
    // Stop repeatedly selecting the original world once testing screen transitions.
    const scrollFinalSource = scrollSource.replace('    draw_world(board)\n    if button_pressed', '    if phase < 4:\n        draw_world(board)\n    if button_pressed');
    const scrollAssets = compile(scrollFinalSource).assets;
    const scrollHero = scrollAssets.find(asset => asset.kind === 'sprite');
    const scrollBMP = scrollAssets.find(asset => asset.kind === 'background');
    const scrollTileRows = [{ x: 0, y: 31, tiles: Array.from({ length: 32 }, (_, x) => (x + 31) % 3 === 0 ? tileRows[0] : tileRows[1]) }];
    for (const cgb of [false, true]) build(`runtime-scrolling-${cgb}`, scrollFinalSource, {
      cgb, variables: { phase: 0, cx: 3, cy: 5, solid: 1, terrain: 0 }, rows: scrollTileRows,
      bytes: [{ address: 0xff42, values: [5, 3] }, { address: 0xfe00, values: [15, 6, scrollHero.maps[0][0], 0, 56, 38, scrollHero.maps[0][0], 0] }],
      ...(cgb ? { attributes: [{ x: 0, y: 31, values: Array.from({ length: 32 }, (_, x) => (x + 31) % 3 === 0 ? 1 : 2) }] } : {}),
      steps: [
        { press: ['a'], frames: 12, variables: { phase: 1, cx: 11, cy: 13 }, bytes: [{ address: 0xff42, values: [13, 11] }, { address: 0xfe00, values: [13, 5, scrollHero.maps[1][0], 32] }] },
        { release: ['a'], frames: 4 },
        { press: ['b'], frames: 12, variables: { phase: 2, cx: 96, cy: 0 }, bytes: [{ address: 0xff42, values: [0, 96] }, { address: 0xfe00, values: [9, 6, scrollHero.maps[0][0], 0] }] },
        { release: ['b'], press: ['start'], frames: 12, variables: { phase: 3, cx: 0, cy: 112 }, bytes: [{ address: 0xff42, values: [112, 0] }] },
        { release: ['start'], press: ['select'], frames: 80, variables: { phase: 4, cx: 0, cy: 0 }, bytes: [{ address: 0xff42, values: [0, 0] }, { address: 0xfe00, values: [0] }], rows: [row('SCREEN', 0, 4)] },
        { release: ['select'], press: ['up'], frames: 80, variables: { phase: 5, cx: 0, cy: 0 }, rows: [{ x: 0, y: 0, tiles: [tileRows[1], 0] }, { x: 0, y: 31, tiles: [0, 0] }] },
        { release: ['up'], press: ['right'], frames: 80, variables: { phase: 6, cx: 0, cy: 0 }, rows: [{ x: 0, y: 12, tiles: scrollBMP.maps[0].slice(240, 260) }, { x: 0, y: 31, tiles: [0, 0] }] },
        { release: ['right'], press: ['down'], frames: 80, variables: { phase: 7, cx: 8, cy: 8 }, rows: scrollTileRows, bytes: [{ address: 0xff42, values: [8, 8] }] }
      ]
    });
    build('runtime-camera-buffering', scrollDeclarations + `draw_world(board)
set_camera(3, 5)
world_sprite(0, hero, 0, 1, 4)
cx = camera_x()
while not button_pressed("a"):
    wait_vblank()
refresh_screen()
done = 1`, { variables: { cx: 3, done: 0 }, bytes: [{ address: 0xff42, values: [0, 0] }, { address: 0xfe00, values: [0] }],
      steps: [{ press: ['a'], frames: 100, variables: { done: 1 }, bytes: [{ address: 0xff42, values: [5, 3] }, { address: 0xfe00, values: [15, 6, scrollHero.maps[0][0], 0] }] }] });
    const scrollingFile = path.join(root, 'examples/scrolling-world/main.pysn');
    for (const cgb of [false, true]) build(`runtime-scrolling-demo-${cgb}`, fs.readFileSync(scrollingFile, 'utf8'), {
      cgb, window_enabled: false, variables: { mode: 0, player_x: 24, player_y: 24 }, rows: [row('SCROLLING WORLD', 2, 3)], steps: [
        { press: ['a'], frames: 100, window_enabled: true, window_rows: [row('X:24', 0, 0), row('Y:24', 6, 0), row('FLOOR', 13, 0)], variables: { mode: 1, player_x: 24, player_y: 24 }, bytes: [{ address: 0xff42, values: [0, 0] }] },
        { release: ['a'], press: ['right'], frames: 12, ranges: { player_x: [25, 40] } },
        { release: ['right'], frames: 6 },
        { set: { player_x: 160, player_y: 120 }, frames: 16, window_enabled: true, window_rows: [row('X:160', 0, 0), row('Y:120', 6, 0)], bytes: [{ address: 0xff42, values: [52, 84] }, { address: 0xfe00, values: [84, 84] }] },
        { set: { player_x: 240, player_y: 240 }, frames: 16, variables: { mode: 1 }, bytes: [{ address: 0xff42, values: [112, 96] }, { address: 0xfe00, values: [144, 152] }] },
        { set: { player_x: 48, player_y: 48 }, press: ['right'], frames: 12, ranges: { player_x: [49, 56] } },
        { release: ['right'], frames: 6 },
        { set: { player_x: 112, player_y: 80 }, press: ['right'], frames: 12, variables: { player_x: 112 } },
        { release: ['right'], frames: 6 },
        { set: { player_x: 232, player_y: 232 }, frames: 80, window_enabled: false, variables: { mode: 2 }, rows: [row('STAR FOUND!', 4, 5)], bytes: [{ address: 0xff42, values: [0, 0] }, { address: 0xfe00, values: [0] }] },
        { press: ['start'], frames: 100, window_enabled: true, window_rows: [row('X:24', 0, 0), row('Y:24', 6, 0)], variables: { mode: 1, player_x: 24, player_y: 24 }, bytes: [{ address: 0xff42, values: [0, 0] }] },
        { release: ['start'], set: { player_x: 160, player_y: 120 }, frames: 12, bytes: [{ address: 0xff42, values: [52, 84] }] }
      ], screenshot: path.join(root, 'build', `scrolling-world-${cgb ? 'cgb' : 'dmg'}.png`)
    }, scrollingFile);
    const hudSource = scrollDeclarations + `bg_palette(4, "#203850", "#486880", "#a0c0e0", "#ffffff")
draw_world(board)
set_camera(3, 5)
clear_window(4)
window_position(0, 136)
print_window("HUD", 0, 0, 4)
print_window(123, 4, 0, 4)
print_window(-32768, 9, 0, 4)
print_window("ZZ", 19, 0, 4)
print_window("A\\nB", 19, 16, 4)
show_window()
phase = 0
while not button_pressed("a"):
    wait_vblank()
refresh_screen()
while True:
    wait_vblank()
    if button_pressed("b"):
        phase = 1
        set_camera(11, 13)
    if button_pressed("start"):
        phase = 2
        clear_screen()
    if button_pressed("select"):
        phase = 3
        hide_window()
    if button_pressed("up"):
        phase = 4
        window_position(8, 128)
        show_window()
    if button_pressed("down"):
        phase = 5
        window_position(0, 136)
        clear_window(5)
        print_window("NEW", 0, 0, 5)
    if button_pressed("right"):
        phase = 6
        window_position(159, 143)
    if button_pressed("left"):
        phase = 7
        bad_x = -1
        bad_y = 144
        window_position(bad_x, bad_y)
        bad_palette = 8
        print_window("BAD", 0, 0, bad_palette)
        bad_x = 20
        print_window("BAD", bad_x, 0)
    cx = camera_x()
    cy = camera_y()
    refresh_screen()`;
    for (const cgb of [false, true]) build(`runtime-window-${cgb}`, hudSource, {
      cgb, window_enabled: false, variables: { phase: 0 }, bytes: [{ address: 0xff42, values: [0, 0] }],
      steps: [
        { press: ['a'], frames: 120, window_enabled: true, variables: { cx: 3, cy: 5 }, bytes: [{ address: 0xff42, values: [5, 3] }, { address: 0xff4a, values: [136, 7] }],
          window_rows: [row('HUD', 0, 0), row('123', 4, 0), row('-32768', 9, 0), row('Z', 19, 0), row('A', 19, 16), row('B', 19, 17)],
          ...(cgb ? { window_attributes: [{ x: 0, y: 0, values: Array(20).fill(4) }] } : {}),
          capture_regions: [{ name: 'hud', x: 0, y: 136, width: 160, height: 8 }] },
        { release: ['a'], press: ['b'], frames: 20, variables: { phase: 1, cx: 11, cy: 13 }, bytes: [{ address: 0xff42, values: [13, 11] }], compare_regions: [{ name: 'hud' }] },
        { release: ['b'], press: ['start'], frames: 80, variables: { phase: 2, cx: 0, cy: 0 }, window_enabled: true, rows: [{ x: 0, y: 0, tiles: [0, 0] }], compare_regions: [{ name: 'hud' }] },
        { release: ['start'], press: ['select'], frames: 20, variables: { phase: 3 }, window_enabled: false, compare_regions: [{ name: 'hud', equal: false }] },
        { release: ['select'], press: ['up'], frames: 20, variables: { phase: 4 }, window_enabled: true, bytes: [{ address: 0xff4a, values: [128, 15] }], window_rows: [row('HUD', 0, 0)] },
        { release: ['up'], press: ['down'], frames: 100, variables: { phase: 5 }, window_enabled: true, bytes: [{ address: 0xff4a, values: [136, 7] }], window_rows: [row('NEW                 ', 0, 0), row(' ', 19, 17)],
          ...(cgb ? { window_attributes: [{ x: 0, y: 0, values: Array(20).fill(5) }] } : {}) },
        { release: ['down'], press: ['right'], frames: 20, variables: { phase: 6 }, window_enabled: true, bytes: [{ address: 0xff4a, values: [143, 166] }] },
        { release: ['right'], press: ['left'], frames: 20, variables: { phase: 7 }, bytes: [{ address: 0xff4a, values: [143, 166] }], window_rows: [row('NEW', 0, 0)] }
      ]
    });
    for (const cgb of [false, true]) build(`runtime-window-only-${cgb}`, `header.target = "dual"
print_window("ONLY WINDOW", 0, 0, 3)
show_window()
done = 1`, { cgb, window_enabled: true, variables: { done: 1 }, window_rows: [row('ONLY WINDOW', 0, 0)], rows: [{ x: 0, y: 0, tiles: [0, 0] }],
      bytes: [{ address: 0xff4a, values: [0, 7] }], ...(cgb ? { window_attributes: [{ x: 0, y: 0, values: Array(11).fill(3) }] } : {}) });
    const audioSource = `header.target = "dual"
tone = sound_effect("pulse", [[440, 120, 10]], 3)
noise = sound_effect("noise", [[52, 120, 9]], 5)
phase = 0
while True:
    wait_vblank()
    if button_pressed("a"):
        phase = 1
        play_sound(tone)
    if button_pressed("b"):
        phase = 2
        play_sound("menu_move")
    if button_pressed("start"):
        phase = 3
        play_sound(noise)
    if button_pressed("select"):
        phase = 4
        mute_sound()
        play_sound(tone)
    if button_pressed("up"):
        phase = 5
        mute_sound(False)
        play_sound(tone, 6)
    if button_pressed("left"):
        phase = 6
        set_sound_volume(2, 5)
    if button_pressed("right"):
        phase = 7
        invalid = 8
        set_sound_volume(invalid, 1)
        play_sound("win", invalid)
    if button_pressed("down"):
        phase = 8
        stop_sound()
    playing = sound_playing()
    refresh_screen()`;
    for (const cgb of [false, true]) build(`runtime-audio-${cgb}`, audioSource, {
      cgb, audio: true, variables: { phase: 0, playing: 0 }, registers: [{ address: 0xff26, mask: 128, value: 128 }, { address: 0xff24, value: 119 }, { address: 0xff25, value: 170 }],
      steps: [
        { press: ['a'], frames: 10, variables: { phase: 1, playing: 1 }, audio_varies: true, bytes: [{ symbol: 'wSoundPriority', values: [3] }], registers: [{ address: 0xff26, mask: 10, value: 2 }, { address: 0xff17, value: 160 }] },
        { release: ['a'], press: ['b'], frames: 10, variables: { phase: 2, playing: 1 }, audio_varies: true, bytes: [{ symbol: 'wSoundPriority', values: [3] }], registers: [{ address: 0xff17, value: 160 }] },
        { release: ['b'], press: ['start'], frames: 10, variables: { phase: 3, playing: 1 }, audio_varies: true, bytes: [{ symbol: 'wSoundKind', values: [1] }, { symbol: 'wSoundPriority', values: [5] }], registers: [{ address: 0xff26, mask: 10, value: 8 }, { address: 0xff21, value: 144 }, { address: 0xff22, value: 52 }] },
        { release: ['start'], press: ['select'], frames: 10, variables: { phase: 4, playing: 0 }, audio_varies: false, bytes: [{ symbol: 'wSoundMuted', values: [1] }], registers: [{ address: 0xff25, value: 0 }, { address: 0xff26, mask: 10, value: 0 }] },
        { release: ['select'], press: ['up'], frames: 10, variables: { phase: 5, playing: 1 }, audio_varies: true, bytes: [{ symbol: 'wSoundMuted', values: [0] }, { symbol: 'wSoundPriority', values: [6] }], registers: [{ address: 0xff25, value: 170 }, { address: 0xff26, mask: 10, value: 2 }] },
        { release: ['up'], press: ['left'], frames: 10, variables: { phase: 6, playing: 1 }, registers: [{ address: 0xff24, value: 37 }] },
        { release: ['left'], press: ['right'], frames: 10, variables: { phase: 7, playing: 1 }, bytes: [{ symbol: 'wSoundPriority', values: [6] }], registers: [{ address: 0xff24, value: 37 }] },
        { release: ['right'], press: ['down'], frames: 10, variables: { phase: 8, playing: 0 }, audio_varies: false, registers: [{ address: 0xff26, mask: 10, value: 0 }] }
      ]
    });
    const steppedSound = `header.target = "dual"
tone = sound_effect("pulse", [[440, 8, 10], [0, 4, 0], [880, 8, 6]])
noise = sound_effect("noise", [[52, 8, 12], [84, 8, 8]])
mode = 0
while True:
    wait_vblank()
    if button_pressed("a"):
        mode = 1
        play_sound(tone)
    if button_pressed("b"):
        mode = 2
        play_sound(noise)
    playing = sound_playing()
    refresh_screen()`;
    build('runtime-audio-sequence', steppedSound, { audio: true, variables: { mode: 0, playing: 0 }, steps: [
      { press: ['a'], frames: 5, variables: { mode: 1, playing: 1 }, registers: [{ address: 0xff17, value: 160 }] },
      { release: ['a'], frames: 5, variables: { playing: 1 }, registers: [{ address: 0xff26, mask: 10, value: 0 }] },
      { frames: 5, variables: { playing: 1 }, registers: [{ address: 0xff17, value: 96 }] },
      { frames: 12, variables: { playing: 0 }, registers: [{ address: 0xff26, mask: 10, value: 0 }] },
      { press: ['b'], frames: 5, variables: { mode: 2, playing: 1 }, registers: [{ address: 0xff21, value: 192 }, { address: 0xff22, value: 52 }] },
      { release: ['b'], frames: 5, registers: [{ address: 0xff21, value: 128 }, { address: 0xff22, value: 84 }] },
      { frames: 12, variables: { playing: 0 }, registers: [{ address: 0xff26, mask: 10, value: 0 }] }
    ] });
    build('runtime-audio-idle', 'tone = sound_effect("pulse", [[660, 255, 10]])\nplay_sound(tone)\ndone = 1', { audio: true, frames: 150, variables: { done: 1 }, bytes: [{ symbol: 'wSoundActive', values: [1] }], audio_varies: true,
      steps: [{ frames: 300, bytes: [{ symbol: 'wSoundActive', values: [0] }], audio_varies: false }] });
    // Identical reader calls switch between distant map banks and ROM0 sound data.
    const bankedFile = path.join(root, 'examples/banked-world/main.pysn');
    const bankedSource = `header.target = "dual"
import includes.rooms as rooms
hero = sprite_sheet("../scrolling-world/assets/player.bmp")
tone = sound_effect("pulse", [[440, 255, 10]])
first = tile_terrain(rooms.room0, 1, 1)
last = tile_terrain(rooms.room17, 1, 1)
wall = tile_is_solid(rooms.room17, 24, 5)
open = tile_is_solid(rooms.room0, 24, 5)
draw_world(rooms.room17)
sprite(0, hero, 0, 40, 40)
play_sound(tone)
iterations = 0
while True:
    wait_vblank()
    first = tile_at(rooms.room0, 1, 1)
    last = tile_at(rooms.room17, 1, 1)
    terrain = tile_terrain(rooms.room0, 1, 1)
    sprite(0, hero, 0, 40, 40)
    iterations += 1
    refresh_screen()`;
    for (const controller of ['mbc1', 'mbc3', 'mbc5']) for (const cgb of [false, true]) {
      const result = build(`runtime-banks-${controller}-${cgb}`, `header.controller = "${controller}"\n` + bankedSource,
        { cgb, audio: true, frames: 130, variables: { terrain: 2, wall: 1, open: 0 }, ranges: { iterations: [5, 200] }, audio_varies: true,
          steps: [{ frames: 12, variables: { terrain: 2, wall: 1, open: 0 }, audio_varies: true }] }, bankedFile);
      const floor = result.assets.find(asset => asset.kind === 'tile' && asset.terrain === 2).maps[0][0];
      cases[cases.length - 1].variables.first = floor;
      cases[cases.length - 1].variables.last = floor;
      cases[cases.length - 1].rows = [{ x: 24, y: 5, tiles: [result.assets.find(asset => asset.kind === 'tile' && asset.terrain === 1).maps[0][0]] }];
      assert.equal(result.banking.romKB, 64);
    }
    for (const cgb of [false, true]) build(`runtime-banking-demo-${cgb}`, fs.readFileSync(bankedFile, 'utf8'), {
      cgb, variables: { room: 0, view_x: 0, view_y: 0 },
      steps: [{ press: ['b'], frames: 16, variables: { room: 17 } }, { release: ['b'], press: ['right'], frames: 16, ranges: { view_x: [4, 40] } },
        { release: ['right'], press: ['a'], frames: 16, variables: { room: 0, view_x: 0 } }]
    }, bankedFile);
    fs.writeFileSync(manifest, JSON.stringify(cases));
    const result = spawnSync(python, [path.join(__dirname, 'emulator.py'), manifest], { cwd: root, encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
    console.log(result.stdout.trim());
  });
