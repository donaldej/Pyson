from pathlib import Path
import io,json,numpy as np
from pyboy import PyBoy
r=json.loads(Path('build/scroll-images-runtime.report.json').read_text());v={x['name']:x['address'] for x in r['variables']};results=[]
for cgb in (False,True):
 p=PyBoy('binary/scroll-images-runtime.gb',window='null',cgb=cgb,sound_emulated=False,ram_file=io.BytesIO(),color_palette=(0xffffff,0xaaaaaa,0x555555,0));p.set_emulation_speed(0);p.tick(120,True)
 expected_colors=None
 for y in [0,1,2,7,8,9,16,17,25,127,128,255,256,257,360,368,999,-1,32,31,30,24,23,16,15,8,7,0]:
  p.memory[v['y']]=y&255;p.memory[v['y']+1]=(y>>8)&255;p.tick(25,True);clamped=max(0,min(368,y));a=p.screen.ndarray[:,:,:3].copy()
  if expected_colors is None:
   expected_colors=[a[0,x].copy() for x in [1,25,17,9]]
  yy,xx=np.indices((144,160));indices=((yy+clamped)//8+(xx//8)*3+((xx%8)==((yy+clamped)%8)))%4
  expected=np.array(expected_colors)[indices];bad=int(np.any(a!=expected,axis=2).sum());assert bad==0,(cgb,y,bad,p.memory[0xff42],p.register_file.PC)
 results.append(dict(cgb=cgb,cases=28));p.stop(save=False)
print('PASS scroll images',results)
