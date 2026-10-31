'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),{spawnSync}=require('child_process');
const {convertIndexedBMP}=require('../src/assets'),{compile}=require('../src/compiler'),{fixture,bmp}=require('./indexed-colors-fixture'),{emulatorPython,root}=require('../scripts/environment');
test('indexed CGB groups share patterns and preserve explicit DMG shade numbers',()=>{
 const r=convertIndexedBMP(bmp(160,144,8),'background',8);assert.equal(r.tiles.length,1);assert.equal(r.dmgPalette,0x1b);assert.equal(r.palettes.length,8);assert.equal(new Set(r.attributes).size,8);assert.equal(r.quantized,false);
 assert.throws(()=>convertIndexedBMP(bmp(160,144,8,(x)=>x%2),'background',8),/tile.*mixes palette/);
 assert.throws(()=>convertIndexedBMP(bmp(160,144,8),'background',3),/outside palettes/);
 const f=fixture(),c=compile(f.source,f.filename);assert.match(c.assembly,/DEF IMAGE_MULTIPALETTE EQU 1/);assert.match(c.assembly,/wImageSavedPalette: ds 64/);assert.equal(c.assets.find(a=>a.kind==='scene').paletteCount,3);
 assert.throws(()=>compile(f.source.replace('palettes=3','palettes=5'),f.filename),/1\.\.4/);
});
test('indexed arenas/screens retain their colors across camera phases, screen replacements and scrolling',{skip:!fs.existsSync(emulatorPython())},()=>{
 const f=fixture();
 fs.writeFileSync(f.dir+'/palettes.json',JSON.stringify(require('./indexed-colors-fixture').palettes));
 for(const fill of [false,true]){
  const name=fill?'indexed-fill-runtime':'indexed-colors-runtime',file=f.dir+'/'+name+'.pysn',source=fill?f.source.replace('while True:','while True:\n    masked_palette(0,0,fill_tiles=True)'):f.source;fs.writeFileSync(file,source);
  const c=compile(source,file);assert.match(c.assembly,fill?/wImageSavedPalette: ds 8/:/wImageSavedPalette: ds 64/);
  const build=spawnSync(process.execPath,['src/cli.js',file,name],{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(build.status,0,build.stdout+build.stderr);
  const run=spawnSync(emulatorPython(),['tests/indexed-colors.py',name],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/PASS indexed colors/);
 }
});
