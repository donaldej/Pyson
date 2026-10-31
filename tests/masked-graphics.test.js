'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compile}=require('../src/compiler');const {fixture}=require('./masked-graphics-fixture');
test('masked sheets retain four opaque shades and independent transparency without object sprites',()=>{
 const f=fixture(),r=compile(f.source,f.filename),a=r.assets.find(a=>a.kind==='masked');
 const report=require('../src/build-report').makeGraphicsReport(r.assets);assert.equal(report.maskedComposition.cartridgeScratchBytes,4096);assert.ok(report.assets.find(x=>x.kind==='masked').romDataBytes>0);
 assert.equal(a.sourceColors,4);assert.equal(a.quantized,false);assert.equal(a.frames,3);
 assert.match(r.assembly,/DEF MASKED_ENABLED EQU 1/);assert.match(r.assembly,/call DrawMasked/);assert.match(r.assembly,/wMaskedBase: ds 576/);
 assert.ok(r.banking.objects.filter(o=>o.label.startsWith('Masked')).length<64);
 assert.equal(r.header.ram_kb,8); // Explicitly volatile graphics workspace, without save support.
 assert.match(r.assembly,/ld de, \$A000/);
 assert.throws(()=>compile('header.battery=True\nheader.ram_kb=8\n'+f.source,f.filename),/battery-backed/);
});
test('masked imports reject lossy assets, competing renderers and invalid declarations',()=>{
 const f=fixture();
 for(const source of ['a=masked_sheet("sheet.bmp",7,16)','def f():\n    a=masked_sheet("sheet.bmp",16,16)','a=masked_sheet("sheet.bmp",16,16)\nb=actor_sheet("sheet.bmp",16,16)','a=masked_sheet("sheet.bmp",16,16)\nb=background_clip("sheet.bmp",16,16)'])assert.throws(()=>compile(source,f.filename),/dimensions|top-level|cannot be combined/i);
 assert.throws(()=>compile('draw_masked(0,0,0,0,0)',f.filename),/requires a masked_sheet/);
 const ordinary=compile('print("HI",0,0)');assert.doesNotMatch(ordinary.assembly,/ComposeMasked:|wMaskedBase:/);
});
const fs=require('node:fs');
const {importSheet,prepare}=require('../src/masked-graphics');
test('shared masked scanlines decode exactly for every frame, facing and pixel shift',()=>{
 const f=fixture();const asset=importSheet(fs.readFileSync(require('node:path').join(require('node:path').dirname(f.filename),'sheet.bmp')),16,16,0,'sheet.bmp');
 const expected=structuredClone(asset.payload);const unshared=expected.reduce((sum,rows)=>sum+rows.length*2+rows.flat().length,0);
 const result=prepare([asset],[]);let stored=0;
 expected.forEach((rows,i)=>{
  const object=result.objects.find(o=>o.label===asset.variantLabels[i]);assert.ok(object);
  const [top,height]=object.body.split('    db ')[1].split('\n')[0].split(',').map(Number);
  const offsets=[...object.body.matchAll(/dw Masked0Frame\d+ \+ (\d+)/g)].map(m=>Number(m[1]));
  const data=(object.body.split('    db ')[2]||'').split(',').filter(s=>s.trim()).map(Number);assert.equal(offsets.length,height);
  rows.forEach((row,y)=>{if(y<top||y>=top+height)assert.deepEqual(row,[255,0,0]);else assert.deepEqual(data.slice(offsets[y-top]-2-height*2,offsets[y-top]-2-height*2+row.length),row,`variant ${i}, row ${y}`);});
  assert.equal(object.bytes,2+height*2+data.length);if(asset.variantLabels.indexOf(object.label)===i)stored+=object.bytes;
 });
 assert.ok(stored<unshared,'repeated/transparent rows should save cartridge space');
});
