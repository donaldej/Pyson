'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const {root,emulatorPython}=require('../scripts/environment');
test('Phase Heart renders a live field and responds to perturbation on DMG and CGB',{skip:!fs.existsSync(emulatorPython())},()=>{
 const build=spawnSync(process.execPath,['src/cli.js','examples/phase-heart/main.pysn','phase-heart'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});
 assert.equal(build.status,0,build.error?.message||build.stdout+build.stderr);
 const report=JSON.parse(fs.readFileSync(root+'/build/phase-heart.report.json'));
 assert.ok(report.romBytes<=32768);
 assert.ok(report.assets.every(asset=>asset.kind==='tile'||asset.kind==='sprite'));
 assert.equal(report.graphics.backgroundClips,undefined);
 const run=spawnSync(emulatorPython(),['tests/phase-heart.py'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});
 assert.equal(run.status,0,run.error?.message||run.stdout+run.stderr);console.log(run.stdout.trim());
});
