from pathlib import Path
import io,json
from pyboy import PyBoy
sy={}
for line in Path('build/apu-streams-runtime.sym').read_text().splitlines():
 if line and not line.startswith(';'):
  at,label=line.split();sy[label]=int(at.split(':')[1],16)
for cgb in (False,True):
 p=PyBoy('binary/apu-streams-runtime.gb',window='null',cgb=cgb,sound_emulated=True,ram_file=io.BytesIO());p.set_emulation_speed(0);writes=[]
 def capture(_):
  r=p.register_file;a=sy['wFrameCount'];writes.append((p.memory[a]+256*p.memory[a+1],r.C,r.A))
 p.hook_register(0,sy['APUWrite'],capture,None);p.tick(7000,False)
 assert len(writes)>6100,(cgb,len(writes),p.register_file.PC)
 first=writes[0][0];rows=[(f-first,r,v) for f,r,v in writes[6:]]
 for f,r,v in rows:
  native=f if f<=4000 else 2000+(f-4001)%2001
  assert r==0x13 and v==(native&255),(cgb,f,r,v,native)
 assert rows[-1][0]>6002
 p.stop(save=False);print('PASS banked audio',cgb,'events',len(rows),'including verified loop and banks 300+')
