'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile, defaults } = require('../src/compiler');
const { planBanks } = require('../src/banking');
const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'examples/banked-world/main.pysn');
const source = fs.readFileSync(filename, 'utf8');

test('large source assets select MBC5 automatically with stable, contiguous placement', () => {
  const result = compile(source, filename);
  assert.equal(result.header.controller, 'mbc5');
  assert.equal(result.banking.romKB, 64);
  assert.ok(result.assets.some(asset => asset.bank === 2));
  for (const object of result.banking.objects) {
    assert.ok(object.address >= 0x4000 && object.address + object.bytes <= 0x7fff);
    assert.match(result.assembly, new RegExp(`BANK\\[${object.bank}\\]`));
  }
  assert.deepEqual(compile(source, filename).banking, result.banking);
  assert.equal(compile('print("small", 0, 0)').header.controller, 'rom_only');
});

test('explicit controllers and ROM capacity are respected', () => {
  assert.throws(() => compile('header.controller = "rom_only"\n' + source, filename), /bank capacity/);
  assert.throws(() => compile('header.rom_kb = 32\n' + source, filename), /too small/);
  for (const controller of ['mbc1', 'mbc3', 'mbc5']) {
    const result = compile(`header.controller = "${controller}"\nheader.rom_kb = 128\n` + source, filename);
    assert.equal(result.header.controller, controller);
    assert.equal(result.banking.romKB, 128);
  }
});

test('large bank plans avoid MBC1 inaccessible banks and support MBC5 ninth bit', () => {
  const graphics = count => ({ tileData: Array(1520).fill(0), assets: Array.from({ length: count }, (_, i) => ({ kind: 'sprite', label: `AssetMap${i}`, maps: [Array(10200).fill(95)] })) });
  const mbc1 = graphics(40);
  planBanks(mbc1, { ...defaults, controller: 'mbc1' }, true);
  assert.ok(mbc1.assets.some(asset => asset.bank === 33));
  assert.ok(mbc1.assets.every(asset => asset.bank % 32 !== 0));
  const mbc5 = graphics(257);
  const plan = planBanks(mbc5, { ...defaults, controller: 'mbc5' }, true);
  assert.equal(plan.highestBank, 257);
  assert.equal(plan.romKB, 8192);
  assert.throws(() => planBanks(graphics(128), { ...defaults, controller: 'mbc3' }, true), /bank capacity/);
  assert.throws(() => planBanks(mbc1, { ...defaults, controller: 'mbc1', ram_kb: 32 }, true), /at most 8 KB/);
  assert.throws(() => planBanks({ tileData: Array(16384).fill(0), assets: [] }, { ...defaults }), /split the asset/);
});
