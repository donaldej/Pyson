'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {fixture}=require('./actors-fixture'),{compile}=require('../src/compiler'),{convertBMP}=require('../src/assets'),{assemble}=require('../scripts/dev'),{emulatorPython,root}=require('../scripts/environment');
for(const mode of ['window','hybrid','mixed'])test(`actors preserve packed pixels, flips, cache and safe buffers with ${mode} graphics on DMG/CGB`,{skip:!fs.existsSync(emulatorPython())},()=>{
  const {directory,filename,data,largeData}=fixture();
  const init=mode==='hybrid'?'back = background_clip("actor.bmp",16,16)\nlast_stage = -1':mode==='mixed'?'small = sprite_sheet("actor.bmp",16,16)\nsprite(0,small,0,130,50)':'window_position(0,128)\nshow_window()';
  const source=`header.target = "dual"
header.cpu_speed = "double"
header.controller = "mbc5"
a = actor_sheet("actor.bmp",16,16)
b = actor_sheet("actor.bmp",16,16)
c = actor_sheet("large.bmp",32,32)
${init}
print(format_text("Font~{}xyz",12),0,3)
stage = 0
while True:
${mode==='hybrid'?'    if stage != last_stage:\n        draw_background(back,stage % 3,0,0)\n        last_stage = stage\n':''}
    if stage == 0:
        draw_actor(a,0,20,30)
        draw_actor(b,1,80,30)
        draw_actor(c,0,20,60)
    elif stage == 1:
        draw_actor(a,1,20,30,True,True)
        draw_actor(b,2,80,30)
        draw_actor(c,0,30,70,True,True)
    elif stage == 2:
        draw_actor(a,1,-4,-4,True,True)
        draw_actor(c,0,-4,-4,True,True)
    elif stage == 3:
        draw_actor(a,0,20,30)
        draw_actor(a,1,20,30)
        draw_actor(c,0,20,60)
        stage = 5
    elif stage == 4:
        hide_actor(a)
        hide_actor(c)
        draw_actor(255,0,0,0)
        draw_actor(b,255,0,0)
    refresh_screen()
`;
  const name='actors-runtime-'+mode;
  const result=compile(source,filename),asm=path.join(directory,name+'.asm');fs.writeFileSync(asm,result.assembly);
  const rom=assemble(asm,name);
  const font=require('../src/font');
  const fontRefs=[...'Font~12xyz'].map(char=>font.bytes.slice(font.ids.get(char)*16,font.ids.get(char)*16+16));
  fs.writeFileSync(path.join(directory,name+'.json'),JSON.stringify({rom,mode,fontRefs,symbolFile:path.join(root,'build',name+'.sym'),assets:result.assets,symbols:result.symbols,sources:{0:convertBMP(data,'actor',16,16),1:convertBMP(data,'actor',16,16),2:convertBMP(largeData,'actor',32,32)}}));
  const run=spawnSync(emulatorPython(),['tests/actors.py',path.join(directory,name+'.json')],{cwd:root,encoding:'utf8',timeout:120000,windowsHide:true});
  assert.equal(run.status,0,run.error?.message||run.stdout+run.stderr);console.log(run.stdout.trim());
});
