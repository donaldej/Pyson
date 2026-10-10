'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compile } = require('../src/compiler');
const { assemble } = require('../scripts/dev');
const { emulatorPython } = require('../scripts/environment');
const root = path.resolve(__dirname, '..');
test('terrain rectangles scan interior cells, respect pixel edges and reject invalid bounds', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const directory = path.join(root, 'build/tests/terrain-rectangles');
  fs.mkdirSync(directory, { recursive: true });
  const rows = ['.....', '..#..', '.....', '.....'];
  const inputs = [[0, 0, 8, 8], [8, 8, 8, 8], [8, 8, 9, 8], [24, 8, 8, 8], [23, 8, 8, 8], [0, 0, 40, 24], [0, 0, 40, 8], [0, 16, 40, 8], [-1, 0, 8, 8], [0, -1, 8, 8], [0, 0, 0, 8], [0, 0, 8, -1], [40, 0, 1, 1], [0, 32, 1, 1], [32767, 0, 32767, 8]];
  const expected = inputs.map(([x, y, w, h]) => {
    if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 40 || y + h > 32) return 1;
    for (let ty = y >> 3; ty <= (y + h - 1) >> 3; ty++) for (let tx = x >> 3; tx <= (x + w - 1) >> 3; tx++) if (rows[ty][tx] === '#') return 1;
    return 0;
  });
  const source = `header.target = "dual"
map = collision_map(${JSON.stringify(rows)})
results = [${inputs.map(() => 0).join(', ')}]
def check():
    global results
${inputs.map((args, i) => `    results[${i}] = rect_is_solid(map, ${args.join(', ')})`).join('\n')}
check()
invalid = rect_is_solid(-1, 0, 0, 8, 8)
nested = rect_is_solid(map, rect_is_solid(map, 0, 0, 8, 8), 0, 8, 8)
refresh_screen()`;
  const result = compile(source);
  const name = 'runtime-terrain-rectangles';
  const asm = path.join(directory, name + '.asm');
  fs.writeFileSync(asm, result.assembly);
  const rom = assemble(asm, name);
  const cases = [false, true].map(cgb => ({ name: `${name}-${cgb}`, rom, cgb, frames: 120, symbols: path.join(root, 'build', name + '.sym'), symbolNames: Object.fromEntries(result.symbols.map(s => [s.name, s.label])), arrays: { results: expected }, variables: { invalid: 1, nested: 0 } }));
  function add(source, filename, fixtureName, variables, steps = []) {
    const compiled = compile((source.includes('header.target') ? '' : 'header.target = "dual"\n') + source, filename);
    const fixtureAsm = path.join(directory, fixtureName + '.asm');
    fs.writeFileSync(fixtureAsm, compiled.assembly);
    const fixtureRom = assemble(fixtureAsm, fixtureName);
    for (const cgb of [false, true]) cases.push({ name: `${fixtureName}-${cgb}`, rom: fixtureRom, cgb, frames: 120, symbols: path.join(root, 'build', fixtureName + '.sym'), symbolNames: Object.fromEntries(compiled.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label])), variables, steps });
  }
  add(`wall = tile("assets/brick.bmp", solid=True)
floor = tile("assets/floor.bmp")
ordinary = tilemap([[floor, wall, floor]])
streamed = worldmap([[floor, wall, floor]])
bmp = tilemap("assets/brick.bmp")
art = sprite_sheet("assets/player.bmp", 8, 8)
ordinary_clear = rect_is_solid(ordinary, 0, 0, 8, 8)
ordinary_middle = rect_is_solid(ordinary, 0, 0, 24, 8)
streamed_clear = rect_is_solid(streamed, 16, 0, 8, 8)
streamed_middle = rect_is_solid(streamed, 0, 0, 24, 8)
outside = rect_is_solid(streamed, 24, 0, 1, 1)
wrong_kind = rect_is_solid(art, 0, 0, 8, 8)
no_metadata = rect_is_solid(bmp, 0, 0, 8, 8)
refresh_screen()`, path.join(root, 'examples/scrolling-world/main.pysn'), 'runtime-terrain-rectangles-maps', { ordinary_clear: 0, ordinary_middle: 1, streamed_clear: 0, streamed_middle: 1, outside: 1, wrong_kind: 1, no_metadata: 1 });
  add(`import world
clear = rect_is_solid(world.board, 520, 600, 8, 8)
wall = rect_is_solid(world.board, 1016, 1016, 8, 8)
edge = rect_is_solid(world.board, 1024, 600, 1, 1)
refresh_screen()`, path.join(root, 'examples/streaming-world/main.pysn'), 'runtime-terrain-rectangles-large-world', { clear: 0, wall: 1, edge: 1 });
  const demo = path.join(root, 'examples/streaming-world/main.pysn');
  add(fs.readFileSync(demo, 'utf8'), demo, 'runtime-terrain-wall-slide', { x: 40, y: 40 }, [
    { set: { x: 8, y: 40 }, frames: 8 },
    { press: ['left', 'down'], frames: 12, variables: { x: 8 }, ranges: { y: [42, 64] } },
    { release: ['left', 'down'], frames: 8, variables: { x: 8 } }
  ]);
  const manifest = path.join(directory, 'cases.json');
  fs.writeFileSync(manifest, JSON.stringify(cases));
  const run = spawnSync(emulatorPython(), [path.join(__dirname, 'emulator.py'), manifest], { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
