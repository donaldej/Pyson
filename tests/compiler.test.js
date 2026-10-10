'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile, defaults, validateHeader } = require('../src/compiler');
const { assemble } = require('../scripts/dev');
const font = require('../src/font');
const root = path.resolve(__dirname, '..');

test('font covers printable ASCII and preserves lowercase text', () => {
  for (let code = 32; code <= 126; code++) assert.ok(font.ids.has(String.fromCharCode(code)));
  assert.equal(font.bytes.length, 95 * 16);
  assert.equal(font.ids.get(' '), 0);
  assert.notEqual(font.ids.get('A'), font.ids.get('a'));
  const result = compile('print("Aa", 0, 0)');
  assert.deepEqual(result.ast[0].expression.args[0], { type: 'string', value: 'Aa', line: 1 });
});

test('Jison parses comments, strings, booleans and final lines without a newline', () => {
  const result = compile('# comment\r\nheader.title = \'TEST\'\r\nheader.battery = False\nprint("Hello\\nWorld!", 0, 0)');
  assert.equal(result.header.title, 'TEST');
  assert.equal(result.ast[2].expression.args[0].value, 'Hello\nWorld!');
});

test('parser retains text and coordinates for runtime clipping and overwriting', () => {
  const result = compile('print("ABCD\\nEF", 18, 17)\nprint("Z", 19, 17)');
  assert.deepEqual(result.ast.map(node => node.expression.args.map(arg => arg.value)), [['ABCD\nEF', 18, 17], ['Z', 19, 17]]);
});

test('rejects invalid source instead of silently generating a broken ROM', () => {
  for (const source of [
    'print("HI", 20, 0)', 'print("HI", 0, 18)', 'print("HI", -1, 0)',
    'print("HI", 1.5, 0)', 'print("HI", 0, 0) print("HI", 1, 1)',
    'print("雪", 0, 0)', 'print("HI", 0, 0)\nheader.title = "LATE"',
    'header.unknown = 1', 'header.title = "A"\nheader.title = "B"',
    'header.version = True', 'header.battery = 1', 'header.title = "THIS TITLE IS TOO LONG"',
    'print("bad\\q", 0, 0)', 'print("unclosed, 0, 0)'
  ]) assert.throws(() => compile(source), undefined, source);
});

test('header maps cartridge features to the correct bytes', () => {
  const bytes = validateHeader({ ...defaults, title: 'TEST', target: 'dual',
    manufacturer: 'ABCD', controller: 'mbc3', ram_kb: 32, battery: true,
    rtc: true, sgb: true, version: 7, licensee: 'XY', destination: 'japan' });
  assert.equal(bytes.length, 28);
  assert.equal(Buffer.from(bytes.slice(11, 15)).toString(), 'ABCD');
  assert.deepEqual(bytes.slice(15), [0x80, 88, 89, 3, 0x10, 0, 3, 0, 0x33, 7, 0, 0, 0]);
  assert.equal(validateHeader({ ...defaults, controller: 'mbc5', ram_kb: 64, battery: true, rumble: true })[19], 0x1e);
  assert.equal(validateHeader({ ...defaults, controller: 'mbc1', ram_kb: 8 })[19], 2);
  assert.equal(validateHeader({ ...defaults, controller: 'mbc3', battery: true, rtc: true })[19], 0x0f);
});

test('header rejects incompatible hardware combinations', () => {
  for (const patch of [
    { controller: 'rom_only', ram_kb: 8 }, { rtc: true }, { battery: true },
    { controller: 'mbc1', ram_kb: 128 }, { controller: 'mbc3', rumble: true },
    { controller: 'mbc5', rumble: true, ram_kb: 128 }, { target: 'cgb', sgb: true },
    { manufacturer: 'ABCD' }, { licensee: 'TOO LONG' }, { ram_kb: 2 },
    { rom_kb: 64 }, { version: 256 }, { target: 'unknown' }
  ]) assert.throws(() => validateHeader({ ...defaults, ...patch }), undefined, JSON.stringify(patch));
});

function verifyRom(name, source, expected) {
  const { assembly } = compile(source);
  const directory = path.join(root, 'build', 'tests');
  fs.mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, `${name}.asm`);
  fs.writeFileSync(filename, assembly);
  const rom = fs.readFileSync(assemble(filename, name));
  assert.equal(rom.length, expected.size);
  assert.equal(rom[0x143], expected.color);
  assert.equal(rom[0x147], expected.cartridge);
  assert.equal(rom[0x148], Math.log2(expected.size / 32768));
  assert.equal(rom[0x149], expected.ram);
  assert.equal(rom[0x104], 0xce);
  let checksum = 0;
  for (let i = 0x134; i <= 0x14c; i++) checksum = (checksum - rom[i] - 1) & 255;
  assert.equal(rom[0x14d], checksum);
  let global = 0;
  for (let i = 0; i < rom.length; i++) if (i !== 0x14e && i !== 0x14f) global = (global + rom[i]) & 65535;
  assert.equal(rom.readUInt16BE(0x14e), global);
  return rom;
}

test('builds DMG, dual and Color-only ROMs with valid headers and capacity', () => {
  const example = fs.readFileSync(path.join(root, 'examples/header-print.pysn'), 'utf8');
  const dmg = verifyRom('test-dmg', example, { size: 32768, color: 0, cartridge: 0, ram: 0 });
  assert.equal(dmg[0x14c], 1);
  assert.equal(dmg.subarray(0x134, 0x140).toString('ascii'), 'HEADER PRINT');
  verifyRom('test-dual', 'header.target = "dual"\nprint("Dual", 0, 0)', { size: 32768, color: 0x80, cartridge: 0, ram: 0 });
  verifyRom('test-cgb', 'header.target = "cgb"\nheader.controller = "mbc5"\nheader.ram_kb = 32\nheader.battery = True\nheader.rom_kb = 64\nprint("Color", 19, 17)', { size: 65536, color: 0xc0, cartridge: 0x1b, ram: 3 });
});
