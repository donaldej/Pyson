from pathlib import Path
import io,json,sys
from pyboy import PyBoy
name=sys.argv[1];finite=sys.argv[2]=='true'
r=json.loads(Path('build',name+'.report.json').read_text());v={s['name']:s['address'] for s in r['variables'] if s['scope']=='$module'}
for cgb in [False,True]:
 p=PyBoy('binary/'+name+'.gb',window='null',cgb=cgb,sound_emulated=False,ram_file=io.BytesIO());p.set_emulation_speed(0)
 def get(n):a=v[n];return p.memory[a]+256*p.memory[a+1]
 p.tick(400,True)
 assert get('warm')==140 and get('probe_result')==24 and get('after_bank_read')==15,(cgb,'initialization/bank restoration')
 before=get('ready');assert before>0
 p.tick(120,True)
 assert get('ready')==1 if finite else get('ready')>before
 assert p.memory[v['values']]==2 and p.memory[v['values']+4]==7
 p.stop(save=False)
print('PASS banked main',name)
