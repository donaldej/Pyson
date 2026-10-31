'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile } = require('../src/compiler');
const { convertBMP } = require('../src/assets');
const directory = path.resolve(__dirname, '../build/tests/background-clips');
fs.mkdirSync(directory, { recursive: true });
const file = path.join(directory, 'three-frames.bmp');
const data = Buffer.alloc(54 + 24 * 8 * 3);
data.write('BM'); data.writeUInt32LE(data.length, 2); data.writeUInt32LE(54, 10);
data.writeUInt32LE(40, 14); data.writeInt32LE(24, 18); data.writeInt32LE(8, 22);
data.writeUInt16LE(1, 26); data.writeUInt16LE(24, 28);
for (let y = 0; y < 8; y++) for (let x = 0; x < 24; x++) {
  const color = [12, 82, 164, 248][((x >> 3) + ((x & 7) > y ? 1 : 0)) % 4];
  const i = 54 + ((7 - y) * 24 + x) * 3;
  data[i] = data[i + 1] = data[i + 2] = color;
}
fs.writeFileSync(file, data);
const filename = path.join(directory, 'main.pysn');
const declaration = 'clip = background_clip("three-frames.bmp", 8, 8)\n';

test('background clips bank exact per-frame patterns/layouts and reserve two shared buffers', () => {
  const converted = convertBMP(data, 'clip', 8, 8);
  assert.equal(converted.frames, 3);
  const result = compile(declaration + 'draw_background(frame=2, clip=clip, y=3, x=2)\nrefresh_screen()', filename);
  const asset = result.assets[0];
  assert.equal(asset.kind, 'clip');
  assert.equal(asset.clip.peakFramePatterns, 1);
  assert.equal(asset.clip.patternsPerBuffer, 1);
  assert.equal(result.banking.objects.filter(o => o.kind === 'background-frame').length, 3);
  assert.equal(result.banking.objects.find(o => o.kind === 'background-index').bytes, 12);
  for (let frame = 0; frame < 3; frame++) {
    const bytes = [1, ...converted.tiles[converted.maps[frame][0]], 0];
    assert.ok(result.assembly.includes(`AssetMap0Frame${frame}:\n    db ${bytes.join(', ')}`));
  }
  assert.match(result.assembly, /DEF FRAME_CLOCK_ENABLED EQU 1/);
  assert.match(result.assembly, /call DrawBackground/);
  const repeated = compile(declaration + 'other = background_clip("three-frames.bmp",8,8)\n', filename);
  assert.equal(repeated.assets.length, 1);
});

test('clip validation rejects invalid sheets, bounds, placement, mixed renderers and VRAM overcommit', () => {
  for (const source of [
    'a = background_clip("three-frames.bmp", 0, 8)',
    'a = background_clip("three-frames.bmp", 16, 8)',
    'a = background_clip("three-frames.bmp", 168, 8)',
    'a = background_clip("three-frames.bmp", True, 8)',
    'a = background_clip("three-frames.bmp")',
    'def f():\n    a = background_clip("three-frames.bmp", 8, 8)',
    declaration + 'draw_background(clip, 0, 20, 0)',
    declaration + 'show_window()',
    declaration + 'set_camera(0, 0)',
    declaration + 'world = worldmap("three-frames.bmp")'
  ]) assert.throws(() => compile(source, filename), /clip|frame|asset|literal|argument|window|camera|size|multiple|positive/i, source);
  const { prepareClips } = require('../src/background-clips');
  const tiles = Array.from({ length: 80 }, () => Array(16).fill(0));
  assert.throws(() => prepareClips([{ kind: 'clip', file: 'too-large.bmp', label: 'Clip', frames: 1,
    maps: [tiles.map((_, i) => i)], tiles }], 100), /two buffers.*80/);
});

test('sharing peak-frame patterns saves VRAM and reconstructs every original tile', () => {
  const { shareClipPatterns, prepareClips } = require('../src/background-clips');
  const tiles = Array.from({length:7}, (_,i)=>Array(16).fill(i+1));
  const maps = [[0,1,2],[0,1,3],[4,5,4],[4,6,4]];
  for(const actor of [false,true]){
    const clip={kind:'clip',file:'peaks.bmp',label:'Peaks',frames:4,tiles,maps};
    const assets=actor?[clip,{kind:'actor'}]:[clip];
    const data=Array(20*16).fill(0), shared=shareClipPatterns(assets,data);
    const resident=actor?Math.ceil(data.length/32)*2:data.length/16;
    const packed=prepareClips(assets,resident,shared);
    assert.ok(resident+packed.span*2<=26);
    if(!actor)assert.ok(resident+packed.span*2<26);
    for(let frame=0;frame<maps.length;frame++){
      const body=packed.objects.find(o=>o.label===`PeaksFrame${frame}`).body;
      const bytes=body.split('db ')[1].trim().split(',').map(Number), count=bytes[0];
      const layout=bytes.slice(1+count*16);
      assert.deepEqual(layout.map(index=>index<count?bytes.slice(1+index*16,17+index*16):
        data.slice((shared.base+index-count)*16,(shared.base+index-count+1)*16)),maps[frame].map(id=>tiles[id]));
    }
    const again=Array(20*16).fill(0);
    assert.deepEqual([...shareClipPatterns(assets,again).indices],[...shared.indices]);
  }
  // One promotion ties after actor alignment; the second makes the pair useful.
  const pair={kind:'clip',frames:4,tiles,maps:[[0,1,2],[0,1,3],[0,1,4],[0,1,5]]};
  const data=Array(20*16).fill(0);
  const shared=shareClipPatterns([pair,{kind:'actor'}],data);
  assert.equal(shared.count,2);
  assert.equal(data.length/16,22);
});

test('optional clip palettes share a matching earlier clip without changing independent defaults', () => {
  const files = Array.from({length: 9}, (_, i) => `palette-${i}.bmp`);
  for (const name of files) fs.writeFileSync(path.join(directory, name), data);
  const shared = files.map((name, i) => `c${i} = background_clip("${name}",8,8${i ? ', palette=c0' : ''})`).join('\n');
  const result = compile(shared, filename);
  assert.equal(result.assets.length, 9);
  assert.deepEqual(result.assets.map(a => a.paletteIndex), Array(9).fill(1));
  const independent = compile(files.slice(0, 7).map((name, i) => `c${i} = background_clip("${name}",8,8)`).join('\n'), filename);
  assert.deepEqual(independent.assets.map(a => a.paletteIndex), [1,2,3,4,5,6,7]);
  assert.throws(() => compile(files.slice(0, 8).map((name, i) => `c${i} = background_clip("${name}",8,8)`).join('\n'), filename), /7 imported background palettes/);
  const named = compile(declaration + 'b = background_clip(palette=clip,height=8,path="palette-0.bmp",width=8)', filename);
  assert.equal(named.assets[1].paletteIndex, named.assets[0].paletteIndex);
  for (const option of ['palette=99', 'palette=unknown', 'color=clip', 'clip']) {
    assert.throws(() => compile(declaration + `b = background_clip("palette-0.bmp",8,8,${option})`, filename), /palette|argument/i);
  }
  const changed = Buffer.from(data); changed[54] = 255;
  fs.writeFileSync(path.join(directory, 'different-colors.bmp'), changed);
  assert.throws(() => compile(declaration + 'b = background_clip("different-colors.bmp",8,8,palette=clip)', filename), /same colors/);
  assert.throws(() => compile('s = sprite_sheet("three-frames.bmp",8,8)\nb = background_clip("palette-0.bmp",8,8,palette=s)', filename), /previously declared background clip/);
});
