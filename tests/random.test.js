'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('../src/compiler');
test('random queries and seed include their runtime only when used', () => {
  const asm = compile('random_seed(0)\na = randrange(6)\nb = randrange(-10, 10)\nc = randint(-32768, 32767)').assembly;
  assert.match(asm, /RandomNext:/);
  assert.match(asm, /wRandomState: ds 2/);
  assert.doesNotMatch(compile('x = 1').assembly, /RandomNext:|wRandomState:/);
});
test('random routines reject invalid signatures, types and empty literal ranges', () => {
  for (const source of ['random_seed()', 'random_seed(1, 2)', 'random_seed("x")', 'x = random_seed(1)', 'randrange()', 'randrange(1, 2, 3)', 'randrange(0)', 'randrange(-1)', 'randrange(2, 2)', 'randint(2, 1)', 'randint(1)', 'randint("x", 3)', 'randrange(end=6)']) assert.throws(() => compile(source), undefined, source);
  compile('randint(5, 5)');
});
