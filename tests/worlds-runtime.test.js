'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compile } = require('../src/compiler');
const { convertBMP } = require('../src/assets');
const { assemble } = require('../scripts/dev');
const { emulatorPython } = require('../scripts/environment');
const root = path.resolve(__dirname, '..');
test('streamed worlds preserve full coordinates, collision, sprites and HUD on DMG and CGB',
  { skip: !fs.existsSync(emulatorPython()) && 'Install the PyBoy test environment' }, () => {
  const directory = path.join(root, 'build/tests/worlds'); fs.mkdirSync(directory, { recursive: true });
  const filename = path.join(root, 'examples/streaming-world/main.pysn');
  const source = `header.target = "dual"
import world
player = sprite_sheet("assets/player.bmp", 8, 8)
draw_world(world.board)
clear_window()
print_window("WORLD", 0, 0)
window_position(0, 128)
show_window()
set_camera(520, 600)
world_sprite(0, player, 0, 596, 668)
refresh_screen()
cx = camera_x()
cy = camera_y()
width = map_width(world.board)
height = map_height(world.board)
solid = tile_is_solid(world.board, 127, 127)
empty = tile_is_solid(world.board, 65, 75)
terrain = tile_terrain(world.board, 65, 75)
tile_id = tile_at(world.board, 100, 100)
outside = tile_at(world.board, 128, 128)
refresh_screen()
`;
  const cases = [];
  for (const cgb of [false, true]) {
    const small = `header.target = "dual"
wall = tile("assets/brick.bmp", solid=True, terrain=7)
floor = tile("assets/floor.bmp", terrain=2)
ordinary = tilemap([[wall, floor]])
board = worldmap([[wall, floor], [floor, wall]])
draw_world(board)
set_camera(999, -1)
refresh_screen()
cx = camera_x()
cy = camera_y()
terrain = tile_terrain(board, 0, 0)
solid = tile_is_solid(board, 0, 0)
empty = tile_is_solid(board, 1, 0)
refresh_screen()
print("OK", 3, 3)
refresh_screen()
`;
    const result = compile(small, path.join(root, 'examples/scrolling-world/main.pysn'));
    const name = 'runtime-world-manual-' + cgb, asm = path.join(directory, name + '.asm');
    fs.writeFileSync(asm, result.assembly);
    cases.push({ name, rom: assemble(asm, name), cgb, symbols: path.join(root, 'build', name + '.sym'),
      symbolNames: Object.fromEntries(result.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label])),
      variables: { cx: 0, cy: 0, terrain: 7, solid: 1, empty: 0 },
      rows: [{ x: 3, y: 3, tiles: [25, 21] }],
      ...(cgb ? { attributes: [{ x: 0, y: 0, values: [1, 2] }, { x: 0, y: 1, values: [2, 1] }] } : {}) });
  }
  for (const cgb of [false, true]) {
    const result = compile(source, filename), name = 'runtime-world-' + cgb;
    const world = result.assets.find(asset => asset.kind === 'world');
    const asm = path.join(directory, name + '.asm'); fs.writeFileSync(asm, result.assembly);
    const expectedTiles = world.maps[0];
    const tileID = expectedTiles[75 * 128 + 65];
    const slot = world.streaming.slots[tileID];
    cases.push({ name, rom: assemble(asm, name), cgb, frames: 220,
      symbols: path.join(root, 'build', name + '.sym'),
      symbolNames: Object.fromEntries(result.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label])),
      variables: { cx: 520, cy: 600, width: 128, height: 128, solid: 1, empty: 0, terrain: 0, tile_id: expectedTiles[100 * 128 + 100], outside: -1 },
      bytes: [{ address: 0xfe00, values: [84, 84] }, { address: 0x8000 + slot * 16, values: convertBMP(fs.readFileSync(world.file), 'world').tiles[tileID] }],
      rows: [{ x: 1, y: 11, tiles: [slot] }],
      registers: [{ address: 0xff43, value: 8 }, { address: 0xff42, value: 88 }],
      window_enabled: true, window_rows: [{ x: 0, y: 0, tiles: [33, 25, 28, 22, 14] }],
      screenshot: path.join(root, 'build', 'streaming-world-' + (cgb ? 'cgb' : 'dmg') + '.png') });
  }
  for (const cgb of [false, true]) {
    for (const hud of [false, true]) {
    const source = fs.readFileSync(filename, 'utf8').split('\n').filter(line => hud || !/^\s*(clear_window|print_window|window_position|show_window)\(/.test(line)).join('\n');
    const result = compile(source, filename), name = `runtime-world-demo-${cgb}-${hud}`;
    const world = result.assets.find(asset => asset.kind === 'world');
    const asm = path.join(directory, name + '.asm'); fs.writeFileSync(asm, result.assembly);
    cases.push({ name, rom: assemble(asm, name), cgb, frames: 220,
      symbols: path.join(root, 'build', name + '.sym'),
      symbolNames: Object.fromEntries(result.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label])),
      variables: { x: 40, y: 40, zone: 0 }, window_enabled: hud,
      monitor_calls: ['TryRefreshStream.pause'], call_counts: { 'TryRefreshStream.pause': 1 },
      check_stream_writes: true,
      streamed_world: { width: world.columns, view_height: hud ? 128 : 144, ids: world.maps[0], slots: world.streaming.slots, tiles: convertBMP(fs.readFileSync(world.file), 'world').tiles },
      steps: [{ press: ['a'], frames: 70, variables: { x: 296, y: 40, zone: 1 } },
        { release: ['a'], frames: 10 }, { press: ['a'], frames: 70, variables: { x: 552, y: 40, zone: 2 } },
        { release: ['a'], press: ['right'], frames: 300, ranges: { x: [650, 1008] }, lcd_stays_enabled: true, movement: { variable: 'x', max_still_frames: 3 }, camera_keeps_up: true, call_counts: { 'TryRefreshStream.pause': 3 } },
        { release: ['right'], press: ['left'], frames: 180, lcd_stays_enabled: true, movement: { variable: 'x', max_still_frames: 3 }, camera_keeps_up: true, call_counts: { 'TryRefreshStream.pause': 3 } },
        { release: ['left'], press: ['down', 'right'], frames: 180, lcd_stays_enabled: true, movement: { variable: 'y', max_still_frames: 3 }, camera_keeps_up: true, call_counts: { 'TryRefreshStream.pause': 3 } },
        { release: ['right'], frames: 600, ranges: { y: [340, 1016] }, lcd_stays_enabled: true, movement: { variable: 'y', max_still_frames: 3 }, camera_keeps_up: true, call_counts: { 'TryRefreshStream.pause': 3 } }],
      screenshot: path.join(root, 'build', `streaming-demo-${cgb ? 'cgb' : 'dmg'}-${hud ? 'hud' : 'plain'}.png`) });
    }
  }
  for (const cgb of [false, true]) {
    const rows = Array.from({ length: 32 }, (_, y) => '[' + Array.from({ length: 64 }, (_, x) => (x + y) % 2 ? 'floor' : 'wall').join(',') + ']').join(',\n');
    const source = `header.target = "dual"
wall = tile("assets/brick.bmp", solid=True, terrain=7)
floor = tile("assets/floor.bmp", terrain=2)
board = worldmap([${rows}])
x = 0
draw_world(board)
clear_window()
print_window("MIXED PALETTES", 0, 0)
window_position(0, 128)
show_window()
while True:
    wait_vblank()
    if button("right") and x < 350:
        x += 2
    elif button("left") and x > 0:
        x -= 2
    set_camera(x, 0)
    refresh_screen()
`;
    const result = compile(source, path.join(root, 'examples/scrolling-world/main.pysn'));
    const name = 'runtime-world-mixed-' + cgb, asm = path.join(directory, name + '.asm');
    fs.writeFileSync(asm, result.assembly);
    const world = result.assets.find(asset => asset.kind === 'world');
    const wall = result.assets.find(asset => path.basename(asset.file || '') === 'brick.bmp');
    const floor = result.assets.find(asset => path.basename(asset.file || '') === 'floor.bmp');
    const tiles = [];
    tiles[world.maps[0][0]] = convertBMP(fs.readFileSync(wall.file), 'background').tiles[0];
    tiles[world.maps[0][1]] = convertBMP(fs.readFileSync(floor.file), 'background').tiles[0];
    cases.push({ name, rom: assemble(asm, name), cgb, symbols: path.join(root, 'build', name + '.sym'),
      symbolNames: Object.fromEntries(result.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label])),
      monitor_calls: ['TryRefreshStream.pause'], check_stream_writes: true,
      streamed_world: { width: 64, ids: world.maps[0], slots: world.streaming.slots, tiles,
        palettes: Array.from({ length: 2048 }, (_, i) => (i % 64 + Math.floor(i / 64)) % 2 ? floor.paletteIndex : wall.paletteIndex) },
      steps: [{ press: ['right'], frames: 310, ranges: { x: [260, 350] }, lcd_stays_enabled: true, movement: { variable: 'x', max_still_frames: 3 }, camera_keeps_up: true, call_counts: { 'TryRefreshStream.pause': 1 } },
        { release: ['right'], press: ['left'], frames: 160, lcd_stays_enabled: true, movement: { variable: 'x', max_still_frames: 3 }, camera_keeps_up: true, call_counts: { 'TryRefreshStream.pause': 1 } }] });
  }
  const manifest = path.join(directory, 'cases.json'); fs.writeFileSync(manifest, JSON.stringify(cases));
  const result = spawnSync(emulatorPython(), [path.join(__dirname, 'emulator.py'), manifest], { cwd: root, encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  console.log(result.stdout.trim());
});
