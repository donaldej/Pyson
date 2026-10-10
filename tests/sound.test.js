'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile } = require('../src/compiler');

test('only statically referenced sounds and the required runtime are included', () => {
  const silent = compile('print("quiet", 0, 0)');
  assert.equal(silent.soundEnabled, false);
  assert.deepEqual(silent.sounds, []);
  assert.doesNotMatch(silent.assembly, /InitSound:|wSoundActive:|Sound_collect:/);
  const used = compile('play_sound("collect")\nplay_sound("collect")\nplay_sound("damage")');
  assert.deepEqual(used.sounds.map(effect => effect.name), ['collect', 'damage']);
  assert.equal((used.assembly.match(/Sound_collect:/g) || []).length, 1);
  assert.doesNotMatch(used.assembly, /Sound_win:|Sound_lose:|Sound_menu_move:/);
  assert.match(used.assembly, /InitSound:/);
  const custom = compile('unused = sound_effect("pulse", [[440, 8, 12]])');
  assert.equal(custom.soundEnabled, false);
  assert.deepEqual(custom.sounds, []);
  assert.doesNotMatch(custom.assembly, /SoundCustom0:|wSoundActive:/);
});

test('custom sounds encode pulse periods, rests, noise, priorities and duty', () => {
  const pulse = compile('tone = sound_effect("pulse", [[440, 120, 10], [0, 2, 15]], 2, 1)\nplay_sound(tone, 6)');
  assert.deepEqual(pulse.sounds[0].bytes, [0, 2, 64, 2, 120, 160, 214, 6, 2, 0, 0, 0]);
  assert.equal(pulse.symbols.find(s => s.name === 'tone').type, 'sound');
  const noise = compile('hit = sound_effect("noise", [[52, 8, 12]], 4)\nplay_sound(hit)');
  assert.deepEqual(noise.sounds[0].bytes, [1, 4, 0, 1, 8, 192, 52, 0]);
});

test('sound APIs reject unsupported dynamic names, types, parameters and mutable bindings', () => {
  const bad = [
    'play_sound("missing")', 'play_sound()', 'play_sound(1)', 'name = "collect"\nplay_sound(name)',
    'play_sound("collect", 8)', 'play_sound("collect", -1)', 'play_sound("collect", "loud")',
    'play_sound("collect", 1, 2)', 'stop_sound(1)', 'sound_playing(1)', 'mute_sound(1, 2)',
    'set_sound_volume(1)', 'set_sound_volume(8, 0)', 'set_sound_volume(0, -1)', 'set_sound_volume("loud", 1)',
    'x = sound_effect("wave", [[440, 2, 10]])', 'x = sound_effect("pulse", [])',
    'x = sound_effect("pulse", [[63, 2, 10]])', 'x = sound_effect("pulse", [[20001, 2, 10]])',
    'x = sound_effect("noise", [[224, 2, 10]])', 'x = sound_effect("pulse", [[440, 0, 10]])',
    'x = sound_effect("pulse", [[440, 256, 10]])', 'x = sound_effect("pulse", [[440, 2, 16]])',
    'x = sound_effect("pulse", [[440, 2]])', 'x = sound_effect("pulse", [[440, 2, 10]], 8)',
    'x = sound_effect("pulse", [[440, 2, 10]], 1, 4)', 'x = sound_effect("noise", [[52, 2, 10]], 1, 1)',
    'x = sound_effect("pulse", [[440, 2, 10]], importance=1)',
    'def f():\n    x = sound_effect("pulse", [[440, 2, 10]])',
    'x = sound_effect("pulse", [[440, 2, 10]])\ny = x',
    'x = sound_effect("pulse", [[440, 2, 10]])\nx = 1',
    'x = sound_effect("pulse", [[440, 2, 10]])\nprint(x, 0, 0)',
    'x = sound_effect("pulse", [[440, 2, 10]])\ndef f(x):\n    play_sound(x)\nf(1)',
    'play_sound(tone)\ntone = sound_effect("pulse", [[440, 2, 10]])'
  ];
  for (const source of bad) assert.throws(() => compile(source), /sound|pulse|noise|step|priority|volume|expects|integer|keyword|assignment|change/i, source);
});

test('modules share custom sound definitions and initialization checks', () => {
  const directory = path.resolve(__dirname, '../build/tests/sound-modules');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'effects.pysn'), 'beep = sound_effect("pulse", [[660, 4, 10]])\ndef fire():\n    play_sound(beep)');
  const result = compile('import effects as effects\neffects.fire()\nplay_sound(effects.beep)', path.join(directory, 'main.pysn'));
  assert.equal(result.sounds.length, 1);
  assert.equal(result.sounds[0].name, 'effects.beep');
  assert.match(result.assembly, /SoundCustom0:/);
});
