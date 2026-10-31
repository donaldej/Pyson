from pathlib import Path
import io,json,os,numpy as np
from pyboy import PyBoy
name=os.environ.get('SCENE_ROM_NAME','scene-maps-runtime');height=int(os.environ.get('SCENE_HUD_ROWS','2'))*8
report=json.loads(Path('build',name+'.report.json').read_text());vs={v['name']:v['address'] for v in report['variables']}
for cgb in (False,True):
 p=PyBoy('binary/'+name+'.gb',window='null',cgb=cgb,ram_file=io.BytesIO(),color_palette=(0xffffff,0xaaaaaa,0x555555,0));p.set_emulation_speed(0)
 def read(n):a=vs[n];return p.memory[a]+256*p.memory[a+1]
 def put(n,v):a=vs[n];p.memory[a]=v&255;p.memory[a+1]=(v>>8)&255
 def settle():
  before=read('ready')
  for _ in range(300):
   p.tick(1,True)
   if (read('ready')-before)&65535>=3:return
  raise AssertionError('scene loop stalled')
 p.tick(150,True);settle();hud=p.screen.ndarray[:height,:,:3].copy();count=0
 for variant in (0,1,0):
  put('variant',variant)
  for camera in (0,1,2,3,4,5,6,7,8,135,143,351,352,359,-1):
   put('camera',camera);settle();cam=max(0,min(352,camera));fine=cam%8
   expect=np.zeros((144,160),np.uint8)
   for y in range(height,144):
    for x in range(160):
     sx=x+cam;expect[y,x]=(sx//8+y//8*3+(sx%8==y%8)+variant)%4
   for y in range(16):
    for x in range(16):
     if (x+y)%3 and 0<=154+x<160 and 16+y>=height:expect[16+y,154+x]=(x+2*y)%4
   image=p.screen.ndarray[:,:,:3];shades=np.array([248,168,80,0] if cgb else [255,170,85,0]);actual=np.abs(image[:,:,0].astype(int)[:,:,None]-shades).argmin(2)
   bad=np.argwhere(actual[height:]!=expect[height:]);assert not len(bad),(cgb,variant,camera,len(bad),bad[:6].tolist())
   assert np.array_equal(image[:height],hud),(cgb,camera,'HUD moved')
   count+=1
 baseline=p.screen.ndarray[:,:,:3].copy()
 if cgb:
  for palette in (1,2,1,0):
   put('text_palette',palette);settle()
   for base in (0x9800,0x9c00):
    assert list(p.memory[1,base:base+3])==[palette]*3,(height,palette,hex(base),'stale attributes')
   if palette:assert np.any(p.screen.ndarray[:8,:24,0]!=p.screen.ndarray[:8,:24,1]),'palette color did not reach screen'
  assert np.array_equal(p.screen.ndarray[:,:,:3],baseline),'palette-only update did not restore'
 put('overlay',1);settle()
 assert not np.array_equal(p.screen.ndarray[128:136,:32,:3],baseline[128:136,:32]),'overlay did not draw'
 put('overlay',0);settle();assert np.array_equal(p.screen.ndarray[:,:,:3],baseline),'scenery under old text was not restored'
 print('PASS scene pixels',cgb,count,'body text restored',flush=True);p.stop(save=False)
