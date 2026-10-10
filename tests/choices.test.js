'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('../src/compiler');
test('choices compile literal menus and include state only when used', () => {
  const asm = compile('start_choices(["TALK", "LEAVE"], palette=1, selected_palette=2, default=1, cancel=False)\nupdate_dialogue()\nx = choices_result()\ny = choices_selected()\na = choices_active()\nf = choices_finished()\nc = choices_cancelled()').assembly;
  assert.match(asm, /StartChoices:/);
  assert.match(asm, /wChoicesTable: ds 2/);
  assert.doesNotMatch(compile('start_dialogue("Hi")').assembly, /wChoicesTable:/);
  compile('start_choices(["1234567890123456"])');
});
test('choices reject invalid labels, options and procedure assignments', () => {
  for (const source of ['start_choices([])', 'start_choices([" "])', 'start_choices([1])', 'start_choices(["12345678901234567"])', 'start_choices(["a", "b", "c", "d", "e"])', 'start_choices(["a"], palette=8)', 'start_choices(["a"], default=1)', 'start_choices(["a"], selected_palette=-1)', 'start_choices(["a"], unknown=0)', 'start_choices(["a"], 1, palette=2)', 'start_choices(["a"], palette=1, 2)', 'x = start_choices(["a"])', 'choices_result(1)']) assert.throws(() => compile(source), undefined, source);
});
