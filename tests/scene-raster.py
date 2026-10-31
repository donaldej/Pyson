from pathlib import Path
import json,io,struct,numpy as np
from pyboy import PyBoy
name='scene-raster-runtime';report=json.loads(Path('build',name+'.report.json').read_text());variables={r['name']:r for r in report['variables'] if r['scope']=='$module'}
asset=next(a for a in report['assets'] if a['kind']=='scene');b=Path(asset['file']).read_bytes();o=struct.unpack_from('<I',b,10)[0];pal=np.frombuffer(b[54:102],np.uint8).reshape(12,4)[:,:3][:,::-1];indices=np.frombuffer(b[o:],np.uint8).reshape(144,168)[::-1];expected=(np.floor(pal.astype(float)*31/255+0.5).astype(np.uint8)*8)[indices][24:40,7:167]
p=PyBoy('binary/'+name+'.gb',window='null',cgb=True,sound_emulated=False,ram_file=io.BytesIO());p.set_emulation_speed(0);p.tick(180,True)
for frame in range(1200):
 p.tick(1,True)
 if not np.array_equal(p.screen.ndarray[24:40,:,:3],expected):
  print('DEBUG',hex(p.memory[0xff40]),p.memory[0xff43],np.unique(p.screen.ndarray[24:40,:,:3].reshape(-1,3),axis=0).tolist(),np.unique(expected.reshape(-1,3),axis=0).tolist(),flush=True)
 assert np.array_equal(p.screen.ndarray[24:40,:,:3],expected),('raster shear',frame)
# Read source arrays in their bank; a display boundary can stop the CPU inside
# the private bank3 copy. Host access restores the bank it found.
bank=p.memory[0xff70]&7;p.memory[0xff70]=1
def word(a):return p.memory[a]+256*p.memory[a+1]
cycles=word(variables['cycles']['address']);assert cycles>10
padding=variables['padding_b'];assert word(padding['address']+474*2) in (cycles,cycles+1)
p.memory[0xff70]=bank;p.stop(save=False);print('PASS raster split:1200 display frames,source-array writes',cycles,report['stackBytes'])
