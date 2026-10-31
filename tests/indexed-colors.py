from pathlib import Path
import io,json,sys,numpy as np
from pyboy import PyBoy
name=sys.argv[1] if len(sys.argv)>1 else 'indexed-colors-runtime';report=json.loads(Path('build',name+'.report.json').read_text());vs={v['name']:v['address'] for v in report['variables']};sy={}
for line in Path('build',name+'.sym').read_text().splitlines():
 if line and not line.startswith(';'):a,n=line.split();sy[n]=int(a.split(':')[1],16)
pal=np.array(json.loads(Path('build/tests/indexed-colors/palettes.json').read_text()));pal=np.floor(pal*31/255+0.5).astype(np.uint8)*8
for cgb in (False,True):
 p=PyBoy('binary/'+name+'.gb',window='null',cgb=cgb,sound_emulated=False,ram_file=io.BytesIO(),color_palette=(0xffffff,0xaaaaaa,0x555555,0));p.set_emulation_speed(0);unsafe=[]
 def off(_):
  if p.memory[0xff40]&128 and p.memory[0xff44]<144:unsafe.append(p.memory[0xff44])
 p.hook_register(0,sy['ImageLCDOff.off'],off,None)
 def get(n):a=vs[n];return p.memory[a]+256*p.memory[a+1]
 def put(n,v):a=vs[n];p.memory[a]=v&255;p.memory[a+1]=(v>>8)&255
 def settle():
  before=get('ready')
  for _ in range(900):
   p.tick(1,True)
   if (get('ready')-before)&65535>=3:p.tick(3,True);return
  raise AssertionError(('stalled',cgb,hex(p.register_file.PC)))
 p.tick(150,True)
 def check(mode,camera=0,position=0):
  yy,xx=np.indices((144,160));shade=((xx+(camera if mode==0 else 0))+yy+(position if mode==3 else 0))%4
  group=(((xx+(camera if mode==0 else 0))//8)+yy//8)%(3 if mode==0 else 8)
  grays=[248,168,80,0] if cgb else [0,85,170,255] if mode in (0,1) else [255,170,85,0]
  expected=pal[group,shade] if cgb and mode in (0,1) else np.repeat(np.array(grays,np.uint8)[shade][:,:,None],3,2)
  actual=p.screen.ndarray[:,:,:3];start=24 if mode==0 else 0;bad=np.argwhere(np.any(actual[start:]!=expected[start:],2))
  assert not len(bad),(cgb,mode,camera,position,len(bad),bad[:4].tolist(),actual[0,:4].tolist(),expected[0,:4].tolist(),p.memory[0xff47],list(p.memory[0x8000:0x8010]),list(p.memory[0x9800:0x9804]),hex(p.memory[0xff40]))
 for camera in (0,1,7,8,99):
  put('camera',camera);put('request',4 if get('request')==0 else 0);settle();check(0,min(8,camera))
 for mode in (1,2,1,2):put('request',mode);settle();check(mode)
 for position in (0,1,7,8,15,40,56):
  put('position',position);put('request',2);settle();put('request',3);settle();check(3,position=min(position,56))
 put('camera',3);put('request',0);settle();check(0,3)
 assert not unsafe,unsafe
 p.stop(save=False);print('PASS indexed colors',cgb,flush=True)
