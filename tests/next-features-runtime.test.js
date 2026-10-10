'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compile } = require('../src/compiler');
const { assemble } = require('../scripts/dev');
const { emulatorPython } = require('../scripts/environment');
const font = require('../src/font');
const { makeReport } = require('../src/build-report');
const root = path.resolve(__dirname, '..');
test('six-feature additions execute on DMG and Color', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const dir = path.join(root, 'build/tests/next-features'); fs.mkdirSync(dir, { recursive: true });
  const source = `header.target = "dual"
wall = tile("assets/brick.bmp", solid=True, terrain=7)
floor = tile("assets/floor.bmp", terrain=2)
board = mutable_map([[wall, floor]])
before = tile_is_solid(board, 0, 0)
changed = set_map_tile(board, 0, 0, floor)
after = tile_is_solid(board, 0, 0)
terrain = tile_terrain(board, 0, 0)
outside = set_map_tile(board, 2, 0, wall)
draw_map(board, 0, 0)
refresh_screen()
reset = reset_map(board)
restored = tile_is_solid(board, 0, 0)
SIZE = constant(8)
def combine(a, b=SIZE):
    return a * 10 + b
counter = 0
def value():
    global counter
    counter += 1
    return counter
keyword = combine(b=value(), a=value())
defaulted = combine(3)
math_value = clamp(max(abs(-4), min(5, 6)), 0, SIZE)
item = record(x=1)
def change(target, amount=2):
    target.x += amount
change(amount=4, target=item)
record_value = item.x
blocked = move_x(board, 8, 0, 8, 8, -16)
free = move_x(board, 8, 0, 8, 8, 16)
track = collision_map(["..#.."])
fast = move_x(track, 0, 0, 8, 8, 32)
back = move_x(track, 8, 0, 8, 8, -32)
vertical = collision_map([".", ".", "#", "."])
fast_y = move_y(vertical, 0, 0, 8, 8, 24)
portrait = sprite_sheet("../assets/hero.bmp", 16, 16)
start_dialogue(format_text("VALUE {} / {}", -32768, math_value), speed=0)
dialogue_speaker("TEST")
dialogue_portrait(portrait, 0, 1)
overwritten = format_text("CHANGED {}", 99)
update_dialogue()
refresh_screen()`;
  const result = compile(source, path.join(root, 'examples/scrolling-world/main.pysn'));
  const name = 'runtime-next-features'; const asm = path.join(dir, name + '.asm'); fs.writeFileSync(asm, result.assembly);
  const rom = assemble(asm, name);
  const report = makeReport(result, fs.readFileSync(path.join(root, 'build', name + '.sym'), 'utf8'), fs.statSync(rom).size);
  assert.equal(report.mutableMapBytes, 6);
  assert.equal(report.constants.SIZE, 8);
  assert.ok(report.sources.length && report.sources.every(site => Number.isInteger(site.address) && Number.isInteger(site.bank)));
  const row = (text, x, y, width) => ({ x, y, tiles: [...text.padEnd(width)].map(c => font.ids.get(c)) });
  const cases = [false, true].map(cgb => ({ name: name + cgb, rom, cgb, frames: 120, symbols: path.join(root, 'build', name + '.sym'), symbolNames: Object.fromEntries(result.symbols.map(s => [s.name, s.label])), variables: { before: 1, changed: 1, after: 0, terrain: 2, outside: 0, reset: 1, restored: 1, keyword: 21, defaulted: 38, counter: 2, math_value: 5, record_value: 5, blocked: 8, free: 8, fast: 8, back: 0, fast_y: 8 }, rows: [{ x: 0, y: 0, tiles: [result.assets[1].maps[0][0], result.assets[1].maps[0][0]] }], window_rows: [row('TEST', 2, 0, 4), row('VALUE -32768 /', 4, 1, 15), row('5', 4, 2, 15)] }));
  const audioResult = compile(`header.target = "dual"
lead = music_track([[440, 254, 8]])
bass = music_track([[220, 254, 8]], voice=1, instrument="triangle")
play_music(lead)
play_music(bass)
phase = 0
while True:
    wait_vblank()
    if phase == 1:
        pause_music()
        phase = 0
    elif phase == 2:
        resume_music()
        phase = 0
    elif phase == 3:
        play_sound("menu_confirm")
        phase = 0
    elif phase == 4:
        mute_sound()
        phase = 0
    playing = music_playing()
    refresh_screen()`);
  const audioName = 'runtime-two-voice'; const audioAsm = path.join(dir, audioName + '.asm'); fs.writeFileSync(audioAsm, audioResult.assembly);
  const audioRom = assemble(audioAsm, audioName);
  for (const cgb of [false, true]) cases.push({ name: audioName + cgb, rom: audioRom, cgb, frames: 100, audio: true, audio_varies: true, symbols: path.join(root, 'build', audioName + '.sym'), symbolNames: Object.fromEntries(audioResult.symbols.map(s => [s.name, s.label])), variables: { playing: 1 }, bytes: [{ symbol: 'wMusicActive', values: [1] }, { symbol: 'wWaveMusicActive', values: [1] }], registers: [{ address: 0xff26, mask: 5, value: 5 }], steps: [
    { set: { phase: 1 }, frames: 8, variables: { playing: 0 }, bytes: [{ symbol: 'wMusicPaused', values: [1] }, { symbol: 'wWaveMusicPaused', values: [1] }, { address: 0xff30, values: audioResult.music[1].waveform }], registers: [{ address: 0xff26, mask: 5, value: 0 }] },
    { set: { phase: 2 }, frames: 8, variables: { playing: 1 }, bytes: [{ symbol: 'wWaveMusicPaused', values: [0] }] },
    { set: { phase: 3 }, frames: 8, variables: { playing: 1 }, bytes: [{ symbol: 'wWaveMusicActive', values: [1] }] },
    { set: { phase: 4 }, frames: 8, variables: { playing: 0 }, bytes: [{ symbol: 'wMusicActive', values: [0] }, { symbol: 'wWaveMusicActive', values: [0] }] }
  ] });
  const demo = path.join(root, 'examples/feature-lab/main.pysn');
  const demoResult = compile(fs.readFileSync(demo, 'utf8'), demo);
  const demoName = 'runtime-feature-lab'; const demoAsm = path.join(dir, demoName + '.asm'); fs.writeFileSync(demoAsm, demoResult.assembly);
  const demoRom = assemble(demoAsm, demoName);
  for (const cgb of [false, true]) cases.push({ name: demoName + cgb, rom: demoRom, cgb, frames: 120, audio: true, audio_varies: true, symbols: path.join(root, 'build', demoName + '.sym'), symbolNames: Object.fromEntries(demoResult.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label])), variables: { x: 16, y: 16, door_open: 0 }, steps: [
    { press: ['right'], frames: 120, variables: { x: 72 } },
    { release: ['right'], press: ['a'], frames: 12, variables: { door_open: 1 }, rows: [{ x: 10, y: 9, tiles: [demoResult.assets[1].maps[0][0]] }] },
    { release: ['a'], press: ['right'], frames: 12, variables: { x: 72 } },
    { release: ['right'], press: ['b'], frames: 12, variables: { x: 16, y: 16, door_open: 0 } },
    { release: ['b'], press: ['select'], frames: 80, bytes: [{ symbol: 'wDialogueActive', values: [1] }, { symbol: 'wPortraitEnabled', values: [1] }], window_rows: [row('GUIDE', 2, 0, 5)], registers: [{ address: 0xff40, mask: 128, value: 128 }], window_enabled: true }
  ], screenshot: path.join(root, 'build', `feature-lab-${cgb}.png`) });
  const errorResult = compile('items = [1]\nindex = 2\nvalue = items[index]', 'error.pysn');
  const errorName = 'runtime-source-location'; const errorAsm = path.join(dir, errorName + '.asm'); fs.writeFileSync(errorAsm, errorResult.assembly);
  const errorRom = assemble(errorAsm, errorName);
  cases.push({ name: errorName, rom: errorRom, frames: 120, symbols: path.join(root, 'build', errorName + '.sym'), symbolNames: {}, rows: [row('error.pysn:3', 0, 14, 11), row('Index out of range', 0, 16, 18)] });
  const wideResult = compile(`header.target = "dual"
wall = tile("assets/brick.bmp", solid=True)
floor = tile("assets/floor.bmp")
wide = mutable_map([[${Array(32).fill('floor').join(', ')}]])
draw_world(wide)
set_camera(50, 0)
set_map_tile(wide, 1, 0, wall)
draw_world(wide)
changed = tile_is_solid(wide, 1, 0)
cx = camera_x()
reset_map(wide)
draw_world(wide)
restored = tile_is_solid(wide, 1, 0)
cx_after = camera_x()
refresh_screen()`, path.join(root, 'examples/scrolling-world/main.pysn'));
  const wideName = 'runtime-mutable-world'; const wideAsm = path.join(dir, wideName + '.asm'); fs.writeFileSync(wideAsm, wideResult.assembly);
  const wideRom = assemble(wideAsm, wideName);
  for (const cgb of [false, true]) cases.push({ name: wideName + cgb, rom: wideRom, cgb, frames: 120, symbols: path.join(root, 'build', wideName + '.sym'), symbolNames: Object.fromEntries(wideResult.symbols.map(s => [s.name, s.label])), variables: { changed: 1, cx: 50, restored: 0, cx_after: 50 } });
  const longResult = compile(`start_dialogue(format_text("${'A'.repeat(300)}"), speed=0)
other = format_text("{}", 5)
update_dialogue()
refresh_screen()`);
  const longName = 'runtime-format-bound'; const longAsm = path.join(dir, longName + '.asm'); fs.writeFileSync(longAsm, longResult.assembly);
  const longRom = assemble(longAsm, longName);
  cases.push({ name: longName, rom: longRom, frames: 120, symbols: path.join(root, 'build', longName + '.sym'), symbolNames: {}, bytes: [{ symbol: 'wDialogueSnapshot', offset: 255, values: [255] }, { symbol: 'wDialogueSnapshot', values: [font.ids.get('A')] }, { symbol: 'wFormatBuffer', values: [font.ids.get('5'), 255] }], window_rows: [row('A'.repeat(18), 1, 1, 18)] });
  const manifest = path.join(dir, 'cases.json'); fs.writeFileSync(manifest, JSON.stringify(cases));
  const run = spawnSync(emulatorPython(), [path.join(__dirname, 'emulator.py'), manifest], { encoding: 'utf8', timeout: 60000 }); assert.equal(run.status, 0, run.stdout + run.stderr);
});
