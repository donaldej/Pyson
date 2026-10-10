'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compile } = require('../src/compiler');
const { assemble } = require('../scripts/dev');
const root = path.resolve(__dirname, '..');
const { emulatorPython } = require('../scripts/environment');
const python = emulatorPython();

test('cross-bank function calls restore execution after nested functions, graphics, saves and audio',
  { skip: !fs.existsSync(python) && 'Install the PyBoy test environment' }, () => {
    const directory = path.join(root, 'build/tests/code-banking');
    fs.mkdirSync(directory, { recursive: true });
    const cases = [];
    const heavy = '    x += 0\n'.repeat(500);
    const body = `header.target = "dual"
import includes.rooms as rooms
song = music_track([[440, 255, 8], [660, 255, 8]])
values = [0, 0, 0]
def leaf(x):
${heavy}    terrain = tile_terrain(rooms.room17, 1, 1)
    return x + terrain - 1
def middle(x):
${heavy}    written = save_write(1025, -1234)
    if written and save_read(1025) == -1234:
        return leaf(x) + 2
    return -100
def outer(x):
${heavy}    draw_world(rooms.room17)
    print("BANKED CALLS", 3, 1)
    set_camera(8, 8)
    play_music(song)
    play_sound("collect")
    value = middle(x) + 3
    if value > 0 and value < 100:
        return value
    return -200
first = outer(10)
nested = outer(outer(0))
values[0] = first
values[1] = nested
values[2] = save_read(1025)
refresh_screen()
`;
    const filename = path.join(root, 'examples/banked-world/main.pysn');
    for (const controller of ['mbc1', 'mbc3', 'mbc5']) for (const cgb of [false, true]) {
      const result = compile(`header.controller = "${controller}"\nheader.ram_kb = 32\nheader.battery = True\n` + body, filename);
      const functions = result.banking.objects.filter(object => object.kind === 'function');
      assert.equal(new Set(functions.map(fn => fn.bank)).size, 3);
      const name = `runtime-code-banks-${controller}-${cgb}`;
      const asm = path.join(directory, name + '.asm');
      fs.writeFileSync(asm, result.assembly);
      const rom = assemble(asm, name);
      cases.push({ name, rom, cgb, audio: true, frames: 160, symbols: path.join(root, 'build', name + '.sym'),
        symbolNames: Object.fromEntries(result.symbols.filter(symbol => symbol.scope === '$module').map(symbol => [symbol.name, symbol.label])),
        variables: { first: 16, nested: 12 }, arrays: { values: [16, 12, -1234] }, audio_varies: true,
        bytes: [{ symbol: 'wExecutionBank', values: [0, 0] }] });
    }
    // Relocate a small real function to high banks to exercise upper register bits
    // without generating megabytes of filler code. The planner boundaries are unit-tested.
    for (const [controller, bank, capacity] of [['mbc1', 33, 1024], ['mbc3', 65, 2048], ['mbc5', 257, 8192]]) for (const cgb of [false, true]) {
      const result = compile(`header.controller = "${controller}"\nheader.rom_kb = ${capacity}\nheader.target = "dual"\ndef f(x):\n    print("HIGH BANK", 1, 1)\n    return x * 3\nvalue = f(7)`);
      const fn = result.banking.objects.find(object => object.kind === 'function');
      const section = `SECTION "Function ${fn.label}", ROMX[$${fn.address.toString(16)}], BANK[${fn.bank}]`;
      const assembly = result.assembly.replace(section, `SECTION "Function ${fn.label}", ROMX[$4000], BANK[${bank}]`);
      assert.notEqual(assembly, result.assembly);
      const name = `runtime-code-high-${controller}-${cgb}`;
      const asm = path.join(directory, name + '.asm');
      fs.writeFileSync(asm, assembly);
      cases.push({ name, rom: assemble(asm, name), cgb, symbols: path.join(root, 'build', name + '.sym'),
        symbolNames: Object.fromEntries(result.symbols.filter(symbol => symbol.scope === '$module').map(symbol => [symbol.name, symbol.label])),
        variables: { value: 21 }, bytes: [{ symbol: 'wExecutionBank', values: [0, 0] }] });
    }
    const demoFile = path.join(root, 'examples/banked-functions/main.pysn');
    for (const cgb of [false, true]) {
      const result = compile(fs.readFileSync(demoFile, 'utf8'), demoFile);
      const name = `runtime-code-gallery-${cgb}`;
      const asm = path.join(directory, name + '.asm');
      fs.writeFileSync(asm, result.assembly);
      const brick = result.assets.find(asset => path.basename(asset.file || '') === 'brick.bmp').maps[0][0];
      const floor = result.assets.find(asset => path.basename(asset.file || '') === 'floor.bmp').maps[0][0];
      cases.push({ name, rom: assemble(asm, name), cgb, frames: 150, symbols: path.join(root, 'build', name + '.sym'),
        symbolNames: Object.fromEntries(result.symbols.filter(symbol => symbol.scope === '$module').map(symbol => [symbol.name, symbol.label])),
        variables: { selected: 0, redraw: 0 }, rows: [{ x: 5, y: 5, tiles: [brick] }], steps: [
          { press: ['a'], frames: 60, variables: { selected: 1, redraw: 0 }, rows: [{ x: 5, y: 5, tiles: [floor] }] },
          { release: ['a'], frames: 8 },
          { press: ['b'], frames: 60, variables: { selected: 0, redraw: 0 }, rows: [{ x: 5, y: 5, tiles: [brick] }] }
        ], screenshot: path.join(root, 'build', `banked-functions-${cgb ? 'cgb' : 'dmg'}.png`) });
    }
    const manifest = path.join(directory, 'cases.json');
    fs.writeFileSync(manifest, JSON.stringify(cases));
    const result = spawnSync(python, [path.join(__dirname, 'emulator.py'), manifest], { cwd: root, encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
    console.log(result.stdout.trim());
  });
