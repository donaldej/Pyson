'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {compile}=require('../src/compiler'),{emulatorPython,root}=require('../scripts/environment');
const {fixture}=require('./masked-graphics-fixture'),{bmp}=require('./screen-images-fixture');
const f=fixture(),dir=path.resolve('build/tests/scene-maps');fs.mkdirSync(dir,{recursive:true});
fs.copyFileSync(path.join(f.dir,'sheet.bmp'),path.join(dir,'sheet.bmp'));
for(let variant=0;variant<2;variant++)fs.writeFileSync(path.join(dir,`scene${variant}.bmp`),bmp(512,144,(x,y)=>[255,170,85,0][(Math.floor(x/8)+Math.floor(y/8)*3+(x%8===y%8?1:0)+variant)%4]));
const filename=path.join(dir,'main.pysn');
const prefix='header.controller="mbc5"\nheader.target="dual"\na=masked_sheet("sheet.bmp",16,16)\ns=scene_map("scene0.bmp")\nt=scene_map("scene1.bmp")\n';
test('banked scenes reserve the maximum current scene, not the union; validate dimensions and renderer',()=>{
 const r=compile(prefix+'draw_scene(scene=s,camera_x=143)\ndraw_masked(0,a,0,154,24)\nrefresh_screen()',filename);
 assert.equal(r.assets.filter(a=>a.kind==='scene').length,2);assert.match(r.assembly,/SceneRasterInterrupt:/);assert.match(r.assembly,/DEF SCENE_ENABLED EQU 1/);
 const resident=r.graphics;assert.ok(r.banking.objects.filter(a=>/^AssetMap/.test(a.label)).length>=3);
 assert.throws(()=>compile('s=scene_map("scene0.bmp")\ndraw_scene(s)',filename),/requires masked_sheet/);
 assert.throws(()=>compile(prefix+'draw_scene()',filename),/argument|expects/);
});
test('scene pixel camera, configurable fixed HUD and masked edge composition on DMG/CGB',{skip:!fs.existsSync(emulatorPython())},()=>{
 for(const hud of [1,2,3,4,5,6]){
 const imports=prefix.replace(/scene_map\(("[^"\n]+")\)/g,`scene_map($1,hud_rows=${hud})`);
 const source=imports+'camera=0\nvariant=0\nready=0\noverlay=False\nclear_screen()\nbg_palette(0,"#FFFFFF","#AAAAAA","#555555","#000000")\nwhile True:\n    if variant:\n        draw_scene(t,camera)\n    else:\n        draw_scene(s,camera)\n    print("HUD",0,0)\n'+(hud===3?'    print("SCORE",0,2)\n':'')+'    draw_masked(0,a,0,154,16)\n    if overlay:\n        print("TEXT",0,16)\n    refresh_screen()\n    ready+=1\n    wait_frames(1)\n';
 const paletteSource=source.replace('camera=0\n','text_palette=0\ncamera=0\n').replace('print("HUD",0,0)','print("HUD",0,0,palette=text_palette)').replace('while True:', 'bg_palette(1,"#FF0000","#AA0000","#550000","#000000")\nbg_palette(2,"#00FF00","#00AA00","#005500","#000000")\nwhile True:');
 fs.writeFileSync(filename,paletteSource);const name=`scene-maps-runtime-${hud}`;
 const build=spawnSync(process.execPath,['src/cli.js',filename,name],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(build.status,0,build.stdout+build.stderr);
 const run=spawnSync(emulatorPython(),['tests/scene-maps.py'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000,env:{...process.env,SCENE_ROM_NAME:name,SCENE_HUD_ROWS:String(hud)}});assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/PASS scene pixels/);
 }
});
