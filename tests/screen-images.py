"""Optional PyBoy check: no original game ROM or extracted assets needed."""
from pathlib import Path
import io,json,sys
import numpy as np
from pyboy import PyBoy
name=sys.argv[1];syms={}
for line in Path('build/'+name+'.sym').read_text().splitlines():
    if line and not line.startswith(';'):
        address,label=line.split();syms[label]=int(address.split(':')[1],16)
results=[]
for cgb in [False,True]:
    p=PyBoy('binary/'+name+'.gb',window='null',cgb=cgb,sound_emulated=False,ram_file=io.BytesIO(),color_palette=(0xffffff,0xaaaaaa,0x555555,0));p.set_emulation_speed(0)
    unsafe=[]
    # Force the LY comparison to observe the final VBlank line once. The
    # shutdown must loop again: LY can roll to zero before the LCD write.
    late={'forced':False,'pending':False,'retried':False}
    compare=syms['ImageLCDOff.off']-8
    assert bytes(p.memory[compare:compare+2])==bytes([0xfe,144])
    def late_line(_):
        if not late['forced']:
            p.register_file.A=153;late['forced']=True;late['pending']=True
    def retry(_):
        if late['pending']:late['retried']=True;late['pending']=False
    p.hook_register(0,compare,late_line,None)
    p.hook_register(0,syms['ImageLCDOff.wait'],retry,None)
    def off(_):
        if late['pending']:unsafe.append(('accepted final VBlank line',153))
        if p.memory[0xff40]&128 and p.memory[0xff44]<144:unsafe.append(('LCD disabled outside VBlank',p.memory[0xff44]))
    def copy(_):
        if 0x8000<=((p.register_file.D << 8) | p.register_file.E)<0xa000 and p.memory[0xff40]&128:unsafe.append(('exclusive upload while LCD active',p.memory[0xff44]))
    p.hook_register(0,syms['ImageLCDOff.off'],off,None)
    p.hook_register(0,syms['CopyArray'],copy,None)
    p.tick(120,True);full=p.screen.ndarray.copy()
    values=np.empty((144,160),np.uint8)
    for y in range(144):
        for x in range(160):values[y,x]=[255,170,85,0][(((y//8*20+x//8)%256>>(x%8))&1) if y%8==0 else y%4]
    if not cgb:assert np.array_equal(full[:,:,:3],values[:,:,None].repeat(3,2))
    def press(key):
        p.button_press(key);p.tick(20,True);p.button_release(key);p.tick(20,True)
    press('down');assert np.array_equal(full,p.screen.ndarray),'invalid handles changed image'
    press('a');normal=p.screen.ndarray.copy();assert p.memory[syms['wImageActive']]==0
    assert p.memory[0xff47]==0xe4,'ordinary DMG palette not restored'
    assert bytes(p.memory[syms['wBGPalettes']:syms['wBGPalettes']+8])==bytes([31,0,224,3,0,124,0,0]),'custom palette zero not restored'
    for cycle in range(3):
        press('b');assert np.array_equal(p.screen.ndarray,full)
        assert not any(p.memory[0xfe00+i] for i in range(0,160,4))
        press('a');assert np.array_equal(p.screen.ndarray,normal),'same cached actor pose not restored'
    press('select');two=p.screen.ndarray.copy();assert p.memory[0xff47]==0xfc
    if not cgb:
        expected=np.fromfunction(lambda y,x:np.where((x+y)%7==0,255,0),(144,160)).astype(np.uint8)
        assert np.array_equal(two[:,:,:3],expected[:,:,None].repeat(3,2))
    press('up');assert p.memory[0xff47]==0xfd
    if not cgb:assert set(np.unique(p.screen.ndarray[:,:,:3]))=={0,170}
    press('a');assert np.array_equal(normal,p.screen.ndarray),'palette 0 not restored'
    press('start');assert np.array_equal(two,p.screen.ndarray),'replacement before refresh failed'
    assert not unsafe,unsafe[:10]
    assert late['forced'] and late['retried'],late
    p.stop(save=False);results.append(dict(model='CGB' if cgb else 'DMG',passed=True))
print(json.dumps(results))
