"""Build first. Validate the timeline on both hardware models; save PPM captures."""
import io
import json
from pathlib import Path
from pyboy import PyBoy

root = Path(__file__).resolve().parents[2]
out = root / 'build/dead-hand-review'
out.mkdir(exist_ok=True)
report = json.loads((root/'build/dead-hand.report.json').read_text())
addresses = {v['name']:v['address'] for v in report['variables'] if v['scope']=='$module'}
for color in (False, True):
    emu = PyBoy(str(root/'binary/dead-hand.gb'), window='null', cgb=color, sound_emulated=True, ram_file=io.BytesIO(bytes(8192)))
    emu.set_emulation_speed(0)
    def word(name):
        a=addresses[name]
        return emu.memory[a] | emu.memory[a+1]*256
    seen=set(); levels=set(); captured=set(); peak=0
    for frame in range(7500):
        emu.tick(1,True)
        if not word('prepared'): continue
        scene=word('scene'); tick=word('tick')
        seen.add(scene)
        if scene==1: levels.add(word('level'))
        key=(scene, word('level') if scene==1 else 0)
        # Refresh the capture over a stable interval. A frame can interrupt a
        # multi-byte variable write or a text upload, so do not keep its first
        # possibly transitional sample as the representative screen.
        if 120 < tick%240 < 180 and (scene != 1 or word('level') == 5-tick//240):
            captured.add(key)
            pixels=emu.screen.ndarray[:,:,:3]
            (out/f'{"cgb" if color else "dmg"}-{scene}-{key[1]}.ppm').write_bytes(b'P6\n160 144\n255\n'+pixels.tobytes())
        if emu.sound.ndarray.size:
            peak=max(peak,int(abs(emu.sound.ndarray.astype('int16')).max()))
        if word('cycles')>=1: break
    assert seen=={0,1,2,3}, seen
    assert {1,2,3,4,5}<=levels, levels
    assert word('cycles')==1
    assert peak>0
    # Freeze must stop the visual timeline, and resume must advance it.
    emu.button_press('start'); emu.tick(8,False); emu.button_release('start'); emu.tick(8,False)
    assert word('paused')==1
    before=word('tick'); emu.tick(90,False); assert word('tick')==before
    emu.button_press('start'); emu.tick(8,False); emu.button_release('start'); emu.tick(30,False)
    assert word('paused')==0 and word('tick')>before
    emu.stop(save=False)
    print(json.dumps({'hardware':'CGB' if color else 'DMG','scenes':sorted(seen),'defcon':sorted(levels),'audio_peak':peak,'frames':frame,'pause':'PASS'}))
