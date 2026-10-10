'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compile } = require('../src/compiler');
const { assemble } = require('../scripts/dev');
const { makeReport } = require('../src/build-report');
const { emulatorPython } = require('../scripts/environment');
const { convertBMP } = require('../src/assets');
const root = path.resolve(__dirname, '..');

test('frame clock, waits, elapsed movement and audio follow display time on DMG and CGB', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const dir = path.join(root, 'build/tests/frame-clock');
  fs.mkdirSync(dir, { recursive: true });
  const cases = [];
  function build(source, name, filename, extra) {
    const compiled = compile(source, filename);
    const asm = path.join(dir, name + '.asm');
    fs.writeFileSync(asm, compiled.assembly);
    const rom = assemble(asm, name);
    const symbols = path.join(root, 'build', name + '.sym');
    const report = makeReport(compiled, fs.readFileSync(symbols, 'utf8'), fs.statSync(rom).size);
    cases.push({ name, rom, symbols, variables: report.variables, ...extra });
    return compiled;
  }
  for (const cgb of [false, true]) for (const speed of ['normal', 'double']) {
    const header = `header.target = "dual"\nheader.cpu_speed = "${speed}"\n`;
    const source = header + `hero = sprite_sheet("assets/hero.bmp", 16, 16)
song = music_track([[440, 20, 8], [660, 20, 8]])
wave = music_track([[220, 20, 8], [330, 20, 8]], voice=1, instrument="triangle")
effect = sound_effect("pulse", [[100, 24, 5]])
anim = sprite_animation(hero, [[0, 4], [1, 4]])
previous = frame_count()
play_music(song)
play_music(wave)
play_sound(effect)
play_animation(0, anim)
position = 0
elapsed = 0
updates = 0
checksum = 0
while True:
    for work in range(300):
        checksum += 1
    delta = elapsed_frames(previous)
    previous = (previous + delta) & 32767
    elapsed += delta
    position = (position + delta) % 144
    update_animations(min(delta, 255))
    animated_sprite(0, position, 70)
    refresh_screen()
    updates += 1
`;
    build(source, `runtime-frame-work-${cgb}-${speed}`, path.join(root, 'examples/frame-test.pysn'), { cgb, speed, kind: 'work' });
    build(header + `start = frame_count()
wait_frames(6)
delta = elapsed_frames(start)
zero = 0
wait_frames(zero)
negative = -1
wait_frames(negative)
invalid = elapsed_frames(negative)
done = 1
`, `runtime-frame-wrap-${cgb}-${speed}`, '<source>', { cgb, speed, kind: 'wrap' });
  }
  const demo = path.join(root, 'examples/frame-timing/main.pysn');
  for (const cgb of [false, true]) {
    build(`header.target = "dual"
header.cpu_speed = "double"
song = music_track([[440, 60, 8]])
effect = sound_effect("pulse", [[100, 60, 5]])
def delayed(value):
    for work in range(700):
        pass
    return value
start = frame_count()
play_music(song, restart=delayed(True))
music_start = frame_count()
play_sound(effect, delayed(3))
done = 1
`, `runtime-frame-delayed-audio-${cgb}`, '<source>', { cgb, kind: 'arguments' });
  }
  for (const cgb of [false, true]) {
    build(fs.readFileSync(demo, 'utf8'), `runtime-frame-example-${cgb}`, demo, { cgb, kind: 'demo' });
    const withWindow = fs.readFileSync(demo, 'utf8').replace('previous = frame_count()', 'window_position(0, 120)\nprint_window("FRAME CLOCK", 0, 0)\nshow_window()\nrefresh_screen()\nprevious = frame_count()');
    build(withWindow, `runtime-frame-window-${cgb}`, demo, { cgb, kind: 'demo', window: true });
  }
  const manifest = path.join(dir, 'cases.json');
  fs.writeFileSync(manifest, JSON.stringify(cases));
  const run = spawnSync(emulatorPython(), [path.join(__dirname, 'frame-clock.py'), manifest], { encoding: 'utf8', timeout: 120000 });
  assert.equal(run.status, 0, run.error?.message || run.stdout + run.stderr);
  console.log(run.stdout.trim());

  // Exercise the clock with the existing complete graphics regression, using
  // an isolated ROM. The released Void Engine source and binary stay untouched.
  const input = path.join(root, 'examples/void-engine/main.pysn');
  const source = fs.readFileSync(input, 'utf8').replace('SECTION_TICKS =', 'clock_started = frame_count()\nSECTION_TICKS =');
  const compiled = build(source, 'runtime-frame-void', input, {});
  const config = cases.at(-1);
  config.output = dir;
  config.worlds = compiled.assets.filter(a => a.kind === 'world').map(a => ({ width: a.columns, ids: a.maps[0], slots: a.streaming.slots, tiles: convertBMP(fs.readFileSync(a.file), 'world').tiles }));
  const full = path.join(dir, 'void.json');
  fs.writeFileSync(full, JSON.stringify(config));
  const show = spawnSync(emulatorPython(), [path.join(__dirname, 'void-engine.py'), full], { encoding: 'utf8', timeout: 120000 });
  assert.equal(show.status, 0, show.error?.message || show.stdout + show.stderr);
  console.log(show.stdout.trim());
});
