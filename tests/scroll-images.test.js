'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {compile}=require('../src/compiler'),{root,emulatorPython}=require('../scripts/environment'),{bmp}=require('./screen-images-fixture');
const dir=path.resolve('build/tests/scroll-images');fs.mkdirSync(dir,{recursive:true});const filename=path.join(dir,'main.pysn');
fs.writeFileSync(path.join(dir,'credits.bmp'),bmp(160,512,(x,y)=>[255,170,85,0][(Math.floor(y/8)+Math.floor(x/8)*3+(x%8===y%8?1:0))%4]));
test('tall exclusive images stay outside resident graphics and validate size',()=>{
 const r=compile('a=scroll_image("credits.bmp")\nshow_scroll(a,90)\nrefresh_screen()',filename);
 assert.match(r.assembly,/ShowScroll:/);assert.equal(r.assets[0].kind,'scroll');assert.equal(r.assets[0].tileCount,4);
 assert.throws(()=>compile('a=scroll_image("credits.bmp")\nshow_scroll()',filename),/argument|expects/);
});
test('tall image ring and pixel scrolling on DMG/CGB',{skip:!fs.existsSync(emulatorPython())},()=>{
 fs.writeFileSync(filename,'header.controller="mbc5"\na=scroll_image("credits.bmp")\ny=0\nready=0\nwhile True:\n    show_scroll(a,y)\n    refresh_screen()\n    ready+=1\n    wait_frames(1)\n');
 const build=spawnSync(process.execPath,['src/cli.js',filename,'scroll-images-runtime'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(build.status,0,build.stdout+build.stderr);
 const run=spawnSync(emulatorPython(),['tests/scroll-images.py'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/PASS scroll images/);
});
