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
const root = path.resolve(__dirname, '..');

test('reordered builtins evaluate once in written order and keep nested values safe on DMG and Color', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const source = `header.target = "dual"
hero = sprite_sheet(path="assets/hero.bmp", width=16, height=16)
song = music_track(notes=[[440, 255, 8]], loop=True)
tone = sound_effect(channel="pulse", steps=[[660, 255, 8]])
trace = [${Array(40).fill(0).join(', ')}]
cursor = 0
def mark(tag, value):
    global trace, cursor
    trace[cursor] = tag
    cursor += 1
    return value
def named_overlap():
    return rect_overlap(bh=mark(8, 8), bw=mark(7, 8), by=mark(6, 0), bx=mark(5, 0), ah=mark(4, 8), aw=mark(3, 8), ay=mark(2, 0), ax=mark(1, 0))
random_seed(seed=42)
random = randint(high=mark(1, 4), low=mark(2, 4))
overlap = named_overlap()
save_write(value=mark(1, randint(high=mark(2, 321), low=mark(3, 321))), slot=mark(4, 0))
saved = save_read(default=mark(1, -1), slot=mark(2, 0))
print(y=mark(1, 1), x=mark(2, 2), value=mark(3, 9))
sprite(y=mark(1, 32), x=mark(2, 24), frame=mark(3, 0), sheet=hero, slot=mark(4, 0), flip_y=mark(5, False))
play_music(restart=mark(1, True), track=song)
play_sound(priority=mark(1, 3), effect=tone)
start_dialogue(palette=mark(1, 0), speed=mark(2, 2), text="HELLO")
close_dialogue()
start_choices(cancel=mark(1, False), default=mark(2, 0), selected_palette=mark(3, 0), palette=mark(4, 0), labels=["YES", "NO"])
close_dialogue()
refresh_screen()`;
  const result = compile(source, path.join(root, 'examples/color-sprites.pysn'));
  const name = 'runtime-builtin-arguments';
  const directory = path.join(root, 'build/tests/builtin-arguments');
  fs.mkdirSync(directory, { recursive: true });
  const asm = path.join(directory, name + '.asm');
  fs.writeFileSync(asm, result.assembly);
  const rom = assemble(asm, name);
  const expected = [1, 2, 8, 7, 6, 5, 4, 3, 2, 1, 2, 3, 1, 4, 1, 2, 1, 2, 3, 1, 2, 3, 4, 5, 1, 1, 1, 2, 1, 2, 3, 4];
  const cases = [false, true].map(cgb => ({
    name: name + '-' + cgb, rom, cgb, frames: 120, audio: true,
    symbols: path.join(root, 'build', name + '.sym'),
    symbolNames: Object.fromEntries(result.symbols.filter(symbol => symbol.scope === '$module').map(symbol => [symbol.name, symbol.label])),
    variables: { random: 4, overlap: 1, saved: 321, cursor: expected.length },
    arrays: { trace: [...expected, ...Array(40 - expected.length).fill(0)] },
    rows: [{ x: 2, y: 1, tiles: [font.ids.get('9')] }],
    bytes: [{ address: 0xfe00, values: [48, 32, result.assets[0].maps[0][0], 0] }]
  }));
  const manifest = path.join(directory, 'cases.json');
  fs.writeFileSync(manifest, JSON.stringify(cases));
  const run = spawnSync(emulatorPython(), [path.join(__dirname, 'emulator.py'), manifest], { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
