"""Optional PyBoy review: both models, animation, audio, pause and scene skip."""
import hashlib
import io
import json
from pathlib import Path
from pyboy import PyBoy

root = Path(__file__).resolve().parents[2]
out = root/'build/black-channel-review'
out.mkdir(exist_ok=True)
report = json.loads((root/'build/black-channel.report.json').read_text())
addresses = {v['name']:v['address'] for v in report['variables'] if v['scope']=='$module'}
results=[]
for color in (False, True):
    emu=PyBoy(str(root/'binary/black-channel.gb'),window='null',cgb=color,sound_emulated=True,ram_file=io.BytesIO(bytes(8192)))
    emu.set_emulation_speed(0)
    def word(name):
        a=addresses[name]
        return emu.memory[a] | emu.memory[a+1]*256
    frames={s:set() for s in range(4)}
    pictures={s:set() for s in range(4)}
    peak=0
    for hardware_frame in range(7000):
        emu.tick(1,True)
        scene,tick=word('scene'),word('tick')
        if word('prepared') and scene in frames and 90<tick<850:
            frames[scene].add(word('last_frame'))
            # Seven is coprime with the 192-frame animation period. Sampling
            # every sixteen frames would repeatedly hit the same phases.
            if hardware_frame%7==0:
                pictures[scene].add(hashlib.sha256(emu.screen.ndarray.tobytes()).hexdigest())
            if 200<tick<240:
                (out/f'{"cgb" if color else "dmg"}-{scene}.ppm').write_bytes(b'P6\n160 144\n255\n'+emu.screen.ndarray[:,:,:3].tobytes())
        if emu.sound.ndarray.size:
            peak=max(peak,int(abs(emu.sound.ndarray.astype('int16')).max()))
        if word('cycles')==1: break
    assert word('cycles')==1, 'timeline did not complete'
    assert all(len(values)>=24 for values in frames.values()), frames
    assert all(len(values)>12 for values in pictures.values()), {s:len(v) for s,v in pictures.items()}
    assert peak>0
    # Allow the next act to finish its initialization before testing controls.
    emu.tick(90,False)
    emu.button_press('start'); emu.tick(40,False); emu.button_release('start'); emu.tick(20,False)
    assert word('paused')==1
    before=word('tick'); emu.tick(90,False); assert word('tick')==before
    emu.button_press('start'); emu.tick(40,False); emu.button_release('start'); emu.tick(20,False)
    assert word('paused')==0 and word('tick')>before
    prior_scene=word('scene')
    emu.button_press('a'); emu.tick(40,False); emu.button_release('a'); emu.tick(30,False)
    assert word('scene')==(prior_scene+1)%4
    emu.stop(save=False)
    result={'model':'CGB' if color else 'DMG','hardware_frames':hardware_frame,'clip_frames':[len(frames[s]) for s in range(4)],'different_images':[len(pictures[s]) for s in range(4)],'audio_peak':peak,'pause_resume_skip':'PASS'}
    results.append(result)
    print(json.dumps(result))
(out/'checks.json').write_text(json.dumps(results,indent=2))
