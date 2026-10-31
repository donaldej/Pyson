"""Optional emulator review of Black File on DMG and Color."""
import io,json,hashlib
from pathlib import Path
from pyboy import PyBoy
root=Path(__file__).resolve().parents[2]
out=root/'build/black-file-review'
out.mkdir(exist_ok=True)
report=json.loads((root/'build/black-file.report.json').read_text())
addresses={v['name']:v['address'] for v in report['variables'] if v['scope']=='$module'}
results=[]
for color in (False,True):
    emu=PyBoy(str(root/'binary/black-file.gb'),window='null',cgb=color,sound_emulated=True,ram_file=io.BytesIO(bytes(8192)))
    emu.set_emulation_speed(0)
    def word(name):
        a=addresses[name]
        return emu.memory[a]+emu.memory[a+1]*256
    scenes=set(); order=[]; peak=0; maximum=0; origins={}
    frames={i:set() for i in range(5)}
    images={i:set() for i in range(5)}
    for hardware_frame in range(5000):
        emu.tick(1,True)
        scene,tick=word('scene'),word('tick')
        if word('prepared') and 60<tick<590 and scene in frames:
            scenes.add(scene); frames[scene].add(word('last_frame'))
            if scene==2:
                level=word('level')
                if not order or order[-1]!=level:order.append(level)
            if hardware_frame%7==0:images[scene].add(hashlib.sha256(emu.screen.ndarray.tobytes()).hexdigest())
            if 220<tick<240:
                origins[scene]=word('includes.score.origin')
                (out/f'{"cgb" if color else "dmg"}-{scene}.ppm').write_bytes(b'P6\n160 144\n255\n'+emu.screen.ndarray[:,:,:3].tobytes())
            if scene==2 and hardware_frame%17==0:
                for y in range(144):
                    n=sum(0<emu.memory[0xfe00+i*4+1]<168 and emu.memory[0xfe00+i*4]-16<=y<emu.memory[0xfe00+i*4]-8 for i in range(40))
                    maximum=max(maximum,n)
        if emu.sound.ndarray.size:peak=max(peak,int(abs(emu.sound.ndarray.astype('int16')).max()))
        if word('cycles')==1:break
    assert scenes==set(range(5)) and word('cycles')==1
    assert order==[5,4,3,2,1],order
    assert all(len(v)>=20 for v in frames.values()),frames
    assert all(len(images[i])>=8 for i in range(4)),{k:len(v) for k,v in images.items()}
    # The deliberately static final seal only alternates its eye indicator.
    assert len(images[4])==2
    assert origins[0]==origins[1] and origins[2]==origins[3]
    assert maximum<=10 and peak>0
    emu.tick(90,False)
    emu.button_press('start');emu.tick(40,False);emu.button_release('start');emu.tick(20,False)
    assert word('paused')==1
    before=word('tick');emu.tick(90,False);assert word('tick')==before
    emu.button_press('start');emu.tick(40,False);emu.button_release('start');emu.tick(20,False)
    assert word('paused')==0 and word('tick')>before
    before=word('scene');emu.button_press('a');emu.tick(40,False);emu.button_release('a');emu.tick(30,False)
    assert word('scene')==(before+1)%5
    emu.stop(save=False)
    result={'model':'CGB' if color else 'DMG','scenes':sorted(scenes),'defcon':order,'clip_frames':[len(frames[i]) for i in range(5)],'different_images':[len(images[i]) for i in range(5)],'audio_peak':peak,'maximum_scanline':maximum,'controls':'PASS'}
    results.append(result);print(json.dumps(result))
(out/'checks.json').write_text(json.dumps(results,indent=2))
