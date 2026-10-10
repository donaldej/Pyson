"""Validate a full, unmodified Lucid Circuit loop on emulated Color hardware."""
import json
import hashlib
import sys
from pathlib import Path
from pyboy import PyBoy

config = json.loads(Path(sys.argv[1]).read_text())
addresses = {v['name']: v['address'] for v in config['variables'] if v['scope'] == '$module'}
symbols = {}
for line in Path(config['symbols']).read_text().splitlines():
    if line and not line.startswith(';'):
        address, name = line.split()
        symbols[name] = int(address.split(':')[1], 16)
rom = Path(config['rom']).read_bytes()
assert rom[0x143] == 0xc0 and rom[0x147] == 0x19
emulator = PyBoy(config['rom'], window='null', cgb=True, sound_emulated=True)
emulator.set_emulation_speed(0)
def word(name):
    at = addresses[name]
    return emulator.memory[at] | emulator.memory[at + 1] << 8
motion = [set() for _ in range(4)]
camera = [set() for _ in range(4)]
colors = [set() for _ in range(4)]
audible = set()
seen = set()
maximum = 0
try:
    for frame in range(14000):
        emulator.tick(1, True)
        scene, tick = word('scene'), word('tick')
        if word('cycles'):
            break
        if scene < 4 and 16 < tick < 1000:
            seen.add(scene)
            assert emulator.memory[0xff4d] & 0x80, 'Double speed was lost'
            assert emulator.memory[0xff40] & 0x80, 'Streaming blanked the display'
            oam = bytes(emulator.memory[symbols['wShadowOAM']:symbols['wShadowOAM'] + 160])
            motion[scene].add(oam)
            camera[scene].add((emulator.memory[0xff42], emulator.memory[0xff43]))
            colors[scene].add(hashlib.sha256(emulator.screen.ndarray[:, :, :3].tobytes()).digest())
            for y in range(144):
                count = sum(0 < oam[i] < 160 and 0 < oam[i+1] < 168 and oam[i]-16 <= y < oam[i]-8 for i in range(0, 160, 4))
                maximum = max(maximum, count)
                assert count <= 10, f'Scene {scene} exceeded the scanline sprite limit'
            if emulator.sound.ndarray.any():
                audible.add(scene)
    else:
        raise AssertionError('The demo did not complete its loop')
    assert seen == audible == {0, 1, 2, 3}
    assert all(len(states) > 100 for states in motion)
    assert all(len(states) > 50 for states in camera)
    assert all(len(states) > 100 for states in colors)
    print(json.dumps({'scenes': sorted(seen), 'frames': frame, 'max_sprites_per_scanline': maximum,
                      'motion_states': list(map(len, motion)), 'camera_states': list(map(len, camera))}))
finally:
    emulator.stop(save=False)
