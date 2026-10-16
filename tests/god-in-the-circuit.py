"""Full presentation and renderer safety checks on both Game Boy models."""
import hashlib
import json
import struct
import zlib
from pathlib import Path
import numpy as np
from pyboy import PyBoy

root = Path(__file__).resolve().parents[1]
report = json.loads((root / 'build/god-in-the-circuit.report.json').read_text())
variables = {v['name']: v['address'] for v in report['variables'] if v['scope'] == '$module'}
symbols = {}
for line in (root / 'build/god-in-the-circuit.sym').read_text().splitlines():
    if line and not line.startswith(';'):
        address, name = line.split()
        symbols[name] = int(address.split(':')[1], 16)
output = root / 'build/god-in-the-circuit-preview'
output.mkdir(exist_ok=True)

def png(pixels, file):
    h, w = pixels.shape[:2]
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    rows = b''.join(b'\0' + pixels[y, :, :3].tobytes() for y in range(h))
    file.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))

for cgb in [True, False]:
    emulator = PyBoy(str(root / 'binary/god-in-the-circuit.gb'), symbols=str(root / 'build/god-in-the-circuit.sym'),
        window='null', cgb=cgb, sound_emulated=True)
    emulator.set_emulation_speed(0)
    def word(name):
        address = variables[name]
        return emulator.memory[address] | emulator.memory[address + 1] << 8
    states = [set() for _ in range(7)]
    pictures = [[] for _ in range(7)]
    audible = [False] * 7
    unsafe = []
    uploads = [0]
    commits = []
    peak = 0
    base = next(asset['clip']['residentBase'] for asset in report['assets'] if asset.get('clip'))
    span = report['graphics']['backgroundClips']['patternsPerBuffer']
    def check_upload(_):
        uploads[0] += 1
        if emulator.memory[0xff41] & 3 == 3:
            unsafe.append('mode-3 VRAM write')
        # Pattern writes must never touch the displayed clip's buffer.
        dest = emulator.register_file.D * 256 + emulator.register_file.E
        front = emulator.memory[symbols['wClipFront']]
        tile = (dest - 0x8000) // 16
        if base + front * span <= tile < base + (front + 1) * span:
            unsafe.append('visible pattern overwritten')
    def check_commit(_):
        if emulator.memory[symbols['wClipPending']]:
            commits.append((word('scene'), word('tick')))
    emulator.hook_register(None, 'DrawBackground.writePattern', check_upload, None)
    emulator.hook_register(None, 'CommitGraphicsFrame', check_commit, None)
    try:
        for frame in range(9500):
            emulator.tick(1, True)
            if word('cycles') >= 1:
                break
            scene, tick = word('scene'), word('tick')
            if scene >= 7 or tick < 64:
                continue
            assert emulator.memory[0xff40] & 128, 'LCD disabled during the presentation'
            if cgb:
                assert emulator.memory[0xff4d] & 128, 'CGB double speed not enabled'
            else:
                assert int(emulator.screen.ndarray[:8, :, :3].max()) < 16, 'DMG top border lost its black artwork'
                assert int(emulator.screen.ndarray[-8:, :, :3].max()) < 16, 'DMG bottom border lost its black artwork'
            scan = [0] * 144
            for slot in range(40):
                y, x = emulator.memory[0xfe00 + slot * 4] - 16, emulator.memory[0xfe01 + slot * 4] - 8
                if -7 <= x < 160:
                    for row in range(max(0, y), min(144, y + 8)):
                        scan[row] += 1
            peak = max(peak, max(scan))
            assert max(scan) <= 10, f'Sprite scanline overflow: {max(scan)}'
            if frame % 5 == 0:
                states[scene].add(hashlib.sha256(emulator.screen.ndarray.tobytes()).hexdigest())
            audible[scene] |= bool(emulator.sound.ndarray.any())
            if len(pictures[scene]) < 3 and tick >= 180 + len(pictures[scene]) * 320:
                pictures[scene].append(emulator.screen.ndarray[:, :, :3].copy())
        else:
            raise AssertionError('Presentation did not complete a loop')
        assert not unsafe, unsafe[:10]
        assert uploads[0] > 50000
        assert all(len(s) >= 12 for s in states), list(map(len, states))
        assert all(audible), audible
        assert all(len(p) == 3 for p in pictures)
        assert set(scene for scene, _ in commits) == set(range(7))
        # Pause and skip exercise the same user-visible controls on both models.
        emulator.tick(100, True)
        emulator.button_press('start')
        emulator.tick(50, True)
        emulator.button_release('start')
        emulator.tick(20, True)
        assert word('paused') == 1
        paused_tick = word('tick')
        emulator.tick(60, True)
        assert word('tick') == paused_tick
        emulator.button_press('start')
        emulator.tick(50, True)
        emulator.button_release('start')
        emulator.tick(20, True)
        assert word('paused') == 0
        old_scene = word('scene')
        emulator.button_press('a')
        emulator.tick(80, True)
        emulator.button_release('a')
        assert word('scene') == (old_scene + 1) % 7
        sheet = np.concatenate([np.concatenate(p, axis=1) for p in pictures], axis=0)
        png(np.repeat(np.repeat(sheet, 2, axis=0), 2, axis=1), output / f'{"cgb" if cgb else "dmg"}.png')
        print(json.dumps({'target': 'CGB' if cgb else 'DMG', 'hardware_frames': frame,
            'distinct_samples_per_movement': list(map(len, states)), 'audible_each_movement': audible,
            'pattern_writes_checked': uploads[0], 'unsafe_writes': len(unsafe),
            'clip_commits': len(commits), 'max_sprites_per_scanline': peak,
            'pause_resume_skip': True}), flush=True)
    finally:
        emulator.stop(save=False)
