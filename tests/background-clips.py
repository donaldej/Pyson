"""Verify actual visible tile bytes, not just an animation counter."""
import json
from pathlib import Path
from pyboy import PyBoy

root = Path(__file__).resolve().parents[1]
report = json.loads((root / 'build/clip-runtime.report.json').read_text())
expected = json.loads((root / 'build/tests/clip-runtime/expected.json').read_text())
stage_address = next(v['address'] for v in report['variables'] if v['name'] == 'stage')
base = report['assets'][0]['clip']['residentBase']
span = report['assets'][0]['clip']['patternsPerBuffer']

for cgb in [False, True]:
    p = PyBoy(str(root / 'binary/clip-runtime.gb'), symbols=str(root / 'build/clip-runtime.sym'), window='null', cgb=cgb)
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
            x, y, image = {1: (1, 2, 0), 2: (4, 3, 1), 3: (7, 4, 0)}[stage]
            screen_map = 0x9c00 if p.memory[0xff40] & 8 else 0x9800
            tile = p.memory[screen_map + y * 32 + x]
            assert base <= tile < base + span * 2
            assert list(p.memory[0x8000 + tile * 16:0x8000 + tile * 16 + 16]) == expected['patterns'][image]
            assert list(p.memory[screen_map:screen_map + 4]) == expected['text'], 'Text was cleared or corrupted'
            if stage >= 2:
                assert p.memory[screen_map + 2 * 32 + 1] == 0, 'Moved clip left old dynamic cells'
            if stage == 3:
                assert p.memory[screen_map + 3 * 32 + 4] == 0
                assert p.memory[screen_map + 1 * 32 + 2] == 0, 'Automatic commit left stale cells'
        assert seen == {1, 2, 3}, seen
        assert not unsafe
        print(json.dumps({'target': 'CGB' if cgb else 'DMG', 'exact_visible_frames': 3,
            'text_preserved': True, 'moves_and_automatic_commit': True, 'unsafe_writes': 0}), flush=True)
    finally:
        p.stop(save=False)
