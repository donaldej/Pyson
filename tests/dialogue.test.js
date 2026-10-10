'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('../src/compiler');

test('dialogue accepts strings and options and includes its runtime only when used', () => {
  const result = compile(`text = "Hello, world!"
start_dialogue(text, speed=2, palette=3)
update_dialogue()
active = dialogue_active()
waiting = dialogue_waiting()
finished = dialogue_finished()
close_dialogue()`);
  assert.match(result.assembly, /StartDialogue:/);
  assert.match(result.assembly, /wDialoguePointer: ds 2/);
  assert.match(result.assembly, /DEF WINDOW_ENABLED EQU 1/);
  assert.doesNotMatch(compile('print("hi", 0, 0)').assembly, /StartDialogue:|wDialoguePointer:/);
  compile('start_dialogue("Hi", palette=2)');
  compile('start_dialogue("Hi", 0, 7)');
  compile('speed = 4\nstart_dialogue("Hi", speed=speed)');
});

test('invalid dialogue calls and procedure results are rejected', () => {
  for (const [source, error] of [
    ['start_dialogue()', /expects/], ['start_dialogue(1)', /string/],
    ['start_dialogue(message="Hi")', /unknown/], ['start_dialogue("Hi", speed=-1)', /speed/],
    ['start_dialogue("Hi", speed=256)', /speed/], ['start_dialogue("Hi", palette=8)', /palette/],
    ['start_dialogue("Hi", speed="slow")', /integer/], ['start_dialogue("Hi", unknown=1)', /unknown/],
    ['start_dialogue("Hi", 1, speed=2)', /duplicate/], ['start_dialogue("Hi", speed=2, 1)', /precede/],
    ['start_dialogue("Hi", 1, 1, 1)', /expects/], ['update_dialogue(1)', /no arguments/],
    ['close_dialogue(1)', /no arguments/], ['dialogue_waiting(1)', /no arguments/],
    ['dialogue_finished(1)', /no arguments/], ['dialogue_active(1)', /no arguments/],
    ['x = start_dialogue("Hi")', /procedure/], ['x = update_dialogue()', /procedure/],
    ['if True:\n    text = "Hi"\nstart_dialogue(text)', /before assignment/]
  ]) assert.throws(() => compile(source), error, source);
});
