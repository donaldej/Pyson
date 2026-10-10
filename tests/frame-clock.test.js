'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('../src/compiler');

test('frame timing is opt-in and allocates four bytes only when requested', () => {
  const normal = compile('value = 1\n');
  assert.match(normal.assembly, /FRAME_CLOCK_ENABLED EQU 0/);
  assert.doesNotMatch(normal.assembly, /wFrameCount: ds|call InitFrameClock|ROM0\[\$0040\]/);
  const clock = compile('start = frame_count()\nwait_frames(3)\nelapsed = elapsed_frames(start)\n');
  assert.match(clock.assembly, /FRAME_CLOCK_ENABLED EQU 1/);
  assert.match(clock.assembly, /wFrameCount: ds 2\nwFrameAudioCursor: ds 2/);
  assert.match(clock.assembly, /call InitFrameClock/);
  assert.match(clock.assembly, /ROM0\[\$0040\]/);
});

test('frame helpers validate arguments and procedure use', () => {
  for (const source of ['frame_count(1)', 'wait_frames()', 'elapsed_frames()', 'wait_frames(-1)', 'elapsed_frames(-1)', 'elapsed_frames("text")', 'wait_frames(32768)', 'x = wait_frames(1)']) {
    assert.throws(() => compile(source + '\n'));
  }
  assert.doesNotThrow(() => compile('wait_frames(0)\nt = frame_count()\ndelta = elapsed_frames(t)\n'));
});
