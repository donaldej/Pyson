'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile } = require('../src/compiler');
const { normalize, signatures } = require('../src/builtin-arguments');
const { instructionBytes } = require('../src/code-banking');
const filename = path.resolve(__dirname, '../examples/color-sprites.pysn');

test('every fixed builtin binds its public names, including reversed required arguments', () => {
  for (const [name, params] of Object.entries(signatures)) {
    if (!params.length) continue;
    const names = params.map(param => Array.isArray(param) ? param[0] : param);
    const args = names.map((name, value) => ({ type: 'keyword', name, expression: { type: 'number', value } })).reverse();
    const node = { type: 'call', name, args };
    normalize(node, (_, message) => { throw new Error(message); });
    assert.deepEqual(node.args.map(arg => (arg.expression || arg).value), names.map((_, i) => i), name);
  }
  const document = fs.readFileSync(path.resolve(__dirname, '../documentation/arguments.md'), 'utf8');
  for (const [name, params] of Object.entries(signatures)) {
    const parameters = params.map(param => Array.isArray(param) ? param[0] : param);
    assert.ok(document.includes(`\`${name}(${parameters.join(', ')})\``), `Missing documented public signature: ${name}`);
  }
});

test('named calls skip defaults and compile across graphics, animation, sound and declarations', () => {
  const source = `header.target = "dual"
LIMIT = constant(value=4)
table = constant_table(values=[1, LIMIT])
hero = sprite_sheet(height=16, path="assets/hero.bmp", width=16)
brick = tile(terrain=2, path="star-chase/assets/brick.bmp", solid=True)
board = tilemap(source=[[brick]])
editable = mutable_map(rows=[[brick]])
walls = collision_map(rows=["#"])
world = worldmap(source=[[brick]])
walk = sprite_animation(steps=[[0, 8]], sheet=hero, loop=False)
tone = sound_effect(steps=[[440, 10, 8]], channel="pulse", duty=1)
noise = sound_effect(priority=4, channel="noise", steps=[[52, 10, 8]])
song = music_track(voice=1, notes=[[220, 10, 8]], instrument="sine")
bg_palette(color3="#ffffff", color0="#000000", index=0, color1="#555555", color2="#aaaaaa")
sprite_palette(index=0, color0=0, color1=1, color2=2, color3=3)
print(y=1, value="HI", x=2)
print_window("HUD", y=0, x=0, palette=0)
sprite(0, hero, 0, x=24, y=32, flip_y=True)
world_sprite(sheet=hero, slot=4, frame=0, x=24, y=32)
play_animation(animation=walk, slot=0, restart=True)
update_animations(ticks=2)
animated_sprite(0, y=32, x=24, flip_y=True)
world_animated_sprite(slot=0, x=24, y=32)
play_sound(priority=3, effect=tone)
play_sound(effect="collect")
play_music(restart=True, track=song)
start_dialogue(palette=0, text="HELLO", speed=1)
start_choices(default=0, labels=["YES", "NO"], cancel=False)
dialogue_portrait(palette=0, sheet=hero)
draw_map(y=3, map=board, x=0)
draw_world(map=world)
set_camera(y=0, x=0)
changed = set_map_tile(tile=brick, y=0, map=editable, x=0)
solid = rect_is_solid(height=8, width=8, map=walls, x=0, y=0)
random_seed(seed=1)
roll = randrange(stop=6)
save_write(value=roll, slot=0)
saved = save_read(default=-1, slot=0)
wait_frames(count=0)
elapsed = elapsed_frames(previous=frame_count())
pressed = button(name="a")
length = len(array=table)
refresh_screen()`;
  const result = compile(source, filename);
  assert.equal(result.constants.LIMIT, 4);
  assert.equal(result.assets.find(asset => asset.kind === 'tile').terrain, 2);
  assert.equal(result.sounds.find(effect => effect.name === 'tone').priority, 3);
  assert.equal(result.sounds.find(effect => effect.name === 'tone').duty, 1);
  assert.equal(result.assets[0].frameWidth, 16);
});

test('named calls reject unknown, duplicate, missing and misplaced arguments', () => {
  for (const [source, message] of [
    ['print(text="HI", x=0, y=0)', /unknown.*text/],
    ['print("HI", 0, x=1, y=0)', /duplicate.*x/],
    ['print(value="HI", x=0)', /missing.*y/],
    ['print("HI", x=0, 0)', /precede/],
    ['sprite(slot=0, sheet=0, x=0, y=0)', /missing.*frame/],
    ['randrange(start=1)', /missing.*stop/],
    ['refresh_screen(value=1)', /unknown/],
    ['play_sound(priority=1)', /missing.*effect/]
  ]) assert.throws(() => compile(source), message, source);
  assert.throws(() => compile('sound = sound_effect("noise", [[52, 1, 8]], duty=1)'), /Noise effects/);
  assert.throws(() => compile('song = music_track(notes=[[440, 1, 8]], instrument="sine")'), /voice=1/);
});

test('canonical keywords preserve positional assembly and reordered calls need no extra WRAM', () => {
  const positional = compile('x = randint(4, 4)');
  const named = compile('x = randint(low=4, high=4)');
  assert.equal(named.assembly, positional.assembly);
  const reverse = compile('x = randint(high=4, low=4)');
  assert.deepEqual(reverse.symbols, positional.symbols);
  assert.match(reverse.assembly, /ld hl, sp \+ /);
  assert.equal(instructionBytes('ld hl, sp + 12'), 2);
  assert.equal(instructionBytes('add sp, 16'), 2);
});
