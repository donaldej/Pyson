from pathlib import Path
import io,json
from pyboy import PyBoy
r=json.loads(Path('build/input-frames-runtime.report.json').read_text());v={q['name']:q['address'] for q in r['variables'] if q['scope']=='$module'};sy={}
for line in Path('build/input-frames-runtime.sym').read_text().splitlines():
 if line and not line.startswith(';'):
  at,name=line.split();sy[name]=int(at.split(':')[1],16)
for cgb in [False,True]:
 p=PyBoy('binary/input-frames-runtime.gb',window='null',cgb=cgb,sound_emulated=False,ram_file=io.BytesIO());p.set_emulation_speed(0)
 def get(n):a=v[n];return p.memory[a]+256*p.memory[a+1]
 def put(n,x):a=v[n];p.memory[a]=x&255;p.memory[a+1]=(x>>8)&255
 snapshots=[];clear_frames=[];request=0
 def pop(_):
  if get('request')!=get('completed') and not snapshots:
   tail=p.memory[sy['wInputFrameTail']];count=p.memory[sy['wInputFrameCount']]
   snapshots.append([p.memory[sy['wInputFrames']+(tail+i)%64] for i in range(count)])
 p.hook_register(0,sy['NextInputFrame'],pop,None);p.tick(120,True)
 def run(mode):
  global request
  request+=1;put('mode',mode);put('request',request)
  for _ in range(100):
   p.tick(1,True)
   if get('completed')==request:break
  assert get('completed')==request,(cgb,'consumer stalled')
  assert get('empty')==0,(cgb,'stale frame after clear/empty')
 for cycle in range(3):
  run(1);assert p.memory[sy['wInputFramesLost']]==0
  for keys,length in [(['left'],7),([],5),(['right','b'],9),([],6),(['a','down'],8),([],4)]:
   for key in keys:p.button_press(key)
   p.tick(length,True)
   for key in keys:p.button_release(key)
  snapshots=[];run(2);expected=snapshots[0]
  assert 35<=len(expected)<=43,(cgb,cycle,'duplicate/missing samples',len(expected))
  actual=[p.memory[v['samples']+2*i]+256*p.memory[v['samples']+2*i+1] for i in range(get('count'))]
  assert actual[:len(expected)]==expected,(cgb,cycle,'order')
  assert all(value in [0,2,33,24] for value in actual),(cgb,'bad held state',actual)
  assert all(value in actual for value in [2,33,24]),(cgb,'lost short press')
  assert get('lost')==0,(cgb,'unexpected overflow')
 run(1);p.tick(110,True);snapshots=[];run(2)
 assert len(snapshots[0])==64 and get('lost')>=40,(cgb,'overflow not bounded/reported')
 p.tick(400,True);assert p.memory[sy['wInputFramesLost']]==255,(cgb,'overflow counter did not saturate')
 run(1);assert p.memory[sy['wInputFramesLost']]==0
 p.stop(save=False)
print('PASS 2 models: ordered short presses, duplicate foreground polls, wrap, overflow, reset')
