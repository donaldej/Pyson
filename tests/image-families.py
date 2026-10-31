from pathlib import Path
import json,sys,io,struct,numpy as np
from pyboy import PyBoy
name=sys.argv[1];report=json.loads(Path('build',name+'.report.json').read_text());variables={r['name']:r['address'] for r in report['variables'] if r['scope']=='$module'};assets=json.loads(Path('build',name+'.assets.json').read_text());symbols={}
for line in Path('build',name+'.sym').read_text().splitlines():
 if line and not line.startswith(';'):
  address,label=line.split();symbols[label]=int(address.split(':')[1],16)
def wanted(asset,cgb):
 b=Path(asset['file']).read_bytes()
 if struct.unpack_from('<H',b,28)[0]==24:
  offset=struct.unpack_from('<I',b,10)[0];raw=np.frombuffer(b[offset:],np.uint8).reshape(144,160,3)[::-1,:,::-1]
  return np.floor(raw.astype(float)*31/255+0.5).astype(np.uint8)*8 if cgb else raw
 o=struct.unpack_from('<I',b,10)[0];n=struct.unpack_from('<I',b,46)[0];pal=np.frombuffer(b[54:54+n*4],np.uint8).reshape(n,4)[:,:3][:,::-1];indices=np.frombuffer(b[o:],np.uint8).reshape(144,160)[::-1]
 if cgb:return (np.floor(pal.astype(float)*31/255+0.5).astype(np.uint8)*8)[indices]
 colors=np.array([255,170,85,0],np.uint8)[[(asset['dmgPalette']>>(i*2))&3 for i in range(4)]];return np.repeat(colors[indices&3][:,:,None],3,2)
for cgb in (False,True):
 p=PyBoy('binary/'+name+'.gb',window='null',cgb=cgb,sound_emulated=False,ram_file=io.BytesIO(),color_palette=(0xffffff,0xaaaaaa,0x555555,0));p.set_emulation_speed(0);p.tick(200,True);calls=[];p.hook_register(0,symbols['ImageLCDOff'],lambda _:calls.append(True),None)
 def get(a):return p.memory[a]+256*p.memory[a+1]
 def clock():return get(symbols['wFrameCount'])
 current=wanted(assets[0],cgb)
 assert np.array_equal(p.screen.ndarray[:,:,:3],current)
 for request,index,full in [(1,1,False),(2,0,False)]*8+[(3,2,True),(4,1,True),(2,0,False)]:
  before=len(calls);start=clock();frames=0;p.memory[symbols['wShadowOAM']]=16;p.memory[symbols['wOAMDirty']]=1;target=wanted(assets[index],cgb);p.memory[variables['request']]=request
  for frame in range(300):
   p.tick(1,True);frames+=1;actual=p.screen.ndarray[:,:,:3]
   if not full:
    assert p.memory[0xff40]&128,'LCD stopped during compatible update'
    assert np.array_equal(actual,current) or np.array_equal(actual,target),'partially updated picture'
   if get(variables['completed'])==request and np.array_equal(actual,target):break
  else:raise AssertionError(('update stalled',cgb,request))
  if not full:
   assert len(calls)==before,'compatible update disabled LCD'
   assert ((clock()-start)&32767)>=frames-1,'frame interrupts lost'
  else:assert len(calls)==before+1,'incompatible image must load its own patterns'
  assert not any(p.memory[symbols['wShadowOAM']:symbols['wShadowOAM']+160]),'image replacement retained sprites'
  current=target
 p.stop(save=False);print('PASS live image families',name,cgb,flush=True)
