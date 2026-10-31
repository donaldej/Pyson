"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {compile}=require('../src/compiler'),{bmp}=require('./indexed-colors-fixture'),{root,emulatorPython}=require('../scripts/environment');
function fixture(legacy=false){
 const dir=path.join(root,'build/tests/image-families');fs.mkdirSync(dir,{recursive:true});
 const a=bmp(160,144,8),b=Buffer.from(a),offset=b.readUInt32LE(10),stride=160;
 for(let y=0;y<8;y++)for(let x=0;x<8;x++)b[offset+(143-y)*stride+x]^=1;
 const c=Buffer.from(a);c[54]=255-c[54];c[55]=255-c[55];c[56]=255-c[56];
 const gray=require('./screen-images-fixture').bmp,shades=[255,170,85,0];
 const files=legacy?[['a',gray(160,144,(x,y)=>shades[(x+y)%4])],['b',gray(160,144,(x,y)=>shades[((x+y)%4)^((x<8&&y<8)?1:0)])],['c',gray(160,144,()=>255)]]:[['a',a],['b',b],['c',c]];
 for(const [name,data] of files)fs.writeFileSync(path.join(dir,name+(legacy?'-legacy':'')+'.bmp'),data);
 const source=`header.target="dual"
header.controller="mbc5"
a=screen_image("a.bmp",palettes=8)
b=screen_image("b.bmp",palettes=8)
c=screen_image("c.bmp",palettes=8)
request=0
completed=-1
show_image(a)
refresh_screen()
while True:
    if request!=completed:
        if request==1:
            show_image(b)
        elif request==2:
            show_image(a)
        elif request==3:
            show_image(c)
        elif request==4:
            show_image(b)
        refresh_screen()
        completed=request
    wait_frames(1)
`;
 return {dir,source:legacy?source.replace(/palettes=8/g,'palettes=1').replace(/([abc])\.bmp/g,'$1-legacy.bmp'):source,filename:path.join(dir,legacy?'main-legacy.pysn':'main.pysn')};
}
test('compatible exclusive images share tile numbering without grouping incompatible palettes',()=>{
 const f=fixture(),c=compile(f.source,f.filename),[a,b,other]=c.assets;
 assert.ok(a.imageFamily);assert.equal(a.imageFamily,b.imageFamily);assert.equal(other.imageFamily,undefined);
 assert.deepEqual(a.tiles,b.tiles);assert.equal(a.maps[0].filter((v,i)=>v!==b.maps[0][i]).length,1);
 assert.equal(a.screenData[0],a.imageFamily);assert.equal(other.screenData[0],0);assert.match(c.assembly,/UpdateImageFamily:/);
});
test('image updates preserve LCD, frame interrupts and atomic pictures on DMG/CGB at both CPU speeds',{skip:!fs.existsSync(emulatorPython())},()=>{
 for(const legacy of [false,true]){
 const f=fixture(legacy);
 for(const speed of ['normal','double']){
  const file=path.join(f.dir,speed+'.pysn'),name='image-families-'+(legacy?'legacy-':'')+speed;
  fs.writeFileSync(file,'header.cpu_speed="'+speed+'"\n'+f.source);
  const build=spawnSync(process.execPath,['src/cli.js',file,name],{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(build.status,0,build.stdout+build.stderr);
  const run=spawnSync(emulatorPython(),['tests/image-families.py',name],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/PASS live image families/);
 }
 }
});
