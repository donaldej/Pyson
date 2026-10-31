from pathlib import Path
import json,io,os,numpy as np
from pyboy import PyBoy
name=os.environ.get('MASKED_COLOR_ROM','masked-color-runtime');r=json.loads(Path('build',name+'.report.json').read_text());vs={v['name']:v['address'] for v in r['variables']};sy={}
fill='masked-fill' in name
for line in Path('build',name+'.sym').read_text().splitlines():
 if line and not line.startswith(';'):a,n=line.split();sy[n]=int(a.split(':')[1],16)
rows=[]
for cgb in (False,True):
 p=PyBoy('binary/'+name+'.gb',window='null',cgb=cgb,sound_emulated=False,ram_file=io.BytesIO(),color_palette=(0xffffff,0xaaaaaa,0x555555,0));p.set_emulation_speed(0)
 bad_banks=[];commits=[];compositions=[]
 p.hook_register(0,sy['SetMaskedPalette'],lambda _:bad_banks.append(p.memory[0xff70]&7) if cgb and p.memory[0xff70]&7 not in (0,1) else None,None)
 p.hook_register(0,sy['CommitGraphicsFrame'],lambda _:commits.append(p.memory[sy['wTintCount']]),None)
 p.hook_register(0,sy['ComposeMasked'],lambda _:compositions.append(1) if p.memory[sy['wMaskedDirty']] else None,None)
 def get(n):
  a=vs[n];bank=p.memory[0xff70]&7 if cgb else 1
  if cgb and a>=0xd000:p.memory[0xff70]=1
  try:return p.memory[a]+256*p.memory[a+1]
  finally:
   if cgb and a>=0xd000:p.memory[0xff70]=bank
 def put(n,v):
  a=vs[n];bank=p.memory[0xff70]&7 if cgb else 1
  if cgb and a>=0xd000:p.memory[0xff70]=1
  try:p.memory[a]=v&255;p.memory[a+1]=(v>>8)&255
  finally:
   if cgb and a>=0xd000:p.memory[0xff70]=bank
 def settle():
  before=get('ready')
  for frame in range(400):
   p.tick(1,True)
   if (get('ready')-before)&65535>=3 and (not cgb or p.memory[0xff70]&7==1):p.tick(2,True);return
  raise AssertionError(('color renderer stalled',cgb,hex(p.register_file.PC)))
 p.tick(120,True)
 assert bool(get('color_hardware'))==cgb
 if 'request' in vs:
  put('request',1);settle();assert get('completed')==1 and get('spill_result')==177
  bank=p.memory[0xff70]&7 if cgb else 1
  if cgb:p.memory[0xff70]=1
  a=vs['spill_b']+299*2;assert p.memory[a]+256*p.memory[a+1]==194
  if cgb:p.memory[0xff70]=bank
 bank=p.memory[0xff70]&7 if cgb else 1
 if cgb:p.memory[0xff70]=1
 for a in range(0xd400,0xd410):p.memory[a]=0x69
 if cgb:p.memory[0xff70]=bank
 cases=[(16+i,23+i%3,False,i%2,False,0,1,2) for i in range(8)]+[(-7,-5,True,0,False,0,1,2),(154,139,True,1,False,0,1,2),(19,23,False,2,False,0,1,2),(19,23,False,0,True,0,1,2),(19,12,False,0,False,20,1,2),(19,23,False,0,False,144,1,2),(19,23,True,0,False,0,-1,2),(19,23,False,0,False,0,1,-1)]
 # Near signed-coordinate limits, extent addition can wrap. Entirely offscreen
 # layers must still skip coloring instead of scanning a wrapped map range.
 cases += [(32760,23,False,0,False,0,1,2),(-32760,23,False,0,False,0,1,2),(19,32760,False,0,False,0,1,2),(19,-32760,False,0,False,0,1,2)]
 for x,y,flip,pose,hidden,clip,color0,color1 in cases:
  for n,v in [('x',x),('y',y),('flip',flip),('pose',pose),('hidden',hidden),('clip_top',clip),('color0',color0),('color1',color1)]:put(n,int(v))
  settle();shade=np.zeros((144,160),np.uint8);owner=np.full((144,160),-1,np.int8)
  for slot,(f,xx,yy,fl,hide,top) in enumerate([(pose,x,y,flip,hidden,clip),(1,23,27,True,False,0)]):
   if hide:continue
   for py in range(16):
    for px in range(16):
     sx=15-px if fl else px;visible=(sx+py)%3!=0 if f==0 else sx>=py if f==1 else False
     if visible and 0<=xx+px<160 and top<=yy+py<144:shade[yy+py,xx+px]=(sx+2*py)%4;owner[yy+py,xx+px]=slot
  grays=np.array([248,168,80,0] if cgb else [255,170,85,0],np.uint8);expected=np.repeat(grays[shade][:,:,None],3,2)
  if cgb:
   palettes=[np.array([[248]*3,[240,56,56],[144,32,32],[56,8,8]],np.uint8),np.array([[248]*3,[56,240,56],[32,144,32],[8,56,8]],np.uint8)]
   for slot,color in enumerate((color0,color1)):
    if color>=0:
     mask=(owner==slot)&(shade!=0);expected[mask]=palettes[color-1][shade[mask]]
  actual=p.screen.ndarray[:,:,:3];bad=np.argwhere(np.any(actual!=expected,2))
  if len(bad):np.save('build/masked-color-actual.npy',actual);np.save('build/masked-color-expected.npy',expected)
  assert not len(bad),(cgb,x,y,flip,pose,hidden,clip,color0,color1,len(bad),bad[:5].tolist(),actual[tuple(bad[0])].tolist() if len(bad) else [])
  bank=p.memory[0xff70]&7 if cgb else 1
  if cgb:p.memory[0xff70]=1
  assert all(p.memory[a]==0x69 for a in range(0xd400,0xd410)),'color stack switch damaged user stack bank'
  if cgb:p.memory[0xff70]=bank
  if cgb:
   assert p.memory[sy['wTintCount']]<=40
   assert max(p.memory[sy['wTintScan']:sy['wTintScan']+9])<=10
 # Hardware pressure may remove accents, but must never remove body pixels
 # or paint scenery. Two 64px-wide bodies exceed ten components per band.
 for n,v in [('color0',1),('color1',2),('budget',1),('hidden',0),('clip_top',0)]:put(n,v)
 settle();a=p.screen.ndarray[:,:,:3];gray=np.array([248,168,80,0] if cgb else [255,170,85,0],np.uint8)
 for yy in range(32,96):
  for xx in range(128):
   index=((xx%64)+2*(yy-32))%4;base=np.array([gray[index]]*3,np.uint8);accent=palettes[0 if xx<64 else 1][index] if cgb and index else base
   if cgb and fill:assert np.array_equal(a[yy,xx],palettes[0 if xx<64 else 1][index]),('opaque fill missing color',xx,yy)
   else:assert np.array_equal(a[yy,xx],base) or np.array_equal(a[yy,xx],accent),(cgb,'budget removed/colored incorrect body pixel',xx,yy)
 outside=np.ones((144,160),bool);outside[32:96,:128]=False;assert np.all(a[outside]==gray[0]),'color leaked into scenery'
 if cgb:
  if fill:
   assert p.memory[sy['wTintCount']]==0,'opaque tiles wasted hardware sprites'
   # RGB-only palette changes must also update the filled BG cells, including
   # opaque shade0, without asking for a new composition or pattern upload.
   count=len(compositions);put('palette_zero_black',1)
   p.memory[sy['wMaskedDirty']]=0;settle();image=p.screen.ndarray[:,:,:3]
   for yy in range(32,96):
    for xx in range(64):
     if (xx+2*(yy-32))%4==0:assert np.all(image[yy,xx]==0),('stationary filled shade0 ignored RGB change',xx,yy)
   assert len(compositions)==count,'RGB-only test unexpectedly recomposed the body'
   put('palette_zero_black',0);settle()
   if 'fill_enabled' in vs:
    put('fill_enabled',0);settle();assert p.memory[sy['wTintCount']]==40,'disabling fill retained stale cache'
    put('fill_enabled',1);settle();assert p.memory[sy['wTintCount']]==0,'reenabling fill retained stale cache'
  else:assert 40 in commits[-20:],'budget fixture never reached its intended color pressure'
 put('budget',0);settle();before=p.screen.ndarray.copy();put('overflow',1);settle();assert np.array_equal(before,p.screen.ndarray),'base overflow did not preserve old color frame';put('overflow',0);settle()
 if cgb and 'wTintCacheHits' in sy:
  # Recomposition with unchanged actors must reuse exact pixels, and residency
  # must eliminate uploads after both hidden buffers have been populated.
  for n,v in [('x',19),('y',23),('flip',0),('pose',0),('hidden',0),('clip_top',0),('color0',1),('color1',2)]:put(n,v)
  settle();expected=p.screen.ndarray.copy()
  def counter(n):a=sy[n];return p.memory[a]+256*p.memory[a+1]
  hits=counter('wTintCacheHits')
  for _ in range(8):p.memory[sy['wMaskedDirty']]=1;settle();assert np.array_equal(expected,p.screen.ndarray)
  assert (counter('wTintCacheHits')-hits)&65535>=12,'cache never reused an unchanged layer'
  blocks=counter('wTintUploadBlocks')
  for _ in range(4):p.memory[sy['wMaskedDirty']]=1;settle();assert np.array_equal(expected,p.screen.ndarray)
  assert counter('wTintUploadBlocks')==blocks,'resident patterns were uploaded again'
  for i in range(12):p.memory[sy['wTintCacheGeneration']+i]=255;p.memory[sy['wTintCacheValid']+i]=0
  put('pose',1);settle();assert any(p.memory[sy['wTintCacheGeneration']+i]==0 for i in range(12)),'wrap path not exercised'
  put('pose',0);settle();assert np.array_equal(expected,p.screen.ndarray),'generation wrap reused stale pixels'
 assert not bad_banks,('private work bank leaked into source execution',bad_banks)
 rows.append(dict(cgb=cgb,pixel_cases=len(cases),transparent_background_unchanged=True,front_opaque_zero_occludes_rear=True,private_stack_restored=True,budget_fallback_preserves_bodies=True,base_overflow_preserves_frame=True));p.stop(save=False);print('PASS masked color',rows[-1],flush=True)
Path('build',name+'-validation.json').write_text(json.dumps(rows,indent=2))
