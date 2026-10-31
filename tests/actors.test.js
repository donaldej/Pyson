'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compile}=require('../src/compiler'),{fixture}=require('./actors-fixture');

test('compact actor fonts retain printed text and optional diagnostics without counting metadata as text',()=>{
  const {compactFont}=require('../src/actor-font'),{parse}=require('../src/parser'),font=require('../src/font');
  const make=source=>compactFont(parse(source),'a.pysn');
  const basic=make('button("right")\nbutton_pressed("left")\nbg_palette(0,"#FFFFFF","#AAAAAA","#555555","#000000")');
  for(const char of ['#','h','l','|','>'])assert.equal(basic.ids.has(char),false,char);
  const literal=make('print("#hl|>",0,0)');
  const optional=make('p = pool(2,x=0)\nstart_dialogue("Hi")');
  for(const [active,text] of [[literal,'#hl|>'],[optional,'Invalid pool handle|>'],[basic,'Division by zeroIndex out of range']]){
    for(const char of text){
      const index=active.ids.get(char);assert.notEqual(index,undefined,char);
      assert.deepEqual(active.bytes.slice(index*16,index*16+16),font.bytes.slice(font.ids.get(char)*16,font.ids.get(char)*16+16));
    }
  }
});
test('actors bank sparse poses, allocate independent buffers and slots, and accept named arguments',()=>{
  const {filename}=fixture();
  const result=compile('header.controller = "mbc5"\na = actor_sheet("actor.bmp", width=16, height=16)\nb = actor_sheet("actor.bmp",16,16)\ndraw_actor(y=30, actor=a, x=20, frame=1, flip_x=True)\nhide_actor(b)\nrefresh_screen()',filename);
  assert.equal(result.assets.length,2);
  assert.equal(result.assets[0].kind,'actor');
  assert.equal(result.assets[0].actor.reservedSprites,2);
  assert.equal(result.assets[0].actor.firstSprite,38);
  assert.equal(result.assets[1].actor.firstSprite,36);
  assert.ok(result.assets[1].actor.tileBase>=result.assets[0].actor.tileBase+result.assets[0].actor.reservedTiles);
  assert.equal(result.assets[0].actorFrames[2].components,0);
  assert.ok(result.banking.objects.some(o=>o.kind==='actor-frame'));
  assert.match(result.assembly,/DEF ACTOR_ENABLED EQU 1/);
  assert.match(result.assembly,/call DrawActor/);
});
test('actor declarations reject invalid frames and resource conflicts without changing existing sprite imports',()=>{
  const {filename}=fixture();
  assert.throws(()=>compile('a = actor_sheet("actor.bmp",width=7,height=16)',filename),/multiples of 8/);
  assert.throws(()=>compile('a = actor_sheet("actor.bmp",16,16)\nw = worldmap("actor.bmp")',filename),/cannot share/);
  assert.throws(()=>compile('a = actor_sheet("actor.bmp",16,16)\ndraw_actor(a,0,1,2,unknown=True)',filename),/unknown|Unknown/);
  const plain=compile('s = sprite_sheet("actor.bmp",16,16)\nsprite(0,s,0,0,0)',filename);
  assert.equal(plain.assets[0].kind,'sprite');assert.equal(plain.assets[0].actor,undefined);
  assert.match(plain.assembly,/DEF ACTOR_ENABLED EQU 0/);
  const declarations=Array.from({length:21},(_,i)=>`a${i} = actor_sheet("actor.bmp",16,16)`).join('\n');
  assert.throws(()=>compile(declarations,filename),/more than 40/);
});
