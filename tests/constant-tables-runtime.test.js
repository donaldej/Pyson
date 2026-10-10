'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compile } = require('../src/compiler');
const { assemble } = require('../scripts/dev');
const { makeReport } = require('../src/build-report');
const font = require('../src/font');
const { emulatorPython } = require('../scripts/environment');
const root = path.resolve(__dirname, '..');

test('ROM table reads restore banked execution on both models and all supported controllers', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const dir = path.join(root, 'build/tests/constant-tables');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'data.pysn'), 'values = constant_table([32767, -32768, 7, -9])\n');
  fs.writeFileSync(path.join(dir, 'reader.pysn'), 'def get(values, i):\n    return values[i] + 1\n');
  const cases = [];
  const contents = `header.target = "dual"
import data
import reader
empty = constant_table([])
padding = constant_table([${Array(7600).fill('3').join(',')}])
ram = [2, 4, 6]
def nested(values, i):
    return reader.get(values, i) + reader.get(i=-1, values=values)
def sum_values(values):
    total = 0
    for value in values:
        total += value
    return total
def nonempty(values):
    if values:
        return len(values)
    return 0
def copy(target, source):
    for i in range(len(target)):
        target[i] = source[i]
def snapshot(values, other):
    return values[0] + other
first = data.values[0]
last = data.values[-1]
wrapped = reader.get(data.values, 0)
answer = nested(data.values, 2)
looped = sum_values(data.values)
ram_sum = sum_values(ram)
ram_nested = nested(ram, 1)
empty_sum = sum_values(empty)
empty_flag = nonempty(empty)
rom_flag = nonempty(data.values)
ram_flag = nonempty(ram)
copy(target=ram, source=data.values)
copied = ram[2]
nested_snapshot = snapshot(values=data.values, other=snapshot(ram, 5))
length = len(data.values)
is_empty = not empty
sum = 0
for value in data.values:
    sum += value
index = -7600
boundary = padding[index]
index = 7599
end = padding[index]
print("ROM TABLES OK", 2, 2)
refresh_screen()
`;
  for (const [controller, highBank, capacity] of [['rom_only', 1, 32], ['mbc1', 33, 1024], ['mbc3', 65, 2048], ['mbc5', 257, 8192]]) {
    // For ROM-only, use a small table that fits its permanently mapped window.
    const source = controller === 'rom_only' ? contents.replace(/padding = constant_table\(\[[^\n]*\]\)/, 'padding = constant_table([3,3])').replace('-7600', '-2').replace('7599', '1') : contents;
    const compiled = compile(`header.controller = "${controller}"\nheader.rom_kb = ${capacity}\n` + source, path.join(dir, 'main.pysn'));
    assert.equal(compiled.symbols.filter(s => s.name === 'data.values').length, 1);
    let assembly = compiled.assembly;
    if (controller !== 'rom_only') {
      const object = compiled.banking.objects.find(o => o.kind === 'constant_table' && o.bytes === 8);
      assembly = assembly.replace(`SECTION "${object.label} data", ROMX[$${object.address.toString(16)}], BANK[${object.bank}]`, `SECTION "${object.label} data", ROMX[$4000], BANK[${highBank}]`);
      assert.notEqual(assembly, compiled.assembly);
    }
    const name = `runtime-constant-tables-${controller}`;
    const asm = path.join(dir, name + '.asm');
    fs.writeFileSync(asm, assembly);
    const rom = assemble(asm, name);
    const symbols = path.join(root, 'build', name + '.sym');
    const report = makeReport(compiled, fs.readFileSync(symbols, 'utf8'), fs.statSync(rom).size);
    assert.equal(report.variables.find(v => v.name === 'data.values').bytes, 0);
    assert.ok(report.wramFreeBytes > 2000);
    for (const cgb of [false, true]) cases.push({ name: name + '-' + cgb, rom, cgb, frames: 160, symbols,
      symbolNames: Object.fromEntries(compiled.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label])),
      variables: { first: 32767, last: -9, wrapped: -32768, answer: 0, looped: -3, length: 4, is_empty: 1, sum: -3, boundary: 3, end: 3,
        ram_sum: 12, ram_nested: 12, empty_sum: 0, empty_flag: 0, rom_flag: 4, ram_flag: 3, copied: 7, nested_snapshot: 3 },
      bytes: compiled.banking.objects.some(o => o.kind === 'function') ? [{ symbol: 'wExecutionBank', values: [0, 0] }] : [] });
  }
  for (const index of [2, -3, -32768]) {
    const compiled = compile(`values = constant_table([7,8])\ndef read(data, index):\n    return data[index]\nguard = 123\ndone = 0\nindex = ${index}\nx = read(values, index)\ndone = 1`);
    const name = `runtime-constant-tables-bounds-${index}`;
    const asm = path.join(dir, name + '.asm');
    fs.writeFileSync(asm, compiled.assembly);
    const rom = assemble(asm, name);
    for (const cgb of [false, true]) cases.push({ name: name + '-' + cgb, rom, cgb, frames: 160, symbols: path.join(root, 'build', name + '.sym'),
      symbolNames: Object.fromEntries(compiled.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label])),
      variables: { guard: 123, done: 0 }, rows: [{ x: 0, y: 16, tiles: [...'Index out of range'].map(c => font.ids.get(c)) }] });
  }
  const manifest = path.join(dir, 'cases.json');
  fs.writeFileSync(manifest, JSON.stringify(cases));
  const run = spawnSync(emulatorPython(), [path.join(__dirname, 'emulator.py'), manifest], { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.error?.message || run.stdout + run.stderr);
  console.log(run.stdout.trim());
});
