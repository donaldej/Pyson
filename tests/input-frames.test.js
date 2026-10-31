'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {compile}=require('../src/compiler'),{emulatorPython,root}=require('../scripts/environment');
test('ordered input history is opt-in and validates its ordinary button names',()=>{
 const normal=compile('x=button("a")');
 assert.match(normal.assembly,/DEF INPUT_FRAMES_ENABLED EQU 0/);
 assert.doesNotMatch(normal.assembly,/wInputFrames: ds/);
 const recorded=compile('clear_input_frames()\nx=next_input_frame()\ny=input_button(name="A")\nz=input_frames_lost()');
 assert.match(recorded.assembly,/DEF INPUT_FRAMES_ENABLED EQU 1/);
 assert.match(recorded.assembly,/wInputFrames: ds 64/);
 assert.throws(()=>compile('x=input_button("fire")'),/literal button name/);
 assert.throws(()=>compile('x=next_input_frame(1)'),/expects no arguments|too many/);
});
test('ordered input history retains physical-frame order, wraps and reports overflow on both models',{skip:!fs.existsSync(emulatorPython())},()=>{
 const dir=path.join(root,'build/tests/input-frames');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'main.pysn'),`header.target="dual"
mode=0
request=0
completed=0
count=0
lost=0
empty=0
samples=[${Array(128).fill(0).join(',')}]
while True:
    if request != completed:
        if mode == 1:
            clear_input_frames()
            empty=input_button("a")
        elif mode == 2:
            count=0
            while next_input_frame():
                value=0
                if input_button("right"):
                    value |= BUTTON_RIGHT
                if input_button("left"):
                    value |= BUTTON_LEFT
                if input_button("up"):
                    value |= BUTTON_UP
                if input_button("down"):
                    value |= BUTTON_DOWN
                if input_button("a"):
                    value |= BUTTON_A
                if input_button("b"):
                    value |= BUTTON_B
                if input_button("start"):
                    value |= BUTTON_START
                if input_button("select"):
                    value |= BUTTON_SELECT
                samples[count]=value
                count+=1
            lost=input_frames_lost()
            empty=input_button("a")
        completed=request
    read_buttons()
    read_buttons()
    wait_frames(1)
`);
 const built=spawnSync(process.execPath,['src/cli.js',path.join(dir,'main.pysn'),'input-frames-runtime'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(built.status,0,built.stdout+built.stderr);
 const run=spawnSync(emulatorPython(),['tests/input-frames.py'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/PASS 2 models/);
});

test('masked input history preserves long runs, frame timing and bounded worst-case transitions',{skip:!fs.existsSync(emulatorPython())},()=>{
 const f=require('./masked-graphics-fixture').fixture();
 const buttons=['right','left','up','down','a','b','select','start'];
 const source=`header.target="dual"
header.controller="mbc5"
header.cpu_speed="double"
sheet=masked_sheet("sheet.bmp",16,16)
mode=0
request=0
completed=0
count=0
lost=0
empty=0
samples=[${Array(512).fill(0).join(',')}]
while True:
    if request!=completed:
        if mode==1:
            clear_input_frames()
            empty=input_button("a")
        else:
            count=0
            while next_input_frame():
                value=0
${buttons.map(b=>`                if input_button("${b}"):\n                    value|=BUTTON_${b.toUpperCase()}`).join('\n')}
                samples[count]=value
                count+=1
            lost=input_frames_lost()
            empty=input_button("a")
        completed=request
    read_buttons()
    read_buttons()
    wait_frames(1)
`;
 assert.match(compile(source,path.join(f.dir,'masked-input.pysn')).assembly,/wInputFrames: ds 128/);
 const file=path.join(f.dir,'masked-input.pysn');fs.writeFileSync(file,source);
 const build=spawnSync(process.execPath,['src/cli.js',file,'masked-input-frames-runtime'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(build.status,0,build.stdout+build.stderr);
 const run=spawnSync(emulatorPython(),['tests/masked-input-frames.py'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/PASS masked input 2 models/);
});
