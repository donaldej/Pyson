'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compile } = require('../src/compiler');
const { assemble } = require('../scripts/dev');
const root = path.resolve(__dirname, '..');
const { emulatorPython } = require('../scripts/environment');
const python = emulatorPython();
test('music timing, pause/resume, completion, concurrent effects and mute execute on DMG and CGB',
  { skip: !fs.existsSync(python) && 'Install the PyBoy test environment' }, () => {
    const directory = path.join(root, 'build/tests/music');
    fs.mkdirSync(directory, { recursive: true });
    const cases = [];
    function build(name, source, expected, filename = '<source>') {
      const result = compile(source, filename);
      const asm = path.join(directory, name + '.asm');
      fs.writeFileSync(asm, result.assembly);
      const rom = assemble(asm, name);
      cases.push({ name, rom, symbols: path.join(root, 'build', name + '.sym'),
        symbolNames: Object.fromEntries(result.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label])), ...expected });
    }
    const timing = `header.target = "dual"
song = music_track([[440, 3, 10], [660, 5, 8]])
play_music(song)
for i in range(2):
    wait_vblank()
pause_music()
paused = music_playing()
for i in range(6):
    wait_vblank()
play_music(song)
still_paused = music_playing()
resume_music()
resumed = music_playing()
wait_vblank()
pause_music()
`;
    const completion = `header.target = "dual"
song = music_track([[440, 3, 10], [0, 2, 15], [660, 4, 8]], loop=False)
play_music(song)
for i in range(8):
    wait_vblank()
before = music_playing()
wait_vblank()
after = music_playing()
resume_music()
still_stopped = music_playing()
`;
    for (const cgb of [false, true]) {
      build(`runtime-music-timing-${cgb}`, timing, { cgb, audio: true,
        variables: { paused: 0, still_paused: 0, resumed: 1 },
        bytes: [{ symbol: 'wMusicFrames', values: [5, 1, 1] }, { symbol: 'wMusicSteps', values: [1] }],
        registers: [{ address: 0xff26, mask: 1, value: 0 }] });
      build(`runtime-music-completion-${cgb}`, completion, { cgb, audio: true,
        variables: { before: 1, after: 0, still_stopped: 0 }, registers: [{ address: 0xff26, mask: 1, value: 0 }] });
      build(`runtime-music-loop-${cgb}`, `header.target = "dual"
song = music_track([[440, 3, 10], [660, 5, 8]])
play_music(song)
for i in range(8):
    wait_vblank()
pause_music()
`, { cgb, audio: true, bytes: [{ symbol: 'wMusicFrames', values: [3, 1, 1] }, { symbol: 'wMusicSteps', values: [2] }] });
      build(`runtime-music-restart-${cgb}`, `header.target = "dual"
song = music_track([[440, 3, 10], [660, 5, 8]])
play_music(song)
for i in range(4):
    wait_vblank()
pause_music()
play_music(song, restart=True)
active = music_playing()
pause_music()
`, { cgb, audio: true, variables: { active: 1 }, bytes: [{ symbol: 'wMusicFrames', values: [3, 1, 1] }, { symbol: 'wMusicSteps', values: [2] }] });
      build(`runtime-music-rest-${cgb}`, `header.target = "dual"
song = music_track([[440, 3, 10], [0, 5, 15]])
play_music(song)
for i in range(3):
    wait_vblank()
active = music_playing()
while True:
    read_buttons()
`, { cgb, audio: true, variables: { active: 1 }, bytes: [{ symbol: 'wMusicFrames', values: [5, 1, 0] }],
        registers: [{ address: 0xff26, mask: 1, value: 0 }] });
      build(`runtime-music-concurrent-${cgb}`, `header.target = "dual"
song = music_track([[440, 255, 8], [660, 255, 8]])
effect = sound_effect("pulse", [[880, 255, 10]])
play_music(song)
play_sound(effect)
while True:
    wait_vblank()
    if button_pressed("a"):
        pause_music()
    if button_pressed("b"):
        resume_music()
    if button_pressed("up"):
        stop_sound()
    if button_pressed("down"):
        stop_music()
    if button_pressed("left"):
        mute_sound()
    if button_pressed("right"):
        mute_sound(False)
        play_music(song, restart=True)
    if button_pressed("start"):
        play_sound("damage")
    active = music_playing()
    effect_active = sound_playing()
    refresh_screen()
`, { cgb, audio: true, frames: 100, variables: { active: 1, effect_active: 1 }, audio_varies: true,
        registers: [{ address: 0xff26, mask: 3, value: 3 }], steps: [
          { press: ['a'], frames: 8, variables: { active: 0, effect_active: 1 }, registers: [{ address: 0xff26, mask: 3, value: 2 }] },
          { release: ['a'], frames: 8 },
          { press: ['b'], frames: 8, variables: { active: 1 }, registers: [{ address: 0xff26, mask: 3, value: 3 }] },
          { release: ['b'], frames: 8 },
          { press: ['up'], frames: 8, variables: { active: 1, effect_active: 0 }, registers: [{ address: 0xff26, mask: 3, value: 1 }] },
          { release: ['up'], frames: 8 },
          { press: ['start'], frames: 8, variables: { active: 1, effect_active: 1 }, registers: [{ address: 0xff26, mask: 9, value: 9 }] },
          { release: ['start'], frames: 24, variables: { active: 1, effect_active: 0 } },
          { press: ['left'], frames: 8, variables: { active: 0, effect_active: 0 }, registers: [{ address: 0xff25, value: 0 }] },
          { release: ['left'], frames: 8 },
          { press: ['right'], frames: 8, variables: { active: 1 }, registers: [{ address: 0xff25, value: 187 }] },
          { release: ['right'], frames: 8 },
          { press: ['down'], frames: 8, variables: { active: 0 }, registers: [{ address: 0xff26, mask: 1, value: 0 }] }
        ] });
      const file = path.join(root, 'examples/music-gallery/main.pysn');
      build(`runtime-music-gallery-${cgb}`, fs.readFileSync(file, 'utf8'), { cgb, audio: true,
        variables: { playing: 1 }, audio_varies: true, steps: [
          { press: ['start'], frames: 12, variables: { playing: 0, paused: 1 } }, { release: ['start'], frames: 12 },
          { press: ['start'], frames: 12, variables: { playing: 1, paused: 0 } }, { release: ['start'], frames: 12 },
          { press: ['b'], frames: 160, variables: { playing: 0 } }, { release: ['b'], frames: 12 },
          { press: ['a'], frames: 12, variables: { playing: 1 } }
        ], screenshot: path.join(root, 'build', `music-gallery-${cgb ? 'cgb' : 'dmg'}.png`) }, file);
      const starFile = path.join(root, 'examples/star-chase/main.pysn');
      build(`runtime-music-star-chase-${cgb}`, fs.readFileSync(starFile, 'utf8'), {
        cgb, audio: true, variables: { 'includes.state.screen': 0, 'includes.music.last_screen': 0 },
        audio_varies: true, registers: [{ address: 0xff26, mask: 1, value: 1 }], steps: [
          { press: ['a'], frames: 16, variables: { 'includes.state.screen': 1, 'includes.music.last_screen': 1 }, audio_varies: true },
          { release: ['a'], frames: 12 },
          { set: { 'includes.state.screen': 3, 'includes.state.redraw': 1 }, frames: 180,
            variables: { 'includes.music.last_screen': 3 }, bytes: [{ symbol: 'wMusicActive', values: [0] }] },
          { set: { 'includes.state.screen': 2, 'includes.state.redraw': 1 }, frames: 180,
            variables: { 'includes.music.last_screen': 2 }, bytes: [{ symbol: 'wMusicActive', values: [0] }] },
          { set: { 'includes.state.screen': 0, 'includes.state.redraw': 1 }, frames: 16,
            variables: { 'includes.music.last_screen': 0 }, bytes: [{ symbol: 'wMusicActive', values: [1] }], audio_varies: true }
        ]
      }, starFile);
    }
    const manifest = path.join(directory, 'cases.json');
    fs.writeFileSync(manifest, JSON.stringify(cases));
    const result = spawnSync(python, [path.join(__dirname, 'emulator.py'), manifest], { cwd: root, encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
    console.log(result.stdout.trim());
  });
