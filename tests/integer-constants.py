from pathlib import Path
import json,random
from pyboy import PyBoy
r=json.loads(Path('build/integer-constants-runtime.report.json').read_text());vs={a['name']:a['address'] for a in r['variables']};rng=random.Random(147);cases=[-32768,-32767,-16385,-16384,-257,-256,-255,-9,-8,-7,-1,0,1,7,8,9,255,256,257,16383,16384,32766,32767,-18,-17,-16]+[rng.randrange(-32768,32768) for _ in range(128)]
for model in [False,True]:
 p=PyBoy('binary/integer-constants-runtime.gb',window='null',sound_emulated=False,cgb=model);p.set_emulation_speed(0)
 def get(n):a=vs[n];v=p.memory[a]+256*p.memory[a+1];return v-65536 if v&32768 else v
 def wrap(v):v&=65535;return v-65536 if v&32768 else v
 snapshot={}
 symbols={}
 for line in Path('build/integer-constants-runtime.sym').read_text().splitlines():
  if line and not line.startswith(';'):
   a,n=line.split();symbols[n]=int(a.split(':')[1],16)
 def capture(_):
  for n in ['a','b','c','d','e','f','g','h','i','j','k','u','v','w','flags','effects']:snapshot[n]=get(n)
 p.hook_register(0,symbols['RefreshScreen'],capture,None)
 p.tick(180,True);assert get('calls')==1 and get('side')==0
 for x in cases:
  a=vs['x'];p.memory[a]=x&255;p.memory[a+1]=(x>>8)&255;p.tick(2,True)
  expected=[x*15,x*-127,x//8,x%8,x//256,x%256,x//16384,x%16384,-x,0,x,x*3,x//4,x%16]
  for name,value in zip(['a','b','c','d','e','f','g','h','i','j','k','u','v','w'],expected):assert snapshot[name]==wrap(value),(model,x,name,snapshot[name],wrap(value))
  flags=sum(bit for cond,bit in [(x==-17,1),(x!=-17,2),(x< -17,4),(x<= -17,8),(x> -17,16),(x>= -17,32),(x==0,64),(x!=0,128),(not x,256),(x<0,512),(True,1024),(x>0,2048)] if cond)
  assert snapshot['flags']==flags,(model,x,'conditions',snapshot['flags'],flags)
  assert snapshot['effects']==(2 if x<0 else 0),(model,x,'short circuit',snapshot['effects'])
 p.stop(save=False)
print(json.dumps(dict(passed=True,models=2,signed_inputs=len(cases))))
