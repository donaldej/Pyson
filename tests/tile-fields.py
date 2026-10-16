"""Inspect visible tiles to verify signed composition, ROM helpers and high IDs."""
import json
from pathlib import Path
from pyboy import PyBoy
root=Path(__file__).resolve().parents[1]
report=json.loads((root/'build/tile-fields-runtime.report.json').read_text())
stage=next(v['address'] for v in report['variables'] if v['name']=='stage')
assets=json.loads((root/'build/tile-fields-runtime.assets.json').read_text())
dark,bright=assets[128]['maps'][0][0],assets[129]['maps'][0][0]
for cgb in [False,True]:
 p=PyBoy(str(root/'binary/tile-fields-runtime.gb'),window='null',cgb=cgb);p.set_emulation_speed(0)
 try:
  p.tick(200,True)
  assert p.memory[stage]==2
  base=0x9c00 if p.memory[0xff40]&8 else 0x9800
  assert list(p.memory[base+33:base+37])==[bright,dark,bright,dark]
  assert list(p.memory[base+65:base+69])==[dark,bright,dark,bright]
  assert list(p.memory[base+161:base+163])==[bright,dark]
  assert p.memory[base+193]==bright
  assert p.memory[base+194]==0, 'Invalid grid entry overwrote its cell'
  assert list(p.memory[base+170:base+172])==[bright,dark]
  assert p.memory[base+202]==bright
  assert list(p.memory[base+293:base+297])==[bright,dark,bright,dark]
  assert list(p.memory[base+562:base+564])==[bright,dark]
  print(json.dumps({'target':'CGB' if cgb else 'DMG','signed_field_exact':True,'ROM_helpers':True,'high_asset_handles':True}),flush=True)
 finally:p.stop(save=False)
