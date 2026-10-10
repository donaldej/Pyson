'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile, defaults } = require('../src/compiler');
const { planBanks } = require('../src/banking');
const { instructionBytes } = require('../src/code-banking');
const heavy = count => '    x += 0\n'.repeat(count);

test('functions share asset banks and automatically select capacity and controller', () => {
  const source = `def first(x):\n${heavy(500)}    return x + 1\ndef second(x):\n${heavy(500)}    return first(x) + 2\nresult = second(10)`;
  const result = compile(source);
  assert.equal(result.header.controller, 'mbc5');
  assert.equal(result.banking.romKB, 64);
  const functions = result.banking.objects.filter(object => object.kind === 'function');
  assert.equal(functions.length, 2);
  assert.notEqual(functions[0].bank, functions[1].bank);
  for (const fn of functions) {
    assert.ok(fn.bytes > 10000 && fn.bytes <= 16383);
    assert.ok(fn.address + fn.bytes <= 0x7fff);
    assert.match(result.assembly, new RegExp(`ASSERT @ - ${fn.label} == ${fn.bytes}`));
  }
  assert.match(result.assembly, /call CallBankedFunction/);
  assert.deepEqual(result.banking, compile(source).banking);
  assert.throws(() => compile('header.controller = "rom_only"\n' + source), /bank capacity/);
  assert.throws(() => compile('header.rom_kb = 32\n' + source), /too small/);
  assert.throws(() => compile(`def enormous(x):\n${heavy(800)}    return x`), /Function "enormous" exceeds one 16 KB ROM bank/);
  const quiet = compile('print("Hello", 0, 0)');
  assert.doesNotMatch(quiet.assembly, /wExecutionBank:/);
  assert.match(quiet.assembly, /DEF CODE_BANKING_ENABLED EQU 0/);
  assert.equal(compile('def f():\n    return 1\nx = f()').header.controller, 'rom_only');
});

test('code sizing covers emitted instruction forms and controller bank boundaries', () => {
  for (const [line, expected] of [['ld hl, 123', 3], ['ld a, [wValue]', 3], ['ld [wValue], a', 3],
    ['ld h, [hl]', 1], ['ld [de], a', 1], ['ld [hl], 7', 2], ['ld a, l', 1],
    ['cp 8', 2], ['sub l', 1], ['add hl, de', 1], ['jp nz, done', 3], ['ret', 1]]) {
    assert.equal(instructionBytes(line), expected, line);
  }
  assert.throws(() => instructionBytes('unrecognized a'), /Unknown emitted instruction/);
  const functions = count => Array.from({ length: count }, (_, index) => ({ label: `Function${index}`, name: `f${index}`, kind: 'function', bytes: 16000 }));
  const mbc1 = planBanks({ tileData: Array(1520).fill(0), assets: [] }, { ...defaults, controller: 'mbc1' }, true, functions(34));
  assert.ok(mbc1.objects.some(object => object.kind === 'function' && object.bank === 33));
  assert.ok(mbc1.objects.every(object => object.bank % 32 !== 0));
  const mbc5 = planBanks({ tileData: Array(1520).fill(0), assets: [] }, { ...defaults, controller: 'mbc5' }, true, functions(257));
  assert.ok(mbc5.objects.some(object => object.kind === 'function' && object.bank === 257));
  assert.equal(mbc5.romKB, 8192);
});
