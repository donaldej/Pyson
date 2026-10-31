"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {root,emulatorPython}=require('../scripts/environment'),{bmp}=require('./indexed-colors-fixture');
test('CGB HUD split survives masked DMA and private attribute-bank copies on every display frame',{skip:!fs.existsSync(emulatorPython())},()=>{
 const dir=path.join(root,'build/tests/scene-raster'),wide=require('./masked-color-fixture').colorFixture().dir+'/wide.bmp';fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(wide,dir+'/wide.bmp');fs.writeFileSync(dir+'/arena.bmp',bmp(168,144,3));
 const source=`header.target="dual"
header.controller="mbc5"
header.ram_kb=32
header.cpu_speed="double"
arena=scene_map("arena.bmp",hud_rows=3,palettes=3)
sheet=masked_sheet("wide.bmp",64,64)
padding_a=[${Array(475).fill(0).join(',')}]\npadding_b=[${Array(475).fill(0).join(',')}]
position=0
cycles=0
draw_scene(arena,7)
masked_palette(0,0,fill_tiles=True)
masked_palette(1,1,fill_tiles=True)
while True:
    draw_masked(0,sheet,0,position,48)
    draw_masked(1,sheet,0,48-position,48)
    refresh_screen()
    position=(position+1)%8
    padding_b[474]+=1
    cycles+=1
    wait_frames(1)
`;
 fs.writeFileSync(dir+'/main.pysn',source);const name='scene-raster-runtime';
 const build=spawnSync(process.execPath,['src/cli.js',dir+'/main.pysn',name],{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(build.status,0,build.stdout+build.stderr);
 const run=spawnSync(emulatorPython(),['tests/scene-raster.py'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/PASS raster split/);
});
