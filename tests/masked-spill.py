from pathlib import Path
import io,json
from pyboy import PyBoy
r=json.loads(Path('build/masked-spill-runtime.report.json').read_text());v={a['name']:a['address'] for a in r['variables'] if a['scope']=='$module'}
assert r['wramCapacityBytes']==5120 and r['stackBytes']==3072
assert 0<r['wramXVariableBytes']<=1024
assert 0xd000<=v['spill_a']<0xd400
results=[]
for cgb in [False,True]:
 p=PyBoy('binary/masked-spill-runtime.gb',window='null',cgb=cgb,sound_emulated=False,ram_file=io.BytesIO());p.set_emulation_speed(0);p.tick(200,True)
 def get(n):a=v[n];return p.memory[a]+256*p.memory[a+1]
 def put(n,x):a=v[n];p.memory[a]=x&255;p.memory[a+1]=(x>>8)&255
 for a in range(0xd400,0xd410):p.memory[a]=0x69
 for request in range(1,31):
  put('request',request)
  for _ in range(100):
   p.tick(1,True)
   if get('completed')==request:break
  assert get('completed')==request,('stalled',cgb,request)
  assert get('spill_result')==174+3*request,(cgb,request,'array reference')
  assert get('spill_value_b')==191+3*request,(cgb,request,'other array')
  assert all(p.memory[a]==0x69 for a in range(0xd400,0xd410)),(cgb,'stack boundary')
  if cgb:assert p.memory[0xff70]&7==1,'work-RAM bank changed'
 assert get('ready')>30,'renderer did not advance'
 results.append(dict(model='CGB' if cgb else 'DMG',requests=30,mutable_array_references=True,other_array_preserved=True,renderer_active=True,stack_boundary_preserved=True));p.stop(save=False)
Path('build/masked-spill-validation.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
