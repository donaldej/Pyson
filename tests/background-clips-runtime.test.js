'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root, emulatorPython } = require('../scripts/environment');
const { convertBMP } = require('../src/assets');
const font = require('../src/font');

test('clip frames remain exact and atomic across banks, moves and repeated calls',
  { skip: !fs.existsSync(emulatorPython()) }, () => {
    const directory = path.join(root, 'build/tests/clip-runtime');
    fs.mkdirSync(directory, { recursive: true });
    const bmp = Buffer.alloc(54 + 24 * 8 * 3);
    bmp.write('BM'); bmp.writeUInt32LE(bmp.length, 2); bmp.writeUInt32LE(54, 10);
    bmp.writeUInt32LE(40, 14); bmp.writeInt32LE(24, 18); bmp.writeInt32LE(8, 22);
    bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 24; x++) {
      const color = [12, 82, 164, 248][((x >> 3) + ((x & 7) > y ? 1 : 0)) % 4];
      const i = 54 + ((7 - y) * 24 + x) * 3;
      bmp[i] = bmp[i + 1] = bmp[i + 2] = color;
    }
    fs.writeFileSync(path.join(directory, 'frames.bmp'), bmp);
    const converted = convertBMP(bmp, 'clip', 8, 8);
    fs.writeFileSync(path.join(directory, 'expected.json'), JSON.stringify({
      patterns: converted.maps.map(map => converted.tiles[map[0]]),
      text: [...'KEEP'].map(ch => font.ids.get(ch))
    }));
    fs.writeFileSync(path.join(directory, 'main.pysn'), `header.target = "dual"
header.controller = "mbc5"
header.cpu_speed = "double"
clip = background_clip("frames.bmp",8,8)
stage = 0
print("KEEP",0,0)
draw_background(clip,0,1,2)
refresh_screen()
stage = 1
wait_frames(4)
draw_background(clip,1,4,3)
refresh_screen()
stage = 2
wait_frames(4)
draw_background(clip,2,2,1)
draw_background(clip,0,7,4)
refresh_screen()
stage = 3
draw_background(999,0)
draw_background(clip,999)
draw_background(clip,-1)
offscreen = -1
draw_background(clip,0,offscreen,0)
while True:
    wait_frames(1)
`);
    const build = spawnSync(process.execPath, ['src/cli.js', path.join(directory, 'main.pysn'), 'clip-runtime'],
      { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000 });
    assert.equal(build.status, 0, build.error?.message || build.stdout + build.stderr);
    const run = spawnSync(emulatorPython(), ['tests/background-clips.py'],
      { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000 });
    assert.equal(run.status, 0, run.error?.message || run.stdout + run.stderr);
    console.log(run.stdout.trim());
  });
