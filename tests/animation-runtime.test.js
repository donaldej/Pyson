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

test('animation timing, independent slots, one-shot completion and camera/flips execute in PyBoy',
  { skip: !fs.existsSync(python) && 'Install the PyBoy test environment' }, () => {
    const dir = path.join(root, 'build', 'tests', 'animations');
    fs.mkdirSync(dir, { recursive: true });
    const cases = [];
    function build(name, source, expected, filename = '<source>') {
      const result = compile(source, filename);
      const asm = path.join(dir, name + '.asm');
      fs.writeFileSync(asm, result.assembly);
      const rom = assemble(asm, name);
      cases.push({ name, rom, symbols: path.join(root, 'build', name + '.sym'),
        symbolNames: Object.fromEntries(result.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label])), ...expected });
      return result;
    }
    const source = `header.target = "dual"
import includes.rooms as rooms
hero = sprite_sheet("../assets/hero.bmp", 16, 16)
walk = sprite_animation(hero, [[0, 3], [1, 5]])
once = sprite_animation(hero, [[1, 2], [0, 4]], loop=False)
play_animation(0, walk)
mode = 0
flipped = False
draw_world(rooms.room17)
set_camera(32, 16)
while True:
    wait_vblank()
    if button_pressed("a"):
        update_animations()
    if button_pressed("b"):
        play_animation(4, walk, restart=True)
    if button_pressed("right"):
        update_animations(4)
    if button_pressed("left"):
        update_animations(0)
        flipped = True
    if button_pressed("start"):
        play_animation(0, once)
        mode = 1
    if button_pressed("select"):
        restart_animation(0)
    if button_pressed("up"):
        stop_animation(0)
    if button_pressed("down"):
        mode = 0
    if mode == 0:
        play_animation(0, walk)
    else:
        play_animation(0, once)
    negative = -1
    beyond = 256
    update_animations(negative)
    update_animations(beyond)
    play_animation(negative, walk)
    stop_animation(negative)
    restart_animation(negative)
    invalid_frame = animation_frame(negative)
    invalid_done = animation_finished(negative)
    invalid_playing = animation_playing(negative)
    f0 = animation_frame(0)
    f4 = animation_frame(4)
    done = animation_finished(0)
    active = animation_playing(0)
    terrain = tile_terrain(rooms.room0, 1, 1)
    saved = save_read(0, 111)
    animated_sprite(0, 40, 48, flipped)
    world_animated_sprite(4, 88, 60)
    refresh_screen()`;
    for (const cgb of [false, true]) {
      const result = build(`runtime-animations-${cgb}`, source, { cgb,
        variables: { f0: 0, f4: -1, done: 0, active: 1, invalid_frame: -1, invalid_done: 0, invalid_playing: 0, terrain: 2, saved: 111 } }, path.join(root, 'examples/banked-world/main.pysn'));
      const current = cases.at(-1);
      const sheet = result.assets.find(asset => asset.kind === 'sprite');
      const oam = (frame, x, y, flip = false) => {
        const tiles = sheet.maps[frame];
        const ordered = flip ? [tiles[1], tiles[0], tiles[3], tiles[2]] : tiles;
        return ordered.flatMap((tile, i) => [y + 16 + Math.floor(i / 2) * 8, x + 8 + i % 2 * 8, tile, flip ? 32 : 0]);
      };
      current.bytes = [{ address: 0xfe00, values: oam(0, 40, 48) }, { address: 0xfe10, values: Array(16).fill(0) }];
      const press = (button, variables, bytes = []) => [{ press: [button], frames: 8, variables, bytes }, { release: [button], frames: 8, variables }];
      current.steps = [
        ...press('a', { f0: 0 }), ...press('a', { f0: 0 }),
        ...press('a', { f0: 1 }, [{ address: 0xfe00, values: oam(1, 40, 48) }]),
        ...press('b', { f0: 1, f4: 0 }, [{ address: 0xfe10, values: oam(0, 56, 44) }]),
        ...press('a', { f0: 1, f4: 0 }),
        ...press('right', { f0: 0, f4: 1 }, [{ address: 0xfe00, values: oam(0, 40, 48) }, { address: 0xfe10, values: oam(1, 56, 44) }]),
        ...press('left', { f0: 0, f4: 1 }, [{ address: 0xfe00, values: oam(0, 40, 48, true) }]),
        ...press('start', { f0: 1, done: 0, active: 1 }),
        ...press('a', { f0: 1, done: 0, active: 1 }), ...press('a', { f0: 0, done: 0, active: 1 }),
        ...press('right', { f0: 0, done: 1, active: 0 }), ...press('a', { f0: 0, done: 1, active: 0 }),
        ...press('select', { f0: 1, done: 0, active: 1 }),
        ...press('up', { f0: 1, done: 0, active: 0 }), ...press('a', { f0: 1, active: 0 }),
        ...press('down', { f0: 0, done: 0, active: 1 }),
        ...press('up', { f0: 0, active: 0 }), ...press('down', { f0: 0, active: 0 })
      ];
      assert.equal(result.banking.romKB, 64);
    }
    const burst = 'hero = sprite_sheet("examples/assets/hero.bmp", 16, 16)\nburst = sprite_animation(hero, [[0, 1], [1, 254]], loop=False)\nplay_animation(36, burst)\nupdate_animations(255)\nframe = animation_frame(36)\ndone = animation_finished(36)\nactive = animation_playing(36)\nanimated_sprite(36, 40, 40)';
    build('runtime-animation-batch', burst, { variables: { frame: 1, done: 1, active: 0 } });
    const galleryFile = path.join(root, 'examples/animation-gallery/main.pysn');
    for (const cgb of [false, true]) build(`runtime-animation-gallery-${cgb}`, fs.readFileSync(galleryFile, 'utf8'), {
      cgb, variables: { mode: 1, paused: 0, playing: 1, finished: 0 }, steps: [
        { press: ['b'], frames: 12, variables: { mode: 0, frame: 0, playing: 1, finished: 0 } }, { release: ['b'], frames: 8 },
        { press: ['start'], frames: 80, variables: { mode: 2, frame: 0, playing: 0, finished: 1 } }, { release: ['start'], frames: 8 },
        { press: ['select'], frames: 8, variables: { playing: 1, finished: 0 } }, { release: ['select'], frames: 8 },
        { press: ['up'], frames: 8, variables: { playing: 0, finished: 0 } }, { release: ['up'], frames: 8 },
        { press: ['right'], frames: 8, variables: { paused: 1 } }, { release: ['right'], frames: 8 },
        { press: ['start'], frames: 16, variables: { mode: 2, frame: 1, playing: 1, finished: 0, paused: 1 } },
        { release: ['start'], frames: 16, variables: { frame: 1, playing: 1, finished: 0 } },
        { press: ['left'], frames: 8, variables: { flipped: 1, frame: 1 } }, { release: ['left'], frames: 8 },
        { press: ['right'], frames: 80, variables: { paused: 0, playing: 0, finished: 1 } }, { release: ['right'], frames: 8 },
        { press: ['a'], frames: 8, variables: { mode: 1, playing: 1, finished: 0 } }
      ], screenshot: path.join(root, 'build', `animation-gallery-${cgb ? 'cgb' : 'dmg'}.png`)
    }, galleryFile);
    const manifest = path.join(dir, 'cases.json');
    fs.writeFileSync(manifest, JSON.stringify(cases));
    const result = spawnSync(python, [path.join(__dirname, 'emulator.py'), manifest], { cwd: root, encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
    console.log(result.stdout.trim());
  });
