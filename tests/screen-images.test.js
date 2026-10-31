'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {compile}=require('../src/compiler');
const dir=path.resolve(__dirname,'../build/tests/screen-images');fs.mkdirSync(dir,{recursive:true});
const {bmp}=require('./screen-images-fixture');
// 256 distinct patterns; the final 104 cells repeat them. Include all four shades.
fs.writeFileSync(path.join(dir,'screen.bmp'),bmp(160,144,(x,y)=>[255,170,85,0][y%8===0?((Math.floor(y/8)*20+Math.floor(x/8))%256>>(x%8)&1):y%4]));
fs.writeFileSync(path.join(dir,'small.bmp'),bmp(8,8,()=>255));
fs.writeFileSync(path.join(dir,'actor.bmp'),require('./actors-fixture').fixture().data);
const filename=path.join(dir,'main.pysn');
test('exclusive screen patterns are banked independently of resident/actor/clip budgets',()=>{
 const result=compile('header.controller="mbc5"\na=screen_image(path="screen.bmp")\nb=screen_image("screen.bmp")\nactor=actor_sheet("actor.bmp",16,16)\nclip=background_clip("actor.bmp",16,16)\nshow_image(image=a)\nclear_screen()\ndraw_actor(actor,0,0,0)\ndraw_background(clip,0)\nrefresh_screen()',filename);
 assert.equal(result.assets.filter(a=>a.kind==='screen').length,1);
 const screen=result.assets.find(a=>a.kind==='screen');assert.equal(screen.tileCount,256);assert.equal(screen.romBytes,11+4096+360);
 assert.ok(result.banking.objects.find(a=>a.label===screen.label).bytes===4467);
 assert.match(result.assembly,/DEF SCREEN_IMAGE_ENABLED EQU 1/);assert.match(result.assembly,/call ShowImage/);assert.match(result.assembly,/call RestoreImageGraphics/);
 assert.ok(result.assets.find(a=>a.kind==='clip').clip.patternsPerBuffer<10);
});
test('screen imports validate exact size, declarations, arguments and incompatible renderers',()=>{
 for(const source of ['a=screen_image("small.bmp")','a=screen_image(3)','def f():\n    a=screen_image("screen.bmp")','a=screen_image("screen.bmp")\nshow_image()','a=screen_image("screen.bmp")\nshow_window()','a=screen_image("screen.bmp")\nset_camera(0,0)'])assert.throws(()=>compile(source,filename),/160x144|literal|top-level|argument|screen.*image|fixed background/i,source);
});
test('ordinary graphics programs do not include screen-image runtime or state',()=>{
 const r=compile('print("HI",0,0)\nrefresh_screen()',filename);assert.match(r.assembly,/DEF SCREEN_IMAGE_ENABLED EQU 0/);assert.doesNotMatch(r.assembly,/ShowImage:|wImageActive: ds/);
});
module.exports={dir,bmp};

test('atlas selections reuse conversion within one compile and see BMP edits on the next',()=>{
 const file=path.join(dir,'atlas.bmp');
 const image=bmp(16,8,(x,y)=>[255,170,85,0][(x%8+(x<8?y:7-y))%4]);fs.writeFileSync(file,image);
 const source='a=tile("atlas.bmp",x=0,y=0)\nb=tile("atlas.bmp",x=1,y=0)\nc=tile("atlas.bmp",x=0,y=0,terrain=2)\nm=tilemap([[a,b,c]])\ndraw_map(m,0,0)';
 const original=fs.readFileSync;let reads=0;
 try{
  fs.readFileSync=function(name,...args){if(path.resolve(String(name))===file)reads++;return original.call(this,name,...args);};
  const first=compile(source,filename);assert.equal(reads,1);assert.notEqual(first.assets[0].maps[0][0],first.assets[1].maps[0][0]);
  image[54]=image[55]=image[56]=170;fs.writeFileSync(file,image);
  const next=compile(source,filename);assert.equal(reads,2);assert.notEqual(first.assembly,next.assembly);
 }finally{fs.readFileSync=original;}
});
