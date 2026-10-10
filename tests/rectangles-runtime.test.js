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
test('rectangle overlap matches geometry across signed coordinates and nested calls', { skip: !fs.existsSync(emulatorPython()) }, () => {
  const directory = path.join(root, 'build/tests/rectangles');
  fs.mkdirSync(directory, { recursive: true });
  const inputs = [
    [0, 0, 8, 8, 7, 7, 8, 8], [0, 0, 8, 8, 8, 0, 8, 8],
    [0, 0, 8, 8, 0, 8, 8, 8], [0, 0, 8, 8, 8, 8, 8, 8],
    [-10, -10, 20, 20, -1, -1, 1, 1], [2, 2, 1, 1, 0, 0, 8, 8],
    [0, 0, 0, 8, 0, 0, 8, 8], [0, 0, 8, -1, 0, 0, 8, 8],
    [32760, 32760, 20, 20, 32767, 32767, 1, 1],
    [-32768, -32768, 32767, 32767, -2, -2, 2, 2],
    [-32768, 0, 32767, 8, 0, 0, 8, 8],
    [32767, 0, 32767, 8, -32768, 0, 32767, 8]
  ];
  let seed = 12345;
  const random = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  for (let i = 0; i < 80; i++) inputs.push([random(65536) - 32768, random(65536) - 32768, random(32768), random(32768), random(65536) - 32768, random(65536) - 32768, random(32768), random(32768)]);
  const overlap = ([ax, ay, aw, ah, bx, by, bw, bh]) => Number(aw > 0 && ah > 0 && bw > 0 && bh > 0 && ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah);
  const source = `header.target = "dual"
results = [${inputs.map(() => 0).join(', ')}]
def geometry():
    global results
${inputs.map((args, i) => `    results[${i}] = rect_overlap(${args.join(', ')})`).join('\n')}
geometry()
counter = 0
order = [0, 0, 0, 0]
def value(tag):
    global counter
    global order
    order[counter] = tag
    counter += 1
    return counter
def query():
    return rect_overlap(0, 0, 8, 8, value(1), value(2), value(3), value(4))
ordered = query()
nested = rect_overlap(0, 0, 8, 8, rect_overlap(0, 0, 8, 8, 1, 1, 8, 8), 1, 8, 8)
refresh_screen()`;
  const result = compile(source);
  const asm = path.join(directory, 'geometry.asm');
  fs.writeFileSync(asm, result.assembly);
  const name = 'runtime-rectangles';
  const rom = assemble(asm, name);
  const cases = [false, true].map(cgb => ({ name: `${name}-${cgb}`, rom, cgb, frames: 120, symbols: path.join(root, 'build', name + '.sym'), symbolNames: Object.fromEntries(result.symbols.map(s => [s.name, s.label])), arrays: { results: inputs.map(overlap), order: [1, 2, 3, 4] }, variables: { counter: 4, ordered: 1, nested: 1 } }));
  const demo = path.join(root, 'examples/collision-lab/main.pysn');
  const demoResult = compile(fs.readFileSync(demo, 'utf8'), demo);
  const demoName = 'runtime-collision-lab';
  const demoAsm = path.join(directory, demoName + '.asm');
  fs.writeFileSync(demoAsm, demoResult.assembly);
  const demoRom = assemble(demoAsm, demoName);
  for (const cgb of [false, true]) cases.push({ name: `${demoName}-${cgb}`, rom: demoRom, cgb, frames: 120, symbols: path.join(root, 'build', demoName + '.sym'),
    symbolNames: Object.fromEntries(demoResult.symbols.filter(s => s.scope === '$module').map(s => [s.name, s.label])), variables: { x: 40, y: 56, hit: 0 },
    steps: [
      { set: { x: 56 }, frames: 12, variables: { hit: 0 } },
      { press: ['right'], frames: 8, variables: { hit: 1 }, ...(cgb ? { attributes: [{ x: 8, y: 6, values: [2, 2, 2, 2] }] } : {}) },
      { release: ['right'], press: ['b'], frames: 12, variables: { x: 40, y: 56, hit: 0 } },
      { release: ['b'], set: { x: 64, y: 80 }, frames: 12, variables: { hit: 0 } },
      { set: { y: 79 }, frames: 12, variables: { hit: 1 } }
    ], screenshot: path.join(root, 'build', `collision-lab-${cgb}.png`) });
  const manifest = path.join(directory, 'cases.json');
  fs.writeFileSync(manifest, JSON.stringify(cases));
  const run = spawnSync(emulatorPython(), [path.join(__dirname, 'emulator.py'), manifest], { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
