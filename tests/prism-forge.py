"""Run the full abstract show on both models and collect visual evidence."""
import hashlib
import json
import struct
import zlib
from pathlib import Path
import numpy as np
from pyboy import PyBoy

root = Path(__file__).resolve().parents[1]
report = json.loads((root / 'build/prism-forge.report.json').read_text())
variables = {v['name']: v['address'] for v in report['variables'] if v['scope'] == '$module'}
output = root / 'build/prism-forge-preview'
output.mkdir(exist_ok=True)

def png(pixels, file):
    h, w = pixels.shape[:2]
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    rows = b''.join(b'\0' + pixels[y, :, :3].tobytes() for y in range(h))
    file.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))

for cgb in [True, False]:
    emulator = PyBoy(str(root / 'binary/prism-forge.gb'), window='null', cgb=cgb, sound_emulated=True)
    emulator.set_emulation_speed(0)
    def word(name):
        address = variables[name]
        return emulator.memory[address] | emulator.memory[address + 1] << 8
    states = [set() for _ in range(5)]
    pictures = [[] for _ in range(5)]
    audible = [False] * 5
    peak = 0
    try:
        for frame in range(6500):
            emulator.tick(1, True)
            if word('cycles') >= 1:
                break
            scene, tick = word('scene'), word('tick')
            if scene >= 5 or tick < 64 or not word('prepared'):
                continue
            assert emulator.memory[0xff40] & 128, 'LCD disabled during an act'
            if cgb:
                assert emulator.memory[0xff4d] & 128, 'CGB double speed not enabled'
            # Count OAM candidates conservatively, including transparent sprites.
            scan = [0] * 144
            for slot in range(40):
                y, x = emulator.memory[0xfe00 + slot * 4] - 16, emulator.memory[0xfe01 + slot * 4] - 8
                if -7 <= x < 160:
                    for row in range(max(0, y), min(144, y + 8)):
                        scan[row] += 1
            peak = max(peak, max(scan))
            assert max(scan) <= 10, f'Sprite overflow: {max(scan)}'
            if frame % 4 == 0:
                states[scene].add(hashlib.sha256(emulator.screen.ndarray.tobytes()).hexdigest())
            audible[scene] |= bool(emulator.sound.ndarray.any())
            if len(pictures[scene]) < 3 and tick >= 130 + len(pictures[scene]) * 170:
                pictures[scene].append(emulator.screen.ndarray[:, :, :3].copy())
        else:
            raise AssertionError('Show failed to complete a full loop')
        assert all(len(s) >= 10 for s in states), list(map(len, states))
        assert all(audible), audible
        assert all(len(p) == 3 for p in pictures)
        # Exercise the documented controls after the uninterrupted full loop.
        emulator.tick(100, True)
        emulator.button_press('start')
        emulator.tick(40, True)
        emulator.button_release('start')
        emulator.tick(20, True)
        assert word('paused') == 1, 'Start did not pause'
        paused_tick = word('tick')
        emulator.tick(60, True)
        assert word('tick') == paused_tick, 'Scene advanced while paused'
        emulator.button_press('start')
        emulator.tick(40, True)
        emulator.button_release('start')
        emulator.tick(20, True)
        assert word('paused') == 0, 'Start did not resume'
        old_scene = word('scene')
        emulator.button_press('a')
        emulator.tick(60, True)
        emulator.button_release('a')
        assert word('scene') == (old_scene + 1) % 5, 'A did not advance the act'
        sheet = np.concatenate([np.concatenate(p, axis=1) for p in pictures], axis=0)
        png(np.repeat(np.repeat(sheet, 2, axis=0), 2, axis=1), output / f'{"cgb" if cgb else "dmg"}.png')
        print(json.dumps({'target': 'CGB' if cgb else 'DMG', 'hardware_frames': frame,
            'distinct_samples_per_act': list(map(len, states)), 'audible_each_act': audible,
            'max_sprites_per_scanline': peak, 'updates': word('updates'),
            'pause_resume_and_skip': True}), flush=True)
    finally:
        emulator.stop(save=False)
