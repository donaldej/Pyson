'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {root,emulatorPython}=require('../scripts/environment');const {fixture}=require('./masked-graphics-fixture');
const {compile}=require('../src/compiler');

test('large masked main code restores its bank after assets, arrays and nested helpers',{skip:!fs.existsSync(emulatorPython())},()=>{
 const f=fixture();
 const prefix=f.source.slice(0,f.source.indexOf('while True:'));
 const initialization=`warm=0\n${'warm+=1\n'.repeat(140)}values=[2,4,7]\ntable=constant_table([11,17])\ndef leaf(items):\n    show_image(still)\n    refresh_screen()\n    clear_screen()\n    return items[-1]+table[1]\nprobe_result=leaf(values)\nafter_bank_read=values[1]+table[0]\n`;
 for(const finite of [false,true]){
  const source=prefix+initialization+(finite?'draw_masked(0,a,0,19,23)\nrefresh_screen()\nready=1\n':f.source.slice(f.source.indexOf('while True:')));
  const name=`masked-main-${finite?'finite':'loop'}`,file=path.join(f.dir,name+'.pysn');fs.writeFileSync(file,source);
  const result=compile(source,file);assert.ok(result.banking.objects.some(o=>o.name==='$main'));
  const build=spawnSync(process.execPath,['src/cli.js',file,name],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(build.status,0,build.stdout+build.stderr);
  const run=spawnSync(emulatorPython(),['tests/masked-main.py',name,String(finite)],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/PASS banked main/);
 }
});
test('masked composition preserves four shades, overlap, clipping, facing and restoration on both models',{skip:!fs.existsSync(emulatorPython())},()=>{
 const f=fixture();fs.writeFileSync(f.filename,f.source);
 const build=spawnSync(process.execPath,['src/cli.js',f.filename,'masked-runtime'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(build.status,0,build.stdout+build.stderr);
 const run=spawnSync(emulatorPython(),['tests/masked-graphics.py'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/"pixel_cases": 20/);
});

test('large masked programs use fixed work RAM for static state without corrupting arrays or stack',{skip:!fs.existsSync(emulatorPython())},()=>{
 const f=fixture();
 const declarations=`spill_a=[${Array.from({length:300},(_,i)=>i+1).join(',')}]\nspill_b=[${Array(300).fill(0).join(',')}]\nrequest=0\ncompleted=0\nspill_result=0\nspill_value_b=0\ndef mutate(values,index):\n    values[index]+=3\n    return values[index]\n`;
 let source=f.source.replace('while True:',`${declarations}\nwhile True:\n    if request != completed:\n        spill_result=mutate(spill_a,173)\n        spill_b[299]=spill_result+17\n        spill_value_b=spill_b[299]\n        completed=request`);
 const file=f.filename.replace('main.pysn','spill.pysn');fs.writeFileSync(file,source);
 const build=spawnSync(process.execPath,['src/cli.js',file,'masked-spill-runtime'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(build.status,0,build.stdout+build.stderr);
 const run=spawnSync(emulatorPython(),['tests/masked-spill.py'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/"stack_boundary_preserved": true/);
});
