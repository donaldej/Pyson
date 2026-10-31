'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const {compile}=require('../src/compiler');const {colorFixture}=require('./masked-color-fixture');const {emulatorPython,root}=require('../scripts/environment');
test('CGB masked color is opt-in, shares the base image, and reserves explicit private resources',()=>{
 const f=colorFixture(),r=compile(f.source,f.filename);assert.match(r.assembly,/DEF MASKED_TINT_ENABLED EQU 1/);assert.match(r.assembly,/wTintPalettes: ds 4/);assert.ok(r.banking.objects.some(o=>o.label==='MaskedTintEngine'&&o.bytes===4096));
 assert.equal(r.header.ram_kb,32);assert.match(r.assembly,/DEF MASKED_TINT_CACHE_ENABLED EQU 1/);
 const small=compile(f.source.replace('header.controller="mbc5"','header.controller="mbc5"\nheader.ram_kb=8'),f.filename);assert.equal(small.header.ram_kb,8);assert.match(small.assembly,/DEF MASKED_TINT_CACHE_ENABLED EQU 0/);
 const plain=compile('print("HELLO",0,0)');assert.match(plain.assembly,/DEF MASKED_TINT_ENABLED EQU 0/);assert.doesNotMatch(plain.assembly,/MaskedTintEngine:|wTintPalettes:/);
 assert.throws(()=>compile('masked_palette(0,1)'),/requires.*masked_sheet/);assert.throws(()=>compile('is_cgb(1)'),/no arguments|too many/);
 const dynamic=compile('slot=1\nsprite_palette(slot,0,1,2,3)\ncolor=is_cgb()');assert.match(dynamic.assembly,/cp 8/);assert.throws(()=>compile('sprite_palette(8,0,1,2,3)'),/0\.\.7/);
});
test('CGB color overlays preserve exact ownership, clipping and DMG pixels, including spilled source arrays',{skip:!fs.existsSync(emulatorPython())},()=>{
 const f=colorFixture();for(const spill of [false,true,'uncached']){
  let source=f.source;
  if(spill==='uncached')source='header.ram_kb=8\n'+source;
  if(spill===true){
   source=source.replace('while True:',`spill_a=[${Array.from({length:300},(_,i)=>i+1).join(',')}]
spill_b=[${Array(300).fill(0).join(',')}]
request=0
completed=0
spill_result=0
def mutate(values,index):
    values[index]+=3
    return values[index]
while True:
    if request!=completed:
        spill_result=mutate(spill_a,173)
        spill_b[299]=spill_result+17
        completed=request`);
  }
  const name=spill==='uncached'?'masked-color-small-runtime':spill?'masked-color-spill-runtime':'masked-color-runtime',file=f.dir+'/'+name+'.pysn';fs.writeFileSync(file,source);
  const build=spawnSync(process.execPath,['src/cli.js',file,name],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(build.status,0,build.stdout+build.stderr);
  const run=spawnSync(emulatorPython(),['tests/masked-color.py'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000,env:{...process.env,MASKED_COLOR_ROM:name}});assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/PASS masked color/);
 }
});
test('opaque tile fill colors large bodies without consuming OAM and restores private memory',{skip:!fs.existsSync(emulatorPython())},()=>{
 const f=colorFixture();
 for(const mode of ['cached','spill','small']){
  let source=f.source.replace('while True:','fill_enabled=True\nwhile True:').replace(/masked_palette\(([^\n)]*)\)/g,(_,args)=>`masked_palette(${args},fill_tiles=fill_enabled)`);
  if(mode==='small')source='header.ram_kb=8\n'+source;
  if(mode==='spill')source=source.replace('while True:',`spill_a=[${Array.from({length:300},(_,i)=>i+1).join(',')}]\nspill_b=[${Array(300).fill(0).join(',')}]\nrequest=0\ncompleted=0\nspill_result=0\ndef mutate(values,index):\n    values[index]+=3\n    return values[index]\nwhile True:\n    if request!=completed:\n        spill_result=mutate(spill_a,173)\n        spill_b[299]=spill_result+17\n        completed=request`);
  const name='masked-fill-'+mode+'-runtime',file=f.dir+'/'+name+'.pysn';fs.writeFileSync(file,source);
  const c=compile(source,file);assert.match(c.assembly,/DEF MASKED_FILL_ENABLED EQU 1/);assert.ok(c.banking.objects.some(o=>o.label==='MaskedTintEngine'&&o.bytes===8192));
  const build=spawnSync(process.execPath,['src/cli.js',file,name],{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(build.status,0,build.stdout+build.stderr);
  const run=spawnSync(emulatorPython(),['tests/masked-color.py'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000,env:{...process.env,MASKED_COLOR_ROM:name}});assert.equal(run.status,0,run.stdout+run.stderr);
 }
});
