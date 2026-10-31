"""Verify actual visible tile bytes, not just an animation counter."""
import json
import sys
from pathlib import Path
from pyboy import PyBoy

root = Path(__file__).resolve().parents[1]
name = sys.argv[1] if len(sys.argv)>1 else 'clip-runtime'
report = json.loads((root / f'build/{name}.report.json').read_text())
expected = json.loads((root / f'build/tests/{name}/expected.json').read_text())
stage_address = next(v['address'] for v in report['variables'] if v['name'] == 'stage')
base = report['assets'][0]['clip']['residentBase']
span = report['assets'][0]['clip']['patternsPerBuffer']

for cgb in [False, True]:
    p = PyBoy(str(root / f'binary/{name}.gb'), symbols=str(root / f'build/{name}.sym'), window='null', cgb=cgb)
    p.set_emulation_speed(0)
    unsafe = []
    def check(_):
        if p.memory[0xff41] & 3 == 3:
            unsafe.append('mode3')
    p.hook_register(None, 'DrawBackground.writePattern', check, None)
    seen = set()
    try:
        for frame in range(300):
            p.tick(1, True)
            stage = p.memory[stage_address]
            if stage not in [1, 2, 3] or stage in seen:
                continue
            seen.add(stage)
            x,y={1:(1,2),2:(4,3),3:(7,4)}[stage]
            image=expected.get('stage_images',[0,1,0])[stage-1]
            screen_map = 0x9c00 if p.memory[0xff40] & 8 else 0x9800
            tile = p.memory[screen_map + y * 32 + x]
            columns,rows=expected.get('size',[1,1])
            for row in range(rows):
                for column in range(columns):
                    tile=p.memory[screen_map+(y+row)*32+x+column]
                    shared=report['assets'][0]['clip']
                    assert base<=tile<base+span*2 or shared.get('sharedBase',0)<=tile<shared.get('sharedBase',0)+shared.get('sharedSlots',0)
                    wanted=expected['frames'][image][row*columns+column] if 'frames' in expected else expected['patterns'][image]
                    assert list(p.memory[0x8000+tile*16:0x8010+tile*16])==wanted
                    if cgb and 'stage_palettes' in expected:
                        assert p.memory[1,screen_map+(y+row)*32+x+column]==expected['stage_palettes'][stage-1],'palette-only change was skipped'
            assert list(p.memory[screen_map:screen_map + 4]) == expected['text'], 'Text was cleared or corrupted'
            if stage >= 2:
                assert p.memory[screen_map + 2 * 32 + 1] == 0, 'Moved clip left old dynamic cells'
            if stage == 3:
                assert p.memory[screen_map + 3 * 32 + 4] == 0
                assert p.memory[screen_map + 1 * 32 + 2] == 0, 'Automatic commit left stale cells'
        assert seen == {1, 2, 3}, seen
        if expected.get('buffered_input'):
            variables={v['name']:v['address'] for v in report['variables']}
            def value(name):
                a=variables[name];return p.memory[a]|p.memory[a+1]<<8
            p.memory[stage_address]=6
            for _ in range(30):
                p.tick(1,True)
                if value('stage')==7:break
            assert value('stage')==7
            p.button_press('down');p.button_press('b');p.tick(2,True)
            p.button_release('down');p.button_release('b');p.tick(24,True)
            assert value('chord_events')==1,'short released chord lost during wait'
            assert value('down_held')==0,'released chord remained held'
            p.button_press('a');p.tick(30,True)
            assert value('a_events')==1,'held button repeated its edge'
            p.button_release('a');p.tick(6,True);p.button_press('a');p.tick(2,True);p.button_release('a');p.tick(12,True)
            assert value('a_events')==2,'second short press lost'
        assert not unsafe
        print(json.dumps({'target': 'CGB' if cgb else 'DMG', 'exact_visible_frames': 3,
            'text_preserved': True, 'moves_and_automatic_commit': True, 'unsafe_writes': 0}), flush=True)
    finally:
        p.stop(save=False)
