"""Optional review on both models: DEFCON sequence, timers, sprites and input."""
import io
import json
from pathlib import Path
from pyboy import PyBoy

root=Path(__file__).resolve().parents[2]
out=root/'build/shadow-nightwatch-review'
out.mkdir(exist_ok=True)
report=json.loads((root/'build/shadow-nightwatch.report.json').read_text())
addresses={v['name']:v['address'] for v in report['variables'] if v['scope']=='$module'}
results=[]
for color in (False,True):
    emu=PyBoy(str(root/'binary/shadow-nightwatch.gb'),window='null',cgb=color,sound_emulated=True,ram_file=io.BytesIO(bytes(8192)))
    emu.set_emulation_speed(0)
    def word(name):
        a=addresses[name]
        return emu.memory[a] | emu.memory[a+1]*256
    scenes=set(); order=[]; seconds={i:set() for i in range(1,6)}
    clip_frames={i:set() for i in range(7)}
    peak=0; maximum_scanline=0
    origins={}
    for hardware_frame in range(6500):
        emu.tick(1,True)
        scene,tick,level=word('scene'),word('tick'),word('level')
        if word('prepared') and 30<tick and scene in range(7):
            scenes.add(scene)
            clip_frames[scene].add(word('last_frame'))
            if scene in range(1,6) and level==6-scene:
                if not order or order[-1]!=level: order.append(level)
                seconds[level].add(word('remaining'))
            if 220<tick<240:
                origins[scene]=word('includes.score.origin')
                (out/f'{"cgb" if color else "dmg"}-{scene}.ppm').write_bytes(b'P6\n160 144\n255\n'+emu.screen.ndarray[:,:,:3].tobytes())
            # Evaluate actual hardware OAM, not a claimed sprite count.
            if hardware_frame%7==0:
                for y in range(144):
                    count=sum(0<emu.memory[0xfe00+i*4+1]<168 and emu.memory[0xfe00+i*4]-16<=y<emu.memory[0xfe00+i*4]-8 for i in range(40))
                    maximum_scanline=max(maximum_scanline,count)
        if emu.sound.ndarray.size: peak=max(peak,int(abs(emu.sound.ndarray.astype('int16')).max()))
        if word('cycles')==1: break
    assert scenes==set(range(7)), scenes
    assert order==[5,4,3,2,1], order
    assert all(set(range(1,11))<=values for values in seconds.values()), seconds
    assert all(len(values)>=20 for values in clip_frames.values()), clip_frames
    assert maximum_scanline<=10, maximum_scanline
    assert origins[1]==origins[2] and origins[3]==origins[4] and origins[5]==origins[6], origins
    assert peak>0 and word('cycles')==1
    emu.tick(90,False)
    emu.button_press('start'); emu.tick(40,False); emu.button_release('start'); emu.tick(20,False)
    assert word('paused')==1
    before=word('tick'); music_origin=word('includes.score.origin')
    emu.tick(90,False); assert word('tick')==before
    emu.button_press('start'); emu.tick(40,False); emu.button_release('start'); emu.tick(20,False)
    assert word('paused')==0 and word('tick')>before
    assert word('includes.score.origin')!=music_origin
    before=word('scene')
    emu.button_press('a'); emu.tick(40,False); emu.button_release('a'); emu.tick(30,False)
    assert word('scene')==(before+1)%7
    emu.stop(save=False)
    result={'model':'CGB' if color else 'DMG','defcon_order':order,'seconds':{k:sorted(v) for k,v in seconds.items()},'scenes':sorted(scenes),'clip_frames':[len(clip_frames[s]) for s in range(7)],'maximum_sprites_per_scanline':maximum_scanline,'audio_peak':peak,'continuous_movements':'PASS','pause_resume_skip':'PASS','hardware_frames':hardware_frame}
    results.append(result)
    print(json.dumps(result))
(out/'checks.json').write_text(json.dumps(results,indent=2))
