'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile } = require('../src/compiler');
const sheet = 'hero = sprite_sheet("examples/assets/hero.bmp", 16, 16)\n';

test('animation definitions encode frame timing and looping with conditional runtime and data', () => {
  const quiet = compile('animation = 0\nprint(animation, 0, 0)');
  assert.equal(quiet.animationEnabled, false);
  assert.doesNotMatch(quiet.assembly, /wAnimationStates:|PlayAnimation:/);
  const unused = compile(sheet + 'idle = sprite_animation(hero, [[0, 1]])');
  assert.deepEqual(unused.animations, []);
  assert.equal(unused.animationEnabled, false);
  const result = compile(sheet + 'walk = sprite_animation(hero, [[0, 3], [1, 5]])\nonce = sprite_animation(hero, [[1, 2], [0, 255]], loop=False)\nplay_animation(0, walk)\nplay_animation(4, walk)\nplay_animation(8, once, restart=True)\nupdate_animations()\nanimated_sprite(0, 40, 50)');
  assert.equal(result.animationEnabled, true);
  assert.deepEqual(result.animations.map(a => a.bytes), [[0, 2, 1, 0, 3, 1, 5], [0, 2, 0, 1, 2, 0, 255]]);
  assert.equal((result.assembly.match(/AnimationData0:/g) || []).length, 1);
  assert.match(result.assembly, /wAnimationStates: ds 40 \* 6/);
  assert.match(result.assembly, /DEF BG_BUFFER_ROWS EQU 18/);
  assert.match(compile(sheet + 'idle = sprite_animation(hero, [[0, 1]])\nplay_animation(0, idle)\nworld_animated_sprite(0, 100, 90)').assembly, /DEF BG_BUFFER_ROWS EQU 32/);
});

test('animation APIs validate definitions, frames, durations, slots, options and immutable types', () => {
  for (const source of [
    'idle = sprite_animation(hero, [])', 'idle = sprite_animation(hero, [[0]])',
    'idle = sprite_animation(hero, [[2, 3]])', 'idle = sprite_animation(hero, [[-1, 3]])',
    'idle = sprite_animation(hero, [[0, 0]])', 'idle = sprite_animation(hero, [[0, 256]])',
    'n = 1\nidle = sprite_animation(hero, [[n, 3]])', 'idle = sprite_animation(hero, [[0, 2]], loop=1)',
    'idle = sprite_animation(hero, [[0, 2]], repeat=True)', 'idle = sprite_animation(0, [[0, 2]])',
    'bg = tilemap("examples/assets/garden.bmp")\nidle = sprite_animation(bg, [[0, 2]])',
    'def build():\n    idle = sprite_animation(hero, [[0, 2]])',
    'idle = sprite_animation(hero, [[0, 2]])\nother = idle',
    'idle = sprite_animation(hero, [[0, 2]])\nidle = 1',
    'idle = sprite_animation(hero, [[0, 2]])\nidle = sprite_animation(hero, [[1, 2]])',
    'play_animation(0, 1)', 'play_animation(0)',
    'idle = sprite_animation(hero, [[0, 2]])\nplay_animation(40, idle)',
    'idle = sprite_animation(hero, [[0, 2]])\nplay_animation(0, idle, loop=True)',
    'restart_animation()', 'stop_animation(-1)', 'animation_frame(40)', 'animation_playing("x")',
    'animation_finished(0, 1)', 'update_animations(256)', 'update_animations(-1)',
    'animated_sprite(0, 1)', 'animated_sprite(0, "x", 2)', 'world_animated_sprite(40, 1, 2)',
    'x = update_animations()', 'idle = sprite_animation(hero, [[0, 2]])\nprint(idle, 0, 0)',
    'idle = sprite_animation(hero, [[0, 2]])\ndef consume(value):\n    return value\nx = consume(idle)',
    'idle = sprite_animation(hero, [[0, 2]])\ndef go():\n    idle = 2\n    play_animation(0, idle)\ngo()'
  ]) assert.throws(() => compile(sheet + source), undefined, source);
  assert.throws(() => compile(sheet + `idle = sprite_animation(hero, [${Array(65).fill('[0, 1]').join(',')}])`), /1\.\.64/);
  assert.doesNotThrow(() => compile(sheet + 'idle = sprite_animation(hero, [[0, 2]])\nslot = -1\nplay_animation(slot, idle)\nupdate_animations(0)'));
});

test('module animations share definition data while their playback slots remain independent', () => {
  const directory = path.join(__dirname, '..', 'build', 'tests', 'animation-module');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'poses.pysn'), 'hero = sprite_sheet("../../../examples/assets/hero.bmp", 16, 16)\nwalk = sprite_animation(hero, [[0, 3], [1, 5]])\ndef start(slot):\n    play_animation(slot, walk)\n');
  const result = compile('import poses\nposes.start(0)\nplay_animation(4, poses.walk)\nupdate_animations()', path.join(directory, 'main.pysn'));
  assert.equal(result.animations.length, 1);
  assert.equal(result.animations[0].name, 'poses.walk');
  assert.equal((result.assembly.match(/AnimationData0:/g) || []).length, 1);
});
