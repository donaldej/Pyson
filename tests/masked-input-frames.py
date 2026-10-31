from pathlib import Path
import io,json
from pyboy import PyBoy
name='masked-input-frames-runtime';r=json.loads(Path('build',name+'.report.json').read_text());v={q['name']:q['address'] for q in r['variables'] if q['scope']=='$module'};sy={}
for line in Path('build',name+'.sym').read_text().splitlines():
 if line and not line.startswith(';'):
  at,n=line.split();sy[n]=int(at.split(':')[1],16)
for cgb in (False,True):
 p=PyBoy('binary/'+name+'.gb',window='null',cgb=cgb,sound_emulated=False,ram_file=io.BytesIO());p.set_emulation_speed(0);request=0;snapshots=[]
 def get(n):a=v[n];return p.memory[a]+256*p.memory[a+1]
 def put(n,x):a=v[n];p.memory[a]=x&255;p.memory[a+1]=(x>>8)&255
 def pop(_):
  if get('request')==get('completed') or snapshots:return
  tail=p.memory[sy['wInputFrameTail']];runs=p.memory[sy['wInputFrameCount']];expected=[]
  for i in range(runs):
   a=sy['wInputFrames']+2*((tail+i)%64);expected.extend([p.memory[a]]*p.memory[a+1])
  snapshots.append(expected)
 p.hook_register(0,sy['NextInputFrame'],pop,None);p.tick(120,True)
 def run(mode):
  global request
  request+=1;put('mode',mode);put('request',request)
  for _ in range(400):
   p.tick(1,True)
   if get('completed')==request:break
  assert get('completed')==request,(cgb,'consumer stalled')
  assert get('empty')==0,(cgb,'stale held state')
 def consume():
  global snapshots
  snapshots=[];run(2);expected=snapshots[0];actual=[p.memory[v['samples']+i*2]+256*p.memory[v['samples']+i*2+1] for i in range(get('count'))]
  assert actual[:len(expected)]==expected,(cgb,'expanded order/duration mismatch',len(expected),len(actual))
  return expected
 def hold(keys,frames):
  for k in keys:p.button_press(k)
  p.tick(frames,True)
  for k in keys:p.button_release(k)
 for cycle in range(3):
  run(1);hold(['right','b'],200);hold([],35);hold(['down','a'],31);hold(['left','up'],11)
  expected=consume();assert 277<=len(expected)<=283 and all(x in expected for x in (33,24,6)) and get('lost')==0,(cgb,'long sequence lost',len(expected),get('lost'))
 # One pending run splits at255; decoding must preserve all300 frames.
 run(1);hold(['a'],300);expected=consume();assert sum(x==16 for x in expected)==300 and get('lost')==0,(cgb,'255 boundary',len(expected),get('lost'))
 # Worst-case transition capacity remains64, with bounded oldest-run loss.
 run(1)
 for i in range(80):
  if i%2:p.button_release('a')
  else:p.button_press('a')
  p.tick(1,True)
 p.button_release('a');expected=consume();assert len(expected)>=64 and get('lost')>=16,(cgb,'transition overflow',len(expected),get('lost'))
 # Dropping a run reports physical frames, not just the number of runs.
 run(1)
 for i in range(66):
  if i%2:p.button_release('a')
  else:p.button_press('a')
  p.tick(5,True)
 p.button_release('a');consume();assert get('lost')>=10,(cgb,'lost run duration not counted',get('lost'))
 run(1)
 for i in range(400):
  if i%2:p.button_release('b')
  else:p.button_press('b')
  p.tick(1,True)
 assert p.memory[sy['wInputFramesLost']]==255,(cgb,'loss counter saturation')
 p.button_release('b');run(1);assert p.memory[sy['wInputFramesLost']]==0
 p.stop(save=False)
print('PASS masked input 2 models: long histories, exact durations,255 split, wrap,64 transitions, overflow frames, saturation, reset')
