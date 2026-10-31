'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {root,emulatorPython}=require('../scripts/environment');
const {bmp}=require('./screen-images-fixture');
test('exclusive screens preserve all patterns, DMG fades, pending replacement and restored actor/clip/text',{skip:!fs.existsSync(emulatorPython())},()=>{
 const name='screen-images-runtime',dir=path.join(root,'build/tests',name);fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'screen.bmp'),bmp(160,144,(x,y)=>[255,170,85,0][y%8===0?((Math.floor(y/8)*20+Math.floor(x/8))%256>>(x%8)&1):y%4]));
 fs.writeFileSync(path.join(dir,'two.bmp'),bmp(160,144,(x,y)=>(x+y)%7===0?255:0));
 fs.writeFileSync(path.join(dir,'actor.bmp'),require('./actors-fixture').fixture().data);
 fs.writeFileSync(path.join(dir,'main.pysn'),`header.target="dual"
header.controller="mbc5"
full=screen_image("screen.bmp")
two=screen_image("two.bmp")
actor=actor_sheet("actor.bmp",16,16)
clip=background_clip("actor.bmp",16,16)
phase=0
bg_palette(0,"#FF0000","#00FF00","#0000FF","#000000")
show_image(full)
while True:
    read_buttons()
    if button_pressed("a"):
        clear_screen()
        print("KEEP",0,0)
        draw_actor(actor,0,80,80)
        draw_background(clip,0,2,2)
        phase=1
    elif button_pressed("b"):
        show_image(full)
        phase=0
    elif button_pressed("select"):
        show_image(two)
        phase=2
    elif button_pressed("up"):
        bg_palette(0,"#AAAAAA","#000000","#000000","#000000")
        phase=3
    elif button_pressed("down"):
        show_image(-1)
        show_image(256)
        show_image(clip)
    elif button_pressed("start"):
        show_image(full)
        show_image(two)
        phase=2
    refresh_screen()
`);
 const build=spawnSync(process.execPath,['src/cli.js',path.join(dir,'main.pysn'),name],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(build.status,0,build.error?.message||build.stdout+build.stderr);
 const run=spawnSync(emulatorPython(),['tests/screen-images.py',name],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/"passed": true/);
});
