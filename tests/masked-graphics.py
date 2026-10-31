from pathlib import Path
import json,numpy as np
from pyboy import PyBoy
report=json.loads(Path('build/masked-runtime.report.json').read_text());vs={a['name']:a['address'] for a in report['variables']};sy={}
for l in Path('build/masked-runtime.sym').read_text().splitlines():
 if l and not l.startswith(';'):
  a,n=l.split();sy[n]=int(a.split(':')[1],16)
results=[]
for cgb in [False,True]:
 p=PyBoy('binary/masked-runtime.gb',window='null',sound_emulated=False,cgb=cgb,color_palette=(0xffffff,0xaaaaaa,0x555555,0));p.set_emulation_speed(0);overflows=[]
 p.hook_register(0,sy['ComposeMasked.overflow'],lambda _:overflows.append(True),None)
 def get(n):a=vs[n];return p.memory[a]+256*p.memory[a+1]
 def put(n,v):a=vs[n];p.memory[a]=v&255;p.memory[a+1]=(v>>8)&255
 def settle():
  before=get('ready')
  for i in range(250):
   p.tick(1,True)
   if (get('ready')-before)&65535>=2:p.tick(2,True);return
  raise AssertionError('renderer stalled')
 p.tick(100,True);cases=0
 for x,y,flip,pose,hidden in [(16+i,23+i%3,False,i%2,False) for i in range(8)]+[(-7, -5,True,0,False),(154,139,True,1,False),(30,30,True,0,False),(19,23,False,2,False),(19,23,False,0,True),(19,23,False,0,False)]:
  for n,v in [('x',x),('y',y),('flip',flip),('pose',pose),('hidden',hidden)]:put(n,int(v))
  settle();expect=np.zeros((144,160),np.uint8)
  for f,xx,yy,fl,hide in [(pose,x,y,flip,hidden),(1,23,27,True,False)]:
   if hide:continue
   for py in range(16):
    for px in range(16):
     sx=15-px if fl else px;vis=(sx+py)%3!=0 if f==0 else sx>=py if f==1 else False
     if vis and 0<=xx+px<160 and 0<=yy+py<144:expect[yy+py,xx+px]=(sx+2*py)%4
  a=p.screen.ndarray[:,:,:3];shades=np.array([248,168,80,0] if cgb else [255,170,85,0]);actual=np.abs(a[:,:,0].astype(int)[:,:,None]-shades).argmin(2)
  bad=np.argwhere(actual!=expect)
  assert not len(bad),(cgb,x,y,flip,pose,hidden,len(bad),bad[:5].tolist())
  assert p.memory[sy['wMaskedOverflow']]==0
  cases+=1
 # Clipping one retained layer must not change another layer's clip.
 saved_expect=expect.copy()
 for yy,top in [(12,0),(12,16),(12,20),(12,144),(-5,16),(23,144)]:
  for n,v in [('x',19),('y',yy),('pose',0),('flip',0),('hidden',0),('clip_top',top)]:put(n,v)
  settle();clipped=np.zeros((144,160),np.uint8)
  for f,xx,y0,fl,clip in [(0,19,yy,False,top),(1,23,27,True,0)]:
   for py in range(16):
    for px in range(16):
     sx=15-px if fl else px;vis=(sx+py)%3!=0 if f==0 else sx>=py
     if vis and 0<=xx+px<160 and clip<=y0+py<144:clipped[y0+py,xx+px]=(sx+2*py)%4
  actual=np.abs(p.screen.ndarray[:,:,0].astype(int)[:,:,None]-shades).argmin(2)
  assert np.array_equal(actual,clipped),(cgb,'clip_top',yy,top)
  cases+=1
 frozen=p.screen.ndarray.copy()
 for invalid in [145,-1,256]:
  put('clip_top',invalid);settle();assert np.array_equal(frozen,p.screen.ndarray),(cgb,'invalid clip',invalid)
 for n,v in [('x',19),('y',23),('clip_top',0)]:put(n,v)
 settle();expect=saved_expect
 assert np.array_equal(np.abs(p.screen.ndarray[:,:,0].astype(int)[:,:,None]-shades).argmin(2),expect)
 # All four layers compose in slot order; an invalid fifth slot is ignored.
 expect_four=expect.copy()
 for f,xx,yy in [(0,51,41),(1,54,45)]:
  for py in range(16):
   for px in range(16):
    visible=(px+py)%3!=0 if f==0 else px>=py
    if visible:expect_four[yy+py,xx+px]=(px+2*py)%4
 put('extra',1);settle()
 actual=np.abs(p.screen.ndarray[:,:,0].astype(int)[:,:,None]-shades).argmin(2)
 assert np.array_equal(actual,expect_four),(cgb,'four layers')
 put('extra',0);settle()
 assert np.array_equal(np.abs(p.screen.ndarray[:,:,0].astype(int)[:,:,None]-shades).argmin(2),expect)
 # Exceeding the dynamic budget must preserve the previous displayed frame.
 before=p.screen.ndarray.copy();put('overflow',1);settle();assert overflows
 assert np.array_equal(before,p.screen.ndarray)
 put('overflow',0);settle();assert p.memory[sy['wMaskedOverflow']]==0
 # Repeated exclusive images must restore shared patterns, retained layers and palettes.
 for _ in range(3):
  p.button_press('b');p.tick(4,True);p.button_release('b')
  for attempt in range(150):
   p.tick(1,True)
   if p.memory[sy['wImageActive']]==1:break
  assert p.memory[sy['wImageActive']]==1,(cgb,attempt,p.memory[sy['wImageActive']])
  p.button_press('a');p.tick(15,True);p.button_release('a');settle()
  assert p.memory[sy['wImageActive']]==0
  assert np.array_equal(before,p.screen.ndarray)
 results.append(dict(model='CGB' if cgb else 'DMG',pixel_cases=cases,four_shades=True,overlap=True,flip=True,clipping=True,hide_and_restore=True,four_layers=True,invalid_slot_ignored=True));p.stop(save=False)
Path('build/masked-runtime-validation.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
