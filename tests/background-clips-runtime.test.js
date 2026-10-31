'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root, emulatorPython } = require('../scripts/environment');
const { convertBMP } = require('../src/assets');
const font = require('../src/font');

test('persistent clip patterns survive palette changes, zero-upload frames, moves and buffered input',
  {skip:!fs.existsSync(emulatorPython())},()=>{
    const name='clip-shared-runtime',directory=path.join(root,'build/tests',name);
    fs.mkdirSync(directory,{recursive:true});
    const bmp=Buffer.alloc(54+96*24*3);
    bmp.write('BM');bmp.writeUInt32LE(bmp.length,2);bmp.writeUInt32LE(54,10);
    bmp.writeUInt32LE(40,14);bmp.writeInt32LE(96,18);bmp.writeInt32LE(24,22);
    bmp.writeUInt16LE(1,26);bmp.writeUInt16LE(24,28);
    for(let y=0;y<24;y++)for(let x=0;x<96;x++){
      const frame=Math.floor(x/24),cell=Math.floor(y/8)*3+Math.floor(x%24/8);
      const id=cell===8?(frame===3?0:8+frame):cell;
      const value=y%8===0?((id>>(x%8))&1)*3:(x%8+y%8)%4;
      const color=[248,164,82,12][value],offset=54+((23-y)*96+x)*3;
      bmp[offset]=bmp[offset+1]=bmp[offset+2]=color;
    }
    fs.writeFileSync(path.join(directory,'frames.bmp'),bmp);
    fs.writeFileSync(path.join(directory,'other.bmp'),bmp);
    fs.writeFileSync(path.join(directory,'actor.bmp'),require('./actors-fixture').fixture().data);
    const converted=convertBMP(bmp,'clip',24,24);
    fs.writeFileSync(path.join(directory,'expected.json'),JSON.stringify({
      frames:converted.maps.map(map=>map.map(id=>converted.tiles[id])),size:[3,3],
      stage_images:[0,3,2],stage_palettes:[1,2,1],buffered_input:true,
      text:[...'KEEP'].map(char=>font.ids.get(char))
    }));
    const source=`header.target = "dual"
header.controller = "mbc5"
clip = background_clip("frames.bmp",24,24)
other = background_clip("other.bmp",24,24)
actor = actor_sheet("actor.bmp",16,16)
stage = 0
chord_events = 0
a_events = 0
down_held = 0
print("KEEP",0,0)
draw_actor(actor,0,120,80)
draw_background(clip,0,1,2)
refresh_screen()
stage = 1
wait_frames(4)
draw_background(other,3,4,3)
refresh_screen()
stage = 2
wait_frames(4)
draw_background(clip,1,2,1)
draw_background(clip,2,7,4)
refresh_screen()
stage = 3
while True:
    if stage == 6:
        read_buttons()
        stage = 7
        wait_frames(12)
        if button_pressed("b") and button("down"):
            chord_events += 1
        stage = 8
    else:
        read_buttons()
    down_held = button("down")
    if button_pressed("a"):
        a_events += 1
    refresh_screen()
`;
    fs.writeFileSync(path.join(directory,'main.pysn'),source);
    const build=spawnSync(process.execPath,['src/cli.js',path.join(directory,'main.pysn'),name],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});
    assert.equal(build.status,0,build.error?.message||build.stdout+build.stderr);
    const report=JSON.parse(fs.readFileSync(path.join(root,'build',name+'.report.json')));
    assert.equal(report.assets[0].clip.sharedSlots,8);
    assert.equal(report.assets[0].clip.patternsPerBuffer,1);
    const refs=report.assets[0].clipFrames;
    if(refs)assert.equal(refs[3].tiles,0);
    // Actor programs compact the font, so use this build's own encoded KEEP IDs.
    const {collectAssets}=require('../src/assets'),{loadModules}=require('../src/modules');
    const {ast}=loadModules(source,path.join(directory,'main.pysn'));
    const compact=collectAssets(ast,path.join(directory,'main.pysn')).font;
    const expected=JSON.parse(fs.readFileSync(path.join(directory,'expected.json')));
    expected.text=[...'KEEP'].map(char=>compact.ids.get(char));
    fs.writeFileSync(path.join(directory,'expected.json'),JSON.stringify(expected));
    const run=spawnSync(emulatorPython(),['tests/background-clips.py',name],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});
    assert.equal(run.status,0,run.error?.message||run.stdout+run.stderr);console.log(run.stdout.trim());
  });

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
