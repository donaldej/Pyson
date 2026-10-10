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

test('fixed arithmetic, conversions and helpers run on DMG and Color', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const dir = path.join(root, 'build/tests/fixed');
  fs.mkdirSync(dir, { recursive: true });
  const cases = [];
  function build(source, name, expected, filename = path.join(dir, 'main.pysn')) {
    const result = compile('header.target = "dual"\n' + source, filename);
    const asm = path.join(dir, name + '.asm');
    fs.writeFileSync(asm, result.assembly);
    const rom = assemble(asm, name);
    for (const cgb of [false, true]) cases.push({ name: name + cgb, rom, cgb, frames: 180,
      symbols: path.join(root, 'build', name + '.sym'),
      symbolNames: Object.fromEntries(result.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label])), ...expected });
  }
  fs.writeFileSync(path.join(dir, 'helpers.pysn'), 'def add_step(position, step=0.125):\n    return position + step\n');
  const lines = ['import helpers', 'x = fixed(40)', 'for i in range(5):\n    x += 0.5',
    'pixels = int(x)', 'negative = int(-1.9375)',
    'def advance(position, step=0.5):\n    return position + step',
    'def forward(position):\n    return advance(position=position)',
    'answer = forward(x)', 'default_call = advance(10)',
    'chained = -2 < -0.5 < 1 < 1.5', 'no = 1 < -0.5 < 2',
    'rounding = 0.1', 'flag = not 0.0', 'low = -2048.0',
    'whole = fixed(-7)', 'floor_result = -1.5 // 1', 'remainder = -1.5 % 1',
    'difference = 10 - 0.5', 'sum = 0.5 + 10',
    'def nested(value):\n    return value + 0.125',
    'nested_result = advance(position=x, step=nested(0.5))',
    'imported_result = helpers.add_step(x)', 'absolute = abs(-1.5)',
    'minimum = min(0.5, 1)', 'maximum = max(0, 0.5)', 'limited = clamp(1.5, 0, 1)',
    'def defaults(step=fixed(0.125)):\n    return step', 'default_fixed = defaults()'];
  const variables = { x: 680, pixels: 42, negative: -1, answer: 688, default_call: 168,
    chained: 1, no: 0, rounding: 2, flag: 1, low: -32768, whole: -112,
    floor_result: -2, remainder: 8, difference: 152, sum: 168, nested_result: 690,
    imported_result: 682, absolute: 24, minimum: 8, maximum: 8, limited: 16, default_fixed: 2 };
  // Expected values are raw sixteenth units; test products beyond a 16-bit intermediate.
  const pairs = [[40, 0.5], [-1.5, 0.5], [100, 100], [-2048, 0.0625],
    [2047.9375, -1], [0.0625, 0.0625], [-3.0625, 0.5], [30, 0.125],
    [-2048, -2048], [2047.9375, 2047.9375], [1, 3], [-1, 3], [7, -2]];
  const wrap = n => (n & 65535) >= 32768 ? (n & 65535) - 65536 : n & 65535;
  pairs.forEach(([a, b], i) => {
    lines.push(`mul_${i} = fixed(${a}) * fixed(${b})`, `div_${i} = fixed(${a}) / fixed(${b})`);
    variables[`mul_${i}`] = wrap(Math.trunc(a * b * 16));
    variables[`div_${i}`] = wrap(Math.trunc(a / b * 16));
  });
  lines.push('print(pixels, 0, 0)', 'refresh_screen()');
  build(lines.join('\n'), 'runtime-fixed', { variables });
  build('zero = 0.0\ndone = 0\nx = fixed(1) / zero\ndone = 1', 'runtime-fixed-zero', {
    variables: { done: 0 }, rows: [{ x: 0, y: 16, tiles: [...'Division by zero'].map(c => font.ids.get(c)) }] });
  const example = path.join(root, 'examples/fractional-motion/main.pysn');
  build(fs.readFileSync(example, 'utf8').replace('header.target = "dual"', ''), 'runtime-fixed-example', {
    frames: 360,
    variables: { fast_speed: -16, medium_speed: 8, slow_speed: 2 },
    ranges: { fast_x: [256, 2048], medium_x: [256, 2048], slow_x: [256, 2048] },
    rows: [{ x: 1, y: 1, tiles: [...'FRACTIONAL MOVEMENT'].map(c => font.ids.get(c)) }],
    steps: [{ press: ['a'], frames: 12, variables: { fast_speed: 16, medium_speed: 8, slow_speed: 2 },
      ranges: { fast_x: [256, 512], medium_x: [256, 400], slow_x: [256, 300] } }, { release: ['a'], frames: 12 }]
  }, example);
  const manifest = path.join(dir, 'cases.json');
  fs.writeFileSync(manifest, JSON.stringify(cases));
  const run = spawnSync(emulatorPython(), [path.join(__dirname, 'emulator.py'), manifest], { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.error?.message || run.stdout + run.stderr);
});
