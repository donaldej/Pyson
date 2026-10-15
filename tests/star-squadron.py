"""Verify a full automatic battle loop and every sprite family on both models."""
import json
import struct
import zlib
from pathlib import Path
import numpy as np
from pyboy import PyBoy

root = Path(__file__).resolve().parents[1]
report = json.loads((root / 'build/star-squadron.report.json').read_text())
variables = {v['name']: v['address'] for v in report['variables'] if v['scope'] == '$module'}
output = root / 'build/star-squadron-preview'
output.mkdir(exist_ok=True)

def png(pixels, file):
    height, width = pixels.shape[:2]
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    rows = b''.join(b'\0' + pixels[y, :, :3].tobytes() for y in range(height))
    file.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))

for cgb in [True, False]:
    emulator = PyBoy(str(root / 'binary/star-squadron.gb'), symbols=str(root / 'build/star-squadron.sym'), window='null', cgb=cgb, sound_emulated=True)
    emulator.set_emulation_speed(0)
    def word(name):
        address = variables[name]
        return emulator.memory[address] | emulator.memory[address+1] << 8
    states = [set() for _ in range(40)]
    peak = 0
    checked = 0
    audible = False
    pictures = []
    violations = []
    def check_write(_):
        if emulator.memory[0xff41] & 3 == 3:
            violations.append('inaccessible streamed VRAM write')
    emulator.hook_register(None, 'StreamWriteAccessible.write', check_write, None)
    try:
        for frame in range(3000):
            emulator.tick(1, True)
            if word('cycles') >= 2:
                break
            if word('tick') < 48:
                continue
            checked += 1
            assert emulator.memory[0xff40] & 128, 'LCD blanked during battle'
            assert emulator.memory[0xff40] & 32, 'Fixed HUD window disappeared'
            if cgb:
                assert emulator.memory[0xff4d] & 128, 'Color double speed was lost'
            oam = bytes(emulator.memory[0xfe00:0xfea0])
            scan = [0] * 144
            for slot in range(40):
                y, x = oam[slot*4] - 16, oam[slot*4+1] - 8
                assert 0 <= x <= 152 and 0 <= y <= 120, f'Component {slot} left the visible battle area: {x}, {y}'
                states[slot].add(oam[slot*4:slot*4+4])
                for row in range(y, y+8):
                    scan[row] += 1
            peak = max(peak, max(scan))
            assert max(scan) <= 10, f'Sprite scanline limit exceeded: {max(scan)}'
            audible |= bool(emulator.sound.ndarray.any())
            if len(pictures) < 4 and word('tick') >= 160 + len(pictures)*200 and word('cycles') == 0:
                pictures.append(emulator.screen.ndarray[:, :, :3].copy())
        else:
            raise AssertionError('Battle did not complete two loops')
        assert checked > 1500 and audible
        assert all(len(s) > 15 for s in states), list(map(len, states))
        assert not violations, violations[:5]
        assert len(pictures) == 4
        sheet = np.concatenate([np.concatenate(pictures[:2], axis=1), np.concatenate(pictures[2:], axis=1)], axis=0)
        png(np.repeat(np.repeat(sheet, 3, axis=0), 3, axis=1), output / f'{"cgb" if cgb else "dmg"}.png')
        print(json.dumps({'hardware': 'CGB' if cgb else 'DMG', 'active_components': 40,
                          'frames_checked': checked, 'max_components_per_scanline': peak,
                          'updates': word('updates'), 'audible': audible}), flush=True)
    finally:
        emulator.stop(save=False)
