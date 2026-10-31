'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {compile}=require('../src/compiler');
const {spawnSync}=require('node:child_process'),{assemble}=require('../scripts/dev'),{emulatorPython,root}=require('../scripts/environment');
const dir=path.resolve('build/tests/apu');fs.mkdirSync(dir,{recursive:true});
const audio={format:'pyson-apu-1',frames:4,loop:1,events:[[0,0x26,0x80],[0,0x24,0x77],[0,0x25,0xff],[0,0x12,0xf0],[0,0x13,0x40],[0,0x14,0x87],[1,0x13,0x80],[2,0x13,0xc0]]};
fs.writeFileSync(path.join(dir,'sound.json'),JSON.stringify(audio));
const filename=path.join(dir,'main.pysn');
test('APU streams are optional, banked, and validate imported events',()=>{
 const ordinary=compile('print(1,0,0)',filename);assert.doesNotMatch(ordinary.assembly,/APUStart:/);
 const source='a=audio_file("sound.json")\nplay_audio(a)\nwait_frames(30)\nstop_audio()';
 const r=compile(source,filename);assert.match(r.assembly,/APUStart:/);assert.ok(r.banking.objects.some(o=>o.kind==='apu'));
 assert.throws(()=>compile('a=audio_file("sound.json")\nplay_audio(a,2)',filename),/slot 0/);
 for(const bad of [ {...audio,loop:4}, {...audio,events:[[2,0x12,0],[1,0x12,0]]}, {...audio,events:[[0,0x40,0]]} ]) {
  fs.writeFileSync(path.join(dir,'bad.json'),JSON.stringify(bad));assert.throws(()=>compile('a=audio_file("bad.json")\nplay_audio(a)',filename),/Audio/);
 }
 fs.writeFileSync(filename,'header.controller="mbc5"\na=audio_file("sound.json")\nphase=0\nplay_audio(a)\nwhile True:\n    wait_frames(1)\n    phase+=1\n');
});
test('audio crosses ninth-bit MBC5 banks and repeats without losing code bank',{skip:!fs.existsSync(emulatorPython())},()=>{
 const long={format:'pyson-apu-1',frames:4001,loop:2000,events:[...audio.events.slice(0,6),...Array.from({length:4000},(_,i)=>[i+1,0x13,(i+1)&255])]};
 fs.writeFileSync(path.join(dir,'long.json'),JSON.stringify(long));
 const source='header.controller="mbc5"\nheader.rom_kb=8192\na=audio_file("long.json")\nphase=0\ndef run():\n    global phase\n    play_audio(a)\n    while True:\n        wait_frames(1)\n        phase+=1\nrun()';
 const r=compile(source,filename);assert.ok(r.banking.objects.filter(o=>o.kind==='apu').length>=2);
 const asm=path.join(dir,'runtime.asm');fs.writeFileSync(asm,r.assembly.replace(/(SECTION "APUDefinition\d+Part(\d+) data", ROMX\[\$[0-9a-f]+\], BANK\[)\d+(\])/g,(_,prefix,part,suffix)=>prefix+(300+Number(part))+suffix));
 assemble(asm,'apu-streams-runtime');
 const run=spawnSync(emulatorPython(),['tests/apu-streams.py'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/PASS banked audio/);
});
