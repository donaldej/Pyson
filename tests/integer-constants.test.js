'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {compile}=require('../src/compiler'),{emulatorPython,root}=require('../scripts/environment');
test('constant integer operations preserve evaluation and avoid generic arithmetic loops',()=>{
 const r=compile('x=7\na=x*15\nb=x//8\nc=x%256\nx*=3\nx//=4\nx%=16');
 assert.doesNotMatch(r.assembly.split('MainFinish:')[0],/call (Mul16|Div16)/);
 assert.match(r.assembly,/sra h/);assert.throws(()=>compile('x=1\nx=x//0'),/Division by zero/);
 assert.throws(()=>compile('x=1\nx=x*32768'),/16-bit/);
});

test('nonzero literal division omits unreachable source diagnostics while dynamic divisors retain them',()=>{
 const literal=compile('x=17\na=x//3\nb=x%-3');
 assert.match(literal.assembly.split('MainFinish:')[0],/call Div16/);
 assert.doesNotMatch(literal.assembly,/wErrorContext:/);
 const dynamic=compile('x=17\nd=3\na=x//d');
 assert.match(dynamic.assembly,/wErrorContext:/);
 assert.match(dynamic.assembly.split('MainFinish:')[0],/ld \[wErrorContext\], a/);
 assert.throws(()=>compile('x=17\na=x%0'),/Division by zero/);
});
test('optimized signed arithmetic agrees with Python at boundaries and random inputs on both models',{skip:!fs.existsSync(emulatorPython())},()=>{
 const dir=path.join(root,'build/tests/integer-constants');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'main.pysn'),`header.target="dual"
x=0
ready=0
calls=0
def touch():
    global calls
    calls+=1
    return 32767
effects=0
def probe():
    global effects
    effects+=1
    return 1
side=touch()*0
while True:
    a=x*15
    b=x*-127
    c=x//8
    d=x%8
    e=x//256
    f=x%256
    g=x//16384
    h=x%16384
    i=x*-1
    j=x*0
    k=x*1
    u=x
    u*=3
    v=x
    v//=4
    w=x
    w%=16
    flags=0
    if x == -17:
        flags+=1
    if x != -17:
        flags+=2
    if x < -17:
        flags+=4
    if x <= -17:
        flags+=8
    if x > -17:
        flags+=16
    if x >= -17:
        flags+=32
    if x == 0:
        flags+=64
    if x != 0:
        flags+=128
    if not x:
        flags+=256
    effects=0
    if x < 0 and probe() > 0:
        flags+=512
    if x >= 0 or probe() > 0:
        flags+=1024
    if not (x < 0 or x == 0):
        flags+=2048
    ready+=1
    refresh_screen()
`);
 const build=spawnSync(process.execPath,['src/cli.js',path.join(dir,'main.pysn'),'integer-constants-runtime'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(build.status,0,build.stdout+build.stderr);
 const run=spawnSync(emulatorPython(),['tests/integer-constants.py'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/"passed": true/);
});
