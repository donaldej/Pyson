"""Synthetic actor evidence; no commercial ROM or extracted assets required."""
from pathlib import Path
import json,io,sys
from pyboy import PyBoy
root=Path(__file__).resolve().parents[1];config=json.loads(Path(sys.argv[1]).read_text())
stage_label=next(s['label'] for s in config['symbols'] if s['name']=='stage')
lines=Path(config['symbolFile']).read_text().splitlines()
stage=int(next(line.split()[0].split(':')[1] for line in lines if line.endswith(' '+stage_label)),16)
for cgb in [False,True]:
 emu=PyBoy(str(config['rom']),symbols=config['symbolFile'],window='null',cgb=cgb,sound_emulated=False,ram_file=io.BytesIO());emu.set_emulation_speed(0)
 actors=[a for a in config['assets'] if a.get('actor')]
 violations=[];writes=[0]
 def upload(_):
  writes[0]+=1;dest=emu.register_file.D*256+emu.register_file.E;tile=(dest-0x8000)//16
  if emu.memory[0xff41]&3==3:violations.append('mode3')
  for slot in range(min(a['actor']['firstSprite'] for a in actors),40):
   y,x,pattern,_=emu.memory[0xfe00+4*slot:0xfe04+4*slot]
   if 0<x<168 and 0<y<160 and pattern<=tile<pattern+actors[0]['actor']['componentHeight']//8:violations.append('visible tile overwritten')
 emu.hook_register(None,'DrawActor.writePattern',upload,None)
 if config['mode']=='hybrid':
  clip=next(a for a in config['assets'] if a['kind']=='clip')
  front_address=int(next(line.split()[0].split(':')[1] for line in lines if line.endswith(' wClipFront')),16)
  def clip_upload(_):
   tile=(emu.register_file.D*256+emu.register_file.E-0x8000)//16
   if emu.memory[0xff41]&3==3:violations.append('clip mode3')
   front=emu.memory[front_address];base=clip['clip']['residentBase'];span=clip['clip']['patternsPerBuffer']
   if base+front*span<=tile<base+(front+1)*span:violations.append('visible clip overwritten')
  emu.hook_register(None,'DrawBackground.writePattern',clip_upload,None)

 def entries(asset):
  first=asset['actor']['firstSprite'];count=asset['actor']['reservedSprites']
  return [tuple(emu.memory[0xfe00+4*i:0xfe04+4*i]) for i in range(first,first+count)]
 def check(asset,frame,x,y,flip=False):
  source=config['sources'][str(asset['id'])];width=source['frameWidth'];height=source['frameHeight'];mapping=source['maps'][frame];expected={};actual={}
  for yy in range(height):
   for xx in range(width):
    tile=source['tiles'][mapping[(yy//8)*source['columns']+xx//8]];row=yy%8*2;bit=7-xx%8
    value=((tile[row]>>bit)&1)|(((tile[row+1]>>bit)&1)<<1)
    dx=x+(width-1-xx if flip else xx);dy=y+(height-1-yy if flip else yy)
    if value and 0<=dx<160 and 0<=dy<144:expected[(dx,dy)]=value
  h=asset['actor']['componentHeight']
  for sy,sx,tile,flags in entries(asset):
   if sy==0:continue
   assert bool(flags&32)==flip and bool(flags&64)==flip
   if h==16:assert tile%2==0
   data=emu.memory[0x8000+tile*16:0x8000+tile*16+h*2]
   for yy in range(h):
    row=(h-1-yy if flags&64 else yy)*2
    for xx in range(8):
     bit=xx if flags&32 else 7-xx;value=((data[row]>>bit)&1)|(((data[row+1]>>bit)&1)<<1)
     dx=sx-8+xx;dy=sy-16+yy
     if value and 0<=dx<160 and 0<=dy<144:actual[(dx,dy)]=value
  assert actual==expected,(asset['id'],frame,flip,len(actual),len(expected),list(set(actual)^set(expected))[:8])
 try:
  emu.tick(150,True);a,b,c=actors;check(a,0,20,30);check(b,1,80,30);check(c,0,20,60)
  map_base=0x9c00 if emu.memory[0xff40]&8 else 0x9800
  for column,glyph in enumerate(config['fontRefs']):
   tile=emu.memory[map_base+3*32+column]
   assert list(emu.memory[0x8000+tile*16:0x8010+tile*16])==glyph,('compact font/format mapping',column)
  assert bool(emu.memory[0xff40]&4)==(config['mode']!='mixed')
  before=writes[0];emu.tick(25,True);assert writes[0]==before,'cached pose reuploaded'
  emu.memory[stage]=1;emu.tick(16,True);check(a,1,20,30,True);check(c,0,30,70,True);assert all(e[0]==0 for e in entries(b))
  before=writes[0];emu.memory[stage]=2;emu.tick(16,True);check(a,1,-4,-4,True);check(c,0,-4,-4,True);assert writes[0]==before,'position-only update reuploaded'
  emu.memory[stage]=3;emu.tick(24,True);check(a,1,20,30);check(c,0,20,60)
  emu.memory[stage]=4;emu.tick(16,True);assert all(e[0]==0 for e in entries(a));assert all(e[0]==0 for e in entries(b));assert all(e[0]==0 for e in entries(c))
  assert not violations,violations[:10]
  print(json.dumps({'mode':config['mode'],'model':'CGB' if cgb else 'DMG','pattern_writes':writes[0],'unsafe':len(violations),'layout_flips_cache_clipping_hide':True}))
 finally:emu.stop(save=False)
