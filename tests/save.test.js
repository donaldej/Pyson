'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile } = require('../src/compiler');

test('save calls configure persistent cartridge hardware and unused games omit the runtime', () => {
  const quiet = compile('print("no save", 0, 0)');
  assert.equal(quiet.save.enabled, false);
  assert.equal(quiet.header.controller, 'rom_only');
  assert.doesNotMatch(quiet.assembly, /SaveRead:|SaveWrite:|InitSave:/);
  const result = compile('score = save_read(0, 0)\nok = save_write(0, score + 1)');
  assert.equal(result.header.controller, 'mbc5');
  assert.equal(result.header.ram_kb, 8);
  assert.equal(result.header.battery, true);
  assert.equal(result.save.capacity, 1024);
  assert.match(result.assembly, /call InitSave/);
  for (const controller of ['mbc1', 'mbc3', 'mbc5']) {
    const custom = compile(`header.controller = "${controller}"\nheader.ram_kb = 32\nsize = save_capacity()`);
    assert.equal(custom.header.controller, controller);
    assert.equal(custom.save.capacity, 4096);
  }
  const largest = compile('header.ram_kb = 128\nlast = save_read(16383)');
  assert.equal(largest.save.capacity, 16384);
  assert.equal(largest.save.ramBanks, 16);
});

test('save APIs validate slots, arguments, types and explicit cartridge choices', () => {
  for (const source of [
    'header.controller = "rom_only"\nsave_write(0, 1)',
    'header.ram_kb = 0\nsave_read(0)',
    'header.battery = False\nsave_read(0)',
    'header.controller = "mbc3"\nheader.ram_kb = 128\nsave_read(0)',
    'header.controller = "mbc1"\nheader.ram_kb = 32\nheader.rom_kb = 1024\nsave_read(0)',
    'header.rumble = True\nheader.ram_kb = 128\nsave_read(0)',
    'save_write(0)', 'save_write(0, 1, 2)', 'save_read()', 'save_read(0, 1, 2)',
    'save_read(-1)', 'save_write(1024, 5)', 'save_read(32768)',
    'save_exists()', 'save_exists(1, 2)', 'save_delete()', 'save_clear(1)', 'save_capacity(1)',
    'save_write(0, "text")', 'save_read("key")', 'save_read(0, "text")',
    'save_write(key=0, value=1)', 'x = save_clear()', 'def save_write(a, b):\n    return 0',
    'save_read = 2'
  ]) assert.throws(() => compile(source), undefined, source);
  assert.doesNotThrow(() => compile('slot = -1\nx = save_read(slot, -3)\nok = save_delete(slot)'));
  assert.doesNotThrow(() => compile('header.controller = "mbc3"\nheader.rtc = True\nx = save_read(0)'));
  assert.doesNotThrow(() => compile('header.controller = "mbc1"\nheader.rom_kb = 1024\nx = save_read(0)'));
});

test('module helpers share save slots and arrays can be serialized with loops', () => {
  const dir = path.join(__dirname, '..', 'build', 'tests', 'save-modules');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'progress.pysn'), 'def load_score():\n    return save_read(0, 0)\n\ndef store_score(value):\n    return save_write(0, value)\n');
  const result = compile('import progress\nvalues = [1, -2, 3]\nfor i in range(len(values)):\n    save_write(10 + i, values[i])\nscore = progress.load_score()\nok = progress.store_score(score + 1)', path.join(dir, 'main.pysn'));
  assert.equal(result.save.enabled, true);
  assert.equal((result.assembly.match(/^SaveWrite:/gm) || []).length, 1);
  assert.equal((result.assembly.match(/^SaveRead:/gm) || []).length, 1);
});
